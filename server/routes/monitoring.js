const express = require('express');
const router = express.Router();
const { recordImageUsage, analyzeImageUsage, sendEmailReport } = require('../imageMonitoring');

/**
 * POST /api/monitoring/record-images
 * Enregistre les images utilisées dans une manche
 * Body: { sessionId, userId, roundIndex, zones }
 */
router.post('/record-images', async (req, res) => {
  try {
    const { sessionId, userId, roundIndex, zones } = req.body;
    
    if (!sessionId || roundIndex === undefined || !Array.isArray(zones)) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    await recordImageUsage(sessionId, userId || 'anonymous', roundIndex, zones);
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[Monitoring API] Erreur:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/analyze?theme=botanique&days=7
 * Analyse l'utilisation des images (admin only)
 */
router.get('/analyze', async (req, res) => {
  try {
    // TODO: Vérifier que l'utilisateur est admin
    
    const theme = req.query.theme || 'botanique';
    const days = parseInt(req.query.days) || 7;
    
    const analysis = await analyzeImageUsage(theme, days);
    
    res.json({ ok: true, analysis });
  } catch (error) {
    console.error('[Monitoring API] Erreur analyse:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/monitoring/send-report
 * Génère et envoie un rapport par email (admin only)
 */
router.post('/send-report', async (req, res) => {
  try {
    // TODO: Vérifier que l'utilisateur est admin
    
    const theme = req.body.theme || 'botanique';
    const days = parseInt(req.body.days) || 7;
    const email = req.body.email;
    
    const analysis = await analyzeImageUsage(theme, days);
    const reportPath = await sendEmailReport(analysis, email);
    
    res.json({ ok: true, reportPath });
  } catch (error) {
    console.error('[Monitoring API] Erreur envoi rapport:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
