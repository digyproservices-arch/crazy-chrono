-- ==========================================================================
-- CTO-005A — 1400 — `ensure_profile()` : versionnée et durcie
--
-- Arbitrage CTO après exécution en lecture seule de
-- docs/CTO_005_ENSURE_PROFILE_PRECHECK.sql sur la production. État constaté :
--
--   public.ensure_profile()  owner postgres, LANGUAGE plpgsql,
--   RETURNS trigger, SECURITY DEFINER, AUCUN search_path figé,
--   trigger actif  on_auth_user_created AFTER INSERT ON auth.users
--                  FOR EACH ROW EXECUTE FUNCTION ensure_profile(),
--   EXECUTE : anon OUI, authenticated OUI, service_role OUI, PUBLIC non,
--   CREATE sur le schéma public : anon NON, authenticated NON.
--
-- Corps production, repris ici À L'IDENTIQUE (aucun changement métier) :
--   begin
--     insert into public.user_profiles (id, email)
--     values (new.id, new.email)
--     on conflict (id) do nothing;
--     return new;
--   end;
--
-- La fonction est donc VIVANTE et nécessaire : c'est elle qui crée la ligne
-- `user_profiles` de tout nouveau compte. Elle n'est pas supprimée. Elle devient
-- une définition versionnée, avec un `search_path` figé et sans accès client.
--
-- Ce que cette migration ne fait PAS, volontairement :
--   * pas de DROP FUNCTION — cela supprimerait en cascade le trigger
--     `on_auth_user_created` et casserait la création de profil ;
--   * pas de DROP TRIGGER, pas de recréation du trigger existant : `CREATE OR
--     REPLACE FUNCTION` conserve l'OID, donc le trigger continue de pointer sur
--     la même fonction ;
--   * aucune écriture dans `auth.*`.
-- ==========================================================================

-- ── 1. Garde-fou : signature attendue ---------------------------------------
-- `CREATE OR REPLACE FUNCTION` ne peut pas changer le type de retour d'une
-- fonction existante : PostgreSQL refuserait avec « cannot change return type ».
-- On préfère un échec explicite et lisible si la production diverge du precheck.
DO $$
DECLARE
  v_count INT;
  v_args  TEXT;
  v_ret   TEXT;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'ensure_profile';

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'CTO-005A 1400: % fonctions public.ensure_profile trouvées ; le precheck production n''en connaît qu''UNE. Rejouer docs/CTO_005_ENSURE_PROFILE_PRECHECK.sql et arbitrer chaque surcharge avant d''appliquer cette migration.',
      v_count;
  END IF;

  IF v_count = 1 THEN
    SELECT pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
      INTO v_args, v_ret
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'ensure_profile';

    IF v_args <> '' THEN
      RAISE EXCEPTION
        'CTO-005A 1400: public.ensure_profile prend des arguments (%) alors que le precheck production la décrit sans argument. Arrêt avant toute modification.',
        v_args;
    END IF;

    IF v_ret <> 'trigger' THEN
      RAISE EXCEPTION
        'CTO-005A 1400: public.ensure_profile() retourne % alors que le precheck production indique `trigger`. CREATE OR REPLACE échouerait ; arbitrer manuellement.',
        v_ret;
    END IF;
  END IF;
END $$;

