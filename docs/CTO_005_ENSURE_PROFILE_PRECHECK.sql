-- ==========================================================================
-- CTO-005A — PRECHECK ensure_profile() — STRICTEMENT READ-ONLY
--
-- Contexte : le rapport de production a trouvé `public.ensure_profile()`
-- SECURITY DEFINER et exécutable par un rôle client. Cette fonction n'existe
-- dans AUCUN fichier du dépôt : son corps, son propriétaire et ses déclencheurs
-- sont inconnus. CTO-005A ne modifie donc ni son corps ni son `search_path` ;
-- elle ferme seulement son accès client. Ce script fournit au CTO les éléments
-- nécessaires pour arbitrer entre : (A) durcir, (B) ne fermer que l'accès
-- client, (C) versionner une définition, (D) supprimer si morte.
--
-- MODE D'EMPLOI : copier-coller l'INTÉGRALITÉ de ce fichier dans Supabase SQL
-- Editor, puis Run. Une seule instruction, un seul result set. Aucune adaptation
-- de colonne ou de schéma n'est nécessaire.
--
-- GARANTIES :
--   * une unique instruction SELECT (un seul `;`, à la fin) ;
--   * aucun CREATE / ALTER / DROP / INSERT / UPDATE / DELETE / GRANT / REVOKE ;
--   * aucune fonction temporaire, aucune table temporaire ;
--   * lecture des catalogues uniquement (pg_proc, pg_trigger, pg_namespace,
--     information_schema, aclexplode) ;
--   * exécutable dans `BEGIN TRANSACTION READ ONLY; … ROLLBACK;`.
--
-- ATTENTION : `fonction_definition` restitue le CODE de la fonction. Ne pas
-- publier la sortie si ce code contient un secret. Aucune sortie de ce script ne
-- doit être commitée.
--
-- Colonnes : section | check_name | status | count | details
--   status : OK | REVIEW | P0 | P1 | INFO
-- ==========================================================================

