// =============================================
// Tests automatisés — serverZoneGenerator (Phase 3)
// Robot goûteur 🤖 : vérifie que le générateur de cartes fonctionne
// =============================================

const { generateRoundZones, evaluateCalcul, invalidateCache } = require('../utils/serverZoneGenerator');

// Vider le cache avant chaque test pour être déterministe
beforeEach(() => invalidateCache());

// =============================================
// 3.2 — Génère 16 zones avec 1 bonne paire
// =============================================
describe('generateRoundZones — structure de base', () => {
  test('retourne un objet avec zones (array) et goodPairIds', () => {
    const result = generateRoundZones(12345, { themes: ['nature'], classes: ['CP'] });
    expect(result).toBeDefined();
    expect(result).toHaveProperty('zones');
    expect(result).toHaveProperty('goodPairIds');
    expect(Array.isArray(result.zones)).toBe(true);
  });

  test('génère exactement 16 zones', () => {
    const result = generateRoundZones(12345, { themes: ['nature'], classes: ['CP'] });
    expect(result.zones).toHaveLength(16);
  });

  test('chaque zone a un id, un type et du contenu', () => {
    const result = generateRoundZones(99999, { themes: ['nature'], classes: ['CP'] });
    for (const zone of result.zones) {
      expect(zone).toHaveProperty('id');
      expect(zone).toHaveProperty('type');
      // Chaque zone doit avoir au moins content ou label
      const hasContent = (zone.content && String(zone.content).trim() !== '') ||
                         (zone.label && String(zone.label).trim() !== '');
      expect(hasContent).toBe(true);
    }
  });

  test('exactement 1 bonne paire est identifiée (goodPairIds non null)', () => {
    const result = generateRoundZones(42, { themes: ['nature'], classes: ['CP'] });
    expect(result.goodPairIds).not.toBeNull();
    expect(result.goodPairIds).toHaveProperty('pairId');
    expect(result.goodPairIds.pairId).toBeTruthy();
  });

  test('fonctionne avec différents seeds', () => {
    const seeds = [1, 100, 9999, 2147483646];
    for (const seed of seeds) {
      const result = generateRoundZones(seed, { themes: ['nature'], classes: ['CP'] });
      expect(result.zones).toHaveLength(16);
      expect(result.goodPairIds).not.toBeNull();
    }
  });
});

// =============================================
// 3.3 — pairId cohérents (calcul↔chiffre, texte↔image)
// =============================================
describe('generateRoundZones — cohérence des pairId', () => {
  test('exactement 2 zones partagent le même pairId de la bonne paire', () => {
    const result = generateRoundZones(12345, { themes: ['nature'], classes: ['CP'] });
    const goodPairId = result.goodPairIds.pairId;
    const zonesWithGoodPair = result.zones.filter(z => z.pairId === goodPairId);
    expect(zonesWithGoodPair).toHaveLength(2);
  });

  test('paire TI: une zone texte + une zone image', () => {
    // Essayer plusieurs seeds pour trouver une paire TI
    let found = false;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const result = generateRoundZones(seed, { themes: ['nature'], classes: ['CP'] });
      if (result.goodPairIds?.pairType === 'TI') {
        const goodPairId = result.goodPairIds.pairId;
        const paired = result.zones.filter(z => z.pairId === goodPairId);
        const types = paired.map(z => z.type).sort();
        expect(types).toEqual(['image', 'texte']);
        found = true;
      }
    }
    expect(found).toBe(true); // Au moins un seed doit produire une paire TI
  });

  test('paire CC: une zone calcul + une zone chiffre', () => {
    // Utiliser le vrai thème 'domain:math' avec classe CE2 (données existantes)
    let found = false;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const result = generateRoundZones(seed, { themes: ['domain:math'], classes: ['CE2'] });
      if (result.goodPairIds?.pairType === 'CC') {
        const goodPairId = result.goodPairIds.pairId;
        const paired = result.zones.filter(z => z.pairId === goodPairId);
        const types = paired.map(z => z.type).sort();
        expect(types).toEqual(['calcul', 'chiffre']);
        found = true;
      }
    }
    expect(found).toBe(true); // Au moins un seed doit produire une paire CC
  });

  test('les zones distracteurs n ont pas le même pairId que la bonne paire', () => {
    const result = generateRoundZones(777, { themes: ['nature'], classes: ['CP'] });
    const goodPairId = result.goodPairIds.pairId;
    const distractors = result.zones.filter(z => z.pairId !== goodPairId);
    // Les distracteurs ne doivent pas former de paire entre eux
    // (ou si pairId est undefined/null, c'est OK)
    expect(distractors.length).toBe(14); // 16 - 2 = 14 distracteurs
  });
});

