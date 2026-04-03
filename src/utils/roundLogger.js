/**
 * Round Logger — Enregistre CHAQUE carte générée (tous modes) avec analyse complète.
 * Stockage localStorage pour visibilité immédiate dans le dashboard, sans auth.
 *
 * TERMINOLOGIE:
 *   - "round" / "carte" = un jeu de zones affiché à l'écran (chaque appel à logRound).
 *     Chaque validation de paire en multijoueur régénère une nouvelle carte (round:new).
 *   - "manche" = une période chronométrée (timer) qui peut contenir PLUSIEURS cartes.
 *     La manche se termine quand le timer expire (round:result côté serveur).
 *   - "session" = l'ensemble des manches jouées (défini par roundsPerSession).
 *
 * Donc: 1 session → N manches → M cartes par manche.
 * Chaque entrée dans ce logger = 1 carte générée, PAS 1 manche complète.
 *
 * Usage:
 *   import { logRound } from '../utils/roundLogger';
 *   logRound(zones, { mode: 'solo', source: 'solo:assignElements', assocData });
 */

const LS_KEY = 'cc_round_logs';
const MAX_LOGS = 100; // garder les 100 dernières manches

// ── Helpers ──────────────────────────────────────────────────

function normUrl(p) {
  if (!p) return '';
  try { p = decodeURIComponent(p); } catch {}
  return p.toLowerCase().replace(/\\/g, '/').split('/').pop();
}

function normText(t) {
  return String(t || '').trim().toLowerCase();
}

/**
 * Evaluate a calcul expression and return numeric result.
 * Recursive descent parser — handles chained ops (4×2×8=64), fractions (1/4+1/4=0.5),
 * parentheses, "X fois Y", "le double de X", "A op ? = C", FR decimals.
 */
