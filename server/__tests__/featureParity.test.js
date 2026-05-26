// =============================================
// Test gardien de parité 🛡️
// Vérifie qu'aucune fonctionnalité n'est marquée "missing" ou "partial"
// dans le registre featureParity.json
//
// Si ce test échoue, ça veut dire qu'un mode de jeu a une disparité
// non résolue. Corrigez-la dans le code puis mettez à jour le registre.
//
// Lance avec : npm run test:server
// =============================================

const fs = require('fs');
const path = require('path');

const PARITY_FILE = path.join(__dirname, '..', 'data', 'featureParity.json');
const MODES = ['solo', 'salle_privee', 'grande_salle', 'training', 'arena'];

let registry;

beforeAll(() => {
  const raw = fs.readFileSync(PARITY_FILE, 'utf-8');
  registry = JSON.parse(raw);
});

describe('Registre de parité — aucune disparité', () => {
  test('Le fichier featureParity.json existe et est valide', () => {
    expect(registry).toBeDefined();
    expect(registry.categories).toBeDefined();
    expect(Array.isArray(registry.categories)).toBe(true);
    expect(registry.categories.length).toBeGreaterThan(0);
  });

  test('Chaque fonctionnalité a un statut pour les 5 modes', () => {
    for (const cat of registry.categories) {
      for (const feat of cat.features) {
        for (const mode of MODES) {
          expect(feat[mode]).toBeDefined();
          expect(['ok', 'na', 'missing', 'partial']).toContain(feat[mode]);
        }
      }
    }
  });

  test('Aucune fonctionnalité n\'est "missing"', () => {
    const missing = [];
    for (const cat of registry.categories) {
      for (const feat of cat.features) {
        for (const mode of MODES) {
          if (feat[mode] === 'missing') {
            missing.push(`${feat.id} → ${mode} = missing`);
          }
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `🚨 ${missing.length} disparité(s) détectée(s) :\n` +
        missing.map(m => `  - ${m}`).join('\n') +
        '\n\nCorrigez le code puis mettez à jour featureParity.json'
      );
    }
  });

  test('Aucune fonctionnalité n\'est "partial"', () => {
    const partial = [];
    for (const cat of registry.categories) {
      for (const feat of cat.features) {
        for (const mode of MODES) {
          if (feat[mode] === 'partial') {
            partial.push(`${feat.id} → ${mode} = partial`);
          }
        }
      }
    }
    if (partial.length > 0) {
      throw new Error(
        `⚠️ ${partial.length} fonctionnalité(s) partiellement implémentée(s) :\n` +
        partial.map(m => `  - ${m}`).join('\n') +
        '\n\nFinissez l\'implémentation puis mettez à jour featureParity.json'
      );
    }
  });
});
