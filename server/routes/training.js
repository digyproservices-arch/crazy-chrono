const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { validateCreateTrainingMatch, validateTrainingSession, validateParamStudentId } = require('../middleware/validate');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  console.log('[Training Routes] Supabase connected');
} else {
  console.warn('[Training Routes] Supabase not configured');
}

const requireSupabase = (req, res, next) => {
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }
  next();
};

/**
 * POST /api/training/matches
 * Créer un match Training (en mémoire, avec notifications Socket.IO)
 */
router.post('/matches', requireAuth, ...validateCreateTrainingMatch, async (req, res) => {
  try {
    const { studentIds, config, classId, teacherId } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, error: 'studentIds requis' });
    }
    
    const matchId = `match_${uuidv4()}`;
    
    // Créer le match dans CrazyArenaManager (mémoire + Socket.IO)
    if (global.crazyArena) {
      global.crazyArena.createTrainingMatch(matchId, studentIds, config, classId, teacherId);
      console.log(`[Training API] Match créé: ${matchId} pour ${studentIds.length} élèves`);
      
      res.json({ 
        success: true, 
        matchId,
        roomCode: matchId, // Pour Training, matchId = roomCode
        message: 'Match Training créé avec succès'
      });
    } else {
      console.error('[Training API] CrazyArenaManager not available');
      res.status(500).json({ success: false, error: 'Service non disponible' });
    }
  } catch (error) {
    console.error('[Training API] Error creating match:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/sessions', requireSupabase, requireAuth, ...validateTrainingSession, async (req, res) => {
  try {
    const { matchId, classId, teacherId, sessionName, results, config, completedAt } = req.body;
    
    // ── Déduplication : empêcher un double enregistrement pour le même joueur dans les 60s ──
    if (Array.isArray(results) && results.length === 1) {
      const r0 = results[0];
      if (r0.studentId) {
        const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from('training_results')
          .select('id, score, created_at')
          .eq('student_id', r0.studentId)
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(1);
        if (recent && recent.length > 0 && recent[0].score === r0.score) {
          console.warn('[Training API] Duplicate detected, skipping save', { studentId: r0.studentId, score: r0.score, existingId: recent[0].id });
          return res.json({ success: true, deduplicated: true, message: 'Session déjà enregistrée (doublon détecté)' });
        }
      }
    }
    
    // Construire le payload session
    // match_id doit être un UUID valide (la colonne est UUID en production)
    // class_id ne peut pas être null (contrainte NOT NULL en production)
    const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const rawMatchUuid = matchId ? matchId.replace(/^match_/, '') : '';
    const safeMatchId = isValidUuid(rawMatchUuid) ? rawMatchUuid : (isValidUuid(matchId) ? matchId : uuidv4());
    const sessionPayload = {
      match_id: safeMatchId,
      teacher_id: teacherId || null,
      session_name: sessionName || 'Session',
      config: config || {},
      class_id: classId || 'solo',
      completed_at: completedAt,
      created_at: new Date().toISOString()
    };
    
    const { data: session, error: sessionError } = await supabase
      .from('training_sessions')
      .insert(sessionPayload)
      .select()
      .single();
    
    if (sessionError) {
      console.error('[Training API] Session insert error:', sessionError);
      throw sessionError;
    }

    const sessionId = session.id;
    
    for (const result of results) {
      const { error: resultError } = await supabase
        .from('training_results')
        .insert({
          session_id: sessionId,
          student_id: result.studentId,
          position: result.position,
          score: result.score,
          time_ms: result.timeMs,
          pairs_validated: result.pairsValidated || 0,
          errors: result.errors || 0
        });
      
      if (resultError) {
        console.error('[Training API] Result insert error:', resultError);
        throw resultError;
      }
    }
    
    // Mettre à jour les stats cumulées (best-effort, ne bloque pas si la fonction n'existe pas)
    for (const result of results) {
      try {
        await supabase.rpc('update_student_training_stats', {
          p_student_id: result.studentId,
          p_sessions_played: 1,
          p_total_score: result.score,
          p_total_pairs: result.pairsValidated || 0,
          p_best_score: result.score
        });
      } catch (rpcErr) {
        console.warn('[Training API] RPC update_student_training_stats failed:', rpcErr.message);
      }
    }
    
    res.json({ 
      success: true, 
      sessionId,
      message: 'Session entraînement enregistrée avec succès'
    });
  } catch (error) {
    console.error('[Training API] Error saving session:', error);
    console.error('[Training API] Request body was:', JSON.stringify(req.body).slice(0, 500));
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

router.get('/sessions/class/:classId', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { classId } = req.params;
    const { limit = 20 } = req.query;
    
    const { data: sessions, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('class_id', classId)
      .order('completed_at', { ascending: false })
      .limit(parseInt(limit));
    
    if (error) throw error;
    
    res.json({ success: true, sessions: sessions || [] });
  } catch (error) {
    console.error('[Training API] Error fetching sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/sessions/:sessionId/results', requireSupabase, requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const { data: results, error } = await supabase
      .from('training_results')
      .select(`
        *,
        students (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('session_id', sessionId)
      .order('position', { ascending: true });
    
    if (error) throw error;
    
    res.json({ success: true, results: results || [] });
  } catch (error) {
    console.error('[Training API] Error fetching results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats/student/:studentId', requireSupabase, requireAuth, ...validateParamStudentId, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const { data: stats, error } = await supabase
      .from('student_training_stats')
      .select('*')
      .eq('student_id', studentId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    
    res.json({ 
      success: true, 
      stats: stats || {
        student_id: studentId,
        sessions_played: 0,
        total_score: 0,
        total_pairs: 0,
        best_score: 0
      }
    });
  } catch (error) {
    console.error('[Training API] Error fetching student stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/training/records — Best score & paires/min, filtré par config comparable
// PPM cap: 30 paires/min max (1 paire toutes les 2s = déjà surhumain)
// Durée minimum: 30s pour éviter les PPM aberrants sur sessions ultra-courtes
// Query params optionnels pour filtrage comparable:
//   ?mode=solo&duration=60&rounds=3&level=CE1&studentId=xxx
// Si des filtres sont fournis, seules les sessions avec une config identique sont considérées.
// Si aucun résultat comparable n'existe, bestScore=0 et comparable=false.
const PPM_CAP = 30;
const MIN_DURATION_MS = 30000;
router.get('/records', requireSupabase, async (req, res) => {
  try {
    const { studentId: reqStudentId, mode, duration, rounds, level } = req.query;
    const hasFilters = !!(mode || duration || rounds || level);

    // ── Step 1: Si des filtres sont fournis, trouver les session_ids correspondantes ──
    let filteredSessionIds = null; // null = pas de filtre (tout prendre)
    if (hasFilters) {
      let sessionQuery = supabase.from('training_sessions').select('id');
      if (mode) sessionQuery = sessionQuery.filter('config->>mode', 'eq', mode);
      if (duration) sessionQuery = sessionQuery.filter('config->>duration', 'eq', String(duration));
      if (rounds) sessionQuery = sessionQuery.filter('config->>rounds', 'eq', String(rounds));
      // Pour le niveau: on vérifie si config->>selectedLevel correspond OU si config->classes contient le niveau
      // Supabase PostgREST: config->classes @> '["CE1"]' (containment)
      if (level) {
        sessionQuery = sessionQuery.or(`config->>selectedLevel.eq.${level},config->classes.cs.["${level}"]`);
      }
      const { data: sessions } = await sessionQuery.limit(1000);
      filteredSessionIds = (sessions || []).map(s => s.id);
      // Si aucune session comparable trouvée, renvoyer immédiatement
      // Pas de record perso non plus puisqu'aucune session ne correspond à cette config
      if (filteredSessionIds.length === 0) {
        return res.json({ success: true, bestScore: 0, bestPPM: 0, bestStudent: null, myBestScore: 0, myBestPPM: 0, comparable: false });
      }
    }

    // ── Step 2: Best score global (filtré par sessions si applicable) ──
    let resultsQuery = supabase
      .from('training_results')
      .select('student_id, score, pairs_validated, time_ms, created_at')
      .gte('time_ms', MIN_DURATION_MS)
      .order('score', { ascending: false })
      .limit(50);
    if (filteredSessionIds) resultsQuery = resultsQuery.in('session_id', filteredSessionIds);

    const { data: allRows } = await resultsQuery;

    let bestScore = 0, bestPPM = 0, bestStudent = null;
    if (allRows && allRows.length > 0) {
      const top = allRows[0];
      bestScore = top.score || 0;
      bestStudent = top.student_id;
      // Calculer le meilleur PPM parmi tous les résultats
      for (const r of allRows) {
        const dur = (r.time_ms || 0) / 1000;
        if (dur > 0) {
          const ppm = Math.min(PPM_CAP, (r.pairs_validated || r.score || 0) / dur * 60);
          if (ppm > bestPPM) bestPPM = parseFloat(ppm.toFixed(1));
        }
      }
    }

    // ── Step 3: Per-student personal best (filtré par config comme le global) ──
    let myBestScore = 0, myBestPPM = 0;
    if (reqStudentId) {
      try {
        const ids = await resolveStudentIds(reqStudentId);
        let myQuery = supabase
          .from('training_results')
          .select('score, pairs_validated, time_ms')
          .in('student_id', ids)
          .gte('time_ms', MIN_DURATION_MS)
          .order('score', { ascending: false })
          .limit(20);
        if (filteredSessionIds) myQuery = myQuery.in('session_id', filteredSessionIds);
        const { data: myRows } = await myQuery;
        if (myRows && myRows.length > 0) {
          for (const r of myRows) {
            if ((r.score || 0) > myBestScore) myBestScore = r.score;
            const dur = (r.time_ms || 0) / 1000;
            if (dur > 0) {
              const ppm = Math.min(PPM_CAP, (r.pairs_validated || r.score || 0) / dur * 60);
              if (ppm > myBestPPM) myBestPPM = parseFloat(ppm.toFixed(1));
            }
          }
        }
      } catch (e) {
        console.warn('[Training API] Per-student records lookup failed:', e.message);
      }
    }

    return res.json({ success: true, bestScore, bestPPM, bestStudent, myBestScore, myBestPPM, comparable: hasFilters ? (bestScore > 0) : true });
  } catch (error) {
    console.error('[Training API] Error fetching records:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: résoudre les IDs d'un étudiant (UUID ↔ student code)
async function resolveStudentIds(studentId) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId);
  const ids = [studentId];
  try {
    if (!isUuid) {
      const { data: m } = await supabase.from('user_student_mapping').select('user_id').eq('student_id', studentId).eq('active', true).single();
      if (m?.user_id) ids.push(m.user_id);
    } else {
      const { data: m } = await supabase.from('user_student_mapping').select('student_id').eq('user_id', studentId).eq('active', true).single();
      if (m?.student_id && !ids.includes(m.student_id)) ids.push(m.student_id);
    }
  } catch {}
  return ids;
}

module.exports = router;
