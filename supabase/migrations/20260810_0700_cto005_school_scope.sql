-- ==========================================================================
-- CTO-005A — 0700 — P1-1 : classes / schools / tables tournoi
--
-- Avant : `*_select_authenticated ... USING (true)` — n'importe quel compte
-- gratuit lisait l'annuaire complet des classes (avec `teacher_email`), des
-- écoles et toutes les données de compétition (`student_ids`, scores).
--
-- Après : périmètre strict, dérivé du serveur uniquement
--   élève      → sa classe / son école / ses groupes et matchs ;
--   enseignant → ses classes (titulaire prouvé) ;
--   cpc/cpd    → sa circonscription ;
--   rectorat   → périmètre institutionnel prouvable ; en l'absence de relation
--                région → circonscription dans le schéma, ce rôle échoue FERMÉ
--                (cf. docs/CTO_005A_RLS_MATRIX.md § « Relations manquantes ») ;
--   admin      → lecture complète (besoin d'administration).
--
-- Le chemin nominal du produit reste l'API Express (CTO-003), qui utilise le
-- service role et applique déjà ces mêmes règles.
-- ==========================================================================

-- ── Préparation de la relation robuste enseignant → classe ------------------
-- Étape 1 uniquement : colonne nullable + index. Aucun backfill ici.
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS teacher_user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_user_id ON public.classes (teacher_user_id);

COMMENT ON COLUMN public.classes.teacher_user_id IS
  'CTO-005A étape 1 (nullable). Remplacera teacher_email comme preuve de titularité. Backfill administratif à réaliser dans une mission dédiée, puis NOT NULL.';

-- ── schools ----------------------------------------------------------------
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schools_select_authenticated" ON public.schools;
DROP POLICY IF EXISTS schools_select_scope           ON public.schools;

CREATE POLICY schools_select_scope ON public.schools
  FOR SELECT TO authenticated
  USING (
    public.cc_is_admin()
    OR id::text IN (SELECT public.cc_visible_school_ids())
  );

REVOKE ALL ON public.schools FROM anon;
REVOKE ALL ON public.schools FROM authenticated;
GRANT SELECT ON public.schools TO authenticated;

-- ── classes ----------------------------------------------------------------
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "classes_select_authenticated" ON public.classes;
DROP POLICY IF EXISTS classes_select_scope           ON public.classes;

CREATE POLICY classes_select_scope ON public.classes
  FOR SELECT TO authenticated
  USING (
    public.cc_is_admin()
    OR id::text IN (SELECT public.cc_visible_class_ids())
  );

REVOKE ALL ON public.classes FROM anon;
REVOKE ALL ON public.classes FROM authenticated;
GRANT SELECT ON public.classes TO authenticated;

-- ── students : la policy « teacher » du dépôt lit auth.users, ce que le rôle
--    authenticated n'a pas le droit de faire → elle ne renvoyait rien
--    (fermeture accidentelle). On la réécrit via cc_my_class_ids().
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "students_select_teacher" ON public.students;
DROP POLICY IF EXISTS students_select_teacher   ON public.students;

-- `students_select_own` du dépôt lit user_student_mapping DANS la policy : cette
-- sous-requête est soumise à la RLS de user_student_mapping (activée, sans
-- policy) et ne renvoie donc jamais rien. On repasse par cc_my_student_ids().
DROP POLICY IF EXISTS "students_select_own" ON public.students;
CREATE POLICY students_select_own ON public.students
  FOR SELECT TO authenticated
  USING (id::text IN (SELECT public.cc_my_student_ids()));

DROP POLICY IF EXISTS "student_stats_select_own" ON public.student_stats;
CREATE POLICY student_stats_select_own ON public.student_stats
  FOR SELECT TO authenticated
  USING (student_id::text IN (SELECT public.cc_my_student_ids()));

CREATE POLICY students_select_teacher ON public.students
  FOR SELECT TO authenticated
  USING (class_id IS NOT NULL AND class_id::text IN (SELECT public.cc_managed_class_ids()));

REVOKE ALL ON public.students FROM anon;
REVOKE ALL ON public.students FROM authenticated;
GRANT SELECT ON public.students TO authenticated;

-- ── student_stats : même correction du chemin enseignant --------------------
DROP POLICY IF EXISTS "student_stats_select_teacher" ON public.student_stats;
CREATE POLICY student_stats_select_teacher ON public.student_stats
  FOR SELECT TO authenticated
  USING (
    student_id::text IN (
      SELECT s.id::text FROM public.students s
      WHERE s.class_id::text IN (SELECT public.cc_managed_class_ids())
    )
  );
GRANT SELECT ON public.student_stats TO authenticated;

-- ── tables de compétition ---------------------------------------------------
-- Aucun écran ne les lit directement avec la clé anon (tout passe par
-- /api/tournament, CTO-003). On ferme l'accès direct : le service role
-- contourne la RLS, l'API reste inchangée.
DO $$
DECLARE
  t TEXT;
  p TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tournaments', 'tournament_phases', 'tournament_groups',
    'tournament_matches', 'match_results', 'tournament_brackets'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR p IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t AND policyname LIKE '%_select_authenticated'
      LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', p, t);
      END LOOP;
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
