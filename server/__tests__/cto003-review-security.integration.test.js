// =============================================
// CTO-003 (revue CTO) — via le VRAI pipeline Express de server.js
//
// A/B  webhook RevenueCat: secret obligatoire, aucun faux 200, idempotence réelle;
// C    rôle "student" seul ≠ licence;
// D/E  autorisation croisée élèves / classes et périmètre de /students.
//
// Aucun appel réseau: Supabase est remplacé par un stub déterministe injecté
// au démarrage, et RevenueCat n'est jamais contacté (le serveur est appelé
// directement en HTTP local).
// =============================================

const { startServer, BOOT_TIMEOUT } = require('../testUtils/expressHarness');

const RC_SECRET = 'rc-test-shared-secret';

const ADMIN = { id: '44444444-4444-4444-8444-444444444444', email: 'admin@example.com' };
const TEACHER_A = { id: 'aaaaaaaa-1111-4111-8111-111111111111', email: 'prof.a@example.com' };
const TEACHER_B = { id: 'bbbbbbbb-2222-4222-8222-222222222222', email: 'prof.b@example.com' };
const CPC_C1 = { id: 'cccccccc-3333-4333-8333-333333333333', email: 'cpc.c1@example.com' };
const STD_USER = { id: 'dddddddd-4444-4444-8444-444444444444', email: 'standard@example.com' };
// Élève sans licence: rôle "student" déclaré, aucune fiche élève correspondante.
const STUDENT_UNLICENSED = { id: 'eeeeeeee-5555-4555-8555-555555555555', email: 'nolicence@eleve.crazychrono.app' };
// Élève licencié: fiche students licensed=true rattachée par user_student_mapping.
const STUDENT_LICENSED = { id: 'ffffffff-6666-4666-8666-666666666666', email: 'zoec2b7788@eleve.crazychrono.app' };
// Compte dont l'adresse reprend le code d'accès d'un élève licencié d'une AUTRE
// classe, sans aucun mapping: l'adresse ne doit rien prouver.
const STUDENT_SPOOF = { id: '99999999-7777-4777-8777-777777777777', email: 'nilsd3c9900@eleve.crazychrono.app' };
// Élève rattaché à une fiche non licenciée.
const STUDENT_MAPPED_UNLICENSED = { id: '88888888-8888-4888-8888-888888888888', email: 'lucm4d1122@eleve.crazychrono.app' };

const TOKENS = {
  ADMIN: 'tok-admin',
  TEACHER_A: 'tok-prof-a',
  TEACHER_B: 'tok-prof-b',
  CPC: 'tok-cpc',
  STD: 'tok-std',
  STUDENT_UNLICENSED: 'tok-student-nolic',
  STUDENT_LICENSED: 'tok-student-lic',
  STUDENT_SPOOF: 'tok-student-spoof',
  STUDENT_MAPPED_UNLICENSED: 'tok-student-mapped-nolic',
};