// =============================================
// 3.4 — label/content correct par type de zone
// =============================================
describe('generateRoundZones — contenu par type', () => {
  test('zones texte ont un label ou content textuel (pas une URL)', () => {
    const result = generateRoundZones(12345, { themes: ['nature'], classes: ['CP'] });
    const textZones = result.zones.filter(z => z.type === 'texte');
    for (const z of textZones) {
      const text = z.label || z.content || '';
      expect(text).toBeTruthy();
      // Un texte ne devrait pas être une URL d'image
      expect(text).not.toMatch(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
    }
  });

  test('zones image ont un content qui ressemble à une URL ou un chemin image', () => {
    const result = generateRoundZones(12345, { themes: ['nature'], classes: ['CP'] });
    const imageZones = result.zones.filter(z => z.type === 'image');
    for (const z of imageZones) {
      const content = z.content || '';
      expect(content).toBeTruthy();
      // Doit être un chemin/URL d'image
      expect(content).toMatch(/\.(jpg|jpeg|png|gif|webp|svg)|images\//i);
    }
  });

  test('zones calcul: content contient une expression mathématique', () => {
    let found = false;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const result = generateRoundZones(seed, { themes: ['domain:math'], classes: ['CE2'] });
      const calculZones = result.zones.filter(z => z.type === 'calcul');
      if (calculZones.length > 0) {
        for (const z of calculZones) {
          const expr = z.content || z.label || '';
          expect(expr).toBeTruthy();
          // Devrait contenir un opérateur mathématique ou un mot-clé
          expect(expr).toMatch(/[+\-×÷=]|double|triple|moitié|tiers/i);
        }
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  test('zones chiffre: content est un nombre ou une représentation numérique', () => {
    let found = false;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const result = generateRoundZones(seed, { themes: ['domain:math'], classes: ['CE2'] });
      const chiffreZones = result.zones.filter(z => z.type === 'chiffre');
      if (chiffreZones.length > 0) {
        for (const z of chiffreZones) {
          const val = z.content || z.label || '';
          expect(val).toBeTruthy();
        }
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

// =============================================
// Phase 4 — Validation schéma (ZONE_SCHEMA.md)
// =============================================
describe('generateRoundZones — validation schéma zones', () => {
  test('toutes les zones ont un type valide', () => {
    const validTypes = new Set(['texte', 'image', 'calcul', 'chiffre']);
    const result = generateRoundZones(12345, { themes: ['nature'], classes: ['CP'] });
    for (const z of result.zones) {
      expect(validTypes.has(z.type)).toBe(true);
    }
  });

  test('zones calcul: content = expression, label = résultat', () => {
    let checked = 0;
    for (let seed = 1; seed < 50; seed++) {
      const result = generateRoundZones(seed, { themes: ['domain:math'], classes: ['CE2'] });
      const calculZones = result.zones.filter(z => z.type === 'calcul' && z.pairId);
      for (const z of calculZones) {
        // content doit contenir un opérateur (c'est l'expression)
        expect(z.content).toMatch(/[+\-×÷=]|double|triple|moiti|tiers/i);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('zones image: content est un chemin/URL image', () => {
    const result = generateRoundZones(12345, { themes: ['nature'], classes: ['CP'] });
    const imageZones = result.zones.filter(z => z.type === 'image');
    for (const z of imageZones) {
      expect(z.content).toMatch(/\.(jpg|jpeg|png|gif|webp|svg)|images\/|http/i);
    }
  });

  test('zones texte: content n est pas une URL image', () => {
    const result = generateRoundZones(12345, { themes: ['nature'], classes: ['CP'] });
    const textZones = result.zones.filter(z => z.type === 'texte');
    for (const z of textZones) {
      const c = z.content || z.label || '';
      expect(c).not.toMatch(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
    }
  });

  test('aucune zone vide (content ou label présent)', () => {
    for (let seed = 1; seed < 10; seed++) {
      const result = generateRoundZones(seed, { themes: ['nature'], classes: ['CP'] });
      for (const z of result.zones) {
        const c = String(z.content || '').trim();
        const l = String(z.label || '').trim();
        expect(c || l).toBeTruthy();
      }
    }
  });
});

// =============================================
// Bonus — evaluateCalcul
// =============================================
describe('evaluateCalcul — expressions mathématiques', () => {
  test('additions simples', () => {
    expect(evaluateCalcul('1 + 4')).toBe(5);
    expect(evaluateCalcul('3 + 7')).toBe(10);
  });

  test('soustractions', () => {
    expect(evaluateCalcul('10 - 3')).toBe(7);
  });

  test('multiplications avec ×', () => {
    expect(evaluateCalcul('4 × 2')).toBe(8);
    expect(evaluateCalcul('5 × 8')).toBe(40);
  });

  test('retourne null pour entrée invalide', () => {
    expect(evaluateCalcul('')).toBeNull();
    expect(evaluateCalcul(null)).toBeNull();
    expect(evaluateCalcul(undefined)).toBeNull();
  });
});
