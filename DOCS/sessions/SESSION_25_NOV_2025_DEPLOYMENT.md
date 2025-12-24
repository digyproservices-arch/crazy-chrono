# 🚀 Session du 25 Novembre 2025 - Déploiement Battle Royale

## 📋 Résumé de la session

**Objectif initial :** Configurer Supabase et lancer l'application pour tester le mode Battle Royale

**Résultat final :** Application déployée en production avec backend Render + frontend Vercel

---

## ✅ Ce qui a été fait

### 1. Configuration Supabase (BDD Production)

#### **Schéma SQL installé**
- Fichier : `server/db/schema_tournament.sql`
- Base de données : Supabase (Production)
- Tables créées :
  - `tournaments` : Tournois
  - `tournament_phases` : Phases de tournoi (4 phases)
  - `schools` : Écoles participantes
  - `classes` : Classes des écoles
  - `students` : 14 élèves de test
  - `student_stats` : Statistiques des élèves
  - `tournament_groups` : Groupes de 4 joueurs
  - `tournament_matches` : Matchs Battle Royale
  - `match_results` : Résultats des matchs
  - `tournament_brackets` : Brackets de tournoi
  - `tournament_notifications` : Notifications

#### **Données de test (seed) installées**
- Fichier : `server/db/seed_tournament.sql`
- **Tournoi** : "Tournoi Crazy Chrono 2025 - Guadeloupe"
- **Écoles** : 5 écoles (École Lamentin, École Basse-Terre, etc.)
- **Classes** : 5 classes (CE1_A_LAMENTIN, CE2_B_BASSE_TERRE, etc.)
- **Élèves** : 14 élèves de test (Alice B., Bob C., Chloé D., etc.)
- **Groupes** : 3 groupes créés
- **Matchs** : 3 matchs de test

---

### 2. Configuration Backend (Render)

#### **Variables d'environnement configurées**
Location : Render Dashboard → crazy-chrono-backend → Environment

| Variable | Valeur | Description |
|----------|--------|-------------|
| `SUPABASE_URL` | `https://[projet-id].supabase.co` | URL de la base Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (secret) | Clé admin Supabase |
| `FRONTEND_URL` | `https://app.crazy-chrono.com` | URL du frontend Vercel |
| `NODE_ENV` | `production` | Environnement de production |

#### **Fichiers de configuration créés**
- `render.yaml` : Configuration de déploiement automatique Render
- `RENDER_DEPLOYMENT_GUIDE.md` : Guide de déploiement Render

#### **Backend déployé**
- URL : `https://crazy-chrono-backend.onrender.com`
- Status : ✅ Opérationnel
- Routes API actives :
  - `/api/tournament/tournaments/:id`
  - `/api/tournament/students`
  - `/api/tournament/classes/:classId/students`
  - `/api/tournament/groups`
  - `/api/tournament/matches`

---

### 3. Configuration Frontend (Vercel)

#### **Variables d'environnement configurées**
Location : Vercel Dashboard → crazy-chrono → Settings → Environment Variables

| Variable | Valeur | Environnements |
|----------|--------|----------------|
| `REACT_APP_BACKEND_URL` | `https://crazy-chrono-backend.onrender.com` | Production, Preview, Development |

#### **Frontend déployé**
- URL : `https://app.crazy-chrono.com`
- Status : ✅ En cours de déploiement (dernier push à 15:04)

---

### 4. Corrections de code

#### **Fichier modifié : `server/server.js`**
```javascript
// Lignes 85-87 ajoutées
const tournamentRoutes = require('./routes/tournament');
app.use('/api/tournament', tournamentRoutes);
```

**Raison :** Les routes API tournament n'étaient pas montées sur le serveur

---

#### **Fichier modifié : `src/components/Tournament/BattleRoyaleSetup.js`**

**Changements effectués :**

1. Ajout de la fonction `getBackendUrl()` :
```javascript
const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};
```

2. Correction des appels API (lignes 36, 45, 50, 90, 124, 170) :
```javascript
// AVANT
const res = await fetch('/api/tournament/students');

// APRÈS
const backendUrl = getBackendUrl();
const res = await fetch(`${backendUrl}/api/tournament/students`);
```

**Raison :** En production, frontend (Vercel) et backend (Render) sont sur des domaines différents. Les URLs relatives `/api/...` ne fonctionnent pas.

---

### 5. Commits Git effectués

