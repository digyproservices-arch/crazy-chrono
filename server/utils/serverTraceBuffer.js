/**
 * Server-side trace buffer for GAME-TRACE events.
 * Stores events in memory + persists to disk so the MonitoringDashboard can fetch them.
 */
const fs = require('fs');
const path = require('path');

const TRACE_FILE = path.join(__dirname, '..', 'data', 'server_trace.json');
const MAX_TRACES = 500;

let _buffer = null; // lazy-loaded

function _ensureDir() {
  const dir = path.dirname(TRACE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  if (_buffer) return _buffer;
  try {
    _ensureDir();
    if (fs.existsSync(TRACE_FILE)) {
      _buffer = JSON.parse(fs.readFileSync(TRACE_FILE, 'utf8'));
    } else {
      _buffer = [];
    }
  } catch {
    _buffer = [];
  }
  return _buffer;
}

function save() {
  try {
    _ensureDir();
    fs.writeFileSync(TRACE_FILE, JSON.stringify((_buffer || []).slice(-MAX_TRACES), null, 2), 'utf8');
  } catch (e) {
    console.error('[ServerTrace] Save failed:', e.message);
  }
}

// Debounced save: batch disk writes (max every 2s)
let _saveTimer = null;
function debouncedSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    save();
  }, 2000);
}

/**
 * Push a server trace event into the buffer.
 * @param {string} event - Event name (e.g. 'startRound', 'roundTimer:fired', 'disconnect')
 * @param {object} data - Event data (room, socketId, timing, etc.)
 */
function push(event, data = {}) {
  const buf = load();
  buf.push({
    event,
    ts: new Date().toISOString(),
    ...data,
  });
  // Cap in memory
  if (buf.length > MAX_TRACES) {
    _buffer = buf.slice(-MAX_TRACES);
  }
  debouncedSave();
}

/**
 * Get all stored traces.
 */
function getAll() {
  return load().slice();
}

/**
 * Purge all traces.
 */
function purge() {
  _buffer = [];
  save();
}

module.exports = { push, getAll, purge };
