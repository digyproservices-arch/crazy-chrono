-- ==========================================
-- MIGRATION: Créer le tournoi officiel 2025-2026 Guadeloupe
-- À exécuter dans Supabase SQL Editor
-- Date: 2026-03-26
-- ==========================================

-- Ajouter colonne is_official sur tournament_matches si elle n'existe pas
ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT false;

-- Créer le tournoi officiel (status 'draft' = compétition fermée)
INSERT INTO tournaments (id, name, academy_code, status, current_phase, config, created_by)
VALUES (
  'tour_2025_gp',
  'Tournoi Interscolaire CrazyChrono 2025-2026',
  'GP',
  'draft',
  1,
  '{"levels":["CP","CE1","CE2","CM1","CM2"],"groupSize":4,"roundsPerMatch":3,"durationPerRound":60}',
  'rectorat@ac-guadeloupe.fr'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- Créer la phase 1 (Classe) si elle n'existe pas
INSERT INTO tournament_phases (id, tournament_id, level, name, status)
VALUES (
  'ph1_tour_2025_gp',
  'tour_2025_gp',
  1,
  'CRAZY WINNER CLASSE',
  'pending'
) ON CONFLICT (id) DO NOTHING;

-- Vérification
SELECT id, name, academy_code, status, current_phase FROM tournaments WHERE id = 'tour_2025_gp';
