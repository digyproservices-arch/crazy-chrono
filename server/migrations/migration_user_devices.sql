-- ==========================================
-- PHASE 3 — Limite de devices par licence
-- 1 licence = max 2 appareils (école + maison)
-- À exécuter dans Supabase SQL Editor
-- ==========================================

-- 1. Table des appareils connus
CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  browser TEXT,
  os TEXT,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  is_approved BOOLEAN DEFAULT true,
  is_revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  revoked_by TEXT DEFAULT NULL,
  UNIQUE(user_id, device_fingerprint)
);

-- 2. Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_active ON user_devices(user_id) WHERE is_approved = true AND is_revoked = false;

-- 3. Fonction: compter les devices actifs d'un utilisateur
CREATE OR REPLACE FUNCTION count_user_devices(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM user_devices
    WHERE user_id = p_user_id
      AND is_approved = true
      AND is_revoked = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fonction: enregistrer ou mettre à jour un device
-- Retourne: 'ok' si enregistré, 'limit_reached' si max atteint, 'revoked' si device révoqué
CREATE OR REPLACE FUNCTION register_device(
  p_user_id UUID,
  p_fingerprint TEXT,
  p_device_name TEXT DEFAULT NULL,
  p_browser TEXT DEFAULT NULL,
  p_os TEXT DEFAULT NULL,
  p_max_devices INTEGER DEFAULT 2
)
RETURNS TABLE(status TEXT, device_count INTEGER) AS $$
DECLARE
  v_existing RECORD;
  v_count INTEGER;
BEGIN
  -- Vérifier si le device existe déjà pour cet utilisateur
  SELECT * INTO v_existing
  FROM user_devices
  WHERE user_id = p_user_id AND device_fingerprint = p_fingerprint;

  IF v_existing IS NOT NULL THEN
    -- Device connu
    IF v_existing.is_revoked THEN
      -- Device révoqué par un admin/prof → refuser
      status := 'revoked';
      device_count := count_user_devices(p_user_id);
      RETURN NEXT;
      RETURN;
    END IF;
    -- Mettre à jour last_seen
    UPDATE user_devices
    SET last_seen = now(),
        device_name = COALESCE(p_device_name, user_devices.device_name),
        browser = COALESCE(p_browser, user_devices.browser),
        os = COALESCE(p_os, user_devices.os)
    WHERE id = v_existing.id;
    
    status := 'ok';
    device_count := count_user_devices(p_user_id);
    RETURN NEXT;
    RETURN;
  END IF;

  -- Nouveau device: vérifier la limite
  v_count := count_user_devices(p_user_id);
  
  IF v_count >= p_max_devices THEN
    status := 'limit_reached';
    device_count := v_count;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Enregistrer le nouveau device
  INSERT INTO user_devices (user_id, device_fingerprint, device_name, browser, os)
  VALUES (p_user_id, p_fingerprint, p_device_name, p_browser, p_os);

  status := 'ok';
  device_count := v_count + 1;
  RETURN NEXT;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Fonction: révoquer un device (utilisable par enseignant/admin)
CREATE OR REPLACE FUNCTION revoke_device(
  p_device_id UUID,
  p_revoked_by TEXT DEFAULT 'admin'
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE user_devices
  SET is_revoked = true,
      is_approved = false,
      revoked_at = now(),
      revoked_by = p_revoked_by
  WHERE id = p_device_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Fonction: lister les devices d'un utilisateur
CREATE OR REPLACE FUNCTION list_user_devices(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  device_fingerprint TEXT,
  device_name TEXT,
  browser TEXT,
  os TEXT,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  is_approved BOOLEAN,
  is_revoked BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.device_fingerprint, d.device_name, d.browser, d.os,
         d.first_seen, d.last_seen, d.is_approved, d.is_revoked
  FROM user_devices d
  WHERE d.user_id = p_user_id
  ORDER BY d.last_seen DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RLS policies
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

-- Service role a accès complet
CREATE POLICY "service_role_full_access" ON user_devices
  FOR ALL USING (true) WITH CHECK (true);

-- Cleanup: devices non vus depuis 90 jours → auto-revoke
-- (à exécuter via cron ou manuellement)
CREATE OR REPLACE FUNCTION cleanup_stale_devices()
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE user_devices
  SET is_revoked = true, is_approved = false, revoked_at = now(), revoked_by = 'auto_cleanup'
  WHERE is_approved = true
    AND is_revoked = false
    AND last_seen < now() - INTERVAL '90 days';
  
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
