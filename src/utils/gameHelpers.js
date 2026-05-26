// =============================================
// Helpers génériques du jeu — source unique (Phase 5)
// Utilisé par: Carte.js
// =============================================

// Helper: charge les associations depuis localStorage (éditions Admin) ou fichier statique
async function loadAssociationsData() {
  try {
    const cached = localStorage.getItem('cc_data_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.associations) && parsed.associations.length > 0) {
        return parsed;
      }
    }
  } catch {}
  const resp = await fetch((process.env.PUBLIC_URL || '') + '/data/associations.json');
  return await resp.json();
}

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

const normType = (t) => {
  const x = norm(t);
  if (['texte', 'text', 'txt', 'label'].includes(x)) return 'texte';
  if (['image', 'img', 'photo', 'picture', 'pic'].includes(x)) return 'image';
  if (['chiffre', 'number', 'num', 'digit'].includes(x)) return 'chiffre';
  if (['calcul', 'math', 'operation', 'op', 'calc'].includes(x)) return 'calcul';
  return x || t;
};

const getPairId = (z) => {
  if (!z) return '';
  const cand = z.pairId ?? z.pairID ?? z.pairid ?? z.pair ?? z.groupId ?? z.groupID ?? z.group;
  return norm(cand);
};

// RNG déterministe à partir d'une seed (mulberry32)
function mulberry32(seed) {
  let t = (seed >>> 0) || 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRngFromSeed(seed) {
  const s = Number(seed);
  return Number.isFinite(s) ? mulberry32(s) : Math.random;
}

// Mélange un tableau (algorithme de Fisher-Yates) avec RNG injectable
function shuffleArray(array, rng = Math.random) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Small helper: fetch with timeout (ms)
async function fetchWithTimeout(url, options = {}, timeoutMs = 1500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

export { loadAssociationsData, norm, normType, getPairId, mulberry32, makeRngFromSeed, shuffleArray, fetchWithTimeout };
