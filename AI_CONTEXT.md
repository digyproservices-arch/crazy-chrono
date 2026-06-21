# AI_CONTEXT.md — Briefing complet pour nouvelle session Cascade
> **Ce fichier doit être lu EN ENTIER avant toute modification de code.**
> Dernière mise à jour : 2026-06-07

---

## 1. Identité du projet

**Crazy Chrono** est un jeu éducatif de mémorisation par association (paires image/texte ou calcul/chiffre), destiné à des élèves d'école primaire jusqu'au lycée. L'ambition est un **lancement mondial**. Chaque bug en production touche de vrais élèves.

- **Frontend** : https://app.crazy-chrono.com (Vercel, branche `main`)
- **Backend** : https://crazy-chrono-backend.onrender.com (Render, branche `main`)
- **Staging backend** : https://crazy-chrono-staging.onrender.com (Render, branche `staging`)
- **Dépôt GitHub** : https://github.com/digyproservices-arch/crazy-chrono

---

## 2. Architecture technique

| Couche | Technologie | Fichier principal |
|--------|-------------|-------------------|
| Frontend | React 19 + React Router v7 + CRA (react-scripts 5) | `src/App.js` |
| Backend | Node.js + Express + Socket.IO v4 | `server/server.js` (280KB) |
| Base de données | Supabase (PostgreSQL) | via `@supabase/supabase-js` |
| Temps réel | Socket.IO (WebSocket + polling fallback) | `server/crazyArenaManager.js` |
| Auth | Supabase JWT + `cc_auth` localStorage | `server/routes/auth.js` |
| Build | webpack (via CRA), code-splitting lazy chunks | `vercel.json` |
| PWA | Service Worker (`/service-worker.js`) | `src/index.js` |
| Monitoring | clientTelemetry + sTrace + MonitoringDashboard | voir §8 |
| Erreurs React | `GameErrorBoundary` inline dans `App.js` | `src/App.js` lignes 144-179 |

### Déploiement (CRITIQUE — toujours les deux branches)
```
git push origin main      # → Vercel (frontend) + Render prod (backend)
git push origin main:staging  # → Render staging
```
**Ne jamais pousser uniquement sur main sans pousser aussi sur staging.**

---

## 3. Modes de jeu

Tous les modes utilisent `src/components/Carte.js` (555KB, ~10 000 lignes) comme moteur de jeu.

| Mode | Route | Génération zones | Socket.IO |
|------|-------|-----------------|-----------|
| **Solo** | `/carte` (sans params) | Client — `elementsLoader.js` | ❌ |
| **Salle Privée (MP)** | `/carte?room=CODE` | Serveur — `serverZoneGenerator.js` | ✅ |
| **Crazy Arena** | `/carte?arena=matchId` | Serveur | ✅ |
| **Training Arena** | `/training-arena/game?training=matchId` | Serveur | ✅ |
| **Grande Salle** | `/grande-salle` | Serveur | ✅ |
| **Apprendre** | `/apprendre` | Client (premium) | ❌ |

`Carte.js` détecte le mode via `useSearchParams()` : `arenaMatchId`, `trainingMatchId`, `roomCode`.

---

## 4. Règles sacrées du jeu (REGLES_CRITIQUES.md)

> **Violer ces règles = bug critique en production.**

1. **Une seule paire correcte par carte.** Jamais deux zones avec le même `pairId`.
2. **Types de paires valides uniquement** : `image ↔ texte` OU `calcul ↔ chiffre` (même `pairId`).
3. **Les distracteurs n'ont jamais de `pairId`** (champ absent ou null).
4. **Format `pairId`** : `assoc-img-{i}-txt-{t}` ou `assoc-calc-{c}-num-{n}`.
5. **Mode solo = SACRÉ.** La génération locale (`elementsLoader.js`) ne doit jamais être modifiée sans tests exhaustifs. Ne pas toucher sans raison absolue.
6. **Ne jamais modifier `elementsLoader.js`** sans relire REGLES_CRITIQUES.md en entier.
7. **Le serveur est l'autorité** pour les vérifications d'abonnement et de rôle (pas le client).

