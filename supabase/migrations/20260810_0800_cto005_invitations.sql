-- ==========================================================================
-- CTO-005A — 0800 — P1-3 : invitations
--
-- Avant : src/components/Auth/Login.js lisait `invitations` **avant
-- authentification** avec la clé anon. Soit la fonctionnalité était cassée en
-- production, soit une policy anon non tracée existait — et permettait alors
-- l'énumération des tokens et des rôles associés (chemin d'escalade).
--
-- Après : la validation d'un token passe exclusivement par
-- `POST /api/invitations/validate` (service role, rate-limité, réponse
-- minimale). Plus aucun accès direct anon. Les écrans d'administration
-- conservent une lecture admin explicite.
-- ==========================================================================

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all invitations"   ON public.invitations;
DROP POLICY IF EXISTS "Admins can create invitations"     ON public.invitations;
DROP POLICY IF EXISTS "Admin can read invitations"        ON public.invitations;
DROP POLICY IF EXISTS "Admin can insert invitations"      ON public.invitations;
DROP POLICY IF EXISTS "Admin can update invitations"      ON public.invitations;
DROP POLICY IF EXISTS invitations_select_admin            ON public.invitations;

-- Toute policy permissive résiduelle (nom inconnu, USING (true)) est supprimée :
-- l'audit CTO-004 n'a pas pu établir la liste exacte des policies en production.
DO $$
DECLARE p TEXT;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
      AND COALESCE(qual, 'true') = 'true'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.invitations', p);
  END LOOP;
END $$;

CREATE POLICY invitations_select_admin ON public.invitations
  FOR SELECT TO authenticated
  USING (public.cc_is_admin());

-- Aucune policy INSERT/UPDATE/DELETE : la création d'invitation et le marquage
-- « utilisée » sont réservés au backend (POST /api/admin/send-invite,
-- POST /api/auth/apply-invite).

REVOKE ALL ON public.invitations FROM anon;
REVOKE ALL ON public.invitations FROM authenticated;
GRANT SELECT ON public.invitations TO authenticated;