function baseFixture() {
  return {
    usersByToken: {
      [TOKENS.ADMIN]: ADMIN,
      [TOKENS.TEACHER_A]: TEACHER_A,
      [TOKENS.TEACHER_B]: TEACHER_B,
      [TOKENS.CPC]: CPC_C1,
      [TOKENS.STD]: STD_USER,
      [TOKENS.STUDENT_UNLICENSED]: STUDENT_UNLICENSED,
      [TOKENS.STUDENT_LICENSED]: STUDENT_LICENSED,
      [TOKENS.STUDENT_SPOOF]: STUDENT_SPOOF,
      [TOKENS.STUDENT_MAPPED_UNLICENSED]: STUDENT_MAPPED_UNLICENSED,
    },
    unique: { webhook_events: 'event_id' },
    tables: {
      user_profiles: [
        { id: ADMIN.id, email: ADMIN.email, role: 'admin' },
        { id: TEACHER_A.id, email: TEACHER_A.email, role: 'teacher' },
        { id: TEACHER_B.id, email: TEACHER_B.email, role: 'teacher' },
        { id: CPC_C1.id, email: CPC_C1.email, role: 'cpc', circonscription_id: 'circo-1' },
        { id: STD_USER.id, email: STD_USER.email, role: 'user' },
        { id: STUDENT_UNLICENSED.id, email: STUDENT_UNLICENSED.email, role: 'student' },
        { id: STUDENT_LICENSED.id, email: STUDENT_LICENSED.email, role: 'student' },
        { id: STUDENT_SPOOF.id, email: STUDENT_SPOOF.email, role: 'student' },
        { id: STUDENT_MAPPED_UNLICENSED.id, email: STUDENT_MAPPED_UNLICENSED.email, role: 'student' },
      ],
      schools: [
        { id: 'sch-1', circonscription_id: 'circo-1' },
        { id: 'sch-2', circonscription_id: 'circo-2' },
      ],
      classes: [
        { id: 'cls-a', school_id: 'sch-1', teacher_email: TEACHER_A.email, name: 'CE1-A' },
        { id: 'cls-b', school_id: 'sch-2', teacher_email: TEACHER_B.email, name: 'CE2-B' },
      ],
      students: [
        { id: 'stu-a1', class_id: 'cls-a', school_id: 'sch-1', circonscription_id: 'circo-1', first_name: 'Zoé', last_name: 'C', full_name: 'Zoé C.', licensed: true, access_code: 'ZOE-C2B-7788' },
        { id: 'stu-b1', class_id: 'cls-b', school_id: 'sch-2', circonscription_id: 'circo-2', first_name: 'Nils', last_name: 'D', full_name: 'Nils D.', licensed: true, access_code: 'NILS-D3C-9900' },
        { id: 'stu-c1', class_id: 'cls-b', school_id: 'sch-2', circonscription_id: 'circo-2', first_name: 'Luc', last_name: 'M', full_name: 'Luc M.', licensed: false, access_code: 'LUC-M4D-1122' },
      ],
      user_student_mapping: [
        { user_id: STUDENT_LICENSED.id, student_id: 'stu-a1', active: true },
        { user_id: STUDENT_MAPPED_UNLICENSED.id, student_id: 'stu-c1', active: true },
      ],
      tournament_groups: [],
      subscriptions: [],
      sessions: [],
      webhook_events: [],
    },
  };
}

function rcEvent(id, appUserId) {
  return { event: { id, type: 'initial_purchase', app_user_id: appUserId, environment: 'SANDBOX', entitlement_id: 'pro' } };
}

let main = null;      // secret RevenueCat configuré
let noSecret = null;  // REVENUECAT_WEBHOOK_SECRET absent
let failWrite = null; // écriture subscriptions en échec

beforeAll(async () => {
  [main, noSecret, failWrite] = await Promise.all([
    startServer({ port: 4587, fixture: baseFixture(), env: { REVENUECAT_WEBHOOK_SECRET: RC_SECRET } }),
    startServer({ port: 4588, fixture: baseFixture(), env: { REVENUECAT_WEBHOOK_SECRET: '' } }),
    startServer({ port: 4589, fixture: baseFixture(), env: { REVENUECAT_WEBHOOK_SECRET: RC_SECRET } }),
  ]);
}, BOOT_TIMEOUT);

afterAll(() => {
  [main, noSecret, failWrite].forEach((s) => s && s.stop());
});

