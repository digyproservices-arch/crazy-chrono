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
-- minimale). Plus aucun accès direct anon. Les écrans d'administration passent
-- par `GET /api/admin/invitations` (service role) : aucun rôle client — pas même
-- un admin muni de la clé anon — ne conserve d'accès PostgREST à cette table.
-- ==========================================================================

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all invitations"   ON public.invitations;
DROP POLICY IF EXISTS "Admins can create invitations"     ON public.invitations;
DROP POLICY IF EXISTS "Admin can read invitations"        ON public.invitations;
DROP POLICY IF EXISTS "Admin can insert invitations"      ON public.invitations;
DROP POLICY IF EXISTS "Admin can update invitations"      ON public.invitations;
DROP POLICY IF EXISTS invitations_select_admin            ON public.invitations;

-- Toute policy résiduelle (nom inconnu) est supprimée : l'audit CTO-004 n'a pas
-- pu établir la liste exacte des policies en production, et aucune policy
-- n'est légitime sur cette table.
DO $$
DECLARE p TEXT;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.invitations', p);
  END LOOP;
END $$;

-- Aucune policy, aucun privilège client : ni SELECT, ni INSERT/UPDATE/DELETE.
-- Un token d'invitation est un porteur de rôle privilégié ; le lire suffit à
-- tenter une escalade. La table n'est donc atteignable que par le service role
-- (POST /api/admin/send-invite, GET /api/admin/invitations,
-- POST /api/invitations/validate, POST /api/auth/apply-invite).

REVOKE ALL ON public.invitations FROM anon;
REVOKE ALL ON public.invitations FROM authenticated;
