const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const IMAGES_DIR = path.join(__dirname, '../public/images/');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, IMAGES_DIR);
  },
  filename: function (req, file, cb) {
    // Refuse si le fichier existe déjà
    const dest = path.join(IMAGES_DIR, file.originalname);
    if (fs.existsSync(dest)) {
      return cb(new Error('Un fichier avec ce nom existe déjà : ' + file.originalname));
    }
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

router.post('/upload-images', upload.array('images', 20), (req, res) => {
  if (!req.files) {
    return res.status(400).json({ success: false, message: 'Aucun fichier reçu.' });
  }
  const files = req.files.map(f => ({ filename: f.originalname, path: 'images/' + f.originalname }));
  res.json({ success: true, files });
});

module.exports = router;