```bash
# Commit 1 : Ajout des routes tournament
git commit -m "fix: Add tournament API routes to server"
# SHA : 77b6ae0

# Commit 2 : Configuration Render
git commit -m "feat: Add Render deployment configuration"
# SHA : 08e336f

# Commit 3 : Trigger redéploiement
git commit --allow-empty -m "chore: trigger Vercel redeploy for Battle Royale components"
# SHA : 01707fd

# Commit 4 : Correction URLs backend
git commit -m "fix: Use backend URL for Battle Royale API calls"
# SHA : 28ed763

# Commit 5 : Trigger avec variable d'environnement
git commit --allow-empty -m "chore: trigger Vercel redeploy with REACT_APP_BACKEND_URL"
# SHA : 8bf0517
```

---

## 🔍 Diagnostic des problèmes rencontrés

### Problème 1 : PowerShell bloquait npm
**Erreur :** `l'exécution de scripts est désactivée sur ce système`

**Solution :**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### Problème 2 : Dépendances manquantes
**Erreur :** `Cannot find module 'cors'`

**Solution :**
```bash
cd server
npm install
```

---

### Problème 3 : Routes API tournament manquantes
**Symptôme :** Liste d'élèves ne s'affiche pas

**Cause :** `server/server.js` n'importait pas les routes tournament

**Solution :** Ajout de :
```javascript
const tournamentRoutes = require('./routes/tournament');
app.use('/api/tournament', tournamentRoutes);
```

---

### Problème 4 : Frontend et Backend sur domaines séparés
**Symptôme :** Appels API échouent en production

**Cause :** Les appels `fetch('/api/tournament/...')` utilisent des URLs relatives qui fonctionnent en développement mais pas en production

**Solution :** 
1. Créer la fonction `getBackendUrl()` dans chaque composant
2. Remplacer tous les appels relatifs par des URLs complètes
3. Configurer `REACT_APP_BACKEND_URL` sur Vercel

---

## 📁 Architecture de déploiement

```
┌─────────────────────────────────────────────┐
│          PRODUCTION ARCHITECTURE            │
└─────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│              │         │              │         │              │
│   Vercel     │◄────────┤  Utilisateur │────────►│   Render     │
│  (Frontend)  │         │   Navigateur │         │  (Backend)   │
│              │         │              │         │              │
└──────────────┘         └──────────────┘         └──────────────┘
       │                                                  │
       │                                                  │
       │                                                  ▼
       │                                          ┌──────────────┐
       │                                          │              │
       │                                          │  Supabase    │
       │                                          │  (Database)  │
       │                                          │              │
       │                                          └──────────────┘
       │                                                  ▲
       └──────────────────────────────────────────────────┘
                    (Requêtes API)

URLs:
- Frontend : https://app.crazy-chrono.com
- Backend  : https://crazy-chrono-backend.onrender.com
- Database : https://[projet-id].supabase.co
```

---

## 🎯 État actuel du projet

### ✅ Fonctionnel
- ✅ Base de données Supabase configurée avec 14 élèves
- ✅ Backend Render opérationnel avec routes tournament
- ✅ Frontend Vercel déployé avec correction des URLs
- ✅ Variables d'environnement configurées partout

### ⏳ En attente de vérification
- ⏳ Liste des 14 élèves doit s'afficher sur https://app.crazy-chrono.com/
- ⏳ Dernier déploiement Vercel en cours (commit 8bf0517)

### ❌ À tester
- [ ] Chargement de la liste des élèves
- [ ] Création d'un groupe de 4
- [ ] Lancement d'un match Battle Royale
- [ ] Lobby de 4 joueurs avec Socket.IO
- [ ] Interface de jeu avec carte interactive
- [ ] Scores en temps réel
- [ ] Podium final

---

## 📝 Prochaines étapes

### Vérification immédiate (dans 2-3 minutes)

1. **Attendre le déploiement Vercel**
   - Vercel Dashboard → Deployments
   - Attendre que le status passe à "Ready"

2. **Tester l'affichage de la liste**
   - Aller sur https://app.crazy-chrono.com/
   - Se connecter
   - Sélectionner "Jouer en mode tournois"
   - Configurer : Classe CE1, 3 manches, 60s
   - Cliquer "Démarrer"
   - **Vérifier que les 14 élèves s'affichent**

---

### Tests Battle Royale complets

