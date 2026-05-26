/**
 * Custom Jest Reporter — Envoie les résultats des tests serveur au backend Monitoring
 * 
 * Même format que le reporter Playwright, pour que les résultats
 * apparaissent au même endroit dans le Monitoring Dashboard.
 */

const BACKEND_URL = process.env.TEST_BACKEND_URL || process.env.E2E_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com';

class JestMonitoringReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }

  async onRunComplete(contexts, results) {
    const tests = [];

    for (const suite of results.testResults) {
      const file = suite.testFilePath.replace(/.*[/\\]server[/\\]__tests__[/\\]/, '');
      for (const test of suite.testResults) {
        tests.push({
          file: `server/__tests__/${file}`,
          title: test.title,
          suite: test.ancestorTitles.join(' > '),
          status: test.status === 'passed' ? 'passed'
                : test.status === 'failed' ? 'failed'
                : 'skipped',
          duration: test.duration || 0,
          error: test.failureMessages && test.failureMessages.length > 0
            ? test.failureMessages[0].substring(0, 500)
            : null,
        });
      }
    }

    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed').length;
    const skipped = tests.filter(t => t.status === 'skipped').length;

    const report = {
      timestamp: new Date().toISOString(),
      source: process.env.CI ? 'github-actions' : 'local',
      branch: process.env.GITHUB_REF_NAME || 'local',
      commit: process.env.GITHUB_SHA ? process.env.GITHUB_SHA.substring(0, 8) : 'local',
      runId: process.env.GITHUB_RUN_ID || `local_jest_${Date.now()}`,
      type: 'jest-server', // Distinguer des tests Playwright
      summary: {
        total: tests.length,
        passed,
        failed,
        skipped,
        timedOut: 0,
        duration: results.testResults.reduce((sum, s) => sum + (s.perfStats?.runtime || 0), 0),
        status: failed > 0 ? 'FAIL' : 'PASS',
      },
      tests,
      failedTests: tests.filter(t => t.status === 'failed'),
    };

    console.log(`\n[JestMonitoringReporter] 📊 ${passed} ✅ | ${failed} ❌ | ${skipped} ⏭️`);

    // Envoyer au monitoring (3 tentatives)
    let sent = false;
    for (let attempt = 1; attempt <= 3 && !sent; attempt++) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/monitoring/e2e-results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          console.log(`[JestMonitoringReporter] ✅ Rapport envoyé au monitoring`);
          sent = true;
        } else {
          console.warn(`[JestMonitoringReporter] ⚠️ HTTP ${res.status}`);
        }
      } catch (err) {
        console.warn(`[JestMonitoringReporter] ⚠️ Tentative ${attempt}/3 échouée:`, err.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
      }
    }
    if (!sent) {
      console.warn('[JestMonitoringReporter] ⚠️ Envoi échoué — résultats non transmis au monitoring');
    }
  }
}

module.exports = JestMonitoringReporter;