WITH ep AS (
  -- Toutes les fonctions nommées `ensure_profile`, surcharges incluses.
  SELECT p.oid,
         format('%I.%I(%s)', n.nspname, p.proname,
                pg_get_function_identity_arguments(p.oid)) AS sig,
         p.proname,
         p.proowner,
         p.proowner::regrole::text AS owner,
         l.lanname AS lang,
         p.prosecdef,
         p.provolatile,
         p.proconfig,
         p.proacl,
         pg_get_functiondef(p.oid) AS def,
         pg_get_function_result(p.oid) AS result_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE p.proname = 'ensure_profile'
),
trg AS (
  -- Triggers dont la fonction exécutée est une de ces fonctions.
  SELECT t.oid AS trg_oid,
         ep.sig,
         t.tgname,
         format('%I.%I', tn.nspname, tc.relname) AS table_name,
         t.tgenabled,
         pg_get_triggerdef(t.oid) AS trg_def
    FROM pg_trigger t
    JOIN ep ON ep.oid = t.tgfoid
    JOIN pg_class tc ON tc.oid = t.tgrelid
    JOIN pg_namespace tn ON tn.oid = tc.relnamespace
   WHERE NOT t.tgisinternal
),
acl AS (
  -- Privilèges EXECUTE effectifs, défaut PostgreSQL inclus quand proacl est NULL.
  SELECT ep.sig,
         COALESCE(a.grantee::regrole::text, 'PUBLIC') AS grantee,
         a.privilege_type
    FROM ep
    CROSS JOIN LATERAL aclexplode(COALESCE(ep.proacl, acldefault('f', ep.proowner))) a
),
rpt AS (
  -- ── 1. Existence et signature ──────────────────────────────────────────
  SELECT '01. existence' AS section,
         'ensure_profile présente dans la base' AS check_name,
         CASE WHEN (SELECT count(*) FROM ep) = 0 THEN 'INFO' ELSE 'REVIEW' END AS status,
         (SELECT count(*) FROM ep)::bigint AS count,
         COALESCE((SELECT string_agg(sig, ' | ' ORDER BY sig) FROM ep),
                  'aucune fonction ensure_profile : rien à arbitrer, retirer la fonction de la liste non versionnée de la migration 1000') AS details

  -- ── 2. Surcharges ──────────────────────────────────────────────────────
  UNION ALL
  SELECT '02. surcharges',
         'nombre de surcharges de ensure_profile',
         CASE WHEN (SELECT count(*) FROM ep) > 1 THEN 'REVIEW' ELSE 'OK' END,
         (SELECT count(*) FROM ep),
         CASE WHEN (SELECT count(*) FROM ep) > 1
              THEN 'plusieurs signatures : chacune doit être arbitrée séparément — ' ||
                   (SELECT string_agg(sig, ' | ' ORDER BY sig) FROM ep)
              ELSE 'une seule signature (ou aucune)' END

  -- ── 3. Propriétaire ────────────────────────────────────────────────────
  UNION ALL
  SELECT '03. propriétaire', 'propriétaire de ' || ep.sig, 'INFO', NULL::bigint,
         'owner = ' || ep.owner ||
         ' — une fonction SECURITY DEFINER s''exécute avec les droits de ce rôle'
    FROM ep

  -- ── 4. Langage / volatilité / type de retour ───────────────────────────
  UNION ALL
  SELECT '04. définition', 'langage et retour de ' || ep.sig, 'INFO', NULL::bigint,
         'language = ' || ep.lang ||
         ' | volatilité = ' || CASE ep.provolatile WHEN 'i' THEN 'IMMUTABLE'
                                                   WHEN 's' THEN 'STABLE'
                                                   ELSE 'VOLATILE' END ||
         ' | retourne ' || ep.result_type
    FROM ep

  -- ── 5. SECURITY DEFINER ────────────────────────────────────────────────
  UNION ALL
  SELECT '05. security definer', 'SECURITY DEFINER sur ' || ep.sig,
         CASE WHEN ep.prosecdef THEN 'REVIEW' ELSE 'OK' END, NULL::bigint,
         CASE WHEN ep.prosecdef
              THEN 'OUI — s''exécute avec les droits de ' || ep.owner ||
                   ', donc au-dessus de la RLS de l''appelant'
              ELSE 'NON (SECURITY INVOKER) — s''exécute avec les droits de l''appelant' END
    FROM ep

  -- ── 6. search_path / configuration actuelle ────────────────────────────
  UNION ALL
  SELECT '06. search_path', 'configuration de ' || ep.sig,
         CASE
           WHEN NOT ep.prosecdef THEN 'OK'
           WHEN ep.proconfig IS NULL THEN 'P1'
           WHEN EXISTS (SELECT 1 FROM unnest(ep.proconfig) c WHERE c LIKE 'search_path=%') THEN 'OK'
           ELSE 'P1'
         END, NULL::bigint,
         CASE
           WHEN ep.proconfig IS NULL
             THEN 'AUCUN search_path figé : une fonction SECURITY DEFINER est détournable via un schéma temporaire. Décider (A) ALTER FUNCTION … SET search_path, après lecture du corps ci-dessous, car cela peut changer la résolution des noms qu''elle utilise'
           ELSE 'proconfig = ' || array_to_string(ep.proconfig, ' ; ')
         END
    FROM ep

  -- ── 7. Corps complet ───────────────────────────────────────────────────
  UNION ALL
  SELECT '07. corps', 'pg_get_functiondef(' || ep.sig || ')', 'REVIEW', NULL::bigint,
         ep.def
    FROM ep

  -- ── 8. Schémas et objets référencés (indice de dépendance) ─────────────
  UNION ALL
  SELECT '08. dépendances', 'schémas cités dans le corps de ' || ep.sig, 'INFO', NULL::bigint,
         'auth.* : ' || CASE WHEN ep.def ~* '\mauth\.' THEN 'oui' ELSE 'non' END ||
         ' | public.* explicite : ' || CASE WHEN ep.def ~* '\mpublic\.' THEN 'oui' ELSE 'non' END ||
         ' | auth.uid() : ' || CASE WHEN ep.def ~* 'auth\.uid\s*\(' THEN 'oui' ELSE 'non' END ||
         ' | écritures (INSERT/UPDATE/DELETE) : ' ||
           CASE WHEN ep.def ~* '\m(insert|update|delete)\M' THEN 'oui' ELSE 'non' END ||
         ' | noms non qualifiés → sensibles au search_path : ' ||
           CASE WHEN ep.def ~* '\m(from|join|into|update)\s+[a-z_][a-z0-9_]*\M' THEN 'probable' ELSE 'peu probable' END
    FROM ep

  -- ── 9. Triggers utilisant la fonction ──────────────────────────────────
  UNION ALL
  SELECT '09. triggers', 'triggers exécutant ensure_profile',
         CASE WHEN (SELECT count(*) FROM trg) > 0 THEN 'REVIEW' ELSE 'OK' END,
         (SELECT count(*) FROM trg),
         COALESCE((SELECT string_agg(tgname || ' sur ' || table_name, ' | ' ORDER BY tgname) FROM trg),
                  'aucun trigger : la fonction n''est appelée ni par un trigger versionné ni par un trigger production')

  UNION ALL
  SELECT '09. triggers', 'trigger ' || trg.tgname, 'REVIEW', NULL::bigint,
         'table = ' || trg.table_name ||
         ' | état = ' || CASE trg.tgenabled WHEN 'O' THEN 'ACTIF (origin)'
                                            WHEN 'D' THEN 'DÉSACTIVÉ'
                                            WHEN 'R' THEN 'ACTIF (replica)'
                                            WHEN 'A' THEN 'ACTIF (always)'
                                            ELSE trg.tgenabled::text END ||
         ' | définition = ' || trg.trg_def
    FROM trg

  -- ── 10. Privilèges EXECUTE ─────────────────────────────────────────────
  UNION ALL
  SELECT '10. privilèges', 'EXECUTE ' || g.grantee || ' sur ' || ep.sig,
         CASE
           WHEN g.grantee IN ('PUBLIC', 'anon') THEN 'P0'
           WHEN g.grantee = 'authenticated' THEN 'P1'
           WHEN g.grantee = 'service_role' THEN 'OK'
           ELSE 'INFO'
         END, NULL::bigint,
         CASE
           WHEN g.grantee IN ('PUBLIC', 'anon')
             THEN 'appelable SANS authentification via PostgREST'
           WHEN g.grantee = 'authenticated'
             THEN 'appelable par tout utilisateur connecté via PostgREST'
           ELSE 'privilège EXECUTE détenu par ' || g.grantee
         END
    FROM ep
    JOIN (SELECT DISTINCT sig, grantee FROM acl WHERE privilege_type = 'EXECUTE') g
      ON g.sig = ep.sig

  UNION ALL
  SELECT '10. privilèges', 'rôles client sans EXECUTE (contrôle explicite)', 'OK', NULL::bigint,
         'rôles NE POSSÉDANT PAS EXECUTE : ' ||
         COALESCE(NULLIF((SELECT string_agg(x, ', ')
                            FROM unnest(ARRAY['PUBLIC','anon','authenticated','service_role']) x
                           WHERE NOT EXISTS (SELECT 1 FROM acl
                                              WHERE acl.privilege_type = 'EXECUTE'
                                                AND acl.grantee = x)), ''),
                  'aucun — les 4 rôles listés détiennent EXECUTE')
   WHERE EXISTS (SELECT 1 FROM ep)

  -- ── 11. CREATE sur le schéma public pour les rôles client ──────────────
  --      Un rôle client capable de créer un objet dans `public` peut détourner
  --      une fonction SECURITY DEFINER sans search_path figé.
  UNION ALL
  SELECT '11. schéma public', 'CREATE sur public pour ' || x AS check_name,
         CASE WHEN has_schema_privilege(x, 'public', 'CREATE') THEN 'P0' ELSE 'OK' END,
         NULL::bigint,
         CASE WHEN has_schema_privilege(x, 'public', 'CREATE')
              THEN 'ce rôle peut créer des objets dans public → détournement possible d''une SECURITY DEFINER sans search_path figé'
              ELSE 'aucun privilège CREATE sur le schéma public' END
    FROM unnest(ARRAY['anon','authenticated']) x

  -- ── 12. Synthèse d'arbitrage ───────────────────────────────────────────
  UNION ALL
  SELECT '99. arbitrage', 'décision attendue du CTO',
         CASE WHEN (SELECT count(*) FROM ep) = 0 THEN 'INFO' ELSE 'REVIEW' END,
         NULL::bigint,
         CASE
           WHEN (SELECT count(*) FROM ep) = 0
             THEN 'fonction absente : aucune décision nécessaire'
           WHEN (SELECT count(*) FROM trg) > 0
             THEN 'la fonction alimente ' || (SELECT count(*) FROM trg) ||
                  ' trigger(s) : elle est VIVANTE. Options (A) durcir search_path après lecture du corps, (B) se limiter à la fermeture de l''accès client — déjà faite par la migration 1000, (C) versionner la définition. Ne pas supprimer.'
           WHEN EXISTS (SELECT 1 FROM acl WHERE privilege_type = 'EXECUTE'
                                            AND grantee IN ('PUBLIC','anon','authenticated'))
             THEN 'aucun trigger, mais accès client ouvert : la migration 1000 le ferme (option B). Décider ensuite (A) durcissement du search_path, (C) définition versionnée, ou (D) suppression si le corps prouve qu''elle est morte.'
           ELSE 'aucun trigger, aucun accès client : candidate à (C) versionnement ou (D) suppression ultérieure, après confirmation qu''aucun code serveur ne l''appelle.'
         END
)
SELECT section, check_name, status, count, details
  FROM rpt
 ORDER BY section, status DESC, check_name;
