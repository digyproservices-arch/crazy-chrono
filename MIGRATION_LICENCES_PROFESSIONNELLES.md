# 🎓 MIGRATION VERS SYSTÈME DE LICENCES PROFESSIONNEL

**Date :** 8 décembre 2025  
**Objectif :** Préparer le système pour la production après validation Rectorat

---

## 📊 ARCHITECTURE

### **AVANT (localStorage - système de test)**

```
Utilisateur connecté (Auth Supabase)
     ↓
localStorage.setItem('cc_student_id', 's001')  ← Manu el !
     ↓
Lobby récupère student_id depuis localStorage
```

**Problèmes :**
- ❌ Pas scalable
- ❌ Pas sécurisé
- ❌ Pas de gestion des licences
- ❌ Configuration manuelle pour chaque utilisateur

---

### **APRÈS (BDD - système production)**

```
Utilisateur connecté (Auth Supabase)
     ↓
API: GET /api/auth/me
     ↓
BDD: user_student_mapping → Récupère student_id automatiquement
     ↓
BDD: licenses → Vérifie licence active
     ↓
Lobby reçoit student_id + licence OK
```

**Avantages :**
- ✅ Automatique
- ✅ Sécurisé (RLS Supabase)
- ✅ Gestion des licences professionnelle
- ✅ Scalable à 10 000+ utilisateurs

---

## 🗂️ NOUVELLES TABLES

### **Table 1 : `user_student_mapping`**

**But :** Lier un compte Auth Supabase avec un élève du tournoi

```sql
user_id (UUID) → Compte Supabase Auth
student_id (VARCHAR) → Élève (s001, s002, etc.)
linked_at (TIMESTAMP)
linked_by (VARCHAR) → Email admin qui a fait le lien
active (BOOLEAN)
notes (TEXT)
```

**Exemple :**
```
alice.demo@crazy-chrono.com (UUID: abc-123)
         ↓
s001 (Alice Bertrand, CE1-A)
```

---

### **Table 2 : `licenses`**

**But :** Gérer les licences (actives, expirées, révoquées)

```sql
id (UUID)
license_key (VARCHAR) → Ex: "DEMO-ALICE-2025"
license_type (VARCHAR) → student | teacher | school | academy
owner_type (VARCHAR) → user | student | school
owner_id (VARCHAR) → ID de l'owner
status (VARCHAR) → active | expired | revoked | suspended
valid_from (TIMESTAMP)
valid_until (TIMESTAMP) → NULL = illimité
max_students (INT) → Pour licences école/académie
features (JSON) → ["crazy_solo", "crazy_arena", "tournament"]
```

---

### **Vue : `user_licenses`**

**But :** Vérifier rapidement si un user a une licence active

```sql
SELECT * FROM user_licenses WHERE user_id = 'abc-123';

Résultat :
user_id | email | student_id | has_active_license | license_status
abc-123 | alice... | s001 | true | active
```

---

### **Fonction : `check_user_can_play(user_id)`**

**But :** Vérifier en 1 appel si un user peut jouer

```sql
SELECT * FROM check_user_can_play('abc-123');

Résultat :
can_play | student_id | reason
true | s001 | Licence active
```

---

## 🔧 NOUVELLES ROUTES API

### **GET /api/auth/me**

**But :** Récupérer toutes les infos de l'utilisateur connecté

**Headers :**
```
Authorization: Bearer <token_supabase>
```

**Réponse :**
```json
{
  "ok": true,
  "user": {
    "id": "abc-123",
    "email": "alice.demo@crazy-chrono.com",
    "name": "Alice",
    "role": "user"
  },
  "student": {
    "id": "s001",
    "firstName": "Alice",
    "lastName": "Bertrand",
    "fullName": "Alice B.",
    "level": "CE1",
    "licensed": true,
    "avatarUrl": "/avatars/default.png"
  },
  "license": {
    "hasActiveLicense": true,
    "licenseType": "student",
    "licenseStatus": "active",
    "validUntil": "2026-12-08T00:00:00Z"
  }
}
```

---

