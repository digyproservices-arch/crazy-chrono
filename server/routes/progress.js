const express = require('express');
const router = express.Router();

// POST /api/progress/session — Create a progress session (bypasses RLS via supabaseAdmin)
router.post('/session', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.status(503).json({ ok: false, error: 'supabase_not_configured' });

    const { user_id, mode, classes, themes, duration_seconds } = req.body || {};
    if (!user_id) return res.status(400).json({ ok: false, error: 'missing user_id' });

    const payload = {
      user_id,
      mode: mode || 'solo',
      classes: Array.isArray(classes) ? classes : [],
      themes: Array.isArray(themes) ? themes : [],
      duration_seconds: Number(duration_seconds) || null,
    };

    const { data, error } = await supabase.from('sessions').insert(payload).select('id').single();
    if (error) {
      console.warn('[Progress API] session insert error:', error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

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

module.exports = router;
