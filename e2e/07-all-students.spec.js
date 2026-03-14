// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, BACKEND_URL } = require('./helpers');

/**
 * Tests complets pour TOUS les élèves (25 élèves)
 * 
 * Ce fichier :
 * 1. Se connecte en admin pour récupérer la liste de tous les élèves
 * 2. Teste le login de chaque élève via son code d'accès
 * 3. Vérifie que chaque élève peut charger le mode solo
 * 4. Détecte les anomalies : double paires, zones vides, erreurs JS
 * 5. Génère un rapport détaillé
 * 
 * ⚠️ Nécessite E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD en secrets GitHub
 */

// Résultats globaux pour le rapport
/** @type {{ startTime: string | null, endTime: string | null, totalStudents: number, loginSuccess: number, loginFailed: number, soloSuccess: number, soloFailed: number, anomalies: Array<{type: string, student: any, code: any, error?: any, details?: any, errors?: any, count?: number}>, details: Array<{name: string, code: string, loginOk: boolean, soloOk: boolean, anomalies: string[], jsErrors: string[], [key: string]: any}> }} */
const testResults = {
  startTime: null,
  endTime: null,
  totalStudents: 0,
  loginSuccess: 0,
  loginFailed: 0,
  soloSuccess: 0,
  soloFailed: 0,
  anomalies: [],
  details: [],
};

/** @type {Array<{full_name?: string, first_name?: string, last_name?: string, access_code: string, licensed?: boolean, [key: string]: any}>} */
let ALL_STUDENTS = [];
let ADMIN_TOKEN = '';

