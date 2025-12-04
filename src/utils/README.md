# 📦 UTILS - Fonctions Helpers

Ce dossier contient toutes les **fonctions utilitaires réutilisables** du projet.

---

## 📁 Fichiers

### `tournamentHelpers.js`
**Helpers spécifiques au mode tournoi**

```javascript
import { parseStudentIds, getAvailableStudents } from '../utils/tournamentHelpers';

// Parser les IDs d'élèves (gère 3 formats)
const ids = parseStudentIds(group.student_ids);

// Récupérer les élèves disponibles
const available = getAvailableStudents(allStudents, groups);
```

**Fonctions disponibles :**
- `parseStudentIds(studentIds)` - Parse array/JSON/CSV
- `parseGroupData(groupData)` - Parse données de groupe
- `parseTournamentData(tournamentData)` - Parse données de tournoi
- `isValidStudentId(studentId)` - Valide format ID élève
- `isValidGroupSize(students, min, max)` - Valide taille groupe
- `getAvailableStudents(students, groups)` - Filtre élèves disponibles
- `formatGroupName(name)` - Formatte nom de groupe

---

### `apiHelpers.js`
**Helpers pour les appels API backend**

```javascript
import { apiGet, apiPost, loadTournamentData } from '../utils/apiHelpers';

// GET simple
const tournaments = await apiGet('/api/tournament/tournaments');

// POST avec body
const result = await apiPost('/api/tournament/groups', { name: 'Groupe A' });

// Charger toutes les données d'un tournoi en une fois
const { tournament, students, groups } = await loadTournamentData('tour_2025_gp', 'ce1_a_lamentin');
```

**Fonctions disponibles :**
- `getBackendUrl()` - URL backend (prod/local)
- `apiGet(endpoint)` - GET request
- `apiPost(endpoint, body)` - POST request
- `apiPut(endpoint, body)` - PUT request
- `apiDelete(endpoint)` - DELETE request
- `loadTournamentData(tournamentId, classId)` - Charge tournoi complet
- `formatApiError(error)` - Message d'erreur user-friendly

---

### `validators.js`
**Helpers de validation de données**

```javascript
import { isValidEmail, isValidGroupSize, isEmpty } from '../utils/validators';

// Valider un email
if (!isValidEmail(email)) {
  alert('Email invalide');
}

// Valider la taille d'un groupe
if (!isValidGroupSize(selectedStudents, 2, 4)) {
  alert('Sélectionnez entre 2 et 4 élèves');
}

// Vérifier si vide
if (isEmpty(groupName)) {
  alert('Le nom du groupe est requis');
}
```

**Fonctions disponibles :**
- `isValidEmail(email)` - Valide email
- `isValidStudentId(studentId)` - Valide ID élève
- `isValidName(name)` - Valide nom
- `isValidGroupName(name)` - Valide nom de groupe
- `isValidGroupSize(students, min, max)` - Valide taille groupe
- `isValidRoomCode(code)` - Valide code salle
- `isValidUrl(url)` - Valide URL
- `isValidPhoneFR(phone)` - Valide tél français
- `isValidDate(date, allowPast)` - Valide date
- `isValidPassword(password, minLength)` - Valide mot de passe
- `isValidSchoolLevel(level)` - Valide niveau scolaire
- `sanitizeString(str)` - Nettoie string dangereuse
- `isEmpty(value)` - Vérifie si vide

---

## 🎯 Quand utiliser un helper ?

### ✅ UTILISER un helper SI :

1. **Le code est dupliqué** (même logique à 2+ endroits)
2. **Les données peuvent avoir plusieurs formats**
3. **Il y a des validations/vérifications à faire**
4. **Le code est complexe** (plus de 3 lignes)

### Exemples :

**❌ AVANT (code dupliqué) :**
```javascript
// Fichier A
const ids = JSON.parse(group.student_ids);

// Fichier B
const studentIds = JSON.parse(group.student_ids);

// Fichier C
const ids = JSON.parse(data.student_ids);
```

**✅ APRÈS (avec helper) :**
```javascript
import { parseStudentIds } from '../utils/tournamentHelpers';

// Fichier A
const ids = parseStudentIds(group.student_ids);

// Fichier B
const studentIds = parseStudentIds(group.student_ids);

// Fichier C
const ids = parseStudentIds(data.student_ids);
```

**Avantages :**
- ✅ Une seule source de vérité
- ✅ Moins d'erreurs
- ✅ Code lisible
- ✅ Facile à tester
- ✅ Facile à modifier (1 seul endroit)

---

## 📝 Comment créer un nouveau helper ?

### 1. Identifier le besoin

**Posez-vous ces questions :**
- Est-ce que ce code est dupliqué ?
- Est-ce que cette logique pourrait servir ailleurs ?
- Est-ce que c'est complexe ou risqué (parsing, validation, etc.) ?

### 2. Créer la fonction

**Template de base :**
```javascript
/**
 * Description claire de ce que fait la fonction
 * 
 * @param {Type} paramName - Description du paramètre
 * @returns {Type} - Description du retour
 * 
 * @example
 * maFonction('input') // → 'output'
 */
export const maFonction = (paramName) => {
  try {
    // Validation des paramètres
    if (!paramName || typeof paramName !== 'string') {
      console.warn('[maFonction] Paramètre invalide:', paramName);
      return null; // ou une valeur par défaut
    }
    
    // Logique principale
    const result = /* ... */;
    
    return result;
    
  } catch (err) {
    console.error('[maFonction] Erreur:', err);
    return null; // ou throw err si critique
  }
};
```

### 3. Documenter avec JSDoc

**Toujours inclure :**
- Description claire
- `@param` pour chaque paramètre
- `@returns` pour le retour
- `@example` avec un cas d'usage
- `@throws` si la fonction peut throw

### 4. Tester

**Testez TOUS les cas :**
```javascript
// Cas normal
console.log(maFonction('valeur normale'));

// Cas limite
console.log(maFonction(''));
console.log(maFonction(null));
console.log(maFonction(undefined));

// Cas d'erreur
console.log(maFonction(123)); // mauvais type
```

---

## 🚀 Best Practices

### ✅ DO :

```javascript
// 1. Nom clair et explicite
export const parseStudentIds = (studentIds) => { /* ... */ };

// 2. Valider les paramètres
if (!data || typeof data !== 'object') {
  return null;
}

// 3. Gérer les erreurs
try {
  // ...
} catch (err) {
  console.error('[functionName] Erreur:', err);
  return fallbackValue;
}

// 4. Retourner toujours le même type
return []; // Toujours un array, jamais null
```

### ❌ DON'T :

```javascript
// 1. Nom vague
export const doStuff = (x) => { /* ... */ }; // ❌

// 2. Pas de validation
const result = JSON.parse(data); // ❌ Peut planter !

// 3. Pas de gestion d'erreur
export const myFunc = (x) => {
  return x.split(','); // ❌ Plante si x n'est pas une string
};

// 4. Retour inconsistent
return result || null; // ❌ Parfois array, parfois null
```

---

## 📚 Liens utiles

- [DEBUG_PROCESS.md](../../DEBUG_PROCESS.md) - Processus de débogage complet
- [JSDoc](https://jsdoc.app/) - Documentation des fonctions
- [MDN Web Docs](https://developer.mozilla.org/) - Référence JavaScript

---

*Dernière mise à jour : 4 décembre 2025*
