const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const IMAGES_DIR = path.join(__dirname, '../public/images/');

router.get('/list-images', (req, res) => {
  fs.readdir(IMAGES_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Erreur lecture dossier images.' });
    }
    // On ne garde que les fichiers images
    const images = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f)).map(f => 'images/' + f);
    res.json({ success: true, images });
  });
});

module.exports = router;
