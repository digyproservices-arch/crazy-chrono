// ==========================================
// WINSTON LOGGER - LOGGING PROFESSIONNEL
// Logs automatiques fichiers avec rotation quotidienne
// ==========================================

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Format personnalisé pour logs lisibles
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let msg = `${timestamp} [${level.toUpperCase()}] ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Configuration rotation fichiers
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(__dirname, '../logs/app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m', // Max 20MB par fichier
  maxFiles: '14d', // Garder 14 jours
  format: customFormat,
  level: 'debug'
});

// Logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: customFormat,
  transports: [
    // Logs fichiers avec rotation
    fileRotateTransport,
    // Console (désactivé en production pour performance)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      ),
      silent: process.env.NODE_ENV === 'production'
    })
  ],
  // Gérer les erreurs non catchées
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(__dirname, '../logs/exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d'
    })
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(__dirname, '../logs/rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d'
    })
  ]
});

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
