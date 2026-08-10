# CTO-003 — Matrice des routes HTTP mutantes et des identités client

Périmètre: routes Express de `server/` qui écrivent (fichier, Supabase, mémoire)
ou qui exposent des données personnelles. État « après » = branche
`fix/cto-003-http-auth-data-security`.

## 1. Routes corrigées par CTO-003

| Méthode | Chemin | Effet | Auth avant | Auth requise | Auth après |
|---|---|---|---|---|---|
| GET | `/me` | lecture identité, rôle, région, abonnement, fiche élève | aucune (`?email=` suffisait) | JWT | `requireAuth`, identité = `req.authUser.id`, `?email=` supprimé |
| GET | `/me/subscription` | lecture abonnement | JWT + `user_id`/`x-user-id` client faisant autorité | JWT | `requireAuth`, identité = `req.authUser.id`, paramètres client ignorés (journalisés) |
| POST | `/usage/can-start` | décision de quota / accès illimité | JWT + `body.user_id` faisant autorité | JWT | `requireAuth`, quota = `req.authUser.id`, `body.user_id` ignoré (journalisé) |
| GET | `/students` | liste nominative d'élèves (nom, licence) | aucune | périmètre scolaire serveur | `requireAuth` + `resolveSchoolScope`: professeur → ses classes, CPC/CPD → sa circonscription, admin → global ; champs réduits à `{id,name,licensed}` (jamais `access_code`), liste de démonstration supprimée |
| DELETE | `/delete-image` | supprime un fichier de `public/` + réécrit `public/data/elements.json` | aucune | admin | `requireAdminAuth` |
| POST | `/purge-elements` | réécrit `public/data/elements.json` | aucune | admin | `requireAdminAuth` |
| POST | `/api/logs` | écrit un fichier dans `server/logs/` | aucune (nom de fichier composé avec `source` non assaini → traversal) | publique, mais nom de fichier maîtrisé | publique + `source` réduit à `[A-Za-z0-9_-]{,40}` |
| POST | `/api/monitoring/payment-event` | écrit dans le journal des événements de paiement | aucune | admin | `requireAdminAuth` (aucun appelant client; les webhooks écrivent via les helpers) |
| POST | `/api/gs/tournaments/:id/entry` | inscrit un participant (PII) | publique, `user_id` et `is_subscriber` fournis par le client | publique (invités), identité serveur | publique, `user_id`/`is_subscriber` dérivés du JWT présenté (sinon `null`/`false`) |

## 2. Routes mutantes déjà protégées (vérifiées, inchangées)

`requireAdminAuth`: `/save-associations`, `/save-math-positions`, `/rename-image`,
`/api/admin/*` (invitations, licences, codes cadeaux, onboarding, import),
`/upload-images`, `/api/monitoring/{send-report,trigger-e2e,test-alert}` et tous
les `DELETE /api/monitoring/*`, `/api/progress/debug/:userId`.

`requireAuth` (+ contrôles métier): `/stripe/create-checkout-session`,
`/stripe/create-portal-session`, `/api/redeem-code`, `/api/tournament/*` (toutes
les écritures), `/api/training/*`, `/api/mastery`, `/api/progress/{session,attempts}`,
`/api/notifications/qualification`, `/api/match-rounds/...`.

Auth vérifiée dans le handler (pas de middleware visible, comportement équivalent):
`/admin/users/role` (admin), `/api/auth/{link-student,profile,apply-invite}`,
`/api/rgpd/{export-data,delete-account}`, `/api/session/*`,
`/api/gs/tournaments` CRUD (`requireAdmin` local), `/api/rectorat/*`.

Signature Stripe: `POST /webhooks/stripe` (CTO-002).

`POST /webhooks/revenuecat` (revue CTO): secret obligatoire et comparé à durée
constante. Secret absent → `503`, `Authorization` absente ou fausse → `401`,
Supabase indisponible → `503 retryable` (plus de `200 skipped`), réservation
d'idempotence lue dans `{ error }` (`23505` → `duplicate:true`), échec d'écriture
de `subscriptions` → `500 retryable` avec libération de la réservation.

## 3. Routes publiques assumées (lecture ou télémétrie)

`/`, `/health`, `/healthz`, `/api/config/free-limit`, `/math-positions`,
`/list-images`, `/api/gs/{status,tournaments,tournaments/:id}`,
`/api/tournament/{tournaments,leaderboard,...}` en lecture publique,
`/api/rectorat/competition-status`, `/api/progress/log`,
`/api/antifraud/{check-rate-limit,record-attempt}`,
télémétrie `/api/monitoring/{record-images,incidents,arena-rounds,client-rounds,client-clicks,client-diag,game-trace,client-telemetry,game-screenshots,e2e-screenshot,e2e-results,heartbeat}`.

Ces routes de télémétrie acceptent un `userId`/`email` fourni par le client. Ce
champ n'accorde aucun droit: il n'est utilisé que comme étiquette d'observabilité.
Il reste falsifiable (pollution du journal, faux « joueur en ligne ») → suivi
CTO-004, sans impact sur l'autorisation.

