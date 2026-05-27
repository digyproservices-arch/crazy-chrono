-- ==========================================
-- GRANDE SALLE - Ajout type d'accès + table inscriptions
-- À exécuter dans Supabase SQL Editor
-- ==========================================

-- 1. Nouvelles colonnes sur gs_tournaments
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS access_type TEXT DEFAULT 'free' CHECK (access_type IN ('free', 'subscribers', 'paid'));
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS entry_price INTEGER DEFAULT 0;
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS selected_level TEXT DEFAULT 'CP';
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS pedagogic_config JSONB DEFAULT '{}';

-- 2. Table des inscriptions (collecte marketing + contrôle d'accès)
CREATE TABLE IF NOT EXISTS gs_tournament_entries (
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

CREATE INDEX IF NOT EXISTS idx_gs_entries_tournament ON gs_tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_gs_entries_email ON gs_tournament_entries(email);

-- RLS
ALTER TABLE gs_tournament_entries ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut insérer (les guests aussi via l'API)
CREATE POLICY "gs_entries_insert_all" ON gs_tournament_entries
  FOR INSERT WITH CHECK (true);

-- Seuls les admins peuvent lire (pour le dashboard marketing)
CREATE POLICY "gs_entries_select_admin" ON gs_tournament_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

-- Seuls les admins peuvent supprimer
CREATE POLICY "gs_entries_delete_admin" ON gs_tournament_entries
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );
