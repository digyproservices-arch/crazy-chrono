/**
 * Server Metrics Collector
 * Collects RAM, CPU, event loop lag, WebSocket connections, Grande Salle state
 * every COLLECT_INTERVAL_MS and stores snapshots in a rolling buffer.
 */
const os = require('os');

const COLLECT_INTERVAL_MS = 10_000; // 10s
const MAX_SNAPSHOTS = 360; // 1h of data at 10s intervals
const MAX_GS_EVENTS = 500;

// Rolling buffers
const snapshots = [];
const gsEvents = []; // GS-specific event log

let _io = null;
let _grandeSalles = null;
let _rooms = null; // server rooms map
let _timer = null;
let _prevCpu = null;

/**
 * Initialize the metrics collector.
 * @param {object} io - Socket.IO server instance
 * @param {Map} grandeSalles - Grande Salle map from server.js
 * @param {Map} [rooms] - server rooms map (optional)
 */
function init(io, grandeSalles, rooms) {
  _io = io;
  _grandeSalles = grandeSalles;
  _rooms = rooms || null;
  _prevCpu = process.cpuUsage();
  if (_timer) clearInterval(_timer);
  _timer = setInterval(collect, COLLECT_INTERVAL_MS);
  collect(); // first snapshot immediately
}

/**
 * Collect a single metrics snapshot.
 */
function collect() {
  const mem = process.memoryUsage();
  const osMem = { totalMB: Math.round(os.totalmem() / 1048576), freeMB: Math.round(os.freemem() / 1048576) };

  // CPU usage (delta since last collect)
  const cpuNow = process.cpuUsage(_prevCpu);
  _prevCpu = process.cpuUsage();
  const cpuUserMs = cpuNow.user / 1000;
  const cpuSystemMs = cpuNow.system / 1000;
  const cpuPercent = Math.round((cpuUserMs + cpuSystemMs) / COLLECT_INTERVAL_MS * 100 * 10) / 10;

  // WebSocket connections
  const wsConnections = _io?.engine?.clientsCount || 0;

  // Grande Salle state
  const gsState = [];
  if (_grandeSalles) {
    for (const [id, salle] of _grandeSalles.entries()) {
      gsState.push({
        id,
        players: salle.players?.size || 0,
        spectators: salle.spectators?.size || 0,
        status: salle.status || 'unknown',
        sessionActive: !!salle.sessionActive,
        roundsPlayed: salle.roundsPlayed || 0,
        eliminationWave: salle.eliminationWave || 0,
        tournamentTitle: salle.tournamentTitle || null,
      });
    }
  }

  // Active rooms count
  const activeRooms = _rooms ? _rooms.size : (_io?.sockets?.adapter?.rooms?.size || 0);

  const snapshot = {
    ts: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1048576 * 10) / 10,
      heapTotalMB: Math.round(mem.heapTotal / 1048576 * 10) / 10,
      rssMB: Math.round(mem.rss / 1048576 * 10) / 10,
      externalMB: Math.round((mem.external || 0) / 1048576 * 10) / 10,
    },
    os: osMem,
    cpu: { userMs: Math.round(cpuUserMs), systemMs: Math.round(cpuSystemMs), percent: cpuPercent },
    ws: { connections: wsConnections, rooms: activeRooms },
    gs: gsState,
    gsSummary: {
      salles: gsState.length,
      totalPlayers: gsState.reduce((s, g) => s + g.players, 0),
      totalSpectators: gsState.reduce((s, g) => s + g.spectators, 0),
      activeSessions: gsState.filter(g => g.sessionActive).length,
    },
  };

  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);

  return snapshot;
}

/**
 * Log a Grande Salle event (join, leave, round, elimination, disconnect, etc.)
 */
function logGsEvent(event, data = {}) {
  gsEvents.push({
    event,
    ts: new Date().toISOString(),
    ...data,
  });
  if (gsEvents.length > MAX_GS_EVENTS) gsEvents.splice(0, gsEvents.length - MAX_GS_EVENTS);
}

/**
 * Get the latest snapshot.
 */
function getLatest() {
  if (snapshots.length === 0) collect();
  return snapshots[snapshots.length - 1];
}

/**
 * Get all snapshots (for timeline charts).
 */
function getAll() {
  return snapshots.slice();
}

/**
 * Get all GS events.
 */
function getGsEvents() {
  return gsEvents.slice();
}

/**
 * Get a performance summary (min/max/avg over the buffer).
 */
function getSummary() {
  if (snapshots.length === 0) return null;
  const heaps = snapshots.map(s => s.memory.heapUsedMB);
  const rss = snapshots.map(s => s.memory.rssMB);
  const cpus = snapshots.map(s => s.cpu.percent);
  const wss = snapshots.map(s => s.ws.connections);
  const gsPlayers = snapshots.map(s => s.gsSummary.totalPlayers);

  const stats = (arr) => ({
    min: Math.min(...arr),
    max: Math.max(...arr),
    avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10,
    current: arr[arr.length - 1],
  });

  return {
    period: { from: snapshots[0].ts, to: snapshots[snapshots.length - 1].ts, samples: snapshots.length },
    heapMB: stats(heaps),
    rssMB: stats(rss),
    cpuPercent: stats(cpus),
    wsConnections: stats(wss),
    gsPlayers: stats(gsPlayers),
    uptime: snapshots[snapshots.length - 1].uptime,
  };
}

/**
 * Purge all collected data.
 */
function purge() {
  snapshots.length = 0;
  gsEvents.length = 0;
}

module.exports = { init, collect, logGsEvent, getLatest, getAll, getGsEvents, getSummary, purge };
