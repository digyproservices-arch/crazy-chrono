// ==========================================
// MODE SPECTATEUR - MATCH ARENA EN DIRECT
// Vue streaming: carte de jeu + classement + fil en direct
// Charte graphique Crazy Chrono (Teal/Yellow/Brown)
// ==========================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { pointsToBezierPath } from '../CarteUtils';
import { animateBubblesFromZones, invalidateZoneCenterCache } from '../Carte';
import '../../styles/Carte.css';

const getBackendUrl = () => process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

// Charte graphique Crazy Chrono
const CC = {
  teal: '#1AACBE',
  tealDark: '#148A9C',
  tealDeep: '#0D6A7A',
  yellow: '#F5A623',
  yellowLt: '#FFC940',
  brown: '#4A3728',
  bgGradient: 'linear-gradient(135deg, #0D6A7A 0%, #148A9C 30%, #1AACBE 60%, #148A9C 100%)',
  cardBg: 'rgba(255,255,255,0.08)',
  cardBorder: 'rgba(255,255,255,0.15)',
};

const PLAYER_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#0ea5e9'];
const PLAYER_BORDER_COLORS = ['#111827', '#fbbf24', '#dc2626'];

function getInitials(name) {
  const str = String(name || '').trim();
  if (!str) return '';
  const parts = str.split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// --- SVG helpers (copie exacte TrainingArenaGame.js) ---
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
  const marginAngle = marginPx / r;
  const newAngleStart = angleStart + marginAngle;
  const newAngleEnd = angleEnd - marginAngle;
  const newStart = { x: centerX + r * Math.cos(newAngleStart), y: centerY + r * Math.sin(newAngleStart) };
  const newEnd = { x: centerX + r * Math.cos(newAngleEnd), y: centerY + r * Math.sin(newAngleEnd) };
  return { newStart, newEnd, r, centerX, centerY, largeArcFlag: 0, sweepFlag: 1, arcLen: r * delta, delta };
}

