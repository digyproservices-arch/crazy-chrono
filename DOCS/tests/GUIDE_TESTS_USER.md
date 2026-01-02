# 👤 GUIDE TESTS UTILISATEUR - MODE ENTRAÎNEMENT

**Date:** 2 janvier 2026  
**Version:** Commit `33fef6a` + Routes API Rectorat

---

## 🎯 OBJECTIF

Tester le **Mode Entraînement** complet avec **4 comptes élèves réels**.

---

## 📋 PRÉREQUIS

### **Comptes requis:**
- ✅ 1 compte **Professeur** (classe créée)
- ✅ 4 comptes **Élèves** avec **licences actives**

### **Vérifications BDD:**
```sql
-- Vérifier tables training créées
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('training_sessions', 'training_results', 'student_training_stats');

-- Vérifier licences élèves
SELECT id, full_name, licensed FROM students 
WHERE class_id = 'YOUR_CLASS_ID';
```

### **Backend/Frontend:**
- ✅ Backend déployé: `https://crazy-chrono-backend.onrender.com`
- ✅ Frontend déployé: `https://app.crazy-chrono.com`

---

## 🧪 TEST 1: CRÉATION SESSION (Professeur)

### **Étape 1.1: Sélection Mode**
1. Connexion: `https://app.crazy-chrono.com/login`
2. Email: `prof@example.com` / Mot de passe
3. Aller sur: `https://app.crazy-chrono.com/teacher`

**✅ Attendu:**
- 2 cartes affichées:
  - 📚 **ENTRAÎNEMENT CLASSE**
  - 🏆 **TOURNOI OFFICIEL**

**📸 Screenshot requis:** Écran sélecteur 2 modes

---

### **Étape 1.2: Sélection Élèves**
1. Cliquer **ENTRAÎNEMENT CLASSE**
2. URL: `/teacher/training/create`
3. Voir liste élèves

**✅ Attendu:**
- Élèves avec licence: ✅ fond vert, sélectionnables
- Élèves sans licence: ❌ grisés, non sélectionnables
- Compteur: "0 élève(s) sélectionné(s)"

4. Sélectionner **4 élèves** (avec licence)

**✅ Attendu:**
- Compteur: "4 élèves sélectionnés → 1 groupe de 4"
- Cartes élèves avec badge ✓ bleu

**📸 Screenshot requis:** 4 élèves sélectionnés

---

### **Étape 1.3: Configuration Session**
1. Remplir formulaire:
   - **Nom session:** "Test CE1-A 2025"
   - **Manches:** 3
   - **Durée par manche:** 60s
   - **Niveau:** CE1

2. Cliquer **CRÉER GROUPES DE 4**

**✅ Attendu:**
- Redirection: `/teacher/training/lobby`
- Groupe 1 visible avec 4 élèves

**📸 Screenshot requis:** Page lobby avec groupe créé

---

## 🧪 TEST 2: LOBBY ENTRAÎNEMENT (Professeur)

### **Étape 2.1: Vue Lobby**
URL: `/teacher/training/lobby`

**✅ Attendu:**
- Carte info session:
  - Groupes: 1 groupe de 4
  - Manches: 3
  - Durée: 60s
  - Niveau: CE1
- Groupe 1: Status "⏳ En attente"
- Avatars 4 élèves affichés
- Bouton **🚀 DÉMARRER TOUS LES MATCHS**

**📸 Screenshot requis:** Lobby avant démarrage

---

### **Étape 2.2: Démarrage Match**
1. Cliquer **🚀 DÉMARRER TOUS LES MATCHS**

**✅ Attendu:**
- Status badge: ⏳ → 🚀 Démarrage...
- Alert: "Tous les matchs ont été lancés ! Les élèves peuvent rejoindre..."
- Console backend logs:
  ```
  [Server][Training] Création match training_match_XXX avec 4 élèves
  [CrazyArena][Training] Match créé, en attente de 4 joueurs
  ```

