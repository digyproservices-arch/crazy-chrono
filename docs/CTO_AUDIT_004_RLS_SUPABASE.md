# CTO-004 — AUDIT RLS / SUPABASE (frontière base de données)

Audit en lecture seule. **Aucune policy, migration, clé ou donnée de production n'a été modifiée.**
Aucun accès Supabase (même read-only) n'a été fourni à cette session : voir `PRODUCTION_RLS_UNVERIFIED`.

- Dépôt : `digyproservices-arch/crazy-chrono`
- Base auditée : `main` @ `d1338ae02fbc7c597e92621e5c732704eefc67d3` (contient CTO-001/002/003)
- Date : 2026-08-10
- Périmètre : RLS, policies, GRANT/REVOKE, RPC `SECURITY DEFINER`, accès direct du frontend via clé anon, isolation de la clé service-role.
- Hors périmètre (backlog) : Mode Privé, Live, `BUG-SOLO-RESPONSIVE-001`, `Carte.js`, tarifs, CI `Headers is not defined`.

---

## 0. BLOQUEUR PRÉALABLE — LA PRODUCTION N'EXÉCUTE NI CTO-002 NI CTO-003

Le contrôle post-fusion demandé avant CTO-004 échoue. Ce n'est **pas** une régression de CTO-003 :
c'est un **non-déploiement**. Le backend Render sert toujours le code antérieur à CTO-002.

Preuves (lecture seule, aucun paiement, aucune écriture) :

