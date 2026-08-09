// =============================================
// CTO-002 (revue) — E. Matrice d'autorisation des événements mutants:
// un abonnement Pro n'accorde aucun pouvoir professeur/admin, la propriété
// du match est vérifiée serveur, et le participant est déduit des rooms.
// =============================================

const { isManagerRole, authorizeManagerAction, isMatchParticipant } = require('../access/matchAccess');

const UID = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const PROD_ENV = { NODE_ENV: 'production' };

const socketOf = (id, extra) => ({ authUser: { id, email: 'x@test.fr' }, ...extra });
const roleOf = (role) => async () => ({ role, reason: 'resolved' });

describe('CTO-002 (revue) — rôles de pilotage', () => {
  test('seuls les rôles de gestion pilotent un match', () => {
    for (const r of ['admin', 'teacher', 'cpd', 'cpc', 'rectorat']) expect(isManagerRole(r)).toBe(true);
    for (const r of ['student', 'parent', 'pro', '', null, undefined]) expect(isManagerRole(r)).toBe(false);
  });

  test('E1. socket anonyme → refusé', async () => {
    const d = await authorizeManagerAction({ socket: {}, resolveRoleFor: roleOf('admin'), env: PROD_ENV });
    expect(d).toMatchObject({ allowed: false, reason: 'unauthenticated' });
  });

  test('E2. abonné Pro sans rôle de gestion → refusé', async () => {
    const d = await authorizeManagerAction({ socket: socketOf(UID), resolveRoleFor: roleOf('student'), env: PROD_ENV });
    expect(d).toMatchObject({ allowed: false, reason: 'role_required' });
  });

  test('E3. professeur → autorisé sur son propre match', async () => {
    const d = await authorizeManagerAction({
      socket: socketOf(UID), resolveRoleFor: roleOf('teacher'), match: { teacherId: UID }, env: PROD_ENV,
    });
    expect(d).toMatchObject({ allowed: true, reason: 'manager', role: 'teacher' });
  });

  test("E4. professeur → refusé sur le match d'un collègue", async () => {
    const d = await authorizeManagerAction({
      socket: socketOf(UID), resolveRoleFor: roleOf('teacher'), match: { teacherId: OTHER }, env: PROD_ENV,
    });
    expect(d).toMatchObject({ allowed: false, reason: 'not_match_owner' });
  });

  test('E5. admin → autorisé même sur un match tiers', async () => {
    const d = await authorizeManagerAction({
      socket: socketOf(UID), resolveRoleFor: roleOf('admin'), match: { teacherId: OTHER }, env: PROD_ENV,
    });
    expect(d.allowed).toBe(true);
  });

  test('E6. résolution de rôle en erreur → refusé (fail closed)', async () => {
    const boom = async () => { throw new Error('supabase down'); };
    const d = await authorizeManagerAction({ socket: socketOf(UID), resolveRoleFor: boom, env: PROD_ENV });
    expect(d).toMatchObject({ allowed: false, reason: 'role_required', role: null });
  });

  test('E7. jeton de session présenté mais non vérifié → refusé sans consulter le rôle', async () => {
    const never = jest.fn();
    const d = await authorizeManagerAction({
      socket: socketOf(UID, { sessionTokenPresented: true, sessionValid: null }),
      resolveRoleFor: never,
      env: PROD_ENV,
    });
    expect(d).toMatchObject({ allowed: false, reason: 'session_unverified' });
    expect(never).not.toHaveBeenCalled();
  });
});

describe('CTO-002 (revue) — participation à un match', () => {
  test('la participation vient des rooms serveur, pas du payload client', () => {
    const socket = { rooms: new Set(['sock-id', 'match-42']) };
    expect(isMatchParticipant(socket, 'match-42')).toBe(true);
    expect(isMatchParticipant(socket, 'match-43')).toBe(false);
    expect(isMatchParticipant({}, 'match-42')).toBe(false);
    expect(isMatchParticipant(socket, null)).toBe(false);
  });
});