// ─── Phase 1 : Récupérer la liste des élèves via l'API admin ─────────────────
test.describe('Phase 1 — Préparation', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Login admin et récupération des 25 élèves', async ({ page }) => {
    testResults.startTime = new Date().toISOString();

    // Login admin pour obtenir le token
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"]', TEST_ACCOUNTS.admin.email);
    await page.fill('input[type="password"]', TEST_ACCOUNTS.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/modes', { timeout: 30000 });

    // Récupérer le token depuis localStorage
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth || '{}');
    ADMIN_TOKEN = auth.token;
    expect(ADMIN_TOKEN).toBeTruthy();

    // Récupérer la liste de tous les élèves
    const response = await page.request.get(`${BACKEND_URL}/api/admin/students`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      timeout: 15000,
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.ok).toBeTruthy();
    expect(body.students).toBeTruthy();

    // Filtrer les élèves qui ont un code d'accès
    ALL_STUDENTS = body.students.filter((/** @type {any} */ s) => s.access_code && s.licensed);
    testResults.totalStudents = ALL_STUDENTS.length;

    console.log(`\n📋 ${ALL_STUDENTS.length} élèves trouvés avec code d'accès :`);
    ALL_STUDENTS.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.full_name || s.first_name} — ${s.access_code}`);
    });

    expect(ALL_STUDENTS.length).toBeGreaterThan(0);
  });
});

// ─── Phase 2 : Test login pour chaque élève ──────────────────────────────────
test.describe('Phase 2 — Login de chaque élève', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Login de tous les élèves un par un', async ({ page }) => {
    // Skip si pas d'élèves récupérés
    test.skip(ALL_STUDENTS.length === 0, 'Aucun élève trouvé');

    for (const student of ALL_STUDENTS) {
      /** @type {{name: string, code: string, loginOk: boolean, soloOk: boolean, anomalies: string[], jsErrors: string[]}} */
      const result = {
        name: student.full_name || `${student.first_name} ${student.last_name}`,
        code: student.access_code,
        loginOk: false,
        soloOk: false,
        anomalies: [],
        jsErrors: [],
      };

      try {
        // Appeler l'API student-login pour obtenir les credentials
        const loginRes = await page.request.post(`${BACKEND_URL}/api/auth/student-login`, {
          data: { code: student.access_code },
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        });

        if (!loginRes.ok()) {
          const errorBody = await loginRes.json().catch(() => ({}));
          result.anomalies.push(`LOGIN FAILED (HTTP ${loginRes.status()}): ${errorBody.error || 'Unknown'}`);
          testResults.loginFailed++;
          testResults.anomalies.push({
            type: 'LOGIN_FAILED',
            student: result.name,
            code: result.code,
            error: errorBody.error || `HTTP ${loginRes.status()}`,
          });
          testResults.details.push(result);
          continue;
        }

        const loginBody = await loginRes.json();
        expect(loginBody.ok).toBeTruthy();
        expect(loginBody.credentials).toBeTruthy();

        // Se connecter avec les credentials Supabase retournés
        await page.goto('/login');
        await page.waitForLoadState('networkidle');

        // Basculer en mode élève
        const studentToggle = page.locator('text=Je suis élève').first();
        if (await studentToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
          await studentToggle.click();
          await page.waitForTimeout(500);
        }

        // Remplir le code d'accès
        const codeInput = page.locator('input[type="text"]').first();
        await codeInput.fill(student.access_code);
        await page.click('button[type="submit"]');

        // Attendre la redirection vers /modes
        await page.waitForURL('**/modes', { timeout: 20000 });
        result.loginOk = true;
        testResults.loginSuccess++;
        console.log(`  ✅ ${result.name} — login OK`);

        // Nettoyer la session pour le prochain élève
        await page.evaluate(() => {
          localStorage.removeItem('cc_auth');
          localStorage.removeItem('cc_student_id');
          localStorage.removeItem('cc_subscription_status');
        });
        await page.goto('/login');
        await page.waitForLoadState('networkidle');

      } catch (err) {
        const _err = /** @type {Error} */ (err);
        result.anomalies.push(`EXCEPTION: ${_err.message}`);
        testResults.loginFailed++;
        testResults.anomalies.push({
          type: 'LOGIN_EXCEPTION',
          student: result.name,
          code: result.code,
          error: _err.message,
        });
        console.log(`  ❌ ${result.name} — ${_err.message}`);

        // Reset pour continuer
        try {
          await page.evaluate(() => localStorage.clear());
          await page.goto('/login');
          await page.waitForLoadState('networkidle');
        } catch {}
      }

      testResults.details.push(result);
    }

    // Résumé
    console.log(`\n📊 Login: ${testResults.loginSuccess}/${testResults.totalStudents} réussis`);
    if (testResults.loginFailed > 0) {
      console.log(`⚠️ ${testResults.loginFailed} échecs de login`);
    }
  });
});

// ─── Phase 3 : Test mode solo pour chaque élève (détection anomalies) ────────
test.describe('Phase 3 — Mode Solo par élève (détection anomalies)', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Mode solo pour chaque élève avec détection double-paires', async ({ page }) => {
    test.skip(ALL_STUDENTS.length === 0, 'Aucun élève trouvé');
    test.setTimeout(ALL_STUDENTS.length * 30000); // 30s par élève

    for (const student of ALL_STUDENTS) {
      const detail = testResults.details.find(d => d.code === student.access_code);
      if (!detail || !detail.loginOk) continue; // Skip si login a échoué

      /** @type {string[]} */
      const jsErrors = [];
      /** @type {string[]} */
      const consoleErrors = [];

      try {
        // Capturer les erreurs JS
        page.on('pageerror', err => jsErrors.push(err.message));
        page.on('console', msg => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        // Se connecter en élève
        await page.goto('/login');
        await page.waitForLoadState('networkidle');

        const studentToggle = page.locator('text=Je suis élève').first();
        if (await studentToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
          await studentToggle.click();
          await page.waitForTimeout(500);
        }
        await page.locator('input[type="text"]').first().fill(student.access_code);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/modes', { timeout: 20000 });

        // Aller sur la carte solo
        await page.goto('/carte');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(6000); // Attendre génération complète des zones

        // ═══ DÉTECTION ANOMALIES ═══

        // 1. Crash React ?
        const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
        if (hasCrash) {
          detail.anomalies.push('CRASH_REACT: Page blanche / Something went wrong');
          testResults.anomalies.push({
            type: 'CRASH_REACT',
            student: detail.name,
            code: detail.code,
          });
        }

        // 2. Page vide ?
        const bodyContent = await page.evaluate(() => document.body.innerText.trim().length);
        if (bodyContent < 10) {
          detail.anomalies.push('PAGE_VIDE: Body presque vide');
          testResults.anomalies.push({
            type: 'PAGE_VIDE',
            student: detail.name,
            code: detail.code,
          });
        }

        // 3. Analyser les zones et paires depuis le DOM/JS
        const zoneAnalysis = await page.evaluate(() => {
          /** @type {{svgElementCount: number, imageCount: number, textCount: number, pairIds: string[], duplicatePairs: Array<{pairId: string, count: any}>, emptyZones: number, totalZones: number}} */
          const result = {
            svgElementCount: 0,
            imageCount: 0,
            textCount: 0,
            pairIds: [],
            duplicatePairs: [],
            emptyZones: 0,
            totalZones: 0,
          };

          // Compter les éléments SVG
          result.svgElementCount = document.querySelectorAll('svg *, object').length;
          result.imageCount = document.querySelectorAll('image, img[src*="images/"]').length;
          result.textCount = document.querySelectorAll('text').length;

          // Chercher les pairIds dans le DOM (data-pairid attribut ou via le state React)
          const elementsWithPairId = document.querySelectorAll('[data-pairid], [data-pair-id]');
          elementsWithPairId.forEach(el => {
            const pairId = el.getAttribute('data-pairid') || el.getAttribute('data-pair-id');
            if (pairId) result.pairIds.push(pairId);
          });

          // Aussi chercher dans le window/state (Carte.js stocke parfois dans window)
          try {
            // Vérifier window.__ZONES__ ou équivalent
            if (/** @type {any} */ (window).__CC_DIAG__) {
              const diag = /** @type {any} */ (window).__CC_DIAG__;
              if (diag.zones) {
                result.totalZones = diag.zones.length || 0;
                diag.zones.forEach((/** @type {any} */ z) => {
                  if (z.pairId) result.pairIds.push(z.pairId);
                  if (!z.content && !z.text && !z.image && !z.calcul) result.emptyZones++;
                });
              }
            }
          } catch {}

          // Détecter les pairIds en double (= DOUBLE PAIRE = BUG)
          /** @type {Record<string, number>} */
          const pairCount = {};
          result.pairIds.forEach(pid => {
            pairCount[pid] = (pairCount[pid] || 0) + 1;
          });
          Object.entries(pairCount).forEach(([pid, count]) => {
            if (count > 2) { // Plus de 2 = problème (chaque paire a 2 éléments)
              result.duplicatePairs.push({ pairId: pid, count });
            }
          });

          return result;
        });

        detail.zoneAnalysis = zoneAnalysis;

        // 4. Vérifier les résultats
        if (zoneAnalysis.svgElementCount === 0) {
          detail.anomalies.push('CARTE_VIDE: Aucun élément SVG trouvé');
          testResults.anomalies.push({
            type: 'CARTE_VIDE',
            student: detail.name,
            code: detail.code,
          });
        }

        if (zoneAnalysis.duplicatePairs.length > 0) {
          const dupInfo = zoneAnalysis.duplicatePairs.map(d => `${d.pairId}(x${d.count})`).join(', ');
          detail.anomalies.push(`DOUBLE_PAIRE: ${dupInfo}`);
          testResults.anomalies.push({
            type: 'DOUBLE_PAIRE',
            student: detail.name,
            code: detail.code,
            details: zoneAnalysis.duplicatePairs,
          });
        }

        if (zoneAnalysis.emptyZones > 0) {
          detail.anomalies.push(`ZONES_VIDES: ${zoneAnalysis.emptyZones} zones sans contenu`);
          testResults.anomalies.push({
            type: 'ZONES_VIDES',
            student: detail.name,
            code: detail.code,
            count: zoneAnalysis.emptyZones,
          });
        }

        // 5. Erreurs JS critiques
        const criticalJsErrors = jsErrors.filter(e =>
          e.includes('removeChild') ||
          e.includes('Cannot access') ||
          e.includes('before initialization') ||
          e.includes('Element type is invalid') ||
          e.includes('Cannot read properties of null') ||
          e.includes('is not a function')
        );

        if (criticalJsErrors.length > 0) {
          detail.jsErrors = criticalJsErrors;
          detail.anomalies.push(`JS_ERROR: ${criticalJsErrors[0]}`);
          testResults.anomalies.push({
            type: 'JS_ERROR',
            student: detail.name,
            code: detail.code,
            errors: criticalJsErrors,
          });
        }

        if (detail.anomalies.length === 0) {
          detail.soloOk = true;
          testResults.soloSuccess++;
          console.log(`  ✅ ${detail.name} — solo OK (SVG: ${zoneAnalysis.svgElementCount}, IMG: ${zoneAnalysis.imageCount})`);
        } else {
          testResults.soloFailed++;
          console.log(`  ⚠️ ${detail.name} — ${detail.anomalies.join(' | ')}`);
        }

        // Nettoyer la session
        page.removeAllListeners('pageerror');
        page.removeAllListeners('console');
        await page.evaluate(() => localStorage.clear());

      } catch (err) {
        const _err = /** @type {Error} */ (err);
        detail.anomalies.push(`SOLO_EXCEPTION: ${_err.message}`);
        testResults.soloFailed++;
        testResults.anomalies.push({
          type: 'SOLO_EXCEPTION',
          student: detail.name,
          code: detail.code,
          error: _err.message,
        });
        console.log(`  ❌ ${detail.name} — ${_err.message}`);

        page.removeAllListeners('pageerror');
        page.removeAllListeners('console');
        try {
          await page.evaluate(() => localStorage.clear());
          await page.goto('/login');
        } catch {}
      }
    }

    // ═══ RAPPORT FINAL ═══
    testResults.endTime = new Date().toISOString();
    console.log('\n' + '='.repeat(60));
    console.log('  📊 RAPPORT E2E — TEST 25 ÉLÈVES');
    console.log('='.repeat(60));
    console.log(`  Date: ${testResults.startTime}`);
    console.log(`  Élèves testés: ${testResults.totalStudents}`);
    console.log(`  Login OK: ${testResults.loginSuccess} | Échecs: ${testResults.loginFailed}`);
    console.log(`  Solo OK: ${testResults.soloSuccess} | Anomalies: ${testResults.soloFailed}`);
    console.log(`  Total anomalies: ${testResults.anomalies.length}`);

    if (testResults.anomalies.length > 0) {
      console.log('\n  🔴 ANOMALIES DÉTECTÉES:');
      testResults.anomalies.forEach((a, i) => {
        console.log(`    ${i + 1}. [${a.type}] ${a.student} (${a.code})`);
        if (a.error) console.log(`       → ${a.error}`);
        if (a.details) console.log(`       → ${JSON.stringify(a.details)}`);
      });
    } else {
      console.log('\n  ✅ AUCUNE ANOMALIE DÉTECTÉE');
    }
    console.log('='.repeat(60));
  });
});

// ─── Phase 4 : Envoyer les résultats au monitoring ──────────────────────────
test.describe('Phase 4 — Rapport monitoring', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Envoyer les résultats au backend monitoring', async ({ request }) => {
    test.skip(ALL_STUDENTS.length === 0, 'Aucun élève trouvé');
    test.skip(!ADMIN_TOKEN, 'Pas de token admin');

    testResults.endTime = testResults.endTime || new Date().toISOString();

    // Envoyer au backend via l'endpoint monitoring/incidents
    const report = {
      type: 'e2e_test_report',
      source: 'playwright',
      timestamp: testResults.endTime,
      summary: {
        totalStudents: testResults.totalStudents,
        loginSuccess: testResults.loginSuccess,
        loginFailed: testResults.loginFailed,
        soloSuccess: testResults.soloSuccess,
        soloFailed: testResults.soloFailed,
        totalAnomalies: testResults.anomalies.length,
      },
      anomalies: testResults.anomalies,
    };

    try {
      const response = await request.post(`${BACKEND_URL}/api/monitoring/incidents`, {
        data: report,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
        timeout: 10000,
      });
      console.log(`📤 Rapport envoyé au monitoring: HTTP ${response.status()}`);
    } catch (err) {
      console.log(`⚠️ Impossible d'envoyer au monitoring: ${/** @type {Error} */ (err).message}`);
    }

    // Écrire aussi dans un fichier JSON local pour le rapport Playwright
    console.log('\n📁 Résultats complets:');
    console.log(JSON.stringify(testResults, null, 2));
  });
});
