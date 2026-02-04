// ==========================================
// ADMIN LOGS ENDPOINT - Téléchargement logs Winston
// Endpoint sécurisé pour télécharger logs backend
// ==========================================

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

// Middleware auth admin (simple check - améliorer avec JWT en prod)
const requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  // Pour l'instant, accepter si header présent (améliorer avec vrai JWT)
  if (!authHeader) {
    logger.warn('[AdminLogs] Unauthorized access attempt', { ip: req.ip });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
};

// GET /api/admin/logs/latest - Télécharger le fichier de logs du jour
router.get('/latest', requireAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFileName = `app-${today}.log`;
    const logFilePath = path.join(__dirname, '../../logs', logFileName);
    
    logger.info('[AdminLogs] Log download request', { file: logFileName, ip: req.ip });
    
    // Vérifier si le fichier existe
    try {
      await fs.access(logFilePath);
    } catch (err) {
      logger.warn('[AdminLogs] Log file not found', { file: logFileName });
      return res.status(404).json({ 
        ok: false, 
        error: 'Log file not found',
        message: `No logs for today (${today})`
      });
    }
    
    // Lire et envoyer le fichier
    const logContent = await fs.readFile(logFilePath, 'utf-8');
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${logFileName}"`);
    res.send(logContent);
    
    logger.info('[AdminLogs] Log file sent successfully', { 
      file: logFileName, 
      sizeKB: Math.round(logContent.length / 1024) 
    });
  } catch (err) {
    logger.error('[AdminLogs] Error downloading logs', { error: err.message, stack: err.stack });
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// GET /api/admin/logs/list - Lister les fichiers de logs disponibles
router.get('/list', requireAdmin, async (req, res) => {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    
    // Créer le dossier s'il n'existe pas
    try {
      await fs.access(logsDir);
    } catch {
      await fs.mkdir(logsDir, { recursive: true });
      return res.json({ ok: true, files: [] });
    }
    
    const files = await fs.readdir(logsDir);
    const logFiles = files.filter(f => f.endsWith('.log'));
    
    // Récupérer les infos de chaque fichier
    const fileInfos = await Promise.all(
      logFiles.map(async (fileName) => {
        const filePath = path.join(logsDir, fileName);
        const stats = await fs.stat(filePath);
        return {
          name: fileName,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
    );
    
    // Trier par date de modification (plus récent d'abord)
    fileInfos.sort((a, b) => b.modified - a.modified);
    
    logger.info('[AdminLogs] Log files listed', { count: fileInfos.length });
    res.json({ ok: true, files: fileInfos });
  } catch (err) {
    logger.error('[AdminLogs] Error listing logs', { error: err.message });
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

module.exports = router;
