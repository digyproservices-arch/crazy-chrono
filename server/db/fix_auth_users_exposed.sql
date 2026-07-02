-- ============================================================
-- FIX SÉCURITÉ SUPABASE — Alerte "auth_users_exposed"
-- ------------------------------------------------------------
-- Cause : la vue public.user_licenses lit auth.users (email, id)
--         et reste accessible aux rôles publics de l'API
--         (anon = visiteurs, authenticated = utilisateurs connectés).
--
-- Le backend interroge cette vue via la clé service_role
-- (req.app.locals.supabaseAdmin dans server/routes/auth.js),
-- laquelle ignore ces restrictions. Retirer l'accès public
-- NE CASSE DONC PAS l'application.
--
-- À exécuter dans : Supabase → SQL Editor → Run
-- ============================================================

-- 1) Fermer l'accès public à la vue (visiteurs + comptes connectés)
REVOKE ALL ON public.user_licenses FROM anon;
REVOKE ALL ON public.user_licenses FROM authenticated;

-- 2) Durcissement : la vue s'exécute avec les droits de l'appelant
--    (et non ceux du créateur) — PostgreSQL 15+ / Supabase
ALTER VIEW public.user_licenses SET (security_invoker = true);

-- 3) Vérification (optionnel) : lister les droits restants sur la vue
--    Attendu : plus aucune ligne pour anon / authenticated
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'user_licenses';

-- ============================================================
-- FIX SÉCURITÉ SUPABASE — Alerte "security_definer_view"
-- ------------------------------------------------------------
-- Ces vues s'exécutaient avec les droits du créateur (SECURITY
-- DEFINER par défaut). On les force à s'exécuter avec les droits
-- de l'appelant (security_invoker), conformément à la reco Supabase.
-- ============================================================
ALTER VIEW public.image_usage_summary      SET (security_invoker = true);
ALTER VIEW public.leaderboard              SET (security_invoker = true);
ALTER VIEW public.monitoring_errors_hourly SET (security_invoker = true);
ALTER VIEW public.monitoring_apm_hourly    SET (security_invoker = true);
