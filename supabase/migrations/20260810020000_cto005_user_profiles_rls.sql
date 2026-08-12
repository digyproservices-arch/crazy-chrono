-- ==========================================================================
-- CTO-005A — 0200 — P0-1 : user_profiles / escalade de rôle
--
-- Objectif : aucun client (anon ou authenticated) ne peut s'attribuer
-- 'admin' / 'teacher' / 'cpd' / 'cpc' / 'rectorat', ni un périmètre
-- institutionnel (region, circonscription_id), ni modifier le profil d'un tiers.
--
-- Trois couches indépendantes :
--   1. RLS (lignes)      : je ne vois et n'écris que ma ligne.
--   2. GRANT colonne     : `role`, `region`, `circonscription_id` ne sont pas
--                          accordés en INSERT/UPDATE aux rôles clients.
--   3. Trigger garde-fou : toute tentative de changement de ces colonnes par
--                          un rôle non service_role lève une exception.
-- ==========================================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Valeur par défaut sûre : un profil créé par un client naît toujours 'user'.
ALTER TABLE public.user_profiles ALTER COLUMN role SET DEFAULT 'user';

-- ── 1. RLS ---------------------------------------------------------------
DROP POLICY IF EXISTS user_profiles_select_own      ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_select_admin    ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert_own      ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_own      ON public.user_profiles;

-- `user_profiles.id` est UUID partout où il a été observé ; la comparaison est
-- néanmoins construite d'après le type réel pour ne jamais échouer sur un
-- schéma qui l'aurait déclaré en TEXT. Aucune donnée n'est convertie.
DO $$
DECLARE
  v_uid TEXT;
BEGIN
  SELECT CASE WHEN a.atttypid = 'uuid'::regtype THEN 'auth.uid()' ELSE 'auth.uid()::text' END
    INTO v_uid
    FROM pg_attribute a
   WHERE a.attrelid = 'public.user_profiles'::regclass
     AND a.attname = 'id'
     AND NOT a.attisdropped;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CTO-005A: public.user_profiles.id introuvable — schéma inattendu.';
  END IF;

  EXECUTE format(
    'CREATE POLICY user_profiles_select_own ON public.user_profiles
       FOR SELECT TO authenticated USING (id = %s)', v_uid);
  EXECUTE format(
    'CREATE POLICY user_profiles_insert_own ON public.user_profiles
       FOR INSERT TO authenticated WITH CHECK (id = %s)', v_uid);
  EXECUTE format(
    'CREATE POLICY user_profiles_update_own ON public.user_profiles
       FOR UPDATE TO authenticated USING (id = %s) WITH CHECK (id = %s)', v_uid, v_uid);
END $$;

-- Besoin institutionnel : l'administration des comptes se fait par le backend
-- (service role). On conserve toutefois une lecture admin explicite pour les
-- écrans d'administration qui interrogent Supabase directement.
CREATE POLICY user_profiles_select_admin ON public.user_profiles
  FOR SELECT TO authenticated
  USING (public.cc_is_admin());

-- Aucune policy DELETE : la suppression passe par le service role (RGPD).

-- ── 2. Privilèges colonne -------------------------------------------------
REVOKE ALL ON public.user_profiles FROM anon;
REVOKE ALL ON public.user_profiles FROM authenticated;

GRANT SELECT ON public.user_profiles TO authenticated;
-- Colonnes personnelles uniquement. `role`, `region`, `circonscription_id`,
-- `email` et `created_at` sont volontairement absents.
GRANT INSERT (id, first_name, last_name, pseudo, language, avatar_url, strict_elements_mode)
  ON public.user_profiles TO authenticated;
GRANT UPDATE (first_name, last_name, pseudo, language, avatar_url, strict_elements_mode)
  ON public.user_profiles TO authenticated;

-- ── 3. Trigger garde-fou --------------------------------------------------
CREATE OR REPLACE FUNCTION public.cc_guard_user_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER volontaire : le trigger doit voir le rôle réel de l'appelant
-- (un SECURITY DEFINER remplacerait current_user par le propriétaire).
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Le backend (service role) et le propriétaire de la base restent souverains.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'user'
       OR NEW.region IS NOT NULL
       OR NEW.circonscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'cc_guard_user_profiles: role/region/circonscription_id are server-managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.region IS DISTINCT FROM OLD.region
     OR NEW.circonscription_id IS DISTINCT FROM OLD.circonscription_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'cc_guard_user_profiles: role/region/circonscription_id are server-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cc_guard_user_profiles_trg ON public.user_profiles;
CREATE TRIGGER cc_guard_user_profiles_trg
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.cc_guard_user_profiles();

COMMENT ON TRIGGER cc_guard_user_profiles_trg ON public.user_profiles IS
  'CTO-005A : role/region/circonscription_id ne peuvent être écrits que par le service role (POST /api/admin/set-role, POST /api/auth/apply-invite).';
