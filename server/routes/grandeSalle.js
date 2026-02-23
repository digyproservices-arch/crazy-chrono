// ==========================================
// ROUTES API - GRANDE SALLE TOURNOIS PROGRAMMÉS
// CRUD tournois + liste publique
// ==========================================

const express = require('express');
const router = express.Router();

// Middleware: vérifier que l'utilisateur est admin ou teacher
async function requireAdmin(req, res, next) {
  const supabaseAdmin = req.app.locals.supabaseAdmin;
  if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'supabase_not_configured' });

  const authz = String(req.headers['authorization'] || '').trim();
  if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
  const token = authz.slice(7).trim();

  try {
    const { data: who, error: whoErr } = await supabaseAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });

    const { data: prof } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', who.user.id)
      .single();

    if (!prof || !['admin', 'teacher'].includes(prof.role)) {
      return res.status(403).json({ ok: false, error: 'admin_required' });
    }

    req.userId = who.user.id;
    req.userRole = prof.role;
    next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ===== GET /api/gs/tournaments — Liste des tournois (public) =====
router.get('/tournaments', async (req, res) => {
  const supabaseAdmin = req.app.locals.supabaseAdmin;
  if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'supabase_not_configured' });

  try {
    const { status, upcoming } = req.query;

    let query = supabaseAdmin
      .from('gs_tournaments')
      .select('*')
      .order('scheduled_at', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    if (upcoming === 'true') {
      query = query.in('status', ['scheduled', 'open'])
        .gte('scheduled_at', new Date().toISOString());
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ ok: false, error: error.message });

    res.json({ ok: true, tournaments: data || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== GET /api/gs/tournaments/:id — Détail d'un tournoi =====
router.get('/tournaments/:id', async (req, res) => {
  const supabaseAdmin = req.app.locals.supabaseAdmin;
  if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'supabase_not_configured' });

  try {
    const { data, error } = await supabaseAdmin
      .from('gs_tournaments')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ ok: false, error: 'tournament_not_found' });
    res.json({ ok: true, tournament: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== POST /api/gs/tournaments — Créer un tournoi (admin) =====
router.post('/tournaments', requireAdmin, async (req, res) => {
  const supabaseAdmin = req.app.locals.supabaseAdmin;

  try {
    const { title, description, themes, classes, scheduled_at, duration_round, elimination_percent, rounds_per_elimination, min_players } = req.body;

    if (!title || !scheduled_at) {
      return res.status(400).json({ ok: false, error: 'title et scheduled_at sont requis' });
    }

    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ ok: false, error: 'Date invalide' });
    }
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ ok: false, error: 'La date doit être dans le futur' });
    }

    const row = {
      title: String(title).trim(),
      description: String(description || '').trim(),
      themes: Array.isArray(themes) ? themes : [],
      classes: Array.isArray(classes) ? classes : [],
      scheduled_at: scheduledDate.toISOString(),
      duration_round: Number(duration_round) || 90,
      elimination_percent: Math.min(50, Math.max(10, Number(elimination_percent) || 25)),
      rounds_per_elimination: Number(rounds_per_elimination) || 1,
      min_players: Math.max(2, Number(min_players) || 3),
      status: 'scheduled',
      created_by: req.userId,
    };

    const { data, error } = await supabaseAdmin
      .from('gs_tournaments')
      .insert(row)
      .select()
      .single();

    if (error) return res.status(400).json({ ok: false, error: error.message });

    console.log(`[GS] Tournament created: "${row.title}" scheduled for ${row.scheduled_at}`);
    res.json({ ok: true, tournament: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== PUT /api/gs/tournaments/:id — Modifier un tournoi (admin) =====
router.put('/tournaments/:id', requireAdmin, async (req, res) => {
  const supabaseAdmin = req.app.locals.supabaseAdmin;

  try {
    const updates = {};
    const allowed = ['title', 'description', 'themes', 'classes', 'scheduled_at', 'duration_round', 'elimination_percent', 'rounds_per_elimination', 'min_players', 'status'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'themes' || key === 'classes') {
          updates[key] = Array.isArray(req.body[key]) ? req.body[key] : [];
        } else if (key === 'scheduled_at') {
          const d = new Date(req.body[key]);
          if (!isNaN(d.getTime())) updates[key] = d.toISOString();
        } else if (['duration_round', 'elimination_percent', 'rounds_per_elimination', 'min_players'].includes(key)) {
          updates[key] = Number(req.body[key]) || undefined;
        } else {
          updates[key] = req.body[key];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'Aucun champ à modifier' });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('gs_tournaments')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, tournament: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== DELETE /api/gs/tournaments/:id — Supprimer un tournoi (admin) =====
router.delete('/tournaments/:id', requireAdmin, async (req, res) => {
  const supabaseAdmin = req.app.locals.supabaseAdmin;

  try {
    const { error } = await supabaseAdmin
      .from('gs_tournaments')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ ok: false, error: error.message });

    console.log(`[GS] Tournament ${req.params.id} deleted`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
