/**
 * APM Middleware — Mesure les temps de réponse de chaque requête HTTP
 * Stocke les métriques en mémoire (buffer) et les flush périodiquement vers Supabase
 */

const APM_BUFFER_MAX = 500;
const APM_FLUSH_INTERVAL = 60000; // 60s
const SLOW_THRESHOLD_MS = 2000;

// Buffer en mémoire
const apmBuffer = [];
// Métriques agrégées (pour le dashboard sans Supabase)
const apmAggregated = {
  byPath: {},      // path -> { count, totalMs, maxMs, errors, last10: [] }
  hourly: [],      // [{ hour, count, avgMs, p95Ms, errors }]
  _lastHourKey: null,
};

// Ignorer certains paths pour réduire le bruit
const IGNORE_PATHS = ['/favicon.ico', '/manifest.json', '/robots.txt', '/static/'];

function apmMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  const originalEnd = res.end;

  res.end = function (...args) {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = Math.round(durationNs / 1e6 * 10) / 10;
    const path = req.route ? req.baseUrl + req.route.path : req.path;

    // Ignorer les assets statiques
    if (IGNORE_PATHS.some(p => path.startsWith(p))) {
      return originalEnd.apply(res, args);
    }

    const entry = {
      method: req.method,
      path: path.replace(/\/[a-f0-9-]{20,}/g, '/:id'), // normaliser les UUIDs
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.id || null,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
      ts: Date.now(),
    };

    // Buffer pour flush Supabase
    apmBuffer.push(entry);
    if (apmBuffer.length > APM_BUFFER_MAX) apmBuffer.splice(0, apmBuffer.length - APM_BUFFER_MAX);

    // Agrégation en mémoire
    _aggregate(entry);

    // Log les requêtes lentes
    if (durationMs > SLOW_THRESHOLD_MS) {
      console.warn(`[APM] ⚠️ SLOW ${entry.method} ${entry.path} → ${durationMs}ms (${res.statusCode})`);
    }

    return originalEnd.apply(res, args);
  };

  next();
}

function _aggregate(entry) {
  // Par path
  if (!apmAggregated.byPath[entry.path]) {
    apmAggregated.byPath[entry.path] = { count: 0, totalMs: 0, maxMs: 0, errors: 0, last10: [] };
  }
  const p = apmAggregated.byPath[entry.path];
  p.count++;
  p.totalMs += entry.durationMs;
  if (entry.durationMs > p.maxMs) p.maxMs = entry.durationMs;
  if (entry.statusCode >= 400) p.errors++;
  p.last10.push({ ms: entry.durationMs, status: entry.statusCode, ts: entry.ts });
  if (p.last10.length > 10) p.last10.shift();

  // Par heure
  const hourKey = new Date(entry.ts).toISOString().slice(0, 13); // "2026-04-25T22"
  if (hourKey !== apmAggregated._lastHourKey) {
    apmAggregated._lastHourKey = hourKey;
    apmAggregated.hourly.push({ hour: hourKey, count: 0, totalMs: 0, errors: 0, durations: [] });
    if (apmAggregated.hourly.length > 168) apmAggregated.hourly.shift(); // 7 jours
  }
  const h = apmAggregated.hourly[apmAggregated.hourly.length - 1];
  h.count++;
  h.totalMs += entry.durationMs;
  if (entry.statusCode >= 400) h.errors++;
  h.durations.push(entry.durationMs);
  if (h.durations.length > 1000) h.durations.splice(0, h.durations.length - 1000);
}

/**
 * Flush le buffer APM vers Supabase
 */
async function flushToSupabase(supabase) {
  if (!supabase || apmBuffer.length === 0) return;
  const batch = apmBuffer.splice(0, Math.min(apmBuffer.length, 200));
  try {
    const rows = batch.map(e => ({
      method: e.method,
      path: e.path,
      status_code: e.statusCode,
      duration_ms: e.durationMs,
      user_id: e.userId,
      ip_address: e.ip,
      created_at: new Date(e.ts).toISOString(),
    }));
    const { error } = await supabase.from('monitoring_apm').insert(rows);
    if (error) console.warn('[APM] Supabase flush error:', error.message);
  } catch (e) {
    console.warn('[APM] Flush failed:', e.message);
    // Re-add failed entries
    apmBuffer.unshift(...batch);
    if (apmBuffer.length > APM_BUFFER_MAX) apmBuffer.splice(APM_BUFFER_MAX);
  }
}

/**
 * Retourne les métriques APM agrégées (pour l'API monitoring)
 */
function getApmMetrics() {
  const paths = Object.entries(apmAggregated.byPath).map(([path, data]) => ({
    path,
    count: data.count,
    avgMs: Math.round(data.totalMs / data.count * 10) / 10,
    maxMs: data.maxMs,
    errors: data.errors,
    errorRate: data.count > 0 ? Math.round(data.errors / data.count * 1000) / 10 : 0,
    last10: data.last10,
  })).sort((a, b) => b.count - a.count);

  const hourly = apmAggregated.hourly.map(h => {
    const sorted = [...h.durations].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    return {
      hour: h.hour,
      count: h.count,
      avgMs: h.count > 0 ? Math.round(h.totalMs / h.count * 10) / 10 : 0,
      p50Ms: Math.round(p50 * 10) / 10,
      p95Ms: Math.round(p95 * 10) / 10,
      p99Ms: Math.round(p99 * 10) / 10,
      errors: h.errors,
      errorRate: h.count > 0 ? Math.round(h.errors / h.count * 1000) / 10 : 0,
    };
  });

  // Totaux globaux
  let totalReqs = 0, totalMs = 0, totalErrors = 0, globalMax = 0;
  for (const p of paths) {
    totalReqs += p.count;
    totalMs += p.count * p.avgMs;
    totalErrors += p.errors;
    if (p.maxMs > globalMax) globalMax = p.maxMs;
  }

  return {
    summary: {
      totalRequests: totalReqs,
      avgMs: totalReqs > 0 ? Math.round(totalMs / totalReqs * 10) / 10 : 0,
      maxMs: Math.round(globalMax * 10) / 10,
      totalErrors,
      errorRate: totalReqs > 0 ? Math.round(totalErrors / totalReqs * 1000) / 10 : 0,
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    paths: paths.slice(0, 30),
    hourly,
  };
}

// Timer flush Supabase
let _flushTimer = null;
function startApmFlush(supabase) {
  if (_flushTimer) clearInterval(_flushTimer);
  _flushTimer = setInterval(() => flushToSupabase(supabase), APM_FLUSH_INTERVAL);
}

module.exports = { apmMiddleware, getApmMetrics, flushToSupabase, startApmFlush };
