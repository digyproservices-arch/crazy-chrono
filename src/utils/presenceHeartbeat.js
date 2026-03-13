/**
 * Presence Heartbeat — Envoie un signal de présence au backend toutes les 30s.
 * Permet au dashboard admin de voir qui est en ligne et sur quelle page/mode.
 *
 * Usage:
 *   import { startHeartbeat, stopHeartbeat } from '../utils/presenceHeartbeat';
 *   startHeartbeat(); // dans App.js après auth
 *   stopHeartbeat();  // au logout
 */

import { getBackendUrl } from './apiHelpers';

let _intervalId = null;
const HEARTBEAT_INTERVAL = 30000; // 30s

function getAuthInfo() {
  try {
    const raw = localStorage.getItem('cc_auth');
    if (!raw) return null;
    const auth = JSON.parse(raw);
    return {
      userId: auth.id || auth.userId || null,
      email: auth.email || '',
      pseudo: auth.name || auth.pseudo || '',
      token: auth.token || null,
    };
  } catch { return null; }
}

function detectCurrentMode() {
  const path = window.location.pathname || '';
  if (path.includes('arena')) return 'arena';
  if (path.includes('training')) return 'training';
  if (path.includes('multi')) return 'multiplayer';
  if (path.includes('grande-salle')) return 'grande-salle';
  if (path.includes('carte') || path.includes('game')) return 'solo';
  if (path.includes('objectif')) return 'objectif';
  if (path.includes('admin')) return 'admin';
  if (path.includes('account')) return 'account';
  if (path.includes('monitoring')) return 'monitoring';
  if (path.includes('modes')) return 'modes';
  if (path.includes('pricing')) return 'pricing';
  return 'navigation';
}

function detectCurrentPage() {
  const path = window.location.pathname || '/';
  return path.length > 50 ? path.substring(0, 50) : path;
}

let _lastOk = false;
let _failCount = 0;

async function sendHeartbeat() {
  const auth = getAuthInfo();
  if (!auth || !auth.userId) {
    if (!_lastOk) console.warn('[Heartbeat] Skipped: no userId in cc_auth');
    return;
  }

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/api/monitoring/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: auth.userId,
        email: auth.email,
        pseudo: auth.pseudo,
        mode: detectCurrentMode(),
        page: detectCurrentPage(),
      }),
    });
    if (res.ok) {
      if (!_lastOk || _failCount > 0) {
        console.log(`[Heartbeat] OK — ${auth.pseudo || auth.email || auth.userId} (après ${_failCount} échec(s))`);
      }
      _lastOk = true;
      _failCount = 0;
    } else {
      _failCount++;
      if (_failCount <= 3) console.warn(`[Heartbeat] Échec HTTP ${res.status} pour ${auth.pseudo || auth.userId}`);
      _lastOk = false;
    }
  } catch (err) {
    _failCount++;
    if (_failCount <= 3) console.warn('[Heartbeat] Erreur réseau:', err.message);
    _lastOk = false;
  }
}

export function startHeartbeat() {
  if (_intervalId) return; // already running
  sendHeartbeat(); // immediate first beat
  _intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

export function stopHeartbeat() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
