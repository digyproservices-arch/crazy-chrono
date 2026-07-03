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
});
