# 📁 ORGANISATION DE LA DOCUMENTATION

**Date de réorganisation:** 24 décembre 2025  
**Objectif:** Regrouper TOUS les fichiers créés pour une navigation facile

---

## 📂 STRUCTURE DES DOSSIERS

```
docs/
├── sessions/          # Rapports de sessions de code (8 fichiers)
├── guides/            # Guides techniques et setup (8 fichiers)
├── specs/             # Spécifications et plans (4 fichiers)
└── README_ORGANISATION.md (ce fichier)

Racine/ (fichiers critiques uniquement)
├── REGLES_CRITIQUES.md          🔴 VITAL - Règles du jeu
├── DEBUG_PROCESS.md              🔴 VITAL - Process de debug
├── WORKFLOW_OBLIGATOIRE.md       🔴 VITAL - Workflow obligatoire
├── COMMITS_FONCTIONNELS.md       🔴 VITAL - Commits stables
├── REFONTE_CARTE_ANALYSE.md      🔴 VITAL - Architecture Carte.js
├── TRAVAIL_EN_COURS.md           🟡 TODO actuel
├── INDEX_SESSIONS.md             🟡 Index rapide sessions
└── README.md                     📖 Readme projet
```

---

## 📚 FICHIERS PAR CATÉGORIE

### 🔴 **RACINE (Fichiers critiques - 8 fichiers)**

**À consulter AVANT toute modification:**

1. **REGLES_CRITIQUES.md** - Règles fondamentales du jeu
   - 1 paire par carte
   - +1 point par validation
   - Mode solo sacré

2. **WORKFLOW_OBLIGATOIRE.md** - Process obligatoire avant de coder
   - 5 étapes pré-code
   - Matrice de décision
   - Format analyse obligatoire

3. **DEBUG_PROCESS.md** - Processus de débogage systématique

4. **COMMITS_FONCTIONNELS.md** - Commits stables (a7665f5 = référence)

5. **REFONTE_CARTE_ANALYSE.md** - Architecture Carte.js (6109 lignes)

6. **TRAVAIL_EN_COURS.md** - TODO et tâches prioritaires

7. **INDEX_SESSIONS.md** - Index rapide des 8 sessions

8. **README.md** - Documentation générale projet

---

### 📅 **docs/sessions/ (Rapports sessions - 8 fichiers)**

| Fichier | Date | Sujets principaux |
|---------|------|-------------------|
| `SESSION_2025-12-10_RAPPORT.md` | 10 déc 2025 | **🔴 Auth token localStorage, Flux tournoi Arena, Mot de passe oublié** |
| `SESSION_2025-12-10_PARTIE2_REPRISE.md` | 10 déc 2025 | Reprise autre PC |
| `SESSION_09_DEC_2025_REPRISE.md` | 09 déc 2025 | **Renommage Battle Royale → Crazy Arena** |
| `SESSION_08_DEC_2025_PART2.md` | 08 déc 2025 | **Mode Arena - Synchronisation zones** |
| `SESSION_08_DEC_2025.md` | 08 déc 2025 | **Mode Arena - Images clipPaths** |
| `SESSION_04_DEC_2025.md` | 04 déc 2025 | Bug parsing student_ids |
| `SESSION_03_DEC_2025_VERCEL_DEBUG.md` | 03 déc 2025 | Debug Vercel variables env |
| `SESSION_25_NOV_2025_DEPLOYMENT.md` | 25 nov 2025 | Déploiement initial tournoi |

**🎯 Sessions critiques:**
- **10 déc (RAPPORT)**: Bugs Arena résolus
- **08 déc (PART2)**: Couleurs joueurs multijoueur? À vérifier
- **09 déc**: Nomenclature Arena officielle

---

### 🛠️ **docs/guides/ (Guides techniques - 8 fichiers)**

**Guides setup et déploiement:**

1. **DEMARRAGE_AUTRE_PC.md** - Setup nouveau PC
2. **REPRISE_AUTRE_PC.md** - Reprise travail autre machine
3. **GUIDE_RAPIDE_MIGRATION.md** - Migration BDD/infra
4. **GUIDE_ACTIVATION_MONITORING.md** - Activation monitoring
5. **RENDER_DEPLOYMENT_GUIDE.md** - Guide déploiement Render
6. **RENDER_ENV_SETUP.md** - Variables env Render
7. **SENTRY_INSTALLATION.md** - Installation Sentry
8. **SENTRY_SETUP.md** - Configuration Sentry

