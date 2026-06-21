// ==========================================
// Tirage au sort reproductible (graine + Fisher-Yates seedé)
// Partagé entre l'écran de fin (LiveBoard) et l'historique (TournamentAdmin)
// ==========================================

// Génère une graine traçable basée sur timestamp + bytes aléatoires hex
export function generateDrawSeed() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
  return `${ts}-${rand}`;
}

// Mélange Fisher-Yates avec graine (sfc32) pour reproductibilité
export function shuffleArrayWithSeed(arr, seedStr) {
  let h = 1779033703 ^ String(seedStr).length;
  for (let i = 0; i < String(seedStr).length; i++) {
    h = Math.imul(h ^ String(seedStr).charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  let a = (h ^ h >>> 16) >>> 0;
  let b = (Math.imul(h, 2246822507) ^ (h >>> 13)) >>> 0;
  let c = (Math.imul(h, 3266489909) ^ (h >>> 16)) >>> 0;
  let d = 4294967295 >>> 0;
  const rand = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    d = (d + 1) >>> 0;
    return ((t >>> 0) / 4294967296);
  };
  const a2 = [...arr];
  for (let i = a2.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a2[i], a2[j]] = [a2[j], a2[i]];
  }
  return a2;
}

// Libellé français d'une position : 1 -> "1ère place", n -> "Ne place"
export function positionLabel(rank) {
  if (rank == null) return 'Tous les participants';
  return rank === 1 ? '1ère place' : `${rank}e place`;
}

// Retourne les positions (finalRank) ayant des ex-aequo (>= 2 joueurs), triées
export function getTieRanks(ranking) {
  const counts = {};
  (ranking || []).forEach(p => { const r = p.finalRank || 0; if (r) counts[r] = (counts[r] || 0) + 1; });
  return Object.keys(counts).map(Number).filter(r => counts[r] > 1).sort((x, y) => x - y);
}
