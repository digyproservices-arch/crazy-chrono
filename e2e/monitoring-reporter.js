/**
 * Custom Playwright Reporter — Envoie les résultats E2E au backend Monitoring
 * 
 * À chaque exécution des tests, ce reporter :
 * 1. Collecte tous les résultats (pass/fail/skip)
 * 2. Envoie un rapport JSON complet au backend /api/monitoring/e2e-results
 * 3. Les résultats sont visibles dans le Monitoring Dashboard
 */

const BACKEND_URL = process.env.E2E_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com';

class MonitoringReporter {
  constructor() {
    /** @type {Array<{file: string, title: string, status: string, duration: number, error: string|null, suite: string}>} */
    this.results = [];
    this.startTime = Date.now();
    this.suiteName = '';
  }

  onBegin(config, suite) {
    this.startTime = Date.now();
    console.log(`\n[MonitoringReporter] 🚀 Début des tests E2E — ${suite.allTests().length} tests`);
  }

  onTestEnd(test, result) {
    const entry = {
      file: test.location.file.replace(/.*[/\\]e2e[/\\]/, ''),
      title: test.title,
      suite: test.parent ? test.parent.title : '',
      status: result.status, // 'passed' | 'failed' | 'skipped' | 'timedOut'
      duration: result.duration,
      error: null,
    };

    if (result.status === 'failed' || result.status === 'timedOut') {
      entry.error = result.error ? result.error.message.substring(0, 500) : 'Unknown error';
    }

    this.results.push(entry);

    const icon = result.status === 'passed' ? '✅' :
                 result.status === 'failed' ? '❌' :
                 result.status === 'timedOut' ? '⏰' : '⏭️';
    console.log(`  ${icon} ${entry.file} › ${entry.title} (${result.duration}ms)`);
  }

  async onEnd(result) {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;
    const timedOut = this.results.filter(r => r.status === 'timedOut').length;

    const report = {
      timestamp: new Date().toISOString(),
      source: process.env.CI ? 'github-actions' : 'local',
      branch: process.env.GITHUB_REF_NAME || 'local',
      commit: process.env.GITHUB_SHA ? process.env.GITHUB_SHA.substring(0, 8) : 'local',
      runId: process.env.GITHUB_RUN_ID || `local_${Date.now()}`,
      summary: {
        total: this.results.length,
        passed,
        failed,
        skipped,
        timedOut,
        duration: totalDuration,
        status: failed > 0 || timedOut > 0 ? 'FAIL' : 'PASS',
      },
      tests: this.results,
      failedTests: this.results.filter(r => r.status === 'failed' || r.status === 'timedOut'),
    };

    console.log(`\n[MonitoringReporter] 📊 Résumé: ${passed} ✅ | ${failed} ❌ | ${skipped} ⏭️ | ${timedOut} ⏰ | ${(totalDuration / 1000).toFixed(1)}s`);

    // Envoyer au backend
    try {
      const res = await fetch(`${BACKEND_URL}/api/monitoring/e2e-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });

      if (res.ok) {
        console.log(`[MonitoringReporter] ✅ Rapport envoyé au monitoring (${BACKEND_URL})`);
      } else {
        console.warn(`[MonitoringReporter] ⚠️ Envoi échoué: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`[MonitoringReporter] ⚠️ Impossible d'envoyer au monitoring:`, err.message);
    }
  }
}

module.exports = MonitoringReporter;