function getArcPathFromZonePoints(points, zoneId, arcPointsFromZone, marginPx = 0) {
  if (!points || points.length < 2) return '';
  let idxStart, idxEnd;
  if (Array.isArray(arcPointsFromZone) && arcPointsFromZone.length === 2) {
    idxStart = arcPointsFromZone[0]; idxEnd = arcPointsFromZone[1];
  } else { idxStart = 0; idxEnd = 1; }
  const { newStart, newEnd, r, centerX, centerY, largeArcFlag, sweepFlag } = interpolateArc(points, idxStart, idxEnd, marginPx);
  // Auto-flip
  const startAngle = Math.atan2(newStart.y - centerY, newStart.x - centerX);
  const endAngle = Math.atan2(newEnd.y - centerY, newEnd.x - centerX);
  let arcDelta = endAngle - startAngle;
  if (arcDelta < 0) arcDelta += 2 * Math.PI;
  const midAngle = startAngle + arcDelta / 2;
  const normMid = ((midAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (normMid > 0.05 && normMid < Math.PI - 0.05) {
    return `M ${newEnd.x},${newEnd.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag === 1 ? 0 : 1} ${newStart.x},${newStart.y}`;
  }
  return `M ${newStart.x},${newStart.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag} ${newEnd.x},${newEnd.y}`;
}

function getZoneBoundingBox(points) {
  const xs = points.map(p => p.x); const ys = points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function resolveImageSrc(raw) {
  if (!raw) return null;
  const normalized = raw.startsWith('http') ? raw
    : process.env.PUBLIC_URL + '/' + (raw.startsWith('/') ? raw.slice(1) : (raw.startsWith('images/') ? raw : 'images/' + raw));
  return encodeURI(normalized).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

// --- Error Boundary (empêche page blanche si erreur de rendu) ---
class SpectatorErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[Spectator] Erreur de rendu attrapée:', error, info?.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0D6A7A', color: '#fff', textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Erreur d'affichage</h2>
          <p style={{ opacity: 0.7, marginBottom: 20, maxWidth: 400 }}>Le mode spectateur a rencontré un problème. Rechargez la page pour reprendre.</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: '#F5A623', color: '#4A3728', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>🔄 Recharger</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Pause Overlay ---
function SpectatorPauseOverlay({ disconnectedPlayer, gracePeriodMs }) {
  const [secondsLeft, setSecondsLeft] = React.useState(Math.ceil((gracePeriodMs || 15000) / 1000));
  React.useEffect(() => {
    const iv = setInterval(() => setSecondsLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#fff', textAlign: 'center', pointerEvents: 'none', borderRadius: 16
    }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>&#9208;</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Match en pause</div>
      <div style={{ fontSize: 16, marginBottom: 16, opacity: 0.9 }}>
        <strong>{disconnectedPlayer || 'Un joueur'}</strong> s'est d&#233;connect&#233;
      </div>
      <div style={{ fontSize: 42, fontWeight: 900, color: secondsLeft <= 5 ? '#ef4444' : CC.yellow, transition: 'color 0.3s' }}>
        {secondsLeft}s
      </div>
      <div style={{ fontSize: 13, opacity: 0.65, marginTop: 8 }}>
        Reprise automatique &#224; la reconnexion ou forfait
      </div>
    </div>
  );
}

function ArenaSpectatorInner() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [matchState, setMatchState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [status, setStatus] = useState('connecting');
  const [events, setEvents] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [mode, setMode] = useState('arena');
  const [error, setError] = useState(null);
  const [zones, setZones] = useState([]);
  const zonesRef = useRef([]);
  const [pauseInfo, setPauseInfo] = useState(null);
  const [flashPair, setFlashPair] = useState(null); // { zoneAId, zoneBId, color, playerName }

  const addEvent = useCallback((text, type = 'info', extra = null) => {
    setEvents(prev => [{ text, type, time: Date.now(), ...(extra || {}) }, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (!matchId) {
      setStatus('not-found');
      setError('Aucun matchId fourni');
      return;
    }

    console.log('[Spectator] Connexion au backend:', getBackendUrl(), 'matchId:', matchId);

    const socket = io(getBackendUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 10000
    });
    socketRef.current = socket;

    const connectionTimeout = setTimeout(() => {
      if (status === 'connecting') {
        setStatus('not-found');
        setError('Connexion au serveur échouée (timeout)');
        addEvent('Timeout connexion', 'error');
      }
    }, 8000);

    socket.on('connect', () => {
      console.log('[Spectator] Connecté, rejoindre match:', matchId);
      clearTimeout(connectionTimeout);
      socket.emit('arena:spectate-join', { matchId }, (response) => {
        try {
          if (response?.ok && response.state) {
            const s = response.state;
            setMatchState(s);
            setPlayers(s.players || []);
            setStatus(s.status || 'waiting');
            setCurrentRound(s.currentRound || 1);
            setTotalRounds(s.totalRounds || 3);
            setMode(s.mode || 'arena');
            setError(null);
            if (Array.isArray(s.zones) && s.zones.length > 0) {
              setZones(s.zones);
              zonesRef.current = s.zones;
              invalidateZoneCenterCache();
            }
            if (s.pauseState) {
              setPauseInfo({ paused: true, disconnectedPlayer: s.pauseState.disconnectedPlayer, gracePeriodMs: s.pauseState.gracePeriodMs || 15000 });
            }
            addEvent('Connecté au match en direct', 'system');
          } else {
            setStatus('not-found');
            setError('Match introuvable sur le serveur');
            addEvent('Match introuvable', 'error');
          }
        } catch (err) {
          console.error('[Spectator] Erreur traitement réponse:', err);
          setError('Erreur: ' + err.message);
        }
      });
    });

    socket.on('connect_error', (err) => {
      console.error('[Spectator] Erreur connexion:', err.message);
      setError('Erreur connexion: ' + err.message);
      addEvent('Erreur connexion serveur', 'error');
    });

    socket.on('disconnect', (reason) => {
      console.log('[Spectator] Déconnecté:', reason);
      addEvent('Déconnecté du serveur', 'error');
    });

    socket.on('reconnect', () => {
      console.log('[Spectator] Reconnecté, re-rejoindre match');
      socket.emit('arena:spectate-join', { matchId });
      addEvent('Reconnecté au match', 'system');
    });

    socket.on('arena:spectate-state', (state) => {
      setMatchState(state);
      setPlayers(state.players || []);
      setStatus(state.status);
      setMode(state.mode || 'arena');
      if (Array.isArray(state.zones) && state.zones.length > 0) {
        setZones(state.zones);
        zonesRef.current = state.zones;
        invalidateZoneCenterCache();
      }
    });

    // === EVENTS ARENA + TRAINING ===
    const setupListeners = (prefix) => {
      socket.on(`${prefix}:players-update`, ({ players: p }) => { if (p) setPlayers(p); });
      socket.on(`${prefix}:player-joined`, ({ players: p }) => { if (p) setPlayers(p); addEvent('Un joueur a rejoint le match', 'join'); });
      socket.on(`${prefix}:player-ready`, ({ players: p }) => { if (p) setPlayers(p); });

      socket.on(`${prefix}:countdown`, ({ count }) => {
        setCountdown(count);
        if (count === 3) addEvent('Décompte lancé !', 'system');
      });

      socket.on(`${prefix}:game-start`, (data) => {
        setStatus('playing');
        setCountdown(null);
        setCurrentRound(1);
        if (Array.isArray(data?.zones) && data.zones.length > 0) {
          setZones(data.zones);
          zonesRef.current = data.zones;
          invalidateZoneCenterCache();
        }
        addEvent('Le match commence !', 'start');
      });

      socket.on(`${prefix}:timer-tick`, ({ timeLeft: tl, currentRound: cr, totalRounds: tr }) => {
        setTimeLeft(tl);
        if (cr) setCurrentRound(cr);
        if (tr) setTotalRounds(tr);
      });

      socket.on(`${prefix}:pair-validated`, (data) => {
        try {
          const name = data?.playerName || data?.studentId || '?';
          const score = data?.score;
          const studentId = data?.studentId;
          const playerIdx = data?.playerIdx;
          const color = (typeof playerIdx === 'number' && playerIdx >= 0) ? PLAYER_COLORS[playerIdx % PLAYER_COLORS.length] : '#22c55e';
          const borderColor = (typeof playerIdx === 'number' && playerIdx >= 0)
            ? PLAYER_BORDER_COLORS[Math.floor(playerIdx / PLAYER_COLORS.length) % PLAYER_BORDER_COLORS.length]
            : '#ffffff';

          // ✅ Historique pédagogique: extraire infos des zones (comme TrainingArenaGame)
          const currentZones = zonesRef.current || [];
          const ZA = currentZones.find(z => z.id === data?.zoneAId);
          const ZB = currentZones.find(z => z.id === data?.zoneBId);
          let pairExtra = { playerName: name, playerIdx, color, borderColor, initials: getInitials(name) };

          if (ZA && ZB) {
            const typeA = ZA?.type || '';
            const typeB = ZB?.type || '';
            const textFor = (Z) => (Z?.label || Z?.content || Z?.text || Z?.value || '').toString().trim() || '…';
            const textA = textFor(ZA);
            const textB = textFor(ZB);
            let kind = null, calcExpr = null, calcResult = null, imageSrc = null, imageLabel = null;
            let displayText = `${textA} ↔ ${textB}`;

            if ((typeA === 'calcul' && typeB === 'chiffre') || (typeA === 'chiffre' && typeB === 'calcul')) {
              kind = 'calcnum';
              const calcZone = typeA === 'calcul' ? ZA : ZB;
              const numZone = typeA === 'chiffre' ? ZA : ZB;
              calcExpr = textFor(calcZone);
              calcResult = textFor(numZone);
              displayText = `${calcExpr} = ${calcResult}`;
            } else if ((typeA === 'image' && typeB === 'texte') || (typeA === 'texte' && typeB === 'image')) {
              kind = 'imgtxt';
              const imgZone = typeA === 'image' ? ZA : ZB;
              const txtZone = typeA === 'texte' ? ZA : ZB;
              const raw = imgZone?.content || imgZone?.url || imgZone?.path || imgZone?.src || '';
              if (raw) imageSrc = resolveImageSrc(String(raw));
              imageLabel = textFor(txtZone);
              displayText = imageLabel || `${textA} ↔ ${textB}`;
            } else if (typeA === 'texte' && typeB === 'texte') {
              kind = 'txttxt';
              displayText = `${textA} ↔ ${textB}`;
            }

            pairExtra = { ...pairExtra, kind, calcExpr, calcResult, imageSrc, imageLabel, displayText };
          }

          addEvent(`${name} a trouvé une paire !`, 'pair', pairExtra);

          // Flash visuel sur les zones validées
          if (data?.zoneAId && data?.zoneBId) {
            setFlashPair({ zoneAId: data.zoneAId, zoneBId: data.zoneBId, color, playerName: name });
            setTimeout(() => setFlashPair(null), 1200);
            // ✅ Animation bulles — requestAnimationFrame pour garantir que le DOM est prêt
            if (ZA && ZB) {
              const label = getInitials(name);
              const aId = data.zoneAId, bId = data.zoneBId;
              requestAnimationFrame(() => {
                try {
                  animateBubblesFromZones(aId, bId, color, ZA, ZB, borderColor, label);
                } catch (e) {
                  console.warn('[Spectator] Erreur animation bulles:', e);
                }
              });
            } else {
              console.warn('[Spectator] Zones introuvables pour animation:', data?.zoneAId, data?.zoneBId, 'zonesRef count:', currentZones.length);
            }
          }
          if (studentId) {
            setPlayers(prev => prev.map(p =>
              p.studentId === studentId ? { ...p, score: score || p.score, pairsFound: (p.pairsFound || 0) + 1 } : p
            ));
          }
        } catch (err) {
          console.error('[Spectator] Erreur pair-validated:', err);
        }
      });

      socket.on(`${prefix}:scores-update`, ({ players: p, scores }) => {
        if (p) setPlayers(p);
        else if (scores) setPlayers(scores);
      });

      socket.on(`${prefix}:round-new`, ({ zones: newZones, roundIndex, totalRounds: tr }) => {
        setCurrentRound((roundIndex || 0) + 1);
        if (tr) setTotalRounds(tr);
        // ✅ Délai 300ms: laisser l'animation des bulles capturer les positions DOM
        // avant que React ne remplace les anciennes zones par les nouvelles
        if (Array.isArray(newZones) && newZones.length > 0) {
          setTimeout(() => {
            setZones(newZones);
            zonesRef.current = newZones;
            invalidateZoneCenterCache();
          }, 300);
        }
        addEvent(`Nouvelle carte ! Manche ${(roundIndex || 0) + 1}`, 'round');
      });

      socket.on(`${prefix}:tie-detected`, ({ tiedPlayers }) => {
        setStatus('tie-waiting');
        const names = (tiedPlayers || []).map(p => p.name || p.studentId).join(', ');
        addEvent(`Égalité détectée : ${names}`, 'tie');
      });

      socket.on(`${prefix}:tiebreaker-start`, (data) => {
        setStatus('tiebreaker');
        if (Array.isArray(data?.zones) && data.zones.length > 0) {
          setZones(data.zones);
          zonesRef.current = data.zones;
          invalidateZoneCenterCache();
        }
        addEvent('Départage en cours !', 'start');
      });

      socket.on(`${prefix}:game-end`, (data) => {
        try {
          setStatus('finished');
          const r = data?.ranking || [];
          setRanking(r);
          const winnerName = data?.winner?.name || data?.winner?.studentId || (r[0]?.name) || '?';
          addEvent(`Match terminé ! Vainqueur : ${winnerName}`, 'end');
        } catch (err) {
          setStatus('finished');
          addEvent('Match terminé', 'end');
        }
      });

      // Pause / Resume / Forfait
      socket.on(`${prefix}:match-paused`, ({ disconnectedPlayer, gracePeriodMs }) => {
        console.log('[Spectator] ⏸️ Match en PAUSE —', disconnectedPlayer);
        setPauseInfo({ paused: true, disconnectedPlayer, gracePeriodMs: gracePeriodMs || 15000 });
        addEvent(`⏸️ ${disconnectedPlayer || 'Un joueur'} s'est déconnecté — match en pause`, 'pause');
      });

      socket.on(`${prefix}:match-resumed`, ({ reconnectedPlayer }) => {
        console.log('[Spectator] ▶️ Match REPRIS —', reconnectedPlayer);
        setPauseInfo(null);
        addEvent(`▶️ ${reconnectedPlayer || 'Le joueur'} s'est reconnecté — reprise !`, 'resume');
      });

      socket.on(`${prefix}:player-forfeit`, ({ forfeitStudentId, remainingPlayers }) => {
        console.log('[Spectator] 🏳️ Forfait —', forfeitStudentId);
        setPauseInfo(null);
        addEvent(`🏳️ Forfait de ${forfeitStudentId} — ${remainingPlayers} joueur(s) restant(s)`, 'forfeit');
      });
    };

    setupListeners('arena');
    setupListeners('training');

    return () => {
      clearTimeout(connectionTimeout);
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Trier les joueurs par score décroissant
  const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

  const svgPath = `${process.env.PUBLIC_URL}/images/carte-svg.svg`;

  const getStatusLabel = () => {
    switch (status) {
      case 'connecting': return { text: 'Connexion...', color: '#94a3b8', bg: 'rgba(255,255,255,0.1)' };
      case 'not-found': return { text: 'Match introuvable', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
      case 'pending':
      case 'waiting': return { text: 'En attente', color: CC.yellow, bg: 'rgba(245,166,35,0.15)' };
      case 'playing': return { text: '🔴 EN DIRECT', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
      case 'paused': return { text: '⏸️ PAUSE', color: CC.yellow, bg: 'rgba(245,166,35,0.15)' };
      case 'tie-waiting': return { text: '⚖️ Égalité', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' };
      case 'tiebreaker': return { text: '⚡ Départage', color: '#f97316', bg: 'rgba(249,115,22,0.15)' };
      case 'finished': return { text: '🏁 Terminé', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
      default: return { text: status, color: '#94a3b8', bg: 'rgba(255,255,255,0.1)' };
    }
  };

  const statusInfo = getStatusLabel();

  const getMedal = (idx) => {
    if (idx === 0) return '🥇';
    if (idx === 1) return '🥈';
    if (idx === 2) return '🥉';
    return `#${idx + 1}`;
  };

  const getPlayerColor = (idx) => PLAYER_COLORS[idx % PLAYER_COLORS.length];

  // Check if a zone is currently being flashed (pair just validated)
  const isFlashedZone = (zoneId) => flashPair && (flashPair.zoneAId === zoneId || flashPair.zoneBId === zoneId);

  return (
    <div style={{
      minHeight: '100vh',
      background: CC.bgGradient,
      color: '#fff',
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: '16px 20px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        padding: '12px 20px',
        background: CC.cardBg,
        borderRadius: 14,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${CC.cardBorder}`
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
            👁️ Mode Spectateur
          </h1>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            Match {matchState?.roomCode || matchId?.slice(-8)} • {mode === 'training' ? 'Entraînement' : 'Arena'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Timer pill */}
          {timeLeft !== null && (status === 'playing' || status === 'tiebreaker') && (
            <div style={{
              padding: '6px 16px',
              borderRadius: 20,
              fontWeight: 900,
              fontSize: 20,
              color: timeLeft <= 10 ? '#ef4444' : timeLeft <= 30 ? CC.yellow : '#10b981',
              background: 'rgba(0,0,0,0.3)',
              fontVariantNumeric: 'tabular-nums',
              minWidth: 60,
              textAlign: 'center'
            }}>
              ⏱️ {timeLeft}s
            </div>
          )}
          <div style={{
            padding: '6px 16px',
            borderRadius: 20,
            fontWeight: 700,
            fontSize: 13,
            color: statusInfo.color,
            background: statusInfo.bg,
            animation: status === 'playing' ? 'pulse 2s infinite' : 'none'
          }}>
            {statusInfo.text}
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            Manche {currentRound}/{totalRounds}
          </span>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: `1px solid ${CC.cardBorder}`,
              background: CC.cardBg,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            ← Retour
          </button>
        </div>
      </div>

      {/* Error / Connecting states */}
      {(status === 'connecting' || status === 'not-found') && (
        <div style={{
          textAlign: 'center',
          padding: 60,
          background: CC.cardBg,
          borderRadius: 16,
          border: `1px solid ${CC.cardBorder}`,
          marginBottom: 24
        }}>
          {status === 'connecting' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>📡</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Connexion au match...</h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Match ID: {matchId?.slice(-12)}</p>
            </>
          )}
          {status === 'not-found' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Match introuvable</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 16px' }}>{error || 'Le match n\'existe pas ou est terminé'}</p>
              <button onClick={() => navigate(-1)} style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: CC.yellow, color: CC.brown, cursor: 'pointer', fontWeight: 700
              }}>← Retour au dashboard</button>
            </>
          )}
        </div>
      )}

      {/* Countdown overlay */}
      {countdown !== null && countdown > 0 && (
        <div style={{
          position: 'fixed', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 120, fontWeight: 900, color: CC.yellow,
            textShadow: `0 0 40px ${CC.yellow}88`, animation: 'bounce 0.5s ease'
          }}>
            {countdown}
          </div>
        </div>
      )}

      {/* Main content: Carte (left) + Sidebar (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, maxWidth: 1400, margin: '0 auto', height: 'calc(100vh - 100px)' }}>

        {/* ===== LEFT: GAME CARD ===== */}
        <div style={{
          position: 'relative',
          background: CC.cardBg,
          borderRadius: 16,
          border: `1px solid ${CC.cardBorder}`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {zones.length > 0 ? (
            <div className="carte" style={{ position: 'relative', width: '100%', height: '100%' }}>
              {/* Pause overlay on top of card */}
              {pauseInfo && pauseInfo.paused && (
                <SpectatorPauseOverlay
                  disconnectedPlayer={pauseInfo.disconnectedPlayer}
                  gracePeriodMs={pauseInfo.gracePeriodMs}
                />
              )}
              <object
                type="image/svg+xml"
                data={svgPath}
                className="carte-bg"
              />
              <svg
                className="carte-svg-overlay"
                width={1000}
                height={1000}
                viewBox="0 0 1000 1000"
                style={{
                  position: 'absolute', top: 0, left: 0,
                  pointerEvents: 'none', width: '100%', height: '100%', zIndex: 2
                }}
              >
                <defs>
                  {zones.filter(z => z.type === 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
                    <clipPath id={`sp-clip-${zone.id}`} key={`sp-clip-${zone.id}`} clipPathUnits="userSpaceOnUse">
                      <path d={pointsToBezierPath(zone.points)} />
                    </clipPath>
                  ))}
                  {zones.filter(z => z.type !== 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
                    <path id={`sp-text-curve-${zone.id}`} key={`sp-tc-${zone.id}`} d={getArcPathFromZonePoints(zone.points, zone.id, zone.arcPoints, 0)} fill="none" />
                  ))}
                </defs>
                {zones.filter(z => z && typeof z === 'object').map((zone) => {
                  const flashed = isFlashedZone(zone.id);
                  return (
                    <g key={zone.id} data-zone-id={zone.id}>
                      {/* Image zones */}
                      {zone.type === 'image' && zone.content && (() => {
                        const src = resolveImageSrc(zone.content);
                        const bbox = getZoneBoundingBox(zone.points);
                        return (
                          <image
                            href={src}
                            xlinkHref={src}
                            x={bbox.x} y={bbox.y}
                            width={bbox.width} height={bbox.height}
                            style={{ pointerEvents: 'none', objectFit: 'cover' }}
                            preserveAspectRatio="xMidYMid slice"
                            clipPath={`url(#sp-clip-${zone.id})`}
                          />
                        );
                      })()}
                      {/* Zone path fill */}
                      <path
                        d={pointsToBezierPath(zone.points)}
                        fill={flashed ? `${flashPair.color}55` : (zone.type === 'image' ? 'rgba(255,214,0,0.01)' : 'rgba(40,167,69,0.01)')}
                        stroke={flashed ? flashPair.color : 'none'}
                        strokeWidth={flashed ? 3 : 0}
                        style={{ transition: 'fill 0.3s, stroke 0.3s' }}
                      />
                      {/* Flash glow */}
                      {flashed && (
                        <path
                          d={pointsToBezierPath(zone.points)}
                          fill="none"
                          stroke={flashPair.color}
                          strokeWidth={6}
                          opacity={0.5}
                          style={{ filter: `drop-shadow(0 0 8px ${flashPair.color})` }}
                        />
                      )}
                      {/* Text zones */}
                      {zone.type === 'texte' && (() => {
                        let idxStart = 0, idxEnd = 1;
                        if (Array.isArray(zone.arcPoints) && zone.arcPoints.length === 2) {
                          idxStart = zone.arcPoints[0]; idxEnd = zone.arcPoints[1];
                        }
                        const pts = Array.isArray(zone.points) && zone.points.length >= 2 ? zone.points : [{x:0,y:0},{x:1,y:1}];
                        const { r, delta } = interpolateArc(pts, idxStart, idxEnd, 0);
                        const arcLen = r * delta;
                        const textValue = zone.content || zone.label || '';
                        const safeText = typeof textValue === 'string' ? textValue : '';
                        const baseFontSize = 32;
                        const textLen = safeText.length * baseFontSize * 0.6;
                        const marginPx = 24;
                        const fontSize = textLen > arcLen - 2 * marginPx
                          ? Math.max(12, (arcLen - 2 * marginPx) / (safeText.length * 0.6))
                          : baseFontSize;
                        return (
                          <text fontSize={fontSize} fontFamily="Arial" fill="#fff" fontWeight="bold">
                            <textPath xlinkHref={`#sp-text-curve-${zone.id}`} startOffset="50%" textAnchor="middle" dominantBaseline="middle">
                              {textValue}
                            </textPath>
                          </text>
                        );
                      })()}
                      {/* Calcul / Chiffre zones */}
                      {(zone.type === 'calcul' || zone.type === 'chiffre') && zone.content && (() => {
                        const bbox = getZoneBoundingBox(zone.points);
                        const cx = bbox.x + bbox.width / 2;
                        const cy = bbox.y + bbox.height / 2;
                        const base = Math.max(12, Math.min(bbox.width, bbox.height));
                        const fontSize = (zone.type === 'chiffre' ? 0.42 : 0.28) * base;
                        const angle = Number(zone.angle ?? 0);
                        const mo = zone.mathOffset || { x: 0, y: 0 };
                        const contentStr = String(zone.content ?? '').trim();
                        const isSix = zone.type === 'chiffre' && contentStr === '6';
                        const offsetX = isSix ? (-0.04 * fontSize) : 0;
                        const isChiffre = zone.type === 'chiffre';
                        return (
                          <g transform={`translate(${mo.x || 0} ${mo.y || 0}) rotate(${angle} ${cx} ${cy})`}>
                            <text
                              x={cx} y={cy}
                              transform={offsetX ? `translate(${offsetX} 0)` : undefined}
                              textAnchor="middle" alignmentBaseline="middle"
                              fontSize={fontSize}
                              fill="#456451"
                              fontWeight="bold"
                              stroke="none"
                            >
                              {zone.content}
                            </text>
                            {isChiffre && (() => {
                              const underLen = 0.5 * fontSize;
                              const half = underLen / 2;
                              const uy = cy + 0.54 * fontSize;
                              const strokeW = Math.max(1, 0.09 * fontSize);
                              const cxAdj = cx + (offsetX || 0);
                              return <line x1={cxAdj - half} y1={uy} x2={cxAdj + half} y2={uy} stroke="#456451" strokeWidth={strokeW} strokeLinecap="round" />;
                            })()}
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}
              </svg>
              {/* Flash pair label */}
              {flashPair && (
                <div style={{
                  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                  background: flashPair.color, color: '#fff', padding: '6px 18px',
                  borderRadius: 20, fontWeight: 700, fontSize: 14, zIndex: 10,
                  boxShadow: `0 0 20px ${flashPair.color}66`,
                  animation: 'fadeIn 0.2s ease'
                }}>
                  ✅ {flashPair.playerName}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
              {pauseInfo && pauseInfo.paused ? (
                <SpectatorPauseOverlay disconnectedPlayer={pauseInfo.disconnectedPlayer} gracePeriodMs={pauseInfo.gracePeriodMs} />
              ) : (
                <>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>🗺️</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>En attente de la carte...</div>
                  <div style={{ fontSize: 13, marginTop: 8, opacity: 0.6 }}>La carte apparaîtra au lancement du match</div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ===== RIGHT: SCOREBOARD + FEED ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

          {/* Scoreboard */}
          <div style={{
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.18)',
            padding: '16px 18px',
            flex: '0 0 auto',
            backdropFilter: 'blur(8px)'
          }}>
            <h3 data-cc-vignette="last-pair" style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#fff' }}>
              🏆 Classement en direct
            </h3>
            {sortedPlayers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                ⏳ En attente des joueurs...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedPlayers.map((player, idx) => (
                  <div
                    key={player.studentId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: idx === 0 && status === 'playing'
                        ? `linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.10))`
                        : 'rgba(255,255,255,0.10)',
                      border: `1px solid ${idx === 0 && status === 'playing' ? `${CC.yellow}66` : 'rgba(255,255,255,0.12)'}`,
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <div style={{ fontSize: idx < 3 ? 22 : 15, fontWeight: 900, minWidth: 32, textAlign: 'center' }}>
                      {getMedal(idx)}
                    </div>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${getPlayerColor(idx)}, ${getPlayerColor(idx)}88)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0,
                      border: `2px solid ${getPlayerColor(idx)}44`
                    }}>
                      {(player.name || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {player.name || player.studentId}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                        {player.ready ? '✅ Prêt' : status === 'playing' ? `${player.pairsFound || 0} paires` : '⏳ En attente'}
                      </div>
                    </div>
                    <div style={{
                      background: '#fff',
                      borderRadius: 12,
                      padding: '4px 12px',
                      minWidth: 44,
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}>
                      <div style={{
                        fontSize: 24, fontWeight: 900,
                        color: getPlayerColor(idx),
                        fontVariantNumeric: 'tabular-nums',
                        lineHeight: 1.1
                      }}>
                        {player.score || 0}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Podium final */}
          {ranking && ranking.length > 0 && status === 'finished' && (
            <div style={{
              padding: 16,
              background: `linear-gradient(135deg, ${CC.yellow}1A, ${CC.yellow}08)`,
              borderRadius: 14,
              border: `1px solid ${CC.yellow}33`,
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>🏆 Podium</h3>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                {ranking.slice(0, 3).map((p, i) => (
                  <div key={p.studentId || i} style={{
                    padding: '10px 16px', borderRadius: 12,
                    background: CC.cardBg, border: `1px solid ${CC.cardBorder}`, minWidth: 80
                  }}>
                    <div style={{ fontSize: 28 }}>{getMedal(i)}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{p.name || p.studentId}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: CC.yellow, marginTop: 2 }}>{p.score || 0}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live event feed */}
          <div style={{
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.18)',
            padding: '14px 16px',
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            backdropFilter: 'blur(8px)'
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#fff' }}>
              📡 Fil en direct
            </h3>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                  En attente d'événements...
                </div>
              ) : events.map((ev, i) => {
                const evColors = {
                  pair: '#10b981', start: CC.yellow, end: '#8b5cf6', round: '#3b82f6',
                  tie: '#f97316', join: '#06b6d4', system: '#64748b', error: '#ef4444',
                  pause: CC.yellow, resume: '#10b981', forfeit: '#ef4444', info: '#94a3b8'
                };
                const isPair = ev.type === 'pair' && ev.color;
                // Pour les paires: affichage pédagogique riche
                if (isPair) {
                  const pairLabel = (() => {
                    if (ev.kind === 'calcnum' && ev.calcExpr && ev.calcResult) return `${ev.calcExpr} = ${ev.calcResult}`;
                    if (ev.kind === 'imgtxt' && ev.imageLabel) return ev.imageLabel;
                    return ev.displayText || ev.text || '';
                  })();
                  return (
                    <div key={i} style={{
                      padding: '7px 10px', borderRadius: 10,
                      background: `rgba(255,255,255,0.10)`,
                      border: `1px solid ${ev.color}44`,
                      animation: i === 0 ? 'fadeIn 0.3s ease' : 'none',
                      display: 'flex', flexDirection: 'column', gap: 3
                    }}>
                      {/* Ligne 1: pastille couleur + nom joueur + heure */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: 999, flexShrink: 0,
                          background: ev.color || '#22c55e',
                          border: ev.borderColor ? `2px solid ${ev.borderColor}` : 'none',
                          boxShadow: `0 0 6px ${ev.color || '#22c55e'}66`
                        }} />
                        <span style={{ fontWeight: 700, fontSize: 12, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.playerName || 'Joueur'}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, flexShrink: 0 }}>
                          {new Date(ev.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      {/* Ligne 2: contenu pédagogique (image + texte, ou calcul = résultat) */}
                      <div style={{ marginLeft: 16, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        {ev.kind === 'imgtxt' && ev.imageSrc && (
                          <img src={ev.imageSrc} alt={ev.imageLabel || 'Image'} style={{
                            width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0,
                            border: '1px solid rgba(255,255,255,0.2)'
                          }} />
                        )}
                        {ev.kind === 'calcnum' ? (
                          <span style={{ fontSize: 12, color: '#fff' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ev.calcExpr}</span>
                            <span style={{ fontWeight: 800, margin: '0 4px', color: '#fbbf24' }}>=</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fbbf24' }}>{ev.calcResult}</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pairLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
                // Pour les autres événements: format simple
                return (
                  <div key={i} style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)',
                    borderLeft: `3px solid ${evColors[ev.type] || '#64748b'}`,
                    fontSize: 12, color: 'rgba(255,255,255,0.85)',
                    animation: i === 0 ? 'fadeIn 0.3s ease' : 'none'
                  }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginRight: 6 }}>
                      {new Date(ev.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {ev.text}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function ArenaSpectator() {
  return (
    <SpectatorErrorBoundary>
      <ArenaSpectatorInner />
    </SpectatorErrorBoundary>
  );
}
