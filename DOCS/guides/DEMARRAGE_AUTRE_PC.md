# 🚀 DÉMARRAGE SUR AUTRE PC - 3 COMMANDES

**Date :** 9 décembre 2025  
**Temps total :** 5 minutes

---

## ✅ ÉTAPE 1 : CLONER LE PROJET (2 minutes)

```bash
git clone https://github.com/digyproservices-arch/crazy-chrono.git
cd crazy-chrono
```

---

## ✅ ÉTAPE 2 : SETUP AUTOMATIQUE (2 minutes)

```bash
npm run setup-new-pc
```

**Le script va te demander :**

1. **SUPABASE_URL** → Ton URL Supabase (ex: https://xxxxx.supabase.co)
2. **SUPABASE_SERVICE_ROLE_KEY** → Ta clé secrète Supabase

**Puis automatiquement :**
- ✅ Créer le fichier `server/.env`
- ✅ Installer les dépendances frontend (npm install)
- ✅ Installer les dépendances backend (cd server && npm install)

---

## ✅ ÉTAPE 3 : DÉMARRER (1 minute)

**Terminal 1 - Backend :**
```bash
cd server
node server.js
```

**Terminal 2 - Frontend :**
```bash
npm start
```

**✅ Ouvre automatiquement http://localhost:3000**

---

## 🎯 RÉCUPÉRER TES CLÉS SUPABASE

**Si tu ne les as pas :**

1. Va sur : https://supabase.com/dashboard
2. Sélectionne ton projet **Crazy Chrono**
3. Menu → **Settings** → **API**
4. Copie :
   - **Project URL** → C'est ton `SUPABASE_URL`
   - **service_role key** (secret) → C'est ton `SUPABASE_SERVICE_ROLE_KEY`

---

## 🧪 TESTER L'API (Optionnel - 2 minutes)

**Connecte-toi avec :** `crazy.chrono.contact@gmail.com`

**Console (F12) :**
```javascript
fetch('http://localhost:4000/api/auth/me', {
  headers: {
    'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem('cc_auth')).token
  }
})
.then(r => r.json())
.then(d => console.log('✅ Student ID:', d.student?.id)); // Doit afficher "s001"
```

---

## 🎮 TESTER CRAZY ARENA (10 minutes)

### **1. Enseignant crée le match**

- Connecte-toi : `verinmarius971@gmail.com`
- Va sur : `/tournament/setup`
- Crée un groupe (s001, s002, s003, s004)
- Lance le match → Note le code

### **2. 4 élèves rejoignent**

**Ouvre 4 navigateurs/onglets :**

1. `crazy.chrono.contact@gmail.com` → `/crazy-arena/lobby/CODE`
2. `digyproservices@gmail.com` → `/crazy-arena/lobby/CODE`
3. `rulingplace@gmail.com` → `/crazy-arena/lobby/CODE`
4. `designisland97@gmail.com` → `/crazy-arena/lobby/CODE`

**Résultat attendu :**
- ✅ 4/4 joueurs
- ✅ Countdown 3...2...1...
- ✅ Jeu démarre automatiquement

---

## 🆘 EN CAS DE PROBLÈME

### **Erreur : "Cannot find module..."**

```bash
# Réinstaller les dépendances
npm install
cd server && npm install
```

### **Erreur : "SUPABASE_URL is not defined"**

```bash
# Re-lancer le setup
npm run setup-new-pc
```

### **Erreur : "Port 4000 already in use"**

```bash
# Changer le port dans server/.env
PORT=4001
```

---

## 📄 DOCUMENTS UTILES

**Pour plus de détails, ouvre :**
- `SESSION_09_DEC_2025_REPRISE.md` (documentation complète)
- `COMPTES_REELS_DEMO.md` (liste des comptes)

---

## ✅ C'EST TOUT !

**3 commandes et c'est parti :**

```bash
# 1. Clone
git clone https://github.com/digyproservices-arch/crazy-chrono.git && cd crazy-chrono

# 2. Setup automatique
npm run setup-new-pc

# 3. Démarre (2 terminaux)
cd server && node server.js    # Terminal 1
npm start                        # Terminal 2
```

**🎉 Le système de licences fonctionne automatiquement !**

**Plus besoin de localStorage - tout est dans la BDD ! 🚀**

---

**Dernière mise à jour :** 9 décembre 2025, 7h50
