# GUIDE COMPLET - Copier Arena → Training

## FICHIER FRONTEND: `TrainingArenaGame.js`

### ✅ CE QUI EST DÉJÀ IDENTIQUE (ne pas toucher):
- Lignes 1-30: Imports, états React
- Lignes 198-223: handleZoneClick
- Lignes 349-390: playCorrectSound, playErrorSound, animations
- Lignes 392-489: handleZoneClickFromRenderer, render UI/HUD

---

## 🔴 DIFFÉRENCES À CORRIGER MANUELLEMENT

### DIFFÉRENCE #1 - Ligne 33
**Arena:**
```js
const gameInfo = JSON.parse(localStorage.getItem('cc_crazy_arena_game') || '{}');
```

**Training ACTUEL:**
```js
const gameInfo = JSON.parse(localStorage.getItem('cc_training_arena_game') || '{}');
```

**⚠️ NE PAS MODIFIER** - Les clés localStorage doivent rester différentes.

---

### DIFFÉRENCE #2 - Lignes 82-93 (Socket join)
**Arena:**
```js
socket.emit('arena:join', {
  matchId: gameInfo.matchId,
  studentData: {
    studentId: gameInfo.myStudentId,
    name: gameInfo.players.find(p => p.studentId === gameInfo.myStudentId)?.name || 'Joueur',
    avatar: '/avatars/default.png'
  }
}, (response) => {
  if (response?.ok) {
    console.log('[CrazyArena] ✅ Rejoint la room du match pour recevoir événements');
  }
});
```

**Training DOIT ÊTRE:**
```js
socket.emit('training:join', {
  matchId: gameInfo.matchId,
  studentData: {
    studentId: gameInfo.myStudentId,
    name: gameInfo.players.find(p => p.studentId === gameInfo.myStudentId)?.name || 'Joueur',
    avatar: '/avatars/default.png'
  }
}, (response) => {
  if (response?.ok) {
    console.log('[TrainingArena] ✅ Rejoint la room du match pour recevoir événements');
  }
});
```

---

### DIFFÉRENCE #3 - Lignes 96-98 (Scores update)
**Arena:**
```js
socket.on('arena:scores-update', ({ scores }) => {
  setPlayers(scores);
});
```

**Training DOIT ÊTRE:**
```js
socket.on('training:scores-update', ({ scores }) => {
  setPlayers(scores);
});
```

---

### DIFFÉRENCE #4 - Lignes 100-121 (Tie detected)
**Arena:**
```js
socket.on('arena:tie-detected', ({ tiedPlayers, message }) => {
  console.log('[CrazyArena] ⚖️ Égalité détectée !', tiedPlayers);
  // ... reste du code
  overlay.id = 'crazy-arena-tie';
  // ... reste
});
```

**Training DOIT ÊTRE:**
```js
socket.on('training:tie-detected', ({ tiedPlayers, message }) => {
  console.log('[TrainingArena] ⚖️ Égalité détectée !', tiedPlayers);
  // ... reste du code
  overlay.id = 'training-arena-tie';
  // ... reste
});
```

---

### DIFFÉRENCE #5 - Lignes 123-130 (Tiebreaker start)
**Arena:**
```js
socket.on('arena:tiebreaker-start', ({ zones: newZones, duration, tiedPlayers }) => {
  console.log('[CrazyArena] 🔄 Démarrage manche de départage !');
  setZones(newZones);
  setTimeLeft(duration);
  setGameEnded(false);
  setSelectedZones([]);
  alert(`🔄 MANCHE DE DÉPARTAGE !\n\n${tiedPlayers.map(p => p.name).join(' vs ')}\n\n3 nouvelles cartes - 30 secondes !`);
});
```

**Training DOIT ÊTRE:**
```js
socket.on('training:tiebreaker-start', ({ zones: newZones, duration, tiedPlayers }) => {
  console.log('[TrainingArena] 🔄 Démarrage manche de départage !');
  setZones(newZones);
  setTimeLeft(duration);
  setGameEnded(false);
  setSelectedZones([]);
  alert(`🔄 MANCHE DE DÉPARTAGE !\n\n${tiedPlayers.map(p => p.name).join(' vs ')}\n\n3 nouvelles cartes - 30 secondes !`);
});
```

---

### DIFFÉRENCE #6 - Lignes 132-142 (Game end)
**Arena:**
```js
socket.on('arena:game-end', ({ ranking: finalRanking, winner: finalWinner, isTiebreaker }) => {
  console.log('[CrazyArena] Partie terminée !', finalWinner);
  setGameEnded(true);
  setRanking(finalRanking);
  setWinner(finalWinner);
  
  setTimeout(() => {
    showPodium(finalRanking, finalWinner, isTiebreaker);
  }, 1000);
});
```

**Training DOIT ÊTRE:**
```js
socket.on('training:game-end', ({ ranking: finalRanking, winner: finalWinner, isTiebreaker }) => {
  console.log('[TrainingArena] Partie terminée !', finalWinner);
  setGameEnded(true);
  setRanking(finalRanking);
  setWinner(finalWinner);
  
  setTimeout(() => {
    showPodium(finalRanking, finalWinner, isTiebreaker);
  }, 1000);
});
```

