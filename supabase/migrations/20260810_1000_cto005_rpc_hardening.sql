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
    'count_all_entities', 'mon_cleanup_old_data',
    -- présente en production seulement (aucune définition versionnée) : le
    -- rapport CTO-005A l'a trouvée SECURITY DEFINER et exécutable par
    -- anon/authenticated. Aucun appel client (aucun `.rpc('ensure_profile'` dans
    -- src/ ni server/) : elle ne peut être qu'un utilitaire serveur ou la
    -- fonction d'un trigger. PostgreSQL contrôle le privilège EXECUTE d'une
    -- fonction de trigger à la CRÉATION du trigger, pas à chaque déclenchement :
    -- révoquer l'accès client ne casse donc aucun trigger existant.
    'ensure_profile'
  ];
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
END $$;

-- ── Filet de sécurité pour les fonctions futures ---------------------------
-- Supabase accorde EXECUTE à PUBLIC par défaut sur toute nouvelle fonction.
-- On neutralise ce défaut pour le schéma public : une nouvelle RPC devra
-- accorder EXECUTE explicitement.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ── Vérification (à exécuter après application) ----------------------------
-- SELECT p.proname, p.proacl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prosecdef;
