-- Ajouter les colonnes de préférences utilisateur à user_profiles
-- À exécuter dans le SQL Editor de Supabase

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS pseudo TEXT,
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'fr',
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS strict_elements_mode BOOLEAN DEFAULT false;
