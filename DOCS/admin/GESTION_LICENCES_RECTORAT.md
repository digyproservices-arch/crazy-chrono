# 🏛️ GESTION LICENCES RECTORAT - GUADELOUPE

**Date:** 2 janvier 2026  
**Contexte:** Inscription massive écoles Guadeloupe après validation Rectorat

---

## 📊 ÉTAT ACTUEL - VISUALISATION

### **1. Vue d'ensemble système**

```sql
-- Nombre total par entité
SELECT 
  (SELECT COUNT(*) FROM schools) as total_ecoles,
  (SELECT COUNT(*) FROM classes) as total_classes,
  (SELECT COUNT(*) FROM students) as total_eleves,
  (SELECT COUNT(*) FROM students WHERE licensed = true) as eleves_licencies,
  (SELECT COUNT(*) FROM teachers) as total_profs;
```

---

### **2. Associations Profs → Classes → Élèves**

```sql
-- Vue complète hiérarchie
SELECT 
  s.name as ecole,
  s.city as ville,
  s.circonscription_id,
  c.name as classe,
  c.level as niveau,
  c.teacher_name as professeur,
  c.teacher_email as email_prof,
  COUNT(st.id) as nb_eleves,
  SUM(CASE WHEN st.licensed = true THEN 1 ELSE 0 END) as nb_licencies
FROM schools s
LEFT JOIN classes c ON c.school_id = s.id
LEFT JOIN students st ON st.class_id = c.id
GROUP BY s.id, s.name, s.city, s.circonscription_id, 
         c.id, c.name, c.level, c.teacher_name, c.teacher_email
ORDER BY s.name, c.name;
```

---

### **3. Détail élèves avec licences par classe**

```sql
-- Élèves d'une classe spécifique avec statut licence
SELECT 
  st.id,
  st.first_name,
  st.last_name,
  st.email,
  st.licensed as licence_active,
  st.level,
  c.name as classe,
  c.teacher_name as professeur,
  s.name as ecole
FROM students st
JOIN classes c ON st.class_id = c.id
JOIN schools s ON st.school_id = s.id
WHERE c.id = 'VOTRE_CLASS_ID'  -- Remplacer par ID classe
ORDER BY st.last_name, st.first_name;
```

---

### **4. Statistiques licences par circonscription**

```sql
-- Vue agrégée par circonscription (Guadeloupe)
SELECT 
  s.circonscription_id,
  COUNT(DISTINCT s.id) as nb_ecoles,
  COUNT(DISTINCT c.id) as nb_classes,
  COUNT(st.id) as nb_eleves_total,
  SUM(CASE WHEN st.licensed = true THEN 1 ELSE 0 END) as nb_licencies,
  ROUND(100.0 * SUM(CASE WHEN st.licensed = true THEN 1 ELSE 0 END) / COUNT(st.id), 2) as taux_licence_pct
FROM schools s
LEFT JOIN classes c ON c.school_id = s.id
LEFT JOIN students st ON st.class_id = c.id
GROUP BY s.circonscription_id
ORDER BY s.circonscription_id;
```

---

### **5. Professeurs sans élèves licenciés (à corriger)**

```sql
-- Identifier classes sans licences actives
SELECT 
  c.id as class_id,
  c.name as classe,
  c.teacher_name as professeur,
  c.teacher_email,
  s.name as ecole,
  COUNT(st.id) as nb_eleves,
  SUM(CASE WHEN st.licensed = true THEN 1 ELSE 0 END) as nb_licencies
FROM classes c
JOIN schools s ON c.school_id = s.id
LEFT JOIN students st ON st.class_id = c.id
GROUP BY c.id, c.name, c.teacher_name, c.teacher_email, s.name
HAVING SUM(CASE WHEN st.licensed = true THEN 1 ELSE 0 END) = 0
   OR SUM(CASE WHEN st.licensed = true THEN 1 ELSE 0 END) IS NULL
ORDER BY s.name, c.name;
```

---

## 🚀 INSCRIPTION MASSIVE - PROCESSUS RECTORAT

### **SCÉNARIO: Toutes les écoles de Guadeloupe**

**Hypothèses:**
- ~200 écoles primaires
- ~1000 classes (CE1, CE2, CM1, CM2)
- ~25 000 élèves
- ~1000 professeurs

---

### **ÉTAPE 1: Préparation fichiers CSV**

Le Rectorat fournit 3 fichiers CSV:

#### **1.1 - `ecoles_guadeloupe.csv`**

