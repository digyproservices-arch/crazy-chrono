-- ==========================================================================
-- CTO-005A (revue CTO finale §C3) — les rôles cpd/cpc redeviennent utilisables
-- après la migration 1200, et seule la whitelist serveur est acceptée.
--
-- Joué APRÈS les migrations et les fixtures, sur une base dont les contraintes
-- de rôle étaient restées en « génération rectorat » (tests/rls/05_*).
-- ==========================================================================

\set ON_ERROR_STOP on

\set CPD_U '''00000000-0000-0000-0000-0000000000d1'''
\set CPC_U '''00000000-0000-0000-0000-0000000000d2'''

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'newcpd@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'newcpc@example.test');

SELECT t_login(NULL, 'service_role');

-- Invitations cpd/cpc : refusées par la contrainte legacy, acceptées après 1200.
INSERT INTO invitations (email, role, token, region)
     VALUES ('newcpd@example.test', 'cpd', 'tok-cpd-1', 'REG1');
SELECT t_assert((SELECT count(*) FROM invitations WHERE token = 'tok-cpd-1') = 1,
  'ROLE-1 invitation cpd acceptée après la migration 1200');

INSERT INTO invitations (email, role, token, region, circonscription_id)
     VALUES ('newcpc@example.test', 'cpc', 'tok-cpc-1', 'REG1', 'CIRCO1');
SELECT t_assert((SELECT count(*) FROM invitations WHERE token = 'tok-cpc-1') = 1,
  'ROLE-2 invitation cpc acceptée après la migration 1200');

-- Consommation : le rôle et le périmètre arrivent en base sans être rejetés.
SELECT t_assert(
  (consume_invitation('tok-cpd-1', :CPD_U::uuid, 'newcpd@example.test')->>'status') = 'ok',
  'ROLE-3 consume_invitation cpd → ok');
SELECT t_assert(
  (SELECT count(*) FROM user_profiles
    WHERE id = :CPD_U::uuid AND role = 'cpd' AND region = 'REG1') = 1,
  'ROLE-4 profil cpd écrit avec sa région');

SELECT t_assert(
  (consume_invitation('tok-cpc-1', :CPC_U::uuid, 'newcpc@example.test')->>'status') = 'ok',
  'ROLE-5 consume_invitation cpc → ok');
SELECT t_assert(
  (SELECT count(*) FROM user_profiles
    WHERE id = :CPC_U::uuid AND role = 'cpc'
      AND region = 'REG1' AND circonscription_id = 'CIRCO1') = 1,
  'ROLE-6 profil cpc écrit avec sa circonscription');

-- Un rôle inventé reste refusé par PostgreSQL, y compris pour le service role.
SELECT t_assert(t_denied($q$INSERT INTO invitations (email, role, token) VALUES ('x@example.test', 'superadmin', 'tok-super')$q$),
  'ROLE-7 invitation superadmin refusée par invitations_role_check');
SELECT t_assert(t_denied(format('UPDATE user_profiles SET role = ''superadmin'' WHERE id = %s', :CPD_U)),
  'ROLE-8 rôle superadmin refusé par user_profiles_role_check');
SELECT t_assert(t_denied($q$INSERT INTO invitations (email, role, token) VALUES ('x@example.test', 'student', 'tok-stud')$q$),
  'ROLE-9 student n''est pas invitable');

-- `student` reste écrivable par le backend : les comptes élèves existants ne
-- doivent pas être cassés par la contrainte.
SELECT t_assert(
  (SELECT count(*) FROM user_profiles WHERE role = 'student') > 0,
  'ROLE-10 les profils student existants survivent à la migration 1200');

SELECT t_logout();

SELECT 'ALL ROLE CONSTRAINT TESTS PASSED' AS result;
