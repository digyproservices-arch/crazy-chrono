-- ==========================================
-- TABLE: backend_logs
-- Logs persistants Winston vers Supabase
-- ==========================================

CREATE TABLE IF NOT EXISTS backend_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(20) NOT NULL, -- 'info', 'warn', 'error', 'debug'
  message TEXT NOT NULL,
  meta JSONB DEFAULT '{}', -- Métadonnées supplémentaires (userId, matchId, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour recherches rapides par timestamp
CREATE INDEX IF NOT EXISTS idx_backend_logs_timestamp ON backend_logs(timestamp DESC);

-- Index pour filtrage par niveau
CREATE INDEX IF NOT EXISTS idx_backend_logs_level ON backend_logs(level);

-- Index pour recherches dans meta (GIN pour JSONB)
CREATE INDEX IF NOT EXISTS idx_backend_logs_meta ON backend_logs USING GIN(meta);

-- Politique RLS (Row Level Security) - Désactivée pour le service role
ALTER TABLE backend_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Seul le service role peut lire/écrire
CREATE POLICY "Service role only" ON backend_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Commentaires
COMMENT ON TABLE backend_logs IS 'Logs backend Winston stockés de manière persistante';
COMMENT ON COLUMN backend_logs.level IS 'Niveau de log: info, warn, error, debug';
COMMENT ON COLUMN backend_logs.meta IS 'Métadonnées JSON flexibles pour contexte supplémentaire';
