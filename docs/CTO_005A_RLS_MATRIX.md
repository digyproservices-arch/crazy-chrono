# CTO-005A — Durcissement RLS / Supabase : matrice, ordre d'application, rollback

Ce document est la source de vérité de la phase CTO-005A. Il décrit ce que les
migrations `supabase/migrations/20260810_*` changent, ce qui est **prouvé** par
un PostgreSQL local isolé, et ce qui reste **non vérifié** tant qu'aucune
inspection read-only de Supabase production n'a été réalisée.

**Aucune base Supabase réelle n'a été touchée par cette phase.** Aucune
migration n'a été appliquée en production, aucune policy réelle modifiée,
aucune donnée lue ou écrite, aucun secret changé.

---

## 1. Périmètre

Ferme les P0/P1 relevés par `docs/CTO_AUDIT_004_RLS_SUPABASE.md` (PR #5) :

| Réf. | Anomalie CTO-004 | Migration | Statut |
|---|---|---|---|
| P0-1 | `user_profiles` sans RLS, rôle écrit par le navigateur | `0200` | fermé |
| P0-2 | `gs_entries_insert_all … WITH CHECK (true)` (forge de `paid`) | `0300` | fermé |
| P0-3 | RPC `SECURITY DEFINER` sans `REVOKE`, sans `search_path` | `0100`, `1000` | fermé |
| P0-4 | `sessions` / `attempts` / `training_*` en `USING (true)` | `0600` | fermé |
| P0-5 | `webhook_events` absent des SQL versionnés | `0400` | fermé |
| P1-1 | `classes` / `schools` / tournois lisibles par tout compte | `0700` | fermé |
| P1-2 | `subscriptions` sans `UNIQUE(user_id)` malgré `onConflict` | `0500` | fermé (avec precheck bloquant) |
| P1-3 | `invitations` lues par anon depuis `Login.js` | `0800` + backend | fermé |
| P1-4 | `user_devices` / `auth_audit_log` / `content_store` permissifs | `0900` | fermé |
| P1-5 | contraintes `*_role_check` « génération rectorat » : cpd/cpc refusés par PostgreSQL | `1200` | fermé (fail-closed) |
| P2 | clés anon commitées dans `public/` et `e2e/` | hors SQL | fermé |

---

## 2. Ordre d'application

Les fichiers sont numérotés et **doivent être appliqués dans l'ordre**. `0100`
(fonctions d'aide) est une dépendance de `0200`, `0700`, `0800`.

```
supabase/migrations/20260810_0100_cto005_helpers.sql
supabase/migrations/20260810_0200_cto005_user_profiles_rls.sql
supabase/migrations/20260810_0300_cto005_gs_entries.sql
supabase/migrations/20260810_0400_cto005_webhook_events.sql
supabase/migrations/20260810_0500_cto005_subscriptions_unique.sql
supabase/migrations/20260810_0600_cto005_progress_training.sql
supabase/migrations/20260810_0700_cto005_school_scope.sql
supabase/migrations/20260810_0800_cto005_invitations.sql
supabase/migrations/20260810_0900_cto005_devices_audit_content.sql
supabase/migrations/20260810_1000_cto005_rpc_hardening.sql
supabase/migrations/20260810_1100_cto005_consume_invitation.sql
supabase/migrations/20260810_1200_cto005_role_constraints.sql
supabase/migrations/20260810_1300_cto005_secdef_assertion.sql
```

`1300` est une **assertion fail-closed, sans effet de bord** : elle énumère
toutes les fonctions `SECURITY DEFINER` du schéma `public` et échoue en donnant
nom + signature si l'une reste exécutable par `PUBLIC`, `anon` ou
`authenticated`. Elle ne révoque rien d'inconnu — une fonction non prévue exige
une analyse humaine, pas une révocation aveugle. Allowlist unique et documentée :
les helpers `cc_*` de `0100`, exécutables par `authenticated` (ils dérivent tout
de `auth.uid()` et n'acceptent aucun paramètre d'identité), interdits à
`PUBLIC`/`anon` — ce que `1300` vérifie aussi.

`1000` durcit aussi `ensure_profile()`, révélée exposée par le rapport
production et absente de la liste initiale. Recherche exhaustive du dépôt :
aucune occurrence dans le frontend, le backend, les migrations versionnées ou
une autre RPC — elle n'est donc appelée ni par le client ni par le code
applicatif, et n'existe qu'en production (probablement un ancien helper de
création de profil, éventuellement branché sur un trigger). Traitement retenu :
`search_path` figé, `REVOKE` `PUBLIC`/`anon`/`authenticated`, `GRANT` au seul
rôle serveur. Un trigger continuerait de fonctionner : un trigger s'exécute avec
les droits du propriétaire de la fonction, pas avec ceux de l'appelant — révoquer
l'`EXECUTE` client ne casse que l'appel RPC direct, qui n'existe pas.

`1200` aligne `user_profiles_role_check` / `invitations_role_check` sur la
whitelist de `server/access/roles.js` (`invitations` : rôles attribuables ;
`user_profiles` : + `student`, écrit par le backend pour les comptes élèves).
Elle **refuse de tourner** si une valeur hors de ces ensembles existe déjà et ne
convertit jamais un rôle historique — la régularisation passe par
`POST /api/admin/set-role`.

### Préconditions obligatoires

1. Exécuter d'abord, en **lecture seule**, `docs/CTO_005_PRODUCTION_PRECHECK.sql`
   sur la base cible et archiver la sortie. Elle révèle les divergences de
   schéma (tables absentes, types de `user_id`, signatures RPC, doublons).
   `docs/CTO_005_PRODUCTION_REPORT.sql` couvre les mêmes contrôles sous forme
   d'une requête unique — le SQL Editor de Supabase n'affichant que le dernier
   jeu de résultats, c'est cette version qui se transmet et s'archive
   (`section | check_name | status | count | details`, statuts
   `P0 / P1 / REVIEW / OK / INFO`). Elle n'inventorie que : les comptes
   privilégiés et les comptes de test sont listés pour validation humaine,
   jamais proposés à la suppression.
2. `0500` **échoue volontairement** s'il existe des `subscriptions.user_id`
   dupliqués. Aucune déduplication automatique n'est faite : c'est une décision
   métier (quel abonnement conserver), pas une décision de migration.
3. Sauvegarde/point de restauration disponible avant application.
4. Le backend doit déjà être en CTO-003 (identité dérivée du JWT) — c'est le cas
   sur `main`.

### Rapport aux SQL historiques

Les scripts historiques de la racine et de `DOCS/` (`schema*.sql`,
`*_rls*.sql`, scripts de tournoi) sont **supersédés** pour tout ce qui concerne
les policies des tables listées ci-dessus. Ils ne sont pas supprimés (valeur
d'archive et de traçabilité), mais **ne doivent plus être rejoués** : plusieurs
d'entre eux recréent explicitement les policies `USING (true)` que CTO-005A
supprime. En cas de contradiction, `supabase/migrations/20260810_*` fait foi.

---

## 3. Matrice d'accès cible

Légende : `—` aucun accès ; `own` ses propres lignes ; `scope` périmètre calculé
côté base par des fonctions `SECURITY DEFINER`.

| Table | anon | authenticated | student mappé | teacher | cpc/cpd | admin | service_role |
|---|---|---|---|---|---|---|---|
| `user_profiles` | — | select/update `own` (colonnes personnelles) | idem | idem | idem | select global | tout |
| `subscriptions` | — | select `own` | — | — | — | — | tout |
| `webhook_events` | — | — | — | — | — | — | tout |
| `gs_tournament_entries` | insert gratuit (colonnes limitées) | idem | idem | idem | idem | idem | tout |
| `sessions`, `attempts` | — | select `own` | select `own` | — | — | — | tout |
| `training_sessions`, `training_results`, `student_training_stats` | — | — | — | — | — | — | tout |
| `students` | — | — | sa fiche | ses classes | sa circonscription | via backend | tout |
| `student_stats` | — | — | ses stats | ses classes | sa circonscription | via backend | tout |
| `classes` | — | — | sa classe | `scope` | `scope` | global | tout |
| `schools` | — | — | son école | `scope` | `scope` | global | tout |
| `invitations` | — | — | — | — | — | select | tout |
| `gift_codes` | — | — | — | — | — | — | tout |
| `user_devices`, `active_sessions` | — | `own` | `own` | `own` | `own` | `own` | tout |
| `auth_audit_log`, `content_store` | — | — | — | — | — | — | tout |

`rectorat` : **fail-closed**. Aucune relation institutionnelle prouvable en base
ne permet aujourd'hui de calculer son périmètre ; il passe donc par le backend
(service role) et non par une lecture Supabase directe.

Colonnes **jamais** écrivables par un client : `user_profiles.role`,
`user_profiles.region`, `user_profiles.circonscription_id`,
`gs_tournament_entries.paid`, `.is_subscriber`, `.payment_id`, et toute colonne
de `subscriptions` / `webhook_events`.

---

## 4. Matrice des appels frontend Supabase (après adaptation)

| Appel | Table / route | Autorisé par | Note |
|---|---|---|---|
| `Account.js` update/upsert | `user_profiles` | `user_profiles_update_own` + GRANT colonnes | pseudo, langue, avatar, mode strict uniquement |
| `Login.js` select | `user_profiles` | `user_profiles_select_own` | fallback serveur `/api/auth/profile` déjà présent |
| `Login.js` upsert pseudo | `user_profiles` | GRANT colonnes | `role` non écrit |
| `ProgressDebug.js` select | `sessions`, `attempts` | `*_select_own` | lecture de ses propres lignes |
| **supprimé** — `Login.js` invitations | `invitations` | — | remplacé par `POST /api/invitations/validate` |
| **supprimé** — `AdminInvite.js` liste | `invitations` | — | remplacé par `GET /api/admin/invitations` |
| **supprimé** — `AdminRoles.js` update | `user_profiles.role` | — | remplacé par `POST /api/admin/set-role` |

Endpoints serveur ajoutés (tous couverts par
`server/__tests__/cto005-invitations-roles.integration.test.js`) :

- `POST /api/invitations/validate` — token en body uniquement, rate-limité
  (20 / 15 min), réponse minimale (`email`, `role`, `region`,
  `circonscription_id`), jamais le token, jamais de liste, fail-closed `503`
  sur panne de lecture ;
- `GET /api/admin/invitations` — `requireAdminAuth`, 20 entrées, projection
  explicite sans token ;
- `POST /api/admin/set-role` — `requireAdminAuth`, rôle whitelisté, écriture
  service role, `404` si l'utilisateur n'existe pas.

---

## 5. Tests

Harness local **isolé** : `tests/rls/run_rls_tests.sh`. Il démarre un conteneur
`postgres:15-alpine` jetable, ne lit **aucune** variable `SUPABASE_*` et
n'ouvre aucune connexion réseau vers Supabase.

```bash
./tests/rls/run_rls_tests.sh baseline   # état historique, mode « soft »
./tests/rls/run_rls_tests.sh migrated   # après migrations, arrêt au 1er échec
./tests/rls/run_rls_tests.sh prodlike   # baseline reproduisant le schéma production réel
./tests/rls/run_rls_tests.sh roles      # contraintes de rôle, fail-closed 1200
./tests/rls/run_rls_tests.sh precheck   # precheck/rapport sur variantes de schéma
```

Le mode `prodlike` (`tests/rls/03_production_like.sql`) reproduit les
caractéristiques du rapport production — `subscriptions/sessions/attempts.user_id`
en TEXT, `webhook_events` préexistante sans `provider`/`created_at`, contraintes
de rôle acceptant `cpd`/`cpc`, les 13 `SECURITY DEFINER` exposées du rapport
dont `ensure_profile` (le harness en mesure **14** : la baseline historique
ajoute une fonction de plus, absente de la production), policies permissives, et
6 lignes GS synthétiques
`paid=false / is_subscriber=true / payment_id NULL`. **Aucune donnée de
production** n'y figure (identifiants et e-mails inventés). Il applique
`0100`→`1300` puis rejoue les attaques et `tests/rls/30_production_like_checks.sql`.

- `baseline` : **46 attaques réussies**, 19 bloquées → photographie du risque
  avant correction (des erreurs structurelles y sont attendues :
  `webhook_events` inexistante, pas de contrainte pour `ON CONFLICT`).
- `migrated` : **67 assertions PASS**, `ALL RLS ATTACK TESTS PASSED`.

Rôles simulés : `anon`, `authenticated` A et B, student, teacher, cpc, admin,
`service_role`. Couverture : auto-promotion, écriture croisée, forge
d'inscription payante, RPC administratives, isolation sessions/attempts/training,
`webhook_events`, unicité `subscriptions`, isolation élèves/classes/écoles,
mapping étudiant, invitations, devices/audit/content/gift codes.

---

## 6. Rollback

Seul rollback exécutable :
`supabase/migrations/rollback/20260810_cto005_safe_rollback.sql`.

Décision CTO : **une panne fonctionnelle ne justifie jamais de rouvrir une
faille critique.** Le safe rollback ne relâche donc que ce qui l'est sans fuite
ni escalade — les lignes propres à l'utilisateur authentifié :

| Relâchement | Limite conservée |
| --- | --- |
| `user_profiles` : INSERT/UPDATE des champs personnels | `role`, `region`, `circonscription_id`, `email` exclus ; trigger `cc_guard_user_profiles_trg` exigé, sinon le rollback refuse de s'exécuter |
| `sessions` / `attempts` : INSERT de ses lignes | `user_id = auth.uid()`, aucun UPDATE/DELETE, rien pour `anon` |
| `training_results` / `student_training_stats` : SELECT | limité à `cc_my_student_ids()` (mapping serveur) |
| `gs_tournament_entries` : UPDATE `first_name`/`last_name` | colonnes financières non accordées, ligne propre uniquement |

Il se termine par quatre garde-fous qui font échouer bruyamment l'exécution si
un privilège interdit existe encore (écriture sur colonnes d'autorité ou
financières, table serveur accessible au client, policy `USING (true)` sur une
table sensible, RPC `SECURITY DEFINER` exécutable par un client). Les 67
assertions d'attaque sont rejouées après application : toutes restent bloquées
(`./tests/rls/run_rls_tests.sh saferollback`).

`NO_SAFE_ROLLBACK — FIX FORWARD REQUIRED` pour tout le reste : lecture directe
de `invitations`, annuaire complet `classes`/`schools`, RPC à `p_user_id`
arbitraire, écriture cliente de `paid`/`payment_id`/`role`. En cas de
régression, le chemin de service reste l'API Express en service role.

L'ancien rollback intégral — qui rouvrait délibérément les P0/P1 — est conservé
en documentation **non exécutable** : `docs/CTO_005A_UNSAFE_ROLLBACK_DO_NOT_RUN.md`.

---

## 7. Ce qui n'est PAS prouvé

Distinction stricte à conserver dans toute décision CTO :

**Prouvé par le dépôt** : contenu des migrations, adaptation du frontend,
suppression des clés anon commitées, endpoints serveur et leurs tests.

**Prouvé par PostgreSQL local isolé** : les 78 assertions d'attaque ci-dessus,
sur un schéma reconstruit à partir des SQL versionnés.

**Constaté en production** par l'exécution lecture seule de
`docs/CTO_005_PRODUCTION_REPORT.sql` (propriétaire, aucune écriture) :

1. types réels : `subscriptions.user_id`, `sessions.user_id`, `attempts.user_id`
   et les `user_id` de monitoring sont **TEXT**, pas `uuid` → voir § 9 ;
2. 22 policies permissives `USING (true)` / `WITH CHECK (true)` ;
3. 13 fonctions `SECURITY DEFINER` encore exécutables par un rôle client, dont
   `ensure_profile` absente de la liste manuelle du `1000` → corrigé, plus
   assertion fail-closed `1300` ;
4. **aucun** doublon `subscriptions.user_id` → `0500` peut poser l'UNIQUE ;
5. contraintes `*_role_check` déjà compatibles `cpd`/`cpc`, aucune valeur de
   `role` hors whitelist → `1200` ne s'arrêtera pas ;
6. `webhook_events` existe déjà (`event_id TEXT`, `received_at TIMESTAMPTZ`) →
   `0400` doit être additif ;
7. aucune table cible absente.

**Reste non vérifiable sans exécuter la migration** : le comportement exact de
`service_role` dans Supabase (le harness le simule) et la réaction du frontend
déployé. L'état production reste `PRODUCTION_RLS_UNVERIFIED` jusqu'à
application autorisée.

---

## 8. LEGACY_STUDENT_MAPPING_REQUIRED

Aucun backfill n'est réalisé ici. Le diagnostic read-only est dans
`docs/CTO_005_PRODUCTION_PRECHECK.sql` (§ 6) et la procédure de backfill
contrôlée dans `supabase/migrations/rollback/` n'existe pas volontairement : un
backfill est une opération de données, pas une migration de schéma.

Règle : le rattachement `user_id → student_id` ne peut jamais être dérivé d'une
donnée fournie par le navigateur (email `@eleve.crazychrono.app`, préfixe,
`access_code`). Il doit être validé administrativement, ligne à ligne, puis
inséré par le service role via `user_student_mapping`. Les comptes historiques
sans mapping restent **fail-closed** (ni licence, ni fiche élève).

### Lecture correcte des chiffres production

Le rapport production donne 465 fiches élèves licenciées, 85 mappings actifs,
donc 380 fiches licenciées sans mapping — et **4** comptes Auth
`@eleve.crazychrono.app` sans mapping actif.

Ces deux nombres ne mesurent pas la même chose et il serait faux de dire que
380 utilisateurs perdront un accès :

| Indicateur | Signification | Conséquence |
| --- | --- | --- |
| 380 fiches licenciées sans mapping | fiches élèves **sans compte Auth** — cas normal de l'élève qui joue via sa classe / son code d'accès | aucun compte cassé, aucune action |
| **4** comptes Auth sans mapping | utilisateurs réels qui se connectent et restent fail-closed faute de mapping | `LEGACY_STUDENT_MAPPING_REQUIRED = 4`, revue humaine |

Seul le second est un vrai signal. `docs/CTO_005_PRODUCTION_REPORT.sql` classe
désormais le premier en `INFO` (libellé explicite) et le second en `REVIEW`.

Pour identifier ces 4 comptes le moment venu :
`docs/CTO_005A_LEGACY_STUDENT_ACCOUNTS.sql` — un seul `SELECT`, read-only,
rejoué par le harness. **Son résultat contient des e-mails : il ne doit jamais
être commité ni collé dans GitHub.** Il propose une piste de rattachement mais
aucun backfill : la décision reste humaine.

---

## 9. Matrice de type-compatibility (production réelle)

Seules les tables réellement touchées par CTO-005A figurent ici. **Aucune donnée
de production n'est convertie** : c'est `auth.uid()` (toujours `uuid`) qui est
casté vers le type de la colonne, jamais l'inverse.

Mécanique commune : chaque migration lit `pg_attribute.atttypid` de la colonne
d'identité et génère la policy en `EXECUTE format(...)` avec `auth.uid()` ou
`auth.uid()::text`. Le même SQL versionné est donc correct sur le schéma
historique (`uuid`) **et** sur la production (`text`), et échoue explicitement
si la colonne est absente.

| TABLE | COLONNE | TYPE PRODUCTION | EXPRESSION RLS | COMPATIBLE | CORRECTION |
| --- | --- | --- | --- | --- | --- |
| `subscriptions` | `user_id` | **text** | `user_id = auth.uid()::text` (généré) | OUI | `0500` : policy générée selon le type au lieu de `auth.uid() = user_id` |
| `sessions` | `user_id` | **text** | `user_id = auth.uid()::text` (généré) | OUI | `0600` : génération type-aware |
| `attempts` | `user_id` | **text** | `user_id = auth.uid()::text` (généré) | OUI | `0600` : génération type-aware |
| `user_profiles` | `id` | uuid | `id = auth.uid()` (généré) | OUI | `0200` : génération type-aware (robustesse) |
| `gs_tournament_entries` | `user_id` | uuid | `user_id = auth.uid()` (généré) | OUI | `0300` : génération type-aware (robustesse) |
| `user_student_mapping` | `user_id` | uuid | `m.user_id::text = auth.uid()::text` | OUI | `0100` : comparaison normalisée en texte des deux côtés |
| `user_student_mapping` | `student_id` | varchar | `m.student_id::text` puis `id::text IN (…)` | OUI | `0100`/`0700` : `student_id` toujours comparé en texte |
| `classes` | `teacher_user_id` | uuid (créée par `0700`) | `c.teacher_user_id::text = auth.uid()::text` | OUI | `0100` : comparaison normalisée en texte |
| `students` | `id` | varchar | `id::text IN (SELECT cc_my_student_ids())` | OUI | aucune (déjà textuel) |
| `active_sessions` | `user_id` | uuid | généré selon le type | OUI | `0900` : génération type-aware |
| `user_devices` | `user_id` | uuid | généré selon le type | OUI | `0900` : génération type-aware |
| `invitations` | — | — | aucune policy client (table fermée) | OUI | `0800` : aucun accès `anon`/`authenticated` |
| `webhook_events` | — | — | aucune policy client (table fermée) | OUI | `0400` : RLS + `REVOKE` |
| `image_usage_logs`, `mon_*`, `monitoring_*` | `user_id` | text | **hors périmètre CTO-005A** — aucune policy générée | s.o. | aucune : tables de télémétrie non touchées, à traiter dans un lot dédié |

---

## 10. Traçabilité constat production → correction → test

| PRODUCTION FINDING | MIGRATION QUI LE TRAITE | TEST | RÉSULTAT | RISQUE RÉSIDUEL |
| --- | --- | --- | --- | --- |
| `subscriptions.user_id` TEXT | `0500` (policy générée) | `PROD-1.0`→`1.7` (`tests/rls/30_production_like_checks.sql`) | PASS | aucun tant que la colonne reste TEXT ; la génération suit le type |
| Aucun doublon `subscriptions.user_id` | `0500` (UNIQUE) | `PROD-1.1`, `P1-2.4` (upsert `onConflict`) | PASS | un doublon créé entre le rapport et la migration ferait échouer `0500` (fail-closed voulu) |
| `sessions`/`attempts.user_id` TEXT | `0600` | attaques `P1-3.x` sur baseline production-like | PASS | aucun |
| 22 policies permissives `USING (true)` | `0200`–`0900` (DROP + policies nominatives) | 78 assertions d'attaque | PASS | policies créées hors versionnement après la migration |
| 13 `SECURITY DEFINER` exposées, dont `ensure_profile` | `1000` (liste étendue) + `1300` (assertion) | `PROD-3.1`→`3.3`, compteur harness 14 → 0 | PASS | une nouvelle fonction créée hors versionnement : détectée par `1300` au prochain run, pas en continu |
| `webhook_events` préexistante (`event_id`, `received_at`) | `0400` additive | `PROD-2.1`→`2.7` | PASS | `event_id` NULL/dupliqué apparu depuis le rapport → arrêt explicite, aucune suppression |
| Contraintes `role` déjà compatibles `cpd`/`cpc` | `1200` | suite `roles` (13 assertions) | PASS | valeur hors whitelist créée depuis → `1200` s'arrête, aucune conversion |
| 6 entrées GS `is_subscriber=true`, `paid=false`, `payment_id` NULL | aucune (donnée non modifiée) + `0300` ferme l'écriture cliente des colonnes financières | 3 tests `CTO-005A` dans `server/__tests__/cto002-gs-access.test.js` | PASS — accès refusé | aucun : § 11 |
| 4 comptes Auth élèves sans mapping | aucune (revue humaine) | `docs/CTO_005A_LEGACY_STUDENT_ACCOUNTS.sql` rejouée read-only par le harness | exécutable | ces 4 comptes restent fail-closed jusqu'à décision humaine |
| 7 comptes privilégiés (3 admin confirmés, 1 cpc, 2 cpd, 1 teacher) | aucune (aucune rétrogradation automatique) | rapport § 6 nominatif | REVIEW | légitimité des 4 non confirmés — ne bloque pas la migration |

---

## 11. Les 6 entrées Grande Salle historiques ne sont pas bloquantes

Constat production : 6 lignes `gs_tournament_entries` avec `paid = false`,
`is_subscriber = true`, `payment_id IS NULL`. **Verdict : historiques, non
bloquantes — pas de P0.** Aucune de ces lignes n'est modifiée.

Preuve par le code d'accès actuel (CTO-002/003) :

1. `server/access/gsAccess.js` — `resolveGrandeSalleAccess()` ne lit jamais
   `is_subscriber`. Deux chemins seulement :
   - `checkEntitlement(userId)` sur l'identité **du JWT vérifié**, réévaluée à
     chaque tentative d'entrée (abonnement Stripe/RevenueCat côté serveur) ;
   - `hasPaidEntry(tournamentId, email)`.
2. `server/server.js` — `gsHasPaidEntry` ne sélectionne que la colonne `paid` et
   ne renvoie `true` que sur `paid === true`. Avec `paid = false`, le résultat
   est `false` → `not_paid`. Une erreur de lecture renvoie `null` → fail-closed.
3. L'e-mail confronté est celui du JWT ou celui d'un billet signé HMAC ; une
   ligne dont l'e-mail ne correspond à aucun compte connecté n'est jamais
   consultée.
4. `payment_id IS NULL` : aucune de ces lignes ne prétend même à une preuve de
   paiement. Et par principe (revue CTO), `payment_id` n'est de toute façon pas
   une preuve — l'ancienne policy permettait au client d'écrire les colonnes
   financières ; `0300` supprime cette possibilité.

Régressions ajoutées (`server/__tests__/cto002-gs-access.test.js`) : sur une
ligne reproduisant exactement ces 6 entrées, un tournoi `paid` refuse
(`not_paid`), un tournoi `subscribers` refuse (`not_entitled`), et un billet
signé valide ne compense pas `paid = false`.

Conséquence : `is_subscriber` est un champ d'inventaire écrit côté serveur, sans
effet sur le contrôle d'accès. Les 6 lignes ne peuvent accorder aucun droit
actuel.
