#!/usr/bin/env node
/* eslint-disable no-console */
// ==========================================================
// TEST DE CHARGE — Grande Salle (Crazy Chrono)
// Simule N joueurs invités qui rejoignent une salle et cliquent.
//
// Usage:
//   node scripts/gs-loadtest.js --url http://localhost:4000 --players 200
//   node scripts/gs-loadtest.js --url https://<staging> --players 500 --tournament <id>
//
// Options:
//   --url <url>          URL du serveur (défaut: http://localhost:4000)
//   --players <n>        Nombre de joueurs simulés (défaut: 100)
//   --ramp <n>           Connexions par seconde pendant la montée (défaut: 25)
//   --duration <s>       Durée du test après montée complète (défaut: 120s)
//   --click-interval <ms> Intervalle moyen entre clics par bot (défaut: 3000)
//   --tournament <id>    ID de tournoi (défaut: grande-salle-publique)
//
// ⚠️ NE PAS lancer contre la production avec de vrais joueurs connectés.
// ==========================================================

const { io } = require('socket.io-client');

// ---------- CLI args ----------
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = (process.argv[i] || '').replace(/^--/, '');
  args[k] = process.argv[i + 1];
}
const URL = args.url || 'http://localhost:4000';
const PLAYERS = parseInt(args.players || '100', 10);
const RAMP_PER_SEC = parseInt(args.ramp || '25', 10);
const DURATION_S = parseInt(args.duration || '120', 10);
const CLICK_INTERVAL_MS = parseInt(args['click-interval'] || '3000', 10);
const TOURNAMENT_ID = args.tournament || null;

// ---------- Stats ----------
const stats = {
  connected: 0,
  connectErrors: 0,
  joinOk: 0,
  joinFail: 0,
  disconnects: 0,
  eventsReceived: 0,
  pairAttempts: 0,
  roundsReceived: 0,
  joinLatencies: [], // ms
};
const bots = [];
let stopping = false;

function pct(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

// ---------- Bot ----------
function createBot(idx) {
  const name = `LoadBot ${String(idx + 1).padStart(4, '0')}`;
  const socket = io(URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 3,
    timeout: 15000,
    auth: {}, // invité pur, comme le parcours QR
  });
  const bot = { socket, name, zones: [], clickTimer: null, joined: false };

  socket.on('connect', () => {
    stats.connected++;
    const t0 = Date.now();
    const payload = { name };
    if (TOURNAMENT_ID) payload.tournamentId = TOURNAMENT_ID;
    else payload.salleId = 'grande-salle-publique';
    socket.emit('gs:join', payload, (res) => {
      stats.joinLatencies.push(Date.now() - t0);
      if (res && res.error) { stats.joinFail++; }
      else { stats.joinOk++; bot.joined = true; }
    });
  });

  socket.on('connect_error', (err) => {
    stats.connectErrors++;
    if (stats.connectErrors <= 5) console.error(`  ⚠️ connect_error (${name}):`, err.message);
  });

  socket.on('disconnect', () => { stats.disconnects++; });

  socket.onAny(() => { stats.eventsReceived++; });

  socket.on('gs:round:new', (payload) => {
    stats.roundsReceived++;
    bot.zones = (payload && payload.zones) || [];
    // Démarrer les clics aléatoires pendant la manche
    if (bot.clickTimer) clearInterval(bot.clickTimer);
    bot.clickTimer = setInterval(() => {
      if (stopping || !bot.zones.length) return;
      const a = bot.zones[Math.floor(Math.random() * bot.zones.length)];
      const b = bot.zones[Math.floor(Math.random() * bot.zones.length)];
      if (a && b && a.id !== b.id) {
        stats.pairAttempts++;
        socket.emit('gs:attemptPair', { a: a.id, b: b.id });
      }
    }, CLICK_INTERVAL_MS + Math.random() * 1000);
  });

  socket.on('gs:finish', () => { if (bot.clickTimer) clearInterval(bot.clickTimer); });

  return bot;
}

// ---------- Ramp-up ----------
console.log('==========================================================');
console.log(`🚀 TEST DE CHARGE Grande Salle`);
console.log(`   URL: ${URL}`);
console.log(`   Joueurs: ${PLAYERS} | Montée: ${RAMP_PER_SEC}/s | Durée: ${DURATION_S}s`);
console.log(`   Salle: ${TOURNAMENT_ID ? `tournament:${TOURNAMENT_ID}` : 'grande-salle-publique'}`);
console.log('==========================================================');

let created = 0;
const rampTimer = setInterval(() => {
  for (let i = 0; i < RAMP_PER_SEC && created < PLAYERS; i++) {
    bots.push(createBot(created++));
  }
  if (created >= PLAYERS) {
    clearInterval(rampTimer);
    console.log(`✅ Montée terminée: ${PLAYERS} bots créés. Test pendant ${DURATION_S}s...`);
    setTimeout(shutdown, DURATION_S * 1000);
  }
}, 1000);

// ---------- Reporting ----------
const reportTimer = setInterval(() => {
  const lat = stats.joinLatencies;
  console.log(
    `[${new Date().toISOString().slice(11, 19)}] ` +
    `conn=${stats.connected}/${created} err=${stats.connectErrors} ` +
    `join OK=${stats.joinOk} KO=${stats.joinFail} ` +
    `disc=${stats.disconnects} rounds=${stats.roundsReceived} ` +
    `clics=${stats.pairAttempts} events=${stats.eventsReceived} ` +
    `join p50=${pct(lat, 0.5)}ms p95=${pct(lat, 0.95)}ms max=${Math.max(0, ...lat)}ms`
  );
}, 5000);

// ---------- Shutdown ----------
function shutdown() {
  stopping = true;
  clearInterval(reportTimer);
  console.log('\n========== RAPPORT FINAL ==========');
  console.log(`Bots créés:          ${created}`);
  console.log(`Connexions réussies: ${stats.connected}`);
  console.log(`Erreurs connexion:   ${stats.connectErrors}`);
  console.log(`Join OK / KO:        ${stats.joinOk} / ${stats.joinFail}`);
  console.log(`Déconnexions:        ${stats.disconnects}`);
  console.log(`Manches reçues:      ${stats.roundsReceived}`);
  console.log(`Clics envoyés:       ${stats.pairAttempts}`);
  console.log(`Événements reçus:    ${stats.eventsReceived}`);
  const lat = stats.joinLatencies;
  console.log(`Latence join:        p50=${pct(lat, 0.5)}ms | p95=${pct(lat, 0.95)}ms | max=${Math.max(0, ...lat)}ms`);
  const verdict = stats.connectErrors === 0 && stats.joinFail === 0 && pct(lat, 0.95) < 2000;
  console.log(`\nVERDICT: ${verdict ? '✅ Le serveur a tenu la charge' : '❌ Problèmes détectés — voir ci-dessus'}`);
  bots.forEach(b => { try { if (b.clickTimer) clearInterval(b.clickTimer); b.socket.disconnect(); } catch {} });
  setTimeout(() => process.exit(verdict ? 0 : 1), 2000);
}

process.on('SIGINT', () => { console.log('\nInterruption manuelle...'); shutdown(); });
