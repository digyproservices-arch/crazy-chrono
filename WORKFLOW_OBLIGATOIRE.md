# 🔒 WORKFLOW OBLIGATOIRE - CRAZY CHRONO

> **RÈGLE D'OR**: AUCUNE modification de code sans valider TOUTES les étapes ci-dessous.

**Date de création**: 16 décembre 2025  
**Objectif**: Éviter les régressions en consultant systématiquement les fichiers racines avant toute modification.

---

## 📚 CARTOGRAPHIE DES FICHIERS RACINES

### 🔴 CRITIQUES (Consulter OBLIGATOIREMENT)

| Fichier | Rôle | Quand consulter |
|---------|------|-----------------|
| **REGLES_CRITIQUES.md** | Règles du jeu (1 paire/carte, mode solo sacré) | TOUTE modification zones/génération/validation |
| **DEBUG_PROCESS.md** | Process systématique de débogage | TOUT bug à corriger |
| **REFONTE_CARTE_ANALYSE.md** | Architecture Carte.js (6109 lignes, rendu) | Modification Carte.js ou rendu SVG |
| **COMMITS_FONCTIONNELS.md** | Liste commits stables (a7665f5 = référence) | Avant rollback ou vérification stabilité |

### 🟡 IMPORTANTS (Consulter selon contexte)

| Fichier | Rôle | Quand consulter |
|---------|------|-----------------|
| **TOURNOI_SPECIFICATIONS.md** | Specs tournoi Crazy Arena (4 joueurs) | Modification mode Arena/tournoi |
| **PLAN_CRAZY_ARENA_09_DEC.md** | Plan renommage Battle Royale → Arena | Modification noms/événements Socket.IO |
| **TEST_CRAZY_ARENA.md** | Plan de test Crazy Arena | Avant déploiement Arena |
| **TRAVAIL_EN_COURS.md** | TODO et travaux en attente | Début de session |

### 🟢 UTILITAIRES (Référence technique)

| Fichier | Rôle | Quand consulter |
|---------|------|-----------------|
| **DEMARRAGE_AUTRE_PC.md** | Setup nouveau PC | Premier lancement projet |
| **RENDER_DEPLOYMENT_GUIDE.md** | Guide déploiement Render | Problèmes déploiement backend |
| **GUIDE_RAPIDE_MIGRATION.md** | Migration BDD/infra | Migration technique |
| **COMPTES_DEMO_RECTORAT.md** | Comptes de démo | Tests avec comptes réels |

### 📊 DOCUMENTATION (Référence business)

| Fichier | Rôle |
|---------|------|
| **BUDGET_MONITORING.md** | Suivi budget Supabase/Render |
| **MIGRATION_LICENCES_PROFESSIONNELLES.md** | Plan migration licences |
| **SENTRY_INSTALLATION.md** | Setup monitoring erreurs |

---

## 🔍 WORKFLOW PRE-CODE (OBLIGATOIRE)

### ✅ ÉTAPE 1: Identifier la zone d'impact (30 secondes)

**Questions à se poser:**

- [ ] **Quel mode?** Solo / Multijoueur / Arena / Tous
- [ ] **Quels fichiers modifiés?** (lister)
- [ ] **Génération zones/associations?** Oui / Non
- [ ] **Socket.IO?** Oui / Non
- [ ] **Rendu SVG/Carte?** Oui / Non

**🚨 Si "Génération zones" = OUI → Lire REGLES_CRITIQUES.md OBLIGATOIRE**

---

### ✅ ÉTAPE 2: Consulter fichiers racines (2-3 minutes)

**Matrice de décision:**

| Si modification concerne... | Alors lire... |
|----------------------------|---------------|
| Zones, associations, génération | **REGLES_CRITIQUES.md** sections 1 & 2 |
| Mode multijoueur | **REFONTE_CARTE_ANALYSE.md** + `server.js` lignes 1200-1300 |
| Mode Arena | **TOURNOI_SPECIFICATIONS.md** + `crazyArenaManager.js` |
| Rendu SVG, Carte.js | **REFONTE_CARTE_ANALYSE.md** lignes 58-139 |
| Bug à corriger | **DEBUG_PROCESS.md** étapes 1-6 |
| Événements Socket.IO | **PLAN_CRAZY_ARENA_09_DEC.md** liste événements |

**🎯 Objectif:** Comprendre les règles AVANT de coder, pas après.

---

### ✅ ÉTAPE 3: Analyser le code existant (2-3 minutes)

**Fichiers sources à lire selon modification:**

| Modification | Fichier source | Lignes clés |
|--------------|----------------|-------------|
| Génération zones multijoueur | `server/utils/serverZoneGenerator.js` | 52-643 |
| Logique paire validée multijoueur | `server/server.js` | 1182-1260 |
| Logique paire validée Arena | `server/crazyArenaManager.js` | 330-386 |
| Rendu zones SVG | `src/components/Carte.js` | 5550-5800 |
| Validation paire client | `src/components/Carte.js` | 2100-2350 |

**Commandes utiles:**
```bash
# Chercher TOUS les usages d'une fonction
grep -rn "generateRoundZones" server/

# Chercher pattern dans frontend
grep -rn "arena:pair-validated" src/
```

**🎯 Objectif:** Comprendre POURQUOI le code actuel fait ça (pattern à respecter).

---

### ✅ ÉTAPE 4: Valider la solution (1 minute)

**Checklist de validation:**

- [ ] **Respecte REGLES_CRITIQUES.md?** (si génération zones)
- [ ] **Suit un pattern existant?** (multijoueur = référence pour Arena)
- [ ] **Ne casse pas mode solo?** (CRITIQUE)
- [ ] **Cohérent avec fichiers racines?**
- [ ] **Incertain?** → Demander confirmation utilisateur AVANT de coder

**🚨 STOP si une réponse = "Non" ou "Incertain"**

---

### ✅ ÉTAPE 5: Présenter analyse PRE-CODE (OBLIGATOIRE)

**Format de réponse imposé:**

```markdown
## 🔍 ANALYSE PRE-CODE

### 📚 Fichiers racines consultés:
- [x] REGLES_CRITIQUES.md (ligne 109: "1 paire par carte")
- [x] REFONTE_CARTE_ANALYSE.md (section génération)
- [ ] Autre: [préciser si applicable]

### 📂 Code source analysé:
- `server/utils/serverZoneGenerator.js` lignes 52-250 (génération 1 paire)
- `server/server.js` lignes 1217-1260 (nouvelle carte après CHAQUE validation)
- `server/crazyArenaManager.js` lignes 330-386 (pairValidated actuel)

### 📖 Règle applicable:
**REGLES_CRITIQUES.md ligne 109:**
> "Principe fondamental : UNE SEULE paire correcte par carte"

**server.js ligne 1230 (multijoueur):**
```javascript
// Nouvelle carte générée IMMÉDIATEMENT après validation
const newZones = generateRoundZones(newSeed, config);
io.to(roomCode).emit('round:new', { zones: newZones });
```

### 💡 Solution proposée:
Arena doit générer nouvelle carte APRÈS CHAQUE validation (pas après 8).
Supprimer calcul `totalPairs` et générer immédiatement comme multijoueur.

### ✅ Justification:
Mode multijoueur (référence stable) génère nouvelle carte après CHAQUE paire.
Arena doit suivre le même pattern pour cohérence.

### ⚠️ Risques identifiés:
- Aucun (suit pattern éprouvé du multijoueur)
- Correction d'un bug (93dbb27 incorrect)

### 🔧 Fichiers à modifier:
1. `server/crazyArenaManager.js` lignes 388-420 (supprimer condition totalPairs)
2. `server/crazyArenaManager.js` ligne 231 (supprimer calcul totalPairs)

**✋ Validez-vous cette approche avant que je code?**
```

**🎯 Cette présentation est OBLIGATOIRE avant toute modification.**

---

## 🚫 INTERDICTIONS ABSOLUES

### 1. ❌ Coder "de mémoire"
**TOUJOURS** vérifier dans les fichiers sources. Jamais supposer.

### 2. ❌ Ignorer REGLES_CRITIQUES.md
Si modification zones/génération → Lecture OBLIGATOIRE sections 1 & 2.

### 3. ❌ Modifier mode solo sans tests exhaustifs
Mode solo = sacré. Un seul bug = régression grave.

### 4. ❌ Fixer qu'un seul endroit
Toujours chercher TOUS les usages avec `grep` avant de corriger.

### 5. ❌ Déployer sans tester localement
```bash
npm start  # Tester 5 min minimum
# SEULEMENT APRÈS → git commit + push
```

### 6. ❌ Messages de commit vagues
```bash
# ❌ INTERDIT
git commit -m "fix bug"
git commit -m "update"

# ✅ OBLIGATOIRE
git commit -m "fix(Arena): Generate new card after EACH validation

- Remove totalPairs calculation (incorrect)
- Generate new zones immediately like multiplayer
- Follow server.js pattern (lines 1217-1260)
- Fix commit 93dbb27 bug
- Tested locally with 4 players"
```

