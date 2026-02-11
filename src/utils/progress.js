import supabase from './supabaseClient';

// Simple progress reporting helper
// - startSession(cfg): creates a session row and stores sessionId in memory
// - recordAttempt(attempt): buffers attempts and flushes periodically
// - flushAttempts(): inserts all buffered attempts

let sessionId = null;
let userId = null;
let buffer = [];
const FLUSH_EVERY = 10; // flush after N attempts

// Monitoring callback (set by Carte.js via setMonitorCallback)
let monitorCb = null;
export function setMonitorCallback(cb) { monitorCb = cb; }
function emitLog(event, data) {
  try { if (monitorCb) monitorCb(event, data); } catch {}
}

function getAuth() {
  try {
    const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
    return a || null;
  } catch { return null; }
}

export async function startSession(cfg = {}) {
  buffer = [];
  sessionId = null;
  userId = null;

  if (!supabase) { emitLog('progress:skip', { reason: 'no supabase client' }); return null; }
  const auth = getAuth();
  // Guests are skipped silently
  if (!auth || String(auth.id || '').startsWith('guest:')) { emitLog('progress:skip', { reason: 'no auth or guest' }); return null; }

  try {
    // Tenter d'obtenir le userId via Supabase auth session
    try {
      const { data: sess } = await supabase.auth.getSession();
      const supaUser = sess?.session?.user;
      if (supaUser) userId = supaUser.id;
    } catch (e) {
      emitLog('progress:auth-warn', { reason: 'supabase.auth.getSession failed', error: e?.message });
    }
    // Fallback: utiliser cc_auth.id directement
    if (!userId && auth.id) {
      userId = auth.id;
      emitLog('progress:auth-fallback', { userId });
    }
    if (!userId) { emitLog('progress:skip', { reason: 'no userId found' }); return null; }

    const payload = {
      user_id: userId,
      mode: cfg?.mode || 'solo',
      classes: Array.isArray(cfg?.classes) ? cfg.classes : [],
      themes: Array.isArray(cfg?.themes) ? cfg.themes : [],
      duration_seconds: Number(cfg?.duration_seconds) || null,
    };
    const { data, error } = await supabase.from('sessions').insert(payload).select('id').single();
    if (error) throw error;
    sessionId = data?.id || null;
    emitLog('progress:session-started', { sessionId, userId });
    return sessionId;
  } catch (e) {
    emitLog('progress:session-failed', { error: e?.message || String(e) });
    return null;
  }
}

export async function recordAttempt(a) {
  // a = { item_type, item_id, objective_key, correct, latency_ms, level_class, theme, round_index }
  if (!sessionId || !userId || !supabase) {
    if (!sessionId && a?.correct !== undefined) emitLog('progress:attempt-skipped', { reason: 'no sessionId', correct: a?.correct, theme: a?.theme });
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
  if (buffer.length >= FLUSH_EVERY) await flushAttempts();
}

export async function flushAttempts() {
  if (!sessionId || !userId || !supabase) { buffer = []; return; }
  if (!buffer.length) return;
  const toSend = buffer.slice();
  buffer = [];
  try {
    const { error } = await supabase.from('attempts').insert(toSend);
    if (error) throw error;
    emitLog('progress:flushed', { count: toSend.length });
  } catch (e) {
    // on failure, try to requeue (best-effort)
    buffer = [...toSend, ...buffer];
    emitLog('progress:flush-failed', { error: e?.message || String(e), buffered: buffer.length });
  }
}
