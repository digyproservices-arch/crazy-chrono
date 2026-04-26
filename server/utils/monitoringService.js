/**
 * Monitoring Service — Centralise la persistance Supabase et les snapshots joueurs
 * 
 * - Persiste les événements monitoring dans Supabase (monitoring_events)
 * - Prend des snapshots réguliers des joueurs connectés (monitoring_player_snapshots)
 * - Expose des fonctions pour les séries temporelles (erreurs/h, joueurs/h, APM/h)
 */

const SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 min
const EVENT_BUFFER_MAX = 200;
const EVENT_FLUSH_INTERVAL = 30000; // 30s

// Buffer d'événements en mémoire
const eventBuffer = [];
let _supabase = null;
let _getOnlinePlayers = null; // callback pour récupérer les joueurs en ligne

/**
 * Initialise le service avec le client Supabase et la fonction de players
 */
function init(supabase, getOnlinePlayersFn) {
  _supabase = supabase;
  _getOnlinePlayers = getOnlinePlayersFn;

  // Flush événements toutes les 30s
  setInterval(() => flushEvents(), EVENT_FLUSH_INTERVAL);

  // Snapshot joueurs toutes les 5 min
  setInterval(() => takePlayerSnapshot(), SNAPSHOT_INTERVAL);

  console.log('[MonitoringService] Initialisé (flush 30s, snapshot 5min)');
}

/**
 * Enregistre un événement monitoring (bufferisé)
 */
function recordEvent(eventType, { severity = 'info', message = '', userId, email, deviceId, ip, userAgent, country, metadata = {} } = {}) {
  eventBuffer.push({
    event_type: eventType,
    severity,
    message: (message || '').substring(0, 2000),
    device_id: deviceId || null,
    user_id: userId || null,
    email: email || null,
    metadata: metadata || {},
    ip_address: ip || null,
    country: country || null,
    user_agent: (userAgent || '').substring(0, 500),
    created_at: new Date().toISOString(),
  });

  if (eventBuffer.length > EVENT_BUFFER_MAX) {
    eventBuffer.splice(0, eventBuffer.length - EVENT_BUFFER_MAX);
  }
}

/**
 * Flush les événements vers Supabase
 */
async function flushEvents() {
  if (!_supabase || eventBuffer.length === 0) return;
  const batch = eventBuffer.splice(0, Math.min(eventBuffer.length, 100));
  try {
    const { error } = await _supabase.from('monitoring_events').insert(batch);
    if (error) {
      console.warn('[MonitoringService] Flush error:', error.message);
      // Re-add on failure
      eventBuffer.unshift(...batch);
      if (eventBuffer.length > EVENT_BUFFER_MAX) eventBuffer.splice(EVENT_BUFFER_MAX);
    }
  } catch (e) {
    console.warn('[MonitoringService] Flush exception:', e.message);
    eventBuffer.unshift(...batch);
    if (eventBuffer.length > EVENT_BUFFER_MAX) eventBuffer.splice(EVENT_BUFFER_MAX);
  }
}

/**
 * Prend un snapshot du nombre de joueurs connectés
 */
