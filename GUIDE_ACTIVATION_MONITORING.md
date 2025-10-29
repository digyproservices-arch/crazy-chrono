# 🚀 Guide d'Activation du Monitoring (Pour Débutants)

## ✅ Étape 1 : Créer la table dans Supabase

### Ce que tu vas faire :
Créer une table dans ta base de données pour stocker les images utilisées.

### Comment faire :

1. **Ouvre ton navigateur** et va sur https://supabase.com
2. **Connecte-toi** à ton compte
3. **Sélectionne** ton projet Crazy Chrono
4. Dans le menu de gauche, **clique sur "SQL Editor"** (icône 📊)
5. **Clique sur "New query"** (bouton en haut)
6. **Ouvre le fichier** `server/migrations/create_image_monitoring.sql` dans VS Code
7. **Copie tout le contenu** du fichier (Ctrl+A puis Ctrl+C)
8. **Colle** dans l'éditeur SQL de Supabase (Ctrl+V)
9. **Clique sur "Run"** (ou appuie sur Ctrl+Enter)
10. Tu devrais voir **"Success. No rows returned"** → ✅ C'est bon !

---

## ✅ Étape 2 : Configurer les variables d'environnement

### Ce que tu vas faire :
Créer un fichier `.env` avec tes informations personnelles.

### Comment faire :

1. **Ouvre VS Code**
2. **Va dans le dossier** `server/`
3. **Clique droit** dans l'explorateur de fichiers → **"New File"**
4. **Nomme le fichier** : `.env` (avec le point au début, c'est important !)
5. **Copie-colle** ce contenu dans le fichier :

```env
# Activer le monitoring automatique
IMAGE_MONITORING_ENABLED=true

# Ton email pour recevoir les rapports
ADMIN_EMAIL=ton-email@example.com

# Configuration Supabase
SUPABASE_URL=https://ton-projet.supabase.co
SUPABASE_SERVICE_KEY=ta-service-key-ici
```

6. **Maintenant, remplace les valeurs** :

   **a) Remplace ton email :**
   - Change `ton-email@example.com` par ton vrai email (ex: `jean.dupont@gmail.com`)

   **b) Récupère tes clés Supabase :**
   - Retourne sur https://supabase.com
   - Sélectionne ton projet
   - Clique sur **"Settings"** (icône ⚙️ en bas à gauche)
   - Clique sur **"API"**
   - Tu vas voir deux choses importantes :

   **URL du projet :**
   - Copie l'URL (ex: `https://abcdefgh.supabase.co`)
   - Remplace `https://ton-projet.supabase.co` dans ton fichier `.env`

   **Service Role Key :**
   - ⚠️ **ATTENTION** : Prends la clé **"service_role"** (PAS la "anon")
   - Clique sur le bouton "Reveal" pour voir la clé
   - Copie la clé (elle est très longue, c'est normal)
   - Remplace `ta-service-key-ici` dans ton fichier `.env`

7. **Sauvegarde** le fichier (Ctrl+S)

---

## ✅ Étape 3 : Installer node-cron

### Ce que tu vas faire :
Installer un package qui permet de programmer des tâches automatiques.

### Comment faire :

1. **Ouvre un terminal** dans VS Code :
   - Appuie sur **Ctrl+`** (la touche sous Échap)
   - OU va dans **Menu → Terminal → New Terminal**

2. **Va dans le dossier server** :
   ```bash
   cd server
   ```
   Appuie sur **Entrée**

3. **Installe node-cron** :
   ```bash
   npm install node-cron
   ```
   Appuie sur **Entrée**

4. **Attends** que l'installation se termine (quelques secondes)
5. Tu devrais voir **"added 1 package"** → ✅ C'est bon !

---

## ✅ Étape 4 : Redémarrer le serveur

### Ce que tu vas faire :
Redémarrer ton serveur backend pour activer le monitoring.

### Comment faire :

1. **Si ton serveur tourne déjà** :
   - Dans le terminal, appuie sur **Ctrl+C** pour l'arrêter
   - Attends 2 secondes

2. **Redémarre le serveur** :
   ```bash
   npm start
   ```
   Appuie sur **Entrée**

3. **Vérifie que ça marche** :
   - Tu devrais voir dans le terminal :
   ```
   Backend lancé sur http://localhost:5000
   [Cron] Monitoring hebdomadaire activé (tous les lundis à 9h00)
   [Cron] Vérification quotidienne activée (tous les jours à 8h00)
   ```
   - ✅ Si tu vois ces messages, c'est parfait !

---

## 🎉 C'est terminé !

### Que va-t-il se passer maintenant ?

1. **Automatique** : Chaque fois que quelqu'un joue une manche, les images utilisées sont enregistrées
2. **Tous les lundis à 9h** : Le système analyse les données de la semaine
3. **Si problème détecté** : Tu reçois un email avec un rapport détaillé
4. **Tous les jours à 8h** : Vérification rapide pour les anomalies critiques

### Comment tester que ça marche ?

1. **Lance une partie** de Crazy Chrono
2. **Joue quelques manches**
3. **Vérifie dans Supabase** :
   - Va sur https://supabase.com
   - Sélectionne ton projet
   - Clique sur **"Table Editor"**
   - Sélectionne la table **"image_usage_logs"**
   - Tu devrais voir des lignes avec les images utilisées ! ✅

---

## ❓ Problèmes courants

### "Cannot find module './routes/monitoring'"
→ Assure-toi d'avoir fait `git pull` pour récupérer tous les nouveaux fichiers

### "SUPABASE_URL is not defined"
→ Vérifie que ton fichier `.env` est bien dans le dossier `server/` et qu'il contient les bonnes valeurs

### "node-cron not found"
→ Retourne à l'étape 3 et réinstalle : `cd server && npm install node-cron`

### Aucune donnée dans Supabase
→ Vérifie que `IMAGE_MONITORING_ENABLED=true` dans ton `.env`

---

## 📧 Besoin d'aide ?

Si tu as des questions, n'hésite pas à demander !
