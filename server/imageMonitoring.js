// Système de monitoring automatique des images utilisées
const { createClient } = require('@supabase/supabase-js');

// Configuration (à définir via variables d'environnement)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@crazy-chrono.com';
const MONITORING_ENABLED = process.env.IMAGE_MONITORING_ENABLED === 'true';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Enregistre les images utilisées dans une manche
 * Appelé automatiquement après chaque attribution de zones
 */
async function recordImageUsage(sessionId, userId, roundIndex, zones) {
  if (!MONITORING_ENABLED || !supabase) return;

  try {
    const images = zones
      .filter(z => z.type === 'image' && z.content)
      .map(z => ({
        session_id: sessionId,
        user_id: userId,
        round_index: roundIndex,
        image_url: z.content,
        image_filename: z.content.split('/').pop().replace('.jpeg', ''),
        pair_id: z.pairId || null,
        is_main_pair: !!z.pairId,
        timestamp: new Date().toISOString()
      }));

    if (images.length > 0) {
      const { error } = await supabase
        .from('image_usage_logs')
        .insert(images);

      if (error) {
        console.error('[ImageMonitoring] Erreur enregistrement:', error);
      }
    }
  } catch (error) {
    console.error('[ImageMonitoring] Erreur:', error);
  }
}

/**
 * Analyse les données d'utilisation des images
 * Retourne les statistiques et anomalies détectées
 */
async function analyzeImageUsage(themeFilter = 'botanique', daysBack = 7) {
  if (!supabase) {
    throw new Error('Supabase non configuré');
  }

  try {
    // Charger associations.json pour avoir la liste complète des images
    const fs = require('fs');
    const path = require('path');
    const assocPath = path.join(__dirname, '..', 'public', 'data', 'associations.json');
    const assocData = JSON.parse(fs.readFileSync(assocPath, 'utf8'));

    // Filtrer les images par thème
    const themeImages = (assocData.images || [])
      .filter(img => (img.themes || []).includes(themeFilter))
      .map(img => ({
        id: img.id,
        filename: (img.url || '').split('/').pop().replace('.jpeg', ''),
        url: img.url,
        level: img.levelClass || 'Non spécifié',
        themes: img.themes || []
      }));

    // Récupérer les logs des N derniers jours
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const { data: logs, error } = await supabase
      .from('image_usage_logs')
      .select('*')
      .gte('timestamp', cutoffDate.toISOString());

    if (error) throw error;

    // Compter les utilisations par image
    const usageCount = {};
    themeImages.forEach(img => {
      usageCount[img.filename] = {
        ...img,
        count: 0,
        sessions: new Set(),
        users: new Set()
      };
    });

    (logs || []).forEach(log => {
      if (usageCount[log.image_filename]) {
        usageCount[log.image_filename].count++;
        usageCount[log.image_filename].sessions.add(log.session_id);
        usageCount[log.image_filename].users.add(log.user_id);
      }
    });

    // Convertir Sets en nombres
    Object.values(usageCount).forEach(img => {
      img.sessionCount = img.sessions.size;
      img.userCount = img.users.size;
      delete img.sessions;
      delete img.users;
    });

    // Calculer les statistiques
    const sorted = Object.entries(usageCount).sort((a, b) => b[1].count - a[1].count);
    const used = sorted.filter(([_, info]) => info.count > 0);
    const notUsed = sorted.filter(([_, info]) => info.count === 0);

    const totalUsages = used.reduce((sum, [_, info]) => sum + info.count, 0);
    const avgUsage = used.length > 0 ? totalUsages / used.length : 0;
    const maxUsage = used.length > 0 ? Math.max(...used.map(([_, info]) => info.count)) : 0;
    const minUsage = used.length > 0 ? Math.min(...used.map(([_, info]) => info.count)) : 0;

    // Détecter les anomalies (>30% au-dessus/en-dessous de la moyenne)
    const threshold = 0.30;
    const overused = used.filter(([_, info]) => info.count > avgUsage * (1 + threshold));
    const underused = used.filter(([_, info]) => info.count > 0 && info.count < avgUsage * (1 - threshold));

    return {
      period: { daysBack, from: cutoffDate.toISOString(), to: new Date().toISOString() },
      theme: themeFilter,
      stats: {
        totalImages: themeImages.length,
        usedImages: used.length,
        notUsedImages: notUsed.length,
        totalUsages,
        avgUsage: avgUsage.toFixed(2),
        maxUsage,
        minUsage,
        usageRate: ((used.length / themeImages.length) * 100).toFixed(1) + '%'
      },
      anomalies: {
        overused: overused.map(([name, info]) => ({
          name,
          count: info.count,
          deviation: (((info.count - avgUsage) / avgUsage) * 100).toFixed(0) + '%',
          level: info.level
        })),
        underused: underused.map(([name, info]) => ({
          name,
          count: info.count,
          deviation: (((avgUsage - info.count) / avgUsage) * 100).toFixed(0) + '%',
          level: info.level
        })),
        notUsed: notUsed.map(([name, info]) => ({
          name,
          level: info.level
        }))
      },
      distribution: sorted.map(([name, info]) => ({
        name,
        count: info.count,
        level: info.level,
        sessionCount: info.sessionCount,
        userCount: info.userCount
      }))
    };
  } catch (error) {
    console.error('[ImageMonitoring] Erreur analyse:', error);
    throw error;
  }
}

