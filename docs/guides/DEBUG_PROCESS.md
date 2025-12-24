# 🔍 PROCESSUS DE DÉBOGAGE SYSTÉMATIQUE
*Guide pour résoudre les bugs efficacement et éviter de perdre du temps*

---

## 📋 RÈGLE D'OR : TOUJOURS SUIVRE CET ORDRE

```
1. REPRODUIRE LE BUG EN LOCAL
2. IDENTIFIER LA CAUSE RACINE
3. CHERCHER TOUS LES USAGES
4. CRÉER UN HELPER SI BESOIN
5. TESTER LOCALEMENT
6. DÉPLOYER
```

---

## 🚨 ÉTAPE 1 : REPRODUIRE LE BUG EN LOCAL

### ⚠️ NE JAMAIS debugger en production !

**Commandes à exécuter :**

```bash
# 1. S'assurer d'avoir le dernier code
git pull origin main

# 2. Installer les dépendances
npm install

# 3. Lancer l'application en local
npm start

# 4. Ouvrir la console navigateur (F12)
# 5. Reproduire le bug
```

### ✅ Checklist :
- [ ] Le bug se reproduit en local ?
- [ ] J'ai la console ouverte (F12) ?
- [ ] J'ai noté le message d'erreur EXACT ?
- [ ] J'ai noté la ligne de code qui plante ?

---

## 🔍 ÉTAPE 2 : IDENTIFIER LA CAUSE RACINE

### A. Lire l'erreur COMPLÈTE

**Exemple d'erreur :**
```
Uncaught SyntaxError: Unexpected token 's', "s001,s002,s003,s004" is not valid JSON
  at JSON.parse (<anonymous>)
  at BattleRoyaleSetup.js:390
```

**Questions à se poser :**
1. ✅ Quelle fonction plante ? → `JSON.parse`
2. ✅ Quelle donnée cause le problème ? → `"s001,s002,s003,s004"` (string avec virgules)
3. ✅ Quel format est attendu ? → JSON array `["s001","s002","s003","s004"]`
4. ✅ Dans quel fichier ? → `BattleRoyaleSetup.js` ligne 390

### B. Ajouter des logs de débogage

```javascript
// ❌ AVANT (pas de visibilité)
const ids = JSON.parse(group.student_ids);

// ✅ APRÈS (logs temporaires)
console.log('[DEBUG] student_ids brut:', group.student_ids);
console.log('[DEBUG] Type:', typeof group.student_ids);
console.log('[DEBUG] Est un array?', Array.isArray(group.student_ids));

const ids = JSON.parse(group.student_ids);
```

### C. Vérifier les données côté backend

```bash
# Tester l'API directement
curl https://crazy-chrono-backend.onrender.com/api/tournament/classes/ce1_a_lamentin/groups

# Ou dans le navigateur
fetch('https://crazy-chrono-backend.onrender.com/api/tournament/classes/ce1_a_lamentin/groups')
  .then(r => r.json())
  .then(d => console.log('Backend data:', d))
```

### ✅ Checklist :
- [ ] Je comprends POURQUOI ça plante ?
- [ ] Je connais le format des données (backend vs frontend) ?
- [ ] J'ai identifié la ligne EXACTE du problème ?

---

## 🔎 ÉTAPE 3 : CHERCHER TOUS LES USAGES

### ⚠️ RÈGLE CRITIQUE : Ne jamais fixer qu'UN SEUL endroit !

**Commandes à exécuter :**

```bash
# 1. Chercher TOUS les usages de la fonction problématique
grep -rn "JSON.parse" src/

# 2. Chercher TOUS les usages de la variable problématique
grep -rn "student_ids" src/

# 3. Lister tous les fichiers qui utilisent cette donnée
grep -rl "student_ids" src/
```

**Exemple de résultat :**
```
src/components/Tournament/BattleRoyaleSetup.js:224:  studentIds: JSON.parse(group.student_ids)
src/components/Tournament/BattleRoyaleSetup.js:268:  ids = JSON.parse(g.student_ids);
src/components/Tournament/BattleRoyaleSetup.js:390:  const studentIds = JSON.parse(group.student_ids);
```

**➡️ 3 endroits à fixer !**

### ✅ Checklist :
- [ ] J'ai cherché TOUS les usages avec `grep` ?
- [ ] J'ai noté TOUS les fichiers et lignes à modifier ?
- [ ] Je sais combien d'endroits à fixer ? (noter le nombre : _____ )

