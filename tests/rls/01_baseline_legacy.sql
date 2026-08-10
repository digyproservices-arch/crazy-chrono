-- ==========================================================================
-- CTO-005A — Baseline « legacy » : l'état que les SQL versionnés du dépôt
-- produisent AVANT CTO-005A (cf. CTO_AUDIT_004).
--
-- Reprend fidèlement les définitions et les policies des fichiers historiques :
--   server/db/schema_tournament.sql, schema_progress.sql, schema_training.sql,
--   schema_user_mapping.sql, server/migrations/migration_rls_tournament.sql,
--   migration_gs_access_type.sql, migration_active_sessions.sql,
--   migration_user_devices.sql, migration_auth_audit.sql,
--   create_invitations.sql, scripts/supabase_subscriptions.sql.
--
-- Les tests d'attaque sont d'abord joués sur cette baseline (ils doivent
-- ÉCHOUER, ce qui prouve la vulnérabilité), puis après migration.
-- ==========================================================================

-- ── Scolaire / tournoi -----------------------------------------------------
CREATE TABLE schools (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  city VARCHAR(100),
  circonscription_id VARCHAR(50)
);

CREATE TABLE classes (
  id VARCHAR(50) PRIMARY KEY,
  school_id VARCHAR(50) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  level VARCHAR(20),
  teacher_email VARCHAR(100)
);

CREATE TABLE students (
  id VARCHAR(50) PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  access_code VARCHAR(50) UNIQUE,
  class_id VARCHAR(50) REFERENCES classes(id) ON DELETE SET NULL,
  school_id VARCHAR(50) REFERENCES schools(id) ON DELETE SET NULL,
  circonscription_id VARCHAR(50),
  licensed BOOLEAN DEFAULT false
);

CREATE TABLE student_stats (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
  best_score INTEGER DEFAULT 0
);

CREATE TABLE tournaments (id VARCHAR(50) PRIMARY KEY, name VARCHAR(200));
CREATE TABLE tournament_phases (id VARCHAR(50) PRIMARY KEY, tournament_id VARCHAR(50));
CREATE TABLE tournament_groups (id VARCHAR(50) PRIMARY KEY, class_id VARCHAR(50));
CREATE TABLE tournament_matches (id VARCHAR(50) PRIMARY KEY, group_id VARCHAR(50));
CREATE TABLE match_results (id VARCHAR(50) PRIMARY KEY, match_id VARCHAR(50), score INTEGER);
CREATE TABLE tournament_brackets (id VARCHAR(50) PRIMARY KEY, tournament_id VARCHAR(50));

CREATE TABLE user_student_mapping (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  active BOOLEAN DEFAULT true,
  UNIQUE(student_id)
);

-- ── Progression / entraînement ---------------------------------------------
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  mode TEXT DEFAULT 'solo',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  correct BOOLEAN,
  latency_ms INTEGER
);

CREATE TABLE training_sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id UUID);
CREATE TABLE training_results (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id VARCHAR(50), score INTEGER);
CREATE TABLE student_training_stats (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id VARCHAR(50), total INTEGER);

-- ── Financier ---------------------------------------------------------------
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  price_id TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_user_id_idx ON subscriptions (user_id);

CREATE TABLE gs_tournaments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT);
CREATE TABLE gs_tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES gs_tournaments(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_subscriber BOOLEAN DEFAULT false,
  user_id UUID,
  paid BOOLEAN DEFAULT false,
  payment_id TEXT,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, email)
);

-- ── Comptes / audit ----------------------------------------------------------
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  used BOOLEAN DEFAULT false
);

CREATE TABLE active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT,
  device_name TEXT,
  is_approved BOOLEAN DEFAULT true,
  is_revoked BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE auth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT,
  ip_address TEXT,
  event_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE content_store (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), key TEXT, value JSONB);
CREATE TABLE gift_codes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT UNIQUE, months INTEGER, used_by UUID);

-- NOTE : `user_profiles` n'est défini par AUCUN SQL du dépôt (P0-1) alors que
-- le frontend y écrit `role`. La baseline reproduit donc le cas le plus
-- probable en production : table créée à la main, sans RLS.
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  first_name TEXT,
  last_name TEXT,
  pseudo TEXT,
  language TEXT DEFAULT 'fr',
  avatar_url TEXT,
  strict_elements_mode BOOLEAN DEFAULT false,
  region VARCHAR(50),
  circonscription_id VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT ALL ON user_profiles TO anon, authenticated;

