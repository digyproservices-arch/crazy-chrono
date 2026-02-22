const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { recordImageUsage, analyzeImageUsage, sendEmailReport } = require('../imageMonitoring');

// ── Game Incidents Storage ─────────────────────────────────
const INCIDENTS_FILE = path.join(__dirname, '..', 'data', 'game_incidents.json');
const MAX_INCIDENTS = 500;

function ensureDataDir() {
  const dir = path.dirname(INCIDENTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadIncidents() {
  try {
    ensureDataDir();
    if (!fs.existsSync(INCIDENTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(INCIDENTS_FILE, 'utf8'));
  } catch { return []; }
}

function saveIncidents(incidents) {
  try {
    ensureDataDir();
    const trimmed = incidents.slice(-MAX_INCIDENTS);
    fs.writeFileSync(INCIDENTS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    console.error('[Incidents] Save failed:', e.message);
  }
}

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

// ── Game Incidents Endpoints ───────────────────────────────

/**
 * POST /api/monitoring/incidents
 * Enregistre un incident de jeu détecté côté client
 * Body: { incident: { id, type, severity, timestamp, device, details, zonesSnapshot, sessionInfo } }
 */
router.post('/incidents', async (req, res) => {
  try {
    const { incident } = req.body;
    if (!incident || !incident.type) {
      return res.status(400).json({ ok: false, error: 'missing_incident' });
    }

    const incidents = loadIncidents();
    // Éviter les doublons par ID
    if (incident.id && incidents.some(i => i.id === incident.id)) {
      return res.json({ ok: true, duplicate: true });
    }

    incident.receivedAt = new Date().toISOString();
    incidents.push(incident);
    saveIncidents(incidents);

    console.warn(`[Incidents] 🚨 ${incident.severity}: ${incident.type} - ${incident.details?.message || ''}`);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Incidents] POST error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/incidents?severity=critical&limit=100&since=2026-01-01
 * Récupère les incidents sauvegardés (admin only)
 */
router.get('/incidents', async (req, res) => {
  try {
    let incidents = loadIncidents();

    // Filtrer par sévérité
    if (req.query.severity) {
      incidents = incidents.filter(i => i.severity === req.query.severity);
    }
    // Filtrer par type
    if (req.query.type) {
      incidents = incidents.filter(i => i.type === req.query.type);
    }
    // Filtrer par date
    if (req.query.since) {
      const since = new Date(req.query.since).toISOString();
      incidents = incidents.filter(i => (i.timestamp || '') >= since);
    }
    // Limiter
    const limit = parseInt(req.query.limit) || 200;
    incidents = incidents.slice(-limit);

    // Stats
    const stats = {
      total: incidents.length,
      bySeverity: {},
      byType: {},
    };
    for (const inc of incidents) {
      stats.bySeverity[inc.severity] = (stats.bySeverity[inc.severity] || 0) + 1;
      stats.byType[inc.type] = (stats.byType[inc.type] || 0) + 1;
    }

    res.json({ ok: true, incidents: incidents.reverse(), stats });
  } catch (error) {
    console.error('[Incidents] GET error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * DELETE /api/monitoring/incidents
 * Vider les incidents (admin only)
 */
router.delete('/incidents', async (req, res) => {
  try {
    saveIncidents([]);
    res.json({ ok: true, message: 'Incidents cleared' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
