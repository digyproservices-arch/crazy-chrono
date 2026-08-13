// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Configuration dédiée aux tests responsive du plateau (CTO-008).
 *
 * Contrairement à playwright.config.js, aucun backend n'est requis : les tests
 * chargent une fixture statique (e2e/fixtures/solo-board.html) avec la vraie
 * feuille de style du plateau. Pas de globalSetup, donc exécutable hors ligne.
 *
 *   npm run test:responsive
 */
module.exports = defineConfig({
  testDir: './e2e',
  testMatch: /16-solo-responsive\.spec\.js/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 30000,
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium' }],
});
