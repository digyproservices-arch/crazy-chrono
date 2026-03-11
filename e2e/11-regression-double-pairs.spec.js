// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, BACKEND_URL, loginWithEmail, loginWithStudentCode } = require('./helpers');

/**
 * TEST DE RÉGRESSION — DOUBLE PAIRES
 * 
 * Le bug le plus critique de Crazy Chrono : une carte peut avoir 2 paires valides
 * au lieu d'une seule, ce qui bloque le joueur (la 2e paire est rejetée avec une croix).
 * 
 * Ce test :
 * 1. Charge 10 cartes solo avec différentes configurations
 * 2. Analyse les zones pour détecter des paires mathématiques ou textuelles en doublon
 * 3. Signale toute anomalie au monitoring
 */

const CONFIGS_TO_TEST = [
  { name: 'CE1-all', classes: ['CE1'], themes: [] },
  { name: 'CE2-math', classes: ['CE2'], themes: ['domain:math'] },
  { name: 'CM1-all', classes: ['CM1'], themes: [] },
  { name: 'CM2-botanique', classes: ['CM2'], themes: ['domain:botany'] },
  { name: 'CM2-all', classes: ['CM2'], themes: [] },
  { name: 'CE1-table2', classes: ['CE1'], themes: ['category:table_2'] },
  { name: 'CE2-tables', classes: ['CE2'], themes: ['category:table_2', 'category:table_3'] },
  { name: 'CM1-zoo', classes: ['CM1'], themes: ['domain:zoology'] },
  { name: 'CM2-fruit', classes: ['CM2'], themes: ['category:fruit'] },
  { name: '6e-all', classes: ['6e'], themes: [] },
];

/**
 * Évalue un calcul textuel et retourne le résultat numérique
 * @param {string} content
 * @returns {number|null}
 */
function evaluateCalc(content) {
  if (!content || typeof content !== 'string') return null;
  const s = content.trim();

  // Format "A × B" ou "A + B" etc.
  const opMatch = s.match(/^(\d+(?:[.,]\d+)?)\s*([×x*+\-−÷/])\s*(\d+(?:[.,]\d+)?)$/);
  if (opMatch) {
    const a = parseFloat(opMatch[1].replace(',', '.'));
    const op = opMatch[2];
    const b = parseFloat(opMatch[3].replace(',', '.'));
    if (op === '×' || op === 'x' || op === '*') return a * b;
    if (op === '+') return a + b;
    if (op === '-' || op === '−') return a - b;
    if (op === '÷' || op === '/') return b !== 0 ? a / b : null;
  }

  // Format "A op B = ?" ou "A op ? = C"
  const eqMatch = s.match(/^(\d+)\s*([×x*+\-−÷/])\s*(\d+|\?)\s*=\s*(\d+|\?)$/);
  if (eqMatch) {
    const a = parseFloat(eqMatch[1]);
    const op = eqMatch[2];
    const bStr = eqMatch[3];
    const cStr = eqMatch[4];
    if (bStr !== '?' && cStr === '?') {
      const b = parseFloat(bStr);
      if (op === '×' || op === 'x' || op === '*') return a * b;
      if (op === '+') return a + b;
      if (op === '-' || op === '−') return a - b;
      if (op === '÷' || op === '/') return b !== 0 ? a / b : null;
    }
    if (cStr !== '?') return parseFloat(cStr);
  }

  // Simple number
  const num = parseFloat(s.replace(',', '.'));
  if (!isNaN(num)) return num;

  return null;
}

/**
 * Détecte les doubles paires sur une carte
 * @param {Array<{id: string, type: string, content: string, pairId?: string}>} zones
 * @returns {{doublePairs: Array<{pair1: any, pair2: any, reason: string}>, officialPairs: number}}
 */
function detectDoublePairs(zones) {
  const doublePairs = [];

  // 1. Paires officielles (avec pairId)
  /** @type {Map<string, any[]>} */
  const pairGroups = new Map();
  for (const z of zones) {
    if (z.pairId) {
      if (!pairGroups.has(z.pairId)) pairGroups.set(z.pairId, []);
      pairGroups.get(z.pairId).push(z);
    }
  }
  const officialPairs = pairGroups.size;

  // 2. Détecter paires mathématiques non-officielles
  const calcZones = zones.filter(z => z.type === 'calcul');
  const chiffreZones = zones.filter(z => z.type === 'chiffre');

  for (const calc of calcZones) {
    const result = evaluateCalc(calc.content);
    if (result === null) continue;

    for (const chiffre of chiffreZones) {
      const chiffreVal = evaluateCalc(chiffre.content);
      if (chiffreVal === null) continue;

      // Si le calcul donne le même résultat qu'un chiffre
      if (Math.abs(result - chiffreVal) < 0.001) {
        // Vérifier que ce n'est pas la paire officielle
        if (calc.pairId && chiffre.pairId && calc.pairId === chiffre.pairId) continue;
        // C'est une double paire !
        doublePairs.push({
          pair1: { id: calc.id, type: calc.type, content: calc.content, pairId: calc.pairId },
          pair2: { id: chiffre.id, type: chiffre.type, content: chiffre.content, pairId: chiffre.pairId },
          reason: `Calcul "${calc.content}" = ${result} correspond au chiffre "${chiffre.content}" mais pas même pairId`,
        });
      }
    }
  }

  // 3. Détecter calculs qui correspondent entre eux
  for (let i = 0; i < calcZones.length; i++) {
    for (let j = i + 1; j < calcZones.length; j++) {
      const r1 = evaluateCalc(calcZones[i].content);
      const r2 = evaluateCalc(calcZones[j].content);
      if (r1 !== null && r2 !== null && Math.abs(r1 - r2) < 0.001) {
        if (calcZones[i].pairId && calcZones[j].pairId && calcZones[i].pairId === calcZones[j].pairId) continue;
        doublePairs.push({
          pair1: { id: calcZones[i].id, type: 'calcul', content: calcZones[i].content, pairId: calcZones[i].pairId },
          pair2: { id: calcZones[j].id, type: 'calcul', content: calcZones[j].content, pairId: calcZones[j].pairId },
          reason: `Deux calculs donnent le même résultat: "${calcZones[i].content}" et "${calcZones[j].content}" = ${r1}`,
        });
      }
    }
  }

  return { doublePairs, officialPairs };
}

