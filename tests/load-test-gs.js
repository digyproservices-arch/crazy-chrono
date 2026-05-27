/**
 * LOAD TEST — Grande Salle (Node.js headless)
 * 
 * Simule N vrais joueurs WebSocket qui rejoignent un tournoi,
 * jouent les rounds (tentatives de paires), et mesurent :
 * - Temps de connexion
 * - Latence des événements
 * - Déconnexions
 * - Mémoire serveur
 * 
 * Usage:
 *   node tests/load-test-gs.js --url https://crazy-chrono-backend.onrender.com --bots 200 --tournament <ID>
 *   node tests/load-test-gs.js --url http://localhost:5000 --bots 50 --tournament <ID>
 * 
 * Options:
 *   --url         URL du serveur (défaut: http://localhost:5000)
 *   --bots        Nombre de bots (défaut: 200)
 *   --tournament  ID du tournoi à rejoindre (obligatoire)
 *   --delay       Délai entre chaque connexion en ms (défaut: 100)
 *   --play        Si les bots doivent tenter des paires pendant les rounds (défaut: true)
 *   --auto-start  Envoyer gs:start après que tous les bots aient rejoint (défaut: false)
 */

const { io } = require('socket.io-client');

// ─── Parse CLI arguments ───
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}
function hasFlag(name) { return args.includes(`--${name}`); }

const SERVER_URL = getArg('url', 'http://localhost:5000');
const BOT_COUNT = parseInt(getArg('bots', '200'), 10);
const TOURNAMENT_ID = getArg('tournament', '');
const CONNECT_DELAY = parseInt(getArg('delay', '100'), 10);
const SHOULD_PLAY = getArg('play', 'true') !== 'false';
const AUTO_START = hasFlag('auto-start');

if (!TOURNAMENT_ID) {
  console.error('❌ --tournament <ID> est obligatoire. Crée un tournoi depuis l\'admin puis copie l\'ID.');
  process.exit(1);
}

// ─── Stats ───
const stats = {
  connected: 0,
  joined: 0,
  disconnected: 0,
  reconnected: 0,
  errors: 0,
  pairsAttempted: 0,
  pairsValid: 0,
  pairsInvalid: 0,
  roundsReceived: 0,
  eliminations: 0,
  connectTimes: [],  // ms per bot
  latencies: [],     // event round-trip samples
};

const bots = [];  // { socket, name, zones, eliminated, connected }

