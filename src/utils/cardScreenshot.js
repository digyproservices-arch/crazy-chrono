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

// ── SVG image inlining for html2canvas ───────────────────

/**
 * html2canvas ne capture pas les SVG <image> elements.
 * Cette fonction convertit chaque <image href="..."> en data URL inline
 * dans le DOM cloné AVANT que html2canvas ne le rende.
 */
async function inlineSvgImages(clonedDoc) {
  const images = clonedDoc.querySelectorAll('image[href], image[xlink\\:href]');
  if (!images.length) return;

  const promises = Array.from(images).map(imgEl => {
    return new Promise(resolve => {
      const src = imgEl.getAttribute('href') || imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (!src || src.startsWith('data:')) { resolve(); return; }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 200;
          c.height = img.naturalHeight || 200;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const dataUrl = c.toDataURL('image/jpeg', 0.7);
          imgEl.setAttribute('href', dataUrl);
          imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl);
        } catch (e) {
          console.warn('[Screenshot] Inline image failed (tainted?):', src, e.message);
        }
        resolve();
      };
      img.onerror = () => {
        console.warn('[Screenshot] Could not load image for inline:', src);
        resolve();
      };
      // Timeout: don't block capture for slow images
      setTimeout(resolve, 3000);
      img.src = src;
    });
  });

  await Promise.all(promises);
}

// ── Server upload ─────────────────────────────────────────

async function uploadToServer(roundId, dataUrl, meta = {}) {
  try {
    // Extraire le base64 brut (retirer le préfixe data:image/jpeg;base64,)
    const base64 = dataUrl.split(',')[1];
    if (!base64) {
      console.error('[Screenshot] ❌ uploadToServer: pas de base64 dans dataUrl');
      return;
    }

    const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
    const backendUrl = getBackendUrl();
    const body = {
      roundId,
      imageBase64: base64,
      mode: meta.mode || 'unknown',
      issues: meta.issues || [],
      userId: auth.id || auth.userId || '',
      email: auth.email || '',
      timestamp: new Date().toISOString(),
    };

    console.warn(`[Screenshot] ☁️ Upload vers ${backendUrl}/api/monitoring/game-screenshots (${Math.round(base64.length / 1024)}KB)...`);

    const res = await fetch(`${backendUrl}/api/monitoring/game-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      console.warn(`[Screenshot] ✅ Upload réussi: ${data.filename || 'ok'}`);
    } else {
      const errText = await res.text().catch(() => '');
      console.error(`[Screenshot] ❌ Upload échoué: HTTP ${res.status} — ${errText.substring(0, 200)}`);
    }
  } catch (e) {
    console.error('[Screenshot] ❌ Upload error:', e.message);
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
  if (!containerEl || !roundId) {
    console.error(`[Screenshot] ❌ captureCardScreenshot appelé avec containerEl=${!!containerEl}, roundId=${roundId}`);
    return null;
  }
  try {
    console.warn(`[Screenshot] 📷 html2canvas démarré pour round=${roundId}, element=${containerEl.tagName}.${containerEl.className}`);
    const canvas = await html2canvas(containerEl, {
      useCORS: true,
      allowTaint: true,
      scale: 0.6,           // Lower resolution to save space (~360x360 for a 600x600 card)
      backgroundColor: '#1a1a2e',
      logging: false,
      imageTimeout: 5000,
      onclone: async (clonedDoc) => {
        // Convertir les SVG <image> en data URLs inline (html2canvas ne les capture pas)
        await inlineSvgImages(clonedDoc);
      },
    });

    // Convert to JPEG with low quality for compact storage
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
    console.warn(`[Screenshot] 📷 Canvas → JPEG: ${Math.round(dataUrl.length / 1024)}KB`);

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

    console.warn(`[Screenshot] ✅ Carte capturée + upload lancé pour manche ${roundId}`);
    return dataUrl;
  } catch (e) {
    console.error('[Screenshot] ❌ Erreur capture:', e);
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
