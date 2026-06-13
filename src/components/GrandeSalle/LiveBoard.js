// ==========================================
// GRANDE SALLE LIVE BOARD — Écran Présentateur
// Identique visuellement à ArenaSpectator (carte + classement + fil en direct)
// Connecté aux événements Grande Salle (gs:*)
// ==========================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { pointsToBezierPath } from '../CarteUtils';
import { animateBubblesFromZones, invalidateZoneCenterCache } from '../../utils/gameAnimation';
import '../../styles/Carte.css';
import { getBackendUrl } from '../../utils/apiHelpers';
import { getAuthSocketOptions } from '../../utils/socketAuth';
import { PLAYER_PRIMARY_COLORS, getPlayerColorComboByIndex } from '../../utils/playerColors';
import { getInitials } from '../../utils/pairDisplay';

const CC = {
  teal: '#1AACBE', tealDark: '#148A9C', tealDeep: '#0D6A7A',
  yellow: '#F5A623', yellowLt: '#FFC940', brown: '#4A3728',
  bgGradient: 'linear-gradient(135deg, #0D6A7A 0%, #148A9C 30%, #1AACBE 60%, #148A9C 100%)',
  cardBg: 'rgba(0,0,0,0.25)', cardBorder: 'rgba(255,255,255,0.15)',
};