function evalCalc(expr) {
  if (!expr) return null;
  let s = String(expr).trim().replace(/\u2212/g, '-');

  const _pn = (t) => { const c = String(t).replace(/\s/g, '').replace(/,/g, '.'); const v = parseFloat(c); return Number.isFinite(v) ? v : NaN; };
  const _r8 = (v) => Math.round(v * 1e8) / 1e8;

  // Textual: "X fois Y centièmes" → X * Y/100
  const foisCent = s.match(/^([\d\s,.]+)\s*fois\s+([\d\s,.]+)\s*centi[eè]mes?$/i);
  if (foisCent) {
    const a = parseFloat(foisCent[1].replace(/\s/g, '').replace(',', '.'));
    const b = parseFloat(foisCent[2].replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(a) && !isNaN(b)) return _r8(a * b / 100);
  }

  // Textual: "le/la double/moitié/tiers/quart/triple de X" — "le/la" optional
  const txtMatch = s.match(/^(?:l[ea]\s+)?(double|moiti[eé]|tiers|quart|triple)\s+de\s+([\d\s,.]+)/i);
  if (txtMatch) {
    const num = parseFloat(txtMatch[2].replace(/\s/g, '').replace(',', '.'));
    if (isNaN(num)) return null;
    switch (txtMatch[1].toLowerCase()) {
      case 'double': return num * 2;
      case 'triple': return num * 3;
      case 'moitie': case 'moitié': return num / 2;
      case 'tiers': return num / 3;
      case 'quart': return num / 4;
      default: return null;
    }
  }

  // Numération: "X dizaines/dixièmes/centièmes/quarts"
  const numMatch = s.match(/^([\d\s,.]+)\s*(dizaines?|dixi[eè]mes?|centi[eè]mes?|quarts?)$/i);
  if (numMatch) {
    const v = _pn(numMatch[1]); if (Number.isNaN(v)) return null;
    const u = numMatch[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (u.startsWith('dizaine')) return _r8(v * 10);
    if (u.startsWith('dixieme')) return _r8(v * 0.1);
    if (u.startsWith('centieme')) return _r8(v * 0.01);
    if (u.startsWith('quart')) return _r8(v * 0.25);
  }

  // Format "A = ?/B" → A * B
  const eqSlash = s.match(/^([\d\s,.]+)\s*=\s*\?\s*[\/÷]\s*([\d\s,.]+)$/);
  if (eqSlash) {
    const a = _pn(eqSlash[1]), b = _pn(eqSlash[2]);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return _r8(a * b);
  }

  // "A op ? = C"
  const unkMatch = s.match(/([\d\s,.]+)\s*([+\-×x*÷\/])\s*\?\s*=\s*([\d\s,.]+)/);
  if (unkMatch) {
    const c = parseFloat(unkMatch[3].replace(/\s/g, '').replace(',', '.'));
    if (isNaN(c)) return null;
    return _r8(c);
  }

  // "? op B = C"
  const unkMatch2 = s.match(/\?\s*([+\-×x*÷\/])\s*([\d\s,.]+)\s*=\s*([\d\s,.]+)/);
  if (unkMatch2) {
    const op = unkMatch2[1], b = _pn(unkMatch2[2]), c = _pn(unkMatch2[3]);
    if (Number.isNaN(b) || Number.isNaN(c)) return null;
    let r;
    const opN = op === '×' || op === 'x' ? '*' : op === '÷' ? '/' : op;
    switch (opN) { case '+': r = c-b; break; case '-': r = c+b; break; case '*': r = b!==0?c/b:NaN; break; case '/': r = c!==0?c*b:NaN; break; default: return null; }
    return Number.isFinite(r) ? _r8(r) : null;
  }

  // Normalize: replace unicode ops, "fois" → *, FR decimals, thousand separators
  let norm = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/:/g, '/').replace(/−/g, '-');
  norm = norm.replace(/\bfois\b/gi, '*');
  norm = norm.replace(/,/g, '.');
  norm = norm.replace(/(\d)\s+(\d{3})(?!\d)/g, '$1$2');
  norm = norm.replace(/\s/g, '');
  if (!/^[\d.+\-*/()]+$/.test(norm)) return null;

  // Tokenize
  const tokens = [];
  let i = 0;
  while (i < norm.length) {
    if (norm[i] === '(' || norm[i] === ')') { tokens.push(norm[i]); i++; }
    else if ('+-*/'.includes(norm[i])) {
      if (norm[i] === '-' && (tokens.length === 0 || tokens[tokens.length - 1] === '(' || typeof tokens[tokens.length - 1] === 'string' && '+-*/'.includes(tokens[tokens.length - 1]))) {
        let num = '-'; i++;
        while (i < norm.length && (norm[i] >= '0' && norm[i] <= '9' || norm[i] === '.')) { num += norm[i]; i++; }
        if (num === '-') return null;
        tokens.push(parseFloat(num));
      } else { tokens.push(norm[i]); i++; }
    } else if (norm[i] >= '0' && norm[i] <= '9' || norm[i] === '.') {
      let num = '';
      while (i < norm.length && (norm[i] >= '0' && norm[i] <= '9' || norm[i] === '.')) { num += norm[i]; i++; }
      tokens.push(parseFloat(num));
    } else { return null; }
  }

  // Recursive descent parser with correct precedence
  let pos = 0;
  function parseExpr() {
    let left = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++]; const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseTerm() {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++]; const right = parseFactor();
      if (op === '*') left *= right;
      else { if (right === 0) return NaN; left /= right; }
    }
    return left;
  }
  function parseFactor() {
    if (tokens[pos] === '(') { pos++; const val = parseExpr(); if (tokens[pos] === ')') pos++; return val; }
    if (typeof tokens[pos] === 'number') return tokens[pos++];
    return NaN;
  }
  const result = parseExpr();
  if (pos !== tokens.length) return null;
  return Number.isFinite(result) ? Math.round(result * 1e8) / 1e8 : null;
}

