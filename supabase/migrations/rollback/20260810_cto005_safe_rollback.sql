-- ==========================================================================
-- CTO-005A — SAFE ROLLBACK (seul rollback exécutable)
--
-- Décision CTO : une panne fonctionnelle ne justifie JAMAIS de rouvrir une
-- faille critique. Ce fichier ne rétablit donc aucune des vulnérabilités
-- P0/P1 inventoriées par CTO-004. Il ne fait que **relâcher ce qui peut
-- l'être sans fuite ni escalade** :
--
--   * il rend au client authentifié la lecture/écriture de SES PROPRES lignes
--     lorsque la fermeture totale décidée par CTO-005A gênerait un écran ;
--   * il ne rend jamais un accès à `anon` ;
--   * il ne rend jamais l'accès aux lignes d'un tiers ;
--   * il ne rend jamais l'écriture d'une colonne d'autorité ou financière.
--
-- Ce que ce rollback CONSERVE, sans exception (invariants de sécurité) :
--   1. user_profiles.role / region / circonscription_id : service role seul
--      (policies + GRANT colonne + trigger cc_guard_user_profiles) ;
--   2. gs_tournament_entries.paid / is_subscriber / payment_id : service role
--      seul ;
--   3. webhook_events : aucun accès client (preuve de webhook non forgeable) ;
--   4. subscriptions : aucune écriture client, UNIQUE(user_id) conservée ;
--   5. invitations : aucun accès client, même admin (Express + service role) ;
--   6. consume_invitation : EXECUTE service_role uniquement ;
--   7. RPC SECURITY DEFINER : search_path figé, aucun EXECUTE client ;
--   8. données d'élèves (students, student_stats, training_*, attempts,
--      sessions d'autrui) : jamais lisibles par anon ni par un tiers.
--
-- NO_SAFE_ROLLBACK — FIX FORWARD REQUIRED
-- Les points suivants NE PEUVENT PAS être revenus en arrière sans réouvrir une
-- faille. En cas de régression fonctionnelle les concernant, la seule voie est
-- une correction en avant (fix forward), via l'API Express en service role :
--   * lecture directe de `invitations` par un client Supabase (§F de la revue
--     CTO) → utiliser GET /api/admin/invitations ;
--   * annuaire complet `classes` / `schools` / tables tournoi pour tout compte
--     connecté (P1-1) → utiliser /api/tournament/* et /api/admin/* ;
--   * EXECUTE des RPC `p_user_id`-arbitraires par un client (P0-3) → passer par
--     les routes Express authentifiées de CTO-003 ;
--   * écriture cliente de `paid` / `payment_id` / `is_subscriber` (P0-2) et de
--     `role` (P0-1) → passer par les webhooks vérifiés et
--     POST /api/admin/set-role.
--
-- L'ancien rollback intégral (qui, lui, rouvrait délibérément ces failles) est
-- conservé en documentation NON EXÉCUTABLE :
--   docs/CTO_005A_UNSAFE_ROLLBACK_DO_NOT_RUN.md
--
-- Idempotent : rejouable sans effet de bord.
-- ==========================================================================

-- ── 1. user_profiles : rétablir l'écriture des champs personnels ------------
-- Utile si un écran de profil casse à cause des GRANT colonne. `role`,
-- `region`, `circonscription_id` et `email` restent exclus, et le trigger
-- garde-fou reste en place (il n'est PAS supprimé ici).
DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.user_profiles'::regclass
                    AND tgname = 'cc_guard_user_profiles_trg') THEN
    RAISE EXCEPTION 'safe_rollback: trigger cc_guard_user_profiles_trg absent — la protection P0-1 doit être en place avant tout relâchement';
  END IF;

  EXECUTE 'GRANT SELECT ON public.user_profiles TO authenticated';
  EXECUTE 'GRANT INSERT (id, first_name, last_name, pseudo, language, avatar_url, strict_elements_mode) ON public.user_profiles TO authenticated';
  EXECUTE 'GRANT UPDATE (first_name, last_name, pseudo, language, avatar_url, strict_elements_mode) ON public.user_profiles TO authenticated';
END $$;

-- ── 2. sessions / attempts : écriture de ses propres lignes -----------------
-- La fermeture 0600 n'autorise que la lecture. Si le client doit à nouveau
-- écrire sa progression sans attendre une route Express, on l'autorise
-- uniquement sur SES lignes. Aucun UPDATE, aucun DELETE, rien pour `anon`.
DO $$
BEGIN
  IF to_regclass('public.sessions') IS NOT NULL THEN
    DROP POLICY IF EXISTS sessions_insert_own ON public.sessions;
    CREATE POLICY sessions_insert_own ON public.sessions
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid()::text);
    EXECUTE 'GRANT INSERT ON public.sessions TO authenticated';
  END IF;

  IF to_regclass('public.attempts') IS NOT NULL THEN
    DROP POLICY IF EXISTS attempts_insert_own ON public.attempts;
    CREATE POLICY attempts_insert_own ON public.attempts
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid()::text);
    EXECUTE 'GRANT INSERT ON public.attempts TO authenticated';
  END IF;
END $$;

-- ── 3. training_* : lecture de SES propres résultats ------------------------
-- 0600 a tout fermé côté client (les écrans passent par /api/training). Si un
-- écran élève doit lire directement, on n'ouvre que les lignes de l'élève
-- rattaché au compte, via cc_my_student_ids() (mapping serveur, CTO-003).
-- Rien pour `anon`, rien sur les élèves d'autrui, rien en écriture.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'cc_my_student_ids') THEN
    RAISE NOTICE 'safe_rollback: cc_my_student_ids absente — training_* restent fermées (fix forward)';
    RETURN;
  END IF;

  IF to_regclass('public.training_results') IS NOT NULL THEN
    DROP POLICY IF EXISTS training_results_select_own ON public.training_results;
    CREATE POLICY training_results_select_own ON public.training_results
      FOR SELECT TO authenticated
      USING (student_id::text IN (SELECT public.cc_my_student_ids()));
    EXECUTE 'GRANT SELECT ON public.training_results TO authenticated';
  END IF;

  IF to_regclass('public.student_training_stats') IS NOT NULL THEN
    DROP POLICY IF EXISTS student_training_stats_select_own ON public.student_training_stats;
    CREATE POLICY student_training_stats_select_own ON public.student_training_stats
      FOR SELECT TO authenticated
      USING (student_id::text IN (SELECT public.cc_my_student_ids()));
    EXECUTE 'GRANT SELECT ON public.student_training_stats TO authenticated';
  END IF;
END $$;

-- ── 4. gs_tournament_entries : correction de son inscription ----------------
-- Relâchement strictement non financier : l'inscrit peut corriger son nom.
-- Les colonnes financières ne sont pas accordées, donc `SET paid = true`
-- échoue en permission denied, et la policy exige que la ligne soit la sienne.
DO $$
BEGIN
  IF to_regclass('public.gs_tournament_entries') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS gs_entries_update_own_identity ON public.gs_tournament_entries;
  CREATE POLICY gs_entries_update_own_identity ON public.gs_tournament_entries
    FOR UPDATE TO authenticated
    USING (user_id IS NOT NULL AND user_id = auth.uid())
    WITH CHECK (
      user_id = auth.uid()
      AND COALESCE(paid, false) = false
      AND COALESCE(is_subscriber, false) = false
      AND payment_id IS NULL
    );
  EXECUTE 'GRANT UPDATE (first_name, last_name) ON public.gs_tournament_entries TO authenticated';
END $$;

-- ── 5. Garde-fous : le rollback ne doit pas avoir rouvert une faille --------
-- Ces vérifications échouent bruyamment si un privilège interdit existe encore
-- (par exemple parce que l'ancien rollback non sûr a été exécuté par erreur).
DO $$
DECLARE
  bad TEXT;
BEGIN
  SELECT string_agg(format('%s.%s → %s (%s)', table_schema, table_name, grantee, privilege_type), ', ')
    INTO bad
    FROM information_schema.column_privileges
   WHERE table_schema = 'public'
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('INSERT', 'UPDATE')
     AND (
       (table_name = 'user_profiles' AND column_name IN ('role','region','circonscription_id','email'))
       OR (table_name = 'gs_tournament_entries' AND column_name IN ('paid','is_subscriber','payment_id'))
     );
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'safe_rollback: privilège d''écriture interdit encore présent : %', bad;
  END IF;

  SELECT string_agg(format('%s → %s (%s)', table_name, grantee, privilege_type), ', ')
    INTO bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee IN ('anon', 'authenticated')
     AND table_name IN ('invitations', 'webhook_events',
                        'gift_codes', 'auth_audit_log', 'content_store');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'safe_rollback: table serveur encore accessible au client : %', bad;
  END IF;

  -- subscriptions : lecture de son propre abonnement tolérée (policy
  -- subscriptions_read_own), mais aucune écriture cliente.
  SELECT string_agg(format('%s → %s (%s)', table_name, grantee, privilege_type), ', ')
    INTO bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee IN ('anon', 'authenticated')
     AND table_name = 'subscriptions'
     AND privilege_type <> 'SELECT';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'safe_rollback: écriture cliente sur subscriptions encore possible : %', bad;
  END IF;

  -- Aucune policy permissive sur les tables sensibles. `gs_tournaments`
  -- (catalogue public des tournois) est volontairement hors périmètre.
  SELECT string_agg(format('%s (%s)', tablename, policyname), ', ')
    INTO bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (qual = 'true' OR with_check = 'true')
     AND (roles::text[] && ARRAY['public','anon','authenticated'])
     AND tablename IN ('user_profiles', 'gs_tournament_entries', 'invitations',
                       'webhook_events', 'subscriptions', 'students',
                       'student_stats', 'classes', 'schools', 'sessions',
                       'attempts', 'training_sessions', 'training_results',
                       'student_training_stats', 'user_devices',
                       'auth_audit_log', 'content_store', 'gift_codes',
                       'active_sessions', 'user_student_mapping');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'safe_rollback: policy permissive USING/WITH CHECK (true) encore présente : %', bad;
  END IF;

  SELECT string_agg(p.proname, ', ')
    INTO bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     -- Les helpers cc_* (migration 0100) sont appelés depuis les policies :
     -- ils ne prennent aucun argument et ne parlent que de auth.uid().
     AND p.proname NOT LIKE 'cc\_%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'safe_rollback: RPC SECURITY DEFINER exécutable par un client : %', bad;
  END IF;

  RAISE NOTICE 'safe_rollback: invariants P0/P1 vérifiés — aucune faille réouverte';
END $$;
