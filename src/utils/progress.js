import { getBackendUrl } from './subscription';

// Simple progress reporting helper
// - startSession(cfg): creates a session row and stores sessionId in memory
// - recordAttempt(attempt): buffers attempts and flushes periodically
// - flushAttempts(): inserts all buffered attempts
// Uses backend API (/api/progress/*) instead of direct Supabase (bypasses RLS)

let sessionId = null;
let userId = null;
let buffer = [];
const FLUSH_EVERY = 10; // flush after N attempts

// Log queue — sent via HTTP to /api/progress/log (visible in Render logs, no socket needed)
let _logQueue = [];
let _logTimer = null;
function _flushLogs() {
  if (!_logQueue.length) return;
  const batch = _logQueue.splice(0);
  try {
    const url = getBackendUrl();
    fetch(`${url}/api/progress/log`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    }).catch(() => {});
  } catch {}
}
function _log(tag, data) {
  _logQueue.push({ tag, data, ts: new Date().toISOString() });
  if (!_logTimer) _logTimer = setTimeout(() => { _logTimer = null; _flushLogs(); }, 500);
}

// Monitoring callback (set by Carte.js via setMonitorCallback)
let monitorCb = null;
export function setMonitorCallback(cb) { monitorCb = cb; _log('init', { msg: 'monitorCallback set' }); }
function emitLog(event, data) {
  _log(event, data);
  try { if (monitorCb) monitorCb(event, data); } catch {}
}

function getAuth() {
  try {
    const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
    return a || null;
  } catch { return null; }
}

export async function startSession(cfg = {}) {
  _log('startSession:called', cfg);
  buffer = [];
  sessionId = null;
  userId = null;

  const auth = getAuth();
  _log('startSession:auth', auth ? { id: auth.id, email: auth.email } : null);
  // Guests are skipped silently
  if (!auth || String(auth.id || '').startsWith('guest:')) { emitLog('progress:skip', { reason: 'no auth or guest' }); return null; }
  userId = auth.id || null;
  // Fallback: si cc_auth n'a pas d'id, utiliser cc_student_id (le backend résoudra en UUID)
  if (!userId) {
    try { userId = localStorage.getItem('cc_student_id') || null; } catch {}
    if (userId) emitLog('progress:userId-fallback', { userId, source: 'cc_student_id' });
  }
  if (!userId) { emitLog('progress:skip', { reason: 'no userId found' }); return null; }
  _log('startSession:userId', { userId });

  try {
    const backendUrl = getBackendUrl();
    _log('startSession:POST', { url: `${backendUrl}/api/progress/session` });
    const payload = {
      user_id: userId,
      mode: cfg?.mode || 'solo',
      classes: Array.isArray(cfg?.classes) ? cfg.classes : [],
      themes: Array.isArray(cfg?.themes) ? cfg.themes : [],
      duration_seconds: Number(cfg?.duration_seconds) || null,
    };
    const resp = await fetch(`${backendUrl}/api/progress/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    _log('startSession:response', { status: resp.status, ok: result.ok, sessionId: result.sessionId });
    if (!resp.ok || !result.ok) throw new Error(result.error || `HTTP ${resp.status}`);
    sessionId = result.sessionId || null;
    emitLog('progress:session-started', { sessionId, userId });
    return sessionId;
  } catch (e) {
    _log('startSession:ERROR', { error: e?.message || String(e) });
    emitLog('progress:session-failed', { error: e?.message || String(e) });
    return null;
  }
}

let _lazyInitInProgress = false;
export async function recordAttempt(a) {
  // a = { item_type, item_id, objective_key, correct, latency_ms, level_class, theme, round_index }
  // Lazy init: if startSession was never called, create session now
  if (!sessionId && !_lazyInitInProgress) {
    _lazyInitInProgress = true;
    _log('recordAttempt:lazyInit', { theme: a?.theme });
    try {
      const cfg = (() => { try { return JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch { return null; } })();
      await startSession({
        mode: 'solo',
        classes: Array.isArray(cfg?.classes) ? cfg.classes : [],
        themes: Array.isArray(cfg?.themes) ? cfg.themes : [],
      });
    } catch {}
    _lazyInitInProgress = false;
  }
  if (!sessionId || !userId) {
    if (!sessionId && a?.correct !== undefined) {
      _log('recordAttempt:SKIPPED', { reason: 'no sessionId after lazyInit', theme: a?.theme, correct: a?.correct });
      emitLog('progress:attempt-skipped', { reason: 'no sessionId', correct: a?.correct, theme: a?.theme });
    }
    return;
  }
  const row = {
    session_id: sessionId,
    user_id: userId,
    item_type: a?.item_type || null,
    item_id: a?.item_id || null,
    objective_key: a?.objective_key || null,
    correct: typeof a?.correct === 'boolean' ? a.correct : null,
    latency_ms: Number(a?.latency_ms) || null,
    level_class: a?.level_class || null,
    theme: a?.theme || null,
    round_index: Number(a?.round_index),
  };
  buffer.push(row);
  _log('recordAttempt:buffered', { count: buffer.length, theme: a?.theme, correct: a?.correct });
  if (buffer.length >= FLUSH_EVERY) await flushAttempts();
}

export async function flushAttempts() {
  _log('flush:called', { hasSession: !!sessionId, hasUser: !!userId, bufferLen: buffer.length });
  if (!sessionId || !userId) { buffer = []; return; }
  if (!buffer.length) return;
  const toSend = buffer.slice();
  buffer = [];
  try {
    const backendUrl = getBackendUrl();
    const resp = await fetch(`${backendUrl}/api/progress/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attempts: toSend }),
    });
    const result = await resp.json();
    _log('flush:response', { status: resp.status, ok: result.ok, count: result.count });
    if (!resp.ok || !result.ok) throw new Error(result.error || `HTTP ${resp.status}`);
    emitLog('progress:flushed', { count: toSend.length });
  } catch (e) {
    // on failure, try to requeue (best-effort)
    buffer = [...toSend, ...buffer];
    _log('flush:ERROR', { error: e?.message || String(e), buffered: buffer.length });
    emitLog('progress:flush-failed', { error: e?.message || String(e), buffered: buffer.length });
  }
}
