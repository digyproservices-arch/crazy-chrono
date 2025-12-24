# 🎓 COMPTES POUR DÉMO RECTORAT - 22 DÉCEMBRE 2025

**Date de création :** 8 décembre 2025  
**Objectif :** Comptes réels pour tester et démontrer Crazy Arena

---

## 👨‍🏫 COMPTE ENSEIGNANT

### **Informations de connexion**

```
Email     : prof.demo@crazy-chrono.com
Mot de passe : CrazyProf2025!
Prénom    : Marie
Nom       : VERIN
Rôle      : admin
```

**Utilisation :**
- Accès à `/tournament/setup`
- Création de groupes de 4 élèves
- Lancement des matchs Crazy Arena
- Dashboard enseignant (à venir)

---

## 👨‍🎓 COMPTES ÉLÈVES (4 joueurs)

### **Élève 1 - Alice**

```
Email     : alice.demo@crazy-chrono.com
Mot de passe : CrazyAlice2025!
Prénom    : Alice
Nom       : MARTIN
Student ID: s001
```

---

### **Élève 2 - Bob**

```
Email     : bob.demo@crazy-chrono.com
Mot de passe : CrazyBob2025!
Prénom    : Bob
Nom       : DUBOIS
Student ID: s002
```

---

### **Élève 3 - Charlie**

```
Email     : charlie.demo@crazy-chrono.com
Mot de passe : CrazyCharlie2025!
Prénom    : Charlie
Nom       : MOREAU
Student ID: s003
```

---

### **Élève 4 - Diana**

```
Email     : diana.demo@crazy-chrono.com
Mot de passe : CrazyDiana2025!
Prénom    : Diana
Nom       : BERNARD
Student ID: s004
```

---

## 🔧 PROCÉDURE DE CRÉATION

### **ÉTAPE 1 : Créer le compte enseignant**

1. **Va sur :** `http://localhost:3000/login` (ou `https://app.crazy-chrono.com/login`)
2. **Clique sur :** "Créer un compte"
3. **Remplis :**
   - Prénom : `Marie`
   - Nom : `VERIN`
   - Email : `prof.demo@crazy-chrono.com`
   - Mot de passe : `CrazyProf2025!`
   - Confirmation : `CrazyProf2025!`
4. **Clique :** "Valider l'inscription"
5. **Vérifie ton email** et clique sur le lien de confirmation

**⚠️ IMPORTANT : Promouvoir en admin (voir ÉTAPE 3)**

---

### **ÉTAPE 2 : Créer les 4 comptes élèves**

**Répéter pour chaque élève :**

1. **Va sur :** `http://localhost:3000/login`
2. **Clique sur :** "Créer un compte"
3. **Remplis les infos** (voir ci-dessus)
4. **Clique :** "Valider l'inscription"
5. **Vérifie l'email** et confirme

**Ordre recommandé :**
1. Alice → `alice.demo@crazy-chrono.com`
2. Bob → `bob.demo@crazy-chrono.com`
3. Charlie → `charlie.demo@crazy-chrono.com`
4. Diana → `diana.demo@crazy-chrono.com`

---

### **ÉTAPE 3 : Promouvoir l'enseignant en admin**

**Option A : Via Supabase Dashboard (RECOMMANDÉ)**

1. **Va sur :** https://supabase.com/dashboard
2. **Sélectionne ton projet** Crazy Chrono
3. **Va dans :** Table Editor → `user_profiles`
4. **Trouve la ligne** avec email `prof.demo@crazy-chrono.com`
5. **Modifie le champ `role`** : `user` → `admin`
6. **Sauvegarde**

**Option B : Via SQL (plus rapide)**

Dans l'éditeur SQL de Supabase :

```sql
-- Promouvoir prof.demo en admin
UPDATE user_profiles 
SET role = 'admin' 
WHERE email = 'prof.demo@crazy-chrono.com';
```

**Option C : Via API (si tu as déjà un admin)**

Dans la console du navigateur (connecté avec un compte admin) :

