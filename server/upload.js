const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('./middleware/auth');

const router = express.Router();

// Stockage en mémoire — les fichiers vont dans Supabase Storage, pas sur le disque
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 Mo max par fichier
});

const BUCKET_NAME = 'game-images';

// Client Supabase pour le storage
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

// Création du bucket si nécessaire (une seule fois)
let bucketReady = false;
async function ensureBucket(supabase) {
  if (bucketReady) return true;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === BUCKET_NAME)) {
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, { public: true });
      if (error && !error.message?.includes('already exists')) {
        console.error('[Upload] Échec création bucket:', error.message);
        return false;
      }
      console.log('[Upload] Bucket "' + BUCKET_NAME + '" créé');
    }
    bucketReady = true;
    return true;
  } catch (err) {
    console.error('[Upload] Vérification bucket échouée:', err.message);
    return false;
  }
}

router.post('/upload-images', requireAdminAuth, upload.array('images', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'Aucun fichier reçu.' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ success: false, message: 'Supabase non configuré. Vérifiez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const ready = await ensureBucket(supabase);
  if (!ready) {
    return res.status(500).json({ success: false, message: 'Impossible de préparer le stockage Supabase.' });
  }

  const uploaded = [];
  const errors = [];

  for (const file of req.files) {
    // Normaliser le nom : minuscules, espaces → tirets
    const safeName = file.originalname.toLowerCase().replace(/\s+/g, '-');
    const storagePath = safeName;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      if (error.message?.includes('already exists') || error.statusCode === '409' || error.error === 'Duplicate') {
        errors.push(`${file.originalname}: existe déjà dans le stockage`);
      } else {
        errors.push(`${file.originalname}: ${error.message}`);
      }
      continue;
    }

    // Récupérer l'URL publique CDN
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    uploaded.push({
      filename: file.originalname,
      path: urlData.publicUrl
    });
    console.log('[Upload] ✅ Image uploadée vers Supabase Storage:', safeName);
  }

  if (uploaded.length === 0 && errors.length > 0) {
    return res.status(400).json({ success: false, message: errors.join('\n') });
  }

  res.json({
    success: true,
    files: uploaded,
    errors: errors.length > 0 ? errors : undefined
  });
});

module.exports = router;
