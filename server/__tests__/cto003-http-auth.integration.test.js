// =============================================
// CTO-003 — Sécurité HTTP / identité / données, via le VRAI pipeline Express
//
// Démarre server.js sur un port local avec un Supabase stub injecté par
// --require (server/testUtils/supabaseStubPreload.js): aucune Supabase de
// production, aucun Stripe, aucun appel réseau.
//
// Prouve que l'identité et les droits proviennent exclusivement du JWT vérifié:
//   - /me n'énumère plus les comptes par email;
//   - /me/subscription ignore user_id / x-user-id;
//   - /usage/can-start ignore body.user_id;
//   - /students n'est plus public;
//   - /delete-image et /purge-elements exigent un administrateur;
//   - /api/logs n'écrit plus hors du dossier logs/.
// =============================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 4583;
const HOST = '127.0.0.1';
const BOOT_TIMEOUT = 30_000;

const USER_A = { id: '11111111-1111-4111-8111-111111111111', email: 'freea@example.com' };
const USER_B = { id: '22222222-2222-4222-8222-222222222222', email: 'victim@example.com' };
const TEACHER = { id: '33333333-3333-4333-8333-333333333333', email: 'prof@example.com' };
const ADMIN = { id: '44444444-4444-4444-8444-444444444444', email: 'admin@example.com' };

const TOKENS = { A: 'tok-a', B: 'tok-b', TEACHER: 'tok-teacher', ADMIN: 'tok-admin' };

const FIXTURE = {
  usersByToken: {
    [TOKENS.A]: USER_A,
    [TOKENS.B]: USER_B,
    [TOKENS.TEACHER]: TEACHER,
    [TOKENS.ADMIN]: ADMIN,
  },
  tables: {
    user_profiles: [
      { id: USER_A.id, email: USER_A.email, role: 'user', region: null, circonscription_id: null },
      { id: USER_B.id, email: USER_B.email, role: 'user', region: 'GP', circonscription_id: 'c-42' },
      { id: TEACHER.id, email: TEACHER.email, role: 'teacher', region: null, circonscription_id: null },
      { id: ADMIN.id, email: ADMIN.email, role: 'admin', region: null, circonscription_id: null },
    ],
    subscriptions: [
      { user_id: USER_B.id, status: 'active', current_period_end: '2099-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
    ],
    sessions: [],
    students: [],
    user_student_mapping: [],
  },
};

let serverProcess = null;
let fixtureFile = null;

function startServer() {
  fixtureFile = path.join(os.tmpdir(), `cto003-fixture-${Date.now()}.json`);
  fs.writeFileSync(fixtureFile, JSON.stringify(FIXTURE), 'utf8');
  const preload = path.join(__dirname, '..', 'testUtils', 'supabaseStubPreload.js');
  return new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        NODE_OPTIONS: `--require ${preload}`,
        CC_TEST_SUPABASE_FIXTURE: fixtureFile,
        SUPABASE_URL: 'http://supabase.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-role-key',
        SUPABASE_ANON_KEY: 'stub-anon-key',
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

function request(method, urlPath, { token, headers = {}, body } = {}) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const opts = {
    host: HOST,
    port: PORT,
    method,
    path: urlPath,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, raw, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

beforeAll(async () => { await startServer(); }, BOOT_TIMEOUT);

afterAll(() => {
  if (serverProcess) { serverProcess.kill('SIGKILL'); serverProcess = null; }
  if (fixtureFile) { try { fs.unlinkSync(fixtureFile); } catch {} }
});

describe('CTO-003 A — /me: plus d\'énumération d\'identité par email', () => {
  test('sans JWT → 401', async () => {
    const res = await request('GET', '/me');
    expect(res.status).toBe(401);
  });

  test('?email=victim sans JWT → 401 et aucune donnée de la victime', async () => {
    const res = await request('GET', `/me?email=${encodeURIComponent(USER_B.email)}`);
    expect(res.status).toBe(401);
    expect(res.raw).not.toContain(USER_B.id);
    expect(res.raw).not.toContain(USER_B.email);
  });

  test('JWT de A + ?email=victim → données de A uniquement', async () => {
    const res = await request('GET', `/me?email=${encodeURIComponent(USER_B.email)}`, { token: TOKENS.A });
    expect(res.status).toBe(200);
    expect(res.json.user).toEqual({ id: USER_A.id, email: USER_A.email });
    expect(res.json.role).toBe('user');
    expect(res.raw).not.toContain(USER_B.id);
  });

  test('JWT valide → identité authentifiée', async () => {
    const res = await request('GET', '/me', { token: TOKENS.B });
    expect(res.status).toBe(200);
    expect(res.json.user.id).toBe(USER_B.id);
    expect(res.json.subscription).toBe('active');
  });

  test('JWT invalide → 401', async () => {
    const res = await request('GET', '/me', { token: 'tok-forged' });
    expect(res.status).toBe(401);
  });
});

describe('CTO-003 B — /me/subscription: IDOR fermé', () => {
  test('sans JWT → 401', async () => {
    const res = await request('GET', '/me/subscription');
    expect(res.status).toBe(401);
  });

  test('A avec ?user_id=B → abonnement de A (aucun accès à celui de B)', async () => {
    const res = await request('GET', `/me/subscription?user_id=${USER_B.id}`, { token: TOKENS.A });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, status: null });
  });

  test('A avec en-tête x-user-id: B → abonnement de A', async () => {
    const res = await request('GET', '/me/subscription', {
      token: TOKENS.A,
      headers: { 'x-user-id': USER_B.id },
    });
    expect(res.status).toBe(200);
    expect(res.json.status).toBeNull();
  });

  test('B authentifié → son propre abonnement actif', async () => {
    const res = await request('GET', '/me/subscription', { token: TOKENS.B });
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('active');
  });
});

describe('CTO-003 C — /usage/can-start: privilège non empruntable', () => {
  test('sans JWT → 401', async () => {
    const res = await request('POST', '/usage/can-start', { body: { user_id: ADMIN.id } });
    expect(res.status).toBe(401);
  });

  test('A (gratuit) avec body user_id d\'un admin → quota gratuit', async () => {
    const res = await request('POST', '/usage/can-start', { token: TOKENS.A, body: { user_id: ADMIN.id } });
    expect(res.status).toBe(200);
    expect(res.json.reason).not.toBe('role_unlimited');
    expect(res.json.limit).toBe(2);
  });

  test('A (gratuit) avec body user_id d\'un abonné → reste gratuit', async () => {
    const res = await request('POST', '/usage/can-start', { token: TOKENS.A, body: { user_id: USER_B.id } });
    expect(res.status).toBe(200);
    expect(res.json.reason).not.toBe('pro_active');
    expect(res.json.limit).toBe(2);
  });

  test('professeur authentifié → accès illimité (rôle réel)', async () => {
    const res = await request('POST', '/usage/can-start', { token: TOKENS.TEACHER, body: {} });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ allow: true, reason: 'role_unlimited' });
  });

  test('abonné authentifié → pro_active', async () => {
    const res = await request('POST', '/usage/can-start', { token: TOKENS.B, body: {} });
    expect(res.status).toBe(200);
    expect(res.json.reason).toBe('pro_active');
  });
});

