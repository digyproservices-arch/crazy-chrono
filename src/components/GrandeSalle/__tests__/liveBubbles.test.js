// =============================================
// CTO-007 — Non-régression bulles de réponses Live / Grande Salle
// A. l'écran Live fournit les attributs DOM nécessaires à l'animation
//    (cible [data-cc-vignette] + zones [data-zone-id])
// B. une paire valide déclenche la création des bulles
// C. plusieurs joueurs produisent plusieurs bulles
// D. aucun crash (et aucune boucle infinie) si la cible DOM manque
// =============================================

import React from 'react';
import { render, act } from '@testing-library/react';
import { animateBubblesFromZones } from '../../../utils/gameAnimation';

// react-router-dom v7 est ESM-only: non résolvable par le résolveur Jest de CRA
jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ tournamentId: 't1' }),
  useNavigate: () => () => {},
}), { virtual: true });

jest.mock('socket.io-client', () => {
  const handlers = new Map();
  const socket = {
    on: (event, cb) => {
      handlers.set(event, [...(handlers.get(event) || []), cb]);
      return socket;
    },
    emit: (event, payload, cb) => { if (typeof cb === 'function') cb({ ok: true, status: 'lobby' }); },
    disconnect: () => {},
  };
  return { __esModule: true, default: () => socket, __handlers: handlers };
});

// eslint-disable-next-line global-require
const { __handlers: socketHandlers } = require('socket.io-client');

const emitToClient = (event, data) => {
  act(() => { (socketHandlers.get(event) || []).forEach(cb => cb(data)); });
};

const ZONES = [
  { id: 11, type: 'calcul', content: '3 × 4', pairId: 'p1', points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }] },
  { id: 12, type: 'chiffre', content: '12', pairId: 'p1', points: [{ x: 400, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 200 }, { x: 400, y: 200 }] },
  { id: 13, type: 'calcul', content: '5 + 5', pairId: 'p2', points: [{ x: 100, y: 400 }, { x: 200, y: 400 }, { x: 200, y: 500 }, { x: 100, y: 500 }] },
  { id: 14, type: 'chiffre', content: '10', pairId: 'p2', points: [{ x: 400, y: 400 }, { x: 500, y: 400 }, { x: 500, y: 500 }, { x: 400, y: 500 }] },
  { id: 15, type: 'texte', content: 'chêne', pairId: 'p3', points: [{ x: 700, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 200 }, { x: 700, y: 200 }] },
  { id: 16, type: 'image', content: 'images/chene.png', pairId: 'p3', points: [{ x: 700, y: 400 }, { x: 800, y: 400 }, { x: 800, y: 500 }, { x: 700, y: 500 }] },
];

// Les bulles sont des divs `position: fixed` circulaires de 110px ajoutés au body
const countBubbles = () => Array.from(document.body.querySelectorAll('div')).filter(el => (
  el.style.position === 'fixed' && el.style.borderRadius === '999px' && parseFloat(el.style.width) >= 60
)).length;

// jsdom n'implémente pas la Web Animations API (et CRA réinitialise les jest.fn()
// avant chaque test: on compte donc les appels à la main)
let animateCalls = 0;

beforeAll(() => {
  Element.prototype.animate = function () {
    animateCalls += 1;
    return { onfinish: null, cancel() {}, finish() {} };
  };
  // requestAnimationFrame n'est pas piloté par les timers simulés de Jest
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  // jsdom renvoie des rects nuls: donner une taille aux cibles pour que
  // getVignetteTargetEl() les considère visibles
  Element.prototype.getBoundingClientRect = function () {
    return { left: 10, top: 20, width: 120, height: 40, right: 130, bottom: 60, x: 10, y: 20 };
  };
});

beforeEach(() => {
  jest.useFakeTimers();
  socketHandlers.clear();
  animateCalls = 0;
  document.body.innerHTML = '';
  global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ ok: false }) }));
});

afterEach(() => {
  act(() => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});

function renderLiveBoard() {
  // eslint-disable-next-line global-require
  const LiveBoard = require('../LiveBoard').default;
  return render(<LiveBoard />);
}

describe('CTO-007 — écran Live: attributs DOM requis par l’animation', () => {
  test('A. la carte Live expose une cible [data-cc-vignette] et des zones [data-zone-id]', () => {
    const { container } = renderLiveBoard();
    emitToClient('connect');
    emitToClient('gs:round:new', { zones: ZONES, roundIndex: 1, duration: 60, remainingMs: 60000 });

    expect(document.querySelector('[data-cc-vignette="last-pair"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-zone-id]').length).toBe(ZONES.length);
  });
});

describe('CTO-007 — bulles créées à la réception de gs:pair:valid', () => {
  test('B. une paire valide crée les bulles (une par zone) et les anime', () => {
    renderLiveBoard();
    emitToClient('connect');
    emitToClient('gs:round:new', { zones: ZONES, roundIndex: 1, duration: 60, remainingMs: 60000 });

    expect(countBubbles()).toBe(0);
    emitToClient('gs:pair:valid', { playerName: 'Léa', a: 11, b: 12, leaderboard: [{ id: 'a', name: 'Léa', score: 1 }] });
    act(() => { jest.advanceTimersByTime(120); });

    expect(countBubbles()).toBe(2);
    expect(animateCalls).toBeGreaterThan(0);
  });

  test('C. deux joueurs → deux paires → quatre bulles', () => {
    renderLiveBoard();
    emitToClient('connect');
    emitToClient('gs:round:new', { zones: ZONES, roundIndex: 1, duration: 60, remainingMs: 60000 });

    emitToClient('gs:pair:valid', { playerName: 'Léa', a: 13, b: 14 });
    act(() => { jest.advanceTimersByTime(120); });
    emitToClient('gs:pair:valid', { playerName: 'Tom', a: 15, b: 16 });
    act(() => { jest.advanceTimersByTime(120); });

    expect(countBubbles()).toBe(4);
  });
});

describe('CTO-007 — robustesse: cible DOM absente', () => {
  test('D. aucune exception et aucune bulle si aucune cible [data-cc-vignette] n’existe', () => {
    document.body.innerHTML = '<div data-zone-id="21"></div><div data-zone-id="22"></div>';
    expect(() => {
      animateBubblesFromZones(21, 22, '#3b82f6', ZONES[0], ZONES[1], '#fff', 'AB');
      jest.advanceTimersByTime(60000);
    }).not.toThrow();
    expect(countBubbles()).toBe(0);
    // La relance ne doit pas boucler indéfiniment
    expect(jest.getTimerCount()).toBe(0);
  });
});
