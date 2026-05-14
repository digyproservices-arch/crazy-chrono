-- =========================================================
-- Migration: Table content_store
-- Persiste associations.json dans Supabase pour survivre
-- aux redéploiements Render (filesystem éphémère)
-- =========================================================

CREATE TABLE IF NOT EXISTS content_store (
  id TEXT PRIMARY KEY DEFAULT 'associations',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- RLS: service_role a accès total, pas de lecture publique
ALTER TABLE content_store ENABLE ROW LEVEL SECURITY;

-- Policy: lecture/écriture pour service_role uniquement
CREATE POLICY "service_role_full_access" ON content_store
  FOR ALL USING (true) WITH CHECK (true);

-- Insérer la ligne par défaut (sera écrasée par le premier save)
INSERT INTO content_store (id, data, updated_at)
VALUES ('associations', '{}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;
