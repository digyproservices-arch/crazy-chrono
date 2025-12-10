-- ============================================
-- LIER LES COMPTES UTILISATEURS AUX ÉLÈVES
-- ============================================
-- Ce script lie les comptes email aux student_id dans user_student_mapping
-- À exécuter dans Supabase SQL Editor

-- 1. Supprimer les anciennes liaisons si elles existent
DELETE FROM user_student_mapping 
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE email IN (
    'crazy.chrono.contact@gmail.com',
    'digyproservices@gmail.com',
    'rulingplace@gmail.com',
    'designisland97@gmail.com'
  )
);

-- 2. Créer les nouvelles liaisons

-- Alice (s001) → crazy.chrono.contact@gmail.com
INSERT INTO user_student_mapping (user_id, student_id, active, linked_at)
SELECT 
  u.id as user_id,
  's001' as student_id,
  true as active,
  NOW() as linked_at
FROM auth.users u
WHERE u.email = 'crazy.chrono.contact@gmail.com';

-- Bob (s002) → digyproservices@gmail.com
INSERT INTO user_student_mapping (user_id, student_id, active, linked_at)
SELECT 
  u.id as user_id,
  's002' as student_id,
  true as active,
  NOW() as linked_at
FROM auth.users u
WHERE u.email = 'digyproservices@gmail.com';

-- Chloé (s003) → rulingplace@gmail.com
INSERT INTO user_student_mapping (user_id, student_id, active, linked_at)
SELECT 
  u.id as user_id,
  's003' as student_id,
  true as active,
  NOW() as linked_at
FROM auth.users u
WHERE u.email = 'rulingplace@gmail.com';

-- David (s004) → designisland97@gmail.com
INSERT INTO user_student_mapping (user_id, student_id, active, linked_at)
SELECT 
  u.id as user_id,
  's004' as student_id,
  true as active,
  NOW() as linked_at
FROM auth.users u
WHERE u.email = 'designisland97@gmail.com';

-- 3. Vérifier les liaisons créées
SELECT 
  u.email,
  m.student_id,
  m.active,
  m.linked_at,
  s.full_name as student_name
FROM user_student_mapping m
JOIN auth.users u ON u.id = m.user_id
LEFT JOIN students s ON s.id = m.student_id
WHERE u.email IN (
  'crazy.chrono.contact@gmail.com',
  'digyproservices@gmail.com',
  'rulingplace@gmail.com',
  'designisland97@gmail.com'
)
ORDER BY m.student_id;

-- ✅ Tu devrais voir 4 lignes avec les 4 comptes liés
