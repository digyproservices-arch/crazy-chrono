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
import { assignElementsToZones, resetElementDecks, computeFilteredThemeTotals, computeObjectiveSessionTargets, getFrozenObjectiveSessionTargets, demoteCategory, clearDemotedCategory } from '../elementsLoader';
import { initMasteryTracker, resetMasterySession, recordPair } from '../masteryTracker';
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

  test('Phase 2 (objectif-intelligent): tirage priorisé — catégories complétées évitées', async () => {
    const cfg = {
      mode: 'solo',
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      themes: COMPUTED_THEMES,
      objectiveMode: true,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
    };
    localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
    localStorage.removeItem('cc_mastery_progress');
    initMasteryTracker(assocData, null);
    resetMasterySession();
    resetElementDecks('test-priority-' + Math.random());
    const rng = makeRng(11);
    // Simuler: les 4 catégories MATH sont complétées cette session (5 paires chacune)
    const validated = new Set();
    const mathCats = ['category:addition', 'category:table_4', 'category:table_5', 'category:table_6'];
    for (const cat of mathCats) {
      const pairs = (assocData.associations || [])
        .filter(a => a.calculId && a.chiffreId && (a.themes || []).includes(cat))
        .slice(0, 5);
      expect(pairs.length).toBe(5);
      for (const a of pairs) {
        const pid = `assoc-calc-${a.calculId}-num-${a.chiffreId}`;
        recordPair(pid, true, 1000);
        validated.add(pid);
      }
    }
    // Plateau mixte: TI et CC possibles → la priorité doit imposer TI (math complété = rang 2)
    const MIXED_ZONES = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: 3000 + i, type: 'texte' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 4000 + i, type: 'image' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 5000 + i, type: 'calcul' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 6000 + i, type: 'chiffre' })),
    ];
    let tiGood = 0, ccGood = 0;
    for (let r = 0; r < 20; r++) {
      const result = await assignElementsToZones(MIXED_ZONES.map(z => ({ ...z })), null, assocData, rng, validated);
      if (result.some(z => z.type === 'texte' && (z.pairId || '').trim())) tiGood++;
      if (result.some(z => z.type === 'calcul' && (z.pairId || '').trim())) ccGood++;
    }
    console.log('[REPRO][Phase 2] bonnes paires TI:', tiGood, '| CC:', ccGood, '(math complété → attendu 100% TI)');
    expect(tiGood).toBe(20); // toutes les bonnes paires viennent des catégories NON complétées (nature/animaux)
    expect(ccGood).toBe(0);  // plus jamais de paire math tant que d'autres catégories attendent
  });

  test('Phase 3 (objectif-intelligent): catégorie ACQUISE → cible révision R=2; rétrogradée → N=5', () => {
    const cfg = {
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      objectiveMode: true,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
    };
    localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
    localStorage.removeItem('cc_mastery_progress');
    localStorage.removeItem('cc_obj_demoted');
    initMasteryTracker(assocData, null);
    resetMasterySession();
    // État initial (aucun historique): rien d'acquis, cibles = min(5, pool)
    let r = computeObjectiveSessionTargets(assocData, cfg);
    expect(Object.values(r.acquired).every(v => v === false)).toBe(true);
    expect(r.targets['category:fruit']).toBe(5);
    expect(r.targets['category:epice']).toBe(1);
    // Simuler: TOUTES les paires fruits CP trouvées (cumulé) → ACQUIS → cible révision 2
    const fruitPairs = (assocData.associations || [])
      .filter(a => a.texteId && a.imageId && (a.themes || []).includes('category:fruit') && a.levelClass === 'CP');
    expect(fruitPairs.length).toBe(12);
    for (const a of fruitPairs) recordPair(`assoc-img-${a.imageId}-txt-${a.texteId}`, true, 1000);
    r = computeObjectiveSessionTargets(assocData, cfg);
    console.log('[REPRO][Phase 3] fruit acquis:', r.acquired['category:fruit'], '| cible:', r.targets['category:fruit'], '| pool:', r.poolTotals['category:fruit']);
    expect(r.acquired['category:fruit']).toBe(true);
    expect(r.targets['category:fruit']).toBe(2);           // révision R=2
    expect(r.poolTotals['category:fruit']).toBe(12);       // pool inchangé (info)
    expect(r.acquired['category:oiseau']).toBe(false);     // oiseaux non acquis → cible pleine
    expect(r.targets['category:oiseau']).toBe(4);          // min(5, 4 dispo)
    // Révision ratée → rétrogradée: cible repasse à 5
    demoteCategory('category:fruit');
    r = computeObjectiveSessionTargets(assocData, cfg);
    expect(r.acquired['category:fruit']).toBe(false);
    expect(r.targets['category:fruit']).toBe(5);
    // Réhabilitée (seuil plein réussi sans erreur) → redevient acquise
    clearDemotedCategory('category:fruit');
    r = computeObjectiveSessionTargets(assocData, cfg);
    expect(r.acquired['category:fruit']).toBe(true);
    expect(r.targets['category:fruit']).toBe(2);
    localStorage.removeItem('cc_obj_demoted');
    localStorage.removeItem('cc_mastery_progress');
  });

  test('Phase 4 (objectif-intelligent): N réglable par le prof/parent (bornes 3-10)', () => {
    localStorage.removeItem('cc_mastery_progress');
    localStorage.removeItem('cc_obj_demoted');
    initMasteryTracker(assocData, null);
    resetMasterySession();
    const base = {
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      objectiveMode: true,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
    };
    // N=3 → grosses catégories plafonnées à 3, petites inchangées
    let r = computeObjectiveSessionTargets(assocData, { ...base, objectivePairsPerCategory: 3 });
    expect(r.targets['category:addition']).toBe(3);
    expect(r.targets['category:epice']).toBe(1);
    // N=10 → additions à 10 (29 dispo), oiseaux à 4 (pool limité)
    r = computeObjectiveSessionTargets(assocData, { ...base, objectivePairsPerCategory: 10 });
    expect(r.targets['category:addition']).toBe(10);
    expect(r.targets['category:oiseau']).toBe(4);
    // Hors bornes → clampé (99 → 10; 1 → 3); absent → défaut 5
    r = computeObjectiveSessionTargets(assocData, { ...base, objectivePairsPerCategory: 99 });
    expect(r.targets['category:addition']).toBe(10);
    r = computeObjectiveSessionTargets(assocData, { ...base, objectivePairsPerCategory: 1 });
    expect(r.targets['category:addition']).toBe(3);
    r = computeObjectiveSessionTargets(assocData, base);
    expect(r.targets['category:addition']).toBe(5);
  });

  test('RÉGRESSION (fausses paires visuelles): les 2 moitiés d\'une paire validée ne doivent jamais être placées ensemble comme distracteurs', async () => {
    const cfg = {
      mode: 'solo',
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      themes: COMPUTED_THEMES,
      objectiveMode: true,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
    };
    localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
    resetElementDecks('test-false-pair');
    const rng = makeRng(7);
    // Plateau mixte comme en jeu réel: images + textes + calculs + chiffres
    const MIXED_ZONES = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: 3000 + i, type: 'image' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 4000 + i, type: 'texte' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 5000 + i, type: 'calcul' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 6000 + i, type: 'chiffre' })),
    ];
    // Index complets (TOUTES associations, comme le détecteur de monitoring)
    const normFile = (u) => { let s = String(u || ''); try { s = decodeURIComponent(s); } catch {} return s.toLowerCase().replace(/\\/g, '/').split('/').pop(); };
    const imgIdByFile = new Map((assocData.images || []).map(i => [normFile(i.url), String(i.id)]));
    const txtIdByCont = new Map((assocData.textes || []).map(t => [String(t.content || '').trim().toLowerCase(), String(t.id)]));
    const imgTxtSet = new Set((assocData.associations || []).filter(a => a.imageId && a.texteId).map(a => `${a.imageId}|${a.texteId}`));
    const calcByContent = new Map((assocData.calculs || []).map(c => [String(c.content || '').trim(), String(c.id)]));
    const numByContent = new Map((assocData.chiffres || []).map(n => [String(n.content || '').trim(), String(n.id)]));
    const calcNumSet = new Set((assocData.associations || []).filter(a => a.calculId && a.chiffreId).map(a => `${a.calculId}|${a.chiffreId}`));

    const validated = new Set();
    const falsePairs = [];
    for (let r = 0; r < 60; r++) {
      const result = await assignElementsToZones(MIXED_ZONES.map(z => ({ ...z })), null, assocData, rng, validated);
      // Simuler la validation de la bonne paire (comme en session réelle)
      const good = result.find(z => z.pairId);
      if (good) validated.add(good.pairId);
      // Vérifier fausses paires TI parmi les distracteurs
      const dImgs = result.filter(z => z.isDistractor && (z.type || 'image') === 'image' && z.content);
      const dTxts = result.filter(z => z.isDistractor && z.type === 'texte' && z.content);
      for (const iz of dImgs) {
        const iId = imgIdByFile.get(normFile(iz.content));
        if (!iId) continue;
        for (const tz of dTxts) {
          const tId = txtIdByCont.get(String(tz.content || '').trim().toLowerCase());
          if (tId && imgTxtSet.has(`${iId}|${tId}`)) falsePairs.push(`R${r} TI: ${normFile(iz.content)} + ${tz.content}`);
        }
      }
      // Vérifier fausses paires CC parmi les distracteurs
      const dCalcs = result.filter(z => z.isDistractor && z.type === 'calcul' && z.content);
      const dNums = result.filter(z => z.isDistractor && z.type === 'chiffre' && z.content);
      for (const cz of dCalcs) {
        const cId = calcByContent.get(String(cz.content || '').trim());
        if (!cId) continue;
        for (const nz of dNums) {
          const nId = numByContent.get(String(nz.content || '').trim());
          if (nId && calcNumSet.has(`${cId}|${nId}`)) falsePairs.push(`R${r} CC: ${cz.content} + ${nz.content}`);
        }
      }
    }
    expect(falsePairs).toEqual([]);
  });

  test('RÉGRESSION (jeu interminable): la session objectif converge — les catégories incomplètes sont privilégiées', async () => {
    const { getObjectivePriorityData: getPrio } = require('../masteryTracker');
    const cfg = {
      mode: 'solo',
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      themes: COMPUTED_THEMES,
      objectiveMode: true,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
    };
    localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
    localStorage.removeItem('cc_mastery_progress');
    localStorage.removeItem('cc_obj_demoted');
    initMasteryTracker(assocData, null);
    resetMasterySession();
    resetElementDecks('test-endless');
    const rng = makeRng(2026);
    const MIXED_ZONES = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: 3000 + i, type: 'image' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 4000 + i, type: 'texte' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 5000 + i, type: 'calcul' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 6000 + i, type: 'chiffre' })),
    ];
    // Cibles de session (figées comme dans Carte.js)
    const { targets } = computeObjectiveSessionTargets(assocData, cfg);
    const totalTarget = Object.values(targets).reduce((s, n) => s + n, 0);
    expect(totalTarget).toBeGreaterThan(0);
    // pairId → catégorie (même logique que _computeFilteredThemePairIds: tag ∈ objectiveThemes)
    const objSet = new Set(OBJECTIVE_THEMES_FIXED);
    const pairCat = new Map();
    for (const a of (assocData.associations || [])) {
      const cat = (a.themes || []).map(String).find(t => objSet.has(t) && t.startsWith('category:'));
      if (!cat) continue;
      if (a.texteId && a.imageId) pairCat.set(`assoc-img-${a.imageId}-txt-${a.texteId}`, cat);
      if (a.calculId && a.chiffreId) pairCat.set(`assoc-calc-${a.calculId}-num-${a.chiffreId}`, cat);
    }
    const isComplete = () => {
      const { sessionFoundByCategory } = getPrio();
      return Object.entries(targets).every(([cat, t]) => (sessionFoundByCategory[cat.replace('category:', '')] || 0) >= t);
    };
    const validated = new Set();
    const wastedRounds = []; // manches proposant une catégorie déjà complétée alors qu'il en reste d'incomplètes
    let rounds = 0;
    const MAX_ROUNDS = totalTarget + 15;
    while (!isComplete() && rounds < MAX_ROUNDS) {
      rounds++;
      const result = await assignElementsToZones(MIXED_ZONES.map(z => ({ ...z })), null, assocData, rng, validated);
      const good = result.find(z => z.pairId);
      expect(good).toBeTruthy();
      const cat = pairCat.get(good.pairId);
      const { sessionFoundByCategory } = getPrio();
      const incomplete = Object.entries(targets)
        .filter(([c, t]) => (sessionFoundByCategory[c.replace('category:', '')] || 0) < t)
        .map(([c]) => c);
      if (cat && incomplete.length > 0 && !incomplete.includes(cat)) {
        wastedRounds.push(`R${rounds}: paire "${cat}" proposée alors qu'incomplètes = ${incomplete.join(',')}`);
      }
      // Valider la paire (comme le joueur)
      recordPair(good.pairId, true, 1000);
      validated.add(good.pairId);
    }
    const { sessionFoundByCategory } = getPrio();
    const remaining = Object.entries(targets)
      .filter(([c, t]) => (sessionFoundByCategory[c.replace('category:', '')] || 0) < t)
      .map(([c, t]) => `${c}: ${sessionFoundByCategory[c.replace('category:', '')] || 0}/${t}`);
    console.log('[REPRO][Session complète] manches:', rounds, '| cible totale:', totalTarget, '| manches gaspillées:', wastedRounds.length, wastedRounds.slice(0, 8), '| restants:', remaining);
    expect(remaining).toEqual([]);            // la session DOIT se terminer (pas de jeu interminable)
    expect(rounds).toBeLessThanOrEqual(MAX_ROUNDS - 1);
    expect(wastedRounds).toEqual([]);          // chaque manche doit cibler une catégorie incomplète
  });

  test('RÉGRESSION (cibles figées): acquisition en cours de session ne dévie pas le tirage — scénario oiseaux vécu', async () => {
    const { getObjectivePriorityData: getPrio } = require('../masteryTracker');
    const cfg = {
      mode: 'solo',
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: EXTRAS,
      themes: COMPUTED_THEMES,
      objectiveMode: true,
      objectiveThemes: OBJECTIVE_THEMES_FIXED,
    };
    localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
    localStorage.removeItem('cc_mastery_progress');
    localStorage.removeItem('cc_obj_demoted');
    initMasteryTracker(assocData, null);
    resetMasterySession();
    // Scénario vécu: 2 des 4 oiseaux CP déjà connus (sessions passées, cumul Maîtrise)
    const cpBirds = (assocData.associations || [])
      .filter(a => a.texteId && a.imageId && String(a.levelClass) === 'CP' && (a.themes || []).includes('category:oiseau'))
      .map(a => `assoc-img-${a.imageId}-txt-${a.texteId}`);
    expect(cpBirds.length).toBeGreaterThanOrEqual(3);
    recordPair(cpBirds[0], true, 800);
    recordPair(cpBirds[1], true, 800);
    // Nouvelle session: reset session (le cumul persiste), decks + cibles figées reset
    resetMasterySession();
    resetElementDecks('test-frozen-targets');
    const rng = makeRng(555);
    const MIXED_ZONES = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: 3000 + i, type: 'image' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 4000 + i, type: 'texte' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 5000 + i, type: 'calcul' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 6000 + i, type: 'chiffre' })),
    ];
    // Cibles figées (même source que Carte.js ET le tirage priorisé)
    const { targets } = getFrozenObjectiveSessionTargets(assocData, cfg);
    // Oiseaux non acquis (2 paires inconnues) → cible pleine min(N, pool)
    expect(targets['category:oiseau']).toBe(Math.min(5, cpBirds.length));
    const totalTarget = Object.values(targets).reduce((s, n) => s + n, 0);
    const isComplete = () => {
      const { sessionFoundByCategory } = getPrio();
      return Object.entries(targets).every(([cat, t]) => (sessionFoundByCategory[cat.replace('category:', '')] || 0) >= t);
    };
    const validated = new Set();
    let rounds = 0;
    const MAX_ROUNDS = totalTarget + 15;
    while (!isComplete() && rounds < MAX_ROUNDS) {
      rounds++;
      const result = await assignElementsToZones(MIXED_ZONES.map(z => ({ ...z })), null, assocData, rng, validated);
      const good = result.find(z => z.pairId);
      expect(good).toBeTruthy();
      recordPair(good.pairId, true, 1000);
      validated.add(good.pairId);
    }
    const { sessionFoundByCategory } = getPrio();
    const remaining = Object.entries(targets)
      .filter(([c, t]) => (sessionFoundByCategory[c.replace('category:', '')] || 0) < t)
      .map(([c, t]) => `${c}: ${sessionFoundByCategory[c.replace('category:', '')] || 0}/${t}`);
    console.log('[REPRO][Cibles figées] manches:', rounds, '/', MAX_ROUNDS, '| cible totale:', totalTarget, '| restants:', remaining);
    expect(remaining).toEqual([]);   // oiseaux DOIT se compléter malgré l'acquisition en cours de session
    expect(rounds).toBeLessThanOrEqual(MAX_ROUNDS - 1);
    localStorage.removeItem('cc_mastery_progress');
  });

  test('RÉGRESSION (paires imposables): TOUTES les paires comptées dans les cibles sont posables — table_6 en CP (chiffres non taggés levelClass CE2)', async () => {
    // Bug vécu (session interminable tables 6/7): 5 des 12 paires de table_6 ont un chiffre
    // SANS tag category:table_6 (themes:["multiplication"], levelClass CE2). En CP + extra
    // table_6, ces chiffres échouaient au filtre de niveau ET au bypass extras → paires
    // comptées dans les cibles mais JAMAIS posables.
    const cfg = {
      mode: 'solo',
      selectedLevel: 'CP',
      classes: ['CP'],
      extras: ['category:table_6'],
      themes: COMPUTED_THEMES,
      objectiveMode: true,
      objectiveThemes: ['category:table_6'],
    };
    localStorage.setItem('cc_session_cfg', JSON.stringify(cfg));
    localStorage.removeItem('cc_mastery_progress');
    localStorage.removeItem('cc_obj_demoted');
    initMasteryTracker(assocData, null);
    resetMasterySession();
    resetElementDecks('test-drawable-pairs');
    const rng = makeRng(777);
    // Paires table_6 attendues (comptage au niveau ASSOCIATION, comme les cibles)
    const expectedPairIds = new Set(
      (assocData.associations || [])
        .filter(a => a.calculId && a.chiffreId && (a.themes || []).includes('category:table_6'))
        .map(a => `assoc-calc-${a.calculId}-num-${a.chiffreId}`)
    );
    expect(expectedPairIds.size).toBeGreaterThanOrEqual(10);
    const CC_ZONES = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: 7000 + i, type: 'calcul' })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: 8000 + i, type: 'chiffre' })),
    ];
    const validated = new Set();
    const MAX_ROUNDS = expectedPairIds.size + 10;
    let rounds = 0;
    while (validated.size < expectedPairIds.size && rounds < MAX_ROUNDS) {
      rounds++;
      const result = await assignElementsToZones(CC_ZONES.map(z => ({ ...z })), null, assocData, rng, validated);
      const good = result.find(z => z.type === 'calcul' && z.pairId);
      if (!good) break;
      expect(expectedPairIds.has(good.pairId)).toBe(true); // jamais hors table_6
      recordPair(good.pairId, true, 1000);
      validated.add(good.pairId);
    }
    console.log('[REPRO][Paires imposables] validées:', validated.size, '/', expectedPairIds.size, 'en', rounds, 'manches');
    // AVANT le fix: bloqué à 7/12 (chiffres 12/18/24/30/36 filtrés). APRÈS: 12/12.
    expect(validated.size).toBe(expectedPairIds.size);
    localStorage.removeItem('cc_mastery_progress');
    localStorage.removeItem('cc_session_cfg');
  });
});
