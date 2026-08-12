// =============================================
// CTO-006 — Règles d'affichage des contrôles Salle Privée
// Logique pure extraite de Carte.js pour être testable.
// L'autorisation réelle du démarrage reste côté serveur (CTO-002/003):
// ces règles ne concernent que l'affichage.
// =============================================

// Statuts serveur pendant lesquels la salle privée est encore au lobby
// (aucune manche en cours) → les contrôles Prêt / Démarrer doivent rester visibles.
const LOBBY_STATUSES = ['lobby', 'countdown'];

export function shouldShowPrivateRoomLobby({
  hasSocket,
  isSoloMode,
  gsMode,
  arenaMatchId,
  trainingMatchId,
  roomStatus,
  countdownT,
  gameActive,
}) {
  if (!hasSocket) return false;
  if (isSoloMode || gsMode || arenaMatchId || trainingMatchId) return false;
  if (gameActive) return false;
  return LOBBY_STATUSES.includes(roomStatus) || countdownT !== null;
}

export function computeHasSidebar({
  fullScreen,
  roomStatus,
  gameActive,
  arenaMatchId,
  trainingMatchId,
  isSoloMode,
  socketConnected,
  showPrivateRoomLobby,
}) {
  return !!(
    fullScreen ||
    roomStatus === 'playing' ||
    gameActive ||
    arenaMatchId ||
    trainingMatchId ||
    (!isSoloMode && socketConnected && !showPrivateRoomLobby)
  );
}

// Conditions d'activation du bouton Démarrer (affichage uniquement — le serveur
// revalide hôte + joueurs prêts avant de lancer la partie).
export function isRoomReadyToStart(roomPlayers) {
  const players = Array.isArray(roomPlayers) ? roomPlayers : [];
  return players.length >= 2 && players.every((p) => !!p.ready);
}
