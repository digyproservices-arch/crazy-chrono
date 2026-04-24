const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { requireAuth, requireAdminAuth } = require('../middleware/auth');
const { recordImageUsage, analyzeImageUsage, sendEmailReport } = require('../imageMonitoring');

// ── Game Incidents Storage ─────────────────────────────────
const INCIDENTS_FILE = path.join(__dirname, '..', 'data', 'game_incidents.json');
const MAX_INCIDENTS = 500;

// ── Client Round Logs Storage (synced from client localStorage) ──
const CLIENT_ROUNDS_FILE = path.join(__dirname, '..', 'data', 'client_round_logs.json');
const MAX_CLIENT_ROUNDS = 500;

// ── Client Click Events Storage (PAIR_FAIL / PAIR_OK synced from client) ──
const CLIENT_CLICKS_FILE = path.join(__dirname, '..', 'data', 'client_click_events.json');
const MAX_CLIENT_CLICKS = 1000;

function loadClientClicks() {
  try {
    const dir = path.dirname(CLIENT_CLICKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(CLIENT_CLICKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(CLIENT_CLICKS_FILE, 'utf8'));
  } catch { return []; }
}

function saveClientClicks(clicks) {
  try {
    const dir = path.dirname(CLIENT_CLICKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const trimmed = clicks.slice(-MAX_CLIENT_CLICKS);
    fs.writeFileSync(CLIENT_CLICKS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    logger.error('[ClientClicks] Save failed:', e.message);
  }
}

function loadClientRounds() {
  try {
    const dir = path.dirname(CLIENT_ROUNDS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(CLIENT_ROUNDS_FILE)) return [];
    return JSON.parse(fs.readFileSync(CLIENT_ROUNDS_FILE, 'utf8'));
  } catch { return []; }
}

function saveClientRounds(rounds) {
  try {
    const dir = path.dirname(CLIENT_ROUNDS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const trimmed = rounds.slice(-MAX_CLIENT_ROUNDS);
    fs.writeFileSync(CLIENT_ROUNDS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    logger.error('[ClientRounds] Save failed:', e.message);
  }
}

// ── Arena Round Logs Storage (server-side, pour le monitoring) ──
const ARENA_ROUNDS_FILE = path.join(__dirname, '..', 'data', 'arena_round_logs.json');
const MAX_ARENA_ROUNDS = 200;

function loadArenaRounds() {
  try {
    const dir = path.dirname(ARENA_ROUNDS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(ARENA_ROUNDS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ARENA_ROUNDS_FILE, 'utf8'));
  } catch { return []; }
}

function saveArenaRounds(rounds) {
  try {
    const dir = path.dirname(ARENA_ROUNDS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const trimmed = rounds.slice(-MAX_ARENA_ROUNDS);
    fs.writeFileSync(ARENA_ROUNDS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    logger.error('[ArenaRounds] Save failed:', e.message);
  }
}

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
    logger.error('[Incidents] Save failed:', e.message);
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
    logger.error('[Monitoring API] Erreur:', error);
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
    logger.error('[Monitoring API] Erreur analyse:', error);
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
    logger.error('[Monitoring API] Erreur envoi rapport:', error);
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

    logger.warn(`[Incidents] 🚨 ${incident.severity}: ${incident.type} - ${incident.details?.message || ''}`);
    res.json({ ok: true });
  } catch (error) {
    logger.error('[Incidents] POST error:', error);
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
    logger.error('[Incidents] GET error:', error);
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

// ── Arena Round Logs Endpoints ────────────────────────────

/**
 * GET /api/monitoring/arena-rounds
 * Récupère les manches Arena enregistrées côté serveur
 */
router.get('/arena-rounds', requireAdminAuth, async (req, res) => {
  try {
    const rounds = loadArenaRounds();
    const limit = parseInt(req.query.limit) || 200;
    res.json({ ok: true, rounds: rounds.slice(-limit).reverse(), total: rounds.length });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/monitoring/arena-rounds
 * Enregistre une manche Arena (appelé par le serveur Arena internement)
 * Body: { round }
 */
router.post('/arena-rounds', (req, res) => {
  try {
    const { round } = req.body;
    if (!round) return res.status(400).json({ ok: false, error: 'missing round' });
    const rounds = loadArenaRounds();
    rounds.push({ ...round, receivedAt: new Date().toISOString() });
    saveArenaRounds(rounds);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * DELETE /api/monitoring/arena-rounds
 * Vider les manches Arena
 */
router.delete('/arena-rounds', requireAdminAuth, async (req, res) => {
  try {
    saveArenaRounds([]);
    res.json({ ok: true, message: 'Arena rounds cleared' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── Client Round Logs Endpoints (sync localStorage → serveur) ──

/**
 * POST /api/monitoring/client-rounds
 * Reçoit un batch de round logs depuis le client
 * Body: { rounds: [...] }
 */
router.post('/client-rounds', (req, res) => {
  try {
    const { rounds } = req.body;
    if (!Array.isArray(rounds)) return res.status(400).json({ ok: false, error: 'rounds must be array' });
    const existing = loadClientRounds();
    const existingIds = new Set(existing.map(r => r.id));
    let added = 0;
    for (const r of rounds.slice(0, 50)) {
      if (r.id && !existingIds.has(r.id)) {
        existing.push({ ...r, receivedAt: new Date().toISOString() });
        existingIds.add(r.id);
        added++;
      }
    }
    if (added > 0) saveClientRounds(existing);
    res.json({ ok: true, added, total: existing.length });
  } catch (error) {
    logger.error('[ClientRounds] POST error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/client-rounds
 * Récupère les round logs client synchronisés (admin only)
 */
router.get('/client-rounds', requireAdminAuth, async (req, res) => {
  try {
    const rounds = loadClientRounds();
    const limit = parseInt(req.query.limit) || 200;
    res.json({ ok: true, rounds: rounds.slice(-limit).reverse(), total: rounds.length });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * DELETE /api/monitoring/client-rounds
 * Vider les round logs client (admin only)
 */
router.delete('/client-rounds', requireAdminAuth, async (req, res) => {
  try {
    saveClientRounds([]);
    res.json({ ok: true, message: 'Client rounds cleared' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── Client Click Events Endpoints (sync PAIR_FAIL/PAIR_OK → serveur) ──

/**
 * POST /api/monitoring/client-clicks
 * Reçoit un batch de click events depuis le client (PAIR_FAIL, PAIR_OK, etc.)
 * Body: { clicks: [...] }
 */
router.post('/client-clicks', (req, res) => {
  try {
    const { clicks } = req.body;
    if (!Array.isArray(clicks)) return res.status(400).json({ ok: false, error: 'clicks must be array' });
    const existing = loadClientClicks();
    const existingKeys = new Set(existing.map(c => c._syncId || `${c.ts}_${c.zoneId}`));
    let added = 0;
    for (const c of clicks.slice(0, 100)) {
      const key = c._syncId || `${c.ts}_${c.zoneId}`;
      if (!existingKeys.has(key)) {
        existing.push({ ...c, receivedAt: new Date().toISOString() });
        existingKeys.add(key);
        added++;
      }
    }
    if (added > 0) saveClientClicks(existing);
    if (added > 0) logger.info(`[ClientClicks] +${added} click events reçus (total: ${existing.length})`);
    res.json({ ok: true, added, total: existing.length });
  } catch (error) {
    logger.error('[ClientClicks] POST error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/client-clicks
 * Récupère les click events client synchronisés (admin only)
 */
router.get('/client-clicks', requireAdminAuth, async (req, res) => {
  try {
    let clicks = loadClientClicks();
    if (req.query.stage) clicks = clicks.filter(c => c.stage === req.query.stage);
    const limit = parseInt(req.query.limit) || 200;
    res.json({ ok: true, clicks: clicks.slice(-limit).reverse(), total: clicks.length });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * DELETE /api/monitoring/client-clicks
 * Vider les click events client (admin only)
 */
router.delete('/client-clicks', requireAdminAuth, async (req, res) => {
  try {
    saveClientClicks([]);
    res.json({ ok: true, message: 'Client clicks cleared' });
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
    const batch = events.slice(0, 50); // cap per request
    for (const evt of batch) {
      const label = evt.label || 'diag';
      const payload = typeof evt.payload === 'object' && evt.payload !== null ? evt.payload : {};
      logger.info(`[Client] ${label}`, { ...payload, source: 'client', ts: evt.ts || new Date().toISOString() });
    }
    res.json({ ok: true, count: batch.length });
  } catch (error) {
    logger.error('[ClientDiag] POST error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── Game Trace Storage (diagnostic tous modes de jeu) ────────
const GAME_TRACE_FILE = path.join(__dirname, '..', 'data', 'game_trace.json');
const MAX_GAME_TRACES = 200;

function loadGameTraces() {
  try {
    const dir = path.dirname(GAME_TRACE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(GAME_TRACE_FILE)) return [];
    return JSON.parse(fs.readFileSync(GAME_TRACE_FILE, 'utf8'));
  } catch { return []; }
}

function saveGameTraces(traces) {
  try {
    const dir = path.dirname(GAME_TRACE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GAME_TRACE_FILE, JSON.stringify(traces.slice(-MAX_GAME_TRACES), null, 2), 'utf8');
  } catch (e) { logger.error('[GameTrace] Save failed:', e.message); }
}

/**
 * POST /api/monitoring/game-trace
 * Receives game trace events from client localStorage (cc_game_trace)
 * Body: { events: [...], deviceId, userId }
 */
router.post('/game-trace', (req, res) => {
  try {
    const { events, deviceId, userId } = req.body;
    if (!Array.isArray(events)) return res.status(400).json({ ok: false, error: 'events must be array' });
    const batch = events.slice(0, 50);
    const existing = loadGameTraces();
    const enriched = batch.map(e => ({ ...e, deviceId: deviceId || null, userId: userId || null, receivedAt: Date.now() }));
    const merged = [...existing, ...enriched].slice(-MAX_GAME_TRACES);
    saveGameTraces(merged);
    // Also log to Winston for Render console visibility
    for (const evt of batch) {
      logger.info(`[GAME-TRACE][client] ${evt.event}`, { ...evt, deviceId, userId });
    }
    res.json({ ok: true, count: batch.length });
  } catch (error) {
    logger.error('[GameTrace] POST error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/game-trace
 * Returns all stored game trace events (admin only)
 */
router.get('/game-trace', requireAdminAuth, (req, res) => {
  try {
    const traces = loadGameTraces();
    res.json({ ok: true, count: traces.length, traces });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * DELETE /api/monitoring/game-trace
 * Purge all game trace events (admin only)
 */
router.delete('/game-trace', requireAdminAuth, (req, res) => {
  try {
    saveGameTraces([]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── Game Incident Screenshots Storage ────────────────────
const GAME_SS_DIR = path.join(__dirname, '..', 'data', 'game-screenshots');
const MAX_GAME_SS = 200;

function ensureGameSSDir() {
  if (!fs.existsSync(GAME_SS_DIR)) fs.mkdirSync(GAME_SS_DIR, { recursive: true });
}

function loadGameSSIndex() {
  try {
    const f = path.join(GAME_SS_DIR, 'index.json');
    if (!fs.existsSync(f)) return [];
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { return []; }
}

function saveGameSSIndex(index) {
  try {
    ensureGameSSDir();
    fs.writeFileSync(path.join(GAME_SS_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  } catch {}
}

/**
 * POST /api/monitoring/game-screenshots
 * Reçoit un screenshot d'incident de jeu (base64 JPEG)
 * Body: { roundId, imageBase64, mode, issues, userId, email, timestamp }
 */
router.post('/game-screenshots', async (req, res) => {
  try {
    const { roundId, imageBase64, mode, issues, userId, email, timestamp } = req.body;
    if (!imageBase64 || !roundId) {
      return res.status(400).json({ ok: false, error: 'missing roundId or imageBase64' });
    }

    ensureGameSSDir();

    const ts = (timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
    const safeName = (roundId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const filename = `${ts}_${safeName}.jpg`;
    const filepath = path.join(GAME_SS_DIR, filename);

    const buffer = Buffer.from(imageBase64, 'base64');
    fs.writeFileSync(filepath, buffer);

    let index = loadGameSSIndex();

    // Éviter doublons par roundId
    if (!index.some(e => e.roundId === roundId)) {
      index.push({
        roundId,
        filename,
        mode: mode || 'unknown',
        issues: issues || [],
        issueCount: Array.isArray(issues) ? issues.length : 0,
        userId: userId || '',
        email: email || '',
        timestamp: timestamp || new Date().toISOString(),
        size: buffer.length,
      });
    }

    // Trim old
    if (index.length > MAX_GAME_SS) {
      const toDelete = index.splice(0, index.length - MAX_GAME_SS);
      for (const old of toDelete) {
        try { fs.unlinkSync(path.join(GAME_SS_DIR, old.filename)); } catch {}
      }
    }

    saveGameSSIndex(index);
    logger.info(`[GameSS] Screenshot saved: ${filename} (${(buffer.length / 1024).toFixed(1)}KB) mode=${mode} round=${roundId}`);
    res.json({ ok: true, filename });
  } catch (error) {
    logger.error('[GameSS] Save error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/game-screenshots
 * Liste les screenshots d'incidents de jeu (admin only)
 */
router.get('/game-screenshots', requireAdminAuth, async (req, res) => {
  try {
    let index = loadGameSSIndex();
    // Filtrer par mode si demandé
    if (req.query.mode) index = index.filter(e => e.mode === req.query.mode);
    res.json({ ok: true, screenshots: index.reverse() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/game-screenshots/:filename
 * Sert un screenshot d'incident (admin only)
 */
router.get('/game-screenshots/:filename', requireAdminAuth, async (req, res) => {
  try {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9_.-]/g, '');
    const filepath = path.join(GAME_SS_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ ok: false, error: 'not found' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(filepath);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * DELETE /api/monitoring/game-screenshots
 * Supprimer tous les screenshots de jeu (admin only)
 */
router.delete('/game-screenshots', requireAdminAuth, async (req, res) => {
  try {
    const index = loadGameSSIndex();
    for (const entry of index) {
      try { fs.unlinkSync(path.join(GAME_SS_DIR, entry.filename)); } catch {}
    }
    saveGameSSIndex([]);
    res.json({ ok: true, message: 'Game screenshots cleared' });
  } catch (error) {
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
    logger.info(`[E2E] Screenshot saved: ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
    res.json({ ok: true, filename });
  } catch (error) {
    logger.error('[E2E] Screenshot save error:', error);
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

// ── E2E Test Results Storage ─────────────────────────
const E2E_RESULTS_FILE = path.join(__dirname, '..', 'data', 'e2e-results.json');
const MAX_E2E_RESULTS = 30; // Garder les 30 dernières exécutions

function loadE2eResults() {
  try {
    ensureDataDir();
    if (!fs.existsSync(E2E_RESULTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(E2E_RESULTS_FILE, 'utf8'));
  } catch { return []; }
}

function saveE2eResults(results) {
  try {
    ensureDataDir();
    const trimmed = results.slice(-MAX_E2E_RESULTS);
    fs.writeFileSync(E2E_RESULTS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    logger.error('[E2E Results] Save error:', e.message);
  }
}

/**
 * POST /api/monitoring/e2e-results
 * Reçoit le rapport complet d'exécution des tests E2E (envoyé par monitoring-reporter.js)
 */
router.post('/e2e-results', async (req, res) => {
  try {
    const report = req.body;
    if (!report || !report.summary) {
      return res.status(400).json({ ok: false, error: 'Invalid report format' });
    }

    const results = loadE2eResults();
    results.push({
      ...report,
      receivedAt: new Date().toISOString(),
    });
    saveE2eResults(results);

    const s = report.summary;
    logger.info(`[E2E Results] Rapport reçu: ${s.passed}✅ ${s.failed}❌ ${s.skipped}⏭️ (${s.source || 'unknown'})`);
    res.json({ ok: true, message: 'Rapport enregistré' });
  } catch (error) {
    logger.error('[E2E Results] POST error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/e2e-results
 * Liste les résultats E2E (admin only)
 */
router.get('/e2e-results', requireAdminAuth, async (req, res) => {
  try {
    const results = loadE2eResults();
    res.json({ ok: true, results: results.reverse() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * DELETE /api/monitoring/e2e-results
 * Vider les résultats E2E (admin only)
 */
router.delete('/e2e-results', requireAdminAuth, async (req, res) => {
  try {
    saveE2eResults([]);
    res.json({ ok: true, message: 'Résultats supprimés' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/monitoring/trigger-e2e
 * Déclenche les tests E2E via GitHub Actions (admin only)
 * Nécessite GITHUB_TOKEN dans les variables d'environnement du serveur
 */
router.post('/trigger-e2e', requireAdminAuth, async (req, res) => {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'digyproservices-arch/crazy-chrono';

    if (!githubToken) {
      return res.status(400).json({
        ok: false,
        error: 'GITHUB_TOKEN non configuré sur le serveur. Ajoutez-le dans les variables d\'environnement Render.',
        help: 'Allez sur https://github.com/settings/tokens → créez un token avec scope "repo" → ajoutez GITHUB_TOKEN dans Render.',
      });
    }

    // Déclencher le workflow via GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/e2e-tests.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );

    if (response.status === 204) {
      logger.info('[E2E] GitHub Actions workflow déclenché avec succès');
      res.json({ ok: true, message: 'Tests E2E lancés ! Les résultats apparaîtront dans quelques minutes.' });
    } else {
      const errorText = await response.text();
      logger.error('[E2E] GitHub trigger failed:', response.status, errorText);
      res.status(response.status).json({ ok: false, error: `GitHub API: ${response.status} — ${errorText}` });
    }
  } catch (error) {
    logger.error('[E2E] Trigger error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/e2e-status
 * Récupère le statut du dernier workflow GitHub Actions (admin only)
 */
router.get('/e2e-status', requireAdminAuth, async (req, res) => {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'digyproservices-arch/crazy-chrono';

    if (!githubToken) {
      return res.json({ ok: true, status: 'unknown', message: 'GITHUB_TOKEN non configuré' });
    }

    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/e2e-tests.yml/runs?per_page=5`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return res.json({ ok: true, status: 'unknown', message: 'Impossible de lire GitHub API' });
    }

    const data = await response.json();
    const runs = (data.workflow_runs || []).map(r => ({
      id: r.id,
      status: r.status,           // queued, in_progress, completed
      conclusion: r.conclusion,   // success, failure, cancelled
      branch: r.head_branch,
      commit: r.head_sha?.substring(0, 8),
      startedAt: r.run_started_at,
      updatedAt: r.updated_at,
      url: r.html_url,
    }));

    res.json({ ok: true, runs });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── Player Presence (Heartbeat) ──────────────────────────
const PRESENCE_TTL_MS = 90000; // 90s — considéré hors ligne après
const PRESENCE_FILE = path.join(__dirname, '..', 'data', 'online_players.json');
const onlinePlayers = new Map(); // userId -> { email, pseudo, mode, page, lastSeen }

// Charger depuis fichier au démarrage (survit aux redémarrages process)
try {
  if (fs.existsSync(PRESENCE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(PRESENCE_FILE, 'utf8'));
    const now = Date.now();
    for (const [uid, info] of Object.entries(raw)) {
      if (now - (info.lastSeen || 0) <= PRESENCE_TTL_MS) {
        onlinePlayers.set(uid, info);
      }
    }
    logger.info(`[Presence] Chargé ${onlinePlayers.size} joueur(s) depuis fichier`);
  }
} catch (e) { logger.warn('[Presence] Erreur chargement fichier:', e.message); }

function savePresenceFile() {
  try {
    const dir = path.dirname(PRESENCE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = {};
    for (const [uid, info] of onlinePlayers.entries()) obj[uid] = info;
    fs.writeFileSync(PRESENCE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch {}
}

/**
 * POST /api/monitoring/heartbeat
 * Le client envoie un heartbeat toutes les 30s avec son état courant
 * Body: { userId, email, pseudo, mode, page }
 */
router.post('/heartbeat', (req, res) => {
  try {
    const { userId, email, pseudo, mode, page } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: 'missing_userId' });
    const isNew = !onlinePlayers.has(userId);
    onlinePlayers.set(userId, {
      email: email || '',
      pseudo: pseudo || '',
      mode: mode || '',
      page: page || '',
      lastSeen: Date.now(),
    });
    if (isNew) {
      logger.info(`[Presence] Nouveau joueur: ${pseudo || email || userId} (mode: ${mode || '?'})`);
    }
    savePresenceFile();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/monitoring/online-players
 * Liste les joueurs actuellement en ligne (any authenticated user)
 */
router.get('/online-players', requireAuth, (req, res) => {
  try {
    const now = Date.now();
    const players = [];
    for (const [userId, info] of onlinePlayers.entries()) {
      if (now - info.lastSeen > PRESENCE_TTL_MS) {
        onlinePlayers.delete(userId); // cleanup expired
        continue;
      }
      players.push({
        userId,
        email: info.email,
        pseudo: info.pseudo,
        mode: info.mode,
        page: info.page,
        lastSeen: new Date(info.lastSeen).toISOString(),
        idleSeconds: Math.round((now - info.lastSeen) / 1000),
      });
    }
    // Trier par activité récente
    players.sort((a, b) => a.idleSeconds - b.idleSeconds);
    res.json({ ok: true, count: players.length, players });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Nettoyage périodique des joueurs expirés (toutes les 5 min) + sauvegarde
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [userId, info] of onlinePlayers.entries()) {
    if (now - info.lastSeen > PRESENCE_TTL_MS) { onlinePlayers.delete(userId); cleaned++; }
  }
  if (cleaned) savePresenceFile();
}, 300000);

// ── Payment Events Storage (shared with server.js webhook handlers) ──
const { loadPaymentEvents, savePaymentEvents } = require('./monitoringHelpers');

/**
 * POST /api/monitoring/payment-event
 * Enregistre un événement de paiement (appelé par les webhook handlers)
 * Body: { source, type, userId, email, status, details }
 */
router.post('/payment-event', (req, res) => {
  try {
    const evt = req.body || {};
    if (!evt.source || !evt.type) return res.status(400).json({ ok: false, error: 'missing source/type' });
    const events = loadPaymentEvents();
    events.push({
      ...evt,
      timestamp: new Date().toISOString(),
    });
    savePaymentEvents(events);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/monitoring/payment-events
 * Liste les événements de paiement (admin only)
 */
router.get('/payment-events', requireAdminAuth, (req, res) => {
  try {
    const events = loadPaymentEvents();
    res.json({ ok: true, events: events.reverse() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/monitoring/usage-stats
 * Statistiques d'utilisation agrégées depuis Supabase (admin only)
 */
router.get('/usage-stats', requireAdminAuth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.json({ ok: true, stats: null, error: 'supabase_not_configured' });

    // 1) Profils utilisateurs avec dernière activité
    let profiles = [];
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, email, pseudo, role, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200);
      profiles = data || [];
    } catch {}

    // 2) Subscriptions
    let subscriptions = [];
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('user_id, status, current_period_end, updated_at')
        .order('updated_at', { ascending: false });
      subscriptions = data || [];
    } catch {}

    // 3) Agréger par utilisateur
    const subsMap = {};
    for (const s of subscriptions) { subsMap[s.user_id] = s; }

    const users = profiles.map(p => ({
      id: p.id,
      email: p.email || '',
      pseudo: p.pseudo || '',
      role: p.role || 'user',
      createdAt: p.created_at,
      lastActive: p.updated_at,
      subscription: subsMap[p.id]?.status || null,
      subEnd: subsMap[p.id]?.current_period_end || null,
    }));

    // 4) KPIs globaux
    const totalUsers = users.length;
    const activeSubscribers = users.filter(u => ['active', 'trialing'].includes(u.subscription)).length;
    const admins = users.filter(u => u.role === 'admin').length;
    const teachers = users.filter(u => u.role === 'teacher').length;

    // 5) Joueurs connectés maintenant
    const now = Date.now();
    let onlineCount = 0;
    for (const [, info] of onlinePlayers.entries()) {
      if (now - info.lastSeen <= PRESENCE_TTL_MS) onlineCount++;
    }

    res.json({
      ok: true,
      stats: {
        totalUsers, activeSubscribers, admins, teachers, onlineCount,
        users,
      },
    });
  } catch (e) {
    logger.error('[UsageStats] Error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Audit Parser — Vérifie toutes les expressions calcul de la bibliothèque ──
router.get('/audit-parser', requireAdminAuth, (req, res) => {
  try {
    const { evaluateCalcul } = require('../utils/serverZoneGenerator');
    const dataPath = path.join(__dirname, '..', 'data', 'associations.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    const calculs = data.calculs || [];
    const chiffres = data.chiffres || [];
    const associations = data.associations || [];

    const calculMap = new Map(calculs.map(c => [c.id, c]));
    const chiffreMap = new Map(chiffres.map(c => [c.id, c]));
    const calcAssocs = associations.filter(a => a.calculId && a.chiffreId);

    // Test 1: standalone parsing
    const failedCalcs = [];
    const passedCount = { total: calculs.length, passed: 0 };
    for (const calc of calculs) {
      const result = evaluateCalcul(calc.content);
      if (result === null) {
        failedCalcs.push({ id: calc.id, content: calc.content, levelClass: calc.levelClass || '?', themes: (calc.themes || []).join(', ') });
      } else {
        passedCount.passed++;
      }
    }

    // Test 2: paired verification
    const mismatchPairs = [];
    const unparsedPairs = [];
    let okPairsCount = 0;

    for (const assoc of calcAssocs) {
      const calc = calculMap.get(assoc.calculId);
      const chiffre = chiffreMap.get(assoc.chiffreId);
      if (!calc || !chiffre) continue;

      const parsedResult = evaluateCalcul(calc.content);
      const chiffreRaw = String(chiffre.content).replace(/\s/g, '').replace(',', '.');
      let chiffreValue = parseFloat(chiffreRaw);
      if (isNaN(chiffreValue) || !/^-?[\d.]+$/.test(chiffreRaw)) {
        const exprVal = evaluateCalcul(chiffre.content);
        if (exprVal !== null) chiffreValue = exprVal;
      }

      if (parsedResult === null) {
        unparsedPairs.push({ calcId: calc.id, calcContent: calc.content, chiffreContent: chiffre.content, levelClass: assoc.levelClass });
      } else if (Math.abs(parsedResult - chiffreValue) > 1e-6) {
        mismatchPairs.push({ calcId: calc.id, calcContent: calc.content, parsedResult, chiffreContent: chiffre.content, chiffreValue, levelClass: assoc.levelClass });
      } else {
        okPairsCount++;
      }
    }

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      standalone: { total: calculs.length, passed: passedCount.passed, failed: failedCalcs.length, failures: failedCalcs },
      pairs: { total: calcAssocs.length, correct: okPairsCount, unparsed: unparsedPairs.length, mismatch: mismatchPairs.length, unparsedList: unparsedPairs, mismatchList: mismatchPairs },
      counts: { calculs: calculs.length, chiffres: chiffres.length, associations: calcAssocs.length }
    });
  } catch (e) {
    logger.error('[AuditParser] Error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Arena / Tournament Stats ─────────────────────────────
/**
 * GET /api/monitoring/arena-stats
 * Récupère les stats des matchs Arena / tournois depuis Supabase (admin only)
 * Query: ?since=ISO_DATE&limit=100
 */
router.get('/arena-stats', requireAdminAuth, async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.json({ ok: false, error: 'supabase_not_configured' });

    const limit = parseInt(req.query.limit) || 200;
    const since = req.query.since || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    // 1) Tournaments
    let tournaments = [];
    try {
      const { data } = await supabase
        .from('tournaments')
        .select('id, name, status, created_at, updated_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);
      tournaments = data || [];
    } catch {}

    // 2) Tournament matches
    let matches = [];
    try {
      const { data } = await supabase
        .from('tournament_matches')
        .select('id, tournament_id, phase_id, group_id, status, room_code, created_at, started_at, finished_at, config')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);
      matches = data || [];
    } catch {}

    // 3) Match results (linked to recent matches)
    let results = [];
    if (matches.length > 0) {
      const matchIds = matches.map(m => m.id);
      try {
        const { data } = await supabase
          .from('match_results')
          .select('id, match_id, student_id, score, position, pairs_found, errors, time_ms, created_at')
          .in('match_id', matchIds.slice(0, 50))
          .order('match_id')
          .order('position');
        results = data || [];
      } catch {}
    }

    // 4) In-memory Arena state (live matches)
    let liveMatches = [];
    try {
      const arena = global.crazyArena;
      if (arena && arena.matches) {
        for (const [matchId, match] of arena.matches) {
          liveMatches.push({
            matchId,
            status: match.status,
            playersCount: match.players?.length || 0,
            players: (match.players || []).map(p => ({
              name: p.name,
              studentId: p.studentId,
              score: p.score || 0,
              ready: p.ready,
              connected: !!p.socketId,
            })),
            round: match.currentRound || 0,
            startTime: match.startTime ? new Date(match.startTime).toISOString() : null,
            config: match.config || {},
          });
        }
      }
    } catch {}

    // 5) Aggregate stats
    const stats = {
      totalTournaments: tournaments.length,
      totalMatches: matches.length,
      matchesByStatus: {},
      totalResults: results.length,
      totalPairsFound: 0,
      totalErrors: 0,
      liveMatchesCount: liveMatches.length,
    };
    for (const m of matches) {
      stats.matchesByStatus[m.status] = (stats.matchesByStatus[m.status] || 0) + 1;
    }
    for (const r of results) {
      stats.totalPairsFound += r.pairs_found || 0;
      stats.totalErrors += r.errors || 0;
    }

    res.json({
      ok: true,
      stats,
      tournaments,
      matches: matches.slice(0, 100),
      results: results.slice(0, 500),
      liveMatches,
    });
  } catch (error) {
    logger.error('[Monitoring] Arena stats error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── Match Lifecycle Events (centralized journal from crazyArenaManager) ──
const MATCH_EVENTS_FILE = path.join(__dirname, '..', 'data', 'match_events.json');

router.get('/match-events', requireAdminAuth, (req, res) => {
  try {
    if (!fs.existsSync(MATCH_EVENTS_FILE)) return res.json({ ok: true, events: [], count: 0 });
    const events = JSON.parse(fs.readFileSync(MATCH_EVENTS_FILE, 'utf8'));

    // Optional filters
    const { mode, type, matchId, since, limit } = req.query;
    let filtered = events;
    if (mode) filtered = filtered.filter(e => e.mode === mode);
    if (type) filtered = filtered.filter(e => e.type === type);
    if (matchId) filtered = filtered.filter(e => (e.matchId || '').includes(matchId));
    if (since) {
      const sinceDate = new Date(since);
      filtered = filtered.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    // Most recent first
    filtered = filtered.reverse();

    const maxLimit = Math.min(parseInt(limit) || 200, 2000);
    filtered = filtered.slice(0, maxLimit);

    // Summary stats
    const stats = {};
    for (const e of events) {
      stats[e.type] = (stats[e.type] || 0) + 1;
    }

    res.json({ ok: true, events: filtered, count: filtered.length, totalEvents: events.length, stats });
  } catch (error) {
    logger.error('[Monitoring] Match events error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── Supabase helper (persistent logs) ─────────────────────
function _getSupabase() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
  } catch { return null; }
}

// ── GET /api/monitoring/supabase-rounds ───────────────────
// Récupère les manches depuis Supabase (persistant, survit aux redéploiements)
router.get('/supabase-rounds', requireAdminAuth, async (req, res) => {
  try {
    const supabase = _getSupabase();
    if (!supabase) return res.json({ ok: true, rounds: [], message: 'Supabase not configured' });

    const hours = parseInt(req.query.hours) || 48;
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    const { data: logs, error } = await supabase
      .from('backend_logs')
      .select('timestamp, message, meta')
      .like('message', '%[ArenaRoundLog]%')
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(200);

    if (error) return res.status(500).json({ ok: false, error: error.message });

    const rounds = (logs || []).map(log => {
      const m = log.meta || {};
      return {
        id: m.roundId || `supa_${log.timestamp}`,
        timestamp: log.timestamp,
        mode: m.mode,
        source: m.source || 'supabase',
        matchId: m.matchId,
        roundIndex: m.roundIndex,
        totalZones: m.totalZones,
        pairZones: m.pairZones,
        validPairs: m.validPairs,
        doublePairIssues: m.doublePairIssues || 0,
        issues: m.issues || [],
        pairDetails: m.pairDetails,
        zonesSnapshot: m.zonesSnapshot,
        summary: { totalZones: m.totalZones, pairedCount: m.pairZones },
        _fromSupabase: true
      };
    }).filter(r => r.id);

    res.json({ ok: true, rounds, total: rounds.length });
  } catch (error) {
    logger.error('[Monitoring] Supabase rounds error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── GET /api/monitoring/supabase-incidents ─────────────────
// Récupère les anomalies de zones depuis Supabase (persistant)
router.get('/supabase-incidents', requireAdminAuth, async (req, res) => {
  try {
    const supabase = _getSupabase();
    if (!supabase) return res.json({ ok: true, incidents: [], message: 'Supabase not configured' });

    const hours = parseInt(req.query.hours) || 48;
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    const { data: logs, error } = await supabase
      .from('backend_logs')
      .select('timestamp, level, message, meta')
      .like('message', '%[ZoneValidation][INCIDENT]%')
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(200);

    if (error) return res.status(500).json({ ok: false, error: error.message });

    const incidents = (logs || []).map(log => {
      const m = log.meta || {};
      return {
        id: `supa_inc_${Date.parse(log.timestamp)}_${(m.incidentType || '').replace(/[^a-z]/gi, '')}`,
        type: m.incidentType || m.anomalyDetails?.type || 'unknown',
        severity: m.severity || (log.level === 'error' ? 'critical' : 'warning'),
        timestamp: log.timestamp,
        receivedAt: log.timestamp,
        details: m.anomalyDetails || {},
        sessionInfo: { source: m.source, matchId: m.matchId, roundIndex: m.roundIndex },
        _fromSupabase: true
      };
    });

    res.json({ ok: true, incidents, total: incidents.length });
  } catch (error) {
    logger.error('[Monitoring] Supabase incidents error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── GET /api/monitoring/supabase-diagnostic ────────────────
// Diagnostic: vérifier que Supabase reçoit bien les logs
router.get('/supabase-diagnostic', requireAdminAuth, async (req, res) => {
  const diag = { supabaseConfigured: false, tableExists: false, totalRows: 0, recentMessages: [], arenaRoundLogCount: 0, zoneIncidentCount: 0, error: null };
  try {
    const supabase = _getSupabase();
    if (!supabase) {
      diag.error = 'Supabase not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)';
      return res.json({ ok: false, diagnostic: diag });
    }
    diag.supabaseConfigured = true;

    // 1) Compter tous les logs
    const { count, error: cErr } = await supabase
      .from('backend_logs')
      .select('*', { count: 'exact', head: true });
    if (cErr) {
      diag.error = `Count query failed: ${cErr.message}`;
      return res.json({ ok: false, diagnostic: diag });
    }
    diag.tableExists = true;
    diag.totalRows = count || 0;

    // 2) 10 derniers messages
    const { data: recent, error: rErr } = await supabase
      .from('backend_logs')
      .select('timestamp, level, message')
      .order('timestamp', { ascending: false })
      .limit(10);
    if (!rErr && recent) {
      diag.recentMessages = recent.map(r => ({ ts: r.timestamp, lvl: r.level, msg: (r.message || '').substring(0, 80) }));
    }

    // 3) Compter ArenaRoundLog
    const { count: arcCount, error: arcErr } = await supabase
      .from('backend_logs')
      .select('*', { count: 'exact', head: true })
      .like('message', '%[ArenaRoundLog]%');
    if (!arcErr) diag.arenaRoundLogCount = arcCount || 0;

    // 4) Compter ZoneValidation incidents
    const { count: zvcCount, error: zvcErr } = await supabase
      .from('backend_logs')
      .select('*', { count: 'exact', head: true })
      .like('message', '%[ZoneValidation][INCIDENT]%');
    if (!zvcErr) diag.zoneIncidentCount = zvcCount || 0;

    res.json({ ok: true, diagnostic: diag });
  } catch (error) {
    diag.error = error.message;
    res.json({ ok: false, diagnostic: diag });
  }
});

module.exports = router;
