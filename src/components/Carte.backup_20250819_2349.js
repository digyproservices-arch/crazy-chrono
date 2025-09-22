import React, { useState, useRef, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import '../styles/Carte.css';
import { pointToSvgCoords, polygonToPointsStr, segmentsToSvgPath, pointsToBezierPath } from './CarteUtils';
import { assignElementsToZones, fetchElements } from '../utils/elementsLoader';

function playCorrectSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.26);
  } catch {}
}

function playWrongSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(220, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.36);
  } catch {}
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

// Liste des textes à afficher aléatoirement, sans doublon
const TEXTES_RANDOM = [
  "FARINE CHAUD",
  "Orthosiphon",
  "Patate Chandelier",
  "Soulier zombie",
  "Raifort",
  "Consoude",
  "Ti poul bwa",
  "Douvan Nèg",
  "Tajétes",
  "Plantain",
  "Koklaya",
  "Bleuets",
  "Mélisse",
  "Herbe charpentier",
  "Simen kontra",
  "Paroka",
  "Atoumo",
  "Gingembre",
  "Curcuma",
  "Grenn anba fey",
  "Cannelle",
  "Romarin",
  "Aloé Vera",
  "Gwo Ten",
  "Malnommée"
];

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

// Mapping des zones nécessitant un flip de l'arc pour le texte
const FLIP_TEXT_ARC_ZONE_IDS = {
  1752570164541: true,
  1752570866370: true
};

// Calcule un arc entre deux points, mais avec une marge en pixels sur chaque extrémité
function interpolateArc(points, idxStart, idxEnd, marginPx) {
  const start = points[idxStart];
  const end = points[idxEnd];
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = (Math.hypot(start.x - centerX, start.y - centerY) + Math.hypot(end.x - centerX, end.y - centerY)) / 2;
  const angleStart = Math.atan2(start.y - centerY, start.x - centerX);
  const angleEnd = Math.atan2(end.y - centerY, end.x - centerX);
  let delta = angleEnd - angleStart;
  if (delta < 0) delta += 2 * Math.PI;
  const arcLen = r * delta;
  const marginAngle = marginPx / r;
  const newAngleStart = angleStart + marginAngle;
  const newAngleEnd = angleEnd - marginAngle;
  const newStart = {
    x: centerX + r * Math.cos(newAngleStart),
    y: centerY + r * Math.sin(newAngleStart)
  };
  const newEnd = {
    x: centerX + r * Math.cos(newAngleEnd),
    y: centerY + r * Math.sin(newAngleEnd)
  };
  return { newStart, newEnd, r, centerX, centerY, largeArcFlag: 0, sweepFlag: 1, arcLen, delta };
}

function getArcPathFromZonePoints(points, zoneId, selectedArcPoints, arcPointsFromZone, marginPx = 0) {
  if (!points || points.length < 2) return '';
  let idxStart, idxEnd;
  if (Array.isArray(arcPointsFromZone) && arcPointsFromZone.length === 2) {
    idxStart = arcPointsFromZone[0];
    idxEnd = arcPointsFromZone[1];
  } else if (selectedArcPoints && selectedArcPoints[zoneId] && selectedArcPoints[zoneId].length === 2) {
    idxStart = selectedArcPoints[zoneId][0];
    idxEnd = selectedArcPoints[zoneId][1];
  } else {
    idxStart = 0;
    idxEnd = 1;
  }
  const { newStart, newEnd, r, centerX, centerY, largeArcFlag, sweepFlag } = interpolateArc(points, idxStart, idxEnd, marginPx);
  return `M ${newStart.x},${newStart.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag} ${newEnd.x},${newEnd.y}`;
}

