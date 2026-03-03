/**
 * Mastery Tracker — Tracks player progression toward theme mastery
 *
 * Tiers:
 *   Bronze  — All pairs of a theme found at least once (cumulative across sessions)
 *   Silver  — All pairs found without ANY error on that theme in a single session
 *   Gold    — Silver + average response time < 4 seconds per pair
 */

const STORAGE_KEY = 'cc_mastery_progress';
const GOLD_LATENCY_THRESHOLD_MS = 4000;

// Category code → Display label
const CATEGORY_LABELS = {
  'table_2': 'Table de 2',
  'table_3': 'Table de 3',
  'table_4': 'Table de 4',
  'table_5': 'Table de 5',
  'table_6': 'Table de 6',
  'table_7': 'Table de 7',
  'table_8': 'Table de 8',
  'table_9': 'Table de 9',
  'table_15': 'Table de 15',
  'addition': 'Additions',
  'soustraction': 'Soustractions',
  'division': 'Divisions',
  'multiplication_avancee': 'Multiplications avancées',
  'equation': 'Équations',
  'fraction': 'Fractions',
  'numeration': 'Numération',
  'fruit': 'Fruits',
  'legume': 'Légumes',
  'tubercule': 'Tubercules',
  'fleur': 'Fleurs',
  'plante_medicinale': 'Plantes médicinales',
  'plante_aromatique': 'Plantes aromatiques',
  'epice': 'Épices',
  'legumineuse': 'Légumineuses',
};

// State
let _themeMap = null;     // { categoryKey: { label, pairIds: Set, total } }
let _pairToTheme = null;  // Map<pairId, categoryKey>
let _progress = null;     // { categoryKey: { found: [...], tiers: { bronze, silver, gold } } }
let _sessionState = null; // { categoryKey: { found: Set, errors, totalLatencyMs } }
let _onMastery = null;    // callback(event) when mastery achieved

/**
 * Initialize the tracker with association data.
 * Call this once when associations.json is loaded.
 *
 * @param {Object} assocData - The parsed associations.json data
 * @param {Function} onMastery - Callback: ({ tier, category, label, total, found, avgLatencyMs })
 */
export function initMasteryTracker(assocData, onMastery) {
  if (!assocData || !Array.isArray(assocData.associations)) return;

  _onMastery = onMastery || null;
  _themeMap = {};
  _pairToTheme = new Map();

  for (const a of assocData.associations) {
    let pairId = null;
    if (a.texteId && a.imageId) {
      pairId = `assoc-img-${a.imageId}-txt-${a.texteId}`;
    } else if (a.calculId && a.chiffreId) {
      pairId = `assoc-calc-${a.calculId}-num-${a.chiffreId}`;
    }
    if (!pairId) continue;

    // Extract category from themes
    const themes = Array.isArray(a.themes) ? a.themes : [];
    const categoryTag = themes.find(t => t.startsWith('category:'));
    if (!categoryTag) continue;

    const categoryKey = categoryTag.replace('category:', '');

    if (!_themeMap[categoryKey]) {
      const raw = categoryKey;
      _themeMap[categoryKey] = {
        label: CATEGORY_LABELS[raw] || raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' '),
        pairIds: new Set(),
        total: 0,
      };
    }

    _themeMap[categoryKey].pairIds.add(pairId);
    _themeMap[categoryKey].total = _themeMap[categoryKey].pairIds.size;
    _pairToTheme.set(pairId, categoryKey);
  }

  // Load persistent progress from localStorage
  _loadProgress();

  // Reset session state
  _sessionState = {};
  for (const key of Object.keys(_themeMap)) {
    _sessionState[key] = { found: new Set(), errors: 0, totalLatencyMs: 0 };
  }

  console.log('[MasteryTracker] Initialized:', Object.keys(_themeMap).length, 'themes,', _pairToTheme.size, 'pairs mapped');
  try { window.ccAddDiag && window.ccAddDiag('mastery:init', { themes: Object.keys(_themeMap).length, pairs: _pairToTheme.size }); } catch (e) { /* ignore */ }
}

/**
 * Reset session state (call at the start of a new game session).
 */
export function resetMasterySession() {
  if (!_themeMap) return;
  _sessionState = {};
  for (const key of Object.keys(_themeMap)) {
    _sessionState[key] = { found: new Set(), errors: 0, totalLatencyMs: 0 };
  }
}

/**
 * Record a pair validation attempt.
 *
 * @param {string} pairId - The validated pair's ID (e.g., "assoc-calc-c123-num-n123")
 * @param {boolean} correct - Whether the attempt was correct
 * @param {number} latencyMs - Time taken for this pair (ms)
 * @returns {Object|null} - Mastery event if achieved, null otherwise
 */
