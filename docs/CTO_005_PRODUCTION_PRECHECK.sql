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

-- ── 8. Revue nominative des comptes privilégiés ---------------------------
-- Le décompte du §7 ne dit pas QUI détient un rôle privilégié. La migration
-- 0200 gèle l'état existant : une auto-promotion antérieure à CTO-005A
-- resterait effective et invisible.
--
-- Le propriétaire doit confirmer LIGNE PAR LIGNE que chaque compte listé ici
-- possède légitimement son rôle, et faire rétrograder les autres par
-- POST /api/admin/set-role (jamais par une écriture SQL directe).
--
-- Aucune modification n'est effectuée ici.
SELECT p.id,
       u.email                AS auth_email,   -- NULL si le compte auth n'existe plus
       p.role,
       p.region,
       p.circonscription_id,
       p.created_at,
       u.created_at           AS auth_created_at,
       u.last_sign_in_at,
       u.email_confirmed_at
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
 WHERE p.role IN ('admin','teacher','cpd','cpc','rectorat','editor')
 ORDER BY CASE p.role
            WHEN 'admin'    THEN 1
            WHEN 'rectorat' THEN 2
            WHEN 'cpd'      THEN 3
            WHEN 'cpc'      THEN 4
            WHEN 'editor'   THEN 5
            ELSE 6
          END,
          u.email NULLS LAST;

-- Incohérences de périmètre à trancher manuellement : un rôle régional sans
-- région, ou un `cpc` sans circonscription, ne peut pas être arbitré par une
-- migration.
SELECT p.id, u.email AS auth_email, p.role, p.region, p.circonscription_id,
       CASE
         WHEN p.role IN ('cpd','cpc','rectorat') AND p.region IS NULL
           THEN 'role_regional_sans_region'
         WHEN p.role = 'cpc' AND p.circonscription_id IS NULL
           THEN 'cpc_sans_circonscription'
         WHEN p.role NOT IN ('cpd','cpc','rectorat')
              AND (p.region IS NOT NULL OR p.circonscription_id IS NOT NULL)
           THEN 'perimetre_sur_role_non_regional'
       END AS anomalie
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
 WHERE (p.role IN ('cpd','cpc','rectorat')
        AND (p.region IS NULL OR (p.role = 'cpc' AND p.circonscription_id IS NULL)))
    OR (p.role NOT IN ('cpd','cpc','rectorat')
        AND (p.region IS NOT NULL OR p.circonscription_id IS NOT NULL))
 ORDER BY p.role, u.email NULLS LAST;

-- Rôles présents en base mais hors whitelist serveur (server/access/roles.js) :
-- ils ne sont plus attribuables et doivent être régularisés.
SELECT p.id, u.email AS auth_email, p.role
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
 WHERE p.role IS NOT NULL
   AND p.role NOT IN ('admin','editor','user','teacher','cpd','cpc','rectorat')
 ORDER BY p.role;

-- Invitations privilégiées encore ouvertes : chacune est un chemin d'obtention
-- de rôle. Le token n'est jamais affiché.
-- `region` / `circonscription_id` ne sont ajoutées à cette table que par la
-- migration 1100 : ne pas les nommer ici, le precheck tourne AVANT.
SELECT id, email AS destinataire, role, created_at, expires_at
  FROM public.invitations
 WHERE COALESCE(used, false) = false
   AND expires_at > now()
   AND role IN ('admin','teacher','cpd','cpc','rectorat','editor')
 ORDER BY role, expires_at;

-- ── 9. LEGACY_GS_PAYMENT_RECONCILIATION_REQUIRED --------------------------
-- La policy historique `gs_entries_insert_all ... WITH CHECK (true)` laissait le
-- client écrire `paid`, `is_subscriber` et `payment_id`. Conséquence : sur les
-- lignes existantes, `payment_id IS NOT NULL` n'est PAS une preuve de paiement.
-- La migration 0300 ferme l'écriture pour l'avenir mais ne réécrit rien.
--
-- Si l'inventaire ci-dessous renvoie au moins une ligne, marquer le dossier
--   LEGACY_GS_PAYMENT_RECONCILIATION_REQUIRED
-- et réconcilier chaque `payment_id` avec le tableau de bord Stripe /
-- RevenueCat avant d'accorder le moindre droit sur ces entrées.
-- Aucune donnée n'est modifiée.
SELECT COUNT(*) AS entrees_financieres_heritees
  FROM public.gs_tournament_entries
 WHERE COALESCE(paid, false) = true
    OR COALESCE(is_subscriber, false) = true
    OR payment_id IS NOT NULL;

SELECT e.id,
       e.tournament_id,
       e.paid,
       e.is_subscriber,
       e.payment_id,
       -- Nommage constaté dans le schéma versionné. Si la base cible utilise
       -- `created_at`, adapter les deux occurrences ci-dessous.
       e.joined_at,
       e.user_id,
       -- Réconciliation administrative privée : l'e-mail est le seul lien vers
       -- l'acheteur pour les entrées créées sans user_id. À traiter comme une
       -- donnée personnelle (ne pas recopier dans un rapport partagé).
       e.email,
       CASE
         WHEN e.payment_id IS NULL OR e.payment_id = ''
           THEN 'aucune_reference_de_paiement'   -- forgeable, jamais payé
         WHEN e.payment_id NOT LIKE 'pi_%'
              AND e.payment_id NOT LIKE 'cs_%'
              AND e.payment_id NOT LIKE 'ch_%'
           THEN 'reference_non_stripe'           -- format inattendu → suspect
         ELSE 'a_reconcilier_avec_stripe'
       END AS verdict_provisoire
  FROM public.gs_tournament_entries e
 WHERE COALESCE(e.paid, false) = true
    OR COALESCE(e.is_subscriber, false) = true
    OR e.payment_id IS NOT NULL
 ORDER BY e.joined_at NULLS LAST, e.id;

-- Répartition synthétique, utile pour dimensionner la réconciliation.
SELECT COALESCE(paid, false)          AS paid,
       COALESCE(is_subscriber, false) AS is_subscriber,
       (payment_id IS NOT NULL AND payment_id <> '') AS a_payment_id,
       COUNT(*)                       AS entrees
  FROM public.gs_tournament_entries
 WHERE COALESCE(paid, false) = true
    OR COALESCE(is_subscriber, false) = true
    OR payment_id IS NOT NULL
 GROUP BY 1, 2, 3
 ORDER BY entrees DESC;

-- Contre-preuve disponible en base : un `payment_id` d'entrée retrouvé dans
-- webhook_events est un indice de paiement réel. L'absence n'est PAS une preuve
-- d'absence de paiement : la table n'est créée que par la migration 0400.
-- À SAUTER si le §1 montre que public.webhook_events n'existe pas encore.
-- PRECHECK_REQUIRES_WEBHOOK_EVENTS (marqueur utilisé par tests/rls/run_rls_tests.sh)
SELECT e.id, e.payment_id,
       EXISTS (
         SELECT 1 FROM public.webhook_events w
          WHERE w.event_id = e.payment_id
       ) AS trace_webhook_presente
  FROM public.gs_tournament_entries e
 WHERE e.payment_id IS NOT NULL AND e.payment_id <> ''
 ORDER BY e.id;
