-- ==========================================
-- GRANDE SALLE - Traçabilité des tirages au sort
-- Enregistre chaque tirage (graine + gagnant + position) pour preuve officielle
-- À exécuter dans Supabase SQL Editor
-- ==========================================

CREATE TABLE IF NOT EXISTS gs_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES gs_tournaments(id) ON DELETE CASCADE,
  position INTEGER,                 -- place tirée (1, 2, 3...) ; NULL = tirage parmi tous
  label TEXT,                       -- libellé lisible (ex: "1ère place", "Tous les participants")
  seed TEXT NOT NULL,               -- graine reproductible (preuve)
  candidates JSONB DEFAULT '[]',    -- [{id, name, score}] participants au tirage
  winner_id TEXT,
  winner_name TEXT,
  winner_score INTEGER,
  drawn_from TEXT DEFAULT 'live',   -- 'live' (écran de fin) ou 'history' (a posteriori)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gs_draws_tournament ON gs_draws(tournament_id);
CREATE INDEX IF NOT EXISTS idx_gs_draws_created ON gs_draws(created_at DESC);

ALTER TABLE gs_draws ENABLE ROW LEVEL SECURITY;

-- Lecture: tout le monde (affichage de l'historique des tirages)
CREATE POLICY "gs_draws_select_all" ON gs_draws
  FOR SELECT USING (true);

-- Insertion/suppression: admins/teachers uniquement
CREATE POLICY "gs_draws_insert_admin" ON gs_draws
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

CREATE POLICY "gs_draws_delete_admin" ON gs_draws
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );
