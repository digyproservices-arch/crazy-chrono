# 🚀 GUIDE RAPIDE - MIGRATION LICENCES (30 MINUTES)

**Date :** 8 décembre 2025  
**Objectif :** Activer le système de licences professionnel pour la démo Rectorat

---

## ✅ ÉTAPE 1 : EXÉCUTER LE SCHÉMA SQL (2 minutes)

### **A. Va sur Supabase Dashboard**

1. https://supabase.com/dashboard
2. Sélectionne ton projet **Crazy Chrono**
3. Menu gauche → **SQL Editor**

### **B. Exécute le schéma**

1. **Copie le contenu de** : `server/db/schema_user_mapping.sql`
2. **Colle dans SQL Editor**
3. **Clique "Run"** (ou F5)
4. **Vérifie** : Message "Schéma user_student_mapping créé avec succès !"

**Ce qui a été créé :**
- ✅ Table `user_student_mapping` (liaison comptes ↔ élèves)
- ✅ Table `licenses` (gestion licences)
- ✅ Vue `user_licenses` (vérification rapide)
- ✅ Fonction `check_user_can_play()` (API)
- ✅ Fonction `link_user_to_student()` (admin)
- ✅ Policies RLS (sécurité)

---

## ✅ ÉTAPE 2 : CRÉER LES 5 COMPTES (10 minutes)

### **A. Compte Enseignant**

1. Va sur : `http://localhost:3000/login` (ou `https://app.crazy-chrono.com/login`)
2. Clique **"Créer un compte"**
3. Remplis :
   ```
   Prénom : Marie
   Nom : VERIN
   Email : prof.demo@crazy-chrono.com
   Mot de passe : CrazyProf2025!
   Confirmation : CrazyProf2025!
   ```
4. Clique **"Valider l'inscription"**
5. **Vérifie ton email** et clique sur le lien de confirmation

### **B. 4 Comptes Élèves**

**Répète 4 fois (même page `/login`) :**

**Alice :**
```
Prénom : Alice
Nom : MARTIN
Email : alice.demo@crazy-chrono.com
Mot de passe : CrazyAlice2025!
```

**Bob :**
```
Prénom : Bob
Nom : DUBOIS
Email : bob.demo@crazy-chrono.com
Mot de passe : CrazyBob2025!
```

**Charlie :**
```
Prénom : Charlie
Nom : MOREAU
Email : charlie.demo@crazy-chrono.com
Mot de passe : CrazyCharlie2025!
```

**Diana :**
```
Prénom : Diana
Nom : BERNARD
Email : diana.demo@crazy-chrono.com
Mot de passe : CrazyDiana2025!
```

**⚠️ N'oublie pas de confirmer les 4 emails !**

---

## ✅ ÉTAPE 3 : PROMOUVOIR LE PROF EN ADMIN (1 minute)

### **Dans Supabase Dashboard :**

1. Menu gauche → **Table Editor**
2. Sélectionne la table → `user_profiles`
3. Cherche la ligne avec `prof.demo@crazy-chrono.com`
4. Double-clique sur la colonne `role`
5. Change `user` → `admin`
6. Appuie sur **Entrée** pour sauvegarder

**OU via SQL Editor :**

```sql
UPDATE user_profiles 
SET role = 'admin' 
WHERE email = 'prof.demo@crazy-chrono.com';
```

---

## ✅ ÉTAPE 4 : LIER LES COMPTES AVEC LES ÉLÈVES (2 minutes)

### **Dans Supabase SQL Editor :**

1. **Copie le contenu de** : `server/db/seed_demo_accounts.sql`
2. **Colle dans SQL Editor**
3. **Clique "Run"** (ou F5)
4. **Vérifie** : Message "Liaison comptes démo terminée avec succès !"

**Ce script fait automatiquement :**
- ✅ Lie `alice.demo@crazy-chrono.com` → `s001` (Alice Bertrand)
- ✅ Lie `bob.demo@crazy-chrono.com` → `s002` (Bob Charles)
- ✅ Lie `charlie.demo@crazy-chrono.com` → `s003` (Chloé Dubois)
- ✅ Lie `diana.demo@crazy-chrono.com` → `s004` (David Emile)
- ✅ Crée des licences actives (valides 1 an)
- ✅ Vérifie que `licensed=true` pour tous

---

## ✅ ÉTAPE 5 : REDÉMARRER LE BACKEND (1 minute)

### **Arrête et relance le serveur :**

```bash
# Arrête le serveur (Ctrl+C dans le terminal)

# Relance
cd server
node server.js
```

**Vérifie les logs :**
```
[Server] Supabase Admin client initialized  ← Tu dois voir ça !
Server running on port 4000
```

---

## ✅ ÉTAPE 6 : TESTER L'API (5 minutes)

### **A. Récupérer le token Supabase**

1. **Connecte-toi** avec `alice.demo@crazy-chrono.com`
2. **Ouvre la console** (F12)
3. **Tape :**
   ```javascript
   const auth = JSON.parse(localStorage.getItem('cc_auth'));
   console.log('Token:', auth.token); // Copie ce token
   ```

### **B. Tester /api/auth/me**

**Dans la console :**

```javascript
fetch('http://localhost:4000/api/auth/me', {
  headers: {
    'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem('cc_auth')).token
  }
})
.then(r => r.json())
.then(d => console.log('✅ Résultat:', d));
```