---

### DIFFÉRENCE #7 - Lignes 145-170 (Round new) ✅ DÉJÀ CORRIGÉE
**Arena:**
```js
socket.on('arena:round-new', ({ zones: newZones, roundIndex, totalRounds, timestamp }) => {
  console.log('[CrazyArena] 🎯 Nouvelle carte reçue:', { 
    zonesCount: newZones?.length,
    roundIndex, 
    totalRounds 
  });
  
  if (newZones && Array.isArray(newZones)) {
    setZones(newZones);
    setSelectedZones([]);
    
    // ✅ CRITIQUE: Reconstruire calcAngles depuis zones.angle
    try {
      const angles = {};
      newZones.forEach(z => {
        if ((z.type === 'calcul' || z.type === 'chiffre') && typeof z.angle === 'number') {
          angles[z.id] = z.angle;
        }
      });
      setCalcAngles(angles);
      console.log('[CrazyArena] ✅ Carte + angles mis à jour:', newZones.length, 'zones');
    } catch (e) {
      console.warn('[CrazyArena] Erreur reconstruction angles:', e);
    }
  }
});
```

**Training DÉJÀ CORRECT** (commit 153f8aa)

---

### DIFFÉRENCE #8 - Lignes 173-175 (Timer tick) ✅ DÉJÀ CORRECT
**Arena:**
```js
socket.on('arena:timer-tick', ({ timeLeft: serverTimeLeft }) => {
  setTimeLeft(serverTimeLeft);
});
```

**Training DÉJÀ CORRECT**

---

### DIFFÉRENCE #9 - Lignes 178-190 (Pair validated sync) ✅ DÉJÀ CORRECT
**Arena:**
```js
socket.on('arena:pair-validated', ({ studentId, playerName, pairId, zoneAId, zoneBId }) => {
  console.log('[CrazyArena] 🎯 Paire validée par', playerName, ':', pairId);
  
  setZones(prevZones => {
    return prevZones.map(z => {
      if (z.id === zoneAId || z.id === zoneBId) {
        return { ...z, validated: true };
      }
      return z;
    });
  });
});
```

**Training DÉJÀ CORRECT**

---

### DIFFÉRENCE #10 - Lignes 250-270 (Emit pair-validated) ✅ DÉJÀ CORRECT
**Arena:**
```js
// Notifier le serveur
socketRef.current?.emit('arena:pair-validated', {
  studentId: myStudentId,
  isCorrect: true,
  timeMs
});
```

**Training DÉJÀ CORRECT** (commit b62fba6)

---

### DIFFÉRENCE #11 - Lignes 277-346 (showPodium overlay ID)
**Arena:**
```js
overlay.id = 'crazy-arena-podium';
// ... reste
navigate('/tournament/setup');
```

**Training DOIT ÊTRE:**
```js
overlay.id = 'training-arena-podium';
// ... reste
navigate('/training/setup');  // ⚠️ Navigation différente
```

---

## RÉSUMÉ DES MODIFICATIONS À FAIRE

### À REMPLACER DANS TrainingArenaGame.js:

1. **Tous les `arena:` → `training:`** dans les événements socket
2. **Tous les `[CrazyArena]` → `[TrainingArena]`** dans les console.log
3. **`'crazy-arena-podium'` → `'training-arena-podium'`**
4. **`'crazy-arena-tie'` → `'training-arena-tie'`**
5. **`navigate('/tournament/setup')` → `navigate('/training/setup')`**

---

## FICHIER BACKEND: `server.js` ✅ DÉJÀ CORRECT

Handler ligne 1376-1378 DÉJÀ correct:
```js
socket.on('training:pair-validated', (data) => {
  crazyArena.trainingPairValidated(socket, data);
});
```

---

## FICHIER BACKEND: `crazyArenaManager.js` ✅ DÉJÀ CORRECT

Signature ligne 640 DÉJÀ correcte:
```js
trainingPairValidated(socket, data) {
  const matchId = this.playerMatches.get(socket.id);
  // ... reste identique à pairValidated()
}
```

---

## ✅ BUGS DÉJÀ CORRIGÉS (NE PAS TOUCHER)

- ✅ BUG #40: Sanitization supprime zones (serverZoneGenerator.js)
- ✅ BUG #41: trainingEndGame → endTrainingGame
- ✅ BUG #42: player.score aligné
- ✅ BUG #43: calcAngles reconstruction
- ✅ Payload simple (studentId, isCorrect, timeMs)

---

## 🎯 ACTION FINALE

**SI VOUS VOULEZ LE FAIRE MANUELLEMENT:**

1. Ouvrir `src/components/Training/TrainingArenaGame.js`
2. Chercher/Remplacer globalement:
   - `arena:` → `training:`
   - `[CrazyArena]` → `[TrainingArena]`
   - `crazy-arena-` → `training-arena-`
3. Ligne 344: Changer `/tournament/setup` → `/training/setup`

**⚠️ SAUF:**
- Ligne 33: Garder `cc_training_arena_game` (NE PAS changer en arena)
- Imports ligne 1-12: Ne pas toucher

---

**Voulez-vous que je fasse ces remplacements automatiquement ou préférez-vous le faire manuellement?**
