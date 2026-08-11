-- ==========================================================================
-- CTO-005A — 1000 — P0-3 : fonctions SECURITY DEFINER
--
-- Toutes les fonctions RPC du dépôt sont SECURITY DEFINER, sans search_path
-- figé et sans REVOKE : par défaut PostgreSQL accorde EXECUTE à PUBLIC, donc
-- à anon et authenticated via PostgREST. Elles prennent en outre un
-- `p_user_id` / `p_device_id` arbitraire — n'importe qui pouvait déconnecter
-- un tiers (`invalidate_user_sessions`), énumérer ses appareils
-- (`list_user_devices`), lire des IP (`detect_suspicious_accounts`,
-- `count_unique_ips_24h`) ou déclencher des DELETE de masse (`cleanup_*`).
--
-- Après :
--   * search_path figé (public, pg_temp) sur toutes les fonctions du dépôt ;
--   * EXECUTE révoqué à PUBLIC / anon / authenticated sur toutes ;
--   * EXECUTE accordé au seul service_role — le frontend n'appelle AUCUNE RPC
--     (vérifié : aucun `.rpc(` dans src/), toutes les RPC transitent par les
--     routes Express authentifiées de CTO-003.
-- ==========================================================================

DO $$
DECLARE
  r RECORD;
  fn_names TEXT[] := ARRAY[
    -- sessions / appareils
    'invalidate_user_sessions', 'check_session_active', 'cleanup_old_sessions',
    'register_device', 'revoke_device', 'list_user_devices',
    'count_user_devices', 'cleanup_stale_devices',
    -- audit / antifraude
    'count_unique_ips_24h', 'count_failed_logins', 'detect_suspicious_accounts',
    'cleanup_old_audit_logs',
    -- métier
    'update_student_training_stats', 'check_user_can_play', 'link_user_to_student',
    'count_all_entities', 'mon_cleanup_old_data'
  ];
  -- Fonctions présentes en PRODUCTION SEULEMENT, sans définition versionnée : on
  -- ne connaît pas leur corps, donc on ne modifie PAS leur `search_path` (cela
  -- changerait le comportement d'un code qu'on n'a pas lu). Traitement minimal et
  -- réversible : fermeture de l'accès client uniquement.
  --
  -- PostgreSQL contrôle le privilège EXECUTE d'une fonction de trigger à la
  -- CRÉATION du trigger, pas à chaque déclenchement : révoquer l'accès client ne
  -- casse aucun trigger existant.
  --
  -- Le durcissement complet (search_path, ou définition versionnée, ou
  -- suppression) est arbitré APRÈS lecture de
  -- docs/CTO_005_ENSURE_PROFILE_PRECHECK.sql.
  fn_unversioned TEXT[] := ARRAY['ensure_profile'];
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(fn_names)
  LOOP
    -- 1) search_path sûr : empêche le détournement par un schéma temporaire
    --    dans une fonction SECURITY DEFINER.
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);

    -- 2) Aucun appelant client.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);

    -- 3) Backend uniquement.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- Fonctions non versionnées : accès client fermé, corps et search_path intacts.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(fn_unversioned)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    RAISE NOTICE
      'CTO-005A: % fermée au client sans modification de son corps ni de son search_path (définition non versionnée — voir docs/CTO_005_ENSURE_PROFILE_PRECHECK.sql).',
      r.sig;
  END LOOP;
END $$;

-- ── Filet de sécurité pour les fonctions futures ---------------------------
-- PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute nouvelle fonction.
--
-- ATTENTION SÉMANTIQUE (vérifié empiriquement, PostgreSQL 15) : la forme
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC
-- ne fait RIEN. Ce défaut EXECUTE→PUBLIC est un défaut *intégré*, non rattaché à
-- un schéma : un REVOKE restreint à un schéma n'a rien à soustraire, aucune
-- ligne `pg_default_acl` n'est créée, et la fonction suivante est de nouveau
-- exécutable par PUBLIC. Seule la forme SANS `IN SCHEMA` matérialise la ligne
-- `pg_default_acl` (`defaclnamespace = 0`, `defaclacl = {owner=X/owner}`).
--
-- PORTÉE : les default privileges sont attachés au RÔLE QUI CRÉE l'objet, pas
-- au schéma. Une ligne posée pour le rôle A ne protège pas une fonction créée
-- par le rôle B. On les pose donc pour :
--   1. le rôle courant (celui qui applique cette migration) ;
--   2. chaque rôle qui possède DÉJÀ une fonction du schéma public — donc un
--      créateur de fonctions prouvé par le catalogue, et non un nom de rôle
--      Supabase codé en dur — à condition que le rôle courant en soit membre
--      (sinon PostgreSQL refuse, et c'est normal).
-- Un rôle qui n'a jamais créé de fonction ici reste hors de portée : c'est la
-- limite structurelle du mécanisme, l'assertion 1300 est le filet suivant.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT p.proowner::regrole::text AS owner
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proowner::regrole::text <> current_user::text
       AND pg_has_role(current_user, p.proowner, 'USAGE')
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
      r.owner);
    RAISE NOTICE 'CTO-005A: default privileges EXECUTE→PUBLIC révoqués pour le rôle %.', r.owner;
  END LOOP;
END $$;

-- ── Vérification (à exécuter après application) ----------------------------
-- SELECT p.proname, p.proacl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prosecdef;
