// =============================================
// CTO-002 (revue) — B. Une écriture Supabase ratée ne doit jamais être
// acquittée comme un succès: le webhook répond 500, libère la réservation
// d'idempotence, et Stripe rejoue l'événement.
// Aucun secret réel, aucun appel réseau.
// =============================================

const { makeWebhookHandler } = require('../billing/stripeWebhook');
const { createStripeEventStore } = require('../billing/stripeEventStore');
const { makeStripeEventProcessor } = require('../billing/stripeEventProcessor');

const FAKE_SECRET = 'whsec_dummy_for_tests';
const VALID_SIGNATURE = 'sig_valid';

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

/**
 * Faux client Supabase: chaque table renvoie le résultat programmé.
 * results = { 'subscriptions.upsert': { error }, ... }
 */
function fakeSupabase(results, calls = []) {
  const res = (key, fallback = { data: null, error: null }) => {
    calls.push(key);
    return results[key] !== undefined ? results[key] : fallback;
  };
  return {
    from(table) {
      const chain = {
        upsert: async () => res(`${table}.upsert`, { error: null }),
        update: () => ({ eq: async () => res(`${table}.update`, { error: null }) }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => res(`${table}.select`, { data: { user_id: 'u-1' }, error: null }),
          }),
        }),
      };
      return chain;
    },
  };
}

const stripeStub = (event) => ({
  webhooks: {
    constructEvent: (body, signature, secret) => {
      if (signature !== VALID_SIGNATURE || secret !== FAKE_SECRET) throw new Error('invalid signature');
      return event;
    },
  },
  subscriptions: {
    retrieve: async (id) => ({
      id,
      status: 'active',
      current_period_end: 1893456000,
      items: { data: [{ price: { id: 'price_indiv' } }] },
    }),
  },
});

const checkoutEvent = {
  id: 'evt_checkout_1',
  type: 'checkout.session.completed',
  data: { object: { metadata: { user_id: 'u-1' }, subscription: 'sub_1' } },
};

const tournamentEvent = {
  id: 'evt_tournoi_1',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', payment_intent: 'pi_1', metadata: { type: 'tournament_entry', tournament_id: 't-1', email: 'joueur@test.fr' } } },
};

const subUpdatedEvent = {
  id: 'evt_sub_1',
  type: 'customer.subscription.updated',
  data: { object: { id: 'sub_1', status: 'active', current_period_end: 1893456000, items: { data: [{ price: { id: 'price_indiv' } }] } } },
};

function build({ event, supabase, invalidateSubCache = jest.fn(), store }) {
  const eventStore = store || createStripeEventStore({ persist: false });
  const stripe = stripeStub(event);
  const processEvent = makeStripeEventProcessor({
    getSupabaseAdmin: () => supabase,
    getStripe: () => stripe,
    invalidateSubCache,
  });
  const handler = makeWebhookHandler({
    getStripe: () => stripe,
    getWebhookSecret: () => FAKE_SECRET,
    processEvent,
    eventStore,
  });
  const req = { headers: { 'stripe-signature': VALID_SIGNATURE }, body: Buffer.from('{}') };
  return { handler, req, eventStore, invalidateSubCache };
}

describe('CTO-002 (revue) — échec Supabase pendant un webhook Stripe', () => {
  test("B1. checkout.session.completed + erreur d'upsert abonnement → 500, événement non consommé", async () => {
    const supabase = fakeSupabase({ 'subscriptions.upsert': { error: { message: 'permission denied' } } });
    const { handler, req, eventStore } = build({ event: checkoutEvent, supabase });
    const res = fakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ ok: false, error: 'processing_error' });
    // Réservation libérée → un retry Stripe pourra rejouer l'événement.
    expect(eventStore.reserve(checkoutEvent.id)).toBe(true);
  });

  test("B1 bis. erreur d'upsert d'une entrée de tournoi payée → 500", async () => {
    const supabase = fakeSupabase({ 'gs_tournament_entries.upsert': { error: { message: 'deadlock' } } });
    const { handler, req } = build({ event: tournamentEvent, supabase });
    const res = fakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(500);
  });

  test('B2. customer.subscription.updated + erreur de mise à jour → 500', async () => {
    const supabase = fakeSupabase({ 'subscriptions.update': { error: { message: 'timeout' } } });
    const { handler, req, invalidateSubCache } = build({ event: subUpdatedEvent, supabase });
    const res = fakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(invalidateSubCache).not.toHaveBeenCalled();
  });

  test("B2 bis. erreur de relecture pour l'invalidation de cache → 500", async () => {
    const supabase = fakeSupabase({ 'subscriptions.select': { data: null, error: { message: 'connection reset' } } });
    const { handler, req } = build({ event: subUpdatedEvent, supabase });
    const res = fakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(500);
  });

  test('B3. retry après rétablissement de Supabase → exactement un traitement réussi', async () => {
    const store = createStripeEventStore({ persist: false });
    const calls = [];
    let failing = true;
    const supabase = {
      from(table) {
        return {
          upsert: async () => { calls.push(`${table}.upsert`); return { error: failing ? { message: 'down' } : null }; },
          update: () => ({ eq: async () => ({ error: null }) }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: 'u-1' }, error: null }) }) }),
        };
      },
    };
    const stripe = stripeStub(checkoutEvent);
    const processEvent = makeStripeEventProcessor({ getSupabaseAdmin: () => supabase, getStripe: () => stripe });
    const handler = makeWebhookHandler({
      getStripe: () => stripe,
      getWebhookSecret: () => FAKE_SECRET,
      processEvent,
      eventStore: store,
    });
    const req = () => ({ headers: { 'stripe-signature': VALID_SIGNATURE }, body: Buffer.from('{}') });

    const first = fakeRes();
    await handler(req(), first);
    expect(first.statusCode).toBe(500);

    failing = false;
    const second = fakeRes();
    await handler(req(), second);
    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual({ received: true });

    // Troisième livraison (retry Stripe tardif): traitée comme doublon.
    const third = fakeRes();
    await handler(req(), third);
    expect(third.body).toEqual({ received: true, duplicate: true });

    // 2 tentatives d'écriture au total: l'échec puis le succès, pas de doublon.
    expect(calls.filter(c => c === 'subscriptions.upsert')).toHaveLength(2);
  });

  test('B4. Supabase Admin indisponible sur un événement financier → 500, jamais acquitté', async () => {
    for (const event of [checkoutEvent, subUpdatedEvent]) {
      const { handler, req } = build({ event, supabase: null });
      const res = fakeRes();
      await handler(req, res);
      expect(res.statusCode).toBe(500);
    }
  });

  test('B5. écriture Supabase réussie → 200 et cache abonnement invalidé', async () => {
    const supabase = fakeSupabase({});
    const { handler, req, invalidateSubCache } = build({ event: subUpdatedEvent, supabase });
    const res = fakeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(invalidateSubCache).toHaveBeenCalledWith('u-1');
  });
});