function interpolateArc(points, idxStart, idxEnd, marginPx) {
  if (!points || points.length < 2) return { newStart: {x:0,y:0}, newEnd: {x:1,y:1}, r: 1, centerX: 0.5, centerY: 0.5, largeArcFlag: 0, sweepFlag: 1, arcLen: 1, delta: 0.01 };
  if (idxStart >= points.length || !points[idxStart]) idxStart = 0;
  if (idxEnd >= points.length || !points[idxEnd]) idxEnd = Math.min(1, points.length - 1);
  const start = points[idxStart]; const end = points[idxEnd];
  const xs = points.map(p => p.x); const ys = points.map(p => p.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = (Math.hypot(start.x - centerX, start.y - centerY) + Math.hypot(end.x - centerX, end.y - centerY)) / 2;
  const angleStart = Math.atan2(start.y - centerY, start.x - centerX);
  const angleEnd = Math.atan2(end.y - centerY, end.x - centerX);
  let delta = angleEnd - angleStart; if (delta < 0) delta += 2 * Math.PI;
  const marginAngle = marginPx / r;
  const newStart = { x: centerX + r * Math.cos(angleStart + marginAngle), y: centerY + r * Math.sin(angleStart + marginAngle) };
  const newEnd = { x: centerX + r * Math.cos(angleEnd - marginAngle), y: centerY + r * Math.sin(angleEnd - marginAngle) };
  return { newStart, newEnd, r, centerX, centerY, largeArcFlag: 0, sweepFlag: 1, arcLen: r * delta, delta };
}

function getArcPathFromZonePoints(points, zoneId, arcPointsFromZone, marginPx = 0) {
  if (!points || points.length < 2) return '';
  let idxStart, idxEnd;
  if (Array.isArray(arcPointsFromZone) && arcPointsFromZone.length === 2) { idxStart = arcPointsFromZone[0]; idxEnd = arcPointsFromZone[1]; }
  else { idxStart = 0; idxEnd = 1; }
  const { newStart, newEnd, r, centerX, centerY, largeArcFlag, sweepFlag } = interpolateArc(points, idxStart, idxEnd, marginPx);
  const startAngle = Math.atan2(newStart.y - centerY, newStart.x - centerX);
  const endAngle = Math.atan2(newEnd.y - centerY, newEnd.x - centerX);
  let arcDelta = endAngle - startAngle; if (arcDelta < 0) arcDelta += 2 * Math.PI;
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

// Mélange Fisher-Yates
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function resolveImageSrc(raw) {
  if (!raw) return null;
  const normalized = raw.startsWith('http') ? raw
    : process.env.PUBLIC_URL + '/' + (raw.startsWith('/') ? raw.slice(1) : (raw.startsWith('images/') ? raw : 'images/' + raw));
  return encodeURI(normalized).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

// Résout une URL de logo (relative /images/... ou absolue https://...)
function resolvePartnerLogo(raw) {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('/')) return window.location.origin + raw;
  return raw;
}

// Convertit une URL YouTube (watch / youtu.be / shorts / embed) en URL embed autoplay muet en boucle
function getYouTubeEmbedUrl(url) {
  try {
    const u = String(url || '').trim();
    if (!u) return null;
    const m = u.match(/[?&]v=([\w-]{6,})/) || u.match(/youtu\.be\/([\w-]{6,})/) || u.match(/youtube\.com\/(?:shorts|embed)\/([\w-]{6,})/);
    const id = m && m[1];
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&rel=0`;
  } catch { return null; }
}

export default function LiveBoard() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const zonesRef = useRef([]);

  const [status, setStatus] = useState('lobby');
  const [players, setPlayers] = useState([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [activePlayers, setActivePlayers] = useState(0);
  const [eliminationWave, setEliminationWave] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lastElimination, setLastElimination] = useState(null);
  const [finish, setFinish] = useState(null);
  const [tournamentTitle, setTournamentTitle] = useState('');
  const [lobbyCountdown, setLobbyCountdown] = useState(null);
  const [connected, setConnected] = useState(false);
  const [zones, setZones] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);
  const [events, setEvents] = useState([]);
  const [flashPair, setFlashPair] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [tournamentInfo, setTournamentInfo] = useState(null);
  const [entryCount, setEntryCount] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [startError, setStartError] = useState(null);
  const [starting, setStarting] = useState(false);
  // Tirage au sort des ex-aequo
  const [drawWinner, setDrawWinner] = useState(null); // { candidates: [], winner: null, spinning: false, rankLabel: null }
  const [drawRank, setDrawRank] = useState(null); // rang spécifique pour tirage (ex: 8, 10, etc.)

  const chiffreRefBase = useMemo(() => {
    if (!Array.isArray(zones) || zones.length === 0) return null;
    const bases = zones.filter(z => z?.type === 'chiffre' && Array.isArray(z.points) && z.points.length)
      .map(z => { const b = getZoneBoundingBox(z.points); return Math.max(12, Math.min(b.width, b.height)); });
    if (!bases.length) return null;
    const sorted = [...bases].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }, [zones]);

  const addEvent = useCallback((text, type = 'info', extra = null) => {
    setEvents(prev => [{ text, type, time: Date.now(), ...(extra || {}) }, ...prev].slice(0, 50));
  }, []);

  const getPlayerColor = (idx) => PLAYER_PRIMARY_COLORS[idx % PLAYER_PRIMARY_COLORS.length];
  const getMedal = (idx) => idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
  const isFlashedZone = (zoneId) => flashPair && (flashPair.zoneAId === zoneId || flashPair.zoneBId === zoneId);

  // Plein écran — masquer la navbar et activer le mode immersif
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.classList.add('cc-game');
    try { window.dispatchEvent(new CustomEvent('cc:gameFullscreen', { detail: { on: true } })); } catch {}
    // Tenter le vrai plein écran navigateur
    try {
      const root = document.documentElement;
      const rfs = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen || root.msRequestFullscreen;
      if (rfs && !document.fullscreenElement && !document.webkitFullscreenElement) rfs.call(root);
    } catch {}
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.classList.remove('cc-game');
      try { window.dispatchEvent(new CustomEvent('cc:gameFullscreen', { detail: { on: false } })); } catch {}
      try {
        const efd = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        if (efd && (document.fullscreenElement || document.webkitFullscreenElement)) efd.call(document);
      } catch {}
    };
  }, []);

  // Détecter si l'utilisateur est admin
  useEffect(() => {
    try {
      const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (auth.role === 'teacher' || auth.role === 'admin') setIsAdmin(true);
    } catch {}
  }, []);

  // Charger les infos du tournoi (access_type, inscrits)
  useEffect(() => {
    if (!tournamentId) return;
    const backendUrl = getBackendUrl();
    fetch(`${backendUrl}/api/gs/tournaments/${tournamentId}`)
      .then(r => r.json())
      .then(j => { if (j.ok && j.tournament) setTournamentInfo(j.tournament); })
      .catch(() => {});
    // Charger le nombre d'inscrits
    const token = (() => { try { return JSON.parse(localStorage.getItem('cc_auth') || '{}').token; } catch { return null; } })();
    if (token) {
      fetch(`${backendUrl}/api/gs/tournaments/${tournamentId}/entries`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(j => { if (j.ok) setEntryCount(j.entries?.length || 0); })
        .catch(() => {});
    }
  }, [tournamentId]);

  // ✅ SYNC TIMER: tracker l'index de manche pour ne PAS redémarrer le timer
  // sur les régénérations de carte (même manche → même timer)
  const lastRoundIndexRef = useRef(null);

  useEffect(() => {
    const socket = io(getBackendUrl(), getAuthSocketOptions({ transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 10 }));
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // ✅ FIX ÉCRAN LIVE: spectator=true → le serveur ne l'ajoute JAMAIS comme joueur
      // (avant: compté comme joueur actif puis éliminé dans les vagues)
      const joinPayload = { name: '📺 Écran Live', spectator: true };
      if (tournamentId) joinPayload.tournamentId = tournamentId;
      else joinPayload.salleId = 'grande-salle-publique';
      socket.emit('gs:join', joinPayload, (res) => {
        if (res?.tournamentTitle) setTournamentTitle(res.tournamentTitle);
        if (res?.status) setStatus(res.status);
      });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('gs:state', (d) => {
      setStatus(d.status);
      setPlayers(d.players || []);
      setTotalPlayers(d.totalPlayers || 0);
      setActivePlayers(d.activePlayers || 0);
      setEliminationWave(d.eliminationWave || 0);
      setRoundsPlayed(d.roundsPlayed || 0);
    });

    socket.on('gs:lobby-countdown', ({ t }) => setLobbyCountdown(t));

    socket.on('gs:countdown', ({ t }) => {
      setCountdown(t);
      setStatus('countdown');
    });

    socket.on('gs:round:new', (data) => {
      setStatus('playing');
      setCountdown(null);
      if (Array.isArray(data?.zones) && data.zones.length > 0) {
        setZones(data.zones);
        zonesRef.current = data.zones;
        invalidateZoneCenterCache();
      }
      // ✅ SYNC TIMER: redémarrer le timer UNIQUEMENT sur une nouvelle manche
      // (les régénérations de carte gardent le même roundIndex — avant, chaque regen
      // remettait le timer à fond → écran live désynchronisé des joueurs)
      const idx = parseInt(data?.roundIndex, 10);
      const isNewRound = !Number.isFinite(idx) || idx !== lastRoundIndexRef.current;
      if (Number.isFinite(idx)) lastRoundIndexRef.current = idx;
      if (data?.duration && isNewRound) {
        // ✅ SYNC TIMER: utiliser remainingMs calculé par le SERVEUR (pas d'horloge client)
        const totalMs = Number.isFinite(data?.remainingMs) ? data.remainingMs : data.duration * 1000;
        setTimeLeft(Math.max(0, Math.round(totalMs / 1000)));
        const startTime = Date.now();
        const iv = setInterval(() => {
          const remaining = Math.ceil((totalMs - (Date.now() - startTime)) / 1000);
          if (remaining <= 0) { clearInterval(iv); setTimeLeft(0); }
          else setTimeLeft(remaining);
        }, 500);
        // Stocker l'intervalle pour nettoyage
        if (socket._gsTimerIv) clearInterval(socket._gsTimerIv);
        socket._gsTimerIv = iv;
      }
      if (data?.roundIndex) setRoundsPlayed(data.roundIndex);
      addEvent(`Manche ${data?.roundIndex || '?'} commence !`, 'start');
    });

    socket.on('gs:pair:valid', (data) => {
      try {
        const name = data?.playerName || '?';
        // Dériver un index couleur à partir du nom (hash simple)
        const playerIdx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % PLAYER_PRIMARY_COLORS.length;
        const { primary: color, border: borderColor } = getPlayerColorComboByIndex(playerIdx);

        // a et b sont les IDs des zones validées
        const zoneAId = data?.a;
        const zoneBId = data?.b;
        const currentZones = zonesRef.current || [];
        const ZA = currentZones.find(z => z.id === zoneAId);
        const ZB = currentZones.find(z => z.id === zoneBId);
        let pairExtra = { playerName: name, playerIdx, color, borderColor, initials: getInitials(name) };

        if (ZA && ZB) {
          const typeA = ZA?.type || ''; const typeB = ZB?.type || '';
          const textFor = (Z) => (Z?.label || Z?.content || Z?.text || Z?.value || '').toString().trim() || '…';
          const textForCalc = (Z) => (Z?.content || Z?.label || Z?.text || Z?.value || '').toString().trim() || '…';
          let kind = null, calcExpr = null, calcResult = null, imageSrc = null, imageLabel = null;
          let displayText = `${textFor(ZA)} ↔ ${textFor(ZB)}`;

          if ((typeA === 'calcul' && typeB === 'chiffre') || (typeA === 'chiffre' && typeB === 'calcul')) {
            kind = 'calcnum';
            const calcZone = typeA === 'calcul' ? ZA : ZB;
            const numZone = typeA === 'chiffre' ? ZA : ZB;
            calcExpr = textForCalc(calcZone); calcResult = textForCalc(numZone);
            displayText = `${calcExpr} = ${calcResult}`;
          } else if ((typeA === 'image' && typeB === 'texte') || (typeA === 'texte' && typeB === 'image')) {
            kind = 'imgtxt';
            const imgZone = typeA === 'image' ? ZA : ZB;
            const txtZone = typeA === 'texte' ? ZA : ZB;
            const raw = imgZone?.content || imgZone?.url || imgZone?.path || imgZone?.src || '';
            if (raw) imageSrc = resolveImageSrc(String(raw));
            imageLabel = textFor(txtZone);
            displayText = imageLabel || displayText;
          } else { kind = 'txttxt'; }
          pairExtra = { ...pairExtra, kind, calcExpr, calcResult, imageSrc, imageLabel, displayText };
        }

        addEvent(`${name} a trouvé une paire !`, 'pair', pairExtra);

        if (zoneAId && zoneBId) {
          setFlashPair({ zoneAId, zoneBId, color, playerName: name });
          setTimeout(() => setFlashPair(null), 1200);
          if (ZA && ZB) {
            const label = getInitials(name);
            requestAnimationFrame(() => {
              try { animateBubblesFromZones(zoneAId, zoneBId, color, ZA, ZB, borderColor, label); } catch {}
            });
          }
        }

        // Mise à jour leaderboard depuis pair:valid
        if (data?.leaderboard) setLeaderboard(data.leaderboard);
      } catch (err) { console.error('[LiveBoard] pair:valid error:', err); }
    });

    socket.on('gs:round:result', (data) => {
      if (data?.leaderboard) setLeaderboard(data.leaderboard);
      addEvent('Fin de manche — classement mis à jour', 'round');
    });

    socket.on('gs:elimination', (d) => {
      setLastElimination(d);
      addEvent(`🔥 Vague ${d.wave}: ${d.eliminated?.length} éliminé(s), ${d.remainingCount} restent`, 'elimination');
    });

    socket.on('gs:finish', (d) => {
      setFinish(d);
      setStatus('finished');
      const w = d.winner || (d.winners && d.winners[0]);
      addEvent(`🏆 Fin ! Gagnant: ${w?.name || '?'} (${w?.score || 0} pts)`, 'end');
    });

    return () => {
      if (socket._gsTimerIv) clearInterval(socket._gsTimerIv);
      socket.disconnect();
    };
  }, [tournamentId, addEvent]);

  const sortedPlayers = useMemo(() => {
    const list = leaderboard.length > 0 ? leaderboard : players;
    return [...list].sort((a, b) => (b.score || b.total || 0) - (a.score || a.total || 0));
  }, [leaderboard, players]);

  const svgPath = `${process.env.PUBLIC_URL}/images/carte-svg.svg`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`${window.location.origin}/grande-salle/join/${tournamentId}`)}&color=0D6A7A`;
  const partnerVideoEmbed = getYouTubeEmbedUrl(tournamentInfo?.partner_video_url);
  const hasPartner = !!(tournamentInfo?.partner_name || tournamentInfo?.partner_lot);

  const BADGE = (c) => ({ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: c, fontSize: 12, fontWeight: 700 });

  // ========== LOBBY ==========
  if (status === 'lobby') return (
    <div style={{ position: 'fixed', inset: 0, background: CC.bgGradient, color: '#fff', padding: 24, overflow: 'auto' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🏟️</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, color: CC.yellow }}>{tournamentTitle || 'Grande Salle'}</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>Course Éliminatoire — Flashez le QR code pour rejoindre !</p>
          {/* Badges type d'accès + inscrits */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            {tournamentInfo?.access_type === 'free' && <span style={{ ...BADGE('rgba(16,185,129,0.25)'), color: '#34d399' }}>🎉 Gratuit</span>}
            {tournamentInfo?.access_type === 'subscribers' && <span style={{ ...BADGE('rgba(245,166,35,0.25)'), color: CC.yellow }}>⭐ Abonnés</span>}
            {tournamentInfo?.access_type === 'paid' && <span style={{ ...BADGE('rgba(139,92,246,0.25)'), color: '#a78bfa' }}>💳 {tournamentInfo.entry_price ? `${(tournamentInfo.entry_price / 100).toFixed(2)}€` : 'Payant'}</span>}
            {entryCount != null && <span style={{ ...BADGE('rgba(255,255,255,0.1)'), color: 'rgba(255,255,255,0.7)' }}>📝 {entryCount} inscrit{entryCount > 1 ? 's' : ''}</span>}
            {tournamentInfo?.selected_level && <span style={{ ...BADGE('rgba(255,255,255,0.1)'), color: 'rgba(255,255,255,0.7)' }}>📚 {tournamentInfo.selected_level}</span>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          <div style={{ textAlign: 'center', background: '#fff', borderRadius: 20, padding: 28 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>📱 Flashez pour jouer</div>
            <img src={qrUrl} alt="QR Code" style={{ width: 220, height: 220, borderRadius: 8 }} />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>{window.location.hostname}</div>
          </div>
          <div>
            <div style={{ textAlign: 'center', background: CC.cardBg, borderRadius: 16, padding: 24, border: `1px solid ${CC.cardBorder}`, marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Joueurs connectés</div>
              <div style={{ fontSize: 96, fontWeight: 900, color: CC.yellow, lineHeight: 1 }}>{totalPlayers}</div>
              {lobbyCountdown > 0 && <div style={{ marginTop: 12, fontSize: 28, fontWeight: 800, color: '#ff6b35' }}>Départ dans {lobbyCountdown}s</div>}
              {/* Bouton Lancer pour l'admin */}
              {isAdmin && !lobbyCountdown && (
                <div style={{ marginTop: 16 }}>
                  <button
                    disabled={starting || totalPlayers < 2}
                    onClick={() => {
                      setStarting(true);
                      setStartError(null);
                      socketRef.current?.emit('gs:start', { salleId: tournamentId ? `tournament:${tournamentId}` : 'grande-salle-publique' }, (resp) => {
                        setStarting(false);
                        if (resp && !resp.ok) setStartError(resp.error);
                      });
                    }}
                    style={{
                      padding: '14px 36px', borderRadius: 14, border: 'none', cursor: starting || totalPlayers < 2 ? 'not-allowed' : 'pointer',
                      background: totalPlayers < 2 ? '#475569' : 'linear-gradient(135deg, #ff6b35, #F5A623)',
                      color: '#fff', fontWeight: 900, fontSize: 22,
                      boxShadow: totalPlayers >= 2 ? '0 6px 25px rgba(245,166,35,0.5)' : 'none',
                      opacity: starting ? 0.6 : 1,
                      transition: 'all 0.3s',
                    }}
                  >
                    {starting ? '⏳ Lancement...' : `🚀 Lancer le tournoi`}
                  </button>
                  {totalPlayers < 2 && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Minimum 2 joueurs requis</div>}
                  {startError && <div style={{ fontSize: 13, color: '#ef4444', marginTop: 6 }}>{startError}</div>}
                </div>
              )}
            </div>
            {players.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {players.slice(0, 40).map(p => <span key={p.id} style={{ ...BADGE('rgba(255,255,255,0.12)'), color: '#e2e8f0', fontSize: 11 }}>{p.name}</span>)}
                {players.length > 40 && <span style={{ ...BADGE('rgba(255,255,255,0.05)'), color: 'rgba(255,255,255,0.4)' }}>+{players.length - 40}</span>}
              </div>
            )}
          </div>
        </div>

        {/* ENCART PARTENAIRE — lot à gagner + vidéo de présentation */}
        {hasPartner && (
          <div style={{ marginTop: 24, background: 'linear-gradient(135deg, rgba(245,166,35,0.18), rgba(255,107,53,0.10))', border: '2px solid rgba(245,166,35,0.5)', borderRadius: 20, padding: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: partnerVideoEmbed ? '1fr 1fr' : '1fr', gap: 24, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: CC.yellow, marginBottom: 10, letterSpacing: 1 }}>🎁 LOT À GAGNER</div>
                {tournamentInfo.partner_lot && (
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', marginBottom: 14, textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>{tournamentInfo.partner_lot}</div>
                )}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.95)', borderRadius: 14, padding: '10px 20px' }}>
                  {tournamentInfo.partner_logo_url && (
                    <img src={resolvePartnerLogo(tournamentInfo.partner_logo_url)} alt={tournamentInfo.partner_name || 'Partenaire'} style={{ height: 48, borderRadius: 8 }} onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Offert par notre partenaire</div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: '#0D6A7A' }}>{tournamentInfo.partner_name || 'Partenaire'}</div>
                  </div>
                </div>
              </div>
              {partnerVideoEmbed && (
                <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
                  <iframe
                    src={partnerVideoEmbed}
                    title="Présentation du lot partenaire"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ========== COUNTDOWN ==========
  if (status === 'countdown') return (
    <div style={{ position: 'fixed', inset: 0, background: CC.bgGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 180, fontWeight: 900, color: CC.yellow, textShadow: `0 0 60px ${CC.yellow}88` }}>{countdown}</div>
        <div style={{ fontSize: 32, fontWeight: 700, marginTop: 16 }}>La course commence !</div>
        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)' }}>{totalPlayers} joueurs en compétition</div>
      </div>
    </div>
  );

  // ========== FINISHED — PODIUM ANIMÉ ==========
  if (status === 'finished' && finish) {
    const winners = finish.winners || [finish.winner].filter(Boolean);
    const hasTie = finish.hasTie || winners.length > 1;
    const ranking = finish.fullRanking || [];
    const top3 = ranking.slice(0, 3);
    const rest = ranking.slice(3, 10);
    // Podium: [2e, 1er, 3e] pour l'effet d'escalier classique
    const PODIUM = [
      { p: top3[1], rank: 2, h: 150, medal: '🥈', delay: 0.5, grad: 'linear-gradient(180deg, #E8EDF2, #9BA8B5)', glow: 'rgba(200,215,230,0.45)', ring: '#D7DFE8' },
      { p: top3[0], rank: 1, h: 215, medal: '👑', delay: 0.9, grad: 'linear-gradient(180deg, #FFE34D, #F5A623)', glow: 'rgba(255,200,40,0.55)', ring: '#FFD34D' },
      { p: top3[2], rank: 3, h: 110, medal: '🥉', delay: 0.2, grad: 'linear-gradient(180deg, #E2A26C, #B06A3B)', glow: 'rgba(205,127,60,0.45)', ring: '#D89265' },
    ];
    const CONFETTI_COLORS = ['#FFD34D', '#F5A623', '#FF6B35', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fff'];
    const confetti = Array.from({ length: 60 }, (_, i) => {
      const seed = (i * 2654435761) % 1000;
      return {
        left: (seed % 100),
        size: 6 + (seed % 9),
        delay: (seed % 50) / 10,
        dur: 4 + (seed % 40) / 10,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot: seed % 360,
        round: i % 3 === 0,
      };
    });
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at 50% 120%, #1AACBE 0%, #0D6A7A 55%, #073B45 100%)', color: '#fff', overflow: 'auto' }}>
        <style>{`
          @keyframes ccPodiumRise { 0% { transform: translateY(110%); opacity: 0; } 60% { transform: translateY(-4%); } 100% { transform: translateY(0); opacity: 1; } }
          @keyframes ccChampDrop { 0% { transform: translateY(-40px) scale(0.6); opacity: 0; } 70% { transform: translateY(6px) scale(1.05); } 100% { transform: translateY(0) scale(1); opacity: 1; } }
          @keyframes ccTrophyBounce { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-14px) rotate(3deg); } }
          @keyframes ccTitleIn { 0% { transform: scale(0.4); opacity: 0; } 70% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
          @keyframes ccGlowPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.12); } }
          @keyframes ccConfettiFall { 0% { transform: translateY(-8vh) rotate(0deg); opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(108vh) rotate(720deg); opacity: 0; } }
          @keyframes ccRowIn { 0% { transform: translateX(-30px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
          @keyframes ccShine { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
          @keyframes ccCrownFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        `}</style>

        {/* Confettis */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {confetti.map((c, i) => (
            <div key={i} style={{
              position: 'absolute', top: '-5vh', left: `${c.left}%`, width: c.size, height: c.size * (c.round ? 1 : 1.8),
              background: c.color, borderRadius: c.round ? '50%' : 2, transform: `rotate(${c.rot}deg)`,
              animation: `ccConfettiFall ${c.dur}s linear ${c.delay}s infinite`,
            }} />
          ))}
        </div>

        <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center', padding: '28px 24px 48px', position: 'relative' }}>
          {/* Trophée + halo */}
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 4 }}>
            <div style={{ position: 'absolute', inset: '-30px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,211,77,0.4) 0%, transparent 70%)', animation: 'ccGlowPulse 2.5s ease-in-out infinite' }} />
            <div style={{ fontSize: 84, position: 'relative', animation: 'ccTrophyBounce 2.2s ease-in-out infinite', filter: 'drop-shadow(0 8px 24px rgba(255,180,0,0.5))' }}>🏆</div>
          </div>
          <h1 style={{
            fontSize: 54, fontWeight: 900, margin: '0 0 6px', letterSpacing: 1, animation: 'ccTitleIn 0.7s cubic-bezier(0.34,1.56,0.64,1) both',
            background: 'linear-gradient(90deg, #F5A623 20%, #FFF3C4 50%, #F5A623 80%)', backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animationName: 'ccTitleIn', textShadow: 'none',
          }}>
            {hasTie ? 'ÉGALITÉ AU SOMMET !' : 'VICTOIRE !'}
          </h1>
          <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.65)', fontWeight: 600, marginBottom: hasTie ? 12 : 24 }}>
            {finish.totalPlayers} joueurs · {finish.roundsPlayed} manches
          </div>
          {/* TIRAGE AU SORT DES EX-AEQUO */}
          {hasTie && !drawWinner && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'inline-block', background: 'rgba(245,166,35,0.18)', border: '1px solid rgba(245,166,35,0.5)', borderRadius: 14, padding: '10px 22px', fontSize: 16, fontWeight: 800, color: '#FFD34D', marginBottom: 12 }}>
                🎲 {winners.length} ex-aequo — le gagnant final sera tiré au sort !
              </div>
              {isAdmin && (
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={() => {
                      const candidates = winners.map(w => ({ id: w.id, name: w.name, score: w.score, rank: 1 }));
                      setDrawWinner({ candidates, spinning: true, winner: null, rankLabel: 1 });
                      // Animation de 8 secondes avant révélation (suspense dramatique)
                      setTimeout(() => {
                        const shuffled = shuffleArray(candidates);
                        const finalWinner = shuffled[Math.floor(Math.random() * shuffled.length)];
                        setDrawWinner({ candidates, spinning: false, winner: finalWinner, rankLabel: 1 });
                        addEvent(`🏆 Tirage au sort : ${finalWinner.name} remporte le lot !`, 'success');
                      }, 8000);
                    }}
                    style={{ padding: '14px 28px', borderRadius: 12, border: '2px solid #FFD34D', background: 'linear-gradient(135deg, #F5A623, #ff6b35)', color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 20px rgba(245,166,35,0.4)' }}
                  >
                    🎰 LANCER LE TIRAGE AU SORT
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ANIMATION TIRAGE AU SORT */}
          {drawWinner?.spinning && (
            <div style={{ marginBottom: 24, textAlign: 'center' }}>
              <style>{`
                @keyframes ccDrawSpin { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
                @keyframes ccDrawPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.9; } }
              `}</style>
              <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10, fontWeight: 600, letterSpacing: 2 }}>TIRAGE EN COURS...</div>
              <div style={{ height: 80, overflow: 'hidden', borderRadius: 16, background: 'rgba(0,0,0,0.3)', border: '2px solid #FFD34D', position: 'relative', maxWidth: 400, margin: '0 auto' }}>
                <div style={{ animation: 'ccDrawSpin 0.15s linear infinite', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {[...drawWinner.candidates, ...drawWinner.candidates, ...drawWinner.candidates, ...drawWinner.candidates].map((c, i) => (
                    <div key={i} style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: i % drawWinner.candidates.length === 0 ? '#FFD34D' : '#fff' }}>
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* RÉSULTAT DU TIRAGE */}
          {drawWinner?.winner && (
            <div style={{ marginBottom: 24, animation: 'ccDrawPulse 1s ease-in-out' }}>
              <div style={{ display: 'inline-block', background: 'linear-gradient(135deg, #F5A623, #ff6b35)', borderRadius: 20, padding: '20px 40px', boxShadow: '0 8px 40px rgba(245,166,35,0.5)' }}>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 6, fontWeight: 600 }}>
                  🏆 {drawWinner.rankLabel === 'tous' ? 'GAGNANT DU TIRAGE GÉNÉRAL' : drawWinner.rankLabel === 1 ? 'GRAND GAGNANT DU LOT' : `GAGNANT DU TIRAGE ${drawWinner.rankLabel}ÈME PLACE`}
                </div>
                <div style={{ fontSize: 42, fontWeight: 900, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>{drawWinner.winner.name}</div>
                <div style={{ fontSize: 18, color: '#fff', marginTop: 4 }}>{drawWinner.winner.score} pts</div>
              </div>
            </div>
          )}
          {hasPartner && (
            <div style={{ display: 'block', marginBottom: 20 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,211,77,0.5)', borderRadius: 14, padding: '10px 22px' }}>
                {tournamentInfo.partner_logo_url && (
                  <img src={resolvePartnerLogo(tournamentInfo.partner_logo_url)} alt={tournamentInfo.partner_name || 'Partenaire'} style={{ height: 38, borderRadius: 6, background: '#fff', padding: 3 }} onError={(e) => { e.target.style.display = 'none'; }} />
                )}
                <span style={{ fontSize: 16, fontWeight: 800, color: '#FFD34D' }}>
                  🎁 {tournamentInfo.partner_lot || 'Lot'} — offert par {tournamentInfo.partner_name || 'notre partenaire'}
                </span>
              </div>
            </div>
          )}

          {/* PODIUM */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 14, marginTop: 18, marginBottom: 36, minHeight: 330 }}>
            {PODIUM.map(({ p, rank, h, medal, delay, grad, glow, ring }) => p ? (
              <div key={rank} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: rank === 1 ? 230 : 190 }}>
                {/* Joueur au-dessus de la marche */}
                <div style={{ animation: `ccChampDrop 0.6s cubic-bezier(0.34,1.56,0.64,1) ${delay + 0.55}s both`, marginBottom: 10 }}>
                  <div style={{ fontSize: rank === 1 ? 44 : 32, marginBottom: 4, animation: rank === 1 ? 'ccCrownFloat 2s ease-in-out infinite' : 'none', filter: rank === 1 ? 'drop-shadow(0 4px 12px rgba(255,200,0,0.6))' : 'none' }}>{medal}</div>
                  <div style={{
                    width: rank === 1 ? 86 : 66, height: rank === 1 ? 86 : 66, borderRadius: '50%', margin: '0 auto 8px',
                    background: grad, border: `3px solid ${ring}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: rank === 1 ? 30 : 22, fontWeight: 900, color: '#3a2a10',
                    boxShadow: `0 0 ${rank === 1 ? 45 : 25}px ${glow}, 0 8px 20px rgba(0,0,0,0.35)`,
                  }}>
                    {getInitials(p.name || '?')}
                  </div>
                  <div style={{ fontSize: rank === 1 ? 26 : 19, fontWeight: 900, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.4)', maxWidth: rank === 1 ? 220 : 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 auto' }}>{p.name}</div>
                  <div style={{ fontSize: rank === 1 ? 20 : 16, fontWeight: 800, color: ring }}>{p.score} pts</div>
                </div>
                {/* Marche du podium */}
                <div style={{ width: '100%', overflow: 'hidden', borderRadius: '14px 14px 0 0' }}>
                  <div style={{
                    height: h, background: grad, borderRadius: '14px 14px 0 0', position: 'relative',
                    animation: `ccPodiumRise 0.7s cubic-bezier(0.34,1.3,0.64,1) ${delay}s both`,
                    boxShadow: `0 -4px 35px ${glow}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 14,
                  }}>
                    <span style={{ fontSize: rank === 1 ? 52 : 38, fontWeight: 900, color: 'rgba(0,0,0,0.35)', lineHeight: 1 }}>{rank}</span>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.45) 50%, transparent 60%)', backgroundSize: '200% auto', animation: `ccShine 3s linear ${delay + 1}s infinite` }} />
                  </div>
                </div>
              </div>
            ) : <div key={rank} style={{ width: rank === 1 ? 230 : 190 }} />)}
          </div>

          {/* TIRAGES AU SORT PERSONNALISÉS (places 8, 10, etc.) */}
          {isAdmin && finish?.fullRanking && !drawWinner?.spinning && (
            <div style={{ marginTop: 30, marginBottom: 30, padding: '20px', background: 'rgba(245,166,35,0.1)', border: '2px dashed rgba(245,166,35,0.5)', borderRadius: 16, maxWidth: 600, margin: '30px auto' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#F5A623', marginBottom: 12 }}>🎲 Tirages au sort personnalisés (lots de consolation)</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>Tirer au sort pour la place :</span>
                {[8, 10, 15, 20].map(rank => {
                  const atRank = finish.fullRanking.filter(p => p.finalRank === rank);
                  const hasTieAtRank = atRank.length > 1;
                  return (
                    <button
                      key={rank}
                      onClick={() => {
                        const candidates = atRank.map(p => ({ id: p.id, name: p.name, score: p.score, rank }));
                        if (candidates.length === 0) return;
                        setDrawWinner({ candidates, spinning: true, winner: null, rankLabel: rank });
                        setTimeout(() => {
                          const shuffled = shuffleArray(candidates);
                          const finalWinner = shuffled[Math.floor(Math.random() * shuffled.length)];
                          setDrawWinner({ candidates, spinning: false, winner: finalWinner, rankLabel: rank });
                          addEvent(`🎲 Tirage ${rank}ème place : ${finalWinner.name} remporte le lot !`, 'success');
                        }, 8000);
                      }}
                      disabled={atRank.length === 0}
                      style={{ padding: '8px 16px', borderRadius: 10, border: hasTieAtRank ? '2px solid #FFD34D' : '1px solid rgba(255,255,255,0.2)', background: hasTieAtRank ? 'rgba(245,166,35,0.3)' : 'rgba(255,255,255,0.1)', color: hasTieAtRank ? '#FFD34D' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: atRank.length === 0 ? 'not-allowed' : 'pointer', opacity: atRank.length === 0 ? 0.5 : 1 }}
                    >
                      {rank}{hasTieAtRank ? ` (${atRank.length} ex)` : ''}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    // Tirage parmi tous les participants
                    const all = finish.fullRanking.map(p => ({ id: p.id, name: p.name, score: p.score }));
                    setDrawWinner({ candidates: all, spinning: true, winner: null, rankLabel: 'tous' });
                    setTimeout(() => {
                      const shuffled = shuffleArray(all);
                      const finalWinner = shuffled[Math.floor(Math.random() * shuffled.length)];
                      setDrawWinner({ candidates: all, spinning: false, winner: finalWinner, rankLabel: 'tous' });
                      addEvent(`🎲 Tirage général : ${finalWinner.name} remporte le lot !`, 'success');
                    }, 8000);
                  }}
                  style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.2)', color: '#10b981', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  🎲 Tous les participants
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                Les boutons dorés indiquent des ex-aequo à cette place. Cliquez pour faire un tirage au sort live.
              </div>
            </div>
          )}

          {/* Classement 4e et suivants */}
          {rest.length > 0 && (
            <div style={{ textAlign: 'left', maxWidth: 560, margin: '0 auto' }}>
              {rest.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px', marginBottom: 6,
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                  animation: `ccRowIn 0.4s ease-out ${1.6 + i * 0.1}s both`, backdropFilter: 'blur(6px)',
                }}>
                  <span style={{ fontWeight: 900, color: 'rgba(255,255,255,0.45)', width: 38, fontSize: 17 }}>#{p.finalRank}</span>
                  <span style={{ flex: 1, fontWeight: 700, color: '#fff', fontSize: 17 }}>{p.name}</span>
                  <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.75)', fontSize: 17 }}>{p.score} pts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== PLAYING — carte + classement + fil en direct (identique ArenaSpectator) ==========
  return (
    <div style={{ position: 'fixed', inset: 0, background: CC.bgGradient, color: '#fff', padding: '16px 20px', overflow: 'hidden', touchAction: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '10px 20px', background: CC.cardBg, borderRadius: 14, border: `1px solid ${CC.cardBorder}`, backdropFilter: 'blur(10px)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>📺 {tournamentTitle || 'Grande Salle'}</h1>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{activePlayers} joueurs actifs • Manche {roundsPlayed}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {timeLeft != null && (
            <div style={{ padding: '6px 16px', borderRadius: 20, fontWeight: 900, fontSize: 20, color: timeLeft <= 10 ? '#ef4444' : timeLeft <= 30 ? CC.yellow : '#10b981', background: 'rgba(0,0,0,0.3)', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'center' }}>
              ⏱️ {timeLeft}s
            </div>
          )}
          <div style={{ padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: 13, color: '#ef4444', background: 'rgba(239,68,68,0.15)', animation: 'pulse 2s infinite' }}>🔴 EN DIRECT</div>
          {eliminationWave > 0 && <span style={{ ...BADGE('rgba(239,68,68,0.2)'), color: '#fca5a5' }}>Vague {eliminationWave}</span>}
        </div>
      </div>

      {/* Main: Carte + Sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, height: 'calc(100vh - 90px)' }}>

        {/* LEFT: GAME CARD */}
        <div style={{ position: 'relative', background: CC.cardBg, borderRadius: 16, border: `1px solid ${CC.cardBorder}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {zones.length > 0 ? (
            <div className="carte" style={{ position: 'relative', width: '100%', height: '100%' }}>
              <object type="image/svg+xml" data={svgPath} className="carte-bg" />
              <svg className="carte-svg-overlay" width={1000} height={1000} viewBox="0 0 1000 1000" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', width: '100%', height: '100%', zIndex: 2 }}>
                <defs>
                  {zones.filter(z => z.type === 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
                    <clipPath id={`gs-clip-${zone.id}`} key={`gs-clip-${zone.id}`} clipPathUnits="userSpaceOnUse">
                      <path d={pointsToBezierPath(zone.points)} />
                    </clipPath>
                  ))}
                  {zones.filter(z => z.type !== 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
                    <path id={`gs-text-curve-${zone.id}`} key={`gs-tc-${zone.id}`} d={getArcPathFromZonePoints(zone.points, zone.id, zone.arcPoints, 0)} fill="none" />
                  ))}
                </defs>
                {zones.filter(z => z && typeof z === 'object' && Array.isArray(z.points) && z.points.length >= 2).map((zone) => {
                  const flashed = isFlashedZone(zone.id);
                  return (
                    <g key={zone.id} data-zone-id={zone.id}>
                      {zone.type === 'image' && zone.content && (() => {
                        const src = resolveImageSrc(zone.content);
                        const bbox = getZoneBoundingBox(zone.points);
                        return <image href={src} xlinkHref={src} x={bbox.x} y={bbox.y} width={bbox.width} height={bbox.height} style={{ pointerEvents: 'none', objectFit: 'cover' }} preserveAspectRatio="xMidYMid slice" clipPath={`url(#gs-clip-${zone.id})`} />;
                      })()}
                      <path d={pointsToBezierPath(zone.points)} fill={flashed ? `${flashPair.color}55` : (zone.type === 'image' ? 'rgba(255,214,0,0.01)' : 'rgba(40,167,69,0.01)')} stroke={flashed ? flashPair.color : 'none'} strokeWidth={flashed ? 3 : 0} style={{ transition: 'fill 0.3s, stroke 0.3s' }} />
                      {flashed && <path d={pointsToBezierPath(zone.points)} fill="none" stroke={flashPair.color} strokeWidth={6} opacity={0.5} style={{ filter: `drop-shadow(0 0 8px ${flashPair.color})` }} />}
                      {zone.type === 'texte' && (() => {
                        let idxStart = 0, idxEnd = 1;
                        if (Array.isArray(zone.arcPoints) && zone.arcPoints.length === 2) { idxStart = zone.arcPoints[0]; idxEnd = zone.arcPoints[1]; }
                        const pts = Array.isArray(zone.points) && zone.points.length >= 2 ? zone.points : [{x:0,y:0},{x:1,y:1}];
                        if (idxStart >= pts.length) idxStart = 0;
                        if (idxEnd >= pts.length) idxEnd = Math.min(1, pts.length - 1);
                        const { r, delta } = interpolateArc(pts, idxStart, idxEnd, 0);
                        const arcLen = r * delta;
                        const textValue = zone.content || zone.label || '';
                        const safeText = typeof textValue === 'string' ? textValue : '';
                        const baseFontSize = 32;
                        const textLen = safeText.length * baseFontSize * 0.6;
                        const fontSize = textLen > arcLen - 48 ? Math.max(12, (arcLen - 48) / (safeText.length * 0.6)) : baseFontSize;
                        return <text fontSize={fontSize} fontFamily="Arial" fill="#fff" fontWeight="bold"><textPath xlinkHref={`#gs-text-curve-${zone.id}`} startOffset="50%" textAnchor="middle" dominantBaseline="middle">{textValue}</textPath></text>;
                      })()}
                      {(zone.type === 'calcul' || zone.type === 'chiffre') && zone.content && (() => {
                        const bbox = getZoneBoundingBox(zone.points);
                        const cx = bbox.x + bbox.width / 2; const cy = bbox.y + bbox.height / 2;
                        const base = Math.max(12, Math.min(bbox.width, bbox.height));
                        const chiffreBaseMin = chiffreRefBase || base;
                        const effectiveBase = (zone.type === 'chiffre') ? Math.max(base, chiffreBaseMin) : base;
                        const rawFontSize = (zone.type === 'chiffre' ? 0.42 : 0.28) * effectiveBase;
                        const contentStr = String(zone.content ?? '').trim();
                        const fitW = contentStr.length > 0 ? (bbox.width * 0.92) / (contentStr.length * 0.52) : rawFontSize;
                        const fontSize = Math.max(10, zone.type === 'chiffre' ? Math.min(rawFontSize, fitW) : Math.min(rawFontSize, fitW, bbox.height * 0.75));
                        const angle = Number(zone.angle ?? 0);
                        const mo = zone.mathOffset || { x: 0, y: 0 };
                        return (
                          <g transform={`translate(${mo.x || 0} ${mo.y || 0}) rotate(${angle} ${cx} ${cy})`}>
                            <text x={cx} y={cy} textAnchor="middle" alignmentBaseline="middle" fontSize={fontSize} fill="#456451" fontWeight="bold">{zone.content}</text>
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}
              </svg>
              {flashPair && (
                <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: flashPair.color, color: '#fff', padding: '6px 18px', borderRadius: 20, fontWeight: 700, fontSize: 14, zIndex: 10, boxShadow: `0 0 20px ${flashPair.color}66`, animation: 'fadeIn 0.2s ease' }}>
                  ✅ {flashPair.playerName}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🗺️</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>En attente de la carte...</div>
              <div style={{ fontSize: 13, marginTop: 8, opacity: 0.6 }}>La carte apparaîtra au lancement du jeu</div>
            </div>
          )}
        </div>

        {/* RIGHT: SCOREBOARD + FEED */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          {/* Scoreboard */}
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.18)', padding: '14px 16px', flex: '0 0 auto', maxHeight: '50%', overflowY: 'auto', backdropFilter: 'blur(8px)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#fff' }}>🏆 Classement ({sortedPlayers.length})</h3>
            {sortedPlayers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>⏳ En attente...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sortedPlayers.slice(0, 20).map((player, idx) => (
                  <div key={player.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: idx === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${idx === 0 ? `${CC.yellow}44` : 'transparent'}`, transition: 'all 0.3s' }}>
                    <div style={{ fontSize: idx < 3 ? 18 : 13, fontWeight: 900, minWidth: 28, textAlign: 'center' }}>{getMedal(idx)}</div>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${getPlayerColor(idx)}, ${getPlayerColor(idx)}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                      {(player.name || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: '#fff' }}>{player.name}</div>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '2px 10px', minWidth: 36, textAlign: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: getPlayerColor(idx) }}>{player.score || player.total || 0}</span>
                    </div>
                  </div>
                ))}
                {sortedPlayers.length > 20 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 4 }}>+{sortedPlayers.length - 20} autres joueurs</div>}
              </div>
            )}
          </div>

          {/* Live feed */}
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.18)', padding: '14px 16px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, backdropFilter: 'blur(8px)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#fff' }}>📡 Fil en direct</h3>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>En attente d'événements...</div>
              ) : events.map((ev, i) => {
                const evColors = { pair: '#10b981', start: CC.yellow, end: '#8b5cf6', round: '#3b82f6', elimination: '#ef4444', system: '#64748b', error: '#ef4444', info: '#94a3b8' };
                const isPair = ev.type === 'pair' && ev.color;
                if (isPair) {
                  const pairLabel = (() => {
                    if (ev.kind === 'calcnum' && ev.calcExpr && ev.calcResult) return `${ev.calcExpr} = ${ev.calcResult}`;
                    if (ev.kind === 'imgtxt' && ev.imageLabel) return ev.imageLabel;
                    return ev.displayText || ev.text || '';
                  })();
                  return (
                    <div key={i} style={{ padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: `1px solid ${ev.color}44`, animation: i === 0 ? 'fadeIn 0.3s ease' : 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: ev.color, boxShadow: `0 0 6px ${ev.color}66` }} />
                        <span style={{ fontWeight: 700, fontSize: 11, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.playerName}</span>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{new Date(ev.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                      <div style={{ marginLeft: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {ev.kind === 'imgtxt' && ev.imageSrc && <img src={ev.imageSrc} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />}
                        {ev.kind === 'calcnum' ? (
                          <span style={{ fontSize: 11, color: '#fff' }}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ev.calcExpr}</span><span style={{ fontWeight: 800, margin: '0 3px', color: '#fbbf24' }}>=</span><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fbbf24' }}>{ev.calcResult}</span></span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pairLabel}</span>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', borderLeft: `3px solid ${evColors[ev.type] || '#64748b'}`, fontSize: 11, color: 'rgba(255,255,255,0.8)', animation: i === 0 ? 'fadeIn 0.3s ease' : 'none' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginRight: 6 }}>{new Date(ev.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    {ev.text}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
