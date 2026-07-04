/**
 * 🔍 REPRO AUTONOME — Bug "Objectif activé" en mode solo
 *
 * Scénario: joueur CP + extras tables 4/5/6.
 *  - Objectif OFF → le plateau ne doit contenir que: additions (CP) + tables 4/5/6. ✅ (comportement de référence)
 *  - Objectif ON  → même attente pédagogique... mais bug: fractions/équations/tables 10-15 apparaissent. ❌
 *
 * Ce test appelle le VRAI assignElementsToZones avec les VRAIES données
 * server/data/associations.json et mesure la distribution des catégories
 * des bonnes paires générées sur N manches.
 *
 * Attendu APRÈS correction: les deux scénarios passent.
 * Aujourd'hui: le scénario "Objectif ON" DOIT échouer (preuve factuelle du bug).
 */

import fs from 'fs';
import path from 'path';
import { assignElementsToZones, resetElementDecks } from '../elementsLoader';
import { CONTENT_DOMAINS, LEVEL_INCLUDES } from '../../components/Shared/PedagogicConfig';

// ===== Données réelles =====
const assocData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../server/data/associations.json'), 'utf8')
);

// ===== Réplique EXACTE de computedThemes (PedagogicConfig.js:242-254) =====
// Tous domaines activés (défaut) + extras cochés → tags + TOUTES les catégories des domaines
function computeThemesLikePedagogicConfig(selectedExtras) {
  const tags = [];
  CONTENT_DOMAINS.forEach(d => {
    tags.push(...d.tags);
    d.categories.forEach(c => tags.push(c));
  });
  selectedExtras.forEach(e => { if (!tags.includes(e)) tags.push(e); });
  return tags;
}

// ===== Réplique EXACTE de objectiveComputedThemes (PedagogicConfig.js — FIX OBJECTIF) =====
// "100% ciblé": math actif → catégories math du niveau (LEVEL_INCLUDES) + extras UNIQUEMENT
function computeObjectiveThemesLikeFix(selectedLevel, selectedExtras) {
  const inc = LEVEL_INCLUDES[selectedLevel] || new Set();
  const tags = [];
  inc.forEach(c => { if (!tags.includes(c)) tags.push(c); });
  selectedExtras.forEach(e => { if (!tags.includes(e)) tags.push(e); });
  return tags;
}

const EXTRAS = ['category:table_4', 'category:table_5', 'category:table_6'];
const COMPUTED_THEMES = computeThemesLikePedagogicConfig(EXTRAS);
const OBJECTIVE_THEMES_FIXED = computeObjectiveThemesLikeFix('CP', EXTRAS);
// Catégories math pédagogiquement attendues pour CP + extras
const ALLOWED_MATH_CATS = new Set([...LEVEL_INCLUDES['CP'], ...EXTRAS]);

// Zones uniquement calcul/chiffre → force des paires Calcul-Chiffre (le cœur du bug)
const ZONES = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: 1000 + i, type: 'calcul' })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: 2000 + i, type: 'chiffre' })),
];

// RNG déterministe (reproductible)
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Index associations calc→num pour retrouver les thèmes de la bonne paire
const ccAssocByKey = new Map();
for (const a of (assocData.associations || [])) {
  if (a.calculId && a.chiffreId) ccAssocByKey.set(`${a.calculId}|${a.chiffreId}`, a);
}
const calcById = new Map((assocData.calculs || []).map(c => [c.id, c]));

async function collectGoodPairCategories(cfg, rounds = 120) {
  localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
  resetElementDecks('test-' + Math.random());
  const rng = makeRng(42);
  const catDistribution = {};
  const examples = {};
  for (let r = 0; r < rounds; r++) {
    const result = await assignElementsToZones(ZONES.map(z => ({ ...z })), null, assocData, rng, new Set());
    const calcZone = result.find(z => z.type === 'calcul' && z.pairId);
    if (!calcZone) continue;
    const m = String(calcZone.pairId).match(/^assoc-calc-(.+)-num-(.+)$/);
    if (!m) continue;
    const assoc = ccAssocByKey.get(`${m[1]}|${m[2]}`);
    const calc = calcById.get(m[1]);
    const cats = [
      ...(Array.isArray(assoc?.themes) ? assoc.themes : []),
      ...(Array.isArray(calc?.themes) ? calc.themes : []),
    ].filter(t => String(t).startsWith('category:'));
    const uniq = [...new Set(cats.map(String))];
    for (const c of uniq) {
      catDistribution[c] = (catDistribution[c] || 0) + 1;
      if (!examples[c] && calc?.content) examples[c] = calc.content;
    }
  }
  return { catDistribution, examples };
}

