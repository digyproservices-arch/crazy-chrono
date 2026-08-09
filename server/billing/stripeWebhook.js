// ==========================================
// WEBHOOK STRIPE — vérification obligatoire (CTO-002)
// Aucun événement n'est traité avant vérification de la signature.
// Aucun événement de substitution n'est fabriqué.
// Idempotence: un même event.id n'est traité qu'une seule fois.
// ==========================================

const noopLogger = { warn() {}, error() {}, info() {} };

/**
 * Handler POST /webhooks/stripe (body brut requis).
 * @param {object} deps
 * @param {() => object|null} deps.getStripe
 * @param {() => string|null} deps.getWebhookSecret
 * @param {(event: object) => Promise<void>} deps.processEvent
 * @param {{ reserve(id): boolean, release(id): void }} deps.eventStore
 * @param {object} [deps.logger]
 */
function makeWebhookHandler({ getStripe, getWebhookSecret, processEvent, eventStore, logger = noopLogger }) {
  return async function stripeWebhook(req, res) {
    const stripe = getStripe();
    if (!stripe) {
      logger.error('[Stripe][WH] refusé: SDK/clé absente');
      return res.status(503).json({ ok: false, error: 'stripe_not_configured' });
    }
    const secret = getWebhookSecret();
    if (!secret) {
      logger.error('[Stripe][WH] refusé: STRIPE_WEBHOOK_SECRET absent');
      return res.status(503).json({ ok: false, error: 'webhook_secret_not_configured' });
    }
    const signature = req.headers?.['stripe-signature'];
    if (!signature) {
      logger.warn('[Stripe][WH] refusé: signature absente');
      return res.status(400).json({ ok: false, error: 'missing_signature' });
    }
    if (!(typeof req.body === 'string' || Buffer.isBuffer(req.body))) {
      logger.error('[Stripe][WH] refusé: body brut indisponible');
      return res.status(400).json({ ok: false, error: 'invalid_payload' });
    }

    let event = null;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, secret);
    } catch (err) {
      logger.warn(`[Stripe][WH] signature invalide: ${err.message}`);
      return res.status(400).json({ ok: false, error: 'invalid_signature' });
    }
    if (!event || !event.id || !event.type) {
      logger.warn('[Stripe][WH] événement vérifié mais incomplet');
      return res.status(400).json({ ok: false, error: 'invalid_event' });
    }

    // Idempotence: réservation avant traitement (les retries Stripe rejouent le même id)
    if (!eventStore.reserve(event.id)) {
      logger.info(`[Stripe][WH] doublon ignoré: ${event.id}`);
      return res.json({ received: true, duplicate: true });
    }

    try {
      await processEvent(event);
    } catch (e) {
      // Libère la réservation pour permettre un retry Stripe.
      eventStore.release(event.id);
      logger.error(`[Stripe][WH] traitement échoué (${event.type}): ${e.message}`);
      return res.status(500).json({ ok: false, error: 'processing_error' });
    }
    return res.json({ received: true });
  };
}

module.exports = { makeWebhookHandler };
