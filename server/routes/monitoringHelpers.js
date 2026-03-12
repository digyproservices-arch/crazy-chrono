/**
 * Shared helpers for monitoring data storage.
 * Used by both monitoring.js routes and server.js webhook handlers.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PAYMENT_EVENTS_FILE = path.join(DATA_DIR, 'payment_events.json');
const MAX_PAYMENT_EVENTS = 200;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadPaymentEvents() {
  try {
    ensureDataDir();
    if (!fs.existsSync(PAYMENT_EVENTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PAYMENT_EVENTS_FILE, 'utf8'));
  } catch { return []; }
}

function savePaymentEvents(events) {
  try {
    ensureDataDir();
    const trimmed = events.slice(-MAX_PAYMENT_EVENTS);
    fs.writeFileSync(PAYMENT_EVENTS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    console.error('[PaymentEvents] Save failed:', e.message);
  }
}

module.exports = { loadPaymentEvents, savePaymentEvents };
