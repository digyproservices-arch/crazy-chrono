/**
 * Auth Logger — Enregistre les événements d'authentification pour le monitoring.
 * Stockage localStorage, visible dans le rapport monitoring sans avoir besoin de F12.
 *
 * Usage:
 *   import { logAuth, getAuthLogs, clearAuthLogs } from '../utils/authLogger';
 *   logAuth('login', { email, name, source: 'handleLogin', pseudo_from: 'db' });
 *   logAuth('save_ok', { pseudo: 'MariusVR', server_response: { ok: true } });
 *   logAuth('save_fail', { pseudo: 'MariusVR', error: '401 invalid_token' });
 */

const LS_KEY = 'cc_auth_logs';
const MAX_LOGS = 50;

/**
 * Log an auth event.
 * @param {'login'|'login_auto'|'save_ok'|'save_fail'|'save_no_token'|'logout'|'profile_load'|'profile_load_fail'|'error'} type
 * @param {Object} details - Free-form details about the event
 */
export function logAuth(type, details = {}) {
  try {
    const logs = getAuthLogs();
    logs.unshift({
      type,
      timestamp: new Date().toISOString(),
      details,
    });
    // Keep only the most recent logs
    while (logs.length > MAX_LOGS) logs.pop();
    localStorage.setItem(LS_KEY, JSON.stringify(logs));
  } catch (e) {
    console.warn('[authLogger] Failed to log:', e.message);
  }
}

/**
 * Get all auth logs from localStorage.
 * @returns {Array}
 */
export function getAuthLogs() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Clear all auth logs.
 */
export function clearAuthLogs() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}