---

## 5. Rôles utilisateurs

| Rôle | Accès | Restrictions |
|------|-------|--------------|
| `admin` | Tout | Aucune |
| `teacher` | Tout sauf admin | Aucune |
| `cpd` / `cpc` / `rectorat` | Dashboard rectorat + bypass maintenance | Aucune |
| `student` | Jeu + performances | Max 2 appareils, 1 session active |
| `user` | Jeu (freemium 2 sessions/jour) | Max 2 appareils, 1 session active |

**Roles exemptés** de : session unique, device limit, session guard : `admin, teacher, cpd, cpc, rectorat`.

---

## 6. LocalStorage — clés critiques

| Clé | Contenu |
|-----|---------|
| `cc_auth` | `{ id, email, role, token, name, isAdmin, region, ... }` |
| `cc_subscription_status` | `'pro'` ou `'free'` |
| `cc_student_id` | ID étudiant (format `std_xxx`) |
| `cc_crazy_arena_game` | Données match Arena en cours (JSON) |
| `cc_training_arena_game` | Données match Training en cours (JSON) |
| `cc_session_only` | `'1'` si session sans "Se souvenir de moi" |
| `cc_maintenance_bypass` | `'1'` pour bypasser MAINTENANCE_MODE |
| `cc_client_telemetry` | Buffer événements télémétrie |
| `cc_device_id` | ID appareil persistant |

---

## 7. État actuel du projet (2026-06-07)

### Ce qui fonctionne ✅
- Mode Solo : stable en production
- Mode Salle Privée : stable (42 fixes mergés depuis staging)
- Mode Arena : stable (42 fixes mergés)
- Mode Training : stable (42 fixes mergés)
- Grande Salle : stable (persistance DB, LiveBoard, Stripe, QR code)
- Monitoring Dashboard : fonctionnel (admin uniquement)
- PWA : installable iOS/Android
- Auth : session unique, device limit, auto-logout 401

### Issues connues ⚠️
- **Écran blanc sur iPhone/iOS** : partiellement traité (remplacement `<object>` par `<img>` pour SVG, overlay connexion), pas encore résolu à 100%
- **MAINTENANCE_MODE = true** (ligne 182 de `src/App.js`) : volontaire, bloque l'accès public. Bypass via `cc_maintenance_bypass=1` dans localStorage.
- **Render Free Tier** : cold start possible, ~50 joueurs simultanés max

### Dernier bug critique résolu ✅ (2026-06-07)
**TDZ webpack sur chunk 862 (Carte.js)** — `ReferenceError: Cannot access 'di' before initialization`
- **Cause** : `GameErrorBoundary.js` importé comme fichier séparé dans `App.js` → nouveau nœud webpack → décalage IDs modules dans chunk 862 → dépendance circulaire latente devenue fatale.
- **Fix** : classe `GameErrorBoundary` définie inline dans `App.js` (lignes 144-179), fichier `src/components/GameErrorBoundary.js` existant mais plus importé nulle part.
- **Commit** : `c8e313e`
- **Leçon** : tout import statique NOUVEAU dans `App.js` peut décaler les IDs webpack de TOUS les chunks lazy → toujours tester avec un build prod avant de pousser.

---

## 8. Monitoring & Télémétrie

### Client (`src/utils/clientTelemetry.js`)
- `telemetry(event, data)` : bufferise dans `cc_client_telemetry`, sync toutes les 15s
- `telemetryNow(event, data)` : flush immédiat via `fetch keepalive` (pour events critiques)
- `initClientTelemetry()` : appelé dans `App.js`, capture erreurs JS + réseau globalement

### Serveur (`server/utils/serverTraceBuffer.js`)
- `sTrace.add(matchId, event, data)` : trace factuelle par match
- Visible dans MonitoringDashboard → "Server Trace"

### GameErrorBoundary (dans `src/App.js` lignes 144-179)
- Capture erreurs React sur `/carte` et `/training-arena/game`
- Envoie `error:react-boundary` via `navigator.sendBeacon` (MIME: `text/plain` — OBLIGATOIRE, le serveur parse en `express.text()`)
- Nettoie `document.body.classList` (`cc-game`) et `overflow`

