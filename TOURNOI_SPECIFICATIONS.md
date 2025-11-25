# 🏆 TOURNOI CRAZY CHRONO - Spécifications Techniques

## 📊 Vue d'ensemble

**Nom:** Tournoi Crazy Chrono  
**Public:** Élèves CP à CM2 (primaire) + 6ème à 3ème (collège)  
**Structure:** 4 phases pyramidales  
**Format groupes:** Battle Royale (4 joueurs simultanés)  
**Délai:** 10 jours pour MVP démo Rectorat  

---

## 🎯 Objectifs pédagogiques

1. **Engagement massif:** 10 000+ élèves académie Guadeloupe
2. **Équité:** Tous les élèves peuvent participer (en ligne)
3. **Valorisation:** Certificats digitaux, badges, classements
4. **Suivi pédagogique:** Stats détaillées par élève/classe/école
5. **Scalabilité:** Extensible à d'autres académies (Martinique, Guyane)

---

## 🏗️ Architecture du tournoi

### Structure pyramidale à 4 phases

```
PHASE 1: CRAZY WINNER CLASSE (Niveau classe)
├─ Groupes de 4 élèves (Battle Royale)
├─ 1 winner par groupe qualifié
├─ Finale classe → 1 CRAZY WINNER CLASSE
└─ Durée: 2 semaines

PHASE 2: CRAZY WINNER ÉCOLE (Niveau établissement)
├─ Winners classe du même niveau (CP, CE1, etc.)
├─ 5 CRAZY WINNERS ÉCOLE par niveau (CP à CM2)
└─ Durée: 1 semaine

PHASE 3: CRAZY WINNER CIRCONSCRIPTION (Niveau territorial)
├─ Winners école du même niveau
├─ 5 CRAZY WINNERS CIRCONSCRIPTION par niveau
└─ Durée: 1 semaine

PHASE 4: CRAZY WINNER ACADÉMIQUE (Grande finale)
├─ Winners circonscription du même niveau
├─ 1 CRAZY WINNER ACADÉMIQUE par niveau (Champion absolu)
├─ Format: Présentiel + streaming live
└─ Durée: 1 journée (événement)
```

---

## 🎮 Mode Battle Royale (Groupes de 4)

### Principe
- **4 élèves** jouent simultanément la même carte
- **Temps réel:** Tous voient les zones en même temps
- **Classement dynamique:** Scores affichés en direct
- **Winner:** Meilleur score à la fin (ou premier à valider toutes les paires)

### Déroulement
1. **Lobby (30s):** 4 joueurs rejoignent avec code groupe
2. **Countdown (3s):** "3... 2... 1... GO!"
3. **Gameplay (60s):** Partie standard Crazy Chrono
4. **Podium (10s):** Classement 1er, 2ème, 3ème, 4ème + animation

### Règles scoring
- **+10 points** par paire validée correctement
- **-2 points** par erreur
- **Bonus vitesse:** +1 point si validation < 3s
- **En cas d'égalité:** Départage par temps total

---

## 📦 Modèle de données

### Tournament (Tournoi)
```javascript
{
  id: "tour_2025_guadeloupe",
  name: "Tournoi Crazy Chrono 2025",
  academyCode: "GP", // Guadeloupe
  status: "active", // draft | active | finished
  currentPhase: 1, // 1-4
  phases: [Phase],
  createdAt: Date,
  startDate: Date,
  endDate: Date,
  config: {
    levels: ["CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e"],
    groupSize: 4,
    roundsPerMatch: 3,
    durationPerRound: 60
  }
}
```

### Phase (Phase du tournoi)
```javascript
{
  id: "phase_1_classe",
  tournamentId: "tour_2025_guadeloupe",
  level: 1, // 1=Classe, 2=École, 3=Circonscription, 4=Académique
  name: "CRAZY WINNER CLASSE",
  status: "active", // pending | active | finished
  startDate: Date,
  endDate: Date,
  matches: [Match]
}
```

