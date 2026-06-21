-- ==========================================
-- match_rounds : stocker TOUTES les paires trouvées d'une manche
-- (Grande Salle = plusieurs paires correctes par plateau, trouvées par plusieurs joueurs)
-- À exécuter dans Supabase SQL Editor
-- ==========================================

ALTER TABLE match_rounds ADD COLUMN IF NOT EXISTS pairs_found JSONB DEFAULT '[]';
