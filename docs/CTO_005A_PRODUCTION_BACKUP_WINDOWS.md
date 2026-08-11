# CTO-005A — Backup logique de la base Supabase PRODUCTION (Windows)

À exécuter par le propriétaire, sur son PC Windows, **avant** toute migration
CTO-005A (`0100` → `1400`).

Le projet production est sur le plan **Free** : le Dashboard ne fournit aucun
backup restaurable (« Free Plan does not include project backups »). La méthode
officielle recommandée par Supabase pour ce plan est un **dump logique** via la
CLI Supabase (`supabase db dump`).

- project ref : `vimtycpjofejtgwejfht`
- méthode : `supabase db dump` (roles / schema / data, dumps séparés)
- ce document ne contient **aucun secret** et le dossier de backup n'est jamais
  versionné (voir `.gitignore`).

---

## 1. Prérequis (à installer une seule fois)

1. **Docker Desktop pour Windows** — https://www.docker.com/products/docker-desktop/
   `supabase db dump` n'utilise pas un `pg_dump` local : il exécute `pg_dump`
   dans l'image `public.ecr.aws/supabase/postgres` (vérifié avec la CLI
   `2.113.0`). Docker Desktop doit être **lancé** (icône baleine active) au
   moment du dump. Si Docker Desktop ne peut pas être installé, voir l'annexe B.
2. **CLI Supabase** — PowerShell, au choix :
   - via Scoop (méthode documentée par Supabase) :
     ```powershell
     scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
     scoop install supabase
     ```
   - ou binaire autonome : télécharger `supabase_windows_amd64.tar.gz` depuis
     https://github.com/supabase/cli/releases/latest, l'extraire, et utiliser
     `.\supabase.exe` au lieu de `supabase` dans toutes les commandes.
3. Vérifier l'installation :
   ```powershell
   supabase --version
   docker --version
   ```

## 2. Dossier de travail

```powershell
mkdir C:\crazy-chrono-backup
cd C:\crazy-chrono-backup
```

Ce dossier est **hors du dépôt Git**. Ne jamais le déplacer dans le dépôt ni
l'envoyer sur GitHub : il contient des données personnelles d'élèves.

## 3. Authentification

Deux authentifications distinctes.

**a) Compte Supabase (token) — ouvre le navigateur, rien à taper :**
```powershell
supabase login
```

**b) Initialiser et lier le projet :**
```powershell
supabase init
supabase link --project-ref vimtycpjofejtgwejfht
```
`supabase link` demande le mot de passe de la base. **Laisser vide et appuyer
sur Entrée** (`Enter your database password (or leave blank to skip):`) pour ne
rien enregistrer dans le gestionnaire d'identifiants Windows.

**c) Mot de passe DATABASE, uniquement en mémoire, pour la session PowerShell
en cours :**
```powershell
$env:SUPABASE_DB_PASSWORD = Read-Host "Mot de passe DATABASE Supabase"
```
Le mot de passe est saisi au clavier dans une invite : il n'apparaît dans aucune
commande, aucun fichier, aucun historique PowerShell, ni dans GitHub, ni dans
Devin. Il disparaît à la fermeture de la fenêtre PowerShell. Pour l'effacer
immédiatement après les dumps :
```powershell
Remove-Item Env:\SUPABASE_DB_PASSWORD
```

## 4. Commandes de backup (à copier-coller, dans cet ordre)

Cinq dumps séparés : Supabase exclut par défaut les schémas managés (`auth`,
`storage`), ils sont donc sauvegardés explicitement — indispensable ici car le
trigger `on_auth_user_created` et `auth.users` sont concernés par CTO-005A.

```powershell
supabase db dump --linked --role-only -f roles.sql
supabase db dump --linked -f schema.sql
supabase db dump --linked --data-only --use-copy -f data.sql
supabase db dump --linked --schema auth,storage -f schema_auth_storage.sql
supabase db dump --linked --schema auth,storage --data-only --use-copy -f data_auth_storage.sql
```

Chaque commande doit afficher `Dumped schema to ...` et rendre le prompt sans
message d'erreur.

## 5. Fichiers attendus

Dans `C:\crazy-chrono-backup` :