```javascript
fetch('http://localhost:4000/admin/users/role', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem('cc_auth')).token
  },
  body: JSON.stringify({
    target_email: 'prof.demo@crazy-chrono.com',
    role: 'admin'
  })
}).then(r => r.json()).then(d => console.log('✅ Promu en admin:', d));
```

---

## 🧪 PROCÉDURE DE TEST COMPLÈTE

### **Test 1 : Connexion enseignant**

1. **Va sur :** `http://localhost:3000/login`
2. **Connecte-toi avec :** `prof.demo@crazy-chrono.com` / `CrazyProf2025!`
3. **Vérifie :** Redirection vers `/modes`
4. **Va sur :** `/tournament/setup`
5. **Vérifie :** Accès autorisé (liste des élèves visible)

---

### **Test 2 : Créer un groupe et lancer un match**

1. **Sur `/tournament/setup` :**
2. **Clique :** "Créer un groupe"
3. **Sélectionne 4 élèves :**
   - s001 (Alice MARTIN)
   - s002 (Bob DUBOIS)
   - s003 (Charlie MOREAU)
   - s004 (Diana BERNARD)
4. **Clique :** "Valider"
5. **Clique :** "Lancer le match" sur le groupe créé
6. **Note le code de salle :** (ex: `ABC123`)

---

### **Test 3 : 4 élèves rejoignent le lobby**

**Ouvre 4 navigateurs/onglets différents :**

**Navigateur 1 - Alice :**
1. Va sur : `http://localhost:3000/login`
2. Connecte-toi : `alice.demo@crazy-chrono.com` / `CrazyAlice2025!`
3. Va sur : `http://localhost:3000/crazy-arena/lobby/ABC123`

**Navigateur 2 - Bob :**
1. Va sur : `http://localhost:3000/login`
2. Connecte-toi : `bob.demo@crazy-chrono.com` / `CrazyBob2025!`
3. Va sur : `http://localhost:3000/crazy-arena/lobby/ABC123`

**Navigateur 3 - Charlie :**
1. Va sur : `http://localhost:3000/login`
2. Connecte-toi : `charlie.demo@crazy-chrono.com` / `CrazyCharlie2025!`
3. Va sur : `http://localhost:3000/crazy-arena/lobby/ABC123`

**Navigateur 4 - Diana :**
1. Va sur : `http://localhost:3000/login`
2. Connecte-toi : `diana.demo@crazy-chrono.com` / `CrazyDiana2025!`
3. Va sur : `http://localhost:3000/crazy-arena/lobby/ABC123`

**Résultat attendu :**
- ✅ Compteur affiche "4/4 joueurs"
- ✅ Countdown automatique (3...2...1...)
- ✅ Redirection vers `/crazy-arena/game` pour tous

---

### **Test 4 : Jouer une partie**

**Dans chaque navigateur :**
1. **Clique sur 2 zones** pour valider une paire
2. **Vérifie :** Score se met à jour en temps réel
3. **Vérifie :** Classement se met à jour
4. **Attends :** Fin du timer (60s)
5. **Vérifie :** Podium s'affiche avec le gagnant

---

## 📊 SCÉNARIO DE DÉMO POUR LE RECTORAT

### **Configuration recommandée**

**Matériel :**
- 1 ordinateur enseignant (grand écran ou vidéoprojecteur)
- 4 tablettes/ordinateurs élèves

**Préparation (5 minutes avant) :**
1. ✅ Tous les comptes créés et testés
2. ✅ 4 appareils connectés aux comptes élèves
3. ✅ Ordinateur enseignant connecté
4. ✅ Groupe de 4 élèves déjà créé dans `/tournament/setup`

---

### **Déroulé de la démo (10 minutes)**

**1. Introduction (1 min)**
> "Bonjour, je vais vous présenter Crazy Chrono, un outil pédagogique ludique pour l'apprentissage des mathématiques et de la botanique."

**2. Mode Solo - Crazy Solo (2 min)**
- Montrer l'interface
- Jouer 1-2 manches rapides
- Expliquer les paires (calculs-chiffres, images-textes)