### **GET /api/auth/check-license**

**But :** Vérifier rapidement si l'utilisateur peut jouer

**Headers :**
```
Authorization: Bearer <token_supabase>
```

**Réponse :**
```json
{
  "ok": true,
  "canPlay": true,
  "studentId": "s001",
  "reason": "Licence active"
}
```

---

### **POST /api/auth/link-student** (Admin seulement)

**But :** Lier un compte utilisateur avec un élève

**Headers :**
```
Authorization: Bearer <token_admin>
```

**Body :**
```json
{
  "userEmail": "alice.demo@crazy-chrono.com",
  "studentId": "s001"
}
```

**Réponse :**
```json
{
  "ok": true,
  "user_id": "abc-123",
  "student_id": "s001"
}
```

---

## 📋 PROCÉDURE DE MIGRATION

### **ÉTAPE 1 : Créer les tables (Supabase SQL Editor)**

```bash
# Exécuter dans l'ordre :
1. server/db/schema_user_mapping.sql
2. server/db/seed_demo_accounts.sql
```

**Temps estimé :** 2 minutes

---

### **ÉTAPE 2 : Monter les routes dans server.js**

**Ajouter dans `server/server.js` :**

```javascript
// Auth routes (licences et mapping)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Exposer supabaseAdmin pour les routes
app.locals.supabaseAdmin = supabaseAdmin;
```

**Temps estimé :** 1 minute

---

### **ÉTAPE 3 : Créer les 5 comptes via l'interface**

**Comptes à créer :**
1. `prof.demo@crazy-chrono.com` → Enseignant (admin)
2. `alice.demo@crazy-chrono.com` → Élève
3. `bob.demo@crazy-chrono.com` → Élève
4. `charlie.demo@crazy-chrono.com` → Élève
5. `diana.demo@crazy-chrono.com` → Élève

**Temps estimé :** 10 minutes (déjà fait ?)

---

### **ÉTAPE 4 : Exécuter le script de liaison**

**Dans Supabase SQL Editor :**

```sql
-- Exécuter server/db/seed_demo_accounts.sql
-- Cela va automatiquement :
-- 1. Lier les 4 comptes élèves avec s001-s004
-- 2. Créer les licences actives
-- 3. Vérifier que licensed=true
```

**Temps estimé :** 1 minute

---

### **ÉTAPE 5 : Modifier le frontend (CrazyArenaLobby.js)**

**Remplacer :**

```javascript
// AVANT (localStorage)
const studentId = localStorage.getItem('cc_student_id') || 's001';
const studentName = localStorage.getItem('cc_student_name') || 'Joueur';
```

**Par :**

```javascript
// APRÈS (API)
const [studentData, setStudentData] = useState(null);

useEffect(() => {
  const fetchUserData = async () => {
    try {
      const auth = JSON.parse(localStorage.getItem('cc_auth'));
      if (!auth || !auth.token) return;

      const response = await fetch(`${getBackendUrl()}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${auth.token}`
        }
      });

      const data = await response.json();
      
      if (data.ok && data.student) {
        setStudentData(data.student);
      } else {
        setError('Aucun élève lié à ce compte');
      }
    } catch (err) {
      console.error('[CrazyArena] Error fetching user data:', err);
      setError('Erreur lors du chargement');
    }
  };

  fetchUserData();
}, []);
```

**Temps estimé :** 15 minutes (je peux le faire pour toi)

---

### **ÉTAPE 6 : Tester avec les vrais comptes**

**Test complet :**
1. Connecte-toi avec `alice.demo@crazy-chrono.com`
2. Vérifie que `/api/auth/me` retourne `student_id: s001`
3. Rejoins un lobby Crazy Arena
4. Vérifie que ça fonctionne sans localStorage

**Temps estimé :** 10 minutes

---

## ✅ AVANTAGES DU NOUVEAU SYSTÈME

### **1. Sécurité**

**AVANT :**
```javascript
// N'importe qui peut changer son student_id !
localStorage.setItem('cc_student_id', 's999'); // Triche facile
```

