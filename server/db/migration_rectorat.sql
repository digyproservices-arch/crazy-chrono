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

-- 7. Index pour filtrer par région
CREATE INDEX IF NOT EXISTS idx_user_profiles_region ON user_profiles(region) WHERE region IS NOT NULL;

-- 8. Ajouter 'rectorat' au CHECK CONSTRAINT sur invitations.role
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check 
  CHECK (role IN ('user', 'editor', 'teacher', 'admin', 'rectorat'));

-- Idem pour user_profiles si besoin
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('user', 'editor', 'teacher', 'admin', 'rectorat'));

-- ==========================================
-- 9. RLS POLICIES pour la table invitations
-- Permet aux admin de créer/lire/modifier des invitations
-- ==========================================

-- Activer RLS si pas déjà fait
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes policies si elles existent (pour éviter les conflits)
DROP POLICY IF EXISTS "Admin can insert invitations" ON invitations;
DROP POLICY IF EXISTS "Admin can read invitations" ON invitations;
DROP POLICY IF EXISTS "Admin can update invitations" ON invitations;
DROP POLICY IF EXISTS "Anyone can read invitation by token" ON invitations;

-- Admin: INSERT
CREATE POLICY "Admin can insert invitations" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Admin: SELECT (toutes les invitations)
CREATE POLICY "Admin can read invitations" ON invitations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Admin: UPDATE (marquer comme utilisée)
CREATE POLICY "Admin can update invitations" ON invitations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Public: lire une invitation par son token (pour le lien d'inscription)
CREATE POLICY "Anyone can read invitation by token" ON invitations
  FOR SELECT TO authenticated
  USING (true);

-- Vérification
SELECT 'Migration rectorat + RLS OK' AS status;