-- ── Policies historiques -----------------------------------------------------
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_attempts" ON attempts FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON sessions, attempts TO anon, authenticated;

ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_training_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access_sessions" ON training_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access_results"  ON training_results  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access_stats"    ON student_training_stats FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON training_sessions, training_results, student_training_stats TO anon, authenticated;

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_brackets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments_select_authenticated" ON tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "phases_select_authenticated" ON tournament_phases FOR SELECT TO authenticated USING (true);
CREATE POLICY "schools_select_authenticated" ON schools FOR SELECT TO authenticated USING (true);
CREATE POLICY "classes_select_authenticated" ON classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups_select_authenticated" ON tournament_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "matches_select_authenticated" ON tournament_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "results_select_authenticated" ON match_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "brackets_select_authenticated" ON tournament_brackets FOR SELECT TO authenticated USING (true);

CREATE POLICY "students_select_own" ON students FOR SELECT TO authenticated
  USING (id IN (SELECT student_id FROM user_student_mapping WHERE user_id = auth.uid() AND active = true));
CREATE POLICY "students_select_teacher" ON students FOR SELECT TO authenticated
  USING (class_id IN (SELECT c.id FROM classes c WHERE c.teacher_email = (SELECT email FROM auth.users WHERE id = auth.uid())));
CREATE POLICY "student_stats_select_own" ON student_stats FOR SELECT TO authenticated
  USING (student_id IN (SELECT student_id FROM user_student_mapping WHERE user_id = auth.uid() AND active = true));

GRANT SELECT ON schools, classes, students, student_stats, tournaments,
  tournament_phases, tournament_groups, tournament_matches, match_results,
  tournament_brackets TO authenticated;

ALTER TABLE user_student_mapping ENABLE ROW LEVEL SECURITY;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_read_own" ON subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
GRANT SELECT ON subscriptions TO authenticated;

ALTER TABLE gs_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gs_tournament_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gs_tournaments_select_all" ON gs_tournaments FOR SELECT USING (true);
CREATE POLICY "gs_entries_insert_all" ON gs_tournament_entries FOR INSERT WITH CHECK (true);
GRANT SELECT ON gs_tournaments TO anon, authenticated;
GRANT SELECT, INSERT ON gs_tournament_entries TO anon, authenticated;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
-- Login.js lit les invitations avant authentification : la baseline reproduit
-- la policy anon que ce comportement suppose.
CREATE POLICY "invitations_select_token" ON invitations FOR SELECT USING (true);
GRANT SELECT ON invitations TO anon, authenticated;

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON active_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access_devices" ON user_devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access_audit" ON auth_audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access_content" ON content_store FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access_gift" ON gift_codes FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON active_sessions, user_devices, auth_audit_log, content_store, gift_codes TO anon, authenticated;

-- ── Fonctions SECURITY DEFINER historiques (EXECUTE à PUBLIC par défaut) -----
CREATE OR REPLACE FUNCTION invalidate_user_sessions(p_user_id UUID, p_except_token TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE active_sessions SET is_active = false
  WHERE user_id = p_user_id AND (p_except_token IS NULL OR session_token <> p_except_token);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION check_session_active(p_token TEXT)
RETURNS TABLE(is_active BOOLEAN) AS $$
BEGIN
  RETURN QUERY SELECT s.is_active FROM active_sessions s WHERE s.session_token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION list_user_devices(p_user_id UUID)
RETURNS TABLE(id UUID, device_name TEXT) AS $$
BEGIN
  RETURN QUERY SELECT d.id, d.device_name FROM user_devices d WHERE d.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION detect_suspicious_accounts(p_min_ips INTEGER DEFAULT 3)
RETURNS TABLE(email TEXT, ips BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT a.email, COUNT(DISTINCT a.ip_address) FROM auth_audit_log a
  GROUP BY a.email HAVING COUNT(DISTINCT a.ip_address) >= p_min_ips;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
  DELETE FROM auth_audit_log WHERE created_at < now() - INTERVAL '24 months';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION link_user_to_student(p_user_email TEXT, p_student_id VARCHAR(50), p_admin_email TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE v_user UUID;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email = p_user_email;
  IF v_user IS NULL THEN RETURN false; END IF;
  INSERT INTO user_student_mapping(user_id, student_id, active)
  VALUES (v_user, p_student_id, true)
  ON CONFLICT (user_id) DO UPDATE SET student_id = EXCLUDED.student_id, active = true;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
