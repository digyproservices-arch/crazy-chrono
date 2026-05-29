// ==========================================
// SOCKET AUTH — Authentification Socket.IO
// Passe JWT + sessionToken au handshake
// ==========================================

import { getSessionToken } from './sessionService';

/**
 * Retourne l'objet auth à passer dans les options Socket.IO.
 * Inclut le JWT (Bearer token) et le session_token pour validation côté serveur.
 * @returns {{ token?: string, sessionToken?: string }}
 */
export function getSocketAuth() {
  const auth = {};

  // JWT depuis cc_auth
  try {
    const ccAuth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
    if (ccAuth?.token) auth.token = ccAuth.token;
  } catch {}

  // Session token (Phase 1)
  const sessionToken = getSessionToken();
  if (sessionToken) auth.sessionToken = sessionToken;

  return auth;
}

/**
 * Options Socket.IO par défaut avec authentification.
 * Usage: io(url, getAuthSocketOptions())
 * @param {object} extraOptions - Options supplémentaires à merger
 * @returns {object} Options Socket.IO complètes
 */
export function getAuthSocketOptions(extraOptions = {}) {
  return {
    transports: ['websocket', 'polling'],
    withCredentials: false,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: getSocketAuth(),
    ...extraOptions,
  };
}

/**
 * Attache un listener connect_error qui détecte SESSION_INVALIDATED.
 * Affiche la modale d'éjection si la connexion est rejetée.
 * @param {object} socket - Instance Socket.IO connectée
 */
export function handleSocketAuthError(socket) {
  if (!socket) return;
  socket.on('connect_error', (err) => {
    if (err?.message === 'SESSION_INVALIDATED') {
      console.warn('[Socket] ❌ Connexion rejetée: session invalidée (autre appareil)');
      try { window.dispatchEvent(new CustomEvent('cc:sessionKicked')); } catch {}
      socket.disconnect();
    }
  });
}

/**
 * Attache un listener subscription:required qui notifie l'utilisateur.
 * Dispatche un event global pour que App.js puisse afficher une UI.
 * @param {object} socket - Instance Socket.IO connectée
 */
export function handleSubscriptionRequired(socket) {
  if (!socket) return;
  socket.on('subscription:required', ({ event, message }) => {
    console.warn(`[Socket] 🔒 Abonnement requis pour ${event}: ${message}`);
    try {
      window.dispatchEvent(new CustomEvent('cc:subscriptionRequired', { detail: { event, message } }));
    } catch {}
  });
}