#### **Test 1 : Création de groupe**
1. Sélectionner 4 élèves parmi les 14
2. Donner un nom au groupe (ex: "Les Champions")
3. Cliquer "Créer le groupe"
4. Vérifier que le groupe apparaît en bas

#### **Test 2 : Lancement d'un match**
1. Cliquer sur "🚀 Lancer le match" d'un groupe
2. Noter le code de salle généré
3. Ouvrir 4 onglets/navigateurs
4. Rejoindre avec le code dans chaque onglet
5. Vérifier que les 4 joueurs apparaissent dans le lobby

#### **Test 3 : Partie en temps réel**
1. Marquer tous les joueurs comme "Prêt"
2. Attendre le compte à rebours
3. Jeu démarre automatiquement
4. Cliquer sur des zones pour marquer des paires
5. Vérifier que les scores s'incrémentent en temps réel
6. Attendre la fin du temps
7. Vérifier le podium final avec classement

---

### Développement à continuer (TODO list actuelle)

```
✅ JOUR 1-2: Backend tournoi + Mode Battle Royale (PUSHÉ)
✅ Socket.IO temps réel + Lobby 4 joueurs + HUD scores (PUSHÉ)

⏳ EN COURS:
- Tests du mode Battle Royale en production
- Vérification de tous les flux

🔜 À VENIR:
[ ] JOUR 3-4: Dashboard organisateur + Brackets visuels
[ ] JOUR 5-6: Système progression automatique + Notifications
[ ] JOUR 7-8: Interface élève + Profils + Tests
[ ] JOUR 9: Polish final + Animations + Guide utilisateur
[ ] JOUR 10: Préparation démo Rectorat + Peuplement data
```

---

## 🔧 Commandes utiles

### Développement local

```bash
# Démarrer le backend
cd server
npm start

# Démarrer le frontend
npm start

# Backend écoute sur : http://localhost:4000
# Frontend écoute sur : http://localhost:3000
```

---

### Déploiement

```bash
# Commit et push pour déclencher déploiement automatique
git add .
git commit -m "feat: description des changements"
git push origin main

# Vercel et Render déploient automatiquement après le push
```

---

### Vérification des logs

**Backend Render :**
- Dashboard Render → crazy-chrono-backend → Logs
- Chercher les erreurs de connexion Supabase ou routes

**Frontend Vercel :**
- Dashboard Vercel → Deployments → Cliquer sur le déploiement → Functions
- Vérifier les erreurs de build

**Console navigateur :**
- F12 → Console
- Chercher les erreurs de fetch ou Socket.IO

---

## 📚 Fichiers importants

### Configuration
- `server/.env` : Variables d'environnement backend (LOCAL, gitignored)
- `render.yaml` : Configuration Render (auto-deploy)
- `.gitignore` : Fichiers exclus de Git

### Documentation
- `TOURNOI_SPECIFICATIONS.md` : Spécifications complètes du système tournoi
- `BATTLE_ROYALE_IMPLEMENTATION.md` : Guide d'implémentation Battle Royale
- `RENDER_DEPLOYMENT_GUIDE.md` : Guide de déploiement Render
- `SESSION_25_NOV_2025_DEPLOYMENT.md` : Ce fichier (récap session)

### Code Battle Royale
- `server/routes/tournament.js` : Routes API tournament
- `server/battleRoyaleManager.js` : Gestion matches temps réel Socket.IO
- `src/components/Tournament/BattleRoyaleSetup.js` : Interface création groupes
- `src/components/Tournament/BattleRoyaleLobby.js` : Lobby d'attente 4 joueurs
- `src/components/Tournament/BattleRoyaleGame.js` : Interface de jeu

### Base de données
- `server/db/schema_tournament.sql` : Schéma SQL complet
- `server/db/seed_tournament.sql` : Données de test (14 élèves)

---

## 🔐 Sécurité

**IMPORTANT - Ne JAMAIS partager dans le chat :**
- ❌ `SUPABASE_SERVICE_ROLE_KEY`
- ❌ `STRIPE_SECRET_KEY`
- ❌ `SUPABASE_URL` (OK en production, mais éviter)

**Ces clés sont configurées uniquement sur :**
- ✅ Render Dashboard (Environment Variables)
- ✅ Vercel Dashboard (Environment Variables)
- ✅ Fichier local `server/.env` (gitignored)

---

## 🎓 Rappel workflow Git

