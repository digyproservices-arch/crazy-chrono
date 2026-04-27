// ==========================================
// ROUTES API RECTORAT
// Dashboard académique - stats, compétitions, cartes jouées
// ==========================================

const express = require('express');
const router = express.Router();
const { requireRectoratAuth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

// ── GET /api/rectorat/stats ──
// Vue d'ensemble: nombre d'écoles, élèves, matchs, sessions
router.get('/stats', requireRectoratAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'db_unavailable' });

    const [schools, students, matches, sessions] = await Promise.all([
      supabase.from('schools').select('id', { count: 'exact', head: true }),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('licensed', true),
      supabase.from('tournament_matches').select('id', { count: 'exact', head: true }),
      supabase.from('training_sessions').select('id', { count: 'exact', head: true }),
    ]);

    // Matchs officiels
    const { count: officialCount } = await supabase
      .from('tournament_matches')
      .select('id', { count: 'exact', head: true })
      .eq('is_official', true);

    // Matchs terminés
    const { count: finishedMatches } = await supabase
      .from('tournament_matches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'finished');

    // Sessions terminées
    const { count: finishedSessions } = await supabase
      .from('training_sessions')
      .select('id', { count: 'exact', head: true })
      .not('completed_at', 'is', null);

    res.json({
      ok: true,
      stats: {
        schools: schools.count || 0,
        licensedStudents: students.count || 0,
        totalMatches: (matches.count || 0) + (sessions.count || 0),
        officialMatches: officialCount || 0,
        finishedMatches: (finishedMatches || 0) + (finishedSessions || 0),
      }
    });
  } catch (e) {
    console.error('[Rectorat API] stats error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rectorat/competitions ──
// Liste des matchs (Arena + Training) avec filtres
router.get('/competitions', requireRectoratAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'db_unavailable' });

    const { official, status, limit: lim, offset } = req.query;
    const pageSize = Math.min(parseInt(lim) || 50, 100);
    const pageOffset = parseInt(offset) || 0;

    // 1. Tournament matches (Arena)
    let arenaQuery = supabase
      .from('tournament_matches')
      .select('id, tournament_id, status, room_code, config, players, winner, is_official, started_at, finished_at, created_at')
      .order('created_at', { ascending: false })
      .range(pageOffset, pageOffset + pageSize - 1);

    if (official === 'true') arenaQuery = arenaQuery.eq('is_official', true);
    if (status) arenaQuery = arenaQuery.eq('status', status);

    const { data: arenaMatches, error: arenaErr } = await arenaQuery;
    if (arenaErr) throw arenaErr;

    // 2. Training sessions
    let trainingQuery = supabase
      .from('training_sessions')
      .select('id, match_id, session_name, config, class_id, completed_at, created_at')
      .order('created_at', { ascending: false })
      .range(pageOffset, pageOffset + pageSize - 1);

    const { data: trainingSessions, error: trainingErr } = await trainingQuery;
    if (trainingErr) throw trainingErr;

    // Combiner et trier
    const competitions = [
      ...(arenaMatches || []).map(m => ({
        id: m.id,
        type: 'arena',
        name: `Arena ${m.room_code || m.id.slice(-8)}`,
        status: m.status,
        isOfficial: m.is_official || false,
        config: typeof m.config === 'string' ? JSON.parse(m.config) : m.config,
        players: typeof m.players === 'string' ? JSON.parse(m.players) : m.players,
        winner: typeof m.winner === 'string' ? JSON.parse(m.winner) : m.winner,
        startedAt: m.started_at,
        finishedAt: m.finished_at,
        createdAt: m.created_at,
      })),
      ...(trainingSessions || []).map(s => ({
        id: s.id,
        type: 'training',
        name: s.session_name || 'Session Entraînement',
        status: s.completed_at ? 'finished' : 'in_progress',
        isOfficial: !!(typeof s.config === 'object' ? s.config : JSON.parse(s.config || '{}')).isOfficial,
        config: typeof s.config === 'string' ? JSON.parse(s.config) : s.config,
        classId: s.class_id,
        finishedAt: s.completed_at,
        createdAt: s.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Filter official after merge if needed
    const filtered = official === 'true' ? competitions.filter(c => c.isOfficial) : competitions;

    res.json({ ok: true, competitions: filtered.slice(0, pageSize), total: filtered.length });
  } catch (e) {
    console.error('[Rectorat API] competitions error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rectorat/match/:id/cards ──
// Cartes jouées pour un match donné (rounds_data)
router.get('/match/:id/cards', requireRectoratAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'db_unavailable' });

    const matchId = req.params.id;

    // Essayer tournament_matches d'abord
    const { data: arenaMatch } = await supabase
      .from('tournament_matches')
      .select('id, rounds_data, config, status, players, winner, started_at, finished_at')
      .eq('id', matchId)
      .single();

    if (arenaMatch) {
      const roundsData = arenaMatch.rounds_data
        ? (typeof arenaMatch.rounds_data === 'string' ? JSON.parse(arenaMatch.rounds_data) : arenaMatch.rounds_data)
        : [];
      return res.json({
        ok: true,
        type: 'arena',
        matchId,
        rounds: roundsData,
        config: typeof arenaMatch.config === 'string' ? JSON.parse(arenaMatch.config) : arenaMatch.config,
        status: arenaMatch.status,
        players: typeof arenaMatch.players === 'string' ? JSON.parse(arenaMatch.players) : arenaMatch.players,
      });
    }

    // Essayer training_sessions
    const { data: session } = await supabase
      .from('training_sessions')
      .select('id, rounds_data, config, session_name, completed_at')
      .eq('id', matchId)
      .single();

    if (session) {
      const roundsData = session.rounds_data
        ? (typeof session.rounds_data === 'string' ? JSON.parse(session.rounds_data) : session.rounds_data)
        : [];
      return res.json({
        ok: true,
        type: 'training',
        matchId,
        rounds: roundsData,
        config: typeof session.config === 'string' ? JSON.parse(session.config) : session.config,
        name: session.session_name,
      });
    }

    res.status(404).json({ ok: false, error: 'Match non trouvé' });
  } catch (e) {
    console.error('[Rectorat API] match cards error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rectorat/schools ──
// Liste des écoles avec stats, classes et circonscription
router.get('/schools', requireRectoratAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'db_unavailable' });

    const { circonscription } = req.query;

    let schoolQuery = supabase
      .from('schools')
      .select('id, name, type, city, postal_code, circonscription_id')
      .order('name');

    if (circonscription) {
      schoolQuery = schoolQuery.eq('circonscription_id', circonscription);
    }

    const { data: schools, error } = await schoolQuery;
    if (error) throw error;

    // Charger classes et élèves en batch
    const schoolIds = (schools || []).map(s => s.id);
    const [classesRes, studentsRes] = await Promise.all([
      supabase.from('classes').select('id, school_id, name, level, teacher_name, teacher_email, student_count').in('school_id', schoolIds),
      supabase.from('students').select('id, first_name, last_name, full_name, school_id, class_id, licensed, access_code').in('school_id', schoolIds).eq('licensed', true),
    ]);

    const classes = classesRes.data || [];
    const students = studentsRes.data || [];

    // Extraire TOUTES les circonscriptions (pas seulement celles filtrées)
    let circonscriptions;
    if (circonscription) {
      const { data: allSchools } = await supabase.from('schools').select('circonscription_id');
      circonscriptions = [...new Set((allSchools || []).map(s => s.circonscription_id).filter(Boolean))].sort();
    } else {
      circonscriptions = [...new Set((schools || []).map(s => s.circonscription_id).filter(Boolean))].sort();
    }

    const schoolStats = (schools || []).map(school => {
      const sClasses = classes.filter(c => c.school_id === school.id);
      const sStudents = students.filter(st => st.school_id === school.id);
      return {
        ...school,
        classCount: sClasses.length,
        studentCount: sStudents.filter(s => s.licensed).length,
        classes: sClasses.map(c => {
          const cStudents = sStudents.filter(s => s.class_id === c.id);
          return {
            id: c.id, name: c.name, level: c.level,
            teacherName: c.teacher_name, teacherEmail: c.teacher_email,
            studentCount: cStudents.length || c.student_count || 0,
            students: cStudents.map(s => ({ id: s.id, firstName: s.first_name, lastName: s.last_name, fullName: s.full_name, accessCode: s.access_code })),
          };
        }),
      };
    });

    res.json({ ok: true, schools: schoolStats, circonscriptions });
  } catch (e) {
    console.error('[Rectorat API] schools error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rectorat/classes ──
// Toutes les classes visibles par le rectorat (pour lancer entraînement / tournoi)
router.get('/classes', requireRectoratAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'db_unavailable' });

    const { circonscription } = req.query;

    let query = supabase
      .from('classes')
      .select('id, school_id, name, level, teacher_name, teacher_email, student_count, schools(id, name, city, circonscription_id)')
      .order('name');

    const { data: classes, error } = await query;
    if (error) throw error;

    // Filtrer par circonscription si demandé
    let filtered = classes || [];
    if (circonscription) {
      filtered = filtered.filter(c => c.schools?.circonscription_id === circonscription);
    }

    // Charger les élèves pour chaque classe
    const classIds = filtered.map(c => c.id);
    const { data: students } = await supabase
      .from('students')
      .select('id, first_name, last_name, full_name, class_id, licensed, access_code')
      .in('class_id', classIds)
      .eq('licensed', true)
      .order('last_name');

    // Charger la progression tournoi pour chaque classe (groupes Arena)
    let groupsByClass = {};
    try {
      const { data: groups } = await supabase
        .from('tournament_groups')
        .select('id, class_id, status, winner_id, mode, tour_number')
        .in('class_id', classIds);
      if (groups) {
        for (const g of groups) {
          if (!groupsByClass[g.class_id]) groupsByClass[g.class_id] = [];
          groupsByClass[g.class_id].push(g);
        }
      }
    } catch (e) {
      console.warn('[Rectorat API] groups query error (non-bloquant):', e.message);
    }

    const result = filtered.map(c => {
      const classGroups = groupsByClass[c.id] || [];
      const arenaGroups = classGroups.filter(g => g.mode !== 'training');
      const totalGroups = arenaGroups.length;
      const finishedGroups = arenaGroups.filter(g => g.status === 'finished').length;
      const playingGroups = arenaGroups.filter(g => g.status === 'playing').length;
      const maxTour = totalGroups > 0 ? Math.max(...arenaGroups.map(g => g.tour_number || 1)) : 0;

      let tournamentStatus = 'not_started';
      if (totalGroups > 0) {
        if (finishedGroups === totalGroups) tournamentStatus = 'finished';
        else if (finishedGroups > 0 || playingGroups > 0) tournamentStatus = 'in_progress';
        else tournamentStatus = 'ready';
      }

      return {
        id: c.id,
        name: c.name,
        level: c.level,
        teacherName: c.teacher_name,
        teacherEmail: c.teacher_email,
        schoolId: c.school_id,
        schoolName: c.schools?.name || '',
        city: c.schools?.city || '',
        circonscription: c.schools?.circonscription_id || '',
        studentCount: c.student_count || 0,
        tournament: {
          totalGroups,
          finishedGroups,
          playingGroups,
          currentTour: maxTour,
          status: tournamentStatus,
        },
        students: (students || []).filter(s => s.class_id === c.id).map(s => ({
          id: s.id,
          firstName: s.first_name,
          lastName: s.last_name,
          fullName: s.full_name,
          accessCode: s.access_code,
          licensed: s.licensed,
        })),
      };
    });

    res.json({ ok: true, classes: result });
  } catch (e) {
    console.error('[Rectorat API] classes error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PATCH /api/rectorat/competition/:id/toggle ──
// Ouvrir ou fermer la compétition officielle (rectorat uniquement)
router.patch('/competition/:id/toggle', requireRectoratAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'db_unavailable' });

    const tournamentId = req.params.id;

    // Récupérer le tournoi actuel
    const { data: tournament, error: fetchErr } = await supabase
      .from('tournaments')
      .select('id, name, status, academy_code')
      .eq('id', tournamentId)
      .single();

    if (fetchErr || !tournament) {
      return res.status(404).json({ ok: false, error: 'Tournoi non trouvé' });
    }

    // Toggle: draft → active, active → draft
    const newStatus = tournament.status === 'active' ? 'draft' : 'active';
    const now = new Date().toISOString();

    const updateFields = { status: newStatus };
    if (newStatus === 'active') {
      updateFields.start_date = now;
    }

    const { error: updateErr } = await supabase
      .from('tournaments')
      .update(updateFields)
      .eq('id', tournamentId);

    if (updateErr) throw updateErr;

    console.log(`[Rectorat API] Compétition ${tournamentId} → ${newStatus} (par ${req.user?.email || 'rectorat'})`);

    res.json({
      ok: true,
      tournament: { ...tournament, status: newStatus },
      message: newStatus === 'active'
        ? 'Compétition ouverte ! Les enseignants peuvent maintenant lancer des matchs Arena officiels.'
        : 'Compétition fermée. Le bouton Arena sera grisé pour les enseignants.'
    });
  } catch (e) {
    console.error('[Rectorat API] toggle competition error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/rectorat/competition-status ──
// Statut de la compétition (accessible aussi sans auth rectorat pour les profs)
router.get('/competition-status', async (req, res) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'db_unavailable' });

    const academy = req.query.academy || 'GP';

    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('id, name, status, academy_code, start_date, current_phase')
      .eq('academy_code', academy)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !tournament) {
      return res.json({ ok: true, open: false, reason: 'no_tournament' });
    }

    res.json({
      ok: true,
      open: tournament.status === 'active',
      tournamentId: tournament.id,
      name: tournament.name,
      status: tournament.status,
      startDate: tournament.start_date,
      currentPhase: tournament.current_phase,
      academy: tournament.academy_code
    });
  } catch (e) {
    console.error('[Rectorat API] competition-status error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