describe('CTO-003 A — webhook RevenueCat fail-closed', () => {
  test('secret non configuré → refus, aucun abonnement créé', async () => {
    const victim = STD_USER.id;
    const res = await noSecret.request('POST', '/webhooks/revenuecat', { body: rcEvent('evt-nosecret', victim) });
    expect(res.status).toBe(503);
    expect(res.json).toMatchObject({ ok: false, error: 'webhook_secret_not_configured' });

    // L'utilisateur visé n'a acquis aucun droit.
    const sub = await noSecret.request('GET', '/me/subscription', { token: TOKENS.STD });
    expect(sub.json.status).toBeNull();
  });

  test('Authorization absente → 401', async () => {
    const res = await main.request('POST', '/webhooks/revenuecat', { body: rcEvent('evt-noauth', STD_USER.id) });
    expect(res.status).toBe(401);
  });

  test('mauvais secret → 401', async () => {
    const res = await main.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer mauvais-secret' },
      body: rcEvent('evt-badauth', STD_USER.id),
    });
    expect(res.status).toBe(401);
  });

  test('secret valide → accepté et abonnement persisté', async () => {
    const res = await main.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: `Bearer ${RC_SECRET}` },
      body: rcEvent('evt-ok', STD_USER.id),
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true });

    const sub = await main.request('GET', '/me/subscription', { token: TOKENS.STD });
    expect(sub.json.status).toBe('active');
  });

  test('aucun secret ne fuite dans la réponse', async () => {
    const res = await main.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer mauvais-secret' },
      body: rcEvent('evt-leak', STD_USER.id),
    });
    expect(res.raw).not.toContain(RC_SECRET);
  });
});

describe('CTO-003 B — fiabilité du traitement RevenueCat', () => {
  afterEach(() => failWrite.setFaults({}));

  test('écriture abonnement en échec → 500 retryable, pas de faux succès', async () => {
    failWrite.setFaults({ failWrites: { subscriptions: 'connection reset' } });
    const res = await failWrite.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: `Bearer ${RC_SECRET}` },
      body: rcEvent('evt-dbfail', STD_USER.id),
    });
    expect(res.status).toBe(500);
    expect(res.json).toMatchObject({ ok: false, error: 'subscription_write_failed', retryable: true });

    const sub = await failWrite.request('GET', '/me/subscription', { token: TOKENS.STD });
    expect(sub.json.status).toBeNull();
  });

  test('échec métier + échec de nettoyage → le rejeu retraite et persiste', async () => {
    // Scénario exact de la revue: l'effet métier échoue ET la libération de la
    // réservation d'idempotence échoue silencieusement (l'insert, lui, réussit).
    failWrite.setFaults({
      failWrites: { subscriptions: 'connection reset', webhook_events: { delete: 'connection reset' } },
    });
    const first = await failWrite.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: `Bearer ${RC_SECRET}` },
      body: rcEvent('evt-cleanupfail', TEACHER_A.id),
    });
    expect(first.status).toBe(500);
    expect(first.json.duplicate).toBeUndefined();

    // Base rétablie: RevenueCat rejoue le même événement.
    failWrite.setFaults({});
    const second = await failWrite.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: `Bearer ${RC_SECRET}` },
      body: rcEvent('evt-cleanupfail', TEACHER_A.id),
    });
    expect(second.status).toBe(200);
    expect(second.json.duplicate).toBeUndefined();

    // L'abonnement est finalement persisté, et un 3e rejeu ne retraite plus.
    const sub = await failWrite.request('GET', '/me/subscription', { token: TOKENS.TEACHER_A });
    expect(sub.json.status).toBe('active');
    const third = await failWrite.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: `Bearer ${RC_SECRET}` },
      body: rcEvent('evt-cleanupfail', TEACHER_A.id),
    });
    expect(third.json).toMatchObject({ ok: true, duplicate: true });
  });

  test('event.id absent → 400, aucun abonnement', async () => {
    const res = await failWrite.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: `Bearer ${RC_SECRET}` },
      body: { event: { type: 'initial_purchase', app_user_id: CPC_C1.id, entitlement_id: 'pro' } },
    });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ ok: false, error: 'missing_event_id' });
    const sub = await failWrite.request('GET', '/me/subscription', { token: TOKENS.CPC });
    expect(sub.json.status).toBeNull();
  });

  test('erreur de lecture du magasin d\'idempotence → fail closed retryable', async () => {
    failWrite.setFaults({ failReads: { webhook_events: 'read timeout' } });
    const res = await failWrite.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: `Bearer ${RC_SECRET}` },
      body: rcEvent('evt-idemread', STD_USER.id),
    });
    expect(res.status).toBe(500);
    expect(res.json).toMatchObject({ ok: false, error: 'idempotency_store_error', retryable: true });
  });

  test('même event.id deux fois → traité une seule fois', async () => {
    const body = rcEvent('evt-idem', TEACHER_B.id);
    const first = await main.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: `Bearer ${RC_SECRET}` }, body,
    });
    const second = await main.request('POST', '/webhooks/revenuecat', {
      headers: { Authorization: `Bearer ${RC_SECRET}` }, body,
    });
    expect(first.status).toBe(200);
    expect(first.json.duplicate).toBeUndefined();
    expect(second.status).toBe(200);
    expect(second.json).toMatchObject({ ok: true, duplicate: true });
  });
});

