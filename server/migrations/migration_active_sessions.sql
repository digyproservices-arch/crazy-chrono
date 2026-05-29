-- ==========================================
-- PHASE 1 — Session unique obligatoire
-- 1 licence = 1 session active à la fois
-- À exécuter dans Supabase SQL Editor
-- ==========================================

-- 1. Table des sessions actives
CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  device_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  invalidated_at TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON active_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_active_sessions_active ON active_sessions(user_id, is_active) WHERE is_active = true;

-- 2. RLS
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leurs propres sessions
CREATE POLICY "active_sessions_select_own" ON active_sessions
  FOR SELECT USING (user_id = auth.uid());

-- Seul le serveur (service_role) insère/update/supprime
-- → pas de policy INSERT/UPDATE/DELETE pour les users normaux
-- → le backend utilise supabaseAdmin (service_role) qui bypass RLS

-- 3. Fonction pour invalider toutes les sessions précédentes d'un utilisateur
CREATE OR REPLACE FUNCTION invalidate_user_sessions(p_user_id UUID, p_except_token TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE active_sessions
  SET is_active = false, invalidated_at = now()
  WHERE user_id = p_user_id
    AND is_active = true
    AND (p_except_token IS NULL OR session_token != p_except_token);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fonction pour vérifier si une session est toujours active
CREATE OR REPLACE FUNCTION check_session_active(p_token TEXT)
RETURNS TABLE(is_valid BOOLEAN, user_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.is_active AS is_valid,
    s.user_id
  FROM active_sessions s
  WHERE s.session_token = p_token
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Nettoyage automatique : supprimer les sessions inactives > 7 jours
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  DELETE FROM active_sessions
  WHERE is_active = false AND invalidated_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS affected = ROW_COUNT;

  -- Aussi invalider les sessions actives sans activité depuis > 24h
  UPDATE active_sessions
  SET is_active = false, invalidated_at = now()
  WHERE is_active = true AND last_seen < now() - INTERVAL '24 hours';

  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
