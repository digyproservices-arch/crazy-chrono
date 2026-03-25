-- ==========================================
-- DONNÉES DÉMO: 11 Circonscriptions de Guadeloupe
-- 2 écoles par circonscription, 1 classe par école, 4 élèves par classe
-- Total: 22 écoles, 22 classes, 88 élèves licenciés
-- À exécuter dans Supabase SQL Editor
-- Date: 2026-03-25
-- ==========================================

-- ══════════════════════════════════════════
-- ÉCOLES (22)
-- ══════════════════════════════════════════

INSERT INTO schools (id, name, type, city, circonscription_id, postal_code) VALUES
-- Circonscription 1: Abymes 1
('sch_abymes1_fengarol', 'École Amédée Fengarol', 'primaire', 'Les Abymes', 'circ_abymes_1', '97139'),
('sch_abymes1_bebian', 'École Bébian', 'primaire', 'Les Abymes', 'circ_abymes_1', '97139'),
-- Circonscription 2: Abymes 2
('sch_abymes2_boisripeaux', 'École Boisripeaux', 'primaire', 'Les Abymes', 'circ_abymes_2', '97139'),
('sch_abymes2_grandcamp', 'École Grand-Camp', 'primaire', 'Les Abymes', 'circ_abymes_2', '97139'),
-- Circonscription 3: Baie-Mahault
('sch_baiemahault_calvaire', 'École du Calvaire', 'primaire', 'Baie-Mahault', 'circ_baie_mahault', '97122'),
('sch_baiemahault_trioncelle', 'École Trioncelle', 'primaire', 'Baie-Mahault', 'circ_baie_mahault', '97122'),
-- Circonscription 4: Basse-Terre
('sch_basseterre_maisoncelle', 'École Maisoncelle', 'primaire', 'Basse-Terre', 'circ_basse_terre', '97100'),
('sch_basseterre_riviere', 'École Rivière des Pères', 'primaire', 'Basse-Terre', 'circ_basse_terre', '97100'),
-- Circonscription 5: Bouillante
('sch_bouillante_pigeon', 'École de Pigeon', 'primaire', 'Bouillante', 'circ_bouillante', '97125'),
('sch_bouillante_thomas', 'École Thomas', 'primaire', 'Bouillante', 'circ_bouillante', '97125'),
-- Circonscription 6: Capesterre-Belle-Eau
('sch_capesterre_bananier', 'École du Bananier', 'primaire', 'Capesterre-Belle-Eau', 'circ_capesterre', '97130'),
('sch_capesterre_routhiers', 'École Routhiers', 'primaire', 'Capesterre-Belle-Eau', 'circ_capesterre', '97130'),
-- Circonscription 7: Gosier
('sch_gosier_maregaillard', 'École Mare-Gaillard', 'primaire', 'Le Gosier', 'circ_gosier', '97190'),
('sch_gosier_montauban', 'École Montauban', 'primaire', 'Le Gosier', 'circ_gosier', '97190'),
-- Circonscription 8: Morne-à-l'Eau
('sch_morneaeau_vieuxbourg', 'École Vieux-Bourg', 'primaire', 'Morne-à-l''Eau', 'circ_morne_a_eau', '97111'),
('sch_morneaeau_perrin', 'École Perrin', 'primaire', 'Morne-à-l''Eau', 'circ_morne_a_eau', '97111'),
-- Circonscription 9: Pointe-à-Pitre
('sch_pointeapitre_boisneuf', 'École Achille René-Boisneuf', 'primaire', 'Pointe-à-Pitre', 'circ_pointe_a_pitre', '97110'),
('sch_pointeapitre_centre', 'École du Centre', 'primaire', 'Pointe-à-Pitre', 'circ_pointe_a_pitre', '97110'),
-- Circonscription 10: Sainte-Anne
('sch_sainteanne_boisvin', 'École Boisvin', 'primaire', 'Sainte-Anne', 'circ_sainte_anne', '97180'),
('sch_sainteanne_chateaubrun', 'École Châteaubrun', 'primaire', 'Sainte-Anne', 'circ_sainte_anne', '97180'),
-- Circonscription 11: Sainte-Rose
('sch_sainerose_nogent', 'École Nogent', 'primaire', 'Sainte-Rose', 'circ_sainte_rose', '97115'),
('sch_sainerose_sofaia', 'École Sofaïa', 'primaire', 'Sainte-Rose', 'circ_sainte_rose', '97115')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════
-- CLASSES (22 — une par école, niveaux CM1/CM2)
-- ══════════════════════════════════════════

