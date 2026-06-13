// Audit one-shot: recherche de traces factuelles de l'écran blanc iPhone
// Usage: node scripts/audit-ios-whitescreen.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== AUDIT ÉCRAN BLANC iOS ===\n');

  // 1. Erreurs React Boundary (crash de rendu)
  const { data: t1, error: e1 } = await sb
    .from('mon_client_telemetry')
    .select('details, device_id, received_at')
    .order('received_at', { ascending: false })
    .limit(1000);

  if (e1) { console.error('Erreur telemetry:', e1.message); return; }

  const events = (t1 || []).map(r => ({ ...r.details, deviceId: r.device_id, receivedAt: r.received_at }));
  console.log(`Total événements télémétrie récents: ${events.length}\n`);

  // Groupes d'intérêt
  const reactErrors = events.filter(e => e.event === 'error:react-boundary');
  const jsErrors = events.filter(e => (e.event || '').startsWith('error:'));
  const watchdog = events.filter(e => e.event === 'game:blank-watchdog');
  const iosEvents = events.filter(e => e.platform === 'ios');

  console.log(`--- error:react-boundary (crash React): ${reactErrors.length} ---`);
  reactErrors.slice(0, 10).forEach(e => console.log(JSON.stringify(e, null, 1).slice(0, 800), '\n'));

  console.log(`\n--- Toutes erreurs JS (error:*): ${jsErrors.length} ---`);
  const errSummary = {};
  jsErrors.forEach(e => {
    const key = `${e.event} | ${(e.errorMsg || e.message || '?').slice(0, 80)} | ${e.platform || '?'}`;
    errSummary[key] = (errSummary[key] || 0) + 1;
  });
  Object.entries(errSummary).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  [${v}x] ${k}`));

  console.log(`\n--- game:blank-watchdog (jeu bloqué détecté): ${watchdog.length} ---`);
  watchdog.slice(0, 10).forEach(e => console.log(' ', JSON.stringify(e).slice(0, 300)));

  console.log(`\n--- Événements iOS: ${iosEvents.length} ---`);
  const iosSummary = {};
  iosEvents.forEach(e => { iosSummary[e.event] = (iosSummary[e.event] || 0) + 1; });
  Object.entries(iosSummary).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  [${v}x] ${k}`));

  // 2. Game traces (cc_game_trace synchronisés)
  const { data: t2, error: e2 } = await sb
    .from('mon_game_traces')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (!e2 && t2) {
    console.log(`\n--- Game traces synchronisés: ${t2.length} ---`);
    t2.forEach(r => {
      const tr = r.trace || r.details || r;
      const evts = Array.isArray(tr) ? tr : (tr.events || []);
      const summary = (Array.isArray(evts) ? evts : []).map(ev => ev.event).join(' → ');
      console.log(`  [${r.created_at}] device=${(r.device_id || '?').slice(0, 12)}: ${summary.slice(0, 250)}`);
    });
  } else if (e2) {
    console.log(`\n(table mon_game_traces non disponible: ${e2.message})`);
  }

  console.log('\n=== FIN AUDIT ===');
})();
