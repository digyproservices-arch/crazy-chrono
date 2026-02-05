// ==========================================
// ADMIN LOGS ENDPOINT - Téléchargement logs Winston depuis Supabase
// Endpoint sécurisé pour télécharger logs backend (persistants en DB)
// ==========================================

const express = require('express');
const router = express.Router();
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

// Récupérer le client Supabase depuis global (initialisé dans server.js)
const getSupabase = () => {
  // Le supabaseAdmin est stocké dans le module parent
  const { createClient } = require('@supabase/supabase-js');
  const supaUrl = process.env.SUPABASE_URL;
  const supaSrv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supaUrl || !supaSrv) {
    throw new Error('Supabase not configured');
  }
  
  return createClient(supaUrl, supaSrv, { auth: { persistSession: false } });
};

// GET /api/admin/logs/latest - Télécharger logs depuis Supabase
router.get('/latest', requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 1; // Nombre de jours (défaut: 1)
    const limit = parseInt(req.query.limit) || 1000; // Limite de lignes (défaut: 1000)
    
    logger.info('[AdminLogs] Log download request', { days, limit, ip: req.ip });
    
    // Calculer la date de début
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Récupérer les logs depuis Supabase
    const supabase = getSupabase();
    const { data: logs, error } = await supabase
      .from('backend_logs')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) {
      logger.error('[AdminLogs] Error fetching logs from Supabase', { error: error.message });
      return res.status(500).json({ 
        ok: false, 
        error: 'Failed to fetch logs',
        message: error.message
      });
    }
    
    if (!logs || logs.length === 0) {
      logger.warn('[AdminLogs] No logs found', { days, startDate: startDate.toISOString() });
      return res.status(404).json({ 
        ok: false, 
        error: 'No logs found',
        message: `No logs found for the last ${days} day(s)`
      });
    }
    
    // Formatter les logs en texte lisible
    const logLines = logs.map(log => {
      const metaStr = Object.keys(log.meta || {}).length > 0 
        ? ` ${JSON.stringify(log.meta)}` 
        : '';
      return `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}${metaStr}`;
    });
    
    const logContent = logLines.join('\n');
    const fileName = `backend-logs-${days}days-${new Date().toISOString().split('T')[0]}.log`;
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(logContent);
    
    logger.info('[AdminLogs] Log file sent successfully', { 
      file: fileName, 
      sizeKB: Math.round(logContent.length / 1024),
      logCount: logs.length
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
