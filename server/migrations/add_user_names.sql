-- Ajouter les colonnes first_name et last_name à user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Index pour recherche par nom
CREATE INDEX IF NOT EXISTS idx_user_profiles_names ON user_profiles (last_name, first_name);