/**
 * Génère un rapport HTML formaté
 */
function generateHtmlReport(analysis) {
  const { stats, anomalies, distribution, period, theme } = analysis;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 20px auto; padding: 20px; background: #f5f5f5; }
    .header { background: #111827; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .stat-card { background: #f9fafb; padding: 15px; border-radius: 6px; border-left: 4px solid #10b981; }
    .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: bold; color: #111827; margin-top: 5px; }
    .alert { padding: 15px; border-radius: 6px; margin-bottom: 15px; }
    .alert-danger { background: #fee2e2; border-left: 4px solid #ef4444; color: #7f1d1d; }
    .alert-warning { background: #fef3c7; border-left: 4px solid #f59e0b; color: #78350f; }
    .alert-info { background: #dbeafe; border-left: 4px solid #3b82f6; color: #1e3a8a; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .bar { display: inline-block; height: 20px; background: #10b981; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Rapport de Monitoring - Images Botaniques</h1>
    <p>Période: ${new Date(period.from).toLocaleDateString('fr-FR')} - ${new Date(period.to).toLocaleDateString('fr-FR')} (${period.daysBack} jours)</p>
    <p>Thème: ${theme}</p>
  </div>

  <div class="section">
    <h2>📈 Statistiques Globales</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Images</div>
        <div class="stat-value">${stats.totalImages}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Images Utilisées</div>
        <div class="stat-value">${stats.usedImages} (${stats.usageRate})</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Utilisations</div>
        <div class="stat-value">${stats.totalUsages}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Moyenne</div>
        <div class="stat-value">${stats.avgUsage}</div>
      </div>
    </div>
  </div>

  ${anomalies.overused.length > 0 ? `
  <div class="section">
    <div class="alert alert-danger">
      <strong>⚠️ ${anomalies.overused.length} image(s) sur-utilisée(s)</strong> (>30% au-dessus de la moyenne)
    </div>
    <table>
      <thead>
        <tr><th>Image</th><th>Utilisations</th><th>Écart</th><th>Niveau</th></tr>
      </thead>
      <tbody>
        ${anomalies.overused.map(img => `
          <tr>
            <td>${img.name}</td>
            <td>${img.count}</td>
            <td style="color: #dc2626;">+${img.deviation}</td>
            <td>${img.level}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${anomalies.underused.length > 0 ? `
  <div class="section">
    <div class="alert alert-warning">
      <strong>⚠️ ${anomalies.underused.length} image(s) sous-utilisée(s)</strong> (<30% en-dessous de la moyenne)
    </div>
    <table>
      <thead>
        <tr><th>Image</th><th>Utilisations</th><th>Écart</th><th>Niveau</th></tr>
      </thead>
      <tbody>
        ${anomalies.underused.map(img => `
          <tr>
            <td>${img.name}</td>
            <td>${img.count}</td>
            <td style="color: #f59e0b;">-${img.deviation}</td>
            <td>${img.level}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${anomalies.notUsed.length > 0 ? `
  <div class="section">
    <div class="alert alert-info">
      <strong>ℹ️ ${anomalies.notUsed.length} image(s) jamais utilisée(s)</strong>
    </div>
    <ul>
      ${anomalies.notUsed.map(img => `<li>${img.name} (${img.level})</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="section">
    <h2>📊 Distribution Complète</h2>
    <table>
      <thead>
        <tr><th>Image</th><th>Utilisations</th><th>Graphique</th><th>Sessions</th><th>Utilisateurs</th><th>Niveau</th></tr>
      </thead>
      <tbody>
        ${distribution.map(img => `
          <tr>
            <td>${img.name}</td>
            <td>${img.count}</td>
            <td><div class="bar" style="width: ${Math.min(img.count * 10, 200)}px;"></div></td>
            <td>${img.sessionCount}</td>
            <td>${img.userCount}</td>
            <td>${img.level}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="section" style="background: #f9fafb; text-align: center; font-size: 12px; color: #6b7280;">
    <p>Rapport généré automatiquement par Crazy Chrono Image Monitoring</p>
    <p>${new Date().toLocaleString('fr-FR')}</p>
  </div>
</body>
</html>
  `;
}

/**
 * Envoie le rapport par email (nécessite configuration SMTP)
 */
async function sendEmailReport(analysis, recipientEmail = ADMIN_EMAIL) {
  // TODO: Implémenter l'envoi d'email via service (SendGrid, Resend, etc.)
  // Pour l'instant, on sauvegarde le rapport en fichier
  const fs = require('fs');
  const path = require('path');
  
  const reportHtml = generateHtmlReport(analysis);
  const reportPath = path.join(__dirname, 'reports', `image-monitoring-${Date.now()}.html`);
  
  // Créer le dossier reports s'il n'existe pas
  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, reportHtml, 'utf8');
  
  console.log(`[ImageMonitoring] Rapport sauvegardé: ${reportPath}`);
  console.log(`[ImageMonitoring] TODO: Envoyer par email à ${recipientEmail}`);
  
  return reportPath;
}

module.exports = {
  recordImageUsage,
  analyzeImageUsage,
  generateHtmlReport,
  sendEmailReport
};
