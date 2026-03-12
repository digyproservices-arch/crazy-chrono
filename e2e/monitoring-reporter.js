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

  /** Wake up Render backend (cold start ~30s) before POSTing results */
  async _wakeUpBackend() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[MonitoringReporter] 🏓 Wake-up ping #${attempt}...`);
        const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(15000) });
        if (res.ok) { console.log('[MonitoringReporter] ✅ Backend is awake'); return true; }
      } catch { /* retry */ }
      if (attempt < 3) await new Promise(r => setTimeout(r, 10000));
    }
    console.warn('[MonitoringReporter] ⚠️ Backend did not wake up after 3 pings');
    return false;
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
      retry: result.retry || 0,
      error: null,
      // Clé unique pour dédupliquer les retries
      _testKey: `${test.location.file.replace(/.*[/\\]e2e[/\\]/, '')}::${test.title}`,
    };

    if (result.status === 'failed' || result.status === 'timedOut') {
      entry.error = result.error ? result.error.message.substring(0, 500) : 'Unknown error';
    }

    this.results.push(entry);

    const retryLabel = entry.retry > 0 ? ` (retry #${entry.retry})` : '';
    const icon = result.status === 'passed' ? '✅' :
                 result.status === 'failed' ? '❌' :
                 result.status === 'timedOut' ? '⏰' : '⏭️';
    console.log(`  ${icon} ${entry.file} › ${entry.title}${retryLabel} (${result.duration}ms)`);
  }

  async onEnd(result) {
    const totalDuration = Date.now() - this.startTime;

    // Dédupliquer: garder uniquement le DERNIER résultat pour chaque test unique
    // Avec retries: 2, un test qui échoue 3× était compté 3× dans "failed"
    const byKey = new Map();
    for (const r of this.results) {
      const key = r._testKey || `${r.file}::${r.title}`;
      byKey.set(key, r); // Écrase avec la tentative la plus récente
    }
    const dedupResults = [...byKey.values()];

    const passed = dedupResults.filter(r => r.status === 'passed').length;
    const failed = dedupResults.filter(r => r.status === 'failed').length;
    const skipped = dedupResults.filter(r => r.status === 'skipped').length;
    const timedOut = dedupResults.filter(r => r.status === 'timedOut').length;

    const report = {
      timestamp: new Date().toISOString(),
      source: process.env.CI ? 'github-actions' : 'local',
      branch: process.env.GITHUB_REF_NAME || 'local',
      commit: process.env.GITHUB_SHA ? process.env.GITHUB_SHA.substring(0, 8) : 'local',
      runId: process.env.GITHUB_RUN_ID || `local_${Date.now()}`,
      summary: {
        total: dedupResults.length,
        passed,
        failed,
        skipped,
        timedOut,
        duration: totalDuration,
        status: failed > 0 || timedOut > 0 ? 'FAIL' : 'PASS',
        rawTotal: this.results.length, // Nombre brut (avec retries) pour diagnostic
      },
      tests: dedupResults,
      failedTests: dedupResults.filter(r => r.status === 'failed' || r.status === 'timedOut'),
    };

    if (this.results.length !== dedupResults.length) {
      console.log(`\n[MonitoringReporter] 🔄 ${this.results.length - dedupResults.length} retries dédupliquées (${this.results.length} → ${dedupResults.length} tests uniques)`);
    }
    console.log(`[MonitoringReporter] 📊 Résumé: ${passed} ✅ | ${failed} ❌ | ${skipped} ⏭️ | ${timedOut} ⏰ | ${(totalDuration / 1000).toFixed(1)}s`);

    // Réveiller le backend Render (cold start) puis envoyer avec retry
    await this._wakeUpBackend();

    let sent = false;
    for (let attempt = 1; attempt <= 3 && !sent; attempt++) {
      try {
        console.log(`[MonitoringReporter] 📤 POST résultats (tentative ${attempt}/3)...`);
        const res = await fetch(`${BACKEND_URL}/api/monitoring/e2e-results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          console.log(`[MonitoringReporter] ✅ Rapport envoyé au monitoring (${BACKEND_URL})`);
          sent = true;
        } else {
          console.warn(`[MonitoringReporter] ⚠️ Envoi échoué: HTTP ${res.status}`);
        }
      } catch (err) {
        console.warn(`[MonitoringReporter] ⚠️ Tentative ${attempt} échouée:`, err.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 5000));
      }
    }
    if (!sent) console.error('[MonitoringReporter] ❌ Impossible d\'envoyer les résultats après 3 tentatives');
  }
}

module.exports = MonitoringReporter;
