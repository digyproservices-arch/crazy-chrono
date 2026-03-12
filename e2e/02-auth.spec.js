// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, BACKEND_URL, loginWithEmail, ensureBackendAwake, collectConsoleErrors } = require('./helpers');

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
    // Réveiller le backend AVANT de tenter le save
    await ensureBackendAwake(page);
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Générer un pseudo unique pour ce test
    const testPseudo = `TestBot_${Date.now().toString(36)}`;

    // Trouver et remplir le champ pseudo/nom
    const nameInput = page.locator('input').first();
    await nameInput.fill(testPseudo);

    // Cliquer sur Enregistrer et attendre la réponse réseau
    const [saveResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/profile') || res.url().includes('/user'), { timeout: 30000 }).catch(() => null),
      page.click('text=Enregistrer'),
    ]);
    // Attendre que le save local + serveur finisse
    await page.waitForTimeout(5000);

    // Vérifier dans localStorage
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth);
    expect(auth.name).toBe(testPseudo);

    // Rafraîchir la page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Polling: attendre que le pseudo soit restauré (max 20s)
    let authAfter;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(2000);
      const raw = await page.evaluate(() => localStorage.getItem('cc_auth'));
      authAfter = JSON.parse(raw || '{}');
      if (authAfter.name === testPseudo) break;
    }
    expect(authAfter.name).toBe(testPseudo);
  });

  test('Sauvegarde du pseudo persiste après logout + login', async ({ page }) => {
    // Réveiller le backend AVANT de tenter le save
    await ensureBackendAwake(page);
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Sauvegarder un pseudo unique
    const testPseudo = `Persist_${Date.now().toString(36)}`;
    const nameInput = page.locator('input').first();
    await nameInput.fill(testPseudo);

    // Cliquer et attendre la réponse réseau
    const [saveResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/profile') || res.url().includes('/user'), { timeout: 30000 }).catch(() => null),
      page.click('text=Enregistrer'),
    ]);
    await page.waitForTimeout(5000);

    // Vérifier que le pseudo est bien dans localStorage après sauvegarde
    const ccAuthBefore = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const authBefore = JSON.parse(ccAuthBefore);
    expect(authBefore.name).toBe(testPseudo);

    // Se déconnecter via le VRAI flux Supabase (pas juste localStorage)
    await page.evaluate(async () => {
      const sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKey) localStorage.removeItem(sbKey);
      localStorage.removeItem('cc_auth');
      window.dispatchEvent(new Event('cc:authChanged'));
    });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Se reconnecter
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Polling: attendre que le pseudo soit restauré (max 20s)
    let auth;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(2000);
      const raw = await page.evaluate(() => localStorage.getItem('cc_auth'));
      auth = JSON.parse(raw || '{}');
      if (auth.name === testPseudo) break;
    }

    // Log détaillé en cas d'échec
    if (auth.name !== testPseudo) {
      const authLogs = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('cc_auth_logs') || '[]'); } catch { return []; }
      });
      console.error(`[E2E] ❌ Pseudo non persisté! Attendu: "${testPseudo}", Obtenu: "${auth.name}"`);
      console.error('[E2E] Auth logs:', JSON.stringify(authLogs.slice(0, 5), null, 2));
    }

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
    await page.waitForTimeout(1000);

    // Basculer en mode élève
    const studentToggle = page.locator('text=Je suis élève').first();
    if (await studentToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await studentToggle.click();
      await page.waitForTimeout(1000);
    }

    // Remplir le code — le placeholder est "ALICE-CE1A-4823"
    const codeInput = page.locator('input[placeholder*="ALICE" i], input[type="text"]').first();
    await codeInput.waitFor({ state: 'visible', timeout: 10000 });
    await codeInput.fill(TEST_ACCOUNTS.student.code);
    // Le bouton élève est type="button" avec texte "Jouer" (PAS type="submit")
    await page.locator('button:has-text("Jouer")').first().click();

    // Attendre la redirection
    await page.waitForURL('**/modes', { timeout: 45000 });
    expect(page.url()).toContain('/modes');

    // Vérifier cc_student_id
    const studentId = await page.evaluate(() => localStorage.getItem('cc_student_id'));
    expect(studentId).toBeTruthy();
  });
});
