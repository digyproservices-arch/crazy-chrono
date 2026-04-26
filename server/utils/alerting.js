/**
 * Alerting — Envoie des notifications Discord/webhook lors d'événements critiques
 * 
 * Variables d'environnement requises:
 * - DISCORD_WEBHOOK_URL : URL du webhook Discord pour les alertes
 * 
 * Anti-spam: chaque type d'alerte a un cooldown (par défaut 5 minutes)
 */

const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes entre alertes du même type
const alertCooldowns = new Map(); // alertType -> lastSentTimestamp

/**
 * Envoie une alerte Discord (si le webhook est configuré et que le cooldown est respecté)
 */
async function sendAlert(alertType, { title, message, severity = 'warning', fields = [], color }) {
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return false;

    // Anti-spam : vérifier le cooldown
    const lastSent = alertCooldowns.get(alertType) || 0;
    if (Date.now() - lastSent < ALERT_COOLDOWN_MS) return false;

    const severityColors = {
      info: 0x3B82F6,     // bleu
      warning: 0xF59E0B,  // jaune
      error: 0xEF4444,    // rouge
      critical: 0xDC2626, // rouge foncé
      success: 0x22C55E,  // vert
    };

    const severityEmojis = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
      success: '✅',
    };

    const embed = {
      title: `${severityEmojis[severity] || '📢'} ${title}`,
      description: message,
      color: color || severityColors[severity] || 0x94A3B8,
      timestamp: new Date().toISOString(),
      footer: { text: 'Crazy Chrono Monitoring' },
    };

    if (fields.length > 0) {
      embed.fields = fields.map(f => ({
        name: f.name,
        value: String(f.value).substring(0, 1024),
        inline: f.inline !== false,
      }));
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Crazy Chrono Monitor',
        embeds: [embed],
      }),
    });

    if (response.ok || response.status === 204) {
      alertCooldowns.set(alertType, Date.now());
      console.log(`[Alert] ✅ Discord alert sent: ${alertType}`);
      return true;
    } else {
      console.warn(`[Alert] Discord webhook failed: ${response.status}`);
      return false;
    }
  } catch (e) {
    console.warn('[Alert] Send error:', e.message);
    return false;
  }
}

// ── Alertes prédéfinies ──────────────────────────────────

async function alertErrorSpike(errorCount, windowMinutes, recentErrors) {
  return sendAlert('error_spike', {
    title: `Pic d'erreurs client`,
    message: `**${errorCount} erreurs** détectées en ${windowMinutes} minutes`,
    severity: errorCount > 20 ? 'critical' : 'error',
    fields: [
      { name: 'Nombre', value: errorCount },
      { name: 'Fenêtre', value: `${windowMinutes} min` },
      { name: 'Exemples', value: recentErrors.slice(0, 3).map(e => `\`${e.event}\`: ${(e.data?.message || '').substring(0, 80)}`).join('\n') || 'N/A' },
    ],
  });
}

async function alertServerError(endpoint, statusCode, error) {
  return sendAlert(`server_error_${endpoint}`, {
    title: `Erreur serveur`,
    message: `**${endpoint}** a retourné ${statusCode}`,
    severity: statusCode >= 500 ? 'error' : 'warning',
    fields: [
      { name: 'Endpoint', value: endpoint },
      { name: 'Status', value: statusCode },
      { name: 'Erreur', value: (error || '').substring(0, 200) },
    ],
  });
}

async function alertPaymentFailed(source, email, error) {
  return sendAlert('payment_failed', {
    title: `Échec paiement`,
    message: `Un paiement **${source}** a échoué`,
    severity: 'critical',
    fields: [
      { name: 'Source', value: source },
      { name: 'Email', value: email || 'N/A' },
      { name: 'Erreur', value: (error || '').substring(0, 200) },
    ],
  });
}

async function alertPlayerMilestone(count) {
  return sendAlert('player_milestone', {
    title: `Record de joueurs en ligne !`,
    message: `**${count} joueurs** connectés simultanément`,
    severity: 'success',
    fields: [
      { name: 'Joueurs', value: count },
    ],
  });
}

async function alertDeployComplete(commit, branch) {
  return sendAlert('deploy', {
    title: `Déploiement réussi`,
    message: `Nouvelle version déployée`,
    severity: 'info',
    fields: [
      { name: 'Commit', value: commit || 'N/A' },
      { name: 'Branche', value: branch || 'main' },
      { name: 'Timestamp', value: new Date().toLocaleString('fr-FR') },
    ],
  });
}

// ── Monitoring events buffer pour alertes automatiques ──

const recentClientErrors = []; // rolling window
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 min
const ERROR_THRESHOLD = 10; // seuil pour déclencher l'alerte
let _peakPlayers = 0;

/**
 * Appelé à chaque événement telemetry reçu côté serveur
 * Déclenche les alertes automatiques si nécessaire
 */
function checkAlertThresholds(events) {
  if (!Array.isArray(events)) return;
  const now = Date.now();

  for (const evt of events) {
    if (evt.event && evt.event.startsWith('error:')) {
      recentClientErrors.push({ ...evt, _receivedAt: now });
    }
  }

  // Nettoyage fenêtre glissante
  while (recentClientErrors.length > 0 && now - recentClientErrors[0]._receivedAt > ERROR_WINDOW_MS) {
    recentClientErrors.shift();
  }

  // Vérifier seuil
  if (recentClientErrors.length >= ERROR_THRESHOLD) {
    alertErrorSpike(recentClientErrors.length, ERROR_WINDOW_MS / 60000, recentClientErrors);
  }
}

function checkPlayerMilestone(onlineCount) {
  if (onlineCount > _peakPlayers && onlineCount >= 10 && onlineCount % 10 === 0) {
    _peakPlayers = onlineCount;
    alertPlayerMilestone(onlineCount);
  }
}

module.exports = {
  sendAlert,
  alertErrorSpike,
  alertServerError,
  alertPaymentFailed,
  alertPlayerMilestone,
  alertDeployComplete,
  checkAlertThresholds,
  checkPlayerMilestone,
};
