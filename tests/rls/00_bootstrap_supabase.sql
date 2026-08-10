-- ==========================================================================
-- CTO-005A — Harness local : émulation minimale de Supabase sur PostgreSQL 15
--
-- Reproduit ce dont les migrations et les policies ont besoin :
--   * les rôles anon / authenticated / service_role ;
--   * le schéma auth, auth.users et auth.uid() lisant le claim JWT
--     (`request.jwt.claim.sub`), exactement comme PostgREST/GoTrue ;
--   * le comportement PostgREST : SET ROLE <rôle du JWT> pour chaque requête.
--
-- CE FICHIER N'EST JAMAIS EXÉCUTÉ CONTRE SUPABASE. Il ne sert qu'au conteneur
-- PostgreSQL jetable de tests/rls/run_rls_tests.sh.
-- ==========================================================================

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth   TO anon, authenticated, service_role;

-- Supabase accorde tous les privilèges de table au service_role (qui, en plus,
-- est BYPASSRLS). On reproduit ce défaut pour ne pas tester un service_role
-- artificiellement dégradé.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- auth.users n'est PAS lisible par les rôles clients (comme sur Supabase) :
-- c'est ce qui rendait la policy `students_select_teacher` du dépôt inopérante.
REVOKE ALL ON auth.users FROM anon, authenticated;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

-- Aide de test : se faire passer pour un utilisateur, comme PostgREST.
CREATE OR REPLACE FUNCTION public.t_login(p_user UUID, p_role TEXT DEFAULT 'authenticated')
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), false);
  PERFORM set_config('request.jwt.claim.role', p_role, false);
  EXECUTE format('SET ROLE %I', p_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.t_logout()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  PERFORM set_config('request.jwt.claim.role', '', false);
END;
$$;

-- Assertions : `t_denied` vérifie qu'une écriture n'a AUCUN effet, soit parce
-- qu'elle lève une erreur (privilège, WITH CHECK, trigger), soit parce que la
-- RLS filtre silencieusement les lignes ciblées (0 ligne affectée) — les deux
-- comportements sont des refus du point de vue de l'attaquant.
-- `t_rows` compte les lignes visibles pour le rôle courant.
CREATE OR REPLACE FUNCTION public.t_denied(p_sql TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE n BIGINT;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 0;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.t_rows(p_sql TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE n BIGINT;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  RETURN n;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN -1;                       -- privilège table refusé : encore plus fermé
END;
$$;

CREATE OR REPLACE FUNCTION public.t_assert(p_ok BOOLEAN, p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS %', p_label;
  ELSIF current_setting('cc.soft', true) = '1' THEN
    -- mode baseline : on inventorie les vulnérabilités au lieu de s'arrêter
    RAISE WARNING 'VULNERABLE %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL %', p_label;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.t_login(UUID, TEXT), public.t_logout(),
  public.t_denied(TEXT), public.t_rows(TEXT), public.t_assert(BOOLEAN, TEXT)
  TO anon, authenticated, service_role;
