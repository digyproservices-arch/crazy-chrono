/**
 * Client Telemetry — Module professionnel de captation côté client.
 * Capture : erreurs JS, lifecycle socket, erreurs réseau, navigation, zones reçues/affichées.
 * Stocke en localStorage (cc_client_telemetry) et synchronise au serveur.
 *
 * Usage dans App.js :
 *   import { initClientTelemetry, telemetry } from './utils/clientTelemetry';
 *   useEffect(() => { const cleanup = initClientTelemetry(); return cleanup; }, []);
 *
 * Usage dans Carte.js (zones) :
 *   import { telemetry } from './utils/clientTelemetry';
 *   telemetry('zones:received', { ... });
 */

import { getBackendUrl } from './subscription';

const LS_KEY = 'cc_client_telemetry';
const MAX_EVENTS = 300;
const SYNC_INTERVAL_MS = 15000; // sync toutes les 15s
const SYNC_BATCH_SIZE = 50;

// ── Helpers ──────────────────────────────────────────────

function getDeviceId() {
  try {
    let id = localStorage.getItem('cc_device_id');
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('cc_device_id', id);
    }
    return id;
  } catch { return 'unknown'; }
}

function getUserId() {
  try { return JSON.parse(localStorage.getItem('cc_auth') || '{}').id || null; } catch { return null; }
}

// ── Buffer ───────────────────────────────────────────────

function loadBuffer() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch { return []; }
}

function saveBuffer(buf) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(buf.slice(-MAX_EVENTS)));
  } catch {}
}

/**
 * Enregistre un événement telemetry.
 * @param {string} event - Nom de l'événement (ex: 'error:js', 'socket:disconnect', 'nav:route')
 * @param {object} data - Données associées
 */
export function telemetry(event, data = {}) {
  try {
    const buf = loadBuffer();
    buf.push({
      event,
      ts: new Date().toISOString(),
      deviceId: getDeviceId(),
      url: window.location.pathname,
      ...data,
    });
    saveBuffer(buf);
  } catch {}
}

/**
 * Retourne tous les événements stockés (pour le rapport monitoring local).
 */
export function getTelemetryEvents() {
  return loadBuffer();
}

/**
 * Efface tous les événements.
 */
export function clearTelemetry() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

// ── Sync vers serveur ────────────────────────────────────

let _syncTimer = null;

async function syncToServer() {
  try {
    const buf = loadBuffer();
    if (!buf.length) return;
    const batch = buf.slice(0, SYNC_BATCH_SIZE);
    const backendUrl = getBackendUrl();
    if (!backendUrl) return;
    const token = (() => {
      try { return JSON.parse(localStorage.getItem('cc_auth') || '{}').token || null; } catch { return null; }
    })();
    const res = await fetch(`${backendUrl}/api/monitoring/client-telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        events: batch,
        deviceId: getDeviceId(),
        userId: getUserId(),
      }),
    });
    if (res.ok) {
      // Supprimer les événements envoyés
      const remaining = buf.slice(batch.length);
      saveBuffer(remaining);
    }
  } catch {}
}

// ── Capteurs ─────────────────────────────────────────────

function captureJSErrors() {
  const onError = (event) => {
    telemetry('error:js', {
      message: event.message || 'Unknown error',
      source: event.filename || '',
      line: event.lineno || 0,
      col: event.colno || 0,
      stack: event.error?.stack?.substring(0, 500) || '',
    });
  };
  const onUnhandled = (event) => {
    const reason = event.reason;
    telemetry('error:promise', {
      message: String(reason?.message || reason || 'Unhandled rejection').substring(0, 300),
      stack: reason?.stack?.substring(0, 500) || '',
    });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandled);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandled);
  };
}

function captureFetchErrors() {
  const origFetch = window._cc_origFetch || window.fetch;
  if (!window._cc_origFetch) window._cc_origFetch = window.fetch;

  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const start = Date.now();
    try {
      const res = await origFetch.apply(this, args);
      const elapsed = Date.now() - start;
      // Log les erreurs serveur (4xx, 5xx) sauf 401 (déjà géré)
      if (res.status >= 400 && res.status !== 401) {
        telemetry('error:fetch', {
          fetchUrl: url.substring(0, 200),
          status: res.status,
          method: args[1]?.method || 'GET',
          elapsed,
        });
      }
      // Log les requêtes lentes (> 5s)
      if (elapsed > 5000) {
        telemetry('perf:slow-fetch', {
          fetchUrl: url.substring(0, 200),
          elapsed,
          status: res.status,
        });
      }
      return res;
    } catch (err) {
      telemetry('error:network', {
        fetchUrl: url.substring(0, 200),
        message: err.message?.substring(0, 200) || 'Network error',
        elapsed: Date.now() - start,
      });
      throw err;
    }
  };

  return () => {
    window.fetch = origFetch;
  };
}

function captureNavigation() {
  // Log le chargement initial
  telemetry('nav:load', { path: window.location.pathname + window.location.search });

  // Intercepter pushState / replaceState
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (...args) {
    origPush.apply(this, args);
    telemetry('nav:route', { path: window.location.pathname + window.location.search });
  };
  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    telemetry('nav:route', { path: window.location.pathname + window.location.search });
  };

  const onPopState = () => {
    telemetry('nav:back', { path: window.location.pathname + window.location.search });
  };
  window.addEventListener('popstate', onPopState);

  // Détecter la fermeture/navigation de la page
  const onBeforeUnload = () => {
    telemetry('nav:unload', { path: window.location.pathname });
    // Tentative de sync synchrone avant fermeture
    try {
      const buf = loadBuffer();
      if (buf.length) {
        const backendUrl = getBackendUrl();
        if (backendUrl && navigator.sendBeacon) {
          navigator.sendBeacon(
            `${backendUrl}/api/monitoring/client-telemetry`,
            JSON.stringify({ events: buf.slice(0, SYNC_BATCH_SIZE), deviceId: getDeviceId(), userId: getUserId() })
          );
        }
      }
    } catch {}
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}

function captureVisibility() {
  const onChange = () => {
    telemetry(document.hidden ? 'app:hidden' : 'app:visible', {});
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

// ── Init ─────────────────────────────────────────────────

/**
 * Initialise tous les capteurs. Retourne une fonction cleanup.
 * Appeler une seule fois dans App.js useEffect.
 */
export function initClientTelemetry() {
  const cleanups = [];

  cleanups.push(captureJSErrors());
  cleanups.push(captureFetchErrors());
  cleanups.push(captureNavigation());
  cleanups.push(captureVisibility());

  // Sync périodique
  _syncTimer = setInterval(syncToServer, SYNC_INTERVAL_MS);
  // Sync immédiate au démarrage (avec délai pour ne pas ralentir le boot)
  setTimeout(syncToServer, 3000);

  telemetry('telemetry:init', {
    userAgent: navigator.userAgent?.substring(0, 150),
    screen: `${window.screen?.width}x${window.screen?.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    lang: navigator.language,
    online: navigator.onLine,
  });

  return () => {
    cleanups.forEach(fn => { try { fn(); } catch {} });
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  };
}
