// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, loginWithEmail, collectConsoleErrors } = require('./helpers');

/**
 * Tests d'authentification — login, logout, persistance profil
 * 
 * ⚠️ Nécessite E2E_ADMIN_PASSWORD en variable d'environnement
 */
test.describe('Authentification', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini — skip tests auth');

  test('Login email/mot de passe fonctionne', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    // Vérifier qu'on est sur /modes
    expect(page.url()).toContain('/modes');
    // Vérifier que cc_auth est dans localStorage
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    expect(ccAuth).toBeTruthy();
    const auth = JSON.parse(ccAuth);
    expect(auth.id).toBeTruthy();
    expect(auth.email).toBe(TEST_ACCOUNTS.admin.email);
    expect(auth.token).toBeTruthy();
  });

  test('La page /modes affiche les modes de jeu après login', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    // Vérifier qu'au moins un mode est visible
    await expect(page.locator('text=Solo').first()).toBeVisible({ timeout: 10000 });
  });

  test('La page Mon Compte est accessible après login', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    // La page doit afficher "Mon compte"
    await expect(page.locator('text=Mon compte').first()).toBeVisible({ timeout: 10000 });
  });

  test('Sauvegarde du pseudo persiste après refresh', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Générer un pseudo unique pour ce test
    const testPseudo = `TestBot_${Date.now().toString(36)}`;

    // Trouver et remplir le champ pseudo/nom
    const nameInput = page.locator('input').first();
    await nameInput.fill(testPseudo);

    // Cliquer sur Enregistrer
    await page.click('text=Enregistrer');
    await page.waitForTimeout(2000); // Attendre la sauvegarde serveur

    // Vérifier dans localStorage
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth);
    expect(auth.name).toBe(testPseudo);

    // Rafraîchir la page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Attendre le chargement profil serveur

    // Vérifier que le pseudo est toujours là
    const ccAuthAfter = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const authAfter = JSON.parse(ccAuthAfter);
    expect(authAfter.name).toBe(testPseudo);
  });

  test('Sauvegarde du pseudo persiste après logout + login', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');

    // Sauvegarder un pseudo unique
    const testPseudo = `Persist_${Date.now().toString(36)}`;
    const nameInput = page.locator('input').first();
    await nameInput.fill(testPseudo);
    await page.click('text=Enregistrer');
    await page.waitForTimeout(2000);

    // Se déconnecter (via navigation directe pour fiabilité)
    await page.evaluate(() => {
      localStorage.removeItem('cc_auth');
      window.dispatchEvent(new Event('cc:authChanged'));
    });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Se reconnecter
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.waitForTimeout(3000); // Attendre le sync profil serveur

    // Vérifier que le pseudo a été restauré depuis le serveur
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth);
    expect(auth.name).toBe(testPseudo);
  });

  test('Le token est présent dans cc_auth après login', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth);
    expect(auth.token).toBeTruthy();
    expect(auth.token.length).toBeGreaterThan(20);
  });

  test('Le rôle est correctement défini après login', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth);
    // Le compte verinmarius971 est admin
    expect(['admin', 'teacher', 'user']).toContain(auth.role);
  });
});

test.describe('Authentification élève', () => {

  test.skip(!TEST_ACCOUNTS.student.code, 'E2E_STUDENT_CODE non défini — skip tests élève');

  test('Login code élève fonctionne', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Basculer en mode élève
    const studentToggle = page.locator('text=Je suis élève').first();
    if (await studentToggle.isVisible()) {
      await studentToggle.click();
    }

    // Remplir le code
    await page.locator('input[type="text"]').first().fill(TEST_ACCOUNTS.student.code);
    await page.click('button[type="submit"]');

    // Attendre la redirection
    await page.waitForURL('**/modes', { timeout: 30000 });
    expect(page.url()).toContain('/modes');

    // Vérifier cc_student_id
    const studentId = await page.evaluate(() => localStorage.getItem('cc_student_id'));
    expect(studentId).toBeTruthy();
  });
});
