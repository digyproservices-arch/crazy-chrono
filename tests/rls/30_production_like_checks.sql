-- ==========================================================================
-- CTO-005A — Contrôles propres au schéma PRODUCTION-COMPATIBILITY.
--
-- Joué après 03_production_like.sql + toutes les migrations 0100→1300.
-- Couvre : subscriptions.user_id TEXT, webhook_events préexistante,
-- assertion « zéro SECURITY DEFINER exposée au client ».
-- ==========================================================================

\set ON_ERROR_STOP on

\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''

-- ── 0. Le type production n'a pas été converti par la migration -------------
SELECT t_assert(
  (SELECT format_type(a.atttypid, NULL) FROM pg_attribute a
    WHERE a.attrelid = 'public.subscriptions'::regclass AND a.attname = 'user_id') = 'text',
  'PROD-1.0 subscriptions.user_id reste TEXT (aucune conversion de données)');

-- ── 1. UNIQUE(user_id) posée sur la colonne TEXT ----------------------------
SELECT t_assert(EXISTS (
  SELECT 1 FROM pg_constraint
   WHERE conrelid = 'public.subscriptions'::regclass
     AND contype = 'u'
     AND (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute
           WHERE attrelid = conrelid AND attnum = ANY (conkey)) = ARRAY['user_id']
), 'PROD-1.1 UNIQUE(subscriptions.user_id) présente après 0500');

-- ── 2/3. Isolation par utilisateur ------------------------------------------
SELECT t_login(:B::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM subscriptions') = 1,
  'PROD-1.2 USER B lit son propre abonnement malgré la colonne TEXT');

SELECT t_login(:A::uuid);
-- USER A peut avoir sa propre ligne (créée en service role par 10_attacks) :
-- ce qui est vérifié ici, c'est qu'il ne voit QUE la sienne.
SELECT t_assert(t_rows(format('SELECT 1 FROM subscriptions WHERE user_id <> %L', :A)) = 0,
  'PROD-1.3 USER A ne lit pas l''abonnement de USER B');
SELECT t_assert(t_denied(format(
  'INSERT INTO subscriptions (user_id, status) VALUES (%L, ''active'')', :A)),
  'PROD-1.4 USER A ne peut pas se créer un abonnement');
SELECT t_logout();

-- ── 4. anon ne lit rien -----------------------------------------------------
SELECT t_login(NULL, 'anon');
SELECT t_assert(t_rows('SELECT 1 FROM subscriptions') <= 0,
  'PROD-1.5 anon ne lit aucun abonnement');
SELECT t_logout();

-- ── 5/6. service_role : lecture, écriture et upsert onConflict user_id ------
SET ROLE service_role;
SELECT t_assert((SELECT count(*) FROM subscriptions) >= 1,
  'PROD-1.6 service_role lit les abonnements');

INSERT INTO subscriptions (user_id, status, price_id)
VALUES ('00000000-0000-0000-0000-00000000000b', 'active', 'price_v2')
ON CONFLICT (user_id) DO UPDATE
  SET status = EXCLUDED.status, price_id = EXCLUDED.price_id, updated_at = now();

SELECT t_assert(
  (SELECT count(*) FROM subscriptions WHERE user_id = '00000000-0000-0000-0000-00000000000b') = 1
  AND (SELECT price_id FROM subscriptions WHERE user_id = '00000000-0000-0000-0000-00000000000b') = 'price_v2',
  'PROD-1.7 upsert onConflict user_id fonctionne après UNIQUE (une seule ligne, mise à jour)');
RESET ROLE;

-- ── 7. webhook_events préexistante : additif, sans perte --------------------
SELECT t_assert(EXISTS (
  SELECT 1 FROM pg_attribute
   WHERE attrelid = 'public.webhook_events'::regclass
     AND attname = 'received_at' AND NOT attisdropped),
  'PROD-2.1 webhook_events.received_at conservée (aucun DROP)');

SELECT t_assert(
  (SELECT count(*) FROM public.webhook_events
    WHERE event_id IN ('evt_legacy_1','evt_legacy_2')) = 2,
  'PROD-2.2 aucune perte de données dans webhook_events (lignes historiques intactes)');

SELECT t_assert(
  (SELECT received_at FROM public.webhook_events WHERE event_id = 'evt_legacy_1')
    = '2026-01-01T00:00:00Z'::timestamptz,
  'PROD-2.3 valeurs received_at historiques intactes');

SELECT t_assert(
  (SELECT count(*) FROM pg_attribute
    WHERE attrelid = 'public.webhook_events'::regclass
      AND attname IN ('provider','created_at') AND NOT attisdropped) = 2,
  'PROD-2.4 provider/created_at ajoutées par 0400');

SELECT t_login(NULL, 'anon');
SELECT t_assert(t_rows('SELECT 1 FROM webhook_events') <= 0,
  'PROD-2.5 anon ne lit plus webhook_events');
