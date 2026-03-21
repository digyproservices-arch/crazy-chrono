// ==========================================
// ROUTES API - TOURNOI CRAZY CHRONO (Version Supabase)
// Gestion des tournois, matchs Battle Royale, groupes, élèves
// ==========================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { validateCreateGroup, validateCreateMatch, validateCleanup, validateUpdateGroup, validateParamClassId, validateParamStudentId } = require('../middleware/validate');
const { createClient } = require('@supabase/supabase-js');
const { sendGroupInvitations } = require('../utils/emailNotifications');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Cache associations.json pour calcul expectedItems (maîtrise)
let _assocCache = null;
function getAssocData() {
  if (_assocCache) return _assocCache;
  try {
    const p = path.join(__dirname, '../../public/data/associations.json');
    _assocCache = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { _assocCache = {}; }
  return _assocCache;
}
const LEVEL_ORDER = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e'];
const THEME_TO_CODE = { 'Plantes médicinales': 'botanique', 'Géographie': 'geographie', 'Animaux': 'animaux', 'Fruits & Légumes': 'fruits' };

function getExpectedItemsForTheme(themeName, studentLevel) {
  if (themeName.startsWith('Table de ')) return 10;
  const code = THEME_TO_CODE[themeName];
  if (!code) return null;
  const ad = getAssocData();
  if (!ad.textes) return null;
  const maxIdx = studentLevel ? LEVEL_ORDER.indexOf(studentLevel) : -1;
  if (maxIdx < 0) {
    // Pas de niveau connu → compter tous les items du thème
    return ad.textes.filter(t => (t.themes || []).includes(code)).length;
  }
  // Compter les items dont le levelClass est <= au niveau du joueur
  return ad.textes.filter(t => {
    if (!(t.themes || []).includes(code)) return false;
    const tIdx = LEVEL_ORDER.indexOf(t.levelClass);
    return tIdx >= 0 && tIdx <= maxIdx;
  }).length;
}

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
 * POST /api/tournament/tournaments
 * Créer un nouveau tournoi
 */
router.post('/tournaments', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { name, description, level } = req.body;
    const tournamentId = `tournament_${uuidv4()}`;

    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        id: tournamentId,
        name: name || 'Tournoi Crazy Chrono',
        description: description || '',
        status: 'active',
        current_phase: 1,
        created_by: req.authUser.id
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Tournament API] Tournoi créé: ${tournamentId} par ${req.authUser.email}`);
    res.json({ success: true, tournament: data });
  } catch (error) {
    console.error('[Tournament API] Error creating tournament:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/tournament/phases
 * Créer une phase pour un tournoi
 */
router.post('/phases', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { tournamentId, level, status } = req.body;

    if (!tournamentId || !level) {
      return res.status(400).json({ success: false, error: 'tournamentId et level requis' });
    }

    const phaseId = `phase_${level}_${tournamentId}`;
    const phaseName = PHASE_NAMES[level] || `Phase ${level}`;

    const { data, error } = await supabase
      .from('tournament_phases')
      .insert({
        id: phaseId,
        tournament_id: tournamentId,
        level: level,
        name: phaseName,
        status: status || 'pending',
        started_at: status === 'active' ? new Date().toISOString() : null
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Tournament API] Phase ${level} (${phaseName}) créée pour tournoi ${tournamentId}`);
    res.json({ success: true, phase: data });
  } catch (error) {
    console.error('[Tournament API] Error creating phase:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

/**
 * GET /api/tournament/list
 * Alias pour /tournaments (compatibilité RectoratDashboard)
 */
router.get('/list', requireSupabase, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, tournaments: data || [] });
  } catch (error) {
    console.error('[Tournament API] Error fetching tournaments list:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/:tournamentId/phases
 * Récupérer les phases d'un tournoi avec groupes et stats
 */
router.get('/:tournamentId/phases', requireSupabase, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    
    const { data: phases, error: phasesError } = await supabase
      .from('tournament_phases')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('level', { ascending: true });
    
    if (phasesError) throw phasesError;
    
    // Enrichir chaque phase avec ses groupes
    const enrichedPhases = [];
    for (const phase of (phases || [])) {
      const { data: groups } = await supabase
        .from('tournament_groups')
        .select('id, name, status, winner_id, student_ids, match_id')
        .eq('tournament_id', tournamentId)
        .eq('phase_level', phase.level);
      
      enrichedPhases.push({
        ...phase,
        groups: groups || [],
        completedGroups: (groups || []).filter(g => g.status === 'finished').length,
        totalGroups: (groups || []).length,
        winnersCount: (groups || []).filter(g => g.winner_id).length
      });
    }
    
    res.json({ success: true, phases: enrichedPhases });
  } catch (error) {
    console.error('[Tournament API] Error fetching phases:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Noms officiels des phases
const PHASE_NAMES = {
  1: 'CRAZY WINNER CLASSE',
  2: 'CRAZY WINNER ÉCOLE',
  3: 'CRAZY WINNER CIRCONSCRIPTION',
  4: 'CRAZY WINNER ACADÉMIQUE'
};

/**
 * PATCH /api/tournament/phases/:phaseId/close
 * Clôturer une phase → qualifie les gagnants pour la phase suivante
 */
router.patch('/phases/:phaseId/close', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { phaseId } = req.params;
    
    // 1. Récupérer la phase
    const { data: phase, error: phaseError } = await supabase
      .from('tournament_phases')
      .select('*')
      .eq('id', phaseId)
      .single();
    
    if (phaseError || !phase) {
      return res.status(404).json({ success: false, error: 'Phase non trouvée' });
    }
    
    if (phase.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Cette phase n\'est pas active' });
    }
    
    // 2. Vérifier que tous les groupes sont terminés
    const { data: groups } = await supabase
      .from('tournament_groups')
      .select('id, status, winner_id, student_ids, name')
      .eq('tournament_id', phase.tournament_id)
      .eq('phase_level', phase.level);
    
    const unfinishedGroups = (groups || []).filter(g => g.status !== 'finished');
    if (unfinishedGroups.length > 0) {
      return res.status(400).json({
        success: false,
        error: `${unfinishedGroups.length} groupe(s) non terminé(s). Tous les matchs doivent être joués avant de clôturer.`
      });
    }
    
    // 3. Récupérer les gagnants
    const winners = (groups || []).filter(g => g.winner_id).map(g => g.winner_id);
    
    // 4. Marquer la phase comme terminée
    await supabase
      .from('tournament_phases')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', phaseId);
    
    // 5. Si pas phase finale (4), préparer la phase suivante
    const nextLevel = phase.level + 1;
    let nextPhaseId = null;
    
    if (nextLevel <= 4) {
      // Vérifier si la phase suivante existe déjà
      const { data: existingNext } = await supabase
        .from('tournament_phases')
        .select('id')
        .eq('tournament_id', phase.tournament_id)
        .eq('level', nextLevel)
        .single();
      
      if (existingNext) {
        nextPhaseId = existingNext.id;
      } else {
        // Créer la phase suivante
        const newPhaseId = `phase_${nextLevel}_${phase.tournament_id}`;
        const { data: newPhase } = await supabase
          .from('tournament_phases')
          .insert({
            id: newPhaseId,
            tournament_id: phase.tournament_id,
            level: nextLevel,
            name: PHASE_NAMES[nextLevel] || `Phase ${nextLevel}`,
            status: 'pending'
          })
          .select()
          .single();
        
        nextPhaseId = newPhase?.id || newPhaseId;
      }
      
      // Créer automatiquement les groupes pour la phase suivante avec les gagnants
      if (winners.length >= 2) {
        const groupSize = 4;
        for (let i = 0; i < winners.length; i += groupSize) {
          const groupWinners = winners.slice(i, i + groupSize);
          if (groupWinners.length >= 2) {
            const groupId = `group_${uuidv4()}`;
            const groupNum = Math.floor(i / groupSize) + 1;
            
            await supabase
              .from('tournament_groups')
              .insert({
                id: groupId,
                tournament_id: phase.tournament_id,
                phase_level: nextLevel,
                class_id: phase.tournament_id,
                name: `${PHASE_NAMES[nextLevel]} - Groupe ${groupNum}`,
                student_ids: JSON.stringify(groupWinners),
                status: 'pending'
              });
          }
        }
      }
    }
    
    // 6. Mettre à jour le tournoi
    await supabase
      .from('tournaments')
      .update({ current_phase: nextLevel <= 4 ? nextLevel : phase.level })
      .eq('id', phase.tournament_id);
    
    console.log(`[Tournament API] Phase ${phase.level} (${PHASE_NAMES[phase.level]}) clôturée. ${winners.length} qualifié(s) pour Phase ${nextLevel}`);
    
    res.json({
      success: true,
      qualifiedCount: winners.length,
      nextPhaseId,
      message: nextLevel <= 4
        ? `${PHASE_NAMES[phase.level]} clôturée. ${winners.length} qualifié(s) pour ${PHASE_NAMES[nextLevel]}.`
        : `${PHASE_NAMES[phase.level]} clôturée. Tournoi terminé! ${winners.length} finalistes.`
    });
  } catch (error) {
    console.error('[Tournament API] Error closing phase:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/tournament/phases/:phaseId/activate
 * Activer une phase (la rendre jouable)
 */
router.patch('/phases/:phaseId/activate', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { phaseId } = req.params;
    
    const { data: phase, error: phaseError } = await supabase
      .from('tournament_phases')
      .select('*')
      .eq('id', phaseId)
      .single();
    
    if (phaseError || !phase) {
      return res.status(404).json({ success: false, error: 'Phase non trouvée' });
    }
    
    if (phase.status === 'active') {
      return res.status(400).json({ success: false, error: 'Cette phase est déjà active' });
    }
    
    // Activer la phase
    await supabase
      .from('tournament_phases')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', phaseId);
    
    // Mettre à jour le tournoi
    await supabase
      .from('tournaments')
      .update({ current_phase: phase.level })
      .eq('id', phase.tournament_id);
    
    console.log(`[Tournament API] Phase ${phase.level} (${PHASE_NAMES[phase.level]}) activée`);
    
    res.json({
      success: true,
      message: `${PHASE_NAMES[phase.level]} activée avec succès!`
    });
  } catch (error) {
    console.error('[Tournament API] Error activating phase:', error);
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
router.get('/classes/:classId/students', requireSupabase, requireAuth, ...validateParamClassId, async (req, res) => {
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
        school_id,
        licensed
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
router.get('/classes/:classId/groups', requireSupabase, requireAuth, ...validateParamClassId, async (req, res) => {
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
router.get('/students/:id', requireSupabase, requireAuth, async (req, res) => {
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
router.post('/groups', requireSupabase, requireAuth, ...validateCreateGroup, async (req, res) => {
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
 * PATCH /api/tournament/groups/:id
 * Mettre à jour un groupe (ex: définir le gagnant)
 */
router.patch('/groups/:id', requireSupabase, requireAuth, ...validateUpdateGroup, async (req, res) => {
  try {
    const { id } = req.params;
    const { winnerId, status, matchId } = req.body;
    
    const updateData = {};
    if (winnerId) updateData.winner_id = winnerId;
    if (status) updateData.status = status;
    if (matchId) updateData.match_id = matchId;
    
    const { data, error } = await supabase
      .from('tournament_groups')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, group: data });
  } catch (error) {
    console.error('[Tournament API] Error updating group:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/groups/:id/match-history
 * Récupérer l'historique de TOUS les matchs d'un groupe (avec dates et résultats)
 */
router.get('/groups/:id/match-history', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Récupérer le groupe
    const { data: group, error: groupErr } = await supabase
      .from('tournament_groups')
      .select('id, name, student_ids, class_id, match_id, status')
      .eq('id', id)
      .single();
    
    if (groupErr || !group) {
      return res.status(404).json({ success: false, error: 'Groupe introuvable' });
    }
    
    const studentIds = Array.isArray(group.student_ids) ? group.student_ids : JSON.parse(group.student_ids || '[]');
    if (studentIds.length === 0) {
      return res.json({ success: true, groupName: group.name, matches: [], students: [] });
    }
    
    // 2. Résoudre les student_ids en auth UUIDs (training_results.student_id est UUID)
    const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const uuidIds = studentIds.filter(isValidUuid);
    const nonUuidIds = studentIds.filter(id => !isValidUuid(id));
    
    // Mapper les IDs non-UUID (ex: "s002") vers auth UUIDs via user_student_mapping
    const idToAuthMap = {}; // s002 → auth-uuid
    const authToIdMap = {}; // auth-uuid → s002
    if (nonUuidIds.length > 0) {
      const { data: mappings } = await supabase
        .from('user_student_mapping')
        .select('student_id, user_id')
        .in('student_id', nonUuidIds)
        .eq('active', true);
      
      for (const m of (mappings || [])) {
        idToAuthMap[m.student_id] = m.user_id;
        authToIdMap[m.user_id] = m.student_id;
        uuidIds.push(m.user_id);
      }
    }
    
    // Tous les IDs auth UUID à chercher dans training_results
    const allAuthIds = [...new Set(uuidIds)];
    if (allAuthIds.length === 0) {
      return res.json({ success: true, groupName: group.name, matches: [], students: [] });
    }
    
    console.log('[Tournament API] match-history: studentIds=', studentIds, 'authIds=', allAuthIds);
    
    // 3. Récupérer tous les training_results pour ces élèves (auth UUIDs)
    const { data: allResults, error: resErr } = await supabase
      .from('training_results')
      .select('id, session_id, student_id, position, score, time_ms, pairs_validated, errors, created_at')
      .in('student_id', allAuthIds)
      .order('created_at', { ascending: false });
    
    if (resErr) throw resErr;
    
    if (!allResults || allResults.length === 0) {
      return res.json({ success: true, groupName: group.name, matches: [], students: [] });
    }
    
    // 4. Regrouper par session_id
    const sessionMap = {};
    for (const r of allResults) {
      if (!sessionMap[r.session_id]) sessionMap[r.session_id] = [];
      sessionMap[r.session_id].push(r);
    }
    
    // Filtrer: garder les sessions avec au moins 2 joueurs du groupe (matchs de groupe, pas solo)
    const authIdSet = new Set(allAuthIds);
    const groupSessionIds = Object.keys(sessionMap).filter(sid => {
      const players = sessionMap[sid];
      const groupPlayers = players.filter(p => authIdSet.has(p.student_id));
      return groupPlayers.length >= 2;
    });
    
    if (groupSessionIds.length === 0) {
      return res.json({ success: true, groupName: group.name, matches: [], students: [] });
    }
    
    // 5. Récupérer les sessions correspondantes
    const { data: sessions } = await supabase
      .from('training_sessions')
      .select('id, match_id, session_name, completed_at, created_at, config')
      .in('id', groupSessionIds)
      .order('created_at', { ascending: false });
    
    // 6. Récupérer les noms des élèves (chercher avec les deux formats d'ID)
    const allLookupIds = [...new Set([...studentIds, ...allAuthIds])];
    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, first_name, avatar_url')
      .in('id', allLookupIds);
    
    const studentsMap = Object.fromEntries((students || []).map(s => [s.id, s]));
    
    // Helper: trouver le nom d'un étudiant par son auth UUID
    const getStudentInfo = (authId) => {
      // Chercher directement par auth UUID
      if (studentsMap[authId]) return studentsMap[authId];
      // Chercher par l'ID original (ex: s002) via le reverse mapping
      const origId = authToIdMap[authId];
      if (origId && studentsMap[origId]) return studentsMap[origId];
      return null;
    };
    
    // 7. Construire la réponse avec chaque match et ses résultats
    const matchHistory = (sessions || []).map(session => {
      const results = (sessionMap[session.id] || [])
        .filter(r => authIdSet.has(r.student_id))
        .sort((a, b) => (a.position || 999) - (b.position || 999))
        .map(r => {
          const info = getStudentInfo(r.student_id);
          return {
            studentId: r.student_id,
            studentName: info?.full_name || info?.first_name || r.student_id,
            avatar: info?.avatar_url || null,
            position: r.position,
            score: r.score,
            timeMs: r.time_ms,
            pairs_validated: r.pairs_validated || 0,
            errors: r.errors || 0
          };
        });
      
      return {
        sessionId: session.id,
        matchId: session.match_id,
        sessionName: session.session_name,
        date: session.completed_at || session.created_at,
        results
      };
    });
    
    res.json({
      success: true,
      groupName: group.name,
      groupId: group.id,
      currentMatchId: group.match_id,
      matches: matchHistory,
      students: studentIds.map(sid => {
        const info = studentsMap[sid] || getStudentInfo(idToAuthMap[sid]) || {};
        return {
          id: sid,
          name: info.full_name || info.first_name || sid,
          avatar: info.avatar_url || null
        };
      })
    });
  } catch (error) {
    console.error('[Tournament API] Error fetching match history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/tournament/groups/:id
 * Supprimer un groupe
 */
router.delete('/groups/:id', requireSupabase, requireAuth, async (req, res) => {
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
router.post('/matches', requireSupabase, requireAuth, ...validateCreateMatch, async (req, res) => {
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
    
    // Envoyer les invitations email aux élèves du groupe
    try {
      const { data: groupData } = await supabase
        .from('tournament_groups')
        .select('student_ids')
        .eq('id', groupId)
        .single();
      
      if (groupData && groupData.student_ids) {
        const studentIds = Array.isArray(groupData.student_ids) 
          ? groupData.student_ids 
          : JSON.parse(groupData.student_ids);
        
        // ✅ Émettre notifications Socket.IO instantanées pour chaque élève (comme Training)
        if (global.crazyArena && global.crazyArena.io) {
          studentIds.forEach(sid => {
            global.crazyArena.io.emit(`arena:invite:${sid}`, {
              matchId,
              roomCode,
              groupSize: studentIds.length,
              config: config || {}
            });
          });
          console.log(`[Tournament API] ✅ Notifications Socket.IO Arena envoyées à ${studentIds.length} élève(s)`);
        }
        
        // Récupérer les infos des élèves avec leurs emails depuis Auth
        const { data: mappings } = await supabase
          .from('user_student_mapping')
          .select(`
            user_id,
            student_id,
            students (
              id,
              full_name,
              first_name
            )
          `)
          .in('student_id', studentIds)
          .eq('active', true);
        
        if (mappings && mappings.length > 0) {
          // Récupérer les emails depuis auth.users
          const userIds = mappings.map(m => m.user_id);
          const studentsWithEmails = [];
          
          for (const mapping of mappings) {
            try {
              const { data: { user } } = await supabase.auth.admin.getUserById(mapping.user_id);
              if (user && user.email) {
                studentsWithEmails.push({
                  id: mapping.student_id,
                  email: user.email,
                  full_name: mapping.students?.full_name,
                  first_name: mapping.students?.first_name
                });
              }
            } catch (err) {
              console.error(`[Tournament API] Erreur récupération user ${mapping.user_id}:`, err);
            }
          }
          
          if (studentsWithEmails.length > 0) {
            console.log(`[Tournament API] Envoi invitations à ${studentsWithEmails.length} élève(s)`);
            sendGroupInvitations(studentsWithEmails, roomCode, matchId).catch(err => {
              console.error('[Tournament API] Erreur envoi invitations:', err);
            });
          }
        }
      }
    } catch (emailError) {
      // Ne pas bloquer la création du match si l'email échoue
      console.error('[Tournament API] Erreur envoi invitations (non bloquant):', emailError);
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
router.get('/students/:studentId/invitations', requireSupabase, requireAuth, ...validateParamStudentId, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Récupérer tous les groupes et filtrer côté JS
    // (student_ids est un JSON string, pas un JSONB array)
    const { data: allGroups, error: groupsError } = await supabase
      .from('tournament_groups')
      .select('id, name, match_id, student_ids');
    
    if (groupsError) throw groupsError;
    
    // Filtrer les groupes contenant cet élève
    const groups = (allGroups || []).filter(g => {
      if (!g.student_ids) return false;
      const ids = Array.isArray(g.student_ids) 
        ? g.student_ids 
        : JSON.parse(g.student_ids);
      return ids.includes(studentId);
    });
    
    if (groups.length === 0) {
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
 * GET /api/tournament/students/:studentId/training-invitations
 * Récupérer les invitations training en attente pour un élève (matchs in-memory)
 */
router.get('/students/:studentId/training-invitations', requireAuth, ...validateParamStudentId, async (req, res) => {
  try {
    const { studentId } = req.params;
    const invitations = [];

    if (global.crazyArena && global.crazyArena.matches) {
      for (const [matchId, match] of global.crazyArena.matches.entries()) {
        if (match.mode !== 'training') continue;
        if (match.status === 'finished') continue;
        // Check if this student is expected in this match
        const expected = match.expectedPlayers || [];
        if (!expected.includes(studentId)) continue;
        // Check if student already has results (match done for them)
        const hasResult = match.scores && match.scores[studentId] !== undefined && match.status === 'finished';
        if (hasResult) continue;

        invitations.push({
          type: 'training',
          matchId: match.matchId,
          sessionName: match.config?.sessionName || 'Session Entraînement',
          groupSize: expected.length,
          config: {
            rounds: match.config?.rounds || 3,
            duration: match.config?.duration || 60,
            level: match.config?.level || 'CE1'
          },
          status: match.status
        });
      }
    }

    console.log(`[Tournament API] Training invitations pour ${studentId}: ${invitations.length} trouvée(s)`);
    res.json({ success: true, invitations });
  } catch (error) {
    console.error('[Tournament API] Error fetching training invitations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/match-by-code/:roomCode
 * Récupérer le matchId depuis un room code (pour les élèves qui rejoignent)
 * Cherche dans Arena (DB) ET Training (mémoire)
 */
router.get('/match-by-code/:roomCode', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { roomCode } = req.params;
    
    // ✅ PARTIE 1: Chercher dans matchs Training (mémoire) EN PREMIER
    if (global.crazyArena && global.crazyArena.matches) {
      const allMatches = Array.from(global.crazyArena.matches.values());
      const trainingMatch = allMatches.find(m => 
        m.mode === 'training' && 
        (m.roomCode === roomCode || m.matchId === roomCode)
      );
      
      if (trainingMatch) {
        console.log(`[Tournament API] ✅ Match Training trouvé: ${trainingMatch.matchId}`);
        return res.json({ 
          success: true, 
          matchId: trainingMatch.matchId, 
          status: trainingMatch.status,
          mode: 'training'
        });
      }
    }
    
    // ✅ PARTIE 2: Si pas trouvé, chercher dans matchs Arena (DB)
    const { data, error } = await supabase
      .from('tournament_matches')
      .select('id, status')
      .eq('room_code', roomCode)
      .single();
    
    if (error || !data) {
      console.log(`[Tournament API] ❌ Match non trouvé pour roomCode: ${roomCode}`);
      return res.status(404).json({ success: false, error: 'Match not found' });
    }
    
    console.log(`[Tournament API] ✅ Match Arena trouvé: ${data.id}`);
    res.json({ 
      success: true, 
      matchId: data.id, 
      status: data.status,
      mode: 'arena'
    });
  } catch (error) {
    console.error('[Tournament API] Error fetching match by code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/matches/:id
 * Détails d'un match
 */
router.get('/matches/:id', requireSupabase, requireAuth, async (req, res) => {
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
router.patch('/matches/:id/finish', requireSupabase, requireAuth, async (req, res) => {
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
// SUPERVISEUR (RECTORAT)
// ==========================================

/**
 * GET /api/tournament/:tournamentId/supervisor
 * Vue complète superviseur: phases, groupes, matchs, résultats, timeline
 */
router.get('/:tournamentId/supervisor', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { tournamentId } = req.params;

    // 1. Tournoi
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();
    if (tErr || !tournament) return res.status(404).json({ success: false, error: 'Tournoi introuvable' });

    // 2. Phases
    const { data: phases } = await supabase
      .from('tournament_phases')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('level', { ascending: true });

    // 3. Groupes
    const { data: groups } = await supabase
      .from('tournament_groups')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true });

    // 4. Matchs
    const groupIds = (groups || []).map(g => g.id);
    let matches = [];
    if (groupIds.length > 0) {
      const { data: matchData } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true });
      matches = matchData || [];
    }

    // 5. Résultats
    const matchIds = matches.map(m => m.id);
    let results = [];
    if (matchIds.length > 0) {
      const { data: resultData } = await supabase
        .from('match_results')
        .select('*')
        .in('match_id', matchIds)
        .order('position', { ascending: true });
      results = resultData || [];
    }

    // 6. Construire la vue enrichie par phase
    const phasesView = (phases || []).map(phase => {
      const phaseGroups = (groups || []).filter(g => g.phase_level === phase.level);
      const phaseMatches = matches.filter(m => m.phase_id === phase.id);
      const finishedGroups = phaseGroups.filter(g => g.status === 'finished');
      const winners = phaseGroups.filter(g => g.winner_id).map(g => g.winner_id);

      const groupsView = phaseGroups.map(g => {
        const studentIds = Array.isArray(g.student_ids) ? g.student_ids : JSON.parse(g.student_ids || '[]');
        const match = matches.find(m => m.id === g.match_id);
        const matchResults = match ? results.filter(r => r.match_id === match.id) : [];

        return {
          id: g.id,
          name: g.name,
          status: g.status,
          studentIds,
          winnerId: g.winner_id,
          match: match ? {
            id: match.id,
            roomCode: match.room_code,
            status: match.status,
            createdAt: match.created_at,
            finishedAt: match.finished_at,
            results: matchResults.map(r => ({
              studentId: r.student_id,
              position: r.position,
              score: r.score,
              timeMs: r.time_ms,
              pairs: r.pairs_validated,
              errors: r.errors
            }))
          } : null
        };
      });

      return {
        id: phase.id,
        level: phase.level,
        name: phase.name || PHASE_NAMES[phase.level],
        status: phase.status,
        startedAt: phase.started_at,
        finishedAt: phase.finished_at,
        totalGroups: phaseGroups.length,
        finishedGroups: finishedGroups.length,
        totalMatches: phaseMatches.length,
        finishedMatches: phaseMatches.filter(m => m.status === 'finished').length,
        winnersCount: winners.length,
        groups: groupsView
      };
    });

    // 7. Timeline chronologique (Replay Niveau A)
    const timeline = matches
      .filter(m => m.status === 'finished' && m.finished_at)
      .map(m => {
        const group = (groups || []).find(g => g.match_id === m.id);
        const phase = (phases || []).find(p => p.id === m.phase_id);
        const matchResults = results.filter(r => r.match_id === m.id);
        const winner = matchResults.find(r => r.position === 1);

        return {
          type: 'match_finished',
          timestamp: m.finished_at,
          phaseLevel: phase?.level,
          phaseName: phase?.name || PHASE_NAMES[phase?.level],
          groupName: group?.name,
          matchId: m.id,
          roomCode: m.room_code,
          winnerId: winner?.student_id,
          winnerScore: winner?.score,
          playerCount: matchResults.length,
          results: matchResults.map(r => ({
            studentId: r.student_id,
            position: r.position,
            score: r.score,
            timeMs: r.time_ms,
            pairs: r.pairs_validated,
            errors: r.errors
          }))
        };
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Add phase events to timeline
    for (const phase of (phases || [])) {
      if (phase.started_at) {
        timeline.push({
          type: 'phase_started',
          timestamp: phase.started_at,
          phaseLevel: phase.level,
          phaseName: phase.name || PHASE_NAMES[phase.level]
        });
      }
      if (phase.finished_at) {
        timeline.push({
          type: 'phase_finished',
          timestamp: phase.finished_at,
          phaseLevel: phase.level,
          phaseName: phase.name || PHASE_NAMES[phase.level]
        });
      }
    }
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // 8. Stats globales
    const globalStats = {
      totalPhases: (phases || []).length,
      activePhases: (phases || []).filter(p => p.status === 'active').length,
      finishedPhases: (phases || []).filter(p => p.status === 'finished').length,
      totalGroups: (groups || []).length,
      totalMatches: matches.length,
      finishedMatches: matches.filter(m => m.status === 'finished').length,
      playingMatches: matches.filter(m => m.status === 'playing').length,
      totalPlayers: new Set((groups || []).flatMap(g => {
        const sids = Array.isArray(g.student_ids) ? g.student_ids : JSON.parse(g.student_ids || '[]');
        return sids;
      })).size,
      totalResults: results.length
    };

    res.json({
      success: true,
      tournament,
      stats: globalStats,
      phases: phasesView,
      timeline
    });
  } catch (error) {
    console.error('[Tournament API] Error supervisor view:', error);
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

/**
 * POST /api/tournament/cleanup-old-matches
 * Nettoyer les anciens matchs (marquer comme finished les matchs de plus de 24h)
 */
router.post('/cleanup-old-matches', requireSupabase, requireAuth, ...validateCleanup, async (req, res) => {
  try {
    const { studentId } = req.body;
    
    if (!studentId) {
      return res.status(400).json({ success: false, error: 'studentId requis' });
    }

    console.log(`[Cleanup] Nettoyage matchs pour élève ${studentId}`);

    // Récupérer tous les groupes de cet élève
    const { data: allGroups, error: groupsError } = await supabase
      .from('tournament_groups')
      .select('id, match_id, student_ids');
    
    if (groupsError) throw groupsError;
    
    const groups = (allGroups || []).filter(g => {
      if (!g.student_ids) return false;
      const ids = Array.isArray(g.student_ids) ? g.student_ids : JSON.parse(g.student_ids);
      return ids.includes(studentId);
    });

    const matchIds = groups.map(g => g.match_id).filter(id => id);

    if (matchIds.length === 0) {
      return res.json({ success: true, cleaned: 0, message: 'Aucun match à nettoyer' });
    }

    // Marquer tous les anciens matchs comme finished
    const { data: updated, error: updateError } = await supabase
      .from('tournament_matches')
      .update({ 
        status: 'finished',
        finished_at: new Date().toISOString()
      })
      .in('id', matchIds)
      .in('status', ['pending', 'playing'])
      .select();

    if (updateError) throw updateError;

    const cleanedCount = updated?.length || 0;
    console.log(`[Cleanup] ${cleanedCount} matchs marqués comme finished`);

    // Broadcaster pour retirer les notifications
    const io = req.app.get('io');
    if (io && updated) {
      updated.forEach(match => {
        io.emit('arena:match-finished', { matchId: match.id });
        console.log(`[Cleanup] 📢 Broadcast arena:match-finished pour ${match.id}`);
      });
    }

    res.json({ 
      success: true, 
      cleaned: cleanedCount,
      message: `${cleanedCount} notification(s) nettoyée(s)`
    });
  } catch (error) {
    console.error('[Cleanup] Erreur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tournament/active-matches?teacherId=xxx
 * Récupérer les matchs actifs (pending/playing) pour le dashboard professeur
 * Filtre par teacherId pour ne montrer que les matchs créés par ce professeur
 * Inclut les matchs Arena (DB) ET les matchs Training (mémoire)
 */
router.get('/active-matches', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { teacherId, teacherEmail } = req.query;
    
    // ✅ PARTIE 1: Matchs Arena depuis la base de données
    let arenaQuery = supabase
      .from('tournament_matches')
      .select('id, room_code, status, created_at, group_id, tournament_id')
      .in('status', ['pending', 'playing'])
      .order('created_at', { ascending: false });
    
    const { data: arenaMatches, error: matchesError } = await arenaQuery;
    
    if (matchesError) throw matchesError;
    
    console.log(`[Tournament API] 🔍 active-matches: teacherId=${teacherId}, teacherEmail=${teacherEmail}, arenaMatchesDB=${(arenaMatches||[]).length}`);
    
    // ✅ Filtrer par teacherId/teacherEmail via tournaments.created_by
    // Note: created_by peut contenir un UUID ou un email selon la méthode de création
    let filteredArenaMatches = arenaMatches || [];
    if ((teacherId || teacherEmail) && filteredArenaMatches.length > 0) {
      const tournamentIds = [...new Set(filteredArenaMatches.map(m => m.tournament_id).filter(Boolean))];
      if (tournamentIds.length > 0) {
        const { data: tournaments } = await supabase
          .from('tournaments')
          .select('id, created_by')
          .in('id', tournamentIds);
        
        console.log(`[Tournament API] 🔍 Tournaments trouvés:`, (tournaments||[]).map(t => ({ id: t.id?.slice(-8), created_by: t.created_by })));
        
        const teacherTournamentIds = new Set(
          (tournaments || []).filter(t => {
            if (!t.created_by) return false;
            // Match against UUID or email
            if (teacherId && t.created_by === teacherId) return true;
            if (teacherEmail && t.created_by === teacherEmail) return true;
            return false;
          }).map(t => t.id)
        );
        
        console.log(`[Tournament API] 🔍 Après filtre teacherId: ${filteredArenaMatches.length} → ${filteredArenaMatches.filter(m => teacherTournamentIds.has(m.tournament_id)).length} matchs`);
        filteredArenaMatches = filteredArenaMatches.filter(m => teacherTournamentIds.has(m.tournament_id));
      } else {
        console.log(`[Tournament API] ⚠️ Aucun tournament_id trouvé dans les matchs → 0 matchs Arena DB`);
        filteredArenaMatches = [];
      }
    }
    
    // Récupérer les infos des groupes Arena associés
    const groupIds = filteredArenaMatches.map(m => m.group_id).filter(id => id);
    let groups = [];
    
    if (groupIds.length > 0) {
      const { data: groupsData, error: groupsError } = await supabase
        .from('tournament_groups')
        .select('id, name, student_ids')
        .in('id', groupIds);
      
      if (groupsError) throw groupsError;
      groups = groupsData || [];
    }
    
    // Enrichir les matchs Arena avec les infos des groupes
    const enrichedArenaMatches = filteredArenaMatches.map(match => {
      const group = groups.find(g => g.id === match.group_id);
      const studentIds = group?.student_ids 
        ? (Array.isArray(group.student_ids) ? group.student_ids : JSON.parse(group.student_ids))
        : [];
      
      return {
        matchId: match.id,
        roomCode: match.room_code,
        status: match.status,
        createdAt: match.created_at,
        groupName: group?.name || 'Groupe sans nom',
        totalPlayers: studentIds.length,
        studentIds: studentIds,
        mode: 'arena',
        // Les joueurs connectés seront mis à jour par Socket.IO côté client
        connectedPlayers: 0,
        readyPlayers: 0
      };
    });
    
    // ✅ PARTIE 2: Enrichir matchs Arena DB avec données temps réel de la mémoire
    if (global.crazyArena && global.crazyArena.matches) {
      for (const em of enrichedArenaMatches) {
        const memMatch = global.crazyArena.matches.get(em.matchId);
        if (memMatch) {
          em.connectedPlayers = memMatch.players.length;
          em.readyPlayers = memMatch.players.filter(p => p.ready).length;
          em.status = memMatch.status === 'waiting' ? 'pending' : memMatch.status;
          em.players = memMatch.players.map(p => ({ studentId: p.studentId, name: p.name, ready: p.ready, score: p.score }));
        }
      }
    }
    
    // ✅ PARTIE 3: Matchs Arena en mémoire absents de la DB (fallback)
    let arenaMemoryMatches = [];
    if (global.crazyArena && global.crazyArena.matches) {
      const dbMatchIds = new Set(enrichedArenaMatches.map(m => m.matchId));
      const allMemMatches = Array.from(global.crazyArena.matches.values());
      
      arenaMemoryMatches = allMemMatches
        .filter(m => m.mode === 'arena' && ['waiting', 'playing', 'tie-waiting'].includes(m.status))
        .filter(m => !dbMatchIds.has(m.matchId)) // Pas déjà dans la DB
        .map(match => ({
          matchId: match.matchId,
          roomCode: match.roomCode || match.matchId,
          status: match.status === 'waiting' ? 'pending' : match.status,
          createdAt: new Date().toISOString(),
          groupName: 'Match Arena',
          totalPlayers: match.players.length,
          studentIds: match.players.map(p => p.studentId),
          mode: 'arena',
          connectedPlayers: match.players.length,
          readyPlayers: match.players.filter(p => p.ready).length,
          players: match.players.map(p => ({ studentId: p.studentId, name: p.name, ready: p.ready, score: p.score }))
        }));
      
      if (arenaMemoryMatches.length > 0) {
        console.log(`[Tournament API] ✅ ${arenaMemoryMatches.length} matchs Arena mémoire-only ajoutés`);
      }
    }
    
    // ✅ PARTIE 4: Matchs Training depuis la mémoire (CrazyArenaManager)
    let trainingMatches = [];
    
    if (global.crazyArena && global.crazyArena.matches) {
      const allMatches = Array.from(global.crazyArena.matches.values());
      
      // Filtrer les matchs Training actifs (waiting, playing, ou tie-waiting)
      // + filtrer par teacherId si fourni
      trainingMatches = allMatches
        .filter(m => m.mode === 'training' && ['waiting', 'playing', 'tie-waiting'].includes(m.status))
        .filter(m => !teacherId || m.teacherId === teacherId)
        .map(match => {
          const baseMatch = {
            matchId: match.matchId,
            roomCode: match.roomCode || match.matchId,
            status: match.status === 'waiting' ? 'pending' : match.status,
            createdAt: new Date().toISOString(),
            groupName: match.config?.sessionName || 'Session Training',
            totalPlayers: match.expectedPlayers?.length || match.players.length,
            studentIds: match.expectedPlayers || match.players.map(p => p.studentId),
            mode: 'training',
            connectedPlayers: match.players.length,
            readyPlayers: match.players.filter(p => p.ready).length
          };
          
          // ✅ CRITIQUE: Pour tie-waiting, ajouter compteurs joueurs prêts pour tiebreaker
          if (match.status === 'tie-waiting') {
            console.log(`[Tournament API] 🔍 Match tie-waiting ${match.matchId?.slice(-8)}:`, {
              playersReadyForTiebreaker: match.playersReadyForTiebreaker,
              isSet: match.playersReadyForTiebreaker instanceof Set,
              size: match.playersReadyForTiebreaker?.size,
              values: match.playersReadyForTiebreaker ? Array.from(match.playersReadyForTiebreaker) : null,
              tiedPlayers: match.tiedPlayers?.length
            });
            baseMatch.playersReadyCount = match.playersReadyForTiebreaker?.size || 0;
            baseMatch.playersTotalCount = match.tiedPlayers?.length || 2;
            baseMatch.tiedPlayers = match.tiedPlayers;
            baseMatch.ranking = match.ranking;
            console.log(`[Tournament API] ✅ API retourne: playersReadyCount=${baseMatch.playersReadyCount}, playersTotalCount=${baseMatch.playersTotalCount}`);
          }
          
          return baseMatch;
        });
      
      console.log(`[Tournament API] ✅ ${trainingMatches.length} matchs Training actifs trouvés en mémoire`);
    }
    
    // ✅ FUSIONNER Arena DB + Arena mémoire + Training
    const allActiveMatches = [...enrichedArenaMatches, ...arenaMemoryMatches, ...trainingMatches];
    
    console.log(`[Tournament API] ✅ Total matchs actifs: ${allActiveMatches.length} (Arena DB: ${enrichedArenaMatches.length}, Arena mem: ${arenaMemoryMatches.length}, Training: ${trainingMatches.length})`);
    
    res.json({ success: true, matches: allActiveMatches });
  } catch (error) {
    console.error('[Tournament API] Error fetching active matches:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// RÉSULTATS D'UN MATCH INDIVIDUEL
// ==========================================

/**
 * GET /api/tournament/matches/:matchId/results
 * Récupérer les résultats d'un match (Arena ou Training)
 * Cherche d'abord dans match_results (Arena), puis dans training_results (Training)
 */
router.get('/matches/:matchId/results', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { matchId } = req.params;
    
    // ✅ FIX: Normaliser le matchId — training_sessions.match_id est UUID (sans préfixe "match_")
    const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const rawUuid = matchId.replace(/^match_/, '');
    const matchIdVariants = [matchId];
    if (isValidUuid(rawUuid) && rawUuid !== matchId) matchIdVariants.push(rawUuid);
    
    // 1. Chercher dans training_sessions / training_results (Training) EN PREMIER
    //    Car c'est le cas le plus fréquent pour le mode Entraînement
    let sessions = null;
    for (const variant of matchIdVariants) {
      const { data } = await supabase
        .from('training_sessions')
        .select('id, session_name, completed_at')
        .eq('match_id', variant)
        .order('completed_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) { sessions = data; break; }
    }
    
    if (sessions && sessions.length > 0) {
      const sessionId = sessions[0].id;
      const { data: trainingResults, error: trError } = await supabase
        .from('training_results')
        .select('session_id, student_id, position, score, time_ms, pairs_validated, errors')
        .eq('session_id', sessionId)
        .order('position', { ascending: true });
      
      if (trError) throw trError;
      
      const studentIds = (trainingResults || []).map(r => r.student_id);
      const { data: students } = await supabase
        .from('students')
        .select('id, full_name, first_name, avatar_url')
        .in('id', studentIds.length > 0 ? studentIds : ['__none__']);
      
      const studentsMap = Object.fromEntries((students || []).map(s => [s.id, s]));
      
      const enrichedResults = (trainingResults || []).map(r => ({
        ...r,
        studentName: studentsMap[r.student_id]?.full_name || studentsMap[r.student_id]?.first_name || r.student_id,
        avatar: studentsMap[r.student_id]?.avatar_url || null
      }));
      
      return res.json({ 
        success: true, 
        mode: 'training', 
        sessionName: sessions[0].session_name,
        results: enrichedResults 
      });
    }
    
    // 2. Chercher dans match_results (Arena)
    const { data: arenaResults, error: arenaError } = await supabase
      .from('match_results')
      .select('match_id, student_id, position, score, time_ms, pairs_validated, errors')
      .eq('match_id', matchId)
      .order('position', { ascending: true });
    
    if (arenaError) console.warn('[Tournament API] match_results query error:', arenaError.message);
    
    if (arenaResults && arenaResults.length > 0) {
      const studentIds = arenaResults.map(r => r.student_id);
      const { data: students } = await supabase
        .from('students')
        .select('id, full_name, first_name, avatar_url')
        .in('id', studentIds);
      
      const studentsMap = Object.fromEntries((students || []).map(s => [s.id, s]));
      
      const enrichedResults = arenaResults.map(r => ({
        ...r,
        studentName: studentsMap[r.student_id]?.full_name || studentsMap[r.student_id]?.first_name || r.student_id,
        avatar: studentsMap[r.student_id]?.avatar_url || null
      }));
      
      return res.json({ success: true, mode: 'arena', results: enrichedResults });
    }
    
    // 3. Aucun résultat trouvé
    res.json({ success: true, mode: 'unknown', results: [], message: 'Aucun résultat trouvé pour ce match' });
  } catch (error) {
    console.error('[Tournament API] Error fetching match results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// COMPETITION BRACKET / RÉSULTATS
// ==========================================

/**
 * GET /api/tournament/classes/:classId/competition-results
 * Récupérer tous les groupes, matchs et résultats pour le dashboard compétition
 */
router.get('/classes/:classId/competition-results', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { classId } = req.params;
    
    // 1. Récupérer tous les groupes de la classe
    const { data: groups, error: groupsError } = await supabase
      .from('tournament_groups')
      .select('id, name, student_ids, match_id, status, winner_id, phase_level')
      .eq('class_id', classId)
      .order('created_at', { ascending: true });
    
    if (groupsError) throw groupsError;
    
    // 2. Récupérer tous les matchs associés
    const matchIds = (groups || []).map(g => g.match_id).filter(id => id);
    let matches = [];
    
    if (matchIds.length > 0) {
      const { data: matchesData, error: matchesError } = await supabase
        .from('tournament_matches')
        .select('id, status, room_code, created_at, finished_at, players, winner')
        .in('id', matchIds);
      
      if (matchesError) throw matchesError;
      matches = matchesData || [];
    }
    
    // 3. Récupérer tous les résultats
    let results = [];
    if (matchIds.length > 0) {
      const { data: resultsData, error: resultsError } = await supabase
        .from('match_results')
        .select('match_id, student_id, position, score, time_ms, pairs_validated, errors')
        .in('match_id', matchIds)
        .order('position', { ascending: true });
      
      if (resultsError) throw resultsError;
      results = resultsData || [];
    }
    
    // 4. Récupérer les infos des élèves
    const allStudentIds = new Set();
    (groups || []).forEach(g => {
      const ids = Array.isArray(g.student_ids) ? g.student_ids : JSON.parse(g.student_ids || '[]');
      ids.forEach(id => allStudentIds.add(id));
    });
    
    let students = [];
    if (allStudentIds.size > 0) {
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, full_name, first_name, avatar_url')
        .in('id', Array.from(allStudentIds));
      
      if (studentsError) throw studentsError;
      students = studentsData || [];
    }
    
    const studentsMap = Object.fromEntries(students.map(s => [s.id, s]));
    
    // 5. Enrichir les groupes avec matchs et résultats
    const enrichedGroups = (groups || []).map(group => {
      const match = matches.find(m => m.id === group.match_id);
      const matchResults = results.filter(r => r.match_id === group.match_id);
      const studentIds = Array.isArray(group.student_ids) ? group.student_ids : JSON.parse(group.student_ids || '[]');
      
      // Parse winner from match if available
      let winner = null;
      if (match?.winner) {
        try {
          winner = typeof match.winner === 'string' ? JSON.parse(match.winner) : match.winner;
        } catch {}
      }
      
      return {
        id: group.id,
        name: group.name,
        status: group.status,
        phaseLevel: group.phase_level || 1,
        winnerId: group.winner_id,
        winnerName: group.winner_id ? (studentsMap[group.winner_id]?.full_name || studentsMap[group.winner_id]?.first_name || 'Inconnu') : null,
        students: studentIds.map(sid => ({
          id: sid,
          name: studentsMap[sid]?.full_name || studentsMap[sid]?.first_name || sid,
          avatarUrl: studentsMap[sid]?.avatar_url || null
        })),
        match: match ? {
          id: match.id,
          status: match.status,
          roomCode: match.room_code,
          createdAt: match.created_at,
          finishedAt: match.finished_at,
          winner
        } : null,
        results: matchResults.map(r => ({
          studentId: r.student_id,
          studentName: studentsMap[r.student_id]?.full_name || studentsMap[r.student_id]?.first_name || r.student_id,
          position: r.position,
          score: r.score,
          timeMs: r.time_ms,
          pairsValidated: r.pairs_validated,
          errors: r.errors
        }))
      };
    });
    
    // 6. Classement général (agréger les résultats de tous les matchs)
    const playerStats = {};
    results.forEach(r => {
      if (!playerStats[r.student_id]) {
        playerStats[r.student_id] = {
          studentId: r.student_id,
          name: studentsMap[r.student_id]?.full_name || studentsMap[r.student_id]?.first_name || r.student_id,
          avatarUrl: studentsMap[r.student_id]?.avatar_url || null,
          totalScore: 0,
          matchesPlayed: 0,
          matchesWon: 0,
          totalPairs: 0,
          totalErrors: 0,
          bestPosition: 999
        };
      }
      const ps = playerStats[r.student_id];
      ps.totalScore += r.score || 0;
      ps.matchesPlayed += 1;
      ps.totalPairs += r.pairs_validated || 0;
      ps.totalErrors += r.errors || 0;
      if (r.position < ps.bestPosition) ps.bestPosition = r.position;
      if (r.position === 1) ps.matchesWon += 1;
    });
    
    const overallRanking = Object.values(playerStats)
      .sort((a, b) => {
        if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.totalErrors - b.totalErrors;
      })
      .map((p, idx) => ({ ...p, rank: idx + 1 }));
    
    res.json({
      success: true,
      groups: enrichedGroups,
      overallRanking,
      stats: {
        totalGroups: enrichedGroups.length,
        finishedMatches: enrichedGroups.filter(g => g.match?.status === 'finished').length,
        pendingMatches: enrichedGroups.filter(g => !g.match || g.match.status === 'pending').length,
        playingMatches: enrichedGroups.filter(g => g.match?.status === 'playing').length,
        totalPlayers: allStudentIds.size
      }
    });
  } catch (error) {
    console.error('[Tournament API] Error fetching competition results:', error);
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

// ==========================================
// PERFORMANCE GLOBALE CLASSE (pour le prof)
// ==========================================

/**
 * GET /api/tournament/classes/:classId/students-performance
 * Récupérer les stats de performance de TOUS les élèves d'une classe
 * Utilisé par le prof pour constituer des groupes équilibrés
 */
router.get('/classes/:classId/students-performance', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { classId } = req.params;
    
    // 1. Récupérer les élèves de la classe
    const { data: students, error: studErr } = await supabase
      .from('students')
      .select('id, full_name, first_name, avatar_url')
      .eq('class_id', classId);
    
    if (studErr) throw studErr;
    if (!students || students.length === 0) {
      return res.json({ success: true, students: [] });
    }
    
    const studentIds = students.map(s => s.id);
    
    // 2. Résoudre les IDs non-UUID vers auth UUIDs
    const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const nonUuidIds = studentIds.filter(id => !isValidUuid(id));
    const uuidIds = studentIds.filter(isValidUuid);
    
    const idToAuthMap = {};
    const authToIdMap = {};
    if (nonUuidIds.length > 0) {
      const { data: mappings } = await supabase
        .from('user_student_mapping')
        .select('student_id, user_id')
        .in('student_id', nonUuidIds)
        .eq('active', true);
      
      for (const m of (mappings || [])) {
        idToAuthMap[m.student_id] = m.user_id;
        authToIdMap[m.user_id] = m.student_id;
        uuidIds.push(m.user_id);
      }
    }
    
    const allAuthIds = [...new Set(uuidIds)];
    
    // 3. Récupérer tous les training_results en une seule requête
    let trainingResults = [];
    if (allAuthIds.length > 0) {
      const { data: tr } = await supabase
        .from('training_results')
        .select('student_id, position, score, time_ms, pairs_validated, errors, created_at')
        .in('student_id', allAuthIds)
        .order('created_at', { ascending: false });
      trainingResults = tr || [];
    }
    
    // 4. Récupérer les match_results (Arena) aussi
    let arenaResults = [];
    if (allAuthIds.length > 0) {
      const { data: ar } = await supabase
        .from('match_results')
        .select('student_id, position, score, time_ms, pairs_validated, errors, created_at')
        .in('student_id', allAuthIds)
        .order('created_at', { ascending: false });
      arenaResults = ar || [];
    }
    
    // 5. Calculer les stats par élève
    const statsMap = {};
    
    // Initialiser tous les élèves
    for (const s of students) {
      statsMap[s.id] = {
        studentId: s.id,
        name: s.full_name || s.first_name || s.id,
        avatar: s.avatar_url || null,
        totalMatches: 0,
        competitiveMatches: 0,
        wins: 0,
        avgScore: 0,
        totalScore: 0,
        avgPairs: 0,
        totalPairs: 0,
        totalErrors: 0,
        accuracy: 0,
        avgSpeed: 0,
        level: null, // Débutant, Intermédiaire, Avancé, Expert
        levelScore: 0 // Score numérique pour le tri
      };
    }
    
    // Helper: trouver l'ID original d'un auth UUID
    const getOrigId = (authId) => authToIdMap[authId] || authId;
    
    // Agréger training_results
    for (const r of trainingResults) {
      const origId = getOrigId(r.student_id);
      const stat = statsMap[origId];
      if (!stat) continue;
      stat.totalMatches++;
      if (r.position !== null && r.position !== undefined) {
        stat.competitiveMatches++;
        if (r.position === 1) stat.wins++;
      }
      stat.totalScore += r.score || 0;
      stat.totalPairs += r.pairs_validated || 0;
      stat.totalErrors += r.errors || 0;
    }
    
    // Agréger arena results
    for (const r of arenaResults) {
      const origId = getOrigId(r.student_id);
      const stat = statsMap[origId];
      if (!stat) continue;
      stat.totalMatches++;
      stat.competitiveMatches++;
      if (r.position === 1) stat.wins++;
      stat.totalScore += r.score || 0;
      stat.totalPairs += r.pairs_validated || 0;
      stat.totalErrors += r.errors || 0;
    }
    
    // Calculer moyennes et niveau
    for (const stat of Object.values(statsMap)) {
      if (stat.totalMatches > 0) {
        stat.avgScore = Math.round(stat.totalScore / stat.totalMatches);
        stat.avgPairs = Math.round((stat.totalPairs / stat.totalMatches) * 10) / 10;
        stat.accuracy = stat.totalPairs > 0
          ? Math.round((stat.totalPairs / (stat.totalPairs + stat.totalErrors)) * 100)
          : 0;
        stat.winRate = stat.competitiveMatches > 0
          ? Math.round((stat.wins / stat.competitiveMatches) * 100)
          : 0;
      }
      
      // Calcul du score de niveau composite
      // Pondération: score moyen (40%) + précision (30%) + taux victoire (30%)
      stat.levelScore = Math.round(
        (stat.avgScore * 0.4) +
        (stat.accuracy * 0.3) +
        ((stat.winRate || 0) * 0.3)
      );
      
      // Attribution du niveau
      if (stat.totalMatches === 0) {
        stat.level = 'Nouveau';
      } else if (stat.levelScore >= 70) {
        stat.level = 'Expert';
      } else if (stat.levelScore >= 45) {
        stat.level = 'Avancé';
      } else if (stat.levelScore >= 25) {
        stat.level = 'Intermédiaire';
      } else {
        stat.level = 'Débutant';
      }
    }
    
    // 6. Trier par levelScore décroissant
    const sortedStudents = Object.values(statsMap).sort((a, b) => b.levelScore - a.levelScore);
    
    res.json({ success: true, students: sortedStudents });
  } catch (error) {
    console.error('[Tournament API] Error fetching class performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// DASHBOARD PERFORMANCE ÉLÈVE
// ==========================================

/**
 * GET /api/tournament/students/:studentId/info
 * Retourne le nom d'un élève (pour la vue prof)
 */
router.get('/students/:studentId/info', requireSupabase, requireAuth, ...validateParamStudentId, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { data } = await supabase
      .from('students')
      .select('id, full_name, first_name, avatar_url')
      .eq('id', studentId)
      .single();
    if (data) {
      return res.json({ success: true, name: data.full_name || data.first_name || studentId, avatar: data.avatar_url });
    }
    // Fallback: chercher via user_student_mapping
    const { data: mapping } = await supabase
      .from('user_student_mapping')
      .select('student_id')
      .eq('user_id', studentId)
      .eq('active', true)
      .single();
    if (mapping?.student_id) {
      const { data: s2 } = await supabase.from('students').select('full_name, first_name, avatar_url').eq('id', mapping.student_id).single();
      if (s2) return res.json({ success: true, name: s2.full_name || s2.first_name || mapping.student_id, avatar: s2.avatar_url });
    }
    res.json({ success: true, name: studentId, avatar: null });
  } catch (error) {
    res.json({ success: true, name: req.params.studentId, avatar: null });
  }
});

/**
 * GET /api/tournament/students/:studentId/performance
 * Retourne l'historique complet et les stats agrégées d'un élève
 */
router.get('/students/:studentId/performance', requireSupabase, requireAuth, ...validateParamStudentId, async (req, res) => {
  try {
    const { studentId } = req.params;
    console.log('[Performance API] Fetching performance for studentId:', studentId);

    // 0. Résoudre TOUS les IDs possibles pour cet élève (non-UUID → auth UUID et vice-versa)
    const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const allIds = [studentId]; // Commencer avec l'ID fourni
    
    if (!isValidUuid(studentId)) {
      // studentId est non-UUID (ex: 's002') → chercher l'auth UUID via user_student_mapping
      try {
        const { data: mapping } = await supabase
          .from('user_student_mapping')
          .select('user_id')
          .eq('student_id', studentId)
          .eq('active', true)
          .single();
        if (mapping?.user_id) {
          allIds.push(mapping.user_id);
          console.log('[Performance API] Mapped', studentId, '→ auth UUID:', mapping.user_id);
        }
      } catch (e) {
        console.warn('[Performance API] user_student_mapping lookup failed:', e.message);
      }
    } else {
      // studentId est déjà un UUID → chercher le student_id associé (pour match_results qui pourrait stocker 's002')
      try {
        const { data: mapping } = await supabase
          .from('user_student_mapping')
          .select('student_id')
          .eq('user_id', studentId)
          .eq('active', true)
          .single();
        if (mapping?.student_id && !allIds.includes(mapping.student_id)) {
          allIds.push(mapping.student_id);
          console.log('[Performance API] Reverse mapped', studentId, '→ student_id:', mapping.student_id);
        }
      } catch (e) { /* best-effort */ }
    }
    
    // Séparer IDs UUID et non-UUID pour les requêtes
    const uuidIds = allIds.filter(isValidUuid);
    const allIdsForText = allIds; // Pour les tables avec colonnes TEXT
    console.log('[Performance API] Query IDs - UUID:', uuidIds, 'All:', allIdsForText);

    // 1. Récupérer les résultats Arena/Tournoi (match_results) — student_id peut être TEXT
    let arenaResults = [];
    try {
      const { data: aResults, error: arenaError } = await supabase
        .from('match_results')
        .select('id, match_id, position, score, time_ms, pairs_validated, errors, created_at')
        .in('student_id', allIdsForText)
        .order('created_at', { ascending: true });

      if (!arenaError && aResults) {
        arenaResults = aResults;
        console.log('[Performance API] match_results:', aResults.length, 'rows');
      } else if (arenaError) {
        console.warn('[Performance API] match_results query failed:', arenaError.message);
      }
    } catch (e) {
      console.warn('[Performance API] match_results query exception:', e.message);
    }

    // 1b. Récupérer les résultats Training (training_results) — student_id est UUID
    let trainingResults = [];
    if (uuidIds.length === 0) {
      console.warn('[Performance API] No UUID IDs available for training_results query, skipping');
    }
    try {
      const queryIds = uuidIds.length > 0 ? uuidIds : allIds;
      const { data: tResults, error: tError } = await supabase
        .from('training_results')
        .select('id, session_id, position, score, time_ms, pairs_validated, errors, created_at')
        .in('student_id', queryIds)
        .order('created_at', { ascending: true });
      
      if (!tError && tResults && tResults.length > 0) {
        // Joindre avec training_sessions pour déterminer le mode (solo vs compétitif)
        const sessionIds = [...new Set(tResults.map(r => r.session_id).filter(Boolean))];
        let sessionsMap = {};
        if (sessionIds.length > 0) {
          const { data: sessions } = await supabase
            .from('training_sessions')
            .select('id, class_id, config')
            .in('id', sessionIds);
          (sessions || []).forEach(s => { sessionsMap[s.id] = s; });
        }
        
        trainingResults = tResults.map(r => {
          const session = sessionsMap[r.session_id] || {};
          const configMode = session.config?.mode || null;
          const isSolo = session.class_id === 'solo' || configMode === 'solo' || r.position === null;
          return {
            ...r,
            match_id: r.session_id,
            mode: isSolo ? 'solo' : 'training'
          };
        });
        console.log('[Performance API] training_results:', tResults.length, 'rows (solo:', trainingResults.filter(r => r.mode === 'solo').length, ', compétitif:', trainingResults.filter(r => r.mode === 'training').length, ')');
      } else if (tError) {
        console.warn('[Performance API] training_results query failed:', tError.message);
      }
    } catch (e) {
      console.warn('[Performance API] training_results query exception:', e.message);
    }
    
    console.log('[Performance API] Total: arena=', arenaResults.length, 'training=', trainingResults.length);

    // 1c. Fusionner et trier par date
    const results = [...(arenaResults || []).map(r => ({ ...r, mode: 'arena' })), ...trainingResults]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (!results || results.length === 0) {
      return res.json({
        success: true,
        studentId,
        stats: { totalMatches: 0, competitiveMatches: 0, soloMatches: 0, totalWins: 0, winRate: 0, avgScore: 0, bestScore: 0, avgTime: 0, bestTime: 0, avgPairs: 0, totalPairs: 0, avgErrors: 0, totalErrors: 0, avgSpeed: 0, bestSpeed: 0, accuracy: 0, soloBestScore: 0, soloAvgScore: 0, soloBestSpeed: 0 },
        history: [],
        progression: [],
        streaks: { currentWin: 0, bestWin: 0 }
      });
    }

    // 2. Récupérer les matchs Arena pour enrichissement (type, date)
    const arenaMatchIds = results.filter(r => r.mode === 'arena').map(r => r.match_id).filter(Boolean);
    let matchesMap = {};
    if (arenaMatchIds.length > 0) {
      const { data: matches } = await supabase
        .from('tournament_matches')
        .select('id, status, room_code, created_at, finished_at, mode')
        .in('id', arenaMatchIds);
      (matches || []).forEach(m => { matchesMap[m.id] = m; });
    }

    // 3. Calculer les stats (séparer solo et compétitif)
    const competitiveResults = results.filter(r => r.mode !== 'solo');
    const soloResults = results.filter(r => r.mode === 'solo');
    const totalMatches = results.length;
    const competitiveMatches = competitiveResults.length;
    const wins = competitiveResults.filter(r => r.position === 1).length;
    const scores = results.map(r => r.score || 0);
    const times = results.map(r => r.time_ms || 0).filter(t => t > 0);
    const pairs = results.map(r => r.pairs_validated || 0);
    const errors = results.map(r => r.errors || 0);

    // Vitesse = paires par minute (seuil minimum 30s pour éviter les valeurs aberrantes / abandons précoces)
    const MIN_TIME_MS = 30000; // 30 secondes minimum pour un calcul de vitesse fiable
    const speeds = results.map(r => {
      if (!r.time_ms || r.time_ms < MIN_TIME_MS || !r.pairs_validated) return 0;
      return (r.pairs_validated / (r.time_ms / 60000));
    }).filter(s => s > 0);

    // Stats solo spécifiques (records)
    const soloScores = soloResults.map(r => r.score || 0);
    const soloSpeeds = soloResults.map(r => {
      if (!r.time_ms || r.time_ms < MIN_TIME_MS || !r.pairs_validated) return 0;
      return (r.pairs_validated / (r.time_ms / 60000));
    }).filter(s => s > 0);

    const sum = arr => arr.reduce((a, b) => a + b, 0);
    const avg = arr => arr.length > 0 ? sum(arr) / arr.length : 0;

    const stats = {
      totalMatches,
      competitiveMatches,
      soloMatches: soloResults.length,
      totalWins: wins,
      winRate: competitiveMatches > 0 ? Math.round((wins / competitiveMatches) * 100) : 0,
      avgScore: Math.round(avg(scores)),
      bestScore: Math.max(...scores, 0),
      avgTime: Math.round(avg(times)),
      bestTime: times.length > 0 ? Math.min(...times) : 0,
      avgPairs: Math.round(avg(pairs) * 10) / 10,
      totalPairs: sum(pairs),
      avgErrors: Math.round(avg(errors) * 10) / 10,
      totalErrors: sum(errors),
      avgSpeed: Math.round(avg(speeds) * 10) / 10,
      bestSpeed: speeds.length > 0 ? Math.round(Math.max(...speeds) * 10) / 10 : 0,
      accuracy: sum(pairs) > 0 ? Math.round((sum(pairs) / (sum(pairs) + sum(errors))) * 100) : 0,
      soloBestScore: soloScores.length > 0 ? Math.max(...soloScores) : 0,
      soloAvgScore: Math.round(avg(soloScores)),
      soloBestSpeed: soloSpeeds.length > 0 ? Math.round(Math.max(...soloSpeeds) * 10) / 10 : 0
    };

    // 4. Historique enrichi
    const history = results.map((r, idx) => {
      const match = matchesMap[r.match_id] || {};
      return {
        id: r.id,
        matchId: r.match_id,
        date: r.created_at,
        position: r.position,
        score: r.score || 0,
        timeMs: r.time_ms || 0,
        pairsValidated: r.pairs_validated || 0,
        errors: r.errors || 0,
        speed: r.time_ms >= MIN_TIME_MS && r.pairs_validated > 0 ? Math.round((r.pairs_validated / (r.time_ms / 60000)) * 10) / 10 : 0,
        mode: r.mode || match.mode || 'arena',
        roomCode: match.room_code || null,
        isWin: r.mode !== 'solo' && r.position === 1
      };
    });

    // 5. Données de progression (moyennes glissantes sur les 5 derniers matchs)
    const progression = [];
    for (let i = 0; i < results.length; i++) {
      const windowSize = Math.min(5, i + 1);
      const window = results.slice(Math.max(0, i - windowSize + 1), i + 1);
      const windowScores = window.map(r => r.score || 0);
      const windowErrors = window.map(r => r.errors || 0);
      const windowPairs = window.map(r => r.pairs_validated || 0);
      const windowSpeeds = window.map(r => {
        if (!r.time_ms || r.time_ms < MIN_TIME_MS || !r.pairs_validated) return 0;
        return r.pairs_validated / (r.time_ms / 60000);
      });

      progression.push({
        index: i + 1,
        date: results[i].created_at,
        score: results[i].score || 0,
        avgScore: Math.round(avg(windowScores)),
        errors: results[i].errors || 0,
        avgErrors: Math.round(avg(windowErrors) * 10) / 10,
        pairs: results[i].pairs_validated || 0,
        avgPairs: Math.round(avg(windowPairs) * 10) / 10,
        speed: windowSpeeds[windowSpeeds.length - 1] > 0 ? Math.round(windowSpeeds[windowSpeeds.length - 1] * 10) / 10 : 0,
        avgSpeed: Math.round(avg(windowSpeeds.filter(s => s > 0)) * 10) / 10,
        isWin: results[i].mode !== 'solo' && results[i].position === 1
      });
    }

    // 6. Séries de victoires (compétitif uniquement, le solo n'a pas de victoires)
    let currentWinStreak = 0;
    let bestWinStreak = 0;
    let tempStreak = 0;
    for (const r of competitiveResults) {
      if (r.position === 1) {
        tempStreak++;
        if (tempStreak > bestWinStreak) bestWinStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }
    // Current streak from the end
    for (let i = competitiveResults.length - 1; i >= 0; i--) {
      if (competitiveResults[i].position === 1) currentWinStreak++;
      else break;
    }

    // 7. Analyse de maîtrise par thème (depuis table attempts - mode Solo)
    let themeMastery = [];
    let soloSessionsCount = 0;
    try {
      // Mapper student_id → user_id via user_student_mapping
      let userId = null;
      try {
        const { data: mapping } = await supabase
          .from('user_student_mapping')
          .select('user_id')
          .eq('student_id', studentId)
          .eq('active', true)
          .single();
        if (mapping?.user_id) userId = mapping.user_id;
      } catch {}
      
      // Fallback: studentId peut déjà être le user_id (auth UUID utilisé directement)
      if (!userId) userId = studentId;
      console.log('[Performance API] Theme mastery: userId=', userId, '(from mapping:', userId !== studentId, ')');
      
      {
        // IDs possibles: le UUID résolu ET le studentId original (car user_id est TEXT)
        const possibleIds = [...new Set([userId, studentId].filter(Boolean))];
        console.log('[Performance API] Theme mastery: searching with possibleIds=', possibleIds);
        
        // Compter les sessions Solo
        const { data: soloSessions } = await supabase
          .from('sessions')
          .select('id')
          .in('user_id', possibleIds);
        soloSessionsCount = soloSessions?.length || 0;
        
        // Récupérer toutes les tentatives pour analyse par thème
        const { data: attempts } = await supabase
          .from('attempts')
          .select('theme, level_class, correct, latency_ms, item_type, item_id, objective_key')
          .in('user_id', possibleIds);
        
        if (attempts && attempts.length > 0) {
          // Grouper par thème
          const themeMap = {};
          for (const a of attempts) {
            const theme = a.theme || 'autre';
            if (!themeMap[theme]) {
              themeMap[theme] = { total: 0, correct: 0, totalLatency: 0, latencyCount: 0, levels: {}, items: {} };
            }
            themeMap[theme].total++;
            if (a.correct) themeMap[theme].correct++;
            if (a.latency_ms > 0) {
              themeMap[theme].totalLatency += a.latency_ms;
              themeMap[theme].latencyCount++;
            }
            // Par niveau
            const level = a.level_class || 'inconnu';
            if (!themeMap[theme].levels[level]) {
              themeMap[theme].levels[level] = { total: 0, correct: 0 };
            }
            themeMap[theme].levels[level].total++;
            if (a.correct) themeMap[theme].levels[level].correct++;
            // Par item (calcul exact ou association précise)
            const itemKey = a.item_id || '';
            if (itemKey) {
              if (!themeMap[theme].items[itemKey]) {
                themeMap[theme].items[itemKey] = { total: 0, correct: 0, totalLatency: 0, latencyCount: 0 };
              }
              themeMap[theme].items[itemKey].total++;
              if (a.correct) themeMap[theme].items[itemKey].correct++;
              if (a.latency_ms > 0) {
                themeMap[theme].items[itemKey].totalLatency += a.latency_ms;
                themeMap[theme].items[itemKey].latencyCount++;
              }
            }
          }
          
          // Convertir en tableau trié par taux de réussite
          themeMastery = Object.entries(themeMap).map(([theme, data]) => ({
            theme,
            total: data.total,
            correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            avgLatencyMs: data.latencyCount > 0 ? Math.round(data.totalLatency / data.latencyCount) : 0,
            levels: Object.entries(data.levels).map(([level, ldata]) => ({
              level,
              total: ldata.total,
              correct: ldata.correct,
              accuracy: ldata.total > 0 ? Math.round((ldata.correct / ldata.total) * 100) : 0
            })).sort((a, b) => a.accuracy - b.accuracy),
            items: Object.entries(data.items).map(([item, idata]) => ({
              item,
              total: idata.total,
              correct: idata.correct,
              accuracy: idata.total > 0 ? Math.round((idata.correct / idata.total) * 100) : 0,
              avgLatencyMs: idata.latencyCount > 0 ? Math.round(idata.totalLatency / idata.latencyCount) : 0
            })).sort((a, b) => a.accuracy - b.accuracy)
          })).sort((a, b) => a.accuracy - b.accuracy);

          // Enrichir chaque thème avec expectedItems et coveragePct par niveau
          for (const t of themeMastery) {
            // Déterminer le niveau le plus élevé joué pour ce thème
            let maxLevelIdx = -1;
            for (const l of (t.levels || [])) {
              const idx = LEVEL_ORDER.indexOf(l.level);
              if (idx > maxLevelIdx) maxLevelIdx = idx;
            }
            const studentLevel = maxLevelIdx >= 0 ? LEVEL_ORDER[maxLevelIdx] : null;
            t.studentLevel = studentLevel;

            const expected = getExpectedItemsForTheme(t.theme, studentLevel);
            t.expectedItems = expected || t.items.length;
            const masteredItems = (t.items || []).filter(i => i.accuracy >= 80).length;
            t.uniqueItemsMastered = masteredItems;
            t.coveragePct = t.expectedItems > 0 ? Math.round((masteredItems / t.expectedItems) * 100) : 0;
          }
        }
      }
    } catch (e) {
      console.warn('[Tournament API] Theme mastery query failed:', e.message);
    }

    // Ajouter sessions solo aux stats
    stats.soloSessions = soloSessionsCount;

    // 8. Charger les badges de maîtrise (Bronze/Argent/Or) depuis mastery_progress
    let masteryBadges = null;
    try {
      const possibleIds = [...new Set([userId || studentId, studentId].filter(Boolean))];
      for (const uid of possibleIds) {
        const { data: mp } = await supabase
          .from('mastery_progress')
          .select('progress, updated_at')
          .eq('user_id', uid)
          .single();
        if (mp?.progress) {
          masteryBadges = mp.progress;
          break;
        }
      }
    } catch (e) {
      console.warn('[Tournament API] mastery_progress query failed:', e.message);
    }

    res.json({
      success: true,
      studentId,
      stats,
      history,
      progression,
      streaks: { currentWin: currentWinStreak, bestWin: bestWinStreak },
      themeMastery,
      masteryBadges
    });

  } catch (error) {
    console.error('[Tournament API] Error fetching student performance:', error);
    res.status(500).json({ success: false, error: error.message || 'Erreur serveur' });
  }
});

// ==========================================
// ENVOI PDF RÉSULTATS PAR EMAIL
// ==========================================

/**
 * POST /api/tournament/phases/:phaseId/send-results
 * Génère un PDF avec le classement de la phase et l'envoie par email
 * Body: { recipientEmail, recipientName? }
 */
router.post('/phases/:phaseId/send-results', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { phaseId } = req.params;
    const { recipientEmail, recipientName } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Email du destinataire requis' });
    }

    // Vérifier config Gmail
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
      return res.status(500).json({ success: false, error: 'Configuration email non définie sur le serveur (GMAIL_USER / GMAIL_APP_PASSWORD)' });
    }

    // 1. Récupérer la phase
    const { data: phase, error: phaseError } = await supabase
      .from('tournament_phases')
      .select('*')
      .eq('id', phaseId)
      .single();

    if (phaseError || !phase) {
      return res.status(404).json({ success: false, error: 'Phase non trouvée' });
    }

    const phaseName = PHASE_NAMES[phase.level] || `Phase ${phase.level}`;

    // 2. Récupérer les groupes de cette phase
    const { data: groups, error: groupsError } = await supabase
      .from('tournament_groups')
      .select('id, name, student_ids, match_id, status, winner_id')
      .eq('tournament_id', phase.tournament_id)
      .eq('phase_level', phase.level)
      .order('created_at', { ascending: true });

    if (groupsError) throw groupsError;

    // 3. Récupérer les matchs
    const matchIds = (groups || []).map(g => g.match_id).filter(Boolean);
    let matches = [];
    if (matchIds.length > 0) {
      const { data: m } = await supabase
        .from('tournament_matches')
        .select('id, status, room_code, finished_at')
        .in('id', matchIds);
      matches = m || [];
    }

    // 4. Récupérer les résultats
    let results = [];
    if (matchIds.length > 0) {
      const { data: r } = await supabase
        .from('match_results')
        .select('*')
        .in('match_id', matchIds)
        .order('rank', { ascending: true });
      results = r || [];
    }

    // 5. Récupérer les noms des élèves
    const allStudentIds = new Set();
    (groups || []).forEach(g => {
      try {
        const ids = typeof g.student_ids === 'string' ? JSON.parse(g.student_ids) : (g.student_ids || []);
        ids.forEach(id => allStudentIds.add(id));
      } catch {}
    });

    const studentsMap = {};
    if (allStudentIds.size > 0) {
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, full_name')
        .in('id', Array.from(allStudentIds));
      (students || []).forEach(s => { studentsMap[s.id] = s; });
    }

    // 6. Récupérer le tournoi
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('name')
      .eq('id', phase.tournament_id)
      .single();

    const tournamentName = tournament?.name || 'Tournoi Crazy Chrono';

    // 7. Construire le classement général de la phase
    const playerStats = {};
    results.forEach(r => {
      const sid = r.student_id;
      if (!playerStats[sid]) {
        playerStats[sid] = {
          name: studentsMap[sid]?.full_name || studentsMap[sid]?.first_name || sid,
          totalScore: 0, totalPairs: 0, totalErrors: 0, matchesPlayed: 0, matchesWon: 0, bestTime: null
        };
      }
      playerStats[sid].totalScore += (r.score || 0);
      playerStats[sid].totalPairs += (r.pairs_validated || 0);
      playerStats[sid].totalErrors += (r.errors || 0);
      playerStats[sid].matchesPlayed += 1;
      if (r.rank === 1) playerStats[sid].matchesWon += 1;
      if (r.time_ms && (!playerStats[sid].bestTime || r.time_ms < playerStats[sid].bestTime)) {
        playerStats[sid].bestTime = r.time_ms;
      }
    });

    const ranking = Object.entries(playerStats)
      .map(([id, stats]) => ({ studentId: id, ...stats }))
      .sort((a, b) => b.matchesWon - a.matchesWon || b.totalScore - a.totalScore);

    // 8. Générer le PDF
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ---- En-tête ----
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#1e293b')
        .text(tournamentName, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(16).fillColor('#3b82f6')
        .text(`${phaseName}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text(`Résultats générés le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, { align: 'center' });
      doc.moveDown(0.5);

      // Ligne séparatrice
      doc.strokeColor('#e2e8f0').lineWidth(1)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.8);

      // ---- Statistiques ----
      const totalGroups = (groups || []).length;
      const finishedGroups = (groups || []).filter(g => g.status === 'completed' || g.status === 'finished').length;
      const totalPlayers = allStudentIds.size;

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b')
        .text('Résumé', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#475569');
      doc.text(`Groupes: ${totalGroups} (${finishedGroups} terminés)    |    Joueurs: ${totalPlayers}    |    Phase: ${phase.level}/4 - ${phase.status === 'finished' ? 'Terminée' : phase.status === 'active' ? 'En cours' : 'En attente'}`);
      doc.moveDown(0.8);

      // ---- Classement Général ----
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e293b')
        .text('Classement Général', { align: 'center' });
      doc.moveDown(0.5);

      if (ranking.length > 0) {
        // Table header
        const tableTop = doc.y;
        const colX = { rank: 55, name: 90, wins: 260, score: 330, pairs: 400, errors: 455, time: 500 };

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
        doc.rect(50, tableTop - 4, 495, 20).fill('#1e293b');
        doc.fillColor('#fff');
        doc.text('#', colX.rank, tableTop, { width: 30 });
        doc.text('Joueur', colX.name, tableTop, { width: 160 });
        doc.text('Victoires', colX.wins, tableTop, { width: 60, align: 'center' });
        doc.text('Score', colX.score, tableTop, { width: 60, align: 'center' });
        doc.text('Paires', colX.pairs, tableTop, { width: 50, align: 'center' });
        doc.text('Erreurs', colX.errors, tableTop, { width: 45, align: 'center' });

        let rowY = tableTop + 22;
        const medals = ['🥇', '🥈', '🥉'];

        ranking.forEach((player, idx) => {
          if (rowY > 720) {
            doc.addPage();
            rowY = 60;
          }

          const bgColor = idx === 0 ? '#fffbeb' : idx === 1 ? '#f0f9ff' : idx === 2 ? '#fdf4ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc');
          doc.rect(50, rowY - 4, 495, 18).fill(bgColor);

          doc.fontSize(9).font(idx < 3 ? 'Helvetica-Bold' : 'Helvetica').fillColor('#1e293b');
          doc.text(`${idx + 1}`, colX.rank, rowY, { width: 30 });
          doc.text(player.name, colX.name, rowY, { width: 160 });
          doc.fillColor(player.matchesWon > 0 ? '#059669' : '#94a3b8')
            .text(`${player.matchesWon}`, colX.wins, rowY, { width: 60, align: 'center' });
          doc.fillColor('#3b82f6')
            .text(`${player.totalScore}`, colX.score, rowY, { width: 60, align: 'center' });
          doc.fillColor('#475569')
            .text(`${player.totalPairs}`, colX.pairs, rowY, { width: 50, align: 'center' });
          doc.fillColor(player.totalErrors > 0 ? '#dc2626' : '#059669')
            .text(`${player.totalErrors}`, colX.errors, rowY, { width: 45, align: 'center' });

          rowY += 20;
        });

        doc.y = rowY + 10;
      } else {
        doc.fontSize(10).font('Helvetica').fillColor('#94a3b8')
          .text('Aucun résultat disponible pour cette phase.', { align: 'center' });
      }

      // ---- Détails par groupe ----
      doc.moveDown(1);
      if (doc.y > 650) doc.addPage();

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e293b')
        .text('Détails par Groupe', { align: 'center' });
      doc.moveDown(0.5);

      (groups || []).forEach((group, gi) => {
        if (doc.y > 680) doc.addPage();

        const match = matches.find(m => m.id === group.match_id);
        const groupResults = results.filter(r => r.match_id === group.match_id).sort((a, b) => (a.rank || 99) - (b.rank || 99));
        let studentIds = [];
        try { studentIds = typeof group.student_ids === 'string' ? JSON.parse(group.student_ids) : (group.student_ids || []); } catch {}

        const winnerName = group.winner_id ? (studentsMap[group.winner_id]?.full_name || studentsMap[group.winner_id]?.first_name || '?') : null;

        // Group header
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b')
          .text(`${group.name}`, 55);
        doc.fontSize(9).font('Helvetica').fillColor('#64748b')
          .text(`${studentIds.length} joueurs | Statut: ${match?.status || 'non lancé'}${winnerName ? ` | Gagnant: ${winnerName}` : ''}`, 55);
        doc.moveDown(0.3);

        if (groupResults.length > 0) {
          groupResults.forEach((r, ri) => {
            const name = studentsMap[r.student_id]?.full_name || studentsMap[r.student_id]?.first_name || r.student_id;
            const timeStr = r.time_ms ? `${Math.floor(r.time_ms / 1000)}s` : '-';
            doc.fontSize(9).font(ri === 0 ? 'Helvetica-Bold' : 'Helvetica')
              .fillColor(ri === 0 ? '#059669' : '#475569')
              .text(`  ${ri + 1}. ${name} — Score: ${r.score || 0} | Paires: ${r.pairs_validated || 0} | Erreurs: ${r.errors || 0} | Temps: ${timeStr}`, 65);
          });
        } else {
          doc.fontSize(9).font('Helvetica').fillColor('#94a3b8')
            .text('  Résultats non disponibles', 65);
        }
        doc.moveDown(0.6);
      });

      // ---- Pied de page ----
      doc.moveDown(1);
      doc.strokeColor('#e2e8f0').lineWidth(0.5)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.4);
      doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
        .text('Crazy Chrono — Compétition de calcul mental | Généré automatiquement', { align: 'center' });

      doc.end();
    });

    // 9. Envoyer l'email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });

    const fileName = `resultats_${phaseName.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`;

    await transporter.sendMail({
      from: `"Crazy Chrono" <${gmailUser}>`,
      to: recipientEmail,
      subject: `📊 Résultats ${phaseName} — ${tournamentName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1e293b;">🏆 ${tournamentName}</h2>
          <h3 style="color: #3b82f6;">${phaseName} — Résultats</h3>
          <p>Bonjour${recipientName ? ` ${recipientName}` : ''},</p>
          <p>Veuillez trouver ci-joint les résultats de la phase <strong>${phaseName}</strong> du tournoi <strong>${tournamentName}</strong>.</p>
          <ul>
            <li><strong>Groupes:</strong> ${(groups || []).length}</li>
            <li><strong>Joueurs:</strong> ${allStudentIds.size}</li>
            <li><strong>Statut:</strong> ${phase.status === 'finished' ? 'Phase terminée ✅' : 'Phase en cours'}</li>
          </ul>
          ${ranking.length > 0 ? `
            <h4>Top 3:</h4>
            <ol>
              ${ranking.slice(0, 3).map(p => `<li><strong>${p.name}</strong> — ${p.totalScore} pts, ${p.matchesWon} victoire(s)</li>`).join('')}
            </ol>
          ` : ''}
          <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
            Le classement complet est disponible dans le PDF en pièce jointe.<br/>
            — Crazy Chrono, compétition de calcul mental
          </p>
        </div>
      `,
      attachments: [{
        filename: fileName,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    });

    console.log(`[Tournament API] Résultats ${phaseName} envoyés à ${recipientEmail}`);

    res.json({
      success: true,
      message: `Résultats de ${phaseName} envoyés à ${recipientEmail}`
    });

  } catch (error) {
    console.error('[Tournament API] Error sending results:', error);
    res.status(500).json({ success: false, error: error.message || 'Erreur serveur' });
  }
});

module.exports = router;
