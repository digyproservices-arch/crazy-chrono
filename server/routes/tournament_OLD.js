// ==========================================
// ROUTES API - TOURNOI CRAZY CHRONO
// Gestion des tournois, matchs Battle Royale, groupes, élèves
// ==========================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Helper: Connexion BDD (à adapter selon votre config)
const getDB = () => {
  // TODO: Remplacer par votre connexion DB réelle (Supabase, PostgreSQL, etc.)
  return global.tournamentDB || null;
};

// ==========================================
// TOURNOIS
// ==========================================

/**
 * GET /api/tournament/tournaments
 * Liste tous les tournois
 */
router.get('/tournaments', async (req, res) => {
  try {
    const db = getDB();
    const tournaments = await db.query('SELECT * FROM tournaments ORDER BY created_at DESC');
    res.json({ success: true, tournaments: tournaments.rows });
  } catch (error) {
    console.error('[Tournament API] Error fetching tournaments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/tournaments/:id
 * Détails d'un tournoi spécifique
 */
router.get('/tournaments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    // Tournoi
    const tournament = await db.query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (tournament.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tournoi non trouvé' });
    }
    
    // Phases
    const phases = await db.query('SELECT * FROM tournament_phases WHERE tournament_id = $1 ORDER BY level', [id]);
    
    // Stats globales
    const stats = await db.query(`
      SELECT 
        COUNT(DISTINCT s.id) as total_students,
        COUNT(DISTINCT tg.id) as total_groups,
        COUNT(DISTINCT tm.id) as total_matches,
        COUNT(DISTINCT CASE WHEN tm.status = 'finished' THEN tm.id END) as matches_finished
      FROM tournaments t
      LEFT JOIN tournament_groups tg ON t.id = tg.tournament_id
      LEFT JOIN tournament_matches tm ON t.id = tm.tournament_id
      LEFT JOIN students s ON s.id = ANY(string_to_array(tg.student_ids::text, ','))
      WHERE t.id = $1
    `, [id]);
    
    res.json({
      success: true,
      tournament: tournament.rows[0],
      phases: phases.rows,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('[Tournament API] Error fetching tournament:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/tournament/tournaments
 * Créer un nouveau tournoi
 */
router.post('/tournaments', async (req, res) => {
  try {
    const { name, academyCode, config, startDate, endDate, createdBy } = req.body;
    const db = getDB();
    
    const id = `tour_${Date.now()}_${academyCode.toLowerCase()}`;
    
    await db.query(`
      INSERT INTO tournaments (id, name, academy_code, status, config, start_date, end_date, created_by)
      VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7)
    `, [id, name, academyCode, JSON.stringify(config), startDate, endDate, createdBy]);
    
    // Créer les 4 phases automatiquement
    const phaseNames = [
      'CRAZY WINNER CLASSE',
      'CRAZY WINNER ÉCOLE',
      'CRAZY WINNER CIRCONSCRIPTION',
      'CRAZY WINNER ACADÉMIQUE'
    ];
    
    for (let i = 0; i < 4; i++) {
      const phaseId = `phase_${i + 1}_${id}`;
      await db.query(`
        INSERT INTO tournament_phases (id, tournament_id, level, name, status)
        VALUES ($1, $2, $3, $4, 'pending')
      `, [phaseId, id, i + 1, phaseNames[i]]);
    }
    
    res.json({ success: true, tournamentId: id });
  } catch (error) {
    console.error('[Tournament API] Error creating tournament:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/tournament/tournaments/:id/phase
 * Changer la phase active du tournoi
 */
router.patch('/tournaments/:id/phase', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPhase } = req.body; // 1-4
    const db = getDB();
    
    // Clôturer la phase actuelle
    await db.query(`
      UPDATE tournament_phases SET status = 'finished'
      WHERE tournament_id = $1 AND level < $2
    `, [id, newPhase]);
    
    // Activer la nouvelle phase
    await db.query(`
      UPDATE tournament_phases SET status = 'active', start_date = NOW()
      WHERE tournament_id = $1 AND level = $2
    `, [id, newPhase]);
    
    // Mettre à jour le tournoi
    await db.query(`
      UPDATE tournaments SET current_phase = $1 WHERE id = $2
    `, [newPhase, id]);
    
    res.json({ success: true, currentPhase: newPhase });
  } catch (error) {
    console.error('[Tournament API] Error changing phase:', error);
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
router.post('/matches', async (req, res) => {
  try {
    const { tournamentId, phaseId, groupId, config } = req.body;
    const db = getDB();
    
    const matchId = `match_${uuidv4()}`;
    const roomCode = generateRoomCode();
    
    await db.query(`
      INSERT INTO tournament_matches (id, tournament_id, phase_id, group_id, status, room_code, config)
      VALUES ($1, $2, $3, $4, 'pending', $5, $6)
    `, [matchId, tournamentId, phaseId, groupId, roomCode, JSON.stringify(config)]);
    
    // Associer le match au groupe
    await db.query(`
      UPDATE tournament_groups SET match_id = $1 WHERE id = $2
    `, [matchId, groupId]);
    
    res.json({ success: true, matchId, roomCode });
  } catch (error) {
    console.error('[Tournament API] Error creating match:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/matches/:id
 * Détails d'un match
 */
router.get('/matches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    const match = await db.query('SELECT * FROM tournament_matches WHERE id = $1', [id]);
    if (match.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Match non trouvé' });
    }
    
    // Résultats des joueurs
    const results = await db.query(`
      SELECT mr.*, s.full_name, s.avatar_url
      FROM match_results mr
      JOIN students s ON mr.student_id = s.id
      WHERE mr.match_id = $1
      ORDER BY mr.position ASC
    `, [id]);
    
    res.json({
      success: true,
      match: match.rows[0],
      results: results.rows
    });
  } catch (error) {
    console.error('[Tournament API] Error fetching match:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/tournament/matches/:id/join
 * Un élève rejoint un match via le code de salle
 */
router.post('/matches/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId } = req.body;
    const db = getDB();
    
    // Vérifier que le match existe et est en attente
    const match = await db.query('SELECT * FROM tournament_matches WHERE id = $1', [id]);
    if (match.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Match non trouvé' });
    }
    
    if (match.rows[0].status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Match déjà commencé' });
    }
    
    // Vérifier que l'élève fait partie du groupe
    const group = await db.query('SELECT * FROM tournament_groups WHERE id = $1', [match.rows[0].group_id]);
    const studentIds = JSON.parse(group.rows[0].student_ids);
    
    if (!studentIds.includes(studentId)) {
      return res.status(403).json({ success: false, error: 'Élève non autorisé pour ce match' });
    }
    
    res.json({ success: true, match: match.rows[0] });
  } catch (error) {
    console.error('[Tournament API] Error joining match:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/tournament/matches/:id/start
 * Démarrer un match
 */
router.patch('/matches/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    await db.query(`
      UPDATE tournament_matches 
      SET status = 'in_progress', started_at = NOW()
      WHERE id = $1
    `, [id]);
    
    await db.query(`
      UPDATE tournament_groups SET status = 'playing' WHERE match_id = $1
    `, [id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Tournament API] Error starting match:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/tournament/matches/:id/finish
 * Terminer un match et enregistrer les résultats
 */
router.patch('/matches/:id/finish', async (req, res) => {
  try {
    const { id } = req.params;
    const { results } = req.body; // Array de { studentId, score, timeMs, pairsValidated, errors }
    const db = getDB();
    
    // Trier les résultats par score DESC, puis temps ASC
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeMs - b.timeMs;
    });
    
    const winner = results[0];
    
    // Enregistrer les résultats
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const resultId = `result_${uuidv4()}`;
      
      await db.query(`
        INSERT INTO match_results (id, match_id, student_id, position, score, time_ms, pairs_validated, errors)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [resultId, id, r.studentId, i + 1, r.score, r.timeMs, r.pairsValidated || 0, r.errors || 0]);
      
      // Mettre à jour les stats de l'élève
      await db.query(`
        UPDATE student_stats SET
          total_matches = total_matches + 1,
          total_wins = total_wins + $1,
          best_score = GREATEST(best_score, $2),
          total_score = total_score + $3,
          updated_at = NOW()
        WHERE student_id = $4
      `, [i === 0 ? 1 : 0, r.score, r.score, r.studentId]);
    }
    
    // Mettre à jour le match
    await db.query(`
      UPDATE tournament_matches 
      SET status = 'finished', 
          finished_at = NOW(),
          players = $1,
          winner = $2
      WHERE id = $3
    `, [JSON.stringify(results), JSON.stringify(winner), id]);
    
    // Mettre à jour le groupe
    await db.query(`
      UPDATE tournament_groups 
      SET status = 'finished', winner_id = $1
      WHERE match_id = $2
    `, [winner.studentId, id]);
    
    res.json({ success: true, winner });
  } catch (error) {
    console.error('[Tournament API] Error finishing match:', error);
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
router.post('/groups', async (req, res) => {
  try {
    const { tournamentId, phaseLevel, classId, name, studentIds } = req.body;
    const db = getDB();
    
    if (!Array.isArray(studentIds) || studentIds.length !== 4) {
      return res.status(400).json({ success: false, error: 'Un groupe doit contenir exactement 4 élèves' });
    }
    
    const groupId = `group_${uuidv4()}`;
    
    await db.query(`
      INSERT INTO tournament_groups (id, tournament_id, phase_level, class_id, name, student_ids, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    `, [groupId, tournamentId, phaseLevel, classId, name, JSON.stringify(studentIds)]);
    
    res.json({ success: true, groupId });
  } catch (error) {
    console.error('[Tournament API] Error creating group:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ÉLÈVES
// ==========================================

/**
 * GET /api/tournament/students/:id
 * Profil d'un élève
 */
router.get('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    const student = await db.query(`
      SELECT s.*, ss.*, sc.name as school_name, c.name as class_name
      FROM students s
      LEFT JOIN student_stats ss ON s.id = ss.student_id
      LEFT JOIN schools sc ON s.school_id = sc.id
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.id = $1
    `, [id]);
    
    if (student.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Élève non trouvé' });
    }
    
    res.json({ success: true, student: student.rows[0] });
  } catch (error) {
    console.error('[Tournament API] Error fetching student:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/students/:id/matches
 * Historique des matchs d'un élève
 */
router.get('/students/:id/matches', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    const matches = await db.query(`
      SELECT 
        tm.id,
        tm.status,
        tm.started_at,
        tm.finished_at,
        mr.position,
        mr.score,
        mr.time_ms,
        tp.name as phase_name
      FROM match_results mr
      JOIN tournament_matches tm ON mr.match_id = tm.id
      JOIN tournament_phases tp ON tm.phase_id = tp.id
      WHERE mr.student_id = $1
      ORDER BY tm.finished_at DESC
    `, [id]);
    
    res.json({ success: true, matches: matches.rows });
  } catch (error) {
    console.error('[Tournament API] Error fetching student matches:', error);
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
router.get('/leaderboard', async (req, res) => {
  try {
    const { level, limit = 100 } = req.query;
    const db = getDB();
    
    let query = 'SELECT * FROM leaderboard';
    const params = [];
    
    if (level) {
      query += ' WHERE level = $1';
      params.push(level);
    }
    
    query += ' LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));
    
    const leaderboard = await db.query(query, params);
    
    res.json({ success: true, leaderboard: leaderboard.rows });
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
