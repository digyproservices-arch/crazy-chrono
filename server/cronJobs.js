const cron = require('node-cron');
const { analyzeImageUsage, sendEmailReport } = require('./imageMonitoring');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@crazy-chrono.com';
const MONITORING_ENABLED = process.env.IMAGE_MONITORING_ENABLED === 'true';

/**
 * Tâche cron: Analyse hebdomadaire automatique
 * S'exécute tous les lundis à 9h00
 */
function startWeeklyMonitoring() {
  if (!MONITORING_ENABLED) {
    console.log('[Cron] Monitoring désactivé (IMAGE_MONITORING_ENABLED=false)');
    return;
  }

  // Tous les lundis à 9h00
  cron.schedule('0 9 * * 1', async () => {
    console.log('[Cron] Démarrage analyse hebdomadaire des images...');
    
    try {
      const analysis = await analyzeImageUsage('botanique', 7);
      
      // Vérifier s'il y a des anomalies
      const hasAnomalies = 
        analysis.anomalies.overused.length > 0 ||
        analysis.anomalies.underused.length > 0 ||
        analysis.anomalies.notUsed.length > 0;
      
      if (hasAnomalies) {
        console.log('[Cron] Anomalies détectées! Envoi du rapport...');
        await sendEmailReport(analysis, ADMIN_EMAIL);
        console.log('[Cron] Rapport envoyé à', ADMIN_EMAIL);
      } else {
        console.log('[Cron] Aucune anomalie détectée. Tout va bien! ✅');
      }
    } catch (error) {
      console.error('[Cron] Erreur lors de l\'analyse:', error);
    }
  }, {
    timezone: "Europe/Paris"
  });

  console.log('[Cron] Monitoring hebdomadaire activé (tous les lundis à 9h00)');
}

/**
 * Tâche cron: Analyse quotidienne si anomalies critiques
 * S'exécute tous les jours à 8h00
 */
function startDailyMonitoring() {
  if (!MONITORING_ENABLED) return;

  // Tous les jours à 8h00
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Vérification quotidienne des anomalies critiques...');
    
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
        console.log('[Cron] ⚠️ ANOMALIES CRITIQUES détectées! Envoi du rapport urgent...');
        await sendEmailReport(analysis, ADMIN_EMAIL);
        console.log('[Cron] Rapport urgent envoyé à', ADMIN_EMAIL);
      } else {
        console.log('[Cron] Pas d\'anomalie critique. ✅');
      }
    } catch (error) {
      console.error('[Cron] Erreur lors de la vérification:', error);
    }
  }, {
    timezone: "Europe/Paris"
  });

  console.log('[Cron] Vérification quotidienne activée (tous les jours à 8h00)');
}

module.exports = {
  startWeeklyMonitoring,
  startDailyMonitoring
};
