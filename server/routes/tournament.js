// ==========================================
// ROUTES API - TOURNOI CRAZY CHRONO (Version Supabase)
// Gestion des tournois, matchs Battle Royale, groupes, élèves
// ==========================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { sendGroupInvitations } = require('../utils/emailNotifications');

// Connexion Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  console.log('[Tournament Routes] Supabase connected');
} else {
  console.warn('[Tournament Routes] Supabase not configured');
}

// Middleware pour vérifier la connexion Supabase
const requireSupabase = (req, res, next) => {
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }
  next();
};

// ==========================================
// TOURNOIS
// ==========================================

/**
 * GET /api/tournament/tournaments
 * Liste tous les tournois
 */
router.get('/tournaments', requireSupabase, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, tournaments: data });
  } catch (error) {
    console.error('[Tournament API] Error fetching tournaments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/tournaments/:id
 * Détails d'un tournoi spécifique
 */
router.get('/tournaments/:id', requireSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Récupérer le tournoi
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .single();
    
    if (tournamentError || !tournament) {
      return res.status(404).json({ success: false, error: 'Tournoi non trouvé' });
    }
    
    // Récupérer les phases
    const { data: phases, error: phasesError } = await supabase
      .from('tournament_phases')
      .select('*')
      .eq('tournament_id', id)
      .order('level', { ascending: true });
    
    res.json({
      success: true,
      tournament,
      phases: phases || []
    });
  } catch (error) {
    console.error('[Tournament API] Error fetching tournament:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// CLASSES ET ÉLÈVES
// ==========================================

/**
 * GET /api/tournament/classes/:classId/students
 * Liste des élèves d'une classe
 */
router.get('/classes/:classId/students', requireSupabase, async (req, res) => {
  try {
    const { classId } = req.params;
    
    const { data, error } = await supabase
      .from('students')
      .select(`
        id,
        first_name,
        last_name,
        full_name,
        avatar_url,
        class_id,
        school_id
      `)
      .eq('class_id', classId)
      .order('last_name', { ascending: true });
    
    if (error) throw error;
    
    res.json({ success: true, students: data || [] });
  } catch (error) {
    console.error('[Tournament API] Error fetching students:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/classes/:classId/groups
 * Liste des groupes créés pour une classe
 */
router.get('/classes/:classId/groups', requireSupabase, async (req, res) => {
  try {
    const { classId } = req.params;
    
    const { data, error } = await supabase
      .from('tournament_groups')
      .select('*')
      .eq('class_id', classId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, groups: data || [] });
  } catch (error) {
    console.error('[Tournament API] Error fetching groups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/students/:id
 * Profil d'un élève
 */
router.get('/students/:id', requireSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('students')
      .select(`
        *,
        student_stats (*),
        schools (name),
        classes (name)
      `)
      .eq('id', id)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Élève non trouvé' });
    }
    
    res.json({ success: true, student: data });
  } catch (error) {
    console.error('[Tournament API] Error fetching student:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// GROUPES
// ==========================================

/**
 * POST /api/tournament/groups
 * Créer un groupe de 4 élèves
 */
router.post('/groups', requireSupabase, async (req, res) => {
  try {
    const { tournamentId, phaseLevel, classId, name, studentIds } = req.body;
    
    if (!Array.isArray(studentIds) || studentIds.length < 2 || studentIds.length > 4) {
      return res.status(400).json({ success: false, error: 'Un groupe doit contenir entre 2 et 4 élèves' });
    }
    
    const groupId = `group_${uuidv4()}`;
    
    const { data, error } = await supabase
      .from('tournament_groups')
      .insert({
        id: groupId,
        tournament_id: tournamentId,
        phase_level: phaseLevel,
        class_id: classId,
        name: name,
        student_ids: JSON.stringify(studentIds),
        status: 'pending'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, groupId, group: data });
  } catch (error) {
    console.error('[Tournament API] Error creating group:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/tournament/groups/:id
 * Supprimer un groupe
 */
router.delete('/groups/:id', requireSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('tournament_groups')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Tournament API] Error deleting group:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// MATCHS BATTLE ROYALE
// ==========================================

/**
 * POST /api/tournament/matches
 * Créer un match Battle Royale pour un groupe de 4
 */
router.post('/matches', requireSupabase, async (req, res) => {
  try {
    const { tournamentId, phaseId, groupId, config } = req.body;
    
    const matchId = `match_${uuidv4()}`;
    const roomCode = generateRoomCode();
    
    const { data, error } = await supabase
      .from('tournament_matches')
      .insert({
        id: matchId,
        tournament_id: tournamentId,
        phase_id: phaseId,
        group_id: groupId,
        status: 'pending',
        room_code: roomCode,
        config: JSON.stringify(config)
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Mettre à jour le groupe
    await supabase
      .from('tournament_groups')
      .update({ match_id: matchId })
      .eq('id', groupId);
    
    // Créer le match dans le CrazyArenaManager pour Socket.IO
    if (global.crazyArena) {
      global.crazyArena.createMatch(matchId, roomCode, config);
      console.log(`[Tournament API] Match créé dans CrazyArenaManager: ${matchId}`);
    } else {
      console.warn('[Tournament API] CrazyArenaManager not available');
    }
    
    res.json({ success: true, matchId, roomCode, match: data });
  } catch (error) {
    console.error('[Tournament API] Error creating match:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/students/:studentId/invitations
 * Récupérer les invitations en attente pour un élève (matchs pending/playing)
 */
router.get('/students/:studentId/invitations', requireSupabase, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Trouver les groupes dont l'élève fait partie
    const { data: groups, error: groupsError } = await supabase
      .from('tournament_groups')
      .select('id, name, match_id, student_ids')
      .contains('student_ids', [studentId]);
    
    if (groupsError) throw groupsError;
    
    if (!groups || groups.length === 0) {
      return res.json({ success: true, invitations: [] });
    }
    
    // Récupérer les matchs associés (pending ou playing uniquement)
    const matchIds = groups
      .map(g => g.match_id)
      .filter(id => id);
    
    if (matchIds.length === 0) {
      return res.json({ success: true, invitations: [] });
    }
    
    const { data: matches, error: matchesError } = await supabase
      .from('tournament_matches')
      .select('id, room_code, status, created_at')
      .in('id', matchIds)
      .in('status', ['pending', 'playing']);
    
    if (matchesError) throw matchesError;
    
    // Formatter les invitations
    const invitations = (matches || []).map(match => {
      const group = groups.find(g => g.match_id === match.id);
      return {
        matchId: match.id,
        roomCode: match.room_code,
        groupName: group?.name || 'Groupe',
        status: match.status,
        createdAt: match.created_at
      };
    });
    
    res.json({ success: true, invitations });
  } catch (error) {
    console.error('[Tournament API] Error fetching invitations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/match-by-code/:roomCode
 * Récupérer le matchId depuis un room code (pour les élèves qui rejoignent)
 */
router.get('/match-by-code/:roomCode', requireSupabase, async (req, res) => {
  try {
    const { roomCode } = req.params;
    
    const { data, error } = await supabase
      .from('tournament_matches')
      .select('id, status')
      .eq('room_code', roomCode)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }
    
    res.json({ success: true, matchId: data.id, status: data.status });
  } catch (error) {
    console.error('[Tournament API] Error fetching match by code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/matches/:id
 * Détails d'un match
 */
router.get('/matches/:id', requireSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: match, error: matchError } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('id', id)
      .single();
    
    if (matchError || !match) {
      return res.status(404).json({ success: false, error: 'Match non trouvé' });
    }
    
    // Récupérer les résultats
    const { data: results, error: resultsError } = await supabase
      .from('match_results')
      .select(`
        *,
        students (full_name, avatar_url)
      `)
      .eq('match_id', id)
      .order('position', { ascending: true });
    
    res.json({
      success: true,
      match,
      results: results || []
    });
  } catch (error) {
    console.error('[Tournament API] Error fetching match:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/tournament/matches/:id/finish
 * Terminer un match et enregistrer les résultats
 */
router.patch('/matches/:id/finish', requireSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    const { results } = req.body;
    
    // Trier les résultats
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeMs - b.timeMs;
    });
    
    const winner = results[0];
    
    // Enregistrer les résultats
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const resultId = `result_${uuidv4()}`;
      
      await supabase
        .from('match_results')
        .insert({
          id: resultId,
          match_id: id,
          student_id: r.studentId,
          position: i + 1,
          score: r.score,
          time_ms: r.timeMs,
          pairs_validated: r.pairsValidated || 0,
          errors: r.errors || 0
        });
      
      // Mettre à jour les stats (à implémenter via fonction PostgreSQL pour éviter les race conditions)
    }
    
    // Mettre à jour le match
    await supabase
      .from('tournament_matches')
      .update({
        status: 'finished',
        finished_at: new Date().toISOString(),
        players: JSON.stringify(results),
        winner: JSON.stringify(winner)
      })
      .eq('id', id);
    
    // Mettre à jour le groupe
    const { data: match } = await supabase
      .from('tournament_matches')
      .select('group_id')
      .eq('id', id)
      .single();
    
    if (match) {
      await supabase
        .from('tournament_groups')
        .update({
          status: 'finished',
          winner_id: winner.studentId
        })
        .eq('id', match.group_id);
    }
    
    res.json({ success: true, winner });
  } catch (error) {
    console.error('[Tournament API] Error finishing match:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// LEADERBOARD
// ==========================================

/**
 * GET /api/tournament/leaderboard
 * Classement général
 */
router.get('/leaderboard', requireSupabase, async (req, res) => {
  try {
    const { level, limit = 100 } = req.query;
    
    let query = supabase
      .from('leaderboard')
      .select('*')
      .limit(parseInt(limit));
    
    if (level) {
      query = query.eq('level', level);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({ success: true, leaderboard: data || [] });
  } catch (error) {
    console.error('[Tournament API] Error fetching leaderboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// HELPERS
// ==========================================

function generateRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = router;