```csv
id,name,type,city,circonscription_id,postal_code,email,phone
sch_ptp_001,École Primaire Pointe-à-Pitre Centre,primaire,Pointe-à-Pitre,CIRC_GP_1,97110,ecole.ptp.centre@ac-guadeloupe.fr,0590821234
sch_ptp_002,École Primaire Bergevin,primaire,Pointe-à-Pitre,CIRC_GP_1,97110,ecole.bergevin@ac-guadeloupe.fr,0590825678
sch_ba_001,École Primaire Basse-Terre Centre,primaire,Basse-Terre,CIRC_GP_2,97100,ecole.bt.centre@ac-guadeloupe.fr,0590818888
...
```

**Colonnes:**
- `id`: Identifiant unique école (format: `sch_[ville]_[numero]`)
- `name`: Nom complet école
- `type`: `primaire` ou `college`
- `city`: Commune
- `circonscription_id`: `CIRC_GP_1` à `CIRC_GP_6` (6 circonscriptions Guadeloupe)
- `postal_code`: Code postal
- `email`: Email école
- `phone`: Téléphone

---

#### **1.2 - `classes_guadeloupe.csv`**

```csv
id,school_id,name,level,teacher_name,teacher_email,student_count
cls_ptp_001_ce1a,sch_ptp_001,CE1-A,CE1,Marie Dupont,marie.dupont@ac-guadeloupe.fr,24
cls_ptp_001_ce1b,sch_ptp_001,CE1-B,CE1,Jean Martin,jean.martin@ac-guadeloupe.fr,22
cls_ptp_001_ce2a,sch_ptp_001,CE2-A,CE2,Sophie Bernard,sophie.bernard@ac-guadeloupe.fr,25
...
```

**Colonnes:**
- `id`: Identifiant unique classe (format: `cls_[ecole]_[niveau][section]`)
- `school_id`: Référence école (FK)
- `name`: Nom classe (ex: `CE1-A`)
- `level`: Niveau (`CE1`, `CE2`, `CM1`, `CM2`)
- `teacher_name`: Nom complet professeur
- `teacher_email`: Email professionnel
- `student_count`: Nombre élèves (info)

---

#### **1.3 - `eleves_guadeloupe.csv`**

```csv
id,first_name,last_name,level,class_id,school_id,email,licensed
std_ptp_001_001,Alice,Bertrand,CE1,cls_ptp_001_ce1a,sch_ptp_001,alice.bertrand@eleve.ac-guadeloupe.fr,true
std_ptp_001_002,Bob,Cadet,CE1,cls_ptp_001_ce1a,sch_ptp_001,bob.cadet@eleve.ac-guadeloupe.fr,true
std_ptp_001_003,Chloé,Dupuis,CE1,cls_ptp_001_ce1a,sch_ptp_001,chloe.dupuis@eleve.ac-guadeloupe.fr,true
...
```

**Colonnes:**
- `id`: Identifiant unique élève (format: `std_[ecole]_[numero]`)
- `first_name`: Prénom
- `last_name`: Nom
- `level`: Niveau classe (`CE1`, `CE2`, `CM1`, `CM2`)
- `class_id`: Référence classe (FK)
- `school_id`: Référence école (FK)
- `email`: Email élève (optionnel)
- `licensed`: `true` (tous licenciés par défaut si Rectorat paie)

---

### **ÉTAPE 2: Import CSV via script Node.js**

**Script:** `server/scripts/import_rectorat_csv.js`

```javascript
const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function importSchools(csvPath) {
  console.log('📚 Import écoles...');
  const schools = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => schools.push(row))
      .on('end', async () => {
        const { data, error } = await supabase
          .from('schools')
          .upsert(schools, { onConflict: 'id' });
        
        if (error) {
          console.error('❌ Erreur import écoles:', error);
          reject(error);
        } else {
          console.log(`✅ ${schools.length} écoles importées`);
          resolve(data);
        }
      });
  });
}

async function importClasses(csvPath) {
  console.log('📖 Import classes...');
  const classes = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        classes.push({
          ...row,
          student_count: parseInt(row.student_count) || 0
        });
      })
      .on('end', async () => {
        const { data, error } = await supabase
          .from('classes')
          .upsert(classes, { onConflict: 'id' });
        
        if (error) {
          console.error('❌ Erreur import classes:', error);
          reject(error);
        } else {
          console.log(`✅ ${classes.length} classes importées`);
          resolve(data);
        }
      });
  });
}

async function importStudents(csvPath) {
  console.log('👥 Import élèves...');
  const students = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        students.push({
          ...row,
          full_name: `${row.first_name} ${row.last_name.charAt(0)}.`,
          licensed: row.licensed === 'true',
          avatar_url: '/avatars/default.png'
        });
      })
      .on('end', async () => {
        // Import par batch de 1000 (limite Supabase)
        const batchSize = 1000;
        let imported = 0;
        
        for (let i = 0; i < students.length; i += batchSize) {
          const batch = students.slice(i, i + batchSize);
          
          const { data, error } = await supabase
            .from('students')
            .upsert(batch, { onConflict: 'id' });
          
          if (error) {
            console.error(`❌ Erreur batch ${i}-${i + batchSize}:`, error);
          } else {
            imported += batch.length;
            console.log(`✅ ${imported}/${students.length} élèves importés`);
          }
        }
        
        resolve({ total: students.length, imported });
      });
  });
}

async function main() {
  console.log('🏛️ IMPORT RECTORAT GUADELOUPE');
  console.log('================================\n');
  
  try {
    // 1. Écoles
    await importSchools('./data/ecoles_guadeloupe.csv');
    
    // 2. Classes
    await importClasses('./data/classes_guadeloupe.csv');
    
    // 3. Élèves (avec batch processing)
    await importStudents('./data/eleves_guadeloupe.csv');
    
    console.log('\n✅ IMPORT TERMINÉ AVEC SUCCÈS');
    console.log('Vérifiez Supabase Dashboard pour confirmation');
    
  } catch (error) {
    console.error('\n❌ ÉCHEC IMPORT:', error);
    process.exit(1);
  }
}

main();
```

