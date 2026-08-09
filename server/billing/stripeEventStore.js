// ==========================================
// IDEMPOTENCE DES ÉVÉNEMENTS STRIPE (CTO-002)
// Mémoire + persistance fichier (survit à un redémarrage du process).
// Limite connue: pas de coordination entre plusieurs instances backend.
// ==========================================

const fs = require('fs');
const path = require('path');

const MAX_EVENTS = 1000;

function createStripeEventStore({ filePath, maxEvents = MAX_EVENTS, persist = true } = {}) {
  const file = filePath || path.join(__dirname, '..', 'data', 'stripe_events.json');
  /** @type {Set<string>} */
  const seen = new Set();

  if (persist) {
    try {
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(raw)) raw.slice(-maxEvents).forEach((id) => seen.add(String(id)));
      }
    } catch { /* store vide si fichier illisible */ }
  }

  function flush() {
    if (!persist) return;
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify([...seen].slice(-maxEvents), null, 0), 'utf8');
    } catch { /* la protection mémoire reste active */ }
  }

  return {
    /** Retourne false si l'événement a déjà été vu (doublon). */
    reserve(eventId) {
      const id = String(eventId);
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > maxEvents) {
        const excess = seen.size - maxEvents;
        [...seen].slice(0, excess).forEach((k) => seen.delete(k));
      }
      flush();
      return true;
    },
    /** Annule une réservation (traitement échoué → retry Stripe autorisé). */
    release(eventId) {
      seen.delete(String(eventId));
      flush();
    },
    has(eventId) { return seen.has(String(eventId)); },
    size() { return seen.size; },
  };
}

module.exports = { createStripeEventStore };
