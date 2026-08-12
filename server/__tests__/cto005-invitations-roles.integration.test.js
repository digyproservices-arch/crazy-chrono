// =============================================
// CTO-005A — Invitations et rôles : plus aucune écriture/lecture client
//
// Démarre le VRAI server.js avec le stub Supabase préchargé (aucun réseau,
// aucune Supabase de production). Prouve que :
//   - la validation d'invitation passe par le serveur, ne renvoie ni token ni
//     liste, et échoue fermée en cas de panne de lecture ;
//   - la liste des invitations exige un administrateur ;
//   - `user_profiles.role` ne se modifie que par un endpoint admin serveur.
//
// Revue CTO (§A/§B/§E) : le token d'invitation ne vaut rien sans le bon
// destinataire, sa consommation est atomique (une seule réussite concurrente,
// aucun faux succès si la base refuse), et l'administration des rôles s'appuie
// sur `auth.users.id` et non sur `user_profiles.email`.
// =============================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 4591;
const HOST = '127.0.0.1';
const BOOT_TIMEOUT = 30_000;

const USER_A = { id: '11111111-1111-4111-8111-11111111aaaa', email: 'user-a@example.com' };
const ADMIN = { id: '44444444-4444-4444-8444-44444444aaaa', email: 'admin@example.com' };
// Destinataire légitime de l'invitation `inv-valid`.
const INVITED = { id: '22222222-2222-4222-8222-22222222aaaa', email: 'Invited@Example.com' };
// Profil sans email (colonne non accordée aux clients par la migration 0200).
const NO_EMAIL = { id: '33333333-3333-4333-8333-33333333aaaa', email: 'no-email@example.com' };
// Compte présent dans Supabase Auth mais sans ligne `user_profiles`.
const AUTH_ONLY = { id: '55555555-5555-4555-8555-55555555aaaa', email: 'auth-only@example.com' };
const TOKENS = { A: 'tok-a', ADMIN: 'tok-admin', INVITED: 'tok-invited', NO_EMAIL: 'tok-no-email' };

const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';

