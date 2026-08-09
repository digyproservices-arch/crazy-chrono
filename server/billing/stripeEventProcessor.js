// ==========================================
// TRAITEMENT DES ÉVÉNEMENTS STRIPE (CTO-002 — revue)
// Extrait de server.js pour être testable sans démarrer le serveur.
//
// Règle centrale: une écriture Supabase ratée n'est jamais un succès. Elle
// remonte en exception → le webhook répond 500, libère la réservation
// d'idempotence, et Stripe rejoue l'événement.
// ==========================================

const noopLogger = { warn() {}, error() {}, info() {} };

/** Événements dont l'écriture en base conditionne un droit payant. */
const STRIPE_CRITICAL_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

function throwOnSupabaseError(error, step) {
  if (error) throw new Error(`supabase_write_failed:${step}:${error.message || error.code || 'unknown'}`);
}

/**
 * @param {object} deps
 * @param {() => object|null} deps.getSupabaseAdmin
 * @param {() => object|null} deps.getStripe
 * @param {(userId: string) => void} [deps.invalidateSubCache]
 * @param {(event: object) => void} [deps.logPaymentEvent]
 * @param {object} [deps.logger]
 */
function makeStripeEventProcessor({ getSupabaseAdmin, getStripe, invalidateSubCache, logPaymentEvent, logger = noopLogger }) {
  return async function processStripeEvent(event) {
    const supabaseAdmin = getSupabaseAdmin();
    const stripe = getStripe();

    // Sans Supabase, un événement financier ne peut pas être enregistré:
    // on échoue (500) pour que Stripe rejoue plutôt que de perdre le droit payé.
    if (!supabaseAdmin && event?.type && STRIPE_CRITICAL_EVENTS.has(event.type)) {
      throw new Error('supabase_unavailable');
    }

    if (supabaseAdmin && event && event.type) {
      if (event.type === 'checkout.session.completed') {
        const s = event.data.object;

        // === Paiement tournoi Grande Salle ===
        if (s?.metadata?.type === 'tournament_entry') {
          const tId = s.metadata.tournament_id;
          const tEmail = s.metadata.email;
          if (tId && tEmail) {
            const { error: entryErr } = await supabaseAdmin.from('gs_tournament_entries').upsert({
              tournament_id: tId,
              email: tEmail,
              first_name: s.metadata.first_name || '',
              last_name: s.metadata.last_name || '',
              paid: true,
              payment_id: s.payment_intent || s.id,
              joined_at: new Date().toISOString(),
            }, { onConflict: 'tournament_id,email' });
            throwOnSupabaseError(entryErr, 'gs_tournament_entries.upsert');
            logger.info(`[Stripe] Entrée tournoi payée: ${tEmail} / ${tId}`);
          }
        }

        // === Abonnement ===
        const userId = s?.metadata?.user_id || null;
        const subscriptionId = s?.subscription || null;
        if (userId && subscriptionId) {
          if (!stripe) throw new Error('stripe_unavailable');
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const payload = {
            user_id: userId,
            stripe_subscription_id: sub.id,
            price_id: sub.items?.data?.[0]?.price?.id || null,
            status: sub.status,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          };
          const { error: upsertErr } = await supabaseAdmin.from('subscriptions').upsert(payload, { onConflict: 'stripe_subscription_id' });
          throwOnSupabaseError(upsertErr, 'subscriptions.upsert');
          if (invalidateSubCache) invalidateSubCache(userId);
        }
      }

      if (event.type.startsWith('customer.subscription.')) {
        const sub = event.data.object;
        if (sub?.id) {
          const payload = {
            stripe_subscription_id: sub.id,
            price_id: sub.items?.data?.[0]?.price?.id || null,
            status: sub.status,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          };
          const { error: updateErr } = await supabaseAdmin.from('subscriptions').update(payload).eq('stripe_subscription_id', sub.id);
          throwOnSupabaseError(updateErr, 'subscriptions.update');

          const { data: subRow, error: lookupErr } = await supabaseAdmin
            .from('subscriptions')
            .select('user_id')
            .eq('stripe_subscription_id', sub.id)
            .maybeSingle();
          throwOnSupabaseError(lookupErr, 'subscriptions.select');
          if (subRow?.user_id) {
            if (invalidateSubCache) invalidateSubCache(subRow.user_id);
            logger.info(`[Stripe][Sub] Cache invalidé pour user ${subRow.user_id} (status: ${sub.status})`);
          }
        }
      }
    }

    // Journal monitoring: best effort, ne doit jamais faire échouer un paiement traité.
    if (logPaymentEvent) {
      try { logPaymentEvent(event); } catch (e) { logger.warn(`[Stripe] journal paiement échoué: ${e.message}`); }
    }
  };
}

module.exports = { makeStripeEventProcessor, STRIPE_CRITICAL_EVENTS, throwOnSupabaseError };
