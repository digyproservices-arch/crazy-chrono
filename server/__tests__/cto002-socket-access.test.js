// =============================================
// CTO-002 — Contrôle d'accès Socket.IO (fail closed)
// =============================================

const { checkSocketAccess, getSocketIdentity, isFreeSoloRoom, isDevBypassEnabled } = require('../access/socketAccess');

const UID = '11111111-2222-3333-4444-555555555555';
const PROD_ENV = { NODE_ENV: 'production' };

const entitled = jest.fn().mockResolvedValue({ isPro: true, source: 'subscription' });
const notEntitled = jest.fn().mockResolvedValue({ isPro: false, reason: 'no_entitlement' });
const verificationError = jest.fn().mockResolvedValue({ isPro: false, reason: 'verification_error' });

describe('CTO-002 — identité de confiance du socket', () => {
  test('les champs envoyés par le client ne créent aucune identité', () => {
    const socket = { handshake: { auth: {} }, data: { studentId: 'std_1', userId: UID, role: 'teacher' } };
    expect(getSocketIdentity(socket)).toMatchObject({ userId: null, authError: 'unauthenticated' });
  });

  test('identité issue du JWT vérifié au handshake', () => {
    const socket = { authUser: { id: UID, email: 'a@b.c' } };
    expect(getSocketIdentity(socket)).toMatchObject({ userId: UID, email: 'a@b.c', authError: null });
  });
});

