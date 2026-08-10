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
```

### Préconditions obligatoires

1. Exécuter d'abord, en **lecture seule**, `docs/CTO_005_PRODUCTION_PRECHECK.sql`
   sur la base cible et archiver la sortie. Elle révèle les divergences de
   schéma (tables absentes, types de `user_id`, signatures RPC, doublons).
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
```

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

**Prouvé par PostgreSQL local isolé** : les 67 assertions d'attaque ci-dessus,
sur un schéma reconstruit à partir des SQL versionnés.

**Non vérifié — nécessite un accès read-only Supabase production** :

1. le schéma réel correspond-il aux SQL versionnés (colonnes, types de
   `user_id` en `uuid` vs `text`, tables réellement présentes) ;
2. quelles policies sont **réellement** déployées aujourd'hui ;
3. les signatures exactes des RPC historiques (le `1000` ne durcit que les
   fonctions trouvées ; une signature différente serait silencieusement ignorée) ;
4. l'existence de doublons `subscriptions.user_id` ;
5. le comportement exact de `service_role` dans Supabase (le harness le simule) ;
6. le nombre de comptes élèves sans `user_student_mapping`.

Tant que ces points ne sont pas levés, l'état production reste
`PRODUCTION_RLS_UNVERIFIED`.

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
