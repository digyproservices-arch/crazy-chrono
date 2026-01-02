# 🧪 TESTS FLOW COMPLET - 2 MODES

**Dernière mise à jour:** 2 janvier 2026  
**Commits:** `3f0a625`, `ac3b736`, `520ae3d`

---

## 📋 PLAN DE TESTS

### **A) MODE ENTRAÎNEMENT (Training Mode)**
### **B) MODE TOURNOI (Tournament Mode)**
### **C) DASHBOARD RECTORAT**

---

## 🟢 A) TESTS MODE ENTRAÎNEMENT

### **Prérequis**
- ✅ Compte professeur connecté
- ✅ Classe créée avec élèves
- ✅ Au moins 4 élèves avec **licence active**
- ✅ Tables SQL `training_sessions`, `training_results`, `student_training_stats` créées

---

### **Test 1: Sélection du Mode Entraînement**

**URL:** `https://app.crazy-chrono.com/teacher`

**Étapes:**
1. Connexion avec compte professeur
2. Aller sur `/teacher`
3. Voir 2 cartes:
   - 📚 **ENTRAÎNEMENT CLASSE**
   - 🏆 **TOURNOI OFFICIEL**

**Résultat attendu:**
- ✅ Affichage des 2 modes avec design moderne
- ✅ Descriptions claires des modes
- ✅ Badges "Licence requise" visibles

---

### **Test 2: Création Session Entraînement**

**URL:** `https://app.crazy-chrono.com/teacher/training/create`

**Étapes:**
1. Cliquer sur **ENTRAÎNEMENT CLASSE**
2. Voir liste élèves avec filtre licences
3. Sélectionner 4+ élèves (avec licence active)
4. Configurer:
   - Nom session: "Test CE1-A"
   - Manches: 3
   - Durée: 60s
   - Niveau: CE1
5. Cliquer **CRÉER GROUPES DE 4**

**Résultats attendus:**
- ✅ Élèves sans licence grisés (non sélectionnables)
- ✅ Élèves avec licence en vert ✅
- ✅ Compteur sélection: "4 élèves sélectionnés → 1 groupe de 4"
- ✅ Redirection vers `/teacher/training/lobby`

**API Calls:**
```
GET /api/tournament/classes/{classId}/students
→ Retourne élèves avec champ "licensed"
```

---

### **Test 3: Lobby Entraînement**

**URL:** `https://app.crazy-chrono.com/teacher/training/lobby`

**Étapes:**
1. Arrivée sur page lobby
2. Voir groupes créés (1 carte par groupe)
3. Cliquer **🚀 DÉMARRER TOUS LES MATCHS**
4. Observer statuts:
   - ⏳ En attente → 🚀 Démarrage... → 🎮 En cours

**Résultats attendus:**
- ✅ Affichage info session (manches, durée, niveau)
- ✅ Groupes visibles avec avatars élèves
- ✅ Socket.IO `training:create-match` émis pour chaque groupe
- ✅ Backend crée matchs avec `createTrainingMatch()`
- ✅ Status badge change de couleur selon état

**Socket.IO Events:**
```javascript
// Frontend → Backend
socket.emit('training:create-match', {
  matchId: 'training_match_123',
  studentIds: ['uuid1', 'uuid2', 'uuid3', 'uuid4'],
  config: { rounds: 3, durationPerRound: 60, level: 'CE1' },
  classId: 'class_uuid',
  teacherId: 'teacher_uuid'
});

// Backend → Frontend
socket.on('training:match-started', { matchId });
socket.on('training:match-finished', { matchId, results });
```

**Backend Logs:**
```
[Server][Training] Création match training_match_123 avec 4 élèves
[CrazyArena][Training] Match créé, en attente de 4 joueurs
```

---

### **Test 4: Rejoindre Match (Élève)**

**Compte Élève requis**

