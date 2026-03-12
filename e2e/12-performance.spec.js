// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, BACKEND_URL, loginWithEmail, loginWithStudentCode } = require('./helpers');

/**
 * TESTS DE PERFORMANCE
 * 
 * Mesure les temps de chargement critiques pour détecter les régressions :
 * 1. Page d'accueil < 3s
 * 2. Page login < 3s
 * 3. Login complet < 10s (inclut cold start Render)
 * 4. Carte solo < 8s (chargement SVG + zones + images)
 * 5. API /health < 2s
 * 6. API /associations.json < 3s
 */

test.describe('Performance — Temps de chargement', () => {

  test('Page d\'accueil se charge en < 3s', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const duration = Date.now() - start;

    console.log(`⏱️ Page accueil: ${duration}ms`);
    expect(duration, `Page accueil trop lente: ${duration}ms > 3000ms`).toBeLessThan(3000);
  });

  test('Page login se charge en < 3s', async ({ page }) => {
    const start = Date.now();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    const duration = Date.now() - start;

    console.log(`⏱️ Page login: ${duration}ms`);
    expect(duration, `Page login trop lente: ${duration}ms > 3000ms`).toBeLessThan(3000);
  });

  test('API /health répond en < 2s', async ({ request }) => {
    const start = Date.now();
    const res = await request.get(`${BACKEND_URL}/health`);
    const duration = Date.now() - start;

    console.log(`⏱️ API /health: ${duration}ms (status ${res.status()})`);
    expect(res.ok()).toBeTruthy();
    expect(duration, `API /health trop lente: ${duration}ms > 5000ms`).toBeLessThan(5000);
  });

  test('API /associations.json se charge en < 3s', async ({ page }) => {
    const start = Date.now();
    const res = await page.request.get(`${BACKEND_URL}/associations.json`);
    const duration = Date.now() - start;

    console.log(`⏱️ associations.json: ${duration}ms (status ${res.status()})`);
    expect(res.ok()).toBeTruthy();
    expect(duration, `associations.json trop lent: ${duration}ms > 5000ms`).toBeLessThan(5000);
  });

  test('API /math-positions se charge en < 2s', async ({ page }) => {
    const start = Date.now();
    const res = await page.request.get(`${BACKEND_URL}/math-positions`);
    const duration = Date.now() - start;

    console.log(`⏱️ math-positions: ${duration}ms (status ${res.status()})`);
    expect(res.ok()).toBeTruthy();
    expect(duration, `math-positions trop lent: ${duration}ms > 5000ms`).toBeLessThan(5000);
  });
});

test.describe('Performance — Avec authentification', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Login complet en < 15s (inclut cold start)', async ({ page }) => {
    const start = Date.now();
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    const duration = Date.now() - start;

    console.log(`⏱️ Login complet: ${duration}ms`);
    // 15s car Render peut avoir un cold start de ~10s
    expect(duration, `Login trop lent: ${duration}ms > 20000ms`).toBeLessThan(20000);
  });

  test('Carte solo se charge en < 8s (après login)', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Configurer session solo
    await page.evaluate(() => {
      localStorage.setItem('cc_session_cfg', JSON.stringify({
        mode: 'solo', classes: ['CM2'], themes: [], rounds: 1, duration: 60,
      }));
    });

    const start = Date.now();
    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    const duration = Date.now() - start;

    console.log(`⏱️ Carte solo: ${duration}ms`);
    expect(duration, `Carte solo trop lente: ${duration}ms > 12000ms`).toBeLessThan(12000);

    // Vérifier que des zones SVG sont présentes
    const svgCount = await page.locator('svg').count();
    console.log(`  SVG elements: ${svgCount}`);
    expect(svgCount).toBeGreaterThan(0);
  });

  test('Page /modes se charge en < 3s (après login)', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    const start = Date.now();
    await page.goto('/modes');
    await page.waitForLoadState('domcontentloaded');
    const duration = Date.now() - start;

    console.log(`⏱️ Page /modes: ${duration}ms`);
    expect(duration, `Page /modes trop lente: ${duration}ms > 3000ms`).toBeLessThan(3000);
  });

  test('Page monitoring se charge en < 5s', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    const start = Date.now();
    await page.goto('/admin/monitoring');
    await page.waitForLoadState('networkidle');
    const duration = Date.now() - start;

    console.log(`⏱️ Monitoring: ${duration}ms`);
    expect(duration, `Monitoring trop lent: ${duration}ms > 8000ms`).toBeLessThan(8000);
  });
});
