// ==========================================
// GRANDE SALLE LIVE BOARD — Écran Présentateur
// Identique visuellement à ArenaSpectator (carte + classement + fil en direct)
// Connecté aux événements Grande Salle (gs:*)
// ==========================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { pointsToBezierPath } from '../CarteUtils';
import { animateBubblesFromZones, invalidateZoneCenterCache } from '../Carte';
import '../../styles/Carte.css';
import { getBackendUrl } from '../../utils/apiHelpers';
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

function resolveImageSrc(raw) {
  if (!raw) return null;
  const normalized = raw.startsWith('http') ? raw
    : process.env.PUBLIC_URL + '/' + (raw.startsWith('/') ? raw.slice(1) : (raw.startsWith('images/') ? raw : 'images/' + raw));
  return encodeURI(normalized).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
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

  useEffect(() => {
    const socket = io(getBackendUrl(), { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 10 });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const joinPayload = { name: '📺 Écran Live' };
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
      if (data?.duration) {
        setTimeLeft(data.duration);
        // Timer local côté client (pas de gs:timer-tick serveur)
        const startTime = Date.now();
        const dur = data.duration;
        const iv = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = dur - elapsed;
          if (remaining <= 0) { clearInterval(iv); setTimeLeft(0); }
          else setTimeLeft(remaining);
        }, 1000);
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
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`https://app.crazy-chrono.com/grande-salle/join/${tournamentId}`)}&color=0D6A7A`;

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
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>app.crazy-chrono.com</div>
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

  // ========== FINISHED ==========
  if (status === 'finished' && finish) {
    const winners = finish.winners || [finish.winner].filter(Boolean);
    const hasTie = finish.hasTie || winners.length > 1;
    return (
      <div style={{ position: 'fixed', inset: 0, background: CC.bgGradient, color: '#fff', padding: 32, overflow: 'auto' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 80, marginBottom: 16 }}>🏆</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, margin: '0 0 8px', color: CC.yellow }}>
            {hasTie ? 'Égalité au sommet !' : 'Victoire !'}
          </h1>
          <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>{finish.totalPlayers} joueurs — {finish.roundsPlayed} manches</div>
          <div style={{ background: `${CC.yellow}1A`, border: `2px solid ${CC.yellow}66`, borderRadius: 20, padding: 24, marginBottom: 24 }}>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>{hasTie ? `${winners.length} gagnants ex-aequo — Tirage au sort !` : 'Champion'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              {winners.map((w, i) => (
                <div key={i} style={{ background: `${CC.yellow}33`, borderRadius: 12, padding: '12px 20px', border: `1px solid ${CC.yellow}` }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: CC.yellow }}>{w.name}</div>
                  <div style={{ fontSize: 16, color: '#fff' }}>{w.score} pts</div>
                </div>
              ))}
            </div>
            {hasTie && <div style={{ marginTop: 16, fontSize: 16, color: CC.yellow, fontWeight: 700 }}>🎲 Le gagnant final sera désigné par tirage au sort !</div>}
          </div>
          <div style={{ textAlign: 'left' }}>
            {(finish.fullRanking || []).slice(0, 10).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: i < 3 ? `${CC.yellow}15` : CC.cardBg, borderRadius: 10, marginBottom: 4 }}>
                <span style={{ fontWeight: 900, color: i < 3 ? CC.yellow : 'rgba(255,255,255,0.4)', width: 36, fontSize: 16 }}>#{p.finalRank}</span>
                <span style={{ flex: 1, fontWeight: 700, color: '#fff', fontSize: 16 }}>{p.name}</span>
                <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>{p.score} pts</span>
              </div>
            ))}
          </div>
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
              <img src={svgPath} alt="" className="carte-bg" draggable={false} />
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
