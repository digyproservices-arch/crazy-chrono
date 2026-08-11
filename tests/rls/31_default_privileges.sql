-- ==========================================================================
-- CTO-005A — Revue finale §A : ALTER DEFAULT PRIVILEGES réellement efficace.
--
-- À exécuter sur un schéma DÉJÀ migré (1000 appliquée), dans le conteneur
-- jetable uniquement. On crée une fonction de test avec le rôle qui applique les
-- migrations, on vérifie qu'aucun rôle client n'obtient EXECUTE automatiquement,
-- puis on supprime cette seule fonction de test.
--
-- Rappel de portée : les default privileges sont attachés au RÔLE CRÉATEUR, pas
-- au schéma. Ce test prouve donc la protection pour le rôle de migration — c'est
-- exactement le rôle qui appliquera CTO-005A et les migrations suivantes.
-- ==========================================================================

-- Trace : la ligne pg_default_acl doit exister et être globale (namespace 0).
DO $$
DECLARE
  v_acl TEXT;
BEGIN
  SELECT array_to_string(defaclacl, ' ') INTO v_acl
    FROM pg_default_acl
   WHERE defaclrole = current_user::text::regrole
     AND defaclobjtype = 'f'
     AND defaclnamespace = 0;

  IF v_acl IS NULL THEN
    RAISE EXCEPTION
      'FAIL DEFACL-1 aucune ligne pg_default_acl globale pour les fonctions du rôle % : ALTER DEFAULT PRIVILEGES sans effet (forme IN SCHEMA ?)',
      current_user;
  END IF;
  RAISE NOTICE 'NOTICE:  PASS DEFACL-1 pg_default_acl (fonctions, rôle %) = %', current_user, v_acl;
END $$;

CREATE FUNCTION public.cto005_defacl_probe() RETURNS int
LANGUAGE sql AS 'SELECT 1';

DO $$
DECLARE
  v_public BOOLEAN;
  v_anon BOOLEAN;
  v_auth BOOLEAN;
BEGIN
  SELECT EXISTS (
           SELECT 1
             FROM pg_proc p
             JOIN aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a ON TRUE
            WHERE p.oid = 'public.cto005_defacl_probe()'::regprocedure
              AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
         has_function_privilege('anon', 'public.cto005_defacl_probe()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.cto005_defacl_probe()', 'EXECUTE')
    INTO v_public, v_anon, v_auth;

  IF v_public THEN
    RAISE EXCEPTION 'FAIL DEFACL-2 une nouvelle fonction est encore EXECUTE par PUBLIC';
  END IF;
  RAISE NOTICE 'NOTICE:  PASS DEFACL-2 nouvelle fonction : aucun EXECUTE PUBLIC';

  IF v_anon THEN
    RAISE EXCEPTION 'FAIL DEFACL-3 une nouvelle fonction est exécutable par anon';
  END IF;
  IF v_auth THEN
    RAISE EXCEPTION 'FAIL DEFACL-4 une nouvelle fonction est exécutable par authenticated';
  END IF;
  RAISE NOTICE 'NOTICE:  PASS DEFACL-3/4 nouvelle fonction : ni anon ni authenticated';
END $$;

DROP FUNCTION public.cto005_defacl_probe();

SELECT 'DEFAULT PRIVILEGES CHECKS PASSED' AS result;
