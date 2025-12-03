# 🖥️ PROCÉDURE DE REPRISE SUR UN AUTRE PC

**DERNIÈRE SESSION :** 3 décembre 2025, 13h03  
**DERNIER COMMIT :** `4b1b6bd` - Session report for Dec 3 Vercel debugging

---

## ⚡ DÉMARRAGE RAPIDE (5 MINUTES)

### 1️⃣ Cloner le repository
```bash
git clone https://github.com/digyproservices-arch/crazy-chrono.git
cd crazy-chrono
```

### 2️⃣ Installer les dépendances
```bash
npm install
```

### 3️⃣ Créer le fichier `.env.local`
```bash
# Windows PowerShell
"REACT_APP_BACKEND_URL=https://crazy-chrono-backend.onrender.com" | Out-File -Encoding utf8 .env.local

# macOS/Linux
echo "REACT_APP_BACKEND_URL=https://crazy-chrono-backend.onrender.com" > .env.local
```

### 4️⃣ Lancer en mode développement
```bash
npm start
```

**Le navigateur devrait s'ouvrir sur `http://localhost:3000`**

---

## 📋 VÉRIFICATIONS RAPIDES

### ✅ Tester que tout fonctionne en local

1. **Ouvre `http://localhost:3000/tournament/setup`**
2. **Tu devrais voir** :
   - La page de login OU
   - La page Battle Royale (si token admin présent)
3. **Vérifie la console** (F12) :
   - Pas d'erreurs JavaScript
   - Logs de chargement des données

### ✅ Vérifier l'état du code

```bash
git status              # Doit être "clean"
git log --oneline -5    # Voir les derniers commits
git branch              # Doit être sur "main"
```

---

## 🎯 PROBLÈME ACTUEL À RÉSOUDRE

**PAGE BLANCHE SUR LA PRODUCTION** : `https://app.crazy-chrono.com/tournament/setup`

### Statut
- ✅ Code local : FONCTIONNE
- ✅ Build local : RÉUSSIT
- ✅ Backend Render : EN LIGNE
- ❌ Production Vercel : PAGE BLANCHE

### Dernière action effectuée
- Suppression de `vercel.json` (commit `494190e`)
- Objectif : Laisser Vercel auto-détecter React
- **⏳ EN ATTENTE DE VÉRIFICATION DU DÉPLOIEMENT**

---

## 🔍 PREMIÈRE CHOSE À FAIRE

### Vérifier le déploiement Vercel

1. **Va sur** : https://vercel.com/verins-projects/crazy-chrono
2. **Onglet "Deployments"**
3. **Cherche le commit `494190e`** (ou plus récent)
4. **Vérifie le statut** :
   - ✅ "Ready" (vert) → Déploiement réussi
   - ⏳ "Building" (orange) → En cours
   - ❌ "Error" (rouge) → Échec

### Si déploiement réussi → Tester la prod

1. **Vide le cache Chrome** :
   - Ctrl + Shift + Delete
   - Coche TOUT
   - Période : "Tout"
   - Clique "Effacer"

2. **Ferme TOUTES les fenêtres Chrome**

3. **Rouvre Chrome**

4. **Va sur** : `https://app.crazy-chrono.com/tournament/setup`

5. **Ouvre la console (F12)** et tape :
   ```javascript
   document.querySelector('script[src*="main"]').src
   ```

6. **Vérifie le hash** :
   - ✅ Nouveau hash (ex: `main.d00815f1.js`) → Déploiement OK
   - ❌ Ancien hash (`main.3604bc58.js`) → Cache CDN bloqué

---

## 📖 DOCUMENTATION COMPLÈTE

**Pour comprendre TOUT le contexte**, lis :
- `SESSION_03_DEC_2025_VERCEL_DEBUG.md` (dans le repository)

Ce fichier contient :
- Historique complet du problème
- Tous les tests effectués
- Toutes les solutions tentées
- Prochaines étapes détaillées

---

## 🔗 LIENS ESSENTIELS

| Service | URL |
|---------|-----|
| **Repository GitHub** | https://github.com/digyproservices-arch/crazy-chrono |
| **Dashboard Vercel** | https://vercel.com/verins-projects/crazy-chrono |
| **Dashboard Render** | https://dashboard.render.com/web/srv-ctbmr6u8ii6s73bhrku0 |
| **App Production** | https://app.crazy-chrono.com |
| **Backend Production** | https://crazy-chrono-backend.onrender.com |

---

## ⚠️ RAPPELS IMPORTANTS

### Git
- **Toujours** faire `git status` avant de commencer à coder
- **Toujours** faire `git pull` avant de faire des modifications
- **Ne jamais** forcer un push (`--force`) sans être sûr

### Vercel
- Le déploiement prend **3-5 minutes** après un push
- Le cache CDN peut prendre **jusqu'à 24h** à se rafraîchir
- Toujours vérifier dans **Deployments** si le build a réussi

### Tests
- **TOUJOURS** tester en local avec `npm start` avant de pousser
- **TOUJOURS** builder en local avec `npm run build` pour vérifier
- **TOUJOURS** vider le cache navigateur avant de tester la prod

---

## 🆘 SI BLOQUÉ

### Problème technique
1. Relis `SESSION_03_DEC_2025_VERCEL_DEBUG.md`
2. Vérifie les logs Vercel
3. Vérifie la console Chrome
4. Teste en local

### Problème Git
```bash
# Voir l'état actuel
git status

# Annuler les modifications locales
git checkout .

# Récupérer la dernière version
git pull origin main

# Voir l'historique
git log --oneline --graph -10
```

---

## ✅ CHECKLIST DE DÉMARRAGE

- [ ] Repository cloné
- [ ] `npm install` effectué
- [ ] `.env.local` créé
- [ ] `npm start` fonctionne en local
- [ ] Page `http://localhost:3000/tournament/setup` accessible
- [ ] Pas d'erreurs dans la console locale
- [ ] Derniers commits visibles avec `git log`
- [ ] Documentation lue (`SESSION_03_DEC_2025_VERCEL_DEBUG.md`)
- [ ] Déploiement Vercel vérifié
- [ ] Production testée (si déploiement OK)

---

**BON COURAGE ! 🚀**

**Prochaine étape :** Vérifier le déploiement Vercel `494190e`