function parseChiffre(content) {
  if (!content) return null;
  const s = String(content).trim().replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  // If simple number, return it
  if (!isNaN(n) && /^-?[\d.]+$/.test(s)) return Math.round(n * 1e8) / 1e8;
  // Fallback: evaluate as expression (handles fractions like "1/2", "1/4 + 1/4")
  const exprResult = evalCalc(content);
  if (exprResult !== null) return exprResult;
  // Last resort
  return isNaN(n) ? null : Math.round(n * 1e8) / 1e8;
}

/**
 * Detect false calc-chiffre pairs among distractors and verify official pair math.
 */
function analyzeCalcNumPairs(zones) {
  const issues = [];
  const calculZones = zones.filter(z => z.type === 'calcul');
  const chiffreZones = zones.filter(z => z.type === 'chiffre');
  if (calculZones.length === 0 || chiffreZones.length === 0) return issues;

  const calculs = calculZones.map(z => ({
    zone: z, value: evalCalc(z.content), isPaired: !!(z.pairId || '').trim()
  }));
  const chiffres = chiffreZones.map(z => ({
    zone: z, value: parseChiffre(z.content), isPaired: !!(z.pairId || '').trim()
  }));

  // 1) Official pair math correctness
  for (const calc of calculs) {
    if (!calc.isPaired || calc.value === null) continue;
    const pid = (calc.zone.pairId || '').trim();
    const paired = chiffres.find(c => (c.zone.pairId || '').trim() === pid);
    if (paired && paired.value !== null && calc.value !== paired.value) {
      issues.push({
        type: 'OFFICIAL_PAIR_MATH_ERROR', severity: 'critical',
        calculZoneId: calc.zone.id, calculContent: String(calc.zone.content || '').substring(0, 50),
        calculResult: calc.value, chiffreZoneId: paired.zone.id,
        chiffreContent: String(paired.zone.content || '').substring(0, 20),
        chiffreValue: paired.value, pairId: pid,
        message: `Paire officielle incorrecte: "${calc.zone.content}" = ${calc.value}, mais chiffre = ${paired.value}`
      });
    }
  }

  // 2) Distractor calc x distractor chiffre false pairs
  const dCalcs = calculs.filter(c => !c.isPaired && c.value !== null);
  const dChiffres = chiffres.filter(c => !c.isPaired && c.value !== null);
  for (const calc of dCalcs) {
    for (const ch of dChiffres) {
      if (calc.value === ch.value) {
        issues.push({
          type: 'FALSE_CALC_NUM_PAIR', severity: 'critical',
          calculZoneId: calc.zone.id, calculContent: String(calc.zone.content || '').substring(0, 50),
          calculResult: calc.value, chiffreZoneId: ch.zone.id,
          chiffreContent: String(ch.zone.content || '').substring(0, 20), chiffreValue: ch.value,
          message: `Fausse paire calcul-chiffre: "${calc.zone.content}" = ${calc.value} et chiffre "${ch.zone.content}" = ${ch.value}`
        });
      }
    }
  }

  // 3) Cross-contamination: distractor matches paired value
  const pChiffres = chiffres.filter(c => c.isPaired && c.value !== null);
  const pCalcs = calculs.filter(c => c.isPaired && c.value !== null);
  for (const calc of dCalcs) {
    for (const ch of pChiffres) {
      if (calc.value === ch.value) {
        issues.push({
          type: 'DISTRACTOR_MATCHES_PAIRED', severity: 'warning',
          calculZoneId: calc.zone.id, calculContent: String(calc.zone.content || '').substring(0, 50),
          calculResult: calc.value, chiffreZoneId: ch.zone.id,
          chiffreContent: String(ch.zone.content || '').substring(0, 20), chiffreValue: ch.value,
          message: `Distracteur calcul "${calc.zone.content}" = ${calc.value} matches paired chiffre "${ch.zone.content}"`
        });
      }
    }
  }
  for (const ch of dChiffres) {
    for (const calc of pCalcs) {
      if (calc.value === ch.value) {
        issues.push({
          type: 'DISTRACTOR_MATCHES_PAIRED', severity: 'warning',
          calculZoneId: calc.zone.id, calculContent: String(calc.zone.content || '').substring(0, 50),
          calculResult: calc.value, chiffreZoneId: ch.zone.id,
          chiffreContent: String(ch.zone.content || '').substring(0, 20), chiffreValue: ch.value,
          message: `Distracteur chiffre "${ch.zone.content}" = ${ch.value} matches paired calcul "${calc.zone.content}"`
        });
      }
    }
  }

  return issues;
}

