// ==========================================
// GRANDE SALLE / TOURNOIS — CONTRÔLE D'ACCÈS (CTO-002 review)
// Aucun userId / studentId / email envoyé par le navigateur ne prouve
// un abonnement ni un paiement. Deux preuves seulement:
//   1. identité JWT vérifiée au handshake + habilitation serveur;
//   2. billet signé côté serveur, émis après vérification du paiement
//      Stripe, et recoupé avec gs_tournament_entries.paid.
// ==========================================

const crypto = require('crypto');

const TICKET_VERSION = 'v1';

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** Secret de signature des billets: jamais commité, jamais exposé au client. */
function getTicketSecret(env = process.env) {
  return env.GS_TICKET_SECRET || env.STRIPE_WEBHOOK_SECRET || null;
}

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Billet d'entrée: `v1.<email base64url>.<hmac>`.
 * Émis uniquement après vérification serveur du paiement Stripe.
 */
function issueTicket({ secret, tournamentId, email }) {
  if (!secret || !tournamentId) return null;
  const mail = normalizeEmail(email);
  if (!mail) return null;
  const encoded = Buffer.from(mail, 'utf8').toString('base64url');
  return `${TICKET_VERSION}.${encoded}.${sign(secret, `${TICKET_VERSION}|${tournamentId}|${mail}`)}`;
}

/**
 * @returns {string|null} email prouvé par le billet, ou null si invalide.
 */
function verifyTicket({ secret, tournamentId, ticket }) {
  if (!secret || !tournamentId || typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 3 || parts[0] !== TICKET_VERSION) return null;
  let mail = '';
  try {
    mail = normalizeEmail(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!mail) return null;
  const expected = sign(secret, `${TICKET_VERSION}|${tournamentId}|${mail}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return mail;
}

/**
 * Décide si un socket peut ENTRER COMME JOUEUR dans une salle Grande Salle.
 * Les spectateurs autorisés sont traités en amont (lecture seule).
 *
 * @param {object} params
 * @param {'free'|'subscribers'|'paid'} params.accessType
 * @param {string|null} params.tournamentId
 * @param {object} params.socket                       socket avec authUser vérifié
 * @param {(userId: string) => Promise<{isPro: boolean, reason?: string, source?: string}>} params.checkEntitlement
 * @param {(tournamentId: string, email: string) => Promise<boolean|null>} params.hasPaidEntry
 *        true = paiement prouvé, false = pas d'entrée payée, null = vérification impossible (fail closed)
 * @param {string|null} [params.entryTicket]           billet fourni par le client
 * @param {object} [params.env]
 * @returns {Promise<{allowed: boolean, reason: string, userId: string|null, email: string|null, via: string|null}>}
 */
async function resolveGrandeSalleAccess({
  accessType,
  tournamentId,
  socket,
  checkEntitlement,
  hasPaidEntry,
  entryTicket = null,
  env = process.env,
}) {
  const type = accessType || 'free';
  if (type === 'free') {
    return { allowed: true, reason: 'free_room', userId: socket?.authUser?.id || null, email: null, via: 'free' };
  }

  // 1) Abonné: identité JWT vérifiée uniquement.
  const userId = socket?.authError ? null : (socket?.authUser?.id ? String(socket.authUser.id) : null);
  const verifiedEmail = socket?.authError ? null : normalizeEmail(socket?.authUser?.email);
  if (userId) {
    let entitlement = null;
    try {
      entitlement = await checkEntitlement(userId);
    } catch (e) {
      entitlement = { isPro: false, reason: 'verification_error' };
    }
    if (entitlement?.isPro) {
      return { allowed: true, reason: 'subscriber', userId, email: verifiedEmail, via: entitlement.source || 'entitled' };
    }
  }

  if (type === 'subscribers') {
    return { allowed: false, reason: userId ? 'not_entitled' : 'unauthenticated', userId, email: verifiedEmail, via: null };
  }

  // 2) Tournoi payant: preuve serveur de paiement.
  //    a. email vérifié du compte connecté, recoupé avec l'entrée payée;
  //    b. billet signé émis après vérification de la session Stripe.
  const candidates = [];
  if (verifiedEmail) candidates.push({ email: verifiedEmail, via: 'verified_email' });
  const ticketEmail = verifyTicket({ secret: getTicketSecret(env), tournamentId, ticket: entryTicket });
  if (ticketEmail) candidates.push({ email: ticketEmail, via: 'signed_ticket' });

  if (candidates.length === 0) {
    return { allowed: false, reason: 'payment_proof_required', userId, email: null, via: null };
  }

  for (const candidate of candidates) {
    let paid = null;
    try {
      paid = await hasPaidEntry(tournamentId, candidate.email);
    } catch (e) {
      paid = null;
    }
    if (paid === true) {
      return { allowed: true, reason: 'paid_entry', userId, email: candidate.email, via: candidate.via };
    }
    if (paid === null) {
      // Vérification impossible → fail closed, pas de repli sur une autre preuve.
      return { allowed: false, reason: 'verification_unavailable', userId, email: candidate.email, via: candidate.via };
    }
  }

  return { allowed: false, reason: 'not_paid', userId, email: null, via: null };
}

module.exports = {
  getTicketSecret,
  issueTicket,
  verifyTicket,
  resolveGrandeSalleAccess,
  normalizeEmail,
};