### Endpoint télémétrie serveur
- `POST /api/monitoring/client-telemetry` (dans `server/routes/monitoring.js`)
- Accepte `Content-Type: text/plain` (sendBeacon) ET `application/json` (fetch)
- Pas d'auth requise (tous les appareils, même non connectés)

---

## 9. Fichiers à lire en priorité dans une nouvelle session

Avant TOUTE modification, lire dans cet ordre :

1. **Ce fichier** (`AI_CONTEXT.md`) — contexte global
2. **`REGLES_CRITIQUES.md`** — règles du jeu, violations = bug critique
3. **`PLAN_OPTIMISATION.md`** — plan d'action, journal, règles de sécurité
4. **`ROADMAP_LANCEMENT.md`** — vision et phases A→H
5. Le(s) fichier(s) **directement concernés** par la tâche

---

## 10. Leçons apprises (erreurs passées à ne pas répéter)

### L1 — Webpack module ID shifting (2026-06-07)
**Problème** : Ajouter un nouveau fichier en import STATIQUE dans `App.js` peut décaler les IDs internes de webpack dans TOUS les chunks lazy, déclenchant des erreurs TDZ sur des dépendances circulaires jusque-là inoffensives.
**Règle** : Si un nouveau composant doit être dans le bundle principal, **le définir inline dans `App.js`** plutôt que dans un fichier séparé, OU s'assurer qu'il n'introduit aucun nouveau nœud dans le graphe de modules.
**Test obligatoire** : Build prod (`npm run build`) + vérification chunk 862 avant push sur main.

### L2 — Staging avant main (règle projet)
**Problème** : Des commits ont été pushés directement sur `main` sans test préalable sur `staging`.
**Règle** : Toujours pousser sur `staging` d'abord, tester, PUIS pousser sur `main`. Sans exception pour les refactors/nouvelles features.

### L3 — sendBeacon MIME type
**Problème** : `navigator.sendBeacon` avec `application/json` → serveur rejetait silencieusement (parser `express.text()` attend `text/plain`).
**Règle** : Pour `sendBeacon`, toujours utiliser `new Blob([payload], { type: 'text/plain' })`.

### L4 — Socket cleanup dans useEffect
**Problème** : Cleanup socket dans `.then()` au lieu du `return` du `useEffect` → socket leak → reconnexions parasites.
**Règle** : Le cleanup socket (`.off()`, `.disconnect()`) DOIT être dans le `return` du `useEffect`, jamais dans une Promise.

### L5 — Module solo sacré
**Problème** : Des modifications dans la chaîne `elementsLoader.js` → `Carte.js` ont cassé le mode solo par le passé.
**Règle** : Ne jamais modifier `elementsLoader.js`. Pour `Carte.js`, tester solo EN PREMIER après chaque changement.

---

## 11. Processus de travail (process.io)

### Avant de modifier quoi que ce soit
1. Lire ce fichier + les fichiers concernés
2. Comprendre l'impact sur TOUS les modes (solo, MP, Arena, Training, GS)
3. Identifier les risques webpack si ajout d'imports

### Lors d'une modification
1. Faire le minimum nécessaire (patch chirurgical)
2. Commenter uniquement si le code l'était déjà
3. Tester mentalement l'impact sur le mode solo en priorité

### Lors du commit
1. Message de commit clair et factuel (français ou anglais)
2. Pousser sur `staging` ET `main` :
```
git push origin main
git push origin main:staging
```

### Après le push
- Vérifier que le build Vercel s'est déclenché (https://vercel.com)
- Si changement côté serveur : vérifier que Render a redéployé

---

## 12. Composants majeurs — tailles et rôles