/**
 * Analyse les zones d'une manche pour détecter les doubles paires visuelles.
 * Utilise les IDs des éléments via assocData (fiable) ET un fallback par contenu.
 */
function analyzeDoublePairs(zones, assocData) {
  const issues = [];
  if (!assocData || !assocData.associations) return issues;

  const associations = assocData.associations || [];
  const imgTxtAssocs = associations.filter(a => a.imageId && a.texteId);

  // Build lookup maps: image filename → image IDs, text content → text IDs
  const imgIdByFile = new Map();
  for (const img of (assocData.images || [])) {
    const key = normUrl(img.url || img.path || img.src || '');
    if (key) imgIdByFile.set(key, String(img.id));
  }
  const txtIdByContent = new Map();
  for (const txt of (assocData.textes || [])) {
    const key = normText(txt.content);
    if (key) txtIdByContent.set(key, String(txt.id));
  }

  // Build set of valid associations: "imageId|texteId"
  const assocSet = new Set(imgTxtAssocs.map(a => `${a.imageId}|${a.texteId}`));

  // Identify the "official" pair (zones with pairId)
  const pairedZones = zones.filter(z => (z.pairId || '').trim());
  const pairedPairIds = new Set(pairedZones.map(z => z.pairId));

  // Identify distractor images and texts (zones without pairId or with broken pairId)
  const imageZones = zones.filter(z => (z.type || 'image') === 'image');
  const texteZones = zones.filter(z => z.type === 'texte');

  // For each image zone, resolve its element ID
  const resolvedImages = imageZones.map(z => {
    const file = normUrl(z.content || '');
    const elementId = imgIdByFile.get(file) || null;
    return { zone: z, elementId, file, isPaired: !!(z.pairId || '').trim() };
  });

  // For each text zone, resolve its element ID
  const resolvedTexts = texteZones.map(z => {
    const content = normText(z.content || z.label || '');
    const elementId = txtIdByContent.get(content) || null;
    return { zone: z, elementId, content, isPaired: !!(z.pairId || '').trim() };
  });

  // Check ALL combinations of image × text for valid associations
  // Flag as "double pair" if both are NOT the official pair
  for (const img of resolvedImages) {
    if (!img.elementId) continue;
    for (const txt of resolvedTexts) {
      if (!txt.elementId) continue;
      const key = `${img.elementId}|${txt.elementId}`;
      if (!assocSet.has(key)) continue;

      // This image + text form a valid association
      // Check if they share the same pairId (= they ARE the official pair)
      const imgPid = (img.zone.pairId || '').trim();
      const txtPid = (txt.zone.pairId || '').trim();
      if (imgPid && txtPid && imgPid === txtPid) continue; // official pair, OK

      // Double pair detected!
      issues.push({
        type: 'DOUBLE_PAIR_VISUAL',
        severity: 'critical',
        imageZoneId: img.zone.id,
        imageFile: img.file,
        imageElementId: img.elementId,
        imagePairId: imgPid || '(none)',
        texteZoneId: txt.zone.id,
        texteContent: (txt.zone.content || '').substring(0, 50),
        texteElementId: txt.elementId,
        textePairId: txtPid || '(none)',
        message: `Fausse paire visuelle: image "${img.file}" (id:${img.elementId}) + texte "${(txt.zone.content || '').substring(0, 30)}" (id:${txt.elementId}) forment une association valide mais ne sont PAS la paire officielle`
      });
    }
  }

  return issues;
}

/**
 * Résumé compact des zones pour le log.
 */
