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

/**
 * Tâche cron RGPD: Purge des comptes inactifs > 24 mois
 * S'exécute le 1er de chaque mois à 3h00
 * Conformité Art. 5.1.e RGPD — Limitation de la conservation
 */
function startRgpdPurge() {
  // Le 1er de chaque mois à 3h00
  cron.schedule('0 3 1 * *', async () => {
    logger.info('[Cron][RGPD] Démarrage purge comptes inactifs > 24 mois...');

    try {
      const { createClient } = require('@supabase/supabase-js');
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        logger.warn('[Cron][RGPD] Supabase non configuré, purge annulée');
        return;
      }
      const supabase = createClient(url, key, { auth: { persistSession: false } });

      // Date limite: 24 mois en arrière
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 24);
      const cutoffISO = cutoff.toISOString();

      // 1) Trouver les sessions dont le dernier jeu date de > 24 mois
      const { data: inactiveUsers } = await supabase
        .from('sessions')
        .select('user_id')
        .lt('created_at', cutoffISO);

      if (!inactiveUsers || inactiveUsers.length === 0) {
        logger.info('[Cron][RGPD] Aucun compte inactif > 24 mois. ✅');
        return;
      }

      // Extraire les user_ids uniques
      const allUserIds = [...new Set(inactiveUsers.map(s => s.user_id))];

      // 2) Vérifier lesquels n'ont AUCUNE activité récente (< 24 mois)
      const { data: recentSessions } = await supabase
        .from('sessions')
        .select('user_id')
        .gte('created_at', cutoffISO);
      const activeUserIds = new Set((recentSessions || []).map(s => s.user_id));

      // Utilisateurs sans aucune session récente
      const toPurge = allUserIds.filter(uid => !activeUserIds.has(uid));

      if (toPurge.length === 0) {
        logger.info('[Cron][RGPD] Aucun compte à purger (tous ont une activité récente). ✅');
        return;
      }

      logger.info(`[Cron][RGPD] ${toPurge.length} compte(s) inactif(s) à purger`);

      let purged = 0;
      for (const userId of toPurge) {
        try {
          // Supprimer attempts → sessions → training_results → user_student_mapping → user_profiles
          await supabase.from('attempts').delete().eq('user_id', userId);
          await supabase.from('sessions').delete().eq('user_id', userId);
          await supabase.from('training_results').delete().eq('student_id', userId);
          await supabase.from('user_student_mapping').delete().eq('user_id', userId);
          await supabase.from('user_profiles').delete().eq('id', userId);
          // Supprimer le compte Auth (irréversible)
          await supabase.auth.admin.deleteUser(userId);
          purged++;
        } catch (e) {
          logger.warn(`[Cron][RGPD] Erreur purge userId=${userId}: ${e.message}`);
        }
      }

      logger.info(`[Cron][RGPD] Purge terminée: ${purged}/${toPurge.length} comptes supprimés ✅`);
    } catch (error) {
      logger.error('[Cron][RGPD] Erreur lors de la purge:', error);
    }
  }, {
    timezone: "Europe/Paris"
  });

  logger.info('[Cron][RGPD] Purge automatique activée (1er du mois à 3h00)');
}

module.exports = {
  startWeeklyMonitoring,
  startDailyMonitoring,
  startRgpdPurge
};
