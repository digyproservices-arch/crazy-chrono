-- ==========================================================================
-- CTO-005A — Tests d'attaque RLS
--
-- Chaque assertion échoue bruyamment (RAISE EXCEPTION) si la défense ne tient
-- pas. Le fichier est joué DEUX fois par tests/rls/run_rls_tests.sh :
--   * sur la baseline legacy  → doit ÉCHOUER (preuve de la vulnérabilité) ;
--   * après les migrations    → doit PASSER intégralement.
--
-- Rôles modélisés : anon, USER A, USER B, STUDENT (mappé), STUDENT legacy
-- (non mappé), TEACHER, CPC, ADMIN, service_role.
-- ==========================================================================

\set ON_ERROR_STOP on

\set A   '''00000000-0000-0000-0000-00000000000a'''
\set B   '''00000000-0000-0000-0000-00000000000b'''
\set S1  '''00000000-0000-0000-0000-0000000000c1'''
\set S2  '''00000000-0000-0000-0000-0000000000c2'''
\set T1  '''00000000-0000-0000-0000-0000000000f1'''
\set CPC '''00000000-0000-0000-0000-0000000000cc'''
\set AD  '''00000000-0000-0000-0000-0000000000ad'''

-- ==========================================================================
-- P0-1 — user_profiles : aucune auto-promotion
-- ==========================================================================
SELECT t_login(:A::uuid);

SELECT t_assert(t_denied(
  format('UPDATE user_profiles SET role = ''admin'' WHERE id = %L', :A)),
  'P0-1.1 USER A ne peut pas se promouvoir admin');

SELECT t_assert(t_denied(
  format('UPDATE user_profiles SET role = ''teacher'' WHERE id = %L', :B)),
  'P0-1.2 USER A ne peut pas promouvoir USER B');

SELECT t_assert(t_denied(
  format('UPDATE user_profiles SET region = ''REG1'', circonscription_id = ''CIRCO1'' WHERE id = %L', :A)),
  'P0-1.3 USER A ne peut pas s''attribuer un périmètre institutionnel');

SELECT t_assert(t_denied(
  format('UPDATE user_profiles SET pseudo = ''hack'' WHERE id = %L', :B)),
  'P0-1.4 USER A ne peut pas modifier le profil de USER B');

UPDATE user_profiles SET pseudo = 'Moi', language = 'en' WHERE id = :A::uuid;
SELECT t_assert(
  (SELECT count(*) FROM user_profiles WHERE id = :A::uuid AND pseudo = 'Moi') = 1,
  'P0-1.5 USER A peut modifier ses champs personnels');

SELECT t_assert(t_rows(format('SELECT 1 FROM user_profiles WHERE id = %L', :B)) = 0,
  'P0-1.6 USER A ne lit pas le profil de USER B');

SELECT t_assert(t_denied(
  'INSERT INTO user_profiles (id, role) VALUES (''00000000-0000-0000-0000-0000000000ff'', ''admin'')'),
  'P0-1.7 Création d''un profil admin refusée');

SELECT t_logout();

-- ==========================================================================
-- P0-2 — gs_tournament_entries : preuve de paiement non forgeable
-- ==========================================================================
SELECT t_login(NULL, 'anon');

SELECT t_assert(t_denied($q$
  INSERT INTO gs_tournament_entries (tournament_id, first_name, last_name, email, paid)
  VALUES ('20000000-0000-0000-0000-000000000001', 'Pirate', 'Anon', 'pirate@example.test', true)
$q$), 'P0-2.1 anon ne peut pas s''inscrire paid=true');

SELECT t_assert(t_denied($q$
  INSERT INTO gs_tournament_entries (tournament_id, first_name, last_name, email, payment_id)
  VALUES ('20000000-0000-0000-0000-000000000001', 'Pirate', 'Anon', 'pirate2@example.test', 'pi_forged')
$q$), 'P0-2.2 anon ne peut pas forger un payment_id');

SELECT t_assert(t_denied($q$
  INSERT INTO gs_tournament_entries (tournament_id, first_name, last_name, email, is_subscriber)
  VALUES ('20000000-0000-0000-0000-000000000001', 'Pirate', 'Anon', 'pirate3@example.test', true)
$q$), 'P0-2.3 anon ne peut pas se déclarer abonné');

