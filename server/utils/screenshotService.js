/**
 * Screenshot Service — Capture de vraies cartes via Puppeteer
 * Génère des images JPEG identiques à ce que le joueur voit
 */
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const GAME_SS_DIR = path.join(__dirname, '..', 'data', 'game-screenshots');
const SS_DATA_DIR = path.join(__dirname, '..', 'data', 'screenshot-data');
const MAX_GAME_SS = 200;

let _browser = null;
let _puppeteer = null;
let _available = null; // null = not checked, true/false = checked

/**
 * Check if Puppeteer is available (installed)
 */
function isAvailable() {
  if (_available !== null) return _available;
  try {
    _puppeteer = require('puppeteer');
    _available = true;
    logger.info('[ScreenshotService] Puppeteer available');
  } catch {
    _available = false;
    logger.warn('[ScreenshotService] Puppeteer not installed — screenshots disabled. Run: cd server && npm install puppeteer');
  }
  return _available;
}

/**
 * Get or create browser instance (singleton)
 */
async function getBrowser() {
  if (!isAvailable()) return null;
  if (_browser && _browser.isConnected()) return _browser;
  try {
    _browser = await _puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ],
      timeout: 15000
    });
    logger.info('[ScreenshotService] Browser launched');
    return _browser;
  } catch (e) {
    logger.error('[ScreenshotService] Failed to launch browser:', e.message);
    _available = false;
    return null;
  }
}

/**
 * Store zone data temporarily for the HTML renderer to fetch
 */
function storeZoneData(dataId, zones) {
  try {
    if (!fs.existsSync(SS_DATA_DIR)) fs.mkdirSync(SS_DATA_DIR, { recursive: true });
    const filepath = path.join(SS_DATA_DIR, `${dataId}.json`);
    fs.writeFileSync(filepath, JSON.stringify({ zones }, null, 0), 'utf8');
    return true;
  } catch (e) {
    logger.warn('[ScreenshotService] Failed to store zone data:', e.message);
    return false;
  }
}

/**
 * Load zone data (for the internal API endpoint)
 */
function loadZoneData(dataId) {
  try {
    const filepath = path.join(SS_DATA_DIR, `${dataId}.json`);
    if (!fs.existsSync(filepath)) return null;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Clean up zone data after screenshot is taken
 */
function cleanZoneData(dataId) {
  try {
    const filepath = path.join(SS_DATA_DIR, `${dataId}.json`);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch {}
}

/**
 * Save screenshot to game-screenshots storage
 */
function saveScreenshot(buffer, roundId, meta = {}) {
  try {
    if (!fs.existsSync(GAME_SS_DIR)) fs.mkdirSync(GAME_SS_DIR, { recursive: true });
    
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = String(roundId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const filename = `${ts}_${safeName}.jpg`;
    const filepath = path.join(GAME_SS_DIR, filename);
    
    fs.writeFileSync(filepath, buffer);
    
    // Update index
    let index = [];
    const indexPath = path.join(GAME_SS_DIR, 'index.json');
    try { if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
    
    if (!index.some(e => e.roundId === roundId)) {
      index.push({
        roundId,
        filename,
        mode: meta.mode || 'arena',
        issues: meta.issues || [],
        issueCount: Array.isArray(meta.issues) ? meta.issues.length : 0,
        matchId: meta.matchId || '',
        roundIndex: meta.roundIndex ?? 0,
        timestamp: new Date().toISOString(),
        source: 'puppeteer'
      });
      if (index.length > MAX_GAME_SS) index = index.slice(-MAX_GAME_SS);
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
    }
    
    logger.info(`[ScreenshotService] Saved screenshot: ${filename}`);
    return filename;
  } catch (e) {
    logger.warn('[ScreenshotService] Failed to save screenshot:', e.message);
    return null;
  }
}

/**
 * Capture a card screenshot from zone data
 * @param {Array} zones - Full zone objects with points, content, pairId etc.
 * @param {Object} meta - { matchId, roundIndex, mode, issues }
 * @param {number} serverPort - Local server port for the HTML page
 * @returns {string|null} filename if saved, null on failure
 */
async function captureCardScreenshot(zones, meta = {}, serverPort = 3001) {
  if (!isAvailable()) return null;
  
  const dataId = `ss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const roundId = `arena_${meta.matchId || 'unknown'}_r${meta.roundIndex ?? 0}_${Date.now()}`;
  
  try {
    // Store zones for the HTML page to fetch
    if (!storeZoneData(dataId, zones)) return null;
    
    const browser = await getBrowser();
    if (!browser) { cleanZoneData(dataId); return null; }
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 1 });
    
    const url = `http://localhost:${serverPort}/card-screenshot.html?id=${dataId}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    
    // Wait for rendering to complete
    await page.waitForFunction('window.__SCREENSHOT_READY === true', { timeout: 10000 });
    // Extra wait for images
    await new Promise(r => setTimeout(r, 500));
    
    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 85,
      clip: { x: 0, y: 0, width: 1000, height: 1000 }
    });
    
    await page.close();
    cleanZoneData(dataId);
    
    return saveScreenshot(buffer, roundId, meta);
  } catch (e) {
    logger.warn('[ScreenshotService] Capture failed:', e.message);
    cleanZoneData(dataId);
    return null;
  }
}

/**
 * Close browser on shutdown
 */
async function closeBrowser() {
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }
}

module.exports = {
  isAvailable,
  captureCardScreenshot,
  closeBrowser,
  loadZoneData,
  cleanZoneData,
  storeZoneData
};
