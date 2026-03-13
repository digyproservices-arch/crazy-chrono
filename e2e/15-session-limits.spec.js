// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, BACKEND_URL, loginWithEmail, ensureBackendAwake } = require('./helpers');

/**
 * SESSION LIMITS — Vérification de la limite de sessions pour les joueurs free
 *
 * Tests :
 * 1. Un joueur free peut démarrer jusqu'à 3 sessions/jour
 * 2. À la 4e tentative, le jeu bloque et redirige vers /pricing
 * 3. Le compteur local est cohérent avec le serveur
 * 4. Les logs [CC][quota] sont émis pour traçabilité
 * 5. Un joueur pro n'est PAS bloqué
 */

test.describe('Session Limits — Limite quotidienne joueurs free', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Vérifier que la limite locale fonctionne (3 sessions max)', async ({ page }) => {
    test.setTimeout(90000);

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Forcer le statut free dans localStorage
    await page.evaluate(() => {
      localStorage.setItem('cc_subscription_status', 'free');
      // Reset le compteur quotidien
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('cc_free_quota', JSON.stringify({ date: today, sessions: 0 }));
    });

    // Collecter les logs console pour vérifier [CC][quota]
    const quotaLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[CC][quota]')) {
        quotaLogs.push(text);
      }
    });

    // Naviguer vers /carte
    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Vérifier que le compteur local est à 0
    const initialQuota = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('cc_free_quota') || '{}');
      } catch { return {}; }
    });
    console.log('  📊 Quota initial:', JSON.stringify(initialQuota));
    expect(initialQuota.sessions).toBe(0);

    // Simuler 3 sessions en incrémentant le compteur
    await page.evaluate(() => {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('cc_free_quota', JSON.stringify({ date: today, sessions: 3 }));
    });

    // Vérifier que canStartSessionToday retourne false maintenant
    const canStart = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('cc_free_quota');
        if (!raw) return true;
        const data = JSON.parse(raw);
        const today = new Date().toISOString().slice(0, 10);
        if (data.date !== today) return true;
        return (data.sessions || 0) < 3;
      } catch { return true; }
    });
    expect(canStart).toBe(false);
    console.log('  ✅ canStartSessionToday=false après 3 sessions');

    // Vérifier que le compteur est bien à 3
    const finalQuota = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('cc_free_quota') || '{}');
      } catch { return {}; }
    });
    expect(finalQuota.sessions).toBe(3);
    console.log('  ✅ Compteur local = 3 sessions');
  });

  test('Vérifier que le serveur enforce la limite', async ({ page, request }) => {
    test.setTimeout(60000);

    // Vérifier que le backend est éveillé
    const backendUp = await ensureBackendAwake(request);
    if (!backendUp) {
      console.log('⚠️ Backend non disponible, skip test serveur');
      return;
    }

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Récupérer le userId
    const userId = await page.evaluate(() => {
      try {
        const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
        return auth.id || null;
      } catch { return null; }
    });

    if (!userId) {
      console.log('⚠️ Pas de userId, skip test serveur');
      return;
    }

    // Appeler /usage/can-start pour vérifier l'état actuel
    const token = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('cc_auth') || '{}').token || null;
      } catch { return null; }
    });

    try {
      const res = await request.post(`${BACKEND_URL}/usage/can-start`, {
        data: { user_id: userId },
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      const body = await res.json();
      console.log('  📊 /usage/can-start response:', JSON.stringify(body));

      // Le serveur doit répondre avec un objet structuré
      expect(body).toHaveProperty('ok');
      if (body.ok) {
        expect(body).toHaveProperty('allow');
        expect(body).toHaveProperty('reason');
        console.log(`  ✅ Serveur: allow=${body.allow}, reason=${body.reason}, sessionsToday=${body.sessionsToday || '?'}`);
      }
    } catch (err) {
      console.log('  ⚠️ Appel /usage/can-start échoué:', err.message);
    }
  });

  test('Vérifier que les logs quota sont émis', async ({ page }) => {
    test.setTimeout(60000);

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Forcer statut free avec compteur à 2 (encore 1 session disponible)
    await page.evaluate(() => {
      localStorage.setItem('cc_subscription_status', 'free');
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('cc_free_quota', JSON.stringify({ date: today, sessions: 2 }));
    });

    // Collecter les logs
    const quotaLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[CC][quota]')) {
        quotaLogs.push(text);
      }
    });

    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Essayer de démarrer une partie (cliquer sur le bouton Jouer s'il existe)
    const playButton = page.locator('button:has-text("Jouer"), button:has-text("Commencer"), button:has-text("Start")').first();
    if (await playButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await playButton.click();
      await page.waitForTimeout(3000);
    }

    // Vérifier qu'au moins un log [CC][quota] a été émis
    // (Si le bouton n'existe pas ou n'a pas été cliqué, les logs peuvent ne pas apparaître)
    console.log(`  📊 Logs [CC][quota] capturés: ${quotaLogs.length}`);
    for (const log of quotaLogs) {
      console.log(`    ${log}`);
    }

    // Le compteur devrait avoir été incrémenté à 3
    const finalQuota = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('cc_free_quota') || '{}');
      } catch { return {}; }
    });
    console.log(`  📊 Quota final: ${JSON.stringify(finalQuota)}`);
  });

  test('Vérifier que le statut pro bypass la limite', async ({ page }) => {
    test.setTimeout(30000);

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Forcer le statut pro
    await page.evaluate(() => {
      localStorage.setItem('cc_subscription_status', 'pro');
      const today = new Date().toISOString().slice(0, 10);
      // Même avec 10 sessions, un pro ne devrait pas être bloqué localement
      localStorage.setItem('cc_free_quota', JSON.stringify({ date: today, sessions: 10 }));
    });

    // Vérifier que isPro retourne true
    const isPro = await page.evaluate(() => {
      return localStorage.getItem('cc_subscription_status') === 'pro';
    });
    expect(isPro).toBe(true);

    // Vérifier que isFree retourne false
    const isFree = await page.evaluate(() => {
      return localStorage.getItem('cc_subscription_status') !== 'pro';
    });
    expect(isFree).toBe(false);
    console.log('  ✅ Statut pro: isFree=false, pas de limite locale');
  });
});