---

### **ÉTAPE 3: Exécution import**

```bash
# Installation dépendances
cd server
npm install csv-parser

# Placer fichiers CSV dans server/data/
# - ecoles_guadeloupe.csv
# - classes_guadeloupe.csv
# - eleves_guadeloupe.csv

# Exécuter import
node scripts/import_rectorat_csv.js
```

**Durée estimée:**
- Écoles (200): ~5 secondes
- Classes (1000): ~30 secondes
- Élèves (25 000): ~5 minutes (batches de 1000)

**Total:** ~6 minutes pour toute la Guadeloupe

---

### **ÉTAPE 4: Vérification post-import**

```sql
-- 1. Compter entités importées
SELECT 
  (SELECT COUNT(*) FROM schools WHERE city LIKE '%Guadeloupe%') as ecoles,
  (SELECT COUNT(*) FROM classes WHERE school_id LIKE 'sch_%') as classes,
  (SELECT COUNT(*) FROM students WHERE licensed = true) as eleves_licencies;

-- 2. Vérifier intégrité référentielle
SELECT 
  COUNT(*) as classes_orphelines
FROM classes 
WHERE school_id NOT IN (SELECT id FROM schools);

SELECT 
  COUNT(*) as eleves_sans_classe
FROM students 
WHERE class_id NOT IN (SELECT id FROM classes);

-- 3. Statistiques par circonscription
SELECT 
  s.circonscription_id,
  COUNT(DISTINCT s.id) as nb_ecoles,
  COUNT(DISTINCT c.id) as nb_classes,
  SUM(c.student_count) as nb_eleves_declares,
  COUNT(st.id) as nb_eleves_reels
FROM schools s
LEFT JOIN classes c ON c.school_id = s.id
LEFT JOIN students st ON st.class_id = c.id
GROUP BY s.circonscription_id
ORDER BY s.circonscription_id;
```

---

## 🎯 ACTIVATION LICENCES EN MASSE

### **Scénario 1: Activer toutes les licences après paiement Rectorat**

```sql
-- Activer licences pour tous les élèves de Guadeloupe
UPDATE students
SET licensed = true
WHERE school_id IN (
  SELECT id FROM schools 
  WHERE circonscription_id LIKE 'CIRC_GP_%'
);

-- Vérifier
SELECT 
  COUNT(*) as total_eleves,
  SUM(CASE WHEN licensed = true THEN 1 ELSE 0 END) as licencies,
  ROUND(100.0 * SUM(CASE WHEN licensed = true THEN 1 ELSE 0 END) / COUNT(*), 2) as taux_pct
FROM students
WHERE school_id IN (
  SELECT id FROM schools 
  WHERE circonscription_id LIKE 'CIRC_GP_%'
);
```

---

### **Scénario 2: Activer licences pour une école spécifique**

```sql
-- Activer licences école Pointe-à-Pitre Centre
UPDATE students
SET licensed = true
WHERE school_id = 'sch_ptp_001';

-- Vérifier
SELECT 
  st.id,
  st.first_name,
  st.last_name,
  st.licensed,
  c.name as classe
FROM students st
JOIN classes c ON st.class_id = c.id
WHERE st.school_id = 'sch_ptp_001'
ORDER BY c.name, st.last_name;
```

---

### **Scénario 3: Activer licences pour une classe spécifique**

```sql
-- Activer licences classe CE1-A
UPDATE students
SET licensed = true
WHERE class_id = 'cls_ptp_001_ce1a';

-- Vérifier
SELECT * FROM students 
WHERE class_id = 'cls_ptp_001_ce1a'
ORDER BY last_name;
```

