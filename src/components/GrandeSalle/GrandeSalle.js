import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getBackendUrl, isFree } from '../../utils/subscription';
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
  const roundTimerRef = useRef(null);

  useEffect(() => { if (isFree()) navigate('/pricing', { replace: true }); }, [navigate]);

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
  }, []);

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
    try {
      const a = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (a.name && a.name !== 'Utilisateur') return a.name;
      if (a.firstName) return [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
      if (a.email) return a.email.split('@')[0];
    } catch {}
    return 'Joueur';
  }, []);

  useEffect(() => {
    if (isFree()) return;
    const socket = io(getBackendUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true); setMyId(socket.id);
      const joinPayload = { name: getPlayerName() };
      if (tournamentId) joinPayload.tournamentId = tournamentId;
      else joinPayload.salleId = 'grande-salle-publique';
      socket.emit('gs:join', joinPayload, (res) => {
        if (res?.tournamentTitle) setTournamentTitle(res.tournamentTitle);
        if (res?.autoStartCountdown != null) setLobbyCountdown(res.autoStartCountdown);
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('gs:state', (d) => {
      setStatus(d.status); setPlayers(d.players||[]); setTotalPlayers(d.totalPlayers||0);
      setActivePlayers(d.activePlayers||0); setEliminationWave(d.eliminationWave||0); setRoundsPlayed(d.roundsPlayed||0);
    });
    socket.on('gs:joined-as-spectator', (d) => { setIsSpectator(true); if (d?.tournamentTitle) setTournamentTitle(d.tournamentTitle); });
    socket.on('gs:lobby-countdown', ({ t }) => setLobbyCountdown(t));
    socket.on('gs:countdown', ({ t }) => { setLobbyCountdown(null); setCountdown(t); setStatus('countdown'); });
    socket.on('gs:elimination', (d) => {
      setLastElimination(d);
      setEliminatedData(d);
      setStatus('elimination');
    });
    socket.on('gs:round:new', (payload) => {
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
            startedAt: Date.now(),
          }));
        }
      } catch {}
      console.log('[GS] Navigating to /carte with GS mode', { salleId, zonesCount: payload?.zones?.length });
      // Disconnect this socket — Carte.js will create its own and reconnect
      socket.disconnect();
      navigate('/carte?gs=' + encodeURIComponent(salleId));
    });
    // If finish arrives while still on this page (e.g. returned from /carte)
    socket.on('gs:finish', (d) => { setFinish(d); setStatus('finished'); });

    return () => { socket.emit('gs:leave'); socket.disconnect(); if(roundTimerRef.current)clearInterval(roundTimerRef.current); };
  }, [getPlayerName, navigate, tournamentId]);

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

  // ========== LOBBY ==========
  if (status === 'lobby') return (
    <div style={PAGE}><div style={{ maxWidth: 700, margin: '0 auto' }}>
      <button onClick={() => navigate('/modes')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', marginBottom: 20 }}>← Retour</button>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏟️</div>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #F5A623, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{tournamentTitle || 'Grande Salle'}</h1>
        <p style={{ color: '#94a3b8', fontSize: 16, marginTop: 8 }}>{tournamentId ? 'Tournoi programmé' : 'Course Éliminatoire — Tous les abonnés sont les bienvenus !'}</p>
      </div>
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
        {totalPlayers < 3 && totalPlayers > 0 && (
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
      {totalPlayers >= 3 && <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={handleStart} style={{ padding: '16px 40px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #F5A623, #ff6b35)', color: '#fff', fontWeight: 800, fontSize: 18, cursor: 'pointer', boxShadow: '0 6px 20px rgba(245,166,35,0.4)' }}>Lancer maintenant !</button>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>{lobbyCountdown > 0 ? `Démarrage auto dans ${lobbyCountdown}s — ou lancez maintenant` : 'Minimum 3 joueurs requis'}</div>
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
      <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8, marginBottom: 30 }}>{finish.totalPlayers} joueurs — {finish.roundsPlayed} manches — {finish.eliminationWaves} vagues</div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 16, marginBottom: 30 }}>
        {(finish.podium||[]).slice(0, 3).map((p, i) => {
          const h = [160, 120, 100], em = ['🥇', '🥈', '🥉'], co = ['#F5A623', '#94a3b8', '#cd7f32'];
          return <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{em[i]}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{p.name}</div>
            <div style={{ width: 80, height: h[i], background: `linear-gradient(to top, ${co[i]}33, ${co[i]}88)`, borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${co[i]}` }}>
              <span style={{ fontWeight: 900, fontSize: 24, color: co[i] }}>{p.score}</span>
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
      <button onClick={() => navigate('/modes')} style={{ marginTop: 30, padding: '14px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #0D6A7A, #1AACBE)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Retour au menu</button>
    </div></div>
  );

  // ========== PLAYING ==========
  const myRank = leaderboard.find(l => l.id === myId)?.rank || '?';
  const myScore = leaderboard.find(l => l.id === myId)?.total || 0;
  return (
    <div style={PAGE}><div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isSpectator && <span style={BADGE('#6366f1')}>Mode Spectateur</span>}
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
                  color: '#e2e8f0', cursor: isSpectator ? 'default' : 'pointer', textAlign: 'center', fontSize: 13, fontWeight: 600, minHeight: 60, transition: 'all 0.15s',
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