| Fichier | Taille | Rôle |
|---------|--------|------|
| `src/components/Carte.js` | ~555KB | Moteur jeu central (TOUS modes) |
| `server/server.js` | ~280KB | Serveur Express + Socket.IO |
| `server/crazyArenaManager.js` | ~203KB | Logique Arena + Training |
| `server/routes/monitoring.js` | ~68KB | Dashboard + télémétrie |
| `server/utils/serverZoneGenerator.js` | ~69KB | Génération zones serveur |
| `server/routes/tournament.js` | ~153KB | Grande Salle + Stripe |
| `src/components/GrandeSalle/GrandeSalle.js` | ~62KB | Grande Salle frontend |
| `src/components/Training/TrainingArenaGame.js` | ~78KB | Training/Arena UI |
| `src/components/MonitoringDashboard.js` | ~200KB | Dashboard admin |

---

## 13. Variables d'environnement critiques

### Frontend (`.env` ou Vercel)
| Variable | Valeur prod |
|----------|-------------|
| `REACT_APP_BACKEND_URL` | `https://crazy-chrono-backend.onrender.com` |
| `REACT_APP_SENTRY_DSN` | (configurer si Sentry activé) |

### Backend (`server/.env`)
| Variable | Usage |
|----------|-------|
| `SUPABASE_URL` | URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase (admin) |
| `FRONTEND_URL` | `https://app.crazy-chrono.com` |
| `BACKEND_URL` | `https://crazy-chrono-backend.onrender.com` |
| `FREE_SESSIONS_PER_DAY` | `3` |

---

## 14. Tâches en attente (backlog prioritaire)

- [ ] **Vérifier fix TDZ en staging** : commit `e26eaa7` (gameAnimation.js) doit éliminer le `ReferenceError: Cannot access 'di' before initialization`. Confirmer sur https://staging.crazy-chrono.com avant de pousser sur `main`.
- [ ] **Écran blanc iOS** : le problème persiste sur certains iPhones en mode Arena/Training. Les corrections partielles (img vs object, overlay connexion) n'ont pas suffi. Besoin d'analyse des logs télémétrie `bg:load-fail` et `game:blank-watchdog`.
- [ ] **MAINTENANCE_MODE** : passer à `false` quand le jeu est prêt pour les vrais utilisateurs (`src/App.js` ligne 182).
- [ ] **Render Free → payant** : cold start ~30s bloque les joueurs. Plan Starter Render ($7/mois) recommandé avant lancement.
- [ ] **Tests E2E Playwright** : `npm run test:e2e` — vérifier que les tests passent après chaque série de commits.
- [ ] **Phase B refactoring** : Carte.js > 10 000 lignes, extraire overlays + hooks (ROADMAP_LANCEMENT.md Phase B).

---

## 15. ROOT CAUSE résolu — ReferenceError TDZ (juin 2026)

**Erreur** : `ReferenceError: Cannot access 'di' before initialization` dans `chunk 862` (Carte.js).

**Cause racine** : 4 composants lazy-loadés importaient **statiquement** depuis `Carte.js` (lui-même lazy-loadé) :
- `TrainingArenaGame.js` → `import { animateBubblesFromZones } from '../Carte'`
- `GrandeSalle.js` → `import { animateBubblesFromZones, invalidateZoneCenterCache } from '../Carte'`
- `LiveBoard.js` → `import { animateBubblesFromZones, invalidateZoneCenterCache } from '../Carte'`
- `ArenaSpectator.js` → `import { animateBubblesFromZones, invalidateZoneCenterCache } from '../Carte'`

Ces imports croisés entre chunks lazy forçaient webpack à un ordre d'initialisation des modules qui créait un TDZ sur `di` (variable `const`/`let` interne du chunk 862 accédée avant son initialisation).

**Fix** (commit `e26eaa7`) : Créer `src/utils/gameAnimation.js` contenant `animateBubblesFromZones`, `animateBubbleToVignette`, `invalidateZoneCenterCache` et tous leurs helpers. Les 4 composants + `Carte.js` importent depuis cette utilité partagée. Webpack crée maintenant un chunk partagé propre, éliminant la dépendance croisée.

**Leçon** : Ne jamais importer statiquement depuis un composant lazy-loadé dans un autre composant lazy-loadé. Extraire les fonctions partagées dans `src/utils/`.

---

*Mis à jour automatiquement à chaque session. Commit ce fichier après toute session de travail significative.*
