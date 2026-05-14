// =============================================
// Couleurs joueurs — source unique (Phase 2)
// Utilisé par: Carte.js, TrainingArenaGame.js, ArenaSpectator.js
// =============================================

const PLAYER_PRIMARY_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#0ea5e9'];
const PLAYER_BORDER_COLORS = ['#111827', '#fbbf24', '#dc2626'];

function getPlayerColorComboByIndex(idx) {
  const safe = Number.isFinite(idx) ? idx : 0;
  const base = safe < 0 ? 0 : safe;
  const primary = PLAYER_PRIMARY_COLORS[base % PLAYER_PRIMARY_COLORS.length];
  const group = Math.floor(base / PLAYER_PRIMARY_COLORS.length);
  const border = PLAYER_BORDER_COLORS[group % PLAYER_BORDER_COLORS.length];
  return { primary, border };
}

export { PLAYER_PRIMARY_COLORS, PLAYER_BORDER_COLORS, getPlayerColorComboByIndex };
