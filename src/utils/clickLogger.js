/**
 * Click Logger — Enregistre TOUS les événements de clic pour le monitoring.
 * Stockage localStorage, visible dans le rapport monitoring sans avoir besoin de F12.
 *
 * Pipeline de clic:
 *   1. BOARD_CLICK  — clic détecté sur le plateau SVG (aucune zone n'a intercepté)
 *   2. ZONE_CLICK   — clic sur le <path> d'une zone
 *   3. LOUPE_CLICK  — clic intercepté par la loupe d'une zone image
 *   4. GAME_CLICK   — clic arrivé dans handleGameClick
 *   5. REJECTED:*   — clic rejeté par un guard (assignBusy, inactive, validated, processingPair)
 *   6. ACCEPTED      — clic accepté, zone sélectionnée
 *   7. PAIR_OK       — paire validée
 *   8. PAIR_FAIL     — paire incorrecte
 *
 * Usage:
 *   import { logClick, logClickAttempt, getClickLogs, getClickAttempts, getClickStats, clearClickLogs, formatClickReport } from '../utils/clickLogger';
 */

const LS_KEY = 'cc_click_logs';
const LS_STATS_KEY = 'cc_click_stats';
const LS_ATTEMPTS_KEY = 'cc_click_attempts';
const MAX_LOGS = 100;
const MAX_ATTEMPTS = 200; // Derniers 200 clics complets

/**
 * Log a click event (ancien système, conservé pour compatibilité).
 */
export function logClick(type, details = {}) {
  try {
    const stats = getClickStats();
    if (type === 'ok') {
      stats.ok = (stats.ok || 0) + 1;
    } else {
      stats.rejected = (stats.rejected || 0) + 1;
      stats.byReason = stats.byReason || {};
      stats.byReason[type] = (stats.byReason[type] || 0) + 1;
    }
    stats.lastUpdate = new Date().toISOString();
    localStorage.setItem(LS_STATS_KEY, JSON.stringify(stats));

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
          const e = {};
          if (details.assignInFlight !== undefined) e.assignInFlight = details.assignInFlight;
          if (details.assignBusy !== undefined) e.assignBusy = details.assignBusy;
          if (details.hasZone !== undefined) e.hasZone = details.hasZone;
          return Object.keys(e).length > 0 ? e : undefined;
        })(),
      });
      while (logs.length > MAX_LOGS) logs.pop();
      localStorage.setItem(LS_KEY, JSON.stringify(logs));
    }
  } catch (e) {
    // Silent fail
  }
}

/**
 * Log CHAQUE clic avec son contexte complet (nouveau système exhaustif).
 * @param {string} stage — étape du pipeline (BOARD_CLICK, ZONE_CLICK, LOUPE_CLICK, GAME_CLICK, REJECTED:*, ACCEPTED, PAIR_OK, PAIR_FAIL)
 * @param {Object} data — données complètes du clic
 */
export function logClickAttempt(stage, data = {}) {
  try {
    const attempts = getClickAttempts();
    attempts.push({
      stage,
      ts: new Date().toISOString(),
      x: data.x != null ? Math.round(data.x) : null,
      y: data.y != null ? Math.round(data.y) : null,
      zoneId: data.zoneId || null,
      zoneType: data.zoneType || null,
      content: data.content ? String(data.content).substring(0, 40) : null,
      reason: data.reason || null,
      candidates: data.candidates || null, // zones qui auraient dû recevoir le clic
      guardStates: data.guardStates || null,
      selectedIds: data.selectedIds || null,
    });
    while (attempts.length > MAX_ATTEMPTS) attempts.shift();
    localStorage.setItem(LS_ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch (e) {
    // Silent fail
  }
}

/**
 * Récupérer tous les clics enregistrés.
 */
export function getClickAttempts() {
  try {
    return JSON.parse(localStorage.getItem(LS_ATTEMPTS_KEY) || '[]');
  } catch {
    return [];
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
    localStorage.removeItem(LS_ATTEMPTS_KEY);
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

/**
 * Générer un rapport texte des clics pour le monitoring.
 * @returns {string}
 */
export function formatClickReport() {
  try {
    const stats = getClickStats();
    const attempts = getClickAttempts();
    const lines = [];

    // Résumé global
    lines.push(`Clics acceptés: ${stats.ok || 0} | Clics rejetés: ${stats.rejected || 0}`);
    if (stats.byReason && Object.keys(stats.byReason).length > 0) {
      lines.push(`Raisons de rejet:`);
      for (const [reason, count] of Object.entries(stats.byReason)) {
        lines.push(`  ${reason}: ${count}`);
      }
    }
    lines.push('');

    // Clics qui n'ont touché AUCUNE zone (BOARD_CLICK = clic perdu)
    const missed = attempts.filter(a => a.stage === 'BOARD_CLICK');
    lines.push(`Clics perdus (aucune zone touchée): ${missed.length}`);
    missed.slice(-20).forEach((m, i) => {
      const candidateStr = m.candidates && m.candidates.length > 0
        ? ` → zones proches: ${m.candidates.map(c => `${c.id}(${c.type}:${c.content || ''})`).join(', ')}`
        : ' → aucune zone proche';
      lines.push(`  [${i+1}] ${m.ts} pos=(${m.x},${m.y})${candidateStr}`);
    });
    lines.push('');

    // Clics interceptés par la loupe
    const loupeClicks = attempts.filter(a => a.stage === 'LOUPE_CLICK');
    lines.push(`Clics interceptés par loupe: ${loupeClicks.length}`);
    loupeClicks.slice(-10).forEach((l, i) => {
      lines.push(`  [${i+1}] ${l.ts} zone=${l.zoneId} pos=(${l.x},${l.y})`);
    });
    lines.push('');

    // Clics rejetés par handleGameClick
    const rejected = attempts.filter(a => a.stage.startsWith('REJECTED'));
    lines.push(`Clics rejetés par handleGameClick: ${rejected.length}`);
    rejected.slice(-20).forEach((r, i) => {
      lines.push(`  [${i+1}] ${r.ts} ${r.stage} zone=${r.zoneId}(${r.zoneType}) "${r.content || ''}" guards=${JSON.stringify(r.guardStates || {})}`);
    });
    lines.push('');

    // Pipeline complet des 50 derniers clics
    lines.push(`--- Pipeline complet (50 derniers clics) ---`);
    attempts.slice(-50).forEach((a, i) => {
      const base = `[${i+1}] ${a.ts} ${a.stage}`;
      const zone = a.zoneId ? ` zone=${a.zoneId}(${a.zoneType})` : '';
      const pos = (a.x != null) ? ` pos=(${a.x},${a.y})` : '';
      const content = a.content ? ` "${a.content}"` : '';
      const reason = a.reason ? ` raison=${a.reason}` : '';
      lines.push(`  ${base}${zone}${pos}${content}${reason}`);
    });

    return lines.join('\n');
  } catch (e) {
    return 'Erreur génération rapport clics: ' + (e.message || e);
  }
}
