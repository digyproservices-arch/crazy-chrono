-- ==========================================================================
-- CTO-005A — 1300 — Assertion finale SECURITY DEFINER (fail-closed)
--
-- Le durcissement 1000 repose sur une liste nominative de fonctions. Une
-- fonction créée hors dépôt (comme `ensure_profile`, découverte uniquement par
-- le rapport de production) échapperait à cette liste. Cette migration ferme la
-- boucle : après CTO-005A, AUCUNE fonction SECURITY DEFINER du schéma public ne
-- doit rester exécutable par PUBLIC, anon ou authenticated, en dehors d'une
-- allowlist explicite et justifiée.
--
-- Elle ne révoque rien : elle échoue en nommant la ou les signatures exposées,
-- pour qu'un humain analyse la fonction avant toute décision.
--
-- ALLOWLIST — SIGNATURES EXACTES, PAS DE MOTIF DE NOM.
--   Un préfixe (`cc\_%`) autoriserait n'importe quelle fonction future baptisée
--   `cc_debug()`, `cc_admin()`, `cc_evil()`, ou une surcharge inattendue comme
--   `cc_current_role(text)`. L'allowlist ci-dessous énumère donc les 11 helpers
--   d'identité créés par 20260810_0100_cto005_helpers.sql, avec leur liste
--   d'arguments (toutes sans argument). Toute autre fonction — y compris un
--   autre `cc_*` — relève de la règle générale et fait échouer cette migration
--   si elle est exposée à un rôle client.
--
--   Justification de `EXECUTE authenticated` : les expressions de policy
--   s'évaluent avec les droits de l'appelant ; sans ce privilège toute lecture
--   RLS échouerait. Ces helpers sont STABLE, sans argument, et ne renvoient que
--   le périmètre de l'appelant déduit de auth.uid().
--
--   Chaque helper allowlisté est vérifié sur son contrat COMPLET : signature
--   présente, SECURITY DEFINER, search_path figé à `public, pg_temp`,
--   PUBLIC : non, anon : non, authenticated : OUI. Ce dernier point est un
--   contrôle d'intégrité et non une tolérance : un helper dont `authenticated`
--   a perdu l'EXECUTE rend toute lecture RLS impossible pour les utilisateurs
--   connectés — une panne silencieuse que l'assertion doit nommer. Cette
--   permission ne vaut QUE pour ces 11 signatures ; pour toute autre fonction,
--   `authenticated` reste un motif d'échec.
-- ==========================================================================

DO $$
DECLARE
  r RECORD;
  v_allow TEXT[] := ARRAY[
    'public.cc_current_role()',
    'public.cc_is_admin()',
    'public.cc_is_manager()',
    'public.cc_current_email()',
    'public.cc_my_circonscription()',
    'public.cc_my_region()',
    'public.cc_my_student_ids()',
    'public.cc_my_class_ids()',
    'public.cc_managed_class_ids()',
    'public.cc_visible_class_ids()',
    'public.cc_visible_school_ids()'
  ];
  v_seen TEXT[] := '{}';
  v_missing TEXT[] := '{}';
  v_exposed TEXT[] := '{}';
  v_helper_bad TEXT[] := '{}';
  v_sig TEXT;
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig,
           p.prosecdef,
           COALESCE(p.proconfig, '{}'::text[]) AS proconfig,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_ok,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
           EXISTS (
             SELECT 1
               FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
              WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
           ) AS public_ok
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
     ORDER BY 1
  LOOP
    IF r.sig = ANY(v_allow) THEN
      v_seen := v_seen || r.sig;

      -- Un helper allowlisté doit rester exactement dans son contrat.
      IF r.public_ok THEN
        v_helper_bad := v_helper_bad || (r.sig || ' [EXECUTE PUBLIC]');
      END IF;
      IF r.anon_ok THEN
        v_helper_bad := v_helper_bad || (r.sig || ' [EXECUTE anon]');
      END IF;
      IF NOT r.auth_ok THEN
        v_helper_bad := v_helper_bad || (r.sig || ' [EXECUTE authenticated manquant]');
      END IF;
      IF NOT r.prosecdef THEN
        v_helper_bad := v_helper_bad || (r.sig || ' [SECURITY INVOKER]');
      END IF;
      IF NOT ('search_path=public, pg_temp' = ANY(r.proconfig)) THEN
        v_helper_bad := v_helper_bad || (r.sig || ' [search_path non figé : ' ||
          COALESCE(array_to_string(r.proconfig, ' '), '(aucun)') || ']');
      END IF;

      CONTINUE;
    END IF;

    -- Règle générale : toute autre fonction SECURITY DEFINER, y compris une
    -- fonction `cc_*` non allowlistée ou une surcharge inattendue.
    IF r.anon_ok OR r.auth_ok OR r.public_ok THEN
      v_exposed := v_exposed || (r.sig || ' [' ||
        CASE WHEN r.public_ok THEN 'PUBLIC ' ELSE '' END ||
        CASE WHEN r.anon_ok   THEN 'anon '   ELSE '' END ||
        CASE WHEN r.auth_ok   THEN 'authenticated' ELSE '' END || ']');
    END IF;
  END LOOP;

  -- L'allowlist doit décrire la réalité : un helper manquant signifie que les
  -- policies ne peuvent pas s'évaluer, ou que 0100 n'a pas été appliquée.
  FOREACH v_sig IN ARRAY v_allow LOOP
    IF NOT (v_sig = ANY(v_seen)) THEN
      v_missing := v_missing || v_sig;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'CTO-005A: helper(s) d''identité SECURITY DEFINER absent(s) : %. Appliquer 20260810_0100_cto005_helpers.sql avant cette assertion.',
      array_to_string(v_missing, ', ');
  END IF;

  IF array_length(v_helper_bad, 1) > 0 THEN
    RAISE EXCEPTION
      'CTO-005A: helper(s) allowlisté(s) hors contrat : %. Analyser avant toute révocation.',
      array_to_string(v_helper_bad, ', ');
  END IF;

  IF array_length(v_exposed, 1) > 0 THEN
    RAISE EXCEPTION
      'CTO-005A: % fonction(s) SECURITY DEFINER encore exécutable(s) par un rôle client : %. Analyser chaque fonction (usage réel, trigger, RPC) puis la durcir dans 20260810_1000_cto005_rpc_hardening.sql ; l''ajout à l''allowlist de cette migration exige une signature exacte et une justification écrite. CTO-005A ne peut pas être déclaré réussi avec une exposition inconnue.',
      array_length(v_exposed, 1), array_to_string(v_exposed, ', ');
  END IF;

  RAISE NOTICE 'CTO-005A 1300: aucune fonction SECURITY DEFINER du schéma public n''est exécutable par PUBLIC/anon/authenticated, hors les % helpers d''identité allowlistés par signature exacte.', array_length(v_allow, 1);
END $$;