---

## 🛠️ ÉTAPE 4 : CRÉER UN HELPER SI BESOIN

### Quand créer un helper ?

**Créer un helper SI :**
- ✅ Le même code est dupliqué à 2+ endroits
- ✅ Les données peuvent avoir plusieurs formats
- ✅ Il y a des vérifications/validations à faire
- ✅ Le code est complexe (plus de 3 lignes)

### Template d'un bon helper

```javascript
/**
 * Parse student_ids qui peut être dans 3 formats :
 * - Array natif : ["s001", "s002"]
 * - String JSON : '["s001","s002"]'
 * - String CSV : "s001,s002,s003"
 * 
 * @param {Array|string} studentIds - Les IDs dans n'importe quel format
 * @returns {Array<string>} - Toujours un array de strings
 */
const parseStudentIds = (studentIds) => {
  try {
    // Cas 1 : Déjà un array
    if (Array.isArray(studentIds)) {
      return studentIds;
    }
    
    // Cas 2 : String
    if (typeof studentIds === 'string') {
      // Cas 2a : JSON array
      if (studentIds.startsWith('[')) {
        return JSON.parse(studentIds);
      }
      // Cas 2b : CSV
      else {
        return studentIds.split(',').map(id => id.trim()).filter(id => id);
      }
    }
    
    // Cas 3 : Format inconnu
    console.warn('[parseStudentIds] Format inconnu:', typeof studentIds, studentIds);
    return [];
    
  } catch (err) {
    console.error('[parseStudentIds] Erreur de parsing:', studentIds, err);
    return [];
  }
};
```

### Où placer le helper ?

```javascript
// Option 1 : Dans le même fichier (si utilisé qu'ici)
// Placer AVANT le composant, APRÈS les imports

import React from 'react';

const parseStudentIds = (studentIds) => { /* ... */ };

export default function BattleRoyaleSetup() { /* ... */ }
```

```javascript
// Option 2 : Dans un fichier utils/ (si utilisé dans plusieurs fichiers)
// Fichier : src/utils/tournamentHelpers.js

export const parseStudentIds = (studentIds) => { /* ... */ };
export const parseGroupData = (groupData) => { /* ... */ };
```

### ✅ Checklist :
- [ ] J'ai créé un helper avec un nom clair ?
- [ ] Le helper gère TOUS les formats possibles ?
- [ ] Le helper a un try/catch pour éviter les plantages ?
- [ ] Le helper a des logs d'erreur explicites ?
- [ ] J'ai remplacé TOUS les usages directs par le helper ?

---

## 🧪 ÉTAPE 5 : TESTER LOCALEMENT

### A. Tests manuels

```bash
# 1. Relancer l'app
npm start

# 2. Ouvrir la console (F12)

# 3. Tester TOUS les scénarios
```

**Checklist de test :**
- [ ] Le bug initial est résolu ?
- [ ] Aucune erreur dans la console ?
- [ ] Tester avec données format 1 (array)
- [ ] Tester avec données format 2 (JSON string)
- [ ] Tester avec données format 3 (CSV string)
- [ ] Tester avec données vides/nulles
- [ ] Les fonctionnalités marchent comme avant ?

### B. Vérifier les logs

**Console doit montrer :**
```
✅ [BattleRoyale] Chargement des données...
✅ [BattleRoyale] Students count: 14
✅ [BattleRoyale] Groups count: 3
✅ Pas d'erreur rouge
```

### C. Tester les cas limites

```javascript
// Dans la console navigateur
const testCases = [
  { input: ["s001", "s002"], expected: ["s001", "s002"] },
  { input: '["s001","s002"]', expected: ["s001", "s002"] },
  { input: "s001,s002,s003", expected: ["s001", "s002", "s003"] },
  { input: "", expected: [] },
  { input: null, expected: [] },
  { input: undefined, expected: [] }
];

testCases.forEach(test => {
  const result = parseStudentIds(test.input);
  console.log('Input:', test.input, '→ Result:', result, '→ OK?', JSON.stringify(result) === JSON.stringify(test.expected));
});
```

### ✅ Checklist :
- [ ] Tous les tests manuels passent ?
- [ ] Aucune erreur dans la console ?
- [ ] Les cas limites sont gérés ?
- [ ] J'ai testé au moins 5 minutes sans problème ?

