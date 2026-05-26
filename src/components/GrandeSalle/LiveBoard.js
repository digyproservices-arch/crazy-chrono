import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getBackendUrl } from '../../utils/subscription';

const PAGE = { minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', color: '#fff', padding: '24px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' };
const BADGE = (c) => ({ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: c, fontSize: 12, fontWeight: 700 });

export default function LiveBoard() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
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

  useEffect(() => {
    const salleId = tournamentId ? `tournament:${tournamentId}` : 'grande-salle-publique';
    const socket = io(getBackendUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const joinPayload = { name: '📺 Écran Live', salleId };
      if (tournamentId) joinPayload.tournamentId = tournamentId;
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
    socket.on('gs:countdown', ({ t }) => setStatus('countdown'));

    socket.on('gs:leaderboard', ({ leaderboard: lb }) => {
      if (lb) setLeaderboard(lb);
    });

    socket.on('gs:scores-update', ({ leaderboard: lb }) => {
      if (lb) setLeaderboard(lb);
    });

    socket.on('gs:elimination', (d) => {
      setLastElimination(d);
      setStatus('elimination');
      setTimeout(() => setStatus('playing'), 8000);
    });

    socket.on('gs:finish', (d) => {
      setFinish(d);
      setStatus('finished');
    });

    socket.on('gs:round:new', () => {
      setStatus('playing');
    });

    return () => { socket.disconnect(); };
  }, [tournamentId]);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`https://app.crazy-chrono.com/grande-salle/tournament/${tournamentId}`)}&color=0D6A7A`;

  // ========== LOBBY ==========
  if (status === 'lobby') return (
    <div style={PAGE}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🏟️</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #F5A623, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{tournamentTitle || 'Grande Salle'}</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* QR Code */}
          <div style={{ textAlign: 'center', background: '#fff', borderRadius: 20, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>📱 Flashez pour jouer</div>
            <img src={qrUrl} alt="QR Code" style={{ width: 220, height: 220, borderRadius: 8 }} />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>app.crazy-chrono.com</div>
          </div>

          {/* Player count + list */}
          <div>
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, border: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 4 }}>Joueurs connectés</div>
              <div style={{ fontSize: 96, fontWeight: 900, color: '#F5A623', lineHeight: 1 }}>{totalPlayers}</div>
              {lobbyCountdown > 0 && (
                <div style={{ marginTop: 12, fontSize: 28, fontWeight: 800, color: '#ff6b35' }}>Départ dans {lobbyCountdown}s</div>
              )}
            </div>
            {players.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {players.slice(0, 40).map(p => (
                  <span key={p.id} style={{ ...BADGE('rgba(255,255,255,0.1)'), color: '#e2e8f0', fontSize: 11 }}>{p.name}</span>
                ))}
                {players.length > 40 && <span style={{ ...BADGE('rgba(255,255,255,0.05)'), color: '#64748b' }}>+{players.length - 40}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ========== COUNTDOWN ==========
  if (status === 'countdown') return (
    <div style={{ ...PAGE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 200, fontWeight: 900, color: '#F5A623', textShadow: '0 0 60px rgba(245,166,35,0.6)' }}>3</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#e2e8f0', marginTop: 16 }}>C'est parti !</div>
        <div style={{ fontSize: 18, color: '#94a3b8' }}>{totalPlayers} joueurs en compétition</div>
      </div>
    </div>
  );

  // ========== ELIMINATION ==========
  if (status === 'elimination' && lastElimination) return (
    <div style={{ ...PAGE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 700, textAlign: 'center' }}>
        <div style={{ fontSize: 80, marginBottom: 16 }}>🔥</div>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: '#ef4444', margin: '0 0 12px' }}>Élimination — Vague {lastElimination.wave}</h1>
        <div style={{ fontSize: 20, color: '#94a3b8', marginBottom: 20 }}>{lastElimination.eliminated?.length} éliminé(s) — {lastElimination.remainingCount} restent en course</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {lastElimination.eliminated?.slice(0, 20).map((e, i) => (
            <span key={i} style={{ ...BADGE('rgba(239,68,68,0.3)'), color: '#fca5a5', fontSize: 14 }}>💀 {e.name} ({e.score})</span>
          ))}
        </div>
      </div>
    </div>
  );

  // ========== FINISHED ==========
  if (status === 'finished' && finish) {
    const winners = finish.winners || [finish.winner].filter(Boolean);
    const hasTie = finish.hasTie || winners.length > 1;
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 80, marginBottom: 16 }}>🏆</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, margin: '0 0 8px', background: 'linear-gradient(135deg, #F5A623, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {hasTie ? 'Égalité au sommet !' : 'Victoire !'}
          </h1>
          <div style={{ fontSize: 18, color: '#94a3b8', marginBottom: 24 }}>{finish.totalPlayers} joueurs — {finish.roundsPlayed} manches</div>

          {/* Winners */}
          <div style={{ background: 'rgba(245,166,35,0.1)', border: '2px solid rgba(245,166,35,0.4)', borderRadius: 20, padding: 24, marginBottom: 24 }}>
            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>{hasTie ? `${winners.length} gagnants ex-aequo — Tirage au sort !` : 'Champion'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              {winners.map((w, i) => (
                <div key={i} style={{ background: 'rgba(245,166,35,0.2)', borderRadius: 12, padding: '12px 20px', border: '1px solid #F5A623' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#F5A623' }}>{w.name}</div>
                  <div style={{ fontSize: 16, color: '#e2e8f0' }}>{w.score} pts</div>
                </div>
              ))}
            </div>
            {hasTie && <div style={{ marginTop: 16, fontSize: 16, color: '#F5A623', fontWeight: 700 }}>🎲 Le gagnant final sera désigné par tirage au sort !</div>}
          </div>

          {/* Top 10 */}
          <div style={{ textAlign: 'left' }}>
            {(finish.fullRanking || []).slice(0, 10).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: i < 3 ? 'rgba(245,166,35,0.1)' : 'rgba(255,255,255,0.03)', borderRadius: 10, marginBottom: 4 }}>
                <span style={{ fontWeight: 900, color: i < 3 ? '#F5A623' : '#64748b', width: 36, fontSize: 16 }}>#{p.finalRank}</span>
                <span style={{ flex: 1, fontWeight: 700, color: '#e2e8f0', fontSize: 16 }}>{p.name}</span>
                <span style={{ fontWeight: 800, color: '#94a3b8', fontSize: 16 }}>{p.score} pts</span>
              </div>
            ))}
          </div>

          <button onClick={() => navigate('/modes')} style={{ marginTop: 30, padding: '14px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #0D6A7A, #1AACBE)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Retour</button>
        </div>
      </div>
    );
  }

  // ========== PLAYING (live leaderboard) ==========
  const displayList = leaderboard.length > 0 ? leaderboard : players;
  return (
    <div style={PAGE}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: '#F5A623' }}>{tournamentTitle || 'Grande Salle'}</h1>
            <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>Classement en direct</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={BADGE('rgba(16,185,129,0.2)')}>Manche {roundsPlayed}</span>
            <span style={BADGE('rgba(245,166,35,0.2)')}>{activePlayers} actifs</span>
            {eliminationWave > 0 && <span style={BADGE('rgba(239,68,68,0.2)')}>Vague {eliminationWave}</span>}
          </div>
        </div>

        {/* Leaderboard */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          {displayList.slice(0, 50).map((p, i) => (
            <div key={p.id || i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
              background: i < 3 ? 'rgba(245,166,35,0.08)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
              borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
              <span style={{ fontWeight: 900, color: i < 3 ? '#F5A623' : '#64748b', width: 40, fontSize: 18 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${p.rank || i + 1}`}
              </span>
              <span style={{ flex: 1, fontWeight: 700, color: '#e2e8f0', fontSize: 16 }}>{p.name}</span>
              <span style={{ fontWeight: 800, color: '#F5A623', fontSize: 18 }}>{p.score || p.total || 0}</span>
            </div>
          ))}
          {displayList.length === 0 && <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>En attente du début de la course...</div>}
        </div>
      </div>
    </div>
  );
}