SELECT t_logout();

SELECT t_login(:A::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM webhook_events') <= 0,
  'PROD-2.6 authenticated ne lit plus webhook_events');
SELECT t_assert(t_denied(
  'INSERT INTO webhook_events (event_id) VALUES (''evt_forged'')'),
  'PROD-2.7 authenticated ne peut pas forger une preuve d''idempotence');
SELECT t_logout();

-- ── 8. Assertion fail-closed : aucune SECURITY DEFINER exposée au client ----
--     Même contrôle que la migration 1300, rejoué côté test pour qu'une
--     régression future soit détectée même si la migration a déjà été appliquée.
DO $$
DECLARE
  r RECORD;
  v_bad TEXT[] := '{}';
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ok,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
           EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_ok
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    -- Allowlist par SIGNATURE EXACTE, identique à la migration 1300 : un nom en
    -- `cc_*` ne suffit pas, une surcharge inattendue n'est pas allowlistée.
    IF r.sig = ANY(ARRAY[
      'public.cc_current_role()','public.cc_is_admin()','public.cc_is_manager()',
      'public.cc_current_email()','public.cc_my_circonscription()','public.cc_my_region()',
      'public.cc_my_student_ids()','public.cc_my_class_ids()','public.cc_managed_class_ids()',
      'public.cc_visible_class_ids()','public.cc_visible_school_ids()']) THEN
      IF r.anon_ok OR r.public_ok THEN v_bad := v_bad || (r.sig || ' [helper exposé à anon/PUBLIC]'); END IF;
      CONTINUE;
    END IF;
    IF r.anon_ok OR r.auth_ok OR r.public_ok THEN v_bad := v_bad || r.sig; END IF;
  END LOOP;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'FAIL PROD-3.1 SECURITY DEFINER encore exposée(s) : %', array_to_string(v_bad, ', ');
  END IF;
  RAISE NOTICE 'NOTICE:  PASS PROD-3.1 aucune SECURITY DEFINER du schéma public exécutable par PUBLIC/anon/authenticated';
END $$;

-- ── 9. ensure_profile : versionnée par 1400, fermée aux rôles clients --------
-- Arbitrage CTO après lecture de la définition production
-- (docs/CTO_005_ENSURE_PROFILE_PRECHECK.sql) : la fonction est vivante — c'est
-- elle qui crée le profil de tout nouveau compte via le trigger
-- `on_auth_user_created` — donc versionnée et durcie, pas supprimée.
SELECT t_assert(
  NOT has_function_privilege('anon', 'public.ensure_profile()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.ensure_profile()', 'EXECUTE'),
  'PROD-3.2 ensure_profile() fermée à anon/authenticated (aucun appel RPC client)');

SELECT t_assert(
  (SELECT 'search_path=pg_catalog, public, pg_temp' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_profile'),
  'PROD-3.3 ensure_profile() : search_path figé par 1400 (pg_temp en dernier)');

-- Le comportement métier doit être IDENTIQUE à celui lu en production : mêmes
-- insert / on conflict / return, même type de retour, toujours SECURITY DEFINER.
SELECT t_assert(
  (SELECT p.prosecdef
      AND pg_get_function_result(p.oid) = 'trigger'
      AND pg_get_functiondef(p.oid) ILIKE '%insert into public.user_profiles (id, email)%'
      AND pg_get_functiondef(p.oid) ILIKE '%on conflict (id) do nothing%'
      AND pg_get_functiondef(p.oid) ILIKE '%return new%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_profile'),
  'PROD-3.4 ensure_profile() : corps métier production préservé à l''identique');

SELECT t_assert(
  (SELECT count(*) FROM pg_trigger t
     JOIN pg_proc p ON p.oid = t.tgfoid
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public' AND p.proname = 'ensure_profile'
      AND t.tgrelid = 'auth.users'::regclass AND t.tgenabled <> 'D') = 1
  AND (SELECT t.tgname FROM pg_trigger t
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND p.proname = 'ensure_profile'
          AND t.tgrelid = 'auth.users'::regclass) = 'on_auth_user_created',
  'PROD-3.5 trigger on_auth_user_created préservé (aucun DROP, aucun doublon)');

-- ── 10. Types identitaires réellement comparés par CTO-005A -----------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname, a.attname, format_type(a.atttypid, NULL) AS typ
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT a.attisdropped
       AND c.relname IN ('subscriptions','sessions','attempts','gs_tournament_entries',
                         'active_sessions','user_devices','user_profiles',
                         'user_student_mapping','classes')
       AND a.attname IN ('user_id','id','teacher_user_id','student_id')
     ORDER BY 1, 2
  LOOP
    RAISE NOTICE 'TYPE  %.% = %', r.relname, r.attname, r.typ;
  END LOOP;
END $$;

SELECT 'PRODUCTION-COMPATIBILITY CHECKS PASSED' AS result;
