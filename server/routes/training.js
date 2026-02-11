const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
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
router.post('/matches', async (req, res) => {
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

router.post('/sessions', requireSupabase, async (req, res) => {
  try {
    const { matchId, classId, teacherId, sessionName, results, config, completedAt } = req.body;
    
    // Construire le payload session (class_id optionnel pour mode multijoueur classique)
    // id auto-généré par Supabase (UUID)
    const sessionPayload = {
      match_id: matchId,
      teacher_id: teacherId || null,
      session_name: sessionName || 'Session',
      config: config || {},
      class_id: classId || null,
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

router.get('/sessions/class/:classId', requireSupabase, async (req, res) => {
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

router.get('/sessions/:sessionId/results', requireSupabase, async (req, res) => {
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

router.get('/stats/student/:studentId', requireSupabase, async (req, res) => {
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

module.exports = router;
