// ==========================================
// CONTRÔLE D'ACCÈS SOCKET.IO (CTO-002) — FAIL CLOSED
// L'identité vient uniquement du JWT vérifié au handshake.
// Aucun champ envoyé par le client (studentId, userId, email,
// role, subscriptionStatus) ne peut accorder un accès payant.
// ==========================================

const { STUDENT_EMAIL_DOMAIN } = require('./entitlements');

/** Identité de confiance d'un socket (jamais issue du payload client). */
function getSocketIdentity(socket) {
  if (socket?.authError) return { userId: null, email: null, authError: socket.authError };
  const user = socket?.authUser;
  if (!user?.id) return { userId: null, email: null, authError: 'unauthenticated' };
  return { userId: String(user.id), email: user.email || null, authError: null };
}

/**
 * Dérogation de développement local: doit être impossible à activer
 * accidentellement en production (double condition explicite).
 */
function isDevBypassEnabled(env = process.env) {
  return env.NODE_ENV !== 'production' && env.CC_DEV_ALLOW_UNVERIFIED_MP === '1';
}

/**
 * Décide si un socket peut déclencher une action payante.
 * @param {object} params
 * @param {object} params.socket
 * @param {(userId: string) => Promise<{isPro:boolean, reason?:string, source?:string}>} params.checkEntitlement
 * @param {object} [params.env]
 * @returns {Promise<{allowed:boolean, reason:string, userId:string|null}>}
 */
async function checkSocketAccess({ socket, checkEntitlement, env = process.env }) {
  const identity = getSocketIdentity(socket);
  if (!identity.userId) {
    if (isDevBypassEnabled(env)) return { allowed: true, reason: 'dev_bypass', userId: null };
    return { allowed: false, reason: identity.authError || 'unauthenticated', userId: null };
  }
  // Un sessionToken présenté mais non prouvé valide (session inconnue, RPC en
  // erreur, Supabase injoignable, résultat indéterminé) ferme le payant.
  // Ne pas présenter de sessionToken reste autorisé: le parcours légitime
  // s'appuie alors sur le JWT + l'habilitation.
  if (socket?.sessionTokenPresented === true && socket?.sessionValid !== true) {
    if (isDevBypassEnabled(env)) return { allowed: true, reason: 'dev_bypass', userId: identity.userId };
    return { allowed: false, reason: 'session_unverified', userId: identity.userId };
  }
  // Compatibilité: un socket explicitement marqué invalide est refusé même si
  // l'indicateur de présentation n'a pas été positionné.
  if (socket?.sessionValid === false) {
    if (isDevBypassEnabled(env)) return { allowed: true, reason: 'dev_bypass', userId: identity.userId };
    return { allowed: false, reason: 'session_unverified', userId: identity.userId };
  }
  // Élève identifié par son adresse institutionnelle dans le JWT vérifié
  // (règle produit existante: la licence est payée par l'enseignant).
  if (typeof identity.email === 'string' && identity.email.endsWith(STUDENT_EMAIL_DOMAIN)) {
    return { allowed: true, reason: 'student_email_jwt', userId: identity.userId };
  }
  let entitlement = null;
  try {
    entitlement = await checkEntitlement(identity.userId);
  } catch (e) {
    entitlement = { isPro: false, reason: 'verification_error' };
  }
  if (entitlement?.isPro) {
    return { allowed: true, reason: entitlement.source || 'entitled', userId: identity.userId };
  }
  if (isDevBypassEnabled(env)) return { allowed: true, reason: 'dev_bypass', userId: identity.userId };
  return { allowed: false, reason: entitlement?.reason || 'not_entitled', userId: identity.userId };
}

/** Un roomId `solo-*` est une *demande* du client, jamais une preuve. */
function isFreeSoloRoom(roomId) {
  return typeof roomId === 'string' && roomId.startsWith('solo-');
}

/**
 * Sockets encore connectés occupant la salle, hors socket courant.
 * Les entrées obsolètes (socket déconnecté non encore purgé) sont ignorées
 * afin de ne pas casser la reconnexion Solo.
 * @param {{players?: Map<string, object>}} room
 * @param {string} socketId
 * @param {(id: string) => boolean} isSocketConnected
 */
function activeOccupants(room, socketId, isSocketConnected) {
  const out = [];
  if (!room || !room.players || typeof room.players.keys !== 'function') return out;
  for (const id of room.players.keys()) {
    if (id === socketId) continue;
    if (isSocketConnected(id)) out.push(id);
  }
  return out;
}

/**
 * Le caractère Solo est une décision serveur: une salle `solo-*` n'est gratuite
 * que si un seul socket connecté l'occupe. Dès qu'un second joueur s'y branche,
 * l'expérience devient multijoueur et l'habilitation payante est exigée.
 */
function isExclusiveSoloRoom(roomId, occupants) {
  return isFreeSoloRoom(roomId) && (occupants || []).length === 0;
}

module.exports = {
  getSocketIdentity,
  isDevBypassEnabled,
  checkSocketAccess,
  isFreeSoloRoom,
  activeOccupants,
  isExclusiveSoloRoom,
};
