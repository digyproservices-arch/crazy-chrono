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
    test.setTimeout(120000);
    await ensureBackendAwake(page);
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Naviguer vers /account ET attendre le chargement du profil serveur
    const [profileLoad] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes('/api/auth/profile') && res.request().method() === 'GET',
        { timeout: 30000 }
      ).catch(() => null),
      page.goto('/account'),
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[E2E] Profile GET: ${profileLoad ? 'HTTP ' + profileLoad.status() : 'pas de réponse'}`);
    await page.waitForTimeout(3000);

    const testPseudo = `TestBot_${Date.now().toString(36)}`;

    // Trouver le champ pseudo (PAS l'input file avatar qui est caché)
    const nameInput = page.locator('input[placeholder*="Joueur"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
    const oldValue = await nameInput.inputValue();
    console.log(`[E2E] Pseudo actuel dans l'input: "${oldValue}"`);

    // Remplir le nouveau pseudo
    await nameInput.clear();
    await nameInput.fill(testPseudo);
    const newValue = await nameInput.inputValue();
    console.log(`[E2E] Pseudo après fill: "${newValue}"`);
    expect(newValue).toBe(testPseudo);

    // Cliquer Enregistrer et attendre spécifiquement le PATCH
    const [patchRes] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes('/api/auth/profile') && res.request().method() === 'PATCH',
        { timeout: 30000 }
      ).catch(() => null),
      page.locator('button:has-text("Enregistrer")').click(),
    ]);

    if (patchRes) {
      const status = patchRes.status();
      console.log(`[E2E] PATCH /profile: HTTP ${status}`);
      if (status !== 200) {
        const body = await patchRes.text().catch(() => 'N/A');
        console.error(`[E2E] PATCH body: ${body.substring(0, 300)}`);
      }
    } else {
      console.error('[E2E] ❌ Aucune réponse PATCH reçue !');
    }
    await page.waitForTimeout(3000);

    // Vérifier localStorage après save
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth || '{}');
    console.log(`[E2E] localStorage.name après save: "${auth.name}"`);
    expect(auth.name).toBe(testPseudo);

    // Recharger et attendre le GET /profile du serveur
    const [reloadProfile] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes('/api/auth/profile') && res.request().method() === 'GET',
        { timeout: 30000 }
      ).catch(() => null),
      page.reload(),
    ]);
    await page.waitForLoadState('networkidle');
    if (reloadProfile) {
      console.log(`[E2E] Profile reload GET: HTTP ${reloadProfile.status()}`);
    }
    await page.waitForTimeout(5000);

    // Vérifier persistence
    const raw = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const authAfter = JSON.parse(raw || '{}');
    console.log(`[E2E] localStorage.name après reload: "${authAfter.name}"`);
    expect(authAfter.name).toBe(testPseudo);
  });

  test('Sauvegarde du pseudo persiste après logout + login', async ({ page }) => {
    test.setTimeout(120000);
    await ensureBackendAwake(page);
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Naviguer vers /account ET attendre le chargement du profil serveur
    const [profileLoad] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes('/api/auth/profile') && res.request().method() === 'GET',
        { timeout: 30000 }
      ).catch(() => null),
      page.goto('/account'),
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[E2E-logout] Profile GET: ${profileLoad ? 'HTTP ' + profileLoad.status() : 'pas de réponse'}`);
    await page.waitForTimeout(3000);

    const testPseudo = `Persist_${Date.now().toString(36)}`;
    const nameInput = page.locator('input[placeholder*="Joueur"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
    await nameInput.clear();
    await nameInput.fill(testPseudo);
    console.log(`[E2E-logout] Pseudo rempli: "${testPseudo}"`);

    // Cliquer Enregistrer et attendre PATCH
    const [patchRes] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes('/api/auth/profile') && res.request().method() === 'PATCH',
        { timeout: 30000 }
      ).catch(() => null),
      page.locator('button:has-text("Enregistrer")').click(),
    ]);

    if (patchRes) {
      const status = patchRes.status();
      console.log(`[E2E-logout] PATCH /profile: HTTP ${status}`);
      if (status !== 200) {
        const body = await patchRes.text().catch(() => 'N/A');
        console.error(`[E2E-logout] PATCH body: ${body.substring(0, 300)}`);
      }
    } else {
      console.error('[E2E-logout] ❌ Aucune réponse PATCH reçue !');
    }
    await page.waitForTimeout(3000);

    // Vérifier localStorage
    const ccAuthBefore = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const authBefore = JSON.parse(ccAuthBefore || '{}');
    console.log(`[E2E-logout] localStorage.name après save: "${authBefore.name}"`);
    expect(authBefore.name).toBe(testPseudo);

    // Se déconnecter
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

    // Après login, aller sur /account pour déclencher le chargement profil
    const [reloadProfile] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes('/api/auth/profile') && res.request().method() === 'GET',
        { timeout: 30000 }
      ).catch(() => null),
      page.goto('/account'),
    ]);
    await page.waitForLoadState('networkidle');
    if (reloadProfile) {
      console.log(`[E2E-logout] Profile reload GET: HTTP ${reloadProfile.status()}`);
    }
    await page.waitForTimeout(5000);

    // Vérifier persistence
    const raw = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(raw || '{}');
    console.log(`[E2E-logout] localStorage.name après re-login: "${auth.name}"`);

    if (auth.name !== testPseudo) {
      const authLogs = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('cc_auth_logs') || '[]'); } catch { return []; }
      });
      console.error(`[E2E-logout] ❌ Pseudo non persisté! Attendu: "${testPseudo}", Obtenu: "${auth.name}"`);
      console.error('[E2E-logout] Auth logs:', JSON.stringify(authLogs.slice(0, 5), null, 2));
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
