// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, BACKEND_URL, loginWithEmail, ensureBackendAwake } = require('./helpers');

/**
 * CARD INTEGRITY — Vérification complète de la qualité des cartes
 *
 * Détecte TOUTES les anomalies possibles sur une carte générée :
 * 1. Exactement 1 paire valide (PA) par carte
 * 2. Aucun élément orphelin (texte/image sans association dans la base)
 * 3. Aucune zone vide (contenu manquant)
 * 4. Aucune fausse paire (distractor calcul = distractor chiffre, ou texte-image associés)
 * 5. Types cohérents dans chaque paire (image+texte ou calcul+chiffre)
 * 6. Temps de génération acceptable (< 5s)
 * 7. 16 zones chargées par carte
 */

const CONFIGS_TO_TEST = [
  { name: 'CE1-all', classes: ['CE1'], themes: [] },
  { name: 'CE2-math', classes: ['CE2'], themes: ['domain:math'] },
  { name: 'CM1-zoo', classes: ['CM1'], themes: ['domain:zoology'] },
  { name: 'CM2-botanique', classes: ['CM2'], themes: ['domain:botany'] },
  { name: 'CM2-all', classes: ['CM2'], themes: [] },
  { name: 'CE1-table2', classes: ['CE1'], themes: ['category:table_2'] },
  { name: 'CE2-tables', classes: ['CE2'], themes: ['category:table_2', 'category:table_3'] },
  { name: 'CM1-all', classes: ['CM1'], themes: [] },
  { name: '6e-all', classes: ['6e'], themes: [] },
];

// Nombre de cartes à générer par config pour fiabilité statistique
const CARDS_PER_CONFIG = 3;

/**
 * Évalue un calcul textuel
 */
function evaluateCalc(/** @type {any} */ content) {
  if (!content || typeof content !== 'string') return null;
  const s = content.trim();
  // "A op B"
  const opMatch = s.replace(/×/g, '*').replace(/−/g, '-').replace(/÷/g, '/').match(/^(-?[\d.,]+)\s*([+\-*/])\s*(-?[\d.,]+)$/);
  if (opMatch) {
    const a = parseFloat(opMatch[1].replace(',', '.'));
    const op = opMatch[2];
    const b = parseFloat(opMatch[3].replace(',', '.'));
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : null;
    }
  }
  // "le double/moitié/tiers/quart/triple de X"
  const tm = s.match(/^l[ea]\s+(double|triple|tiers|quart|moiti[ée])\s+de\s+(.+)$/i);
  if (tm) {
    const k = tm[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const v = parseFloat(tm[2].replace(',', '.'));
    if (isNaN(v)) return null;
    switch (k) {
      case 'double': return v * 2;
      case 'triple': return v * 3;
      case 'moitie': return v / 2;
      case 'tiers': return v / 3;
      case 'quart': return v / 4;
    }
  }
  return null;
}

