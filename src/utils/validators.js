/**
 * HELPERS de VALIDATION
 * Fonctions pour valider les données utilisateur
 */

/**
 * Valide un email
 * 
 * @param {string} email - Email à valider
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidEmail('test@example.com') // → true
 * isValidEmail('invalide') // → false
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

/**
 * Valide un ID d'élève (format: s001, s002, etc.)
 * 
 * @param {string} studentId - ID à valider
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidStudentId('s001') // → true
 * isValidStudentId('s1') // → false (trop court)
 * isValidStudentId('student01') // → false (mauvais format)
 */
export const isValidStudentId = (studentId) => {
  if (typeof studentId !== 'string') return false;
  return /^s\d{3,}$/.test(studentId); // Format: s + au moins 3 chiffres
};

/**
 * Valide un nom (au moins 2 caractères, pas de chiffres uniquement)
 * 
 * @param {string} name - Nom à valider
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidName('Alice') // → true
 * isValidName('A') // → false (trop court)
 * isValidName('123') // → false (chiffres uniquement)
 */
export const isValidName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (/^\d+$/.test(trimmed)) return false; // Pas que des chiffres
  return true;
};

/**
 * Valide un nom de groupe
 * 
 * @param {string} groupName - Nom du groupe
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidGroupName('Groupe A') // → true
 * isValidGroupName('') // → false
 * isValidGroupName('G') // → false (trop court)
 */
export const isValidGroupName = (groupName) => {
  return isValidName(groupName);
};

/**
 * Valide la taille d'un groupe d'élèves
 * 
 * @param {Array} students - Liste des élèves
 * @param {number} minSize - Taille minimale (défaut: 2)
 * @param {number} maxSize - Taille maximale (défaut: 4)
 * @returns {boolean} - true si la taille est valide
 * 
 * @example
 * isValidGroupSize(['s001', 's002', 's003'], 2, 4) // → true
 * isValidGroupSize(['s001'], 2, 4) // → false (trop petit)
 */
export const isValidGroupSize = (students, minSize = 2, maxSize = 4) => {
  if (!Array.isArray(students)) return false;
  return students.length >= minSize && students.length <= maxSize;
};

/**
 * Valide un code de salle (format: XXXX avec X = lettre majuscule)
 * 
 * @param {string} roomCode - Code de salle
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidRoomCode('ABCD') // → true
 * isValidRoomCode('abc') // → false (minuscules)
 * isValidRoomCode('AB12') // → false (chiffres)
 */
export const isValidRoomCode = (roomCode) => {
  if (!roomCode || typeof roomCode !== 'string') return false;
  return /^[A-Z]{4}$/.test(roomCode);
};

/**
 * Valide une URL
 * 
 * @param {string} url - URL à valider
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidUrl('https://example.com') // → true
 * isValidUrl('not-a-url') // → false
 */
export const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Valide un numéro de téléphone français
 * 
 * @param {string} phone - Numéro de téléphone
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidPhoneFR('0612345678') // → true
 * isValidPhoneFR('06 12 34 56 78') // → true
 * isValidPhoneFR('123') // → false
 */
export const isValidPhoneFR = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-\.]/g, '');
  return /^0[1-9]\d{8}$/.test(cleaned);
};

/**
 * Valide une date (pas dans le passé si required)
 * 
 * @param {string|Date} date - Date à valider
 * @param {boolean} allowPast - Autoriser dates passées (défaut: true)
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidDate('2025-12-31') // → true
 * isValidDate('2020-01-01', false) // → false (dans le passé)
 */
export const isValidDate = (date, allowPast = true) => {
  if (!date) return false;
  
  let dateObj;
  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    return false;
  }
  
  if (isNaN(dateObj.getTime())) return false;
  
  if (!allowPast) {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Début de journée
    return dateObj >= now;
  }
  
  return true;
};

/**
 * Valide un mot de passe (au moins 6 caractères)
 * 
 * @param {string} password - Mot de passe
 * @param {number} minLength - Longueur minimale (défaut: 6)
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidPassword('secret123') // → true
 * isValidPassword('123') // → false (trop court)
 */
export const isValidPassword = (password, minLength = 6) => {
  if (!password || typeof password !== 'string') return false;
  return password.length >= minLength;
};

/**
 * Valide une tranche d'âge/niveau scolaire
 * 
 * @param {string} level - Niveau (CP, CE1, CE2, etc.)
 * @returns {boolean} - true si valide
 * 
 * @example
 * isValidSchoolLevel('CE1') // → true
 * isValidSchoolLevel('INVALID') // → false
 */
export const isValidSchoolLevel = (level) => {
  if (!level || typeof level !== 'string') return false;
  const validLevels = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e'];
  return validLevels.includes(level.toUpperCase());
};

/**
 * Sanitize une string (enlève les caractères dangereux)
 * 
 * @param {string} str - String à nettoyer
 * @returns {string} - String nettoyée
 * 
 * @example
 * sanitizeString('<script>alert("xss")</script>') // → 'scriptalert("xss")/script'
 */
export const sanitizeString = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/"/g, '')
    .replace(/'/g, '')
    .trim();
};

/**
 * Vérifie si une valeur est vide (null, undefined, '', [], {})
 * 
 * @param {*} value - Valeur à vérifier
 * @returns {boolean} - true si vide
 * 
 * @example
 * isEmpty(null) // → true
 * isEmpty('') // → true
 * isEmpty([]) // → true
 * isEmpty({}) // → true
 * isEmpty('hello') // → false
 */
export const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};
