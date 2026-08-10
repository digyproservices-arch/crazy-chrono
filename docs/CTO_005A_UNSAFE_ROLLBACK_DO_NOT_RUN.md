# CTO-005A — ANCIEN ROLLBACK INTÉGRAL — DO_NOT_RUN

> **Ce document n'est pas exécutable et ne doit jamais l'être.**
> Il est conservé en Markdown (et non en `.sql`) précisément pour qu'aucun outil
> de migration ni aucun `psql -f` ne puisse l'appliquer.

## Pourquoi il a été retiré des fichiers exécutables

Décision CTO : **une panne fonctionnelle ne justifie jamais de rouvrir une faille
critique.** Or ce script rétablissait délibérément l'état vulnérable inventorié
par `docs/CTO_AUDIT_004_RLS_SUPABASE.md` :

| Ligne du script | Faille réouverte | Gravité |
| --- | --- | --- |
| `GRANT EXECUTE ... TO PUBLIC` + `RESET search_path` sur 17 RPC | déconnexion d'un tiers, oracle de jeton, fuite d'IP, `DELETE` de masse | P0-3 |
| `CREATE POLICY ... USING (true) WITH CHECK (true)` sur `sessions`, `attempts`, `training_*`, `user_devices`, `auth_audit_log`, `content_store`, `gift_codes` | performances d'élèves et journaux d'authentification lisibles par `anon` | P0-4 / P1-4 |
| `gs_entries_insert_all ... WITH CHECK (true)` | preuve de paiement Grande Salle forgeable | P0-2 |
| `GRANT ALL ON public.user_profiles TO anon, authenticated` + suppression du trigger `cc_guard_user_profiles` | auto-promotion `admin` / `rectorat` | P0-1 |
| `GRANT SELECT ON public.invitations TO anon, authenticated` | énumération des tokens d'invitation privilégiés | P1-3 |
| `schools_select_authenticated` / `classes_select_authenticated` en `USING (true)` | annuaire des classes et écoles (dont `teacher_email`) lisible par tout compte | P1-1 |

## Ce qu'il faut faire à la place

1. **Rollback exécutable** : `supabase/migrations/rollback/20260810_cto005_safe_rollback.sql`
   — il relâche uniquement ce qui peut l'être sans fuite ni escalade (lignes
   propres à l'utilisateur), et vérifie en fin d'exécution qu'aucun invariant
   P0/P1 n'a été rouvert.
2. **Pour tout ce que le safe rollback ne peut pas rendre** :
   `NO_SAFE_ROLLBACK — FIX FORWARD REQUIRED`. Le chemin de service reste l'API
   Express en service role (CTO-002/003), qui applique déjà le périmètre.

## Contenu historique (référence seulement — ne pas exécuter)

```sql
-- ==========================================================================
-- CTO-005A — ROLLBACK
--
-- Revient à l'état fonctionnel d'AVANT CTO-005A. Attention : cet état est
-- délibérément **non sûr** (c'est celui décrit dans CTO_AUDIT_004). Ne
-- l'exécuter qu'en cas d'incident fonctionnel bloquant, et rouvrir aussitôt
-- un plan de correction.
--
-- Ce que le rollback NE défait PAS (opérations additives, sans risque de
-- régression fonctionnelle) :
--   * création de public.webhook_events ;
--   * colonne classes.teacher_user_id ;
--   * contrainte subscriptions_user_id_key (la retirer casserait à nouveau
--     l'upsert `onConflict: 'user_id'`).
-- ==========================================================================

-- ── 1000 — RPC -------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  fn_names TEXT[] := ARRAY[
    'invalidate_user_sessions', 'check_session_active', 'cleanup_old_sessions',
    'register_device', 'revoke_device', 'list_user_devices',
    'count_user_devices', 'cleanup_stale_devices',
    'count_unique_ips_24h', 'count_failed_logins', 'detect_suspicious_accounts',
    'cleanup_old_audit_logs', 'update_student_training_stats',
    'check_user_can_play', 'link_user_to_student', 'count_all_entities',
    'mon_cleanup_old_data'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(fn_names)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.sig);
    EXECUTE format('ALTER FUNCTION %s RESET search_path', r.sig);
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- ── 0900 / 0800 / 0700 / 0600 — policies et privilèges ---------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_devices', 'auth_audit_log', 'content_store', 'active_sessions',
    'gift_codes', 'image_usage_logs', 'training_sessions', 'training_results',
    'student_training_stats'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        'rollback_allow_all_' || t, t);
      EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'tournaments', 'tournament_phases', 'tournament_groups',
    'tournament_matches', 'match_results', 'tournament_brackets'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
        replace(t, 'tournament_', '') || '_select_authenticated', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS sessions_select_own ON public.sessions;
CREATE POLICY "allow_all_sessions" ON public.sessions FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.sessions TO anon, authenticated;

DROP POLICY IF EXISTS attempts_select_own ON public.attempts;
CREATE POLICY "allow_all_attempts" ON public.attempts FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.attempts TO anon, authenticated;

DROP POLICY IF EXISTS schools_select_scope ON public.schools;
CREATE POLICY "schools_select_authenticated" ON public.schools FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS classes_select_scope ON public.classes;
CREATE POLICY "classes_select_authenticated" ON public.classes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS students_select_teacher ON public.students;
DROP POLICY IF EXISTS student_stats_select_teacher ON public.student_stats;

DROP POLICY IF EXISTS invitations_select_admin ON public.invitations;
GRANT SELECT ON public.invitations TO anon, authenticated;

-- ── 0300 — gs_tournament_entries -------------------------------------------
DROP POLICY IF EXISTS gs_entries_insert_free ON public.gs_tournament_entries;
DROP POLICY IF EXISTS gs_entries_select_own  ON public.gs_tournament_entries;
CREATE POLICY "gs_entries_insert_all" ON public.gs_tournament_entries FOR INSERT WITH CHECK (true);
GRANT INSERT, SELECT ON public.gs_tournament_entries TO anon, authenticated;

-- ── 0200 — user_profiles ----------------------------------------------------
DROP TRIGGER IF EXISTS cc_guard_user_profiles_trg ON public.user_profiles;
DROP FUNCTION IF EXISTS public.cc_guard_user_profiles();
DROP POLICY IF EXISTS user_profiles_select_own   ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_select_admin ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert_own   ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_own   ON public.user_profiles;
GRANT ALL ON public.user_profiles TO anon, authenticated;

-- ── 0100 — helpers ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.cc_my_class_ids();
DROP FUNCTION IF EXISTS public.cc_my_student_ids();
DROP FUNCTION IF EXISTS public.cc_my_region();
DROP FUNCTION IF EXISTS public.cc_my_circonscription();
DROP FUNCTION IF EXISTS public.cc_current_email();
DROP FUNCTION IF EXISTS public.cc_is_manager();
DROP FUNCTION IF EXISTS public.cc_is_admin();
DROP FUNCTION IF EXISTS public.cc_current_role();
```
