const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// GET /api/mastery — Load mastery progress for the authenticated user
router.get('/', requireAuth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.status(503).json({ ok: false, error: 'supabase_not_configured' });

    const userId = req.authUser.id;

    const { data, error } = await supabase
      .from('mastery_progress')
      .select('progress, updated_at')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error, just empty)
      console.warn('[Mastery API] GET error:', error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({
      ok: true,
      progress: data?.progress || null,
      updated_at: data?.updated_at || null,
    });
  } catch (e) {
    console.error('[Mastery API] GET error:', e.message);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// POST /api/mastery — Save mastery progress for the authenticated user
router.post('/', requireAuth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.status(503).json({ ok: false, error: 'supabase_not_configured' });

    const userId = req.authUser.id;
    const { progress } = req.body || {};

    if (!progress || typeof progress !== 'object') {
      return res.status(400).json({ ok: false, error: 'missing_or_invalid_progress' });
    }

    // Upsert: insert or update on conflict
    const { error } = await supabase
      .from('mastery_progress')
      .upsert({
        user_id: userId,
        progress,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.warn('[Mastery API] POST upsert error:', error.message, error.code);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[Mastery API] POST error:', e.message);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

module.exports = router;
