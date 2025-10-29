-- Table pour enregistrer l'utilisation des images
CREATE TABLE IF NOT EXISTS image_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  round_index INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  image_filename TEXT NOT NULL,
  pair_id TEXT,
  is_main_pair BOOLEAN DEFAULT false,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Index pour optimiser les requêtes
  INDEX idx_image_filename (image_filename),
  INDEX idx_timestamp (timestamp),
  INDEX idx_session_id (session_id)
);

-- Activer Row Level Security
ALTER TABLE image_usage_logs ENABLE ROW LEVEL SECURITY;

-- Politique: Tout le monde peut insérer (pour enregistrer les usages)
CREATE POLICY "Allow insert for all" ON image_usage_logs
  FOR INSERT
  WITH CHECK (true);

-- Politique: Seuls les admins peuvent lire
CREATE POLICY "Allow read for admins" ON image_usage_logs
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

-- Vue agrégée pour faciliter les analyses
CREATE OR REPLACE VIEW image_usage_summary AS
SELECT 
  image_filename,
  COUNT(*) as total_usage,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT user_id) as unique_users,
  MIN(timestamp) as first_used,
  MAX(timestamp) as last_used
FROM image_usage_logs
GROUP BY image_filename
ORDER BY total_usage DESC;
