-- ==========================================================================
-- CTO-005A — Jeu de données de test (UUID fixes, aucune donnée réelle)
-- ==========================================================================

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'usera@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'userb@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'ABC123@eleve.crazychrono.app'),
  ('00000000-0000-0000-0000-0000000000c2', 'XYZ789@eleve.crazychrono.app'),
  ('00000000-0000-0000-0000-0000000000f1', 'prof1@example.test'),
  ('00000000-0000-0000-0000-0000000000cc', 'cpc1@example.test'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@example.test');

INSERT INTO user_profiles (id, email, role, region, circonscription_id) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'usera@example.test', 'user', NULL, NULL),
  ('00000000-0000-0000-0000-00000000000b', 'userb@example.test', 'user', NULL, NULL),
  ('00000000-0000-0000-0000-0000000000c1', 'ABC123@eleve.crazychrono.app', 'student', NULL, NULL),
  ('00000000-0000-0000-0000-0000000000c2', 'XYZ789@eleve.crazychrono.app', 'student', NULL, NULL),
  ('00000000-0000-0000-0000-0000000000f1', 'prof1@example.test', 'teacher', NULL, NULL),
  ('00000000-0000-0000-0000-0000000000cc', 'cpc1@example.test', 'cpc', 'REG1', 'CIRCO1'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@example.test', 'admin', NULL, NULL);

INSERT INTO schools (id, name, city, circonscription_id) VALUES
  ('sch-1', 'École 1', 'Ville1', 'CIRCO1'),
  ('sch-2', 'École 2', 'Ville2', 'CIRCO2');

INSERT INTO classes (id, school_id, name, level, teacher_email) VALUES
  ('cls-1', 'sch-1', 'CM1 A', 'CM1', 'prof1@example.test'),
  ('cls-2', 'sch-2', 'CM2 B', 'CM2', 'prof2@example.test');

INSERT INTO students (id, first_name, last_name, access_code, class_id, school_id, circonscription_id, licensed) VALUES
  ('stu-1', 'Alice', 'A', 'ABC123', 'cls-1', 'sch-1', 'CIRCO1', true),
  ('stu-2', 'Bob',   'B', 'XYZ789', 'cls-2', 'sch-2', 'CIRCO2', true);

INSERT INTO student_stats (student_id, best_score) VALUES ('stu-1', 100), ('stu-2', 200);

-- STUDENT 1 possède un mapping actif ; STUDENT 2 est un compte « legacy »
-- (email <access_code>@eleve.crazychrono.app mais AUCUN mapping) : il doit
-- rester fail-closed (LEGACY_STUDENT_MAPPING_REQUIRED, CTO-003).
INSERT INTO user_student_mapping (user_id, student_id, active) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'stu-1', true);

INSERT INTO sessions (id, user_id) VALUES
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b');

INSERT INTO attempts (session_id, user_id, correct, latency_ms) VALUES
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', true, 900),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', false, 1200);

INSERT INTO training_results (student_id, score) VALUES ('stu-1', 12), ('stu-2', 15);
INSERT INTO student_training_stats (student_id, total) VALUES ('stu-1', 30), ('stu-2', 40);

INSERT INTO subscriptions (user_id, status, price_id) VALUES
  ('00000000-0000-0000-0000-00000000000b', 'active', 'price_test');

INSERT INTO gs_tournaments (id, name) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Grande Salle Test');

INSERT INTO invitations (email, role, token) VALUES
  ('invite@example.test', 'admin', 'tok-secret-1');

INSERT INTO active_sessions (user_id, session_token, is_active) VALUES
  ('00000000-0000-0000-0000-00000000000b', 'tok-b', true);

INSERT INTO user_devices (user_id, fingerprint, device_name) VALUES
  ('00000000-0000-0000-0000-00000000000b', 'fp-b', 'PC de B');

INSERT INTO auth_audit_log (user_id, email, ip_address, event_type) VALUES
  ('00000000-0000-0000-0000-00000000000b', 'userb@example.test', '203.0.113.7', 'login');

INSERT INTO gift_codes (code, months) VALUES ('GIFT-TEST', 12);
