-- ==========================================================================
-- CTO-005A — 0500 — P1-2 : subscriptions.user_id doit être UNIQUE
--
-- Le serveur écrit `.upsert(row, { onConflict: 'user_id' })` (Stripe et
-- RevenueCat) alors que scripts/supabase_subscriptions.sql ne crée qu'un index
-- NON unique. Sans contrainte, PostgreSQL renvoie 42P10 et, depuis le
-- fail-closed CTO-002/003, le webhook boucle en 500 : aucun abonnement n'est
-- jamais persisté.
--
-- SÉCURITÉ D'APPLICATION : cette migration ne déduplique RIEN. Si des doublons
-- existent, elle échoue volontairement avec un message explicite. La
-- déduplication doit alors être décidée et exécutée manuellement
-- (cf. docs/CTO_005A_RLS_MATRIX.md § « Backfills et opérations manuelles »).
-- ==========================================================================

DO $$
DECLARE
  v_dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dupes FROM (
    SELECT user_id FROM public.subscriptions GROUP BY user_id HAVING COUNT(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'CTO-005A: % user_id dupliqué(s) dans subscriptions. Déduplication manuelle requise AVANT cette migration (aucune donnée n''est supprimée automatiquement).',
      v_dupes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass AND conname = 'subscriptions_user_id_key'
  ) THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Table financière : lecture de son propre abonnement uniquement, aucune écriture client.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_read_own" ON public.subscriptions;
CREATE POLICY subscriptions_read_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.subscriptions FROM anon;
REVOKE ALL ON public.subscriptions FROM authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