describe('CTO-002 — accès aux événements payants', () => {
  test('A. socket sans authentification → refusé', async () => {
    const check = jest.fn();
    const d = await checkSocketAccess({ socket: {}, checkEntitlement: check, env: PROD_ENV });

    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('unauthenticated');
    expect(check).not.toHaveBeenCalled();
  });

  test('A bis. studentId fourni par le client sans jeton → refusé', async () => {
    const socket = { handshake: { auth: {} }, clientStudentId: 'std_demo_0267' };
    const d = await checkSocketAccess({ socket, checkEntitlement: notEntitled, env: PROD_ENV });
    expect(d).toMatchObject({ allowed: false, reason: 'unauthenticated', userId: null });
  });

  test('B. token invalide → refusé (aucune identité déduite)', async () => {
    const socket = { authError: 'invalid_token' };
    const d = await checkSocketAccess({ socket, checkEntitlement: entitled, env: PROD_ENV });
    expect(d).toMatchObject({ allowed: false, reason: 'invalid_token' });
  });

  test('B bis. jeton non vérifiable (Supabase indisponible) → refusé', async () => {
    const socket = { authError: 'verification_unavailable' };
    const d = await checkSocketAccess({ socket, checkEntitlement: entitled, env: PROD_ENV });
    expect(d).toMatchObject({ allowed: false, reason: 'verification_unavailable' });
  });

  test('C. utilisateur authentifié sans abonnement ni licence → refusé', async () => {
    const socket = { authUser: { id: UID, email: 'parent@example.com' } };
    const d = await checkSocketAccess({ socket, checkEntitlement: notEntitled, env: PROD_ENV });
    expect(d).toMatchObject({ allowed: false, reason: 'no_entitlement', userId: UID });
  });

  test('D. utilisateur authentifié avec abonnement actif → autorisé', async () => {
    const socket = { authUser: { id: UID, email: 'client@example.com' } };
    const d = await checkSocketAccess({ socket, checkEntitlement: entitled, env: PROD_ENV });
    expect(d).toMatchObject({ allowed: true, reason: 'subscription', userId: UID });
  });

  test('E. élève avec licence institutionnelle valide → autorisé', async () => {
    const viaEmail = { authUser: { id: UID, email: 'leo.b@eleve.crazychrono.app' } };
    await expect(checkSocketAccess({ socket: viaEmail, checkEntitlement: notEntitled, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: true, reason: 'student_email_jwt' });

    const viaLicense = { authUser: { id: UID, email: 'leo@example.com' } };
    const licensed = jest.fn().mockResolvedValue({ isPro: true, source: 'student_license' });
    await expect(checkSocketAccess({ socket: viaLicense, checkEntitlement: licensed, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: true, reason: 'student_license' });
  });

  test('F ter. sessionToken non validé (session inconnue / RPC en erreur) → refusé', async () => {
    const socket = { authUser: { id: UID, email: 'client@example.com' }, sessionValid: false };
    await expect(checkSocketAccess({ socket, checkEntitlement: entitled, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: false, reason: 'session_unverified' });
  });

  test('F. erreur de vérification d’abonnement → refusé', async () => {
    const socket = { authUser: { id: UID, email: 'client@example.com' } };
    await expect(checkSocketAccess({ socket, checkEntitlement: verificationError, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: false, reason: 'verification_error' });
  });

  test('F bis. exception pendant la vérification → refusé', async () => {
    const socket = { authUser: { id: UID, email: 'client@example.com' } };
    const boom = jest.fn().mockRejectedValue(new Error('down'));
    await expect(checkSocketAccess({ socket, checkEntitlement: boom, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: false, reason: 'verification_error' });
  });
});

// ── C. Un jeton de session présenté mais non prouvé valide ferme le payant ──
describe('CTO-002 (revue) — jeton de session non vérifiable', () => {
  const authed = (extra) => ({ authUser: { id: UID, email: 'client@example.com' }, ...extra });

  test('C1. aucun jeton de session présenté → règles JWT + habilitation inchangées', async () => {
    const socket = authed({ sessionTokenPresented: false, sessionValid: null });
    await expect(checkSocketAccess({ socket, checkEntitlement: entitled, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: true, reason: 'subscription' });
  });

  test('C2. jeton présenté et session vérifiée valide → autorisé', async () => {
    const socket = authed({ sessionTokenPresented: true, sessionValid: true });
    await expect(checkSocketAccess({ socket, checkEntitlement: entitled, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: true, reason: 'subscription' });
  });

  test('C3. session inconnue (sessionValid=false) → refusé', async () => {
    const socket = authed({ sessionTokenPresented: true, sessionValid: false });
    await expect(checkSocketAccess({ socket, checkEntitlement: entitled, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: false, reason: 'session_unverified' });
  });

  test('C4. RPC check_session_active en erreur (sessionValid=null) → refusé', async () => {
    const socket = authed({ sessionTokenPresented: true, sessionValid: null });
    await expect(checkSocketAccess({ socket, checkEntitlement: entitled, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: false, reason: 'session_unverified' });
  });

  test('C5. exception pendant la vérification de session → refusé', async () => {
    const socket = authed({ sessionTokenPresented: true, sessionValid: undefined });
    await expect(checkSocketAccess({ socket, checkEntitlement: entitled, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: false, reason: 'session_unverified' });
  });

  test('C6. Supabase indisponible au handshake → refusé côté payant', async () => {
    // Le handshake laisse `sessionValid = null` et accepte la connexion
    // (spectateurs, monitoring), mais le payant reste fermé.
    const socket = authed({ sessionTokenPresented: true, sessionValid: null });
    const never = jest.fn();
    const d = await checkSocketAccess({ socket, checkEntitlement: never, env: PROD_ENV });
    expect(d.allowed).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });

  test("C7. l'élève à email institutionnel ne contourne pas un jeton non vérifié", async () => {
    const socket = { authUser: { id: UID, email: 'leo.b@eleve.crazychrono.app' }, sessionTokenPresented: true, sessionValid: false };
    await expect(checkSocketAccess({ socket, checkEntitlement: notEntitled, env: PROD_ENV }))
      .resolves.toMatchObject({ allowed: false, reason: 'session_unverified' });
  });
});

describe('CTO-002 — dérogation de développement', () => {
  test('impossible à activer en production', () => {
    expect(isDevBypassEnabled({ NODE_ENV: 'production', CC_DEV_ALLOW_UNVERIFIED_MP: '1' })).toBe(false);
    expect(isDevBypassEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isDevBypassEnabled({ NODE_ENV: 'development', CC_DEV_ALLOW_UNVERIFIED_MP: '1' })).toBe(true);
  });

  test('socket anonyme refusé en production même avec la variable positionnée', async () => {
    const env = { NODE_ENV: 'production', CC_DEV_ALLOW_UNVERIFIED_MP: '1' };
    await expect(checkSocketAccess({ socket: {}, checkEntitlement: notEntitled, env }))
      .resolves.toMatchObject({ allowed: false });
  });
});

describe('CTO-002 — non-régression Solo gratuit', () => {
  test('les salles solo sont identifiées comme gratuites', () => {
    expect(isFreeSoloRoom('solo-abc123')).toBe(true);
    expect(isFreeSoloRoom('ABCD')).toBe(false);
    expect(isFreeSoloRoom('default')).toBe(false);
    expect(isFreeSoloRoom(undefined)).toBe(false);
  });
});
