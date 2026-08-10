-- ==========================================================================
-- CTO-005A — PRECHECK PRODUCTION (STRICTEMENT READ-ONLY)
--
-- À exécuter sur la base Supabase cible AVANT toute application des
-- migrations supabase/migrations/20260810_*.
--
-- Ce fichier ne contient QUE des SELECT. Aucun CREATE, ALTER, DROP, INSERT,
-- UPDATE, DELETE, GRANT ou REVOKE. Le rejouer n'a aucun effet de bord.
--
-- Archiver la sortie complète : elle constitue la preuve de l'état réel et
-- lève (ou confirme) le marqueur PRODUCTION_RLS_UNVERIFIED.
-- ==========================================================================

-- ── 1. Quelles tables ciblées existent réellement ? -----------------------
SELECT c.relname AS table_name,
       c.relrowsecurity  AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND c.relname IN (
     'user_profiles','subscriptions','webhook_events','gs_tournament_entries',
     'sessions','attempts','training_sessions','training_results',
     'student_training_stats','student_stats','students','classes','schools',
     'user_student_mapping','invitations','gift_codes','user_devices',
     'active_sessions','auth_audit_log','content_store','image_usage_logs',
     'tournaments','tournament_groups','tournament_matches')
 ORDER BY c.relname;

-- ── 2. Policies réellement déployées --------------------------------------
-- Repérer en priorité les qual/with_check valant 'true' et les policies sans
-- rôle explicite (roles = {public}).
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename, policyname;

-- ── 3. Privilèges accordés à anon / authenticated -------------------------
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon','authenticated')
 ORDER BY table_name, grantee, privilege_type;

SELECT table_name, column_name, grantee, privilege_type
  FROM information_schema.column_privileges
 WHERE table_schema = 'public'
   AND grantee IN ('anon','authenticated')
   AND column_name IN ('role','region','circonscription_id','paid',
                       'is_subscriber','payment_id','licensed','access_code')
 ORDER BY table_name, column_name, grantee;

-- ── 4. Fonctions SECURITY DEFINER et leurs signatures exactes -------------
-- Le durcissement 1000 ne peut agir que sur les signatures qu'il trouve :
-- toute divergence ici doit être reportée dans la migration.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       p.proconfig AS config,          -- doit contenir search_path=...
       pg_get_userbyid(p.proowner) AS owner,
       p.proacl AS acl                 -- qui peut EXECUTE
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
 ORDER BY p.prosecdef DESC, p.proname;

-- ── 5. Types et contraintes sensibles -------------------------------------
-- Les policies comparent user_id à auth.uid() : uuid vs text change le SQL.
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND column_name IN ('user_id','student_id','class_id','school_id',
                       'teacher_user_id','teacher_email','circonscription_id')
 ORDER BY table_name, column_name;

SELECT conrelid::regclass AS table_name, conname, contype,
       pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace
   AND conrelid::regclass::text IN ('subscriptions','webhook_events',
                                    'user_student_mapping','students','classes')
 ORDER BY 1, 2;

-- BLOQUANT pour la migration 0500 : doit renvoyer 0 ligne.
SELECT user_id, COUNT(*) AS occurrences
  FROM public.subscriptions
 GROUP BY user_id
HAVING COUNT(*) > 1
 ORDER BY occurrences DESC;

-- ── 6. LEGACY_STUDENT_MAPPING_REQUIRED — diagnostic -----------------------
-- Volumétrie uniquement : aucune donnée nominative extraite, aucun backfill.
SELECT COUNT(*) AS mappings_actifs
  FROM public.user_student_mapping
 WHERE active = true;

SELECT COUNT(*) AS eleves_total,
       COUNT(*) FILTER (WHERE licensed = true) AS eleves_licencies
  FROM public.students;

-- Élèves licenciés sans aucun compte rattaché : population fail-closed.
SELECT COUNT(*) AS eleves_licencies_sans_mapping
  FROM public.students s
 WHERE s.licensed = true
   AND NOT EXISTS (
     SELECT 1 FROM public.user_student_mapping m
      WHERE m.student_id = s.id AND m.active = true);

-- Comptes auth ressemblant à des comptes élèves mais sans mapping.
-- L'email n'est PAS une preuve d'identité : ce chiffre sert uniquement à
-- dimensionner le futur backfill administratif.
SELECT COUNT(*) AS comptes_eleves_presumes_sans_mapping
  FROM auth.users u
 WHERE u.email LIKE '%@eleve.crazychrono.app'
   AND NOT EXISTS (
     SELECT 1 FROM public.user_student_mapping m
      WHERE m.user_id = u.id AND m.active = true);

-- ── 7. Données financières : cohérence avant durcissement -----------------
-- Entrées de tournoi marquées payées sans identifiant de paiement : forgeables
-- avec la policy historique gs_entries_insert_all.
SELECT COUNT(*) AS entrees_payees_sans_payment_id
  FROM public.gs_tournament_entries
 WHERE COALESCE(paid, false) = true
   AND (payment_id IS NULL OR payment_id = '');

-- Profils avec un rôle privilégié : à revoir manuellement avant de verrouiller
-- l'écriture de `role` (une auto-promotion passée resterait effective).
SELECT role, COUNT(*) AS comptes
  FROM public.user_profiles
 GROUP BY role
 ORDER BY comptes DESC;