function forbiddenCats(catDistribution) {
  return Object.keys(catDistribution).filter(c => !ALLOWED_MATH_CATS.has(c));
}

describe('REPRO bug objectif solo — CP + tables 4/5/6', () => {
  jest.setTimeout(60000);

  afterEach(() => localStorage.removeItem('cc_session_cfg'));

  test('Objectif OFF (référence): uniquement additions CP + tables 4/5/6', async () => {
    const cfg = {
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      themes: COMPUTED_THEMES,
      objectiveMode: false,
      objectiveThemes: [],
      includeUntagged: true,
    };
    const { catDistribution, examples } = await collectGoodPairCategories(cfg);
    const forbidden = forbiddenCats(catDistribution);
    console.log('[REPRO][Objectif OFF] Distribution:', catDistribution);
    console.log('[REPRO][Objectif OFF] Exemples:', examples);
    console.log('[REPRO][Objectif OFF] Catégories interdites vues:', forbidden);
    expect(forbidden).toEqual([]);
  });

  test('Objectif ON: doit aussi se limiter à additions CP + tables 4/5/6', async () => {
    const cfg = {
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      themes: COMPUTED_THEMES,
      objectiveMode: true,
      objectiveTarget: 10,
      objectiveThemes: OBJECTIVE_THEMES_FIXED, // ← ce que PedagogicConfig émet APRÈS le fix
      includeUntagged: true,
    };
    const { catDistribution, examples } = await collectGoodPairCategories(cfg);
    const forbidden = forbiddenCats(catDistribution);
    console.log('[REPRO][Objectif ON] Distribution:', catDistribution);
    console.log('[REPRO][Objectif ON] Exemples:', examples);
    console.log('[REPRO][Objectif ON] Catégories interdites vues:', forbidden);
    expect(forbidden).toEqual([]);
  });

  test('Objectif ON: plateau mixte → zones texte/image remplies par des leurres (pas vides, non appariables)', async () => {
    const cfg = {
      mode: 'solo',
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      themes: COMPUTED_THEMES,
      objectiveMode: true,
      objectiveTarget: 10,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
      includeUntagged: true,
    };
    localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
    resetElementDecks('test-mixed-' + Math.random());
    const rng = makeRng(7);
    // Plateau réaliste type zones2: 4 texte, 4 image, 4 calcul, 4 chiffre
    const MIXED_ZONES = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: 3000 + i, type: 'texte' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 4000 + i, type: 'image' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 5000 + i, type: 'calcul' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 6000 + i, type: 'chiffre' })),
    ];
    let emptyTexteImage = 0;
    let tiPaired = 0;
    let ccPairs = 0;
    for (let r = 0; r < 30; r++) {
      const result = await assignElementsToZones(MIXED_ZONES.map(z => ({ ...z })), null, assocData, rng, new Set());
      for (const z of result) {
        if ((z.type === 'texte' || z.type === 'image')) {
          if (!(z.content || '').trim()) emptyTexteImage++;
          if ((z.pairId || '').trim()) tiPaired++;
        }
      }
      if (result.some(z => z.type === 'calcul' && (z.pairId || '').trim())) ccPairs++;
    }
    console.log('[REPRO][Plateau mixte] zones texte/image vides:', emptyTexteImage, '| appariables TI:', tiPaired, '| manches avec paire CC:', ccPairs, '/30');
    expect(emptyTexteImage).toBe(0);   // bug "cartes vides" corrigé
    expect(tiPaired).toBe(0);          // les leurres ne sont jamais appariables
    expect(ccPairs).toBe(30);          // la bonne paire reste 100% math
  });

  test('Objectif ON: pool épuisé (toutes paires validées) → fallback reste dans niveau + extras', async () => {
    const cfg = {
      mode: 'solo',
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      themes: COMPUTED_THEMES,
      objectiveMode: true,
      objectiveTarget: 10,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
      includeUntagged: true,
    };
    localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
    resetElementDecks('test-exhausted-' + Math.random());
    const rng = makeRng(99);
    // Épuiser le pool: exclure TOUTES les paires CC existantes (comme si tout était validé)
    const allPairIds = new Set(
      (assocData.associations || [])
        .filter(a => a.calculId && a.chiffreId)
        .map(a => `assoc-calc-${a.calculId}-num-${a.chiffreId}`)
    );
    const catDistribution = {};
    for (let r = 0; r < 40; r++) {
      const result = await assignElementsToZones(ZONES.map(z => ({ ...z })), null, assocData, rng, allPairIds);
      const calcZone = result.find(z => z.type === 'calcul' && z.pairId);
      if (!calcZone) continue;
      const m = String(calcZone.pairId).match(/^assoc-calc-(.+)-num-(.+)$/);
      if (!m) continue;
      const assoc = ccAssocByKey.get(`${m[1]}|${m[2]}`);
      const calc = calcById.get(m[1]);
      const cats = [
        ...(Array.isArray(assoc?.themes) ? assoc.themes : []),
        ...(Array.isArray(calc?.themes) ? calc.themes : []),
      ].filter(t => String(t).startsWith('category:'));
      for (const c of [...new Set(cats.map(String))]) {
        catDistribution[c] = (catDistribution[c] || 0) + 1;
      }
    }
    const forbidden = forbiddenCats(catDistribution);
    console.log('[REPRO][Pool épuisé] Distribution:', catDistribution, '| interdites:', forbidden);
    expect(forbidden).toEqual([]);     // bug "26,04 ÷ 2 en CP" corrigé
  });

  test('Objectif ON: aucune fausse paire calcul↔chiffre sur le plateau (2×4 vs 8)', async () => {
    const cfg = {
      mode: 'solo',
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      themes: COMPUTED_THEMES,
      objectiveMode: true,
      objectiveTarget: 10,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
      includeUntagged: true,
    };
    localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
    resetElementDecks('test-falsepair-' + Math.random());
    const rng = makeRng(1234);
    const evalCalc = (expr) => {
      const s = String(expr || '').replace(/×/g, '*').replace(/÷/g, '/').replace(/:/g, '/').replace(/\s/g, '').replace(/,/g, '.');
      const m = s.match(/^(-?[\d.]+)([+\-*/])(-?[\d.]+)$/);
      if (!m) return NaN;
      const a = parseFloat(m[1]), op = m[2], b = parseFloat(m[3]);
      switch (op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b ? a / b : NaN; default: return NaN; }
    };
    const falsePairs = [];
    for (let r = 0; r < 60; r++) {
      const result = await assignElementsToZones(ZONES.map(z => ({ ...z })), null, assocData, rng, new Set());
      const calcZones = result.filter(z => z.type === 'calcul' && (z.content || '').trim());
      const numZones = result.filter(z => z.type === 'chiffre' && (z.content || '').trim());
      for (const cz of calcZones) {
        const cr = evalCalc(cz.content);
        if (!Number.isFinite(cr)) continue;
        for (const nz of numZones) {
          const nv = parseFloat(String(nz.content).replace(/\s/g, '').replace(/,/g, '.'));
          if (!Number.isFinite(nv) || Math.round(cr * 1e8) !== Math.round(nv * 1e8)) continue;
          // valeur identique → doit être la bonne paire (mêmes pairId non vides)
          const samePair = (cz.pairId || '') !== '' && cz.pairId === nz.pairId;
          if (!samePair) falsePairs.push({ round: r, calc: cz.content, num: nz.content });
        }
      }
    }
    console.log('[REPRO][Fausses paires] détectées:', falsePairs.length, falsePairs.slice(0, 5));
    expect(falsePairs).toEqual([]);    // bug "2×4 ↔ 8 non cliquable" corrigé
  });
});
