// =============================================
// CTO-002 — Habilitations FAIL CLOSED
// Aucun accès Supabase réel: stub local chaînable.
// =============================================

const { resolveEntitlement, createEntitlementCache } = require('../access/entitlements');

const UID = '11111111-2222-3333-4444-555555555555';

/**
 * Stub Supabase chaînable.
 * tables = { subscriptions: { rows: [] } | { error: {...} } | { throws: true }, ... }
 */
function fakeSupabase(tables) {
  return {
    from(name) {
      const cfg = tables[name] || { rows: [] };
      const result = (single) => {
        if (cfg.throws) throw new Error('network down');
        if (cfg.error) return { data: null, error: cfg.error };
        const rows = cfg.rows || [];
        return { data: single ? (rows[0] || null) : rows, error: null };
      };
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: async () => result(false),
        maybeSingle: async () => result(true),
        single: async () => result(true),
        // requête terminale sans modificateur: `await supabase.from(x).select()...`
        then: (resolve, reject) => {
          try { return Promise.resolve(result(false)).then(resolve, reject); }
          catch (e) { return Promise.reject(e).catch(reject); }
        },
      };
      return q;
    },
  };
}

const activeSub = { subscriptions: { rows: [{ status: 'active', current_period_end: null }] } };
const noSub = { subscriptions: { rows: [] } };

describe('CTO-002 — resolveEntitlement (fail closed)', () => {
  test('utilisateur non authentifié → non Pro', async () => {
    await expect(resolveEntitlement({ supabase: fakeSupabase(activeSub), userId: null }))
      .resolves.toMatchObject({ isPro: false, reason: 'unauthenticated' });
  });

  test('identifiant non issu d’un jeton (studentId client) → non Pro', async () => {
    await expect(resolveEntitlement({ supabase: fakeSupabase(activeSub), userId: 'std_demo_0267' }))
      .resolves.toMatchObject({ isPro: false, reason: 'untrusted_identifier' });
  });

  test('base inaccessible (Supabase non configuré) → non Pro', async () => {
    await expect(resolveEntitlement({ supabase: null, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'verification_unavailable' });
  });

  test('erreur de requête abonnement → non Pro', async () => {
    const sb = fakeSupabase({ subscriptions: { error: { message: 'timeout' } } });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'verification_error' });
  });

  test('exception pendant la vérification → non Pro', async () => {
    const sb = fakeSupabase({ subscriptions: { throws: true } });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'verification_error' });
  });

  test('aucun abonnement et profil inconnu → non Pro', async () => {
    const sb = fakeSupabase({ ...noSub, user_profiles: { rows: [] } });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'user_not_found' });
  });

  test('abonnement annulé + profil sans droit → non Pro', async () => {
    const sb = fakeSupabase({
      subscriptions: { rows: [{ status: 'canceled', current_period_end: null }] },
      user_profiles: { rows: [{ role: 'user', email: 'parent@example.com' }] },
      user_student_mapping: { rows: [] },
    });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'subscription_inactive', status: 'canceled' });
  });

  test('abonnement expiré (current_period_end passé) → non Pro', async () => {
    const sb = fakeSupabase({
      subscriptions: { rows: [{ status: 'active', current_period_end: '2020-01-01T00:00:00.000Z' }] },
    });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'subscription_expired' });
  });

  test('erreur de lecture du profil → non Pro (pas de repli permissif)', async () => {
    const sb = fakeSupabase({ ...noSub, user_profiles: { error: { message: 'rls' } } });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'verification_error' });
  });

  test('abonnement actif → Pro', async () => {
    const sb = fakeSupabase(activeSub);
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: true, source: 'subscription', status: 'active' });
  });

  test('abonnement trialing non expiré → Pro', async () => {
    const sb = fakeSupabase({
      subscriptions: { rows: [{ status: 'trialing', current_period_end: '2999-01-01T00:00:00.000Z' }] },
    });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: true, source: 'subscription' });
  });

  test('licence institutionnelle: rôle enseignant → Pro', async () => {
    const sb = fakeSupabase({ ...noSub, user_profiles: { rows: [{ role: 'teacher', email: 'prof@ecole.fr' }] } });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: true, source: 'role:teacher' });
  });

  test('adresse @eleve… rapprochée d\'une fiche licenciée → Pro', async () => {
    const sb = fakeSupabase({
      ...noSub,
      user_profiles: { rows: [{ role: 'student', email: 'leob@eleve.crazychrono.app' }] },
      user_student_mapping: { rows: [] },
      students: { rows: [{ id: 'std_1', access_code: 'LEO-B', licensed: true }] },
    });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: true, source: 'student_license' });
  });

  test('rôle student seul, sans fiche élève → non Pro (revue CTO)', async () => {
    const sb = fakeSupabase({
      ...noSub,
      user_profiles: { rows: [{ role: 'student', email: 'leo@example.com' }] },
      user_student_mapping: { rows: [] },
      students: { rows: [] },
    });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'no_entitlement', role: 'student' });
  });

  test('élève licencié (mapping actif vérifié côté serveur) → Pro', async () => {
    const sb = fakeSupabase({
      ...noSub,
      user_profiles: { rows: [{ role: 'user', email: 'leo@example.com' }] },
      user_student_mapping: { rows: [{ student_id: 'std_1' }] },
      students: { rows: [{ id: 'std_1', licensed: true }] },
    });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: true, source: 'student_license' });
  });

  test('élève rattaché mais fiche non licenciée → non Pro', async () => {
    const sb = fakeSupabase({
      ...noSub,
      user_profiles: { rows: [{ role: 'student', email: 'leo@example.com' }] },
      user_student_mapping: { rows: [{ student_id: 'std_1' }] },
      students: { rows: [{ id: 'std_1', licensed: false }] },
    });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'student_not_licensed' });
  });

  test('erreur de lecture de la fiche élève → non Pro', async () => {
    const sb = fakeSupabase({
      ...noSub,
      user_profiles: { rows: [{ role: 'student', email: 'leo@example.com' }] },
      user_student_mapping: { rows: [{ student_id: 'std_1' }] },
      students: { error: { message: 'timeout' } },
    });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'verification_error' });
  });

  test('erreur de lecture du mapping élève → non Pro', async () => {
    const sb = fakeSupabase({
      ...noSub,
      user_profiles: { rows: [{ role: 'user', email: 'leo@example.com' }] },
      user_student_mapping: { error: { message: 'timeout' } },
    });
    await expect(resolveEntitlement({ supabase: sb, userId: UID }))
      .resolves.toMatchObject({ isPro: false, reason: 'verification_error' });
  });
});

describe('CTO-002 — cache d’habilitation', () => {
  test('les refus expirent plus vite que les accès', () => {
    const cache = createEntitlementCache({ grantTtlMs: 1000, denyTtlMs: 100 });
    const t0 = 1_000_000;
    cache.set('a', { isPro: true }, t0);
    cache.set('b', { isPro: false }, t0);

    expect(cache.get('a', t0 + 500)).toMatchObject({ isPro: true });
    expect(cache.get('b', t0 + 500)).toBeNull();
  });

  test('invalidation immédiate (webhook Stripe)', () => {
    const cache = createEntitlementCache();
    cache.set('a', { isPro: false });
    cache.invalidate('a');
    expect(cache.get('a')).toBeNull();
  });
});