---

## 🚀 ÉTAPE 6 : DÉPLOYER

### A. Commit avec message explicite

```bash
# 1. Vérifier les fichiers modifiés
git status

# 2. Ajouter les fichiers
git add .

# 3. Commit avec message CLAIR
git commit -m "fix(CRITICAL): Replace ALL JSON.parse(student_ids) with parseStudentIds helper

- Created parseStudentIds helper to handle 3 formats: array, JSON string, CSV string
- Fixed line 224: launch match
- Fixed line 268: studentsInGroups useMemo
- Fixed line 390: groups display
- Tested locally with all data formats
- No more JSON parse errors"

# 4. Push
git push origin main
```

### B. Vérifier le déploiement

**Vercel :**
1. Va sur https://vercel.com/verins-projects/crazy-chrono/deployments
2. Attends que le déploiement soit "Ready" (2-3 minutes)
3. Note le commit hash

**Render (backend) :**
1. Va sur https://dashboard.render.com/web/srv-ctbmr6u8ii6s73bhrku0
2. Vérifie que le déploiement est "Live"

### C. Tester en production

**Mode incognito obligatoire (Ctrl + Shift + N) :**

```javascript
// 1. Vérifier le bundle chargé
document.querySelector('script[src*="main"]').src

// 2. Tester la fonctionnalité
// 3. Vérifier la console
```

### ✅ Checklist :
- [ ] Le commit a un message clair et détaillé ?
- [ ] Vercel a déployé (status "Ready") ?
- [ ] Testé en production en mode incognito ?
- [ ] Le bug est résolu en production ?
- [ ] Aucune régression (tout fonctionne comme avant) ?

---

## 📚 HELPERS COURANTS À CRÉER

### 1. Parsing de données

```javascript
// src/utils/dataHelpers.js

export const parseStudentIds = (studentIds) => { /* voir template ci-dessus */ };

export const parseGroupData = (groupData) => {
  try {
    if (!groupData) return null;
    return {
      id: groupData.id || '',
      name: groupData.name || 'Sans nom',
      student_ids: parseStudentIds(groupData.student_ids),
      status: groupData.status || 'pending'
    };
  } catch (err) {
    console.error('[parseGroupData] Erreur:', err);
    return null;
  }
};

export const parseDate = (dateInput) => {
  try {
    if (dateInput instanceof Date) return dateInput;
    if (typeof dateInput === 'string') return new Date(dateInput);
    if (typeof dateInput === 'number') return new Date(dateInput);
    return null;
  } catch (err) {
    console.error('[parseDate] Erreur:', err);
    return null;
  }
};
```

### 2. Validation de données

```javascript
// src/utils/validators.js

export const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidStudentId = (id) => {
  return /^s\d{3,}$/.test(id); // Format: s001, s002, etc.
};

export const isValidGroupSize = (students, minSize = 2, maxSize = 4) => {
  return students.length >= minSize && students.length <= maxSize;
};
```

### 3. Helpers d'API

```javascript
// src/utils/apiHelpers.js

export const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

export const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

export const apiCall = async (endpoint, options = {}) => {
  try {
    const baseUrl = getBackendUrl();
    const url = `${baseUrl}${endpoint}`;
    
    console.log(`[API] ${options.method || 'GET'} ${url}`);
    
    const response = await fetchWithTimeout(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (err) {
    console.error(`[API] Erreur sur ${endpoint}:`, err);
    throw err;
  }
};
```

---

## 🎯 COMMANDES DE DÉBOGAGE RAPIDE

### Vérifier le code local

```bash
# Chercher un pattern dans tout le code
grep -rn "PATTERN" src/

# Chercher seulement dans les fichiers JS
grep -rn "PATTERN" src/ --include="*.js"

# Chercher en ignorant la casse
grep -rin "pattern" src/

# Lister les fichiers contenant le pattern
grep -rl "PATTERN" src/

# Compter les occurrences
grep -rc "PATTERN" src/
```

### Vérifier Git

```bash
# Voir les derniers commits
git log --oneline -10

# Voir les fichiers modifiés
git status

# Voir les différences
git diff

# Voir un fichier à un commit précis
git show COMMIT_HASH:path/to/file.js

# Annuler les modifications locales
git checkout -- path/to/file.js
```

