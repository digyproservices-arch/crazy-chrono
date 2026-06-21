-- ==========================================
-- GRANDE SALLE - Historique détaillé des tournois
-- Stocke le classement final figé + lien vers la session (cartes/manches)
-- À exécuter dans Supabase SQL Editor
-- ==========================================

-- Classement complet figé à la fin du tournoi (avec finalRank, ex-aequo)
-- Format: [{ id, name, score, finalRank, eliminated, eliminatedWave }]
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS final_ranking JSONB DEFAULT '[]';

-- Lien vers training_sessions.id pour retrouver match_rounds (cartes générées)
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS session_id UUID;

-- Indique qu'il y a eu égalité au sommet (rang 1 partagé)
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS has_tie BOOLEAN DEFAULT false;

-- Index pour relier rapidement un tournoi à ses cartes
CREATE INDEX IF NOT EXISTS idx_gs_tournaments_session ON gs_tournaments(session_id);