**APRÈS :**
```sql
-- Liaison contrôlée par admin
-- RLS Supabase activé
-- Impossible de tricher
```

---

### **2. Gestion des licences**

**Scénarios supportés :**

```sql
-- Licence élève individuelle
INSERT INTO licenses (license_type, owner_type, owner_id, valid_until)
VALUES ('student', 'student', 's001', '2026-12-31');

-- Licence classe (30 élèves)
INSERT INTO licenses (license_type, owner_type, owner_id, max_students)
VALUES ('school', 'class', 'ce1_a_lamentin', 30);

-- Licence académie (illimitée)
INSERT INTO licenses (license_type, owner_type, owner_id, valid_until)
VALUES ('academy', 'academy', 'gp', NULL); -- Pas d'expiration
```

---

### **3. Scalabilité**

**Après validation du Rectorat :**

```bash
# Créer 1000 comptes élèves en bulk
# (Script automatisé - 10 minutes)

# Les lier automatiquement avec la BDD élèves
# (API /api/auth/link-student)

# Générer les licences en masse
# (Script SQL - 5 minutes)

# Total : 15 minutes pour déployer 1000 élèves !
```

---

## 🎯 POUR LA DÉMO RECTORAT (22/12)

### **Configuration actuelle :**

```
✅ 5 comptes créés (1 prof + 4 élèves)
✅ Tables BDD prêtes (schema_user_mapping.sql)
✅ Scripts de liaison prêts (seed_demo_accounts.sql)
✅ Routes API créées (/api/auth/me, /check-license)
⏳ À faire : Exécuter les scripts SQL (5 minutes)
⏳ À faire : Modifier CrazyArenaLobby.js (15 minutes)
⏳ À faire : Tester (10 minutes)

Total : 30 minutes de travail
```

---

## 🚀 PROCHAINES ÉTAPES

### **Maintenant (aujourd'hui) :**

1. ✅ Exécuter `schema_user_mapping.sql` dans Supabase
2. ✅ Exécuter `seed_demo_accounts.sql` après création des comptes
3. ✅ Monter les routes `/api/auth` dans server.js
4. ✅ Tester `/api/auth/me` avec Postman ou console

### **Demain (Lundi 9/12) :**

1. ✅ Modifier CrazyArenaLobby.js pour utiliser l'API
2. ✅ Tester Crazy Arena avec les vrais comptes
3. ✅ Vérifier que tout fonctionne sans localStorage

### **Après validation Rectorat :**

1. ✅ Créer des scripts d'import CSV (écoles, classes, élèves)
2. ✅ Déployer pour toute l'académie (10 000+ élèves)
3. ✅ Activer le système de licences (facturation, renouvellement)

---

## 📞 SUPPORT

**Si problème lors de la migration :**

1. Vérifier que les tables existent : `SELECT * FROM user_student_mapping LIMIT 1;`
2. Vérifier les liaisons : `SELECT * FROM user_licenses;`
3. Tester l'API : `curl -H "Authorization: Bearer TOKEN" http://localhost:4000/api/auth/me`

**Erreurs courantes :**

| Erreur | Solution |
|--------|----------|
| `relation "user_student_mapping" does not exist` | Exécuter `schema_user_mapping.sql` |
| `No student linked to this account` | Exécuter `seed_demo_accounts.sql` |
| `Token invalid` | Récupérer le bon token depuis localStorage |

---

## 📊 COMPARAISON FINALE

| Critère | localStorage (test) | BDD + API (prod) |
|---------|---------------------|------------------|
| **Sécurité** | ❌ Faible | ✅ Forte (RLS) |
| **Scalabilité** | ❌ Manuel | ✅ Automatique |
| **Licences** | ❌ Pas supporté | ✅ Complet |
| **Temps setup 1 user** | 30 sec | 5 sec |
| **Temps setup 1000 users** | 8h | 15 min |
| **Production ready** | ❌ Non | ✅ Oui |

---

**Dernière mise à jour :** 8 décembre 2025, 15h00  
**Prochaine action :** Exécuter les scripts SQL dans Supabase