**3. Mode Duel - Crazy Duel (2 min)**
- Montrer le mode 2 joueurs
- Expliquer la compétition

**4. Mode Tournoi - Crazy Arena (4 min) ⭐**

**Étape A : Enseignant crée le match**
- Aller sur `/tournament/setup`
- Montrer la liste des élèves
- Cliquer "Lancer le match" sur le groupe préparé
- Afficher le code de salle

**Étape B : Élèves rejoignent**
- Les 4 tablettes sont déjà sur `/crazy-arena/lobby/ABC123`
- Montrer le compteur "4/4 joueurs"
- Countdown automatique

**Étape C : Partie en direct**
- Les 4 élèves jouent simultanément
- Montrer le classement en temps réel sur l'écran enseignant
- Commenter l'action : "Alice vient de trouver une paire !"
- Fin de partie : podium avec le gagnant

**5. Conclusion (1 min)**
> "Cet outil permet de gamifier l'apprentissage, d'engager les élèves, et de suivre leur progression en temps réel."

---

## 🔐 SÉCURITÉ DES COMPTES

**Mots de passe conformes :**
- ✅ 8+ caractères
- ✅ Majuscule + minuscule
- ✅ Chiffre
- ✅ Caractère spécial (!)

**Format :** `Crazy[Nom]2025!`

**⚠️ IMPORTANT :**
- Ces comptes sont pour la DÉMO uniquement
- Ne pas utiliser en production réelle
- Changer les mots de passe après la présentation

---

## 📝 CHECKLIST AVANT LA PRÉSENTATION

**1 semaine avant (Lun 15/12) :**
- [ ] Tous les comptes créés
- [ ] Comptes testés en local
- [ ] Comptes testés en production (Vercel)
- [ ] Groupe de 4 élèves pré-créé

**1 jour avant (Sam 21/12) :**
- [ ] Test complet de bout en bout
- [ ] Vérifier que tous les comptes fonctionnent
- [ ] Préparer 4 tablettes/ordinateurs
- [ ] Vider le cache navigateur de chaque appareil

**Le jour J (Lun 22/12) :**
- [ ] Arriver 30 min avant
- [ ] Connecter les 4 appareils élèves
- [ ] Lancer un test rapide (5 min)
- [ ] Créer le groupe et noter le code de salle
- [ ] Ouvrir la page lobby sur les 4 appareils (NE PAS REJOINDRE ENCORE)
- [ ] Attendre le début de la présentation

---

## 🆘 TROUBLESHOOTING

### **Problème : Email de confirmation non reçu**

**Solution :**
1. Vérifier les spams
2. Attendre 2-3 minutes
3. Cliquer "Renvoyer email de confirmation" sur la page login

### **Problème : Compte non admin**

**Solution :**
1. Aller sur Supabase Dashboard
2. Table `user_profiles`
3. Modifier `role` → `admin`

### **Problème : Élève ne peut pas rejoindre le lobby**

**Solution :**
1. Vérifier que le match est bien créé
2. Vérifier le code de salle
3. Vérifier que l'élève est connecté

### **Problème : Jeu ne démarre pas**

**Solution :**
1. Vérifier que 4 joueurs sont connectés
2. Rafraîchir la page
3. Re-créer le match

---

## 📞 CONTACTS URGENTS

**Créateur :** Marie VERIN  
**Email support :** ma.verin@example.com  
**Backup admin :** (à définir)

---

## 📅 HISTORIQUE

| Date | Action | Statut |
|------|--------|--------|
| 8 déc 2025 | Création du document | ✅ |
| 8 déc 2025 | Création des 5 comptes | ⏳ À faire |
| 15 déc 2025 | Test complet en prod | ⏳ Planifié |
| 21 déc 2025 | Répétition générale | ⏳ Planifié |
| 22 déc 2025 | Présentation Rectorat | 🎯 |

---

**Dernière mise à jour :** 8 décembre 2025, 14h30  
**Prochaine action :** Créer les 5 comptes