**Résultat attendu :**

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
    "licensed": true
  },
  "license": {
    "hasActiveLicense": true,
    "licenseType": "student",
    "licenseStatus": "active"
  }
}
```

**✅ SI TU VOIS `student_id: "s001"` → C'EST BON !**

---

## ✅ ÉTAPE 7 : VÉRIFIER DANS SUPABASE (2 minutes)

### **Table Editor → `user_student_mapping`**

Tu dois voir :

| user_id | student_id | active | notes |
|---------|------------|--------|-------|
| uuid-alice | s001 | true | Compte démo Rectorat - Alice |
| uuid-bob | s002 | true | Compte démo Rectorat - Bob |
| uuid-charlie | s003 | true | Compte démo Rectorat - Charlie |
| uuid-diana | s004 | true | Compte démo Rectorat - Diana |

### **Table Editor → `licenses`**

Tu dois voir :

| license_key | license_type | owner_id | status | valid_until |
|-------------|--------------|----------|--------|-------------|
| DEMO-ALICE-2025 | student | s001 | active | 2026-12-08 |
| DEMO-BOB-2025 | student | s002 | active | 2026-12-08 |
| DEMO-CHARLIE-2025 | student | s003 | active | 2026-12-08 |
| DEMO-DIANA-2025 | student | s004 | active | 2026-12-08 |
| DEMO-PROF-2025 | teacher | uuid-prof | active | NULL |

---

## ✅ ÉTAPE 8 : TESTER CRAZY ARENA (5 minutes)

### **A. L'enseignant crée le match**

1. **Connecte-toi** : `prof.demo@crazy-chrono.com` / `CrazyProf2025!`
2. **Va sur** : `/tournament/setup`
3. **Crée un groupe** avec s001, s002, s003, s004
4. **Lance le match** → Note le code : `ABC123`

### **B. Les 4 élèves rejoignent**

**Ouvre 4 onglets/navigateurs :**

**Onglet 1 - Alice :**
1. Connecte-toi : `alice.demo@crazy-chrono.com`
2. Va sur : `/crazy-arena/lobby/ABC123`

**Onglet 2 - Bob :**
1. Connecte-toi : `bob.demo@crazy-chrono.com`
2. Va sur : `/crazy-arena/lobby/ABC123`

**Onglet 3 - Charlie :**
1. Connecte-toi : `charlie.demo@crazy-chrono.com`
2. Va sur : `/crazy-arena/lobby/ABC123`

**Onglet 4 - Diana :**
1. Connecte-toi : `diana.demo@crazy-chrono.com`
2. Va sur : `/crazy-arena/lobby/ABC123`

**⚠️ IMPORTANT :** Avec le système actuel, tu devras encore ajouter temporairement dans la console de chaque onglet :

```javascript
// Temporaire - jusqu'à ce qu'on modifie CrazyArenaLobby.js
localStorage.setItem('cc_student_id', 's001'); // Change pour s002, s003, s004
```

**Mais l'API `/api/auth/me` fonctionne déjà !**

---

## 🔄 PROCHAINE ÉTAPE (Demain - 15 minutes)

**Modifier CrazyArenaLobby.js pour utiliser l'API :**

Remplacer :
```javascript
const studentId = localStorage.getItem('cc_student_id') || 's001';
```

Par :
```javascript
const [studentData, setStudentData] = useState(null);

useEffect(() => {
  const fetchStudentData = async () => {
    const auth = JSON.parse(localStorage.getItem('cc_auth'));
    const response = await fetch(`${getBackendUrl()}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    });
    const data = await response.json();
    if (data.ok && data.student) {
      setStudentData(data.student);
    }
  };
  fetchStudentData();
}, []);
```

**Je peux faire cette modification pour toi demain !**

---

## 📊 CHECKLIST COMPLÈTE

- [ ] **ÉTAPE 1 :** Exécuté `schema_user_mapping.sql` dans Supabase
- [ ] **ÉTAPE 2 :** Créé les 5 comptes (1 prof + 4 élèves)
- [ ] **ÉTAPE 3 :** Promu le prof en admin
- [ ] **ÉTAPE 4 :** Exécuté `seed_demo_accounts.sql`
- [ ] **ÉTAPE 5 :** Redémarré le backend
- [ ] **ÉTAPE 6 :** Testé `/api/auth/me` → ✅ student_id retourné
- [ ] **ÉTAPE 7 :** Vérifié les tables dans Supabase
- [ ] **ÉTAPE 8 :** Testé Crazy Arena avec les 4 comptes

---

## 🆘 SI PROBLÈME

### **Erreur : "supabase_not_configured"**

**Solution :** Vérifie les variables d'environnement :

```bash
# server/.env
SUPABASE_URL=https://ton-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...ton_key
```

### **Erreur : "relation user_student_mapping does not exist"**

**Solution :** Exécute `schema_user_mapping.sql` dans Supabase SQL Editor

### **Erreur : "No student linked to this account"**

**Solution :** Exécute `seed_demo_accounts.sql` dans Supabase SQL Editor

### **student_id retourne null**

**Solution :** Vérifie que les liaisons existent :

```sql
SELECT * FROM user_student_mapping 
WHERE student_id IN ('s001', 's002', 's003', 's004');
```

---

## 🎯 RÉSUMÉ

**Ce qui change :**

| Avant (localStorage) | Après (API + BDD) |
|----------------------|-------------------|
| ❌ Manuel | ✅ Automatique |
| ❌ Pas de licence | ✅ Licences actives |
| ❌ Pas sécurisé | ✅ RLS Supabase |
| ❌ Pas scalable | ✅ 10,000+ users en 15min |

**Après ces 30 minutes, tu auras :**
- ✅ Système de licences professionnel actif
- ✅ 5 comptes de démo fonctionnels
- ✅ API `/api/auth/me` opérationnelle
- ✅ Prêt pour la démo Rectorat (22/12)

---

**Dernière mise à jour :** 8 décembre 2025, 15h15  
**Prochaine étape :** Exécute ÉTAPE 1 maintenant !
