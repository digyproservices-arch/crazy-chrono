// ==========================================
// WINSTON LOGGER - LOGGING PROFESSIONNEL
// Logs persistants vers Supabase (filesystem Render éphémère)
// ==========================================

const winston = require('winston');
const SupabaseTransport = require('./transports/supabaseTransport');

// Import Supabase client (doit être initialisé avant logger)
let supabaseClient = null;

// Format personnalisé pour logs lisibles
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json() // JSON pour Supabase
);

// Logger principal (sera configuré après init Supabase)
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: customFormat,
  transports: [
    // Console uniquement en développement
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let msg = `${timestamp} [${level.toUpperCase()}] ${message}`;
          if (Object.keys(meta).length > 0 && Object.keys(meta).filter(k => !['level', 'message', 'timestamp'].includes(k)).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
          }
          return msg;
        })
      ),
      silent: process.env.NODE_ENV === 'production'
    })
  ]
});

// Fonction pour initialiser le transport Supabase
logger.initSupabase = (supabase) => {
  if (!supabase) {
    console.warn('[Logger] Supabase client not provided, logs will only go to console');
    return;
  }
  
  supabaseClient = supabase;
  
  // Ajouter le transport Supabase
  logger.add(new SupabaseTransport({ 
    supabase,
    level: 'debug'
  }));
  
  logger.info('[Logger] Supabase transport initialized - logs will be persisted to DB');
};

// Helper methods pour logging événements spécifiques
logger.socket = (event, data) => {
  logger.info(`[SOCKET] ${event}`, { event, ...data });
};

logger.api = (method, path, data) => {
  logger.info(`[API] ${method} ${path}`, { method, path, ...data });
};

logger.training = (action, data) => {
  logger.info(`[TRAINING] ${action}`, { action, ...data });
};

logger.arena = (action, data) => {
  logger.info(`[ARENA] ${action}`, { action, ...data });
};

logger.auth = (action, data) => {
  logger.info(`[AUTH] ${action}`, { action, ...data });
};

module.exports = logger;
