// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, loginWithEmail } = require('./helpers');

/**
 * TESTS MODE APPRENDRE (LearnMode)
 * 
 * Vérifie que le mode Apprendre (Premium) se charge correctement
 * et ne génère aucune erreur JavaScript.
 */

test.describe('Mode Apprendre — Navigation', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Page /apprendre se charge sans crash', async ({ page }) => {
    /** @type {string[]} */
    const jsErrors = [];
    page.on('pageerror', (/** @type {Error} */ e) => jsErrors.push(e.message));

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    await page.goto('/apprendre');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Vérifier pas de crash React
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const noCrash = !bodyText.includes('Something went wrong') && !bodyText.includes('Error #');
    const hasContent = bodyText.length > 30;

    console.log(`Mode Apprendre: crash=${!noCrash}, contenu=${hasContent}, taille=${bodyText.length}`);

    // Vérifier pas d'erreurs JS critiques
    const criticalErrors = jsErrors.filter(e =>
      e.includes('Cannot') || e.includes('is not a function') || e.includes('undefined')
    );

    if (criticalErrors.length > 0) {
      console.error('Erreurs JS critiques:', criticalErrors);
    }

    await page.screenshot({ path: 'test-results/learn-mode.png' });

    expect(noCrash, 'Page Apprendre a crashé').toBeTruthy();
    expect(criticalErrors, `${criticalErrors.length} erreur(s) JS critique(s)`).toHaveLength(0);
  });

  test('Page /apprendre contient du contenu interactif', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    await page.goto('/apprendre');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Vérifier la présence d'éléments interactifs (boutons, liens, etc.)
    const buttons = await page.locator('button').count();
    const links = await page.locator('a').count();
    const interactiveElements = buttons + links;

    console.log(`Mode Apprendre: ${buttons} boutons, ${links} liens`);
    expect(interactiveElements, 'Aucun élément interactif trouvé').toBeGreaterThan(0);
  });
});
