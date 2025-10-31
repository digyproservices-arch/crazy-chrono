# 🔒 RÈGLES CRITIQUES - CRAZY CHRONO

> **ATTENTION** : Ce document contient les règles critiques du projet qui ne doivent JAMAIS être violées.
> **Date de création** : 31 octobre 2025
> **Commit de référence stable** : a7665f5 (fix-lobby)

---

## ⚠️ RÈGLE #1 : NE JAMAIS CASSER LE MODE SOLO

### Architecture du Mode Solo (FONCTIONNELLE - NE PAS TOUCHER)

**1. Génération côté CLIENT uniquement**
- Le mode solo utilise `src/utils/elementsLoader.js` pour charger et générer les zones
- Fichiers de données utilisés : `public/data/elements.json` et `public/data/associations.json`
- La génération est 100% locale, aucune dépendance au serveur

**2. Filtrage par thématiques**
- L'utilisateur peut sélectionner des thématiques (botanique, mathématiques, etc.)
- Le système filtre les éléments selon les thématiques choisies
- Les associations respectent les thématiques sélectionnées

**3. Système d'associations**
- `associations.json` contient :
  - `textes[]` : Contenus texte avec id, content, themes, levelClass
  - `images[]` : URLs d'images avec id, url, themes, levelClass
  - `calculs[]` : Expressions mathématiques avec id, content
  - `chiffres[]` : Nombres avec id, content
  - `associations[]` : Relations entre éléments (texteId/imageId ou calculId/chiffreId)
- Le client génère les paires correctes basées sur ces associations

**4. Fichiers critiques du mode solo**
- `src/utils/elementsLoader.js` : Logique de chargement et génération
- `public/data/elements.json` : Données des éléments
- `public/data/associations.json` : Définition des associations et thématiques
- `src/components/Carte.js` : Gestion du jeu (mais fallback sur génération locale si pas de zones serveur)

### 🚫 INTERDICTIONS ABSOLUES - MODE SOLO

1. **NE JAMAIS forcer le mode solo à utiliser des zones générées par le serveur**
2. **NE JAMAIS modifier `elementsLoader.js` sans tests exhaustifs du mode solo**
3. **NE JAMAIS toucher à la structure de `associations.json` sans vérifier l'impact sur le client**
4. **NE JAMAIS supposer que le serveur gère le mode solo** - il ne le fait PAS et ne doit PAS le faire

### ✅ Règle de sécurité avant toute modification

**AVANT de modifier quoi que ce soit lié aux zones, associations ou génération :**
1. Identifier si le changement affecte le mode solo
2. Si OUI, demander confirmation explicite à l'utilisateur
3. Tester le mode solo AVANT de pousser
4. Si le mode solo casse, REVERT immédiatement

### Mode Multijoueur vs Mode Solo

**Mode Solo** :
- Génération CLIENT-SIDE via `elementsLoader.js`
- Utilise `public/data/`
- Filtrage par thématiques actif
- Aucune communication serveur pour la génération de zones

**Mode Multijoueur** :
- Peut utiliser génération SERVER-SIDE (si implémentée correctement)
- Utilise `server/data/` (copie des fichiers)
- Synchronisation entre joueurs requise
- Communication Socket.IO

---

## 🎮 RÈGLE #2 : RÈGLES DU JEU (LOGIQUE FONDAMENTALE)

### Objectif du jeu
Trouver **UNE SEULE paire correcte** parmi plusieurs zones affichées sur une carte circulaire avant la fin du chronomètre.

### Types de zones
1. **Image** : Affiche une image (URL depuis `associations.json`)
2. **Texte** : Affiche du texte (contenu depuis `associations.json`)
3. **Calcul** : Affiche une opération mathématique (ex: "3 × 4")
4. **Chiffre** : Affiche un nombre (ex: "12")

### Types de paires valides
1. **Image ↔ Texte** : Une image associée à son texte descriptif
   - Exemple : Image de "Cannelle" ↔ Texte "Cannelle"
2. **Calcul ↔ Chiffre** : Une opération mathématique associée à son résultat
   - Exemple : Calcul "3 × 4" ↔ Chiffre "12"

### Règles de validation d'une paire

**Une paire est CORRECTE si et seulement si :**
1. Les deux zones ont le **même `pairId`** (non vide)
2. Les types sont compatibles :
   - `image` + `texte` OU `texte` + `image`
   - `calcul` + `chiffre` OU `chiffre` + `calcul`

**Code de validation (ligne 1811 de Carte.js) :**
```javascript
const allowed = (x, y) => 
  (x === 'image' && y === 'texte') || 
  (x === 'texte' && y === 'image') || 
  (x === 'calcul' && y === 'chiffre') || 
  (x === 'chiffre' && y === 'calcul');

const p1 = getPairId(ZA);
const p2 = getPairId(ZB);
const basicOk = ZA && ZB && allowed(t1, t2) && p1 && p2 && (p1 === p2);
```

### Génération de carte (Mode Solo)

**Principe fondamental : UNE SEULE paire correcte par carte**

1. **Placement de la paire correcte** (lignes 168-201 de elementsLoader.js) :
   - Choisir aléatoirement entre paire Image-Texte OU Calcul-Chiffre
   - Sélectionner une association valide depuis `associations.json`
   - Placer les deux zones avec le même `pairId`