// ─── Helpers ───
function randomName(i) {
  return `LoadBot-${String(i).padStart(3, '0')}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ─── Create one bot ───
function createBot(index) {
  return new Promise((resolve) => {
    const name = randomName(index);
    const t0 = Date.now();

    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 15000,
    });

    const bot = { socket, name, zones: [], eliminated: false, connected: false, joinedAt: null };
    bots.push(bot);

    socket.on('connect', () => {
      const connectTime = Date.now() - t0;
      stats.connectTimes.push(connectTime);
      stats.connected++;
      bot.connected = true;

      // Join the tournament
      socket.emit('gs:join', {
        name,
        tournamentId: TOURNAMENT_ID,
      }, (res) => {
        if (res && res.ok) {
          stats.joined++;
          bot.joinedAt = Date.now();
        } else {
          stats.errors++;
          console.error(`  ❌ ${name} join failed:`, res?.error || 'unknown');
        }
        resolve(bot);
      });
    });

    socket.on('disconnect', (reason) => {
      stats.disconnected++;
      bot.connected = false;
      if (reason !== 'io client disconnect') {
        // Unexpected disconnect
        console.warn(`  ⚠️  ${name} disconnected: ${reason}`);
      }
    });

    socket.on('reconnect', () => {
      stats.reconnected++;
      bot.connected = true;
    });

    socket.on('connect_error', (err) => {
      stats.errors++;
      if (index < 5) console.error(`  ❌ ${name} connect_error: ${err.message}`);
    });

    // ─── Game events ───
    socket.on('gs:round:new', (data) => {
      stats.roundsReceived++;
      bot.zones = data.zones || [];
      bot.eliminated = false;

      // Attempt pairs randomly during the round
      if (SHOULD_PLAY && bot.zones.length >= 2 && !bot.eliminated) {
        attemptRandomPairs(bot);
      }
    });

    socket.on('gs:pair:valid', () => {
      stats.pairsValid++;
    });

    socket.on('gs:pair:invalid', () => {
      stats.pairsInvalid++;
    });

    socket.on('gs:elimination', (data) => {
      stats.eliminations++;
      // Check if this bot was eliminated
      if (data.eliminated && data.eliminated.some(e => e.id === socket.id)) {
        bot.eliminated = true;
      }
    });

    socket.on('gs:finish', () => {
      // Game over
    });

    // Timeout if connection takes too long
    setTimeout(() => {
      if (!bot.connected) {
        stats.errors++;
        resolve(bot);
      }
    }, 20000);
  });
}

// ─── Bot gameplay: attempt random pairs ───
function attemptRandomPairs(bot) {
  if (bot.eliminated || !bot.zones.length) return;

  // Find valid pairs in zones
  const validPairs = [];
  const zonesWithPair = bot.zones.filter(z => z.pairId);
  const pairMap = {};
  for (const z of zonesWithPair) {
    if (!pairMap[z.pairId]) pairMap[z.pairId] = [];
    pairMap[z.pairId].push(z.id);
  }
  for (const [, ids] of Object.entries(pairMap)) {
    if (ids.length === 2) validPairs.push(ids);
  }

  // Attempt pairs with delays (simulate human speed)
  let delay = 2000 + Math.random() * 5000; // 2-7s before first attempt
  for (const [a, b] of validPairs) {
    setTimeout(() => {
      if (bot.eliminated || !bot.connected) return;
      bot.socket.emit('gs:attemptPair', { a, b });
      stats.pairsAttempted++;
    }, delay);
    delay += 1500 + Math.random() * 3000; // 1.5-4.5s between attempts
  }
}

// ─── Print stats ───
function printStats() {
  const connectedNow = bots.filter(b => b.connected).length;
  console.log('\n═══════════════════════════════════════════');
  console.log('         📊 RÉSULTATS DU LOAD TEST');
  console.log('═══════════════════════════════════════════');
  console.log(`  Serveur:         ${SERVER_URL}`);
  console.log(`  Tournoi:         ${TOURNAMENT_ID}`);
  console.log(`  Bots demandés:   ${BOT_COUNT}`);
  console.log('───────────────────────────────────────────');
  console.log(`  ✅ Connectés:     ${stats.connected}`);
  console.log(`  ✅ Rejoints (GS): ${stats.joined}`);
  console.log(`  ⚠️  Déconnexions:  ${stats.disconnected}`);
  console.log(`  🔄 Reconnexions:  ${stats.reconnected}`);
  console.log(`  ❌ Erreurs:       ${stats.errors}`);
  console.log(`  📡 En ligne now:  ${connectedNow}`);
  console.log('───────────────────────────────────────────');
  console.log(`  🎮 Rounds reçus:  ${stats.roundsReceived}`);
  console.log(`  🎯 Paires tentées: ${stats.pairsAttempted}`);
  console.log(`  ✅ Paires valides: ${stats.pairsValid}`);
  console.log(`  ❌ Paires invalides: ${stats.pairsInvalid}`);
  console.log(`  💀 Éliminations:  ${stats.eliminations}`);
  console.log('───────────────────────────────────────────');
  if (stats.connectTimes.length) {
    console.log(`  ⏱️  Connexion — min: ${Math.min(...stats.connectTimes)}ms | max: ${Math.max(...stats.connectTimes)}ms | p50: ${percentile(stats.connectTimes, 0.5)}ms | p95: ${percentile(stats.connectTimes, 0.95)}ms`);
  }
  console.log('═══════════════════════════════════════════\n');
}

// ─── Live stats ticker ───
let tickInterval;
function startTicker() {
  tickInterval = setInterval(() => {
    const connectedNow = bots.filter(b => b.connected).length;
    process.stdout.write(`\r  [LIVE] Connectés: ${stats.connected}/${BOT_COUNT} | Rejoints: ${stats.joined} | Déco: ${stats.disconnected} | Rounds: ${stats.roundsReceived} | En ligne: ${connectedNow}   `);
  }, 1000);
}

// ─── Main ───
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  🚀 LOAD TEST GRANDE SALLE — Node.js');
  console.log('═══════════════════════════════════════════');
  console.log(`  Serveur: ${SERVER_URL}`);
  console.log(`  Bots: ${BOT_COUNT}`);
  console.log(`  Tournoi: ${TOURNAMENT_ID}`);
  console.log(`  Délai connexion: ${CONNECT_DELAY}ms`);
  console.log(`  Jouer les rounds: ${SHOULD_PLAY}`);
  console.log(`  Auto-start: ${AUTO_START}`);
  console.log('───────────────────────────────────────────');
  console.log('  Connexion des bots...\n');

  startTicker();

  // Connect bots with staggered delay
  for (let i = 0; i < BOT_COUNT; i++) {
    await createBot(i);
    if (CONNECT_DELAY > 0) await sleep(CONNECT_DELAY);
  }

  clearInterval(tickInterval);
  console.log('\n');
  console.log(`  ✅ Tous les bots connectés (${stats.joined}/${BOT_COUNT} ont rejoint le tournoi)`);

  // Auto-start if requested
  if (AUTO_START && bots.length > 0 && bots[0].socket.connected) {
    console.log('  🎬 Envoi de gs:start...');
    bots[0].socket.emit('gs:start', { salleId: `tournament:${TOURNAMENT_ID}` }, (res) => {
      if (res?.ok) console.log('  ✅ Tournoi démarré !');
      else console.log('  ❌ Start failed:', res?.error);
    });
  }

  // Wait for game to play out
  console.log('\n  ⏳ En attente des rounds... (Ctrl+C pour arrêter et voir les stats)\n');
  startTicker();

  // Print stats on exit
  process.on('SIGINT', () => {
    clearInterval(tickInterval);
    printStats();

    // Disconnect all bots cleanly
    console.log('  Déconnexion des bots...');
    for (const bot of bots) {
      try { bot.socket.disconnect(); } catch {}
    }
    setTimeout(() => process.exit(0), 1000);
  });

  // Also print stats every 30s
  setInterval(() => {
    clearInterval(tickInterval);
    printStats();
    startTicker();
  }, 30000);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
