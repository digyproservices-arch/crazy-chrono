// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, loginWithEmail, BACKEND_URL } = require('./helpers');

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
    const response = await request.get(`${BACKEND_URL}/api/training/records`, { timeout: 15000 });
    // L'API doit répondre (même sans données)
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('Mode Training (côté élève)', () => {

  test.skip(!TEST_ACCOUNTS.student.code, 'E2E_STUDENT_CODE non défini — skip tests élève');

  test('API training-invitations répond pour un élève', async ({ page }) => {
    // Ce test vérifie que l'endpoint existe et répond
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Login élève
    const studentToggle = page.locator('text=Je suis élève').first();
    if (await studentToggle.isVisible()) {
      await studentToggle.click();
    }
    await page.locator('input[type="text"]').first().fill(TEST_ACCOUNTS.student.code);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/modes', { timeout: 30000 });

    // Récupérer studentId
    const studentId = await page.evaluate(() => localStorage.getItem('cc_student_id'));
    expect(studentId).toBeTruthy();

    // Vérifier que l'API invitations répond
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth || '{}');
    const response = await page.request.get(
      `${BACKEND_URL}/api/tournament/students/${studentId}/training-invitations`,
      { headers: { Authorization: `Bearer ${auth.token}` } }
    );
    expect(response.status()).toBeLessThan(500);
  });
});
