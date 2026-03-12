// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, loginWithEmail, BACKEND_URL, ensureBackendAwake } = require('./helpers');

/**
 * Tests Mode Training — vérifie les pages prof et le flux de création de match
 */
test.describe('Mode Training (côté professeur)', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Accéder au dashboard professeur', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/teacher');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();
  });

  test('Page création training se charge', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/teacher/training/create');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();
  });

  test('Page teacher dashboard se charge', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/teacher/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();
  });

  test('API training records répond', async ({ request }) => {
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await request.get(`${BACKEND_URL}/api/training/records`, { timeout: 30000 });
        if (response.status() < 500) break;
      } catch {
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
      }
    }
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('Mode Training (côté élève)', () => {

  test.skip(!TEST_ACCOUNTS.student.code, 'E2E_STUDENT_CODE non défini — skip tests élève');

  test('API training-invitations répond pour un élève', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Login élève
    const studentToggle = page.locator('text=Je suis élève').first();
    if (await studentToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await studentToggle.click();
      await page.waitForTimeout(1000);
    }
    const codeInput = page.locator('input[placeholder*="ALICE" i], input[type="text"]').first();
    await codeInput.waitFor({ state: 'visible', timeout: 10000 });
    await codeInput.fill(TEST_ACCOUNTS.student.code);
    // Le bouton élève est type="button" avec texte "Jouer" (PAS type="submit")
    await page.locator('button:has-text("Jouer")').first().click();
    await page.waitForURL('**/modes', { timeout: 45000 });

    // Récupérer studentId
    const studentId = await page.evaluate(() => localStorage.getItem('cc_student_id'));
    expect(studentId).toBeTruthy();

    // Vérifier que l'API invitations répond (avec retry)
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth || '{}');
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await page.request.get(
          `${BACKEND_URL}/api/tournament/students/${studentId}/training-invitations`,
          { headers: { Authorization: `Bearer ${auth.token}` }, timeout: 30000 }
        );
        if (response.status() < 500) break;
      } catch {
        if (attempt < 3) await page.waitForTimeout(3000);
      }
    }
    expect(response?.status()).toBeLessThan(500);
  });
});
