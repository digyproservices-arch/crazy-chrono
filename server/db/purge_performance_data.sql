-- =========================================================
-- PURGE COMPLÈTE DES DONNÉES DE PERFORMANCE
-- À exécuter dans Supabase SQL Editor
-- Date: 2026-05-14
-- Raison: Données de maîtrise corrompues (mauvaise catégorisation des thèmes)
-- 
-- ⚠️ IRRÉVERSIBLE — Supprime TOUTES les données de jeu
-- ✅ NE TOUCHE PAS aux comptes (users, students, classes, profils)
-- =========================================================

-- 1. Table attempts (tentatives par item — alimente onglet Maîtrise)
DELETE FROM attempts;

-- 2. Table mastery_progress (badges Bronze/Argent/Or — basés sur attempts)
DELETE FROM mastery_progress;

-- 3. Table match_player_summary (bilans par joueur — diagnostic pédagogique)
DELETE FROM match_player_summary;

-- 4. Table match_rounds (détail des manches — cartes jouées)
DELETE FROM match_rounds;

-- 5. Table training_results (résultats des parties training/multi/solo)
DELETE FROM training_results;

-- 6. Table match_results (résultats Arena/compétition)
DELETE FROM match_results;

-- 7. Table training_sessions (sessions de jeu — liées aux training_results)
DELETE FROM training_sessions;

-- 8. Table sessions (sessions solo — liées aux attempts)
DELETE FROM sessions;

-- =========================================================
-- VÉRIFICATION: Compter les lignes restantes (tout doit être à 0)
-- =========================================================
SELECT 'attempts' AS table_name, COUNT(*) AS remaining FROM attempts
UNION ALL SELECT 'mastery_progress', COUNT(*) FROM mastery_progress
UNION ALL SELECT 'match_player_summary', COUNT(*) FROM match_player_summary
UNION ALL SELECT 'match_rounds', COUNT(*) FROM match_rounds
UNION ALL SELECT 'training_results', COUNT(*) FROM training_results
UNION ALL SELECT 'match_results', COUNT(*) FROM match_results
UNION ALL SELECT 'training_sessions', COUNT(*) FROM training_sessions
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions;
