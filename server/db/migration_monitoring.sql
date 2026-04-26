-- =============================================
-- MIGRATION: Tables monitoring pour Crazy Chrono
-- Stockage persistant (survit aux redéploiements Render)
-- À exécuter dans Supabase SQL Editor
-- =============================================

-- 1) Événements monitoring (erreurs, incidents, telemetry)
CREATE TABLE IF NOT EXISTS monitoring_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,         -- 'error:js', 'error:fetch', 'socket:connect', 'incident', 'payment', etc.
  severity TEXT DEFAULT 'info',     -- 'info', 'warning', 'error', 'critical'
  message TEXT,
  device_id TEXT,
  user_id TEXT,
  email TEXT,
  metadata JSONB DEFAULT '{}',      -- données libres (stack trace, URL, mode, etc.)
  ip_address TEXT,
  country TEXT,                     -- géolocalisation (rempli côté serveur)
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes temporelles et filtres
CREATE INDEX IF NOT EXISTS idx_mon_events_created ON monitoring_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mon_events_type ON monitoring_events(event_type);
CREATE INDEX IF NOT EXISTS idx_mon_events_severity ON monitoring_events(severity);
CREATE INDEX IF NOT EXISTS idx_mon_events_user ON monitoring_events(user_id);

-- 2) Métriques APM (temps de réponse par endpoint)
CREATE TABLE IF NOT EXISTS monitoring_apm (
  id BIGSERIAL PRIMARY KEY,
  method TEXT NOT NULL,             -- GET, POST, etc.
  path TEXT NOT NULL,               -- /api/monitoring/heartbeat, etc.
  status_code INT,
  duration_ms REAL NOT NULL,        -- temps de réponse en ms
  user_id TEXT,
  ip_address TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mon_apm_created ON monitoring_apm(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mon_apm_path ON monitoring_apm(path);

-- 3) Snapshots joueurs connectés (historique pour graphiques)
CREATE TABLE IF NOT EXISTS monitoring_player_snapshots (
  id BIGSERIAL PRIMARY KEY,
  online_count INT NOT NULL DEFAULT 0,
  playing_count INT NOT NULL DEFAULT 0, -- joueurs en mode jeu actif
  modes JSONB DEFAULT '{}',             -- {"solo": 3, "multiplayer": 2, "arena": 1}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mon_players_created ON monitoring_player_snapshots(created_at DESC);

-- 4) Alertes envoyées (éviter doublons, historique)
CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_type TEXT NOT NULL,         -- 'error_spike', 'server_down', 'payment_fail'
  channel TEXT NOT NULL,            -- 'discord', 'email'
  message TEXT,
  metadata JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mon_alerts_sent ON monitoring_alerts(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_mon_alerts_type ON monitoring_alerts(alert_type);

-- 5) Vue agrégée erreurs par heure (pour graphiques)
CREATE OR REPLACE VIEW monitoring_errors_hourly AS
SELECT
  date_trunc('hour', created_at) AS hour,
  event_type,
  severity,
  COUNT(*) AS count
FROM monitoring_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY hour, event_type, severity
ORDER BY hour DESC;

-- 6) Vue agrégée APM par heure
CREATE OR REPLACE VIEW monitoring_apm_hourly AS
SELECT
  date_trunc('hour', created_at) AS hour,
  path,
  COUNT(*) AS request_count,
  ROUND(AVG(duration_ms)::numeric, 1) AS avg_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p50_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p95_ms,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p99_ms,
  MAX(duration_ms) AS max_ms
FROM monitoring_apm
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY hour, path
ORDER BY hour DESC;

