# AUDIT CTO 001 — CRAZY CHRONO

**Nature de la mission :** audit factuel en lecture seule. Aucun correctif, aucune modification de logique métier, aucun déploiement, aucune écriture Supabase. Le seul fichier ajouté par cette mission est ce rapport.

**Date de l'audit :** 2026-08-09
**Auditeur :** Devin (session CTO Audit 001)
**Dépôt audité :** `digyproservices-arch/crazy-chrono`
**Commit audité :** `4346dc6` (`fix(ui): confirmation + trace sur le bouton Terminer`, 2026-07-08)

## Convention de preuve

Chaque constat est étiqueté :

| Étiquette | Signification |
|---|---|
| **[VÉRIFIÉ-CODE]** | Lu directement dans le code du commit `4346dc6`, avec fichier et ligne. |
| **[VÉRIFIÉ-EXÉCUTION]** | Constaté en exécutant une commande ou une sonde locale, sortie observée. |
| **[HYPOTHÈSE]** | Déduction cohérente avec le code mais non observée en exécution. |
| **[NON TESTÉ]** | Ni exécuté ni observé ; statut inconnu, à ne pas présenter comme fonctionnel. |

Sévérités : **P0** = bloque la commercialisation ou crée un risque sécurité / paiement / perte de données. **P1** = à traiter juste après les P0. **P2** = dette technique importante. **P3** = non urgent / cosmétique.

---

## 1. ÉTAT DU DÉPÔT ET DE GIT

**[VÉRIFIÉ-EXÉCUTION]**

