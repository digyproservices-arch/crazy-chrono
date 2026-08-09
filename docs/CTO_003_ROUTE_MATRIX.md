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
| GET | `/students` | liste nominative d'élèves (nom, licence) | aucune | rôle encadrant | `requireAuth` + `requireManagerRole` (admin/teacher/cpd/cpc/rectorat), liste de démonstration supprimée |
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

Secret partagé: `POST /webhooks/revenuecat` (`REVENUECAT_WEBHOOK_SECRET`).
Signature Stripe: `POST /webhooks/stripe` (CTO-002).

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

## 4. IDOR découverts et NON corrigés (hors périmètre CTO-003)

| Route | Problème | Gravité proposée |
|---|---|---|
| `GET /api/tournament/students/:studentId/performance` | tout utilisateur authentifié peut lire l'historique complet d'un élève quelconque | P1 |
| `GET /api/tournament/students/:studentId/info` | idem (nom complet, avatar) | P1 |
| `GET /api/tournament/classes/:classId/{students,groups,students-performance,setup-data,tour-status,competition-results}` | tout utilisateur authentifié peut lire les données d'une classe quelconque | P1 |
| `GET /api/tournament/students/:studentId/{invitations,training-invitations}` | idem | P2 |
| `GET /api/antifraud/audit-log?user_id=` | filtre de ressource, réservé admin/rectorat/teacher: un professeur peut lire le journal de n'importe quel utilisateur | P2 |
| `GET /api/session/device/list?user_id=` | ciblage d'un tiers autorisé après contrôle de rôle encadrant — comportement volontaire, à confirmer produit | à confirmer |
| `GET /api/internal/screenshot-data/:id` | lecture publique par identifiant devinable | P2 |

Ces routes sont authentifiées mais pas autorisées: `studentId` / `classId` y sont
des ressources demandées, pas l'identité de l'appelant. Les corriger suppose une
règle produit (quel encadrant voit quelle classe), donc une mission dédiée.
