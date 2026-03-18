/**
 * Card Screenshot Utility
 * Capture des screenshots de la carte lors des incidents (fausses paires, etc.)
 * Stockage via IndexedDB pour éviter la limite localStorage (5MB).
 * 
 * Usage:
 *   import { captureCardScreenshot, getScreenshot, getAllScreenshotMetas } from '../utils/cardScreenshot';
 *   await captureCardScreenshot(containerElement, roundId, { issues, mode });
 *   const dataUrl = await getScreenshot(roundId);
 */

import html2canvas from 'html2canvas';
import { getBackendUrl } from './apiHelpers';

const DB_NAME = 'cc_screenshots';
const STORE_NAME = 'captures';
const META_LS_KEY = 'cc_screenshot_metas';
const MAX_SCREENSHOTS = 30;
const DB_VERSION = 1;

// ── IndexedDB helpers ─────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'roundId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB(roundId, dataUrl) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ roundId, dataUrl, ts: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getFromIDB(roundId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(roundId);
    req.onsuccess = () => resolve(req.result?.dataUrl || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromIDB(roundId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(roundId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Meta tracking (lightweight, in localStorage) ──────────

function loadMetas() {
  try { return JSON.parse(localStorage.getItem(META_LS_KEY) || '[]'); }
  catch { return []; }
}

function saveMetas(metas) {
  try { localStorage.setItem(META_LS_KEY, JSON.stringify(metas)); }
  catch {}
}

async function trimOldScreenshots() {
  const metas = loadMetas();
  if (metas.length <= MAX_SCREENSHOTS) return;
  // Sort by timestamp ascending (oldest first)
  metas.sort((a, b) => a.ts - b.ts);
  const toRemove = metas.splice(0, metas.length - MAX_SCREENSHOTS);
  saveMetas(metas);
  for (const m of toRemove) {
    try { await deleteFromIDB(m.roundId); } catch {}
  }
}

// ── Server upload ─────────────────────────────────────────

async function uploadToServer(roundId, dataUrl, meta = {}) {
  try {
    // Extraire le base64 brut (retirer le préfixe data:image/jpeg;base64,)
    const base64 = dataUrl.split(',')[1];
    if (!base64) return;

    const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
    const body = {
      roundId,
      imageBase64: base64,
      mode: meta.mode || 'unknown',
      issues: meta.issues || [],
      userId: auth.userId || '',
      email: auth.email || '',
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(`${getBackendUrl()}/api/monitoring/game-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      console.log(`[Screenshot] ☁️ Uploaded to server for round ${roundId}`);
    } else {
      console.warn(`[Screenshot] Server upload failed: ${res.status}`);
    }
  } catch (e) {
    console.warn('[Screenshot] Server upload error:', e.message);
  }
}

// ── Public API ────────────────────────────────────────────

/**
 * Capture a screenshot of the card container element.
 * @param {HTMLElement} containerEl - The DOM element to capture (the carte div)
 * @param {string} roundId - The round log ID to link this screenshot to
 * @param {Object} meta - Additional metadata { issues, mode, timestamp }
 * @returns {Promise<string|null>} The data URL of the captured image, or null on failure
 */
export async function captureCardScreenshot(containerEl, roundId, meta = {}) {
  if (!containerEl || !roundId) return null;
  try {
    const canvas = await html2canvas(containerEl, {
      useCORS: true,
      allowTaint: true,
      scale: 0.6,           // Lower resolution to save space (~360x360 for a 600x600 card)
      backgroundColor: '#1a1a2e',
      logging: false,
      imageTimeout: 3000,
    });

    // Convert to JPEG with low quality for compact storage
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);

    // Save to IndexedDB
    await saveToIDB(roundId, dataUrl);

    // Save meta to localStorage
    const metas = loadMetas();
    metas.push({
      roundId,
      ts: Date.now(),
      mode: meta.mode || 'unknown',
      issueCount: meta.issues?.length || 0,
      hasDoublePairs: (meta.issues || []).some(i =>
        i.type === 'DOUBLE_PAIR_VISUAL' || i.type === 'FALSE_CALC_NUM_PAIR' || i.type === 'OFFICIAL_PAIR_MATH_ERROR'
      ),
    });
    saveMetas(metas);

    // Trim old screenshots
    await trimOldScreenshots();

    // Upload to server (fire-and-forget, ne bloque pas le jeu)
    uploadToServer(roundId, dataUrl, meta).catch(() => {});

    console.log(`[Screenshot] 📷 Carte capturée pour manche ${roundId} (${Math.round(dataUrl.length / 1024)}KB)`);
    return dataUrl;
  } catch (e) {
    console.warn('[Screenshot] Erreur capture:', e);
    return null;
  }
}

/**
 * Get a screenshot data URL by round ID.
 * @param {string} roundId
 * @returns {Promise<string|null>}
 */
export async function getScreenshot(roundId) {
  try { return await getFromIDB(roundId); }
  catch { return null; }
}

/**
 * Get all screenshot metadata (lightweight).
 * @returns {Array} List of { roundId, ts, mode, issueCount, hasDoublePairs }
 */
export function getAllScreenshotMetas() {
  return loadMetas();
}

/**
 * Check if a screenshot exists for a given round ID.
 * @param {string} roundId
 * @returns {boolean}
 */
export function hasScreenshot(roundId) {
  const metas = loadMetas();
  return metas.some(m => m.roundId === roundId);
}

/**
 * Clear all screenshots (IndexedDB + meta).
 */
export async function clearAllScreenshots() {
  try {
    const metas = loadMetas();
    for (const m of metas) {
      try { await deleteFromIDB(m.roundId); } catch {}
    }
    saveMetas([]);
    console.log('[Screenshot] Tous les screenshots supprimés');
  } catch (e) {
    console.warn('[Screenshot] Erreur suppression:', e);
  }
}