2. **Placement des distracteurs** (lignes 203-242 de elementsLoader.js) :
   - Remplir les zones restantes avec des éléments qui :
     - **NE forment PAS de paire** avec les éléments déjà placés
     - **N'ont PAS de `pairId`** (ou `pairId` vide)
     - Ne créent aucune autre association valide

3. **Filtrage par thématiques** (lignes 25-70 de elementsLoader.js) :
   - Respecter les thématiques sélectionnées (botanique, mathématiques, etc.)
   - Respecter les niveaux de classe (CP, CE1, CE2, etc.)
   - Filtrer les éléments ET les associations selon ces critères

### Système de `pairId`

**Format des `pairId` :**
- Image-Texte : `assoc-img-{imageId}-txt-{texteId}`
- Calcul-Chiffre : `assoc-calc-{calculId}-num-{chiffreId}`

**Exemple :**
```json
Zone Image: { 
  "id": 123, 
  "type": "image", 
  "content": "images/cannelle.jpg", 
  "pairId": "assoc-img-i3-txt-t1" 
}

Zone Texte: { 
  "id": 456, 
  "type": "texte", 
  "content": "Cannelle", 
  "pairId": "assoc-img-i3-txt-t1" 
}
```

### Progression du jeu

1. **Début de manche** : Génération d'une nouvelle carte avec 1 paire correcte
2. **Joueur clique sur 2 zones** : Validation de la paire
3. **Si correcte** :
   - ✅ Affichage "Bravo !"
   - ✅ Son de succès + confettis
   - ✅ Score +1
   - ✅ Le `pairId` est ajouté au Set des paires validées
   - ✅ Nouvelle carte générée (excluant les paires déjà validées)
4. **Si incorrecte** :
   - ❌ Affichage "Mauvaise association"
   - ❌ Croix rouge + son d'erreur
   - ❌ Pas de changement de score
   - ❌ Même carte conservée

### Exclusion des paires validées

**Principe** : Une fois une paire validée, elle ne doit plus apparaître dans les manches suivantes.

**Implémentation** (lignes 72-86 de elementsLoader.js) :
```javascript
if (excludedPairIds && excludedPairIds.size > 0) {
  associations = associations.filter(a => {
    const pairId = buildPairId(a);
    return !pairId || !excludedPairIds.has(pairId);
  });
}
```

### 🚫 INTERDICTIONS ABSOLUES - RÈGLES DU JEU

1. **NE JAMAIS placer plus d'une paire correcte** sur une carte
2. **NE JAMAIS créer de distracteurs** qui forment accidentellement une paire valide
3. **NE JAMAIS modifier la logique de validation** sans comprendre l'impact complet
4. **NE JAMAIS ignorer les `pairId`** - ils sont essentiels au fonctionnement
5. **NE JAMAIS mélanger les types incompatibles** (ex: image + calcul)

### ✅ Règles de cohérence

1. **Toute zone avec un `pairId` non vide DOIT avoir exactement une zone partenaire** avec le même `pairId`
2. **Les distracteurs ne doivent JAMAIS avoir de `pairId`** (ou `pairId` vide)
3. **Le filtrage par thématiques doit être respecté** à tous les niveaux (éléments + associations)
4. **Une paire validée ne doit JAMAIS réapparaître** dans la même session

---

## 📁 FICHIERS CRITIQUES À PROTÉGER

### Mode Solo
- `src/utils/elementsLoader.js` : Génération de cartes (mode solo)
- `src/components/Carte.js` : Logique de validation et gameplay
- `public/data/associations.json` : Données sources (éléments + associations)
- `public/data/elements.json` : Données des éléments (legacy, peut-être obsolète)

### Mode Multijoueur
- `server/server.js` : Logique serveur (Socket.IO, rooms, génération)
- `server/data/associations.json` : Copie des données pour le serveur
- `server/data/zones2.json` : Template des zones

---

## 🔄 COMMITS DE RÉFÉRENCE

- **a7665f5** (fix-lobby) : Version stable où le mode solo et les règles fonctionnent parfaitement
- En cas de problème grave, revenir à ce commit

---

## ⚠️ LEÇON APPRISE

L'utilisateur investit temps et argent dans ce projet. **Casser le mode solo qui fonctionnait pour tenter de fixer le multijoueur était une ERREUR GRAVE.** 

**Toujours privilégier la stabilité de ce qui fonctionne.**

---

## 📝 PROCÉDURE AVANT TOUTE MODIFICATION

**CHECKLIST OBLIGATOIRE :**

- [ ] Est-ce que cette modification touche aux zones, associations ou génération ?
- [ ] Est-ce que cela peut affecter le mode solo ?
- [ ] Ai-je demandé confirmation explicite à l'utilisateur ?
- [ ] Ai-je testé le mode solo après la modification ?
- [ ] Ai-je un plan de rollback si ça casse ?

**SI UNE SEULE RÉPONSE EST "NON" OU "JE NE SAIS PAS" → NE PAS PROCÉDER**

---

## 🆘 EN CAS DE PROBLÈME

1. **STOP** immédiatement toute modification
2. **REVERT** au dernier commit stable (a7665f5)
3. **ANALYSER** ce qui a cassé
4. **DEMANDER** confirmation à l'utilisateur avant de réessayer
5. **TESTER** exhaustivement en mode solo avant de pousser

---

**Dernière mise à jour** : 31 octobre 2025, 23h37
**Auteur** : Cascade AI (sur demande de l'utilisateur)
**Statut** : DOCUMENT CRITIQUE - NE PAS SUPPRIMER