export function recordPair(pairId, correct, latencyMs) {
  if (!_themeMap || !_pairToTheme || !pairId) return null;

  const categoryKey = _pairToTheme.get(pairId);
  if (!categoryKey) return null;

  const theme = _themeMap[categoryKey];
  if (!theme) return null;

  // Ensure progress entry exists
  if (!_progress[categoryKey]) {
    _progress[categoryKey] = { found: [], tiers: { bronze: null, silver: null, gold: null } };
  }

  // Ensure session state exists
  if (!_sessionState[categoryKey]) {
    _sessionState[categoryKey] = { found: new Set(), errors: 0, totalLatencyMs: 0 };
  }

  const prog = _progress[categoryKey];
  const sess = _sessionState[categoryKey];

  if (correct) {
    // Add to cumulative progress (Bronze)
    const foundSet = new Set(prog.found);
    const wasNew = !foundSet.has(pairId);
    foundSet.add(pairId);
    prog.found = [...foundSet];

    // Add to session progress (Silver/Gold)
    sess.found.add(pairId);
    sess.totalLatencyMs += (latencyMs || 0);

    _saveProgress();

    // Check for mastery achievements
    return _checkMastery(categoryKey, wasNew);
  } else {
    // Record error for this theme in session
    sess.errors++;
    return null;
  }
}

/**
 * Get current progress for all themes.
 * @returns {Array} - [{ key, label, found, total, tiers, sessionFound, sessionErrors }]
 */
export function getMasteryProgress() {
  if (!_themeMap) return [];

  return Object.entries(_themeMap).map(([key, theme]) => {
    const prog = _progress?.[key] || { found: [], tiers: { bronze: null, silver: null, gold: null } };
    const sess = _sessionState?.[key] || { found: new Set(), errors: 0, totalLatencyMs: 0 };
    return {
      key,
      label: theme.label,
      found: new Set(prog.found).size,
      total: theme.total,
      tiers: { ...prog.tiers },
      sessionFound: sess.found.size,
      sessionErrors: sess.errors,
    };
  }).filter(t => t.total > 0).sort((a, b) => {
    const pctA = a.found / a.total;
    const pctB = b.found / b.total;
    if (pctA !== pctB) return pctB - pctA;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Get progress for themes that are currently active in the session.
 * Only returns themes where at least 1 pair was found this session.
 */
export function getActiveSessionProgress() {
  if (!_themeMap || !_sessionState) return [];
  return getMasteryProgress().filter(t => {
    const sess = _sessionState?.[t.key];
    return sess && sess.found.size > 0;
  });
}

/**
 * Check if tracker is initialized
 */
export function isMasteryReady() {
  return !!_themeMap;
}

// ── Internal ──────────────────────────────────────────────

function _checkMastery(categoryKey, wasNewPair) {
  const theme = _themeMap[categoryKey];
  const prog = _progress[categoryKey];
  const sess = _sessionState[categoryKey];
  if (!theme || !prog || !sess) return null;

  const foundSet = new Set(prog.found);
  const allFound = foundSet.size >= theme.total;
  const sessionAllFound = sess.found.size >= theme.total;
  const noErrors = sess.errors === 0;
  const avgLatency = sess.found.size > 0 ? sess.totalLatencyMs / sess.found.size : Infinity;

  let achievedTier = null;

  // Gold: all pairs in session + no errors + fast
  if (sessionAllFound && noErrors && avgLatency <= GOLD_LATENCY_THRESHOLD_MS && !prog.tiers.gold) {
    prog.tiers.gold = new Date().toISOString();
    achievedTier = 'gold';
  }
  // Silver: all pairs in session + no errors
  else if (sessionAllFound && noErrors && !prog.tiers.silver) {
    prog.tiers.silver = new Date().toISOString();
    achievedTier = 'silver';
  }
  // Bronze: all pairs found cumulatively
  else if (allFound && !prog.tiers.bronze) {
    prog.tiers.bronze = new Date().toISOString();
    achievedTier = 'bronze';
  }

  if (achievedTier) {
    _saveProgress();

    const event = {
      tier: achievedTier,
      category: categoryKey,
      label: theme.label,
      total: theme.total,
      found: foundSet.size,
      avgLatencyMs: Math.round(avgLatency),
    };

    console.log(`[MasteryTracker] 🏆 ${achievedTier.toUpperCase()}: ${theme.label}!`);
    try { window.ccAddDiag && window.ccAddDiag(`mastery:${achievedTier}`, event); } catch (e) { /* ignore */ }

    if (_onMastery) {
      try { _onMastery(event); } catch (e) { console.error('[MasteryTracker] onMastery callback error:', e); }
    }

    return event;
  }

  // Log progress update even if no tier achieved
  if (wasNewPair) {
    try {
      window.ccAddDiag && window.ccAddDiag('mastery:progress', {
        category: categoryKey,
        label: theme.label,
        found: foundSet.size,
        total: theme.total,
        pct: Math.round((foundSet.size / theme.total) * 100),
      });
    } catch (e) { /* ignore */ }
  }

  return null;
}

function _loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _progress = raw ? JSON.parse(raw) : {};
  } catch (e) {
    _progress = {};
  }
}

function _saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_progress));
  } catch (e) { /* ignore */ }
}
