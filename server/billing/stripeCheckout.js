// ==========================================
// STRIPE CHECKOUT / PORTAL — handlers sécurisés (CTO-002)
// Aucun fallback mock : si Stripe n'est pas configuré ou échoue,
// la réponse est une erreur explicite et aucun succès n'est simulé.
// Revue CTO-002:
//   - le Price ID vient d'une liste blanche serveur (jamais du client);
//   - les URL de retour sont construites depuis FRONTEND_URL (même origine);
//   - le client Stripe du portail est résolu côté serveur depuis l'utilisateur
//     authentifié — un customer_id envoyé par le navigateur est ignoré.
// Les handlers sont construits par injection de dépendances afin
// d'être testables sans démarrer le serveur ni appeler Stripe.
// ==========================================

const noopLogger = { warn() {}, error() {}, info() {} };

/**
 * Tarifs publiés dans la grille commerciale (src/components/Billing/Pricing.js).
 * Ils sont listés ici pour que la liste blanche n'exige aucun changement de
 * configuration et ne modifie donc aucun tarif existant.
 */
const COMMERCIAL_PRICE_IDS = [
  'price_1SSXeAEvlCapRsCIR5SfojR0', // Solidaire
  'price_1SSTSmEvlCapRsCIuSRLV9Z5', // Individuel
  'price_1SSTX9EvlCapRsCIRaiZfsX9', // Famille
  'price_1SSTVGEvlCapRsCIsKgSzuBw', // Annuel
];

/** Liste blanche des Price ID réellement commercialisés (config serveur). */
function parsePriceWhitelist(env = process.env) {
  const raw = [env.STRIPE_PRICE_ID, env.STRIPE_PRICE_IDS]
    .filter(Boolean)
    .join(',');
  const fromEnv = raw.split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([...fromEnv, ...COMMERCIAL_PRICE_IDS]));
}

/**
 * URL de retour: seules les URL de même origine que FRONTEND_URL sont acceptées.
 * @returns {string|null} URL validée, ou null si l'URL client est étrangère.
 */
function sameOriginUrl(candidate, baseUrl) {
  if (!candidate) return null;
  try {
    const base = new URL(baseUrl);
    const url = new URL(String(candidate), base);
    return url.origin === base.origin ? url.toString() : null;
  } catch (e) {
    return null;
  }
}

/**
 * Handler POST /stripe/create-checkout-session.
 * @param {object} deps
 * @param {() => object|null} deps.getStripe        instance Stripe ou null
 * @param {() => string|null} deps.getDefaultPriceId
 * @param {() => string[]} [deps.getAllowedPriceIds] liste blanche serveur
 * @param {() => string} deps.getFrontendUrl
 * @param {object} [deps.logger]
 */
function makeCheckoutHandler({ getStripe, getDefaultPriceId, getAllowedPriceIds, getFrontendUrl, logger = noopLogger }) {
  return async function createCheckoutSession(req, res) {
    const stripe = getStripe();
    if (!stripe) {
      logger.error('[Stripe] create-checkout-session refusé: SDK/clé absente');
      return res.status(503).json({ ok: false, error: 'stripe_not_configured' });
    }

    const allowed = (typeof getAllowedPriceIds === 'function' ? getAllowedPriceIds() : null) || parsePriceWhitelist();
    const requested = req.body?.price_id ? String(req.body.price_id) : null;
    // Un price_id client n'est accepté que s'il figure dans la liste blanche;
    // sinon la seule valeur possible est le tarif serveur par défaut.
    if (requested && !allowed.includes(requested)) {
      logger.error('[Stripe] create-checkout-session refusé: price_id hors liste blanche');
      return res.status(400).json({ ok: false, error: 'price_not_allowed' });
    }
    const priceId = requested || getDefaultPriceId();
    if (!priceId) {
      logger.error('[Stripe] create-checkout-session refusé: price_id absent');
      return res.status(503).json({ ok: false, error: 'stripe_price_not_configured' });
    }

    // L'identité provient exclusivement du jeton vérifié par requireAuth.
    // Un user_id envoyé par le client ne doit jamais décider à qui l'abonnement est attribué.
    const userId = req.authUser?.id ? String(req.authUser.id) : null;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });

    const base = getFrontendUrl();
    // Les URL client ne sont retenues que si elles pointent vers la même origine.
    const success_url = sameOriginUrl(req.body?.success_url, base) || base + '/account?checkout=success';
    const cancel_url = sameOriginUrl(req.body?.cancel_url, base) || base + '/pricing?checkout=cancel';

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
 * @param {object} deps
 * @param {() => object|null} deps.getStripe
 * @param {(userId: string) => Promise<string|null>} deps.resolveCustomerId
 *        association serveur utilisateur → client Stripe
 * @param {() => string} deps.getReturnUrl
 * @param {object} [deps.logger]
 */
function makePortalHandler({ getStripe, resolveCustomerId, getReturnUrl, logger = noopLogger }) {
  return async function createPortalSession(req, res) {
    const stripe = getStripe();
    if (!stripe) {
      logger.error('[Stripe] create-portal-session refusé: SDK/clé absente');
      return res.status(503).json({ ok: false, error: 'stripe_not_configured' });
    }

    const userId = req.authUser?.id ? String(req.authUser.id) : null;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthenticated' });

    // IDOR: le customer_id éventuellement posté par le navigateur est ignoré.
    let customerId = null;
    try {
      customerId = await resolveCustomerId(userId);
    } catch (e) {
      logger.error(`[Stripe] create-portal-session: résolution client échouée: ${e.message}`);
      return res.status(502).json({ ok: false, error: 'customer_lookup_failed' });
    }
    if (!customerId) {
      logger.warn('[Stripe] create-portal-session refusé: aucun client Stripe associé');
      return res.status(404).json({ ok: false, error: 'no_stripe_customer' });
    }

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

module.exports = { makeCheckoutHandler, makePortalHandler, parsePriceWhitelist, sameOriginUrl, COMMERCIAL_PRICE_IDS };
