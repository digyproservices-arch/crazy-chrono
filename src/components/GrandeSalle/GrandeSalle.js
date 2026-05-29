import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getBackendUrl, isFree } from '../../utils/subscription';
import { flushGsClickLog } from '../../utils/clickLogger';
import { pointsToBezierPath } from '../CarteUtils';
import { animateBubblesFromZones, invalidateZoneCenterCache } from '../Carte';
import { PLAYER_PRIMARY_COLORS, getPlayerColorComboByIndex } from '../../utils/playerColors';
import { getInitials } from '../../utils/pairDisplay';
import '../../styles/Carte.css';
// --- SVG helpers (identiques à LiveBoard.js) ---
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
function resolveImageSrc(raw) {
  if (!raw) return null;
  const normalized = raw.startsWith('http') ? raw
    : process.env.PUBLIC_URL + '/' + (raw.startsWith('/') ? raw.slice(1) : (raw.startsWith('images/') ? raw : 'images/' + raw));
  return encodeURI(normalized).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

const PAGE = { minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', color: '#fff', padding: '20px 16px' };
const CARD = { background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.1)' };
const BADGE = (c) => ({ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: c, fontSize: 12, fontWeight: 700 });

export default function GrandeSalle() {
  const navigate = useNavigate();
  const { tournamentId } = useParams();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('lobby');
  const [players, setPlayers] = useState([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [activePlayers, setActivePlayers] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [eliminationWave, setEliminationWave] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lastElimination, setLastElimination] = useState(null);
  const [finish, setFinish] = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [myId, setMyId] = useState(null);
  const [zones, setZones] = useState([]);
  const [selectedZones, setSelectedZones] = useState([]);
  const [pairFeedback, setPairFeedback] = useState(null);
  const [roundTimeLeft, setRoundTimeLeft] = useState(null);
  const [tournamentTitle, setTournamentTitle] = useState(null);
  const [upcomingTournaments, setUpcomingTournaments] = useState([]);
  const [lobbyCountdown, setLobbyCountdown] = useState(null);
  const [eliminatedData, setEliminatedData] = useState(null);
  const [newRecord, setNewRecord] = useState(null);
  const [manualStart, setManualStart] = useState(false);
  const [accessDenied, setAccessDenied] = useState(null);
  const roundTimerRef = useRef(null);
  const zonesRef = useRef([]);
  const [flashPair, setFlashPair] = useState(null);
  const [spectatorEvents, setSpectatorEvents] = useState([]);
  const addSpectatorEvent = useCallback((text, type = 'info', extra = null) => {
    setSpectatorEvents(prev => [{ text, type, time: Date.now(), ...(extra || {}) }, ...prev].slice(0, 50));
  }, []);
  const chiffreRefBase = useMemo(() => {
    if (!Array.isArray(zones) || zones.length === 0) return null;
    const bases = zones.filter(z => z?.type === 'chiffre' && Array.isArray(z.points) && z.points.length)
      .map(z => { const b = getZoneBoundingBox(z.points); return Math.max(12, Math.min(b.width, b.height)); });
    if (!bases.length) return null;
    const sorted = [...bases].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }, [zones]);
  const sortedLeaderboard = useMemo(() => {
    const list = leaderboard.length > 0 ? leaderboard : players;
    return [...list].sort((a, b) => (b.score || b.total || 0) - (a.score || a.total || 0));
  }, [leaderboard, players]);
  // ✅ FIX: Ref to track eliminated status across closures (prevents gs:round:new from navigating back to /carte)
  const eliminatedRef = useRef((() => { try { return !!localStorage.getItem('cc_gs_elimination'); } catch { return false; } })());

  // Check if user is admin (can start manually)
  const isAdmin = (() => { try { const a = JSON.parse(localStorage.getItem('cc_auth') || '{}'); return a.role === 'admin' || a.role === 'cpd'; } catch { return false; } })();

  const checkGSRecord = useCallback((finishData, socketId) => {
    try {
      const sid = localStorage.getItem('cc_user_id');
      if (!sid) return;
      const me = (finishData.fullRanking || []).find(p => p.id === socketId);
      if (!me || !me.score) return;
      const key = `cc_gs_best_${sid}`;
      const prev = JSON.parse(localStorage.getItem(key) || 'null') || { bestScore: 0, bestPosition: 999 };
      const updated = {
        bestScore: Math.max(prev.bestScore || 0, me.score),
        bestPosition: Math.min(prev.bestPosition || 999, me.finalRank || 999),
      };
      const isNew = updated.bestScore > (prev.bestScore || 0) || updated.bestPosition < (prev.bestPosition || 999);
      if (isNew) {
        localStorage.setItem(key, JSON.stringify(updated));
        setNewRecord({ score: me.score, position: me.finalRank, prevBestScore: prev.bestScore || 0 });
      }
    } catch {}
  }, []);

  // Rediriger les free SAUF si c'est un guest qui rejoint un tournoi via QR code
  useEffect(() => {
    if (tournamentId) {
      try { const g = localStorage.getItem('cc_gs_guest'); if (g) return; } catch {}
    }
    if (isFree()) navigate('/pricing', { replace: true });
  }, [navigate, tournamentId]);

  // Check if returning from /carte with finish data
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cc_gs_finish');
      if (raw) {
        const data = JSON.parse(raw);
        localStorage.removeItem('cc_gs_finish');
        setFinish(data);
        setStatus('finished');
        if (data.leaderboard) setLeaderboard(data.leaderboard);
        const gsSocketId = localStorage.getItem('cc_gs_my_socket_id');
        if (gsSocketId) checkGSRecord(data, gsSocketId);
      }
    } catch {}
    // Check if returning from /carte after elimination
    try {
      const elimRaw = localStorage.getItem('cc_gs_elimination');
      if (elimRaw) {
        const elimData = JSON.parse(elimRaw);
        localStorage.removeItem('cc_gs_elimination');
        setLastElimination(elimData);
        setEliminatedData(elimData);
        setStatus('elimination');
      }
    } catch {}
  }, [checkGSRecord]);

  // Fetch upcoming tournaments for lobby display
  useEffect(() => {
    if (isFree() || tournamentId) return;
    const backendUrl = getBackendUrl();
    fetch(`${backendUrl}/api/gs/tournaments?upcoming=true`)
      .then(r => r.json())
      .then(j => { if (j.ok) setUpcomingTournaments(j.tournaments || []); })
      .catch(() => {});
  }, [tournamentId]);

  const getPlayerName = useCallback(() => {
    // Priorité 1: données guest (QR code join)
    try {
      const g = JSON.parse(localStorage.getItem('cc_gs_guest') || 'null');
      if (g?.displayName) return g.displayName;
    } catch {}
    // Priorité 2: compte connecté
    try {
      const a = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (a.name && a.name !== 'Utilisateur') return a.name;
      if (a.firstName) return [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
      if (a.email) return a.email.split('@')[0];
    } catch {}
    return 'Joueur';
  }, []);

  useEffect(() => {
    // Permettre la connexion pour les guests de tournoi même en free
    const hasGuestData = (() => { try { return !!localStorage.getItem('cc_gs_guest'); } catch { return false; } })();
    if (isFree() && !(tournamentId && hasGuestData)) return;
    const socket = io(getBackendUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true); setMyId(socket.id);
      const joinPayload = { name: getPlayerName() };
      try { const uid = localStorage.getItem('cc_user_id'); if (uid) joinPayload.studentId = uid; } catch {}
      // Ajouter email/userId depuis cc_gs_guest pour le contrôle d'accès
      try {
        const g = JSON.parse(localStorage.getItem('cc_gs_guest') || 'null');
        if (g?.email) joinPayload.email = g.email;
        if (g?.userId) joinPayload.userId = g.userId;
      } catch {}
      if (tournamentId) joinPayload.tournamentId = tournamentId;
      else joinPayload.salleId = 'grande-salle-publique';
      socket.emit('gs:join', joinPayload, (res) => {
        if (res && !res.ok && res.error) {
          setAccessDenied(res);
          return;
        }
        // ✅ FIX: Reset eliminated state SEULEMENT si lobby (nouvelle partie)
        // Si status=playing/paused, le joueur reconnecte et le serveur enverra gs:joined-as-spectator
        if (res?.status === 'lobby') {
          eliminatedRef.current = false;
          setIsSpectator(false);
          try { localStorage.removeItem('cc_gs_elimination'); } catch {}
        }
        if (res?.tournamentTitle) setTournamentTitle(res.tournamentTitle);
        if (res?.autoStartCountdown != null) setLobbyCountdown(res.autoStartCountdown);
        if (res?.manualStart) setManualStart(true);
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('gs:state', (d) => {
      setStatus(d.status); setPlayers(d.players||[]); setTotalPlayers(d.totalPlayers||0);
      setActivePlayers(d.activePlayers||0); setEliminationWave(d.eliminationWave||0); setRoundsPlayed(d.roundsPlayed||0);
    });
    socket.on('gs:joined-as-spectator', (d) => { setIsSpectator(true); if (d?.reason === 'eliminated') eliminatedRef.current = true; if (d?.tournamentTitle) setTournamentTitle(d.tournamentTitle); });
    socket.on('gs:lobby-countdown', ({ t }) => setLobbyCountdown(t));
    socket.on('gs:countdown', ({ t }) => {
      // ✅ FIX: Si countdown reçu, le joueur est actif dans cette partie
      eliminatedRef.current = false;
      setIsSpectator(false);
      setLobbyCountdown(null); setCountdown(t); setStatus('countdown');
    });
    socket.on('gs:elimination', (d) => {
      setLastElimination(d);
      setEliminatedData(d);
      eliminatedRef.current = true;
      setStatus('elimination');
    });
    socket.on('gs:round:new', (payload) => {
      // ✅ FIX: Spectateurs éliminés reçoivent les zones pour la vue en direct
      if (eliminatedRef.current) {
        console.log('[GS] gs:round:new en mode spectateur — mise à jour zones');
        // Activer la vue spectateur SVG (pas la grille de boutons)
        setIsSpectator(true);
        setStatus('playing');
        if (Array.isArray(payload?.zones) && payload.zones.length > 0) {
          setZones(payload.zones);
          zonesRef.current = payload.zones;
          invalidateZoneCenterCache();
        }
        if (payload?.roundIndex) setRoundsPlayed(payload.roundIndex);
        if (payload?.eliminationWave) setEliminationWave(payload.eliminationWave);
        // Timer spectateur local
        if (payload?.duration) {
          setRoundTimeLeft(payload.duration);
          if (roundTimerRef.current) clearInterval(roundTimerRef.current);
          const startTime = Date.now();
          const dur = payload.duration;
          roundTimerRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = dur - elapsed;
            if (remaining <= 0) { clearInterval(roundTimerRef.current); setRoundTimeLeft(0); }
            else setRoundTimeLeft(remaining);
          }, 1000);
        }
        return;
      }
      // Store GS session config and navigate to /carte for the real card rendering
      const salleId = tournamentId ? `tournament:${tournamentId}` : 'grande-salle-publique';
      try {
        localStorage.setItem('cc_session_cfg', JSON.stringify({ mode: 'grande-salle' }));
        localStorage.setItem('cc_gs_session', JSON.stringify({
          salleId,
          tournamentId: tournamentId || null,
          playerName: getPlayerName(),
          tournamentTitle: tournamentTitle || null,
        }));
        // Store round data so Carte.js can start immediately
        if (payload && Array.isArray(payload.zones)) {
          localStorage.setItem('cc_gs_round', JSON.stringify({
            zones: payload.zones,
            duration: payload.duration || 90,
            roundIndex: payload.roundIndex || 1,
            startedAt: payload.startedAt || Date.now(),
          }));
        }
      } catch {}
      console.log('[GS] Navigating to /carte with GS mode', { salleId, zonesCount: payload?.zones?.length });
      // Flush monitoring data before navigation
      try { flushGsClickLog(); } catch {}
      // Disconnect this socket — Carte.js will create its own and reconnect
      socket.disconnect();
      navigate('/carte?gs=' + encodeURIComponent(salleId));
    });

    // ✅ FIX: Spectateurs voient les paires validées + animation bulles
    socket.on('gs:pair:valid', (data) => {
      try {
        const name = data?.playerName || '?';
        const playerIdx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % PLAYER_PRIMARY_COLORS.length;
        const { primary: color, border: borderColor } = getPlayerColorComboByIndex(playerIdx);
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

        addSpectatorEvent(`${name} a trouvé une paire !`, 'pair', pairExtra);

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

        if (data?.leaderboard) setLeaderboard(data.leaderboard);
      } catch (err) { console.error('[GS][Spectator] pair:valid error:', err); }
    });

    // If finish arrives while still on this page (e.g. returned from /carte)
    socket.on('gs:finish', (d) => { eliminatedRef.current = false; setFinish(d); setStatus('finished'); checkGSRecord(d, socket.id); });

    return () => { socket.emit('gs:leave'); socket.disconnect(); if(roundTimerRef.current)clearInterval(roundTimerRef.current); };
  }, [getPlayerName, navigate, tournamentId, checkGSRecord]);

  const handleZoneClick = useCallback((zoneId) => {
    if (isSpectator || status !== 'playing') return;
    setSelectedZones(prev => {
      if (prev.includes(zoneId)) return prev.filter(z => z !== zoneId);
      const next = [...prev, zoneId];
      if (next.length === 2) { socketRef.current?.emit('gs:attemptPair', { a: next[0], b: next[1] }); return []; }
      return next;
    });
  }, [isSpectator, status]);

  const handleStart = () => {
    const startId = tournamentId ? `tournament:${tournamentId}` : 'grande-salle-publique';
    socketRef.current?.emit('gs:start', { salleId: startId }, (res) => { if (!res?.ok) alert(res?.error || 'Erreur'); });
  };

  // ========== ACCESS DENIED ==========
  if (accessDenied) return (
    <div style={PAGE}><div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>{accessDenied.accessType === 'subscribers' ? '⭐' : '💳'}</div>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: '#e2e8f0', margin: '0 0 12px' }}>Accès restreint</h1>
      <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>{accessDenied.error}</p>
      {accessDenied.accessType === 'subscribers' && (
        <button onClick={() => navigate('/pricing')} style={{ padding: '14px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #F5A623, #ff6b35)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 15px rgba(245,166,35,0.4)', marginBottom: 12 }}>
          Découvrir les abonnements
        </button>
      )}
      {accessDenied.accessType === 'paid' && !accessDenied.alreadyPaid && (
        <div style={{ ...CARD, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: '#8b5cf6', fontWeight: 700, marginBottom: 8 }}>💳 Paiement requis</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0' }}>{accessDenied.price ? `${(accessDenied.price / 100).toFixed(2)}€` : 'Payant'}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 14 }}>Les abonnés participent gratuitement</div>
          <button onClick={async () => {
            try {
              const guest = JSON.parse(localStorage.getItem('cc_gs_guest') || '{}');
              const r = await fetch(`${getBackendUrl()}/api/gs/tournaments/${tournamentId}/checkout`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: guest.email, first_name: guest.firstName, last_name: guest.lastName }),
              });
              const j = await r.json();
              if (j.ok && j.url) window.location.href = j.url;
              else alert(j.error || 'Erreur lors de la création du paiement');
            } catch (e) { alert('Erreur réseau'); }
          }} style={{ padding: '14px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 15px rgba(139,92,246,0.4)', width: '100%' }}>
            Payer {accessDenied.price ? `${(accessDenied.price / 100).toFixed(2)}€` : ''} pour participer
          </button>
        </div>
      )}
      <button onClick={() => navigate(-1)} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>← Retour</button>
    </div></div>
  );

  // ========== LOBBY ==========
  if (status === 'lobby') return (
    <div style={PAGE}><div style={{ maxWidth: 700, margin: '0 auto' }}>
      <button onClick={() => navigate('/modes')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', marginBottom: 20 }}>← Retour</button>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏟️</div>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #F5A623, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{tournamentTitle || 'Grande Salle'}</h1>
        <p style={{ color: '#94a3b8', fontSize: 16, marginTop: 8 }}>{tournamentId ? 'Tournoi programmé' : 'Course Éliminatoire — Tous les abonnés sont les bienvenus !'}</p>
      </div>
      {/* QR CODE pour les tournois (visible quand projeté) */}
      {tournamentId && (
        <div style={{ ...CARD, textAlign: 'center', marginBottom: 24, background: 'rgba(255,255,255,0.95)', border: '2px solid #F5A623' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Flashez pour rejoindre</div>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(`https://app.crazy-chrono.com/grande-salle/join/${tournamentId}`)}&color=0D6A7A`}
            alt="QR Code"
            style={{ width: 280, height: 280, borderRadius: 12 }}
          />
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>app.crazy-chrono.com</div>
        </div>
      )}
      <div style={{ ...CARD, textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8 }}>Joueurs dans la salle</div>
        <div style={{ fontSize: 72, fontWeight: 900, color: '#F5A623', lineHeight: 1 }}>{totalPlayers}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>{connected ? <span style={BADGE('#10b981')}>Connecté</span> : <span style={BADGE('#ef4444')}>Déconnecté</span>}</div>
        {lobbyCountdown != null && lobbyCountdown > 0 && (
          <div style={{ marginTop: 16, padding: '12px 20px', borderRadius: 12, background: 'rgba(245,166,35,0.15)', border: '1px solid rgba(245,166,35,0.4)' }}>
            <div style={{ fontSize: 13, color: '#F5A623', fontWeight: 600, marginBottom: 4 }}>La course commence dans</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: '#F5A623' }}>{lobbyCountdown}s</div>
            <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', marginTop: 8 }}>
              <div style={{ width: `${Math.max(0, (lobbyCountdown / 60) * 100)}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #F5A623, #ff6b35)', transition: 'width 1s linear' }} />
            </div>
          </div>
        )}
        {manualStart && !lobbyCountdown && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#10b981', fontWeight: 600 }}>
            ⏳ En attente du lancement par l'organisateur...
          </div>
        )}
        {!manualStart && totalPlayers < 3 && totalPlayers > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>En attente de {3 - totalPlayers} joueur(s) de plus pour lancer...</div>
        )}
      </div>
      {players.length > 0 && <div style={{ ...CARD, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#e2e8f0' }}>Joueurs en attente</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {players.slice(0, 50).map(p => <span key={p.id} style={{ ...BADGE(p.id===myId?'#F5A623':'rgba(255,255,255,0.1)'), color: p.id===myId?'#000':'#e2e8f0' }}>{p.id===myId?'⭐ ':''}{p.name}</span>)}
          {players.length > 50 && <span style={{ ...BADGE('rgba(255,255,255,0.05)'), color: '#64748b' }}>+{players.length - 50} autres</span>}
        </div>
      </div>}
      <div style={{ ...CARD, background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.3)' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15, color: '#F5A623' }}>Comment ça marche ?</h3>
        <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8 }}>
          <div><strong>1.</strong> Tous les abonnés rejoignent la salle</div>
          <div><strong>2.</strong> La partie démarre automatiquement 60s après 3 joueurs</div>
          <div><strong>3.</strong> Trouvez les paires le plus vite possible !</div>
          <div><strong>4.</strong> Les derniers du classement sont éliminés à chaque vague</div>
          <div><strong>5.</strong> Le dernier survivant remporte la victoire !</div>
        </div>
      </div>
      {totalPlayers >= 3 && isAdmin && <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={handleStart} style={{ padding: '16px 40px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #F5A623, #ff6b35)', color: '#fff', fontWeight: 800, fontSize: 18, cursor: 'pointer', boxShadow: '0 6px 20px rgba(245,166,35,0.4)' }}>🚀 Lancer la course !</button>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>{manualStart ? `${totalPlayers} joueur(s) prêt(s) — Lancez quand vous voulez` : lobbyCountdown > 0 ? `Démarrage auto dans ${lobbyCountdown}s — ou lancez maintenant` : 'Minimum 3 joueurs requis'}</div>
      </div>}

      {/* Upcoming tournaments */}
      {!tournamentId && upcomingTournaments.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>Prochains Tournois</h3>
          {upcomingTournaments.map(t => {
            const d = new Date(t.scheduled_at);
            const now = Date.now();
            const diff = d.getTime() - now;
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const isOpen = t.status === 'open' || diff <= 1800000;
            return (
              <div key={t.id} style={{ ...CARD, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, border: isOpen ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{t.title}</div>
                  {t.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{t.description}</div>}
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    {diff > 0 && !isOpen && <span> — dans {days > 0 ? `${days}j ` : ''}{hours}h</span>}
                  </div>
                </div>
                {isOpen ? (
                  <button onClick={() => navigate(`/grande-salle/tournament/${t.id}`)} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Rejoindre</button>
                ) : (
                  <span style={{ ...BADGE('rgba(59,130,246,0.2)'), color: '#93c5fd' }}>Bientôt</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div></div>
  );

  // ========== COUNTDOWN ==========
  if (status === 'countdown') return (
    <div style={{ ...PAGE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 120, fontWeight: 900, color: '#F5A623', textShadow: '0 0 40px rgba(245,166,35,0.5)' }}>{countdown}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', marginTop: 16 }}>La course commence...</div>
        <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8 }}>{totalPlayers} joueurs en compétition</div>
      </div>
    </div>
  );

  // ========== ELIMINATION ==========
  const gsKeyframes = <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } }`}</style>;
  if (status === 'elimination' && lastElimination) {
    const wasMe = lastElimination.eliminated?.some(e => e.id === myId);
    const myElimData = wasMe ? lastElimination.eliminated.find(e => e.id === myId) : null;
    return (
      <div style={{ ...PAGE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {gsKeyframes}
        <div style={{ maxWidth: 550, textAlign: 'center' }}>
          {wasMe ? (
            <>
              <div style={{ fontSize: 80, marginBottom: 12, animation: 'pulse 1s ease-in-out infinite' }}>💀</div>
              <h1 style={{ fontSize: 32, fontWeight: 900, color: '#ef4444', margin: '0 0 8px' }}>Vous êtes éliminé !</h1>
              <div style={{ fontSize: 15, color: '#94a3b8', marginBottom: 24 }}>Vague {lastElimination.wave} — {lastElimination.elimPct || 25}% éliminés</div>

              {/* Personal stats card */}
              <div style={{ ...CARD, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: 24, padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 32 }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Votre score</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#F5A623' }}>{myElimData?.score || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Position finale</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#e2e8f0' }}>#{myElimData?.finalRank || '?'}<span style={{ fontSize: 14, fontWeight: 400, color: '#64748b' }}>/{lastElimination.totalPlayers}</span></div>
                  </div>
                </div>
              </div>

              {/* Eliminated list */}
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>Éliminés dans cette vague :</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
                {lastElimination.eliminated?.map((e, i) => <span key={i} style={{ ...BADGE(e.id===myId?'#ef4444':'rgba(239,68,68,0.2)'), color: e.id===myId?'#fff':'#fca5a5' }}>{e.name} ({e.score})</span>)}
              </div>

              {/* Choice buttons */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => { setIsSpectator(true); setStatus('playing'); }} style={{ padding: '14px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 15px rgba(99,102,241,0.4)' }}>
                  👁️ Rester spectateur
                </button>
                <button onClick={() => navigate('/modes')} style={{ padding: '14px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                  ← Quitter
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>En tant que spectateur, vous pouvez regarder la fin du match sans interagir.</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🔥</div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: '#F5A623', margin: '0 0 12px' }}>Vague d'élimination {lastElimination.wave}</h1>
              <div style={{ fontSize: 16, color: '#94a3b8', marginBottom: 16 }}>{lastElimination.eliminated?.length} éliminé(s) — {lastElimination.remainingCount} restent en course</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
                {lastElimination.eliminated?.map((e, i) => <span key={i} style={{ ...BADGE('rgba(239,68,68,0.2)'), color: '#fca5a5' }}>{e.name} ({e.score})</span>)}
              </div>
              <div style={{ fontSize: 15, color: '#10b981', fontWeight: 700 }}>✅ Vous êtes toujours en course ! Prochaine manche dans quelques secondes...</div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ========== FINISHED ==========
  if (status === 'finished' && finish) return (
    <div style={PAGE}><div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🏆</div>
      <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #F5A623, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fin de la Course !</h1>
      <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8, marginBottom: newRecord ? 12 : 30 }}>{finish.totalPlayers} joueurs — {finish.roundsPlayed} manches — {finish.eliminationWaves} vagues</div>
      {newRecord && <div style={{ background: 'linear-gradient(135deg, rgba(245,166,35,0.2), rgba(255,107,53,0.2))', border: '1px solid rgba(245,166,35,0.4)', borderRadius: 12, padding: '12px 20px', marginBottom: 20, animation: 'pulse 1.5s infinite' }}><span style={{ fontSize: 22 }}>🎉</span> <strong style={{ color: '#F5A623' }}>Nouveau record personnel !</strong> <span style={{ color: '#e2e8f0' }}>{newRecord.score} pts</span>{newRecord.prevBestScore > 0 && <span style={{ color: '#94a3b8', fontSize: 13 }}> (ancien : {newRecord.prevBestScore})</span>}</div>}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 16, marginBottom: 30 }}>
        {(finish.podium||[]).slice(0, 3).map((p, i, arr) => {
          // Rang réel basé sur le score (ex-aequo = même rang)
          const rank = p.finalRank || (1 + arr.filter(x => x.score > p.score).length);
          const ri = Math.min(rank - 1, 2); // 0=1er, 1=2e, 2=3e
          const h = [160, 120, 100], em = ['🥇', '🥈', '🥉'], co = ['#F5A623', '#94a3b8', '#cd7f32'];
          return <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{em[ri]}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{p.name}</div>
            <div style={{ width: 80, height: h[ri], background: `linear-gradient(to top, ${co[ri]}33, ${co[ri]}88)`, borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${co[ri]}` }}>
              <span style={{ fontWeight: 900, fontSize: 24, color: co[ri] }}>{p.score}</span>
            </div>
          </div>;
        })}
      </div>
      {(finish.fullRanking||[]).slice(0, 20).map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: i<3?'rgba(245,166,35,0.1)':'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 800, color: i<3?'#F5A623':'#64748b', width: 30 }}>#{p.finalRank}</span>
          <span style={{ flex: 1, fontWeight: 600, color: p.id===myId?'#F5A623':'#e2e8f0' }}>{p.id===myId?'⭐ ':''}{p.name}</span>
          <span style={{ fontWeight: 700, color: '#94a3b8' }}>{p.score} pts</span>
        </div>
      ))}
      {/* Upsell création de compte pour les guests */}
      {(() => { try { const g = JSON.parse(localStorage.getItem('cc_gs_guest') || 'null'); return g?.isGuest; } catch { return false; } })() && (
        <div style={{ ...CARD, background: 'rgba(13,106,122,0.15)', border: '1px solid rgba(26,172,190,0.3)', marginTop: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎮</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#1AACBE' }}>Envie de rejouer ?</h3>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.5 }}>
            Créez votre compte Crazy Chrono pour sauvegarder vos scores,<br/>participer aux prochains tournois et défier vos amis !
          </p>
          <button
            onClick={() => navigate('/login')}
            style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #0D6A7A, #1AACBE)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 15px rgba(13,106,122,0.4)' }}
          >
            Créer mon compte gratuitement
          </button>
        </div>
      )}
      <button onClick={() => navigate('/modes')} style={{ marginTop: 20, padding: '14px 32px', borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Retour au menu</button>
    </div></div>
  );

  // ========== PLAYING ==========
  const myRank = leaderboard.find(l => l.id === myId)?.rank || '?';
  const myScore = leaderboard.find(l => l.id === myId)?.total || 0;
  const svgPath = `${process.env.PUBLIC_URL}/images/carte-svg.svg`;
  const isFlashedZone = (zoneId) => flashPair && (flashPair.zoneAId === zoneId || flashPair.zoneBId === zoneId);
  const getMedal = (idx) => idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
  const getPlayerColor = (idx) => PLAYER_PRIMARY_COLORS[idx % PLAYER_PRIMARY_COLORS.length];

  // ========== SPECTATOR VIEW — Carte SVG en direct ==========
  const elimScore = eliminatedData?.myScore ?? eliminatedData?.score ?? lastElimination?.eliminated?.find(e => e.id === myId)?.score ?? 0;
  const elimRank = eliminatedData?.myRank ?? eliminatedData?.finalRank ?? lastElimination?.eliminated?.find(e => e.id === myId)?.rank ?? '?';
  const elimTotal = lastElimination?.totalPlayers || totalPlayers || '?';

  if (isSpectator) return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #0a1628 0%, #0f2744 30%, #0D3B66 60%, #0f2744 100%)', color: '#fff', padding: '12px 16px', overflow: 'hidden', touchAction: 'none', display: 'flex', flexDirection: 'column' }}>
      {/* Bandeau éliminé + info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '10px 16px', background: 'rgba(239,68,68,0.12)', borderRadius: 14, border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ fontSize: 32 }}>�</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fca5a5' }}>Vous avez été éliminé(e) — Vague {eliminationWave || lastElimination?.wave || '?'}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Position : <strong style={{ color: '#F5A623' }}>#{elimRank}</strong>/{elimTotal} • Score : <strong style={{ color: '#10b981' }}>{elimScore} pts</strong></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {roundTimeLeft != null && (
            <div style={{ padding: '5px 14px', borderRadius: 16, fontWeight: 900, fontSize: 18, color: roundTimeLeft <= 10 ? '#ef4444' : roundTimeLeft <= 30 ? '#F5A623' : '#10b981', background: 'rgba(0,0,0,0.4)', fontVariantNumeric: 'tabular-nums', minWidth: 50, textAlign: 'center' }}>
              {roundTimeLeft}s
            </div>
          )}
          <div style={{ padding: '5px 12px', borderRadius: 16, fontWeight: 700, fontSize: 11, color: '#a5b4fc', background: 'rgba(99,102,241,0.2)', whiteSpace: 'nowrap' }}>👁️ SPECTATEUR</div>
          <button onClick={() => navigate('/modes')} style={{ padding: '5px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>← Quitter</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8, textAlign: 'center' }}>
        🏟️ {tournamentTitle || 'Grande Salle'} • {activePlayers} joueurs actifs • Manche {roundsPlayed} • Assistez au match en direct
      </div>

      {/* Main: Carte SVG + Sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, flex: 1, minHeight: 0 }}>

        {/* LEFT: GAME CARD SVG */}
        <div style={{ position: 'relative', background: 'rgba(0,0,0,0.25)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.15)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {zones.length > 0 ? (
            <div className="carte" style={{ position: 'relative', width: '100%', height: '100%' }}>
              <object type="image/svg+xml" data={svgPath} className="carte-bg" />
              <svg className="carte-svg-overlay" width={1000} height={1000} viewBox="0 0 1000 1000" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', width: '100%', height: '100%', zIndex: 2 }}>
                <defs>
                  {zones.filter(z => z.type === 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
                    <clipPath id={`gs-spec-clip-${zone.id}`} key={`gs-spec-clip-${zone.id}`} clipPathUnits="userSpaceOnUse">
                      <path d={pointsToBezierPath(zone.points)} />
                    </clipPath>
                  ))}
                  {zones.filter(z => z.type !== 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
                    <path id={`gs-spec-tc-${zone.id}`} key={`gs-spec-tc-${zone.id}`} d={getArcPathFromZonePoints(zone.points, zone.id, zone.arcPoints, 0)} fill="none" />
                  ))}
                </defs>
                {zones.filter(z => z && typeof z === 'object' && Array.isArray(z.points) && z.points.length >= 2).map((zone) => {
                  const flashed = isFlashedZone(zone.id);
                  return (
                    <g key={zone.id} data-zone-id={zone.id}>
                      {zone.type === 'image' && zone.content && (() => {
                        const src = resolveImageSrc(zone.content);
                        const bbox = getZoneBoundingBox(zone.points);
                        return <image href={src} xlinkHref={src} x={bbox.x} y={bbox.y} width={bbox.width} height={bbox.height} style={{ pointerEvents: 'none', objectFit: 'cover' }} preserveAspectRatio="xMidYMid slice" clipPath={`url(#gs-spec-clip-${zone.id})`} />;
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
                        return <text fontSize={fontSize} fontFamily="Arial" fill="#fff" fontWeight="bold"><textPath xlinkHref={`#gs-spec-tc-${zone.id}`} startOffset="50%" textAnchor="middle" dominantBaseline="middle">{textValue}</textPath></text>;
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
              <div style={{ fontSize: 13, marginTop: 8, opacity: 0.6 }}>La carte apparaîtra à la prochaine manche</div>
            </div>
          )}
        </div>

        {/* RIGHT: SCOREBOARD + LIVE FEED */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          {/* Scoreboard */}
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.18)', padding: '14px 16px', flex: '0 0 auto', maxHeight: '50%', overflowY: 'auto', backdropFilter: 'blur(8px)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#fff' }}>🏆 Classement ({sortedLeaderboard.length})</h3>
            {sortedLeaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>⏳ En attente...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sortedLeaderboard.slice(0, 20).map((player, idx) => (
                  <div key={player.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: idx === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${idx === 0 ? 'rgba(245,166,35,0.3)' : 'transparent'}`, transition: 'all 0.3s' }}>
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
                {sortedLeaderboard.length > 20 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 4 }}>+{sortedLeaderboard.length - 20} autres</div>}
              </div>
            )}
          </div>

          {/* Live feed */}
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.18)', padding: '14px 16px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, backdropFilter: 'blur(8px)' }}>
            <h3 data-cc-vignette="last-pair" style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#fff' }}>📡 Fil en direct</h3>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {spectatorEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>En attente d'événements...</div>
              ) : spectatorEvents.map((ev, i) => {
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
                  <div key={i} style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', borderLeft: '3px solid #64748b', fontSize: 11, color: 'rgba(255,255,255,0.8)', animation: i === 0 ? 'fadeIn 0.3s ease' : 'none' }}>
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

  // ========== PLAYING (joueur actif) ==========
  return (
    <div style={PAGE}><div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={BADGE('rgba(255,255,255,0.1)')}>Manche {roundsPlayed}</span>
          <span style={BADGE('rgba(245,166,35,0.2)')}>{activePlayers} joueurs actifs</span>
          {eliminationWave > 0 && <span style={BADGE('rgba(239,68,68,0.2)')}>Vague {eliminationWave}</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Rang: <strong style={{ color: '#F5A623', fontSize: 18 }}>#{myRank}</strong></span>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Score: <strong style={{ color: '#10b981', fontSize: 18 }}>{myScore}</strong></span>
          {roundTimeLeft != null && <span style={{ ...BADGE(roundTimeLeft < 10 ? '#ef4444' : 'rgba(255,255,255,0.1)'), fontSize: 16, fontWeight: 800 }}>⏱ {roundTimeLeft}s</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        {/* Game zone */}
        <div style={CARD}>
          {pairFeedback && <div style={{ textAlign: 'center', padding: 10, marginBottom: 12, borderRadius: 10, background: pairFeedback.type==='valid'?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)', color: pairFeedback.type==='valid'?'#10b981':'#ef4444', fontWeight: 700 }}>
            {pairFeedback.type==='valid'?'✓ Paire trouvée !':'✗ Mauvaise paire'}
          </div>}
          {zones.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {zones.map(z => (
                <button key={z.id} onClick={() => handleZoneClick(z.id)} style={{
                  padding: 12, borderRadius: 10, border: selectedZones.includes(z.id) ? '3px solid #F5A623' : '2px solid rgba(255,255,255,0.1)',
                  background: selectedZones.includes(z.id) ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0', cursor: 'pointer', textAlign: 'center', fontSize: 13, fontWeight: 600, minHeight: 60, transition: 'all 0.15s',
                }}>
                  {z.content || z.text || z.label || z.id}
                </button>
              ))}
            </div>
          ) : <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Chargement des zones...</div>}
        </div>

        {/* Leaderboard */}
        <div style={CARD}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#F5A623' }}>Classement en direct</h3>
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {(leaderboard.length > 0 ? leaderboard : players).slice(0, 30).map((p, i) => (
              <div key={p.id||i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 2, background: p.id===myId ? 'rgba(245,166,35,0.15)' : 'transparent' }}>
                <span style={{ fontWeight: 800, color: i<3?'#F5A623':'#64748b', width: 24, fontSize: 12 }}>#{p.rank||i+1}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: p.id===myId?700:400, color: p.id===myId?'#F5A623':'#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ fontWeight: 700, color: '#94a3b8', fontSize: 13 }}>{p.score||p.total||0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div></div>
  );
}
