// =============================================
// CTO-005A — Invitations et rôles : plus aucune écriture/lecture client
//
// Démarre le VRAI server.js avec le stub Supabase préchargé (aucun réseau,
// aucune Supabase de production). Prouve que :
//   - la validation d'invitation passe par le serveur, ne renvoie ni token ni
//     liste, et échoue fermée en cas de panne de lecture ;
//   - la liste des invitations exige un administrateur ;
//   - `user_profiles.role` ne se modifie que par un endpoint admin serveur.
// =============================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 4587;
const HOST = '127.0.0.1';
const BOOT_TIMEOUT = 30_000;

const USER_A = { id: '11111111-1111-4111-8111-11111111aaaa', email: 'user-a@example.com' };
const ADMIN = { id: '44444444-4444-4444-8444-44444444aaaa', email: 'admin@example.com' };
const TOKENS = { A: 'tok-a', ADMIN: 'tok-admin' };

const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';

const FIXTURE = {
  usersByToken: { [TOKENS.A]: USER_A, [TOKENS.ADMIN]: ADMIN },
  tables: {
    user_profiles: [
      { id: USER_A.id, email: USER_A.email, role: 'user', region: null, circonscription_id: null },
      { id: ADMIN.id, email: ADMIN.email, role: 'admin', region: null, circonscription_id: null },
    ],
    invitations: [
      { token: 'inv-valid', email: 'invited@example.com', role: 'teacher', region: 'GP', circonscription_id: null, used: false, expires_at: FUTURE, created_at: FUTURE },
      { token: 'inv-expired', email: 'old@example.com', role: 'admin', region: null, circonscription_id: null, used: false, expires_at: PAST, created_at: PAST },
      { token: 'inv-used', email: 'done@example.com', role: 'admin', region: null, circonscription_id: null, used: true, expires_at: FUTURE, created_at: FUTURE },
    ],
  },
};

let serverProcess = null;
let fixtureFile = null;
let controlFile = null;

function setFaults(faults) {
  fs.writeFileSync(controlFile, JSON.stringify(faults), 'utf8');
}

function startServer() {
  fixtureFile = path.join(os.tmpdir(), `cto005-fixture-${Date.now()}.json`);
  controlFile = path.join(os.tmpdir(), `cto005-control-${Date.now()}.json`);
  fs.writeFileSync(fixtureFile, JSON.stringify(FIXTURE), 'utf8');
  fs.writeFileSync(controlFile, '{}', 'utf8');
  const preload = path.join(__dirname, '..', 'testUtils', 'supabaseStubPreload.js');
  return new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        NODE_OPTIONS: `--require ${preload}`,
        CC_TEST_SUPABASE_FIXTURE: fixtureFile,
        CC_TEST_SUPABASE_CONTROL: controlFile,
        SUPABASE_URL: 'http://supabase.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-role-key',
        SUPABASE_ANON_KEY: 'stub-anon-key',
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        REVENUECAT_WEBHOOK_SECRET: '',
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

function request(method, urlPath, { token, body } = {}) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const opts = {
    host: HOST,
    port: PORT,
    method,
    path: urlPath,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

afterEach(() => setFaults({}));

afterAll(() => {
  if (serverProcess) { serverProcess.kill('SIGKILL'); serverProcess = null; }
  for (const f of [fixtureFile, controlFile]) { try { fs.unlinkSync(f); } catch {} }
});

describe('CTO-005A A — POST /api/invitations/validate', () => {
  test('sans token → 400', async () => {
    const res = await request('POST', '/api/invitations/validate', { body: {} });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('token_required');
  });

  test('token valide → rôle et email, jamais le token ni la liste', async () => {
    const res = await request('POST', '/api/invitations/validate', { body: { token: 'inv-valid' } });
    expect(res.status).toBe(200);
    expect(res.json.invitation).toEqual({
      email: 'invited@example.com', role: 'teacher', region: 'GP', circonscription_id: null,
    });
    expect(res.raw).not.toContain('inv-valid');
    expect(res.raw).not.toContain('old@example.com');
  });

  test('invitation expirée → 404 sans détail', async () => {
    const res = await request('POST', '/api/invitations/validate', { body: { token: 'inv-expired' } });
    expect(res.status).toBe(404);
    expect(res.raw).not.toContain('old@example.com');
  });

  test('invitation déjà utilisée → 404', async () => {
    const res = await request('POST', '/api/invitations/validate', { body: { token: 'inv-used' } });
    expect(res.status).toBe(404);
  });

  test('token inconnu → 404', async () => {
    const res = await request('POST', '/api/invitations/validate', { body: { token: 'inv-forged' } });
    expect(res.status).toBe(404);
  });

  test('panne de lecture → fail closed (503), aucune invitation validée', async () => {
    setFaults({ failReads: { invitations: 'db down' } });
    const res = await request('POST', '/api/invitations/validate', { body: { token: 'inv-valid' } });
    expect(res.status).toBe(503);
    expect(res.json.error).toBe('verification_error');
  });
});

describe('CTO-005A B — GET /api/admin/invitations', () => {
  test('sans JWT → 401', async () => {
    const res = await request('GET', '/api/admin/invitations');
    expect(res.status).toBe(401);
  });

  test('utilisateur non admin → 403 et aucune invitation', async () => {
    const res = await request('GET', '/api/admin/invitations', { token: TOKENS.A });
    expect(res.status).toBe(403);
    expect(res.raw).not.toContain('invited@example.com');
  });

  test('admin → liste sans les tokens', async () => {
    const res = await request('GET', '/api/admin/invitations', { token: TOKENS.ADMIN });
    expect(res.status).toBe(200);
    expect(res.json.invitations.length).toBe(3);
    expect(res.raw).not.toContain('inv-valid');
  });
});

describe('CTO-005A C — POST /api/admin/set-role', () => {
  test('sans JWT → 401 et rôle inchangé', async () => {
    const res = await request('POST', '/api/admin/set-role', { body: { email: USER_A.email, role: 'admin' } });
    expect(res.status).toBe(401);
    const check = await request('GET', '/me', { token: TOKENS.A });
    expect(check.json.role).toBe('user');
  });

  test('utilisateur standard ne peut pas se promouvoir → 403', async () => {
    const res = await request('POST', '/api/admin/set-role', {
      token: TOKENS.A, body: { email: USER_A.email, role: 'admin' },
    });
    expect(res.status).toBe(403);
    const check = await request('GET', '/me', { token: TOKENS.A });
    expect(check.json.role).toBe('user');
  });

  test('admin + rôle inconnu → 400', async () => {
    const res = await request('POST', '/api/admin/set-role', {
      token: TOKENS.ADMIN, body: { email: USER_A.email, role: 'superuser' },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('invalid_role');
  });

  test('admin + email inconnu → 404', async () => {
    const res = await request('POST', '/api/admin/set-role', {
      token: TOKENS.ADMIN, body: { email: 'ghost@example.com', role: 'teacher' },
    });
    expect(res.status).toBe(404);
  });

  test('admin → rôle réellement appliqué', async () => {
    const res = await request('POST', '/api/admin/set-role', {
      token: TOKENS.ADMIN, body: { email: USER_A.email, role: 'teacher' },
    });
    expect(res.status).toBe(200);
    const check = await request('GET', '/me', { token: TOKENS.A });
    expect(check.json.role).toBe('teacher');
  });
});