**Étapes:**
1. Connexion avec compte élève (licence active)
2. Voir notification badge (🔔) en haut à droite
3. Cliquer → Voir invitation "Session Entraînement"
4. Cliquer **REJOINDRE**
5. Attente des 4 joueurs

**Résultats attendus:**
- ✅ Notification affichée dans `NotificationBadge`
- ✅ Socket.IO `arena:join` émis
- ✅ Lobby affiche joueurs connectés (1/4, 2/4, 3/4, 4/4)
- ✅ Démarrage automatique à 4/4

---

### **Test 5: Jeu Battle Royale**

**Étapes:**
1. 4 joueurs connectés → Match démarre automatiquement
2. Countdown 3...2...1
3. Jeu commence: 3 manches x 60s
4. Joueurs valident paires
5. Podium final avec classement

**Résultats attendus:**
- ✅ Zones générées (16 cartes par manche)
- ✅ Timer fonctionne (60s par manche)
- ✅ Scoring temps réel
- ✅ Podium affiche Top 3
- ✅ Backend sauvegarde résultats via API

**API Call Fin Match:**
```
POST /api/training/sessions
{
  matchId: 'training_match_123',
  classId: 'class_uuid',
  teacherId: 'teacher_uuid',
  sessionName: 'Test CE1-A',
  results: [
    { studentId: 'uuid1', position: 1, score: 120, timeMs: 45000, pairsValidated: 12, errors: 1 },
    { studentId: 'uuid2', position: 2, score: 100, timeMs: 50000, pairsValidated: 10, errors: 2 },
    ...
  ],
  config: { rounds: 3, duration: 60, level: 'CE1' },
  completedAt: '2026-01-02T22:36:00Z'
}
```

**Tables BDD mises à jour:**
- ✅ `training_sessions`: 1 ligne insérée
- ✅ `training_results`: 4 lignes (1 par élève)
- ✅ `student_training_stats`: 4 lignes mises à jour (cumul)

---

### **Test 6: Retour Lobby Prof**

**Étapes:**
1. Match terminé → Status badge "✅ Terminé"
2. Bouton **📊 VOIR RÉSULTATS COMPLETS** apparaît
3. Cliquer → Redirection `/teacher/training/results`

**Résultats attendus:**
- ✅ Tous les matchs affichent résultats
- ✅ Classement par groupe visible
- ✅ Stats élèves (score, paires, temps)

---

## 🟡 B) TESTS MODE TOURNOI

### **Prérequis**
- ✅ Tournoi créé en BDD (`tournament_phases`, `tournament_groups`)
- ✅ Phase 1 (Classe) active
- ✅ Groupes de 4 élèves créés
- ✅ Élèves avec licence active

---

### **Test 7: Sélection Mode Tournoi**

**URL:** `https://app.crazy-chrono.com/teacher`

**Étapes:**
1. Cliquer sur **🏆 TOURNOI OFFICIEL**
2. Redirection vers `/teacher/tournament` (= `/tournament/setup`)

**Résultat attendu:**
- ✅ Page `CrazyArenaSetup` affichée
- ✅ Liste tournois actifs
- ✅ Groupes classe visibles

---

### **Test 8: Démarrage Match Tournoi**

**URL:** `https://app.crazy-chrono.com/crazy-arena/manager`

**Étapes:**
1. Professeur crée match classe (4 élèves)
2. Génère room code
3. Élèves rejoignent via notification
4. Match démarre (identique Mode Entraînement)

**Résultats attendus:**
- ✅ Match créé avec `createMatch()` (mode tournoi)
- ✅ Backend utilise `TournamentMode` (pas `TrainingMode`)
- ✅ Résultats sauvegardés via `PATCH /api/tournament/matches/{id}/finish`

**Différences vs Entraînement:**
- ✅ Gagnant qualifié pour phase suivante (`winner_id` dans `tournament_groups`)
- ✅ Notification qualification envoyée (`POST /api/notifications/qualification`)
- ✅ Progression **MANUELLE** par Rectorat (pas automatique)

