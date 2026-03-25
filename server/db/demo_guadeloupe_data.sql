-- ==========================================
-- DONNÉES DÉMO: 11 Circonscriptions de Guadeloupe
-- 2 écoles par circonscription, 5 niveaux (CP→CM2) par école, 4 élèves par classe
-- Total: 22 écoles, 110 classes, 440 élèves licenciés
-- → Permet un tournoi avec un gagnant par catégorie (CP, CE1, CE2, CM1, CM2)
-- À exécuter dans Supabase SQL Editor
-- Date: 2026-03-25
-- ==========================================

-- ══════════════════════════════════════════
-- 0. NETTOYAGE données démo précédentes
-- ══════════════════════════════════════════
DELETE FROM students WHERE school_id IN (SELECT id FROM schools WHERE circonscription_id LIKE 'circ_%');
DELETE FROM classes WHERE school_id IN (SELECT id FROM schools WHERE circonscription_id LIKE 'circ_%');
DELETE FROM schools WHERE circonscription_id LIKE 'circ_%';

-- ══════════════════════════════════════════
-- 1. ÉCOLES (22)
-- ══════════════════════════════════════════
INSERT INTO schools (id, name, type, city, circonscription_id, postal_code) VALUES
('sch_abymes1_fengarol', 'École Amédée Fengarol', 'primaire', 'Les Abymes', 'circ_abymes_1', '97139'),
('sch_abymes1_bebian', 'École Bébian', 'primaire', 'Les Abymes', 'circ_abymes_1', '97139'),
('sch_abymes2_boisripeaux', 'École Boisripeaux', 'primaire', 'Les Abymes', 'circ_abymes_2', '97139'),
('sch_abymes2_grandcamp', 'École Grand-Camp', 'primaire', 'Les Abymes', 'circ_abymes_2', '97139'),
('sch_baiemahault_calvaire', 'École du Calvaire', 'primaire', 'Baie-Mahault', 'circ_baie_mahault', '97122'),
('sch_baiemahault_trioncelle', 'École Trioncelle', 'primaire', 'Baie-Mahault', 'circ_baie_mahault', '97122'),
('sch_basseterre_maisoncelle', 'École Maisoncelle', 'primaire', 'Basse-Terre', 'circ_basse_terre', '97100'),
('sch_basseterre_riviere', 'École Rivière des Pères', 'primaire', 'Basse-Terre', 'circ_basse_terre', '97100'),
('sch_bouillante_pigeon', 'École de Pigeon', 'primaire', 'Bouillante', 'circ_bouillante', '97125'),
('sch_bouillante_thomas', 'École Thomas', 'primaire', 'Bouillante', 'circ_bouillante', '97125'),
('sch_capesterre_bananier', 'École du Bananier', 'primaire', 'Capesterre-Belle-Eau', 'circ_capesterre', '97130'),
('sch_capesterre_routhiers', 'École Routhiers', 'primaire', 'Capesterre-Belle-Eau', 'circ_capesterre', '97130'),
('sch_gosier_maregaillard', 'École Mare-Gaillard', 'primaire', 'Le Gosier', 'circ_gosier', '97190'),
('sch_gosier_montauban', 'École Montauban', 'primaire', 'Le Gosier', 'circ_gosier', '97190'),
('sch_morneaeau_vieuxbourg', 'École Vieux-Bourg', 'primaire', 'Morne-à-l''Eau', 'circ_morne_a_eau', '97111'),
('sch_morneaeau_perrin', 'École Perrin', 'primaire', 'Morne-à-l''Eau', 'circ_morne_a_eau', '97111'),
('sch_pointeapitre_boisneuf', 'École Achille René-Boisneuf', 'primaire', 'Pointe-à-Pitre', 'circ_pointe_a_pitre', '97110'),
('sch_pointeapitre_centre', 'École du Centre', 'primaire', 'Pointe-à-Pitre', 'circ_pointe_a_pitre', '97110'),
('sch_sainteanne_boisvin', 'École Boisvin', 'primaire', 'Sainte-Anne', 'circ_sainte_anne', '97180'),
('sch_sainteanne_chateaubrun', 'École Châteaubrun', 'primaire', 'Sainte-Anne', 'circ_sainte_anne', '97180'),
('sch_sainerose_nogent', 'École Nogent', 'primaire', 'Sainte-Rose', 'circ_sainte_rose', '97115'),
('sch_sainerose_sofaia', 'École Sofaïa', 'primaire', 'Sainte-Rose', 'circ_sainte_rose', '97115');