| Élément | Valeur |
|---|---|
| Dépôt | `https://github.com/digyproservices-arch/crazy-chrono` |
| Chemin local d'audit | `/home/ubuntu/repos/crazy-chrono` |
| Branche courante | `main` |
| HEAD | `4346dc6` |
| `origin/main` | `4346dc6` |
| `origin/staging` | `4346dc6` |
| Synchronisation GitHub | HEAD == `origin/main` == `origin/staging` : aucun écart |
| Modifications locales | aucune (aucun fichier suivi modifié) |
| Fichiers non suivis | `server/data/online_players.json` (généré à l'exécution du serveur local) |
| Pull requests ouvertes | aucune constatée |

### Branches distantes

| Branche | Écart vs `main` | Lecture |
|---|---|---|
| `origin/main` | référence | production |
| `origin/staging` | identique à `main` | **staging n'est plus une pré-production distincte** |
| `origin/arena-integration` | 1 152 commits en retard, 0 en avance | morte |
| `origin/feature/server-zone-generation` | 1 340 en retard, 1 en avance | morte, 1 commit non fusionné |
| `origin/refactor/carte-renderer` | 1 211 en retard, 0 en avance | morte |
| `origin/refactor/game-state-machine` | 348 en retard, 1 en avance | morte, 1 commit non fusionné |

**Constats.**

1. **P2** — `main` et `staging` pointant sur le même commit, le flux « livrer sur staging puis valider puis promouvoir » décrit dans la documentation n'existe pas en pratique. Toute régression part directement en production.
2. **P3** — quatre branches abandonnées, dont deux portent un commit non fusionné. Elles ne contiennent aucun code exploitable à court terme (retard de 348 à 1 340 commits) : elles devraient être supprimées ou archivées pour éviter les faux espoirs de « code déjà écrit ailleurs ».
3. **P2** — le serveur écrit des données d'exécution (`server/data/online_players.json`) dans l'arborescence du dépôt. Sur Render, le disque est éphémère : cet état est perdu à chaque redéploiement et pollue le dépôt en local.

### Commits récents significatifs

**[VÉRIFIÉ-EXÉCUTION]**

| Commit | Date | Objet |
|---|---|---|
| `4346dc6` | 2026-07-08 | confirmation + trace bouton Terminer |
| `7f1e4c2` | 2026-07-06 | mode objectif : paires imposables, distracteurs adaptés au niveau |
| `3d4233e` | 2026-07-05 | records solo : exclusion des sessions objectif |
| `a8e2d9e` | 2026-07-05 | correction « jeu interminable » (cibles objectif figées par session) |
| `1293669` | 2026-07-05 | correction « fausses paires visuelles » + test de régression 60 manches |
| `a6b45cb` | 2026-06-06 | **« fix: ecran blanc salle privee — hasSidebar couvre !isSoloMode+socketConnected »** — voir section D (cause racine du BUG A) |

L'activité récente est concentrée sur le mode Solo / objectif. Le mode privé n'a pas été retouché depuis juin.

---

## 2. DOCUMENTATION VS RÉALITÉ

| Document | État | Preuve |
|---|---|---|
| `README.md` | **obsolète (majeur)** | décrit un « Éditeur de Carte » ; le produit réel est un jeu éducatif multijoueur avec abonnements, tournois, comptes élèves. **[VÉRIFIÉ-CODE]** |
| `AI_CONTEXT.md` | **partiellement à jour** | architecture, modes et URLs correspondent globalement au code ; contient des affirmations historiques non revérifiées. **[VÉRIFIÉ-CODE]** |
| `REGLES_CRITIQUES.md` | **cohérent** | invariants (1 paire valide par carte, distracteurs sans `pairId`, Solo généré côté client) confirmés par le code et par les tests. **[VÉRIFIÉ-CODE]** |
| `DOCS/GRILLE_TARIFAIRE.md` | **contradictoire** | tarifs officiels ≠ tarifs du code ≠ tarifs demandés par la direction. Détail en section F. **[VÉRIFIÉ-CODE]** |
| `render.yaml` | **contradictoire** | `FREE_SESSIONS_PER_DAY: 3` contre 2 dans le code et 2 dans la règle commerciale. Détail en section F. **[VÉRIFIÉ-CODE]** |
| `ROADMAP_LANCEMENT.md`, `PLAN_OPTIMISATION.md` | **historiques** | utiles comme intention, pas comme état du produit. |
| Documentation d'architecture consolidée | **manquante** | aucun document ne décrit l'ensemble routes HTTP / événements Socket.IO / tables Supabase. Cet audit sert de première cartographie. |

**Constat P1 — la documentation ne peut pas servir de référence.** Un `README` décrivant un autre produit et une grille tarifaire officielle contredisant le code rendent tout onboarding et toute décision commerciale fondée sur la doc dangereux. Trois sources de vérité tarifaires coexistent.

Documentation de mode privé : `AI_CONTEXT.md` évoque un accès par `/carte?room=CODE`. Dans le code, `Carte.js` lit uniquement les paramètres `arena`, `training`, `gs` (`src/components/Carte.js`, lecture de `useSearchParams`) ; la salle privée passe par `localStorage.cc_session_cfg` écrit par `SessionConfig.js`. **[VÉRIFIÉ-CODE]** Le paramètre `room=` documenté n'est pas implémenté.

---

## 3. ARCHITECTURE RÉELLE

### 3.1 Frontend

**[VÉRIFIÉ-CODE]**

- React 19, React Router v7, Create React App (`react-scripts` 5.0.1). Aucun `engines` déclaré ni côté racine ni côté serveur.
- 48 routes déclarées dans `src/App.js`, dont :
  - public / marketing : `/`, `/presentation`, `/promo`, `/legal`, `/pricing`
  - auth : `/login`, `/forgot-password`, `/reset-password`
  - jeu : `/modes`, `/config/:mode`, `/carte`, `/apprendre`
  - admin : `/admin`, `/admin/dashboard`, `/admin/monitoring`, `/admin/roles`, `/admin/invite`, `/admin/gift-codes`, `/admin/tournaments`
  - enseignant : `/teacher`, `/teacher/dashboard`, `/teacher/training/create`, `/teacher/training/manager`, `/teacher/tournament`
  - arène / tournoi : `/crazy-arena/*`, `/tournament/*`, `/training-arena/*`, `/training/lobby/:matchId`
  - Grande Salle : `/grande-salle`, `/grande-salle/join/:tournamentId`, `/grande-salle/tournament/:tournamentId`, `/grande-salle/live/:tournamentId`
  - statistiques : `/my-performance`, `/student/:studentId/performance`
  - institutionnel : `/rectorat`
- État : hooks locaux + `localStorage` (pas de store global). Clés notables : `cc_session_cfg` (configuration de partie), `cc_subscription_status`, `cc_free_quota`, `cc_free_limit`.
- Auth : Supabase JS côté client (`src/utils/supabaseClient.js`), clés lues dans `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` (aucune clé en dur dans le code — bon point).
- PWA : `public/manifest.json` + `public/service-worker.js` enregistré dans `src/index.js`.
- Animations de jeu : `src/utils/gameAnimation.js` (bulles vers une vignette « dernière paire »).

### 3.2 Backend

**[VÉRIFIÉ-CODE]**

- Node + Express 4.18, Socket.IO 4.8, `@supabase/supabase-js` 2.45 (clé service role), Stripe 14.25, Helmet 8, `express-rate-limit` 8, `express-validator` 7, Winston, Multer, node-cron.
- `server/server.js` : 6 363 lignes, 46 routes HTTP déclarées directement, plus 15 routeurs montés : `adminLogs`, `antifraud`, `auth`, `grandeSalle`, `mastery`, `matchRounds`, `monitoring`, `notifications`, `progress`, `rectorat`, `rgpd`, `session`, `tournament`, `training`.
- Middlewares de sécurité en place : CORS liste blanche (`app.crazy-chrono.com`, `localhost:3000`, `localhost:5173`, `*.vercel.app` par regex), Helmet (**CSP désactivée**), rate limit global 500 req / 15 min, rate limit auth 30 req / 15 min sur `/api/auth/student-login`, `trust proxy = 1`, `express.json({ limit: '10mb' })`.
- Auth : `requireAuth` (JWT Supabase) et `requireAdminAuth` (JWT + `user_profiles.role === 'admin'`), tous deux corrects dans leur logique interne.
- Génération de manches : `server/utils/serverZoneGenerator.js` (autoritaire pour tous les modes en ligne).
- Arène : `server/crazyArenaManager.js` (4 605 lignes).

### 3.3 Base de données (Supabase PostgreSQL)

**[VÉRIFIÉ-CODE]**

Environ **50 tables** référencées dans le code. Principaux domaines :

- identité / rôles : `user_profiles`, `users`, `students`, `user_student_mapping`, `user_devices`, `auth_audit_log`
- scolaire : `schools`, `classes`, `licenses`, `user_licenses`, `invitations`
- facturation : `subscriptions`, `gift_codes`, `webhook_events`
- jeu / sessions : `sessions`, `active_sessions`, `match_results`, `match_rounds`, `match_player_summary`, `leaderboard`
- tournois : `tournaments`, `tournament_groups`, `tournament_matches`, `tournament_phases`, `gs_tournaments`, `gs_tournament_entries`, `gs_draws`
- entraînement / progression : `training_sessions`, `training_results`, `student_training_stats`, `mastery_progress`
- monitoring : `monitoring_events`, `monitoring_apm`, `monitoring_player_snapshots`, `mon_client_telemetry`, `mon_client_rounds`, `mon_client_clicks`, `mon_arena_rounds`, `mon_game_incidents`, `mon_game_traces`, `backend_logs`, `image_usage_logs`, `content_store`

19 fichiers de migration dans `server/migrations/`. **10 seulement activent RLS** (`ENABLE ROW LEVEL SECURITY`), et 6 politiques utilisent `USING (true)` / `WITH CHECK (true)` — dont `migration_auth_audit.sql:83` et `migration_user_devices.sql:154` en `FOR ALL USING (true) WITH CHECK (true)`. **[VÉRIFIÉ-CODE]**

**[NON TESTÉ]** L'état RLS réel du projet Supabase de production n'a pas été inspecté (interdiction d'accéder à la production). Les migrations du dépôt ne prouvent pas l'état de la base : il est possible que RLS ait été activée à la main, comme il est possible que des tables sensibles (`students`, `subscriptions`, `user_profiles`) soient lisibles avec la clé anon. **Cette vérification est un préalable obligatoire à toute vente** (voir section H).

### 3.4 Services externes

| Service | Rôle | Preuve |
|---|---|---|
| Vercel | hébergement frontend, build CRA avec injection SHA/heure (`vercel.json`) | **[VÉRIFIÉ-CODE]** |
| Render | backend `crazy-chrono-backend`, `rootDir: server`, `healthCheckPath: /healthz` | **[VÉRIFIÉ-CODE]** |
| Supabase | Auth + PostgreSQL + stockage | **[VÉRIFIÉ-CODE]** |
| Stripe | abonnements web (checkout, portail client, webhook) | **[VÉRIFIÉ-CODE]** |
| RevenueCat | abonnements mobiles (`POST /webhooks/revenuecat`, secret partagé) | **[VÉRIFIÉ-CODE]** |
| Nodemailer | e-mails (invitations) | **[VÉRIFIÉ-CODE]** |
| Sentry / Winston / monitoring interne | erreurs et télémétrie | **[VÉRIFIÉ-CODE]** |

Aucun secret n'est exposé dans ce rapport et aucun secret en clair n'a été trouvé dans les fichiers suivis (voir section H).

---

## 4. INVENTAIRE FONCTIONNEL

Statuts : **TC** testé et complet · **CNT** complet mais non testé dans cet audit · **PF** partiellement fonctionnel · **BLOQUÉ** · **NON DÉMARRÉ**.

La présence de code n'est jamais comptée comme preuve de fonctionnement.

| Fonctionnalité | Statut | Base du jugement |
|---|---|---|
| Inscription / connexion (Supabase) | CNT | code complet, non exercé en local (dépend de la prod Supabase) |
| Réinitialisation mot de passe | CNT | routes + écrans présents |
| Connexion élève par code d'accès | CNT | `POST /api/auth/student-login` + rate limit |
| Profils / rôles (`admin`, `teacher`, `student`, `rectorat`, `cpd`, `cpc`) | CNT | contrôles côté serveur présents |
| Espace admin (dashboard, rôles, invitations, monitoring, tournois) | CNT | 7 routes admin protégées par `requireAdminAuth` |
| Espace enseignant | CNT | routes et composants présents |
| Espace rectorat / institutions | CNT | routeur `rectorat.js` + écran dédié |
| Abonnements Stripe (checkout, portail) | **PF** | fallback « mocké » qui simule un succès de paiement — section F, **P0** |
| Webhook Stripe | **PF** | accepte les appels non signés en fabriquant un faux événement — section F/H, **P0** |
| Webhook RevenueCat | CNT | secret partagé vérifié si configuré |
| Codes cadeaux | CNT | API admin + activation présentes |
| Quota gratuit (2 sessions/jour) | **PF** | trois valeurs contradictoires (2 / 2 / 3) et compteur stocké en `localStorage` — sections F/H |
| Mode Solo | TC | build OK, 26 tests frontend verts dont régressions de génération, sonde 40 manches sans défaut |
| Mode Apprendre | CNT | route + composant |
| Mode objectif | CNT | travaillé récemment, couvert par des tests de régression |
| **Salle privée (mode en ligne)** | **BLOQUÉ** | lobby « Je suis prêt » / « Démarrer » jamais rendu — section D, **P0** |
| Crazy Arena (tournois 4 joueurs) | CNT | manager serveur volumineux, non exercé |
| Training Arena | CNT | routes + tables dédiées |
| Grande Salle (jeu) | CNT | routeur + écrans |
| **Écran Live Grande Salle** | **PF** | l'écran s'affiche mais les bulles animées ne peuvent pas apparaître — section E, **P1** |
| Tournois Grande Salle, tirages au sort, podium | CNT | migrations et code dédiés |
| Statistiques / historique / classements | CNT | `/my-performance`, `/student/:id/performance`, `leaderboard` |
| Matières / niveaux / thèmes | CNT | `associations.json` + filtres de configuration |
| Import d'élèves, licences institutionnelles | CNT | `schools`, `classes`, `licenses`, onboarding admin |
| PWA / installation mobile | CNT | manifest + service worker + `PWAInstallPrompt` |
| RGPD (export / suppression) | CNT | routeur `rgpd.js` |
| Antifraude | CNT | routeur `antifraud.js` |

**Lecture CTO.** Le produit couvre un périmètre très large, mais une seule brique est réellement démontrée dans cet audit (Solo), une brique payante est bloquée (salle privée) et la chaîne de paiement contient un mode « faux succès ». Le reste est du code plausible sans preuve d'exécution.

---

## 5. BUG A — MODE PRIVÉ : PLATEAU VIDE, PARTIE IMPOSSIBLE À LANCER

### Reproduction

**Environnement :** frontend local `localhost:3000` (CRA), backend local `localhost:4000` (Node v20.18.1), navigateur Chromium, deux clients.

**Étapes :**

1. Client A : `/modes` → mode en ligne → « Créer une salle » → Démarrer.
2. Client A arrive sur `/carte`, le socket se connecte, la salle est créée et le code est reçu.
3. Client B : mode en ligne → « Rejoindre » avec le code → Démarrer.
4. Les deux clients affichent le plateau de jeu **vide**, en-tête « Manche 0/3 », 0 zone.
5. Aucun bouton « ✅ Je suis prêt » ni « 🚀 Démarrer » n'est visible, sur aucun des deux clients.
6. La partie ne peut jamais démarrer.

**Statut de reproduction :** cause racine **[VÉRIFIÉ-CODE]** ; symptôme observé en navigateur local lors des tests d'écran (plateau vide, « Manche 0/3 », 0 zone, pas de contrôle de démarrage). Une capture d'écran horodatée n'est pas joint à ce rapport ; la preuve décisive reste la lecture du code ci-dessous, qui est déterministe.

### Cause racine (déterministe)

`src/components/Carte.js:4889` :

```js
const hasSidebar = fullScreen || roomStatus === 'playing' || gameActive
  || !!arenaMatchId || !!trainingMatchId || (!isSoloMode && socketConnected);
```

`src/components/Carte.js:9783` — le lobby de salle privée n'est rendu **que si `!hasSidebar`** :

```jsx
{socket && !hasSidebar && !isSoloMode && !gsMode && ( ... lobby ... )}
```

Et c'est dans ce bloc, et **uniquement** dans ce bloc, que se trouvent les seuls contrôles de démarrage :

- `Carte.js:9981` → `{myReady ? '✓ Prêt — annuler' : '✅ Je suis prêt'}` (émet `ready:toggle`, `Carte.js:5230`)
- `Carte.js:9995` → `🚀 Démarrer` (émet `room:start`, `Carte.js:5148`)

En mode privé, `isSoloMode` est `false` (`Carte.js:263`, lu depuis `cc_session_cfg.mode !== 'solo'`) et `socketConnected` passe à `true` dès la connexion du socket. Donc `hasSidebar === true` **immédiatement**, donc la condition `!hasSidebar` est fausse, donc **le lobby n'est jamais monté**. La barre latérale rendue à la place (`Carte.js:8383`) ne contient aucun bouton « prêt » ni « démarrer » : la recherche des chaînes « Je suis prêt » / « Démarrer » dans `Carte.js` ne les trouve qu'aux lignes 9981 / 9995, à l'intérieur du bloc mort.

Côté serveur, le démarrage est conditionné aux deux événements que l'UI ne peut plus émettre (`server/server.js`, handler `room:start`) :

```js
const playersArr = Array.from(room.players.values());
const allReady = playersArr.length >= 2 && playersArr.every(p => p.ready);
if (!allReady) return;
```

Aucun `ready:toggle`, donc aucun `room:start` accepté, donc aucun `round:new`, donc 0 zone et « Manche 0/3 ». Le comportement est cohérent de bout en bout.

### Origine de la régression

**[VÉRIFIÉ-EXÉCUTION]** `git log -L4889,4889:src/components/Carte.js` désigne le commit **`a6b45cb` (2026-06-06)** : *« fix: ecran blanc salle privee — hasSidebar couvre !isSoloMode+socketConnected + watchdog multiplayer »*. Le diff ajoute explicitement :

```
-  const hasSidebar = fullScreen || roomStatus === 'playing' || gameActive || !!arenaMatchId || !!trainingMatchId;
+  // ✅ FIX BLANC SALLE PRIVÉE: roomStatus reste 'lobby' (setRoomStatus('playing') jamais appelé)
+  const hasSidebar = ... || (!isSoloMode && socketConnected);
```

Le correctif d'un écran blanc a donc **supprimé le lobby** de la salle privée. Le commentaire du commit montre que l'auteur savait que `roomStatus` restait bloqué sur `'lobby'` : il a contourné le symptôme au lieu de corriger la machine à états. `setRoomStatus('playing')` existe pourtant (`Carte.js:5353`).

### Fichiers concernés

- `src/components/Carte.js` : 4889 (calcul `hasSidebar`), 9783 (garde du lobby), 9981/9995 (contrôles), 4751/5168/5353 (`roomStatus`)
- `server/server.js` : handlers `room:create`, `joinRoom`, `ready:toggle`, `room:start`, `startRound`

### Risque connexe : désynchronisation des plateaux

Le symptôme historiquement rapporté (« plateaux différents entre joueurs ») a une seconde cause, distincte et toujours présente : le client accepte de **générer localement** les zones quand `round:new` arrive sans zones.

`src/components/Carte.js` (handler `round:new`) :

```js
if (hasServerZones) { setZones(payload.zones); }
else {
  console.warn('[CC][client] ⚠️ MULTIPLAYER MODE: Fallback to local generation with seed:', seed, '— DESYNC RISK!');
  safeHandleAutoAssign(seed, zonesFile);
  incidentReportIncident('DESYNC_LOCAL_FALLBACK', { ... });
}
```

Le serveur journalise le même risque pour les arrivées tardives : `« [MP] ⚠️ DESYNC RISK: Late joiner ... no currentZones stored! Will fallback to local generation. »`.

**[VÉRIFIÉ-EXÉCUTION]** Une sonde Socket.IO locale à trois clients (hôte, joueur présent avant le départ, arrivant tardif) sur le serveur local a montré, dans le scénario nominal, des charges `round:new` **identiques** : `hasZones: true`, 16 zones, 0 zone vide, 0 point manquant, empreintes (`zonesFingerprint`) et identifiants de paires identiques pour les trois clients. Le protocole nominal est donc sain.

**Conclusion BUG A.** Deux défauts superposés :

1. **P0 — bloquant** : le lobby de salle privée n'est jamais rendu ; le mode privé est inutilisable (cause : `a6b45cb`).
2. **P1 — latent** : le repli de génération locale peut produire des plateaux différents dès que le serveur n'envoie pas de zones (arrivée tardive sans `currentZones`, rechargement, reconnexion). Le code le sait, le journalise, et continue quand même.

**Sévérité globale BUG A : P0.**

---

## 6. BUG B — ÉCRAN LIVE (GRANDE SALLE) : PAS DE BULLES ANIMÉES

### Comportement attendu

Sur l'écran Live (`/grande-salle/live/:tournamentId`, `src/components/GrandeSalle/LiveBoard.js`), chaque paire validée par un joueur doit provoquer une animation de bulles partant des deux zones concernées vers la vignette « dernière paire », comme sur l'écran joueur et sur le spectateur d'arène.

### Comportement réel

Le flash de la paire fonctionne, mais **aucune bulle animée n'apparaît**.

### Chaîne d'exécution et point de rupture

**[VÉRIFIÉ-CODE]**

1. Le serveur émet bien l'événement (`server/server.js`) :

```js
io.to(`gs:${currentGS}`).emit('gs:pair:valid', { by: socket.id, playerName: player.name, a, b, leaderboard });
```

2. `LiveBoard.js` reçoit l'événement, retrouve les zones `ZA` / `ZB`, déclenche le flash puis appelle l'animation (`LiveBoard.js:382`) :

```js
try { animateBubblesFromZones(zoneAId, zoneBId, color, ZA, ZB, borderColor, label); } catch {}
```

3. Les zones sont bien identifiables dans le DOM (`<g key={zone.id} data-zone-id={zone.id}>`).

4. **Rupture** : `src/utils/gameAnimation.js` a besoin d'une **destination**, cherchée exclusivement par attribut :

```js
const candidates = Array.from(document.querySelectorAll('[data-cc-vignette="last-pair"], [data-cc-vignette]'));
```

```js
const targetEl = getVignetteTargetEl();
if (!targetEl) { setTimeout(() => animateBubblesFromZones(aId, bId, color), 60); return; }
```

5. **`LiveBoard.js` ne porte aucun attribut `data-cc-vignette`.** Recensement exhaustif de l'attribut dans `src/` :

| Fichier | Présence |
|---|---|
| `src/components/GrandeSalle/GrandeSalle.js` | `data-cc-vignette="last-pair"` sur `📡 Fil en direct` |
| `src/components/Tournament/ArenaSpectator.js` | présent |
| `src/components/Carte.js` | présent (×2) |
| `src/components/Training/TrainingArenaGame.js` | présent (×2) |
| **`src/components/GrandeSalle/LiveBoard.js:1020`** | **absent** — `<h3 style={{...}}>📡 Fil en direct</h3>` |

`LiveBoard` est une page autonome : aucun autre composant monté ne fournit l'ancre. `getVignetteTargetEl()` renvoie donc `null`.

6. Le repli n'aide pas : la nouvelle tentative est programmée à 60 ms, mais le garde anti-doublon en tête de fonction (même signature de paire dans une fenêtre de 800 ms) fait sortir immédiatement le second appel :

```js
if (sig && __lastBubbleSig.sig === sig && (now - __lastBubbleSig.ts) < 800) return;
```

Résultat : zéro bulle, aucune erreur en console, aucune boucle infinie — panne silencieuse. À noter également que l'appel de repli perd `ZA`, `ZB`, `borderColor` et `label` : même avec une ancre, l'animation de repli serait dégradée.

**[VÉRIFIÉ-EXÉCUTION]** Sonde jsdom sur `gameAnimation.js` : sans élément `[data-cc-vignette]`, 0 bulle créée immédiatement et 0 après la fenêtre de nouvelle tentative ; avec une ancre, le chemin d'animation insère bien des éléments dans le DOM. Le mécanisme est donc confirmé isolément.

### Différence joueur / écran Live

L'écran joueur (`Carte.js`) et `GrandeSalle.js` portent l'ancre → animation visible. `LiveBoard.js` ne la porte pas → animation impossible. C'est exactement la différence observée par l'utilisateur.

### Fichiers concernés

- `src/components/GrandeSalle/LiveBoard.js` : 382 (appel), 1020 (titre sans attribut)
- `src/utils/gameAnimation.js` : `getVignetteTargetEl()`, `animateBubblesFromZones()`, garde anti-doublon

### Origine probable

**[HYPOTHÈSE]** `LiveBoard.js` a été réécrit sur le modèle d'`ArenaSpectator.js` sans reporter l'attribut `data-cc-vignette`. L'historique de `LiveBoard.js` ne contient aucun commit ayant jamais ajouté cet attribut, ce qui est cohérent avec une ancre jamais posée depuis la réécriture.

**Sévérité BUG B : P1** — l'écran Live reste lisible (scores, flash, fil en direct) ; c'est la valeur spectacle qui manque. C'est un défaut de démonstration commerciale, pas un blocage de jeu.

---

## 7. ÉTAT DES TESTS

**[VÉRIFIÉ-EXÉCUTION]** — Node **v20.18.1**, npm 10.8.2.

| Commande | Résultat |
|---|---|
| `npm ci` | succès ; **65 vulnérabilités** signalées |
| `CI=true npx react-scripts test --watchAll=false` | **3 suites OK — 26 tests réussis, 0 échec, 0 ignoré** |
| `CI=true npx jest server/__tests__/` | **3 suites OK — 27 réussis, 0 échec, 3 ignorés (30 au total)** |
| `CI=true npm run build` | succès ; CRA compile ; bundle `build/static/js/main.*.js` produit |
| Lint | **aucun script de lint** dans `package.json` → impossible à exécuter |
| `npx playwright test` (E2E) | **non exécuté** : `playwright.config.js` a `baseURL` par défaut `https://app.crazy-chrono.com` et le workflow CI réveille le Render de production avec des secrets de production. Exécuter cette suite aurait violé l'interdiction de toucher la production. |

**Tests ignorés côté serveur** (3) : insertion de session SP, insertion base de `persistSessionStart`, nettoyage des sessions de plus de deux heures — c'est-à-dire précisément la persistance en base. **La persistance des parties n'est donc couverte par aucun test actif.**

**Avertissements pendant les tests serveur** : `FINAL PASS: Could not fill zone ... image` émis par le générateur de zones. Les tests passent malgré tout.

**[VÉRIFIÉ-EXÉCUTION]** Sonde locale : 40 manches générées sur plusieurs configurations → **0 zone vide, 0 manche sans paire valide, 0 manche à plusieurs paires valides, 0 échec de génération**. L'avertissement ne s'est donc pas traduit en défaut observable dans cet échantillon, mais il signale que le générateur atteint régulièrement son dernier recours : à surveiller, pas à classer comme résolu.

**Constats.**

- **P1** — aucune couverture E2E exécutable hors production. Il n'existe aucun moyen aujourd'hui de valider une release sans taper la production.
- **P1** — aucun lint, aucun typage. 826 `console.log` dans `src/` + `server/`.
- **P2** — la couverture (26 + 27 tests pour ~90 000 lignes) est symbolique au regard de la surface fonctionnelle ; elle est concentrée sur la génération de zones et le mode objectif.

---

## 8. QUALITÉ DE CODE ET MAINTENABILITÉ

**[VÉRIFIÉ-EXÉCUTION]**

| Fichier | Lignes |
|---|---|
| `src/components/Carte.js` | **10 605** |
| `server/server.js` | **6 363** |
| `server/crazyArenaManager.js` | 4 605 |
| `server/routes/tournament.js` | 3 870 |
| `src/components/GrandeSalle/LiveBoard.js` | 1 069 |
| `src/components/GrandeSalle/GrandeSalle.js` | 1 019 |
| **Total JS/JSX applicatif** | **≈ 90 073** |

Constats.

1. **P1 — `Carte.js` (10 605 lignes) est le cœur du produit et un risque systémique.** Il porte Solo, salle privée, arène, training, mode objectif, HUD, animations et lobby. Les deux bugs P0/P1 du mode privé viennent d'une variable booléenne partagée entre plusieurs modes (`hasSidebar`). Aucune modification de ce fichier n'est aujourd'hui sûre sans test manuel de tous les modes.
2. **P1 — duplication de la logique d'animation et des ancres** entre `Carte.js`, `GrandeSalle.js`, `ArenaSpectator.js`, `TrainingArenaGame.js`, `LiveBoard.js` : un contrat implicite (`data-cc-vignette`) réparti dans cinq composants, sans test, casse silencieusement (BUG B).
3. **P2 — `server/server.js` mélange** CORS, auth, Stripe, RevenueCat, quotas, Socket.IO, fichiers statiques et administration dans un seul module.
4. **P2 — dépendances vulnérables** : frontend **65** (2 critiques, 36 hautes, 14 moyennes, 13 basses) ; serveur **15** (10 hautes, 5 moyennes). Aucun `npm audit fix` exécuté (hors périmètre d'audit).
5. **P2 — 826 `console.log`** en production, dont des traces potentiellement bavardes sur des identités élèves.
6. **P3** — 7 marqueurs `TODO/FIXME/HACK` seulement : la dette n'est pas signalée dans le code, elle est structurelle.
7. **P2 — pas d'`engines`** déclaré : le CI utilise Node 18 dans un workflow et Node 20 dans un autre, et Render/Vercel choisissent librement.

---

## 9. SÉCURITÉ ET DONNÉES

### 9.1 Secrets

**[VÉRIFIÉ-EXÉCUTION]** Fichiers d'environnement suivis : `.env.local.example`, `.env.local.sample`, `.env.production`, `e2e/.env.example`, `server/.env.example`. `.env.production` ne contient que `DISABLE_ESLINT_PLUGIN=true` et `GENERATE_SOURCEMAP=false` — **aucun secret**. Aucune clé Supabase ou Stripe en dur trouvée dans le code suivi. `render.yaml` déclare `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` en `sync: false` (saisis dans Render). **C'est correct.**

### 9.2 Failles constatées dans le code

| # | Constat | Preuve | Sévérité |
|---|---|---|---|
| S1 | **`GET /me?email=...` est non authentifié.** Sans aucun jeton, en fournissant seulement une adresse e-mail, la route renvoie l'`id`, l'e-mail, le `role`, la `region`, le `circonscription_id`, le statut d'abonnement **et l'identité élève associée (nom complet, avatar)**. Le repli passe par `supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })`. | `server/server.js:419-509` **[VÉRIFIÉ-CODE]** | **P0** |
| S2 | **Abonnement en « fail-open ».** `checkSubscription()` renvoie `{ isPro: true }` s'il n'y a pas d'`userId`, pas de Supabase, ou si l'élève n'est pas trouvé. Les sockets non authentifiés sont acceptés (`io.use`, `if (!token && !sessionToken) return next()`), et l'`userId` peut être un `studentId` **fourni par le client**. Conséquence : création/participation aux salles multijoueurs payantes sans abonnement. | `server/server.js:4165-4195`, `4089-4098`, `4294-4299`, `4386` **[VÉRIFIÉ-CODE]** | **P0** |
| S3 | **Checkout Stripe « mocké ».** Si `STRIPE_SECRET_KEY` ou le `price_id` manque, la route renvoie `{ ok:true, url: success_url + '&mock=1' }` : l'utilisateur est redirigé vers `/account?checkout=success` **sans avoir payé**. | `server/server.js:2233-2256` **[VÉRIFIÉ-CODE]** | **P0** |
| S4 | **Webhook Stripe sans vérification si mal configuré.** Sans `STRIPE_WEBHOOK_SECRET` ou sans en-tête de signature, le code fabrique `event = { id:'evt_mock', type:'mock.event' }` et répond 200 au lieu de rejeter. | `server/server.js:2280-2295` **[VÉRIFIÉ-CODE]** | **P0** |
| S5 | **Endpoints destructifs non authentifiés** : `DELETE /delete-image` (supprime un fichier sous `public/` et nettoie `elements.json`) et `POST /purge-elements` (purge le catalogue d'éléments). Une protection anti-traversal existe, mais **aucun contrôle d'identité**. | `server/server.js:2416`, `2521` **[VÉRIFIÉ-CODE]** | **P1** (atténué : `rootDir: server` sur Render, donc `../public` peut être absent en production — **[HYPOTHÈSE]** à vérifier) |
| S6 | **IDOR sur `/me/subscription`** : la route exige un jeton mais lit `user_id` dans la requête sans vérifier qu'il correspond à l'appelant → tout compte authentifié peut lire le statut d'abonnement d'un autre. | `server/server.js:614-627` **[VÉRIFIÉ-CODE]** | **P1** |
| S7 | **`GET /students` non authentifié** (sert `public/data/students.json`, avec jeu de démonstration en repli). | `server/server.js:2386` **[VÉRIFIÉ-CODE]** | **P1** |
| S8 | **Quota gratuit contournable côté client** : compteur en `localStorage` (`cc_free_quota`), et `serverAllowsStart()` renvoie `allow: true` sur erreur/timeout de 2,5 s. `/usage/can-start` autorise aussi si Supabase n'est pas configuré. | `src/utils/subscription.js`, `src/components/Carte.js:831-851`, `server/server.js:332-341` **[VÉRIFIÉ-CODE]** | **P1** |
| S9 | **RLS incomplète dans les migrations** : 10 fichiers sur 19 activent RLS ; 6 politiques en `USING (true)`, dont deux en `FOR ALL`. État réel de la production non vérifié. | `server/migrations/*.sql` **[VÉRIFIÉ-CODE]** / **[NON TESTÉ]** en production | **P0 tant que non vérifié** |
| S10 | **CSP désactivée** (`helmet({ contentSecurityPolicy: false })`) et CORS acceptant `^https://crazy-chrono.*\.vercel\.app$` (toute préproduction Vercel du projet, y compris éphémère). | `server/server.js:32-43` **[VÉRIFIÉ-CODE]** | **P2** |
| S11 | **Données de mineurs et journalisation** : les élèves sont identifiés par un e-mail construit sur leur code d'accès (`{code}@eleve.crazychrono.app`), avec 826 `console.log` dans le code et une télémétrie riche. Le risque de journaliser des identités d'enfants est réel. Pas de fuite précise démontrée ici. | **[HYPOTHÈSE]** | P1 |

**Bons points constatés.** `requireAuth` et `requireAdminAuth` sont correctement écrits ; les 7 routes admin sensibles les utilisent ; `POST /admin/users/role` revérifie le rôle appelant ; rate limiting global et spécifique auth en place ; Helmet, CORS liste blanche, `trust proxy` ; webhook RevenueCat protégé par secret partagé ; aucun secret en clair dans le dépôt ; clé service role côté serveur uniquement.

### 9.3 Incident de test à consigner

**[VÉRIFIÉ-EXÉCUTION]** Pendant les essais **locaux**, le frontend a émis des requêtes vers la **production** (`https://crazy-chrono-backend.onrender.com`) : `/api/config/free-limit`, `/me?email=...`, `/me/subscription`, `/api/training/records`, `/math-positions`, `/healthz`, ainsi que `/api/monitoring/client-telemetry`, `/api/monitoring/client-diag`, `/api/progress/log`. Cause : plusieurs modules codent l'URL de production en repli dur (`process.env.REACT_APP_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com'`), notamment `src/utils/subscription.js:6`, `src/components/Billing/Pricing.js`, `src/components/Carte.js:834`, alors qu'un utilitaire `getBackendUrl()` existe et est utilisé ailleurs.

Un blocage temporaire a été posé dans `/etc/hosts` (`crazy-chrono-backend.onrender.com` et `app.crazy-chrono.com` → `0.0.0.0`, sauvegarde `/tmp/hosts.bak`) pour stopper ces appels. **Certaines requêtes de télémétrie/configuration ont pu atteindre la production avant ce blocage.** Aucune donnée Supabase n'a été modifiée, aucun fichier du dépôt n'a été touché.

**P1** — un poste de développement pointe par défaut sur la production. Tout développeur pollue les métriques de production sans le savoir ; c'est aussi un risque de corruption de données si un module POST écrit un jour en base.

---

## 10. DÉPLOIEMENT ET ENVIRONNEMENTS

**[VÉRIFIÉ-CODE]**

`render.yaml` : service web `crazy-chrono-backend`, `rootDir: server`, `buildCommand: npm install`, `startCommand: npm start`, `NODE_ENV=production`, `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` en secrets, `FRONTEND_URL=https://app.crazy-chrono.com`, `BACKEND_URL=https://crazy-chrono-backend.onrender.com`, `healthCheckPath: /healthz`, **`FREE_SESSIONS_PER_DAY: 3`**.

`vercel.json` : build CRA avec injection `REACT_APP_GIT_SHA` / `REACT_APP_BUILD_TIME`, réécriture SPA vers `index.html`.

CI GitHub :

- `.github/workflows/tests.yml` → Node 20
- `.github/workflows/e2e-tests.yml` → **Node 18**, cible les **URLs de production**, réveille le service Render et nécessite des secrets de production

Constats.

1. **P1 — pas d'environnement de préproduction réel.** `staging` == `main`, et les tests E2E tapent la production. Il n'existe aucun endroit où valider un correctif avant les utilisateurs.
2. **P1 — `buildCommand: npm install`** (et non `npm ci`) : builds non reproductibles côté backend.
3. **P2 — versions Node divergentes** entre les deux workflows, sans `engines` pour arbitrer.
4. **P2 — la santé du backend dépend du réveil de Render** (service qui s'endort) : premier accès lent pour un prospect.

---

## 11. PAIEMENTS, ABONNEMENTS ET TARIFS

### 11.1 Trois grilles tarifaires contradictoires

**[VÉRIFIÉ-CODE]** Particuliers :

| Formule | Demandé par la direction | Code (`src/components/Billing/Pricing.js`) | `DOCS/GRILLE_TARIFAIRE.md` (« officiel », v1.0) |
|---|---|---|---|
| Solidaire | 4,90 €/mois | **4,90 €** ✅ | **5,90 €** ❌ |
| Individuel / Standard | 9,90 €/mois | **9,90 €** ✅ | 9,90 € ✅ |
| Famille | 14,90 €/mois | **14,90 €** ✅ | **absent** ❌ |
| Annuel | 89,90 €/an | **89,90 €** ✅ | 89,90 € ✅ |

Institutions (par élève et par mois) :

| Palier demandé | Prix demandé | Code | Doc officielle |
|---|---|---|---|
| 1–30 | 9,90 € / 99 €/an | **1–30 : 9,90 € / 99,00 €** ✅ | 1–10 : 9,90 € ❌ |
| 31–100 | 7,90 € / 79 €/an | **31–100 : 7,90 € / 79,00 €** ✅ | 11–50 : 6,90 € ❌ |
| 101–300 | 5,90 € / 59 €/an | **101–300 : 5,90 € / 59,00 €** ✅ | 51–200 : 4,90 € ❌ |
| 301–1000 | 4,90 € / 49 €/an | **301–1000 : 4,90 € / 49,00 €** ✅ | 201–1000 : 3,90 € ❌ |
| 1001+ | sur devis | **1001+ : sur devis** ✅ | 1001–2000 : 2,90 € ; 2000+ : 1,90 € ❌ |

**Le code est conforme à la demande de la direction. C'est le document tarifaire « officiel » du dépôt qui est faux**, et il propose des prix institutionnels jusqu'à 2,5× inférieurs. **P1** : risque commercial direct si un commercial ou un partenaire s'appuie sur `DOCS/GRILLE_TARIFAIRE.md`.

### 11.2 Quota gratuit : trois valeurs

| Source | Valeur |
|---|---|
| Règle demandée | **2** sessions Solo/jour |
| `server/server.js:322` (défaut) | 2 |
| `src/utils/subscription.js:37` (repli client) | 2 |
| **`render.yaml` (production)** | **3** |

**[VÉRIFIÉ-CODE]** La variable d'environnement Render l'emporte sur le défaut du code : la production sert donc très probablement **3** sessions gratuites au lieu de 2, exposée par `GET /api/config/free-limit`. **P1** (ce rapport ne modifie aucune variable d'environnement, conformément au périmètre).

### 11.3 Intégrité de la chaîne de paiement

- **P0 (S3)** — checkout « mocké » qui redirige vers un succès sans paiement dès que Stripe n'est pas complètement configuré. Aucune bannière, aucun garde-fou d'environnement : `mocked: true` est renvoyé mais l'UI suit l'URL de succès.
- **P0 (S4)** — webhook Stripe acceptant les appels non signés (faux événement `mock.event`, réponse 200).
- **P0 (S2)** — accès multijoueur payant obtenu sans abonnement via le fail-open de `checkSubscription()` et les sockets anonymes.
- **P1 (S8)** — quota gratuit contournable (vidage du `localStorage`, ou simple erreur/timeout serveur qui autorise par défaut).
- **[NON TESTÉ]** Aucun parcours de paiement réel (Stripe test ou production) n'a été exécuté : interdiction de toucher la production et absence de clés de test locales. **Personne ne peut affirmer aujourd'hui qu'un paiement aboutit à un `subscriptions.status = 'active'` exploitable.**

---

# SYNTHÈSE POUR DÉCISION

## A. ÉTAT GLOBAL DU PRODUIT

Crazy Chrono est un produit **large et avancé en surface, mais non démontré**. Le socle technique existe réellement : ~90 000 lignes, 48 routes frontend, ~50 tables Supabase, 15 routeurs backend, Socket.IO, Stripe, RevenueCat, PWA, monitoring maison, tournois, comptes élèves, licences institutionnelles. Le build passe, les 53 tests automatisés passent, le mode Solo est solide et récemment durci par des tests de régression sérieux.

Mais : **le mode multijoueur privé est aujourd'hui inutilisable** (impossible de lancer une partie), **la chaîne de paiement contient un mode « faux succès »**, **le contrôle d'abonnement s'ouvre par défaut**, **une route non authentifiée expose des données d'utilisateurs et d'élèves**, il n'existe **ni préproduction, ni lint, ni E2E exécutable hors production**, et la documentation contredit le code sur les prix.

Autrement dit : un produit dont la vitrine (Solo, Apprendre, écrans) est présentable, dont la mécanique payante n'est ni fiable ni protégée, et dont l'organisation technique n'offre aucun filet de sécurité avant les utilisateurs.

## B. 10 RISQUES LES PLUS GRAVES

| # | Risque | Sév. | Preuve |
|---|---|---|---|
| 1 | Mode privé impossible à démarrer : lobby jamais rendu (`hasSidebar`), régression de `a6b45cb` | P0 | `Carte.js:4889` / `9783` / `9981` / `9995` |
| 2 | Checkout Stripe simulant un succès de paiement sans paiement | P0 | `server.js:2233-2256` |
| 3 | Webhook Stripe acceptant les appels non signés (faux événement, 200 OK) | P0 | `server.js:2280-2295` |
| 4 | Contrôle d'abonnement en fail-open + sockets anonymes → multijoueur payant gratuit | P0 | `server.js:4165`, `4089`, `4294`, `4386` |
| 5 | `GET /me?email=` non authentifié exposant identités, rôles, abonnements et données élèves | P0 | `server.js:419-509` |
| 6 | RLS non prouvée en production (10/19 migrations, 6 politiques `USING (true)`) sur des données de mineurs | P0 (tant que non vérifiée) | `server/migrations/*.sql` |
| 7 | Aucune préproduction (`staging` == `main`) et E2E ciblant la production | P1 | `git rev-parse`, `playwright.config.js`, workflows |
| 8 | Désynchronisation possible des plateaux via repli de génération locale | P1 | handler `round:new` de `Carte.js`, log `DESYNC RISK` serveur |
| 9 | `Carte.js` (10 605 lignes) : tout mode partagé, toute modification risquée | P1 | mesure de lignes ; les bugs 1 et 8 en sortent |
| 10 | Trois sources de vérité tarifaires + quota production à 3 au lieu de 2 | P1 | `Pricing.js`, `DOCS/GRILLE_TARIFAIRE.md`, `render.yaml` |

## C. BLOQUEURS AVANT PREMIER CLIENT PAYANT

Strictement les points sans lesquels encaisser de l'argent est irresponsable. Le reste n'est pas listé ici.

1. **Rendre le mode privé jouable** (bug 1). Un mode multijoueur vendu et non démarrable = remboursement immédiat et perte de confiance.
2. **Supprimer le checkout « mocké »** (bug 2) : en production, l'absence de configuration Stripe doit provoquer une erreur, jamais un succès.
3. **Rendre obligatoire la vérification de signature du webhook Stripe** (bug 3) : sans elle, l'état des abonnements n'est pas fiable.
4. **Fermer le fail-open d'abonnement** (bug 4) : sans identité vérifiée, pas d'accès payant.
5. **Authentifier ou supprimer `GET /me?email=`** (bug 5) : exposition de données personnelles, dont des données d'enfants — enjeu RGPD, pas seulement technique.
6. **Vérifier et documenter l'état RLS réel de Supabase production** (bug 6) sur `students`, `user_profiles`, `subscriptions`, `classes`, `licenses`.
7. **Valider de bout en bout un paiement réel** (Stripe mode test puis un paiement réel contrôlé) jusqu'à `subscriptions.status = 'active'` et déblocage effectif des fonctions payantes. Aujourd'hui **[NON TESTÉ]**.

## D. ÉTAT DU MODE PRIVÉ

**Non fonctionnel — P0.** Deux joueurs peuvent créer et rejoindre une salle, le serveur les enregistre, mais **aucun contrôle « Je suis prêt » / « Démarrer » n'est rendu** : ces boutons vivent exclusivement dans un bloc conditionné par `!hasSidebar` (`Carte.js:9783`), alors que `hasSidebar` devient vrai dès la connexion du socket en mode non-solo (`Carte.js:4889`). Sans `ready:toggle`, le serveur refuse `room:start` (il exige ≥ 2 joueurs tous prêts), donc aucun `round:new`, donc plateau vide et « Manche 0/3 ». Régression introduite par `a6b45cb` (2026-06-06) en corrigeant un écran blanc.

Second défaut, latent : quand `round:new` arrive sans zones, le client **génère les zones localement** (repli explicitement commenté « DESYNC RISK » dans le code, et journalisé côté serveur pour les arrivants tardifs) → plateaux différents entre joueurs. Le protocole nominal, lui, est sain : sonde locale à 3 clients, charges identiques (16 zones, empreintes et paires identiques, 0 zone vide).

## E. ÉTAT DE L'ÉCRAN LIVE

**Partiellement fonctionnel — P1.** L'écran affiche le plateau, les scores, le flash de la paire validée et le fil en direct. Les **bulles animées ne peuvent pas apparaître** : `animateBubblesFromZones()` cherche sa destination via `[data-cc-vignette]`, attribut présent dans `Carte.js`, `GrandeSalle.js`, `ArenaSpectator.js` et `TrainingArenaGame.js` mais **absent de `LiveBoard.js`** (titre « 📡 Fil en direct », `LiveBoard.js:1020`). La destination est `null`, l'unique nouvelle tentative à 60 ms est neutralisée par le garde anti-doublon de 800 ms : panne silencieuse, sans erreur console. Confirmé isolément par sonde jsdom (0 bulle sans ancre, animation effective avec ancre).

## F. ÉTAT DES PAIEMENTS ET ABONNEMENTS

**Non fiable — P0.** Prix du code conformes à la demande (particuliers 4,90 / 9,90 / 14,90 / 89,90 ; institutions 9,90 / 7,90 / 5,90 / 4,90 / devis), mais :

- checkout « mocké » redirigeant vers un succès sans paiement ;
- webhook Stripe acceptant les appels non signés ;
- `checkSubscription()` renvoyant `isPro: true` par défaut, sockets anonymes acceptés ;
- quota gratuit stocké côté client et autorisant par défaut en cas d'erreur serveur ;
- `render.yaml` annonçant 3 sessions gratuites/jour au lieu de 2 ;
- `DOCS/GRILLE_TARIFAIRE.md` contredisant les prix réels (Solidaire 5,90 €, paliers institutionnels jusqu'à 2,5× moins chers, pas de formule Famille) ;
- aucun parcours de paiement réel vérifié **[NON TESTÉ]**.

## G. ÉTAT DES TESTS

**Insuffisant mais honnête là où il existe.** Frontend : 26/26 verts. Serveur : 27 verts, 3 ignorés (tous sur la persistance en base), 0 échec. Build production : succès. Aucun lint disponible. E2E Playwright : 15 fichiers de scénarios existent mais la suite cible `https://app.crazy-chrono.com` par défaut et le workflow CI exige des secrets de production → **non exécutable en préproduction, donc non exécutée dans cet audit**. Avertissements récurrents du générateur de zones (`FINAL PASS: Could not fill zone`) sans défaut reproduit sur 40 manches sondées.

## H. ÉTAT DE LA SÉCURITÉ

**Fondations correctes, brèches critiques.** Points sains : pas de secret dans le dépôt, clé service role côté serveur uniquement, `requireAuth`/`requireAdminAuth` bien écrits et utilisés sur les routes admin, rate limiting, Helmet, CORS liste blanche, webhook RevenueCat authentifié par secret.

Brèches : `GET /me?email=` non authentifié exposant identités et données élèves (**P0**) ; fail-open d'abonnement avec sockets anonymes (**P0**) ; webhook Stripe non vérifié si mal configuré (**P0**) ; RLS non prouvée en production (**P0 tant que non vérifiée**) ; `DELETE /delete-image` et `POST /purge-elements` non authentifiés (**P1**) ; IDOR sur `/me/subscription` (**P1**) ; `GET /students` non authentifié (**P1**) ; quota client contournable (**P1**) ; CSP désactivée et CORS ouvert aux préproductions Vercel (**P2**) ; 826 `console.log` sur un produit traitant des données de mineurs (**P1**).

À consigner : pendant les tests locaux, le frontend a émis des appels vers le backend de **production** (URLs de production codées en repli dur dans plusieurs modules). Un blocage `/etc/hosts` temporaire a été posé ; certaines requêtes de télémétrie ont pu aboutir avant. Aucune donnée Supabase modifiée, aucun fichier du dépôt touché.

## I. ÉTAT DE L'ARCHITECTURE

Architecture **cohérente sur le papier, insuffisamment cloisonnée en pratique**. Le choix « serveur autoritaire pour la génération des manches en ligne, client autoritaire en Solo » est bon et respecté. Mais : un composant unique de 10 605 lignes porte tous les modes de jeu ; un serveur unique de 6 363 lignes porte auth, paiements, quotas, temps réel et administration ; les contrats inter-composants passent par des attributs DOM non testés (`data-cc-vignette`) et par `localStorage` (`cc_session_cfg`) ; l'URL du backend est parfois centralisée (`getBackendUrl()`), parfois codée en dur vers la production. CRA (`react-scripts` 5) est en fin de vie et impose 65 vulnérabilités de chaîne de build.

## J. DETTE TECHNIQUE PRINCIPALE

1. `Carte.js` 10 605 lignes / `server.js` 6 363 lignes — extraction des modes et des domaines indispensable avant toute nouvelle fonctionnalité multijoueur (P1).
2. Absence de préproduction et de E2E exécutable hors production (P1).
3. Absence de lint et de typage, 826 `console.log` (P1).
4. URLs de production codées en dur dans le frontend (P1).
5. 80 vulnérabilités npm cumulées (65 front / 15 serveur) dont 2 critiques (P2).
6. Persistance en base non testée (3 tests ignorés) (P2).
7. RLS partielle dans les migrations, politiques `USING (true)` (P2 côté dépôt, P0 côté production non vérifiée).
8. `buildCommand: npm install` et absence d'`engines` → builds non reproductibles (P2).
9. Documentation contradictoire (`README`, grille tarifaire, `render.yaml`) (P1).
10. Branches mortes et écriture de données d'exécution dans le dépôt (P3).

## K. CE QUI EST DÉJÀ VENDABLE

- **Le mode Solo** : le seul périmètre réellement démontré (build vert, 26 tests dont régressions de génération de cartes, sonde 40 manches sans défaut, invariants de `REGLES_CRITIQUES.md` respectés).
- **Le mode Apprendre** et le contenu pédagogique (matières / niveaux / thèmes) : même socle de génération que Solo. **[CNT]** — à valider par un test manuel avant toute promesse.
- **La vitrine** : pages de présentation, tarifs, mentions légales, PWA installable.
- **La proposition de valeur institutionnelle sur le papier** : espace enseignant, import d'élèves, licences, rectorat existent en code — vendables **en pilote accompagné**, pas en libre-service.

Formulation commerciale prudente recommandée : vendre aujourd'hui **l'entraînement individuel (Solo/Apprendre)**, et présenter le multijoueur et les tournois comme **feuille de route démontrée en accompagnement**, pas comme fonctionnalités livrées.

## L. CE QUI NE DOIT PAS ENCORE ÊTRE VENDU

1. **Le multijoueur en salle privée** — non démarrable (P0).
2. **Tout abonnement en libre-service** — checkout « mocké », webhook non vérifié, fail-open d'abonnement (P0).
3. **Les tournois (Crazy Arena, Grande Salle, Training Arena)** — jamais exercés dans cet audit, dépendants du même socle temps réel que le mode privé **[NON TESTÉ]**.
4. **L'écran Live comme argument spectacle** — les bulles animées ne s'affichent pas (P1).
5. **Les offres institutionnelles en autonomie** (import massif, licences, tableaux de bord) — non testées, et exposition de données d'élèves non refermée (P0 sécurité).
6. **Toute promesse de « données protégées »** avant vérification de la RLS de production et fermeture de `GET /me?email=`.

## M. ORDRE RECOMMANDÉ DES 10 PROCHAINES MISSIONS

Chaque mission est calibrée pour une session de travail focalisée, avec un critère d'acceptation vérifiable.

| # | Mission | Sév. | Critère d'acceptation |
|---|---|---|---|
| 1 | **Réparer le lobby de salle privée** : découpler l'affichage du lobby de `hasSidebar` et faire vivre `roomStatus` (`lobby` → `playing`) au lieu de le contourner. | P0 | 2 joueurs se mettent prêts, l'hôte démarre, `round:new` reçu, plateaux identiques ; test de non-régression sur l'écran blanc de `a6b45cb`. |
| 2 | **Sécuriser la chaîne de paiement** : supprimer le checkout mocké en production, rendre la signature du webhook Stripe obligatoire, journaliser les événements idempotents. | P0 | En production sans configuration Stripe → erreur explicite ; webhook non signé → 400 ; paiement Stripe test → `subscriptions.status='active'`. |
| 3 | **Fermer le fail-open d'abonnement** : refuser l'accès aux modes payants sans identité vérifiée côté serveur ; cesser de faire confiance au `studentId` fourni par le client. | P0 | Socket anonyme → refus de `room:create` / `joinRoom` non-solo ; élève licencié → accès. |
| 4 | **Refermer les fuites de données** : authentifier ou supprimer `GET /me?email=`, corriger l'IDOR de `/me/subscription`, protéger `/students`, `DELETE /delete-image`, `POST /purge-elements`. | P0 | Chaque route sensible renvoie 401/403 sans jeton valide ; test automatisé par route. |
| 5 | **Audit et durcissement RLS Supabase production** : inventaire table par table, RLS activée sur toutes les tables de données personnelles, suppression des politiques `USING (true)`, migrations rejouables versionnées. | P0 | Rapport table/politique ; clé anon incapable de lire `students`, `user_profiles`, `subscriptions`. |
| 6 | **Créer une préproduction réelle** : `staging` distinct de `main`, backend et base Supabase de préproduction, E2E Playwright pointant sur la préproduction, `npm ci` au build Render, `engines` Node unifié. | P1 | Une release passe par staging ; suite E2E verte sans toucher la production. |
| 7 | **Aligner les prix et les quotas sur une source unique** : `render.yaml` à 2 sessions/jour, réécriture de `DOCS/GRILLE_TARIFAIRE.md`, quota vérifié côté serveur et non contournable côté client. | P1 | Une seule grille de référence ; `/api/config/free-limit` renvoie 2 ; vider le `localStorage` ne rend pas de sessions gratuites. |
| 8 | **Corriger l'écran Live et sécuriser le contrat d'animation** : ancre `data-cc-vignette` dans `LiveBoard`, préservation des arguments lors de la nouvelle tentative, test garantissant que chaque écran de jeu porte une ancre. | P1 | Bulles visibles sur `/grande-salle/live/:id` ; test échouant si une ancre disparaît. |
| 9 | **Supprimer le repli de génération locale en multijoueur** : traiter l'absence de zones comme une erreur (attente/resynchronisation serveur) plutôt qu'une divergence silencieuse ; couvrir l'arrivée tardive et le rechargement. | P1 | Arrivée tardive et rechargement → plateau identique à l'hôte ; plus aucun incident `DESYNC_LOCAL_FALLBACK`. |
| 10 | **Assainir les fondations** : extraire les modes de `Carte.js`, centraliser `getBackendUrl()`, ajouter lint + CI bloquante, réduire les `console.log`, traiter les vulnérabilités critiques, remettre `README.md` en conformité. | P1/P2 | Lint vert en CI ; aucune URL de production en dur ; `Carte.js` réduit par extraction sans régression Solo. |

Les missions 1 à 5 conditionnent le premier euro encaissé. Les missions 6 et 7 conditionnent la capacité à livrer sans casser. Les missions 8 à 10 conditionnent la crédibilité commerciale et la vitesse future.

## N. VERDICT FINAL

# NO-GO COMMERCIAL

**Motivation.** En l'état du commit `4346dc6`, quatre défauts P0 indépendants et vérifiés dans le code interdisent d'encaisser un paiement : (1) le mode multijoueur privé ne peut pas démarrer, (2) le checkout peut simuler un succès de paiement, (3) le webhook Stripe accepte des appels non signés, (4) le contrôle d'abonnement s'ouvre par défaut, y compris pour des sockets anonymes. S'y ajoutent une route non authentifiée exposant des identités et des données d'élèves mineurs, et une RLS de production non vérifiée — sujets RGPD, pas seulement techniques. Enfin, aucun parcours de paiement réel n'a jamais été démontré.

**Ce NO-GO est un NO-GO de séquence, pas de valeur.** Le produit est nettement plus avancé que ce qu'un lancement raté laisserait paraître : le Solo est solide et testé, l'ampleur fonctionnelle est réelle, et les quatre bloqueurs sont **localisés, compris et petits en volume de code** — un booléen d'affichage, deux replis « mode démo » dans les routes Stripe, une valeur de retour par défaut, une route à authentifier.

**Chemin vers le GO.** Missions 1 à 5 de la section M, puis un paiement réel contrôlé de bout en bout et une partie privée à deux joueurs jouée jusqu'au bout. À ce moment, et sans autre développement, le verdict devient **GO COMMERCIAL SOUS RÉSERVES** (vente de l'entraînement individuel et pilotes institutionnels accompagnés, multijoueur et tournois annoncés comme périmètre à démontrer).

---

## ANNEXE — PÉRIMÈTRE ET LIMITES DE CET AUDIT

**Réalisé :** lecture du dépôt au commit `4346dc6` ; `npm ci` racine et serveur ; suites Jest frontend et backend ; build de production ; sonde Socket.IO locale à 3 clients sur salle privée ; sonde jsdom sur `gameAnimation.js` ; sonde de génération sur 40 manches ; inventaire des routes HTTP, routes frontend, tables Supabase, migrations et politiques ; revue des middlewares d'authentification, de Stripe, RevenueCat et des quotas ; comparaison documentation / code / configuration de déploiement ; archéologie git des deux bugs.

**Non réalisé, par respect du périmètre :** aucun accès à la production, à Supabase production, à Stripe production ; aucune exécution de la suite E2E Playwright (ciblage production par défaut) ; aucune vérification de l'état RLS réel de la base de production ; aucun parcours de paiement ; aucune modification de code applicatif, de test, de dépendance, de variable d'environnement ou de donnée.

**À noter pour la mission suivante :** un blocage temporaire des domaines de production a été ajouté dans `/etc/hosts` de la machine d'audit (sauvegarde `/tmp/hosts.bak`) pour empêcher le frontend local d'appeler la production ; il est propre à cette machine et n'affecte aucun environnement du produit.