function summarizeZones(zones) {
  const byType = { image: 0, texte: 0, calcul: 0, chiffre: 0 };
  const paired = [];
  const distractors = [];
  for (const z of zones) {
    const t = z.type || 'image';
    byType[t] = (byType[t] || 0) + 1;
    const pid = (z.pairId || '').trim();
    if (pid) {
      paired.push({ id: z.id, type: t, content: String(z.content || '').substring(0, 40), pairId: pid });
    } else {
      distractors.push({ id: z.id, type: t, content: String(z.content || '').substring(0, 40) });
    }
  }
  return { totalZones: zones.length, byType, pairedCount: paired.length, paired, distractorCount: distractors.length, distractors };
}

// ── Public API ───────────────────────────────────────────────

/**
 * Enregistre une manche complète dans localStorage.
 * @param {Array} zones - Les zones de la carte
 * @param {Object} options - { mode, source, assocData, extra }
 * @returns {Object} Le log créé (avec issues détectées)
 */
export function logRound(zones, options = {}) {
  if (!Array.isArray(zones) || zones.length === 0) return null;

  const { mode, source, assocData, extra } = options;

  // Analyse double paires texte-image
  const doublePairIssues = analyzeDoublePairs(zones, assocData);

  // Analyse fausses paires calcul-chiffre
  const calcNumIssues = analyzeCalcNumPairs(zones);
  doublePairIssues.push(...calcNumIssues);

  // Résumé zones
  const summary = summarizeZones(zones);

  // Nombre de paires valides (groupes de 2 zones avec le même pairId)
  const pairGroups = new Map();
  for (const z of zones) {
    const pid = (z.pairId || '').trim();
    if (pid) {
      if (!pairGroups.has(pid)) pairGroups.set(pid, []);
      pairGroups.get(pid).push(z);
    }
  }
  const validPairsCount = [...pairGroups.values()].filter(g => g.length === 2).length;

  const log = {
    id: `round_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    mode: mode || 'unknown',
    source: source || '',
    validPairs: validPairsCount,
    doublePairIssues: doublePairIssues.length,
    issues: doublePairIssues,
    summary,
    extra: extra || null,
    // Snapshot complet pour debug (compressé: seulement id, type, content, pairId, isDistractor)
    zonesSnapshot: zones.map(z => ({
      id: z.id,
      type: z.type || 'image',
      content: String(z.content || '').substring(0, 80),
      pairId: z.pairId || '',
      isDistractor: !!z.isDistractor
    }))
  };

  // Log console immédiat
  if (doublePairIssues.length > 0) {
    console.error(`[RoundLogger] 🚨 ${doublePairIssues.length} DOUBLE PAIRE(S) DÉTECTÉE(S) — mode: ${mode}`, doublePairIssues);
  } else {
    console.log(`[RoundLogger] ✅ Manche enregistrée — mode: ${mode}, paires: ${validPairsCount}, zones: ${zones.length}`);
  }

  // Sauvegarder dans localStorage
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    existing.push(log);
    const trimmed = existing.slice(-MAX_LOGS);
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[RoundLogger] Erreur sauvegarde localStorage:', e);
  }

  // Sync vers le backend (async, non-bloquant)
  syncRoundToBackend(log);

  return log;
}

/**
 * Envoie un round log au backend pour persistance serveur.
 */
async function syncRoundToBackend(log) {
  try {
    const { getBackendUrl } = await import('./apiHelpers');
    const backendUrl = getBackendUrl();
    const headers = { 'Content-Type': 'application/json' };
    // Ajouter le token si disponible (optionnel — le monitoring fonctionne sans auth)
    try {
      const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
    } catch {}
    await fetch(`${backendUrl}/api/monitoring/client-rounds`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rounds: [log] }),
    });
  } catch (e) {
    console.warn('[RoundLogger] Sync backend failed:', e.message);
  }
}

/**
 * Lire tous les round logs depuis localStorage.
 */
export function getRoundLogs() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch { return []; }
}

/**
 * Vider les round logs.
 */
export function clearRoundLogs() {
  localStorage.removeItem(LS_KEY);
}
