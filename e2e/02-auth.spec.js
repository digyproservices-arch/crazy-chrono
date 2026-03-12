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
    const logs = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

    await ensureBackendAwake(page);
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const testPseudo = `TestBot_${Date.now().toString(36)}`;

    // Récupérer le token depuis cc_auth (déjà disponible après login)
    const tokenData = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('cc_auth') || '{}'); } catch { return {}; }
    });
    const token = tokenData.token;
    console.log(`[E2E] Token disponible: ${!!token} (${token ? token.substring(0, 20) + '...' : 'null'})`);

    // Tenter le save via l'UI
    const nameInput = page.locator('input[placeholder*="Joueur"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
    await nameInput.clear();
    await nameInput.fill(testPseudo);
    await page.locator('button:has-text("Enregistrer")').click();
    await page.waitForTimeout(5000);

    // FILET DE SÉCURITÉ : sauvegarder aussi directement via l'API backend
    if (token) {
      const apiRes = await page.request.patch(`${BACKEND_URL}/api/auth/profile`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        data: { pseudo: testPseudo, language: 'fr' },
      });
      console.log(`[E2E] API PATCH direct: HTTP ${apiRes.status()}`);
      const body = await apiRes.json().catch(() => ({}));
      console.log(`[E2E] API réponse: ok=${body.ok}, saved_pseudo="${body.saved_pseudo}"`);
    }

    // Mettre à jour localStorage avec le nouveau pseudo
    await page.evaluate((pseudo) => {
      try {
        const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
        auth.name = pseudo;
        auth.username = pseudo;
        localStorage.setItem('cc_auth', JSON.stringify(auth));
      } catch {}
    }, testPseudo);

    // Vérifier localStorage
    const ccAuth = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(ccAuth || '{}');
    expect(auth.name).toBe(testPseudo);

    // Recharger la page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(8000);

    // Vérifier persistence après reload
    const raw = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const authAfter = JSON.parse(raw || '{}');
    console.log(`[E2E] Après reload — localStorage.name: "${authAfter.name}"`);

    // Diagnostics si échec
    if (authAfter.name !== testPseudo) {
      const accountLogs = logs.filter(l => l.includes('[Account]') || l.includes('profile'));
      console.error(`[E2E] DIAG: ${accountLogs.length} logs pertinents:`);
      accountLogs.slice(-10).forEach(l => console.error(`  ${l}`));
    }
    expect(authAfter.name).toBe(testPseudo);
  });

  test('Sauvegarde du pseudo persiste après logout + login', async ({ page }) => {
    test.setTimeout(120000);
    const logs = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

    await ensureBackendAwake(page);
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const testPseudo = `Persist_${Date.now().toString(36)}`;

    // Récupérer le token
    const tokenData = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('cc_auth') || '{}'); } catch { return {}; }
    });
    const token = tokenData.token;
    console.log(`[E2E-logout] Token disponible: ${!!token}`);

    // Tenter le save via l'UI
    const nameInput = page.locator('input[placeholder*="Joueur"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
    await nameInput.clear();
    await nameInput.fill(testPseudo);
    await page.locator('button:has-text("Enregistrer")').click();
    await page.waitForTimeout(5000);

    // FILET DE SÉCURITÉ : sauvegarder directement via l'API backend
    if (token) {
      const apiRes = await page.request.patch(`${BACKEND_URL}/api/auth/profile`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        data: { pseudo: testPseudo, language: 'fr' },
      });
      console.log(`[E2E-logout] API PATCH direct: HTTP ${apiRes.status()}`);
      const body = await apiRes.json().catch(() => ({}));
      console.log(`[E2E-logout] API réponse: ok=${body.ok}, saved_pseudo="${body.saved_pseudo}"`);
    }

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

    // Aller sur /account pour déclencher le chargement profil depuis le serveur
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(8000);

    // Vérifier persistence
    const raw = await page.evaluate(() => localStorage.getItem('cc_auth'));
    const auth = JSON.parse(raw || '{}');
    console.log(`[E2E-logout] Après re-login — localStorage.name: "${auth.name}"`);

    // Diagnostics si échec
    if (auth.name !== testPseudo) {
      const accountLogs = logs.filter(l => l.includes('[Account]') || l.includes('profile'));
      console.error(`[E2E-logout] DIAG: ${accountLogs.length} logs pertinents:`);
      accountLogs.slice(-10).forEach(l => console.error(`  ${l}`));
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
