-- Tables pour le mode ENTRAÎNEMENT (sessions libres répétables)

-- Table des sessions d'entraînement
CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  class_id UUID NOT NULL,
  teacher_id UUID,
  session_name TEXT NOT NULL,
  config JSONB,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherche rapide par classe
CREATE INDEX IF NOT EXISTS idx_training_sessions_class ON training_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_teacher ON training_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_completed ON training_sessions(completed_at DESC);

-- Table des résultats individuels par session
CREATE TABLE IF NOT EXISTS training_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  position INTEGER NOT NULL,
  score INTEGER NOT NULL,
  time_ms INTEGER NOT NULL,
  pairs_validated INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherche par session et élève
CREATE INDEX IF NOT EXISTS idx_training_results_session ON training_results(session_id);
CREATE INDEX IF NOT EXISTS idx_training_results_student ON training_results(student_id);

-- Table des stats globales d'entraînement par élève
CREATE TABLE IF NOT EXISTS student_training_stats (
  student_id TEXT PRIMARY KEY,
  sessions_played INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  total_pairs INTEGER DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  last_session_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fonction pour mettre à jour les stats élève après chaque session
CREATE OR REPLACE FUNCTION update_student_training_stats(
  p_student_id UUID,
  p_sessions_played INTEGER,
  p_total_score INTEGER,
  p_total_pairs INTEGER,
  p_best_score INTEGER
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO student_training_stats (
    student_id,
    sessions_played,
    total_score,
    total_pairs,
    best_score,
    last_session_at,
    updated_at
  )
  VALUES (
    p_student_id,
    p_sessions_played,
    p_total_score,
    p_total_pairs,
    p_best_score,
    NOW(),
    NOW()
  )
  ON CONFLICT (student_id) DO UPDATE SET
    sessions_played = student_training_stats.sessions_played + p_sessions_played,
    total_score = student_training_stats.total_score + p_total_score,
    total_pairs = student_training_stats.total_pairs + p_total_pairs,
    best_score = GREATEST(student_training_stats.best_score, p_best_score),
    last_session_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- RLS (Row Level Security)
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_training_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Les profs peuvent voir les sessions de leurs classes
CREATE POLICY "Teachers can view their class sessions" ON training_sessions
  FOR SELECT USING (
    teacher_id = auth.uid()
  );

-- Policy: Les élèves peuvent voir leurs propres résultats
CREATE POLICY "Students can view their own results" ON training_results
  FOR SELECT USING (
    student_id::TEXT IN (
      SELECT student_id FROM user_student_mapping 
      WHERE user_id = auth.uid() AND active = true
    )
  );

-- Policy: Les élèves peuvent voir leurs propres stats
CREATE POLICY "Students can view their own stats" ON student_training_stats
  FOR SELECT USING (
    student_id::TEXT IN (
      SELECT student_id FROM user_student_mapping 
      WHERE user_id = auth.uid() AND active = true
    )
  );

-- Commentaires pour documentation
COMMENT ON TABLE training_sessions IS 'Sessions d''entraînement libres créées par les professeurs (mode entraînement)';
COMMENT ON TABLE training_results IS 'Résultats individuels des élèves par session d''entraînement';
COMMENT ON TABLE student_training_stats IS 'Statistiques globales d''entraînement par élève (cumul toutes sessions)';
