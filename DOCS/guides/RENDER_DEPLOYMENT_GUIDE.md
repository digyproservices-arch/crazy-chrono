# 🚀 Guide Déploiement Render - Crazy Chrono Backend

## ✅ Configuration Variables d'Environnement sur Render

### **Étape 1 : Accéder aux variables d'environnement**

1. Va sur https://dashboard.render.com
2. Sélectionne ton service **crazy-chrono-backend**
3. Va dans **"Environment"** (menu gauche)
4. Clique sur **"Add Environment Variable"**

---

### **Étape 2 : Ajouter les variables Supabase**

**Ajoute ces 2 variables (TRÈS IMPORTANT) :**

#### **Variable 1 : SUPABASE_URL**
- **Key** : `SUPABASE_URL`
- **Value** : `https://votre-projet.supabase.co` (copie depuis Supabase)

#### **Variable 2 : SUPABASE_SERVICE_ROLE_KEY**
- **Key** : `SUPABASE_SERVICE_ROLE_KEY`
- **Value** : Ta clé secrète service_role (copie depuis Supabase → API → Legacy keys)

#### **Variable 3 : FRONTEND_URL**
- **Key** : `FRONTEND_URL`
- **Value** : `https://app.crazy-chrono.com`

---

### **Étape 3 : Sauvegarder et redémarrer**

1. Clique **"Save Changes"**
2. Render va **redémarrer automatiquement** le service
3. Attends 2-3 minutes

---

## 🔍 Vérification

Une fois redémarré, teste :

```
https://votre-backend.onrender.com/api/tournament/students
```

Tu devrais voir la liste des 14 élèves en JSON.

---

## ⚠️ SI ÇA NE MARCHE PAS

### **Vérifie les logs Render :**

1. Dashboard Render → Ton service
2. Onglet **"Logs"**
3. Cherche les erreurs comme :
   - `Supabase admin not configured`
   - `Cannot find module`
   - `Error connecting to database`

---

## 📊 Vérifier la base de données

**IMPORTANT :** Le schéma SQL doit être installé sur la **MÊME base Supabase** que celle configurée dans les variables d'environnement.

Si tu as installé le schéma sur un projet Supabase de **développement** mais que tes variables pointent vers un projet de **production**, les élèves ne seront pas là !

### **Pour vérifier :**

1. Va sur https://supabase.com
2. Ouvre le projet dont l'URL correspond à `SUPABASE_URL` sur Render
3. Va dans **Table Editor**
4. Vérifie que la table `students` existe et contient 14 lignes

---

## 🎯 Checklist rapide

- [ ] Variables d'environnement ajoutées sur Render
- [ ] Service Render redémarré
- [ ] Schéma SQL installé sur la bonne BDD Supabase
- [ ] Table `students` contient 14 élèves
- [ ] Backend accessible via https://votre-backend.onrender.com/health

---

**Une fois que tout est vert, actualise https://app.crazy-chrono.com/ et la liste devrait apparaître !** 🎉