### Match (Affrontement)
```javascript
{
  id: "match_123",
  phaseId: "phase_1_classe",
  groupId: "group_6A_g1",
  status: "pending", // pending | in_progress | finished
  scheduledAt: Date,
  startedAt: Date,
  finishedAt: Date,
  players: [
    { studentId: "s1", name: "Alice B.", position: 1, score: 85, timeMs: 45000 },
    { studentId: "s2", name: "Bob C.", position: 2, score: 75, timeMs: 50000 },
    { studentId: "s3", name: "Chloé D.", position: 3, score: 70, timeMs: 52000 },
    { studentId: "s4", name: "David E.", position: 4, score: 60, timeMs: 55000 }
  ],
  winner: { studentId: "s1", name: "Alice B." },
  roomCode: "ABC123",
  config: {
    rounds: 3,
    duration: 60,
    classes: ["CE1"],
    themes: []
  }
}
```

### Group (Groupe de 4 élèves)
```javascript
{
  id: "group_6A_g1",
  tournamentId: "tour_2025_guadeloupe",
  phaseLevel: 1,
  classId: "6A_ecole_lamentin",
  name: "Groupe 1",
  studentIds: ["s1", "s2", "s3", "s4"],
  matchId: "match_123",
  status: "finished",
  winnerId: "s1"
}
```

### Student (Élève)
```javascript
{
  id: "s1",
  firstName: "Alice",
  lastName: "Bertrand",
  fullName: "Alice B.", // Anonymisation partielle
  level: "CE1", // CP, CE1, etc.
  classId: "6A_ecole_lamentin",
  schoolId: "ecole_lamentin",
  circonscriptionId: "circ_pointe_a_pitre",
  email: "alice.b@eleve.ac-guadeloupe.fr", // Optionnel
  avatarUrl: "/avatars/default.png",
  licensed: true, // Licence active pour l'année
  stats: {
    tournamentsPlayed: 2,
    totalWins: 5,
    totalMatches: 12,
    bestScore: 95,
    badges: ["CRAZY_WINNER_CLASSE_2024", "FINALIST_ECOLE_2024"]
  },
  createdAt: Date
}
```

### School (École)
```javascript
{
  id: "ecole_lamentin",
  name: "École Primaire Lamentin",
  type: "primaire", // primaire | college
  city: "Le Lamentin",
  circonscriptionId: "circ_pointe_a_pitre",
  classes: [
    { id: "CP_A", level: "CP", teacherName: "Mme Martin", studentCount: 25 },
    { id: "CE1_A", level: "CE1", teacherName: "M. Dupont", studentCount: 28 }
  ]
}
```

### Bracket (Arbre du tournoi)
```javascript
{
  tournamentId: "tour_2025_guadeloupe",
  phaseLevel: 2, // Phase École
  level: "CE1",
  rounds: [
    {
      roundNumber: 1, // Quarts de finale
      matches: [Match, Match, Match, Match]
    },
    {
      roundNumber: 2, // Demi-finales
      matches: [Match, Match]
    },
    {
      roundNumber: 3, // Finale
      matches: [Match]
    }
  ]
}
```

---

## 🎨 Interface utilisateur

### 1. Dashboard Organisateur (Rectorat/CPC)

**URL:** `/admin/tournament/:tournamentId`

**Fonctionnalités:**
- Vue d'ensemble du tournoi (participation, progression)
- Gestion des phases (activer/clôturer)
- Brackets visuels par niveau
- Export résultats (PDF/CSV)
- Communication (emails qualifications)

**Sections:**
```
┌─────────────────────────────────────────────┐
│ 🏆 Tournoi Crazy Chrono 2025                │
│ Phase actuelle: CRAZY WINNER CLASSE (1/4)   │
├─────────────────────────────────────────────┤
│ 📊 Stats globales                           │
│ • 1,245 élèves inscrits                     │
│ • 312 groupes créés                         │
│ • 189 matchs terminés (61%)                 │
│ • 123 matchs en cours                       │
├─────────────────────────────────────────────┤
│ 📈 Participation par niveau                 │
│ CP:  ████████░░ 85%                         │
│ CE1: ██████████ 92%                         │
│ CE2: ███████░░░ 78%                         │
│ [...]                                       │
├─────────────────────────────────────────────┤
│ 🗺️ Brackets (sélectionner niveau)          │
│ [CP] [CE1] [CE2] [CM1] [CM2]               │
│                                             │
│ Arbre visuel du tournoi...                 │
├─────────────────────────────────────────────┤
│ ⚙️ Actions                                  │
│ [Clôturer Phase 1] [Activer Phase 2]       │
│ [Exporter résultats] [Envoyer notifications]│
└─────────────────────────────────────────────┘
```

