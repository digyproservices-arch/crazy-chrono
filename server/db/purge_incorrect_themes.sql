-- =========================================================
-- Purge ciblée des tentatives avec thèmes incorrects
-- À exécuter UNE SEULE FOIS après le déploiement du fix
-- =========================================================

-- 1. Supprimer les tentatives avec le thème générique "Images & Textes"
DELETE FROM attempts WHERE theme = 'Images & Textes';

-- 2. Supprimer les tentatives où des légumes sont catégorisés comme "Plantes médicinales"
--    (Christophine, Giraumon, Gombo étaient mal classés)
DELETE FROM attempts 
WHERE theme = 'Plantes médicinales' 
  AND item_id LIKE '%Christophine%';

DELETE FROM attempts 
WHERE theme = 'Plantes médicinales' 
  AND item_id LIKE '%Giraumon%';

DELETE FROM attempts 
WHERE theme = 'Plantes médicinales' 
  AND item_id LIKE '%Gombo%';

-- 3. Vérification
SELECT theme, COUNT(*) as count 
FROM attempts 
GROUP BY theme 
ORDER BY count DESC;
