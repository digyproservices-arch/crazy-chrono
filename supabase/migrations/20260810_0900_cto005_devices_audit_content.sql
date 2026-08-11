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

-- active_sessions / user_devices : lecture de ses propres lignes uniquement
-- (écran « mes appareils »). La comparaison suit le type réel de `user_id`.
DO $$
DECLARE
  t     TEXT;
  v_uid TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['active_sessions', 'user_devices'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT CASE WHEN a.atttypid = 'uuid'::regtype THEN 'auth.uid()' ELSE 'auth.uid()::text' END
      INTO v_uid
      FROM pg_attribute a
     WHERE a.attrelid = ('public.' || t)::regclass
       AND a.attname = 'user_id'
       AND NOT a.attisdropped;

    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'CTO-005A: public.%.user_id introuvable — schéma inattendu.', t;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = %s)',
      t || '_select_own', t, v_uid);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;
