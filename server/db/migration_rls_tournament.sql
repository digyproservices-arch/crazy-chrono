-- ==========================================
-- MIGRATION SÉCURITÉ: Activer RLS sur toutes les tables tournoi
-- Corrige l'alerte Supabase du 5 mai 2026
-- Date: 2026-05-10
-- ==========================================
-- IMPORTANT: À exécuter dans Supabase SQL Editor
-- Le backend utilise service_role (bypass RLS automatique)
-- Ces policies protègent contre l'accès direct via anon key

-- ==========================================
-- 1) ACTIVER RLS sur toutes les tables sans protection
-- ==========================================

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_notifications ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2) POLICIES: Lecture publique limitée (données non sensibles)
-- ==========================================

-- Tournois: lecture publique (nom, status — pas de données perso)
DROP POLICY IF EXISTS "tournaments_select_authenticated" ON tournaments;
CREATE POLICY "tournaments_select_authenticated" ON tournaments
  FOR SELECT TO authenticated
  USING (true);

-- Phases: lecture pour les authentifiés
DROP POLICY IF EXISTS "phases_select_authenticated" ON tournament_phases;
CREATE POLICY "phases_select_authenticated" ON tournament_phases
  FOR SELECT TO authenticated
  USING (true);

-- ==========================================
-- 3) POLICIES: Données sensibles — accès restreint
-- ==========================================

-- Écoles: lecture pour les authentifiés (pas de données élèves)
DROP POLICY IF EXISTS "schools_select_authenticated" ON schools;
CREATE POLICY "schools_select_authenticated" ON schools
  FOR SELECT TO authenticated
  USING (true);

-- Classes: lecture pour les authentifiés
DROP POLICY IF EXISTS "classes_select_authenticated" ON classes;
CREATE POLICY "classes_select_authenticated" ON classes
  FOR SELECT TO authenticated
  USING (true);

-- ⚠️ STUDENTS: Données personnelles d'élèves mineurs — accès très restreint
-- Seul un utilisateur lié à cet élève peut voir ses données
DROP POLICY IF EXISTS "students_select_own" ON students;
CREATE POLICY "students_select_own" ON students
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT student_id FROM user_student_mapping 
      WHERE user_id = auth.uid() AND active = true
    )
  );

-- Les enseignants peuvent voir les élèves de leurs classes
DROP POLICY IF EXISTS "students_select_teacher" ON students;
CREATE POLICY "students_select_teacher" ON students
  FOR SELECT TO authenticated
  USING (
    class_id IN (
      SELECT c.id FROM classes c
      WHERE c.teacher_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Student stats: même restriction que students
DROP POLICY IF EXISTS "student_stats_select_own" ON student_stats;
CREATE POLICY "student_stats_select_own" ON student_stats
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT student_id FROM user_student_mapping 
      WHERE user_id = auth.uid() AND active = true
    )
  );

DROP POLICY IF EXISTS "student_stats_select_teacher" ON student_stats;
CREATE POLICY "student_stats_select_teacher" ON student_stats
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT s.id FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- ==========================================
-- 4) POLICIES: Données de compétition — lecture authentifiée
-- ==========================================

-- Tournament groups: lecture pour les authentifiés
DROP POLICY IF EXISTS "groups_select_authenticated" ON tournament_groups;
CREATE POLICY "groups_select_authenticated" ON tournament_groups
  FOR SELECT TO authenticated
  USING (true);

-- Tournament matches: lecture pour les authentifiés
DROP POLICY IF EXISTS "matches_select_authenticated" ON tournament_matches;
CREATE POLICY "matches_select_authenticated" ON tournament_matches
  FOR SELECT TO authenticated
  USING (true);

-- Match results: lecture pour les authentifiés
DROP POLICY IF EXISTS "results_select_authenticated" ON match_results;
CREATE POLICY "results_select_authenticated" ON match_results
  FOR SELECT TO authenticated
  USING (true);

-- Brackets: lecture pour les authentifiés
DROP POLICY IF EXISTS "brackets_select_authenticated" ON tournament_brackets;
CREATE POLICY "brackets_select_authenticated" ON tournament_brackets
  FOR SELECT TO authenticated
  USING (true);

-- ==========================================
-- 5) POLICIES: Notifications — lecture par le destinataire uniquement
-- ==========================================

DROP POLICY IF EXISTS "notifications_select_own" ON tournament_notifications;
CREATE POLICY "notifications_select_own" ON tournament_notifications
  FOR SELECT TO authenticated
  USING (
    recipient_id IN (
      SELECT student_id FROM user_student_mapping 
      WHERE user_id = auth.uid() AND active = true
    )
    OR recipient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- ==========================================
-- 6) POLICIES: Écriture — service_role uniquement (backend)
-- Aucune policy INSERT/UPDATE/DELETE pour 'authenticated' = seul le backend peut écrire
-- Le service_role bypass automatiquement le RLS
-- ==========================================

-- ==========================================
-- 7) BLOQUER l'accès anon (clé publique) à TOUTES ces tables
-- Par défaut avec RLS activé et aucune policy pour 'anon', l'accès est bloqué
-- Vérification explicite: aucune policy ne doit mentionner 'anon'
-- ==========================================

-- ==========================================
-- VÉRIFICATION: Lister les tables SANS RLS (devrait retourner 0 lignes)
-- ==========================================
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
