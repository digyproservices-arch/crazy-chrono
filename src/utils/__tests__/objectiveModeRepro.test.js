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
import { assignElementsToZones, resetElementDecks, computeFilteredThemeTotals } from '../elementsLoader';
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
// Spec "100% niveau choisi + extras": tous domaines actifs — math restreint à
// LEVEL_INCLUDES[niveau], non-math = toutes les catégories du domaine — + extras.
function computeObjectiveThemesLikeFix(selectedLevel, selectedExtras) {
  const tags = [];
  CONTENT_DOMAINS.forEach(d => {
    if (d.key === 'math') {
      const inc = LEVEL_INCLUDES[selectedLevel] || new Set();
      inc.forEach(c => { if (!tags.includes(c)) tags.push(c); });
    } else {
      d.categories.forEach(c => { if (!tags.includes(c)) tags.push(c); });
    }
  });
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
    // Index TI pour vérifier le niveau des bonnes paires texte/image
    const tiAssocByKey = new Map();
    for (const a of (assocData.associations || [])) {
      if (a.texteId && a.imageId) tiAssocByKey.set(`${a.imageId}|${a.texteId}`, a);
    }
    let emptyTexteImage = 0;
    let goodPairs = 0;
    const outOfLevelTI = [];
    for (let r = 0; r < 30; r++) {
      const result = await assignElementsToZones(MIXED_ZONES.map(z => ({ ...z })), null, assocData, rng, new Set());
      for (const z of result) {
        if ((z.type === 'texte' || z.type === 'image') && !(z.content || '').trim()) emptyTexteImage++;
      }
      // Spec: la bonne paire peut être TI OU CC, mais toujours du pool niveau+extras
      const tiZone = result.find(z => z.type === 'texte' && (z.pairId || '').trim());
      const ccZone = result.find(z => z.type === 'calcul' && (z.pairId || '').trim());
      if (tiZone || ccZone) goodPairs++;
      if (tiZone) {
        const m = String(tiZone.pairId).match(/^assoc-img-(.+)-txt-(.+)$/);
        const assoc = m ? tiAssocByKey.get(`${m[1]}|${m[2]}`) : null;
        if (String(assoc?.levelClass || '') !== 'CP') outOfLevelTI.push({ round: r, pairId: tiZone.pairId, levelClass: assoc?.levelClass });
      }
    }
    console.log('[REPRO][Plateau mixte] zones texte/image vides:', emptyTexteImage, '| manches avec bonne paire:', goodPairs, '/30 | TI hors niveau:', outOfLevelTI.length);
    expect(emptyTexteImage).toBe(0);   // bug "cartes vides" corrigé
    expect(goodPairs).toBe(30);        // toujours exactement une bonne paire
    expect(outOfLevelTI).toEqual([]);  // bug "Jaguar CM1 en CP" corrigé
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

  test('Totaux objectifs: comptés sur le pool filtré niveau+extras (atteignables)', () => {
    const cfg = {
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      objectiveMode: true,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
    };
    const totals = computeFilteredThemeTotals(assocData, cfg);
    console.log('[REPRO][Totaux filtrés]', totals);
    // Les extras cochés doivent être comptables (objectif jouable)
    expect(totals['category:table_4'] || 0).toBeGreaterThan(0);
    expect(totals['category:table_5'] || 0).toBeGreaterThan(0);
    // Chaque total filtré ≤ total global de la catégorie (jamais plus)
    const globalCount = {};
    for (const a of (assocData.associations || [])) {
      for (const t of (a.themes || [])) {
        if (String(t).startsWith('category:')) globalCount[t] = (globalCount[t] || 0) + 1;
      }
    }
    for (const [theme, n] of Object.entries(totals)) {
      expect(n).toBeLessThanOrEqual(globalCount[theme] || 0);
    }
    // Une catégorie math hors niveau CP (ex: division) ne doit pas figurer dans les totaux
    expect(totals['category:division']).toBeUndefined();
    expect(totals['category:fraction']).toBeUndefined();
    // Catégories non-math SANS contenu CP (vérifié dans les données): absentes des totaux
    // (bug constaté: "Plantes médicinales 0/14" affiché en CP alors que 0 paire CP)
    expect(totals['category:plante_medicinale']).toBeUndefined();
    expect(totals['category:poisson']).toBeUndefined();
    expect(totals['category:corail']).toBeUndefined();
    expect(totals['category:tubercule']).toBeUndefined();
    // Catégories non-math AVEC contenu CP: présentes et au bon compte
    expect(totals['category:fruit']).toBe(12);
    expect(totals['category:oiseau']).toBe(4);
  });

  test('Phase 1 (objectif-intelligent): seuil N=5 par catégorie → partie courte, petites catégories conservées', () => {
    const cfg = {
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      objectiveMode: true,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
    };
    const totals = computeFilteredThemeTotals(assocData, cfg);
    // Réplique du calcul Carte.js (OBJ_PAIRS_PER_CATEGORY = 5)
    const N = 5;
    const targets = Object.fromEntries(Object.entries(totals).map(([t, n]) => [t, Math.min(N, n)]));
    console.log('[REPRO][Phase 1] Objectifs de session:', targets);
    // Grosses catégories plafonnées à N
    expect(targets['category:addition']).toBe(5);
    expect(targets['category:fruit']).toBe(5);
    expect(targets['category:table_4']).toBe(5);
    // Petites catégories JAMAIS retirées (exigence Marius): objectif = leur taille réelle
    expect(targets['category:epice']).toBe(1);
    expect(targets['category:mollusque']).toBe(1);
    expect(targets['category:reptile']).toBe(1);
    // Toute catégorie du pool reste un objectif (aucune perte)
    expect(Object.keys(targets).sort()).toEqual(Object.keys(totals).sort());
    // La partie est nettement raccourcie: somme des seuils << somme du pool
    const sumTargets = Object.values(targets).reduce((a, b) => a + b, 0);
    const sumPool = Object.values(totals).reduce((a, b) => a + b, 0);
    console.log('[REPRO][Phase 1] paires à trouver:', sumTargets, '/ pool complet:', sumPool);
    expect(sumTargets).toBeGreaterThan(0);
    expect(sumTargets).toBeLessThanOrEqual(sumPool);
    expect(sumTargets).toBeLessThan(sumPool * 0.6);
  });
});
