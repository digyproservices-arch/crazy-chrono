// =============================================
// CTO-002 — Test d'intégration Socket.IO (serveur local réel)
// Démarre server.js sur un port local SANS configuration Supabase ni Stripe:
// aucun appel production. Vérifie que le multijoueur payant est fermé aux
// sockets anonymes et que le parcours Solo gratuit fonctionne toujours.
// =============================================

const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 4577;
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
        // Aucune configuration externe: pas de Supabase, pas de Stripe, pas de dérogation dev.
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        SUPABASE_ANON_KEY: '',
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        CC_DEV_ALLOW_UNVERIFIED_MP: '',
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

beforeAll(async () => { await startServer(); }, BOOT_TIMEOUT);

afterAll(async () => {
  if (serverProcess) { serverProcess.kill('SIGKILL'); serverProcess = null; }
});

describe('CTO-002 — multijoueur payant fermé aux sockets anonymes', () => {
  let socket;
  afterEach(() => { if (socket) { socket.close(); socket = null; } });

  test('room:create anonyme → refusé (subscription_required)', async () => {
    socket = await connect();
    const required = waitFor(socket, 'subscription:required');
    const ack = await new Promise((resolve) => socket.emit('room:create', resolve));

    expect(ack).toEqual({ ok: false, error: 'subscription_required' });
    await expect(required).resolves.toMatchObject({ event: 'room:create' });
  });

  test('joinRoom anonyme sur une salle privée → refusé', async () => {
    socket = await connect();
    const required = waitFor(socket, 'subscription:required');
    socket.emit('joinRoom', { roomId: 'PRIV1', name: 'Anonyme', studentId: 'std_forge_0001' });

    await expect(required).resolves.toMatchObject({ event: 'joinRoom' });
  });

  test('startGame anonyme sur une salle non-solo → refusé, aucune manche envoyée', async () => {
    socket = await connect();
    socket.emit('joinRoom', { roomId: 'PRIV2', name: 'Anonyme' });
    await waitFor(socket, 'subscription:required');

    const round = waitFor(socket, 'round:new', 2000);
    socket.emit('startGame');
    await expect(round).resolves.toBeNull();
  });
});

describe('CTO-002 — non-régression Solo gratuit', () => {
  let socket;
  afterEach(() => { if (socket) { socket.close(); socket = null; } });

  test('un socket anonyme peut jouer une manche Solo', async () => {
    socket = await connect();
    const denied = waitFor(socket, 'subscription:required', 1500);
    socket.emit('joinRoom', { roomId: `solo-${Date.now()}`, name: 'Solo' });
    await expect(denied).resolves.toBeNull();

    const round = waitFor(socket, 'round:new', 8000);
    socket.emit('startGame');
    const payload = await round;
    expect(payload).not.toBeNull();
  }, 20_000);
});
