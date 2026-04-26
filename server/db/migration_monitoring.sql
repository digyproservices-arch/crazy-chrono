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

-- 7) Nettoyage automatique (garder 30 jours)
-- À exécuter comme cron job Supabase ou manuellement
-- DELETE FROM monitoring_events WHERE created_at < NOW() - INTERVAL '30 days';
-- DELETE FROM monitoring_apm WHERE created_at < NOW() - INTERVAL '30 days';
-- DELETE FROM monitoring_player_snapshots WHERE created_at < NOW() - INTERVAL '90 days';

-- 8) RLS policies (accès admin uniquement)
ALTER TABLE monitoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_apm ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_player_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- Service role peut tout faire (utilisé par le backend)
CREATE POLICY "service_role_all_monitoring_events" ON monitoring_events
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_monitoring_apm" ON monitoring_apm
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_monitoring_snapshots" ON monitoring_player_snapshots
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_monitoring_alerts" ON monitoring_alerts
  FOR ALL USING (auth.role() = 'service_role');
