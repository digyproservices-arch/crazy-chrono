-- ============================================================
-- LAURÉATS DU TOURNOI ACADÉMIQUE CRAZY CHRONO 2026 (Guadeloupe)
-- Création des comptes lauréats + codes d'accès + licences datées
-- À exécuter UNE FOIS dans le SQL Editor de Supabase (projet PROD)
-- Idempotent : peut être relancé sans créer de doublons.
--
-- Barème des récompenses :
--   1er  -> 6 mois  | 2e -> 3 mois | 3e -> 1 mois
--   (ex æquo = même lot)
-- Total : 17 lauréats
-- ============================================================

-- 0) Pré-requis : colonne access_code (déjà ajoutée via migration_access_codes.sql)
ALTER TABLE students ADD COLUMN IF NOT EXISTS access_code VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_access_code
  ON students(access_code) WHERE access_code IS NOT NULL;

-- 1) École virtuelle regroupant les lauréats
INSERT INTO schools (id, name, type, city, created_at)
VALUES ('sch_laureats_tournoi_2026', 'Lauréats Tournoi Académique 2026', 'primaire', 'Guadeloupe', NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2) Une classe par niveau
INSERT INTO classes (id, school_id, name, level, teacher_name, student_count, created_at) VALUES
  ('cls_laureat_cp',  'sch_laureats_tournoi_2026', 'Lauréats CP',  'CP',  'Organisation Tournoi', 4, NOW()),
  ('cls_laureat_ce1', 'sch_laureats_tournoi_2026', 'Lauréats CE1', 'CE1', 'Organisation Tournoi', 3, NOW()),
  ('cls_laureat_ce2', 'sch_laureats_tournoi_2026', 'Lauréats CE2', 'CE2', 'Organisation Tournoi', 3, NOW()),
  ('cls_laureat_cm1', 'sch_laureats_tournoi_2026', 'Lauréats CM1', 'CM1', 'Organisation Tournoi', 3, NOW()),
  ('cls_laureat_cm2', 'sch_laureats_tournoi_2026', 'Lauréats CM2', 'CM2', 'Organisation Tournoi', 4, NOW())
ON CONFLICT (id) DO UPDATE SET student_count = EXCLUDED.student_count;

