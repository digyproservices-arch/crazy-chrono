-- ==========================================
-- PHASE 4 — Monitoring anti-fraude
-- Log d'audit + tracking IPs + alertes
-- À exécuter dans Supabase SQL Editor
-- ==========================================

-- 1. Table d'audit des connexions
CREATE TABLE IF NOT EXISTS auth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'login', 'login_failed', 'logout', 'session_kicked', 'device_blocked'
  ip_address TEXT,
  user_agent TEXT,
  device_fingerprint TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON auth_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON auth_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_ip ON auth_audit_log(ip_address);

-- 3. Fonction: compter les IPs uniques d'un user sur les dernières 24h
CREATE OR REPLACE FUNCTION count_unique_ips_24h(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(DISTINCT ip_address)::INTEGER
    FROM auth_audit_log
    WHERE user_id = p_user_id
      AND event_type = 'login'
      AND created_at > now() - INTERVAL '24 hours'
      AND ip_address IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fonction: compter les tentatives de login échouées (rate limiting)
CREATE OR REPLACE FUNCTION count_failed_logins(p_identifier TEXT, p_minutes INTEGER DEFAULT 15)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM auth_audit_log
    WHERE event_type = 'login_failed'
      AND (metadata->>'identifier' = p_identifier OR ip_address = p_identifier)
      AND created_at > now() - (p_minutes || ' minutes')::INTERVAL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Fonction: détecter les comptes suspects (>3 IPs uniques en 24h)
CREATE OR REPLACE FUNCTION detect_suspicious_accounts(p_min_ips INTEGER DEFAULT 3)
RETURNS TABLE(
  user_id UUID,
  unique_ips INTEGER,
  last_login TIMESTAMPTZ,
  ips TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.user_id,
    COUNT(DISTINCT a.ip_address)::INTEGER AS unique_ips,
    MAX(a.created_at) AS last_login,
    ARRAY_AGG(DISTINCT a.ip_address) AS ips
  FROM auth_audit_log a
  WHERE a.event_type = 'login'
    AND a.created_at > now() - INTERVAL '24 hours'
    AND a.ip_address IS NOT NULL
  GROUP BY a.user_id
  HAVING COUNT(DISTINCT a.ip_address) >= p_min_ips
  ORDER BY unique_ips DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS
ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON auth_audit_log
  FOR ALL USING (true) WITH CHECK (true);

-- 7. Cleanup automatique: supprimer les logs > 90 jours
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  DELETE FROM auth_audit_log WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
