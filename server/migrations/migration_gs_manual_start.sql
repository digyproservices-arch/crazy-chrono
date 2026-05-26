-- ==========================================
-- GRANDE SALLE - Ajout colonne manual_start
-- À exécuter dans Supabase SQL Editor
-- ==========================================

ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS manual_start BOOLEAN DEFAULT true;
