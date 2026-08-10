-- ==========================================================================
-- CTO-005A — 0100 — Fonctions d'aide pour les policies RLS
--
-- Toutes les fonctions sont SECURITY DEFINER (elles doivent lire user_profiles
-- et auth.users sans être elles-mêmes soumises à la RLS, sinon les policies
-- deviennent récursives) avec un search_path figé, et ne prennent AUCUN
-- paramètre d'identité : elles dérivent tout de auth.uid().
--
-- Idempotent. Aucune donnée modifiée.
-- ==========================================================================

-- ── user_profiles doit exister avant les helpers (aucune définition versionnée
--    n'existait dans le dépôt avant CTO-005A : cf. CTO-004 §3.5).
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  first_name TEXT,
  last_name TEXT,
  pseudo TEXT,
  language TEXT DEFAULT 'fr',
  avatar_url TEXT,
  strict_elements_mode BOOLEAN DEFAULT false,
  region VARCHAR(50),
  circonscription_id VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS region VARCHAR(50);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS circonscription_id VARCHAR(50);

-- ── Rôle applicatif de l'appelant -----------------------------------------
CREATE OR REPLACE FUNCTION public.cc_current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.role FROM public.user_profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.cc_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.cc_current_role() = 'admin', false);
$$;

-- Rôles « encadrants » : identiques à MANAGER_ROLES côté Express
-- (server/access/schoolScope.js). 'student' en est volontairement exclu.
CREATE OR REPLACE FUNCTION public.cc_is_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    public.cc_current_role() IN ('admin', 'teacher', 'cpd', 'cpc', 'rectorat'),
    false
  );
$$;

-- ── Email vérifié de l'appelant (auth.users n'est pas lisible par
--    `authenticated` : c'est ce qui rendait `students_select_teacher` inopérante).
CREATE OR REPLACE FUNCTION public.cc_current_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT lower(u.email) FROM auth.users u WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.cc_my_circonscription()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.circonscription_id::text FROM public.user_profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.cc_my_region()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.region::text FROM public.user_profiles p WHERE p.id = auth.uid();
$$;

-- ── Élèves réellement rattachés à l'appelant.
--    Unique source d'autorité (CTO-003) : mapping actif, jamais l'email ni access_code.
CREATE OR REPLACE FUNCTION public.cc_my_student_ids()
RETURNS SETOF TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT m.student_id::text
  FROM public.user_student_mapping m
  WHERE m.user_id = auth.uid() AND m.active = true;
END;
$$;

-- ── Classes dont l'appelant est titulaire.
--    Transition teacher_email → teacher_user_id : les deux sont acceptées tant
--    que le backfill (hors CTO-005A) n'a pas eu lieu, sans jamais élargir les
--    droits au-delà du titulaire.
CREATE OR REPLACE FUNCTION public.cc_my_class_ids()
RETURNS SETOF TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id::text
  FROM public.classes c
  WHERE auth.uid() IS NOT NULL
    AND (
      (c.teacher_user_id IS NOT NULL AND c.teacher_user_id = auth.uid())
      OR (c.teacher_email IS NOT NULL AND lower(c.teacher_email) = public.cc_current_email())
    );
END;
$$;

-- ── Périmètre visible, calculé côté serveur.
--    Ces fonctions font les jointures inter-tables À LA PLACE des policies :
--    une policy qui interrogerait directement une autre table protégée
--    déclencherait une récursion infinie (classes → schools → classes).
-- Classes que j'ENCADRE : titularité prouvée + circonscription (cpc/cpd).
-- C'est le seul périmètre qui donne accès aux ÉLÈVES d'une classe.
CREATE OR REPLACE FUNCTION public.cc_managed_class_ids()
RETURNS SETOF TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT public.cc_my_class_ids()
  UNION
  SELECT c.id::text
    FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
   WHERE public.cc_current_role() IN ('cpc', 'cpd')
     AND sc.circonscription_id IS NOT NULL
     AND sc.circonscription_id::text = public.cc_my_circonscription();
END;
$$;

-- Classes que je peux VOIR : celles que j'encadre, plus la classe de l'élève
-- qui m'est rattaché (un élève doit pouvoir afficher le nom de sa classe —
-- mais cela ne lui donne AUCUN accès aux autres élèves de cette classe).
CREATE OR REPLACE FUNCTION public.cc_visible_class_ids()
RETURNS SETOF TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT public.cc_managed_class_ids()
  UNION
  SELECT s.class_id::text
    FROM public.students s
   WHERE s.class_id IS NOT NULL
     AND s.id::text IN (SELECT public.cc_my_student_ids());
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_visible_school_ids()
RETURNS SETOF TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT c.school_id::text
    FROM public.classes c
   WHERE c.id::text IN (SELECT public.cc_visible_class_ids())
  UNION
  SELECT s.school_id::text
    FROM public.students s
   WHERE s.school_id IS NOT NULL
     AND s.id::text IN (SELECT public.cc_my_student_ids())
  UNION
  SELECT sc.id::text
    FROM public.schools sc
   WHERE public.cc_current_role() IN ('cpc', 'cpd')
     AND sc.circonscription_id IS NOT NULL
     AND sc.circonscription_id::text = public.cc_my_circonscription();
END;
$$;

-- ── Permissions d'exécution : aucune fonction n'est appelable par anon.
REVOKE EXECUTE ON FUNCTION public.cc_managed_class_ids()  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cc_managed_class_ids()   TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cc_visible_class_ids()  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_visible_school_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cc_visible_class_ids()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_visible_school_ids()  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cc_current_role()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_is_admin()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_is_manager()        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_current_email()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_my_circonscription() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_my_region()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_my_student_ids()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cc_my_class_ids()      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cc_current_role()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_is_admin()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_is_manager()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_current_email()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_my_circonscription() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_my_region()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_my_student_ids()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cc_my_class_ids()       TO authenticated, service_role;
