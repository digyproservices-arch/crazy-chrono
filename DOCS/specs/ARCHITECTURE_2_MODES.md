# 🏗️ ARCHITECTURE 2 MODES - Crazy Chrono

## 📋 Vue d'ensemble

**Objectif:** Unifier le code tout en séparant les **contextes d'usage**

```
ARCHITECTURE UNIFIÉE
├── Moteur Battle Royale (CODE PARTAGÉ)
│   ├── Timer par manche
│   ├── Génération cartes
│   ├── Validation paires
│   ├── Scoring dynamique
│   ├── Tiebreaker (3 cartes)
│   └── Podium classement
│
└── 2 MODES D'USAGE (SPÉCIALISATIONS)
    ├── Mode ENTRAÎNEMENT (Classe continue)
    └── Mode TOURNOI (Arena 4 phases)
```

---

## 🎯 MODE 1: ENTRAÎNEMENT CLASSE

### **Contexte**
Entraînement continu des élèves **toute l'année scolaire**

### **Caractéristiques**
- **Durée:** Permanente (sessions répétées)
- **Organisation:** Prof autonome
- **Participants:** Élèves de SA classe uniquement
- **Licences:** ✅ **OBLIGATOIRES** (vérification avant création)
- **Progression:** ❌ Aucune (sessions indépendantes)
- **Stats:** Sauvegardées pour suivi pédagogique

### **Workflow prof**
```
1. Prof clique [ENTRAÎNEMENT CLASSE]
2. Sélectionne élèves (filtrés si licence active)
3. Configure session (manches, durée, niveau)
4. Crée groupes de 4
5. Lance sessions
6. Consulte stats après
```

### **Règles métier**
- ✅ Sessions illimitées
- ✅ Répétables à volonté
- ✅ Pas de qualification
- ✅ Stats individuelles sauvegardées
- ❌ Pas de progression entre sessions

---

## 🏆 MODE 2: TOURNOI ARENA

### **Contexte**
Tournoi officiel interscolaire **événement ponctuel**

### **Structure: 4 phases pyramidales**
```
Phase 1: CRAZY WINNER CLASSE
  → Gagnants → Phase 2

Phase 2: CRAZY WINNER ÉCOLE
  → Gagnants → Phase 3

Phase 3: CRAZY WINNER CIRCONSCRIPTION
  → Gagnants → Phase 4

Phase 4: CRAZY WINNER ACADÉMIQUE
  → Champion absolu
```

### **Caractéristiques**
- **Durée:** 4-6 semaines (événement cadré)
- **Organisation:** Rectorat/CPC pilote
- **Participants:** Tous élèves académie
- **Licences:** ✅ **OBLIGATOIRES** (inscription tournoi)
- **Progression:** ✅ **MANUELLE** par Rectorat (boutons phase suivante)
- **Stats:** Sauvegardées + classements officiels

### **Workflow prof**
```
1. Prof clique [TOURNOI OFFICIEL]
2. Voit tournoi actif + phase en cours
3. Crée groupes 4 élèves de sa classe
4. Lance matchs Battle Royale
5. Gagnants qualifiés automatiquement
6. Attend activation Phase 2 par Rectorat
```

### **Workflow Rectorat (dashboard)**
```
1. Crée tournoi (dates, phases, niveaux)
2. Active Phase 1 (Classe)
3. Surveille progression
4. Clôture Phase 1 manuellement
5. Active Phase 2 (École)
6. Répète jusqu'à Phase 4 (Académique)
7. Exporte résultats PDF
```

### **Règles métier**
- ✅ **TOURNOIS PARALLÈLES autorisés** (plusieurs profs peuvent créer des tournois classe simultanément)
- ✅ Gagnants → base qualifiés phase suivante
- ✅ Progression MANUELLE (bouton Rectorat)
- ✅ Classements officiels par niveau
- ✅ Notifications email qualifications

---

## ⚙️ ARCHITECTURE TECHNIQUE

### **Moteur Battle Royale (code partagé)**

