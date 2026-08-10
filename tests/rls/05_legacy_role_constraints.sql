-- ==========================================================================
-- CTO-005A (revue CTO finale §C) — contraintes CHECK de rôle « génération
-- rectorat », telles que server/db/migration_rectorat.sql les laisse si
-- server/db/migration_cpd_cpc_roles.sql n'a jamais été rejoué en production.
--
-- Joué AVANT les migrations CTO-005A par tests/rls/run_rls_tests.sh (mode
-- roleconstraints) pour prouver que, dans cet état, un rôle cpd/cpc est
-- rejeté par PostgreSQL quel que soit le code applicatif.
-- ==========================================================================

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('user', 'editor', 'teacher', 'admin', 'rectorat'));

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('user', 'editor', 'teacher', 'admin', 'rectorat'));

SELECT t_assert(t_denied($q$INSERT INTO invitations (email, role, token) VALUES ('cpd@example.test', 'cpd', 'tok-legacy-cpd')$q$),
  'LEGACY-1 contrainte rectorat : invitation cpd refusée par PostgreSQL');
SELECT t_assert(t_denied($q$INSERT INTO invitations (email, role, token) VALUES ('cpc@example.test', 'cpc', 'tok-legacy-cpc')$q$),
  'LEGACY-2 contrainte rectorat : invitation cpc refusée par PostgreSQL');
-- Le compte auth existe : seul le CHECK peut refuser l'insertion du profil.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'legacy-cpd@example.test');
SELECT t_assert(t_denied($q$INSERT INTO user_profiles (id, role) VALUES ('00000000-0000-0000-0000-0000000000e1', 'cpd')$q$),
  'LEGACY-3 contrainte rectorat : profil cpd refusé par PostgreSQL');

SELECT 'LEGACY ROLE CONSTRAINTS IN PLACE' AS result;
