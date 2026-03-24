# 🎯 Plan complet — Préparation Rectorat (30/03/2026)

> **Objectif** : Tout doit être prêt et fonctionnel pour la présentation au rectorat de Guadeloupe le lundi 30 mars 2026.
> **Présents** : Cadres du rectorat + inspecteur

---

## Phase 0 : Accès & Authentification

### P0.1 — Rôle `rectorat` dans le système d'auth
- [ ] Ajouter `rectorat` comme valeur acceptée dans `user_profiles.role`
- [ ] Modifier le login pour rediriger `rectorat` vers `/rectorat`
- [ ] Ajouter guard `RequireRectorat` dans App.js (autorise `rectorat` + `admin`)
- [ ] Ajouter route `/rectorat` → `RectoratDashboard`

### P0.2 — Création de comptes rectorat
- [ ] Interface admin pour créer un compte rectorat (email, nom, région académique)
- [ ] Compte créé dans Supabase Auth + `user_profiles` avec `role: 'rectorat'`, `region: 'guadeloupe'`
- [ ] Créer un compte démo pour la présentation du 30/03

---

## Phase 1 : Enregistrement des cartes dans Supabase

### P1.1 — Sauvegarder les cartes (zonesFull) en DB
- [ ] À chaque round (Arena + Training), sauvegarder `zonesFull` dans `match_results.details` (JSON)
- [ ] Format : `{ rounds: [{ roundIndex, zones: [...zonesFull], timestamp }] }`
- [ ] S'applique à TOUS les modes (enregistrement global)

### P1.2 — Flag "Compétition Officielle"
- [ ] Ajouter colonne `is_official BOOLEAN DEFAULT false` sur `tournament_matches`
- [ ] Le flag est transmis par l'enseignant et sauvegardé en DB
- [ ] Le dashboard rectorat filtre par défaut sur `is_official = true`

### P1.3 — Toggle enseignant
- [ ] Switch "🏆 Compétition Officielle" dans `CrazyArenaSetup`
- [ ] Switch "🏆 Compétition Officielle" dans `TrainingArenaSetup`
- [ ] Badge visuel "OFFICIEL" quand activé
- [ ] Le flag `is_official: true` est envoyé au serveur

---

## Phase 2 : Dashboard Rectorat (UI)

### P2.1 — Refonte UI professionnelle
- [ ] En-tête : Logo Crazy Chrono + "Académie de la Guadeloupe" + nom du cadre
- [ ] Stats globales : écoles, classes, élèves, compétitions, manches
- [ ] Onglets :
  - 📊 Vue globale (stats agrégées)
  - 🏆 Compétitions (liste matchs officiels + résultats)
  - 🗺️ Cartes jouées (voir chaque carte via card-screenshot.html)
  - 🔄 Timeline (replay chronologique — déjà fait)

### P2.2 — Onglet "Cartes jouées"
- [ ] Liste des matchs officiels avec rounds
- [ ] Bouton "👁️ Voir la carte" → ouvre card-screenshot.html via postMessage
- [ ] Affichage : date, école, classe, thème, nb joueurs, gagnant

### P2.3 — Filtres
- [ ] Par région académique (Guadeloupe, Martinique, etc.)
- [ ] Par école (dropdown)
- [ ] Par date (plage)
- [ ] Officiel seulement (toggle, activé par défaut)

---

## Phase 3 : APIs Backend

### P3.1 — Routes `/api/rectorat/`
- [ ] `GET /api/rectorat/stats` — stats globales compétitions officielles
- [ ] `GET /api/rectorat/competitions` — liste des compétitions officielles + résultats
- [ ] `GET /api/rectorat/matches/:matchId/cards` — zonesFull depuis `match_results.details`
- [ ] Middleware : vérifier rôle `rectorat` ou `admin`

### P3.2 — Enrichissement supervisor endpoint
- [ ] Ajouter filtre `is_official` en paramètre query sur `/api/tournament/:id/supervisor`

---

## Phase 4 : Tests

### P4.1 — Test de chaque mode de jeu
- [ ] **Solo** : lancer une partie complète
- [ ] **Arena (Tournoi)** : créer groupe, match 4 joueurs, résultats
- [ ] **Training** : créer session, jouer, résultats
- [ ] **Grande Salle** : mode éliminatoire public

### P4.2 — Test du flow rectorat complet
- [ ] Login avec compte rectorat
- [ ] Dashboard avec stats globales
- [ ] Naviguer compétitions officielles
- [ ] Voir résultats de chaque match
- [ ] Ouvrir cartes jouées visuellement
- [ ] Vérifier timeline chronologique
- [ ] Export classement PDF

### P4.3 — Correction bugs
- [ ] Réserver du temps pour bugs inévitables

---

## Phase 5 : Préparation présentation

### P5.1 — Données de démonstration
- [ ] 2-3 écoles fictives de Guadeloupe
- [ ] 5-6 classes avec ~25 élèves
- [ ] 3-4 compétitions officielles avec résultats variés
- [ ] Cartes jouées pour chaque manche
- [ ] Alternative : vrais tests le samedi

### P5.2 — Polish final
- [ ] Textes en français
- [ ] Loading states propres
- [ ] Messages d'erreur clairs
- [ ] Responsive (tablette)
- [ ] Favicon + titre "Crazy Chrono — Rectorat"

### P5.3 — Scénario de démo
- [ ] 1. "Voici comment un enseignant lance une compétition officielle"
- [ ] 2. "Les élèves jouent sur leurs tablettes"
- [ ] 3. "Le rectorat peut suivre en temps réel"
- [ ] 4. "Après le match, on peut vérifier chaque carte jouée"
- [ ] 5. "Export PDF du classement"

---

## Calendrier

| Jour | Date | Tâches | Heures |
|------|------|--------|--------|
| J1 | Mar 24 | Phase 0 (auth + route) + début Phase 1 | 4-5h |
| J2 | Mer 25 | Fin Phase 1 + Phase 3 (APIs) + début Phase 2 | 5-6h |
| J3 | Jeu 26 | Fin Phase 2 (dashboard + cartes + filtres) | 5-6h |
| J4 | Ven 27 | Phase 4 (tests tous modes + flow rectorat) | 4-5h |
| J5 | Sam 28 | Corrections bugs + Phase 5 (données démo + polish) | 3-4h |
| J6 | Dim 29 | Test final + scénario de démo | 2-3h |
| **J7** | **Lun 30** | **🎯 PRÉSENTATION RECTORAT** | — |

**Total estimé : ~25 heures**
