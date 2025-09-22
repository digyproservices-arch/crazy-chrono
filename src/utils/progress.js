import supabase from './supabaseClient';

// Simple progress reporting helper
// - startSession(cfg): creates a session row and stores sessionId in memory
// - recordAttempt(attempt): buffers attempts and flushes periodically
// - flushAttempts(): inserts all buffered attempts

let sessionId = null;
let userId = null;
let buffer = [];
const FLUSH_EVERY = 10; // flush after N attempts

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

  if (!supabase) return null; // no backend configured
  const auth = getAuth();
  // Require a real Supabase user for RLS
  // Guests are skipped silently
  if (!auth || String(auth.id || '').startsWith('guest:')) return null;

  try {
    const { data: sess } = await supabase.auth.getSession();
    const supaUser = sess?.session?.user;
    if (!supaUser) return null;
    userId = supaUser.id;
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
    return sessionId;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[progress] startSession failed:', e);
    return null;
  }
}

export async function recordAttempt(a) {
  // a = { item_type, item_id, objective_key, correct, latency_ms, level_class, theme, round_index }
  if (!sessionId || !userId || !supabase) return; // ignore if not logged supabase session
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
  } catch (e) {
    // on failure, try to requeue (best-effort)
    buffer = [...toSend, ...buffer];
    // eslint-disable-next-line no-console
    console.warn('[progress] flush failed, will retry later:', e?.message || e);
  }
}
