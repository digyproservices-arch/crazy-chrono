# 🧪 TEST CRAZY ARENA - MODE 4 JOUEURS

**Date :** 8 décembre 2025  
**Objectif :** Tester le jeu Crazy Arena avec 4 joueurs simultanés

---

## 🎯 FONCTIONNALITÉS À TESTER

### ✅ **ÉTAPE 1 : Créer un groupe et lancer un match**

**URL :** `https://app.crazy-chrono.com/tournament/setup` (ou `http://localhost:3000/tournament/setup`)

**Actions :**
1. Se connecter comme enseignant
2. Créer un nouveau groupe de 4 élèves
3. Cliquer sur "Lancer le match"
4. Noter le code de salle (ex: `ABC123`)

**Résultat attendu :**
- ✅ Popup affiche le code de salle
- ✅ Redirection vers `/crazy-arena/lobby/ABC123`

---

### ✅ **ÉTAPE 2 : Lobby - 4 joueurs rejoignent**

**Simulation avec 4 onglets/navigateurs :**

**Onglet 1 (Joueur 1) :**
```javascript
// Dans la console (F12)
localStorage.setItem('cc_student_id', 's001');
localStorage.setItem('cc_student_name', 'Alice');
// Puis aller sur: /crazy-arena/lobby/ABC123
```

**Onglet 2 (Joueur 2) :**
```javascript
localStorage.setItem('cc_student_id', 's002');
localStorage.setItem('cc_student_name', 'Bob');
// Puis aller sur: /crazy-arena/lobby/ABC123
```

**Onglet 3 (Joueur 3) :**
```javascript
localStorage.setItem('cc_student_id', 's003');
localStorage.setItem('cc_student_name', 'Charlie');
// Puis aller sur: /crazy-arena/lobby/ABC123
```

**Onglet 4 (Joueur 4) :**
```javascript
localStorage.setItem('cc_student_id', 's004');
localStorage.setItem('cc_student_name', 'Diana');
// Puis aller sur: /crazy-arena/lobby/ABC123
```

**Résultat attendu :**
- ✅ Chaque joueur voit la liste des 4 joueurs
- ✅ Compteur affiche "4/4 joueurs"
- ✅ Countdown démarre automatiquement (3...2...1...)
- ✅ Redirection vers `/crazy-arena/game` pour tous

---

### ✅ **ÉTAPE 3 : Jeu - Interface et interactions**

**Ce que chaque joueur devrait voir :**

**HUD (en haut à droite) :**
```
🏆 Classement
🥇 Alice   10
🥈 Bob     8
🥉 Charlie 5
🏅 Diana   3
```

**Timer (en haut au centre) :**
```
0:60  →  0:59  →  0:58  →  ...  →  0:00
```

**Carte SVG :**
- Zones cliquables (16 zones affichées)
- Zones de calculs : `3 × 5`, `2 × 2`, etc.
- Zones de chiffres : `15`, `20`, `12`, etc.
- Zones d'images : Fruits, plantes (doivent s'afficher maintenant !)
- Zones de textes : Noms des plantes

**Résultat attendu :**
- ✅ Les 4 joueurs voient la **même carte**
- ✅ Les zones sont cliquables
- ✅ Sélection de 2 zones → validation automatique
- ✅ Si paire correcte :
  - ✅ Son de succès
  - ✅ Zones disparaissent
  - ✅ Score +10 pour le joueur
  - ✅ Mise à jour du classement en temps réel
- ✅ Si paire incorrecte :
  - ✅ Son d'erreur
  - ✅ Zones restent
  - ✅ Score -2 pour le joueur

---

### ✅ **ÉTAPE 4 : Fin de partie - Podium**

**Après 60 secondes (ou quand toutes les paires sont validées) :**

**Résultat attendu :**
- ✅ Écran violet avec gradient
- ✅ Titre "🏆 Partie Terminée !"
- ✅ Nom du vainqueur en jaune
- ✅ Podium des 4 joueurs :
  - 🥇 1er place (bordure dorée)
  - 🥈 2ème place
  - 🥉 3ème place
  - 🏅 4ème place
- ✅ Statistiques :
  - Score final
  - Nombre de paires validées
  - Nombre d'erreurs
- ✅ Bouton "Retour au menu"

---

## 🔍 VÉRIFICATIONS TECHNIQUES

### **1. Console (F12) - Logs attendus**

**Lors de la connexion au lobby :**
```
[CrazyArena] Connecté au serveur
[CrazyArena] 4/4 joueurs connectés
[CrazyArena] Countdown démarré pour match XYZ
```

