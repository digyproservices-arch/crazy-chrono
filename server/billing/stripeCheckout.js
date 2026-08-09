// ==========================================
// STRIPE CHECKOUT / PORTAL — handlers sécurisés (CTO-002)
// Aucun fallback mock : si Stripe n'est pas configuré ou échoue,
// la réponse est une erreur explicite et aucun succès n'est simulé.
// Les handlers sont construits par injection de dépendances afin
// d'être testables sans démarrer le serveur ni appeler Stripe.
// ==========================================

const noopLogger = { warn() {}, error() {}, info() {} };

/**
 * Handler POST /stripe/create-checkout-session.
 * @param {object} deps
 * @param {() => object|null} deps.getStripe        instance Stripe ou null
 * @param {() => string|null} deps.getDefaultPriceId
 * @param {() => string} deps.getFrontendUrl
 * @param {object} [deps.logger]
 */
function makeCheckoutHandler({ getStripe, getDefaultPriceId, getFrontendUrl, logger = noopLogger }) {
  return async function createCheckoutSession(req, res) {
    const stripe = getStripe();
    if (!stripe) {
      logger.error('[Stripe] create-checkout-session refusé: SDK/clé absente');
      return res.status(503).json({ ok: false, error: 'stripe_not_configured' });
    }
    const priceId = req.body?.price_id || getDefaultPriceId();
    if (!priceId) {
      logger.error('[Stripe] create-checkout-session refusé: price_id absent');
      return res.status(503).json({ ok: false, error: 'stripe_price_not_configured' });
    }

    // L'identité provient exclusivement du jeton vérifié par requireAuth.
    // Un user_id envoyé par le client ne doit jamais décider à qui l'abonnement est attribué.
    const userId = req.authUser?.id ? String(req.authUser.id) : null;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });

    const base = getFrontendUrl();
    const success_url = req.body?.success_url || base + '/account?checkout=success';
    const cancel_url = req.body?.cancel_url || base + '/pricing?checkout=cancel';

    let session = null;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url,
        cancel_url,
        allow_promotion_codes: true,
        metadata: { user_id: userId },
      });
    } catch (e) {
      logger.error(`[Stripe] create-checkout-session error: ${e.message}`);
      return res.status(502).json({ ok: false, error: 'checkout_error' });
    }
    if (!session?.url) {
      logger.error('[Stripe] create-checkout-session: session sans URL');
      return res.status(502).json({ ok: false, error: 'checkout_session_invalid' });
    }
    return res.json({ ok: true, url: session.url });
  };
}

/**
 * Handler POST /stripe/create-portal-session.
 */
function makePortalHandler({ getStripe, getReturnUrl, logger = noopLogger }) {
  return async function createPortalSession(req, res) {
    const stripe = getStripe();
    if (!stripe) {
      logger.error('[Stripe] create-portal-session refusé: SDK/clé absente');
      return res.status(503).json({ ok: false, error: 'stripe_not_configured' });
    }
    const customerId = req.body?.customer_id;
    if (!customerId) return res.status(400).json({ ok: false, error: 'missing_customer_id' });
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: getReturnUrl(),
      });
      if (!session?.url) return res.status(502).json({ ok: false, error: 'portal_session_invalid' });
      return res.json({ ok: true, url: session.url });
    } catch (e) {
      logger.error(`[Stripe] create-portal-session error: ${e.message}`);
      return res.status(502).json({ ok: false, error: 'portal_error' });
    }
  };
}

module.exports = { makeCheckoutHandler, makePortalHandler };
