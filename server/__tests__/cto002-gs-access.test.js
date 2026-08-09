// =============================================
// CTO-002 (revue) — D. Grande Salle: aucune identité client ne fait autorité.
// Seules deux preuves ouvrent une salle payante: identité JWT vérifiée +
// habilitation serveur, ou billet signé émis après paiement Stripe vérifié.
// =============================================

const {
  resolveGrandeSalleAccess,
  issueTicket,
  verifyTicket,
} = require('../access/gsAccess');

const SECRET = 'secret_de_test_non_production';
const ENV = { GS_TICKET_SECRET: SECRET };
const TOURNOI = 't-42';

const anonSocket = () => ({ authUser: null });
const authSocket = (id, email) => ({ authUser: { id, email } });

const proEntitlement = async () => ({ isPro: true, source: 'subscription' });
const freeEntitlement = async () => ({ isPro: false, reason: 'no_subscription' });
const brokenEntitlement = async () => { throw new Error('supabase down'); };

const paidFor = (emails) => async (_t, email) => emails.includes(email);
const paymentUnknown = async () => null;

describe('CTO-002 (revue) — Grande Salle: identités forgées', () => {
  test('D1. gsUserId forgé dans le payload → aucun accès abonné', async () => {
    // Le payload client ne peut rien injecter: resolveGrandeSalleAccess ne lit
    // que socket.authUser. Un socket anonyme qui prétend être un abonné échoue.
    const r = await resolveGrandeSalleAccess({
      accessType: 'subscribers',
      tournamentId: TOURNOI,
      socket: anonSocket(),
      checkEntitlement: proEntitlement,
      hasPaidEntry: paidFor([]),
      env: ENV,
    });

    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('unauthenticated');
  });

  test('D2. gsStudentId forgé → aucun accès (pas d’identité vérifiée)', async () => {
    const socket = { authUser: null, handshake: { auth: { studentId: 'std-vole' } } };
    const r = await resolveGrandeSalleAccess({
      accessType: 'paid',
      tournamentId: TOURNOI,
      socket,
      checkEntitlement: proEntitlement,
      hasPaidEntry: paidFor(['victime@test.fr']),
      env: ENV,
    });

    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('payment_proof_required');
  });

  test("D3. email d'un payeur usurpé → refusé (seul l'email du JWT compte)", async () => {
    const r = await resolveGrandeSalleAccess({
      accessType: 'paid',
      tournamentId: TOURNOI,
      socket: authSocket('u-intrus', 'intrus@test.fr'),
      checkEntitlement: freeEntitlement,
      hasPaidEntry: paidFor(['payeur@test.fr']),
      env: ENV,
    });

    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('not_paid');
  });

  test('D4. abonné légitime → accès au tournoi réservé aux abonnés', async () => {
    const r = await resolveGrandeSalleAccess({
      accessType: 'subscribers',
      tournamentId: TOURNOI,
      socket: authSocket('u-abonne', 'abonne@test.fr'),
      checkEntitlement: proEntitlement,
      hasPaidEntry: paidFor([]),
      env: ENV,
    });

    expect(r).toMatchObject({ allowed: true, reason: 'subscriber', userId: 'u-abonne' });
  });

  test('D5. entrée payée prouvée par le billet signé → accès', async () => {
    const ticket = issueTicket({ secret: SECRET, tournamentId: TOURNOI, email: 'Payeur@Test.fr' });
    const r = await resolveGrandeSalleAccess({
      accessType: 'paid',
      tournamentId: TOURNOI,
      socket: anonSocket(),
      checkEntitlement: freeEntitlement,
      hasPaidEntry: paidFor(['payeur@test.fr']),
      entryTicket: ticket,
      env: ENV,
    });

    expect(r).toMatchObject({ allowed: true, reason: 'paid_entry', via: 'signed_ticket' });
  });

  test('D6. billet falsifié ou émis pour un autre tournoi → refusé', async () => {
    const autre = issueTicket({ secret: SECRET, tournamentId: 'autre-tournoi', email: 'payeur@test.fr' });
    const falsifie = `v1.${Buffer.from('payeur@test.fr').toString('base64url')}.signature_bidon`;

    for (const ticket of [autre, falsifie, 'nimportequoi']) {
      const r = await resolveGrandeSalleAccess({
        accessType: 'paid',
        tournamentId: TOURNOI,
        socket: anonSocket(),
        checkEntitlement: freeEntitlement,
        hasPaidEntry: paidFor(['payeur@test.fr']),
        entryTicket: ticket,
        env: ENV,
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('payment_proof_required');
    }
  });

  test('D7. billet valide mais paiement absent en base → refusé', async () => {
    const ticket = issueTicket({ secret: SECRET, tournamentId: TOURNOI, email: 'jamais.paye@test.fr' });
    const r = await resolveGrandeSalleAccess({
      accessType: 'paid',
      tournamentId: TOURNOI,
      socket: anonSocket(),
      checkEntitlement: freeEntitlement,
      hasPaidEntry: paidFor(['payeur@test.fr']),
      entryTicket: ticket,
      env: ENV,
    });

    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('not_paid');
  });

  test('D8. vérification de paiement indisponible → fail closed', async () => {
    const ticket = issueTicket({ secret: SECRET, tournamentId: TOURNOI, email: 'payeur@test.fr' });
    const r = await resolveGrandeSalleAccess({
      accessType: 'paid',
      tournamentId: TOURNOI,
      socket: anonSocket(),
      checkEntitlement: freeEntitlement,
      hasPaidEntry: paymentUnknown,
      entryTicket: ticket,
      env: ENV,
    });

    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('verification_unavailable');
  });

  test("D9. erreur d'habilitation → pas d'accès abonné", async () => {
    const r = await resolveGrandeSalleAccess({
      accessType: 'subscribers',
      tournamentId: TOURNOI,
      socket: authSocket('u-1', 'a@test.fr'),
      checkEntitlement: brokenEntitlement,
      hasPaidEntry: paidFor([]),
      env: ENV,
    });

    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('not_entitled');
  });

  test('D10. salle gratuite → ouverte (aucune régression)', async () => {
    const r = await resolveGrandeSalleAccess({
      accessType: 'free',
      tournamentId: null,
      socket: anonSocket(),
      checkEntitlement: freeEntitlement,
      hasPaidEntry: paidFor([]),
      env: ENV,
    });

    expect(r.allowed).toBe(true);
  });

  test('D11. secret de billet absent → aucun billet ne peut ouvrir un tournoi payant', async () => {
    const ticket = issueTicket({ secret: SECRET, tournamentId: TOURNOI, email: 'payeur@test.fr' });
    const r = await resolveGrandeSalleAccess({
      accessType: 'paid',
      tournamentId: TOURNOI,
      socket: anonSocket(),
      checkEntitlement: freeEntitlement,
      hasPaidEntry: paidFor(['payeur@test.fr']),
      entryTicket: ticket,
      env: {},
    });

    expect(r.allowed).toBe(false);
  });
});

describe('CTO-002 (revue) — billet signé', () => {
  test('un billet est lié au couple (tournoi, email)', () => {
    const ticket = issueTicket({ secret: SECRET, tournamentId: TOURNOI, email: 'a@test.fr' });
    expect(verifyTicket({ secret: SECRET, tournamentId: TOURNOI, ticket })).toBe('a@test.fr');
    expect(verifyTicket({ secret: SECRET, tournamentId: 'autre', ticket })).toBeNull();
    expect(verifyTicket({ secret: 'autre_secret', tournamentId: TOURNOI, ticket })).toBeNull();
  });

  test("l'email est normalisé pour empêcher les variantes de casse", () => {
    const ticket = issueTicket({ secret: SECRET, tournamentId: TOURNOI, email: '  A@Test.FR ' });
    expect(verifyTicket({ secret: SECRET, tournamentId: TOURNOI, ticket })).toBe('a@test.fr');
  });
});
