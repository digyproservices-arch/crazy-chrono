-- ==========================================
-- GRANDE SALLE - Ajout colonne selected_level
-- À exécuter dans Supabase SQL Editor
-- ==========================================

ALTER TABLE gs_tournaments
  ADD COLUMN IF NOT EXISTS selected_level TEXT DEFAULT NULL;

COMMENT ON COLUMN gs_tournaments.selected_level IS 'Niveau scolaire ciblé pour le filtrage des zones (CP, CE1, CE2, CM1, CM2). NULL = tous niveaux.';
