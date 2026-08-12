// =============================================
// CTO-006 — Non-régression affichage des contrôles Salle Privée
// A. l'hôte voit Démarrer au bon moment
// C. Démarrer désactivé avant que les conditions soient remplies
// E. socket connectée / reconnexion ne fait pas disparaître les contrôles
// F. Solo (et Arena / Training / Grande Salle) ne voient jamais le lobby privé
// =============================================

const {
  shouldShowPrivateRoomLobby,
  computeHasSidebar,
  isRoomReadyToStart,
} = require('../privateRoomUi');

const base = {
  hasSocket: true,
  isSoloMode: false,
  gsMode: null,
  arenaMatchId: null,
  trainingMatchId: null,
  roomStatus: 'lobby',
  countdownT: null,
  gameActive: false,
};

describe('CTO-006 — visibilité du lobby Salle Privée', () => {
  test('E. socket connectée au lobby → contrôles visibles (bug historique)', () => {
    expect(shouldShowPrivateRoomLobby(base)).toBe(true);
    // La sidebar de jeu ne doit pas masquer le lobby quand la socket vient de se connecter
    expect(
      computeHasSidebar({
        fullScreen: false,
        roomStatus: 'lobby',
        gameActive: false,
        arenaMatchId: null,
        trainingMatchId: null,
        isSoloMode: false,
        socketConnected: true,
        showPrivateRoomLobby: shouldShowPrivateRoomLobby(base),
      })
    ).toBe(false);
  });

  test('countdown serveur → lobby encore affiché (compte à rebours 3-2-1)', () => {
    expect(shouldShowPrivateRoomLobby({ ...base, roomStatus: 'countdown' })).toBe(true);
    expect(shouldShowPrivateRoomLobby({ ...base, countdownT: 2 })).toBe(true);
  });

  test('partie démarrée (round reçu) → lobby masqué et sidebar affichée', () => {
    const playing = { ...base, roomStatus: 'playing', gameActive: true };
    expect(shouldShowPrivateRoomLobby(playing)).toBe(false);
    expect(
      computeHasSidebar({
        fullScreen: false,
        roomStatus: 'playing',
        gameActive: true,
        arenaMatchId: null,
        trainingMatchId: null,
        isSoloMode: false,
        socketConnected: true,
        showPrivateRoomLobby: false,
      })
    ).toBe(true);
  });

  test('F. Solo / Grande Salle / Arena / Training ne voient jamais le lobby privé', () => {
    expect(shouldShowPrivateRoomLobby({ ...base, isSoloMode: true })).toBe(false);
    expect(shouldShowPrivateRoomLobby({ ...base, gsMode: '1' })).toBe(false);
    expect(shouldShowPrivateRoomLobby({ ...base, arenaMatchId: 'm1' })).toBe(false);
    expect(shouldShowPrivateRoomLobby({ ...base, trainingMatchId: 't1' })).toBe(false);
  });

  test('F. Solo garde la sidebar de jeu quand la partie tourne', () => {
    expect(
      computeHasSidebar({
        fullScreen: false,
        roomStatus: 'lobby',
        gameActive: true,
        arenaMatchId: null,
        trainingMatchId: null,
        isSoloMode: true,
        socketConnected: true,
        showPrivateRoomLobby: false,
      })
    ).toBe(true);
  });

  test('Grande Salle connectée garde la sidebar (pas de régression écran blanc)', () => {
    expect(
      computeHasSidebar({
        fullScreen: false,
        roomStatus: 'lobby',
        gameActive: false,
        arenaMatchId: null,
        trainingMatchId: null,
        isSoloMode: false,
        socketConnected: true,
        showPrivateRoomLobby: shouldShowPrivateRoomLobby({ ...base, gsMode: '1' }),
      })
    ).toBe(true);
  });

  test('socket absente → aucun lobby privé', () => {
    expect(shouldShowPrivateRoomLobby({ ...base, hasSocket: false })).toBe(false);
  });
});

describe('CTO-006 — conditions du bouton Démarrer (affichage)', () => {
  test('C. moins de deux joueurs ou joueur non prêt → Démarrer inactif', () => {
    expect(isRoomReadyToStart([])).toBe(false);
    expect(isRoomReadyToStart([{ id: 'a', ready: true }])).toBe(false);
    expect(isRoomReadyToStart([{ id: 'a', ready: true }, { id: 'b', ready: false }])).toBe(false);
  });

  test('A. deux joueurs prêts → Démarrer actif', () => {
    expect(isRoomReadyToStart([{ id: 'a', ready: true }, { id: 'b', ready: true }])).toBe(true);
  });
});