```javascript
// server/core/BattleRoyaleEngine.js
class BattleRoyaleEngine {
  constructor(config) {
    this.matchId = config.matchId;
    this.mode = config.mode; // 'training' | 'tournament'
    this.players = new Map(); // 4 joueurs max
    this.zones = [];
    this.config = config;
  }

  // === MÉTHODES COMMUNES (identiques 2 modes) ===

  async startMatch() {
    // 1. Countdown 3-2-1
    this.emitCountdown();
    
    // 2. Générer zones
    this.zones = await this.generateZones();
    
    // 3. Démarrer timer
    this.startTimer();
    
    // 4. Émettre zones aux 4 joueurs
    this.io.to(this.matchId).emit('arena:round-new', { zones: this.zones });
  }

  validatePair(studentId, pairId) {
    // Scoring identique
    const player = this.players.get(studentId);
    player.score += 10;
    
    // Bonus vitesse < 3s
    if (timeMs < 3000) player.score += 1;
    
    // Nouvelle carte
    this.generateNewCard();
  }

  async endMatch() {
    // 1. Calculer classement
    const ranking = this.calculateRanking();
    
    // 2. Tiebreaker si égalité
    if (this.hasTie(ranking)) {
      await this.startTiebreaker();
      return;
    }
    
    // 3. Afficher podium
    this.emitPodium(ranking);
    
    // 4. Sauvegarder résultats
    await this.saveResults(ranking);
    
    // 5. APPELER HOOK SPÉCIFIQUE MODE
    await this.onMatchEnd(ranking);
  }

  // === HOOK À IMPLÉMENTER PAR MODES ===
  async onMatchEnd(ranking) {
    throw new Error('onMatchEnd must be implemented by subclass');
  }
}
```

### **Spécialisation Mode Entraînement**

```javascript
// server/modes/TrainingMode.js
class TrainingMode extends BattleRoyaleEngine {
  constructor(config) {
    super({ ...config, mode: 'training' });
    this.classId = config.classId;
    this.teacherId = config.teacherId;
  }

  // ✅ Avant démarrage: vérifier licences
  async beforeStart() {
    console.log('[TrainingMode] Vérification licences...');
    
    for (const player of this.players.values()) {
      const hasLicense = await this.checkLicense(player.studentId);
      
      if (!hasLicense) {
        throw new Error(`Élève ${player.name} sans licence active`);
      }
    }
  }

  // ✅ Après match: sauvegarder stats (pas de progression)
  async onMatchEnd(ranking) {
    console.log('[TrainingMode] Sauvegarde stats entraînement...');
    
    // Enregistrer stats élèves
    await this.saveTrainingStats(ranking);
    
    // Pas de qualification, pas de notification
    // Session terminée
  }

  async checkLicense(studentId) {
    const res = await fetch(`${API}/api/students/${studentId}`);
    const { student } = await res.json();
    return student.licensed === true;
  }
}
```

### **Spécialisation Mode Tournoi**

```javascript
// server/modes/TournamentMode.js
class TournamentMode extends BattleRoyaleEngine {
  constructor(config) {
    super({ ...config, mode: 'tournament' });
    this.tournamentId = config.tournamentId;
    this.phaseLevel = config.phaseLevel; // 1-4
    this.groupId = config.groupId;
  }

  // ✅ Avant démarrage: vérifier licences
  async beforeStart() {
    console.log('[TournamentMode] Vérification licences tournoi...');
    
    for (const player of this.players.values()) {
      const hasLicense = await this.checkLicense(player.studentId);
      
      if (!hasLicense) {
        throw new Error(`Élève ${player.name} non autorisé (licence requise)`);
      }
    }
  }

  // ✅ Après match: marquer gagnant qualifié (progression MANUELLE)
  async onMatchEnd(ranking) {
    const winner = ranking[0];
    console.log(`[TournamentMode] Gagnant: ${winner.name}`);
    
    // 1. Enregistrer gagnant dans groupe
    await this.markGroupWinner(this.groupId, winner.studentId);
    
    // 2. Notifier prof + élève
    await this.notifyQualification(winner);
    
    // 3. ❌ PAS DE PROGRESSION AUTO vers phase suivante
    //    → Rectorat décide manuellement via dashboard
    
    console.log(`[TournamentMode] ${winner.name} qualifié pour Phase ${this.phaseLevel + 1} (en attente activation Rectorat)`);
  }

  async markGroupWinner(groupId, winnerId) {
    // Mettre à jour BDD
    await fetch(`${API}/api/groups/${groupId}/winner`, {
      method: 'PATCH',
      body: JSON.stringify({ winnerId })
    });
  }

  async notifyQualification(winner) {
    // Email élève + prof
    await sendEmail({
      to: winner.email,
      subject: `Qualification Phase ${this.phaseLevel + 1}`,
      template: 'qualification'
    });
  }
}
```

---

## 🎨 UI PROFESSEUR (Switch simple)

### **Écran principal**

