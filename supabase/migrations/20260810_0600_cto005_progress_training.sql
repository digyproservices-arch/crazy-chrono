-- ==========================================================================
-- CTO-005A — 0600 — P0-4 : sessions / attempts / training_* (données de mineurs)
--
-- Avant : `allow_all_sessions`, `allow_all_attempts`,
-- `service_role_full_access_*` — toutes `USING (true) WITH CHECK (true)` et
-- **sans clause TO**, donc applicables à `public` (anon inclus).
-- `GET /rest/v1/attempts?select=*` avec la clé anon publique renvoyait les
-- performances de tous les joueurs.
--
-- Après :
--   sessions / attempts   → lecture de ses propres lignes uniquement
--                            (src/components/Debug/ProgressDebug.js en a besoin) ;
--                            aucune écriture client (le backend écrit en service role).
--   training_*            → aucun accès client (le frontend n'y touche pas :
--                            tout passe par /api/training et /api/progress).
--
-- Contradiction tranchée : server/db/schema_training.sql (permissif) est
-- **supersédé** ; les policies restrictives de
-- server/migrations/create_training_tables.sql sont remplacées par celles-ci.
-- ==========================================================================

-- ── sessions ---------------------------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_sessions" ON public.sessions;
DROP POLICY IF EXISTS sessions_select_own  ON public.sessions;

CREATE POLICY sessions_select_own ON public.sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

REVOKE ALL ON public.sessions FROM anon;
REVOKE ALL ON public.sessions FROM authenticated;
GRANT SELECT ON public.sessions TO authenticated;

-- ── attempts ---------------------------------------------------------------
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_attempts" ON public.attempts;
DROP POLICY IF EXISTS attempts_select_own  ON public.attempts;

CREATE POLICY attempts_select_own ON public.attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

REVOKE ALL ON public.attempts FROM anon;
REVOKE ALL ON public.attempts FROM authenticated;
GRANT SELECT ON public.attempts TO authenticated;

-- ── training_sessions ------------------------------------------------------
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access_sessions"    ON public.training_sessions;
DROP POLICY IF EXISTS "Teachers can view their class sessions" ON public.training_sessions;
REVOKE ALL ON public.training_sessions FROM anon;
REVOKE ALL ON public.training_sessions FROM authenticated;

-- ── training_results -------------------------------------------------------
ALTER TABLE public.training_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access_results"   ON public.training_results;
DROP POLICY IF EXISTS "Students can view their own results" ON public.training_results;
REVOKE ALL ON public.training_results FROM anon;
REVOKE ALL ON public.training_results FROM authenticated;

-- ── student_training_stats -------------------------------------------------
ALTER TABLE public.student_training_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access_stats"    ON public.student_training_stats;
DROP POLICY IF EXISTS "Students can view their own stats" ON public.student_training_stats;
REVOKE ALL ON public.student_training_stats FROM anon;
REVOKE ALL ON public.student_training_stats FROM authenticated;

-- ── student_stats (performances agrégées par élève) -------------------------
DO $$
BEGIN
  IF to_regclass('public.student_stats') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.student_stats ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.student_stats FROM anon';
    EXECUTE 'REVOKE ALL ON public.student_stats FROM authenticated';
  END IF;
END $$;
