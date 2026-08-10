-- ==========================================================================
-- CTO-005A (revue CTO finale §C) — 1200 — normalisation des contraintes de rôle
--
-- Problème : le dépôt contient deux générations de contraintes CHECK,
-- appliquées dans un ordre inconnu en production —
--   server/db/migration_rectorat.sql      → ('user','editor','teacher','admin','rectorat')
--   server/db/migration_cpd_cpc_roles.sql → (+ 'cpd','cpc')
-- Si la première est encore active, `send-invite` puis `consume_invitation`
-- échouent au niveau PostgreSQL pour un CPD/CPC, alors que tout le code
-- CTO-005A les autorise : le rôle n'est jamais attribué et l'invitation est
-- perdue.
--
-- Après : une seule définition, alignée sur la whitelist serveur
-- (server/access/roles.js). Deux ensembles distincts, car ils ne recouvrent pas
-- le même besoin :
--   * invitations.role   = rôles ATTRIBUABLES par un administrateur ;
--   * user_profiles.role = idem + 'student', écrit par le backend (service role)
--     à la création d'un compte élève et jamais attribuable par un humain.
--
-- Fail closed : si une valeur hors de ces ensembles existe déjà, la migration
-- s'arrête avec la liste exacte. Elle ne convertit JAMAIS un rôle historique —
-- cette décision appartient au propriétaire (POST /api/admin/set-role).
-- ==========================================================================

BEGIN;

DO $$
DECLARE
  v_bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT role || ' (' || cnt || ')', ', ')
    INTO v_bad
    FROM (SELECT role, COUNT(*) AS cnt
            FROM public.user_profiles
           WHERE role IS NOT NULL
             AND role NOT IN ('admin','editor','user','teacher','cpd','cpc',
                              'rectorat','student')
           GROUP BY role) s;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'CTO-005A 1200 : user_profiles.role contient des valeurs hors whitelist : %. Régulariser ces comptes (POST /api/admin/set-role) avant de rejouer cette migration ; aucune conversion automatique n''est effectuée.',
      v_bad;
  END IF;

  SELECT string_agg(DISTINCT role || ' (' || cnt || ')', ', ')
    INTO v_bad
    FROM (SELECT role, COUNT(*) AS cnt
            FROM public.invitations
           WHERE role IS NOT NULL
             AND role NOT IN ('admin','editor','user','teacher','cpd','cpc','rectorat')
           GROUP BY role) s;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'CTO-005A 1200 : invitations.role contient des valeurs hors whitelist : %. Supprimer ou corriger ces invitations avant de rejouer cette migration ; aucune conversion automatique n''est effectuée.',
      v_bad;
  END IF;
END $$;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin','editor','user','teacher','cpd','cpc','rectorat','student'));

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin','editor','user','teacher','cpd','cpc','rectorat'));

COMMENT ON CONSTRAINT user_profiles_role_check ON public.user_profiles IS
  'CTO-005A : whitelist serveur (server/access/roles.js) + student, écrit par le backend pour les comptes élèves.';
COMMENT ON CONSTRAINT invitations_role_check ON public.invitations IS
  'CTO-005A : rôles attribuables par un administrateur (server/access/roles.js). student n''est jamais invitable.';

COMMIT;
