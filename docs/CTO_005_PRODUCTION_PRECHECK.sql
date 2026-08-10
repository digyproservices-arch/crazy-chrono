-- ==========================================================================
-- CTO-005A — PRECHECK PRODUCTION (STRICTEMENT READ-ONLY)
--
-- À exécuter sur la base Supabase cible AVANT toute application des
-- migrations supabase/migrations/20260810_*.
--
-- Ce fichier ne contient QUE des SELECT. Aucun CREATE, ALTER, DROP, INSERT,
-- UPDATE, DELETE, GRANT ou REVOKE. Le rejouer n'a aucun effet de bord.
--
-- Il se copie-colle TEL QUEL dans le SQL Editor de Supabase : aucune section à
-- commenter, aucun nom de colonne à adapter, aucune connaissance du schéma
-- requise. Les colonnes dont l'existence dépend de l'historique de la base
-- (`joined_at` vs `created_at`, `region`, `circonscription_id`…) sont lues via
-- `to_jsonb(ligne) ->> 'colonne'`, qui renvoie NULL au lieu d'échouer quand la
-- colonne est absente.
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
       to_jsonb(p) ->> 'region'             AS region,
       to_jsonb(p) ->> 'circonscription_id' AS circonscription_id,
       to_jsonb(p) ->> 'created_at'         AS profile_created_at,
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
SELECT id, auth_email, role, region, circonscription_id,
       CASE
         WHEN role IN ('cpd','cpc','rectorat') AND region IS NULL
           THEN 'role_regional_sans_region'
         WHEN role = 'cpc' AND circonscription_id IS NULL
           THEN 'cpc_sans_circonscription'
         WHEN role NOT IN ('cpd','cpc','rectorat')
              AND (region IS NOT NULL OR circonscription_id IS NOT NULL)
           THEN 'perimetre_sur_role_non_regional'
       END AS anomalie
  FROM (SELECT p.id,
               u.email AS auth_email,
               p.role,
               to_jsonb(p) ->> 'region'             AS region,
               to_jsonb(p) ->> 'circonscription_id' AS circonscription_id
          FROM public.user_profiles p
          LEFT JOIN auth.users u ON u.id = p.id) s
 WHERE (role IN ('cpd','cpc','rectorat')
        AND (region IS NULL OR (role = 'cpc' AND circonscription_id IS NULL)))
    OR (role NOT IN ('cpd','cpc','rectorat')
        AND (region IS NOT NULL OR circonscription_id IS NOT NULL))
 ORDER BY role, auth_email NULLS LAST;

-- Rôles présents en base mais hors whitelist attribuable (server/access/roles.js).
-- `student` est écrit par le backend à la création d'un compte élève : il est
-- légitime en base mais n'est pas attribuable par un administrateur. Toute autre
-- valeur doit être régularisée à la main avant la migration 1200.
SELECT p.id, u.email AS auth_email, p.role,
       CASE WHEN p.role = 'student' THEN 'non_attribuable_mais_legitime'
            ELSE 'a_regulariser_bloque_migration_1200' END AS statut
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
 WHERE p.role IS NOT NULL
   AND p.role NOT IN ('admin','editor','user','teacher','cpd','cpc','rectorat')
 ORDER BY p.role;

-- Invitations privilégiées encore ouvertes : chacune est un chemin d'obtention
-- de rôle. Le token n'est jamais affiché.
-- `region` / `circonscription_id` ne sont ajoutées à cette table que par la
-- migration 1100 : ne pas les nommer ici, le precheck tourne AVANT.
SELECT id, destinataire, role, created_at, expires_at
  FROM (SELECT i.id,
               i.email AS destinataire,
               i.role,
               (to_jsonb(i) ->> 'created_at')::timestamptz AS created_at,
               (to_jsonb(i) ->> 'expires_at')::timestamptz AS expires_at,
               COALESCE((to_jsonb(i) ->> 'used')::boolean, false) AS used
          FROM public.invitations i) inv
 WHERE used = false
   AND (expires_at IS NULL OR expires_at > now())
   AND role IN ('admin','teacher','cpd','cpc','rectorat','editor')
 ORDER BY role, expires_at NULLS LAST;

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
       -- Le schéma versionné nomme cette colonne `joined_at`, certaines bases
       -- historiques `created_at` : les deux sont lues sans adaptation.
       COALESCE(to_jsonb(e) ->> 'joined_at',
                to_jsonb(e) ->> 'created_at')::timestamptz AS date_entree,
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
 ORDER BY COALESCE(to_jsonb(e) ->> 'joined_at',
                   to_jsonb(e) ->> 'created_at')::timestamptz NULLS LAST,
          e.id;

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

-- Aucune contre-preuve n'est disponible en base : `webhook_events.event_id`
-- porte l'identifiant de l'ÉVÉNEMENT Stripe (`evt_…`) tandis que `payment_id`
-- porte un PaymentIntent (`pi_…`), une Checkout Session (`cs_…`) ou autre objet.
-- Les comparer par égalité produirait un faux verdict dans les deux sens : la
-- réconciliation se fait contre Stripe (ou les paiements enregistrés côté
-- serveur), jamais contre cette table.

-- ── 10. Contraintes CHECK de rôle réellement en place ---------------------
-- Le dépôt contient deux générations de contraintes (server/db/migration_rectorat.sql
-- puis server/db/migration_cpd_cpc_roles.sql). Si la génération « rectorat »
-- (sans `cpd` ni `cpc`) est encore active en production, toute invitation ou
-- attribution cpd/cpc échouera au niveau PostgreSQL malgré le code CTO-005A.
-- La migration 1200 normalise ces contraintes ; elle refuse de tourner si une
-- valeur hors whitelist existe.
SELECT conrelid::regclass AS table_name, conname,
       pg_get_constraintdef(oid) AS definition,
       convalidated AS validee,
       (pg_get_constraintdef(oid) LIKE '%''cpd''%'
        AND pg_get_constraintdef(oid) LIKE '%''cpc''%') AS accepte_cpd_cpc
  FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace
   AND contype = 'c'
   AND conrelid::regclass::text IN ('user_profiles','invitations')
 ORDER BY 1, 2;

-- Valeurs de rôle réellement présentes. Toute valeur hors whitelist serveur
-- (`user_profiles.role` peut légitimement valoir `student`, écrit par le backend
-- lors de la création d'un compte élève) bloquera la migration 1200 : elle doit
-- être régularisée à la main, jamais convertie automatiquement.
SELECT 'user_profiles' AS table_name, role, COUNT(*) AS lignes,
       (role IN ('admin','editor','user','teacher','cpd','cpc','rectorat','student'))
         AS role_autorise_en_base
  FROM public.user_profiles
 GROUP BY role
UNION ALL
SELECT 'invitations' AS table_name, role, COUNT(*) AS lignes,
       (role IN ('admin','editor','user','teacher','cpd','cpc','rectorat'))
         AS role_autorise_en_base
  FROM public.invitations
 GROUP BY role
 ORDER BY table_name, role;