### Tester l'API backend

```bash
# PowerShell
Invoke-WebRequest -Uri "https://crazy-chrono-backend.onrender.com/api/tournament/tournaments" | Select-Object -ExpandProperty Content

# Ou dans la console navigateur
fetch('https://crazy-chrono-backend.onrender.com/api/tournament/tournaments')
  .then(r => r.json())
  .then(d => console.log(d))
```

---

## ⚠️ ERREURS COURANTES À ÉVITER

### 1. Fixer qu'un seul endroit

❌ **MAUVAIS :**
```javascript
// Fix uniquement dans la fonction A
function A() {
  const ids = parseStudentIds(group.student_ids); // ✅ Fixé
}

// Oubli dans la fonction B
function B() {
  const ids = JSON.parse(group.student_ids); // ❌ Toujours buggé !
}
```

✅ **BON :**
```bash
# Chercher TOUS les usages avant de fixer
grep -rn "JSON.parse.*student_ids" src/
```

### 2. Déployer sans tester localement

❌ **MAUVAIS :**
```bash
git add .
git commit -m "fix bug"
git push
# Puis attendre 5 min que Vercel déploie pour voir que ça marche pas
```

✅ **BON :**
```bash
npm start
# Tester 5 minutes
# Si OK, alors commit + push
```

### 3. Message de commit vague

❌ **MAUVAIS :**
```bash
git commit -m "fix bug"
git commit -m "update code"
git commit -m "wip"
```

✅ **BON :**
```bash
git commit -m "fix(tournament): Parse student_ids with helper for all formats

- Created parseStudentIds helper
- Fixed 3 locations: line 224, 268, 390
- Handles array, JSON string, CSV string
- Tested locally with all formats"
```

### 4. Debugger en production

❌ **MAUVAIS :**
```javascript
// Modifier directement app.crazy-chrono.com dans la console
// et espérer que ça fixe le problème
```

✅ **BON :**
```bash
# Toujours reproduire et fixer EN LOCAL
npm start
```

---

## 📝 TEMPLATE DE RAPPORT DE BUG

```markdown
## 🐛 BUG REPORT

### Description
[Décrire le bug en 1 phrase]

### Reproduction
1. Aller sur [URL]
2. Cliquer sur [bouton]
3. Observer [comportement]

### Erreur console
```
[Copier-coller l'erreur COMPLÈTE]
```

### Données
- Backend endpoint: [URL de l'API]
- Réponse backend: [JSON]
- Format attendu: [description]
- Format reçu: [description]

### Cause racine
[Expliquer POURQUOI ça plante]

### Solution
[Décrire la solution en 1-2 phrases]

### Fichiers modifiés
- [ ] src/path/to/file1.js (ligne X)
- [ ] src/path/to/file2.js (ligne Y)

### Tests
- [ ] Reproduit en local
- [ ] Testé en local
- [ ] Déployé
- [ ] Testé en production

### Commit
Commit hash: [HASH]
```

---

## 🎓 RÉSUMÉ : LES 10 COMMANDEMENTS DU DÉBOGAGE

1. ✅ **Toujours reproduire en LOCAL avant de toucher au code**
2. ✅ **Lire l'erreur COMPLÈTE, pas juste le début**
3. ✅ **Chercher TOUS les usages avec grep avant de fixer**
4. ✅ **Créer un helper si le code est dupliqué**
5. ✅ **Ajouter des logs de debug temporaires**
6. ✅ **Tester LOCALEMENT pendant au moins 5 minutes**
7. ✅ **Commit avec un message EXPLICITE**
8. ✅ **Vérifier le déploiement Vercel avant de tester**
9. ✅ **Tester en production en mode INCOGNITO**
10. ✅ **Documenter la solution pour la prochaine fois**

---

## 📞 AIDE RAPIDE

**En cas de doute, demande à Cascade de :**

```
"Peux-tu suivre le DEBUG_PROCESS.md pour ce bug ?"
```

**Cascade va alors :**
1. ✅ Chercher TOUS les usages
2. ✅ Créer un helper si besoin
3. ✅ Proposer un fix complet
4. ✅ Tester localement
5. ✅ Déployer avec un bon message de commit

---

*Dernière mise à jour : 4 décembre 2025*
*Créé suite au bug de parsing `student_ids` qui a pris 3h à résoudre*
