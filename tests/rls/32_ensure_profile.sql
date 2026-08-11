-- ==========================================================================
-- CTO-005A — Revue finale §E/§F : le VRAI parcours de création de compte.
--
-- À exécuter sur un schéma DÉJÀ migré (0100→1400), dans le conteneur jetable.
--
-- On reproduit exactement la chaîne production :
--   1. GoTrue insère la ligne dans auth.users ;
--   2. le trigger on_auth_user_created déclenche public.ensure_profile() ;
--   3. la ligne public.user_profiles est créée avec un rôle par défaut sûr ;
--   4. Login.js fait ensuite un upsert des champs personnels avec le JWT de
--      l'utilisateur (rôle authenticated) — il ne doit ni entrer en conflit avec
--      la ligne du trigger, ni écraser l'email, ni toucher au rôle.
-- Puis on vérifie qu'aucun rôle client ne peut plus appeler la fonction en RPC.
-- ==========================================================================
\set ON_ERROR_STOP on

-- `t_assert`, `t_denied`, `t_login`, `t_logout` viennent de 00_bootstrap_supabase.sql.

-- ── 1. Trigger auth.users → user_profiles -----------------------------------
-- Insertion « GoTrue » : rien d'autre que id + email, comme le fait réellement
-- Supabase Auth. Aucune écriture explicite dans user_profiles ici.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-00000000ef01', 'newsignup@example.test');

SELECT public.t_assert(
  EXISTS (SELECT 1 FROM public.user_profiles
           WHERE id = '00000000-0000-0000-0000-00000000ef01'),
  'EP-1 INSERT auth.users → ligne user_profiles créée par le trigger');

SELECT public.t_assert(
  (SELECT email FROM public.user_profiles
    WHERE id = '00000000-0000-0000-0000-00000000ef01') = 'newsignup@example.test',
  'EP-2 email repris de auth.users');

SELECT public.t_assert(
  (SELECT role FROM public.user_profiles
    WHERE id = '00000000-0000-0000-0000-00000000ef01') = 'user',
  'EP-3 rôle par défaut sûr = user (aucune élévation au signup)');

SELECT public.t_assert(
  (SELECT region IS NULL AND circonscription_id IS NULL
     FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-00000000ef01'),
  'EP-4 region et circonscription_id NULL (aucun périmètre institutionnel auto)');

-- Idempotence du ON CONFLICT (id) DO NOTHING : un second déclenchement sur le
-- même id ne doit ni échouer ni dupliquer.
DO $$
BEGIN
  BEGIN
    INSERT INTO auth.users (id, email)
    VALUES ('00000000-0000-0000-0000-00000000ef01', 'other@example.test');
    RAISE EXCEPTION 'FAIL EP-5 auth.users a accepté un id dupliqué (schéma de test invalide)';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- comportement attendu : c'est auth.users qui refuse, pas le trigger
  END;
END $$;

SELECT public.t_assert(
  (SELECT count(*) FROM public.user_profiles
    WHERE id = '00000000-0000-0000-0000-00000000ef01') = 1,
  'EP-5 aucune ligne user_profiles dupliquée');

-- ── 2. Upsert « Login.js » par l'utilisateur authentifié --------------------
-- Comportement actuel du frontend : upsert de id / first_name / last_name /
-- pseudo avec le JWT de l'utilisateur. La ligne existe déjà (créée par le
-- trigger) : l'upsert doit passer en UPDATE sans conflit.
SELECT public.t_login('00000000-0000-0000-0000-00000000ef01');

INSERT INTO public.user_profiles (id, first_name, last_name, pseudo)
VALUES ('00000000-0000-0000-0000-00000000ef01', 'Léa', 'Martin', 'lea-m')
ON CONFLICT (id) DO UPDATE
   SET first_name = EXCLUDED.first_name,
       last_name  = EXCLUDED.last_name,
       pseudo     = EXCLUDED.pseudo;

SELECT public.t_logout();

