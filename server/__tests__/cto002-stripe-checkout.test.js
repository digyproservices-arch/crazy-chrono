// =============================================
// CTO-002 — Checkout / Portail Stripe
// Aucun secret réel, aucun appel réseau: Stripe est un stub local.
// =============================================

const {
  makeCheckoutHandler,
  makePortalHandler,
  parsePriceWhitelist,
  COMMERCIAL_PRICE_IDS,
} = require('../billing/stripeCheckout');

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const deps = (stripe, priceId = 'price_test_123', allowed = ['price_test_123', 'price_indiv']) => ({
  getStripe: () => stripe,
  getDefaultPriceId: () => priceId,
  getAllowedPriceIds: () => allowed,
  getFrontendUrl: () => 'http://localhost:3000',
});

const authedReq = (body = {}) => ({ body, authUser: { id: 'u-1', email: 'a@b.c' } });

describe('CTO-002 — POST /stripe/create-checkout-session', () => {
  test('A. Stripe non configuré → 503 explicite, aucun succès simulé', async () => {
    const res = fakeRes();
    await makeCheckoutHandler(deps(null))(authedReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ok: false, error: 'stripe_not_configured' });
    expect(res.body.ok).toBe(false);
    expect(res.body.url).toBeUndefined();
    expect(res.body.mocked).toBeUndefined();
  });

  test('A bis. price_id absent → 503, aucune URL renvoyée', async () => {
    const stripe = { checkout: { sessions: { create: jest.fn() } } };
    const res = fakeRes();
    await makeCheckoutHandler(deps(stripe, null))(authedReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ok: false, error: 'stripe_price_not_configured' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('B. Stripe configuré → Checkout Session créée et URL Stripe renvoyée', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' });
    const stripe = { checkout: { sessions: { create } } };
    const res = fakeRes();
    await makeCheckoutHandler(deps(stripe))(authedReq({ price_id: 'price_indiv' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, url: 'https://checkout.stripe.test/cs_1' });
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.mode).toBe('subscription');
    expect(args.line_items).toEqual([{ price: 'price_indiv', quantity: 1 }]);
  });

  test("B bis. l'abonnement est attribué à l'utilisateur du jeton, pas au user_id du corps", async () => {
    const create = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/cs_2' });
    const res = fakeRes();
    await makeCheckoutHandler(deps({ checkout: { sessions: { create } } }))(
      { body: { user_id: 'victime-999' }, authUser: { id: 'u-1' } },
      res,
    );

    expect(create.mock.calls[0][0].metadata).toEqual({ user_id: 'u-1' });
  });

  test('B ter. requête non authentifiée → 401, aucun appel Stripe', async () => {
    const create = jest.fn();
    const res = fakeRes();
    await makeCheckoutHandler(deps({ checkout: { sessions: { create } } }))({ body: {} }, res);

    expect(res.statusCode).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  test('C. erreur API Stripe → 502, aucune URL de succès', async () => {
    const create = jest.fn().mockRejectedValue(new Error('card_declined'));
    const res = fakeRes();
    await makeCheckoutHandler(deps({ checkout: { sessions: { create } } }))(authedReq(), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, error: 'checkout_error' });
    expect(res.body.url).toBeUndefined();
  });

  test('C bis. session Stripe sans URL → 502 (aucune redirection fabriquée)', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'cs_3' });
    const res = fakeRes();
    await makeCheckoutHandler(deps({ checkout: { sessions: { create } } }))(authedReq(), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, error: 'checkout_session_invalid' });
  });
});