---

### 📋 **docs/specs/ (Spécifications - 4 fichiers)**

**Specs modes de jeu:**

1. **TOURNOI_SPECIFICATIONS.md** - ⚠️ Specs tournoi (contient +10 points OBSOLÈTE)
2. **PLAN_CRAZY_ARENA_09_DEC.md** - Plan renommage Arena
3. **TEST_CRAZY_ARENA.md** - Plan de test Arena
4. **BATTLE_ROYALE_IMPLEMENTATION.md** - ⚠️ OBSOLÈTE (ancien nom)

---

### 📊 **Autres fichiers racine (5 fichiers)**

**Documentation business/comptes:**

1. **BUDGET_MONITORING.md** - Suivi budget Supabase/Render
2. **COMPTES_DEMO_RECTORAT.md** - Comptes démo
3. **COMPTES_REELS_DEMO.md** - Comptes réels test
4. **MIGRATION_LICENCES_PROFESSIONNELLES.md** - Plan migration licences
5. **INSTRUCTIONS.md** - Instructions ajout images cartes

---

## 🔍 RECHERCHE RAPIDE

### **Besoin de trouver une info?**

| Question | Fichier(s) à consulter |
|----------|------------------------|
| Règles du jeu (1 paire, +1 point) | `REGLES_CRITIQUES.md` |
| Process avant de coder | `WORKFLOW_OBLIGATOIRE.md` |
| Bug à corriger | `DEBUG_PROCESS.md` |
| Commits stables | `COMMITS_FONCTIONNELS.md` |
| Architecture Carte.js | `REFONTE_CARTE_ANALYSE.md` |
| TODO actuel | `TRAVAIL_EN_COURS.md` |
| Session 10 déc (bugs Arena) | `docs/sessions/SESSION_2025-12-10_RAPPORT.md` |
| Renommage Arena | `docs/sessions/SESSION_09_DEC_2025_REPRISE.md` |
| Setup nouveau PC | `docs/guides/DEMARRAGE_AUTRE_PC.md` |
| Déploiement Render | `docs/guides/RENDER_DEPLOYMENT_GUIDE.md` |
| Specs tournoi | `docs/specs/TOURNOI_SPECIFICATIONS.md` |
| Plan test Arena | `docs/specs/TEST_CRAZY_ARENA.md` |

---

## ⚠️ FICHIERS OBSOLÈTES IDENTIFIÉS

1. **TOURNOI_SPECIFICATIONS.md ligne 68** → "+10 points" FAUX (doit être +1)
2. **BATTLE_ROYALE_IMPLEMENTATION.md** → Nomenclature obsolète (warning ajouté)

**Action:** Mettre à jour avec les vraies règles (+1 point)

---

## 🎨 RÈGLE COULEURS JOUEURS (MULTIJOUEUR)

**Trouvée dans:** `src/components/Carte.js` lignes 355-476

**Couleurs primaires (8 joueurs):**
```javascript
const PLAYER_PRIMARY_COLORS = [
  '#22c55e',  // Vert
  '#3b82f6',  // Bleu
  '#f59e0b',  // Orange/Jaune
  '#ef4444',  // Rouge
  '#8b5cf6',  // Violet
  '#14b8a6',  // Turquoise
  '#ec4899',  // Rose
  '#0ea5e9'   // Bleu ciel
];
```

**Couleurs bordures (3 groupes):**
```javascript
const PLAYER_BORDER_COLORS = [
  '#111827',  // Noir
  '#fbbf24',  // Jaune
  '#dc2626'   // Rouge foncé
];
```

**Fonction d'attribution:**
- `getPlayerColorComboByIndex(idx)` → Retourne `{ primary, border }`
- `animateBubblesFromZones(aId, bId, color, ZA, ZB, borderColor, label)` → Animation bulle

**Utilisée dans:** Mode multijoueur classique (Carte.js ligne 2272)

**❌ NON implémentée dans:** Mode Crazy Arena (CrazyArenaGame.js)

---

## 📝 NOTES

- Réorganisation effectuée le 24 déc 2025
- 33 fichiers .md identifiés
- 8 fichiers critiques restent en racine
- 20 fichiers déplacés dans docs/

**Prochaine étape:** Implémenter animations couleurs dans CrazyArenaGame.js

---

**Dernière mise à jour:** 24 décembre 2025, 2h01
