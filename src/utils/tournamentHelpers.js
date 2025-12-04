/**
 * HELPERS pour le mode TOURNOI
 * Fonctions utilitaires pour parser et valider les données du tournoi
 */

/**
 * Parse student_ids qui peut être dans 3 formats différents
 * 
 * Formats supportés :
 * - Array natif : ["s001", "s002", "s003"]
 * - String JSON : '["s001","s002","s003"]'
 * - String CSV : "s001,s002,s003"
 * 
 * @param {Array|string} studentIds - Les IDs dans n'importe quel format
 * @returns {Array<string>} - Toujours un array de strings
 * 
 * @example
 * parseStudentIds(["s001", "s002"]) // → ["s001", "s002"]
 * parseStudentIds('["s001","s002"]') // → ["s001", "s002"]
 * parseStudentIds("s001,s002,s003") // → ["s001", "s002", "s003"]
 * parseStudentIds(null) // → []
 */
export const parseStudentIds = (studentIds) => {
  try {
    // Cas 1 : Déjà un array
    if (Array.isArray(studentIds)) {
      return studentIds;
    }
    
    // Cas 2 : String
    if (typeof studentIds === 'string') {
      // Cas 2a : JSON array (commence par '[')
      if (studentIds.trim().startsWith('[')) {
        return JSON.parse(studentIds);
      }
      // Cas 2b : CSV (virgules)
      else {
        return studentIds.split(',').map(id => id.trim()).filter(id => id);
      }
    }
    
    // Cas 3 : null, undefined, ou autre type
    if (studentIds === null || studentIds === undefined) {
      return [];
    }
    
    // Cas 4 : Format vraiment inconnu
    console.warn('[parseStudentIds] Format inconnu:', typeof studentIds, studentIds);
    return [];
    
  } catch (err) {
    console.error('[parseStudentIds] Erreur de parsing:', studentIds, err);
    return [];
  }
};

/**
 * Parse et valide les données d'un groupe
 * 
 * @param {Object} groupData - Données brutes du groupe depuis l'API
 * @returns {Object|null} - Groupe parsé ou null si invalide
 * 
 * @example
 * parseGroupData({
 *   id: 'group_1',
 *   name: 'Groupe A',
 *   student_ids: '["s001","s002"]',
 *   status: 'pending'
 * })
 * // → { id: 'group_1', name: 'Groupe A', studentIds: ["s001","s002"], status: 'pending' }
 */
export const parseGroupData = (groupData) => {
  try {
    if (!groupData || typeof groupData !== 'object') {
      return null;
    }
    
    return {
      id: groupData.id || '',
      name: groupData.name || 'Sans nom',
      studentIds: parseStudentIds(groupData.student_ids), // Utilise le helper
      tournamentId: groupData.tournament_id || '',
      classId: groupData.class_id || '',
      status: groupData.status || 'pending',
      matchId: groupData.match_id || null,
      winnerId: groupData.winner_id || null,
      phaseLevel: groupData.phase_level || 1,
      createdAt: groupData.created_at || null
    };
  } catch (err) {
    console.error('[parseGroupData] Erreur:', err);
    return null;
  }
};

/**
 * Parse et valide les données d'un tournoi
 * 
 * @param {Object} tournamentData - Données brutes du tournoi depuis l'API
 * @returns {Object|null} - Tournoi parsé ou null si invalide
 */
export const parseTournamentData = (tournamentData) => {
  try {
    if (!tournamentData || typeof tournamentData !== 'object') {
      return null;
    }
    
    return {
      id: tournamentData.id || '',
      name: tournamentData.name || 'Tournoi sans nom',
      academyCode: tournamentData.academy_code || '',
      status: tournamentData.status || 'pending',
      currentPhase: tournamentData.current_phase || 1,
      config: tournamentData.config || {},
      startDate: tournamentData.start_date || null,
      endDate: tournamentData.end_date || null,
      createdAt: tournamentData.created_at || null,
      createdBy: tournamentData.created_by || null
    };
  } catch (err) {
    console.error('[parseTournamentData] Erreur:', err);
    return null;
  }
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
 * Valide la taille d'un groupe
 * 
 * @param {Array} students - Liste des élèves
 * @param {number} minSize - Taille minimale (défaut: 2)
 * @param {number} maxSize - Taille maximale (défaut: 4)
 * @returns {boolean} - true si la taille est valide
 * 
 * @example
 * isValidGroupSize(['s001', 's002', 's003'], 2, 4) // → true
 * isValidGroupSize(['s001'], 2, 4) // → false (trop petit)
 * isValidGroupSize(['s001','s002','s003','s004','s005'], 2, 4) // → false (trop grand)
 */
export const isValidGroupSize = (students, minSize = 2, maxSize = 4) => {
  if (!Array.isArray(students)) return false;
  return students.length >= minSize && students.length <= maxSize;
};

/**
 * Trouve les élèves disponibles (pas encore dans un groupe)
 * 
 * @param {Array} allStudents - Liste de tous les élèves
 * @param {Array} groups - Liste des groupes existants
 * @returns {Array} - Élèves disponibles
 * 
 * @example
 * getAvailableStudents(
 *   [{id: 's001'}, {id: 's002'}, {id: 's003'}],
 *   [{student_ids: ['s001']}]
 * )
 * // → [{id: 's002'}, {id: 's003'}]
 */
export const getAvailableStudents = (allStudents, groups) => {
  try {
    if (!Array.isArray(allStudents) || !Array.isArray(groups)) {
      return [];
    }
    
    // Créer un Set avec tous les IDs déjà dans des groupes
    const studentsInGroups = new Set();
    groups.forEach(group => {
      const ids = parseStudentIds(group.student_ids);
      ids.forEach(id => studentsInGroups.add(id));
    });
    
    // Filtrer les élèves disponibles
    return allStudents.filter(student => !studentsInGroups.has(student.id));
    
  } catch (err) {
    console.error('[getAvailableStudents] Erreur:', err);
    return [];
  }
};

/**
 * Formatte un nom de groupe
 * 
 * @param {string} name - Nom brut
 * @returns {string} - Nom formatté
 * 
 * @example
 * formatGroupName('  groupe A  ') // → "Groupe A"
 * formatGroupName('') // → "Groupe sans nom"
 */
export const formatGroupName = (name) => {
  if (!name || typeof name !== 'string') {
    return 'Groupe sans nom';
  }
  
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Groupe sans nom';
  }
  
  // Capitalize première lettre
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};