test.describe('Régression Double Paires — Détection automatique', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  for (const config of CONFIGS_TO_TEST) {
    test(`Vérifier absence double-paire: ${config.name}`, async ({ page, request }) => {
      test.setTimeout(90000);

      // Login
      let studentCode = null;
      try {
        const loginRes = await request.post('https://dfrwoabuftlbrhqxnrbl.supabase.co/auth/v1/token?grant_type=password', {
          data: { email: TEST_ACCOUNTS.admin.email, password: TEST_ACCOUNTS.admin.password },
          headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmcndvYWJ1ZnRsYnJocXhucmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjY0MjExMjUsImV4cCI6MjA0MTk5NzEyNX0.o_WhCaOQ0fft-JI5cUwlOxonaVCmBYW2PfEb3KNkJMQ' },
        });
        if (loginRes.ok()) {
          const auth = await loginRes.json();
          const studentsRes = await request.get(`${BACKEND_URL}/api/admin/students`, {
            headers: { Authorization: `Bearer ${auth.access_token}` },
          });
          if (studentsRes.ok()) {
            const data = await studentsRes.json();
            const s = (data.students || []).find((/** @type {any} */ s) => s.access_code && s.licensed);
            if (s) studentCode = s.access_code;
          }
        }
      } catch {}

      if (!studentCode) {
        await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
      } else {
        await loginWithStudentCode(page, studentCode);
      }

      // Configurer la session
      await page.evaluate((/** @type {{classes: string[], themes: string[]}} */ cfg) => {
        localStorage.setItem('cc_session_cfg', JSON.stringify({
          mode: 'solo',
          classes: cfg.classes,
          themes: cfg.themes,
          rounds: 1,
          duration: 60,
        }));
      }, config);

      // Charger la carte
      await page.goto('/carte');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(6000);

      // Extraire les zones depuis le DOM
      const zones = await page.evaluate(() => {
        const results = [];
        // Chercher dans window.__ZONES__ ou dans le state React
        // @ts-ignore
        if (window.__ZONES__) {
          // @ts-ignore
          return window.__ZONES__;
        }

        // Fallback: chercher les data attributes sur les SVG paths
        const paths = document.querySelectorAll('svg path[data-zone-id]');
        paths.forEach(p => {
          results.push({
            id: p.getAttribute('data-zone-id') || '',
            type: p.getAttribute('data-zone-type') || '',
            content: p.getAttribute('data-zone-content') || '',
            pairId: p.getAttribute('data-pair-id') || '',
          });
        });

        // Si pas de data attributes, chercher les textes SVG
        if (results.length === 0) {
          const texts = document.querySelectorAll('svg text');
          texts.forEach(t => {
            const content = t.textContent?.trim();
            if (content) {
              results.push({ id: `text_${results.length}`, type: 'texte', content, pairId: '' });
            }
          });
        }

        return results;
      });

      console.log(`  [${config.name}] Zones trouvées: ${zones.length}`);

      if (zones.length > 0) {
        const { doublePairs, officialPairs } = detectDoublePairs(zones);

        console.log(`  [${config.name}] Paires officielles: ${officialPairs}`);
        console.log(`  [${config.name}] Double paires détectées: ${doublePairs.length}`);

        if (doublePairs.length > 0) {
          console.error(`  ❌ DOUBLE PAIRES DÉTECTÉES pour ${config.name}:`);
          for (const dp of doublePairs) {
            console.error(`    ${dp.reason}`);
          }

          // Envoyer au monitoring
          try {
            await request.post(`${BACKEND_URL}/api/monitoring/incidents`, {
              data: {
                type: 'DOUBLE_PAIR_REGRESSION',
                severity: 'critical',
                details: `E2E Regression: ${doublePairs.length} double-paire(s) détectée(s) pour config ${config.name}`,
                data: { config, doublePairs, zonesCount: zones.length },
                timestamp: new Date().toISOString(),
              },
            });
          } catch {}
        }

        // Le test échoue si des doubles paires sont trouvées
        expect(doublePairs, `Double paires détectées pour ${config.name}: ${doublePairs.map(d => d.reason).join('; ')}`).toHaveLength(0);
      }

      // Screenshot
      await page.screenshot({ path: `test-results/regression-${config.name}.png` });
    });
  }
});
