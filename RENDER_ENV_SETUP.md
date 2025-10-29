# 🚀 Configuration des Variables d'Environnement sur Render

## Étapes à suivre sur Render.com

### 1. Va sur ton dashboard Render
- Ouvre https://dashboard.render.com
- Clique sur ton service **"crazy-chrono-backend"**

### 2. Va dans Environment
- Dans le menu de gauche, clique sur **"Environment"**
- Tu vas voir une liste de variables d'environnement

### 3. Ajoute ces 3 nouvelles variables

Clique sur **"Add Environment Variable"** pour chacune :

#### Variable 1 : IMAGE_MONITORING_ENABLED
- **Key** : `IMAGE_MONITORING_ENABLED`
- **Value** : `true`
- Clique sur **"Save Changes"**

#### Variable 2 : ADMIN_EMAIL
- **Key** : `ADMIN_EMAIL`
- **Value** : `digyproservices@gmail.com` (ou ton email)
- Clique sur **"Save Changes"**

#### Variable 3 : SUPABASE_SERVICE_KEY
- **Key** : `SUPABASE_SERVICE_KEY`
- **Value** : Ta clé service_role de Supabase (celle que tu as copiée)
- Clique sur **"Save Changes"**

### 4. Vérifier SUPABASE_URL
- Vérifie que tu as déjà la variable **"SUPABASE_URL"**
- Si elle n'existe pas, ajoute-la avec ton URL Supabase

### 5. Redéployer
- Render va automatiquement redéployer ton service
- Attends 2-3 minutes que le déploiement se termine
- Le statut devrait passer à "Live" (vert) ✅

---

## ✅ Comment vérifier que ça marche

Une fois le déploiement terminé :
1. Clique sur **"Logs"** dans le menu de gauche
2. Tu devrais voir ces messages :
   ```
   Backend lancé sur http://localhost:5000
   [Cron] Monitoring hebdomadaire activé (tous les lundis à 9h00)
   [Cron] Vérification quotidienne activée (tous les jours à 8h00)
   ```
3. Si tu vois ces messages → ✅ C'est bon !