---

## 📧 CRÉATION COMPTES UTILISATEURS (Auth Supabase)

### **Processus recommandé:**

**Option 1: Création manuelle (petites écoles)**
- Professeurs créent leurs comptes via `/signup`
- Admin lie comptes → élèves via `user_student_mapping`

**Option 2: Création automatique (grande échelle)**

```javascript
// Script: server/scripts/create_auth_accounts.js
const { createClient } = require('@supabase/supabase-js');

async function createStudentAccounts() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  // Récupérer élèves avec email
  const { data: students } = await supabase
    .from('students')
    .select('*')
    .not('email', 'is', null)
    .eq('licensed', true);
  
  console.log(`📧 Création comptes pour ${students.length} élèves`);
  
  for (const student of students) {
    try {
      // Créer compte Auth
      const { data: user, error } = await supabase.auth.admin.createUser({
        email: student.email,
        password: generatePassword(), // Mot de passe temporaire
        email_confirm: true,
        user_metadata: {
          role: 'student',
          student_id: student.id,
          full_name: student.full_name
        }
      });
      
      if (error) {
        console.error(`❌ ${student.email}:`, error.message);
        continue;
      }
      
      // Lier compte → élève
      await supabase.from('user_student_mapping').insert({
        user_id: user.id,
        student_id: student.id,
        linked_by: 'rectorat_import',
        active: true
      });
      
      console.log(`✅ ${student.email}`);
      
    } catch (err) {
      console.error(`❌ ${student.email}:`, err);
    }
  }
}

function generatePassword() {
  // Mot de passe temporaire aléatoire
  return Math.random().toString(36).slice(-10) + 'Aa1!';
}

createStudentAccounts();
```

---

## 🎓 INTERFACE ADMIN RECTORAT (UI)

### **Dashboard d'administration**

**Route:** `/admin/rectorat/licences`

**Fonctionnalités:**

1. **Vue d'ensemble**
   - Graphiques: Écoles, Classes, Élèves, Licences
   - Carte Guadeloupe avec répartition

2. **Import CSV**
   - Upload fichiers CSV
   - Validation avant import
   - Progress bar temps réel
   - Rapport erreurs

3. **Gestion licences**
   - Activation/désactivation en masse
   - Filtres: Circonscription, École, Classe
   - Export rapport Excel

4. **Tableau de bord**
   - Liste écoles avec statut
   - Liste classes avec taux licences
   - Recherche élèves

---

## ⚠️ BONNES PRATIQUES

### **1. Sauvegarde avant import**

```sql
-- Exporter données actuelles
COPY schools TO '/backup/schools_backup.csv' CSV HEADER;
COPY classes TO '/backup/classes_backup.csv' CSV HEADER;
COPY students TO '/backup/students_backup.csv' CSV HEADER;
```

### **2. Import en environnement test d'abord**

- Tester script sur Supabase projet test
- Vérifier intégrité données
- Valider avec petit échantillon (10 écoles)
- Ensuite production

### **3. Monitoring post-import**

```sql
-- Vérifier doublons
SELECT email, COUNT(*) 
FROM students 
WHERE email IS NOT NULL
GROUP BY email 
HAVING COUNT(*) > 1;

-- Vérifier classes sans élèves
SELECT c.id, c.name, COUNT(st.id) as nb_eleves
FROM classes c
LEFT JOIN students st ON st.class_id = c.id
GROUP BY c.id, c.name
HAVING COUNT(st.id) = 0;
```

---

## 📞 CONTACT SUPPORT

**En cas de problème lors de l'import:**

1. Vérifier logs script Node.js
2. Vérifier Supabase Dashboard → Logs
3. Exécuter requêtes SQL vérification
4. Contacter support technique avec:
   - Logs erreurs
   - Nombre lignes CSV
   - Résultat requêtes vérification

---

## ✅ CHECKLIST DÉPLOIEMENT RECTORAT

- [ ] Fichiers CSV préparés (écoles, classes, élèves)
- [ ] Script `import_rectorat_csv.js` testé en local
- [ ] Environnement test Supabase validé
- [ ] Sauvegarde BDD production effectuée
- [ ] Import production exécuté avec succès
- [ ] Vérifications intégrité passées
- [ ] Licences activées en masse
- [ ] Comptes Auth créés (si Option 2)
- [ ] Email envoyé aux professeurs
- [ ] Dashboard Rectorat accessible
- [ ] Tests Mode Entraînement validés
- [ ] Tests Mode Tournoi validés
- [ ] Documentation remise au Rectorat

---

**Prêt pour déploiement à grande échelle Guadeloupe** 🚀
