-- ==========================================
-- MIGRATION: Ajouter colonne 'tour_number' à tournament_groups
-- Permet de distinguer Tour 1, Tour 2, Tour 3... au sein d'une même phase
-- À exécuter dans Supabase SQL Editor
-- Date: 2026-04-14
-- ==========================================

-- Ajouter la colonne tour_number (default 1 pour rétro-compatibilité)
ALTER TABLE tournament_groups ADD COLUMN IF NOT EXISTS tour_number INT DEFAULT 1;

-- Index pour requêtes par tour
CREATE INDEX IF NOT EXISTS idx_groups_tour ON tournament_groups(tournament_id, phase_level, tour_number);

-- Vérification
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'tournament_groups' AND column_name = 'tour_number';
