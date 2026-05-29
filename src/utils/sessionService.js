// ==========================================
// SESSION SERVICE — Enforcement de session unique
// 1 licence = 1 session active à la fois
// ==========================================

import { getBackendUrl } from './apiHelpers';

const SESSION_KEY = 'cc_session_token';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 min
const VALIDATE_INTERVAL = 30 * 1000; // 30 sec

let heartbeatTimer = null;
let validateTimer = null;
let onKickedCallback = null;

// ── Getters / Setters ──

export function getSessionToken() {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

export function setSessionToken(token) {
  try { localStorage.setItem(SESSION_KEY, token); } catch {}
}

export function clearSessionToken() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

// ── Create session (called after successful login) ──

export async function createSession(jwt, deviceId) {
  try {
    const res = await fetch(`${getBackendUrl()}/api/session/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ deviceId: deviceId || getDeviceId() }),
    });
    const data = await res.json();
    if (data?.ok && data?.sessionToken) {
      setSessionToken(data.sessionToken);
      console.log(`[Session] ✅ Session créée | invalidated=${data.invalidatedCount}`);
      return data.sessionToken;
    }
    console.warn('[Session] ⚠️ Création échouée:', data?.error);
    return null;
  } catch (e) {
    console.warn('[Session] ⚠️ Erreur création:', e.message);
    return null;
  }
}

// ── Validate session ──

export async function validateSession() {
  const token = getSessionToken();
  if (!token) return true; // pas de session → fail-open (pas encore migré)

  try {
    const res = await fetch(`${getBackendUrl()}/api/session/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: token }),
    });
    const data = await res.json();
    if (data?.ok && data?.isActive === false) {
      console.warn('[Session] ❌ Session invalidée — éjection');
      handleKicked();
      return false;
    }
    return true;
  } catch (e) {
    // fail-open en cas d'erreur réseau
    return true;
  }
}

// ── Heartbeat ──

async function sendHeartbeat() {
  const token = getSessionToken();
  if (!token) return;
  try {
    await fetch(`${getBackendUrl()}/api/session/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: token }),
    });
  } catch {}
}

// ── Logout ──

export async function logoutSession() {
  const token = getSessionToken();
  stopSessionGuard();
  clearSessionToken();
  if (!token) return;
  try {
    await fetch(`${getBackendUrl()}/api/session/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: token }),
    });
  } catch {}
}

// ── Kick handling ──

function handleKicked() {
  stopSessionGuard();
  clearSessionToken();
  if (onKickedCallback) {
    onKickedCallback();
  }
}

// ── Start / Stop session guard (periodic validation + heartbeat) ──

export function startSessionGuard(onKicked) {
  onKickedCallback = onKicked || null;
  stopSessionGuard();

  // Heartbeat toutes les 5 min
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

  // Validation toutes les 30 sec
  validateTimer = setInterval(async () => {
    const valid = await validateSession();
    if (!valid) stopSessionGuard();
  }, VALIDATE_INTERVAL);

  console.log('[Session] 🛡️ Guard activé (heartbeat=5min, validate=30s)');
}

export function stopSessionGuard() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (validateTimer) { clearInterval(validateTimer); validateTimer = null; }
}

// ── Socket.IO kick listener ──

export function listenForSocketKick(socket, userId) {
  if (!socket || !userId) return;
  socket.on('session:kicked', (data) => {
    if (data?.userId === userId) {
      console.warn('[Session] ⚡ Éjecté via Socket.IO — nouveau login détecté');
      handleKicked();
    }
  });
}

// ── Device ID (persistent fingerprint léger) ──

function getDeviceId() {
  try {
    let id = localStorage.getItem('cc_device_id');
    if (id) return id;
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('cc_device_id', id);
    return id;
  } catch {
    return 'dev_unknown';
  }
}

export { getDeviceId };
