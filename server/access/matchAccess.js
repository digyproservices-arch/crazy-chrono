// ==========================================
// AUTORISATION DES ÉVÉNEMENTS MUTANTS (CTO-002 review)
// Un abonnement Pro n'accorde aucun pouvoir professeur/admin.
// Le rôle est résolu côté serveur; la propriété du match est vérifiée
// quand elle est connue. Aucun teacherId/studentId client n'est cru.
// ==========================================

const { MANAGER_ROLES } = require('./entitlements');
const { getSocketIdentity, isDevBypassEnabled } = require('./socketAccess');

function isManagerRole(role) {
  return typeof role === 'string' && MANAGER_ROLES.includes(role);
}

/**
 * Autorise une action de pilotage (créer/forcer/supprimer un match).
 * @param {object} params
 * @param {object} params.socket
 * @param {(userId: string) => Promise<{role: string|null, reason: string}>} params.resolveRoleFor
 * @param {object|null} [params.match]  match serveur (peut porter teacherId)
 * @param {object} [params.env]
 * @returns {Promise<{allowed: boolean, reason: string, userId: string|null, role: string|null}>}
 */
async function authorizeManagerAction({ socket, resolveRoleFor, match = null, env = process.env }) {
  const identity = getSocketIdentity(socket);
  const bypass = isDevBypassEnabled(env);
  if (!identity.userId) {
    if (bypass) return { allowed: true, reason: 'dev_bypass', userId: null, role: null };
    return { allowed: false, reason: identity.authError || 'unauthenticated', userId: null, role: null };
  }
  if (socket?.sessionTokenPresented === true && socket?.sessionValid !== true) {
    if (bypass) return { allowed: true, reason: 'dev_bypass', userId: identity.userId, role: null };
    return { allowed: false, reason: 'session_unverified', userId: identity.userId, role: null };
  }

  let role = null;
  try {
    const resolved = await resolveRoleFor(identity.userId);
    role = resolved?.role || null;
  } catch (e) {
    role = null;
  }

  if (!isManagerRole(role)) {
    if (bypass) return { allowed: true, reason: 'dev_bypass', userId: identity.userId, role };
    return { allowed: false, reason: 'role_required', userId: identity.userId, role };
  }

  // Propriété du match: un professeur ne pilote que ses propres matchs.
  const ownerId = match?.teacherId || null;
  if (ownerId && role !== 'admin' && String(ownerId) !== identity.userId) {
    if (bypass) return { allowed: true, reason: 'dev_bypass', userId: identity.userId, role };
    return { allowed: false, reason: 'not_match_owner', userId: identity.userId, role };
  }

  return { allowed: true, reason: 'manager', userId: identity.userId, role };
}

/**
 * Un socket ne peut muter l'état d'un match que s'il y a été admis par un
 * join autorisé (appartenance à la room Socket.IO du match).
 */
function isMatchParticipant(socket, matchId) {
  if (!matchId || !socket?.rooms) return false;
  try {
    return typeof socket.rooms.has === 'function'
      ? socket.rooms.has(matchId)
      : Array.from(socket.rooms).includes(matchId);
  } catch (e) {
    return false;
  }
}

module.exports = { isManagerRole, authorizeManagerAction, isMatchParticipant };
