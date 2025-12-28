-- ==========================================
-- DONNÉES DE DÉMO - TOURNOI CRAZY CHRONO 2025
-- Peuplement pour la démo Rectorat
-- ==========================================

-- Suppression des données existantes (pour reset)
DELETE FROM tournament_notifications;
DELETE FROM match_results;
DELETE FROM tournament_brackets;
DELETE FROM tournament_matches;
DELETE FROM tournament_groups;
DELETE FROM student_stats;
DELETE FROM students;
DELETE FROM classes;
DELETE FROM schools;
DELETE FROM tournament_phases;
DELETE FROM tournaments;

-- ============= TOURNOI PRINCIPAL =============
INSERT INTO tournaments (id, name, academy_code, status, current_phase, config, start_date, end_date, created_by) VALUES
('tour_2025_gp', 'Tournoi Crazy Chrono 2025 - Guadeloupe', 'GP', 'active', 1, 
 '{"levels":["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"],"groupSize":4,"roundsPerMatch":3,"durationPerRound":60}',
 '2025-01-15 08:00:00', '2025-03-30 18:00:00', 'isabelle.de-chavigny@ac-guadeloupe.fr');

-- ============= PHASES DU TOURNOI =============
INSERT INTO tournament_phases (id, tournament_id, level, name, status, start_date, end_date) VALUES
('phase_1_classe', 'tour_2025_gp', 1, 'CRAZY WINNER CLASSE', 'active', '2025-01-15 08:00:00', '2025-01-31 18:00:00'),
('phase_2_ecole', 'tour_2025_gp', 2, 'CRAZY WINNER ÉCOLE', 'pending', '2025-02-01 08:00:00', '2025-02-14 18:00:00'),
('phase_3_circ', 'tour_2025_gp', 3, 'CRAZY WINNER CIRCONSCRIPTION', 'pending', '2025-02-15 08:00:00', '2025-02-28 18:00:00'),
('phase_4_acad', 'tour_2025_gp', 4, 'CRAZY WINNER ACADÉMIQUE', 'pending', '2025-03-15 09:00:00', '2025-03-15 17:00:00');

-- ============= ÉCOLES =============
INSERT INTO schools (id, name, type, city, circonscription_id, postal_code) VALUES
('ecole_lamentin', 'École Primaire Le Lamentin Centre', 'primaire', 'Le Lamentin', 'circ_pointe_a_pitre', '97129'),
('ecole_abymes', 'École Primaire Les Abymes Victor Hugo', 'primaire', 'Les Abymes', 'circ_pointe_a_pitre', '97139'),
('college_baimbridge', 'Collège Baimbridge', 'college', 'Les Abymes', 'circ_pointe_a_pitre', '97139'),
('ecole_gosier', 'École Primaire Le Gosier Paul Valentino', 'primaire', 'Le Gosier', 'circ_pointe_a_pitre', '97190'),
('ecole_baie_mahault', 'École Primaire Baie-Mahault', 'primaire', 'Baie-Mahault', 'circ_basse_terre', '97122');

-- ============= CLASSES =============
-- École Le Lamentin (primaire)
INSERT INTO classes (id, school_id, name, level, teacher_name, teacher_email, student_count) VALUES
('cp_a_lamentin', 'ecole_lamentin', 'CP-A', 'CP', 'Mme Sylvie Martin', 'sylvie.martin@ac-guadeloupe.fr', 24),
('ce1_a_lamentin', 'ecole_lamentin', 'CE1-A', 'CE1', 'M. Paul Dupont', 'paul.dupont@ac-guadeloupe.fr', 28),
('ce2_a_lamentin', 'ecole_lamentin', 'CE2-A', 'CE2', 'Mme Claire Leblanc', 'claire.leblanc@ac-guadeloupe.fr', 26),
('cm1_a_lamentin', 'ecole_lamentin', 'CM1-A', 'CM1', 'M. Jean-Marc Rousseau', 'jm.rousseau@ac-guadeloupe.fr', 25),
('cm2_a_lamentin', 'ecole_lamentin', 'CM2-A', 'CM2', 'Mme Isabelle Petit', 'isabelle.petit@ac-guadeloupe.fr', 27);

-- École Les Abymes (primaire)
INSERT INTO classes (id, school_id, name, level, teacher_name, teacher_email, student_count) VALUES
('ce1_a_abymes', 'ecole_abymes', 'CE1-A', 'CE1', 'Mme Marie Toussaint', 'marie.toussaint@ac-guadeloupe.fr', 30),
('ce1_b_abymes', 'ecole_abymes', 'CE1-B', 'CE1', 'M. André Lucien', 'andre.lucien@ac-guadeloupe.fr', 29),
('cm2_a_abymes', 'ecole_abymes', 'CM2-A', 'CM2', 'Mme Sophie Bernard', 'sophie.bernard@ac-guadeloupe.fr', 28);

-- Collège Baimbridge (collège)
INSERT INTO classes (id, school_id, name, level, teacher_name, teacher_email, student_count) VALUES
('6e_a_baimbridge', 'college_baimbridge', '6ème A', '6e', 'M. Laurent Moreau', 'laurent.moreau@ac-guadeloupe.fr', 32);

