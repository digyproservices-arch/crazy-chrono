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

const _log = (tag, ...args) => { try { console.log(`[Progress][${tag}]`, ...args); } catch {} };

// Monitoring callback (set by Carte.js via setMonitorCallback)
let monitorCb = null;
export function setMonitorCallback(cb) { monitorCb = cb; _log('init', 'monitorCallback set'); }
function emitLog(event, data) {
  _log(event, data);
  try { if (monitorCb) monitorCb(event, data); } catch {}
}

// Expose debug state on window for browser console inspection
function _syncDebug() {
  try { window.__pgDebug = { sessionId, userId, bufferLen: buffer.length, monitorCb: !!monitorCb }; } catch {}
}

function getAuth() {
  try {
    const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
    return a || null;
  } catch { return null; }
}

export async function startSession(cfg = {}) {
  _log('startSession', 'called', cfg);
  buffer = [];
  sessionId = null;
  userId = null;

  const auth = getAuth();
  _log('startSession', 'auth=', auth ? { id: auth.id, email: auth.email } : null);
  // Guests are skipped silently
  if (!auth || String(auth.id || '').startsWith('guest:')) { emitLog('progress:skip', { reason: 'no auth or guest' }); _syncDebug(); return null; }
  userId = auth.id || null;
  // Fallback: si cc_auth n'a pas d'id, utiliser cc_student_id (le backend résoudra en UUID)
  if (!userId) {
    try { userId = localStorage.getItem('cc_student_id') || null; } catch {}
    if (userId) emitLog('progress:userId-fallback', { userId, source: 'cc_student_id' });
  }
  if (!userId) { emitLog('progress:skip', { reason: 'no userId found' }); _syncDebug(); return null; }
  _log('startSession', 'userId=', userId);

  try {
    const backendUrl = getBackendUrl();
    _log('startSession', 'POST', `${backendUrl}/api/progress/session`);
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
    _log('startSession', 'response', resp.status, result);
    if (!resp.ok || !result.ok) throw new Error(result.error || `HTTP ${resp.status}`);
    sessionId = result.sessionId || null;
    emitLog('progress:session-started', { sessionId, userId });
    _syncDebug();
    return sessionId;
  } catch (e) {
    _log('startSession', 'ERROR', e?.message || String(e));
    emitLog('progress:session-failed', { error: e?.message || String(e) });
    _syncDebug();
    return null;
  }
}

export async function recordAttempt(a) {
  // a = { item_type, item_id, objective_key, correct, latency_ms, level_class, theme, round_index }
  if (!sessionId || !userId) {
    if (!sessionId && a?.correct !== undefined) {
      _log('recordAttempt', 'SKIPPED (no sessionId)', a?.theme, a?.correct);
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
  _log('recordAttempt', 'buffered', buffer.length, 'theme=', a?.theme, 'correct=', a?.correct);
  if (buffer.length >= FLUSH_EVERY) await flushAttempts();
  _syncDebug();
}

export async function flushAttempts() {
  _log('flush', 'called', { sessionId: !!sessionId, userId: !!userId, bufferLen: buffer.length });
  if (!sessionId || !userId) { buffer = []; _syncDebug(); return; }
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
    _log('flush', 'response', resp.status, result);
    if (!resp.ok || !result.ok) throw new Error(result.error || `HTTP ${resp.status}`);
    emitLog('progress:flushed', { count: toSend.length });
  } catch (e) {
    // on failure, try to requeue (best-effort)
    buffer = [...toSend, ...buffer];
    _log('flush', 'ERROR', e?.message || String(e));
    emitLog('progress:flush-failed', { error: e?.message || String(e), buffered: buffer.length });
  }
  _syncDebug();
}