const FIXTURE = {
  usersByToken: {
    [TOKENS.A]: USER_A,
    [TOKENS.ADMIN]: ADMIN,
    [TOKENS.INVITED]: INVITED,
    [TOKENS.NO_EMAIL]: NO_EMAIL,
  },
  authOnlyUsers: [AUTH_ONLY],
  tables: {
    user_profiles: [
      { id: USER_A.id, email: USER_A.email, role: 'user', region: null, circonscription_id: null },
      { id: ADMIN.id, email: ADMIN.email, role: 'admin', region: null, circonscription_id: null },
      { id: INVITED.id, email: null, role: 'user', region: null, circonscription_id: null },
      { id: NO_EMAIL.id, email: null, role: 'user', region: null, circonscription_id: null },
    ],
    invitations: [
      { token: 'inv-valid', email: 'invited@example.com', role: 'teacher', region: 'GP', circonscription_id: null, used: false, expires_at: FUTURE, created_at: FUTURE },
      { token: 'inv-expired', email: 'old@example.com', role: 'admin', region: null, circonscription_id: null, used: false, expires_at: PAST, created_at: PAST },
      { token: 'inv-used', email: 'done@example.com', role: 'admin', region: null, circonscription_id: null, used: true, expires_at: FUTURE, created_at: FUTURE },
      { token: 'inv-race', email: NO_EMAIL.email, role: 'rectorat', region: 'GP', circonscription_id: null, used: false, expires_at: FUTURE, created_at: FUTURE },
      { token: 'inv-retry', email: USER_A.email, role: 'cpd', region: 'GP', circonscription_id: null, used: false, expires_at: FUTURE, created_at: FUTURE },
      { token: 'inv-admin', email: 'victim@example.com', role: 'admin', region: null, circonscription_id: null, used: false, expires_at: FUTURE, created_at: FUTURE },
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
    expect(res.json.invitations.length).toBe(FIXTURE.tables.invitations.length);
    for (const inv of FIXTURE.tables.invitations) {
      expect(res.raw).not.toContain(inv.token);
    }
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

  // Revue CTO §E : l'email ne sert qu'à retrouver le compte dans Supabase Auth.
  test('profil dont user_profiles.email est NULL → rôle appliqué quand même', async () => {
    const res = await request('POST', '/api/admin/set-role', {
      token: TOKENS.ADMIN, body: { email: NO_EMAIL.email, role: 'editor' },
    });
    expect(res.status).toBe(200);
    const check = await request('GET', '/me', { token: TOKENS.NO_EMAIL });
    expect(check.json.role).toBe('editor');
  });

  test('compte Auth sans ligne user_profiles → profil créé avec le rôle', async () => {
    const res = await request('POST', '/api/admin/set-role', {
      token: TOKENS.ADMIN, body: { email: AUTH_ONLY.email, role: 'teacher' },
    });
    expect(res.status).toBe(200);
    expect(res.json.role).toBe('teacher');
  });

  test('panne du listing Auth → 503, jamais un 404 trompeur', async () => {
    setFaults({ failReads: { 'auth.users': 'auth down' } });
    const res = await request('POST', '/api/admin/set-role', {
      token: TOKENS.ADMIN, body: { email: ADMIN.email, role: 'user' },
    });
    expect(res.status).toBe(503);
    expect(res.json.error).toBe('lookup_failed');
  });
});

describe('CTO-005A D — POST /api/admin/send-invite : whitelist de rôles', () => {
  test('rôle arbitraire → 400, aucune invitation créée', async () => {
    const before = await request('GET', '/api/admin/invitations', { token: TOKENS.ADMIN });
    const res = await request('POST', '/api/admin/send-invite', {
      token: TOKENS.ADMIN, body: { email: 'target@example.com', role: 'superadmin' },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('invalid_role');
    const after = await request('GET', '/api/admin/invitations', { token: TOKENS.ADMIN });
    expect(after.json.invitations.length).toBe(before.json.invitations.length);
  });

  test('email invalide → 400', async () => {
    const res = await request('POST', '/api/admin/send-invite', {
      token: TOKENS.ADMIN, body: { email: 'pas-un-email', role: 'teacher' },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('invalid_email');
  });

  test('non-admin → 403', async () => {
    const res = await request('POST', '/api/admin/send-invite', {
      token: TOKENS.A, body: { email: 'target@example.com', role: 'teacher' },
    });
    expect(res.status).toBe(403);
  });

  test('rôle whitelisté → invitation créée, réponse sans token', async () => {
    const res = await request('POST', '/api/admin/send-invite', {
      token: TOKENS.ADMIN, body: { email: 'New.Teacher@Example.com', role: 'teacher' },
    });
    expect(res.status).toBe(200);
    expect(res.json.invitation.email).toBe('new.teacher@example.com');
    expect(res.json.invitation.token).toBeUndefined();
  });
});

describe('CTO-005A E — POST /api/auth/apply-invite : destinataire et atomicité', () => {
  test('sans JWT → 401', async () => {
    const res = await request('POST', '/api/auth/apply-invite', { body: { inviteToken: 'inv-valid' } });
    expect(res.status).toBe(401);
  });

  // Revue CTO §A : le token seul n'est jamais une preuve suffisante.
  test('token volé par un autre compte → 403 invite_email_mismatch, rien de modifié', async () => {
    const res = await request('POST', '/api/auth/apply-invite', {
      token: TOKENS.A, body: { inviteToken: 'inv-valid' },
    });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe('invite_email_mismatch');

    // Aucun rôle appliqué à l'attaquant (il est `teacher` depuis le test §C,
    // et surtout pas passé par cette invitation)…
    const me = await request('GET', '/me', { token: TOKENS.A });
    expect(me.json.role).not.toBe('rectorat');
    // …et l'invitation n'est pas consommée : le destinataire légitime peut l'utiliser.
    const legit = await request('POST', '/api/auth/apply-invite', {
      token: TOKENS.INVITED, body: { inviteToken: 'inv-valid' },
    });
    expect(legit.status).toBe(200);
    expect(legit.json).toMatchObject({ ok: true, role: 'teacher', region: 'GP' });
    const invitedMe = await request('GET', '/me', { token: TOKENS.INVITED });
    expect(invitedMe.json.role).toBe('teacher');
  });

  // Revue CTO §J-2 : une invitation privilégiée volée ne confère aucun droit.
  test('invitation admin volée → 403, aucun privilège, invitation intacte', async () => {
    const stolen = await request('POST', '/api/auth/apply-invite', {
      token: TOKENS.A, body: { inviteToken: 'inv-admin' },
    });
    expect(stolen.status).toBe(403);
    expect(stolen.json.error).toBe('invite_email_mismatch');

    const me = await request('GET', '/me', { token: TOKENS.A });
    expect(me.json.role).not.toBe('admin');
    // Le voleur n'obtient pas non plus les droits d'administration.
    const admin = await request('GET', '/api/admin/invitations', { token: TOKENS.A });
    expect(admin.status).toBe(403);
    // L'invitation reste utilisable par son destinataire légitime.
    const still = await request('POST', '/api/invitations/validate', {
      body: { token: 'inv-admin' },
    });
    expect(still.status).toBe(200);
    expect(still.json.invitation.role).toBe('admin');
  });

  test('invitation déjà consommée → 409, rôle non réappliqué', async () => {
    const res = await request('POST', '/api/auth/apply-invite', {
      token: TOKENS.INVITED, body: { inviteToken: 'inv-valid' },
    });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe('invitation_already_used');
  });

  test('invitation expirée → 410', async () => {
    const res = await request('POST', '/api/auth/apply-invite', {
      token: TOKENS.INVITED, body: { inviteToken: 'inv-expired' },
    });
    expect(res.status).toBe(410);
  });

  test('token inconnu → 404 et aucun rôle', async () => {
    const res = await request('POST', '/api/auth/apply-invite', {
      token: TOKENS.INVITED, body: { inviteToken: 'inv-forged' },
    });
    expect(res.status).toBe(404);
  });

  // Revue CTO §B : deux utilisations concurrentes du même token.
  test('deux requêtes concurrentes sur le même token → une seule réussite', async () => {
    const [r1, r2] = await Promise.all([
      request('POST', '/api/auth/apply-invite', { token: TOKENS.NO_EMAIL, body: { inviteToken: 'inv-race' } }),
      request('POST', '/api/auth/apply-invite', { token: TOKENS.NO_EMAIL, body: { inviteToken: 'inv-race' } }),
    ]);
    const codes = [r1.status, r2.status].sort();
    expect(codes).toEqual([200, 409]);
    const me = await request('GET', '/me', { token: TOKENS.NO_EMAIL });
    expect(me.json.role).toBe('rectorat');
  });

  // Revue CTO §B : échec de la consommation → aucun faux succès, token rejouable.
  test('panne de la consommation → 503, aucun rôle appliqué, retry possible', async () => {
    setFaults({ failWrites: { 'rpc:consume_invitation': 'transaction aborted' } });
    const failed = await request('POST', '/api/auth/apply-invite', {
      token: TOKENS.A, body: { inviteToken: 'inv-retry' },
    });
    expect(failed.status).toBe(503);
    expect(failed.json.error).toBe('invitation_consume_failed');
    const during = await request('GET', '/me', { token: TOKENS.A });
    expect(during.json.role).not.toBe('cpd');

    setFaults({});
    const retried = await request('POST', '/api/auth/apply-invite', {
      token: TOKENS.A, body: { inviteToken: 'inv-retry' },
    });
    expect(retried.status).toBe(200);
    expect(retried.json.role).toBe('cpd');
    const after = await request('GET', '/me', { token: TOKENS.A });
    expect(after.json.role).toBe('cpd');
  });
});

// Revue CTO finale §C : les contraintes CHECK de la base et la whitelist serveur
// ne doivent jamais diverger — sinon un rôle accepté par Express est refusé par
// PostgreSQL (cas cpd/cpc en production).
describe('CTO-005A — contraintes de rôle alignées sur la whitelist serveur', () => {
  const { ASSIGNABLE_ROLES, PERSISTED_ROLES } = require('../access/roles');
  const migration = fs.readFileSync(
    path.join(__dirname, '..', '..', 'supabase', 'migrations',
      '20260810120000_cto005_role_constraints.sql'),
    'utf8'
  );

  const rolesOf = (constraintName) => {
    const block = migration.split(`ADD CONSTRAINT ${constraintName}`)[1];
    expect(block).toBeDefined();
    return block.slice(0, block.indexOf(';')).match(/'([a-z]+)'/g).map((r) => r.slice(1, -1)).sort();
  };

  test('invitations_role_check = rôles attribuables, exactement', () => {
    expect(rolesOf('invitations_role_check')).toEqual([...ASSIGNABLE_ROLES].sort());
  });

  test('user_profiles_role_check = rôles attribuables + student, exactement', () => {
    expect(rolesOf('user_profiles_role_check')).toEqual([...PERSISTED_ROLES].sort());
  });

  test('consume_invitation code exactement la même whitelist attribuable', () => {
    const rpc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'supabase', 'migrations',
        '20260810110000_cto005_consume_invitation.sql'),
      'utf8'
    );
    const block = rpc.split('v_inv.role NOT IN (')[1];
    const roles = block.slice(0, block.indexOf(')')).match(/'([a-z]+)'/g)
      .map((r) => r.slice(1, -1)).sort();
    expect(roles).toEqual([...ASSIGNABLE_ROLES].sort());
  });
});
