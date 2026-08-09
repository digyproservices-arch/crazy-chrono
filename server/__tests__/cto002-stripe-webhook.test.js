// =============================================
// CTO-002 — Webhook Stripe: signature obligatoire + idempotence
// Aucun secret réel: le stub Stripe simule constructEvent().
// =============================================

const os = require('os');
const path = require('path');
const fs = require('fs');
const { makeWebhookHandler } = require('../billing/stripeWebhook');
const { createStripeEventStore } = require('../billing/stripeEventStore');

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

// Stub Stripe: n'accepte qu'une signature connue, refuse tout le reste.
function stubStripe(event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } }) {
  return {
    webhooks: {
      constructEvent: jest.fn((body, signature, secret) => {
        if (signature !== VALID_SIGNATURE || secret !== FAKE_SECRET) {
          throw new Error('No signatures found matching the expected signature for payload');
        }
        return event;
      }),
    },
  };
}

function build({ stripe, secret = FAKE_SECRET, processEvent = jest.fn().mockResolvedValue(undefined), store }) {
  const eventStore = store || createStripeEventStore({ persist: false });
  const handler = makeWebhookHandler({
    getStripe: () => stripe,
    getWebhookSecret: () => secret,
    processEvent,
    eventStore,
  });
  return { handler, processEvent, eventStore };
}

const rawReq = (signature) => ({
  headers: signature ? { 'stripe-signature': signature } : {},
  body: Buffer.from(JSON.stringify({ id: 'evt_1' })),
});

describe('CTO-002 — POST /webhooks/stripe', () => {
  test('H. signature absente → 400, aucun événement traité', async () => {
    const stripe = stubStripe();
    const { handler, processEvent } = build({ stripe });
    const res = fakeRes();
    await handler(rawReq(null), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ ok: false, error: 'missing_signature' });
    expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();
    expect(processEvent).not.toHaveBeenCalled();
  });

  test('signature invalide → 400, aucun événement traité', async () => {
    const { handler, processEvent } = build({ stripe: stubStripe() });
    const res = fakeRes();
    await handler(rawReq('sig_forged'), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ ok: false, error: 'invalid_signature' });
    expect(processEvent).not.toHaveBeenCalled();
  });

  test('secret manquant → refus 503, aucune vérification ni traitement', async () => {
    const stripe = stubStripe();
    const { handler, processEvent } = build({ stripe, secret: null });
    const res = fakeRes();
    await handler(rawReq(VALID_SIGNATURE), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ok: false, error: 'webhook_secret_not_configured' });
    expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();
    expect(processEvent).not.toHaveBeenCalled();
  });

  test('SDK/clé Stripe absente → refus 503, aucun événement fabriqué', async () => {
    const { handler, processEvent } = build({ stripe: null });
    const res = fakeRes();
    await handler(rawReq(VALID_SIGNATURE), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ok: false, error: 'stripe_not_configured' });
    expect(processEvent).not.toHaveBeenCalled();
  });

  test('body non brut (déjà parsé) → 400', async () => {
    const { handler, processEvent } = build({ stripe: stubStripe() });
    const res = fakeRes();
    await handler({ headers: { 'stripe-signature': VALID_SIGNATURE }, body: { id: 'evt_1' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ ok: false, error: 'invalid_payload' });
    expect(processEvent).not.toHaveBeenCalled();
  });

  test('I. événement valide → traité une seule fois', async () => {
    const { handler, processEvent } = build({ stripe: stubStripe() });
    const res = fakeRes();
    await handler(rawReq(VALID_SIGNATURE), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(processEvent.mock.calls[0][0].id).toBe('evt_1');
  });

  test('même event.id reçu deux fois → aucun double traitement', async () => {
    const { handler, processEvent } = build({ stripe: stubStripe() });
    const res1 = fakeRes();
    const res2 = fakeRes();
    await handler(rawReq(VALID_SIGNATURE), res1);
    await handler(rawReq(VALID_SIGNATURE), res2);

    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(res2.statusCode).toBe(200);
    expect(res2.body).toEqual({ received: true, duplicate: true });
  });

  test('échec de traitement → 500 et retry Stripe possible (réservation libérée)', async () => {
    const processEvent = jest.fn()
      .mockRejectedValueOnce(new Error('supabase down'))
      .mockResolvedValueOnce(undefined);
    const { handler } = build({ stripe: stubStripe(), processEvent });

    const res1 = fakeRes();
    await handler(rawReq(VALID_SIGNATURE), res1);
    expect(res1.statusCode).toBe(500);
    expect(res1.body).toEqual({ ok: false, error: 'processing_error' });

    const res2 = fakeRes();
    await handler(rawReq(VALID_SIGNATURE), res2);
    expect(res2.body).toEqual({ received: true });
    expect(processEvent).toHaveBeenCalledTimes(2);
  });
});

describe('CTO-002 — persistance de l’idempotence', () => {
  const file = path.join(os.tmpdir(), `cc-stripe-events-${process.pid}.json`);
  afterEach(() => { try { fs.unlinkSync(file); } catch {} });

  test('les event.id survivent à un redémarrage du process', async () => {
    const first = createStripeEventStore({ filePath: file });
    expect(first.reserve('evt_persist')).toBe(true);

    const afterRestart = createStripeEventStore({ filePath: file });
    expect(afterRestart.reserve('evt_persist')).toBe(false);
  });
});