const Carte = () => {
  // ...
  // Sélection interactive des deux points d'arc pour chaque zone texte
  const [selectedArcPoints, setSelectedArcPoints] = useState({}); // { [zoneId]: [idx1, idx2] }
const [arcSelectionMode, setArcSelectionMode] = useState(false); // mode sélection d'arc
  // --- GAME STATE ---
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(0);
  // Historique des sessions multi
  const [sessions, setSessions] = useState([]);
  // Responsive UI state
  const [isMobile, setIsMobile] = useState(false);
  // Socket and timers
  const socketRef = useRef(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const roundNewTimerRef = useRef(null);
  // Expose a stable alias so existing handlers using `socket` keep working
  const socket = socketRef.current;
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  // Overlay gagnant de session
  const [winnerOverlay, setWinnerOverlay] = useState(null); // { text: string, until: number }
  // Rounds/session
  const [roundsPerSession, setRoundsPerSession] = useState(null); // null => infini

  // Initialize socket connection and listeners
  useEffect(() => {
    // Avoid double-connect in strict mode by checking existing
    if (socketRef.current && socketRef.current.connected) return;
    const url = `${window.location.protocol}//${window.location.hostname}:4000`;
    const s = io(url, { transports: ['websocket'], withCredentials: false });
    socketRef.current = s;

    const onConnect = () => {
      setSocketConnected(true);
      console.debug('[CC][client] socket connected', { id: s.id });
      // Rejoindre la salle courante avec le pseudo actuel
      try { s.emit('joinRoom', { roomId, name: playerName }); } catch {}
      // Charger l'historique de sessions
      try { s.emit('session:history:get', (res) => { if (res && res.ok && Array.isArray(res.sessions)) setSessions(res.sessions); }); } catch {}
    };
    const onDisconnect = (reason) => {
      setSocketConnected(false);
      console.debug('[CC][client] socket disconnected', reason);
    };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    // Debug global léger
    try {
      s.onAny?.((event, ...args) => {
        if (event !== 'room:state') {
          console.debug('[CC][client] onAny', event, args && args[0]);
        }
      });
    } catch {}
    s.on('connect_error', (err) => {
      console.warn('[CC][client] socket connect_error', err?.message || err);
    });

    // Compat héritée (scores simples)
    s.on('roomState', ({ players }) => {
      try { setScoresMP((players || []).map(p => ({ id: p.id, name: p.name, score: p.score || 0 }))); } catch {}
    });

    // Nouvel état de salle complet
    s.on('room:state', (data) => {
      console.debug('[CC][client] room:state', data);
      try {
        if (data && typeof data === 'object') {
          if (data.roomCode && data.roomCode !== roomId) setRoomId(data.roomCode);
          if (typeof data.status === 'string') setRoomStatus(data.status);
          if (Array.isArray(data.players)) {
            setRoomPlayers(data.players);
            const me = data.players.find(p => p.id === s.id);
            setIsHost(!!me?.isHost);
            setMyReady(!!me?.ready);
            // Garder la liste des scores à part pour l'affichage compact
            setScoresMP(data.players.map(p => ({ id: p.id, name: p.nickname ?? p.name, score: p.score || 0 })));
          }
          if (Number.isFinite(data.roundsPerSession)) setRoundsPerSession(data.roundsPerSession);
          if (Number.isFinite(data.roundsPlayed)) setRoundsPlayed(data.roundsPlayed);
          if (typeof data.msg === 'string') setMpMsg(data.msg);
        }
      } catch {}
    });

    // Début de manche (compte à rebours visuel)
    s.on('room:countdown', ({ t }) => {
      setCountdownT(typeof t === 'number' ? t : null);
    });

    // Mise à jour de scores en flux
    s.on('score:update', ({ scores }) => {
      const list = Array.isArray(scores) ? scores : [];
      setScoresMP(list);
      // Refléter les scores sur la liste joueurs
      setRoomPlayers(prev => {
        if (!Array.isArray(prev) || !prev.length) return prev;
        const scoreMap = new Map(list.map(p => [p.id, p.score || 0]));
        return prev.map(p => ({ ...p, score: scoreMap.has(p.id) ? scoreMap.get(p.id) : (p.score || 0) }));
      });
    });

    s.on('round:new', (payload) => {
      console.debug('[CC][client] round:new', payload);
      // Clear waiting timer, if any
      try { if (roundNewTimerRef.current) { clearTimeout(roundNewTimerRef.current); roundNewTimerRef.current = null; } } catch {}
      const seed = Number.isFinite(payload?.seed) ? payload.seed : undefined;
      const zonesFile = payload?.zonesFile || 'zones2';
      if (typeof setMpMsg === 'function') setMpMsg('Nouvelle manche');
      // Deterministic assignment based on seed and zones file
      handleAutoAssign(seed, zonesFile);
      // Ensure game state is active
      setGameActive(true);
      setGameSelectedIds([]);
      setGameMsg('');
    });

    // Résultat de manche
    s.on('round:result', ({ winnerId, winnerName }) => {
      console.debug('[CC][client] round:result', { winnerId, winnerName });
      setMpMsg(`${winnerName || 'Un joueur'} a gagné la manche !`);
      try { playCorrectSound?.(); } catch {}
      try { showConfetti?.(); } catch {}
      try { setRoundOverlay({ text: `Gagnant: ${winnerName || 'Un joueur'}`, until: Date.now() + 1500 }); setTimeout(() => setRoundOverlay(null), 1500); } catch {}
    });

    // Temps écoulé
    s.on('round:timeout', ({ roundIndex, roundsTotal }) => {
      console.debug('[CC][client] round:timeout', { roundIndex, roundsTotal });
      setMpMsg('Temps écoulé — aucun gagnant pour cette manche');
      try { setRoundOverlay({ text: 'Temps écoulé', until: Date.now() + 1500 }); setTimeout(() => setRoundOverlay(null), 1500); } catch {}
      try { playWrongSound?.(); } catch {}
    });

    // Fin de session
    s.on('session:end', (summary) => {
      const w = summary && summary.winner;
      const name = w?.name || 'Aucun gagnant';
      const title = summary?.winnerTitle || 'Crazy Winner';
      setMpMsg(`Session terminée. Vainqueur: ${name} (score ${w?.score ?? 0})`);
      try { playCorrectSound?.(); } catch {}
      try { showConfetti?.(); } catch {}
      try { setWinnerOverlay({ text: `${title}: ${name}`, until: Date.now() + 4500 }); setTimeout(() => setWinnerOverlay(null), 4500); } catch {}
      // rafraîchir l'historique
      try {
        s.emit('session:history:get', (res) => {
          if (res && res.ok && Array.isArray(res.sessions)) {
            setSessions(res.sessions);
            try { window.dispatchEvent(new CustomEvent('cc:sessionsUpdated', { detail: { sessions: res.sessions } })); } catch {}
          }
        });
      } catch {}
    });

    s.on('pair:valid', (payload) => {
      console.debug('[CC][client] pair:valid', payload);
      // Réinitialise la sélection et le message local
      setGameSelectedIds([]);
      setGameMsg('');
      // Reshuffle immédiat et déterministe pour tous les clients
      const sn = Number(payload?.seedNext);
      const zf = payload?.zonesFile || 'zones2';
      if (Number.isFinite(sn)) {
        try {
          console.debug('[CC][client] reshuffle with seedNext', { seedNext: sn, zonesFile: zf });
          handleAutoAssign(sn, zf);
        } catch (e) {
          console.error('[CC][client] handleAutoAssign(seedNext) failed', e);
        }
      } else {
        console.warn('[CC][client] pair:valid without valid seedNext; skip reshuffle to keep sync');
      }
    });

    return () => {
      try {
        s.off('connect', onConnect);
        s.off('disconnect', onDisconnect);
        s.off('connect_error');
        s.off('roomState');
        s.off('room:state');
        s.off('room:countdown');
        s.off('score:update');
        s.off('round:new');
        s.off('pair:valid');
        s.off('round:result');
        s.off('round:timeout');
        s.off('session:end');
      } catch {}
      try { s.disconnect(); } catch {}
    };
  }, []);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [roundOverlay, setRoundOverlay] = useState(null); // { text, until }
  // Zones must be declared before any effects that read them
  const [zones, setZones] = useState([]);
  // Declare customTextSettings before effects that may update it
  const [customTextSettings, setCustomTextSettings] = useState({});
  // Log temporaire: ids des zones chiffre (une seule fois après chargement)
  const loggedChiffreIdsRef = useRef(false);
  useEffect(() => {
    try {
      if (!loggedChiffreIdsRef.current && Array.isArray(zones) && zones.length) {
        const chiffres = zones
          .filter(z => normType(z.type) === 'chiffre')
          .map(z => ({ id: z.id, content: z.content }));
        console.log('[CHIFFRE_ZONE_IDS]', chiffres);
        loggedChiffreIdsRef.current = true;
      }
    } catch {}
  }, [zones]);
  // Durée de jeu sélectionnable par le joueur (en secondes)
  const [gameDuration, setGameDuration] = useState(() => {
    const saved = parseInt(localStorage.getItem('gameDuration') || '60', 10);
    return Number.isFinite(saved) && saved > 0 ? saved : 60;
  });
  // Durée sélectionnée au niveau de la salle (host)
  const [roomDuration, setRoomDuration] = useState(60);
  // Garde anti double-score (ex: double validation rapprochée)
  const lastScoreTsRef = useRef(0);
  // Toast pour afficher l'association choisie
  const [assocToast, setAssocToast] = useState(null); // { kind: 'imgtxt'|'calcnum'|'fallback', text: string }
  const assocToastTimerRef = useRef(null);
  const [correctZoneId, setCorrectZoneId] = useState(null);
  const [correctImageZoneId, setCorrectImageZoneId] = useState(null);
  const [gameSelectedIds, setGameSelectedIds] = useState([]); // mémorise les 1-2 clics du joueur
  const [flashWrong, setFlashWrong] = useState(false);
  const [gameMsg, setGameMsg] = useState('');
  const [showBigCross, setShowBigCross] = useState(false);
  const gameContainerRef = useRef(null);
  // Timer pour détecter l'absence de 'round:new' après un démarrage multi (déclaré plus haut)

// --- PERSISTANCE DES POINTS D'ARC ---
useEffect(() => {
  const saved = localStorage.getItem('selectedArcPoints');
  if (saved) {
    setSelectedArcPoints(JSON.parse(saved));
  }
  // Force toutes les couleurs customTextSettings à blanc
  const custom = localStorage.getItem('customTextSettings');
  if (custom) {
    try {
      const parsed = JSON.parse(custom);
      const forced = {};
      Object.keys(parsed).forEach(zoneId => {
        forced[zoneId] = { ...parsed[zoneId], color: '#fff' };
      });
      setCustomTextSettings(forced);
      localStorage.setItem('customTextSettings', JSON.stringify(forced));
    } catch {}
  }
}, []);

// Timer pour le mode jeu
useEffect(() => {
  if (!gameActive) return;
  setTimeLeft(gameDuration);
  const t0 = Date.now();
  const id = setInterval(() => {
    const elapsed = Math.floor((Date.now() - t0) / 1000);
    const remaining = Math.max(0, gameDuration - elapsed);
    setTimeLeft(remaining);
    if (remaining <= 0) {
      clearInterval(id);
      setGameActive(false);
    }
  }, 250);
  return () => clearInterval(id);
}, [gameActive, gameDuration]);

// Persister la durée choisie
useEffect(() => {
  try { localStorage.setItem('gameDuration', String(gameDuration)); } catch {}
}, [gameDuration]);

function startGame() {
  // Si connecté au serveur, lancer une session SOLO via le backend
  if (socket && socket.connected) {
    try {
      socket.emit('startGame');
      setMpMsg('Nouvelle manche');
    } catch {}
    return;
  }
  // Fallback: mode local (sans serveur)
  setScore(0);
  setGameActive(true);
  setGameSelectedIds([]);
  setGameMsg('');
  handleAutoAssign();
}

// Hôte: changer la durée de la salle
function handleSetRoomDuration(val) {
  const d = parseInt(val, 10);
  if (!Number.isFinite(d)) return;
  setRoomDuration(d);
  try { socket && socket.emit('room:duration:set', { duration: d }); } catch {}
}
function showConfetti() {
  // Always append to body to avoid clipping/stacking issues; position fixed uses viewport
  const container = gameContainerRef.current;
  const root = document.body;
  const rect = (container && container.getBoundingClientRect) ? container.getBoundingClientRect() : root.getBoundingClientRect();
  for (let i = 0; i < 36; i++) {
    const d = document.createElement('div');
    const size = 6 + Math.random() * 6;
    d.style.position = 'fixed';
    d.style.zIndex = '99999';
    d.style.left = `${rect.left + rect.width / 2}px`;
    d.style.top = `${rect.top + 60}px`;
    d.style.width = `${size}px`;
    d.style.height = `${size}px`;
    d.style.background = `hsl(${Math.floor(Math.random() * 360)},90%,55%)`;
    d.style.borderRadius = '2px';
    d.style.pointerEvents = 'none';
    root.appendChild(d);
    const dx = (Math.random() - 0.5) * rect.width;
    const dy = 120 + Math.random() * 200;
    d.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0 }
    ], { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => d.remove();
  }
}

function showWrongFlash() {
  setFlashWrong(true);
  setTimeout(() => setFlashWrong(false), 350);
}

// Affiche un toast d'association pendant un court instant
function showAssocToast(kind, text) {
  // Nettoyer un éventuel timer précédent
  if (assocToastTimerRef.current) {
    clearTimeout(assocToastTimerRef.current);
    assocToastTimerRef.current = null;
  }
  setAssocToast({ kind, text });
  assocToastTimerRef.current = setTimeout(() => {
    setAssocToast(null);
    assocToastTimerRef.current = null;
  }, 1600);
}

// Fin de drag: on nettoie les états pour permettre de nouveaux drags
function handleMouseUp() {
  setDraggedIdx(null);
  setDraggedHandle(null);
  if (dragState.id) {
    setDragState({ id: null, start: null, orig: null, moved: false });
  }
  setIsDragging(false);
}

function handleGameClick(zone) {
  if (!gameActive || !zone) return;
  // si déjà 2, réinitialiser avant de prendre un nouveau clic
  if (gameSelectedIds.length >= 2) {
    setGameSelectedIds([zone.id]);
    return;
  }
  setGameSelectedIds(prev => {
    const next = [...prev, zone.id];
    if (next.length === 2) {
      const [a, b] = next;
      if (a === b) {
        // ignorer double clic sur la même zone
        return [a];
      }
      const ZA = zones.find(z => z.id === a);
      const ZB = zones.find(z => z.id === b);
      const t1 = normType(ZA?.type);
      const t2 = normType(ZB?.type);
      const allowed = (x, y) => (x === 'image' && y === 'texte') || (x === 'texte' && y === 'image') || (x === 'calcul' && y === 'chiffre') || (x === 'chiffre' && y === 'calcul');
      const p1 = getPairId(ZA);
      const p2 = getPairId(ZB);
      const okPair = ZA && ZB && allowed(t1, t2) && p1 && p2 && (p1 === p2);
      if (okPair) {
        console.log('[GAME] OK pair', { a, b, ZA: { id: ZA.id, type: ZA.type, pairId: ZA.pairId }, ZB: { id: ZB.id, type: ZB.type, pairId: ZB.pairId } });
        // Multiplayer: si socket connecté, on envoie au serveur mais on donne un feedback immédiat côté client
        if (socket && socket.connected) {
          try { socket.emit('attemptPair', { a, b }); } catch {}
          // Feedback instantané au joueur, sans avancer de manche côté client
          setGameMsg('Bravo !');
          playCorrectSound();
          showConfetti();
          try {
            const imgTxt = (t1 === 'image' && t2 === 'texte') || (t1 === 'texte' && t2 === 'image');
            const calcNum = (t1 === 'calcul' && t2 === 'chiffre') || (t1 === 'chiffre' && t2 === 'calcul');
            if (imgTxt) {
              const imgContent = (t1 === 'image' ? ZA?.content : ZB?.content) || '';
              const txtContent = (t1 === 'texte' ? ZA?.content : ZB?.content) || '';
              const text = `${imgContent} ↔ ${txtContent}`.trim();
              showAssocToast('imgtxt', text);
            } else if (calcNum) {
              const calc = (t1 === 'calcul' ? ZA?.content : ZB?.content) || '';
              const num = (t1 === 'chiffre' ? ZA?.content : ZB?.content) || '';
              const text = `${calc} = ${num}`.trim();
              showAssocToast('calcnum', text);
            }
          } catch {}
          // Réinitialiser la sélection rapidement pour fluidifier l'expérience
          setTimeout(() => { setGameSelectedIds([]); setGameMsg(''); }, 450);
          // Le score et le tableau des joueurs seront mis à jour via 'score:update' serveur
        } else {
          // Mode solo local (fallback)
          setGameMsg('Bravo !');
          playCorrectSound();
          showConfetti();
          try {
            const imgTxt = (t1 === 'image' && t2 === 'texte') || (t1 === 'texte' && t2 === 'image');
            const calcNum = (t1 === 'calcul' && t2 === 'chiffre') || (t1 === 'chiffre' && t2 === 'calcul');
            if (imgTxt) {
              const imgContent = (t1 === 'image' ? ZA?.content : ZB?.content) || '';
              const txtContent = (t1 === 'texte' ? ZA?.content : ZB?.content) || '';
              const text = `${imgContent} ↔ ${txtContent}`.trim();
              showAssocToast('imgtxt', text);
            } else if (calcNum) {
              const calc = (t1 === 'calcul' ? ZA?.content : ZB?.content) || '';
              const num = (t1 === 'chiffre' ? ZA?.content : ZB?.content) || '';
              const text = `${calc} = ${num}`.trim();
              showAssocToast('calcnum', text);
            }
          } catch {}
          const nowTs = Date.now();
          if (nowTs - (lastScoreTsRef.current || 0) > 600) {
            setScore(s => s + 1);
            lastScoreTsRef.current = nowTs;
          }
          setTimeout(() => {
            setGameSelectedIds([]);
            setGameMsg('');
            // En multi, on ne reshuffle pas localement pour garder la sync entre joueurs
            if (!(socket && socket.connected)) {
              // Mode solo/local
              handleAutoAssign();
            }
          }, 450);
        }
      } else {
        console.log('[GAME] BAD pair', { a, b, ZA: ZA && { id: ZA.id, type: ZA.type, pairId: ZA.pairId }, ZB: ZB && { id: ZB.id, type: ZB.type, pairId: ZB.pairId } });
        setGameMsg('Mauvaise association');
        setShowBigCross(true);
        playWrongSound();
        showWrongFlash();
        // laisser l'effet visuel un court instant puis reset
        setTimeout(() => { setGameSelectedIds([]); setGameMsg(''); setShowBigCross(false); }, 400);
      }
    }
    return next;
  });
}

useEffect(() => {
  localStorage.setItem('selectedArcPoints', JSON.stringify(selectedArcPoints));
}, [selectedArcPoints]);

  // Fonction pour sélectionner/désélectionner un point pour l'arc du texte
  const handleArcPointClick = (zoneId, idx) => {
    setSelectedArcPoints(prev => {
      const current = prev[zoneId] || [];
      if (current.includes(idx)) {
        // Si déjà sélectionné, on l'enlève
        const newArc = current.filter(i => i !== idx);
        setTimeout(() => {
          if (newArc.length === 2) {
            console.log(`[ArcPoints] Zone ${zoneId}: [${newArc[0]}, ${newArc[1]}]`);
          }
        }, 0);
        return { ...prev, [zoneId]: newArc };
      } else if (current.length < 2) {
        // Ajoute le point (max 2)
        const newArc = [...current, idx];
        setTimeout(() => {
          if (newArc.length === 2) {
            console.log(`[ArcPoints] Zone ${zoneId}: [${newArc[0]}, ${newArc[1]}]`);
          }
        }, 0);
        return { ...prev, [zoneId]: newArc };
      } else {
        // Si déjà 2, on remplace le plus ancien
        const newArc = [current[1], idx];
      setTimeout(() => {
        if (newArc.length === 2) {
          console.log(`[ArcPoints] Zone ${zoneId}: [${newArc[0]}, ${newArc[1]}]`);
        }
      }, 0);
      return { ...prev, [zoneId]: newArc };
      }
    });
  };

  // --- Tous les hooks d'abord (ordre strict !) ---
  // Paramètres personnalisés pour le texte courbé des zones vertes
  const [editingZoneId, setEditingZoneId] = useState(null);
  // Pour édition directe sur le texte courbé
  const [editingTextZoneId, setEditingTextZoneId] = useState(null);
  const [editingTextValue, setEditingTextValue] = useState('');

  // Valeurs par défaut pour l'édition
  const defaultTextSettings = {
    text: '',
    angle: 0,
    fontSize: 32,
    fontFamily: 'Arial',
    color: '#fff'
  };

  // Ouvre le panneau d'édition avancée pour une zone verte
  const handleEditGreenZone = (zone) => {
    // Ne jamais ouvrir l'éditeur en mode jeu
    if (gameActive) return;
    setEditingZoneId(zone.id);
    setCustomTextSettings(settings => ({
      ...settings,
      [zone.id]: {
        ...defaultTextSettings,
        ...settings[zone.id],
        text: zone.content || settings[zone.id]?.text || '',
      }
    }));
  };

  // Met à jour un paramètre du texte courbé
  const updateTextSetting = (zoneId, key, value) => {
    setCustomTextSettings(settings => ({
      ...settings,
      [zoneId]: {
        ...settings[zoneId],
        [key]: value
      }
    }));
  };

  // Valide et applique les modifs
  const validateTextSettings = (zoneId) => {
    // Optionnel : tu peux aussi mettre à jour le contenu principal de la zone ici
    setEditingZoneId(null);
  };

  // Ferme l'édition sans valider
  const cancelTextSettings = () => setEditingZoneId(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [editPoints, setEditPoints] = useState([]); // [{x, y, handleIn, handleOut}]
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [draggedHandle, setDraggedHandle] = useState(null); // {idx, type: 'in'|'out'}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedZoneId, setCopiedZoneId] = useState(null);
  const [zoneColor, setZoneColor] = useState('yellow');
  const [selectedPointIdx, setSelectedPointIdx] = useState(null);
  const [hoveredZoneId, setHoveredZoneId] = useState(null);
  // --- Multiplayer state ---
  const [roomId, setRoomId] = useState('default');
  const [playerName, setPlayerName] = useState(() => {
    const rnd = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `Joueur-${rnd}`;
  });
  const [scoresMP, setScoresMP] = useState([]); // [{id,name,score}]
  const [mpMsg, setMpMsg] = useState('');
  // Lobby/ready state
  const [roomStatus, setRoomStatus] = useState('lobby'); // 'lobby'|'countdown'|'playing'
  const [roomPlayers, setRoomPlayers] = useState([]); // [{id,nickname,score,ready,isHost}]
  const [isHost, setIsHost] = useState(false);
  const [myReady, setMyReady] = useState(false);
  const [countdownT, setCountdownT] = useState(null);
  // Rotation en degrés des contenus pour zones calcul/chiffre (par id de zone)
  const [calcAngles, setCalcAngles] = useState(() => {
    try {
      const raw = localStorage.getItem('cc_calc_angles');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  // Offsets manuels pour déplacer chiffre/calcul à la souris
  const [mathOffsets, setMathOffsets] = useState(() => {
    try {
      const raw = localStorage.getItem('cc_math_offsets');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }); // { [zoneId]: { x, y } }
  const [dragState, setDragState] = useState({ id: null, start: null, orig: null, moved: false });

  useEffect(() => {
    try { localStorage.setItem('cc_calc_angles', JSON.stringify(calcAngles)); } catch {}
  }, [calcAngles]);
  useEffect(() => {
    try { localStorage.setItem('cc_math_offsets', JSON.stringify(mathOffsets)); } catch {}
  }, [mathOffsets]);

  // --- Edit mode and backend sync for positions/angles ---
  const [editMode, setEditMode] = useState(false);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  const [isSavingPositions, setIsSavingPositions] = useState(false);

  // Load saved positions/angles from backend once on mount
  useEffect(() => {
    let abort = false;
    const load = async () => {
      try {
        setIsLoadingPositions(true);
        const apiBase = `${window.location.protocol}//${window.location.hostname}:4000`;
        const res = await fetch(`${apiBase}/math-positions`, { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (abort) return;
        if (data && typeof data === 'object') {
          const payload = data.data && typeof data.data === 'object' ? data.data : data;
          if (payload.mathOffsets && typeof payload.mathOffsets === 'object') {
            setMathOffsets(prev => ({ ...prev, ...payload.mathOffsets }));
          }
          if (payload.calcAngles && typeof payload.calcAngles === 'object') {
            setCalcAngles(prev => ({ ...prev, ...payload.calcAngles }));
          }
          // Sync to localStorage for this origin so both localhost and LAN keep a copy
          try {
            if (payload.mathOffsets) localStorage.setItem('cc_math_offsets', JSON.stringify(payload.mathOffsets));
            if (payload.calcAngles) localStorage.setItem('cc_calc_angles', JSON.stringify(payload.calcAngles));
          } catch {}
        }
        setMpMsg && setMpMsg('Positions chargées');
      } catch (e) {
        console.warn('Load math positions failed:', e);
      } finally {
        if (!abort) setIsLoadingPositions(false);
      }
    };
    load();
    return () => { abort = true; };
  }, []);

  // Responsive: détecte mobile et ajuste les panneaux pour ne pas masquer la carte
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // Par défaut sur mobile, réduire le panneau et masquer l'historique
      setPanelCollapsed(mobile);
      setHistoryExpanded(!mobile);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Disable edit mode when a game starts/room playing
  useEffect(() => {
    if (gameActive || roomStatus === 'playing') {
      setEditMode(false);
    }
  }, [gameActive, roomStatus]);

  const handleToggleEditMode = () => {
    if (gameActive || roomStatus === 'playing') return; // safety
    setEditMode(v => !v);
    setMpMsg && setMpMsg(prev => (prev ? prev + ' • ' : '') + (!editMode ? 'Mode édition ON' : 'Mode édition OFF'));
  };

  const handleSaveMathPositions = async () => {
    if (gameActive || roomStatus === 'playing') return;
    try {
      setIsSavingPositions(true);
      const apiBase = `${window.location.protocol}//${window.location.hostname}:4000`;
      const res = await fetch(`${apiBase}/save-math-positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mathOffsets, calcAngles })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const out = await res.json();
      if (out && (out.ok || out.success)) {
        setMpMsg && setMpMsg('Positions enregistrées');
        // Keep localStorage in sync for current origin
        try {
          localStorage.setItem('cc_math_offsets', JSON.stringify(mathOffsets));
          localStorage.setItem('cc_calc_angles', JSON.stringify(calcAngles));
        } catch {}
      } else {
        setMpMsg && setMpMsg('Échec enregistrement positions');
      }
    } catch (e) {
      console.error('Save math positions failed:', e);
      setMpMsg && setMpMsg('Erreur enregistrement');
    } finally {
      setIsSavingPositions(false);
    }
  };

  // Listen to NavBar global events (added in NavBar.js)
  useEffect(() => {
    const onToggle = () => handleToggleEditMode();
    const onSave = () => handleSaveMathPositions();
    window.addEventListener('cc:toggleEditMode', onToggle);
    window.addEventListener('cc:saveMathPositions', onSave);
    return () => {
      window.removeEventListener('cc:toggleEditMode', onToggle);
      window.removeEventListener('cc:saveMathPositions', onSave);
    };
  }, [handleToggleEditMode, handleSaveMathPositions]);

  // Broadcast editMode changes to NavBar so it can style ON/OFF
  useEffect(() => {
    try {
      const evt = new CustomEvent('cc:editModeChanged', { detail: { editMode } });
      window.dispatchEvent(evt);
    } catch (e) {
      // Fallback for environments without CustomEvent
      window.dispatchEvent(new Event('cc:editModeChanged'));
    }
  }, [editMode]);

  // (Supprimé) Ancienne connexion Socket.IO MVP (port 4001) remplacée par la connexion unifiée via socketRef au début du composant.

  // Expose des hooks CustomEvent pour NavBar / autres composants
  useEffect(() => {
    function onEndSessionReq() {
      if (!socket) return;
      try { socket.emit('session:end'); } catch {}
    }
    function onHistoryRefreshReq() {
      if (!socket) return;
      try {
        socket.emit('session:history:get', (res) => {
          if (res && res.ok && Array.isArray(res.sessions)) {
            setSessions(res.sessions);
            try { window.dispatchEvent(new CustomEvent('cc:sessionsUpdated', { detail: { sessions: res.sessions } })); } catch {}
          }
        });
      } catch {}
    }
    window.addEventListener('cc:endSession', onEndSessionReq);
    window.addEventListener('cc:history:refresh', onHistoryRefreshReq);
    return () => {
      window.removeEventListener('cc:endSession', onEndSessionReq);
      window.removeEventListener('cc:history:refresh', onHistoryRefreshReq);
    };
  }, [socket]);

  // Actions lobby
  const handleCreateRoom = () => {
    if (!socket) return;
    try {
      socket.emit('room:create', (res) => {
        if (res?.ok && res.roomCode) {
          setRoomId(res.roomCode);
          socket.emit('joinRoom', { roomId: res.roomCode, name: playerName });
        }
      });
    } catch {}
  };
  const handleJoinRoom = () => {
    if (!socket || !roomId) return;
    try { socket.emit('joinRoom', { roomId, name: playerName }); } catch {}
  };
  const handleToggleReady = () => {
    if (!socket) return;
    try { socket.emit('ready:toggle', { ready: !myReady }); setMyReady(r => !r); } catch {}
  };
  const handleStartRoom = () => {
    if (!socket) return;
    try {
      console.debug('[CC][client] emit room:start');
      socket.emit('room:start');
      // Lancer un timer de sécurité: si pas de 'round:new' sous 3s, prévenir dans les logs et l'UI
      if (roundNewTimerRef.current) {
        clearTimeout(roundNewTimerRef.current);
        roundNewTimerRef.current = null;
      }
      roundNewTimerRef.current = setTimeout(() => {
        console.warn('[CC][client] round:new non reçu 3s après room:start');
        setMpMsg && setMpMsg('En attente du serveur… (round non reçu)');
      }, 3000);
    } catch (e) {
      console.warn('[CC][client] emit room:start failed', e);
    }
  };
  const handleLeaveRoom = () => {
    if (!socket) return;
    try {
      setMyReady(false);
      setRoomStatus('lobby');
      socket.emit('joinRoom', { roomId: 'default', name: playerName });
      setRoomId('default');
    } catch {}
  };

  // Hôte: définir le nombre de manches par session
  const handleSetRounds = (value) => {
    if (!socket) return;
    const n = value === 'inf' ? 'inf' : Number(value);
    console.debug('[CC][client] setRounds emit', { raw: value, parsed: n });
    // MAJ locale immédiate pour refléter le choix
    setRoundsPerSession(n === 'inf' ? null : (Number.isFinite(n) ? n : null));
    try {
      socket.emit('room:setRounds', n === 'inf' ? Infinity : n, (res) => {
        console.debug('[CC][client] setRounds ack', res);
        if (res && res.ok) {
          setRoundsPerSession(Number.isFinite(res.roundsPerSession) ? res.roundsPerSession : null);
        }
      });
    } catch (e) {
      console.warn('[CC][client] setRounds emit failed', e);
    }
  };

  // Référence de taille moyenne des zones chiffre pour homogénéiser leur taille
  const chiffreRefBase = useMemo(() => {
    try {
      if (!Array.isArray(zones) || zones.length === 0) return null;
      const bases = zones
        .filter(z => z?.type === 'chiffre' && Array.isArray(z.points) && z.points.length)
        .map(z => {
          const b = getZoneBoundingBox(z.points);
          return Math.max(12, Math.min(b.width, b.height));
        });
      if (!bases.length) return null;
      const avg = bases.reduce((a, b) => a + b, 0) / bases.length;
      return avg;
    } catch {
      return null;
    }
  }, [zones]);
  const [selectedZoneIds, setSelectedZoneIds] = useState([]);
  const [attributionMode, setAttributionMode] = useState(false);
  const [zoneToEdit, setZoneToEdit] = useState(null);
  const [formData, setFormData] = useState({ type: '', content: '', pairId: '' });
  const [draggedZoneId, setDraggedZoneId] = useState(null);
  const [dragOrigin, setDragOrigin] = useState(null);
  const [prevEditingZone, setPrevEditingZone] = useState(null);
  const svgOverlayRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const skipNextClickRef = useRef(false);
  const [texts, setTexts] = useState({
    top: '417',
    topRight: '3/7 x 11',
    right: '219',
    bottomRight: '42 x 16',
    bottom: '15',
    bottomLeft: '9 x 7',
    left: '80',
    topLeft: 'Quenette'
  });
  const [topLinkUrl, setTopLinkUrl] = useState('https://example.com');
  const [copiedDebugZoneId, setCopiedDebugZoneId] = useState(null);
  // Gestion des retries ciblés pour certaines images problématiques
  const [retryMap, setRetryMap] = useState({}); // { [contentPath]: retryCount }
  const problematicList = useRef(new Set([
    'images/2024-09-10 13-37-16 (10).jpeg'
  ]));

  // --- Hooks useEffect ---
  useEffect(() => {
    // On vide le localStorage à chaque chargement pour forcer la randomisation
    localStorage.removeItem('zones');
    localStorage.removeItem('customTextSettings');
  }, []);

  // Préchargement ciblé des images problématiques (réduit les ratés au premier rendu)
  useEffect(() => {
    const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    problematicList.current.forEach(p => {
      const full = p.startsWith('http') ? p : `${base}/${p.startsWith('/') ? p.slice(1) : p}`;
      const src = encodeURI(full)
        .replace(/ /g, '%20')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
      const im = new Image();
      im.src = src + `#preload=${Date.now()}`;
    });
  }, []);

  useEffect(() => {
    const fetchZones = async () => {
      try {
        setError(null); // ou setError("")
        const tryFetch = async (path) => {
          const r = await fetch(path);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        };
        const p2 = process.env.PUBLIC_URL + '/data/zones2.json';
        const p1 = process.env.PUBLIC_URL + '/data/zones.json';
        let data;
        try {
          console.log('Tentative chargement initial', p2);
          data = await tryFetch(p2);
        } catch (e1) {
          console.warn('zones2.json indisponible, fallback vers zones.json');
          data = await tryFetch(p1);
        }
        console.log('ZONES JSON CHARGÉ:', data);
        // Attribution aléatoire des textes aux zones de type 'texte' (aucun doublon)
const zonesTexte = data.filter(z => z.type === 'texte');
const zonesImage = data.filter(z => z.type === 'image');
const zonesCalcul = data.filter(z => z.type === 'calcul');
const zonesChiffre = data.filter(z => z.type === 'chiffre');

let textesMelanges = shuffleArray(TEXTES_RANDOM);
// Attribution unique
const dataWithRandomTexts = data.map(z => {
  if (z.type === 'texte') {
    return { ...z, content: textesMelanges.pop() || '' };
  }
  return z;
});

// Correspondance unique texte <-> image
let correspondanceTexteImage = null;
if (zonesTexte.length && zonesImage.length) {
  const zoneTexte = shuffleArray(zonesTexte)[0];
  const zoneImage = shuffleArray(zonesImage)[0];
  correspondanceTexteImage = { texteId: zoneTexte.id, imageId: zoneImage.id };
}
// Correspondance unique calcul <-> chiffre
let correspondanceCalculChiffre = null;
if (zonesCalcul.length && zonesChiffre.length) {
  const zoneCalcul = shuffleArray(zonesCalcul)[0];
  const zoneChiffre = shuffleArray(zonesChiffre)[0];
  correspondanceCalculChiffre = { calculId: zoneCalcul.id, chiffreId: zoneChiffre.id };
}
// Tu peux stocker ces correspondances dans le state si tu veux les exploiter dans l’UI
console.log('Attribution aléatoire appliquée :', dataWithRandomTexts);
setZones(dataWithRandomTexts);
        setLoading(false);
      } catch (e) {
        const msg = 'Erreur lors du chargement des zones (zones2.json puis zones.json) : ' + e.message;
        setError(msg);
        setLoading(false);
        alert(msg);
      }
    };
    // Priorité au localStorage si présent (ex: nettoyages faits depuis l'Admin)
    try {
      const saved = localStorage.getItem('zones');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Log hash pour debug
          try {
            const boardHash = (() => {
              const s = JSON.stringify(parsed.map(z => ({ id: z.id, type: z.type, content: z.content })));
              let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
              return h;
            })();
            console.debug('[CC][client] setZones legacy with hash', boardHash);
          } catch {}
          setZones(parsed);
          setLoading(false);
          return; // ne pas refetch si on a déjà des zones locales
        }
      }
    } catch {}
    fetchZones();
  }, []);

  useEffect(() => {
    localStorage.setItem('zones', JSON.stringify(zones));
  }, [zones]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedPointIdx !== null) {
          setEditPoints(points => points.filter((_, i) => i !== selectedPointIdx));
          setSelectedPointIdx(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedPointIdx]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedPointIdx !== null) {
          setEditPoints(points => points.filter((_, i) => i !== selectedPointIdx));
          setSelectedPointIdx(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedPointIdx]);

  // Ensure drag stops even if mouseup happens outside the SVG (top-level effect)
  useEffect(() => {
    const onWinMouseUp = () => {
      setDraggedIdx(null);
      setDraggedHandle(null);
      setIsDragging(false);
    };
    window.addEventListener('mouseup', onWinMouseUp);
    return () => window.removeEventListener('mouseup', onWinMouseUp);
  }, []);

  if (error) {
    return (
      <div style={{ background: '#ffeaea', color: '#b30000', padding: '24px', border: '2px solid #b30000', borderRadius: 8, margin: 32, fontSize: 20, textAlign: 'center', fontWeight: 'bold' }}>
        <span>❌ Erreur lors du chargement des zones :</span>
        <br />
        <span style={{ fontSize: 16, fontWeight: 'normal' }}>{error}</span>
        <br /><br />
        <span>Vérifie le fichier <b>public/data/zones2.json</b> (syntaxe JSON, crochets, etc.)</span>
      </div>
    );
  }

  // Fonction pour recharger zones.json et elements.json avant attribution automatique
  // Option C: zonesFile ('zones2' | 'zones') force la source de zones pour garantir la même base chez tous
  async function handleAutoAssign(seed, zonesFile) {
    const rng = makeRngFromSeed(seed);
    const deterministicSync = (zonesFile === 'zones2' || zonesFile === 'zones') || Number.isFinite(seed);
    try {
      // Tente zones2.json puis fallback vers zones.json
      const tryFetch = async (path) => {
        const r = await fetch(path);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('application/json')) {
          // Évite de parser du HTML (ex: index.html) comme JSON
          const snippet = (await r.text()).slice(0, 120);
          throw new Error('Non-JSON response for ' + path + ': ' + snippet);
        }
        return r.json();
      };
      let zonesData;
      const p2 = process.env.PUBLIC_URL + '/data/zones2.json';
      const p1 = process.env.PUBLIC_URL + '/data/zones.json';
      // Si le serveur impose zonesFile ('zones2' | 'zones'), on l'utilise strictement; sinon fallback déterministe.
      const useForced = zonesFile === 'zones2' || zonesFile === 'zones';
      const forcedPath = useForced ? (zonesFile === 'zones2' ? p2 : p1) : null;
      if (useForced) {
        try {
          console.debug('[CC][client] handleAutoAssign: forced zones file', { zonesFile, path: forcedPath, seed });
          zonesData = await tryFetch(forcedPath);
        } catch (eForce) {
          console.warn('[CC][client] handleAutoAssign: failed to load forced zones file; skip reshuffle to keep sync', { zonesFile, path: forcedPath, error: String(eForce) });
          return; // éviter divergence
        }
      } else {
        try {
          console.log('Tentative chargement', p2);
          zonesData = await tryFetch(p2);
        } catch (e1) {
          console.warn('zones2.json indisponible, fallback vers zones.json');
          zonesData = await tryFetch(p1);
        }
      }
      // --- RANDOMISATION DES TEXTES ---
      const zonesTexte = zonesData.filter(z => z.type === 'texte');
      let textesMelanges = shuffleArray(TEXTES_RANDOM, rng);
      const dataWithRandomTexts = zonesData.map(z => {
        if (z.type === 'texte') {
          return { ...z, content: textesMelanges.pop() || '' };
        }
        return z;
      });
      console.log('ZONES CHARGED', dataWithRandomTexts.filter(z => z.id === 1752571493404 || z.id === 1752571661490));
      console.log('DEBUG ZONES AVANT ATTRIB', dataWithRandomTexts.filter(z => z.id === 1752571493404 || z.id === 1752571661490));
      const elementsData = await fetchElements();
      let updatedZones = await assignElementsToZones(dataWithRandomTexts, elementsData, undefined, rng);
      // Éviter toute divergence en multi: ne pas faire de post-traitements dépendants du réseau
      if (!deterministicSync) {
        // Filtrer les images qui ne sont plus listées dans l'Admin (associations.json)
        try {
          const assocResp = await fetch(process.env.PUBLIC_URL + '/data/associations.json');
          const assoc = await assocResp.json();
          const knownImages = new Set((assoc?.images || []).map(i => i.url && i.url.toLowerCase().replace(/\\/g, '/')));
          const norm = (p) => {
            if (!p) return '';
            try { p = decodeURIComponent(p); } catch {}
            p = p.toLowerCase().replace(/\\/g, '/');
            const pub = (process.env.PUBLIC_URL || '').toLowerCase();
            if (pub && p.startsWith(pub)) p = p.slice(pub.length);
            if (p.startsWith('/')) p = p.slice(1);
            return p;
          };
          // Fallback pool: only images that are also known by Admin
          const fallbackPool = (elementsData || [])
            .filter(e => e?.type === 'image' && e?.content && knownImages.has(norm(e.content)))
            .slice();
          // Mélange le pool de fallback pour éviter de revoir toujours les mêmes
          for (let i = fallbackPool.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [fallbackPool[i], fallbackPool[j]] = [fallbackPool[j], fallbackPool[i]];
          }
          let fIdx = fallbackPool.length ? Math.floor(rng() * fallbackPool.length) : 0;
          updatedZones = updatedZones.map(z => {
            if (z?.type === 'image' && z?.content && !knownImages.has(norm(z.content))) {
              if (fallbackPool.length) {
                const e = fallbackPool[fIdx % fallbackPool.length];
                fIdx++;
                return { ...z, type: 'image', content: e.content, label: e.label || '', pairId: e.pairId || '' };
              }
              return { ...z, content: '', label: '', pairId: '' };
            }
            return z;
          });
        } catch (e) {
          console.warn('Filtrage images inconnues ignoré:', e);
        }
      }
      // Ne pas setter les zones ici pour éviter des états intermédiaires différents entre clients
      // Synchronise customTextSettings pour zones texte
      const newTextSettings = {};
      updatedZones.forEach(zone => {
        if (zone.type === 'texte') {
          newTextSettings[zone.id] = {
            ...defaultTextSettings,
            text: zone.content || ''
          };
        }
      });
      // Charger les associations pour l'algorithme "1 seule bonne association"
      let assocData = {};
      try {
        const respAssoc = await fetch(process.env.PUBLIC_URL + '/data/associations.json');
        assocData = await respAssoc.json();
      } catch (e) {
        console.warn('Impossible de charger associations.json pour l\'attribution:', e);
        if (deterministicSync) {
          console.warn('[CC][client] deterministic mode: skip reshuffle due to associations fetch failure to keep sync');
          return; // éviter divergence si un client échoue
        }
      }
      let validated = await assignElementsToZones(updatedZones, elementsData, assocData, rng);
      if (!deterministicSync) {
        // Vérification et auto-réparation des URLs d'images (réseau): uniquement en mode local/legacy
        async function verifyImageUrl(url) {
          if (!url) return null;
          const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
          const candidates = [];
          const dec = (() => { try { return decodeURIComponent(url); } catch { return url; } })();
          const filename = dec.split('/').pop();
          candidates.push(url);
          candidates.push(dec);
          candidates.push('images/' + filename);
          candidates.push('/images/' + filename);
          candidates.push(base + '/images/' + filename);
          // Root-level fallbacks (files found directement sous public/)
          candidates.push(filename);
          candidates.push('/' + filename);
          candidates.push(base + '/' + filename);
          candidates.push('images/' + encodeURIComponent(filename));
          candidates.push(base + '/images/' + encodeURIComponent(filename));
          for (const cand of candidates) {
            try {
              const res = await fetch(cand, { method: 'GET' });
              if (res.ok) return cand;
            } catch (e) {
              // ignore and try next
            }
          }
          return null;
        }
        validated = await Promise.all(
          validated.map(async (z) => {
            if (z?.type === 'image' && z?.content) {
              const ok = await verifyImageUrl(z.content);
              if (ok && ok !== z.content) {
                return { ...z, content: ok };
              }
            }
            return z;
          })
        );
      }
      // --- Post-traitement: garantir AU MOINS UNE association vraie ---
      function parseOperation(s) {
        if (!s) return null;
        const str = String(s).trim().replace(/\s+/g, '').replace(/×/g, 'x').replace(/÷/g, '/');
        const m = str.match(/^(-?\d+)([+\-x*\/:])(-?\d+)$/i);
        if (!m) return null;
        const a = parseInt(m[1], 10);
        const op = m[2];
        const b = parseInt(m[3], 10);
        if (Number.isNaN(a) || Number.isNaN(b)) return null;
        let result;
        switch (op) {
          case '+': result = a + b; break;
          case '-': result = a - b; break;
          case 'x':
          case '*': result = a * b; break;
          case '/': result = b !== 0 ? a / b : NaN; break;
          case ':': result = b !== 0 ? a / b : NaN; break;
          default: result = NaN;
        }
        if (!Number.isFinite(result)) return null;
        return { a, b, op, result };
      }
      function randomDistractorText(exclude = []) {
        const pool = TEXTES_RANDOM.filter(t => !exclude.includes(t));
        if (pool.length === 0) return '';
        return pool[Math.floor(rng() * pool.length)];
      }
      // Identifie une image "principale" et garantit qu'au moins un texte partage son pairId
      let post = validated.map(z => ({ ...z }));
      const selectedCalcIdxs = new Set(); // protéger le calcul choisi si c'est une paire calc-chiffre
      let hadAnyAdminPairAssigned = false; // indique si on a pu poser 1 vraie paire Admin
      try {
        if (assocData && assocData.associations) {
          const imagesIdx = post.map((z, i) => ({ z, i })).filter(o => normType(o.z?.type) === 'image');
          const textesIdx = post.map((z, i) => ({ z, i })).filter(o => normType(o.z?.type) === 'texte');
          const calculsIdx = post.map((z, i) => ({ z, i })).filter(o => normType(o.z?.type) === 'calcul');
          const chiffresIdx = post.map((z, i) => ({ z, i })).filter(o => normType(o.z?.type) === 'chiffre');

          const normUrl = (p) => {
            if (!p) return '';
            let s = p;
            try { s = decodeURIComponent(s); } catch {}
            s = s.toLowerCase().replace(/\\/g, '/');
            const pub = (process.env.PUBLIC_URL || '').toLowerCase();
            if (pub && s.startsWith(pub)) s = s.slice(pub.length);
            if (s.startsWith('/')) s = s.slice(1);
            return s;
          };
          const normCalc = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x');
          const normNum = (t) => String(t || '').replace(/\s+/g, '');

          const imgIdByUrl = new Map((assocData.images || []).map(it => [normUrl(it.url), it.id]));
          const txtIdByContent = new Map((assocData.textes || []).map(it => [norm(it.content), it.id]));
          const calcIdByContent = new Map((assocData.calculs || []).map(it => [normCalc(it.content), it.id]));
          const numIdByContent = new Map((assocData.chiffres || []).map(it => [normNum(it.content), it.id]));

          const imgTxtPairs = new Set(
            (assocData.associations || [])
              .filter(a => a.imageId && a.texteId)
              .map(a => `${a.imageId}|${a.texteId}`)
          );
          const calcNumPairs = new Set(
            (assocData.associations || [])
              .filter(a => a.calculId && a.chiffreId)
              .map(a => `${a.calculId}|${a.chiffreId}`)
          );

          // Préparer pools globaux
          const allImages = assocData.images || [];
          const allTextes = assocData.textes || [];
          const allCalcs = assocData.calculs || [];
          const allNums = assocData.chiffres || [];

          // Fonction utilitaire pour piocher un élément aléatoire différent d'une liste d'exclusions d'id
          const pickUnique = (arr, excludeIds = new Set()) => {
            const pool = arr.filter(x => !excludeIds.has(String(x.id)));
            if (!pool.length) return null;
            return pool[Math.floor(rng() * pool.length)];
          };

          // Normaliser la structure des associations (peut être un objet {textImage, calcNum} ou un tableau mixte)
          const assocRoot = assocData.associations || [];
          const textImageArr = Array.isArray(assocRoot)
            ? assocRoot.filter(a => a && a.imageId && a.texteId)
            : (assocRoot.textImage || []);
          const calcNumArr = Array.isArray(assocRoot)
            ? assocRoot.filter(a => a && a.calculId && a.chiffreId)
            : (assocRoot.calcNum || []);

          // Essayer d'abord image-texte si on a au moins une zone image et texte
          const canImgTxt = imagesIdx.length > 0 && textesIdx.length > 0 && textImageArr.length > 0;
          const canCalcNum = calculsIdx.length > 0 && chiffresIdx.length > 0 && calcNumArr.length > 0;
          console.debug('[ASSOC] Disponibilité', { canImgTxt, canCalcNum, zones: { images: imagesIdx.length, textes: textesIdx.length, calculs: calculsIdx.length, chiffres: chiffresIdx.length } });
          const order = (canImgTxt && canCalcNum) ? (rng() < 0.5 ? ['imgtxt','calcnum'] : ['calcnum','imgtxt']) : (canImgTxt ? ['imgtxt'] : (canCalcNum ? ['calcnum'] : []));

          for (const kind of order) {
            if (kind === 'imgtxt') {
              const assocArr = textImageArr;
              if (!assocArr.length) continue;
              const chosen = assocArr[Math.floor(rng() * assocArr.length)];
              const imInfo = allImages.find(i => String(i.id) === String(chosen.imageId));
              const txInfo = allTextes.find(t => String(t.id) === String(chosen.texteId));
              // Choisir des emplacements de zones aléatoires disponibles
              const freeImages = imagesIdx.filter(o => !((post[o.i]?.pairId || '').trim()));
              const freeTextes = textesIdx.filter(o => !((post[o.i]?.pairId || '').trim()));
              const imgSpot = freeImages.length ? freeImages[Math.floor(rng() * freeImages.length)] : imagesIdx[0];
              const txtSpot = freeTextes.length ? freeTextes[Math.floor(rng() * freeTextes.length)] : textesIdx[0];
              if (imInfo && txInfo && imgSpot && txtSpot) {
                const key = `assoc-img-${imInfo.id}-txt-${txInfo.id}`;
                post[imgSpot.i] = { ...post[imgSpot.i], content: imInfo.url || imInfo.path || imInfo.src || post[imgSpot.i].content, pairId: key, label: txInfo.content || post[imgSpot.i].label };
                post[txtSpot.i] = { ...post[txtSpot.i], content: txInfo.content, label: txInfo.content, pairId: key };
                // Sync customTextSettings for the paired texte zone so it renders correctly
                if (txtSpot?.z?.id != null) {
                  newTextSettings[txtSpot.z.id] = {
                    ...defaultTextSettings,
                    ...(newTextSettings[txtSpot.z.id] || {}),
                    text: txInfo.content || ''
                  };
                }
                selectedCalcIdxs.clear();
                hadAnyAdminPairAssigned = true;
                console.info('[ASSOC] Choisie (image-texte):', {
                  pairId: key,
                  image: { id: imInfo.id, url: imInfo.url || imInfo.path || imInfo.src },
                  texte: { id: txInfo.id, content: txInfo.content }
                });
                // Toast UI
                showAssocToast(`Association: image ${imInfo.id} ↔ texte "${txInfo.content}"`, 'imgtxt');

                // Remplir distracteurs pour autres zones sans pairId
                const usedImgIds = new Set([String(imInfo.id)]);
                const usedTxtIds = new Set([String(txInfo.id)]);
                // Track normalized contents to avoid duplicates with different IDs
                const usedImgUrls = new Set([normUrl(imInfo.url || imInfo.path || imInfo.src || '')]);
                const usedTxtContents = new Set([norm(txInfo.content || '')]);
                // Conserver la liste des images présentes pour éviter de former d'autres paires valides
                const presentImageIds = new Set([String(imInfo.id)]);
                const otherImageSpots = imagesIdx.filter(o => o !== imgSpot);
                for (const o of otherImageSpots) {
                  // pick unique by id and by normalized url
                  let pick = null;
                  for (const cand of allImages) {
                    const idStr = String(cand.id);
                    const urlNorm = normUrl(cand.url || cand.path || cand.src || '');
                    if (!usedImgIds.has(idStr) && urlNorm && !usedImgUrls.has(urlNorm)) { pick = cand; break; }
                  }
                  if (pick) {
                    usedImgIds.add(String(pick.id));
                    usedImgUrls.add(normUrl(pick.url || pick.path || pick.src || ''));
                    presentImageIds.add(String(pick.id));
                    post[o.i] = { ...post[o.i], content: pick.url || pick.path || pick.src || post[o.i].content, pairId: '' };
                  }
                }
                // Choisir des textes qui ne forment aucune association valide avec les images présentes
                const pickTextAvoidingPairs = () => {
                  const pool = allTextes.filter(t => !usedTxtIds.has(String(t.id)) && !usedTxtContents.has(norm(t.content)));
                  // filtrer ceux qui formeraient une paire avec une image présente
                  const safe = pool.filter(t => {
                    for (const imgId of presentImageIds) {
                      if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
                    }
                    return true;
                  });
                  if (!safe.length) return null;
                  return safe[Math.floor(rng() * safe.length)];
                };
                const otherTextSpots = textesIdx.filter(o => o !== txtSpot);
                for (const o of otherTextSpots) {
                  // Ne pas écraser une zone déjà appariée
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickTextAvoidingPairs();
                  if (pick) {
                    usedTxtIds.add(String(pick.id));
                    usedTxtContents.add(norm(pick.content || ''));
                    post[o.i] = { ...post[o.i], content: pick.content, label: pick.content, pairId: '' };
                    // Keep customTextSettings in sync for texte distractors
                    if (o?.z?.id != null) {
                      newTextSettings[o.z.id] = {
                        ...defaultTextSettings,
                        ...(newTextSettings[o.z.id] || {}),
                        text: pick.content || ''
                      };
                    }
                  }
                }
                // Distracteurs pour calculs/chiffres en évitant de former une autre paire valide calc-num
                const usedCalcIds = new Set();
                const usedNumIds = new Set();
                const usedCalcContents = new Set();
                const usedNumContents = new Set();
                const presentCalcIds = new Set();
                for (const o of calculsIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  // ensure unique by content as well
                  let pick = null;
                  for (const cand of allCalcs) {
                    const idStr = String(cand.id);
                    const contNorm = normCalc(cand.content || '');
                    if (!usedCalcIds.has(idStr) && contNorm && !usedCalcContents.has(contNorm)) { pick = cand; break; }
                  }
                  if (pick) {
                    usedCalcIds.add(String(pick.id));
                    usedCalcContents.add(normCalc(pick.content || ''));
                    presentCalcIds.add(String(pick.id));
                    post[o.i] = { ...post[o.i], content: pick.content || post[o.i].content, label: pick.content || post[o.i].label, pairId: '' };
                  }
                }
                const pickNumberAvoidingPairsImgBranch = () => {
                  const pool = allNums.filter(n => !usedNumIds.has(String(n.id)) && !usedNumContents.has(normNum(n.content)));
                  const safe = pool.filter(n => {
                    for (const calcId of presentCalcIds) {
                      if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
                    }
                    return true;
                  });
                  if (!safe.length) return null;
                  return safe[Math.floor(rng() * safe.length)];
                };
                for (const o of chiffresIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickNumberAvoidingPairsImgBranch();
                  if (pick) {
                    usedNumIds.add(String(pick.id));
                    usedNumContents.add(normNum(pick.content));
                    post[o.i] = { ...post[o.i], content: String(pick.content ?? post[o.i].content), label: String(pick.content ?? post[o.i].label), pairId: '' };
                  }
                }
                break; // on a posé notre paire
              }
            } else if (kind === 'calcnum') {
              const assocArr = calcNumArr;
              if (!assocArr.length) continue;
              const chosen = assocArr[Math.floor(rng() * assocArr.length)];
              const caInfo = allCalcs.find(c => String(c.id) === String(chosen.calculId));
              const nuInfo = allNums.find(n => String(n.id) === String(chosen.chiffreId));
              // Emplacements aléatoires disponibles pour calcule et chiffre
              const freeCalcs = calculsIdx.filter(o => !((post[o.i]?.pairId || '').trim()));
              const freeNums = chiffresIdx.filter(o => !((post[o.i]?.pairId || '').trim()));
              const calcSpot = freeCalcs.length ? freeCalcs[Math.floor(rng() * freeCalcs.length)] : calculsIdx[0];
              const numSpot = freeNums.length ? freeNums[Math.floor(rng() * freeNums.length)] : chiffresIdx[0];
              if (caInfo && nuInfo && calcSpot && numSpot) {
                const key = `assoc-calc-${caInfo.id}-num-${nuInfo.id}`;
                post[calcSpot.i] = { ...post[calcSpot.i], content: caInfo.content || post[calcSpot.i].content, label: caInfo.content || post[calcSpot.i].label, pairId: key };
                post[numSpot.i] = { ...post[numSpot.i], content: String(nuInfo.content ?? post[numSpot.i].content), label: String(nuInfo.content ?? post[numSpot.i].label), pairId: key };
                selectedCalcIdxs.add(calcSpot.i);
                hadAnyAdminPairAssigned = true;
                console.info('[ASSOC] Choisie (calcul-chiffre):', {
                  pairId: key,
                  calcul: { id: caInfo.id, content: caInfo.content },
                  chiffre: { id: nuInfo.id, content: String(nuInfo.content) }
                });
                // Toast UI
                const calcLabel = caInfo.content;
                const numLabel = String(nuInfo.content);
                showAssocToast(`Association: calcul "${calcLabel}" ↔ chiffre ${numLabel}`, 'calcnum');

                // Distracteurs pour le reste (tous sans pairId)
                const usedCalcIds = new Set([String(caInfo.id)]);
                const usedNumIds = new Set([String(nuInfo.id)]);
                // Conserver la liste des calculs présents pour éviter de former d'autres paires valides
                const presentCalcIds = new Set([String(caInfo.id)]);
                for (const o of calculsIdx.slice(1)) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickUnique(allCalcs, usedCalcIds);
                  if (pick) { usedCalcIds.add(String(pick.id)); presentCalcIds.add(String(pick.id)); post[o.i] = { ...post[o.i], content: pick.content || post[o.i].content, label: pick.content || post[o.i].label, pairId: '' }; }
                }
                const pickNumberAvoidingPairs = () => {
                  const pool = allNums.filter(n => !usedNumIds.has(String(n.id)));
                  const safe = pool.filter(n => {
                    for (const calcId of presentCalcIds) {
                      if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
                    }
                    return true;
                  });
                  if (!safe.length) return null;
                  return safe[Math.floor(rng() * safe.length)];
                };
                for (const o of chiffresIdx.slice(1)) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickNumberAvoidingPairs();
                  if (pick) { usedNumIds.add(String(pick.id)); post[o.i] = { ...post[o.i], content: String(pick.content ?? post[o.i].content), label: String(pick.content ?? post[o.i].label), pairId: '' }; }
                }
                // Images/textes distracteurs également sans pairId
                const usedImgIds = new Set();
                const usedTxtIds = new Set();
                const usedImgUrls = new Set();
                const usedTxtContents = new Set();
                // Conserver la liste des images présentes pour éviter de former d'autres paires image-texte valides
                const presentImageIds = new Set();
                for (const o of imagesIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  let pick = null;
                  for (const cand of allImages) {
                    const idStr = String(cand.id);
                    const urlNorm = normUrl(cand.url || cand.path || cand.src || '');
                    if (!usedImgIds.has(idStr) && urlNorm && !usedImgUrls.has(urlNorm)) { pick = cand; break; }
                  }
                  if (pick) {
                    usedImgIds.add(String(pick.id));
                    usedImgUrls.add(normUrl(pick.url || pick.path || pick.src || ''));
                    presentImageIds.add(String(pick.id));
                    post[o.i] = { ...post[o.i], content: pick.url || pick.path || pick.src || post[o.i].content, pairId: '' };
                  }
                }
                const pickTextAvoidingPairsCalcBranch = () => {
                  const pool = allTextes.filter(t => !usedTxtIds.has(String(t.id)) && !usedTxtContents.has(norm(t.content)));
                  const safe = pool.filter(t => {
                    for (const imgId of presentImageIds) {
                      if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
                    }
                    return true;
                  });
                  if (!safe.length) return null;
                  return safe[Math.floor(rng() * safe.length)];
                };
                for (const o of textesIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickTextAvoidingPairsCalcBranch();
                  if (pick) {
                    usedTxtIds.add(String(pick.id));
                    usedTxtContents.add(norm(pick.content || ''));
                    post[o.i] = { ...post[o.i], content: pick.content, label: pick.content, pairId: '' };
                    // Keep customTextSettings in sync for texte distractors in calcnum branch
                    if (o?.z?.id != null) {
                      newTextSettings[o.z.id] = {
                        ...defaultTextSettings,
                        ...(newTextSettings[o.z.id] || {}),
                        text: pick.content || ''
                      };
                    }
                  }
                }
                break; // on a posé notre paire
              }
            }
          }
        }
      } catch (e) {
        console.warn('Attribution via associations Admin ignorée:', e);
      }
      // Expose final zones pour debug rapide dans DevTools
      try { window.__lastAssignedZones = JSON.parse(JSON.stringify(post)); } catch {}
      // Fallback: si AUCUNE paire Admin n'a été possible, on garantit au moins une paire image-texte minimale
      if (!hadAnyAdminPairAssigned) {
        console.info('[ASSOC] Fallback utilisé: aucune association Admin posable sur cette carte');
        const imgIndex = post.findIndex(z => normType(z?.type) === 'image' && (getPairId(z) || z.label || z.content));
        if (imgIndex >= 0) {
          const img = post[imgIndex];
          // dérive une clé de pair si manquante
          let key = getPairId(img);
          if (!key) {
            const fromLabel = norm(img.label);
            if (fromLabel) key = fromLabel;
            else {
              // tente depuis le nom de fichier
              const name = (String(img.content || '').split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '');
              key = norm(name);
            }
            post[imgIndex] = { ...img, pairId: key };
          }
          // cherche un texte déjà apparié
          const textIdxs = post
            .map((z, i) => ({ z, i }))
            .filter(o => normType(o.z?.type) === 'texte');
          let matchedText = textIdxs.find(o => getPairId(o.z) === key);
          if (!matchedText && textIdxs.length) {
            // force un texte à devenir la bonne réponse
            const preferWithLabel = textIdxs.find(o => (o.z?.content || '').trim());
            const pick = preferWithLabel || textIdxs[0];
            const desiredLabel = img.label || pick.z.content || '';
            post[pick.i] = { ...pick.z, pairId: key, content: desiredLabel };
            // Sync customTextSettings for fallback-chosen texte
            if (pick?.z?.id != null) {
              newTextSettings[pick.z.id] = {
                ...defaultTextSettings,
                ...(newTextSettings[pick.z.id] || {}),
                text: desiredLabel || ''
              };
            }
            matchedText = { z: post[pick.i], i: pick.i };
            console.info('[ASSOC] Fallback (image-texte) choisi:', {
              pairId: key,
              image: { id: img.id, content: img.content, label: img.label },
              texte: { id: matchedText.z.id, content: matchedText.z.content }
            });
            // Toast UI pour fallback
            const imgLabel = img.label || (String(img.content || '').split('/').pop() || 'image');
            showAssocToast(`Fallback: image-texte "${imgLabel}" ↔ "${matchedText.z.content}"`, 'fallback');
          }
          if (!matchedText) {
            console.warn('[ASSOC] Fallback: aucune zone texte disponible pour créer la paire image-texte');
          }
          // journaliser le pairId effectivement utilisé en fallback
          if (key) {
            console.info('[ASSOC] Fallback: pairId utilisé:', key);
          }
        } else {
          console.warn('[ASSOC] Fallback: aucune zone image exploitable trouvée');
        }
      }
      // Casser les vérités math: aucune opération ne doit égaler un nombre présent
      const numbersOnCard = new Set(
        post
          .filter(z => z?.type === 'chiffre')
          .map(z => parseInt(String(z.content).replace(/\s+/g, ''), 10))
          .filter(n => Number.isFinite(n))
      );
      post = post.map(z => {
        if (z?.type !== 'calcul' || !z?.content) return z;
        // Ne pas casser le calcul sélectionné via Admin
        const thisIdx = post.indexOf(z);
        if (selectedCalcIdxs.has(thisIdx)) return z;
        let parsed = parseOperation(z.content);
        if (!parsed) return z;
        let { a, b, op, result } = parsed;
        let tries = 0;
        const renderExpr = (A, O, B) => {
          if (O === '*' || O === 'x') return `${A} x ${B}`;
          if (O === '/') return `${A} ÷ ${B}`;
          if (O === ':') return `${A} : ${B}`;
          return `${A} ${O} ${B}`; // + ou -
        };
        const evalExpr = (A, O, B) => {
          switch (O) {
            case '+': return A + B;
            case '-': return A - B;
            case 'x':
            case '*': return A * B;
            case '/':
            case ':': return B !== 0 ? A / B : NaN;
            default: return NaN;
          }
        };
        while (Number.isFinite(result) && numbersOnCard.has(result) && tries < 5) {
          // stratégie simple: augmenter b de 1
          b = b + 1;
          result = evalExpr(a, op, b);
          tries++;
        }
        if (tries > 0) {
          return { ...z, content: renderExpr(a, op, b) };
        }
        return z;
      });
      // Assainissement final: garantir EXACTEMENT UNE paire image-texte valide
      try {
        // Détecter la première image qui a un pairId et un texte correspondant
        const imgWithPair = post.find(z => normType(z?.type) === 'image' && getPairId(z));
        let allowedKey = null;
        let keptTextId = null;
        if (imgWithPair) {
          const k = getPairId(imgWithPair);
          const textsSame = post.filter(z => normType(z?.type) === 'texte' && getPairId(z) === k);
          if (textsSame.length >= 1) {
            allowedKey = k;
            keptTextId = textsSame[0].id;
          }
        }
        // Si aucune correspondance détectée, rien à faire ici
        if (allowedKey) {
          // 1) Nettoyer toutes les autres paires image-texte (pairId différents ou doublons du même key)
          post = post.map(z => {
            if (normType(z?.type) === 'image') {
              const k = getPairId(z);
              if (!k) return z;
              // garder uniquement l'image du allowedKey, sinon vider
              if (k !== allowedKey) return { ...z, pairId: '' };
              return z;
            }
            if (normType(z?.type) === 'texte') {
              const k = getPairId(z);
              if (!k) return z;
              // ne conserver que le texte retenu pour allowedKey
              if (k === allowedKey && z.id === keptTextId) return z;
              return { ...z, pairId: '' };
            }
            return z;
          });
          // 2) Éviter qu'un distracteur (texte) forme une paire Admin avec une image présente
          // Reconstruire l'ensemble des images présentes et leur id Admin si disponible
          const normUrl = (p) => {
            if (!p) return '';
            let s = p; try { s = decodeURIComponent(s); } catch {}
            s = s.toLowerCase().replace(/\\/g, '/');
            const pub = (process.env.PUBLIC_URL || '').toLowerCase();
            if (pub && s.startsWith(pub)) s = s.slice(pub.length);
            if (s.startsWith('/')) s = s.slice(1);
            return s;
          };
          const imgIdByUrl = new Map(((assocData && assocData.images) || []).map(it => [normUrl(it.url), it.id]));
          const imgTxtPairs = new Set(((assocData && assocData.associations) || [])
            .filter(a => a.imageId && a.texteId)
            .map(a => `${a.imageId}|${a.texteId}`));
          const allTextes = (assocData && assocData.textes) || [];
          const presentImageIds = new Set(
            post.filter(z => normType(z?.type) === 'image')
                .map(z => imgIdByUrl.get(normUrl(z.content || z.url || z.path || z.src || '')))
                .filter(id => id != null)
                .map(id => String(id))
          );
          const usedTxtIds = new Set();
          const usedTxtContents = new Set();
          // Marquer le texte conservé comme déjà utilisé
          const keptText = post.find(z => z.id === keptTextId);
          if (keptText) {
            const keptAdmin = allTextes.find(t => String(t.content).trim() === String(keptText.content).trim());
            if (keptAdmin) usedTxtIds.add(String(keptAdmin.id));
            usedTxtContents.add(String(keptText.content || '').trim().toLowerCase());
          }
          const pickSafeText = () => {
            const pool = allTextes.filter(t => !usedTxtIds.has(String(t.id)) && !usedTxtContents.has(String(t.content || '').trim().toLowerCase()));
            const safe = pool.filter(t => {
              for (const imgId of presentImageIds) {
                if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
              }
              return true;
            });
            if (!safe.length) return null;
            return safe[Math.floor(Math.random() * safe.length)];
          };
          post = post.map(z => {
            if (normType(z?.type) !== 'texte') return z;
            if (getPairId(z)) return z; // garder le texte apparié
            // si ce texte est susceptible de former une paire avec une image présente, remplace par un distracteur sûr
            const adminTxt = allTextes.find(t => String(t.content).trim().toLowerCase() === String(z.content || '').trim().toLowerCase());
            if (adminTxt) {
              let wouldPair = false;
              for (const imgId of presentImageIds) {
                if (imgTxtPairs.has(`${imgId}|${adminTxt.id}`)) { wouldPair = true; break; }
              }
              if (wouldPair) {
                const pick = pickSafeText();
                if (pick) {
                  usedTxtIds.add(String(pick.id));
                  usedTxtContents.add(String(pick.content || '').trim().toLowerCase());
                  // sync customTextSettings si possible
                  try {
                    newTextSettings[z.id] = { ...defaultTextSettings, ...(newTextSettings[z.id] || {}), text: pick.content || '' };
                  } catch {}
                  return { ...z, content: pick.content, label: pick.content, pairId: '' };
                }
              }
            }
            return z;
          });
        }
      } catch (e) {
        console.warn('Sanitisation unique image-texte ignorée:', e);
      }
      // Assainissement final: garantir EXACTEMENT UNE paire calcul-chiffre valide
      try {
        // Détecter la première paire calcul-chiffre existante (via pairId partagé)
        const calcWithPair = post.find(z => normType(z?.type) === 'calcul' && getPairId(z));
        let allowedCalcNumKey = null;
        let keptNumZoneId = null;
        if (calcWithPair) {
          const k = getPairId(calcWithPair);
          const numsSame = post.filter(z => normType(z?.type) === 'chiffre' && getPairId(z) === k);
          if (numsSame.length >= 1) {
            allowedCalcNumKey = k;
            keptNumZoneId = numsSame[0].id;
          }
        }
        if (allowedCalcNumKey) {
          // 1) Nettoyer toutes les autres paires calcul-chiffre (pairId différents ou doublons)
          post = post.map(z => {
            const t = normType(z?.type);
            if (t === 'calcul' || t === 'chiffre') {
              const k = getPairId(z);
              if (!k) return z;
              if (k !== allowedCalcNumKey) return { ...z, pairId: '' };
              if (t === 'chiffre' && z.id !== keptNumZoneId) return { ...z, pairId: '' };
              return z;
            }
            return z;
          });

          // 2) Casser toute autre association calc-num potentielle par contenu (selon Admin)
          const normCalc = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x');
          const normNum = (t) => String(t || '').replace(/\s+/g, '');
          const allCalcs = (assocData && assocData.calculs) || [];
          const allNums = (assocData && assocData.chiffres) || [];
          const calcIdByContent = new Map(allCalcs.map(it => [normCalc(it.content), it.id]));
          const numIdByContent = new Map(allNums.map(it => [normNum(it.content), it.id]));
          const calcNumPairs = new Set(((assocData && assocData.associations) || [])
            .filter(a => a.calculId && a.chiffreId)
            .map(a => `${a.calculId}|${a.chiffreId}`));

          // Construire l'ensemble des calculs présents (IDs Admin si possible)
          const presentCalcIds = new Set(
            post.filter(z => normType(z?.type) === 'calcul')
                .map(z => calcIdByContent.get(normCalc(z.content)))
                .filter(id => id != null)
                .map(id => String(id))
          );

          const usedNumIds = new Set();
          const usedNumContents = new Set();
          // Marquer le chiffre conservé
          const keptNumZone = post.find(z => z.id === keptNumZoneId);
          if (keptNumZone) {
            const keptAdminNumId = numIdByContent.get(normNum(keptNumZone.content));
            if (keptAdminNumId != null) usedNumIds.add(String(keptAdminNumId));
            usedNumContents.add(normNum(keptNumZone.content));
          }

          const pickSafeNumber = () => {
            const pool = allNums.filter(n => !usedNumIds.has(String(n.id)) && !usedNumContents.has(normNum(n.content)));
            const safe = pool.filter(n => {
              for (const calcId of presentCalcIds) {
                if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
              }
              return true;
            });
            if (!safe.length) return null;
            return safe[Math.floor(rng() * safe.length)];
          };

          post = post.map(z => {
            if (normType(z?.type) !== 'chiffre') return z;
            if (getPairId(z)) return z; // garder le chiffre apparié
            const adminNumId = numIdByContent.get(normNum(z.content));
            if (adminNumId != null) {
              let wouldPair = false;
              for (const calcId of presentCalcIds) {
                if (calcNumPairs.has(`${calcId}|${adminNumId}`)) { wouldPair = true; break; }
              }
              if (wouldPair) {
                const pick = pickSafeNumber();
                if (pick) {
                  usedNumIds.add(String(pick.id));
                  usedNumContents.add(normNum(pick.content));
                  return { ...z, content: String(pick.content), label: String(pick.content), pairId: '' };
                }
              }
            }
            return z;
          });
        }
      } catch (e) {
        console.warn('Sanitisation unique calcul-chiffre ignorée:', e);
      }
      // Assainissement final bis: éviter les doublons de chiffres visibles (p.ex. deux fois "12")
      try {
        const normCalc = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x');
        const normNum = (t) => String(t || '').replace(/\s+/g, '');
        const allNums = (assocData && assocData.chiffres) || [];
        const allCalcs = (assocData && assocData.calculs) || [];
        const calcIdByContent = new Map(allCalcs.map(it => [normCalc(it.content), it.id]));
        const calcNumPairs = new Set(((assocData && assocData.associations) || [])
          .filter(a => a.calculId && a.chiffreId)
          .map(a => `${a.calculId}|${a.chiffreId}`));
        // Calculs présents (IDs admin si disponibles)
        const presentCalcIds = new Set(
          post.filter(z => normType(z?.type) === 'calcul')
              .map(z => calcIdByContent.get(normCalc(z.content)))
              .filter(id => id != null)
              .map(id => String(id))
        );
        const usedNumContents = new Set();
        const usedNumIds = new Set();
        // seed with paired chiffre if any
        for (const z of post) {
          if (normType(z?.type) === 'chiffre' && z?.content != null) {
            const c = normNum(String(z.content));
            if ((z.pairId || '').trim()) {
              usedNumContents.add(c);
            }
          }
        }
        const pickSafeNumber = () => {
          // 1) essayer via Admin
          const pool = allNums.filter(n => !usedNumIds.has(String(n.id)) && !usedNumContents.has(normNum(n.content)));
          const safe = pool.filter(n => {
            for (const calcId of presentCalcIds) {
              if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
            }
            return true;
          });
          if (safe.length) return safe[Math.floor(rng() * safe.length)];
          return null;
        };
        post = post.map(z => {
          if (normType(z?.type) !== 'chiffre') return z;
          const contentStr = String(z.content ?? '').trim();
          const c = normNum(contentStr);
          // conserver le premier exemplaire de chaque valeur; modifier les suivants s'ils ne sont pas la paire gardée
          if (!usedNumContents.has(c)) {
            usedNumContents.add(c);
            return z;
          }
          // si doublon et non apparié, on remplace
          if (!(z.pairId || '').trim()) {
            const pick = pickSafeNumber();
            if (pick) {
              usedNumIds.add(String(pick.id));
              usedNumContents.add(normNum(pick.content));
              return { ...z, content: String(pick.content), label: String(pick.content), pairId: '' };
            }
            // Fallback: incrémenter jusqu'à trouver un nombre unique qui n'est pas associé à un calcul présent
            let n = parseInt(c, 10);
            if (!Number.isNaN(n)) {
              let tries = 0;
              while (tries < 20) {
                n = n + 1;
                const nc = String(n);
                // vérifier association admin si possible
                let forbidden = usedNumContents.has(nc);
                if (!forbidden && assocData) {
                  // si nous avons une table des chiffres, essayer d'éviter ceux qui pairent
                  const adminNum = (assocData.chiffres || []).find(it => String(it.content) === nc);
                  if (adminNum) {
                    for (const calcId of presentCalcIds) {
                      if (calcNumPairs.has(`${calcId}|${adminNum.id}`)) { forbidden = true; break; }
                    }
                  }
                }
                if (!forbidden) {
                  usedNumContents.add(nc);
                  return { ...z, content: nc, label: nc, pairId: '' };
                }
                tries++;
              }
            }
          }
          return z;
        });
      } catch (e) {
        console.warn('Sanitisation anti-doublons de chiffres ignorée:', e);
      }
      // Filet de sécurité final: anti-doublons pour images, textes et calculs
      try {
        const norm = (s) => String(s || '').trim().toLowerCase();
        const normUrl = (p) => {
          if (!p) return '';
          let s = p; try { s = decodeURIComponent(s); } catch {}
          s = s.toLowerCase().replace(/\\/g, '/');
          const pub = (process.env.PUBLIC_URL || '').toLowerCase();
          if (pub && s.startsWith(pub)) s = s.slice(pub.length);
          if (s.startsWith('/')) s = s.slice(1);
          return s;
        };
        const normCalc = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x');
        const normNum = (t) => String(t || '').replace(/\s+/g, '');

        const allImages = (assocData && assocData.images) || [];
        const allTextes = (assocData && assocData.textes) || [];
        const allCalcs = (assocData && assocData.calculs) || [];
        const allNums = (assocData && assocData.chiffres) || [];
        const imgIdByUrl = new Map(allImages.map(it => [normUrl(it.url || it.path || it.src || ''), it.id]));
        const calcIdByContent = new Map(allCalcs.map(it => [normCalc(it.content), it.id]));
        const numIdByContent = new Map(allNums.map(it => [normNum(it.content), it.id]));
        const imgTxtPairs = new Set(((assocData && assocData.associations) || [])
          .filter(a => a.imageId && a.texteId)
          .map(a => `${a.imageId}|${a.texteId}`));
        const calcNumPairs = new Set(((assocData && assocData.associations) || [])
          .filter(a => a.calculId && a.chiffreId)
          .map(a => `${a.calculId}|${a.chiffreId}`));

        // Context: images et chiffres présents (IDs Admin si dispo)
        const presentImageIds = new Set(
          post.filter(z => normType(z?.type) === 'image')
              .map(z => imgIdByUrl.get(normUrl(z.content || z.url || z.path || z.src || '')))
              .filter(id => id != null)
              .map(id => String(id))
        );
        const presentNumIds = new Set(
          post.filter(z => normType(z?.type) === 'chiffre')
              .map(z => numIdByContent.get(normNum(z.content)))
              .filter(id => id != null)
              .map(id => String(id))
        );

        // Images: unicité par URL normalisée (ne change pas l'image appariée)
        {
          const usedUrls = new Set();
          post = post.map(z => {
            if (normType(z?.type) !== 'image') return z;
            const url = normUrl(z.content || z.url || z.path || z.src || '');
            if (!url || !usedUrls.has(url)) { usedUrls.add(url); return z; }
            // doublon non apparié: tenter une autre image sûre
            if (!(z.pairId || '').trim()) {
              let pick = null;
              const usedNow = new Set(usedUrls);
              for (const cand of allImages) {
                const u = normUrl(cand.url || cand.path || cand.src || '');
                if (!u || usedNow.has(u)) continue;
                // éviter de créer une paire avec un texte présent
                const imgId = String(cand.id);
                let wouldPair = false;
                for (const t of post.filter(x => normType(x?.type) === 'texte')) {
                  const tx = allTextes.find(tt => norm(tt.content) === norm(t.content));
                  if (tx && imgTxtPairs.has(`${imgId}|${tx.id}`)) { wouldPair = true; break; }
                }
                if (!wouldPair) { pick = cand; break; }
              }
              if (pick) {
                const u = normUrl(pick.url || pick.path || pick.src || '');
                usedUrls.add(u);
                return { ...z, content: pick.url || pick.path || pick.src || z.content, pairId: '' };
              }
            }
            return z;
          });
        }

        // Textes: unicité par contenu normalisé (ne change pas le texte apparié)
        {
          const usedTexts = new Set();
          const pickSafeText = (usedSet) => {
            const pool = allTextes.filter(t => !usedSet.has(norm(t.content)));
            const safe = pool.filter(t => {
              for (const imgId of presentImageIds) {
                if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
              }
              return true;
            });
            if (!safe.length) return null;
            return safe[Math.floor(rng() * safe.length)];
          };
          post = post.map(z => {
            if (normType(z?.type) !== 'texte') return z;
            const c = norm(z.content);
            if (!usedTexts.has(c)) { usedTexts.add(c); return z; }
            if (!(z.pairId || '').trim()) {
              const pick = pickSafeText(usedTexts);
              if (pick) {
                usedTexts.add(norm(pick.content));
                try { newTextSettings[z.id] = { ...defaultTextSettings, ...(newTextSettings[z.id] || {}), text: pick.content || '' }; } catch {}
                return { ...z, content: pick.content, label: pick.content, pairId: '' };
              }
            }
            return z;
          });
        }

        // Calculs: unicité par contenu normalisé (ne change pas le calcul apparié)
        {
          const usedCalcs = new Set();
          const pickSafeCalc = (usedSet) => {
            const pool = allCalcs.filter(c => !usedSet.has(normCalc(c.content)));
            const safe = pool.filter(c => {
              const cid = String(c.id);
              for (const numId of presentNumIds) {
                if (calcNumPairs.has(`${cid}|${numId}`)) return false;
              }
              return true;
            });
            if (!safe.length) return null;
            return safe[Math.floor(rng() * safe.length)];
          };
          post = post.map(z => {
            if (normType(z?.type) !== 'calcul') return z;
            const c = normCalc(z.content);
            if (!usedCalcs.has(c)) { usedCalcs.add(c); return z; }
            if (!(z.pairId || '').trim()) {
              const pick = pickSafeCalc(usedCalcs);
              if (pick) {
                usedCalcs.add(normCalc(pick.content));
                return { ...z, content: pick.content, label: pick.content, pairId: '' };
              }
            }
            return z;
          });
        }
      } catch (e) {
        console.warn('Filet de sécurité anti-doublons (img/txt/calc) ignoré:', e);
      }
      // Déterminer la zone texte correcte pour le mode jeu
      let corrId = null;
      let imageZone = null;
      // Trouver une image qui partage un pairId avec au moins un texte
      const candidateImage = post.find(z => normType(z?.type) === 'image' && getPairId(z) && post.some(t => normType(t?.type) === 'texte' && getPairId(t) === getPairId(z)));
      if (candidateImage) {
        imageZone = candidateImage;
        const m = post.filter(z => normType(z?.type) === 'texte' && getPairId(z) === getPairId(imageZone));
        if (m.length >= 1) corrId = m[0].id;
      }
      setCorrectZoneId(corrId);
      setCorrectImageZoneId(imageZone?.id || null);
      setGameSelectedIds([]);
      setZones(post);
      setCustomTextSettings(newTextSettings);
      localStorage.setItem('zones', JSON.stringify(post));
      console.log('Zones après attribution automatique (post-traitées) :', post);
    } catch (error) {
      alert('Erreur lors du chargement des éléments ou des zones.');
    }
  }

  // Sauvegarde auto dans localStorage à chaque modification de zones

  // Drag simple = déplacement du point
  const handlePointMouseDown = (idx, e) => {
    e.stopPropagation();
    setDraggedIdx(idx);
  };
  // Réinitialiser toutes les poignées
  const resetHandles = () => {
    setEditPoints(points => points.map(p => ({ ...p, handleIn: null, handleOut: null })));
  };

  // ... (toutes les autres fonctions utilitaires ici) ...
  // Sauvegarde auto dans localStorage à chaque modification de zones
  

  const handleMouseMove = (e) => {
    if (draggedIdx !== null || draggedHandle || dragState.id) {
      setIsDragging(true);
    }
    const svg = svgOverlayRef.current;
    if (draggedIdx !== null) {
      const pt = pointToSvgCoords(e, svg);
      setEditPoints(points => points.map((p, i) => i === draggedIdx ? { ...p, x: pt.x, y: pt.y } : p));
      return;
    }
    if (draggedHandle) {
      const pt = pointToSvgCoords(e, svg);
      setEditPoints(points => points.map((p, i) => {
        if (i !== draggedHandle.idx) return p;
        if (draggedHandle.type === 'in') return { ...p, handleIn: pt };
        if (draggedHandle.type === 'out') return { ...p, handleOut: pt };
        return p;
      }));
      return;
    }
    // Drag de positions calcul/chiffre
    if (dragState.id && !gameActive && editMode) {
      const pt = pointToSvgCoords(e, svg);
      const dx = pt.x - (dragState.start?.x || 0);
      const dy = pt.y - (dragState.start?.y || 0);
      const nx = (dragState.orig?.x || 0) + dx;
      const ny = (dragState.orig?.y || 0) + dy;
      if (Math.abs(dx) + Math.abs(dy) > 0.5 && !dragState.moved) {
        setDragState(s => ({ ...s, moved: true }));
      }
      setMathOffsets(prev => ({
        ...prev,
        [dragState.id]: { x: nx, y: ny }
      }));
    }
  };
  // Ajout/drag de poignées de Bézier
  const handleHandleMouseDown = (idx, type, e) => {
    e.stopPropagation();
    setDraggedHandle({ idx, type });
  };
  // À la création d’un point, il a toujours deux poignées par défaut
  const handleAddPoint = (e) => {
    const svg = svgOverlayRef.current;
    const pt = pointToSvgCoords(e, svg);
    setEditPoints(points => [
      ...points,
      {
        x: pt.x,
        y: pt.y,
        handleIn: { x: pt.x - 50, y: pt.y },
        handleOut: { x: pt.x + 50, y: pt.y }
      }
    ]);
  };
  if (error) {
    return (
      <div style={{ background: '#ffeaea', color: '#b30000', padding: '24px', border: '2px solid #b30000', borderRadius: 8, margin: 32, fontSize: 20, textAlign: 'center', fontWeight: 'bold' }}>
        <span>❌ Erreur lors du chargement des zones :</span>
        <br />
        <span style={{ fontSize: 16, fontWeight: 'normal' }}>{error}</span>
        <br /><br />
        <span>Vérifie le fichier <b>public/data/zones2.json</b> (syntaxe JSON, crochets, etc.)</span>
      </div>
    );
  }
  const svgPath = `${process.env.PUBLIC_URL}/images/carte-svg.svg`;

  // Calcule la bounding box d'une zone à partir de ses points
  function getZoneBoundingBox(points) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

 return (
    <div className="carte-container" style={{ position: 'relative' }}>
      {assocToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 520,
            background: assocToast.kind === 'fallback' ? 'rgba(255, 183, 77, 0.96)' : 'rgba(76, 175, 80, 0.96)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
            zIndex: 9999,
            fontSize: 15,
            lineHeight: 1.4,
            backdropFilter: 'blur(2px)'
          }}
        >
          <strong style={{ display: 'block', marginBottom: 4 }}>
            {assocToast.kind === 'imgtxt' && 'Association choisie (image-texte)'}
            {assocToast.kind === 'calcnum' && 'Association choisie (calcul-chiffre)'}
            {assocToast.kind === 'fallback' && 'Fallback utilisé'}
          </strong>
          <span>{assocToast.text}</span>
        </div>
      )}
      {/* BLOC BOUTONS TOUJOURS AFFICHÉS */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '24px 0 24px 0', gap: 10 }}>
  <button
    style={{
      background: '#007bff',
      color: '#fff',
      fontWeight: 'bold',
      border: '2px solid #333',
      borderRadius: 8,
      padding: '10px 24px',
      fontSize: 18,
      marginBottom: 8,
      cursor: 'pointer'
    }}
    onClick={handleAutoAssign}
  >
    Charger et attribuer les éléments automatiquement
  </button>
          {/* (Supprimé) Bannière zone 417 + bouton de duplication */}
        {!gameActive && editMode && (
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => {
            const data = JSON.stringify(zones, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'zones.json';
            a.click();
            URL.revokeObjectURL(url);
          }}>
            Exporter les zones
          </button>
          <label style={{ cursor: 'pointer', background: '#eee', border: '1px solid #ccc', borderRadius: 4, padding: '6px 12px' }}>
            Importer des zones
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={e => {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = evt => {
                try {
                  const imported = JSON.parse(evt.target.result);
                  if (Array.isArray(imported)) {
  // Correction automatique des propriétés manquantes pour compatibilité effets
  const enriched = imported.map(z => ({
    ...z,
    type: z.type || '',
    content: z.content || '',
    pairId: z.pairId || ''
  }));
  setZones(enriched);
  localStorage.setItem('zones', JSON.stringify(enriched));
  window.location.reload(); // force le rechargement pour que tout soit synchro
}
                  else alert('Le fichier n\'est pas valide.');
                } catch {
                  alert('Erreur de lecture du fichier.');
                }
              };
              reader.readAsText(file);
            }} />
          </label>
        </div>
        )}
        <hr style={{ margin: '16px 0', border: 0, borderTop: '2px dashed #ffc107' }} />
        {/* --- MODE JEU --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0', flexWrap: 'wrap' }}>
          {!gameActive ? (
            <>
              <button
                style={{ background: '#00b894', color: '#fff', fontWeight: 'bold', border: '2px solid #333', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
                onClick={startGame}
              >
                {`Lancer le mode solo (${gameDuration >= 60 ? Math.round(gameDuration/60) + ' min' : gameDuration + 's'})`}
              </button>
              <select
                value={gameDuration}
                onChange={e => setGameDuration(parseInt(e.target.value, 10))}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #333' }}
                title="Durée de jeu"
              >
                <option value={30}>30s</option>
                <option value={60}>1 min</option>
                <option value={90}>1 min 30</option>
                <option value={120}>2 min</option>
              </select>
            </>
          ) : (
            <button
              style={{ background: '#d63031', color: '#fff', fontWeight: 'bold', border: '2px solid #333', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
              onClick={() => setGameActive(false)}
            >
              Stop
            </button>
          )}
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>Temps: {timeLeft}s</div>
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>Score: {score}</div>
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>
            {Number.isFinite(roundsPerSession)
              ? `Manche: ${Math.max(0, roundsPlayed || 0)} / ${roundsPerSession}`
              : `Manche: ${Math.max(0, roundsPlayed || 0)}`}
          </div>
        </div>

        {/* (Supprimé) Bouton d'attribution de contenu aux zones */}
        {!gameActive && editMode && (
        <button
          style={{
            background: drawingMode ? '#28a745' : '#ffc107',
            color: '#222',
            fontWeight: 'bold',
            border: '2px solid #333',
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 18,
            marginRight: 12,
            cursor: 'pointer'
          }}
          onClick={() => setDrawingMode(dm => !dm)}
        >
          {drawingMode ? 'Désactiver le dessin' : 'Activer le dessin'}
        </button>
        )}
        {!gameActive && editMode && (
        <button
          style={{
            background: '#4caf50',
            color: '#fff',
            fontWeight: 'bold',
            border: '2px solid #333',
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 16,
            marginLeft: 12,
            cursor: 'pointer'
          }}
          onClick={() => {
            const data = JSON.stringify(zones, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'zones_attribuees.json';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Exporter JSON enrichi
        </button>
        )}
        {drawingMode && editPoints.length > 2 && (
          <button
            style={{
              background: '#28a745',
              color: '#fff',
              fontWeight: 'bold',
              border: '2px solid #333',
              borderRadius: 8,
              padding: '8px 22px',
              fontSize: 16,
              margin: '10px 0 15px 0',
              cursor: 'pointer'
            }}
            onClick={() => {
              setZones(zs => [
                ...zs,
                { id: Date.now(), points: editPoints, color: 'yellow' }
              ]);
              setEditPoints([]);
              setDrawingMode(false);
            }}
          >
            Valider la zone
          </button>
        )}
      </div>
      {/* --- MODALE ÉDITION TEXTE COURBÉ ZONE VERTE --- */}
      {editingZoneId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99,
          background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 340, boxShadow: '0 4px 32px #0003', position: 'relative' }}>
            <h3>Édition du texte courbé (zone verte)</h3>
            <div style={{ marginBottom: 18 }}>
              <label>Texte<br/>
                <input type="text" style={{ width: '100%' }}
                  value={customTextSettings[editingZoneId]?.text || ''}
                  onChange={e => updateTextSetting(editingZoneId, 'text', e.target.value)}
                />
              </label>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>Angle de départ (degrés)<br/>
                <input type="range" min="-180" max="180" step="1"
                  value={customTextSettings[editingZoneId]?.angle || 0}
                  onChange={e => updateTextSetting(editingZoneId, 'angle', Number(e.target.value))}
                />
                <span style={{ marginLeft: 12 }}>{customTextSettings[editingZoneId]?.angle || 0}°</span>
              </label>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>Taille du texte<br/>
                <input type="range" min="12" max="96" step="1"
                  value={customTextSettings[editingZoneId]?.fontSize || 32}
                  onChange={e => updateTextSetting(editingZoneId, 'fontSize', Number(e.target.value))}
                />
                <span style={{ marginLeft: 12 }}>{customTextSettings[editingZoneId]?.fontSize || 32}px</span>
              </label>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>Police<br/>
                <select
                  value={customTextSettings[editingZoneId]?.fontFamily || 'Arial'}
                  onChange={e => updateTextSetting(editingZoneId, 'fontFamily', e.target.value)}
                >
                  <option value="Arial">Arial</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Comic Sans MS">Comic Sans MS</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Montserrat">Montserrat</option>
                  <option value="Roboto">Roboto</option>
                </select>
              </label>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>Couleur<br/>
                <input type="color"
                  value={customTextSettings[editingZoneId]?.color || '#222'}
                  onChange={e => updateTextSetting(editingZoneId, 'color', e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
              <button onClick={cancelTextSettings} style={{ background: '#eee', color: '#333', border: 'none', padding: '8px 20px', borderRadius: 6 }}>Annuler</button>
              <button
                type="button"
                style={{ background: '#ffc107', color: '#222', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 'bold' }}
                onClick={() => {
                  setArcSelectionMode(true);
                  setEditingZoneId(null); // ferme le panneau pour activer la sélection
                }}
              >
                Sélectionner l’arc
              </button>
              <button onClick={() => validateTextSettings(editingZoneId)} style={{ background: '#1aaf52', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 'bold' }}>Valider</button>
            </div>
          </div>
        </div>
      )}

      <div className="carte" style={{ position: 'relative' }} ref={gameContainerRef}>
        {flashWrong && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(214,48,49,0.25)', pointerEvents: 'none', zIndex: 5 }} />
        )}
        {showBigCross && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: 16, background: 'rgba(220,0,0,0.85)', transform: 'translate(-50%, -50%) rotate(45deg)', borderRadius: 8 }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: 16, background: 'rgba(220,0,0,0.85)', transform: 'translate(-50%, -50%) rotate(-45deg)', borderRadius: 8 }} />
          </div>
        )}
        {gameMsg && (
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#222', color: '#fff', padding: '6px 10px', borderRadius: 8, fontWeight: 700, zIndex: 7 }}>
            {gameMsg}
          </div>
        )}
        <object
          type="image/svg+xml"
          data={svgPath}
          className="carte-bg"
        >
          Votre navigateur ne supporte pas les SVG
        </object>
        <svg
          ref={svgOverlayRef}
          className="carte-svg-overlay"
          width={1000}
          height={1000}
          viewBox="0 0 1000 1000"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'auto',
            width: '100%',
            height: '100%',
            zIndex: 2
          }}
          onMouseDown={e => {
            if (drawingMode) handleAddPoint(e);
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
        {/* Définitions SVG */}
        <defs>
          {/* ClipPaths pour zones images */}
          {zones.filter(z => z.type === 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
            <clipPath id={`clip-zone-${zone.id}`} key={`clip-${zone.id}`} clipPathUnits="userSpaceOnUse">
              <path d={pointsToBezierPath(zone.points)} />
            </clipPath>
          ))}
          {/* Paths pour texte courbé (zones non-image) */}
          {zones.filter(z => z.type !== 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
            <path id={`text-curve-${zone.id}`} key={`textcurve-${zone.id}`} d={getArcPathFromZonePoints(zone.points, zone.id, selectedArcPoints, zone.arcPoints)} fill="none" />
          ))}
        </defs>
          {/* Chemin en cours de dessin façon Illustrator */}
          {drawingMode && editPoints.length > 1 && (
            <path
              d={pointsToBezierPath(editPoints)}
              fill="rgba(0,123,255,0.3)"
              stroke="#007bff"
              strokeWidth={2}
            />
          )}
          {zones.filter(z => z && typeof z === 'object').map((zone, idx) => (
            <g
              key={zone.id}
              onMouseEnter={() => setHoveredZoneId(zone.id)}
              onMouseLeave={() => setHoveredZoneId(null)}
              onClick={attributionMode ? (e) => {
                e.stopPropagation();
                setZoneToEdit(zone);
                setFormData({
                  type: zone.type || '',
                  content: zone.content || '',
                  pairId: zone.pairId || ''
                });
              } : (zone.color === 'green' ? (e) => {
                e.stopPropagation();
                handleEditGreenZone(zone);
              } : () => {
                setSelectedZoneIds(prev => {
                  if (selectedZoneIds.includes(zone.id)) {
                    return prev.filter(id => id !== zone.id);
                  } else if (prev.length < 2) {
                    return [...prev, zone.id];
                  } else {
                    return [prev[1], zone.id];
                  }
                });
              })}
              style={{
                cursor: attributionMode ? 'crosshair' : 'pointer',
                filter: hoveredZoneId === zone.id ? 'drop-shadow(0 0 8px #007bff)' : 'none',
                opacity: 1
              }}
            >
              {/* Affichage du type/contenu si déjà attribué (optionnel) - IMAGE EN FOND */}
              {zone.type === 'image' && zone.content && (
                (() => {
                  const raw = zone.content;
                  const normalized = raw.startsWith('http')
                    ? raw
                    : process.env.PUBLIC_URL + '/' + (raw.startsWith('/')
                      ? raw.slice(1)
                      : (raw.startsWith('images/') ? raw : 'images/' + raw));
                  const src = encodeURI(normalized)
                    .replace(/ /g, '%20')
                    .replace(/\(/g, '%28')
                    .replace(/\)/g, '%29');
                  const keyPath = raw; // clé basée sur le content original
                  const nonce = retryMap[keyPath] || 0;
                  const srcWithNonce = nonce ? `${src}${src.includes('?') ? '&' : '?'}r=${nonce}` : src;
                  const bbox = getZoneBoundingBox(zone.points);
                  return (
                    <image
                      href={srcWithNonce}
                      xlinkHref={srcWithNonce}
                      x={bbox.x}
                      y={bbox.y}
                      width={bbox.width}
                      height={bbox.height}
                      style={{ pointerEvents: 'none', objectFit: 'cover' }}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#clip-zone-${zone.id})`}
                      onError={(e) => {
                        console.warn('Erreur chargement image:', srcWithNonce);
                        // Retry automatique une fois pour les images problématiques
                        setRetryMap(m => {
                          const cur = m[keyPath] || 0;
                          if (cur >= 1) return m; // une seule tentative de retry
                          return { ...m, [keyPath]: cur + 1 };
                        });
                      }}
                    />
                  );
                })()
              )}
              <path
                d={pointsToBezierPath(zone.points)}
                fill={(() => {
                  const isHover = hoveredZoneId === zone.id;
                  const isSelected = gameActive && gameSelectedIds.includes(zone.id);
                  if (zone.type === 'image') {
                    if (isSelected) return 'rgba(255, 214, 0, 0.55)'; // jaune persistant pour sélection
                    return (selectedZoneIds.includes(zone.id) || isHover) ? 'rgba(255, 214, 0, 0.5)' : 'rgba(255, 214, 0, 0.01)';
                  }
                  if (zone.type === 'texte' || zone.type === 'chiffre' || zone.type === 'calcul') {
                    if (isSelected) return 'rgba(40, 167, 69, 0.55)'; // sélection persistante plus visible
                    return isHover ? 'rgba(40, 167, 69, 0.35)' : 'rgba(40, 167, 69, 0.01)';
                  }
                  return 'transparent';
                })()}
                stroke={'none'}
                pointerEvents="all"
                onClick={(e) => {
                  if (gameActive && (zone.type === 'image' || zone.type === 'texte' || zone.type === 'chiffre' || zone.type === 'calcul')) {
                    e.stopPropagation();
                    handleGameClick(zone);
                  }
                }}
              />
              {zone.type === 'texte' && (
  <>
    {(() => {
  // --- Adaptation dynamique de la taille du texte si trop long ---
  // Recalcule les indices de l'arc
  let idxStart, idxEnd;
  if (Array.isArray(zone.arcPoints) && zone.arcPoints.length === 2) {
    idxStart = zone.arcPoints[0];
    idxEnd = zone.arcPoints[1];
  } else if (Array.isArray(selectedArcPoints[zone.id]) && selectedArcPoints[zone.id].length === 2) {
    idxStart = selectedArcPoints[zone.id][0];
    idxEnd = selectedArcPoints[zone.id][1];
  } else {
    idxStart = 0;
    idxEnd = 1;
  }
  // Utilise la même marge que dans getArcPathFromZonePoints
  const pointsArr = Array.isArray(zone.points) && zone.points.length >= 2 ? zone.points : [{x:0,y:0},{x:1,y:1}];
  const { r, delta } = interpolateArc(pointsArr, idxStart, idxEnd, 0);
  const arcLen = r * delta;
  const textValue = (customTextSettings[zone.id]?.text && customTextSettings[zone.id]?.text.trim() !== '')
  ? customTextSettings[zone.id]?.text
  : (zone.content || zone.label || '');
  // Estimation de la longueur du texte en pixels (approx)
  const baseFontSize = customTextSettings[zone.id]?.fontSize || 32;
  const safeTextValue = typeof textValue === 'string' ? textValue : '';
  const textLen = safeTextValue.length * baseFontSize * 0.6;
  const marginPx = 24;
  const fontSize = textLen > arcLen - 2 * marginPx
    ? Math.max(12, (arcLen - 2 * marginPx) / (safeTextValue.length * 0.6))
    : baseFontSize;
  return (
  <g>
    <text
      fontSize={fontSize}
      fontFamily={customTextSettings[zone.id]?.fontFamily || 'Arial'}
      fill={customTextSettings[zone.id]?.color || '#fff'}
      fontWeight="bold"
      pointerEvents="auto"
      style={{ cursor: 'pointer' }}
      onClick={() => {
        if (gameActive) {
          handleGameClick(zone);
        } else {
          handleEditGreenZone(zone);
        }
      }}
    >
      <textPath xlinkHref={`#text-curve-${zone.id}`} startOffset="50%" textAnchor="middle" dominantBaseline="middle">
        {textValue}
      </textPath>
    </text>
    {editMode && !gameActive && (() => {
      const bbox = getZoneBoundingBox(pointsArr);
      const ix = bbox.x + bbox.width / 2;
      const iy = Math.min(pointsArr[idxStart].y, pointsArr[idxEnd].y) - 20;
      return (
        <foreignObject x={ix} y={iy} width={20} height={20} style={{ overflow: 'visible', pointerEvents: 'none' }}>
          <div style={{ fontSize: 14, opacity: 0.9 }}>✏️</div>
        </foreignObject>
      );
    })()}
    {/* Bouton Copier indices */}
    {Array.isArray(selectedArcPoints[zone.id]) && selectedArcPoints[zone.id].length === 2 && (
      <foreignObject
        x={pointsArr[idxStart].x + 10}
        y={pointsArr[idxStart].y - 30}
        width={110}
        height={40}
        style={{ overflow: 'visible' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, border: '1px solid #28a745', background: '#eaffea', color: '#1a7f37', cursor: 'pointer' }}
            onClick={e => {
              e.stopPropagation();
              const indices = selectedArcPoints[zone.id];
              navigator.clipboard.writeText(`[${indices[0]}, ${indices[1]}]`);
              // Affiche une notification visuelle temporaire
              const notif = document.createElement('div');
              notif.textContent = 'Indices copiés !';
              notif.style.position = 'fixed';
              notif.style.top = '30px';
              notif.style.left = '50%';
              notif.style.transform = 'translateX(-50%)';
              notif.style.background = '#28a745';
              notif.style.color = '#fff';
              notif.style.padding = '8px 18px';
              notif.style.borderRadius = '8px';
              notif.style.fontWeight = 'bold';
              notif.style.zIndex = 9999;
              document.body.appendChild(notif);
              setTimeout(() => notif.remove(), 1200);
            }}
          >
            Copier indices
          </button>
          <span style={{ fontSize: 12, color: '#1a7f37' }}>[{selectedArcPoints[zone.id][0]}, {selectedArcPoints[zone.id][1]}]</span>
        </div>
      </foreignObject>
    )}
  </g>
);
})()}

    {/* Affichage des points cliquables pour sélectionner l'arc en mode édition texte */}
    {arcSelectionMode && zone.points && zone.points.length > 1 && (
      <g>
        {zone.points.map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={selectedArcPoints[zone.id]?.includes(idx) ? 13 : 8}
            fill={selectedArcPoints[zone.id]?.includes(idx) ? '#28a745' : '#ffc107'}
            stroke={selectedArcPoints[zone.id]?.includes(idx) ? '#222' : '#0056b3'}
            strokeWidth={selectedArcPoints[zone.id]?.includes(idx) ? 4 : 2}
            style={{ cursor: 'pointer', opacity: 0.95 }}
            onClick={e => { e.stopPropagation(); handleArcPointClick(zone.id, idx); }}
          />
        ))}
        {/* Bouton de validation de l'arc */}
        {selectedArcPoints[zone.id]?.length === 2 && (
          <foreignObject
            x={Math.min(...zone.points.map(p => p.x)) - 20}
            y={Math.min(...zone.points.map(p => p.y)) - 60}
            width={200}
            height={40}
          >
            <button
              style={{ width: '100%', height: '38px', fontWeight: 'bold', fontSize: 16, background: '#28a745', color: '#fff', border: 'none', borderRadius: 8, marginTop: 4, cursor: 'pointer' }}
              onClick={() => {
                setArcSelectionMode(false);
                setEditingZoneId(zone.id); // rouvre le panneau d’édition texte
              }}
            >
              Valider l’arc
            </button>
          </foreignObject>
        )}
      </g>
    )}
  </>
)}
              {editingTextZoneId === zone.id && (
                <g>
                  {/* Ajoutez ici les handles et sliders d'édition si besoin */}
                </g>
              )}
              {/* Affichage des calculs et chiffres centrés dans leur zone (taille auto selon la bbox) */}
              {(zone.type === 'calcul' || zone.type === 'chiffre') && zone.content && (
                (() => {
                  const bbox = getZoneBoundingBox(zone.points);
                  const cx = bbox.x + bbox.width / 2;
                  const cy = bbox.y + bbox.height / 2;
                  const base = Math.max(12, Math.min(bbox.width, bbox.height));
                  // Pour les chiffres, garantissons une taille minimale basée sur la moyenne des zones chiffre
                  const chiffreBaseMin = chiffreRefBase ? 0.95 * chiffreRefBase : base;
                  const effectiveBase = (zone.type === 'chiffre') ? Math.max(base, chiffreBaseMin) : base;
                  const fontSize = (zone.type === 'chiffre' ? 0.42 : 0.28) * effectiveBase;
                  const angle = Number(calcAngles[zone.id] || 0);
                  const mo = mathOffsets[zone.id] || { x: 0, y: 0 };
                  const handleRotate = (e) => {
                    if (gameActive || !editMode) return;
                    e.stopPropagation();
                    setCalcAngles(prev => ({
                      ...prev,
                      [zone.id]: e.shiftKey ? 0 : (((Number(prev[zone.id] || 0) + 15) % 360))
                    }));
                  };
                  // Apply a tiny centering offset exclusively for digit "6" in chiffre zones
                  const contentStr = String(zone.content ?? '').trim();
                  const isSix = (zone.type === 'chiffre') && contentStr === '6';
                  // Negative X shifts slightly to the left; scale by font size for consistency
                  const offsetX = isSix ? (-0.04 * fontSize) : 0;
                  const isMath = zone.type === 'calcul' || zone.type === 'chiffre';
                  return (
                    <g transform={`translate(${mo.x || 0} ${mo.y || 0}) rotate(${angle} ${cx} ${cy})`}>
                      <text
                        x={cx}
                        y={cy}
                        transform={offsetX ? `translate(${offsetX} 0)` : undefined}
                        textAnchor="middle"
                        alignmentBaseline="middle"
                        fontSize={fontSize}
                        fill={isMath ? '#456451' : '#222'}
                        fontWeight="bold"
                        stroke={isMath ? 'none' : '#fff'}
                        strokeWidth={isMath ? 0 : 4}
                        paintOrder="stroke"
                        pointerEvents={gameActive ? 'none' : 'auto'}
                        style={{ cursor: gameActive ? 'default' : (dragState.id === zone.id ? 'grabbing' : 'grab') }}
                        onMouseDown={(e) => {
                          if (gameActive || !editMode) return;
                          e.stopPropagation();
                          const svg = svgOverlayRef.current;
                          const pt = pointToSvgCoords(e, svg);
                          setDragState({ id: zone.id, start: pt, orig: { x: mo.x || 0, y: mo.y || 0 }, moved: false });
                        }}
                        onClick={(e) => {
                          // si on vient de drag, on supprime le click de rotation
                          if (dragState.moved) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                          handleRotate(e);
                        }}
                        title={gameActive ? '' : 'Cliquez pour pivoter (+15°). Shift+clic pour réinitialiser.'}
                      >
                        {zone.content}
                      </text>
                      {editMode && !gameActive && (
                        <foreignObject x={cx + 0.55 * fontSize} y={cy - 0.55 * fontSize} width={20} height={20} style={{ overflow: 'visible', pointerEvents: 'none' }}>
                          <div style={{ fontSize: 14, opacity: 0.9 }}>✏️</div>
                        </foreignObject>
                      )}
                    </g>
                  );
                })()
              )}
              {/* Debug labels and zone name/ID overlays removed for cleaner UI */}
            </g>
          ))}
          {/* Points et poignées */}
          {drawingMode && editPoints.map((p, idx) => (
            <React.Fragment key={idx}>
              <g>
                {/* Poignées de Bézier */}
                {p.handleIn && (
                  <>
                    <line x1={p.x} y1={p.y} x2={p.handleIn.x} y2={p.handleIn.y} stroke="#aaa" strokeDasharray="3 3" />
                    <circle cx={p.handleIn.x} cy={p.handleIn.y} r={6} fill="#fff" stroke="#007bff" strokeWidth={2} style={{ cursor: 'pointer' }}
                      onMouseDown={e => handleHandleMouseDown(idx, 'in', e)} />
                  </>
                )}
                {p.handleOut && (
                  <>
                    <line x1={p.x} y1={p.y} x2={p.handleOut.x} y2={p.handleOut.y} stroke="#aaa" strokeDasharray="3 3" />
                    <circle cx={p.handleOut.x} cy={p.handleOut.y} r={6} fill="#fff" stroke="#007bff" strokeWidth={2} style={{ cursor: 'pointer' }}
                      onMouseDown={e => handleHandleMouseDown(idx, 'out', e)} />
                  </>
                )}
                {/* Point principal */}
                <circle cx={p.x} cy={p.y} r={8} fill="#ffc107" stroke={selectedPointIdx === idx ? '#0056b3' : '#333'} strokeWidth={selectedPointIdx === idx ? 4 : 2} style={{ cursor: 'pointer' }}
                  onMouseDown={e => {
                    handlePointMouseDown(idx, e);
                    setSelectedPointIdx(idx);
                  }}
                />
              </g>
            </React.Fragment>
          ))}
        </svg>
      </div>
      {/* Lobby / Multijoueur UI */}
      {socket && (
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Compte à rebours centré */}
          {countdownT !== null && (
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#000a', color: '#fff', padding: '20px 28px', borderRadius: 16, fontSize: 48, fontWeight: 900, zIndex: 3000 }}>
              {countdownT}
            </div>
          )}
          <div style={{
            background: '#ffffffcc', backdropFilter: 'blur(4px)', border: '2px solid #333', borderRadius: 12,
            boxShadow: '0 6px 20px #0003', padding: 12, minWidth: isMobile ? 0 : 260, width: isMobile ? '86vw' : undefined
          }}>
            {/* Header: titre + actions (minimiser / historique) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 'bold' }}>Salle <span style={{ fontFamily: 'monospace' }}>{roomId}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isHost && (
                    <button
                      onClick={() => { try { socket && socket.emit('session:end'); } catch {} }}
                      title={'Terminer la session (hôte)'}
                      style={{ background: '#fee2e2', border: '1px solid #ef4444', color: '#991b1b', borderRadius: 8, padding: '4px 8px', fontSize: 12, fontWeight: 700 }}
                    >
                      Terminer la session
                    </button>
                  )}
                  {isHost && (
                    <select
                      title="Nombre de manches de la session"
                      onChange={(e) => handleSetRounds(e.target.value)}
                      value={(roundsPerSession ?? 'inf').toString()}
                      style={{ padding: '4px 6px', borderRadius: 8, border: '1px solid #aaa', fontSize: 12 }}
                    >
                      <option value="inf">∞ manches</option>
                      <option value="3">3 manches</option>
                      <option value="5">5 manches</option>
                      <option value="10">10 manches</option>
                    </select>
                  )}
                  <button
                    onClick={() => {
                      setHistoryExpanded(h => {
                        const next = !h;
                        if (next && socket) {
                          try {
                            socket.emit('session:history:get', (res) => {
                              if (res && res.ok && Array.isArray(res.sessions)) {
                                setSessions(res.sessions);
                                try { window.dispatchEvent(new CustomEvent('cc:sessionsUpdated', { detail: { sessions: res.sessions } })); } catch {}
                              }
                            });
                          } catch {}
                        }
                        return next;
                      });
                    }}
                    title={historyExpanded ? "Masquer l'historique" : "Afficher l'historique"}
                    style={{ background: '#eef2ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '4px 8px', fontSize: 12 }}
                  >
                    Historique {sessions?.length ? `(${sessions.length})` : ''}
                  </button>
                  <button
                    onClick={() => setPanelCollapsed(c => !c)}
                    title={panelCollapsed ? 'Déployer' : 'Réduire'}
                    style={{ background: '#f3f4f6', border: '1px solid #9ca3af', borderRadius: 8, padding: '4px 8px', fontSize: 12 }}
                  >
                    {panelCollapsed ? '▢' : '—'}
                  </button>
                </div>
              </div>
              {/* Progression de la session */}
              <div style={{ marginTop: 6, fontSize: 12, color: '#333' }}>
                {Number.isFinite(roundsPerSession) ? (
                  <span>Manche: {Math.max(0, roundsPlayed || 0)} / {roundsPerSession}</span>
                ) : (
                  <span>Manche: {Math.max(0, roundsPlayed || 0)}</span>
                )}
              </div>
            {/* Overlay de contexte de manche */}
            {roundOverlay && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '24px 32px', borderRadius: 16, fontSize: isMobile ? 28 : 42, fontWeight: 900, textAlign: 'center', boxShadow: '0 8px 40px #0006' }}>
                  {roundOverlay.text}
                </div>
              </div>
            )}
            {!panelCollapsed && (
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              <input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Pseudo" style={{ padding: 6, borderRadius: 8, border: '1px solid #bbb' }} />
              <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Code salle" style={{ padding: 6, borderRadius: 8, border: '1px solid #bbb' }} />
              {/* Durée de manche (hôte uniquement) */}
              {isHost ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: '#333', minWidth: 90 }}>Durée:</label>
                  <select value={roomDuration} onChange={e => handleSetRoomDuration(e.target.value)} style={{ flex: 1, padding: 6, borderRadius: 8, border: '1px solid #bbb' }}>
                    <option value={30}>30 s</option>
                    <option value={60}>60 s</option>
                    <option value={90}>90 s</option>
                  </select>
                  {/* Sélection du nombre de manches (hôte) */}
                  <label style={{ fontSize: 12, color: '#333', minWidth: 90 }}>Manches:</label>
                  <select
                    title="Nombre de manches de la session"
                    onChange={(e) => handleSetRounds(e.target.value)}
                    value={(roundsPerSession ?? 'inf').toString()}
                    style={{ flex: 1, padding: 6, borderRadius: 8, border: '1px solid #bbb' }}
                  >
                    <option value="inf">∞</option>
                    <option value="3">3</option>
                    <option value="5">5</option>
                    <option value="10">10</option>
                  </select>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#333' }}>Durée: <b>{roomDuration}</b>s</div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <button onClick={handleCreateRoom} style={{ flex: 1, background: '#eee', border: '1px solid #999', borderRadius: 8, padding: '6px 8px' }}>Créer</button>
                <button onClick={handleJoinRoom} style={{ flex: 1, background: '#dbeafe', border: '1px solid #60a5fa', borderRadius: 8, padding: '6px 8px', fontWeight: 600 }}>Rejoindre</button>
                <button onClick={handleLeaveRoom} style={{ flex: 1, background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 8, padding: '6px 8px' }}>Quitter</button>
              </div>
            </div>
            )}
            {!panelCollapsed && <div style={{ marginTop: 10, fontWeight: 'bold' }}>Joueurs</div>}
            {!panelCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, maxHeight: isMobile ? '22vh' : 220, overflowY: 'auto' }}>
              {[...(roomPlayers.length ? roomPlayers : (scoresMP || []).map(p => ({ id: p.id, nickname: p.name, score: p.score })))]
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }}>
                      {p.isHost && <span title="Hôte" style={{ color: '#a16207' }}>★</span>}
                      <span style={{ color: '#222', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nickname || p.name}>{p.nickname || p.name || 'Joueur'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {typeof p.ready === 'boolean' && (
                        <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 999, background: p.ready ? '#dcfce7' : '#fee2e2', border: `1px solid ${p.ready ? '#22c55e' : '#ef4444'}`, color: p.ready ? '#166534' : '#7f1d1d' }}>
                          {p.ready ? 'Prêt' : 'Pas prêt'}
                        </span>
                      )}
                      <span style={{ fontWeight: 'bold', color: '#1a7f37' }}>{p.score ?? 0}</span>
                    </div>
                  </div>
                ))}
            </div>
            )}
            {!panelCollapsed && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={handleToggleReady} style={{ flex: 1, background: myReady ? '#fef3c7' : '#dcfce7', border: '1px solid #a3a3a3', borderRadius: 8, padding: '8px 10px', fontWeight: 700 }}>
                {myReady ? 'Pas prêt' : 'Je suis prêt'}
              </button>
              {(() => {
                const allReady = roomPlayers.length >= 2 && roomPlayers.every(p => p.ready);
                return (
                  <button onClick={handleStartRoom} disabled={!isHost || !allReady} title={!isHost ? 'Réservé à l\'hôte' : (allReady ? '' : 'Tous les joueurs doivent être prêts')} style={{ flex: 1, background: isHost && allReady ? '#fde68a' : '#e5e7eb', border: '1px solid #a3a3a3', borderRadius: 8, padding: '8px 10px', fontWeight: 700 }}>
                    Démarrer
                  </button>
                );
              })()}
            </div>
            )}
            {mpMsg && !panelCollapsed && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#333' }}>{mpMsg}</div>
            )}
          </div>
          {/* Tableau d'historique sous le panneau multijoueur */}
          {historyExpanded && (
            <div style={{
              background: '#ffffffcc', backdropFilter: 'blur(4px)', border: '1px solid #555', borderRadius: 10,
              boxShadow: '0 4px 14px #0003', padding: 10, minWidth: isMobile ? 0 : 260, width: isMobile ? '86vw' : undefined,
              maxHeight: isMobile ? '25vh' : 220, overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 'bold' }}>Historique des sessions</div>
                <button onClick={() => setHistoryExpanded(false)} style={{ background: 'transparent', border: 'none', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>×</button>
              </div>
              {Array.isArray(sessions) && sessions.length > 0 ? (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sessions.slice().reverse().map((s, idx) => (
                    <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, background: '#fff' }}>
                      <div style={{ fontSize: 12, color: '#444' }}>{new Date(s.endedAt).toLocaleString()}</div>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>
                        {s.winnerTitle ? `${s.winnerTitle}: ` : 'Vainqueur: '}{s.winner?.name || '—'} {typeof s.winner?.score === 'number' ? `( ${s.winner.score} )` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: '#333', marginTop: 4 }}>
                        {Array.isArray(s.scores) && s.scores.length > 0 ? s.scores.map(sc => `${sc.name || 'Joueur'}: ${sc.score ?? 0}`).join(', ') : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 12, color: '#444' }}>Aucun historique pour le moment.</div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Overlay gagnant plein écran */}
      {winnerOverlay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '24px 32px', borderRadius: 16, fontSize: isMobile ? 28 : 42, fontWeight: 900, textAlign: 'center', boxShadow: '0 8px 40px #0006' }}>
            {winnerOverlay.text}
          </div>
        </div>
      )}
      {/* Popup attribution zone en overlay, hors SVG */}
      {attributionMode && zoneToEdit && (
        <div style={{
          position: 'fixed',
          top: 120,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#fff',
          border: '2px solid #007bff',
          borderRadius: 12,
          boxShadow: '0 8px 32px #0003',
          padding: 24,
          zIndex: 1000,
          width: 340
        }}>
          <h3>Attribuer un contenu à la zone</h3>
          <label>Type :
            <select value={formData.type} onChange={e => setFormData(f => ({ ...f, type: e.target.value }))} style={{ marginLeft: 8 }}>
              <option value="">-- Choisir --</option>
              <option value="calcul">Calcul</option>
              <option value="chiffre">Chiffre</option>
              <option value="texte">Texte</option>
              <option value="image">Image</option>
            </select>
          </label>
          <br /><br />
          <label>Contenu :
            <input
              type="text"
              value={formData.content}
              onChange={e => setFormData(f => ({ ...f, content: e.target.value }))}
              style={{ marginLeft: 8, width: '80%' }}
              placeholder={formData.type === 'image' ? 'URL image ex: image.png' : 'Texte, calcul ou chiffre'}
            />
          </label>
          <br /><br />
          <label>Identifiant d’association (pairId) :
            <input
              type="text"
              value={formData.pairId}
              onChange={e => setFormData(f => ({ ...f, pairId: e.target.value }))}
              style={{ marginLeft: 8, width: '40%' }}
            />
          </label>
          <br /><br />
          <button
            style={{
              background: '#28a745',
              color: '#fff',
              fontWeight: 'bold',
              border: '2px solid #333',
              borderRadius: 8,
              padding: '8px 22px',
              fontSize: 16,
              marginRight: 8,
              cursor: 'pointer'
            }}
            onClick={() => {
              setZones(zones => zones.map(z =>
                z.id === zoneToEdit.id
                  ? { ...z, ...formData }
                  : z
              ));
              setZoneToEdit(null);
            }}
          >
            Valider
          </button>
          <button
            style={{
              background: '#ffc107',
              color: '#222',
              fontWeight: 'bold',
              border: '2px solid #333',
              borderRadius: 8,
              padding: '8px 22px',
              fontSize: 16,
              cursor: 'pointer'
            }}
            onClick={() => setZoneToEdit(null)}
            >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
export default Carte;