-- ══════════════════════════════════════════
-- 2. CLASSES (110) + ÉLÈVES (440) — Générés par PL/pgSQL
--    5 niveaux par école: CP, CE1, CE2, CM1, CM2
--    4 élèves par classe, tous licenciés avec code d'accès
-- ══════════════════════════════════════════
DO $$
DECLARE
  v_levels text[] := ARRAY['CP', 'CE1', 'CE2', 'CM1', 'CM2'];
  v_first_names text[] := ARRAY[
    'Enzo','Jade','Noah','Léa','Lucas','Emma','Raphaël','Inès',
    'Nathan','Chloé','Hugo','Sarah','Axel','Manon','Gaël','Zoé',
    'Mathis','Lola','Dylan','Clara','Jordan','Lisa','Tyler','Marie',
    'Bryan','Anaïs','Léo','Camille','Kévin','Maëlys','Loïc','Priscilla',
    'Dimitri','Océane','Cédric','Mélissa','Fabrice','Vanessa','Samuel','Audrey'
  ];
  v_last_names text[] := ARRAY[
    'Bambuck','Calixte','Dain','Gustave','Hilaire','Fabre','Ozier','Lagier',
    'Virapin','Ramcé','Nemausat','Borromé','Confiant','Kancel','Targéba','Euzet',
    'Dulac','Bernier','Ibo','Narayanin','Udol','Wachter','Zandrino','Yango',
    'Quidal','Gabali','Pinto','Mango','Gauthier','Lastel','Chalus','Clavier'
  ];
  v_teacher_names text[] := ARRAY[
    'Mme Calixte','M. Bambuck','Mme Dulac','M. Gustave','Mme Lagier',
    'M. Hilaire','Mme Borromé','M. Confiant','Mme Gabali','M. Ozier',
    'Mme Ramcé','M. Kancel','Mme Fabre','M. Virapin','Mme Sainte-Rose',
    'M. Nemausat','Mme Targéba','M. Chalus','Mme Jérémie','M. Lastel',
    'Mme Euzet','M. Clavier'
  ];
  v_rec RECORD;
  v_level text;
  v_class_id text;
  v_sch_key text;
  v_student_idx int := 0;
  v_school_idx int := 0;
  v_fn text;
  v_ln text;
  v_fn_clean text;
  v_teacher text;
  v_fn_count int;
  v_ln_count int;
BEGIN
  v_fn_count := array_length(v_first_names, 1);
  v_ln_count := array_length(v_last_names, 1);

  FOR v_rec IN SELECT id, name, circonscription_id FROM schools WHERE circonscription_id LIKE 'circ_%' ORDER BY id LOOP
    v_school_idx := v_school_idx + 1;
    v_sch_key := substring(v_rec.id from 5);
    v_teacher := v_teacher_names[((v_school_idx - 1) % array_length(v_teacher_names, 1)) + 1];

    FOREACH v_level IN ARRAY v_levels LOOP
      v_class_id := 'cls_' || v_sch_key || '_' || lower(v_level) || 'a';

      INSERT INTO classes (id, school_id, name, level, teacher_name, student_count)
      VALUES (v_class_id, v_rec.id, v_level || '-A', v_level, v_teacher, 4)
      ON CONFLICT (id) DO NOTHING;

      FOR i IN 1..4 LOOP
        v_student_idx := v_student_idx + 1;
        v_fn := v_first_names[((v_student_idx - 1) % v_fn_count) + 1];
        v_ln := v_last_names[((v_student_idx - 1) % v_ln_count) + 1];
        v_fn_clean := upper(replace(replace(replace(replace(replace(replace(replace(
          v_fn, 'é','E'), 'è','E'), 'ë','E'), 'ï','I'), 'î','I'), '-',''), ' ',''));

        INSERT INTO students (id, first_name, last_name, full_name, level, class_id, school_id, circonscription_id, licensed, access_code, avatar_url)
        VALUES (
          'std_demo_' || lpad(v_student_idx::text, 4, '0'),
          v_fn, v_ln,
          v_fn || ' ' || substring(v_ln from 1 for 1) || '.',
          v_level,
          v_class_id,
          v_rec.id,
          v_rec.circonscription_id,
          true,
          v_fn_clean || '-' || v_level || 'A-' || (4700 + v_student_idx),
          '/avatars/default.png'
        )
        ON CONFLICT (id) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Démo Guadeloupe: % écoles, 110 classes, % élèves créés', v_school_idx, v_student_idx;
END $$;

-- ══════════════════════════════════════════
-- 3. VÉRIFICATION
-- ══════════════════════════════════════════
SELECT 
  'Données démo Guadeloupe' AS status,
  (SELECT COUNT(*) FROM schools WHERE circonscription_id LIKE 'circ_%') AS ecoles,
  (SELECT COUNT(*) FROM classes WHERE school_id IN (SELECT id FROM schools WHERE circonscription_id LIKE 'circ_%')) AS classes,
  (SELECT COUNT(*) FROM students WHERE circonscription_id LIKE 'circ_%') AS eleves,
  (SELECT COUNT(DISTINCT level) FROM classes WHERE school_id IN (SELECT id FROM schools WHERE circonscription_id LIKE 'circ_%')) AS niveaux;
