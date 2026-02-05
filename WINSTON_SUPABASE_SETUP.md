# 🔧 Winston Logs vers Supabase - Guide Installation

## 📋 Changements Effectués

### 1. Nouveau Transport Winston → Supabase
- ✅ `server/transports/supabaseTransport.js` - Transport custom pour écrire logs en DB
- ✅ `server/logger.js` - Remplacé DailyRotateFile par SupabaseTransport
- ✅ `server/server.js` - Initialisation logger avec Supabase après connexion
- ✅ `server/routes/adminLogs.js` - API lit logs depuis DB au lieu de fichiers

### 2. Schéma Base de Données
- ✅ `server/db/schema_backend_logs.sql` - Table `backend_logs` avec index

---

## 🚀 Étapes d'Installation

### Étape 1: Exécuter le SQL dans Supabase

1. **Va sur Supabase Dashboard:**
   - https://supabase.com/dashboard
   - Sélectionne ton projet Crazy Chrono

2. **Ouvre l'éditeur SQL:**
   - Clique sur "SQL Editor" dans le menu gauche

3. **Copie et exécute le contenu de:**
   ```
   server/db/schema_backend_logs.sql
   ```

4. **Vérifie la création:**
   - Va dans "Table Editor"
   - Vérifie que la table `backend_logs` existe
   - Vérifie les index: `idx_backend_logs_timestamp`, `idx_backend_logs_level`, `idx_backend_logs_meta`

---

### Étape 2: Vérifier Variables Environnement Render

**Les variables suivantes doivent déjà être configurées sur Render:**
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`

**Si manquantes, ajoute-les dans:**
Render Dashboard → crazy-chrono-backend → Environment

---

### Étape 3: Déploiement Automatique

**Render détecte les commits GitHub et redéploie automatiquement.**

Après le push du commit, attends ~3-5 min puis vérifie:
- Dashboard Render → Logs → Chercher `[Logger] Supabase transport initialized`

---

## 🧪 Test

### 1. Attendre que Render termine le déploiement

### 2. Vérifier logs console Render
Chercher cette ligne:
```
[Logger] Supabase transport initialized - logs will be persisted to DB
```

### 3. Générer quelques logs
Effectue des actions dans l'app:
- Connexion
- Créer match Training
- Jouer quelques manches

### 4. Vérifier dans Supabase
- Va dans Table Editor → `backend_logs`
- Vérifie que des lignes apparaissent avec `level`, `message`, `timestamp`

### 5. Télécharger logs depuis Dashboard Admin
1. Va sur `https://app.crazy-chrono.com/admin/dashboard`
2. Section "Monitoring contenus"
3. Clic **"📥 Télécharger Logs Backend (Winston)"**
4. Fichier `.log` téléchargé avec tous les logs

---

## 📊 Structure Table backend_logs

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire (auto-généré) |
| `timestamp` | TIMESTAMPTZ | Date/heure du log (indexé) |
| `level` | VARCHAR(20) | Niveau: info, warn, error, debug |
| `message` | TEXT | Message de log |
| `meta` | JSONB | Métadonnées JSON (indexé GIN) |
| `created_at` | TIMESTAMPTZ | Date création ligne |

---

## 🔍 API Logs

### Télécharger logs récents
```
GET /api/admin/logs/latest?days=1&limit=1000
Authorization: Bearer {token}
```

**Paramètres:**
- `days` (optionnel): Nombre de jours (défaut: 1)
- `limit` (optionnel): Nombre max de lignes (défaut: 1000)

**Réponse:** Fichier texte `.log` avec logs formatés

---

## ✅ Avantages vs Fichiers

| Critère | Fichiers (avant) | Supabase (maintenant) |
|---------|------------------|----------------------|
| **Persistence** | ❌ Effacés au redémarrage | ✅ Permanent |
| **Recherche** | ❌ Grep dans fichiers | ✅ SQL queries |
| **Coût** | ✅ Gratuit | ✅ Gratuit |
| **Performance** | ⚠️ I/O disque | ✅ Async DB writes |
| **Filtrage** | ❌ Manue | ✅ Par niveau, date, meta |

---

## 🐛 Dépannage

### Logs n'apparaissent pas dans Supabase
1. Vérifier console Render: `[Logger] Supabase transport initialized`
2. Vérifier variables env: `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
3. Vérifier table créée: Supabase → Table Editor → `backend_logs`

### Erreur "Failed to fetch logs"
1. Vérifier Row Level Security (RLS) de la table
2. Policy `"Service role only"` doit exister
3. Vérifier token admin dans requête

### Performances lentes
- Index automatiques sur `timestamp`, `level`, `meta` (JSONB GIN)
- Limite par défaut: 1000 logs
- Augmenter limite si nécessaire: `?limit=5000`

---

**Date:** 5 février 2026  
**Commit:** À venir (Winston Supabase transport)  
**Auteur:** Cascade AI
