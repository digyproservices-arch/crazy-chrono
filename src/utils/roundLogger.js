/**
 * Round Logger — Enregistre CHAQUE manche jouée (tous modes) avec analyse complète.
 * Stockage localStorage pour visibilité immédiate dans le dashboard, sans auth.
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

  // Analyse double paires
  const doublePairIssues = analyzeDoublePairs(zones, assocData);

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

  return log;
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