SELECT public.t_assert(
  (SELECT first_name = 'Léa' AND last_name = 'Martin' AND pseudo = 'lea-m'
     FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-00000000ef01'),
  'EP-6 upsert authentifié : champs personnels enregistrés');

SELECT public.t_assert(
  (SELECT email FROM public.user_profiles
    WHERE id = '00000000-0000-0000-0000-00000000ef01') = 'newsignup@example.test',
  'EP-7 upsert authentifié : email conservé (non écrasé, non NULL)');

SELECT public.t_assert(
  (SELECT role FROM public.user_profiles
    WHERE id = '00000000-0000-0000-0000-00000000ef01') = 'user',
  'EP-8 upsert authentifié : rôle toujours user');

-- Et l'upsert d'un TIERS reste impossible (régression IDOR au signup).
SELECT public.t_login('00000000-0000-0000-0000-00000000ef01');
SELECT public.t_assert(
  public.t_denied($$INSERT INTO public.user_profiles (id, pseudo)
                    VALUES ('00000000-0000-0000-0000-00000000000b', 'vole')
                    ON CONFLICT (id) DO UPDATE SET pseudo = EXCLUDED.pseudo$$),
  'EP-9 upsert sur le profil d''un tiers → refusé');
SELECT public.t_logout();

-- ── 3. Sécurité de la fonction ---------------------------------------------
SELECT public.t_assert(
  NOT has_function_privilege('anon', 'public.ensure_profile()', 'EXECUTE'),
  'EP-10 anon : EXECUTE direct sur ensure_profile() refusé');

SELECT public.t_assert(
  NOT has_function_privilege('authenticated', 'public.ensure_profile()', 'EXECUTE'),
  'EP-11 authenticated : EXECUTE direct sur ensure_profile() refusé');

SELECT public.t_assert(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace,
      aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
     WHERE n.nspname = 'public' AND p.proname = 'ensure_profile'
       AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
  'EP-12 PUBLIC : aucun EXECUTE sur ensure_profile()');

-- Refus effectif à l'exécution, pas seulement dans le catalogue.
SELECT public.t_login('00000000-0000-0000-0000-00000000ef01');
DO $$
BEGIN
  BEGIN
    PERFORM public.ensure_profile();
    RAISE EXCEPTION 'FAIL EP-13 authenticated a pu APPELER ensure_profile()';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'NOTICE:  PASS EP-13 appel direct par authenticated → insufficient_privilege';
  END;
END $$;
SELECT public.t_logout();

-- Le trigger, lui, fonctionne toujours : nouvelle création de compte APRÈS les
-- REVOKE (c'est la garantie que fermer l'accès RPC ne casse pas le signup).
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-00000000ef02', 'newsignup2@example.test');
SELECT public.t_assert(
  EXISTS (SELECT 1 FROM public.user_profiles
           WHERE id = '00000000-0000-0000-0000-00000000ef02'
             AND email = 'newsignup2@example.test' AND role = 'user'),
  'EP-14 trigger auth.users toujours fonctionnel après les REVOKE clients');

-- ── 4. Propriétés de la fonction versionnée ---------------------------------
SELECT public.t_assert(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_profile'),
  'EP-15 ensure_profile() reste SECURITY DEFINER');

SELECT public.t_assert(
  (SELECT 'search_path=pg_catalog, public, pg_temp' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_profile'),
  'EP-16 search_path figé = pg_catalog, public, pg_temp (pg_temp en dernier)');

SELECT public.t_assert(
  (SELECT pg_get_function_result(p.oid) = 'trigger'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_profile'),
  'EP-17 RETURNS trigger (signature production préservée)');

-- Propriétaire : la fonction doit rester détenue par un rôle capable d'écrire
-- dans user_profiles malgré la RLS — sinon le signup casserait en production.
SELECT public.t_assert(
  (SELECT p.proowner::regrole::text = 'postgres'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_profile'),
  'EP-18 propriétaire préservé (postgres) — CREATE OR REPLACE ne le change pas');

SELECT public.t_assert(
  (SELECT count(*) FROM pg_trigger t
     JOIN pg_proc p ON p.oid = t.tgfoid
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public'
      AND p.proname = 'ensure_profile'
      AND t.tgrelid = 'auth.users'::regclass
      AND t.tgenabled <> 'D') = 1,
  'EP-19 un seul trigger ACTIF sur auth.users (aucun doublon créé par 1400)');

SELECT public.t_assert(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_profile') = 1,
  'EP-20 une seule signature ensure_profile (aucune surcharge introduite)');

-- Nettoyage des seules lignes de test (conteneur jetable, aucune donnée réelle).
DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-00000000ef01',
                                    '00000000-0000-0000-0000-00000000ef02');

SELECT 'ENSURE_PROFILE CHECKS PASSED' AS result;