describe('CTO-003 C — le rôle "student" seul ne vaut pas licence', () => {
  test('student sans fiche élève → quota gratuit', async () => {
    const res = await main.request('POST', '/usage/can-start', { token: TOKENS.STUDENT_UNLICENSED, body: {} });
    expect(res.status).toBe(200);
    expect(res.json.reason).not.toBe('role_unlimited');
    expect(res.json.limit).toBe(2);
  });

  test('student réellement licencié → illimité', async () => {
    const res = await main.request('POST', '/usage/can-start', { token: TOKENS.STUDENT_LICENSED, body: {} });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ allow: true, limit: null, reason: 'student_licensed' });
  });

  test('professeur → illimité (rôle encadrant conservé)', async () => {
    const res = await main.request('POST', '/usage/can-start', { token: TOKENS.TEACHER_A, body: {} });
    expect(res.json).toMatchObject({ allow: true, reason: 'role_unlimited' });
  });
});

describe('CTO-003 B(bis) — l\'identité élève repose sur user_student_mapping', () => {
  afterEach(() => main.setFaults({}));

  test('adresse reprenant le code d\'accès d\'un élève, sans mapping → aucune licence', async () => {
    const usage = await main.request('POST', '/usage/can-start', { token: TOKENS.STUDENT_SPOOF, body: {} });
    expect(usage.json.limit).toBe(2);
    expect(usage.json.reason).not.toBe('student_licensed');

    // …et aucune fiche élève d'autrui n'est révélée.
    const me = await main.request('GET', '/me', { token: TOKENS.STUDENT_SPOOF });
    expect(me.json.student).toBeNull();
    expect(me.json.subscription).toBeNull();
    expect(me.raw).not.toContain('Nils');
  });

  test('mapping actif vers une fiche licensed=false → non Pro', async () => {
    const usage = await main.request('POST', '/usage/can-start', { token: TOKENS.STUDENT_MAPPED_UNLICENSED, body: {} });
    expect(usage.json.limit).toBe(2);

    const me = await main.request('GET', '/me', { token: TOKENS.STUDENT_MAPPED_UNLICENSED });
    expect(me.json.student).toMatchObject({ id: 'stu-c1', licensed: false });
    expect(me.json.subscription).toBeNull();
  });

  test('/me applique la même règle que /usage/can-start pour un élève licencié', async () => {
    const me = await main.request('GET', '/me', { token: TOKENS.STUDENT_LICENSED });
    expect(me.json.student).toMatchObject({ id: 'stu-a1', fullName: 'Zoé C.', licensed: true });
    expect(me.json.subscription).toBe('active');
  });

  test('panne de lecture user_student_mapping → fail closed', async () => {
    main.setFaults({ failReads: { user_student_mapping: 'read timeout' } });
    const usage = await main.request('POST', '/usage/can-start', { token: TOKENS.STUDENT_LICENSED, body: {} });
    expect(usage.json.limit).toBe(2);
    expect(usage.json.reason).not.toBe('student_licensed');

    const me = await main.request('GET', '/me', { token: TOKENS.STUDENT_LICENSED });
    expect(me.json.student).toBeNull();
    expect(me.json.subscription).toBeNull();
  });
});

