-- ==========================================
-- GRANDE SALLE - Encart partenaire (lots sponsorisés)
-- À exécuter dans Supabase SQL Editor
-- ==========================================

ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS partner_name TEXT DEFAULT '';
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS partner_logo_url TEXT DEFAULT '';
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS partner_lot TEXT DEFAULT '';
ALTER TABLE gs_tournaments ADD COLUMN IF NOT EXISTS partner_video_url TEXT DEFAULT '';
