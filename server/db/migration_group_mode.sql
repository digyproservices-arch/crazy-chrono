-- ==========================================
-- MIGRATION: Ajouter colonne 'mode' à tournament_groups
-- Pour distinguer les groupes Training des groupes Arena
-- ==========================================

-- Ajouter la colonne mode (default 'arena' pour rétro-compatibilité)
ALTER TABLE tournament_groups ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'arena';

-- Mettre à jour les groupes existants qui ont un match_id commençant par 'training_'
UPDATE tournament_groups 
SET mode = 'training' 
WHERE match_id LIKE 'training_%';