-- ============= ÉLÈVES (Échantillon CE1-A Le Lamentin) =============
-- Groupe 1
INSERT INTO students (id, first_name, last_name, full_name, level, class_id, school_id, circonscription_id, licensed) VALUES
('s001', 'Alice', 'Bertrand', 'Alice B.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true),
('s002', 'Bob', 'Charles', 'Bob C.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true),
('s003', 'Chloé', 'Dubois', 'Chloé D.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true),
('s004', 'David', 'Emile', 'David E.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true);

-- Groupe 2
INSERT INTO students (id, first_name, last_name, full_name, level, class_id, school_id, circonscription_id, licensed) VALUES
('s005', 'Emma', 'Flores', 'Emma F.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true),
('s006', 'Félix', 'Gérard', 'Félix G.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true),
('s007', 'Gabrielle', 'Henri', 'Gabrielle H.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true),
('s008', 'Hugo', 'Isabelle', 'Hugo I.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true);

-- Groupe 3
INSERT INTO students (id, first_name, last_name, full_name, level, class_id, school_id, circonscription_id, licensed) VALUES
('s009', 'Inès', 'Jules', 'Inès J.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true),
('s010', 'Jules', 'Kevin', 'Jules K.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true),
('s011', 'Léa', 'Laurent', 'Léa L.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true),
('s012', 'Maxime', 'Marie', 'Maxime M.', 'CE1', 'ce1_a_lamentin', 'ecole_lamentin', 'circ_pointe_a_pitre', true);

-- Élèves additionnels (autres écoles) pour phases suivantes
INSERT INTO students (id, first_name, last_name, full_name, level, class_id, school_id, circonscription_id, licensed) VALUES
('s013', 'Nina', 'Olivier', 'Nina O.', 'CE1', 'ce1_a_abymes', 'ecole_abymes', 'circ_pointe_a_pitre', true),
('s014', 'Oscar', 'Pierre', 'Oscar P.', 'CE1', 'ce1_b_abymes', 'ecole_abymes', 'circ_pointe_a_pitre', true);

-- ============= STATS ÉLÈVES (Initialisé à zéro) =============
INSERT INTO student_stats (student_id, tournaments_played, total_wins, total_matches, best_score, badges) VALUES
('s001', 0, 0, 0, 0, '[]'),
('s002', 0, 0, 0, 0, '[]'),
('s003', 0, 0, 0, 0, '[]'),
('s004', 0, 0, 0, 0, '[]'),
('s005', 0, 0, 0, 0, '[]'),
('s006', 0, 0, 0, 0, '[]'),
('s007', 0, 0, 0, 0, '[]'),
('s008', 0, 0, 0, 0, '[]'),
('s009', 0, 0, 0, 0, '[]'),
('s010', 0, 0, 0, 0, '[]'),
('s011', 0, 0, 0, 0, '[]'),
('s012', 0, 0, 0, 0, '[]'),
('s013', 0, 0, 0, 0, '[]'),
('s014', 0, 0, 0, 0, '[]');

-- ============= GROUPES DE 4 (Phase 1 - Classe CE1-A Lamentin) =============
INSERT INTO tournament_groups (id, tournament_id, phase_level, class_id, name, student_ids, status) VALUES
('group_ce1a_g1', 'tour_2025_gp', 1, 'ce1_a_lamentin', 'Groupe 1', '["s001","s002","s003","s004"]', 'pending'),
('group_ce1a_g2', 'tour_2025_gp', 1, 'ce1_a_lamentin', 'Groupe 2', '["s005","s006","s007","s008"]', 'pending'),
('group_ce1a_g3', 'tour_2025_gp', 1, 'ce1_a_lamentin', 'Groupe 3', '["s009","s010","s011","s012"]', 'pending');

-- ============= MATCHS (Exemples en attente) =============
INSERT INTO tournament_matches (id, tournament_id, phase_id, group_id, status, room_code, config) VALUES
('match_ce1a_g1', 'tour_2025_gp', 'phase_1_classe', 'group_ce1a_g1', 'pending', 'GAME01',
 '{"rounds":3,"duration":60,"classes":["CE1"],"themes":[]}'),
('match_ce1a_g2', 'tour_2025_gp', 'phase_1_classe', 'group_ce1a_g2', 'pending', 'GAME02',
 '{"rounds":3,"duration":60,"classes":["CE1"],"themes":[]}'),
('match_ce1a_g3', 'tour_2025_gp', 'phase_1_classe', 'group_ce1a_g3', 'pending', 'GAME03',
 '{"rounds":3,"duration":60,"classes":["CE1"],"themes":[]}');

-- Note: Les résultats seront ajoutés après les matchs

COMMIT;

-- Message de confirmation
SELECT 'Données de démo Tournoi Crazy Chrono 2025 créées avec succès !' as message;
SELECT COUNT(*) as nombre_eleves FROM students;
SELECT COUNT(*) as nombre_groupes FROM tournament_groups;
SELECT COUNT(*) as nombre_matchs FROM tournament_matches;
