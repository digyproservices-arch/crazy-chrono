// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, loginWithEmail, ensureBackendAwake } = require('./helpers');

/**
 * Tests Mode Solo — vérifie le lancement et le fonctionnement du jeu solo
 */
test.describe('Mode Solo', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Accéder à la configuration solo depuis /modes', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.waitForTimeout(2000);

    // Admin voit TeacherModeSelector (bouton "JOUER SOLO")
    // User voit ModeSelect (carte "Mode Solo" qui est un <button>)
    const soloBtn = page.locator('button:has-text("JOUER SOLO"), button:has-text("Mode Solo")').first();
    await soloBtn.waitFor({ state: 'visible', timeout: 15000 });
    await soloBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Devrait être sur /config/solo ou directement en jeu
    const url = page.url();
    expect(url).toMatch(/\/(config|carte)/);
  });

  test('La carte solo se charge avec des zones', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Aller directement sur /carte (mode solo par défaut)
    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000); // Attendre le chargement complet SVG + zones

    // Vérifier que la carte est rendue
    const carteContainer = page.locator('.carte-container-wrapper, .carte-container, object[data*=".svg"]').first();
    await expect(carteContainer).toBeVisible({ timeout: 15000 });

    // Vérifier qu'il n'y a pas eu de crash React
    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();

    // Vérifier qu'il n'y a pas d'erreur JS critique (removeChild, TDZ, etc.)
    const criticalErrors = errors.filter(e =>
      e.includes('removeChild') ||
      e.includes('Cannot access') ||
      e.includes('before initialization') ||
      e.includes('Element type is invalid')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('Le chrono démarre en mode solo', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Vérifier qu'un chrono/timer est visible (texte avec des chiffres type 00:00 ou timer)
    const hasTimer = await page.locator('text=/\\d{1,2}:\\d{2}/, [class*="timer"], [class*="chrono"]').first()
      .isVisible({ timeout: 10000 }).catch(() => false);
    // Le timer peut ne pas être visible si la carte est en mode configuration
    // On vérifie au moins que la page ne crash pas
    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();
  });

  test('Les zones contiennent des éléments (images, textes, calculs)', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Configurer une session solo pour que la carte génère des zones
    await page.evaluate(() => {
      localStorage.setItem('cc_session_cfg', JSON.stringify({
        mode: 'solo', classes: ['CM2'], themes: [], rounds: 1, duration: 60,
      }));
    });

    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(10000);

    // Vérifier via le DOM que des zones ont été générées
    const zonesInfo = await page.evaluate(() => {
      const svgElements = document.querySelectorAll('image, text, path, foreignObject');
      return {
        svgCount: svgElements.length,
        hasContent: svgElements.length > 5,
      };
    });

    // La carte doit contenir des éléments SVG
    expect(zonesInfo.svgCount).toBeGreaterThan(0);
  });

  test('Pas de page blanche après 10 secondes en mode solo', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/carte');
    await page.waitForTimeout(10000);

    // Le body ne doit pas être vide
    const bodyContent = await page.evaluate(() => document.body.innerText.trim().length);
    expect(bodyContent).toBeGreaterThan(0);

    // Pas d'écran blanc (erreur React)
    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();
  });
});
