# 🎓 COMPTES RÉELS POUR DÉMO RECTORAT - 22 DÉCEMBRE 2025

**Date de configuration :** 9 décembre 2025  
**Comptes utilisés :** Vos comptes Gmail existants

---

## 👥 ATTRIBUTION DES RÔLES

### **👨‍🏫 ENSEIGNANT (ADMIN)**

```
Email : verinmarius971@gmail.com
Rôle : admin
Accès : /tournament/setup, Création de groupes, Lancement de matchs
Licence : Illimitée (DEMO-PROF-MARIUS-2025)
```

---

### **👨‍🎓 ÉLÈVES (4 joueurs pour Crazy Arena)**

#### **Élève 1 - Alice Bertrand (s001)**

```
Email : crazy.chrono.contact@gmail.com
Student ID : s001
Prénom : Alice
Nom : Bertrand
Niveau : CE1-A
Licence : Active jusqu'au 9 décembre 2026 (DEMO-ALICE-2025)
```

---

#### **Élève 2 - Bob Charles (s002)**

```
Email : digyproservices@gmail.com
Student ID : s002
Prénom : Bob
Nom : Charles
Niveau : CE1-A
Licence : Active jusqu'au 9 décembre 2026 (DEMO-BOB-2025)
```

---

#### **Élève 3 - Chloé Dubois (s003)**

```
Email : rulingplace@gmail.com
Student ID : s003
Prénom : Chloé
Nom : Dubois
Niveau : CE1-A
Licence : Active jusqu'au 9 décembre 2026 (DEMO-CHARLIE-2025)
```

---

#### **Élève 4 - David Emile (s004)**

```
Email : designisland97@gmail.com
Student ID : s004
Prénom : David
Nom : Emile
Niveau : CE1-A
Licence : Active jusqu'au 9 décembre 2026 (DEMO-DIANA-2025)
```

---

## ✅ ÉTAPE SUIVANTE : PROMOUVOIR L'ENSEIGNANT EN ADMIN

### **Dans Supabase Dashboard :**

1. **Va sur :** https://supabase.com/dashboard
2. **Sélectionne** ton projet Crazy Chrono
3. **Menu gauche →** Table Editor
4. **Sélectionne la table →** `user_profiles`
5. **Cherche la ligne** avec `verinmarius971@gmail.com`
6. **Double-clique sur la colonne `role`**
7. **Change** `user` → `admin`
8. **Appuie sur Entrée** pour sauvegarder

**OU via SQL Editor :**

```sql
UPDATE user_profiles 
SET role = 'admin' 
WHERE email = 'verinmarius971@gmail.com';
```

---

## 🎮 PROCÉDURE DE TEST CRAZY ARENA

### **ÉTAPE 1 : L'enseignant crée le match**

1. **Connecte-toi** : `verinmarius971@gmail.com`
2. **Va sur** : `/tournament/setup`
3. **Crée un groupe** avec :
   - s001 (Alice Bertrand - crazy.chrono.contact@gmail.com)
   - s002 (Bob Charles - digyproservices@gmail.com)
   - s003 (Chloé Dubois - rulingplace@gmail.com)
   - s004 (David Emile - designisland97@gmail.com)
4. **Lance le match** → Note le code : `ABC123`

---

### **ÉTAPE 2 : Les 4 élèves rejoignent**

**Ouvre 4 navigateurs/onglets différents :**

**Onglet 1 - Alice :**
1. Connecte-toi : `crazy.chrono.contact@gmail.com`
2. Va sur : `/crazy-arena/lobby/ABC123`

**Onglet 2 - Bob :**
1. Connecte-toi : `digyproservices@gmail.com`
2. Va sur : `/crazy-arena/lobby/ABC123`

**Onglet 3 - Chloé :**
1. Connecte-toi : `rulingplace@gmail.com`
2. Va sur : `/crazy-arena/lobby/ABC123`

**Onglet 4 - David :**
1. Connecte-toi : `designisland97@gmail.com`
2. Va sur : `/crazy-arena/lobby/ABC123`

---

### **ÉTAPE 3 : Le jeu démarre !**

- ✅ Compteur : 4/4 joueurs
- ✅ Countdown : 3...2...1...
- ✅ Redirection vers `/crazy-arena/game`
- ✅ Les 4 jouent simultanément !

---

## 🔐 LICENCES ACTIVES

