-- Créer les profils manquants pour les utilisateurs existants
INSERT INTO user_profiles (id, email, role, first_name, last_name)
SELECT 
  au.id,
  au.email,
  'user' as role,
  COALESCE(au.raw_user_meta_data->>'first_name', 'User') as first_name,
  COALESCE(au.raw_user_meta_data->>'last_name', '') as last_name
FROM auth.users au
LEFT JOIN user_profiles up ON au.id = up.id
WHERE up.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Mettre à jour le rôle de verinmarius971@gmail.com en admin
UPDATE user_profiles
SET role = 'admin'
WHERE email = 'verinmarius971@gmail.com';
