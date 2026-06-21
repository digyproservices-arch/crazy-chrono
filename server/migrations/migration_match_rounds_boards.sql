-- ==========================================
-- match_rounds : stocker TOUS les plateaux successifs d'une manche
-- (Grande Salle = une manche est une durée ; le plateau de 16 zones se régénère
--  à chaque bonne paire trouvée → on conserve la séquence complète des plateaux)
-- À exécuter dans Supabase SQL Editor
-- ==========================================

ALTER TABLE match_rounds ADD COLUMN IF NOT EXISTS boards JSONB DEFAULT '[]';
