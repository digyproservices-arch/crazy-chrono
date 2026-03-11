const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAdminAuth } = require('../middleware/auth');
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
router.get('/analyze', requireAdminAuth, async (req, res) => {
  try {
    
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
router.post('/send-report', requireAdminAuth, async (req, res) => {
  try {
    
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
router.get('/incidents', requireAdminAuth, async (req, res) => {
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
router.delete('/incidents', requireAdminAuth, async (req, res) => {
  try {
    saveIncidents([]);
    res.json({ ok: true, message: 'Incidents cleared' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── Client Diagnostic Forwarding ─────────────────────────
/**
 * POST /api/monitoring/client-diag
 * Receives batched ccAddDiag events from the client and writes them to Winston.
 * Body: { events: [{ label, payload, ts }] }
 */
router.post('/client-diag', (req, res) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events)) return res.status(400).json({ ok: false, error: 'events must be array' });
    const logger = require('../logger');
    const batch = events.slice(0, 50); // cap per request
    for (const evt of batch) {
      const label = evt.label || 'diag';
      const payload = typeof evt.payload === 'object' && evt.payload !== null ? evt.payload : {};
      logger.info(`[Client] ${label}`, { ...payload, source: 'client', ts: evt.ts || new Date().toISOString() });
    }
    res.json({ ok: true, count: batch.length });
  } catch (error) {
    console.error('[ClientDiag] POST error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── E2E Test Screenshots Storage ─────────────────────────
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'data', 'e2e-screenshots');
const MAX_SCREENSHOTS = 50; // Keep last 50 screenshots

function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * POST /api/monitoring/e2e-screenshot
 * Reçoit un screenshot E2E en base64 et le stocke
 * Body: { scenarioName, screenshotName, imageBase64, timestamp, anomalies }
 */
router.post('/e2e-screenshot', async (req, res) => {
  try {
    const { scenarioName, screenshotName, imageBase64, timestamp, anomalies } = req.body;
    if (!imageBase64 || !scenarioName) {
      return res.status(400).json({ ok: false, error: 'missing scenarioName or imageBase64' });
    }

    ensureScreenshotsDir();

    // Nom de fichier unique
    const ts = (timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
    const safeName = (scenarioName + '_' + screenshotName).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const filename = `${ts}_${safeName}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    // Sauvegarder l'image
    const buffer = Buffer.from(imageBase64, 'base64');
    fs.writeFileSync(filepath, buffer);

    // Sauvegarder les métadonnées dans un index JSON
    const indexFile = path.join(SCREENSHOTS_DIR, 'index.json');
    let index = [];
    try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch {}

    index.push({
      filename,
      scenarioName,
      screenshotName,
      timestamp: timestamp || new Date().toISOString(),
      anomalies: anomalies || [],
      size: buffer.length,
    });

    // Garder les derniers MAX_SCREENSHOTS
    if (index.length > MAX_SCREENSHOTS) {
      const toDelete = index.splice(0, index.length - MAX_SCREENSHOTS);
      for (const old of toDelete) {
        try { fs.unlinkSync(path.join(SCREENSHOTS_DIR, old.filename)); } catch {}
      }
    }

    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
    console.log(`[E2E] Screenshot saved: ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
    res.json({ ok: true, filename });
  } catch (error) {
    console.error('[E2E] Screenshot save error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/e2e-screenshots
 * Liste les screenshots E2E disponibles (admin only)
 */
router.get('/e2e-screenshots', requireAdminAuth, async (req, res) => {
  try {
    ensureScreenshotsDir();
    const indexFile = path.join(SCREENSHOTS_DIR, 'index.json');
    let index = [];
    try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch {}
    res.json({ ok: true, screenshots: index.reverse() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/e2e-screenshots/:filename
 * Sert un screenshot E2E (admin only)
 */
router.get('/e2e-screenshots/:filename', requireAdminAuth, async (req, res) => {
  try {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9_.-]/g, '');
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ ok: false, error: 'not found' });
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(filepath);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