INSERT INTO classes (id, school_id, name, level, teacher_name, teacher_email, student_count) VALUES
-- Abymes 1
('cls_fengarol_cm2a', 'sch_abymes1_fengarol', 'CM2-A', 'CM2', 'Mme Calixte', 'calixte.marie@ac-guadeloupe.fr', 4),
('cls_bebian_cm1a', 'sch_abymes1_bebian', 'CM1-A', 'CM1', 'M. Bambuck', 'bambuck.thierry@ac-guadeloupe.fr', 4),
-- Abymes 2
('cls_boisripeaux_cm2a', 'sch_abymes2_boisripeaux', 'CM2-A', 'CM2', 'Mme Dulac', 'dulac.priscilla@ac-guadeloupe.fr', 4),
('cls_grandcamp_cm1a', 'sch_abymes2_grandcamp', 'CM1-A', 'CM1', 'M. Gustave', 'gustave.fabrice@ac-guadeloupe.fr', 4),
-- Baie-Mahault
('cls_calvaire_cm2a', 'sch_baiemahault_calvaire', 'CM2-A', 'CM2', 'Mme Lagier', 'lagier.audrey@ac-guadeloupe.fr', 4),
('cls_trioncelle_cm1a', 'sch_baiemahault_trioncelle', 'CM1-A', 'CM1', 'M. Hilaire', 'hilaire.cedric@ac-guadeloupe.fr', 4),
-- Basse-Terre
('cls_maisoncelle_cm2a', 'sch_basseterre_maisoncelle', 'CM2-A', 'CM2', 'Mme Borromé', 'borrome.vanessa@ac-guadeloupe.fr', 4),
('cls_riviere_cm1a', 'sch_basseterre_riviere', 'CM1-A', 'CM1', 'M. Confiant', 'confiant.yannick@ac-guadeloupe.fr', 4),
-- Bouillante
('cls_pigeon_cm2a', 'sch_bouillante_pigeon', 'CM2-A', 'CM2', 'Mme Gabali', 'gabali.stephanie@ac-guadeloupe.fr', 4),
('cls_thomas_cm1a', 'sch_bouillante_thomas', 'CM1-A', 'CM1', 'M. Ozier', 'ozier.dimitri@ac-guadeloupe.fr', 4),
-- Capesterre-Belle-Eau
('cls_bananier_cm2a', 'sch_capesterre_bananier', 'CM2-A', 'CM2', 'Mme Ramcé', 'ramce.melissa@ac-guadeloupe.fr', 4),
('cls_routhiers_cm1a', 'sch_capesterre_routhiers', 'CM1-A', 'CM1', 'M. Kancel', 'kancel.loic@ac-guadeloupe.fr', 4),
-- Gosier
('cls_maregaillard_cm2a', 'sch_gosier_maregaillard', 'CM2-A', 'CM2', 'Mme Fabre', 'fabre.anais@ac-guadeloupe.fr', 4),
('cls_montauban_cm1a', 'sch_gosier_montauban', 'CM1-A', 'CM1', 'M. Virapin', 'virapin.samuel@ac-guadeloupe.fr', 4),
-- Morne-à-l'Eau
('cls_vieuxbourg_cm2a', 'sch_morneaeau_vieuxbourg', 'CM2-A', 'CM2', 'Mme Sainte-Rose', 'sainterose.lucie@ac-guadeloupe.fr', 4),
('cls_perrin_cm1a', 'sch_morneaeau_perrin', 'CM1-A', 'CM1', 'M. Nemausat', 'nemausat.gael@ac-guadeloupe.fr', 4),
-- Pointe-à-Pitre
('cls_boisneuf_cm2a', 'sch_pointeapitre_boisneuf', 'CM2-A', 'CM2', 'Mme Targéba', 'targeba.camille@ac-guadeloupe.fr', 4),
('cls_centre_cm1a', 'sch_pointeapitre_centre', 'CM1-A', 'CM1', 'M. Chalus', 'chalus.matthieu@ac-guadeloupe.fr', 4),
-- Sainte-Anne
('cls_boisvin_cm2a', 'sch_sainteanne_boisvin', 'CM2-A', 'CM2', 'Mme Jérémie', 'jeremie.oceane@ac-guadeloupe.fr', 4),
('cls_chateaubrun_cm1a', 'sch_sainteanne_chateaubrun', 'CM1-A', 'CM1', 'M. Lastel', 'lastel.nathan@ac-guadeloupe.fr', 4),
-- Sainte-Rose
('cls_nogent_cm2a', 'sch_sainerose_nogent', 'CM2-A', 'CM2', 'Mme Euzet', 'euzet.julie@ac-guadeloupe.fr', 4),
('cls_sofaia_cm1a', 'sch_sainerose_sofaia', 'CM1-A', 'CM1', 'M. Clavier', 'clavier.raphael@ac-guadeloupe.fr', 4)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════
-- ÉLÈVES (88 — 4 par classe, tous licenciés)
-- ══════════════════════════════════════════

