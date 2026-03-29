/**
 * Click Logger — Enregistre les événements de clic (réussis/rejetés) pour le monitoring.
 * Stockage localStorage, visible dans le rapport monitoring sans avoir besoin de F12.
 *
 * Usage:
 *   import { logClick, getClickLogs, getClickStats, clearClickLogs } from '../utils/clickLogger';
 *   logClick('ok', { zoneId: 'z3', type: 'texte', content: 'Dauphin' });
 *   logClick('REJECTED:assignBusy', { zoneId: 'z7', type: 'calcul', content: '10 − 7' });
 *   logClick('SKIPPED', { zoneId: 'z12', type: 'image', gameActive: false });
 */

const LS_KEY = 'cc_click_logs';
const LS_STATS_KEY = 'cc_click_stats';
const MAX_LOGS = 100; // Keep last 100 rejected/skipped entries (successes are counted only)

/**
 * Log a click event.
 * @param {'ok'|'REJECTED:assignBusy'|'REJECTED:inactive'|'REJECTED:validated'|'REJECTED:processingPair'|'SKIPPED'|'NO_HANDLER'} type
 * @param {Object} details - { zoneId, type, content, gameActive, ... }
 */
export function logClick(type, details = {}) {
  try {
    // Always increment counters
    const stats = getClickStats();
    if (type === 'ok') {
      stats.ok = (stats.ok || 0) + 1;
    } else {
      stats.rejected = (stats.rejected || 0) + 1;
      // Count by rejection reason
      stats.byReason = stats.byReason || {};
      stats.byReason[type] = (stats.byReason[type] || 0) + 1;
    }
    stats.lastUpdate = new Date().toISOString();
    localStorage.setItem(LS_STATS_KEY, JSON.stringify(stats));

    // Only store details for rejected/skipped clicks (not successes to save space)
    if (type !== 'ok') {
      const logs = getClickLogs();
      logs.unshift({
        type,
        timestamp: new Date().toISOString(),
        zoneId: details.zoneId || null,
        zoneType: details.type || details.zoneType || null,
        content: details.content ? String(details.content).substring(0, 40) : null,
        gameActive: details.gameActive,
        extra: (() => {
          // Capture relevant guard states
          const e = {};
          if (details.assignInFlight !== undefined) e.assignInFlight = details.assignInFlight;
          if (details.assignBusy !== undefined) e.assignBusy = details.assignBusy;
          if (details.hasZone !== undefined) e.hasZone = details.hasZone;
          return Object.keys(e).length > 0 ? e : undefined;
        })(),
      });
      // Keep only the most recent logs
      while (logs.length > MAX_LOGS) logs.pop();
      localStorage.setItem(LS_KEY, JSON.stringify(logs));
    }
  } catch (e) {
    // Silent fail — never break the game for logging
  }
}

/**
 * Get all rejected/skipped click logs from localStorage.
 * @returns {Array}
 */
export function getClickLogs() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Get click statistics (ok count, rejected count, by reason).
 * @returns {{ ok: number, rejected: number, byReason: Object, lastUpdate: string }}
 */
export function getClickStats() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATS_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Clear all click logs and stats. Call at session start to get clean data.
 */
export function clearClickLogs() {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_STATS_KEY);
  } catch {}
}

/**
 * Reset stats only (keep logs). Useful at start of new game session.
 */
export function resetClickStats() {
  try {
    localStorage.removeItem(LS_STATS_KEY);
  } catch {}
}
