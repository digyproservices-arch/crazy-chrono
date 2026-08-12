-- ==========================================================================
-- CTO-005A (revue CTO §A/§B) — 1100 — consommation atomique d'une invitation
--
-- Problème : appliquer un rôle privilégié demandait trois opérations distinctes
-- (lecture de l'invitation, écriture du rôle, marquage `used`). Deux échecs
-- possibles :
--   * l'écriture du rôle réussit et le marquage échoue → le même token reste
--     rejouable indéfiniment ;
--   * deux requêtes concurrentes lisent la même invitation `used = false` et
--     l'appliquent deux fois.
--
-- Après : une seule primitive transactionnelle, réservée au service role, qui
-- verrouille la ligne (`FOR UPDATE`), vérifie le destinataire, l'expiration et
-- le rôle, écrit le profil puis marque `used` — ou ne fait rien du tout.
--
-- La fonction ne fait jamais confiance au navigateur : `p_user_id` et `p_email`
-- doivent provenir d'un JWT vérifié côté backend.
-- ==========================================================================

-- Colonnes attendues par la primitive : présentes en production (le backend les
-- écrit déjà), ajoutées ici de façon idempotente pour les bases historiques.
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS circonscription_id TEXT;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.consume_invitation(
  p_token   TEXT,
  p_user_id UUID,
  p_email   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv   public.invitations;
  v_email TEXT := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' OR p_user_id IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('status', 'invalid_request');
  END IF;

  -- Le verrou de ligne sérialise deux consommations concurrentes du même token :
  -- la seconde ne reprend qu'après COMMIT de la première et voit `used = true`.
  SELECT * INTO v_inv
    FROM public.invitations
   WHERE token = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF COALESCE(v_inv.used, false) THEN
    RETURN jsonb_build_object('status', 'already_used');
  END IF;
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;
  IF lower(btrim(COALESCE(v_inv.email, ''))) IS DISTINCT FROM v_email THEN
    RETURN jsonb_build_object('status', 'email_mismatch');
  END IF;
  IF v_inv.role IS NULL
     OR v_inv.role NOT IN ('admin', 'editor', 'user', 'teacher', 'cpd', 'cpc', 'rectorat') THEN
    RETURN jsonb_build_object('status', 'invalid_role');
  END IF;

  INSERT INTO public.user_profiles AS up (id, role, region, circonscription_id)
  VALUES (p_user_id, v_inv.role, v_inv.region, v_inv.circonscription_id)
  ON CONFLICT (id) DO UPDATE
     SET role              = EXCLUDED.role,
         region            = COALESCE(EXCLUDED.region, up.region),
         circonscription_id = COALESCE(EXCLUDED.circonscription_id, up.circonscription_id);

  UPDATE public.invitations
     SET used = true,
         used_at = now()
   WHERE token = p_token;

  RETURN jsonb_build_object(
    'status', 'ok',
    'role', v_inv.role,
    'region', v_inv.region,
    'circonscription_id', v_inv.circonscription_id
  );
END;
$$;

COMMENT ON FUNCTION public.consume_invitation(TEXT, UUID, TEXT) IS
  'CTO-005A : applique un rôle d''invitation et marque le token consommé dans la même transaction. Service role uniquement ; p_user_id/p_email doivent venir d''un JWT vérifié.';

REVOKE ALL ON FUNCTION public.consume_invitation(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_invitation(TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.consume_invitation(TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_invitation(TEXT, UUID, TEXT) TO service_role;
