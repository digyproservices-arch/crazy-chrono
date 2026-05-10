-- ==========================================
-- MIGRATION: Match Rounds & Player Summary
-- Diagnostic pédagogique — cartes jouées par round
-- ==========================================

BEGIN;

-- Table des rounds joués par match (cartes jouées)
CREATE TABLE IF NOT EXISTS match_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,                      -- lien vers training_sessions.id
  round_number INTEGER NOT NULL,                 -- n° du round dans la session
  zones JSONB NOT NULL DEFAULT '[]',             -- les 16 zones (type, content, pairId, isDistractor)
  good_pair_type TEXT,                           -- 'TI' (texte-image) ou 'CC' (calcul-chiffre)
  good_pair_theme TEXT,                          -- thématique de la paire correcte
  good_pair_level TEXT,                          -- niveau scolaire (CM1, CE2...)
  good_pair_content JSONB,                       -- {a: "3 × ? = 27", b: "9"} — contenu de la paire
  winner_player_id TEXT,                         -- socket id ou student_id du joueur qui a trouvé
  winner_display_name TEXT,                      -- nom affiché
  winner_time_ms INTEGER,                        -- temps entre début round et validation
  errors JSONB DEFAULT '[]',                     -- [{player_id, display_name, timestamp}]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des bilans pédagogiques par joueur par match
CREATE TABLE IF NOT EXISTS match_player_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,                      -- lien vers training_sessions.id
  player_id TEXT NOT NULL,                       -- student_id ou socket id
  display_name TEXT NOT NULL,
  total_score INTEGER DEFAULT 0,
  total_pairs INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  stats_by_theme JSONB DEFAULT '{}',             -- {"Botanique": {found: 3, missed: 2, errors: 1}}
  stats_by_type JSONB DEFAULT '{}',              -- {"TI": {found: 5}, "CC": {found: 3}}
  avg_response_time_ms INTEGER,
  recommendations JSONB DEFAULT '[]',            -- recommandations auto
  teacher_notes TEXT DEFAULT '',                  -- notes libres du prof
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_match_rounds_session ON match_rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_match_rounds_created ON match_rounds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_player_summary_session ON match_player_summary(session_id);
CREATE INDEX IF NOT EXISTS idx_match_player_summary_player ON match_player_summary(player_id);

-- ==========================================
-- RLS Policies
-- ==========================================

ALTER TABLE match_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_player_summary ENABLE ROW LEVEL SECURITY;

-- Service role bypass (pour le serveur)
CREATE POLICY "Service role full access on match_rounds"
  ON match_rounds FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access on match_player_summary"
  ON match_player_summary FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Professeurs : lecture des sessions qu'ils ont créées
-- (join via training_sessions.teacher_id = auth.uid())
CREATE POLICY "Teachers read own match_rounds"
  ON match_rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM training_sessions ts
      WHERE ts.id = match_rounds.session_id
        AND ts.teacher_id = auth.uid()::text
    )
  );

CREATE POLICY "Teachers read own match_player_summary"
  ON match_player_summary FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM training_sessions ts
      WHERE ts.id = match_player_summary.session_id
        AND ts.teacher_id = auth.uid()::text
    )
  );

-- Professeurs : mise à jour des notes (teacher_notes uniquement)
CREATE POLICY "Teachers update own match_player_summary notes"
  ON match_player_summary FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM training_sessions ts
      WHERE ts.id = match_player_summary.session_id
        AND ts.teacher_id = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM training_sessions ts
      WHERE ts.id = match_player_summary.session_id
        AND ts.teacher_id = auth.uid()::text
    )
  );

-- Rectorat : lecture de tout (rôle rectorat via user metadata)
CREATE POLICY "Rectorat read all match_rounds"
  ON match_rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND (u.raw_user_meta_data->>'role' = 'rectorat'
          OR u.raw_user_meta_data->>'role' = 'admin')
    )
  );

CREATE POLICY "Rectorat read all match_player_summary"
  ON match_player_summary FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND (u.raw_user_meta_data->>'role' = 'rectorat'
          OR u.raw_user_meta_data->>'role' = 'admin')
    )
  );

COMMIT;