describe('CTO-003 D — autorisation croisée élèves / classes', () => {
  test('professeur A ne lit pas la classe de B', async () => {
    const res = await main.request('GET', '/api/tournament/classes/cls-b/students', { token: TOKENS.TEACHER_A });
    expect(res.status).toBe(403);
    expect(res.raw).not.toContain('Nils');
    expect(res.raw).not.toContain('NILS-D3C-9900');
  });

  test('professeur A lit sa propre classe', async () => {
    const res = await main.request('GET', '/api/tournament/classes/cls-a/students', { token: TOKENS.TEACHER_A });
    expect(res.status).toBe(200);
    expect(res.json.students.map((s) => s.id)).toEqual(['stu-a1']);
  });

  test('professeur A ne lit pas un élève de B', async () => {
    const res = await main.request('GET', '/api/tournament/students/stu-b1/info', { token: TOKENS.TEACHER_A });
    expect(res.status).toBe(403);
    expect(res.raw).not.toContain('Nils');
  });

  test('élève A ne lit pas les performances de l\'élève B', async () => {
    const res = await main.request('GET', '/api/tournament/students/stu-b1/performance', { token: TOKENS.STUDENT_LICENSED });
    expect(res.status).toBe(403);
  });

  test('élève A lit ses propres informations', async () => {
    const res = await main.request('GET', '/api/tournament/students/stu-a1/info', { token: TOKENS.STUDENT_LICENSED });
    expect(res.status).toBe(200);
  });

  test('utilisateur standard: aucune donnée scolaire d\'un tiers', async () => {
    const info = await main.request('GET', '/api/tournament/students/stu-a1/info', { token: TOKENS.STD });
    const cls = await main.request('GET', '/api/tournament/classes/cls-a/groups', { token: TOKENS.STD });
    expect(info.status).toBe(403);
    expect(cls.status).toBe(403);
  });

  test('invité (sans JWT) → 401', async () => {
    const res = await main.request('GET', '/api/tournament/classes/cls-a/students');
    expect(res.status).toBe(401);
  });

  test('CPC: sa circonscription oui, une autre non', async () => {
    const own = await main.request('GET', '/api/tournament/classes/cls-a/students', { token: TOKENS.CPC });
    const other = await main.request('GET', '/api/tournament/classes/cls-b/students', { token: TOKENS.CPC });
    expect(own.status).toBe(200);
    expect(other.status).toBe(403);
  });

  test('admin: accès global', async () => {
    const res = await main.request('GET', '/api/tournament/classes/cls-b/students', { token: TOKENS.ADMIN });
    expect(res.status).toBe(200);
  });
});

describe('CTO-003 E — /students respecte le périmètre serveur', () => {
  test('professeur A: ses élèves seulement, sans code d\'accès', async () => {
    const res = await main.request('GET', '/students', { token: TOKENS.TEACHER_A });
    expect(res.status).toBe(200);
    expect(res.json).toEqual([{ id: 'stu-a1', name: 'Zoé C.', licensed: true }]);
    expect(res.raw).not.toContain('ZOE-C2B-7788');
    expect(res.raw).not.toContain('Nils');
  });

  test('CPC: sa circonscription seulement', async () => {
    const res = await main.request('GET', '/students', { token: TOKENS.CPC });
    expect(res.status).toBe(200);
    expect(res.json.map((s) => s.id)).toEqual(['stu-a1']);
  });

  test('utilisateur standard → 403', async () => {
    const res = await main.request('GET', '/students', { token: TOKENS.STD });
    expect(res.status).toBe(403);
  });

  test('élève → 403 (pas de liste nominative)', async () => {
    const res = await main.request('GET', '/students', { token: TOKENS.STUDENT_LICENSED });
    expect(res.status).toBe(403);
  });

  test('admin → liste globale', async () => {
    const res = await main.request('GET', '/students', { token: TOKENS.ADMIN });
    expect(res.status).toBe(200);
    expect(res.json.map((s) => s.id).sort()).toEqual(['stu-a1', 'stu-b1', 'stu-c1']);
  });
});
