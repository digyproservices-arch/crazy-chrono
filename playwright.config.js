// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Crazy Chrono — Configuration Playwright E2E
 * 
 * Les tests tournent contre l'app de production (app.crazy-chrono.com)
 * ou en local (localhost:3000) via la variable E2E_BASE_URL.
 * 
 * Lancer les tests :
 *   npx playwright test                    → tous les tests (headless)
 *   npx playwright test --headed           → avec navigateur visible
 *   npx playwright test --ui               → interface graphique
 *   npx playwright test auth.spec.js       → un seul fichier
 */
module.exports = defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/globalSetup.js',
  globalTeardown: './e2e/globalTeardown.js',
  fullyParallel: false, // Sequential pour éviter conflits auth
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 1 worker pour éviter conflits de session
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e-report' }],
    ['json', { outputFile: 'e2e-report/results.json' }],
    ['./e2e/monitoring-reporter.js'],
  ],
  // CTO-009 : 2 min par défaut. Le test le plus long observé en CI dure 33 s ;
  // les tests réellement longs déclarent leur propre budget via test.setTimeout()
  // (07-all-students, 02-auth, 10-multiplayer, 11-regression, 14-card-integrity).
  // L'ancien défaut de 10 min laissait un test bloqué consommer 30 min de CI
  // (10 min × 3 tentatives) et faisait annuler tout le job sans aucun rapport.
  timeout: 120000,
  // CTO-009 : borne l'exécution complète sous le timeout du job GitHub (60 min)
  // pour que Playwright s'arrête lui-même et produise un rapport exploitable,
  // au lieu d'être tué par le runner (cas des runs « cancelled » sans rapport).
  globalTimeout: 45 * 60 * 1000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://app.crazy-chrono.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile désactivé — nécessite des tests responsive dédiés
    // {
    //   name: 'mobile',
    //   use: { ...devices['iPhone 13'] },
    // },
  ],
});
