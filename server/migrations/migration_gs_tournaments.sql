-- ==========================================
-- GRANDE SALLE - Table des tournois programmés
-- À exécuter dans Supabase SQL Editor
-- ==========================================

CREATE TABLE IF NOT EXISTS gs_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  themes TEXT[] DEFAULT '{}',
  classes TEXT[] DEFAULT '{}',
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_round INTEGER DEFAULT 90,
  elimination_percent INTEGER DEFAULT 25,
  rounds_per_elimination INTEGER DEFAULT 1,
  min_players INTEGER DEFAULT 3,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'open', 'playing', 'finished', 'cancelled')),
  created_by UUID REFERENCES auth.users(id),
  winner_name TEXT,
  winner_score INTEGER,
  total_players INTEGER DEFAULT 0,
  total_rounds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_gs_tournaments_status ON gs_tournaments(status);
CREATE INDEX IF NOT EXISTS idx_gs_tournaments_scheduled ON gs_tournaments(scheduled_at);

-- RLS policies
ALTER TABLE gs_tournaments ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire les tournois (pour afficher la liste)
CREATE POLICY "gs_tournaments_select_all" ON gs_tournaments
  FOR SELECT USING (true);

-- Seuls les admins peuvent insérer/modifier/supprimer
CREATE POLICY "gs_tournaments_insert_admin" ON gs_tournaments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

CREATE POLICY "gs_tournaments_update_admin" ON gs_tournaments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

CREATE POLICY "gs_tournaments_delete_admin" ON gs_tournaments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );
