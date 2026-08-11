-- ==========================================================================
-- CTO-005A — RAPPORT PRODUCTION CONSOLIDÉ (STRICTEMENT READ-ONLY)
--
-- Complément de docs/CTO_005_PRODUCTION_PRECHECK.sql : mêmes contrôles, mais
-- réduits à UN SEUL RESULT SET transmissible tel quel. Le SQL Editor de
-- Supabase n'affichant que le dernier jeu de résultats, ce fichier est une
-- unique requête `WITH … SELECT` : copier-coller, Run, exporter la grille.
--
-- Colonnes : section | check_name | status | count | details
-- Statuts   : P0 (bloquant sécurité) · P1 (à corriger) · REVIEW (décision
--             humaine requise) · OK · INFO (inventaire, aucune action).
--
-- Ce fichier ne contient QUE des SELECT : aucun CREATE, ALTER, DROP, INSERT,
-- UPDATE, DELETE, GRANT, REVOKE, aucune fonction ni table temporaire, aucun
-- bloc DO. Le rejouer n'a aucun effet de bord.
--
-- Il ne propose JAMAIS de suppression ni de correction automatique : les
-- comptes privilégiés et les comptes de test sont inventoriés pour validation
-- humaine. Les colonnes dont l'existence dépend de l'historique de la base sont
-- lues via `to_jsonb(ligne) ->> 'colonne'`, qui renvoie NULL au lieu d'échouer.
-- ==========================================================================

WITH
-- ── Référentiels ----------------------------------------------------------
sensibles(tbl, criticite) AS (
  VALUES ('user_profiles','P0'), ('subscriptions','P0'), ('webhook_events','P0'),
         ('gs_tournament_entries','P0'), ('sessions','P0'), ('attempts','P0'),
         ('training_sessions','P0'), ('training_results','P0'),
         ('student_training_stats','P0'), ('student_stats','P0'),
         ('students','P0'), ('classes','P1'), ('schools','P1'),
         ('user_student_mapping','P0'), ('invitations','P0'), ('gift_codes','P1'),
         ('user_devices','P1'), ('active_sessions','P1'), ('auth_audit_log','P1'),
         ('content_store','P1')
),
rpc_critiques(fn) AS (
  VALUES ('check_session_active'), ('invalidate_user_sessions'),
         ('register_device'), ('revoke_device'), ('list_user_devices'),
         ('detect_suspicious_accounts'), ('cleanup_old_sessions'),
         ('cleanup_stale_devices'), ('cleanup_old_audit_logs')
),
whitelist(role_name) AS (
  VALUES ('admin'), ('editor'), ('user'), ('teacher'), ('cpd'), ('cpc'), ('rectorat')
),
tables_publiques AS (
  SELECT c.oid, c.relname AS tbl, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
),
grants_publics AS (
  SELECT g.table_name AS tbl, g.grantee,
         string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type) AS privileges
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public' AND g.grantee IN ('anon','authenticated')
   GROUP BY g.table_name, g.grantee
),
policies_permissives AS (
  SELECT p.tablename AS tbl, p.policyname, p.cmd,
         array_to_string(p.roles, ',') AS roles
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND (COALESCE(p.qual, '') = 'true' OR COALESCE(p.with_check, '') = 'true')
),
-- Droits d'exécution réellement accordés : `proacl IS NULL` signifie « EXECUTE
-- à PUBLIC », d'où `acldefault`. Le grantee 0 est le pseudo-rôle PUBLIC.
fonctions_exposees AS (
  SELECT p.proname,
         pg_get_function_identity_arguments(p.oid) AS args,
         p.prosecdef,
         (p.proconfig IS NOT NULL
          AND EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg
                       WHERE cfg LIKE 'search\_path=%')) AS search_path_fige,
         string_agg(DISTINCT COALESCE(r.rolname, 'PUBLIC'), ',') AS beneficiaires
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
   WHERE n.nspname = 'public'
     AND a.privilege_type = 'EXECUTE'
     AND (a.grantee = 0 OR r.rolname IN ('anon','authenticated'))
   GROUP BY p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.proconfig
),
contraintes_role AS (
  SELECT conrelid::regclass::text AS tbl, conname,
         pg_get_constraintdef(oid) AS definition, convalidated,
         (pg_get_constraintdef(oid) LIKE '%''cpd''%'
          AND pg_get_constraintdef(oid) LIKE '%''cpc''%') AS accepte_cpd_cpc
    FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND contype = 'c'
     AND conrelid::regclass::text IN ('user_profiles','invitations')
     AND pg_get_constraintdef(oid) LIKE '%role%'
),
profils AS (
  SELECT p.id, p.role,
         u.email AS auth_email,
         to_jsonb(p) ->> 'region'             AS region,
         to_jsonb(p) ->> 'circonscription_id' AS circonscription_id,
         u.last_sign_in_at
    FROM public.user_profiles p
    LEFT JOIN auth.users u ON u.id = p.id
),
entrees_gs AS (
  SELECT e.id, e.tournament_id,
         COALESCE(e.paid, false) AS paid,
         COALESCE(e.is_subscriber, false) AS is_subscriber,
         e.payment_id,
         COALESCE(to_jsonb(e) ->> 'joined_at',
                  to_jsonb(e) ->> 'created_at')::timestamptz AS date_entree,
         CASE
           WHEN e.payment_id IS NULL OR e.payment_id = '' THEN 'aucune_reference_de_paiement'
           WHEN e.payment_id NOT LIKE 'pi\_%' AND e.payment_id NOT LIKE 'cs\_%'
                AND e.payment_id NOT LIKE 'ch\_%'                THEN 'reference_non_stripe'
           ELSE 'a_reconcilier_avec_stripe'
         END AS verdict_provisoire
    FROM public.gs_tournament_entries e
   WHERE COALESCE(e.paid, false) = true
      OR COALESCE(e.is_subscriber, false) = true
      OR e.payment_id IS NOT NULL
),
doublons_abonnements AS (
  SELECT user_id, COUNT(*) AS occurrences
    FROM public.subscriptions
   GROUP BY user_id
  HAVING COUNT(*) > 1
),

-- ==========================================================================
-- 1. RLS sur les tables sensibles
-- ==========================================================================
r01 AS (
  SELECT 1 AS sec, 1 AS ord,
         '01. RLS' AS section,
         'rls_' || s.tbl AS check_name,
         CASE WHEN t.oid IS NULL THEN 'INFO'
              WHEN t.rls THEN 'OK'
              ELSE s.criticite END AS status,
         NULL::bigint AS nb,
         CASE WHEN t.oid IS NULL THEN 'table absente de ce schéma'
              WHEN t.rls THEN 'RLS activée' || CASE WHEN t.rls_forced THEN ' (FORCE)' ELSE '' END
              ELSE 'RLS DÉSACTIVÉE : la clé anon lit/écrit la table sans filtre'
         END AS details
    FROM sensibles s
    LEFT JOIN tables_publiques t ON t.tbl = s.tbl
),
-- ==========================================================================
-- 2. Policies permissives USING(true) / WITH CHECK(true)
-- ==========================================================================
r02 AS (
  SELECT 2, 1, '02. Policies permissives',
         pp.tbl || '.' || pp.policyname,
         COALESCE(s.criticite, 'INFO'),
         NULL::bigint,
         'cmd=' || pp.cmd || ' roles=' || pp.roles
           || ' — condition constante true'
           || CASE WHEN s.tbl IS NULL THEN ' (table non sensible : à confirmer comme volontairement publique)'
                   ELSE ' sur une table sensible' END
    FROM policies_permissives pp
    LEFT JOIN sensibles s ON s.tbl = pp.tbl
  UNION ALL
  SELECT 2, 0, '02. Policies permissives', 'total',
         CASE WHEN COUNT(*) = 0 THEN 'OK'
              WHEN COUNT(*) FILTER (WHERE s.tbl IS NOT NULL) > 0 THEN 'P0'
              ELSE 'REVIEW' END,
         COUNT(*),
         'policies avec qual/with_check = true, dont '
           || COUNT(*) FILTER (WHERE s.tbl IS NOT NULL) || ' sur une table sensible'
    FROM policies_permissives pp
    LEFT JOIN sensibles s ON s.tbl = pp.tbl
),
-- ==========================================================================
-- 3. Accès anon / authenticated aux tables sensibles
-- ==========================================================================
r03 AS (
  SELECT 3, 1, '03. Grants anon/authenticated',
         g.tbl || ' → ' || g.grantee,
         CASE WHEN s.tbl IS NULL THEN 'INFO'
              WHEN g.privileges ~ '(INSERT|UPDATE|DELETE|TRUNCATE)' THEN s.criticite
              ELSE 'REVIEW' END,
         NULL::bigint,
         'privilèges=' || g.privileges
           || CASE WHEN s.tbl IS NULL THEN ' (table hors périmètre sensible)'
                   ELSE ' — doit être filtré par une RLS restrictive' END
    FROM grants_publics g
    LEFT JOIN sensibles s ON s.tbl = g.tbl
),
-- Colonnes d'autorité : role, périmètre institutionnel, preuves de paiement.
r03b AS (
  SELECT 3, 2, '03. Grants anon/authenticated',
         'colonne_sensible ' || cp.table_name || '.' || cp.column_name || ' → ' || cp.grantee,
         'P0', NULL::bigint,
         'privilège=' || cp.privilege_type
           || ' — cette colonne ne doit jamais être écrite depuis le navigateur'
    FROM information_schema.column_privileges cp
   WHERE cp.table_schema = 'public'
     AND cp.grantee IN ('anon','authenticated')
     AND cp.privilege_type IN ('INSERT','UPDATE')
     AND cp.column_name IN ('role','region','circonscription_id','paid',
                            'is_subscriber','payment_id','licensed','access_code')
),
-- ==========================================================================
-- 4. Fonctions SECURITY DEFINER exposées
-- ==========================================================================
r04 AS (
  SELECT 4, 1, '04. SECURITY DEFINER exposées',
         f.proname || '(' || f.args || ')',
         CASE WHEN f.prosecdef AND NOT f.search_path_fige THEN 'P0'
              WHEN f.prosecdef THEN 'REVIEW'
              ELSE 'INFO' END,
         NULL::bigint,
         'EXECUTE accordé à ' || f.beneficiaires
           || CASE WHEN f.prosecdef THEN ' — SECURITY DEFINER' ELSE ' — SECURITY INVOKER' END
           || CASE WHEN f.prosecdef AND NOT f.search_path_fige
                   THEN ', search_path NON figé (détournement possible)' ELSE '' END
    FROM fonctions_exposees f
   WHERE f.prosecdef
  UNION ALL
  SELECT 4, 0, '04. SECURITY DEFINER exposées', 'total',
         CASE WHEN COUNT(*) = 0 THEN 'OK'
              WHEN COUNT(*) FILTER (WHERE NOT search_path_fige) > 0 THEN 'P0'
              ELSE 'REVIEW' END,
         COUNT(*),
         'fonctions SECURITY DEFINER exécutables par anon, authenticated ou PUBLIC, dont '
           || COUNT(*) FILTER (WHERE NOT search_path_fige) || ' sans search_path figé'
    FROM fonctions_exposees WHERE prosecdef
),
-- ==========================================================================
-- 5. État de user_profiles
-- ==========================================================================
r05 AS (
  SELECT 5, 1, '05. user_profiles', 'rls',
         CASE WHEN t.rls THEN 'OK' ELSE 'P0' END, NULL::bigint,
         CASE WHEN t.rls THEN 'RLS activée' ELSE 'RLS désactivée : escalade de rôle possible' END
    FROM tables_publiques t WHERE t.tbl = 'user_profiles'
  UNION ALL
  SELECT 5, 2, '05. user_profiles', 'ecriture_role_par_le_client',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'P0' END, COUNT(*),
         CASE WHEN COUNT(*) = 0
              THEN 'aucun UPDATE/INSERT accordé sur role/region/circonscription_id'
              ELSE 'colonnes d''autorité écrivables par ' || string_agg(DISTINCT cp.grantee, ',') END
    FROM information_schema.column_privileges cp
   WHERE cp.table_schema = 'public' AND cp.table_name = 'user_profiles'
     AND cp.grantee IN ('anon','authenticated')
     AND cp.privilege_type IN ('INSERT','UPDATE')
     AND cp.column_name IN ('role','region','circonscription_id')
  UNION ALL
  SELECT 5, 3, '05. user_profiles', 'trigger_de_garde',
         CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'REVIEW' END, COUNT(*),
         CASE WHEN COUNT(*) > 0 THEN 'trigger présent : ' || string_agg(tg.tgname, ',')
              ELSE 'aucun trigger de garde sur role (fourni par la migration 0200)' END
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'user_profiles' AND NOT tg.tgisinternal
  UNION ALL
  SELECT 5, 4, '05. user_profiles', 'repartition_des_roles', 'INFO', COUNT(*),
         COALESCE(string_agg(x.role || '=' || x.n, ', ' ORDER BY x.n DESC), 'aucun profil')
    FROM (SELECT COALESCE(role, '(null)') AS role, COUNT(*) AS n
            FROM public.user_profiles GROUP BY 1) x
),
-- ==========================================================================
-- 6. Comptes privilégiés — validation humaine ligne par ligne
-- ==========================================================================
r06 AS (
  SELECT 6, 1, '06. Comptes privilégiés',
         p.role || ' — ' || COALESCE(p.auth_email, 'compte auth absent'),
         'REVIEW', NULL::bigint,
         'id=' || p.id::text
           || COALESCE(' region=' || p.region, '')
           || COALESCE(' circonscription=' || p.circonscription_id, '')
           || ' dernière_connexion=' || COALESCE(p.last_sign_in_at::date::text, 'jamais')
           || ' — confirmer que ce compte détient légitimement ce rôle ; toute'
           || ' rétrogradation passe par POST /api/admin/set-role, jamais par SQL'
    FROM profils p
   WHERE p.role IN ('admin','teacher','cpd','cpc','rectorat','editor')
  UNION ALL
  SELECT 6, 0, '06. Comptes privilégiés', 'total', 'REVIEW', COUNT(*),
         COALESCE(string_agg(DISTINCT p.role, ', '), 'aucun') || ' — aucune suppression n''est proposée'
    FROM profils p
   WHERE p.role IN ('admin','teacher','cpd','cpc','rectorat','editor')
  UNION ALL
  SELECT 6, 2, '06. Comptes privilégiés', 'perimetre_incoherent',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVIEW' END, COUNT(*),
         CASE WHEN COUNT(*) = 0 THEN 'aucun rôle régional sans périmètre'
              ELSE string_agg(COALESCE(a.auth_email, a.id::text) || ' (' || a.role || ')', ', ') END
    FROM (SELECT * FROM profils
           WHERE (role IN ('cpd','cpc','rectorat')
                  AND (region IS NULL OR (role = 'cpc' AND circonscription_id IS NULL)))
              OR (role NOT IN ('cpd','cpc','rectorat')
                  AND (region IS NOT NULL OR circonscription_id IS NOT NULL))) a
  UNION ALL
  SELECT 6, 3, '06. Comptes privilégiés', 'invitations_privilegiees_ouvertes',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVIEW' END, COUNT(*),
         CASE WHEN COUNT(*) = 0 THEN 'aucune invitation privilégiée en attente'
              ELSE string_agg(inv.role || '→' || inv.destinataire, ', ') END
    FROM (SELECT i.email AS destinataire, i.role
            FROM public.invitations i
           WHERE COALESCE((to_jsonb(i) ->> 'used')::boolean, false) = false
             AND ((to_jsonb(i) ->> 'expires_at')::timestamptz IS NULL
                  OR (to_jsonb(i) ->> 'expires_at')::timestamptz > now())
             AND i.role IN ('admin','teacher','cpd','cpc','rectorat','editor')) inv
),
-- ==========================================================================
-- 7. Rôles hors whitelist serveur
-- ==========================================================================
r07 AS (
  SELECT 7, 1, '07. Rôles hors whitelist',
         'user_profiles.' || x.role,
         CASE WHEN x.role = 'student' THEN 'INFO' ELSE 'P1' END,
         x.n,
         CASE WHEN x.role = 'student'
              THEN 'écrit par le backend pour les comptes élèves : légitime en base, non attribuable par un administrateur, accepté par la migration 1200'
              ELSE 'valeur hors whitelist : BLOQUE la migration 1200, à régulariser à la main (POST /api/admin/set-role), jamais convertie automatiquement' END
    FROM (SELECT role, COUNT(*) AS n FROM public.user_profiles
           WHERE role IS NOT NULL
             AND role NOT IN (SELECT role_name FROM whitelist)
           GROUP BY role) x
  UNION ALL
  SELECT 7, 2, '07. Rôles hors whitelist', 'invitations.' || x.role, 'P1', x.n,
         'valeur hors whitelist : BLOQUE la migration 1200, invitation à corriger ou supprimer manuellement'
    FROM (SELECT role, COUNT(*) AS n FROM public.invitations
           WHERE role IS NOT NULL
             AND role NOT IN (SELECT role_name FROM whitelist)
           GROUP BY role) x
  UNION ALL
  SELECT 7, 0, '07. Rôles hors whitelist', 'total_bloquant_1200',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'P1' END, COUNT(*),
         'lignes dont le rôle empêcherait la migration 1200 (student exclu, il est autorisé)'
    FROM (SELECT 1 FROM public.user_profiles
           WHERE role IS NOT NULL AND role <> 'student'
             AND role NOT IN (SELECT role_name FROM whitelist)
          UNION ALL
          SELECT 1 FROM public.invitations
           WHERE role IS NOT NULL
             AND role NOT IN (SELECT role_name FROM whitelist)) b
),
-- ==========================================================================
-- 8. Contraintes CHECK réelles sur les rôles
-- ==========================================================================
r08 AS (
  SELECT 8, 1, '08. Contraintes CHECK role',
         c.tbl || '.' || c.conname,
         CASE WHEN NOT c.convalidated THEN 'P1'
              WHEN c.accepte_cpd_cpc THEN 'OK'
              ELSE 'P1' END,
         NULL::bigint,
         c.definition
           || CASE WHEN NOT c.convalidated THEN ' — CONTRAINTE NON VALIDÉE'
                   WHEN c.accepte_cpd_cpc THEN ' — accepte cpd/cpc'
                   ELSE ' — contrainte « génération rectorat » : PostgreSQL refusera toute invitation ou attribution cpd/cpc jusqu''à la migration 1200' END
    FROM contraintes_role c
  UNION ALL
  SELECT 8, 0, '08. Contraintes CHECK role', 'presence',
         CASE WHEN COUNT(*) = 0 THEN 'INFO' ELSE 'OK' END, COUNT(*),
         CASE WHEN COUNT(*) = 0
              THEN 'aucune contrainte CHECK sur role : la migration 1200 en installera une sur chaque table'
              ELSE 'contraintes trouvées sur user_profiles / invitations' END
    FROM contraintes_role
),
-- ==========================================================================
-- 9. Doublons subscriptions.user_id (bloquant migration 0500)
-- ==========================================================================
r09 AS (
  SELECT 9, 0, '09. subscriptions', 'doublons_user_id',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'P0' END, COUNT(*),
         CASE WHEN COUNT(*) = 0 THEN 'aucun doublon : la migration 0500 peut créer UNIQUE(user_id)'
              ELSE 'la migration 0500 ÉCHOUERA volontairement ; choisir quel abonnement conserver est une décision métier, aucune déduplication automatique'
         END
    FROM doublons_abonnements
  UNION ALL
  SELECT 9, 1, '09. subscriptions', 'unique_user_id_deja_present',
         CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'INFO' END, COUNT(*),
         CASE WHEN COUNT(*) > 0 THEN 'contrainte d''unicité déjà en place'
              ELSE 'pas encore d''unicité : `upsert onConflict user_id` reste non garanti côté base' END
    FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
     AND conrelid::regclass::text = 'subscriptions'
     AND contype IN ('u','p')
     AND pg_get_constraintdef(oid) LIKE '%(user_id)%'
),
-- ==========================================================================
-- 10. webhook_events
-- ==========================================================================
r10 AS (
  SELECT 10, 0, '10. webhook_events', 'existence',
         CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'P1' END, COUNT(*),
         CASE WHEN COUNT(*) > 0 THEN 'table présente'
              ELSE 'table absente : l''idempotence des webhooks Stripe n''est pas garantie en base (créée par la migration 0400)' END
    FROM tables_publiques WHERE tbl = 'webhook_events'
  UNION ALL
  SELECT 10, 1, '10. webhook_events', 'schema', 'INFO', COUNT(*),
         COALESCE(string_agg(col.column_name || ' ' || col.data_type, ', ' ORDER BY col.ordinal_position), 'aucune colonne')
    FROM information_schema.columns col
   WHERE col.table_schema = 'public' AND col.table_name = 'webhook_events'
),
-- ==========================================================================
-- 11. Entrées Grande Salle financières héritées
--     (LEGACY_GS_PAYMENT_RECONCILIATION_REQUIRED)
-- ==========================================================================
r11 AS (
  SELECT 11, 0, '11. GS entrées financières', 'LEGACY_GS_PAYMENT_RECONCILIATION_REQUIRED',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVIEW' END, COUNT(*),
         CASE WHEN COUNT(*) = 0 THEN 'aucune entrée financière héritée'
              ELSE 'la policy historique laissait le client écrire paid/is_subscriber/payment_id : aucune de ces lignes n''est une preuve de paiement. Réconcilier chaque payment_id avec Stripe (ou les paiements enregistrés côté serveur) avant d''accorder un droit ; la migration 0300 ferme l''écriture mais ne réécrit rien' END
    FROM entrees_gs
  UNION ALL
  SELECT 11, 1, '11. GS entrées financières', 'verdict:' || v.verdict_provisoire,
         'REVIEW', v.n,
         'paid=' || v.paid_n || ' is_subscriber=' || v.sub_n || ' avec_payment_id=' || v.pid_n
    FROM (SELECT verdict_provisoire,
                 COUNT(*) AS n,
                 COUNT(*) FILTER (WHERE paid) AS paid_n,
                 COUNT(*) FILTER (WHERE is_subscriber) AS sub_n,
                 COUNT(*) FILTER (WHERE payment_id IS NOT NULL AND payment_id <> '') AS pid_n
            FROM entrees_gs GROUP BY verdict_provisoire) v
  UNION ALL
  -- Détail par ligne, sans e-mail : l'identifiant suffit à retrouver la ligne
  -- pour la réconciliation administrative privée.
  SELECT 11, 2, '11. GS entrées financières',
         'entree ' || g.id::text, 'REVIEW', NULL::bigint,
         'tournoi=' || COALESCE(g.tournament_id::text, 'null')
           || ' paid=' || g.paid || ' is_subscriber=' || g.is_subscriber
           || ' payment_id=' || COALESCE(NULLIF(g.payment_id, ''), 'aucun')
           || ' date=' || COALESCE(g.date_entree::date::text, 'inconnue')
           || ' → ' || g.verdict_provisoire
    FROM (SELECT * FROM entrees_gs ORDER BY date_entree NULLS LAST, id LIMIT 200) g
),
-- ==========================================================================
-- 12. Comptes élèves sans user_student_mapping
-- ==========================================================================
r12 AS (
  SELECT 12, 0, '12. Comptes élèves', 'comptes_eleve_sans_mapping',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVIEW' END, COUNT(*),
         'comptes @eleve.crazychrono.app sans user_student_mapping actif — l''e-mail n''est pas une preuve d''identité : aucun backfill automatique n''est proposé (LEGACY_STUDENT_MAPPING_REQUIRED)'
    FROM auth.users u
   WHERE u.email LIKE '%@eleve.crazychrono.app'
     AND NOT EXISTS (SELECT 1 FROM public.user_student_mapping m
                      WHERE m.user_id = u.id AND m.active = true)
  UNION ALL
  SELECT 12, 1, '12. Comptes élèves', 'eleves_licencies_sans_mapping',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVIEW' END, COUNT(*),
         'élèves licenciés sans compte rattaché : perdront l''accès licencié tant que le mapping n''est pas créé (comportement fail-closed voulu)'
    FROM public.students s
   WHERE s.licensed = true
     AND NOT EXISTS (SELECT 1 FROM public.user_student_mapping m
                      WHERE m.student_id = s.id AND m.active = true)
  UNION ALL
  SELECT 12, 2, '12. Comptes élèves', 'volumetrie', 'INFO', COUNT(*),
         'élèves au total, dont ' || COUNT(*) FILTER (WHERE licensed = true) || ' licenciés'
    FROM public.students
  UNION ALL
  SELECT 12, 3, '12. Comptes élèves', 'mappings_actifs', 'INFO', COUNT(*),
         'lignes user_student_mapping actives'
    FROM public.user_student_mapping WHERE active = true
),
-- ==========================================================================
-- 13. État consolidé des tables applicatives
-- ==========================================================================
r13 AS (
  SELECT 13, 1, '13. État des tables',
         s.tbl,
         CASE WHEN t.oid IS NULL THEN 'INFO'
              WHEN NOT t.rls THEN s.criticite
              WHEN COALESCE(pol.n, 0) = 0 THEN 'REVIEW'
              WHEN COALESCE(perm.n, 0) > 0 THEN s.criticite
              ELSE 'OK' END,
         COALESCE(pol.n, 0),
         CASE WHEN t.oid IS NULL THEN 'table absente'
              ELSE 'rls=' || t.rls
                   || ' policies=' || COALESCE(pol.n, 0)
                   || ' permissives_true=' || COALESCE(perm.n, 0)
                   || ' grants_client=' || COALESCE(gr.liste, 'aucun')
         END
    FROM sensibles s
    LEFT JOIN tables_publiques t ON t.tbl = s.tbl
    LEFT JOIN (SELECT tablename, COUNT(*) AS n FROM pg_policies
                WHERE schemaname = 'public' GROUP BY tablename) pol ON pol.tablename = s.tbl
    LEFT JOIN (SELECT tbl, COUNT(*) AS n FROM policies_permissives GROUP BY tbl) perm ON perm.tbl = s.tbl
    LEFT JOIN (SELECT tbl, string_agg(grantee || '(' || privileges || ')', ' ') AS liste
                 FROM grants_publics GROUP BY tbl) gr ON gr.tbl = s.tbl
),
-- ==========================================================================
-- 14. RPC critiques
-- ==========================================================================
r14 AS (
  SELECT 14, 1, '14. RPC critiques', c.fn,
         CASE WHEN f.proname IS NULL THEN 'INFO'
              WHEN f.prosecdef AND NOT f.search_path_fige THEN 'P0'
              WHEN f.prosecdef THEN 'P1'
              ELSE 'REVIEW' END,
         NULL::bigint,
         CASE WHEN f.proname IS NULL
              THEN 'fonction absente, ou déjà fermée à anon/authenticated/PUBLIC (la migration 1000 ne durcit que les signatures réellement présentes)'
              ELSE 'signature=(' || f.args || ') EXECUTE accordé à ' || f.beneficiaires
                   || CASE WHEN f.prosecdef THEN ' — SECURITY DEFINER' ELSE '' END
                   || CASE WHEN f.prosecdef AND NOT f.search_path_fige
                           THEN ', search_path NON figé' ELSE '' END
                   || ' : à révoquer, l''appel doit passer par le backend service role'
         END
    FROM rpc_critiques c
    LEFT JOIN fonctions_exposees f ON f.proname = c.fn
),
-- ==========================================================================
-- 15. Bloqueurs à l'application des migrations CTO-005A
-- ==========================================================================
r15 AS (
  SELECT 15, 1, '15. Bloqueurs migrations', 'migration_0500_subscriptions_unique',
         CASE WHEN (SELECT COUNT(*) FROM doublons_abonnements) = 0 THEN 'OK' ELSE 'P0' END,
         (SELECT COUNT(*) FROM doublons_abonnements),
         'doublons subscriptions.user_id — la migration 0500 échoue tant qu''ils existent'
  UNION ALL
  SELECT 15, 2, '15. Bloqueurs migrations', 'migration_1200_role_constraints',
         CASE WHEN (SELECT COUNT(*) FROM (
                      SELECT 1 FROM public.user_profiles
                       WHERE role IS NOT NULL AND role <> 'student'
                         AND role NOT IN (SELECT role_name FROM whitelist)
                      UNION ALL
                      SELECT 1 FROM public.invitations
                       WHERE role IS NOT NULL
                         AND role NOT IN (SELECT role_name FROM whitelist)) z) = 0
              THEN 'OK' ELSE 'P1' END,
         (SELECT COUNT(*) FROM (
            SELECT 1 FROM public.user_profiles
             WHERE role IS NOT NULL AND role <> 'student'
               AND role NOT IN (SELECT role_name FROM whitelist)
            UNION ALL
            SELECT 1 FROM public.invitations
             WHERE role IS NOT NULL
               AND role NOT IN (SELECT role_name FROM whitelist)) z),
         'valeurs de role hors whitelist — la migration 1200 s''arrête sans convertir'
  UNION ALL
  SELECT 15, 3, '15. Bloqueurs migrations', 'tables_ciblees_absentes',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVIEW' END, COUNT(*),
         CASE WHEN COUNT(*) = 0 THEN 'toutes les tables ciblées existent'
              ELSE 'absentes : ' || string_agg(s.tbl, ', ')
                   || ' — les migrations correspondantes créeront ou ignoreront ces objets, à vérifier avant application' END
    FROM sensibles s
    LEFT JOIN tables_publiques t ON t.tbl = s.tbl
   WHERE t.oid IS NULL
  UNION ALL
  SELECT 15, 4, '15. Bloqueurs migrations', 'user_id_non_uuid',
         CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'P1' END, COUNT(*),
         CASE WHEN COUNT(*) = 0 THEN 'toutes les colonnes user_id comparables à auth.uid()'
              ELSE 'colonnes user_id non-uuid : ' || string_agg(col.table_name || '.' || col.column_name || ' ' || col.data_type, ', ')
                   || ' — les policies comparant user_id = auth.uid() doivent être adaptées' END
    FROM information_schema.columns col
   WHERE col.table_schema = 'public' AND col.column_name = 'user_id'
     AND col.data_type <> 'uuid'
  UNION ALL
  SELECT 15, 5, '15. Bloqueurs migrations', 'entrees_gs_a_reconcilier',
         CASE WHEN (SELECT COUNT(*) FROM entrees_gs) = 0 THEN 'OK' ELSE 'REVIEW' END,
         (SELECT COUNT(*) FROM entrees_gs),
         'non bloquant techniquement : la migration 0300 ferme l''écriture, la réconciliation Stripe reste à faire'
),
rapport AS (
  SELECT * FROM r01 UNION ALL SELECT * FROM r02 UNION ALL SELECT * FROM r03
  UNION ALL SELECT * FROM r03b UNION ALL SELECT * FROM r04 UNION ALL SELECT * FROM r05
  UNION ALL SELECT * FROM r06 UNION ALL SELECT * FROM r07 UNION ALL SELECT * FROM r08
  UNION ALL SELECT * FROM r09 UNION ALL SELECT * FROM r10 UNION ALL SELECT * FROM r11
  UNION ALL SELECT * FROM r12 UNION ALL SELECT * FROM r13 UNION ALL SELECT * FROM r14
  UNION ALL SELECT * FROM r15
),
synthese AS (
  SELECT 0 AS sec, 0 AS ord, '00. Synthèse' AS section,
         'statut_' || st.status AS check_name,
         st.status, st.n AS nb,
         CASE st.status
           WHEN 'P0' THEN 'bloquants sécurité : à traiter avant toute mise en avant commerciale'
           WHEN 'P1' THEN 'à corriger avant application complète de CTO-005A'
           WHEN 'REVIEW' THEN 'décisions humaines requises (comptes, paiements, mappings)'
           WHEN 'OK' THEN 'contrôles conformes'
           ELSE 'inventaire, aucune action'
         END AS details
    FROM (SELECT status, COUNT(*) AS n FROM rapport GROUP BY status) st
  UNION ALL
  SELECT 0, 1, '00. Synthèse', 'verdict',
         CASE WHEN EXISTS (SELECT 1 FROM rapport WHERE status = 'P0') THEN 'P0'
              WHEN EXISTS (SELECT 1 FROM rapport WHERE status = 'P1') THEN 'P1'
              WHEN EXISTS (SELECT 1 FROM rapport WHERE status = 'REVIEW') THEN 'REVIEW'
              ELSE 'OK' END,
         (SELECT COUNT(*) FROM rapport),
         'contrôles consolidés — rapport strictement lecture seule, aucune donnée modifiée, aucune suppression proposée'
)
SELECT section,
       check_name,
       status,
       nb AS "count",
       details
  FROM (SELECT * FROM synthese UNION ALL SELECT * FROM rapport) final
 ORDER BY sec,
          CASE status WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 WHEN 'REVIEW' THEN 3
                      WHEN 'OK' THEN 4 ELSE 5 END,
          ord,
          check_name;
