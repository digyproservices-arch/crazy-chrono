const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  console.log('[MatchRounds Routes] Supabase connected');
} else {
  console.warn('[MatchRounds Routes] Supabase not configured');
}

const requireSupabase = (req, res, next) => {
  if (!supabase) return res.status(500).json({ success: false, error: 'Database not configured' });
  next();
};

/**
 * GET /api/match-rounds/:sessionId/rounds
 * Récupère tous les rounds d'une session (cartes jouées)
 */
router.get('/:sessionId/rounds', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data, error } = await supabase
      .from('match_rounds')
      .select('*')
      .eq('session_id', sessionId)
      .order('round_number', { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, rounds: data || [] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/match-rounds/:sessionId/summary
 * Récupère le bilan pédagogique par joueur pour une session
 */
router.get('/:sessionId/summary', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data, error } = await supabase
      .from('match_player_summary')
      .select('*')
      .eq('session_id', sessionId)
      .order('total_score', { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, summaries: data || [] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * PATCH /api/match-rounds/:sessionId/summary/:playerId/notes
 * Mettre à jour les notes du professeur pour un élève
 */
router.patch('/:sessionId/summary/:playerId/notes', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { sessionId, playerId } = req.params;
    const { notes } = req.body;
    if (typeof notes !== 'string') return res.status(400).json({ success: false, error: 'notes (string) requis' });

    const { data, error } = await supabase
      .from('match_player_summary')
      .update({ teacher_notes: notes })
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
      .select('id, teacher_notes');

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, updated: data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/match-rounds/:sessionId/export
 * Exporte les données d'une session (CSV)
 */
router.get('/:sessionId/export', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const format = req.query.format || 'csv';

    // Récupérer session, rounds et summaries
    const [sessionRes, roundsRes, summaryRes] = await Promise.all([
      supabase.from('training_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('match_rounds').select('*').eq('session_id', sessionId).order('round_number'),
      supabase.from('match_player_summary').select('*').eq('session_id', sessionId).order('total_score', { ascending: false })
    ]);

    if (sessionRes.error) return res.status(404).json({ success: false, error: 'Session non trouvée' });

    const session = sessionRes.data;
    const rounds = roundsRes.data || [];
    const summaries = summaryRes.data || [];

    if (format === 'csv') {
      // Générer CSV
      const lines = [];
      lines.push('Session,Date,Mode,Durée');
      lines.push(`"${session.session_name || ''}","${session.completed_at || ''}","${session.config?.mode || ''}","${session.config?.duration || ''}s"`);
      lines.push('');
      lines.push('Joueur,Score,Paires,Erreurs,Temps moyen (ms),Recommandations,Notes prof');
      for (const s of summaries) {
        const recos = (s.recommendations || []).map(r => r.message).join(' | ');
        lines.push(`"${s.display_name}",${s.total_score},${s.total_pairs},${s.total_errors},${s.avg_response_time_ms || ''},${JSON.stringify(recos)},"${(s.teacher_notes || '').replace(/"/g, '""')}"`);
      }
      lines.push('');
      lines.push('Round,Type paire,Thème,Niveau,Gagnant,Temps (ms),Erreurs');
      for (const r of rounds) {
        const content = r.good_pair_content ? `${r.good_pair_content.a} / ${r.good_pair_content.b}` : '';
        lines.push(`${r.round_number},"${r.good_pair_type || ''}","${r.good_pair_theme || ''}","${r.good_pair_level || ''}","${r.winner_display_name || ''}",${r.winner_time_ms || ''},${(r.errors || []).length}`);
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="session_${sessionId.substring(0, 8)}.csv"`);
      res.send('\uFEFF' + lines.join('\n')); // BOM for Excel UTF-8
    } else {
      // JSON export
      res.json({ success: true, session, rounds, summaries });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
