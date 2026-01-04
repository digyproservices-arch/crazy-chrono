-- =====================================================
-- NETTOYAGE DES ANCIENNES INVITATIONS ARENA
-- =====================================================
-- Ce script supprime les anciennes invitations de matchs
-- Arena terminés ou en erreur pour éviter la persistance
-- des notifications côté élèves.
-- 
-- À exécuter dans Supabase SQL Editor
-- =====================================================

-- 1. Afficher les matchs terminés ou en erreur
SELECT 
  id,
  room_code,
  status,
  created_at
FROM tournament_matches
WHERE status IN ('finished', 'cancelled', 'error')
ORDER BY created_at DESC;

-- 2. Supprimer les groupes liés à ces matchs terminés
DELETE FROM tournament_groups
WHERE match_id IN (
  SELECT id
  FROM tournament_matches
  WHERE status IN ('finished', 'cancelled', 'error')
    AND created_at < NOW() - INTERVAL '1 day' -- Plus de 24h
);

-- 3. Supprimer les matchs terminés de plus de 24h
DELETE FROM tournament_matches
WHERE status IN ('finished', 'cancelled', 'error')
  AND created_at < NOW() - INTERVAL '1 day';

-- 4. Vérification après nettoyage
SELECT 
  status,
  COUNT(*) as count
FROM tournament_matches
GROUP BY status
ORDER BY status;

-- =====================================================
-- NETTOYAGE MANUEL POUR UN MATCH SPÉCIFIQUE
-- =====================================================
-- Si vous voyez toujours une ancienne notification pour un match précis:

-- 1. Trouver le match_id via room_code (ex: 'ABC123')
-- SELECT id, room_code, status FROM tournament_matches WHERE room_code = 'ABC123';

-- 2. Supprimer le groupe
-- DELETE FROM tournament_groups WHERE match_id = '<match_id>';

-- 3. Supprimer le match
-- DELETE FROM tournament_matches WHERE id = '<match_id>';

-- =====================================================
-- SCRIPT AUTOMATIQUE À EXÉCUTER QUOTIDIENNEMENT
-- =====================================================
-- Pour nettoyer automatiquement les vieux matchs tous les jours

CREATE OR REPLACE FUNCTION clean_old_arena_matches()
RETURNS void AS $$
BEGIN
  -- Supprimer groupes des matchs terminés de plus de 24h
  DELETE FROM tournament_groups
  WHERE match_id IN (
    SELECT id
    FROM tournament_matches
    WHERE status IN ('finished', 'cancelled', 'error')
      AND created_at < NOW() - INTERVAL '1 day'
  );

  -- Supprimer matchs terminés de plus de 24h
  DELETE FROM tournament_matches
  WHERE status IN ('finished', 'cancelled', 'error')
    AND created_at < NOW() - INTERVAL '1 day';

  RAISE NOTICE 'Nettoyage terminé';
END;
$$ LANGUAGE plpgsql;

-- Créer un cron job pour exécuter cette fonction tous les jours à 3h du matin
-- (Nécessite l'extension pg_cron - vérifier si disponible sur Supabase)
-- SELECT cron.schedule('clean-old-arena-matches', '0 3 * * *', 'SELECT clean_old_arena_matches()');
