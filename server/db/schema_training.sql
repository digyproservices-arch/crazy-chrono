-- ==========================================
-- SCHEMA: Training Sessions & Results
-- Tables pour sauvegarder les performances Solo/Multijoueur/Training
-- ==========================================

-- Table des sessions d'entraînement
CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  class_id TEXT,
  teacher_id TEXT,
  session_name TEXT DEFAULT 'Session',
  config JSONB DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des résultats individuels par session
CREATE TABLE IF NOT EXISTS training_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  position INTEGER DEFAULT 1,
  score INTEGER DEFAULT 0,
  time_ms INTEGER DEFAULT 0,
  pairs_validated INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des stats cumulées par élève
CREATE TABLE IF NOT EXISTS student_training_stats (
  student_id TEXT PRIMARY KEY,
  sessions_played INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  total_pairs INTEGER DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_training_sessions_class ON training_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_completed ON training_sessions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_results_session ON training_results(session_id);
CREATE INDEX IF NOT EXISTS idx_training_results_student ON training_results(student_id);

-- RPC pour mise à jour atomique des stats cumulées
CREATE OR REPLACE FUNCTION update_student_training_stats(
  p_student_id TEXT,
  p_sessions_played INTEGER,
  p_total_score INTEGER,
  p_total_pairs INTEGER,
  p_best_score INTEGER
) RETURNS VOID AS $$
BEGIN
  INSERT INTO student_training_stats (student_id, sessions_played, total_score, total_pairs, best_score, updated_at)
  VALUES (p_student_id, p_sessions_played, p_total_score, p_total_pairs, p_best_score, NOW())
  ON CONFLICT (student_id) DO UPDATE SET
    sessions_played = student_training_stats.sessions_played + p_sessions_played,
    total_score = student_training_stats.total_score + p_total_score,
    total_pairs = student_training_stats.total_pairs + p_total_pairs,
    best_score = GREATEST(student_training_stats.best_score, p_best_score),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- RLS (Row Level Security) - désactivé par défaut pour service_role
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_training_stats ENABLE ROW LEVEL SECURITY;

-- Policy: service_role a accès complet
CREATE POLICY "service_role_full_access_sessions" ON training_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access_results" ON training_results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access_stats" ON student_training_stats FOR ALL USING (true) WITH CHECK (true);

-- Commentaires
COMMENT ON TABLE training_sessions IS 'Sessions de jeu (Solo, Multijoueur, Training)';
COMMENT ON TABLE training_results IS 'Résultats individuels par session';
COMMENT ON TABLE student_training_stats IS 'Stats cumulées par élève (best score, total paires, etc.)';
