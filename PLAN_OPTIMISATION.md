# Plan d'Optimisation Crazy Chrono

> **Règle n°1 : NE RIEN CASSER.** Chaque étape est testée sur staging avant production.
> **Règle n°2 : Une étape à la fois.** On ne passe à la suivante que quand la précédente est validée.
> **Règle n°3 : Mode solo = sacré.** Ne jamais casser la génération locale (voir `REGLES_CRITIQUES.md`).

---

## Infrastructure

| Environnement | Service Render | Branche Git | URL |
|---------------|---------------|-------------|-----|
| **Production** | `crazy-chrono-backend` | `main` | app.crazy-chrono.com |
| **Staging** | `crazy-chrono-staging` | `staging` | (test/validation) |
| **Frontend prod** | Vercel | `main` | app.crazy-chrono.com |
| **Frontend preview** | Vercel | `staging` | (auto-preview sur push) |

### Branches actives
- `main` — production (dernier commit: 36e13e9)
- `staging` — branche de travail optimisation (créée depuis main le 14/05/2026)

### Branches archivées (ne plus utiliser)
- `arena-integration` — obsolète, mergée dans main
- `refactor/carte-renderer` — mergée dans main
- `refactor/game-state-machine` — remplacée par ce plan

## Documentation racine

| Fichier | Rôle |
|---------|------|
| `REGLES_CRITIQUES.md` | Règles sacrées du jeu (1 paire/carte, mode solo protégé) |
| `PLAN_OPTIMISATION.md` | Ce fichier — plan d'action et journal |
| `README.md` | Description du projet |
| `DOCS/` | Archives (anciens rapports, workflow, scénarios) |

---

## Étapes du Plan

### Phase 0 : Préparation (risque = zéro)
- [x] **0.1** Créer branche `staging` depuis `main` ✅
- [x] **0.2** Nettoyer documentation racine (fichiers obsolètes → DOCS/) ✅
- [x] **0.3** Pousser `staging` sur GitHub ✅
- [x] **0.4** Configurer `crazy-chrono-staging` sur Render → branche `staging` ✅
- [x] **0.5** Vérifier que staging fonctionne ✅ (Render deployed)

### Phase 1 : Synchronisation associations.json (risque = faible)
> *2 copies dans Git + scripts prebuild/prestart comme filet de sécurité*
> *Vercel nécessite le fichier dans public/data/ au moment du build*
- [x] **1.1** Scripts `prebuild` + `prestart` ajoutés (copie server→public) ✅
- [x] **1.2** ~~Supprimer du Git~~ → Revert : fichier nécessaire pour Vercel ✅
- [x] **1.3** Test staging : Nature 30, Animaux 27, Math OK ✅
- [ ] **1.4** Valider en production (merge staging → main)

### Phase 2 : Utilitaires partagés (risque = faible)
> *Éliminer le code copié-collé entre Carte.js, TrainingArenaGame.js, ArenaSpectator.js*
- [ ] **2.1** Créer `src/utils/playerColors.js` (getPlayerColorComboByIndex, PLAYER_PRIMARY_COLORS, etc.)
- [ ] **2.2** Créer `src/utils/pairDisplay.js` (textFor, textForCalc, getInitials)
- [ ] **2.3** Remplacer les copies dans Carte.js, TrainingArenaGame.js, ArenaSpectator.js
- [ ] **2.4** Tester sur staging : match training + arena + spectateur
- [ ] **2.5** Valider en production

### Phase 3 : Tests automatisés serveur (risque = zéro)
> *Ajouter un filet de sécurité pour les changements futurs*
- [ ] **3.1** Installer jest comme dépendance dev
- [ ] **3.2** Test : serverZoneGenerator génère 16 zones avec 1 bonne paire
- [ ] **3.3** Test : les zones ont des pairId cohérents (type calcul→chiffre, texte→image)
- [ ] **3.4** Test : le contenu label/content est correct par type de zone
- [ ] **3.5** Ajouter script `npm test` dans package.json

### Phase 4 : Schéma zones explicite (risque = faible)
> *Clarifier le rôle de chaque champ (label vs content) pour éviter les confusions futures*
- [ ] **4.1** Documenter le schéma actuel dans `docs/ZONE_SCHEMA.md`
- [ ] **4.2** Ajouter validation dans serverZoneGenerator (assertion champs obligatoires)
- [ ] **4.3** Tester sur staging

### Phase 5 : Découpage Carte.js (risque = moyen)
> *Extraire des modules de Carte.js pour faciliter la maintenance*
> *On s'appuie sur les branches existantes refactor/carte-renderer et refactor/game-state-machine*
- [ ] **5.1** Évaluer ce qui est récupérable des branches refactor existantes
- [ ] **5.2** Extraire `useGameSocket.js` (handlers socket solo/MP)
- [ ] **5.3** Extraire `useArenaMode.js` (handlers socket arena)
- [ ] **5.4** Extraire `GameHUD.js` (affichage scores, classement, timer)
- [ ] **5.5** Test complet sur staging : tous les modes
- [ ] **5.6** Valider en production

### Phase 6 : CI/CD GitHub Actions (risque = zéro)
- [ ] **6.1** Créer `.github/workflows/ci.yml` : build + tests sur chaque push
- [ ] **6.2** Ajouter badge status dans README

---

## Journal des actions

| Date | Phase | Étape | Statut | Notes |
|------|-------|-------|--------|-------|
| 2026-05-14 | — | Plan créé | ✅ | Monitoring OK, app stable |
| 2026-05-14 | 0 | 0.1 Branche staging créée | ✅ | Depuis main@36e13e9 |
| 2026-05-14 | 0 | 0.2 Ménage docs racine | ✅ | 4 fichiers → DOCS/ |
| 2026-05-14 | 0 | 0.3 Push staging sur GitHub | ✅ | commit c349140 |
| 2026-05-14 | 0 | 0.4 Config Render staging | ✅ | Branche changée → staging |
| 2026-05-14 | 0 | 0.5 Staging deployed | ✅ | https://crazy-chrono-staging.onrender.com |
| 2026-05-14 | 1 | 1.1+1.2 Source unique assoc.json | ✅ | prebuild + gitignore, commit caa78c9 |
| 2026-05-14 | 1 | 1.2 revert: fichier requis par Vercel | ✅ | commit c91b369 |
| 2026-05-14 | 1 | 1.3 Test staging OK | ✅ | Nature 30, Animaux 27, Math OK |

---

## Règles de sécurité
1. **Jamais de push direct sur `main`** pour les refactors → toujours via staging d'abord
2. **Chaque étape = 1 commit clair** avec message descriptif
3. **Si un test échoue sur staging** → on corrige avant de continuer
4. **Si quelque chose casse** → on revient au commit précédent (git revert)
5. **Le monitoring reste actif** pour détecter les régressions en production