describe('CTO-003 D — /students: liste nominative non publique', () => {
  test('invité → 401', async () => {
    const res = await request('GET', '/students');
    expect(res.status).toBe(401);
  });

  test('utilisateur standard authentifié → 403', async () => {
    const res = await request('GET', '/students', { token: TOKENS.A });
    expect(res.status).toBe(403);
  });

  test('professeur → autorisé', async () => {
    const res = await request('GET', '/students', { token: TOKENS.TEACHER });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json)).toBe(true);
  });
});

describe('CTO-003 E — routes mutantes réservées à l\'administration', () => {
  test('DELETE /delete-image invité → 401', async () => {
    const res = await request('DELETE', '/delete-image', { body: { path: 'images/x.png' } });
    expect(res.status).toBe(401);
  });

  test('DELETE /delete-image utilisateur standard → 403', async () => {
    const res = await request('DELETE', '/delete-image', { token: TOKENS.A, body: { path: 'images/x.png' } });
    expect(res.status).toBe(403);
  });

  test('POST /purge-elements invité → 401', async () => {
    const res = await request('POST', '/purge-elements', { body: {} });
    expect(res.status).toBe(401);
  });

  test('POST /purge-elements professeur (non admin) → 403', async () => {
    const res = await request('POST', '/purge-elements', { token: TOKENS.TEACHER, body: {} });
    expect(res.status).toBe(403);
  });
});

describe('CTO-003 — /api/logs: nom de fichier assaini', () => {
  test('source avec traversal → aucun fichier écrit hors de logs/', async () => {
    const escaped = path.join(__dirname, '..', 'cto003-escaped.txt');
    try { fs.unlinkSync(escaped); } catch {}
    const res = await request('POST', '/api/logs', {
      body: { logs: 'ligne', source: '../cto003-escaped' },
    });
    expect(res.status).toBe(200);
    expect(fs.existsSync(escaped)).toBe(false);
  });
});
