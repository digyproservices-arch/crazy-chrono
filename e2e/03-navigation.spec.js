// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, loginWithEmail } = require('./helpers');

/**
 * Tests de navigation — vérifie que toutes les pages se chargent sans crash
 */
test.describe('Navigation (pages publiques)', () => {

  test('Landing page se charge', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('Page /pricing affiche les tarifs', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    // Pas de crash React
    const hasError = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('Page /legal se charge', async ({ page }) => {
    await page.goto('/legal');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('Page /forgot-password se charge', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Navigation (pages protégées)', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Page /modes affiche les modes après login', async ({ page }) => {
    // L'URL /modes apparaît dès le navigate() de react-router : le contenu est
    // rendu quelques centaines de ms plus tard (commit React + chunk lazy).
    // On mesure ce délai et on attend un signal déterministe, sans délai fixe.
    const t0 = Date.now();
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    const msToModes = Date.now() - t0;
    console.log(`[/modes] contenu affiché ${msToModes}ms après le début du login`);

    await expect(page.getByRole('heading', { name: /Choisissez/i }).first()).toBeVisible();
    await expect(page.locator('text=/mode solo/i').first()).toBeVisible();
    // Aucun écran de chargement résiduel
    await expect(page.locator('text=Chargement')).toHaveCount(0);
    // Un utilisateur réel ne doit pas attendre anormalement longtemps
    expect(msToModes).toBeLessThan(20000);
  });

  test('Page /account se charge sans crash', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Mon compte').first()).toBeVisible({ timeout: 10000 });
    // Pas d'erreur React
    const hasError = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('Page /config/solo se charge', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/config/solo');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    const hasError = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('Page /carte se charge sans erreur JS critique', async ({ page }) => {
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Attendre le chargement de la carte SVG

    // La carte doit s'afficher (SVG ou object)
    const hasSvg = await page.locator('object, svg, .carte-container-wrapper').first().isVisible().catch(() => false);
    expect(hasSvg).toBeTruthy();

    // Pas d'erreur React critique
    const criticalErrors = errors.filter(e =>
      e.includes('Cannot read properties of null') ||
      e.includes('is not a function') ||
      e.includes('Element type is invalid')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('Page /teacher se charge pour un prof/admin', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/teacher');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    const hasError = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});
