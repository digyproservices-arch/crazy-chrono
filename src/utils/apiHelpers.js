/**
 * HELPERS pour les appels API
 * Fonctions utilitaires pour simplifier et sécuriser les appels backend
 */

/**
 * Récupère l'URL du backend (local ou production)
 * 
 * @returns {string} - URL du backend
 * 
 * @example
 * getBackendUrl() // → "https://crazy-chrono-backend.onrender.com" (en prod)
 * getBackendUrl() // → "http://localhost:4000" (en local)
 */
export const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

/**
 * Fetch avec timeout pour éviter les requêtes infinies
 * 
 * @param {string} url - URL à appeler
 * @param {Object} options - Options fetch
 * @param {number} timeout - Timeout en ms (défaut: 10000)
 * @returns {Promise<Response>} - Réponse fetch
 * 
 * @throws {Error} Si timeout dépassé
 * 
 * @example
 * const response = await fetchWithTimeout('https://api.example.com/data', {}, 5000);
 */
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
    if (err.name === 'AbortError') {
      throw new Error(`Timeout après ${timeout}ms sur ${url}`);
    }
    throw err;
  }
};

/**
 * Appel API générique avec gestion d'erreur
 * 
 * @param {string} endpoint - Endpoint (ex: '/api/tournament/tournaments')
 * @param {Object} options - Options fetch
 * @returns {Promise<Object>} - Données JSON
 * 
 * @throws {Error} Si erreur réseau ou réponse non-OK
 * 
 * @example
 * const data = await apiCall('/api/tournament/tournaments/tour_2025_gp');
 * // → { success: true, tournament: {...} }
 */
export const apiCall = async (endpoint, options = {}) => {
  try {
    const baseUrl = getBackendUrl();
    const url = `${baseUrl}${endpoint}`;
    
    console.log(`[API] ${options.method || 'GET'} ${url}`);
    
    const response = await fetchWithTimeout(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }
    
    console.log(`[API] ✅ ${options.method || 'GET'} ${url} - Success`);
    return data;
    
  } catch (err) {
    console.error(`[API] ❌ ${options.method || 'GET'} ${endpoint}:`, err.message);
    throw err;
  }
};

/**
 * GET request
 * 
 * @param {string} endpoint - Endpoint
 * @returns {Promise<Object>} - Données JSON
 * 
 * @example
 * const tournaments = await apiGet('/api/tournament/tournaments');
 */
export const apiGet = async (endpoint) => {
  return apiCall(endpoint, { method: 'GET' });
};

/**
 * POST request
 * 
 * @param {string} endpoint - Endpoint
 * @param {Object} body - Corps de la requête
 * @returns {Promise<Object>} - Données JSON
 * 
 * @example
 * const result = await apiPost('/api/tournament/groups', {
 *   name: 'Groupe A',
 *   student_ids: ['s001', 's002']
 * });
 */
export const apiPost = async (endpoint, body = {}) => {
  return apiCall(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
};

/**
 * PUT request
 * 
 * @param {string} endpoint - Endpoint
 * @param {Object} body - Corps de la requête
 * @returns {Promise<Object>} - Données JSON
 */
export const apiPut = async (endpoint, body = {}) => {
  return apiCall(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
};

/**
 * DELETE request
 * 
 * @param {string} endpoint - Endpoint
 * @returns {Promise<Object>} - Données JSON
 * 
 * @example
 * const result = await apiDelete('/api/tournament/groups/group_123');
 */
export const apiDelete = async (endpoint) => {
  return apiCall(endpoint, { method: 'DELETE' });
};

/**
 * Charge les données d'un tournoi avec ses élèves et groupes
 * 
 * @param {string} tournamentId - ID du tournoi
 * @param {string} classId - ID de la classe
 * @returns {Promise<Object>} - { tournament, students, groups }
 * 
 * @example
 * const { tournament, students, groups } = await loadTournamentData('tour_2025_gp', 'ce1_a_lamentin');
 */
export const loadTournamentData = async (tournamentId, classId) => {
  try {
    console.log('[loadTournamentData] Chargement pour tournoi:', tournamentId, 'classe:', classId);
    
    // Charger en parallèle pour gagner du temps
    const [tournamentData, studentsData, groupsData] = await Promise.all([
      apiGet(`/api/tournament/tournaments/${tournamentId}`),
      apiGet(`/api/tournament/classes/${classId}/students`),
      apiGet(`/api/tournament/classes/${classId}/groups`)
    ]);
    
    console.log('[loadTournamentData] ✅ Données chargées');
    console.log('  - Tournament:', tournamentData.tournament?.name);
    console.log('  - Students:', studentsData.students?.length || 0);
    console.log('  - Groups:', groupsData.groups?.length || 0);
    
    return {
      tournament: tournamentData.tournament || null,
      students: studentsData.students || [],
      groups: groupsData.groups || []
    };
    
  } catch (err) {
    console.error('[loadTournamentData] ❌ Erreur:', err.message);
    throw err;
  }
};

/**
 * Gère les erreurs API de manière user-friendly
 * 
 * @param {Error} error - Erreur à gérer
 * @returns {string} - Message d'erreur formatté
 * 
 * @example
 * try {
 *   await apiCall('/endpoint');
 * } catch (err) {
 *   alert(formatApiError(err));
 * }
 */
export const formatApiError = (error) => {
  if (!error) return 'Erreur inconnue';
  
  // Timeout
  if (error.message?.includes('Timeout')) {
    return 'Le serveur met trop de temps à répondre. Veuillez réessayer.';
  }
  
  // Erreur réseau
  if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
    return 'Impossible de contacter le serveur. Vérifiez votre connexion internet.';
  }
  
  // Erreur HTTP
  if (error.message?.startsWith('HTTP')) {
    const status = parseInt(error.message.replace('HTTP ', ''));
    if (status === 404) return 'Ressource non trouvée';
    if (status === 403) return 'Accès refusé';
    if (status === 401) return 'Non authentifié';
    if (status >= 500) return 'Erreur serveur. Veuillez réessayer plus tard.';
  }
  
  // Message personnalisé du backend
  if (error.message) {
    return error.message;
  }
  
  return 'Une erreur est survenue';
};
