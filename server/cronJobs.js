const cron = require('node-cron');
const logger = require('./logger');
const { analyzeImageUsage, sendEmailReport } = require('./imageMonitoring');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@crazy-chrono.com';
const MONITORING_ENABLED = process.env.IMAGE_MONITORING_ENABLED === 'true';

/**
 * Tâche cron: Analyse hebdomadaire automatique
 * S'exécute tous les lundis à 9h00
 */
function startWeeklyMonitoring() {
  if (!MONITORING_ENABLED) {
    logger.info('[Cron] Monitoring désactivé (IMAGE_MONITORING_ENABLED=false)');
    return;
  }

  // Tous les lundis à 9h00
  cron.schedule('0 9 * * 1', async () => {
    logger.info('[Cron] Démarrage analyse hebdomadaire des images...');
    
    try {
      const analysis = await analyzeImageUsage('botanique', 7);
      
      // Vérifier s'il y a des anomalies
      const hasAnomalies = 
        analysis.anomalies.overused.length > 0 ||
        analysis.anomalies.underused.length > 0 ||
        analysis.anomalies.notUsed.length > 0;
      
      if (hasAnomalies) {
        logger.info('[Cron] Anomalies détectées! Envoi du rapport...');
        await sendEmailReport(analysis, ADMIN_EMAIL);
        logger.info('[Cron] Rapport envoyé à', ADMIN_EMAIL);
      } else {
        logger.info('[Cron] Aucune anomalie détectée. Tout va bien! ✅');
      }
    } catch (error) {
      logger.error('[Cron] Erreur lors de l\'analyse:', error);
    }
  }, {
    timezone: "Europe/Paris"
  });

  logger.info('[Cron] Monitoring hebdomadaire activé (tous les lundis à 9h00)');
}

/**
 * Tâche cron: Analyse quotidienne si anomalies critiques
 * S'exécute tous les jours à 8h00
 */
function startDailyMonitoring() {
  if (!MONITORING_ENABLED) return;

  // Tous les jours à 8h00
  cron.schedule('0 8 * * *', async () => {
    logger.info('[Cron] Vérification quotidienne des anomalies critiques...');
    
    try {
      const analysis = await analyzeImageUsage('botanique', 1); // Dernières 24h
      
      // Anomalies critiques: >50% d'écart ou >50% d'images non utilisées
      const criticalOverused = analysis.anomalies.overused.filter(img => 
        parseInt(img.deviation) > 50
      );
      const criticalUnderused = analysis.anomalies.underused.filter(img => 
        parseInt(img.deviation) > 50
      );
      const highNotUsedRate = (analysis.stats.notUsedImages / analysis.stats.totalImages) > 0.5;
      
      if (criticalOverused.length > 0 || criticalUnderused.length > 0 || highNotUsedRate) {
        logger.info('[Cron] ⚠️ ANOMALIES CRITIQUES détectées! Envoi du rapport urgent...');
        await sendEmailReport(analysis, ADMIN_EMAIL);
        logger.info('[Cron] Rapport urgent envoyé à', ADMIN_EMAIL);
      } else {
        logger.info('[Cron] Pas d\'anomalie critique. ✅');
      }
    } catch (error) {
      logger.error('[Cron] Erreur lors de la vérification:', error);
    }
  }, {
    timezone: "Europe/Paris"
  });

  logger.info('[Cron] Vérification quotidienne activée (tous les jours à 8h00)');
}

module.exports = {
  startWeeklyMonitoring,
  startDailyMonitoring
};