---

### **Test 9: Fin Match Tournoi**

**Étapes:**
1. Match terminé → Podium affiché
2. Backend appelle `TournamentMode.onMatchEnd()`
3. Gagnant enregistré dans groupe

**API Calls:**
```
PATCH /api/tournament/matches/{matchId}/finish
{
  results: [
    { studentId: 'uuid1', score: 120, position: 1, ... },
    ...
  ]
}

PATCH /api/tournament/groups/{groupId}
{
  winnerId: 'uuid1',
  status: 'finished'
}

POST /api/notifications/qualification
{
  studentId: 'uuid1',
  tournamentId: 'tournament_uuid',
  currentPhase: 1,
  nextPhase: 2,
  nextPhaseName: 'CRAZY WINNER ÉCOLE',
  message: 'Félicitations ! Vous êtes qualifié(e) pour la phase CRAZY WINNER ÉCOLE'
}
```

**Tables BDD:**
- ✅ `tournament_matches`: status → 'finished'
- ✅ `tournament_groups`: winner_id mis à jour
- ✅ PAS de création automatique phase 2 (attente Rectorat)

---

## 🔵 C) TESTS DASHBOARD RECTORAT

### **Prérequis**
- ✅ Compte admin/rectorat
- ✅ Tournoi avec phases créées
- ✅ Groupes phase 1 terminés (100%)

---

### **Test 10: Accès Dashboard**

**URL:** `https://app.crazy-chrono.com/admin/rectorat`

**Étapes:**
1. Connexion avec compte admin
2. Aller sur `/admin/rectorat`
3. Voir liste tournois actifs

**Résultats attendus:**
- ✅ Sélecteur tournoi actif
- ✅ Affichage phases (1, 2, 3, 4)
- ✅ Status badges (En attente, En cours, Terminée)
- ✅ Progression % par phase

---

### **Test 11: Clôture Phase**

**Étapes:**
1. Phase 1 active, progression 100%
2. Cliquer **🔒 CLÔTURER PHASE**
3. Confirmer popup

**Résultats attendus:**
- ✅ API `PATCH /api/tournament/phases/{id}/close`
- ✅ Phase 1 status → 'finished'
- ✅ Gagnants qualifiés récupérés
- ✅ Alert "Phase clôturée ! X gagnants qualifiés"

**API Logic:**
```javascript
// Backend /api/tournament/phases/:id/close
1. Récupérer tous les groupes de la phase
2. Extraire winnerId de chaque groupe
3. Créer groupes phase suivante avec gagnants
4. Status phase → 'finished'
5. Retourner { success: true, qualifiedCount: X }
```

---

### **Test 12: Activation Phase Suivante**

**Étapes:**
1. Phase 1 terminée
2. Cliquer **🚀 ACTIVER PHASE SUIVANTE** (Phase 2)
3. Confirmer popup

**Résultats attendus:**
- ✅ API `PATCH /api/tournament/phases/{id}/activate`
- ✅ Phase 2 status → 'active'
- ✅ Profs peuvent créer matchs phase 2
- ✅ Alert "Phase suivante activée !"

---

### **Test 13: Export PDF Classement**

**Étapes:**
1. Cliquer **📥 EXPORTER CLASSEMENT PDF**
2. Téléchargement PDF

**Résultats attendus:**
- ✅ API `GET /api/tournament/{id}/ranking/pdf`
- ✅ PDF téléchargé: `classement_tournoi_{id}.pdf`
- ✅ Classement complet toutes phases

**Note:** API endpoint à implémenter (génération PDF avec bibliothèque comme `pdfkit`)

---

## 🎯 CHECKLIST VALIDATION COMPLÈTE

### **Mode Entraînement** ✅
- [ ] Sélection élèves (filtre licences)
- [ ] Création groupes de 4
- [ ] Lobby avec progression temps réel
- [ ] Matchs démarrent via Socket.IO
- [ ] Jeu Battle Royale fonctionne
- [ ] Résultats sauvegardés en BDD
- [ ] Stats élèves mises à jour (cumul)