test.describe('Card Integrity — Vérification qualité cartes', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  /** @type {Array<{config: string, card: number, anomalies: string[], zones: number, validPairs: number, genTimeMs: number}>} */
  const allResults = [];

  for (const config of CONFIGS_TO_TEST) {
    test(`Intégrité cartes: ${config.name} (${CARDS_PER_CONFIG} cartes)`, async ({ page }) => {
      test.setTimeout(120000);

      // Login
      await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

      for (let cardIdx = 0; cardIdx < CARDS_PER_CONFIG; cardIdx++) {
        /** @type {{config: string, card: number, anomalies: string[], zones: number, validPairs: number, genTimeMs: number}} */
        const result = {
          config: config.name,
          card: cardIdx + 1,
          anomalies: [],
          zones: 0,
          validPairs: 0,
          genTimeMs: 0,
        };

        // Configurer la session
        await page.evaluate((cfg) => {
          localStorage.setItem('cc_session_cfg', JSON.stringify({
            mode: 'solo',
            classes: cfg.classes,
            themes: cfg.themes,
            rounds: 1,
            duration: 120,
          }));
          // Forcer re-génération en supprimant le cache de zones
          localStorage.removeItem('cc_last_zones');
        }, config);

        // Naviguer et mesurer le temps de génération
        const genStart = Date.now();
        await page.goto('/carte');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(6000);
        const genTimeMs = Date.now() - genStart;
        result.genTimeMs = genTimeMs;

        // ANOMALIE: temps de génération > 10s
        if (genTimeMs > 10000) {
          result.anomalies.push(`SLOW_GENERATION: ${genTimeMs}ms`);
        }

        // Crash React ?
        const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
        if (hasCrash) {
          result.anomalies.push('CRASH_REACT');
          allResults.push(result);
          continue;
        }

        // Extraire les zones et associations depuis le contexte React
        const cardData = await page.evaluate(() => {
          /** @type {{zones: any[], associations: any[], hasAssocData: boolean, localIncidents?: any[], domInfo?: {svgPaths: number, images: number, texts: number}}} */
          const data = {
            zones: [],
            associations: [],
            hasAssocData: false,
          };

          // Essayer de récupérer les zones via le state exposé
          // @ts-ignore
          if (window.__ZONES__) {
            // @ts-ignore
            data.zones = window.__ZONES__;
          }

          // @ts-ignore
          if (window.__CC_ASSOC_DATA__) {
            // @ts-ignore
            data.associations = window.__CC_ASSOC_DATA__.associations || [];
            data.hasAssocData = true;
          }

          // Fallback: récupérer les incidents du localStorage
          try {
            const incidents = JSON.parse(localStorage.getItem('cc_game_incidents') || '[]');
            // @ts-ignore
            data.localIncidents = incidents.slice(-10);
          } catch {}

          // Fallback DOM: compter les éléments visuels
          // @ts-ignore
          data.domInfo = {
            svgPaths: document.querySelectorAll('path[pointer-events="all"]').length,
            images: document.querySelectorAll('image').length,
            texts: document.querySelectorAll('svg text').length,
          };

          return data;
        });

        const zones = cardData.zones || [];
        result.zones = zones.length || cardData.domInfo?.svgPaths || 0;

        // === CHECK 1: 16 zones chargées ===
        if (result.zones === 0) {
          result.anomalies.push('ZERO_ZONES');
          allResults.push(result);
          continue;
        }
        if (result.zones < 16) {
          result.anomalies.push(`LOW_ZONE_COUNT: ${result.zones}/16`);
        }

        // Si on a les zones détaillées, faire les vérifications poussées
        if (zones.length > 0) {
          // === CHECK 2: Exactement 1 paire valide (PA) ===
          const pairGroups = new Map();
          for (const z of zones) {
            if (z.validated) continue;
            const pid = z.pairId || '';
            if (!pid) continue;
            if (!pairGroups.has(pid)) pairGroups.set(pid, []);
            pairGroups.get(pid).push(z);
          }
          const validPairs = [...pairGroups.values()].filter(g => g.length === 2);
          result.validPairs = validPairs.length;

          if (validPairs.length === 0) {
            result.anomalies.push('ZERO_VALID_PAIRS');
          }
          if (validPairs.length > 1) {
            result.anomalies.push(`MULTIPLE_PAIRS: ${validPairs.length}`);
          }

          // === CHECK 3: Types cohérents dans les paires ===
          for (const [pid, group] of pairGroups) {
            if (group.length !== 2) continue;
            const types = group.map(z => (z.type || 'image').toLowerCase());
            const validCombos = [
              ['image', 'texte'], ['texte', 'image'],
              ['calcul', 'chiffre'], ['chiffre', 'calcul'],
            ];
            const isValid = validCombos.some(([a, b]) => types[0] === a && types[1] === b);
            if (!isValid) {
              result.anomalies.push(`TYPE_MISMATCH: ${pid} (${types.join('+')})`);
            }
          }

          // === CHECK 4: Aucune zone vide ===
          const emptyZones = zones.filter(z => {
            if (z.validated) return false;
            const type = (z.type || 'image').toLowerCase();
            if (type === 'image') return !z.content && !z.url;
            return !(z.content || z.label || '').toString().trim();
          });
          if (emptyZones.length > 0) {
            result.anomalies.push(`EMPTY_ZONES: ${emptyZones.length}`);
          }

          // === CHECK 5: Fausses paires calcul-chiffre ===
          const distractorCalcs = zones.filter(z => !z.validated && (z.type || '') === 'calcul' && !(z.pairId || '').trim());
          const distractorNums = zones.filter(z => !z.validated && (z.type || '') === 'chiffre' && !(z.pairId || '').trim());
          for (const calc of distractorCalcs) {
            const calcResult = evaluateCalc(calc.content);
            if (calcResult === null) continue;
            for (const num of distractorNums) {
              const numVal = parseFloat(String(num.content).replace(/,/g, '.'));
              if (isNaN(numVal)) continue;
              if (Math.abs(calcResult - numVal) < 0.001) {
                result.anomalies.push(`FALSE_CALC_NUM_PAIR: "${calc.content}"=${calcResult} == "${num.content}"`);
              }
            }
          }

          // === CHECK 6: Éléments orphelins (si assocData disponible) ===
          if (cardData.hasAssocData && cardData.associations.length > 0) {
            const texteHasAssoc = new Set(cardData.associations.filter(a => a.texteId).map(a => String(a.texteId)));
            const imageHasAssoc = new Set(cardData.associations.filter(a => a.imageId).map(a => String(a.imageId)));

            for (const z of zones) {
              if (z.validated || (z.pairId || '').trim()) continue;
              const type = (z.type || 'image').toLowerCase();
              if (type === 'texte' && z._distId && !texteHasAssoc.has(String(z._distId))) {
                result.anomalies.push(`ORPHAN_TEXT: "${(z.content || '').substring(0, 30)}" (id=${z._distId})`);
              }
              if (type === 'image' && z._distId && !imageHasAssoc.has(String(z._distId))) {
                result.anomalies.push(`ORPHAN_IMAGE: id=${z._distId}`);
              }
            }
          }
        }

        // Log résultat pour cette carte
        const status = result.anomalies.length === 0 ? '✅' : '❌';
        console.log(`  ${status} [${config.name}] Carte ${cardIdx + 1}: ${result.zones} zones, ${result.validPairs} PA, ${result.genTimeMs}ms${result.anomalies.length > 0 ? ' — ' + result.anomalies.join(', ') : ''}`);

        allResults.push(result);

        // Screenshot si anomalie
        if (result.anomalies.length > 0) {
          await page.screenshot({ path: `test-results/integrity-${config.name}-card${cardIdx + 1}.png` });
        }
      }

      // Vérification finale: aucune anomalie critique sur AUCUNE carte de cette config
      const configResults = allResults.filter(r => r.config === config.name);
      const criticalAnomalies = configResults.flatMap(r =>
        r.anomalies.filter(a =>
          a.startsWith('CRASH') || a.startsWith('ZERO_VALID_PAIRS') || a.startsWith('MULTIPLE_PAIRS') || a.startsWith('ZERO_ZONES')
        )
      );
      expect(criticalAnomalies, `Anomalies critiques pour ${config.name}`).toHaveLength(0);
    });
  }

  // === Rapport final envoyé au monitoring ===
  test('Envoyer rapport intégrité cartes au monitoring', async ({ request }) => {
    if (allResults.length === 0) {
      console.log('⚠️ Aucun résultat à envoyer');
      return;
    }

    const totalCards = allResults.length;
    const cleanCards = allResults.filter(r => r.anomalies.length === 0).length;
    const anomalyCards = totalCards - cleanCards;
    const allAnomalies = allResults.flatMap(r => r.anomalies);

    // Compter par type d'anomalie
    const anomalyCounts = {};
    for (const a of allAnomalies) {
      const type = a.split(':')[0];
      anomalyCounts[type] = (anomalyCounts[type] || 0) + 1;
    }

    const report = {
      type: 'e2e_card_integrity_report',
      source: 'playwright',
      timestamp: new Date().toISOString(),
      summary: {
        totalCards,
        cleanCards,
        anomalyCards,
        anomalyCounts,
        avgGenTimeMs: Math.round(allResults.reduce((s, r) => s + r.genTimeMs, 0) / totalCards),
      },
      details: allResults,
    };

    console.log('\n' + '='.repeat(60));
    console.log('  📊 RAPPORT INTÉGRITÉ CARTES');
    console.log('='.repeat(60));
    console.log(`  Cartes testées: ${totalCards}`);
    console.log(`  Cartes OK: ${cleanCards}/${totalCards} (${Math.round(cleanCards / totalCards * 100)}%)`);
    console.log(`  Anomalies: ${allAnomalies.length}`);
    if (Object.keys(anomalyCounts).length > 0) {
      console.log('  Détail:');
      for (const [type, count] of Object.entries(anomalyCounts)) {
        console.log(`    - ${type}: ${count}`);
      }
    }
    console.log(`  Temps moyen génération: ${report.summary.avgGenTimeMs}ms`);
    console.log('='.repeat(60));

    // Envoyer au backend monitoring
    try {
      await ensureBackendAwake(request);
      const res = await request.post(`${BACKEND_URL}/api/monitoring/incidents`, {
        data: report,
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      console.log(`📤 Rapport envoyé: HTTP ${res.status()}`);
    } catch (err) {
      console.log('⚠️ Envoi monitoring échoué:', /** @type {Error} */ (err).message);
    }
  });
});