-- 3) Les 17 élèves lauréats (licensed = true, avec code d'accès)
INSERT INTO students (id, first_name, last_name, full_name, level, class_id, school_id, licensed, avatar_url, access_code, created_at) VALUES
  ('std_laureat_001', 'Jézahy',  'CONGRÉ',                 'Jézahy C.',  'CP',  'cls_laureat_cp',  'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'JEZAHY-CP-2613',  NOW()),
  ('std_laureat_002', 'Yohan',   'ROUYAR',                 'Yohan R.',   'CP',  'cls_laureat_cp',  'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'YOHAN-CP-4821',   NOW()),
  ('std_laureat_003', 'Néo',     'DOISNEAU',               'Néo D.',     'CP',  'cls_laureat_cp',  'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'NEO-CP-7194',     NOW()),
  ('std_laureat_004', 'Kénaël',  'TITE-CHICATE',           'Kénaël T.',  'CP',  'cls_laureat_cp',  'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'KENAEL-CP-3508',  NOW()),
  ('std_laureat_005', 'Gabriel', 'CHRISTANVAL',            'Gabriel C.', 'CE1', 'cls_laureat_ce1', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'GABRIE-CE1-6042', NOW()),
  ('std_laureat_006', 'Teddy',   'ROMIL',                  'Teddy R.',   'CE1', 'cls_laureat_ce1', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'TEDDY-CE1-1357',  NOW()),
  ('std_laureat_007', 'Layann',  'LAMBOURDIERE CESAIRE',   'Layann L.',  'CE1', 'cls_laureat_ce1', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'LAYANN-CE1-8820', NOW()),
  ('std_laureat_008', 'Soam',    'JEAN-BAPTISTE',          'Soam J.',    'CE2', 'cls_laureat_ce2', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'SOAM-CE2-4471',   NOW()),
  ('std_laureat_009', 'Kiran',   'VINGADASSALON',          'Kiran V.',   'CE2', 'cls_laureat_ce2', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'KIRAN-CE2-9063',  NOW()),
  ('std_laureat_010', 'Ayéfémi', 'YORO HORN',              'Ayéfémi Y.', 'CE2', 'cls_laureat_ce2', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'AYEFEM-CE2-2298', NOW()),
  ('std_laureat_011', 'Jessy',   'LESI-LANDRY',            'Jessy L.',   'CM1', 'cls_laureat_cm1', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'JESSY-CM1-5530',  NOW()),
  ('std_laureat_012', 'Teïssia', 'FLAUZIN',                'Teïssia F.', 'CM1', 'cls_laureat_cm1', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'TEISSI-CM1-7741', NOW()),
  ('std_laureat_013', 'Estéban', 'MANUEL LAURENT',         'Estéban M.', 'CM1', 'cls_laureat_cm1', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'ESTEBA-CM1-3164', NOW()),
  ('std_laureat_014', 'Lisy',    'ZAMOR-CAVALLI',          'Lisy Z.',    'CM2', 'cls_laureat_cm2', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'LISY-CM2-6689',   NOW()),
  ('std_laureat_015', 'Krystina','TABORD-FARNABE',         'Krystina T.','CM2', 'cls_laureat_cm2', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'KRYSTI-CM2-1902', NOW()),
  ('std_laureat_016', 'Djyhanna','BORES OUANNA',           'Djyhanna B.','CM2', 'cls_laureat_cm2', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'DJYHAN-CM2-4475', NOW()),
  ('std_laureat_017', 'Shawn',   'SEGRETIER',              'Shawn S.',   'CM2', 'cls_laureat_cm2', 'sch_laureats_tournoi_2026', true, '/avatars/default.png', 'SHAWN-CM2-8316',  NOW())
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name  = EXCLUDED.last_name,
  full_name  = EXCLUDED.full_name,
  level      = EXCLUDED.level,
  class_id   = EXCLUDED.class_id,
  school_id  = EXCLUDED.school_id,
  licensed   = true,
  access_code = EXCLUDED.access_code;

-- 4) Licences datées (valid_until = NOW() + durée du lot)
--    license_key = code d'accès (unique), owner_type='student', owner_id=id élève
INSERT INTO licenses (license_key, license_type, owner_type, owner_id, status, valid_from, valid_until, features, created_by) VALUES
  -- 1er : 6 mois
  ('JEZAHY-CP-2613',  'student', 'student', 'std_laureat_001', 'active', NOW(), NOW() + INTERVAL '6 months', '{"reward":"tournoi_2026","rank":"1er"}', 'tournoi_2026'),
  ('GABRIE-CE1-6042', 'student', 'student', 'std_laureat_005', 'active', NOW(), NOW() + INTERVAL '6 months', '{"reward":"tournoi_2026","rank":"1er"}', 'tournoi_2026'),
  ('SOAM-CE2-4471',   'student', 'student', 'std_laureat_008', 'active', NOW(), NOW() + INTERVAL '6 months', '{"reward":"tournoi_2026","rank":"1er"}', 'tournoi_2026'),
  ('JESSY-CM1-5530',  'student', 'student', 'std_laureat_011', 'active', NOW(), NOW() + INTERVAL '6 months', '{"reward":"tournoi_2026","rank":"1er ex aequo"}', 'tournoi_2026'),
  ('TEISSI-CM1-7741', 'student', 'student', 'std_laureat_012', 'active', NOW(), NOW() + INTERVAL '6 months', '{"reward":"tournoi_2026","rank":"1er ex aequo"}', 'tournoi_2026'),
  ('LISY-CM2-6689',   'student', 'student', 'std_laureat_014', 'active', NOW(), NOW() + INTERVAL '6 months', '{"reward":"tournoi_2026","rank":"1er"}', 'tournoi_2026'),
  -- 2e : 3 mois
  ('YOHAN-CP-4821',   'student', 'student', 'std_laureat_002', 'active', NOW(), NOW() + INTERVAL '3 months', '{"reward":"tournoi_2026","rank":"2e"}', 'tournoi_2026'),
  ('TEDDY-CE1-1357',  'student', 'student', 'std_laureat_006', 'active', NOW(), NOW() + INTERVAL '3 months', '{"reward":"tournoi_2026","rank":"2e"}', 'tournoi_2026'),
  ('KIRAN-CE2-9063',  'student', 'student', 'std_laureat_009', 'active', NOW(), NOW() + INTERVAL '3 months', '{"reward":"tournoi_2026","rank":"2e"}', 'tournoi_2026'),
  ('KRYSTI-CM2-1902', 'student', 'student', 'std_laureat_015', 'active', NOW(), NOW() + INTERVAL '3 months', '{"reward":"tournoi_2026","rank":"2e ex aequo"}', 'tournoi_2026'),
  ('DJYHAN-CM2-4475', 'student', 'student', 'std_laureat_016', 'active', NOW(), NOW() + INTERVAL '3 months', '{"reward":"tournoi_2026","rank":"2e ex aequo"}', 'tournoi_2026'),
  -- 3e : 1 mois
  ('NEO-CP-7194',     'student', 'student', 'std_laureat_003', 'active', NOW(), NOW() + INTERVAL '1 month', '{"reward":"tournoi_2026","rank":"3e ex aequo"}', 'tournoi_2026'),
  ('KENAEL-CP-3508',  'student', 'student', 'std_laureat_004', 'active', NOW(), NOW() + INTERVAL '1 month', '{"reward":"tournoi_2026","rank":"3e ex aequo"}', 'tournoi_2026'),
  ('LAYANN-CE1-8820', 'student', 'student', 'std_laureat_007', 'active', NOW(), NOW() + INTERVAL '1 month', '{"reward":"tournoi_2026","rank":"3e"}', 'tournoi_2026'),
  ('AYEFEM-CE2-2298', 'student', 'student', 'std_laureat_010', 'active', NOW(), NOW() + INTERVAL '1 month', '{"reward":"tournoi_2026","rank":"3e"}', 'tournoi_2026'),
  ('ESTEBA-CM1-3164', 'student', 'student', 'std_laureat_013', 'active', NOW(), NOW() + INTERVAL '1 month', '{"reward":"tournoi_2026","rank":"3e"}', 'tournoi_2026'),
  ('SHAWN-CM2-8316',  'student', 'student', 'std_laureat_017', 'active', NOW(), NOW() + INTERVAL '1 month', '{"reward":"tournoi_2026","rank":"3e"}', 'tournoi_2026')
ON CONFLICT (license_key) DO UPDATE SET
  status      = 'active',
  valid_from  = EXCLUDED.valid_from,
  valid_until = EXCLUDED.valid_until,
  owner_id    = EXCLUDED.owner_id,
  features    = EXCLUDED.features;

-- 5) Vérification
SELECT s.access_code, s.full_name, s.level, l.valid_until, l.status
FROM students s
JOIN licenses l ON l.owner_type = 'student' AND l.owner_id = s.id
WHERE s.school_id = 'sch_laureats_tournoi_2026'
ORDER BY s.level, l.valid_until DESC;
