const express = require('express');
const router = express.Router();

// Helper: resolve non-UUID user_id (e.g. "s001") to auth UUID via user_student_mapping
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function resolveUserId(supabase, rawId) {
  if (!rawId) return null;
  if (UUID_RE.test(rawId)) return rawId; // already a UUID
  try {
    const { data } = await supabase
      .from('user_student_mapping')
      .select('user_id')
      .eq('student_id', rawId)
      .eq('active', true)
      .single();
    if (data?.user_id) {
      console.log(`[Progress API] Resolved "${rawId}" → ${data.user_id}`);
      return data.user_id;
    }
  } catch {}
  console.warn(`[Progress API] Could not resolve "${rawId}" to UUID, using as-is`);
  return rawId;
}

// POST /api/progress/session — Create a progress session (bypasses RLS via supabaseAdmin)
router.post('/session', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.status(503).json({ ok: false, error: 'supabase_not_configured' });

    const { user_id: rawUserId, mode, classes, themes, duration_seconds } = req.body || {};
    if (!rawUserId) return res.status(400).json({ ok: false, error: 'missing user_id' });

    // Resolve non-UUID user_id to auth UUID
    const user_id = await resolveUserId(supabase, rawUserId);
    console.log(`[Progress API] POST /session user_id=${user_id} mode=${mode}`);

    const payload = {
      user_id,
      mode: mode || 'solo',
      classes: Array.isArray(classes) ? classes : [],
      themes: Array.isArray(themes) ? themes : [],
      duration_seconds: Number(duration_seconds) || null,
    };

    const { data, error } = await supabase.from('sessions').insert(payload).select('id').single();
    if (error) {
      console.warn('[Progress API] session insert error:', error.message, error.code);
      return res.status(500).json({ ok: false, error: error.message, code: error.code });
    }

    console.log(`[Progress API] Session created: ${data?.id}`);
    return res.json({ ok: true, sessionId: data?.id });
  } catch (e) {
    console.error('[Progress API] session exception:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/progress/attempts — Flush buffered attempts (bypasses RLS via supabaseAdmin)
router.post('/attempts', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.status(503).json({ ok: false, error: 'supabase_not_configured' });

    const { attempts } = req.body || {};
    if (!Array.isArray(attempts) || attempts.length === 0) {
      return res.status(400).json({ ok: false, error: 'empty attempts array' });
    }

    // Validate each attempt has required fields
    const rows = attempts.map(a => ({
      session_id: a.session_id || null,
      user_id: a.user_id || null,
      item_type: a.item_type || null,
      item_id: a.item_id || null,
      objective_key: a.objective_key || null,
      correct: typeof a.correct === 'boolean' ? a.correct : null,
      latency_ms: Number(a.latency_ms) || null,
      level_class: a.level_class || null,
      theme: a.theme || null,
      round_index: Number(a.round_index) || 0,
    }));

    const { error } = await supabase.from('attempts').insert(rows);
    if (error) {
      console.warn('[Progress API] attempts insert error:', error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, count: rows.length });
  } catch (e) {
    console.error('[Progress API] attempts exception:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/progress/debug/:userId — Show data for a specific user (diagnostic)
router.get('/debug/:userId', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.status(503).json({ error: 'supabase_not_configured' });
    const { userId } = req.params;

    // Check sessions
    const { data: sessions, error: se } = await supabase
      .from('sessions').select('id, user_id, mode, themes, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(5);

    // Check attempts
    const { data: attempts, error: ae } = await supabase
      .from('attempts').select('user_id, theme, level_class, correct, latency_ms, item_type, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(10);

    // Check training_results
    const { data: training, error: te } = await supabase
      .from('training_results').select('student_id, score, pairs_validated, created_at')
      .eq('student_id', userId).order('created_at', { ascending: false }).limit(5);

    // List distinct user_ids in sessions (to find the right one)
    const { data: distinctUsers } = await supabase
      .from('sessions').select('user_id').limit(20);
    const uniqueUserIds = [...new Set((distinctUsers || []).map(r => r.user_id))];

    return res.json({
      query_userId: userId,
      sessions: { count: sessions?.length || 0, error: se?.message || null, rows: sessions || [] },
      attempts: { count: attempts?.length || 0, error: ae?.message || null, rows: attempts || [] },
      training_results: { count: training?.length || 0, error: te?.message || null, rows: training || [] },
      all_session_user_ids: uniqueUserIds
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/progress/health — Diagnostic endpoint (testable via browser)
router.get('/health', async (req, res) => {
  const diag = { route: true, supabase: false, sessions_table: false, attempts_table: false, sessions_count: 0, attempts_count: 0, error: null };
  try {
    const supabase = req.app.locals.supabaseAdmin;
    diag.supabase = !!supabase;
    if (!supabase) { diag.error = 'supabaseAdmin not configured'; return res.json(diag); }

    const { data: s, error: se } = await supabase.from('sessions').select('id', { count: 'exact', head: false }).limit(0);
    diag.sessions_table = !se;
    if (se) diag.error = `sessions: ${se.message}`;

    const { data: a, error: ae } = await supabase.from('attempts').select('id', { count: 'exact', head: false }).limit(0);
    diag.attempts_table = !ae;
    if (ae) diag.error = (diag.error || '') + ` attempts: ${ae.message}`;

    // Count rows
    const { count: sc } = await supabase.from('sessions').select('*', { count: 'exact', head: true });
    const { count: ac } = await supabase.from('attempts').select('*', { count: 'exact', head: true });
    diag.sessions_count = sc || 0;
    diag.attempts_count = ac || 0;
  } catch (e) {
    diag.error = e.message;
  }
  console.log('[Progress API] GET /health', JSON.stringify(diag));
  return res.json(diag);
});

module.exports = router;
