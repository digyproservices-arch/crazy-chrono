// =============================================
// CTO-002 — Checkout / Portail Stripe
// Aucun secret réel, aucun appel réseau: Stripe est un stub local.
// =============================================

const { makeCheckoutHandler, makePortalHandler } = require('../billing/stripeCheckout');

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const deps = (stripe, priceId = 'price_test_123') => ({
  getStripe: () => stripe,
  getDefaultPriceId: () => priceId,
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

describe('CTO-002 — POST /stripe/create-portal-session', () => {
  const portalDeps = (stripe) => ({ getStripe: () => stripe, getReturnUrl: () => 'http://localhost:3000/account' });

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
});
