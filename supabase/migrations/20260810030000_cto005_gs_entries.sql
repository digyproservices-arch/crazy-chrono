-- ==========================================================================
-- CTO-005A — 0300 — P0-2 : gs_tournament_entries / preuve de paiement forgeable
--
-- Avant : `gs_entries_insert_all FOR INSERT WITH CHECK (true)` (sans clause TO,
-- donc applicable à anon). Le serveur lit ensuite `paid` comme preuve de
-- paiement (server/server.js → gsHasPaidEntry) : n'importe qui pouvait
-- s'inscrire `paid = true` et rejoindre un tournoi payant.
--
-- Après : l'inscription publique reste possible mais **jamais** avec des
-- colonnes financières. Celles-ci ne sont écrites que par le backend
-- (service role), après validation Stripe / RevenueCat.
-- ==========================================================================

ALTER TABLE public.gs_tournament_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gs_entries_insert_all"    ON public.gs_tournament_entries;
DROP POLICY IF EXISTS gs_entries_insert_free     ON public.gs_tournament_entries;
DROP POLICY IF EXISTS gs_entries_select_own      ON public.gs_tournament_entries;

-- La comparaison d'identité est construite d'après le type réel de
-- `user_id` (UUID en production, TEXT dans certains schémas historiques) :
-- aucune donnée n'est convertie, seul auth.uid() est casté.
DO $$
DECLARE
  v_uid TEXT;
BEGIN
  SELECT CASE WHEN a.atttypid = 'uuid'::regtype THEN 'auth.uid()' ELSE 'auth.uid()::text' END
    INTO v_uid
    FROM pg_attribute a
   WHERE a.attrelid = 'public.gs_tournament_entries'::regclass
     AND a.attname = 'user_id'
     AND NOT a.attisdropped;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CTO-005A: public.gs_tournament_entries.user_id introuvable — schéma inattendu.';
  END IF;

  -- Inscription gratuite : aucune colonne financière ne peut être positionnée.
  -- (Défense en profondeur : les GRANT colonne ci-dessous empêchent déjà de les
  --  nommer ; la policy verrouille aussi les valeurs par défaut.)
  EXECUTE format(
    'CREATE POLICY gs_entries_insert_free ON public.gs_tournament_entries
       FOR INSERT TO anon, authenticated
       WITH CHECK (
         COALESCE(paid, false) = false
         AND COALESCE(is_subscriber, false) = false
         AND payment_id IS NULL
         AND (user_id IS NULL OR user_id = %s)
       )', v_uid);

  -- Lecture : l'inscrit voit sa propre inscription, l'admin voit tout
  -- (policy gs_entries_select_admin conservée telle quelle).
  EXECUTE format(
    'CREATE POLICY gs_entries_select_own ON public.gs_tournament_entries
       FOR SELECT TO authenticated
       USING (user_id IS NOT NULL AND user_id = %s)', v_uid);
END $$;

REVOKE ALL ON public.gs_tournament_entries FROM anon;
REVOKE ALL ON public.gs_tournament_entries FROM authenticated;

GRANT SELECT ON public.gs_tournament_entries TO authenticated;
GRANT INSERT (tournament_id, first_name, last_name, email, user_id)
  ON public.gs_tournament_entries TO anon, authenticated;

-- Aucun UPDATE / DELETE client : la confirmation de paiement et la purge
-- passent exclusivement par le backend.

COMMENT ON COLUMN public.gs_tournament_entries.paid IS
  'CTO-005A : écrit uniquement par le service role après validation Stripe/RevenueCat. Jamais accordé en INSERT/UPDATE à anon ni authenticated.';