```bash
# 1. Vérifier les modifications
git status

# 2. Ajouter les fichiers modifiés
git add fichier.js
# ou pour tout ajouter :
git add .

# 3. Commit avec message descriptif
git commit -m "fix: correction du bug XYZ"

# 4. Push vers GitHub (déclenche auto-deploy)
git push origin main

# 5. Vérifier sur les dashboards
# - Vercel : https://vercel.com/dashboard
# - Render : https://dashboard.render.com
```

---

## 📞 Support et debugging

### Problème : Liste ne s'affiche pas

**Checklist de diagnostic :**

1. **Vercel Dashboard → Deployments**
   - Le dernier déploiement est-il "Ready" ?
   - Temps estimé : 2-3 minutes

2. **Console navigateur (F12)**
   - Y a-t-il des erreurs fetch ?
   - URL appelée : doit être `https://crazy-chrono-backend.onrender.com/api/tournament/...`

3. **Vercel Environment Variables**
   - `REACT_APP_BACKEND_URL` est-elle bien configurée ?

4. **Render Logs**
   - Le backend répond-il aux requêtes ?
   - Chercher : `GET /api/tournament/students`

5. **Supabase Table Editor**
   - La table `students` contient-elle bien 14 lignes ?

---

### Problème : Erreur CORS

**Symptôme :** 
```
Access to fetch at 'https://crazy-chrono-backend.onrender.com/...' 
from origin 'https://app.crazy-chrono.com' has been blocked by CORS
```

**Solution :** Vérifier dans `server/server.js` :
```javascript
app.use(cors()); // Ligne 77
```

Si problème persiste, remplacer par :
```javascript
app.use(cors({
  origin: ['https://app.crazy-chrono.com', 'http://localhost:3000'],
  credentials: true
}));
```

---

### Problème : Socket.IO ne connecte pas

**Symptôme :** Lobby reste bloqué, joueurs ne se voient pas

**Checklist :**

1. **Console navigateur**
   - Chercher : `socket connected` ou erreurs Socket.IO

2. **Code dans BattleRoyaleLobby.js**
   - Vérifier que `getBackendUrl()` retourne la bonne URL

3. **Render Logs**
   - Chercher : `[BattleRoyale] Player joined`

4. **Backend : `server.js`**
   - Socket.IO bien initialisé (lignes 14-16) :
   ```javascript
   const io = new Server(server, {
     cors: { origin: '*', methods: ['GET', 'POST'] }
   });
   ```

---

## ✅ Validation finale de la session

### Ce qui fonctionne à 100%
- ✅ Base de données Supabase avec 14 élèves
- ✅ Backend Render déployé et opérationnel
- ✅ Routes API `/api/tournament/*` actives
- ✅ Variables d'environnement configurées
- ✅ Code frontend corrigé pour URLs backend

### Ce qui doit être validé après déploiement
- ⏳ Affichage de la liste des 14 élèves
- ⏳ Création de groupes
- ⏳ Lancement de matchs
- ⏳ Lobby Socket.IO
- ⏳ Jeu en temps réel

---

## 📅 Prochaine session

**Objectifs suggérés :**

1. **Valider le Battle Royale de bout en bout**
   - Créer un groupe
   - Lancer un match
   - Tester avec 4 joueurs simultanés

2. **Commencer JOUR 3-4 : Dashboard organisateur**
   - Interface de gestion des tournois
   - Visualisation des brackets
   - Suivi des matches en cours

3. **Optimisations éventuelles**
   - Améliorer le design du lobby
   - Ajouter des animations
   - Gestion des déconnexions

---

## 🎉 Conclusion de la session

**Durée totale :** ~4h30

**Problèmes résolus :** 4 majeurs
- Configuration Supabase
- Routes API manquantes
- URLs relatives vs absolues
- Configuration Render + Vercel

**Commits effectués :** 5

**Fichiers créés :** 3
- `render.yaml`
- `RENDER_DEPLOYMENT_GUIDE.md`
- `SESSION_25_NOV_2025_DEPLOYMENT.md`

**Fichiers modifiés :** 2
- `server/server.js`
- `src/components/Tournament/BattleRoyaleSetup.js`

**État du projet :** 
- Backend : ✅ Opérationnel
- Frontend : ⏳ Déploiement en cours (ETA 2-3 min)
- Base de données : ✅ Configurée avec données de test

---

**🚀 Le système Battle Royale est prêt pour les tests en production !**

*Document créé le 25 novembre 2025 à 15:05*
*Dernière modification : 25 novembre 2025 à 15:05*