SELECT t_logout();
SELECT t_login(:A::uuid);

SELECT t_assert(t_denied($q$
  INSERT INTO gs_tournament_entries (tournament_id, first_name, last_name, email, paid)
  VALUES ('20000000-0000-0000-0000-000000000001', 'User', 'A', 'usera@example.test', true)
$q$), 'P0-2.4 authenticated ne peut pas s''inscrire paid=true');

-- L'inscription gratuite reste possible (flux Grande Salle CTO-002).
INSERT INTO gs_tournament_entries (tournament_id, first_name, last_name, email, user_id)
VALUES ('20000000-0000-0000-0000-000000000001', 'User', 'A', 'usera@example.test', :A::uuid);
SELECT t_assert(
  (SELECT count(*) FROM gs_tournament_entries WHERE email = 'usera@example.test' AND paid = false) = 1,
  'P0-2.5 Inscription gratuite préservée, paid reste false');

SELECT t_assert(t_denied($q$
  UPDATE gs_tournament_entries SET paid = true WHERE email = 'usera@example.test'
$q$), 'P0-2.6 authenticated ne peut pas passer son inscription à paid=true');

SELECT t_logout();

-- Le backend (service role) reste souverain sur les colonnes financières.
SET ROLE service_role;
UPDATE gs_tournament_entries SET paid = true, payment_id = 'pi_real'
WHERE email = 'usera@example.test';
SELECT t_assert(
  (SELECT paid FROM gs_tournament_entries WHERE email = 'usera@example.test'),
  'P0-2.7 service_role confirme le paiement');
RESET ROLE;

-- ==========================================================================
-- P0-3 — RPC SECURITY DEFINER
-- ==========================================================================
SELECT t_login(NULL, 'anon');
SELECT t_assert(t_denied(format('SELECT invalidate_user_sessions(%L::uuid)', :B)),
  'P0-3.1 anon ne peut pas déconnecter un tiers');
SELECT t_assert(t_denied('SELECT check_session_active(''tok-b'')'),
  'P0-3.2 anon ne peut pas sonder un jeton de session');
SELECT t_assert(t_denied('SELECT detect_suspicious_accounts(1)'),
  'P0-3.3 anon ne peut pas lire les IP d''audit');
SELECT t_assert(t_denied('SELECT cleanup_old_audit_logs()'),
  'P0-3.4 anon ne peut pas purger les journaux');
SELECT t_logout();

SELECT t_login(:A::uuid);
SELECT t_assert(t_denied(format('SELECT invalidate_user_sessions(%L::uuid)', :B)),
  'P0-3.5 USER A ne peut pas déconnecter USER B');
SELECT t_assert(t_denied(format('SELECT list_user_devices(%L::uuid)', :B)),
  'P0-3.6 USER A ne peut pas énumérer les appareils de USER B');
SELECT t_assert(t_denied(format('SELECT link_user_to_student(''usera@example.test'', ''stu-2'')')),
  'P0-3.7 USER A ne peut pas se rattacher à l''élève B');
SELECT t_logout();

SET ROLE service_role;
SELECT t_assert((SELECT count(*) FROM list_user_devices(:B::uuid)) = 1,
  'P0-3.8 service_role conserve l''accès aux RPC');
RESET ROLE;

-- ==========================================================================
-- P0-4 — sessions / attempts / training : données de mineurs
-- ==========================================================================
SELECT t_login(NULL, 'anon');
SELECT t_assert(t_rows('SELECT 1 FROM attempts') <= 0, 'P0-4.1 anon ne lit aucune tentative');
SELECT t_assert(t_rows('SELECT 1 FROM sessions') <= 0, 'P0-4.2 anon ne lit aucune session');
SELECT t_assert(t_rows('SELECT 1 FROM training_results') <= 0, 'P0-4.3 anon ne lit aucun résultat d''entraînement');
SELECT t_assert(t_rows('SELECT 1 FROM student_training_stats') <= 0, 'P0-4.4 anon ne lit aucune statistique élève');
SELECT t_assert(t_denied($q$INSERT INTO attempts (user_id, correct) VALUES ('00000000-0000-0000-0000-00000000000b', true)$q$),
  'P0-4.5 anon ne peut pas falsifier une tentative');
