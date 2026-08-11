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
-- ALLOWLIST — helpers d'identité `public.cc_*` :
--   Les expressions de policy s'évaluent avec les droits de l'appelant : sans
--   EXECUTE pour `authenticated`, toute lecture RLS échouerait. Ils sont
--   STABLE, sans argument, ne renvoient que le périmètre de l'appelant déduit
--   de auth.uid(), et restent interdits à PUBLIC/anon (vérifié ci-dessous).
-- ==========================================================================

DO $$
DECLARE
  r RECORD;
  v_exposed TEXT[] := '{}';
  v_anon_leak TEXT[] := '{}';
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig,
           p.proname,
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
    -- Allowlist : helpers d'identité, autorisés à `authenticated` uniquement.
    IF r.proname LIKE 'cc\_%' THEN
      IF r.anon_ok OR r.public_ok THEN
        v_anon_leak := v_anon_leak || r.sig;
      END IF;
      CONTINUE;
    END IF;

    IF r.anon_ok OR r.auth_ok OR r.public_ok THEN
      v_exposed := v_exposed || (r.sig || ' [' ||
        CASE WHEN r.public_ok THEN 'PUBLIC ' ELSE '' END ||
        CASE WHEN r.anon_ok   THEN 'anon '   ELSE '' END ||
        CASE WHEN r.auth_ok   THEN 'authenticated' ELSE '' END || ']');
    END IF;
  END LOOP;

  IF array_length(v_anon_leak, 1) > 0 THEN
    RAISE EXCEPTION
      'CTO-005A: helper d''identité exposé à PUBLIC/anon : %. Analyser avant toute révocation.',
      array_to_string(v_anon_leak, ', ');
  END IF;

  IF array_length(v_exposed, 1) > 0 THEN
    RAISE EXCEPTION
      'CTO-005A: % fonction(s) SECURITY DEFINER encore exécutable(s) par un rôle client : %. Analyser chaque fonction (usage réel, trigger, RPC) puis la durcir dans 20260810_1000_cto005_rpc_hardening.sql ou la documenter dans l''allowlist. CTO-005A ne peut pas être déclaré réussi avec une exposition inconnue.',
      array_length(v_exposed, 1), array_to_string(v_exposed, ', ');
  END IF;

  RAISE NOTICE 'CTO-005A 1300: aucune fonction SECURITY DEFINER du schéma public n''est exécutable par PUBLIC/anon/authenticated (hors helpers cc_*).';
END $$;