-- =============================================
-- 7) Game Incidents (pair_rejected, missing_pair, etc.)
-- Remplace game_incidents.json (éphémère sur Render)
-- =============================================
CREATE TABLE IF NOT EXISTS mon_game_incidents (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT,                    -- ID unique côté client (pour dédoublonnage)
  incident_type TEXT NOT NULL,       -- 'pair_rejected', 'missing_pair', 'duplicate_pair', etc.
  severity TEXT DEFAULT 'error',     -- 'warning', 'error', 'critical'
  device_id TEXT,
  user_id TEXT,
  session_info JSONB DEFAULT '{}',   -- mode, roomId, roundIndex, etc.
  details JSONB DEFAULT '{}',        -- message, pairId, zoneIds, contenu, etc.
  zones_snapshot JSONB,              -- snapshot des zones au moment de l'incident (nullable)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mon_gi_created ON mon_game_incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mon_gi_type ON mon_game_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_mon_gi_severity ON mon_game_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_mon_gi_client_id ON mon_game_incidents(client_id);

-- =============================================
-- 8) Client Round Logs (zones snapshot par manche, synced from localStorage)
-- Remplace client_round_logs.json
-- =============================================
CREATE TABLE IF NOT EXISTS mon_client_rounds (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT,                    -- ID unique côté client (dédoublonnage)
  device_id TEXT,
  user_id TEXT,
  mode TEXT,                         -- 'solo', 'multiplayer', 'arena', 'training', 'gs'
  round_index INT,
  zones_count INT,
  good_pairs INT,
  distractors INT,
  details JSONB DEFAULT '{}',        -- données complètes du round log
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mon_cr_created ON mon_client_rounds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mon_cr_client_id ON mon_client_rounds(client_id);
CREATE INDEX IF NOT EXISTS idx_mon_cr_mode ON mon_client_rounds(mode);

-- =============================================
-- 9) Client Click Events (PAIR_OK / PAIR_FAIL synced from localStorage)
-- Remplace client_click_events.json
-- =============================================
CREATE TABLE IF NOT EXISTS mon_client_clicks (
  id BIGSERIAL PRIMARY KEY,
  sync_id TEXT,                      -- ID unique côté client (dédoublonnage)
  device_id TEXT,
  user_id TEXT,
  stage TEXT,                        -- 'PAIR_OK', 'PAIR_FAIL'
  zone_id TEXT,
  zone_type TEXT,
  content TEXT,
  reason TEXT,
  details JSONB DEFAULT '{}',        -- données complètes du click event
  ts BIGINT,                         -- timestamp client (ms)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mon_cc_created ON mon_client_clicks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mon_cc_sync_id ON mon_client_clicks(sync_id);
CREATE INDEX IF NOT EXISTS idx_mon_cc_stage ON mon_client_clicks(stage);

-- =============================================
-- 10) Arena Round Logs (server-side round data)
-- Remplace arena_round_logs.json
-- =============================================
CREATE TABLE IF NOT EXISTS mon_arena_rounds (
  id BIGSERIAL PRIMARY KEY,
  details JSONB DEFAULT '{}',        -- données complètes du round Arena
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mon_ar_created ON mon_arena_rounds(created_at DESC);

-- =============================================
-- 11) Game Traces (diagnostic events from cc_game_trace)
-- Remplace game_trace.json
-- =============================================
CREATE TABLE IF NOT EXISTS mon_game_traces (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,               -- 'timer:zero', 'session:end', 'round:new', etc.
  device_id TEXT,
  user_id TEXT,
  details JSONB DEFAULT '{}',        -- données complètes de la trace
  ts BIGINT,                         -- timestamp client (ms)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mon_gt_created ON mon_game_traces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mon_gt_event ON mon_game_traces(event);

-- =============================================
-- 12) Client Telemetry (error:js, error:fetch, socket:connect, etc.)
-- Remplace client_telemetry.json
-- =============================================
CREATE TABLE IF NOT EXISTS mon_client_telemetry (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,               -- 'error:js', 'error:fetch', 'socket:connect', etc.
  device_id TEXT,
  user_id TEXT,
  details JSONB DEFAULT '{}',        -- données complètes de l'événement
  ts BIGINT,                         -- timestamp client (ms)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mon_ct_created ON mon_client_telemetry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mon_ct_event ON mon_client_telemetry(event);

-- =============================================
-- 13) Nettoyage automatique — rétention 30 jours
-- Exécuter via pg_cron OU appel périodique depuis le serveur
-- =============================================
CREATE OR REPLACE FUNCTION mon_cleanup_old_data() RETURNS void AS $$
BEGIN
  DELETE FROM monitoring_events WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM monitoring_apm WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM monitoring_player_snapshots WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM mon_game_incidents WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM mon_client_rounds WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM mon_client_clicks WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM mon_arena_rounds WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM mon_game_traces WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM mon_client_telemetry WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 14) RLS policies (accès admin uniquement via service_role)
-- =============================================
ALTER TABLE monitoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_apm ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_player_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mon_game_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE mon_client_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE mon_client_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mon_arena_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE mon_game_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE mon_client_telemetry ENABLE ROW LEVEL SECURITY;

-- Service role peut tout faire (utilisé par le backend)
DROP POLICY IF EXISTS "service_role_all_monitoring_events" ON monitoring_events;
CREATE POLICY "service_role_all_monitoring_events" ON monitoring_events
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_monitoring_apm" ON monitoring_apm;
CREATE POLICY "service_role_all_monitoring_apm" ON monitoring_apm
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_monitoring_snapshots" ON monitoring_player_snapshots;
CREATE POLICY "service_role_all_monitoring_snapshots" ON monitoring_player_snapshots
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_monitoring_alerts" ON monitoring_alerts;
CREATE POLICY "service_role_all_monitoring_alerts" ON monitoring_alerts
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_mon_gi" ON mon_game_incidents;
CREATE POLICY "service_role_all_mon_gi" ON mon_game_incidents
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_mon_cr" ON mon_client_rounds;
CREATE POLICY "service_role_all_mon_cr" ON mon_client_rounds
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_mon_cc" ON mon_client_clicks;
CREATE POLICY "service_role_all_mon_cc" ON mon_client_clicks
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_mon_ar" ON mon_arena_rounds;
CREATE POLICY "service_role_all_mon_ar" ON mon_arena_rounds
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_mon_gt" ON mon_game_traces;
CREATE POLICY "service_role_all_mon_gt" ON mon_game_traces
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_all_mon_ct" ON mon_client_telemetry;
CREATE POLICY "service_role_all_mon_ct" ON mon_client_telemetry
  FOR ALL USING (auth.role() = 'service_role');
