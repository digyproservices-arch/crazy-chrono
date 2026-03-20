// ============================================================
// SERVER-SIDE ZONE VALIDATION
// Détection d'anomalies sur les zones générées côté serveur
// (double PA, fausse paire calcul-chiffre, etc.)
// ============================================================

const fs = require('fs');
const path = require('path');
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// ── Parse operation (recursive descent parser — handles chained ops, fractions, parentheses) ──
function parseOperation(s) {
  if (!s) return null;
  const raw = String(s).trim();
  const _pn = (t) => { const c = String(t).replace(/\s/g, '').replace(/,/g, '.'); const v = parseFloat(c); return Number.isFinite(v) ? v : NaN; };
  const _r8 = (v) => Math.round(v * 1e8) / 1e8;
  // Format textuel
  const tm = raw.match(/^l[ea]\s+(double|triple|tiers|quart|moiti[ée])\s+de\s+(.+)$/i);
  if (tm) {
    const k = tm[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const v = _pn(tm[2]); if (Number.isNaN(v)) return null;
    let r; switch (k) { case 'double': r = v * 2; break; case 'triple': r = v * 3; break; case 'moitie': r = v / 2; break; case 'tiers': r = v / 3; break; case 'quart': r = v / 4; break; default: return null; }
    return Number.isFinite(r) ? { result: _r8(r) } : null;
  }
  // Format "A op ? = C"
  const norm = raw.replace(/×/g, '*').replace(/÷/g, '/').replace(/:/g, '/').replace(/−/g, '-');
  const um = norm.match(/^(.+?)\s*([+\-*/])\s*\?\s*=\s*(.+)$/);
  if (um) {
    const a = _pn(um[1]), op = um[2], c = _pn(um[3]);
    if (Number.isNaN(a) || Number.isNaN(c)) return null;
    let r; switch (op) { case '+': r = c - a; break; case '-': r = a - c; break; case '*': r = a !== 0 ? c / a : NaN; break; case '/': r = c !== 0 ? a / c : NaN; break; default: return null; }
    return Number.isFinite(r) ? { result: _r8(r) } : null;
  }
  // Expression générale (recursive descent parser)
  const result = _safeEvalMath(norm);
  return result !== null ? { result } : null;
}

function _safeEvalMath(expr) {
  if (!expr) return null;
  let s = String(expr).replace(/,/g, '.');
  s = s.replace(/(\d)\s+(\d{3})(?!\d)/g, '$1$2');
  s = s.replace(/\s/g, '');
  if (!/^[\d.+\-*/()]+$/.test(s)) return null;
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '(' || s[i] === ')') { tokens.push(s[i]); i++; }
    else if ('+-*/'.includes(s[i])) {
      if (s[i] === '-' && (tokens.length === 0 || tokens[tokens.length - 1] === '(' || typeof tokens[tokens.length - 1] === 'string' && '+-*/'.includes(tokens[tokens.length - 1]))) {
        let num = '-'; i++;
        while (i < s.length && (s[i] >= '0' && s[i] <= '9' || s[i] === '.')) { num += s[i]; i++; }
        if (num === '-') return null;
        tokens.push(parseFloat(num));
      } else { tokens.push(s[i]); i++; }
    } else if (s[i] >= '0' && s[i] <= '9' || s[i] === '.') {
      let num = '';
      while (i < s.length && (s[i] >= '0' && s[i] <= '9' || s[i] === '.')) { num += s[i]; i++; }
      tokens.push(parseFloat(num));
    } else { return null; }
  }
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

function normalizeType(t) {
  if (!t) return '';
  const x = String(t).toLowerCase().trim();
  if (['image', 'img', 'photo', 'picture'].includes(x)) return 'image';
  if (['texte', 'text', 'mot', 'word', 'label'].includes(x)) return 'texte';
  if (['calcul', 'calc', 'operation', 'op', 'math'].includes(x)) return 'calcul';
  if (['chiffre', 'nombre', 'number', 'num', 'result', 'resultat'].includes(x)) return 'chiffre';
  return x;
}

/**
 * Valide les zones d'une carte après génération.
 * @param {Array} zones - Tableau de zones
 * @param {Object} context - { source, matchId, roomCode, roundIndex }
 * @returns {Array} Liste d'anomalies détectées
 */