### 2. Interface Enseignant

**URL:** `/teacher/classroom/:classId`

**Fonctionnalités:**
- Créer des groupes de 4 élèves
- Lancer les matchs
- Suivre progression élèves
- Stats classe

### 3. Interface Élève

**URL:** `/student/profile/:studentId`

**Fonctionnalités:**
- Profil avec badges
- Calendrier des matchs
- Rejoindre un match (code)
- Historique performances

---

## 🚀 Endpoints API

### Tournois
```
POST   /api/tournaments              - Créer tournoi
GET    /api/tournaments/:id          - Infos tournoi
PATCH  /api/tournaments/:id/phase    - Changer phase
GET    /api/tournaments/:id/brackets - Brackets par niveau
```

### Matchs
```
POST   /api/matches                  - Créer match groupe 4
GET    /api/matches/:id              - Infos match
POST   /api/matches/:id/join         - Rejoindre match
PATCH  /api/matches/:id/start        - Démarrer match
PATCH  /api/matches/:id/finish       - Terminer match
```

### Élèves
```
POST   /api/students                 - Créer élève
GET    /api/students/:id             - Profil élève
GET    /api/students/:id/stats       - Stats élève
PATCH  /api/students/:id/badges      - Ajouter badge
```

### Groupes
```
POST   /api/groups                   - Créer groupe de 4
GET    /api/groups/:id               - Infos groupe
PATCH  /api/groups/:id/students      - Modifier membres
```

---

## 📧 Notifications email

**Service:** Nodemailer + SMTP académie

**Contacts Rectorat:**
- Isabelle.de-chavigny@ac-guadeloupe.fr
- steew.anais@ac-guadeloupe.fr

**Templates:**
1. **Qualification phase suivante**
2. **Rappel match à jouer**
3. **Certificat winner**
4. **Résumé hebdomadaire enseignant**

---

## 🎯 Priorités implémentation (10 jours)

### ✅ MUST HAVE (MVP démo)
- [ ] Mode Battle Royale groupes 4
- [ ] Dashboard organisateur basique
- [ ] Système de phases (4 niveaux)
- [ ] Brackets visuels
- [ ] Profil élève avec badges
- [ ] Export résultats PDF

### 🔶 NICE TO HAVE (post-démo)
- [ ] Streaming finales
- [ ] Replay matchs
- [ ] Certificats PDF personnalisés
- [ ] Anti-triche avancé
- [ ] Chat spectateurs

---

## 📊 Métriques de succès

**Pour la démo Rectorat (J+10):**
- ✅ Simulation tournoi complet (100 élèves fictifs)
- ✅ 3 phases jouées et archivées
- ✅ Brackets fonctionnels pour tous les niveaux
- ✅ Export PDF résultats
- ✅ Interface mobile parfaite (tablettes élèves)

**Pour le tournoi réel (2025):**
- 🎯 10 000+ élèves participants
- 🎯 95%+ taux de complétion phase 1
- 🎯 0 bug critique pendant finales
- 🎯 Couverture médias locaux

---

## 🔐 Sécurité

1. **Authentification élèves:** Email académique + code classe
2. **Anti-triche:** Analyse temps de réponse
3. **Données RGPD:** Anonymisation (prénom + initiale)
4. **Backup:** Sauvegarde quotidienne BDD
5. **Rate limiting:** Max 10 matchs/heure par élève

---

## 📞 Contacts clés

**Rectorat Guadeloupe:**
- Isabelle de Chavigny (isabelle.de-chavigny@ac-guadeloupe.fr)
- Steew Anaïs (steew.anais@ac-guadeloupe.fr)

**Développeur:**
- Marius VERIN (via cette session Cascade)

---

**Document vivant - Mis à jour quotidiennement pendant les 10 jours**
