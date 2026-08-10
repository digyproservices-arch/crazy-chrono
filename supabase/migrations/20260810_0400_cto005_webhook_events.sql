-- ==========================================================================
-- CTO-005A — 0400 — P0-5 : webhook_events versionnée et fermée
--
-- La table n'existait dans AUCUN fichier SQL du dépôt alors que
-- server/server.js s'en sert comme magasin d'idempotence RevenueCat
-- (lecture par event_id, insertion après succès métier — CTO-003).
--
-- Schéma déduit du code : seule la colonne `event_id` est écrite et lue.
-- `provider` est ajoutée pour la traçabilité et pour préparer une éventuelle
-- migration de l'idempotence Stripe (aujourd'hui sur fichier :
-- server/billing/stripeEventStore.js) vers cette table. Tant que Stripe
-- n'utilise pas la table, la clé d'idempotence reste `event_id` seul, ce qui
-- correspond exactement à la requête du serveur.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'revenuecat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'revenuecat';
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.webhook_events ALTER COLUMN event_id SET NOT NULL;

-- Idempotence : un même event_id ne peut pas être marqué deux fois.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.webhook_events'::regclass AND conname = 'webhook_events_event_id_key'
  ) THEN
    ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_event_id_key UNIQUE (event_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events (created_at DESC);

-- Table strictement serveur : RLS activée, AUCUNE policy, aucun privilège client.
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_events FROM anon;
REVOKE ALL ON public.webhook_events FROM authenticated;

COMMENT ON TABLE public.webhook_events IS
  'CTO-005A : magasin d''idempotence des webhooks (RevenueCat). Présence d''un event_id = effet métier abouti. Service role uniquement.';
