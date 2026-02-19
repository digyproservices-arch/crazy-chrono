-- ==========================================
-- MIGRATION: Ajout des codes d'accès élèves
-- À exécuter UNE FOIS dans le SQL Editor de Supabase
-- ==========================================

-- 1) Ajouter la colonne access_code à la table students
ALTER TABLE students ADD COLUMN IF NOT EXISTS access_code VARCHAR(30);

-- 2) Index unique pour recherche rapide par code
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_access_code 
  ON students(access_code) 
  WHERE access_code IS NOT NULL;

-- 3) Vérification
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'students' AND column_name = 'access_code';