**📸 Screenshot requis:** Status "🚀 Démarrage..."

---

## 🧪 TEST 3: REJOINDRE MATCH (Élèves)

### **Pour chaque élève (x4):**

### **Étape 3.1: Notification**
1. Connexion élève: `https://app.crazy-chrono.com/login`
2. Email: `eleve1@example.com` / Mot de passe
3. Voir badge notification 🔔 (coin supérieur droit)
4. Cliquer sur badge

**✅ Attendu:**
- Modal notifications ouverte
- Invitation: "Session Entraînement - Test CE1-A 2025"
- Bouton **REJOINDRE**

**📸 Screenshot requis (Élève 1):** Modal notification

---

### **Étape 3.2: Rejoindre**
1. Cliquer **REJOINDRE**

**✅ Attendu:**
- Redirection: `/crazy-arena/game`
- Écran lobby "En attente des autres joueurs..."
- Compteur: "1/4 joueurs connectés"

**Console backend:**
```
[CrazyArena] Student uuid1 (Alice) a rejoint match training_match_XXX (1/4)
```

**📸 Screenshot requis (Élève 1):** Écran attente joueurs

---

### **Répéter Étape 3.1-3.2 pour Élève 2, 3, 4**

**✅ Attendu progression:**
- Élève 2 rejoint → 2/4
- Élève 3 rejoint → 3/4
- Élève 4 rejoint → 4/4 → **DÉMARRAGE AUTO**

---

## 🧪 TEST 4: JEU BATTLE ROYALE (4 Élèves)

### **Étape 4.1: Countdown**
**✅ Attendu:**
- Countdown 3...2...1... GO!
- Manche 1/3 affichée

**📸 Screenshot requis (1 élève):** Countdown

---

### **Étape 4.2: Manche 1**
**✅ Attendu:**
- 16 cartes affichées (4x4 grille)
- Timer: 60s décompte
- Joueurs valident paires
- Scores s'incrémentent en temps réel

**Console backend (par validation):**
```
[CrazyArena] Joueur Alice a validé paire 1-2 (+10 pts)
```

**📸 Screenshot requis (1 élève):** Jeu en cours, score visible

---

### **Étape 4.3: Manches 2-3**
**✅ Attendu:**
- Transition automatique entre manches
- Nouvelles cartes générées
- Scores cumulatifs

---

### **Étape 4.4: Podium Final**
**✅ Attendu:**
- Podium Top 3 affiché
- Position, nom, score, temps pour chaque joueur
- Bouton **QUITTER**

**📸 Screenshot requis (Élève 1 = gagnant):** Podium final

---

## 🧪 TEST 5: RÉSULTATS BACKEND (Professeur)

### **Étape 5.1: Retour Lobby Prof**
Retourner sur: `/teacher/training/lobby` (compte prof)

**✅ Attendu:**
- Status groupe: "✅ Terminé"
- Résultats affichés:
  - 1. Alice - 120 pts
  - 2. Bob - 100 pts
  - 3. Charlie - 80 pts
- Bouton **📊 VOIR RÉSULTATS COMPLETS** apparaît

**📸 Screenshot requis:** Groupe terminé avec résultats

---

### **Étape 5.2: Vérifier BDD**
```sql
-- 1. Vérifier session créée
SELECT * FROM training_sessions 
WHERE session_name = 'Test CE1-A 2025'
ORDER BY created_at DESC LIMIT 1;

-- 2. Vérifier résultats élèves (4 lignes)
SELECT tr.*, s.full_name 
FROM training_results tr
JOIN students s ON tr.student_id = s.id
WHERE tr.session_id = 'SESSION_ID_FROM_STEP_1'
ORDER BY tr.position ASC;

-- 3. Vérifier stats cumulées élèves
SELECT * FROM student_training_stats 
WHERE student_id IN ('uuid1', 'uuid2', 'uuid3', 'uuid4');
```

