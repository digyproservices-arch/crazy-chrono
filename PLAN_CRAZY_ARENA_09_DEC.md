# 🏆 PLAN DE TRAVAIL - CRAZY ARENA (9 DÉCEMBRE 2025)

**🎯 OBJECTIF DU JOUR :**
- Renommer "Battle Royale" → "Crazy Arena" partout
- Finaliser le lobby Crazy Arena (connexion 4 joueurs)
- Tester la synchronisation Socket.IO

**📅 CONTEXTE :** Préparation présentation Rectorat 22/12/2025

---

## 📊 VOCABULAIRE OFFICIEL CRAZY CHRONO

| Mode | Nom | Icône |
|------|-----|-------|
| 1 joueur | **Crazy Solo** | 🏃 |
| 2 joueurs | **Crazy Duel** | ⚔️ |
| 4 joueurs | **Crazy Arena** | 🏆 |
| Gagnants | **Crazy Winner** | 🏅 |

---

## ✅ ÉTAPE 1 : RENOMMAGE DES FICHIERS (Composants React)

### **Frontend - Composants**

- [ ] `src/components/Tournament/BattleRoyaleSetup.js` → `CrazyArenaSetup.js`
- [ ] `src/components/Tournament/BattleRoyaleLobby.js` → `CrazyArenaLobby.js`
- [ ] `src/components/Tournament/BattleRoyaleGame.js` → `CrazyArenaGame.js`

### **Backend - Managers**

- [ ] `server/battleRoyaleManager.js` → `crazyArenaManager.js`

---

## ✅ ÉTAPE 2 : RENOMMAGE DES RÉFÉRENCES DANS LE CODE

### **Frontend**

**Fichier : `src/App.js`**
- [ ] Import `BattleRoyaleSetup` → `CrazyArenaSetup`
- [ ] Import `BattleRoyaleLobby` → `CrazyArenaLobby`
- [ ] Import `BattleRoyaleGame` → `CrazyArenaGame`
- [ ] Route `/battle-royale/lobby/:roomCode` → `/crazy-arena/lobby/:roomCode`
- [ ] Route `/battle-royale/game` → `/crazy-arena/game`

**Fichier : `src/components/Tournament/CrazyArenaSetup.js`**
- [ ] Tous les `[BattleRoyale]` → `[CrazyArena]` (console.log)
- [ ] `cc_battle_royale_match` → `cc_crazy_arena_match` (localStorage)
- [ ] Texte "Battle Royale" → "Crazy Arena"
- [ ] Route navigation `/battle-royale/lobby/` → `/crazy-arena/lobby/`

**Fichier : `src/components/Tournament/CrazyArenaLobby.js`**
- [ ] `[BattleRoyale]` → `[CrazyArena]` (console.log)
- [ ] `cc_battle_royale_match` → `cc_crazy_arena_match` (localStorage)
- [ ] `cc_battle_royale_game` → `cc_crazy_arena_game` (localStorage)
- [ ] Texte "🏆 Battle Royale" → "🏆 Crazy Arena"
- [ ] Route navigation `/battle-royale/game` → `/crazy-arena/game`
- [ ] Événements Socket.IO `battle:*` → `arena:*`

**Fichier : `src/components/Tournament/CrazyArenaGame.js`**
- [ ] Tous les `[BattleRoyale]` → `[CrazyArena]`
- [ ] `cc_battle_royale_game` → `cc_crazy_arena_game`
- [ ] Événements Socket.IO `battle:*` → `arena:*`

### **Backend**

**Fichier : `server/server.js`**
- [ ] Import `battleRoyaleManager` → `crazyArenaManager`
- [ ] Variable `battleRoyale` → `crazyArena`
- [ ] `global.battleRoyale` → `global.crazyArena`
- [ ] Commentaires "Battle Royale" → "Crazy Arena"
- [ ] Événements Socket.IO `battle:*` → `arena:*`

**Fichier : `server/crazyArenaManager.js`**
- [ ] Classe `BattleRoyaleManager` → `CrazyArenaManager`
- [ ] Tous les `[BattleRoyale]` → `[CrazyArena]` (console.log)
- [ ] Événements Socket.IO `battle:*` → `arena:*`
- [ ] Commentaires

**Fichier : `server/routes/tournament.js`**
- [ ] `global.battleRoyale` → `global.crazyArena`
- [ ] Commentaires "Battle Royale" → "Crazy Arena"
- [ ] Console.log messages