### **Mode Tournoi** 🟡
- [ ] Création match classe
- [ ] Qualification gagnant
- [ ] Notification qualification envoyée
- [ ] Gagnant enregistré dans groupe
- [ ] Progression MANUELLE (pas automatique)

### **Dashboard Rectorat** 🟡
- [ ] Affichage tournois/phases
- [ ] Progression % correcte
- [ ] Clôture phase fonctionne
- [ ] Activation phase suivante fonctionne
- [ ] Export PDF (à implémenter)

---

## 🐛 BUGS POTENTIELS À VÉRIFIER

### **1. Notifications persistantes**
**Status:** ✅ CORRIGÉ (Socket.IO listeners ajoutés)

**Vérifier:**
- Notification disparaît après match terminé
- Événement `arena:match-finished` reçu

---

### **2. Licences inactives autorisées**
**Risque:** Élève sans licence rejoint match

**Vérifier:**
- Frontend filtre élèves sans licence
- Backend vérifie licences avant `addPlayer()`
- `TrainingMode.beforeStart()` rejette si licence manquante

---

### **3. Progression automatique phase**
**Risque:** Phase suivante activée automatiquement (devrait être manuel)

**Vérifier:**
- `TournamentMode.onMatchEnd()` NE CRÉE PAS phase suivante
- Rectorat doit cliquer "Activer Phase Suivante"

---

### **4. Socket.IO déconnexions**
**Risque:** Joueur déconnecté → match bloqué

**Vérifier:**
- `crazyArenaManager.handleDisconnect()` retire joueur
- Autres joueurs notifiés via `arena:player-left`
- Match continue avec 3 joueurs ou moins

---

## 📊 LOGS BACKEND À SURVEILLER

```bash
# Création match entraînement
[Server][Training] Création match training_match_123 avec 4 élèves
[CrazyArena][Training] Match training_match_123 créé

# Joueur rejoint
[CrazyArena] Student uuid1 (Alice) a rejoint match training_match_123 (1/4)

# Match démarre
[CrazyArena] Match training_match_123 démarré avec 4 joueurs

# Validation paire
[CrazyArena] Joueur Alice a validé paire 1-2 (+10 pts)

# Fin match
[TrainingMode][training_match_123] 🏆 Gagnant: Alice (120 pts)
[TrainingMode][training_match_123] ✅ Stats sauvegardées

# Tournoi - Qualification
[TournamentMode][match_456] 🏆 Gagnant: Bob (140 pts)
[TournamentMode][match_456] ✅ Bob qualifié pour Phase 2
[TournamentMode][match_456] ℹ️  Progression vers Phase 2 EN ATTENTE activation Rectorat
```

---

## 🚀 URLS TESTS PRODUCTION

**Frontend:** `https://app.crazy-chrono.com`  
**Backend:** `https://crazy-chrono-backend.onrender.com`

**Routes clés:**
- `/teacher` → Sélecteur 2 modes
- `/teacher/training/create` → Création session entraînement
- `/teacher/training/lobby` → Lobby entraînement
- `/admin/rectorat` → Dashboard Rectorat

---

## ✅ TESTS MANUELS PRIORITAIRES

**Ordre recommandé:**

1. **Test Mode Entraînement complet** (Tests 1-6)
   - Créer session
   - 4 élèves rejoignent
   - Match complet
   - Vérifier BDD

2. **Test Dashboard Rectorat** (Tests 10-13)
   - Voir phases
   - Clôturer phase (si 100%)
   - Activer phase suivante

3. **Test Mode Tournoi** (Tests 7-9)
   - Match classe
   - Qualification gagnant
   - Vérifier notification

---

**Dernière mise à jour:** 2 janvier 2026 18:40  
**Version:** `520ae3d`
