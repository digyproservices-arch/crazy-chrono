-- ==========================================
-- MIGRATION: Rôles CPD & CPC
-- CPD = Conseiller Pédagogique Départemental (vue région académique)
-- CPC = Conseiller Pédagogique de Circonscription (vue circo uniquement)
-- ==========================================

BEGIN;

-- 1. Ajouter la colonne circonscription_id à user_profiles (pour les CPC)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS circonscription_id VARCHAR(50);

-- 2. Mettre à jour la contrainte CHECK sur le rôle pour accepter 'cpd' et 'cpc'
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('admin', 'cpd', 'cpc', 'rectorat', 'teacher', 'editor', 'user'));

-- 3. Migrer les anciens rôles 'rectorat' vers 'cpd'
-- NOTE: on garde 'rectorat' comme alias valide côté code pour rétrocompatibilité
UPDATE user_profiles SET role = 'cpd' WHERE role = 'rectorat';

-- 4. Ajouter circonscription_id à la table invitations (pour stocker la circo lors de l'invitation CPC)
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS circonscription_id VARCHAR(50);

-- 5. Mettre à jour la contrainte CHECK sur le rôle de la table invitations
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check 
  CHECK (role IN ('admin', 'cpd', 'cpc', 'rectorat', 'teacher', 'editor', 'user'));

-- 4. Index pour recherche rapide par rôle + circo
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles (role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_circo ON user_profiles (circonscription_id) WHERE circonscription_id IS NOT NULL;

-- 4. Commentaires de documentation
COMMENT ON COLUMN user_profiles.role IS 'Rôle utilisateur: admin, cpd, cpc, teacher, editor, user';
COMMENT ON COLUMN user_profiles.circonscription_id IS 'ID de la circonscription (obligatoire pour rôle CPC, NULL pour les autres)';
COMMENT ON COLUMN user_profiles.region IS 'Région académique (obligatoire pour rôles CPD et CPC)';

COMMIT;

-- ══════════════════════════════════════════
-- Vérification post-migration
-- ══════════════════════════════════════════
SELECT role, COUNT(*) as total, 
       COUNT(circonscription_id) as avec_circo,
       COUNT(region) as avec_region
FROM user_profiles 
WHERE role IN ('cpd', 'cpc', 'rectorat', 'admin')
GROUP BY role;
