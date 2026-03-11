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
  fullyParallel: false, // Sequential pour éviter conflits auth
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 1 worker pour éviter conflits de session
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e-report' }],
    ['json', { outputFile: 'e2e-report/results.json' }],
  ],
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
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
