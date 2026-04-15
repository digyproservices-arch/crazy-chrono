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

-- ==========================================
-- RATTRAPAGE: Groupes dont le match est terminé mais le groupe n'est pas marqué finished
-- ==========================================

-- Diagnostic: voir les groupes avec un match finished mais group.status != 'finished'
SELECT g.id AS group_id, g.name, g.status AS group_status, g.winner_id,
       m.id AS match_id, m.status AS match_status, m.winner
FROM tournament_groups g
JOIN tournament_matches m ON m.group_id = g.id
WHERE m.status = 'finished' AND g.status != 'finished';

-- Fix: Mettre à jour les groupes dont le match est finished
UPDATE tournament_groups g
SET 
  status = 'finished',
  winner_id = COALESCE(
    g.winner_id,
    (SELECT (m.winner::json->>'studentId')
     FROM tournament_matches m
     WHERE m.group_id = g.id AND m.status = 'finished'
     LIMIT 1)
  )
FROM tournament_matches m
WHERE m.group_id = g.id 
  AND m.status = 'finished' 
  AND g.status != 'finished';