| Email | Student ID | Licence Key | Valide jusqu'à |
|-------|------------|-------------|----------------|
| crazy.chrono.contact@gmail.com | s001 | DEMO-ALICE-2025 | 9 déc 2026 |
| digyproservices@gmail.com | s002 | DEMO-BOB-2025 | 9 déc 2026 |
| rulingplace@gmail.com | s003 | DEMO-CHARLIE-2025 | 9 déc 2026 |
| designisland97@gmail.com | s004 | DEMO-DIANA-2025 | 9 déc 2026 |
| verinmarius971@gmail.com | N/A | DEMO-PROF-MARIUS-2025 | Illimitée |

---

## 📊 VÉRIFICATION DANS SUPABASE

### **Table `user_student_mapping`**

Tu dois voir :

| user_id | email | student_id | active | notes |
|---------|-------|------------|--------|-------|
| uuid-1 | crazy.chrono.contact@gmail.com | s001 | true | Alice Bertrand |
| uuid-2 | digyproservices@gmail.com | s002 | true | Bob Charles |
| uuid-3 | rulingplace@gmail.com | s003 | true | Chloé Dubois |
| uuid-4 | designisland97@gmail.com | s004 | true | David Emile |

---

### **Table `licenses`**

Tu dois voir :

| license_key | license_type | owner_id | status | valid_until |
|-------------|--------------|----------|--------|-------------|
| DEMO-ALICE-2025 | student | s001 | active | 2026-12-09 |
| DEMO-BOB-2025 | student | s002 | active | 2026-12-09 |
| DEMO-CHARLIE-2025 | student | s003 | active | 2026-12-09 |
| DEMO-DIANA-2025 | student | s004 | active | 2026-12-09 |
| DEMO-PROF-MARIUS-2025 | teacher | uuid-prof | active | NULL |

---

## 🧪 TESTER L'API

### **Récupérer les infos d'un compte élève**

**Connecte-toi avec `crazy.chrono.contact@gmail.com` puis dans la console :**

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
    "email": "crazy.chrono.contact@gmail.com"
  },
  "student": {
    "id": "s001",
    "firstName": "Alice",
    "lastName": "Bertrand",
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

---

## 📝 CHECKLIST AVANT LA DÉMO

**1 semaine avant (15 décembre) :**
- [ ] Tous les comptes testés individuellement
- [ ] Test complet Crazy Arena avec 4 joueurs
- [ ] Vérification des licences dans Supabase
- [ ] Groupe pré-créé (s001, s002, s003, s004)

**1 jour avant (21 décembre) :**
- [ ] Test de bout en bout complet
- [ ] Préparer 4 tablettes/ordinateurs
- [ ] Chaque appareil connecté avec un compte
- [ ] Vider cache navigateur

**Le jour J (22 décembre) :**
- [ ] Arriver 30 min avant
- [ ] Lancer un test rapide (5 min)
- [ ] Créer le groupe et noter le code de salle
- [ ] Attendre le début de la présentation

---

## 🎯 SCÉNARIO DÉMO RECTORAT (10 minutes)

**1. Introduction (1 min)**
> "Crazy Chrono est un outil pédagogique ludique pour les mathématiques et la botanique."

**2. Mode Solo (2 min)**
- Montrer l'interface
- Jouer 1-2 manches rapides

**3. Mode Duel (2 min)**
- Montrer le mode 2 joueurs
- Expliquer la compétition

**4. Mode Tournoi - Crazy Arena (4 min) ⭐**
- Enseignant crée le match sur son écran
- 4 élèves rejoignent sur leurs tablettes
- Partie en direct avec classement temps réel
- Podium avec le gagnant

**5. Conclusion (1 min)**
> "Gamification de l'apprentissage, engagement des élèves, suivi en temps réel."

---

## 🆘 TROUBLESHOOTING

### **Erreur : "No student linked to this account"**

**Solution :** Vérifie que le script `seed_demo_accounts.sql` a bien été exécuté :

```sql
SELECT * FROM user_student_mapping 
WHERE student_id IN ('s001', 's002', 's003', 's004');
```

### **Erreur : "License inactive"**

**Solution :** Vérifie les licences :

```sql
SELECT * FROM licenses 
WHERE owner_id IN ('s001', 's002', 's003', 's004')
AND status = 'active';
```

---

**Dernière mise à jour :** 9 décembre 2025, 7h30  
**Prochaine action :** Exécuter `seed_demo_accounts.sql` dans Supabase
