-- ==========================================
-- SCHEMA: Progress tracking (sessions + attempts)
-- Pour l'onglet "Maîtrise" de /my-performance
-- ==========================================

-- Table des sessions de jeu (une par partie lancée)
-- user_id est TEXT (pas UUID) pour supporter les IDs legacy comme "s001"
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  mode TEXT DEFAULT 'solo',
  classes JSONB DEFAULT '[]'::jsonb,
  themes JSONB DEFAULT '[]'::jsonb,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Table des tentatives individuelles (chaque paire cliquée)
CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  item_type TEXT,        -- 'imgtxt' ou 'calcnum'
  item_id TEXT,          -- identifiant de la paire
  objective_key TEXT,    -- 'classe:theme'
  correct BOOLEAN,
  latency_ms INTEGER,
  level_class TEXT,      -- niveau scolaire
  theme TEXT,            -- thème (animaux, fruits, etc.)
  round_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_session_id ON attempts(session_id);

-- RLS avec politique permissive (le backend utilise service_role)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;

-- Permettre toutes les opérations (accès via supabaseAdmin service_role)
CREATE POLICY "allow_all_sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_attempts" ON attempts FOR ALL USING (true) WITH CHECK (true);