SELECT t_logout();

SELECT t_login(:A::uuid);
SELECT t_assert(t_rows(format('SELECT 1 FROM attempts WHERE user_id = %L', :B)) <= 0,
  'P0-4.6 USER A ne lit pas les tentatives de USER B');
SELECT t_assert(t_rows(format('SELECT 1 FROM sessions WHERE user_id = %L', :A)) = 1,
  'P0-4.7 USER A lit ses propres sessions');
SELECT t_assert(t_denied(format('UPDATE attempts SET correct = true WHERE user_id = %L', :B)),
  'P0-4.8 USER A ne peut pas falsifier les résultats de USER B');
SELECT t_logout();

-- ==========================================================================
-- P0-5 — webhook_events : magasin d'idempotence fermé
-- ==========================================================================
SELECT t_login(NULL, 'anon');
SELECT t_assert(t_rows('SELECT 1 FROM webhook_events') <= 0, 'P0-5.1 anon ne lit pas webhook_events');
SELECT t_assert(t_denied('INSERT INTO webhook_events (event_id) VALUES (''evt_forged'')'),
  'P0-5.2 anon ne peut pas forger une preuve de webhook');
SELECT t_logout();

SELECT t_login(:A::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM webhook_events') <= 0, 'P0-5.3 authenticated ne lit pas webhook_events');
SELECT t_assert(t_denied('INSERT INTO webhook_events (event_id) VALUES (''evt_forged2'')'),
  'P0-5.4 authenticated ne peut pas forger une preuve de webhook');
SELECT t_logout();

SET ROLE service_role;
INSERT INTO webhook_events (event_id) VALUES ('evt_real_1');
SELECT t_assert(t_denied('INSERT INTO webhook_events (event_id) VALUES (''evt_real_1'')'),
  'P0-5.5 event_id dupliqué rejeté (idempotence réelle)');
RESET ROLE;

-- ==========================================================================
-- P1-2 — subscriptions
-- ==========================================================================
SELECT t_login(NULL, 'anon');
SELECT t_assert(t_rows('SELECT 1 FROM subscriptions') <= 0, 'P1-2.1 anon ne lit aucun abonnement');
SELECT t_logout();

SELECT t_login(:A::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM subscriptions') = 0, 'P1-2.2 USER A ne lit pas l''abonnement de USER B');
SELECT t_assert(t_denied(format($q$INSERT INTO subscriptions (user_id, status) VALUES (%L, 'active')$q$, :A)),
  'P1-2.3 USER A ne peut pas s''accorder un abonnement actif');
SELECT t_logout();

SET ROLE service_role;
INSERT INTO subscriptions (user_id, status) VALUES (:A::uuid, 'trialing')
ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status;
INSERT INTO subscriptions (user_id, status) VALUES (:A::uuid, 'active')
ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status;
SELECT t_assert((SELECT count(*) FROM subscriptions WHERE user_id = :A::uuid) = 1,
  'P1-2.4 upsert onConflict user_id fonctionne et ne crée qu''une ligne');
SELECT t_assert(t_denied(format($q$INSERT INTO subscriptions (user_id, status) VALUES (%L, 'active')$q$, :A)),
  'P1-2.5 deux abonnements pour un même user_id impossibles');
RESET ROLE;

-- ==========================================================================
-- P1-1 — schools / classes / students / tournoi : périmètre
-- ==========================================================================
SELECT t_login(:A::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM classes') <= 0, 'P1-1.1 Un compte lambda ne lit pas l''annuaire des classes');
SELECT t_assert(t_rows('SELECT 1 FROM schools') <= 0, 'P1-1.2 Un compte lambda ne lit pas l''annuaire des écoles');
SELECT t_assert(t_rows('SELECT 1 FROM students') <= 0, 'P1-1.3 Un compte lambda ne lit aucun élève');
SELECT t_assert(t_rows('SELECT 1 FROM match_results') <= 0, 'P1-1.4 Un compte lambda ne lit pas les résultats de tournoi');
SELECT t_assert(t_rows('SELECT 1 FROM tournament_groups') <= 0, 'P1-1.5 Un compte lambda ne lit pas les groupes de tournoi');
SELECT t_logout();

-- STUDENT mappé : sa fiche et rien d'autre.
SELECT t_login(:S1::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM students') = 1, 'P1-1.6 STUDENT 1 ne voit que sa fiche');
SELECT t_assert(t_rows('SELECT 1 FROM students WHERE id = ''stu-2''') = 0, 'P1-1.7 STUDENT 1 ne voit pas STUDENT 2');
SELECT t_assert(t_rows('SELECT 1 FROM student_stats WHERE student_id = ''stu-2''') = 0,
  'P1-1.8 STUDENT 1 ne voit pas les performances de STUDENT 2');
SELECT t_logout();

-- STUDENT legacy (email <access_code>@eleve… sans mapping) : fail closed.
SELECT t_login(:S2::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM students') = 0,
  'P1-1.9 Compte élève sans mapping : aucune fiche (LEGACY_STUDENT_MAPPING_REQUIRED)');
SELECT t_logout();

-- TEACHER : ses classes uniquement.
SELECT t_login(:T1::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM classes') = 1, 'P1-1.10 TEACHER ne voit que ses classes');
SELECT t_assert(t_rows('SELECT 1 FROM students') = 1, 'P1-1.11 TEACHER ne voit que les élèves de ses classes');
SELECT t_assert(t_rows('SELECT 1 FROM students WHERE id = ''stu-2''') = 0, 'P1-1.12 TEACHER ne voit pas une autre classe');
SELECT t_logout();

-- CPC : sa circonscription uniquement.
SELECT t_login(:CPC::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM schools') = 1, 'P1-1.13 CPC ne voit que les écoles de sa circonscription');
SELECT t_assert(t_rows('SELECT 1 FROM schools WHERE id = ''sch-2''') = 0, 'P1-1.14 CPC ne voit pas une autre circonscription');
SELECT t_logout();

-- ADMIN : accès d'administration.
SELECT t_login(:AD::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM classes') = 2, 'P1-1.15 ADMIN conserve la vue d''administration');
SELECT t_logout();

-- ==========================================================================
-- P1-3 — invitations
-- ==========================================================================
SELECT t_login(NULL, 'anon');
SELECT t_assert(t_rows('SELECT 1 FROM invitations') <= 0, 'P1-3.1 anon ne lit aucune invitation (plus d''énumération de tokens)');
SELECT t_logout();

SELECT t_login(:A::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM invitations') <= 0, 'P1-3.2 authenticated non-admin ne lit aucune invitation');
SELECT t_assert(t_denied($q$INSERT INTO invitations (email, role, token) VALUES ('x@example.test', 'admin', 'tok-forged')$q$),
  'P1-3.3 authenticated ne peut pas créer une invitation admin');
SELECT t_logout();

-- Revue CTO §F : l'administration passe par Express, donc AUCUN client Supabase
-- direct — même porteur d'un JWT admin — ne lit la table.
SELECT t_login(:AD::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM invitations') <= 0,
  'P1-3.4 ADMIN via clé anon + JWT ne lit aucune invitation directement');
SELECT t_assert(t_denied($q$UPDATE invitations SET used = false$q$),
  'P1-3.5 ADMIN ne peut pas réarmer une invitation directement');
SELECT t_logout();

-- Le backend (service role) reste le seul chemin de lecture.
SELECT t_login(NULL, 'service_role');
SELECT t_assert(t_rows('SELECT 1 FROM invitations') = 3, 'P1-3.6 service_role lit les invitations');
SELECT t_logout();

-- ==========================================================================
-- P0-6 — consume_invitation : destinataire, atomicité, permissions
-- (revue CTO §A/§B)
-- ==========================================================================
SELECT t_login(NULL, 'anon');
SELECT t_assert(t_denied($q$SELECT consume_invitation('tok-consume-1', '00000000-0000-0000-0000-00000000000a', 'usera@example.test')$q$),
  'P0-6.1 anon ne peut pas exécuter consume_invitation');
SELECT t_logout();

SELECT t_login(:A::uuid);
SELECT t_assert(t_denied($q$SELECT consume_invitation('tok-consume-1', '00000000-0000-0000-0000-00000000000a', 'usera@example.test')$q$),
  'P0-6.2 authenticated ne peut pas exécuter consume_invitation');
SELECT t_logout();

-- Destinataire : USER B ne peut pas utiliser l'invitation de USER A même si le
-- backend est compromis au point de passer son propre e-mail vérifié.
SELECT t_login(NULL, 'service_role');
SELECT t_assert(
  (consume_invitation('tok-consume-1', :B::uuid, 'userb@example.test')->>'status') = 'email_mismatch',
  'P0-6.3 e-mail du JWT différent du destinataire → email_mismatch');
SELECT t_assert(
  (SELECT count(*) FROM invitations WHERE token = 'tok-consume-1' AND used) = 0,
  'P0-6.4 invitation non consommée après un mismatch');
SELECT t_assert(
  (SELECT count(*) FROM user_profiles WHERE id = :B::uuid AND role = 'teacher') = 0,
  'P0-6.5 aucun rôle appliqué après un mismatch');

-- Destinataire légitime : une seule consommation possible.
SELECT t_assert(
  (consume_invitation('tok-consume-1', :A::uuid, 'UserA@Example.test')->>'status') = 'ok',
  'P0-6.6 destinataire légitime consomme l''invitation (e-mail normalisé)');
SELECT t_assert(
  (SELECT count(*) FROM user_profiles WHERE id = :A::uuid AND role = 'teacher') = 1,
  'P0-6.7 rôle appliqué dans la même transaction');
SELECT t_assert(
  (consume_invitation('tok-consume-1', :A::uuid, 'usera@example.test')->>'status') = 'already_used',
  'P0-6.8 rejeu du même token refusé');
SELECT t_assert(
  (consume_invitation('tok-forged', :A::uuid, 'usera@example.test')->>'status') = 'not_found',
  'P0-6.9 token forgé refusé');
-- Remise en état : les assertions suivantes supposent USER A non privilégié.
UPDATE user_profiles SET role = 'user', region = NULL, circonscription_id = NULL WHERE id = :A::uuid;
UPDATE invitations SET used = false, used_at = NULL WHERE token = 'tok-consume-1';
SELECT t_logout();

-- ==========================================================================
-- P1-4 — user_devices / auth_audit_log / content_store / gift_codes
-- ==========================================================================
SELECT t_login(NULL, 'anon');
SELECT t_assert(t_rows('SELECT 1 FROM auth_audit_log') <= 0, 'P1-4.1 anon ne lit aucun journal d''authentification (e-mails, IP)');
SELECT t_assert(t_rows('SELECT 1 FROM user_devices') <= 0, 'P1-4.2 anon ne lit aucun appareil');
SELECT t_assert(t_rows('SELECT 1 FROM active_sessions') <= 0, 'P1-4.3 anon ne lit aucune session active');
SELECT t_assert(t_rows('SELECT 1 FROM gift_codes') <= 0, 'P1-4.4 anon ne lit aucun code cadeau');
SELECT t_assert(t_denied($q$INSERT INTO gift_codes (code, months) VALUES ('FORGED', 99)$q$),
  'P1-4.5 anon ne peut pas créer un code cadeau');
SELECT t_logout();

SELECT t_login(:A::uuid);
SELECT t_assert(t_rows('SELECT 1 FROM auth_audit_log') <= 0, 'P1-4.6 authenticated ne lit aucun journal d''authentification');
SELECT t_assert(t_rows(format('SELECT 1 FROM user_devices WHERE user_id = %L', :B)) = 0,
  'P1-4.7 USER A ne voit pas les appareils de USER B');
SELECT t_assert(t_rows('SELECT 1 FROM content_store') <= 0, 'P1-4.8 authenticated ne lit pas content_store');
SELECT t_logout();

SELECT 'ALL RLS ATTACK TESTS PASSED' AS result;