**✅ Attendu:**
- `training_sessions`: 1 ligne (session_name, completed_at, config)
- `training_results`: 4 lignes (1 par élève, positions 1-4, scores corrects)
- `student_training_stats`: 4 lignes mises à jour (sessions_played +1, total_score, best_score)

**📸 Screenshot requis:** Requête SQL résultats

---

## 🧪 TEST 6: NOTIFICATION DISPARITION (Élève)

### **Étape 6.1: Vérifier Notification**
Retourner sur compte Élève 1

**✅ Attendu:**
- Badge notification 🔔 **SANS** chiffre (ou disparu)
- Modal notifications: invitation "Test CE1-A 2025" **RETIRÉE**

**Raison:** Socket.IO `arena:match-finished` reçu → notification supprimée immédiatement

**📸 Screenshot requis:** Badge notification vide

---

## ✅ CHECKLIST VALIDATION

### **Frontend:**
- [ ] Sélecteur 2 modes affiché
- [ ] Filtre licences fonctionne (élèves sans licence grisés)
- [ ] Compteur sélection correct (4 élèves = 1 groupe)
- [ ] Lobby affiche groupe + statuts
- [ ] Démarrage match change status (⏳ → 🚀 → 🎮 → ✅)
- [ ] Notifications élèves affichées
- [ ] Rejoindre match fonctionne (1/4 → 2/4 → 3/4 → 4/4)
- [ ] Jeu Battle Royale complet (3 manches, timer, scoring)
- [ ] Podium final correct
- [ ] Notification disparaît après match

### **Backend:**
- [ ] Socket.IO `training:create-match` reçu
- [ ] Match créé avec `createTrainingMatch()`
- [ ] Joueurs rejoignent via `arena:join`
- [ ] Démarrage auto à 4/4
- [ ] Validations paires enregistrées
- [ ] API `POST /api/training/sessions` appelée à fin match
- [ ] Tables BDD mises à jour (sessions, results, stats)

### **BDD:**
- [ ] `training_sessions`: 1 ligne créée
- [ ] `training_results`: 4 lignes (1 par élève)
- [ ] `student_training_stats`: 4 lignes mises à jour (cumul)
- [ ] Champs corrects (score, position, time_ms, pairs_validated, errors)

---

## 🐛 BUGS À SIGNALER

Si un test échoue, noter:

1. **Étape échouée:** (Ex: Test 3, Étape 3.2)
2. **Comportement attendu:** (Ex: Redirection `/crazy-arena/game`)
3. **Comportement observé:** (Ex: Erreur 404)
4. **Console logs:** (Copier logs navigateur F12)
5. **Screenshot:** (Joindre capture écran)

**Rapport bug format:**
```markdown
## BUG: [Titre court]

**Étape:** Test X, Étape X.X
**Attendu:** ...
**Observé:** ...
**Logs:**
```
[logs ici]
```
**Screenshot:** [lien]
```

---

## 📊 RÉSULTAT ATTENDU GLOBAL

**Si tout fonctionne:**
- ✅ 4 élèves ont joué match complet
- ✅ Podium affiché avec classement correct
- ✅ BDD contient 1 session + 4 résultats + 4 stats
- ✅ Notifications disparues après match
- ✅ Prof voit résultats dans lobby

**Temps estimé test complet:** ~15 minutes

---

## 🚀 URL RAPIDES

**App:** `https://app.crazy-chrono.com`

**Routes clés:**
- `/teacher` - Sélecteur modes
- `/teacher/training/create` - Création session
- `/teacher/training/lobby` - Lobby prof
- `/crazy-arena/game` - Jeu Battle Royale (élèves)

**Backend API:**
- `POST /api/training/sessions` - Sauvegarde résultats
- `GET /api/tournament/classes/:classId/students` - Liste élèves

---

**Date:** 2 janvier 2026  
**Version:** Routes API Rectorat implémentées  
**Prochaine étape:** Tests Dashboard Rectorat