INSERT INTO students (id, first_name, last_name, full_name, level, class_id, school_id, circonscription_id, licensed, access_code, avatar_url) VALUES
-- ── Abymes 1 — École Fengarol CM2-A ──
('std_fengarol_0001', 'Enzo', 'Bambuck', 'Enzo B.', 'CM2', 'cls_fengarol_cm2a', 'sch_abymes1_fengarol', 'circ_abymes_1', true, 'ENZO-CM2A-4701', '/avatars/default.png'),
('std_fengarol_0002', 'Jade', 'Calixte', 'Jade C.', 'CM2', 'cls_fengarol_cm2a', 'sch_abymes1_fengarol', 'circ_abymes_1', true, 'JADE-CM2A-4702', '/avatars/default.png'),
('std_fengarol_0003', 'Noah', 'Dain', 'Noah D.', 'CM2', 'cls_fengarol_cm2a', 'sch_abymes1_fengarol', 'circ_abymes_1', true, 'NOAH-CM2A-4703', '/avatars/default.png'),
('std_fengarol_0004', 'Léa', 'Gustave', 'Léa G.', 'CM2', 'cls_fengarol_cm2a', 'sch_abymes1_fengarol', 'circ_abymes_1', true, 'LEA-CM2A-4704', '/avatars/default.png'),
-- ── Abymes 1 — École Bébian CM1-A ──
('std_bebian_0001', 'Lucas', 'Hilaire', 'Lucas H.', 'CM1', 'cls_bebian_cm1a', 'sch_abymes1_bebian', 'circ_abymes_1', true, 'LUCAS-CM1A-4705', '/avatars/default.png'),
('std_bebian_0002', 'Emma', 'Fabre', 'Emma F.', 'CM1', 'cls_bebian_cm1a', 'sch_abymes1_bebian', 'circ_abymes_1', true, 'EMMA-CM1A-4706', '/avatars/default.png'),
('std_bebian_0003', 'Raphaël', 'Ozier', 'Raphaël O.', 'CM1', 'cls_bebian_cm1a', 'sch_abymes1_bebian', 'circ_abymes_1', true, 'RAPHAEL-CM1A-4707', '/avatars/default.png'),
('std_bebian_0004', 'Inès', 'Lagier', 'Inès L.', 'CM1', 'cls_bebian_cm1a', 'sch_abymes1_bebian', 'circ_abymes_1', true, 'INES-CM1A-4708', '/avatars/default.png'),
-- ── Abymes 2 — École Boisripeaux CM2-A ──
('std_boisripeaux_0001', 'Nathan', 'Virapin', 'Nathan V.', 'CM2', 'cls_boisripeaux_cm2a', 'sch_abymes2_boisripeaux', 'circ_abymes_2', true, 'NATHAN-CM2A-4709', '/avatars/default.png'),
('std_boisripeaux_0002', 'Chloé', 'Ramcé', 'Chloé R.', 'CM2', 'cls_boisripeaux_cm2a', 'sch_abymes2_boisripeaux', 'circ_abymes_2', true, 'CHLOE-CM2A-4710', '/avatars/default.png'),
('std_boisripeaux_0003', 'Hugo', 'Nemausat', 'Hugo N.', 'CM2', 'cls_boisripeaux_cm2a', 'sch_abymes2_boisripeaux', 'circ_abymes_2', true, 'HUGO-CM2A-4711', '/avatars/default.png'),
('std_boisripeaux_0004', 'Sarah', 'Borromé', 'Sarah B.', 'CM2', 'cls_boisripeaux_cm2a', 'sch_abymes2_boisripeaux', 'circ_abymes_2', true, 'SARAH-CM2A-4712', '/avatars/default.png'),
-- ── Abymes 2 — École Grand-Camp CM1-A ──
('std_grandcamp_0001', 'Axel', 'Confiant', 'Axel C.', 'CM1', 'cls_grandcamp_cm1a', 'sch_abymes2_grandcamp', 'circ_abymes_2', true, 'AXEL-CM1A-4713', '/avatars/default.png'),
('std_grandcamp_0002', 'Manon', 'Kancel', 'Manon K.', 'CM1', 'cls_grandcamp_cm1a', 'sch_abymes2_grandcamp', 'circ_abymes_2', true, 'MANON-CM1A-4714', '/avatars/default.png'),
('std_grandcamp_0003', 'Gaël', 'Targéba', 'Gaël T.', 'CM1', 'cls_grandcamp_cm1a', 'sch_abymes2_grandcamp', 'circ_abymes_2', true, 'GAEL-CM1A-4715', '/avatars/default.png'),
('std_grandcamp_0004', 'Zoé', 'Euzet', 'Zoé E.', 'CM1', 'cls_grandcamp_cm1a', 'sch_abymes2_grandcamp', 'circ_abymes_2', true, 'ZOE-CM1A-4716', '/avatars/default.png'),
-- ── Baie-Mahault — École Calvaire CM2-A ──
('std_calvaire_0001', 'Mathis', 'Sainte-Rose', 'Mathis S.', 'CM2', 'cls_calvaire_cm2a', 'sch_baiemahault_calvaire', 'circ_baie_mahault', true, 'MATHIS-CM2A-4717', '/avatars/default.png'),
('std_calvaire_0002', 'Lola', 'Clavier', 'Lola C.', 'CM2', 'cls_calvaire_cm2a', 'sch_baiemahault_calvaire', 'circ_baie_mahault', true, 'LOLA-CM2A-4718', '/avatars/default.png'),
('std_calvaire_0003', 'Dylan', 'Pinto', 'Dylan P.', 'CM2', 'cls_calvaire_cm2a', 'sch_baiemahault_calvaire', 'circ_baie_mahault', true, 'DYLAN-CM2A-4719', '/avatars/default.png'),
('std_calvaire_0004', 'Clara', 'Gabali', 'Clara G.', 'CM2', 'cls_calvaire_cm2a', 'sch_baiemahault_calvaire', 'circ_baie_mahault', true, 'CLARA-CM2A-4720', '/avatars/default.png'),
-- ── Baie-Mahault — École Trioncelle CM1-A ──
('std_trioncelle_0001', 'Jordan', 'Dulac', 'Jordan D.', 'CM1', 'cls_trioncelle_cm1a', 'sch_baiemahault_trioncelle', 'circ_baie_mahault', true, 'JORDAN-CM1A-4721', '/avatars/default.png'),
('std_trioncelle_0002', 'Lisa', 'Bernier', 'Lisa B.', 'CM1', 'cls_trioncelle_cm1a', 'sch_baiemahault_trioncelle', 'circ_baie_mahault', true, 'LISA-CM1A-4722', '/avatars/default.png'),
('std_trioncelle_0003', 'Tyler', 'Ibo', 'Tyler I.', 'CM1', 'cls_trioncelle_cm1a', 'sch_baiemahault_trioncelle', 'circ_baie_mahault', true, 'TYLER-CM1A-4723', '/avatars/default.png'),
('std_trioncelle_0004', 'Marie', 'Narayanin', 'Marie N.', 'CM1', 'cls_trioncelle_cm1a', 'sch_baiemahault_trioncelle', 'circ_baie_mahault', true, 'MARIE-CM1A-4724', '/avatars/default.png'),
-- ── Basse-Terre — École Maisoncelle CM2-A ──
('std_maisoncelle_0001', 'Bryan', 'Udol', 'Bryan U.', 'CM2', 'cls_maisoncelle_cm2a', 'sch_basseterre_maisoncelle', 'circ_basse_terre', true, 'BRYAN-CM2A-4725', '/avatars/default.png'),
('std_maisoncelle_0002', 'Anaïs', 'Wachter', 'Anaïs W.', 'CM2', 'cls_maisoncelle_cm2a', 'sch_basseterre_maisoncelle', 'circ_basse_terre', true, 'ANAIS-CM2A-4726', '/avatars/default.png'),
('std_maisoncelle_0003', 'Léo', 'Zandrino', 'Léo Z.', 'CM2', 'cls_maisoncelle_cm2a', 'sch_basseterre_maisoncelle', 'circ_basse_terre', true, 'LEO-CM2A-4727', '/avatars/default.png'),
('std_maisoncelle_0004', 'Camille', 'Yango', 'Camille Y.', 'CM2', 'cls_maisoncelle_cm2a', 'sch_basseterre_maisoncelle', 'circ_basse_terre', true, 'CAMILLE-CM2A-4728', '/avatars/default.png'),
-- ── Basse-Terre — École Rivière des Pères CM1-A ──
('std_riviere_0001', 'Kévin', 'Quidal', 'Kévin Q.', 'CM1', 'cls_riviere_cm1a', 'sch_basseterre_riviere', 'circ_basse_terre', true, 'KEVIN-CM1A-4729', '/avatars/default.png'),
('std_riviere_0002', 'Maëlys', 'Gauthier', 'Maëlys G.', 'CM1', 'cls_riviere_cm1a', 'sch_basseterre_riviere', 'circ_basse_terre', true, 'MAELYS-CM1A-4730', '/avatars/default.png'),
('std_riviere_0003', 'Stéphane', 'Mango', 'Stéphane M.', 'CM1', 'cls_riviere_cm1a', 'sch_basseterre_riviere', 'circ_basse_terre', true, 'STEPHANE-CM1A-4731', '/avatars/default.png'),
('std_riviere_0004', 'Priscilla', 'Lastel', 'Priscilla L.', 'CM1', 'cls_riviere_cm1a', 'sch_basseterre_riviere', 'circ_basse_terre', true, 'PRISCILLA-CM1A-4732', '/avatars/default.png'),
-- ── Bouillante — École Pigeon CM2-A ──
('std_pigeon_0001', 'Dimitri', 'Chalus', 'Dimitri C.', 'CM2', 'cls_pigeon_cm2a', 'sch_bouillante_pigeon', 'circ_bouillante', true, 'DIMITRI-CM2A-4733', '/avatars/default.png'),
('std_pigeon_0002', 'Océane', 'Bambuck', 'Océane B.', 'CM2', 'cls_pigeon_cm2a', 'sch_bouillante_pigeon', 'circ_bouillante', true, 'OCEANE-CM2A-4734', '/avatars/default.png'),
('std_pigeon_0003', 'Cédric', 'Hilaire', 'Cédric H.', 'CM2', 'cls_pigeon_cm2a', 'sch_bouillante_pigeon', 'circ_bouillante', true, 'CEDRIC-CM2A-4735', '/avatars/default.png'),
('std_pigeon_0004', 'Mélissa', 'Fabre', 'Mélissa F.', 'CM2', 'cls_pigeon_cm2a', 'sch_bouillante_pigeon', 'circ_bouillante', true, 'MELISSA-CM2A-4736', '/avatars/default.png'),
-- ── Bouillante — École Thomas CM1-A ──
('std_thomas_0001', 'Loïc', 'Virapin', 'Loïc V.', 'CM1', 'cls_thomas_cm1a', 'sch_bouillante_thomas', 'circ_bouillante', true, 'LOIC-CM1A-4737', '/avatars/default.png'),
('std_thomas_0002', 'Vanessa', 'Ozier', 'Vanessa O.', 'CM1', 'cls_thomas_cm1a', 'sch_bouillante_thomas', 'circ_bouillante', true, 'VANESSA-CM1A-4738', '/avatars/default.png'),
('std_thomas_0003', 'Jean-Marc', 'Calixte', 'Jean-Marc C.', 'CM1', 'cls_thomas_cm1a', 'sch_bouillante_thomas', 'circ_bouillante', true, 'JEANMARC-CM1A-4739', '/avatars/default.png'),
('std_thomas_0004', 'Audrey', 'Dain', 'Audrey D.', 'CM1', 'cls_thomas_cm1a', 'sch_bouillante_thomas', 'circ_bouillante', true, 'AUDREY-CM1A-4740', '/avatars/default.png'),
-- ── Capesterre-Belle-Eau — École Bananier CM2-A ──
('std_bananier_0001', 'Fabrice', 'Nemausat', 'Fabrice N.', 'CM2', 'cls_bananier_cm2a', 'sch_capesterre_bananier', 'circ_capesterre', true, 'FABRICE-CM2A-4741', '/avatars/default.png'),
('std_bananier_0002', 'Malika', 'Confiant', 'Malika C.', 'CM2', 'cls_bananier_cm2a', 'sch_capesterre_bananier', 'circ_capesterre', true, 'MALIKA-CM2A-4742', '/avatars/default.png'),
('std_bananier_0003', 'Yannick', 'Targéba', 'Yannick T.', 'CM2', 'cls_bananier_cm2a', 'sch_capesterre_bananier', 'circ_capesterre', true, 'YANNICK-CM2A-4743', '/avatars/default.png'),
('std_bananier_0004', 'Stéphanie', 'Euzet', 'Stéphanie E.', 'CM2', 'cls_bananier_cm2a', 'sch_capesterre_bananier', 'circ_capesterre', true, 'STEPHANIE-CM2A-4744', '/avatars/default.png'),
-- ── Capesterre-Belle-Eau — École Routhiers CM1-A ──
('std_routhiers_0001', 'Thierry', 'Borromé', 'Thierry B.', 'CM1', 'cls_routhiers_cm1a', 'sch_capesterre_routhiers', 'circ_capesterre', true, 'THIERRY-CM1A-4745', '/avatars/default.png'),
('std_routhiers_0002', 'Julie', 'Ramcé', 'Julie R.', 'CM1', 'cls_routhiers_cm1a', 'sch_capesterre_routhiers', 'circ_capesterre', true, 'JULIE-CM1A-4746', '/avatars/default.png'),
('std_routhiers_0003', 'Samuel', 'Kancel', 'Samuel K.', 'CM1', 'cls_routhiers_cm1a', 'sch_capesterre_routhiers', 'circ_capesterre', true, 'SAMUEL-CM1A-4747', '/avatars/default.png'),
('std_routhiers_0004', 'Lucie', 'Gabali', 'Lucie G.', 'CM1', 'cls_routhiers_cm1a', 'sch_capesterre_routhiers', 'circ_capesterre', true, 'LUCIE-CM1A-4748', '/avatars/default.png'),
-- ── Gosier — École Mare-Gaillard CM2-A ──
('std_maregaillard_0001', 'Matthieu', 'Pinto', 'Matthieu P.', 'CM2', 'cls_maregaillard_cm2a', 'sch_gosier_maregaillard', 'circ_gosier', true, 'MATTHIEU-CM2A-4749', '/avatars/default.png'),
('std_maregaillard_0002', 'Léa', 'Bernier', 'Léa B.', 'CM2', 'cls_maregaillard_cm2a', 'sch_gosier_maregaillard', 'circ_gosier', true, 'LEA2-CM2A-4750', '/avatars/default.png'),
('std_maregaillard_0003', 'Gaël', 'Sainte-Rose', 'Gaël S.', 'CM2', 'cls_maregaillard_cm2a', 'sch_gosier_maregaillard', 'circ_gosier', true, 'GAEL2-CM2A-4751', '/avatars/default.png'),
('std_maregaillard_0004', 'Inès', 'Clavier', 'Inès C.', 'CM2', 'cls_maregaillard_cm2a', 'sch_gosier_maregaillard', 'circ_gosier', true, 'INES2-CM2A-4752', '/avatars/default.png'),
-- ── Gosier — École Montauban CM1-A ──
('std_montauban_0001', 'Nathan', 'Dulac', 'Nathan D.', 'CM1', 'cls_montauban_cm1a', 'sch_gosier_montauban', 'circ_gosier', true, 'NATHAN2-CM1A-4753', '/avatars/default.png'),
('std_montauban_0002', 'Chloé', 'Ibo', 'Chloé I.', 'CM1', 'cls_montauban_cm1a', 'sch_gosier_montauban', 'circ_gosier', true, 'CHLOE2-CM1A-4754', '/avatars/default.png'),
('std_montauban_0003', 'Hugo', 'Narayanin', 'Hugo N.', 'CM1', 'cls_montauban_cm1a', 'sch_gosier_montauban', 'circ_gosier', true, 'HUGO2-CM1A-4755', '/avatars/default.png'),
('std_montauban_0004', 'Sarah', 'Udol', 'Sarah U.', 'CM1', 'cls_montauban_cm1a', 'sch_gosier_montauban', 'circ_gosier', true, 'SARAH2-CM1A-4756', '/avatars/default.png'),
-- ── Morne-à-l'Eau — École Vieux-Bourg CM2-A ──
('std_vieuxbourg_0001', 'Axel', 'Wachter', 'Axel W.', 'CM2', 'cls_vieuxbourg_cm2a', 'sch_morneaeau_vieuxbourg', 'circ_morne_a_eau', true, 'AXEL2-CM2A-4757', '/avatars/default.png'),
('std_vieuxbourg_0002', 'Manon', 'Zandrino', 'Manon Z.', 'CM2', 'cls_vieuxbourg_cm2a', 'sch_morneaeau_vieuxbourg', 'circ_morne_a_eau', true, 'MANON2-CM2A-4758', '/avatars/default.png'),
('std_vieuxbourg_0003', 'Enzo', 'Yango', 'Enzo Y.', 'CM2', 'cls_vieuxbourg_cm2a', 'sch_morneaeau_vieuxbourg', 'circ_morne_a_eau', true, 'ENZO2-CM2A-4759', '/avatars/default.png'),
('std_vieuxbourg_0004', 'Jade', 'Quidal', 'Jade Q.', 'CM2', 'cls_vieuxbourg_cm2a', 'sch_morneaeau_vieuxbourg', 'circ_morne_a_eau', true, 'JADE2-CM2A-4760', '/avatars/default.png'),
-- ── Morne-à-l'Eau — École Perrin CM1-A ──
('std_perrin_0001', 'Lucas', 'Mango', 'Lucas M.', 'CM1', 'cls_perrin_cm1a', 'sch_morneaeau_perrin', 'circ_morne_a_eau', true, 'LUCAS2-CM1A-4761', '/avatars/default.png'),
('std_perrin_0002', 'Emma', 'Gauthier', 'Emma G.', 'CM1', 'cls_perrin_cm1a', 'sch_morneaeau_perrin', 'circ_morne_a_eau', true, 'EMMA2-CM1A-4762', '/avatars/default.png'),
('std_perrin_0003', 'Raphaël', 'Lastel', 'Raphaël L.', 'CM1', 'cls_perrin_cm1a', 'sch_morneaeau_perrin', 'circ_morne_a_eau', true, 'RAPHAEL2-CM1A-4763', '/avatars/default.png'),
('std_perrin_0004', 'Lola', 'Chalus', 'Lola C.', 'CM1', 'cls_perrin_cm1a', 'sch_morneaeau_perrin', 'circ_morne_a_eau', true, 'LOLA2-CM1A-4764', '/avatars/default.png'),
-- ── Pointe-à-Pitre — École Boisneuf CM2-A ──
('std_boisneuf_0001', 'Dylan', 'Bambuck', 'Dylan B.', 'CM2', 'cls_boisneuf_cm2a', 'sch_pointeapitre_boisneuf', 'circ_pointe_a_pitre', true, 'DYLAN2-CM2A-4765', '/avatars/default.png'),
('std_boisneuf_0002', 'Clara', 'Hilaire', 'Clara H.', 'CM2', 'cls_boisneuf_cm2a', 'sch_pointeapitre_boisneuf', 'circ_pointe_a_pitre', true, 'CLARA2-CM2A-4766', '/avatars/default.png'),
('std_boisneuf_0003', 'Jordan', 'Fabre', 'Jordan F.', 'CM2', 'cls_boisneuf_cm2a', 'sch_pointeapitre_boisneuf', 'circ_pointe_a_pitre', true, 'JORDAN2-CM2A-4767', '/avatars/default.png'),
('std_boisneuf_0004', 'Lisa', 'Virapin', 'Lisa V.', 'CM2', 'cls_boisneuf_cm2a', 'sch_pointeapitre_boisneuf', 'circ_pointe_a_pitre', true, 'LISA2-CM2A-4768', '/avatars/default.png'),
-- ── Pointe-à-Pitre — École Centre CM1-A ──
('std_centre_0001', 'Tyler', 'Ozier', 'Tyler O.', 'CM1', 'cls_centre_cm1a', 'sch_pointeapitre_centre', 'circ_pointe_a_pitre', true, 'TYLER2-CM1A-4769', '/avatars/default.png'),
('std_centre_0002', 'Marie', 'Calixte', 'Marie C.', 'CM1', 'cls_centre_cm1a', 'sch_pointeapitre_centre', 'circ_pointe_a_pitre', true, 'MARIE2-CM1A-4770', '/avatars/default.png'),
('std_centre_0003', 'Bryan', 'Dain', 'Bryan D.', 'CM1', 'cls_centre_cm1a', 'sch_pointeapitre_centre', 'circ_pointe_a_pitre', true, 'BRYAN2-CM1A-4771', '/avatars/default.png'),
('std_centre_0004', 'Anaïs', 'Gustave', 'Anaïs G.', 'CM1', 'cls_centre_cm1a', 'sch_pointeapitre_centre', 'circ_pointe_a_pitre', true, 'ANAIS2-CM1A-4772', '/avatars/default.png'),
-- ── Sainte-Anne — École Boisvin CM2-A ──
('std_boisvin_0001', 'Léo', 'Lagier', 'Léo L.', 'CM2', 'cls_boisvin_cm2a', 'sch_sainteanne_boisvin', 'circ_sainte_anne', true, 'LEO2-CM2A-4773', '/avatars/default.png'),
('std_boisvin_0002', 'Camille', 'Nemausat', 'Camille N.', 'CM2', 'cls_boisvin_cm2a', 'sch_sainteanne_boisvin', 'circ_sainte_anne', true, 'CAMILLE2-CM2A-4774', '/avatars/default.png'),
('std_boisvin_0003', 'Kévin', 'Confiant', 'Kévin C.', 'CM2', 'cls_boisvin_cm2a', 'sch_sainteanne_boisvin', 'circ_sainte_anne', true, 'KEVIN2-CM2A-4775', '/avatars/default.png'),
('std_boisvin_0004', 'Maëlys', 'Targéba', 'Maëlys T.', 'CM2', 'cls_boisvin_cm2a', 'sch_sainteanne_boisvin', 'circ_sainte_anne', true, 'MAELYS2-CM2A-4776', '/avatars/default.png'),
-- ── Sainte-Anne — École Châteaubrun CM1-A ──
('std_chateaubrun_0001', 'Stéphane', 'Euzet', 'Stéphane E.', 'CM1', 'cls_chateaubrun_cm1a', 'sch_sainteanne_chateaubrun', 'circ_sainte_anne', true, 'STEPHANE2-CM1A-4777', '/avatars/default.png'),
('std_chateaubrun_0002', 'Priscilla', 'Borromé', 'Priscilla B.', 'CM1', 'cls_chateaubrun_cm1a', 'sch_sainteanne_chateaubrun', 'circ_sainte_anne', true, 'PRISCILLA2-CM1A-4778', '/avatars/default.png'),
('std_chateaubrun_0003', 'Dimitri', 'Ramcé', 'Dimitri R.', 'CM1', 'cls_chateaubrun_cm1a', 'sch_sainteanne_chateaubrun', 'circ_sainte_anne', true, 'DIMITRI2-CM1A-4779', '/avatars/default.png'),
('std_chateaubrun_0004', 'Océane', 'Kancel', 'Océane K.', 'CM1', 'cls_chateaubrun_cm1a', 'sch_sainteanne_chateaubrun', 'circ_sainte_anne', true, 'OCEANE2-CM1A-4780', '/avatars/default.png'),
-- ── Sainte-Rose — École Nogent CM2-A ──
('std_nogent_0001', 'Cédric', 'Gabali', 'Cédric G.', 'CM2', 'cls_nogent_cm2a', 'sch_sainerose_nogent', 'circ_sainte_rose', true, 'CEDRIC2-CM2A-4781', '/avatars/default.png'),
('std_nogent_0002', 'Mélissa', 'Pinto', 'Mélissa P.', 'CM2', 'cls_nogent_cm2a', 'sch_sainerose_nogent', 'circ_sainte_rose', true, 'MELISSA2-CM2A-4782', '/avatars/default.png'),
('std_nogent_0003', 'Loïc', 'Bernier', 'Loïc B.', 'CM2', 'cls_nogent_cm2a', 'sch_sainerose_nogent', 'circ_sainte_rose', true, 'LOIC2-CM2A-4783', '/avatars/default.png'),
('std_nogent_0004', 'Vanessa', 'Ibo', 'Vanessa I.', 'CM2', 'cls_nogent_cm2a', 'sch_sainerose_nogent', 'circ_sainte_rose', true, 'VANESSA2-CM2A-4784', '/avatars/default.png'),
-- ── Sainte-Rose — École Sofaïa CM1-A ──
('std_sofaia_0001', 'Jean-Marc', 'Narayanin', 'Jean-Marc N.', 'CM1', 'cls_sofaia_cm1a', 'sch_sainerose_sofaia', 'circ_sainte_rose', true, 'JEANMARC2-CM1A-4785', '/avatars/default.png'),
('std_sofaia_0002', 'Audrey', 'Udol', 'Audrey U.', 'CM1', 'cls_sofaia_cm1a', 'sch_sainerose_sofaia', 'circ_sainte_rose', true, 'AUDREY2-CM1A-4786', '/avatars/default.png'),
('std_sofaia_0003', 'Fabrice', 'Wachter', 'Fabrice W.', 'CM1', 'cls_sofaia_cm1a', 'sch_sainerose_sofaia', 'circ_sainte_rose', true, 'FABRICE2-CM1A-4787', '/avatars/default.png'),
('std_sofaia_0004', 'Malika', 'Zandrino', 'Malika Z.', 'CM1', 'cls_sofaia_cm1a', 'sch_sainerose_sofaia', 'circ_sainte_rose', true, 'MALIKA2-CM1A-4788', '/avatars/default.png')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════
-- VÉRIFICATION
-- ══════════════════════════════════════════
SELECT 
  'Données démo Guadeloupe insérées' AS status,
  (SELECT COUNT(*) FROM schools WHERE circonscription_id LIKE 'circ_%') AS ecoles,
  (SELECT COUNT(*) FROM classes WHERE school_id LIKE 'sch_%') AS classes,
  (SELECT COUNT(*) FROM students WHERE circonscription_id LIKE 'circ_%') AS eleves;