-- ── 2. Définition versionnée -------------------------------------------------
-- Comportement métier strictement identique à la production. Seules deux choses
-- changent, et elles sont hors métier : le `search_path` est figé et la
-- définition est désormais dans le dépôt.
--
-- SEARCH_PATH : la fonction ne référence que des objets pleinement qualifiés
-- (`public.user_profiles`) et n'utilise aucun opérateur ni cast implicite exotique.
--   * `pg_catalog` en tête : les fonctions et opérateurs internes ne peuvent pas
--     être masqués (PostgreSQL le place implicitement en tête de toute façon, on
--     le rend explicite pour que la lecture du catalogue soit sans ambiguïté) ;
--   * `public` : conservé bien qu'inutile ici, pour que le jour où le corps
--     évolue, la résolution reste celle attendue ;
--   * `pg_temp` en DERNIÈRE position : c'est le point clé. Placé ailleurs, un
--     rôle pouvant créer un objet temporaire pourrait masquer une table ou une
--     fonction et détourner une fonction SECURITY DEFINER exécutée avec les
--     droits de `postgres`. (Le precheck confirme que `anon`/`authenticated`
--     n'ont pas CREATE sur `public` ; `pg_temp` reste néanmoins créable.)
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── 3. Privilèges ------------------------------------------------------------
-- `CREATE OR REPLACE FUNCTION` CONSERVE l'ACL existante : sans les REVOKE
-- ci-dessous, `anon` et `authenticated` garderaient l'EXECUTE constaté en
-- production. Ils doivent donc être explicites.
--
-- Aucun GRANT n'est nécessaire : PostgreSQL vérifie le privilège EXECUTE d'une
-- fonction de trigger à la CRÉATION du trigger, pas à chaque déclenchement. Le
-- trigger `on_auth_user_created` continue donc de fonctionner alors même que plus
-- aucun rôle client ne peut appeler la fonction en RPC. Le propriétaire
-- (`postgres`) conserve ses droits implicites, ce qui couvre les migrations
-- futures. Un appel direct par le backend n'existe pas : le seul chemin est
-- l'insertion dans `auth.users` par GoTrue.
REVOKE ALL ON FUNCTION public.ensure_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_profile() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_profile() FROM authenticated;

-- ── 4. Trigger ---------------------------------------------------------------
-- En production le trigger EXISTE : on ne le touche pas. Dans un environnement
-- neuf (base fraîche, harness) il n'existe pas, et la création de profil
-- n'aurait aucun déclencheur : on le pose alors, à l'identique du trigger
-- production. La condition porte sur la fonction cible, pas sur le nom, pour ne
-- pas créer un second trigger équivalent sous un autre nom.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE NOT t.tgisinternal
       AND n.nspname = 'public'
       AND p.proname = 'ensure_profile'
       AND t.tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.ensure_profile();
    RAISE NOTICE 'CTO-005A 1400: trigger on_auth_user_created créé (absent de cet environnement).';
  ELSE
    RAISE NOTICE 'CTO-005A 1400: trigger existant conservé tel quel (aucun DROP).';
  END IF;
END $$;

-- ── 5. Assertion ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT p.prosecdef,
         p.proconfig,
         pg_get_function_result(p.oid) AS ret,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ok,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
         EXISTS (
           SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
         ) AS public_ok
    INTO r
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'ensure_profile';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CTO-005A 1400: public.ensure_profile() absente après CREATE OR REPLACE.';
  END IF;
  IF NOT r.prosecdef THEN
    RAISE EXCEPTION 'CTO-005A 1400: ensure_profile() n''est plus SECURITY DEFINER.';
  END IF;
  IF r.ret <> 'trigger' THEN
    RAISE EXCEPTION 'CTO-005A 1400: ensure_profile() retourne % au lieu de trigger.', r.ret;
  END IF;
  IF NOT ('search_path=pg_catalog, public, pg_temp' = ANY(COALESCE(r.proconfig, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'CTO-005A 1400: search_path non figé sur ensure_profile() (proconfig = %).',
      COALESCE(array_to_string(r.proconfig, ' ; '), '(aucun)');
  END IF;
  IF r.public_ok OR r.anon_ok OR r.auth_ok THEN
    RAISE EXCEPTION 'CTO-005A 1400: ensure_profile() reste exécutable par un rôle client (PUBLIC=% anon=% authenticated=%).',
      r.public_ok, r.anon_ok, r.auth_ok;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE NOT t.tgisinternal AND n.nspname = 'public'
       AND p.proname = 'ensure_profile' AND t.tgrelid = 'auth.users'::regclass
       AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'CTO-005A 1400: aucun trigger ACTIF sur auth.users n''appelle ensure_profile().';
  END IF;

  RAISE NOTICE 'CTO-005A 1400: ensure_profile() versionnée, SECURITY DEFINER, search_path figé, fermée aux rôles clients, trigger auth.users actif.';
END $$;
