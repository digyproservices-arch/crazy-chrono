-- ==========================================================================
-- CTO-005A — 0900 — P1-4 : user_devices / auth_audit_log / content_store
--                          + active_sessions / gift_codes / image_usage_logs
--
-- Les policies nommées `service_role_full_access*` du dépôt sont en réalité
-- `FOR ALL USING (true) WITH CHECK (true)` **sans clause TO** : elles
-- s'appliquent à `public`, donc à anon et authenticated. Le nom est trompeur ;
-- elles n'isolent rien. Le service role contourne la RLS de toute façon :
-- la bonne configuration est « RLS activée + aucune policy publique ».
--
-- auth_audit_log contient e-mails et adresses IP → aucun accès client.
-- ==========================================================================

DO $$
DECLARE
  t TEXT;
  p TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_devices', 'auth_audit_log', 'content_store', 'active_sessions',
    'gift_codes', 'image_usage_logs'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      -- Supprime toute policy réellement permissive (USING (true) sans TO ciblé).
      FOR p IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
          AND (
            policyname ILIKE '%service_role_full_access%'
            OR (COALESCE(qual, 'true') = 'true' AND 'public' = ANY(roles))
          )
      LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', p, t);
      END LOOP;

      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

-- active_sessions : la lecture de ses propres sessions reste utile côté client.
DO $$
BEGIN
  IF to_regclass('public.active_sessions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS active_sessions_select_own ON public.active_sessions';
    EXECUTE $p$CREATE POLICY active_sessions_select_own ON public.active_sessions
                 FOR SELECT TO authenticated USING (user_id = auth.uid())$p$;
    EXECUTE 'GRANT SELECT ON public.active_sessions TO authenticated';
  END IF;
END $$;

-- user_devices : lecture de ses propres appareils (écran « mes appareils »).
DO $$
BEGIN
  IF to_regclass('public.user_devices') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS user_devices_select_own ON public.user_devices';
    EXECUTE $p$CREATE POLICY user_devices_select_own ON public.user_devices
                 FOR SELECT TO authenticated USING (user_id = auth.uid())$p$;
    EXECUTE 'GRANT SELECT ON public.user_devices TO authenticated';
  END IF;
END $$;
