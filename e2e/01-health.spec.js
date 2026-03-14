// @ts-check
const { test, expect } = require('@playwright/test');
const { BACKEND_URL, collectConsoleErrors } = require('./helpers');

/**
 * Tests de santé générale — vérifie que l'app et le backend répondent
 */
test.describe('Santé générale', () => {

  test('La page d\'accueil se charge sans erreur', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    // Pas de page blanche : au moins un élément visible
    await expect(page.locator('body')).not.toBeEmpty();
    // Pas d'erreur React critique
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
  });

  test('La page /login se charge', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Le formulaire de login doit être visible
    await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('La page /pricing se charge', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
  });

  test('La page /legal se charge', async ({ page }) => {
    await page.goto('/legal');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('Le backend répond sur /health', async ({ request }) => {
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await request.get(`${BACKEND_URL}/health`, { timeout: 30000 });
        if (response.ok()) break;
      } catch {
        if (attempt < 3) await new Promise(r => setTimeout(r, 5000));
      }
    }
    expect(response?.ok()).toBeTruthy();
  });

  test('Redirection vers /login si non connecté sur /modes', async ({ page }) => {
    await page.goto('/modes');
    // Doit rediriger vers login ou afficher la page d'accueil
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).toMatch(/\/(login|$)/);
  });

  test('Redirection vers /login si non connecté sur /account', async ({ page }) => {
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).toMatch(/\/(login|$)/);
  });

  test('Pas d\'erreurs JS critiques sur la page d\'accueil', async ({ page }) => {
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Filtrer les erreurs non-critiques (extensions, CORS tiers, etc.)
    const criticalErrors = errors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Extension') &&
      !e.includes('chrome-extension')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