| fichier | contenu |
| --- | --- |
| `roles.sql` | rôles du cluster (`--role-only`) |
| `schema.sql` | schéma des schémas applicatifs (dont `public`) |
| `data.sql` | données des schémas applicatifs, en `COPY` |
| `schema_auth_storage.sql` | schéma `auth` + `storage` |
| `data_auth_storage.sql` | données `auth` (dont `auth.users`) + `storage` |

## 6. Validation locale (aucune restauration en production)

**a) Présence et tailles > 0 :**
```powershell
Get-ChildItem C:\crazy-chrono-backup\*.sql | Select-Object Name, Length
```
Aucune ligne ne doit afficher `Length` à 0.

**b) Contenu attendu (le nombre affiché doit être > 0) :**
```powershell
(Select-String -Path schema.sql -Pattern "CREATE TABLE" -SimpleMatch).Count
(Select-String -Path data.sql -Pattern "COPY " -SimpleMatch).Count
(Select-String -Path schema_auth_storage.sql -Pattern "auth.users" -SimpleMatch).Count
(Select-String -Path data_auth_storage.sql -Pattern "COPY " -SimpleMatch).Count
```

**c) Absence de message d'erreur dans les dumps (doit afficher `0`) :**
```powershell
(Select-String -Path *.sql -Pattern "pg_dump: error","could not connect","permission denied" -SimpleMatch).Count
```

**d) Validation syntaxique réelle, dans un PostgreSQL jetable local — ne touche
jamais la production :**
```powershell
docker run -d --rm --name cc-restore-check -e POSTGRES_PASSWORD=pw -p 55433:5432 postgres:15-alpine
timeout /t 15
docker cp C:\crazy-chrono-backup\schema.sql cc-restore-check:/tmp/schema.sql
docker exec cc-restore-check psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/schema.sql
docker stop cc-restore-check
```
La commande `psql` doit se terminer sans erreur (`ON_ERROR_STOP=1` fait échouer
la commande à la première erreur SQL). C'est une simple relecture du dump dans
une base vide et jetable : la production n'est ni lue ni modifiée par cette
étape.

**Ne jamais exécuter ces fichiers contre la base de production.**

## 7. Sécurité

- `C:\crazy-chrono-backup` est hors du dépôt ; si un dump est malgré tout créé
  dans le dépôt, `.gitignore` ignore déjà `/backup/`, `/backups/`, `*.dump` et
  les dumps `/roles.sql`, `/schema.sql`, `/data.sql`,
  `/schema_auth_storage.sql`, `/data_auth_storage.sql` (motifs ancrés à la
  racine du dépôt, pour ne masquer aucun fichier de sous-dossier).
- Aucun backup ne doit être poussé sur GitHub, ni collé dans une PR, ni envoyé à
  Devin : les dumps contiennent des données personnelles (élèves, emails).
- Aucun mot de passe ni token ne figure dans ce document ni dans une commande
  persistante.
- Conserver le backup sur un support privé (disque local + copie chiffrée hors
  ligne).

---

## Annexe A — Après le backup

Les migrations CTO-005A ne sont **pas** couvertes par ce document et ne doivent
pas être appliquées sans décision explicite.

## Annexe B — Sans Docker Desktop (repli)

Si Docker Desktop est impossible à installer, installer les outils client
PostgreSQL 17 (installeur officiel https://www.postgresql.org/download/windows/,
composant « Command Line Tools ») puis utiliser `pg_dump` directement avec la
chaîne de connexion du Dashboard (`Project Settings` → `Database` →
`Connection string` → `URI`), sans écrire le mot de passe dans la commande :

```powershell
$env:PGPASSWORD = Read-Host "Mot de passe DATABASE Supabase"
pg_dumpall --roles-only -d "<URI sans mot de passe>" -f roles.sql
pg_dump --schema-only -n public -d "<URI sans mot de passe>" -f schema.sql
pg_dump --data-only --column-inserts -n public -d "<URI sans mot de passe>" -f data.sql
pg_dump --schema-only -n auth -n storage -d "<URI sans mot de passe>" -f schema_auth_storage.sql
pg_dump --data-only -n auth -n storage -d "<URI sans mot de passe>" -f data_auth_storage.sql
Remove-Item Env:\PGPASSWORD
```

Ce repli n'est pas la méthode officiellement documentée par Supabase ; les
dumps produits n'ont pas les ajustements appliqués par la CLI. À n'utiliser que
si la voie CLI est bloquée.
