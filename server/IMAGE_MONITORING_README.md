# 📊 Système de Monitoring Automatique des Images

## Vue d'ensemble

Ce système enregistre automatiquement toutes les images utilisées dans chaque manche de jeu et génère des rapports périodiques pour détecter les anomalies de distribution (images sur-utilisées, sous-utilisées ou jamais utilisées).

## Architecture

### 1. Enregistrement automatique
- Chaque fois qu'une manche est jouée, les images utilisées sont enregistrées dans Supabase
- Données collectées: image, session, utilisateur, timestamp, niveau

### 2. Analyse périodique
- **Hebdomadaire** (lundis 9h): Rapport complet si anomalies détectées
- **Quotidienne** (tous les jours 8h): Alerte si anomalies critiques (>50% d'écart)

### 3. Rapports par email
- Rapport HTML formaté avec statistiques et graphiques
- Envoyé automatiquement à l'admin si anomalies détectées

## Configuration

### Variables d'environnement (`.env`)

```env
# Activer le monitoring
IMAGE_MONITORING_ENABLED=true

# Configuration Supabase
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_KEY=votre-service-key

# Email admin pour recevoir les rapports
ADMIN_EMAIL=votre-email@example.com

# Configuration SMTP (optionnel, pour envoi email automatique)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASS=votre-mot-de-passe-app
```

## Installation

### 1. Créer la table Supabase

Exécutez le script SQL dans votre dashboard Supabase:

```bash
# Le fichier se trouve dans:
server/migrations/create_image_monitoring.sql
```

### 2. Installer les dépendances

```bash
cd server
npm install node-cron
```

### 3. Intégrer dans server.js

Ajoutez dans `server/server.js`:

```javascript
// Importer le monitoring
const monitoringRoutes = require('./routes/monitoring');
const { startWeeklyMonitoring, startDailyMonitoring } = require('./cronJobs');

// Ajouter les routes
app.use('/api/monitoring', monitoringRoutes);

// Démarrer les tâches cron
startWeeklyMonitoring();
startDailyMonitoring();
```

### 4. Modifier le frontend pour enregistrer automatiquement

Dans `src/components/Carte.js`, après l'attribution des zones (ligne ~4381):

```javascript
// Enregistrer dans le diagnostic global pour analyse
try { window.ccAddDiag && window.ccAddDiag('zones:assigned', post); } catch {}

// NOUVEAU: Enregistrer dans le monitoring backend
try {
  const sessionId = localStorage.getItem('cc_session_id') || `session_${Date.now()}`;
  const userId = localStorage.getItem('cc_user_id') || null;
  
  fetch(`${getBackendUrl()}/api/monitoring/record-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      userId,
      roundIndex: roundIndex || 0,
      zones: post
    })
  }).catch(err => console.warn('[Monitoring] Erreur enregistrement:', err));
} catch {}
```

## Utilisation

### Analyse manuelle via API

```bash
# Analyser les 7 derniers jours
curl http://localhost:5000/api/monitoring/analyze?theme=botanique&days=7

# Générer et envoyer un rapport
curl -X POST http://localhost:5000/api/monitoring/send-report \
  -H "Content-Type: application/json" \
  -d '{"theme":"botanique","days":7,"email":"admin@example.com"}'
```

### Rapports générés

Les rapports HTML sont sauvegardés dans:
```
server/reports/image-monitoring-{timestamp}.html
```

## Détection d'anomalies

### Seuils

- **Sur-utilisation**: Image utilisée >30% au-dessus de la moyenne
- **Sous-utilisation**: Image utilisée <30% en-dessous de la moyenne
- **Critique**: Écart >50% (alerte quotidienne)

### Exemple de rapport

Le rapport inclut:
- 📈 Statistiques globales (total, moyenne, taux d'utilisation)
- ⚠️ Images sur-utilisées avec écart en %
- ⚠️ Images sous-utilisées avec écart en %
- ℹ️ Images jamais utilisées
- 📊 Distribution complète avec graphiques

## Désactivation

Pour désactiver le monitoring:

```env
IMAGE_MONITORING_ENABLED=false
```

## Avantages

✅ **Automatique**: Pas besoin d'intervention manuelle
✅ **Non-intrusif**: N'affecte pas l'expérience de jeu
✅ **Historique**: Données conservées pour analyse long-terme
✅ **Proactif**: Détection automatique des problèmes
✅ **Multi-utilisateurs**: Analyse globale de toutes les sessions

## Support

Pour toute question ou problème, contactez l'équipe technique.