| Contrôle | Attendu (code de `main`) | Production `crazy-chrono-backend.onrender.com` |
|---|---|---|
| `/health` | 200 | 200 `{"ok":true,...}` |
| `/healthz` | 200 | 200 |
| frontend `app.crazy-chrono.com` | 200 | 200 |
| `GET /me?email=test@example.com` | 401 | 401 (par coïncidence : l'ancien chemin `?email=` ne trouve pas cet utilisateur) |
| `POST /usage/can-start` sans JWT | 401 | 401 (déjà `requireAuth` avant CTO-003) |
| `GET /students` sans JWT | **401** | **200** + liste (contenu strictement identique à `public/data/students.json`, l'ancien handler sans `requireAuth`) |
| `POST /webhooks/stripe` **sans signature** | 400/503 fail-closed | **200 `{"received":true}`** |
| `uptime` renvoyé par `/health` | redémarrage récent | **≈ 3 392 700 s ≈ 39 jours** (process démarré ~2026-07-02, soit avant CTO-002) |

Conséquences en production **aujourd'hui** :

- `POST /webhooks/stripe` accepte un événement **non signé** → un tiers peut forger un
  `checkout.session.completed` et s'octroyer un abonnement. C'est exactement le P0 corrigé par CTO-002.
- `GET /students` reste public (données de démonstration, pas d'élèves réels : 4 lignes fictives).
- `checkSubscription()` fail-open, sockets payants non authentifiés, `/me?email=` : anciens comportements toujours actifs.

**Action requise avant toute commercialisation et avant toute correction RLS : redéployer Render sur `main`**
(le service tourne sur un build figé ; `render.yaml` pointe bien `rootDir: server`, `healthCheckPath: /healthz`).
Tant que ce déploiement n'a pas eu lieu, les verdicts CTO-002 et CTO-003 ne s'appliquent qu'au code, pas au produit servi.

---

## 1. PRODUCTION_RLS_UNVERIFIED

Aucun accès Supabase (URL + clé, même read-only, même via un rôle dédié) n'est disponible dans cette session
(`list_secrets` → aucun secret). **Aucune** des affirmations ci-dessous sur l'état *réel* de la base n'est vérifiée :
tout provient des fichiers SQL du dépôt, qui sont des scripts « à exécuter manuellement dans le SQL Editor »,
sans table de suivi de migration, sans horodatage d'application, et parfois contradictoires entre eux.

Ce que le dépôt **prouve** : l'intention des policies, les tables lues/écrites par le frontend avec la clé anon,
l'absence de clé service-role commitée, les signatures des RPC.

Ce que **seul Supabase réel** peut confirmer : `pg_tables.rowsecurity` table par table, la liste réelle de
`pg_policies`, les `GRANT`/`REVOKE` effectifs sur les fonctions, l'existence de `webhook_events` et de la
contrainte d'unicité `subscriptions.user_id`, le nombre de comptes élèves sans mapping.

Requêtes read-only à exécuter par le propriétaire pour lever ce statut (aucune écriture) : voir §10.

---

## 2. A — CARTOGRAPHIE DES TABLES

Légende : « front direct » = appelé depuis le navigateur avec la clé **anon** ; « service role » = via `supabaseAdmin` côté serveur.
« RLS (dépôt) » = ce que les fichiers SQL du dépôt déclarent, **non vérifié en production**.

| Table | Données | Lecture front directe | Écriture front directe | Service role | RLS (dépôt) | Policies (dépôt) | Risque |
|---|---|---|---|---|---|---|---|
| `user_profiles` | id, email, pseudo, prénom/nom, **role**, region, circonscription_id, préférences | **OUI** (`Login.js`, `AdminRoles.js`) | **OUI** (`upsert` avec `role` à l'inscription, `update` dans `Account.js`, `update role` dans `AdminRoles.js`) | oui | **AUCUN `CREATE TABLE`, AUCUN `ENABLE RLS`, AUCUNE POLICY dans le dépôt** | — | **P0** escalade de privilèges |
| `subscriptions` | user_id, stripe_subscription_id, price_id, status, period_end, source | non | non | oui | activée | `subscriptions_read_own` (SELECT own) uniquement | P1 (pas d'unicité `user_id`, cf. §6) |
| `webhook_events` | event_id (idempotence Stripe/RevenueCat) | non | non | oui | **table absente du dépôt** | — | **P0 non vérifiable** |
| `students` | id, prénom, nom, full_name, niveau, class_id, school_id, circonscription_id, email, **access_code**, licensed | non | non | oui | activée (`migration_rls_tournament.sql`) | `students_select_own` (via mapping), `students_select_teacher` (via `auth.users`, cf. §7) | P1 |
| `student_stats` | performances agrégées élève | non | non | oui | activée | own + teacher | P1 |
| `classes` | id, nom, niveau, **teacher_email**, school_id | non | non | oui | activée | `classes_select_authenticated` **USING (true)** | **P1** |
| `schools` | id, nom, commune, circonscription_id | non | non | oui | activée | `schools_select_authenticated` **USING (true)** | P2 |
| `user_student_mapping` | user_id ↔ student_id, active | non | non | oui | activée | own SELECT + admin ALL | OK (dépendant de `user_profiles`) |
| `licenses` | licences, validité | non | non | oui | activée | own SELECT + admin ALL | OK |
| `sessions` (progress) | user_id, mode, classes, thèmes, durée | **OUI** (`ProgressDebug.js`) | non (front) | oui | activée | **`allow_all_sessions` FOR ALL USING (true) WITH CHECK (true)** | **P0** |
| `attempts` | user_id, item, objectif, correct, latence, thème | **OUI** (`ProgressDebug.js`) | non (front) | oui | activée | **`allow_all_attempts` FOR ALL USING (true) WITH CHECK (true)** | **P0** |
| `training_sessions` / `training_results` / `student_training_stats` | sessions et résultats individuels d'élèves | non | non | oui | activée | **`service_role_full_access_*` FOR ALL USING (true) WITH CHECK (true)** (nom trompeur : s'applique à `public`) — contredit `create_training_tables.sql` qui définit des policies restrictives | **P0** |
| `mastery_progress` | progression par objectif | non | non | oui | activée | own (SELECT/INSERT/UPDATE `auth.uid() = user_id`) | OK |
| `gs_tournaments` | tournois Grande Salle, `access_type`, `entry_price` | non | non | oui | activée | `gs_tournaments_select_all` USING (true) (anon inclus), écritures admin/teacher via `user_profiles` | P2 |
| `gs_tournament_entries` | prénom, nom, email, user_id, `is_subscriber`, **`paid`**, payment_id | non | non | oui | activée | **`gs_entries_insert_all` FOR INSERT WITH CHECK (true)** sans `TO` → anon inclus ; SELECT/DELETE admin | **P0 financier** |
| `gs_draws` | tirages | non | non | oui | activée | select all, écriture admin/teacher | P3 |
| `tournaments`, `tournament_phases`, `tournament_groups`, `tournament_matches`, `match_results`, `tournament_brackets` | compétition, `student_ids` JSON | non | non | oui | activée | `*_select_authenticated` **USING (true)** | **P1** |
| `tournament_notifications` | destinataire, message | non | non | oui | activée | own (mapping ou email) | OK |
| `match_rounds`, `match_player_summary` | manches, bilans élèves | non | non | oui | activée | teacher/rectorat/service_role | P2 |
| `invitations` | email, **role**, token, expiration | **OUI** (`Login.js` **avant login**, `AdminInvite.js`) | non | oui | activée | admin only (`create_invitations.sql`) **contredit** `migration_rectorat.sql` | **P1** |
| `gift_codes` | codes cadeaux, durée, statut, bénéficiaire | non | non | oui | activée, **aucune policy** → fermé | — | OK (si RLS réellement active) |
| `user_devices` | fingerprint, navigateur, OS, approbation | non | non | oui | activée | **`service_role_full_access` FOR ALL USING (true) WITH CHECK (true)** | **P1** |
| `active_sessions` | user_id, session_token, is_active | non | non | oui | activée | `active_sessions_select_own` | P1 (RPC, cf. §7) |
| `auth_audit_log` | user_id, email, IP, user-agent, événements | non | non | oui | activée | `service_role_full_access` **USING (true)** | **P1** |
| `backend_logs` | logs serveur | non | non | oui | activée | `auth.role() = 'service_role'` | OK |
| `monitoring_*`, `mon_*` | télémétrie, traces | non | non | oui | activée | `auth.role() = 'service_role'` | OK |
| `content_store` | contenu pédagogique | non | non | oui | activée | `service_role_full_access` **USING (true)** | P2 |
| `image_usage_logs` | usage images | non | non | oui | activée | INSERT `true`, SELECT `auth.jwt()->>'role' = 'admin'` (jamais vrai en Supabase) | P3 |
| `user_licenses` (vue) | lit `auth.users` (id, email) | non | non | oui | n/a | `REVOKE ALL FROM anon, authenticated` + `security_invoker` | OK si appliqué |
| Rectorat / CPD / CPC | `user_profiles.region` / `circonscription_id`, `circonscriptions` | non | non | oui | non déclaré pour `circonscriptions` | — | P2 |

---

## 3. B — SOURCES DE VÉRITÉ RLS ET CONTRADICTIONS

44 fichiers SQL, aucun outil de migration (`supabase/migrations` absent, pas de table de versions).
Tous les fichiers portent la mention « à exécuter dans le SQL Editor » : **rien ne prouve qu'ils aient été appliqués,
ni dans quel ordre, ni s'ils ont été modifiés à la main depuis**.

Contradictions relevées :

1. **`training_*`** : `server/db/schema_training.sql` crée `..._full_access ... USING (true) WITH CHECK (true)` (ouvert à tous),
   tandis que `server/migrations/create_training_tables.sql` crée des policies restrictives (teacher/own).
   Le dernier appliqué gagne — inconnu.
2. **`invitations`** : `server/migrations/create_invitations.sql` (admin only) vs `server/db/migration_rectorat.sql`
   (« Admin can read/insert/update invitations ») — noms différents, donc **cumul** possible, pas remplacement.
3. **`gs_tournaments` / `gs_tournament_entries`** : redéfinies dans `migration_gs_tournaments.sql` puis
   `migration_gs_access_type.sql` sans `DROP POLICY` systématique.
4. **`sessions`/`attempts`** : le commentaire dit « le backend utilise service_role », mais la policy écrite
   (`USING (true)`) ouvre la table à `anon` et `authenticated`, ce que le commentaire n'exprime pas.
5. **`user_profiles`** : table centrale de l'autorisation (le backend en dérive `MANAGER_ROLES`) — **jamais créée
   ni sécurisée dans le dépôt**. Sa configuration réelle est totalement inconnue.
6. Aucun `GRANT`/`REVOKE` sur les fonctions dans tout le dépôt (cf. §7) ; les seuls `REVOKE` portent sur la vue `user_licenses`.

Piège de lecture important : dans PostgreSQL, une policy **sans clause `TO`** s'applique à `public`,
donc à `anon` **et** `authenticated`. Les policies nommées `service_role_*` dans ce dépôt n'ont pas de clause `TO`
et ne testent pas `auth.role()` : malgré leur nom, elles **n'isolent pas** le service role.

---

## 4. D — MATRICE DES APPELS SUPABASE DIRECTS DU FRONTEND (clé anon)

Client : `src/utils/supabaseClient.js` (`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`).
Aucun `.rpc(`, aucun `.storage`, aucun `.delete()` côté frontend. Appels relevés :

| Appel frontend | Table | Donnée | Rôle | Policy nécessaire | Policy prouvée ? | Risque |
|---|---|---|---|---|---|---|
| `Login.js:104` `.from('invitations').select('*').eq('token',…)` | `invitations` | email, **role**, token | **anon (avant login)** | SELECT anon par token | NON (dépôt : admin only) | **P1** — soit la fonctionnalité est cassée, soit une policy anon existe → énumération d'invitations et de rôles |
| `Login.js:151/364` `.from('user_profiles').select(...)` | `user_profiles` | profil, role | authenticated | SELECT own | NON | P1 |
| `Login.js:441` `.upsert({id, pseudo, first_name, last_name})` | `user_profiles` | profil | authenticated | UPDATE own | NON | P1 |
| `Login.js:577` `.upsert({id, email, first_name, last_name, pseudo, **role: inviteRole**, region})` | `user_profiles` | **role** | authenticated | **écriture de `role` interdite au client** | NON | **P0** — auto-attribution de rôle |
| `AdminRoles.js:31` `.from('user_profiles').update({role}).eq('email',…)` | `user_profiles` | **role d'autrui** | authenticated (garde `isAdmin` **côté client uniquement**) | UPDATE réservé admin, côté base | NON | **P0** — si la policy le permet, n'importe quel compte connecté se promeut `admin` |
| `Account.js:300/308` `.update/.upsert` | `user_profiles` | pseudo, avatar, langue | authenticated | UPDATE own | NON | P1 |
| `AdminInvite.js:38` `.from('invitations').select('*')` | `invitations` | tokens, rôles | authenticated | SELECT admin | partiellement | P1 |
| `ProgressDebug.js:36/46` `.from('sessions')/.from('attempts').select(...)` | `sessions`, `attempts` | user_id, performances | authenticated | own | **NON — `USING (true)`** | **P0** |

**Test mental « clé anon + script perso »** — ce qu'un tiers peut tenter directement sur l'API PostgREST,
sans passer par Express (la clé anon est publique par construction, et deux d'entre elles sont même commitées, cf. §8) :

1. `POST /rest/v1/gs_tournament_entries` avec `{tournament_id, email, paid: true}` → **entrée payante auto-décernée**
   (`gs_entries_insert_all` = `WITH CHECK (true)`), puis `gs:join` côté socket : le serveur recoupe
   `gs_tournament_entries.paid` (`server/server.js:gsHasPaidEntry`) et **accorde l'accès**. Contournement complet du paiement.
2. `GET /rest/v1/attempts?select=*` et `GET /rest/v1/sessions?select=*` → **toutes les performances de tous les joueurs**,
   y compris mineurs (`allow_all_*`).
3. `GET /rest/v1/training_results?select=*` → résultats nominatifs d'élèves (si `schema_training.sql` est la version appliquée).
4. `PATCH /rest/v1/user_profiles?id=eq.<moi>` avec `{"role":"admin"}` → **si aucune policy ne l'interdit**,
   accès `MANAGER_ROLES` côté backend (quota illimité, périmètre élèves/classes) + admin des policies `gs_*`, `invitations`, `user_student_mapping`.
5. `GET /rest/v1/classes?select=*` / `schools` → toutes les classes, `teacher_email`, écoles (policies `USING (true)` pour `authenticated`).
6. `POST /rest/v1/rpc/detect_suspicious_accounts` → user_id + adresses IP (cf. §7).

Les points 1, 2, 3, 6 ne nécessitent **aucun compte**. Les points 4 et 5 nécessitent un simple compte gratuit.

---

## 5. E — TESTS D'AUTORISATION À MODÉLISER (à exécuter contre un projet Supabase de test, jamais la prod)

Pour chaque table sensible, avec un client `@supabase/supabase-js` initialisé avec la **clé anon** :

| Acteur | Attendu |
|---|---|
| `ANON` | 0 ligne sur `students`, `student_stats`, `sessions`, `attempts`, `training_*`, `classes`, `schools`, `user_profiles`, `subscriptions`, `webhook_events`, `gift_codes`, `gs_tournament_entries`, `invitations`, `auth_audit_log`, `user_devices` ; INSERT refusé partout |
| `USER A` authentifié quelconque | aucune ligne de `USER B` ; aucune donnée scolaire ; `UPDATE user_profiles SET role` refusé ; `INSERT gs_tournament_entries` refusé |
| `STUDENT A` (mapping actif) | sa fiche `students` uniquement, ses `student_stats`, ses `training_results` ; 0 ligne pour `STUDENT B` |
| `TEACHER A` | uniquement `classes` dont il est titulaire (prouvé côté serveur) et leurs élèves ; 0 ligne pour la classe de `TEACHER B` |
| `CPC/CPD` | uniquement les écoles/classes de `circonscription_id` = celui de son profil |
| `RECTORAT` | uniquement le périmètre institutionnel **prouvable** ; aucune relation « région → circonscription » n'existe (cf. §9) → doit échouer fermé |
| `ADMIN` | accès nécessaire uniquement ; toute promotion en admin doit passer par le service role |

Chaque test doit être écrit en deux temps : **avant** (état actuel, doit échouer) / **après** (migration appliquée, doit passer).

---

## 6. F — TABLES FINANCIÈRES (P0 par classification)

| Question | Réponse (dépôt) |
|---|---|
| Le front peut-il s'accorder `status = active/trialing` ? | **Non prouvé sûr** mais improbable : `subscriptions` n'a qu'une policy SELECT own. Aucune policy INSERT/UPDATE → fermé si RLS réellement active. |
| Le front peut-il forger une preuve de webhook ? | **Inconnu — `webhook_events` n'existe dans aucun fichier SQL.** Si RLS y est absente (table créée à la main), un `INSERT` anon d'un `event_id` futur **bloque** un événement Stripe légitime (le serveur le considérerait comme déjà traité) → déni de service sur l'activation d'abonnement. **P0 non vérifiable.** |
| Le front peut-il se marquer « tournoi payé » ? | **OUI** — `gs_entries_insert_all` `WITH CHECK (true)` sans `TO`, colonne `paid` librement écrite, et le serveur s'en sert comme preuve de paiement. **P0 confirmé au niveau du dépôt.** |
| Le front peut-il créer/valider un gift code ? | Non : `gift_codes` a RLS activée et **aucune** policy → totalement fermé aux rôles publics (à confirmer en prod). |
| Le front peut-il changer son rôle ? | **Probablement OUI** — `AdminRoles.js` fait un `UPDATE user_profiles SET role` depuis le navigateur ; cette fonctionnalité ne peut fonctionner que si une policy UPDATE permissive existe. **P0 à vérifier en priorité absolue.** |

Défaut de schéma associé : `scripts/supabase_subscriptions.sql` crée un **index non unique** sur `user_id`
(`create index subscriptions_user_id_idx`), alors que le serveur écrit avec `.upsert(row, { onConflict: 'user_id' })`.
Sans contrainte `UNIQUE(user_id)`, PostgreSQL renvoie `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification` :
depuis CTO-002/003 (fail-closed), le webhook répondrait alors `500 retryable` en boucle et **aucun abonnement ne serait jamais persisté**.
À vérifier en priorité après le redéploiement — **P1 bloquant fonctionnel**.

---

## 7. I — RPC ET `SECURITY DEFINER`

12 fonctions `SECURITY DEFINER` dans le dépôt. **Aucune** ne contient de contrôle `auth.uid()`,
**aucune** ne fixe `SET search_path`, et **aucun `REVOKE EXECUTE FROM anon, authenticated`** n'existe dans le dépôt.
Or Supabase expose toute fonction du schéma `public` via `POST /rest/v1/rpc/<nom>` et PostgreSQL accorde
`EXECUTE` à `PUBLIC` par défaut. Sauf révocation manuelle non tracée, ces fonctions sont **appelables par anon**.

| Fonction | Paramètres | Effet | Risque |
|---|---|---|---|
| `check_session_active(p_token TEXT)` | jeton de session | renvoie `is_valid`, **`user_id`** | **P0** — oracle de jeton : validation de jetons volés/devinés et révélation du `user_id` associé |
| `invalidate_user_sessions(p_user_id UUID, p_except_token TEXT)` | user_id **arbitraire** | invalide toutes les sessions d'un tiers | **P0** — déconnexion forcée de n'importe quel utilisateur (DoS ciblé) |
| `revoke_device(p_device_id UUID, p_revoked_by TEXT)` | device_id arbitraire | révoque un appareil tiers | **P0** — blocage d'accès d'un client payant |
| `register_device(...)` | user_id + fingerprint | crée/approuve un appareil | **P0** — contournement de la limite anti-partage (2 appareils) |
| `list_user_devices(p_user_id UUID)` | user_id arbitraire | fingerprints, navigateur, OS, dates | **P1** — profilage |
| `detect_suspicious_accounts(p_min_ips INT)` | — | user_id + **adresses IP** de tous les comptes | **P0** — fuite de données personnelles (RGPD), y compris comptes élèves |
| `count_unique_ips_24h`, `count_user_devices`, `count_failed_logins` | user_id / identifiant | compteurs | P2 — énumération |
| `cleanup_old_sessions()`, `cleanup_stale_devices()`, `cleanup_old_audit_logs()` | — | **DELETE / UPDATE** de masse | **P0** — destruction de données et effacement de piste d'audit par un anonyme |
| `check_user_can_play(p_user_id UUID)` | user_id arbitraire | lit la vue `user_licenses` | P1 — mais `security_invoker` sur la vue + REVOKE limitent l'impact (fonction **non** DEFINER) |
| `link_user_to_student(p_user_email, p_student_id, p_admin_email)` | email + student_id | **crée le mapping compte ↔ élève** | **P0 si un jour passée en `SECURITY DEFINER`** ; actuellement non DEFINER (donc soumise à RLS/droits de l'appelant sur `auth.users`, ce qui la fait échouer pour `authenticated` — protection fortuite, pas voulue). `p_admin_email` est purement déclaratif : **aucune vérification que l'appelant est admin**. |
| `update_student_training_stats(...)`, `mon_cleanup_old_data()`, `count_all_entities()` | — | écritures/purges | à inventorier en prod (définitions absentes du dépôt pour certaines) |

Une RPC mal sécurisée annule toute policy correcte : c'est le point le plus lourd de l'audit après `user_profiles`.

---

## 8. H — CLÉ SERVICE ROLE

| Contrôle | Résultat |
|---|---|
| Présente dans le bundle frontend ? | **Non.** `src/` n'utilise que `REACT_APP_SUPABASE_ANON_KEY`. Aucune occurrence de `SERVICE_ROLE` dans `src/` ni `public/`. |
| Exposée dans la configuration Vercel publique ? | **Non.** `vercel.json` ne contient aucune variable ; CRA n'inline que les variables `REACT_APP_*`. |
| Commitée dans le dépôt ? | **Non trouvée.** Seules des clés **anon** sont commitées (voir ci-dessous). Aucune valeur de clé n'est reproduite dans ce rapport. |
| Renvoyée par une API ? | Non : `supabaseAdmin` reste interne, aucune route ne renvoie `process.env.SUPABASE_SERVICE_ROLE_KEY`. |
| Stockage | `render.yaml` : `SUPABASE_SERVICE_ROLE_KEY` avec `sync: false` (saisie manuelle dans Render) ; `server/.env.example` vide ; CI via `secrets.SUPABASE_SERVICE_ROLE_KEY`. Correct. |

**Réserve P2** : des clés **anon** de deux projets Supabase distincts sont commitées en clair dans
`public/tournament-real-test.html`, `public/tournament-simulator.html` (donc **servies publiquement** par le
frontend en production), ainsi que dans `e2e/10-multiplayer-modes.spec.js` et `e2e/11-regression-double-pairs.spec.js`.
La clé anon n'est pas un secret, mais ces fichiers publient l'URL du projet et **facilitent l'exploitation directe**
des faiblesses RLS ci-dessus. Ils devraient être retirés de `public/`. Les valeurs ne sont pas reproduites ici.

---

## 9. G / J — DONNÉES DE MINEURS ET `LEGACY_STUDENT_MAPPING_REQUIRED`

### Colonnes de mineurs exposées si les policies du dépôt sont bien celles de la production

| Table | Colonnes exposées | À qui |
|---|---|---|
| `attempts` | `user_id`, `item_id`, `objective_key`, `correct`, `latency_ms`, `level_class`, `theme` | **anon** (`allow_all_attempts`) |
| `sessions` | `user_id`, `mode`, `classes`, `themes`, `duration_seconds` | **anon** |
| `training_results` / `training_sessions` / `student_training_stats` | `student_id`, scores, temps, best_score | **anon** (si `schema_training.sql` est la version appliquée) |
| `classes` | `name`, `level`, **`teacher_email`**, `school_id` | tout compte authentifié |
| `schools` | nom, commune | tout compte authentifié |
| `tournament_groups` / `tournament_matches` / `match_results` | `student_ids` (JSON), scores | tout compte authentifié |
| `students` | prénom, nom, `full_name`, niveau, `email`, **`access_code`**, `licensed` | mapping own + policy teacher (dégradée, cf. ci-dessous) |

Remarque : la policy `students_select_teacher` fait `SELECT email FROM auth.users WHERE id = auth.uid()`.
Le rôle `authenticated` n'a normalement **aucun droit sur `auth.users`** → la sous-requête échoue ou renvoie
`NULL`, donc la policy ne donne rien. Les enseignants ne peuvent donc pas lire `students` en direct
(le backend passe par le service role) : le comportement observé est « fermé », mais **par accident**, pas par conception.
La correction doit remplacer cette sous-requête par une fonction `SECURITY DEFINER` dédiée et restreinte, ou par une
colonne `classes.teacher_user_id` référençant `auth.users(id)`.

### `LEGACY_STUDENT_MAPPING_REQUIRED`

- `POST /api/auth/student-login` crée aujourd'hui la ligne `user_student_mapping` (flux nominal, correct depuis CTO-003).
- Les comptes créés avant ce flux, ou importés par CSV (`server/scripts/import_rectorat_csv.js`), peuvent en être dépourvus :
  depuis CTO-003 ils **échouent fermé** (ni licence, ni fiche élève).
- **Volumétrie non mesurable** sans accès Supabase → requête read-only fournie en §10.
- Identification fiable d'un compte legacy : `auth.users` dont l'email correspond au domaine pseudo-élève
  (`…@eleve.crazychrono.app`) **et** absent de `user_student_mapping`. Ce critère sert **au diagnostic administratif
  uniquement** ; il ne doit **jamais** devenir une preuve d'identité à l'exécution.
- Backfill sûr (à faire dans une mission dédiée, jamais ici) : export read-only de la liste des candidats →
  validation humaine/administrative hors navigateur (liste d'établissement) → insertion via service role en une
  transaction avec `linked_by = '<email admin>'` et `notes = 'backfill CTO-005'` → journalisation → rollback = passage
  à `active = false` des lignes portant ce marqueur. `UNIQUE(student_id)` protège déjà contre le double rattachement.
- **Aucun backfill exécuté dans CTO-004.**

---

## 10. C — REQUÊTES DE VÉRIFICATION READ-ONLY (à exécuter par le propriétaire)

Strictement en lecture, dans Supabase → SQL Editor. Ces résultats lèvent `PRODUCTION_RLS_UNVERIFIED`.

```sql
-- 1) RLS réellement activée, table par table
select tablename, rowsecurity from pg_tables where schemaname='public' order by rowsecurity, tablename;

-- 2) Policies réellement présentes (rôles, commande, expressions)
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public' order by tablename, policyname;

-- 3) Fonctions exposées et leur mode de sécurité
select p.proname, p.prosecdef as security_definer, p.proconfig,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by p.proname;

-- 4) Qui peut EXÉCUTER ces fonctions (anon / authenticated = danger)
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema='public' and grantee in ('anon','authenticated','public') order by routine_name;

-- 5) Droits de table accordés à anon / authenticated
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated') order by table_name;

-- 6) Contraintes critiques
select conname, contype, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.subscriptions'::regclass;               -- UNIQUE(user_id) présent ?
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='webhook_events';      -- la table existe-t-elle ?
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='user_student_mapping';
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='user_profiles';

-- 7) Volumétrie LEGACY_STUDENT_MAPPING_REQUIRED (lecture seule)
select count(*) as comptes_eleves_sans_mapping
from auth.users u
left join public.user_student_mapping m on m.user_id = u.id
where u.email like '%@eleve.crazychrono.app' and m.user_id is null;
```

---

## 11. BLOQUEURS RLS AVANT COMMERCIALISATION

### B0 — Production non déployée (hors RLS, mais bloquant absolu)

- **Attaque** : `POST /webhooks/stripe` sans signature → `200`, abonnement forgeable ; sockets payants anonymes ; `checkSubscription()` fail-open.
- **Impact** : revenus contournables aujourd'hui, en production.
- **Correction** : redéployer Render sur `main` (`d1338ae`) puis rejouer le contrôle du §0.
- **Tests** : `/webhooks/stripe` sans signature → 400/503 ; `GET /students` sans JWT → 401 ; `uptime` réinitialisé.
- **Rollback** : redéploiement du build précédent (Render conserve l'historique).

### P0-1 — `user_profiles` : escalade de privilèges

- **Table** : `user_profiles` (colonne `role`).
- **Policy actuelle** : **inconnue** ; aucune trace dans le dépôt ; le frontend écrit `role` avec la clé anon.
- **Attaque** : `PATCH /rest/v1/user_profiles?id=eq.<moi>` `{"role":"admin"}` avec un compte gratuit.
- **Impact** : `MANAGER_ROLES` côté Express (quota illimité, accès aux élèves/classes), plus toutes les policies
  `gs_*`, `invitations`, `user_student_mapping` qui font confiance à `user_profiles.role`.
- **Correction** : RLS activée ; SELECT own ; UPDATE own **restreint aux colonnes non sensibles** via une policy
  `WITH CHECK (role = (select role from user_profiles where id = auth.uid()))` ou, plus sûr, `REVOKE UPDATE (role, region, circonscription_id)`
  ; toute écriture de `role` réservée au service role ; retirer `role` de l'`upsert` d'inscription et remplacer
  `AdminRoles.js` par un appel à une route Express admin.
- **Migration envisagée** : `migration_cto005_user_profiles_rls.sql` (non écrite dans cette passe).
- **Tests** : USER A ne peut pas modifier son `role` ni celui de B ; l'inscription par invitation reste fonctionnelle via `apply-invite`.
- **Rollback** : `DROP POLICY` + `GRANT UPDATE` restauré.

### P0-2 — `gs_tournament_entries` : preuve de paiement forgeable

- **Policy actuelle** : `gs_entries_insert_all FOR INSERT WITH CHECK (true)` (s'applique à `anon`).
- **Attaque** : insertion directe `{tournament_id, email, paid: true}` puis `gs:join`.
- **Impact** : accès gratuit aux tournois payants ; pollution de la base marketing.
- **Correction** : supprimer la policy INSERT publique (le backend écrit en service role) ; si une inscription
  publique est nécessaire, la restreindre par `WITH CHECK (paid = false and is_subscriber = false and user_id is null)`
  et retirer `paid`/`payment_id` des colonnes accessibles (`REVOKE INSERT (paid, payment_id, is_subscriber)`).
- **Tests** : anon INSERT refusé ; INSERT avec `paid=true` refusé ; parcours d'inscription via l'API Express inchangé.
- **Rollback** : recréation de la policy d'origine.

### P0-3 — RPC `SECURITY DEFINER` exécutables par anon

- **Fonctions** : `check_session_active`, `invalidate_user_sessions`, `register_device`, `revoke_device`,
  `list_user_devices`, `detect_suspicious_accounts`, `cleanup_*`.
- **Attaque** : `POST /rest/v1/rpc/<nom>` avec la clé anon publique.
- **Impact** : oracle de jetons de session, déconnexion/blocage d'utilisateurs payants, contournement anti-partage,
  fuite d'adresses IP, suppression de données et d'audit.
- **Correction** : `REVOKE EXECUTE ... FROM anon, authenticated, public` sur toutes ces fonctions (le backend les
  appelle en service role) ; ajouter `SET search_path = public, pg_temp` ; pour celles qui devraient rester
  appelables par l'utilisateur, remplacer le paramètre `p_user_id` par `auth.uid()`.
- **Tests** : chaque RPC → `permission denied` en anon et en authenticated ; les routes Express correspondantes
  (`/api/session/*`, `/api/antifraud/*`) restent vertes.
- **Rollback** : `GRANT EXECUTE` ciblé.

### P0-4 — `sessions`, `attempts`, `training_*` : données de mineurs ouvertes

- **Policy actuelle** : `allow_all_sessions`, `allow_all_attempts`, `service_role_full_access_*` — toutes `USING (true) WITH CHECK (true)` sans `TO`.
- **Attaque** : `GET /rest/v1/attempts?select=*` en anon.
- **Impact** : fuite massive de performances d'élèves ; écriture/falsification possible.
- **Correction** : remplacer par `TO service_role USING (true)` (ou aucune policy du tout, le service role
  contournant la RLS) et, si un accès direct est nécessaire, `USING (user_id = auth.uid()::text)`.
  Trancher la contradiction `schema_training.sql` vs `create_training_tables.sql`.
- **Tests** : anon 0 ligne ; USER A ne lit pas les tentatives de B ; `/api/progress/*` inchangé.
- **Rollback** : recréation des policies permissives (déconseillé).

### P0-5 — `webhook_events` non défini / non vérifiable

- **Attaque** : si la table est sans RLS, insertion anon d'`event_id` → blocage de l'activation d'abonnements légitimes (l'événement est vu comme déjà traité) ; lecture des identifiants d'événements.
- **Correction** : versionner la définition de la table dans le dépôt, activer la RLS, aucune policy publique, `UNIQUE(event_id)`.
- **Tests** : anon INSERT/SELECT refusés ; idempotence Stripe/RevenueCat toujours verte.

### P1-1 — `classes`, `schools`, `tournaments`, `tournament_groups`, `tournament_matches`, `match_results`, `tournament_brackets` : `USING (true)` pour `authenticated`

Tout compte gratuit lit l'annuaire complet des classes (avec `teacher_email`), des écoles et des données de compétition.
Correction : périmètre par `user_student_mapping` / titulaire de classe / circonscription, ou fermeture totale au profit de l'API Express.

### P1-2 — `subscriptions` sans `UNIQUE(user_id)`

`onConflict: 'user_id'` échouera (`42P10`) → aucun abonnement persisté depuis les webhooks. Correction : `ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id)` après déduplication contrôlée.

### P1-3 — `invitations` lues par anon depuis `Login.js`

Soit la fonctionnalité est cassée en production, soit une policy anon non tracée existe → énumération de tokens
d'invitation et des rôles associés (chemin d'escalade). Correction : lecture d'invitation par token exclusivement
via une route Express (service role) avec rate-limit.

### P1-4 — `user_devices`, `auth_audit_log`, `content_store` : policies `USING (true)`

Mêmes corrections que P0-4 (restreindre à `service_role`). Classées P1 car données non nominatives d'élèves,
mais `auth_audit_log` contient e-mails et IP → à traiter avec P0-3.

### P2 — Clés anon commitées dans `public/*.html`

Retirer `public/tournament-real-test.html` et `public/tournament-simulator.html` du build public (ou les
déplacer hors de `public/`), et purger les clés des specs e2e au profit de variables d'environnement.

### P3 — `image_usage_logs`

INSERT `true` (spam possible) et SELECT `auth.jwt() ->> 'role' = 'admin'` qui n'est jamais vrai sous Supabase
(le claim `role` vaut `authenticated`) : la lecture admin est cassée. Correction cosmétique lors d'une passe ultérieure.

---

## 12. L — DÉCISION

1. **RLS prouvée sûre / non sûre / non vérifiable** : **non vérifiable en production** (`PRODUCTION_RLS_UNVERIFIED`) —
   et **prouvée non sûre au niveau du dépôt** : les fichiers SQL versionnés décrivent eux-mêmes des policies ouvertes.
2. **P0** : **5** (`user_profiles` / `gs_tournament_entries` / RPC `SECURITY DEFINER` / `sessions`+`attempts`+`training_*` / `webhook_events` non défini),
   auxquels s'ajoute le bloqueur **B0** de non-déploiement de la production.
3. **P1** : **4** (`classes`+`schools`+tables tournoi en `USING (true)`, `subscriptions` sans unicité `user_id`,
   `invitations` lues par anon, `user_devices`+`auth_audit_log`+`content_store` en `USING (true)`).
4. **Tables financières exposées** : `gs_tournament_entries` (confirmé), `webhook_events` (inconnu, table non versionnée),
   `subscriptions` (fermée en lecture seule own — mais dépend de `user_profiles.role` pour le reste de la chaîne),
   `gift_codes` (fermée si RLS réellement active).
5. **Tables élèves exposées** : `attempts`, `sessions`, `training_sessions`, `training_results`,
   `student_training_stats`, `classes`, `schools`, `tournament_groups`, `tournament_matches`, `match_results`.
6. **RPC dangereuses** : `check_session_active`, `invalidate_user_sessions`, `register_device`, `revoke_device`,
   `list_user_devices`, `detect_suspicious_accounts`, `cleanup_old_sessions`, `cleanup_stale_devices`,
   `cleanup_old_audit_logs` (+ `link_user_to_student` à ne jamais passer en `SECURITY DEFINER` sans contrôle d'appelant).
7. **Service role** : **correctement isolée** dans le dépôt (jamais dans le frontend, jamais commitée, jamais renvoyée
   par une API, saisie manuelle côté Render/CI). Réserve : clés **anon** commitées dans `public/` (P2).
8. **Migrations nécessaires** (à écrire et valider dans une mission CTO-005, **aucune ici**) :
   `user_profiles` RLS + verrouillage de `role` ; suppression de `gs_entries_insert_all` ;
   `REVOKE EXECUTE` + `search_path` sur les RPC ; remplacement des policies `USING (true)` par `TO service_role` ou `auth.uid()` ;
   définition versionnée de `webhook_events` ; `UNIQUE(subscriptions.user_id)` ;
   périmètre serveur pour `classes`/`schools`/tables tournoi ; `classes.teacher_user_id` référençant `auth.users`.
9. **`LEGACY_STUDENT_MAPPING_REQUIRED`** : stratégie de backfill administratif décrite au §9, volumétrie à mesurer
   par la requête read-only du §10, aucun backfill exécuté.
10. **Verdict** : **RLS NO-GO** — non vérifiable en production, et non sûre au vu des sources versionnées.

Aucune correction RLS ne sera déployée sans nouvelle validation CTO.