---

## ✅ ÉTAPE 3 : ÉVÉNEMENTS SOCKET.IO (Liste complète)

**Renommer :**
```
battle:join          → arena:join
battle:error         → arena:error
battle:player-joined → arena:player-joined
battle:player-ready  → arena:player-ready
battle:player-left   → arena:player-left
battle:ready         → arena:ready
battle:countdown     → arena:countdown
battle:game-start    → arena:game-start
battle:pair-found    → arena:pair-found
battle:pair-error    → arena:pair-error
battle:score-update  → arena:score-update
battle:game-end      → arena:game-end
```

---

## ✅ ÉTAPE 4 : TESTS DE VALIDATION

### **Test 1 : Compilation**
```bash
npm start
```
- [ ] Pas d'erreur de compilation
- [ ] Pas de warning sur imports

### **Test 2 : Navigation**
- [ ] `/tournament/setup` → Page s'affiche
- [ ] Texte "Crazy Arena" visible (pas "Battle Royale")
- [ ] Création de groupe fonctionne

### **Test 3 : Lancement de match**
- [ ] Clic "Lancer le match" fonctionne
- [ ] Popup affiche "Match créé"
- [ ] Redirection vers `/crazy-arena/lobby/XXXXX`

### **Test 4 : Lobby**
- [ ] Page lobby s'affiche
- [ ] Titre "🏆 Crazy Arena" visible
- [ ] Code de salle affiché
- [ ] "0/4 joueurs connectés"

### **Test 5 : Socket.IO (Console)**
- [ ] Connexion Socket.IO réussie
- [ ] Événement `arena:join` émis
- [ ] Événement `arena:player-joined` reçu
- [ ] Pas d'erreur "Match introuvable"

---

## 📦 COMMITS PLANIFIÉS

### **Commit 1 : Renommage des fichiers**
```bash
git mv src/components/Tournament/BattleRoyaleSetup.js src/components/Tournament/CrazyArenaSetup.js
git mv src/components/Tournament/BattleRoyaleLobby.js src/components/Tournament/CrazyArenaLobby.js
git mv src/components/Tournament/BattleRoyaleGame.js src/components/Tournament/CrazyArenaGame.js
git mv server/battleRoyaleManager.js server/crazyArenaManager.js
git commit -m "refactor: Rename BattleRoyale files to CrazyArena"
```

### **Commit 2 : Renommage frontend (React)**
```bash
git add src/
git commit -m "refactor(frontend): Rename Battle Royale → Crazy Arena in React components

- Update imports in App.js
- Update routes (/battle-royale → /crazy-arena)
- Update localStorage keys (cc_battle_royale → cc_crazy_arena)
- Update all console.log messages
- Update UI text to 'Crazy Arena'
- Update Socket.IO events (battle:* → arena:*)

Preparation for Rectorat presentation 22/12/2025"
```

### **Commit 3 : Renommage backend (Node.js)**
```bash
git add server/
git commit -m "refactor(backend): Rename Battle Royale → Crazy Arena in server

- Rename battleRoyaleManager → crazyArenaManager
- Update global.battleRoyale → global.crazyArena
- Update Socket.IO events (battle:* → arena:*)
- Update console.log messages
- Update comments

Preparation for Rectorat presentation 22/12/2025"
```

---

## 🚨 POINTS D'ATTENTION

### **Ne PAS oublier :**
1. ✅ Routes dans `App.js`
2. ✅ localStorage keys (ancien = nouveau pour compat)
3. ✅ Socket.IO events (côté client ET serveur)
4. ✅ Global variable dans `server.js`
5. ✅ Tous les console.log pour debug

### **Tester impérativement :**
1. ✅ Création de groupe
2. ✅ Lancement de match
3. ✅ Connexion au lobby
4. ✅ Socket.IO events

---

## ⏱️ TIMING ESTIMÉ

- **Renommage fichiers** : 5 min
- **Modifications frontend** : 30 min
- **Modifications backend** : 20 min
- **Tests** : 30 min
- **Debug éventuel** : 30 min

**TOTAL : ~2h**

---

## 📝 NOTES

- Garder une compat temporaire pour `cc_battle_royale_*` dans localStorage
- Vérifier que Render redéploie automatiquement
- Tester en local AVANT de push

---

*Plan créé le 8 décembre 2025, 8h21*
*Objectif : Démo Rectorat 22/12/2025*