function validateZonesServer(zones, context = {}) {
  if (!Array.isArray(zones) || zones.length === 0) return [];

  const anomalies = [];
  const prefix = `[ZoneValidation][${context.source || 'unknown'}]`;

  // Grouper par pairId
  const pairGroups = new Map();
  for (const z of zones) {
    if (z.validated) continue;
    const pid = (z.pairId || z.pairID || '').toString().trim();
    if (!pid) continue;
    if (!pairGroups.has(pid)) pairGroups.set(pid, []);
    pairGroups.get(pid).push(z);
  }

  const validPairs = [...pairGroups.values()].filter(g => g.length === 2);

  // MULTIPLE_TARGETS: plus d'une PA sur la carte
  if (validPairs.length > 1) {
    const details = {
      type: 'MULTIPLE_TARGETS',
      count: validPairs.length,
      pairs: validPairs.map(g => ({
        pairId: (g[0].pairId || '').substring(0, 60),
        zones: g.map(z => ({ id: z.id, type: z.type, content: (z.content || z.label || '').substring(0, 50) })),
      })),
      ...context,
    };
    logger.error(`${prefix} CRITICAL: ${validPairs.length} PA détectées (attendu: 1)`, details);
    anomalies.push(details);
  }

  // ZERO_VALID_PAIRS
  if (validPairs.length === 0) {
    const details = { type: 'ZERO_VALID_PAIRS', totalZones: zones.length, pairGroups: pairGroups.size, ...context };
    logger.error(`${prefix} CRITICAL: Aucune PA détectée sur ${zones.length} zones`, details);
    anomalies.push(details);
  }

  // FALSE_CALC_NUM_PAIR: distractor calcul dont le résultat = distractor chiffre
  try {
    const distractorCalcs = zones.filter(z => !z.validated && normalizeType(z.type) === 'calcul' && !(z.pairId || '').trim());
    const distractorNums = zones.filter(z => !z.validated && normalizeType(z.type) === 'chiffre' && !(z.pairId || '').trim());
    if (distractorCalcs.length > 0 && distractorNums.length > 0) {
      const parseNum = (s) => { const v = parseFloat(String(s).replace(/\s/g, '').replace(/,/g, '.')); return Number.isFinite(v) ? Math.round(v * 1e8) / 1e8 : NaN; };
      const numValues = new Map();
      for (const n of distractorNums) {
        const v = parseNum(n.content);
        if (Number.isFinite(v)) numValues.set(v, n);
      }
      for (const c of distractorCalcs) {
        const parsed = parseOperation(c.content);
        if (parsed && Number.isFinite(parsed.result) && numValues.has(parsed.result)) {
          const matchingNum = numValues.get(parsed.result);
          const details = {
            type: 'FALSE_CALC_NUM_PAIR',
            calcZoneId: c.id,
            calcContent: (c.content || '').substring(0, 60),
            calcResult: parsed.result,
            numZoneId: matchingNum.id,
            numContent: (matchingNum.content || '').substring(0, 40),
            ...context,
          };
          logger.error(`${prefix} CRITICAL: Fausse paire calcul "${(c.content || '').substring(0, 40)}" = ${parsed.result} ↔ chiffre "${(matchingNum.content || '').substring(0, 20)}"`, details);
          anomalies.push(details);
        }
      }
    }
  } catch (e) {
    logger.warn(`${prefix} Erreur détection false calc-num pair:`, e.message);
  }

  // FALSE_TEXT_IMAGE_PAIR: distractor image + distractor texte formant une association valide
  try {
    // Charger associations.json (cache en mémoire)
    if (!validateZonesServer._assocCache) {
      try {
        const assocPath = path.join(__dirname, '..', '..', 'public', 'data', 'associations.json');
        validateZonesServer._assocCache = JSON.parse(fs.readFileSync(assocPath, 'utf-8'));
      } catch { validateZonesServer._assocCache = {}; }
    }
    const assoc = validateZonesServer._assocCache;
    if (assoc && assoc.associations && assoc.images && assoc.textes) {
      const normUrl = (p) => { if (!p) return ''; let s = String(p); try { s = decodeURIComponent(s); } catch {} return s.toLowerCase().replace(/\\/g, '/').replace(/.*\/images\//, '').replace(/%20/g, ' '); };
      const normTxt = (s) => String(s || '').trim().toLowerCase();
      const imgTxtPairs = new Set((assoc.associations || []).filter(a => a.imageId && a.texteId).map(a => `${a.imageId}|${a.texteId}`));
      const imgIdByUrl = new Map((assoc.images || []).map(i => [normUrl(i.url || i.path || i.src || ''), String(i.id)]));
      const txtIdByCont = new Map((assoc.textes || []).map(t => [normTxt(t.content), String(t.id)]));
      const distractorImgs = zones.filter(z => !z.validated && normalizeType(z.type) === 'image' && !(z.pairId || '').trim());
      const distractorTxts = zones.filter(z => !z.validated && normalizeType(z.type) === 'texte' && !(z.pairId || '').trim());
      for (const iz of distractorImgs) {
        const iId = imgIdByUrl.get(normUrl(iz.content));
        if (!iId) continue;
        for (const tz of distractorTxts) {
          const tId = txtIdByCont.get(normTxt(tz.content));
          if (tId && imgTxtPairs.has(`${iId}|${tId}`)) {
            const details = {
              type: 'FALSE_TEXT_IMAGE_PAIR',
              imageZoneId: iz.id,
              imageContent: (iz.content || '').substring(0, 60),
              texteZoneId: tz.id,
              texteContent: (tz.content || '').substring(0, 60),
              imageId: iId, texteId: tId,
              ...context,
            };
            logger.error(`${prefix} CRITICAL: Fausse paire image-texte: "${normUrl(iz.content)}" + "${(tz.content || '').substring(0, 30)}"`, details);
            anomalies.push(details);
          }
        }
      }
    }
  } catch (e) {
    logger.warn(`${prefix} Erreur détection false text-image pair:`, e.message);
  }

  // ORPHAN_ZONE: pairId avec une seule zone
  for (const [pid, group] of pairGroups) {
    if (group.length === 1) {
      const details = {
        type: 'ORPHAN_ZONE',
        pairId: pid.substring(0, 60),
        zone: { id: group[0].id, type: group[0].type, content: (group[0].content || '').substring(0, 50) },
        ...context,
      };
      logger.warn(`${prefix} ORPHAN: pairId "${pid.substring(0, 40)}" n'a qu'une seule zone`, details);
      anomalies.push(details);
    }
  }

  if (anomalies.length > 0) {
    logger.warn(`${prefix} ${anomalies.length} anomalie(s) détectée(s) sur cette carte`);
  } else {
    logger.info(`${prefix} OK: 1 PA, ${zones.length} zones, aucune anomalie`);
  }

  return anomalies;
}

module.exports = { validateZonesServer, parseOperation };
