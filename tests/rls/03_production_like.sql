-- ==========================================================================
-- CTO-005A — Variante PRODUCTION-COMPATIBILITY.
--
-- Appliquée APRÈS 01_baseline_legacy.sql, elle transforme la baseline en une
-- reproduction du schéma RÉEL observé par docs/CTO_005_PRODUCTION_REPORT.sql
-- (exécuté en lecture seule sur la production par le propriétaire).
--
-- AUCUNE donnée de production n'est reprise : uniquement des TYPES, des
-- présences/absences de colonnes, des contraintes et des expositions de
-- fonctions. Toutes les valeurs sont synthétiques.
--
-- Écarts reproduits par rapport à la baseline du dépôt :
--   1. subscriptions.user_id est TEXT (et non UUID) ;
--   2. webhook_events PRÉEXISTE avec event_id TEXT + received_at TIMESTAMPTZ,
--      sans provider ni created_at, et contient déjà des lignes ;
--   3. les contraintes CHECK de rôle acceptent déjà cpd/cpc ;
--   4. 13 fonctions SECURITY DEFINER sont exécutables par anon/authenticated,
--      dont `ensure_profile` qui n'existe dans AUCUN SQL du dépôt ;
--   5. les tables de monitoring ont un user_id TEXT.
-- ==========================================================================

-- ── 1. subscriptions.user_id TEXT -----------------------------------------
DROP POLICY IF EXISTS "subscriptions_read_own" ON public.subscriptions;
ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_user_id_fkey;
ALTER TABLE public.subscriptions ALTER COLUMN user_id TYPE TEXT;
-- Policy historique telle qu'elle peut exister sur une colonne TEXT.
CREATE POLICY "subscriptions_read_own" ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid()::text);
GRANT SELECT ON public.subscriptions TO authenticated;

-- ── 2. webhook_events préexistante ----------------------------------------
CREATE TABLE public.webhook_events (
  event_id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.webhook_events (event_id, received_at) VALUES
  ('evt_legacy_1', '2026-01-01T00:00:00Z'),
  ('evt_legacy_2', '2026-02-02T00:00:00Z');
GRANT ALL ON public.webhook_events TO anon, authenticated;

-- ── 3. Contraintes de rôle production (cpd/cpc déjà acceptés) --------------
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('user','editor','teacher','admin','rectorat','cpd','cpc','student'));
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('user','editor','teacher','admin','rectorat','cpd','cpc'));

-- ── 4. Tables de monitoring avec user_id TEXT ------------------------------
--    Le rapport les liste comme non-UUID ; CTO-005A ne les touche pas, elles
--    sont créées ici pour que l'audit de type porte sur le schéma complet.
CREATE TABLE public.image_usage_logs      (id BIGSERIAL PRIMARY KEY, user_id TEXT);
CREATE TABLE public.mon_game_incidents    (id BIGSERIAL PRIMARY KEY, user_id TEXT);
CREATE TABLE public.mon_client_rounds     (id BIGSERIAL PRIMARY KEY, user_id TEXT);
CREATE TABLE public.mon_client_clicks     (id BIGSERIAL PRIMARY KEY, user_id TEXT);
CREATE TABLE public.mon_game_traces       (id BIGSERIAL PRIMARY KEY, user_id TEXT);
CREATE TABLE public.mon_client_telemetry  (id BIGSERIAL PRIMARY KEY, user_id TEXT);
CREATE TABLE public.monitoring_events     (id BIGSERIAL PRIMARY KEY, user_id TEXT);
CREATE TABLE public.monitoring_apm        (id BIGSERIAL PRIMARY KEY, user_id TEXT);

-- ── 5. Les 13 SECURITY DEFINER exposées ------------------------------------
-- 6 existent déjà dans la baseline (invalidate_user_sessions,
-- check_session_active, list_user_devices, detect_suspicious_accounts,
-- cleanup_old_audit_logs, link_user_to_student). On complète avec celles que le
-- rapport a vues en production et que le dépôt ne versionne pas.

CREATE OR REPLACE FUNCTION public.cleanup_old_sessions()
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
  DELETE FROM public.active_sessions WHERE is_active = false;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.cleanup_stale_devices()
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
  DELETE FROM public.user_devices WHERE last_seen < now() - INTERVAL '12 months';
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.count_failed_logins(p_email TEXT)
RETURNS BIGINT AS $$
  SELECT COUNT(*) FROM public.auth_audit_log
   WHERE email = p_email AND event_type = 'login_failed';
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.count_unique_ips_24h(p_email TEXT)
RETURNS BIGINT AS $$
  SELECT COUNT(DISTINCT ip_address) FROM public.auth_audit_log
   WHERE email = p_email AND created_at > now() - INTERVAL '24 hours';
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.count_user_devices(p_user_id UUID)
RETURNS BIGINT AS $$
  SELECT COUNT(*) FROM public.user_devices WHERE user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.register_device(p_user_id UUID, p_fingerprint TEXT, p_device_name TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.user_devices (user_id, fingerprint, device_name)
  VALUES (p_user_id, p_fingerprint, p_device_name) RETURNING id INTO v_id;
  RETURN v_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.revoke_device(p_device_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.user_devices SET is_revoked = true WHERE id = p_device_id;
  RETURN true;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- `ensure_profile` : absente du dépôt, présente en production. Reproduite ici à
-- l'IDENTIQUE d'après docs/CTO_005_ENSURE_PROFILE_PRECHECK.sql exécuté en
-- lecture seule sur la production : owner postgres, plpgsql, RETURNS trigger,
-- SECURITY DEFINER, AUCUN search_path figé, corps exact ci-dessous, branchée sur
-- un trigger AFTER INSERT de auth.users, EXECUTE ouvert à
-- anon/authenticated/service_role et fermé à PUBLIC.
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS trigger AS $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_profile();

-- Exposition client explicite (état production constaté).
REVOKE ALL ON FUNCTION public.ensure_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_sessions() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_devices() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_failed_logins(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_unique_ips_24h(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_user_devices(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_device(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_device(UUID) TO anon, authenticated;

-- ── 6. Entrées Grande Salle historiques du rapport -------------------------
-- 6 lignes paid=false / is_subscriber=true / payment_id NULL (valeurs
-- synthétiques : aucune donnée de production).
INSERT INTO public.gs_tournaments (id, name) VALUES
  ('20000000-0000-0000-0000-0000000000fe', 'GS Historique');
INSERT INTO public.gs_tournament_entries
  (tournament_id, first_name, last_name, email, paid, is_subscriber, payment_id)
SELECT '20000000-0000-0000-0000-0000000000fe', 'Hist', 'Sub' || i,
       'hist-sub-' || i || '@example.test', false, true, NULL
  FROM generate_series(1, 6) AS g(i);