**Pendant le jeu :**
```
[CrazyArena] Connecté pour la partie
[CrazyArena] Bonne paire validée ! {...}
[CrazyArena] Mauvaise paire {...}
```

**Fin de partie :**
```
[CrazyArena] Partie terminée ! {winner: {...}}
```

---

### **2. Network (F12) - Socket.IO events**

**Events émis par le client :**
- `arena:join` - Rejoindre le match
- `arena:ready` - Marquer prêt
- `arena:pair-validated` - Valider une paire

**Events reçus par le client :**
- `arena:player-joined` - Joueur a rejoint
- `arena:countdown` - Countdown (3, 2, 1, 0)
- `arena:game-start` - Début de partie (avec zones)
- `arena:scores-update` - Mise à jour scores
- `arena:game-end` - Fin de partie (avec ranking)

---

### **3. Backend (Terminal serveur) - Logs attendus**

```bash
[CrazyArena] Match créé: match_123 (code: ABC123)
[CrazyArena] Alice a rejoint le match match_123 (1/4)
[CrazyArena] Bob a rejoint le match match_123 (2/4)
[CrazyArena] Charlie a rejoint le match match_123 (3/4)
[CrazyArena] Diana a rejoint le match match_123 (4/4)
[CrazyArena] Countdown démarré pour match match_123
[CrazyArena] Partie démarrée pour match match_123
[CrazyArena] Partie terminée pour match match_123
[CrazyArena] Résultats sauvegardés: {...}
[CrazyArena] Match match_123 nettoyé
```

---

## 🐛 PROBLÈMES POSSIBLES

### **Problème 1 : Images ne s'affichent pas**
**Symptôme :** Zones d'images vides (fond flou)  
**Solution :** Vérifier que `vercel.json` contient la route `/images/` (commit `3dafce5`)

### **Problème 2 : Zones ne chargent pas**
**Symptôme :** Carte vide, pas de zones  
**Solution :** Vérifier que `zones2.json` est accessible (commit `0329203`)

### **Problème 3 : Scores ne se mettent pas à jour**
**Symptôme :** Classement figé  
**Solution :** Vérifier les logs Socket.IO (`arena:scores-update`)

### **Problème 4 : Joueur ne peut pas rejoindre**
**Symptôme :** Erreur "Match introuvable"  
**Solution :** Vérifier que le `matchId` est correct dans localStorage

---

## ✅ CHECKLIST DE TEST COMPLÈTE

- [ ] **Lobby :**
  - [ ] 4 joueurs peuvent rejoindre
  - [ ] Liste des joueurs affichée
  - [ ] Countdown automatique à 4/4
  - [ ] Redirection vers /crazy-arena/game

- [ ] **Interface de jeu :**
  - [ ] Carte SVG affichée
  - [ ] 16 zones visibles et cliquables
  - [ ] Images s'affichent dans les zones
  - [ ] Calculs et chiffres affichés
  - [ ] Timer compte à rebours
  - [ ] Classement affiché (4 joueurs)

- [ ] **Gameplay :**
  - [ ] Clic sur 2 zones → validation
  - [ ] Paire correcte → +10 points
  - [ ] Paire incorrecte → -2 points
  - [ ] Scores se mettent à jour en temps réel
  - [ ] Classement se met à jour automatiquement
  - [ ] Zones validées disparaissent

- [ ] **Fin de partie :**
  - [ ] Podium s'affiche après timer
  - [ ] Vainqueur affiché en jaune
  - [ ] Classement complet (4 joueurs)
  - [ ] Statistiques correctes
  - [ ] Bouton "Retour" fonctionne

---

## 🚀 COMMANDES UTILES

### **Démarrer en local**
```bash
# Frontend
npm start

# Backend (dans un autre terminal)
cd server
node server.js
```

### **Nettoyer localStorage (si problème)**
```javascript
// Dans la console (F12)
localStorage.clear();
```

### **Simuler 4 joueurs sur 1 PC**
1. **Chrome normal** → Joueur 1
2. **Chrome incognito** → Joueur 2
3. **Firefox** → Joueur 3
4. **Edge** → Joueur 4

---

## 📊 RÉSULTATS ATTENDUS

**Temps de test estimé :** 15-20 minutes

**Si tous les tests passent :**
✅ Le mode Crazy Arena est **FONCTIONNEL**  
✅ Prêt pour la démo Rectorat (22/12/2025)

**Prochaine étape :**
- Améliorer l'UI (animations, sons, effets visuels)
- Ajouter le Dashboard Enseignant
- Tests de performance avec 10+ matchs simultanés

---

**Dernière mise à jour :** 8 décembre 2025, 14h15  
**Commits :** `3dafce5`, `3ca2220`