async function takePlayerSnapshot() {
  if (!_supabase || !_getOnlinePlayers) return;
  try {
    const players = _getOnlinePlayers();
    const playingModes = ['solo', 'arena', 'training', 'multiplayer', 'grande-salle', 'objectif'];
    const modes = {};
    let playingCount = 0;
    for (const p of players) {
      const m = p.mode || 'unknown';
      modes[m] = (modes[m] || 0) + 1;
      if (playingModes.includes(m)) playingCount++;
    }

    await _supabase.from('monitoring_player_snapshots').insert({
      online_count: players.length,
      playing_count: playingCount,
      modes,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[MonitoringService] Snapshot error:', e.message);
  }
}

/**
 * Récupère les séries temporelles pour le dashboard
 */
async function getTimeSeries(hours = 168) { // 7 jours par défaut
  if (!_supabase) return { errors: [], players: [], apm: [] };

  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  // 1) Erreurs par heure
  let errorsHourly = [];
  try {
    const { data } = await _supabase
      .from('monitoring_events')
      .select('event_type, severity, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000);

    if (data) {
      const byHour = {};
      for (const row of data) {
        const hour = row.created_at.slice(0, 13);
        if (!byHour[hour]) byHour[hour] = { hour, errors: 0, warnings: 0, info: 0, total: 0 };
        byHour[hour].total++;
        if (row.severity === 'error' || row.severity === 'critical') byHour[hour].errors++;
        else if (row.severity === 'warning') byHour[hour].warnings++;
        else byHour[hour].info++;
      }
      errorsHourly = Object.values(byHour).sort((a, b) => a.hour.localeCompare(b.hour));
    }
  } catch (e) { console.warn('[MonitoringService] Errors query failed:', e.message); }

  // 2) Joueurs par snapshot
  let playersHistory = [];
  try {
    const { data } = await _supabase
      .from('monitoring_player_snapshots')
      .select('online_count, playing_count, modes, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(2000);

    if (data) {
      playersHistory = data.map(d => ({
        ts: d.created_at,
        online: d.online_count,
        playing: d.playing_count,
        modes: d.modes,
      }));
    }
  } catch (e) { console.warn('[MonitoringService] Players query failed:', e.message); }

  // 3) APM par heure
  let apmHourly = [];
  try {
    const { data } = await _supabase
      .from('monitoring_apm')
      .select('path, duration_ms, status_code, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000);

    if (data) {
      const byHour = {};
      for (const row of data) {
        const hour = row.created_at.slice(0, 13);
        if (!byHour[hour]) byHour[hour] = { hour, count: 0, totalMs: 0, durations: [], errors: 0 };
        byHour[hour].count++;
        byHour[hour].totalMs += row.duration_ms;
        byHour[hour].durations.push(row.duration_ms);
        if (row.status_code >= 400) byHour[hour].errors++;
      }
      apmHourly = Object.values(byHour).map(h => {
        const sorted = h.durations.sort((a, b) => a - b);
        return {
          hour: h.hour,
          count: h.count,
          avgMs: Math.round(h.totalMs / h.count * 10) / 10,
          p50Ms: sorted[Math.floor(sorted.length * 0.5)] || 0,
          p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
          errors: h.errors,
        };
      }).sort((a, b) => a.hour.localeCompare(b.hour));
    }
  } catch (e) { console.warn('[MonitoringService] APM query failed:', e.message); }

  return { errors: errorsHourly, players: playersHistory, apm: apmHourly };
}

/**
 * Récupère les erreurs groupées par fingerprint
 */
async function getErrorGroups(hours = 24) {
  if (!_supabase) return [];

  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  try {
    const { data } = await _supabase
      .from('monitoring_events')
      .select('event_type, severity, message, device_id, user_id, metadata, created_at')
      .in('severity', ['error', 'critical', 'warning'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!data) return [];

    // Grouper par fingerprint (event_type + premier mot du message)
    const groups = {};
    for (const row of data) {
      const msgKey = (row.message || '').split(/[\n:]/)[0].substring(0, 80).trim();
      const fingerprint = `${row.event_type}::${msgKey}`;
      if (!groups[fingerprint]) {
        groups[fingerprint] = {
          fingerprint,
          eventType: row.event_type,
          severity: row.severity,
          message: msgKey,
          count: 0,
          firstSeen: row.created_at,
          lastSeen: row.created_at,
          devices: new Set(),
          users: new Set(),
          samples: [],
        };
      }
      const g = groups[fingerprint];
      g.count++;
      if (row.created_at < g.firstSeen) g.firstSeen = row.created_at;
      if (row.created_at > g.lastSeen) g.lastSeen = row.created_at;
      if (row.device_id) g.devices.add(row.device_id);
      if (row.user_id) g.users.add(row.user_id);
      if (g.samples.length < 3) g.samples.push(row);
    }

    return Object.values(groups)
      .map(g => ({
        ...g,
        devices: g.devices.size,
        users: g.users.size,
      }))
      .sort((a, b) => b.count - a.count);
  } catch (e) {
    console.warn('[MonitoringService] Error groups query failed:', e.message);
    return [];
  }
}

module.exports = {
  init,
  recordEvent,
  flushEvents,
  takePlayerSnapshot,
  getTimeSeries,
  getErrorGroups,
};