```
┌──────────────────────────────────────────────────┐
│ 👋 Bonjour M. Dupont (Classe CE1-A)             │
├──────────────────────────────────────────────────┤
│                                                  │
│  🎮 CHOISISSEZ UN MODE DE JEU                   │
│                                                  │
│  ┌────────────────────┐  ┌───────────────────┐ │
│  │ 📚 ENTRAÎNEMENT    │  │ 🏆 TOURNOI        │ │
│  │    CLASSE          │  │    OFFICIEL       │ │
│  ├────────────────────┤  ├───────────────────┤ │
│  │ Entraîner mes      │  │ Tournoi           │ │
│  │ élèves toute       │  │ interscolaire     │ │
│  │ l'année            │  │ Guadeloupe        │ │
│  │                    │  │                   │ │
│  │ ✅ Sessions libres │  │ 🎯 4 phases       │ │
│  │ ✅ Répétable       │  │ 🏅 Officiel       │ │
│  │ 🔑 Licence requis  │  │ 🔑 Licence requis │ │
│  │                    │  │                   │ │
│  │ [CRÉER SESSION]    │  │ [VOIR TOURNOI]    │ │
│  └────────────────────┘  └───────────────────┘ │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 🔑 GESTION LICENCES (2 modes)

### **Règle unifiée**
✅ **Licence active OBLIGATOIRE** pour Mode Entraînement ET Mode Tournoi

### **Vérification API**

```javascript
// GET /api/students/:id/license-check
{
  "studentId": "s001",
  "licensed": true,
  "expiresAt": "2025-08-31",
  "daysRemaining": 240
}
```

### **UI sélection élèves**

```
┌──────────────────────────────────────────────────┐
│ SÉLECTIONNER LES ÉLÈVES                          │
├──────────────────────────────────────────────────┤
│ ✅ Alice B. (Licence valide jusqu'au 31/08)     │
│ ✅ Bob C. (Licence valide jusqu'au 31/08)       │
│ ❌ David E. (Licence expirée - [RENOUVELER])    │
│ ✅ Emma F. (Licence valide jusqu'au 31/08)      │
│                                                  │
│ 3 élèves sélectionnés (licences valides)        │
└──────────────────────────────────────────────────┘
```

---

## 📊 PROGRESSION TOURNOI (MANUELLE)

### **Dashboard Rectorat**

```
┌──────────────────────────────────────────────────┐
│ 🏆 TOURNOI CRAZY CHRONO 2025                     │
│ Phase actuelle: 1 - CRAZY WINNER CLASSE          │
├──────────────────────────────────────────────────┤
│ 📊 PROGRESSION PHASE 1                           │
│ • 312 groupes créés                              │
│ • 189 matchs terminés (61%)                      │
│ • 123 matchs en cours                            │
│ • 189 gagnants qualifiés pour Phase 2            │
│                                                  │
│ ⚙️ ACTIONS RECTORAT                              │
│ [CLÔTURER PHASE 1] [ACTIVER PHASE 2]            │
│                                                  │
│ ⚠️  Clôture Phase 1 bloque nouveaux matchs      │
│ ✅  Phase 2 démarre avec 189 qualifiés          │
└──────────────────────────────────────────────────┘
```

### **Logique progression**

```javascript
// Dashboard Rectorat
async function closePhase(tournamentId, phaseLevel) {
  // 1. Bloquer nouveaux matchs phase actuelle
  await updatePhase(tournamentId, phaseLevel, { status: 'closed' });
  
  // 2. Récupérer gagnants
  const winners = await getPhaseWinners(tournamentId, phaseLevel);
  console.log(`${winners.length} gagnants qualifiés pour Phase ${phaseLevel + 1}`);
  
  // 3. Notification Rectorat (pas auto activation)
  alert(`Phase ${phaseLevel} clôturée. ${winners.length} qualifiés. Activez Phase ${phaseLevel + 1} manuellement.`);
}

async function activatePhase(tournamentId, phaseLevel) {
  // 1. Récupérer qualifiés phase précédente
  const qualified = await getPhaseWinners(tournamentId, phaseLevel - 1);
  
  // 2. Créer groupes automatiquement
  const groups = await createPhaseGroups(tournamentId, phaseLevel, qualified);
  
  // 3. Activer phase
  await updatePhase(tournamentId, phaseLevel, { status: 'active' });
  
  // 4. Notifier profs
  await notifyTeachers(groups, `Phase ${phaseLevel} activée`);
}
```

---

## 🚀 IMPLÉMENTATION (Prochaines étapes)

### **1. Backend**
- [ ] `server/core/BattleRoyaleEngine.js` (moteur commun)
- [ ] `server/modes/TrainingMode.js` (spécialisation)
- [ ] `server/modes/TournamentMode.js` (spécialisation)
- [ ] Routes API licences
- [ ] Routes API progression tournoi

### **2. Frontend**
- [ ] UI prof switch 2 modes
- [ ] Sélection élèves + vérification licences
- [ ] Dashboard Rectorat progression manuelle
- [ ] Notifications qualifications

### **3. Tests**
- [ ] Test Mode Entraînement (licences, stats)
- [ ] Test Mode Tournoi (4 phases, progression manuelle)
- [ ] Test unité moteur Battle Royale
- [ ] Test intégration 2 modes

---

**Auteur:** Marius VERIN + Cascade  
**Date:** 2 janvier 2026  
**Status:** Spécification validée - Attente implémentation
