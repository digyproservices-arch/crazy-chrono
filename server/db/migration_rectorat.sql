-- ==========================================
-- MIGRATION: Support Rectorat + Compétition Officielle
-- À exécuter dans Supabase SQL Editor
-- Date: 2026-03-24
-- ==========================================

-- 1. Ajouter colonne 'region' sur user_profiles (pour comptes rectorat)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS region VARCHAR(50);

-- 2. Ajouter colonne 'region' sur invitations (pour inviter un cadre avec sa région)
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS region VARCHAR(50);

-- 3. Ajouter flag 'is_official' sur tournament_matches (compétition officielle vs entraînement)
ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT false;

-- 4. Ajouter rounds_data JSONB pour stocker les zones de chaque round (archivage cartes)
-- Format: [{ roundIndex, timestamp, zones: [{id, type, content, pairId, points, ...}] }]
ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS rounds_data JSONB;

-- 5. Ajouter rounds_data JSONB à training_sessions (même format que tournament_matches)
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS rounds_data JSONB;

-- 6. Index pour filtrer rapidement les matchs officiels
CREATE INDEX IF NOT EXISTS idx_matches_official ON tournament_matches(is_official) WHERE is_official = true;

-- 5. Index pour filtrer par région
CREATE INDEX IF NOT EXISTS idx_user_profiles_region ON user_profiles(region) WHERE region IS NOT NULL;

-- Vérification
SELECT 'Migration rectorat OK' AS status;
