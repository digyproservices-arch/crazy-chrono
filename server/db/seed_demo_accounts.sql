-- ==========================================
-- LIAISON COMPTES DÉMO AVEC ÉLÈVES
-- Pour la démo Rectorat 22/12/2025
-- ==========================================

-- IMPORTANT : Ce script doit être exécuté APRÈS avoir créé les 5 comptes via l'interface
-- 1. prof.demo@crazy-chrono.com
-- 2. alice.demo@crazy-chrono.com
-- 3. bob.demo@crazy-chrono.com
-- 4. charlie.demo@crazy-chrono.com
-- 5. diana.demo@crazy-chrono.com

-- ============= VÉRIFICATION DES COMPTES =============
DO $$ 
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM auth.users WHERE email LIKE '%@crazy-chrono.com';
  RAISE NOTICE 'Comptes Crazy Chrono trouvés : %', v_count;
  
  IF v_count < 5 THEN
    RAISE EXCEPTION 'Erreur : Seulement % comptes trouvés. Créer d''abord les 5 comptes via l''interface !', v_count;
  END IF;
END $$;

-- ============= LIAISON COMPTES <-> ÉLÈVES =============

-- Prof (enseignant - pas d'élève lié, juste admin)
-- Aucune liaison nécessaire, il a déjà role='admin' dans user_profiles

-- Alice → s001 (Alice Bertrand)
INSERT INTO user_student_mapping (user_id, student_id, linked_by, notes, active)
SELECT 
  u.id,
  's001',
  'system',
  'Compte démo Rectorat - Alice Bertrand (CE1-A)',
  true
FROM auth.users u
WHERE u.email = 'alice.demo@crazy-chrono.com'
ON CONFLICT (user_id) DO UPDATE
SET student_id = 's001', 
    linked_at = CURRENT_TIMESTAMP,
    notes = 'Compte démo Rectorat - Alice Bertrand (CE1-A)',
    active = true;

-- Bob → s002 (Bob Charles)
INSERT INTO user_student_mapping (user_id, student_id, linked_by, notes, active)
SELECT 
  u.id,
  's002',
  'system',
  'Compte démo Rectorat - Bob Charles (CE1-A)',
  true
FROM auth.users u
WHERE u.email = 'bob.demo@crazy-chrono.com'
ON CONFLICT (user_id) DO UPDATE
SET student_id = 's002',
    linked_at = CURRENT_TIMESTAMP,
    notes = 'Compte démo Rectorat - Bob Charles (CE1-A)',
    active = true;

-- Charlie → s003 (Chloé Dubois)
INSERT INTO user_student_mapping (user_id, student_id, linked_by, notes, active)
SELECT 
  u.id,
  's003',
  'system',
  'Compte démo Rectorat - Chloé Dubois (CE1-A)',
  true
FROM auth.users u
WHERE u.email = 'charlie.demo@crazy-chrono.com'
ON CONFLICT (user_id) DO UPDATE
SET student_id = 's003',
    linked_at = CURRENT_TIMESTAMP,
    notes = 'Compte démo Rectorat - Chloé Dubois (CE1-A)',
    active = true;

-- Diana → s004 (David Emile)
INSERT INTO user_student_mapping (user_id, student_id, linked_by, notes, active)
SELECT 
  u.id,
  's004',
  'system',
  'Compte démo Rectorat - David Emile (CE1-A)',
  true
FROM auth.users u
WHERE u.email = 'diana.demo@crazy-chrono.com'
ON CONFLICT (user_id) DO UPDATE
SET student_id = 's004',
    linked_at = CURRENT_TIMESTAMP,
    notes = 'Compte démo Rectorat - David Emile (CE1-A)',
    active = true;

-- ============= VÉRIFICATION DES LICENCES =============
-- S'assurer que les élèves s001-s004 ont licensed=true
UPDATE students 
SET licensed = true 
WHERE id IN ('s001', 's002', 's003', 's004');

-- ============= CRÉATION DES LICENCES DÉMO =============
-- Licence pour chaque élève (valide 1 an)
INSERT INTO licenses (license_key, license_type, owner_type, owner_id, status, valid_from, valid_until, features, created_by)
VALUES
  ('DEMO-ALICE-2025', 'student', 'student', 's001', 'active', NOW(), NOW() + INTERVAL '1 year', 
   '["crazy_solo","crazy_duel","crazy_arena","tournament"]', 'system'),
  ('DEMO-BOB-2025', 'student', 'student', 's002', 'active', NOW(), NOW() + INTERVAL '1 year',
   '["crazy_solo","crazy_duel","crazy_arena","tournament"]', 'system'),
  ('DEMO-CHARLIE-2025', 'student', 'student', 's003', 'active', NOW(), NOW() + INTERVAL '1 year',
   '["crazy_solo","crazy_duel","crazy_arena","tournament"]', 'system'),
  ('DEMO-DIANA-2025', 'student', 'student', 's004', 'active', NOW(), NOW() + INTERVAL '1 year',
   '["crazy_solo","crazy_duel","crazy_arena","tournament"]', 'system')
ON CONFLICT (license_key) DO NOTHING;

-- Licence enseignant (illimitée)
INSERT INTO licenses (license_key, license_type, owner_type, owner_id, status, valid_from, valid_until, features, created_by)
SELECT 
  'DEMO-PROF-2025',
  'teacher',
  'user',
  u.id::text,
  'active',
  NOW(),
  NULL, -- Illimitée
  '["tournament_management","dashboard","crazy_arena_admin","student_stats","reports"]',
  'system'
FROM auth.users u
WHERE u.email = 'prof.demo@crazy-chrono.com'
ON CONFLICT (license_key) DO NOTHING;

-- ============= VÉRIFICATION FINALE =============
SELECT 
  'Liaison comptes démo terminée avec succès !' as message,
  COUNT(*) as nombre_liaisons
FROM user_student_mapping
WHERE student_id IN ('s001', 's002', 's003', 's004');

-- Afficher toutes les liaisons créées
SELECT 
  u.email,
  usm.student_id,
  s.first_name || ' ' || s.last_name as student_name,
  s.licensed,
  l.license_key,
  l.status as license_status,
  l.valid_until
FROM user_student_mapping usm
JOIN auth.users u ON usm.user_id = u.id
JOIN students s ON usm.student_id = s.id
LEFT JOIN licenses l ON l.owner_type = 'student' AND l.owner_id = usm.student_id
WHERE u.email LIKE '%@crazy-chrono.com'
ORDER BY usm.student_id;

-- Test de la fonction de vérification
SELECT 
  u.email,
  (check_user_can_play(u.id)).*
FROM auth.users u
WHERE u.email LIKE '%@crazy-chrono.com';

COMMIT;
