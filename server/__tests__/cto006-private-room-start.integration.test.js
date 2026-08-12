// =============================================
// CTO-006 — Test d'intégration multi-client Salle Privée (serveur local réel)
// Démarre server.js sur un port local SANS Supabase ni Stripe. La dérogation
// développement CC_DEV_ALLOW_UNVERIFIED_MP n'est active que hors production
// (cf. server/access/socketAccess.js) et sert uniquement à disposer de deux
// clients habilités dans ce test.
//
// Couverture:
// B. un invité (non hôte) ne peut pas lancer la salle ;
// C. un démarrage avant que les conditions soient remplies est refusé ;
// D. un démarrage valide fait entrer les deux joueurs dans la même partie.
// =============================================

const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 4595;
const URL = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT = 30_000;

let serverProcess = null;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        SUPABASE_ANON_KEY: '',
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        // Dérogation dev/test uniquement: impossible en production.
        CC_DEV_ALLOW_UNVERIFIED_MP: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error('server boot timeout')), BOOT_TIMEOUT - 2000);
    const onData = (buf) => {
      if (buf.toString().includes(`${PORT}`)) { clearTimeout(timer); resolve(); }
    };
    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', onData);
    serverProcess.on('error', reject);
  });
}

function connect() {
  const socket = io(URL, { transports: ['websocket'], reconnection: false, forceNew: true });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitFor(socket, event, timeout = 4000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload ?? {}); });
  });
}

function waitForState(socket, predicate, timeout = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socket.off('room:state', onState); resolve(null); }, timeout);
    const onState = (state) => {
      if (predicate(state)) {
        clearTimeout(timer);
        socket.off('room:state', onState);
        resolve(state);
      }
    };
    socket.on('room:state', onState);
  });
}

const sockets = [];

async function openRoom(code) {
  const host = await connect(); sockets.push(host);
  const ack = await new Promise((resolve) => host.emit('room:create', resolve));
  const roomCode = ack && ack.ok && ack.roomCode ? ack.roomCode : code;
  host.emit('joinRoom', { roomId: roomCode, name: 'Hôte' });
  await waitForState(host, (s) => (s.players || []).length === 1);

  const guest = await connect(); sockets.push(guest);
  guest.emit('joinRoom', { roomId: roomCode, name: 'Invité' });
  const twoPlayers = await waitForState(host, (s) => (s.players || []).length === 2);
  return { host, guest, roomCode, twoPlayers };
}

beforeAll(async () => { await startServer(); }, BOOT_TIMEOUT);

afterAll(async () => {
  while (sockets.length) { try { sockets.pop().close(); } catch {} }
  if (serverProcess) { serverProcess.kill('SIGKILL'); serverProcess = null; }
});

describe('CTO-006 — autorité serveur du démarrage Salle Privée', () => {
  test('la salle expose hôte et statut lobby aux deux clients', async () => {
    const { guest, twoPlayers } = await openRoom('T6ROOM1');
    expect(twoPlayers).not.toBeNull();
    expect(twoPlayers.status).toBe('lobby');
    const hosts = (twoPlayers.players || []).filter((p) => p.isHost);
    expect(hosts).toHaveLength(1);

    const guestState = await waitForState(guest, (s) => (s.players || []).length === 2);
    expect(guestState).not.toBeNull();
    expect((guestState.players || []).filter((p) => p.isHost)).toHaveLength(1);
  }, 30_000);

  test('C. room:start avant que tous soient prêts → refusé', async () => {
    const { host } = await openRoom('T6ROOM2');
    const countdown = waitFor(host, 'room:countdown', 2500);
    host.emit('room:start');
    await expect(countdown).resolves.toBeNull();
  }, 30_000);

  test('B. un invité ne peut pas lancer la salle même si tous sont prêts', async () => {
    const { host, guest } = await openRoom('T6ROOM3');
    host.emit('ready:toggle', { ready: true });
    guest.emit('ready:toggle', { ready: true });
    await waitForState(host, (s) => (s.players || []).every((p) => p.ready) && s.players.length === 2);

    const hostCountdown = waitFor(host, 'room:countdown', 2500);
    const guestCountdown = waitFor(guest, 'room:countdown', 2500);
    guest.emit('room:start'); // l'invité tente de démarrer
    await expect(guestCountdown).resolves.toBeNull();
    await expect(hostCountdown).resolves.toBeNull();
  }, 30_000);

  test('D. démarrage valide par l’hôte → les deux clients entrent dans la même partie', async () => {
    const { host, guest } = await openRoom('T6ROOM4');
    host.emit('ready:toggle', { ready: true });
    guest.emit('ready:toggle', { ready: true });
    await waitForState(host, (s) => s.players.length === 2 && s.players.every((p) => p.ready));

    const hostRound = waitFor(host, 'round:new', 20_000);
    const guestRound = waitFor(guest, 'round:new', 20_000);
    const hostCountdown = waitFor(host, 'room:countdown', 5000);
    const guestCountdown = waitFor(guest, 'room:countdown', 5000);

    host.emit('room:start');

    expect(await hostCountdown).not.toBeNull();
    expect(await guestCountdown).not.toBeNull();

    const a = await hostRound;
    const b = await guestRound;
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Même partie: même seed et mêmes zones pour les deux joueurs
    expect(a.seed).toBe(b.seed);
    expect(Array.isArray(a.zones)).toBe(true);
    expect(a.zones.length).toBeGreaterThan(0);
    expect(JSON.stringify(b.zones)).toBe(JSON.stringify(a.zones));
  }, 60_000);
});