describe('CTO-002 (revue) — liste blanche des Price ID', () => {
  const stripeOk = () => ({ checkout: { sessions: { create: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/cs' }) } } });

  test('G1. Price ID autorisé → session créée avec ce tarif', async () => {
    const stripe = stripeOk();
    const res = fakeRes();
    await makeCheckoutHandler(deps(stripe))(authedReq({ price_id: 'price_indiv' }), res);

    expect(res.statusCode).toBe(200);
    expect(stripe.checkout.sessions.create.mock.calls[0][0].line_items).toEqual([{ price: 'price_indiv', quantity: 1 }]);
  });

  test('G2. Price ID inconnu → 400 price_not_allowed, aucun appel Stripe', async () => {
    const stripe = stripeOk();
    const res = fakeRes();
    await makeCheckoutHandler(deps(stripe))(authedReq({ price_id: 'price_attaquant_0eur' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ ok: false, error: 'price_not_allowed' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('G3. Price ID vide → tarif serveur par défaut', async () => {
    const stripe = stripeOk();
    const res = fakeRes();
    await makeCheckoutHandler(deps(stripe))(authedReq({}), res);

    expect(res.statusCode).toBe(200);
    expect(stripe.checkout.sessions.create.mock.calls[0][0].line_items).toEqual([{ price: 'price_test_123', quantity: 1 }]);
  });

  test('G4. Ancien Price ID retiré de la configuration → refusé', async () => {
    const stripe = stripeOk();
    const res = fakeRes();
    await makeCheckoutHandler(deps(stripe, 'price_test_123', ['price_test_123']))(
      authedReq({ price_id: 'price_ancien_2023' }), res,
    );

    expect(res.statusCode).toBe(400);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('G5. La grille commerciale publiée reste acceptée sans configuration', () => {
    const allowed = parsePriceWhitelist({});
    for (const id of COMMERCIAL_PRICE_IDS) expect(allowed).toContain(id);
  });

  test('G6. STRIPE_PRICE_IDS ajoute des tarifs sans en retirer', () => {
    const allowed = parsePriceWhitelist({ STRIPE_PRICE_ID: 'price_a', STRIPE_PRICE_IDS: 'price_b, price_c' });
    expect(allowed).toEqual(expect.arrayContaining(['price_a', 'price_b', 'price_c', ...COMMERCIAL_PRICE_IDS]));
  });
});

describe('CTO-002 (revue) — URL de retour du checkout', () => {
  const capture = () => {
    const create = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/cs' });
    return { create, stripe: { checkout: { sessions: { create } } } };
  };

  test('H1. success_url externe → ignorée au profit de FRONTEND_URL', async () => {
    const { create, stripe } = capture();
    await makeCheckoutHandler(deps(stripe))(
      authedReq({ success_url: 'https://attaquant.example/steal' }), fakeRes(),
    );

    expect(create.mock.calls[0][0].success_url).toBe('http://localhost:3000/account?checkout=success');
  });

  test('H2. cancel_url externe → ignorée', async () => {
    const { create, stripe } = capture();
    await makeCheckoutHandler(deps(stripe))(
      authedReq({ cancel_url: '//attaquant.example/x' }), fakeRes(),
    );

    expect(create.mock.calls[0][0].cancel_url).toBe('http://localhost:3000/pricing?checkout=cancel');
  });

  test('H3. URL de même origine → conservée', async () => {
    const { create, stripe } = capture();
    await makeCheckoutHandler(deps(stripe))(
      authedReq({ success_url: 'http://localhost:3000/account?checkout=success&from=pricing' }), fakeRes(),
    );

    expect(create.mock.calls[0][0].success_url).toBe('http://localhost:3000/account?checkout=success&from=pricing');
  });

  test('H4. sans URL client → URL serveur par défaut', async () => {
    const { create, stripe } = capture();
    await makeCheckoutHandler(deps(stripe))(authedReq(), fakeRes());

    const args = create.mock.calls[0][0];
    expect(args.success_url).toBe('http://localhost:3000/account?checkout=success');
    expect(args.cancel_url).toBe('http://localhost:3000/pricing?checkout=cancel');
  });
});

describe('CTO-002 — POST /stripe/create-portal-session', () => {
  const portalDeps = (stripe, resolveCustomerId = async () => 'cus_serveur') => ({
    getStripe: () => stripe,
    resolveCustomerId,
    getReturnUrl: () => 'http://localhost:3000/account',
  });

  test('Stripe non configuré → 503 (plus de redirection mock vers /pricing)', async () => {
    const res = fakeRes();
    await makePortalHandler(portalDeps(null))(authedReq({ customer_id: 'cus_1' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ok: false, error: 'stripe_not_configured' });
    expect(res.body.mocked).toBeUndefined();
  });

  test('Stripe configuré → URL du portail Stripe', async () => {
    const create = jest.fn().mockResolvedValue({ url: 'https://billing.stripe.test/p_1' });
    const res = fakeRes();
    await makePortalHandler(portalDeps({ billingPortal: { sessions: { create } } }))(
      authedReq({ customer_id: 'cus_1' }), res,
    );

    expect(res.body).toEqual({ ok: true, url: 'https://billing.stripe.test/p_1' });
  });

  test('erreur API Stripe → 502', async () => {
    const create = jest.fn().mockRejectedValue(new Error('no such customer'));
    const res = fakeRes();
    await makePortalHandler(portalDeps({ billingPortal: { sessions: { create } } }))(
      authedReq({ customer_id: 'cus_x' }), res,
    );

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, error: 'portal_error' });
  });

  // ── A. IDOR: le customer_id du corps de requête n'a aucune autorité ──
  test("A1. l'utilisateur A poste le customer_id de B → portail ouvert sur le client de A", async () => {
    const create = jest.fn().mockResolvedValue({ url: 'https://billing.stripe.test/p_a' });
    const res = fakeRes();
    await makePortalHandler(portalDeps(
      { billingPortal: { sessions: { create } } },
      async (userId) => (userId === 'u-1' ? 'cus_de_A' : 'cus_de_B'),
    ))({ body: { customer_id: 'cus_de_B' }, authUser: { id: 'u-1' } }, res);

    expect(create.mock.calls[0][0].customer).toBe('cus_de_A');
    expect(res.body).toEqual({ ok: true, url: 'https://billing.stripe.test/p_a' });
  });

  test('A2. utilisateur avec client associé → son propre portail', async () => {
    const create = jest.fn().mockResolvedValue({ url: 'https://billing.stripe.test/p_ok' });
    const res = fakeRes();
    await makePortalHandler(portalDeps({ billingPortal: { sessions: { create } } }, async () => 'cus_moi'))(
      { body: {}, authUser: { id: 'u-1' } }, res,
    );

    expect(create.mock.calls[0][0].customer).toBe('cus_moi');
    expect(res.statusCode).toBe(200);
  });

  test('A3. aucun client Stripe associé → 404 et aucun appel Stripe', async () => {
    const create = jest.fn();
    const res = fakeRes();
    await makePortalHandler(portalDeps({ billingPortal: { sessions: { create } } }, async () => null))(
      { body: { customer_id: 'cus_de_B' }, authUser: { id: 'u-2' } }, res,
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'no_stripe_customer' });
    expect(create).not.toHaveBeenCalled();
  });

  test('A4. résolution impossible (base indisponible) → 502, aucun portail', async () => {
    const create = jest.fn();
    const res = fakeRes();
    await makePortalHandler(portalDeps({ billingPortal: { sessions: { create } } }, async () => { throw new Error('supabase_unavailable'); }))(
      { body: {}, authUser: { id: 'u-3' } }, res,
    );

    expect(res.statusCode).toBe(502);
    expect(create).not.toHaveBeenCalled();
  });

  test('A5. requête non authentifiée → 401', async () => {
    const create = jest.fn();
    const res = fakeRes();
    await makePortalHandler(portalDeps({ billingPortal: { sessions: { create } } }))({ body: { customer_id: 'cus_1' } }, res);

    expect(res.statusCode).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
});