## 4. Autorisation élèves / classes (revue CTO)

Module `server/access/schoolScope.js`. Le périmètre est déduit du seul JWT
vérifié; aucun `studentId`, `classId`, `teacherId`, `schoolId` ou
`circonscription` envoyé par le client ne vaut preuve d'autorité.

| Rôle serveur | Périmètre accordé | Relation prouvée côté serveur |
|---|---|---|
| `admin` | global | `user_profiles.role` |
| `teacher` | uniquement les classes dont il est l'enseignant, et leurs élèves | `classes.teacher_email` = email du JWT |
| `cpc`, `cpd`, `rectorat` | uniquement leur circonscription | `user_profiles.circonscription_id` = `schools.circonscription_id` / `students.circonscription_id` |
| compte élève | uniquement sa propre fiche | `user_student_mapping(user_id, student_id, active)` **exclusivement** |
| utilisateur standard | aucune donnée scolaire | — |

Toute incertitude refuse (base injoignable, erreur de requête, profil absent,
professeur sans classe, rattachement introuvable) → `403`.

Routes désormais autorisées (`requireClassAccess` / `requireStudentAccess`):
`GET /api/tournament/classes/:classId/{students,groups,students-performance,setup-data,tour-status,competition-results}`,
`POST /api/tournament/classes/:classId/next-tour`,
`GET /api/tournament/students/{:id,:studentId/info,:studentId/performance,:studentId/invitations,:studentId/training-invitations}`.

### Relations de données manquantes (documentées, fail closed)

- Aucune table ne relie une circonscription à une **région académique**: le
  périmètre « région » d'un CPD/rectorat n'est pas prouvable. Ces rôles sont donc
  ramenés à leur `circonscription_id`; sans circonscription renseignée, l'accès
  aux routes élèves/classes est refusé (`institutional_scope_unprovable`).
- Le rattachement professeur ↔ classe repose sur `classes.teacher_email`
  (chaîne), et non sur une clé étrangère vers `auth.users`. Un changement
  d'adresse professionnelle fait perdre le périmètre: une colonne
  `classes.teacher_user_id` serait la relation robuste.
- `tournament_groups.student_ids` est un JSON sans contrainte référentielle: les
  routes de groupes sont autorisées par la classe (`class_id`), pas élève par élève.

### `LEGACY_STUDENT_MAPPING_REQUIRED`

Revue CTO finale: l'identité élève ne se déduit plus que d'un lien serveur.
Chaîne d'autorité unique, utilisée par `resolveEntitlement()`, `/usage/can-start`
et `GET /me` via `schoolScope.resolveLinkedStudent()`:

```
JWT Supabase vérifié → req.authUser.id → user_student_mapping (active)
  → students.id → students.licensed
```

**Flux qui crée ces comptes.** `POST /api/auth/student-login` cherche l'élève par
`access_code`, refuse s'il n'est pas `licensed`, fabrique l'adresse
`<access_code normalisé>@eleve.crazychrono.app`, crée le compte Supabase Auth, le
profil `role='student'`, puis insère `user_student_mapping`. Le mapping est donc
créé par le serveur pour tout compte issu de ce flux.

**Ce qui manque.** Les comptes élèves antérieurs à ce flux (ou importés
directement dans `auth.users`) peuvent n'avoir aucune ligne
`user_student_mapping`. Ils étaient jusqu'ici rattachés en rapprochant le préfixe
de leur adresse de `students.access_code`. Ce rapprochement n'est pas une preuve:
quiconque obtient une adresse de cette forme hérite de la fiche et de la licence
de l'élève correspondant. Il est supprimé.

**Conséquence dans CTO-003.** Fail closed: ces comptes n'obtiennent ni licence ni
fiche élève, jusqu'à leur rattachement explicite. Aucun mapping n'est créé
automatiquement, aucune donnée de production n'est modifiée, aucune migration
n'est embarquée dans cette PR.

**Backfill sûr, ultérieur.** Il doit être administratif et serveur, sans jamais
utiliser une donnée fournie par le navigateur comme preuve d'identité:
rapprochement hors ligne `auth.users.id` → `students.id` validé par
l'établissement, appliqué via la fonction existante
`link_user_to_student(p_user_email, p_student_id, p_admin_email)`
(<code>server/db/schema_user_mapping.sql</code>), journalisé (`linked_by`), avec
une revue des collisions (`UNIQUE(student_id)`) avant exécution.

## 5. IDOR restants, hors périmètre

| Route | Problème | Gravité proposée |
|---|---|---|
| `GET /api/antifraud/audit-log?user_id=` | filtre de ressource, réservé admin/rectorat/teacher: un professeur peut lire le journal de n'importe quel utilisateur | P2 |
| `GET /api/session/device/list?user_id=` | ciblage d'un tiers autorisé après contrôle de rôle encadrant — comportement volontaire, à confirmer produit | à confirmer |
| `GET /api/internal/screenshot-data/:id` | lecture publique par identifiant devinable | P2 |
