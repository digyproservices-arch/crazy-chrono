-- ==========================================
-- SCHEMA TOURNOI CRAZY CHRONO
-- Création des tables pour le système de tournoi pyramidal
-- ==========================================

-- Table principale des tournois
CREATE TABLE IF NOT EXISTS tournaments (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  academy_code VARCHAR(10) NOT NULL, -- GP pour Guadeloupe
  status VARCHAR(20) DEFAULT 'draft', -- draft | active | finished
  current_phase INT DEFAULT 1, -- 1-4
  config JSON, -- { levels, groupSize, roundsPerMatch, durationPerRound }
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  created_by VARCHAR(100) -- email organisateur
);

-- Phases du tournoi (4 niveaux: Classe, École, Circonscription, Académique)
CREATE TABLE IF NOT EXISTS tournament_phases (
  id VARCHAR(50) PRIMARY KEY,
  tournament_id VARCHAR(50) NOT NULL,
  level INT NOT NULL, -- 1=Classe, 2=École, 3=Circonscription, 4=Académique
  name VARCHAR(100) NOT NULL, -- ex: "CRAZY WINNER CLASSE"
  status VARCHAR(20) DEFAULT 'pending', -- pending | active | finished
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  config JSON, -- Configuration spécifique phase
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- Écoles et établissements
CREATE TABLE IF NOT EXISTS schools (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL, -- primaire | college
  city VARCHAR(100),
  circonscription_id VARCHAR(50),
  postal_code VARCHAR(10),
  email VARCHAR(100),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
  id VARCHAR(50) PRIMARY KEY,
  school_id VARCHAR(50) NOT NULL,
  name VARCHAR(50) NOT NULL, -- ex: "CE1-A"
  level VARCHAR(10) NOT NULL, -- CP, CE1, CE2, CM1, CM2, 6e, 5e, 4e, 3e
  teacher_name VARCHAR(100),
  teacher_email VARCHAR(100),
  student_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

-- Élèves
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(50) PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(200), -- Prénom + Initiale (ex: "Alice B.")
  level VARCHAR(10) NOT NULL, -- CP, CE1, etc.
  class_id VARCHAR(50),
  school_id VARCHAR(50),
  circonscription_id VARCHAR(50),
  email VARCHAR(100), -- Optionnel
  avatar_url VARCHAR(255) DEFAULT '/avatars/default.png',
  licensed BOOLEAN DEFAULT true, -- Licence active
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
);

-- Stats élèves (performances globales)
CREATE TABLE IF NOT EXISTS student_stats (
  student_id VARCHAR(50) PRIMARY KEY,
  tournaments_played INT DEFAULT 0,
  total_wins INT DEFAULT 0,
  total_matches INT DEFAULT 0,
  best_score INT DEFAULT 0,
  total_score INT DEFAULT 0,
  avg_time_ms INT DEFAULT 0,
  badges JSON, -- Liste des badges gagnés
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Groupes de 4 élèves (Battle Royale)
CREATE TABLE IF NOT EXISTS tournament_groups (
  id VARCHAR(50) PRIMARY KEY,
  tournament_id VARCHAR(50) NOT NULL,
  phase_level INT NOT NULL, -- 1-4
  class_id VARCHAR(50),
  name VARCHAR(100), -- ex: "Groupe 1"
  student_ids JSON NOT NULL, -- Array de 4 student IDs
  match_id VARCHAR(50), -- Match associé
  status VARCHAR(20) DEFAULT 'pending', -- pending | playing | finished
  winner_id VARCHAR(50), -- ID de l'élève gagnant
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

-- Matchs (affrontements Battle Royale)
CREATE TABLE IF NOT EXISTS tournament_matches (
  id VARCHAR(50) PRIMARY KEY,
  tournament_id VARCHAR(50) NOT NULL,
  phase_id VARCHAR(50) NOT NULL,
  group_id VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending', -- pending | in_progress | finished | cancelled
  room_code VARCHAR(10), -- Code de salle unique
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  config JSON, -- { rounds, duration, classes, themes }
  players JSON, -- Array des 4 joueurs avec scores
  winner JSON, -- { studentId, name, score, timeMs }
  replay_url VARCHAR(255), -- URL enregistrement (optionnel)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_id) REFERENCES tournament_phases(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES tournament_groups(id) ON DELETE SET NULL
);

-- Résultats détaillés par joueur dans un match
CREATE TABLE IF NOT EXISTS match_results (
  id VARCHAR(50) PRIMARY KEY,
  match_id VARCHAR(50) NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  position INT NOT NULL, -- 1er, 2ème, 3ème, 4ème
  score INT NOT NULL,
  time_ms INT NOT NULL, -- Temps total en millisecondes
  pairs_validated INT DEFAULT 0,
  errors INT DEFAULT 0,
  details JSON, -- Détails des réponses
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES tournament_matches(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Brackets (arbres du tournoi par niveau)
CREATE TABLE IF NOT EXISTS tournament_brackets (
  id VARCHAR(50) PRIMARY KEY,
  tournament_id VARCHAR(50) NOT NULL,
  phase_level INT NOT NULL, -- 2=École, 3=Circonscription, 4=Académique (pas de bracket pour Phase 1)
  student_level VARCHAR(10) NOT NULL, -- CP, CE1, etc.
  rounds JSON, -- Structure de l'arbre par rounds
  winner_id VARCHAR(50), -- ID du champion
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- Notifications envoyées
CREATE TABLE IF NOT EXISTS tournament_notifications (
  id VARCHAR(50) PRIMARY KEY,
  tournament_id VARCHAR(50) NOT NULL,
  recipient_type VARCHAR(20) NOT NULL, -- student | teacher | organizer
  recipient_id VARCHAR(50) NOT NULL,
  recipient_email VARCHAR(100),
  type VARCHAR(50) NOT NULL, -- qualification | reminder | certificate | summary
  subject VARCHAR(255),
  body TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'sent', -- sent | failed | pending
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- Index pour optimisation
CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_academy ON tournaments(academy_code);
CREATE INDEX idx_phases_tournament ON tournament_phases(tournament_id);
CREATE INDEX idx_phases_status ON tournament_phases(status);
CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_level ON students(level);
CREATE INDEX idx_students_licensed ON students(licensed);
CREATE INDEX idx_matches_phase ON tournament_matches(phase_id);
CREATE INDEX idx_matches_status ON tournament_matches(status);
CREATE INDEX idx_match_results_student ON match_results(student_id);
CREATE INDEX idx_groups_tournament ON tournament_groups(tournament_id);

-- Vue pour faciliter les requêtes de leaderboard
CREATE VIEW IF NOT EXISTS leaderboard AS
SELECT 
  s.id,
  s.full_name,
  s.level,
  s.school_id,
  sc.name as school_name,
  ss.total_wins,
  ss.total_matches,
  ss.best_score,
  ss.badges,
  CASE WHEN ss.total_matches > 0 THEN (ss.total_wins * 100 / ss.total_matches) ELSE 0 END as win_rate
FROM students s
LEFT JOIN student_stats ss ON s.id = ss.student_id
LEFT JOIN schools sc ON s.school_id = sc.id
WHERE s.licensed = true
ORDER BY ss.total_wins DESC, ss.best_score DESC;

-- Commentaires
COMMENT ON TABLE tournaments IS 'Tournois académiques (1 par an généralement)';
COMMENT ON TABLE tournament_phases IS 'Les 4 phases pyramidales du tournoi';
COMMENT ON TABLE tournament_matches IS 'Matchs Battle Royale entre 4 élèves';
COMMENT ON TABLE tournament_groups IS 'Groupes de 4 élèves formés pour un match';
COMMENT ON TABLE students IS 'Élèves participants avec licences';
COMMENT ON TABLE student_stats IS 'Statistiques cumulées par élève';
COMMENT ON TABLE tournament_brackets IS 'Arbres des tournois par niveau (École, Circonscription, Académique)';