---

## 📊 MATRICE DE DÉCISION RAPIDE

### Modification génération zones?
→ Lire **REGLES_CRITIQUES.md** + `serverZoneGenerator.js` + Présenter analyse

### Modification mode multijoueur?
→ Lire **REFONTE_CARTE_ANALYSE.md** + `server.js` + Tester en local

### Modification mode Arena?
→ Lire **TOURNOI_SPECIFICATIONS.md** + `crazyArenaManager.js` + Comparer avec multijoueur

### Bug à corriger?
→ Suivre **DEBUG_PROCESS.md** étapes 1-6 (chercher TOUS usages avec grep)

### Rendu SVG/Carte?
→ Lire **REFONTE_CARTE_ANALYSE.md** lignes 58-139 + Ne pas casser mode multijoueur

---

## ⏱️ ESTIMATION TEMPS

**Workflow complet:** ~8-10 minutes par modification

**Répartition:**
- Étape 1 (Identifier impact): 30s
- Étape 2 (Lire fichiers racines): 2-3 min
- Étape 3 (Analyser code existant): 2-3 min
- Étape 4 (Valider solution): 1 min
- Étape 5 (Présenter analyse): 2 min

**Temps gagné en évitant régressions:** 30-120 min

**ROI net:** +300 à 1200% d'efficacité

---

## 🎯 CHECKLIST DE FIN DE MODIFICATION

**Workflow déploiement rapide (prod directe):**

Avant de considérer une tâche terminée:

- [ ] **Commit avec message EXPLICITE** (format imposé ci-dessus)
- [ ] **Push vers GitHub** (`git push origin main`)
- [ ] **Attendre déploiement Vercel** (2-3 min) → Vérifier status "Ready"
- [ ] **Tester en production mode incognito** (Ctrl+Shift+N)
  - [ ] Ouvrir console (F12) et vérifier aucune erreur rouge
  - [ ] Tester la fonctionnalité modifiée
  - [ ] Si modification zones: Tester mode solo en priorité
  - [ ] Vérifier aucune régression (fonctionnalités existantes OK)
- [ ] **Hard refresh si cache** (Ctrl+Shift+R)
- [ ] **Mettre à jour TRAVAIL_EN_COURS.md** si applicable

**⚠️ Tests locaux optionnels:**
- Tests locaux (localhost) non obligatoires (login Supabase incompatible)
- Préférer déploiement rapide + test prod direct
- Rollback Git si problème détecté en prod

---

## 📝 INCOHÉRENCES IDENTIFIÉES ENTRE FICHIERS

### ⚠️ Incohérence #1: Commit de référence
- **COMMITS_FONCTIONNELS.md**: Référence = `a7665f5` (30 oct 2025)
- **REGLES_CRITIQUES.md**: Référence = `a7665f5` (cohérent)
- **Problème**: Ces commits datent d'octobre, mode Arena créé en décembre
- **Action**: Mettre à jour avec commit stable récent incluant Arena

### ⚠️ Incohérence #2: Nomenclature Battle Royale vs Arena
- **PLAN_CRAZY_ARENA_09_DEC.md**: Renommage Battle Royale → Crazy Arena (9 déc)
- **Fichiers actuels**: Utilisent "Arena" partout
- **Statut**: ✅ Cohérent (renommage effectué)

### ✅ Cohérence vérifiée:
- Règles du jeu (1 paire/carte) cohérentes entre REGLES_CRITIQUES.md et serverZoneGenerator.js
- Process debug cohérent entre DEBUG_PROCESS.md et pratique actuelle
- Specs Arena cohérentes entre TOURNOI_SPECIFICATIONS.md et code actuel

---

## 🚀 ENGAGEMENT

**En tant qu'IA assistant, je m'engage à:**

1. ✅ TOUJOURS suivre ce workflow avant toute modification
2. ✅ TOUJOURS présenter l'analyse pre-code (étape 5)
3. ✅ JAMAIS coder sans avoir consulté fichiers racines pertinents
4. ✅ JAMAIS supposer - Toujours vérifier dans le code source
5. ✅ Signaler les incohérences détectées entre fichiers

**Si je ne respecte pas ce workflow:**
→ L'utilisateur doit me rappeler à l'ordre en disant: **"WORKFLOW_OBLIGATOIRE.md"**

---

**Dernière mise à jour**: 16 décembre 2025, 4h35  
**Statut**: DOCUMENT VIVANT - À suivre SYSTÉMATIQUEMENT  
**Auteur**: Collaboration Utilisateur + Cascade AI
