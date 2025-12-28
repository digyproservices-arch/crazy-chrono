-- ==========================================
-- SCHEMA LIAISON AUTH <-> STUDENTS
-- Système professionnel pour la production
-- ==========================================

-- Table de liaison entre comptes Supabase Auth et élèves du tournoi
CREATE TABLE IF NOT EXISTS user_student_mapping (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  linked_by VARCHAR(100), -- Email de l'admin qui a fait le lien
  active BOOLEAN DEFAULT true,
  notes TEXT, -- Notes optionnelles (ex: "Compte de démo Rectorat")
  
  UNIQUE(student_id) -- Un élève ne peut être lié qu'à un seul compte
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_user_student_mapping_student_id ON user_student_mapping(student_id);
CREATE INDEX IF NOT EXISTS idx_user_student_mapping_active ON user_student_mapping(active);

-- Table pour gérer les licences (systeme professionnel)
CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key VARCHAR(100) UNIQUE NOT NULL,
  license_type VARCHAR(50) NOT NULL, -- student | teacher | school | academy
  owner_type VARCHAR(20) NOT NULL, -- user | student | school | class
  owner_id VARCHAR(100) NOT NULL, -- ID de l'owner
  status VARCHAR(20) DEFAULT 'active', -- active | expired | revoked | suspended
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP, -- NULL = illimité
  max_students INT, -- Pour licences school/academy
  features JSON, -- Liste des features activées
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  revoked_at TIMESTAMP,
  revoked_by VARCHAR(100),
  revoke_reason TEXT
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_licenses_owner ON licenses(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);

-- Vue pour vérifier rapidement si un utilisateur a une licence active
CREATE OR REPLACE VIEW user_licenses AS
SELECT 
  u.id as user_id,
  u.email,
  usm.student_id,
  s.first_name,
  s.last_name,
  s.licensed as student_licensed,
  l.id as license_id,
  l.license_key,
  l.license_type,
  l.status as license_status,
  l.valid_until,
  CASE 
    -- Licence valide si :
    -- 1. L'élève a licensed=true dans la table students
    -- 2. OU une licence active existe pour cet user
    -- 3. OU une licence active existe pour cet élève
    WHEN s.licensed = true THEN true
    WHEN l.status = 'active' AND (l.valid_until IS NULL OR l.valid_until > NOW()) THEN true
    ELSE false
  END as has_active_license
FROM auth.users u
LEFT JOIN user_student_mapping usm ON u.id = usm.user_id AND usm.active = true
LEFT JOIN students s ON usm.student_id = s.id
LEFT JOIN licenses l ON 
  (l.owner_type = 'user' AND l.owner_id = u.id::text) OR
  (l.owner_type = 'student' AND l.owner_id = usm.student_id)
WHERE usm.student_id IS NOT NULL;

-- Fonction pour vérifier si un user peut jouer
CREATE OR REPLACE FUNCTION check_user_can_play(p_user_id UUID)
RETURNS TABLE(
  can_play BOOLEAN,
  student_id VARCHAR(50),
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(ul.has_active_license, false) as can_play,
    ul.student_id,
    CASE 
      WHEN ul.has_active_license = true THEN 'Licence active'
      WHEN ul.student_id IS NULL THEN 'Aucun élève lié à ce compte'
      WHEN ul.student_licensed = false THEN 'Licence élève inactive'
      WHEN ul.license_status = 'expired' THEN 'Licence expirée'
      WHEN ul.license_status = 'revoked' THEN 'Licence révoquée'
      ELSE 'Licence inactive'
    END as reason
  FROM user_licenses ul
  WHERE ul.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour lier un compte à un élève (admin seulement)
CREATE OR REPLACE FUNCTION link_user_to_student(
  p_user_email TEXT,
  p_student_id VARCHAR(50),
  p_admin_email TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_student_exists BOOLEAN;
BEGIN
  -- Vérifier que l'élève existe
  SELECT EXISTS(SELECT 1 FROM students WHERE id = p_student_id) INTO v_student_exists;
  IF NOT v_student_exists THEN
    RETURN json_build_object('ok', false, 'error', 'student_not_found');
  END IF;
  
  -- Récupérer l'ID de l'utilisateur
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_user_email;
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'user_not_found');
  END IF;
  
  -- Créer ou mettre à jour le lien
  INSERT INTO user_student_mapping (user_id, student_id, linked_by, active)
  VALUES (v_user_id, p_student_id, p_admin_email, true)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    student_id = p_student_id,
    linked_at = CURRENT_TIMESTAMP,
    linked_by = p_admin_email,
    active = true;
  
  RETURN json_build_object('ok', true, 'user_id', v_user_id, 'student_id', p_student_id);
END;
$$ LANGUAGE plpgsql;

-- Politique de sécurité RLS (Row Level Security)
ALTER TABLE user_student_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leur propre mapping
CREATE POLICY "Users can view their own mapping" ON user_student_mapping
  FOR SELECT
  USING (auth.uid() = user_id);

-- Les admins peuvent tout voir
CREATE POLICY "Admins can view all mappings" ON user_student_mapping
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Les admins peuvent créer/modifier les mappings
CREATE POLICY "Admins can manage mappings" ON user_student_mapping
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Les utilisateurs peuvent voir leurs licences
CREATE POLICY "Users can view their licenses" ON licenses
  FOR SELECT
  USING (
    owner_type = 'user' AND owner_id = auth.uid()::text
  );

-- Les admins peuvent gérer toutes les licences
CREATE POLICY "Admins can manage all licenses" ON licenses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Commit
COMMIT;

-- Message de confirmation
SELECT 'Schéma user_student_mapping créé avec succès !' as message;
