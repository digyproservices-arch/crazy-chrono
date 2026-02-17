// ==========================================
// MODE SPECTATEUR - MATCH ARENA EN DIRECT
// Vue lecture seule pour professeur / diffusion TV
// ==========================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const getBackendUrl = () => process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function ArenaSpectator() {
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

  const addEvent = useCallback((text, type = 'info') => {
    setEvents(prev => [{ text, type, time: Date.now() }, ...prev].slice(0, 30));
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

    // Timeout si pas de réponse après 8s
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

    // État initial du spectateur
    socket.on('arena:spectate-state', (state) => {
      setMatchState(state);
      setPlayers(state.players || []);
      setStatus(state.status);
      setMode(state.mode || 'arena');
    });

    // === EVENTS ARENA ===
    const setupListeners = (prefix) => {
      socket.on(`${prefix}:players-update`, ({ players: p }) => {
        if (p) setPlayers(p);
      });

      socket.on(`${prefix}:player-joined`, ({ players: p }) => {
        if (p) setPlayers(p);
        addEvent('Un joueur a rejoint le match', 'join');
      });

      socket.on(`${prefix}:player-ready`, ({ players: p }) => {
        if (p) setPlayers(p);
      });

      socket.on(`${prefix}:countdown`, ({ count }) => {
        setCountdown(count);
        if (count === 3) addEvent('Décompte lancé !', 'system');
      });

      socket.on(`${prefix}:game-start`, (data) => {
        setStatus('playing');
        setCountdown(null);
        setCurrentRound(1);
        addEvent('🚀 Le match commence !', 'start');
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
          addEvent(`✅ ${name} a trouvé une paire ! (${score || '?'} pts)`, 'pair');
          if (studentId) {
            setPlayers(prev => prev.map(p =>
              p.studentId === studentId ? { ...p, score: score || p.score, pairsFound: (p.pairsFound || 0) + 1 } : p
            ));
          }
        } catch (err) {
          console.error('[Spectator] Erreur pair-validated:', err);
        }
      });

      socket.on(`${prefix}:scores-update`, ({ players: p }) => {
        if (p) setPlayers(p);
      });

      socket.on(`${prefix}:round-new`, ({ roundIndex, totalRounds: tr }) => {
        setCurrentRound((roundIndex || 0) + 1);
        if (tr) setTotalRounds(tr);
        addEvent(`🗺️ Nouvelle carte ! Manche ${(roundIndex || 0) + 1}`, 'round');
      });

      socket.on(`${prefix}:tie-detected`, ({ tiedPlayers }) => {
        setStatus('tie-waiting');
        const names = (tiedPlayers || []).map(p => p.name || p.studentId).join(', ');
        addEvent(`⚖️ Égalité détectée : ${names}`, 'tie');
      });

      socket.on(`${prefix}:tiebreaker-start`, () => {
        setStatus('tiebreaker');
        addEvent('⚡ Départage en cours !', 'start');
      });

      socket.on(`${prefix}:game-end`, (data) => {
        try {
          setStatus('finished');
          const r = data?.ranking || [];
          setRanking(r);
          const winnerName = data?.winner?.name || data?.winner?.studentId || (r[0]?.name) || '?';
          const dur = data?.duration ? Math.round(data.duration / 1000) : '?';
          addEvent(`🏆 Match terminé ! Vainqueur : ${winnerName} (${dur}s)`, 'end');
        } catch (err) {
          console.error('[Spectator] Erreur game-end:', err);
          setStatus('finished');
          addEvent('Match terminé', 'end');
        }
      });
    };

    // Écouter les deux préfixes (arena + training) car le match peut être l'un ou l'autre
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

  const getStatusLabel = () => {
    switch (status) {
      case 'connecting': return { text: 'Connexion...', color: '#6b7280', bg: '#f3f4f6' };
      case 'not-found': return { text: 'Match introuvable', color: '#ef4444', bg: '#fef2f2' };
      case 'pending':
      case 'waiting': return { text: 'En attente', color: '#f59e0b', bg: '#fffbeb' };
      case 'playing': return { text: '🔴 EN DIRECT', color: '#ef4444', bg: '#fef2f2' };
      case 'tie-waiting': return { text: '⚖️ Égalité', color: '#8b5cf6', bg: '#f5f3ff' };
      case 'tiebreaker': return { text: '⚡ Départage', color: '#f97316', bg: '#fff7ed' };
      case 'finished': return { text: '🏁 Terminé', color: '#10b981', bg: '#ecfdf5' };
      default: return { text: status, color: '#6b7280', bg: '#f3f4f6' };
    }
  };

  const statusInfo = getStatusLabel();

  const getMedal = (idx) => {
    if (idx === 0) return '🥇';
    if (idx === 1) return '🥈';
    if (idx === 2) return '🥉';
    return `#${idx + 1}`;
  };

  const getPlayerColor = (idx) => {
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[idx % colors.length];
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: '#fff',
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: '20px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        padding: '16px 24px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>
            👁️ Mode Spectateur
          </h1>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>
            Match {matchState?.roomCode || matchId?.slice(-8)} • {mode === 'training' ? 'Entraînement' : 'Arena'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{
            padding: '8px 20px',
            borderRadius: 20,
            fontWeight: 700,
            fontSize: 14,
            color: statusInfo.color,
            background: statusInfo.bg,
            animation: status === 'playing' ? 'pulse 2s infinite' : 'none'
          }}>
            {statusInfo.text}
          </div>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            ← Retour
          </button>
        </div>
      </div>

      {/* Error / Connecting states */}
      {(status === 'connecting' || status === 'not-found' || error) && (
        <div style={{
          textAlign: 'center',
          padding: 60,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.1)',
          marginBottom: 24
        }}>
          {status === 'connecting' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>📡</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Connexion au match...</h2>
              <p style={{ color: '#64748b', margin: 0 }}>Match ID: {matchId?.slice(-12)}</p>
            </>
          )}
          {status === 'not-found' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Match introuvable</h2>
              <p style={{ color: '#94a3b8', margin: '0 0 16px' }}>{error || 'Le match n\'existe pas ou est terminé'}</p>
              <button onClick={() => navigate(-1)} style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600
              }}>← Retour au dashboard</button>
            </>
          )}
          {error && status !== 'not-found' && (
            <p style={{ color: '#f87171', margin: '8px 0 0', fontSize: 14 }}>{error}</p>
          )}
        </div>
      )}

      {/* Countdown overlay */}
      {countdown !== null && countdown > 0 && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 120,
            fontWeight: 900,
            color: '#f59e0b',
            textShadow: '0 0 40px rgba(245,158,11,0.5)',
            animation: 'bounce 0.5s ease'
          }}>
            {countdown}
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, maxWidth: 1200, margin: '0 auto' }}>
        {/* Left: Scoreboard */}
        <div>
          {/* Timer bar */}
          {timeLeft !== null && status === 'playing' && (
            <div style={{
              marginBottom: 20,
              padding: '16px 24px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: '#94a3b8' }}>
                  ⏱️ Manche {currentRound}/{totalRounds}
                </span>
                <span style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: timeLeft <= 10 ? '#ef4444' : timeLeft <= 30 ? '#f59e0b' : '#10b981',
                  fontVariantNumeric: 'tabular-nums'
                }}>
                  {timeLeft}s
                </span>
              </div>
              <div style={{
                height: 8,
                borderRadius: 4,
                background: 'rgba(255,255,255,0.1)',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  borderRadius: 4,
                  width: `${Math.min(100, (timeLeft / (matchState?.durationPerRound || 60)) * 100)}%`,
                  background: timeLeft <= 10 ? '#ef4444' : timeLeft <= 30 ? '#f59e0b' : '#10b981',
                  transition: 'width 1s linear, background 0.3s'
                }} />
              </div>
            </div>
          )}

          {/* Scoreboard */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.1)',
            padding: 24,
            minHeight: 300
          }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
              🏆 Classement en direct
            </h2>

            {sortedPlayers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
                En attente des joueurs...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sortedPlayers.map((player, idx) => (
                  <div
                    key={player.studentId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '16px 20px',
                      borderRadius: 14,
                      background: idx === 0 && status === 'playing'
                        ? 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))'
                        : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${idx === 0 && status === 'playing' ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.05)'}`,
                      transition: 'all 0.3s ease'
                    }}
                  >
                    {/* Rank */}
                    <div style={{
                      fontSize: idx < 3 ? 28 : 18,
                      fontWeight: 900,
                      minWidth: 44,
                      textAlign: 'center'
                    }}>
                      {getMedal(idx)}
                    </div>

                    {/* Avatar */}
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${getPlayerColor(idx)}, ${getPlayerColor(idx)}88)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      fontWeight: 800,
                      color: '#fff',
                      flexShrink: 0,
                      border: `3px solid ${getPlayerColor(idx)}44`
                    }}>
                      {(player.name || '?')[0].toUpperCase()}
                    </div>

                    {/* Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#f1f5f9',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {player.name || player.studentId}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {player.ready ? '✅ Prêt' : status === 'playing' ? `${player.pairsFound || 0} paires` : '⏳ En attente'}
                      </div>
                    </div>

                    {/* Score */}
                    <div style={{
                      fontSize: 32,
                      fontWeight: 900,
                      color: getPlayerColor(idx),
                      fontVariantNumeric: 'tabular-nums',
                      textShadow: `0 0 20px ${getPlayerColor(idx)}44`
                    }}>
                      {player.score || 0}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Podium final */}
          {ranking && ranking.length > 0 && status === 'finished' && (
            <div style={{
              marginTop: 20,
              padding: 24,
              background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(234,179,8,0.05))',
              borderRadius: 16,
              border: '1px solid rgba(245,158,11,0.2)',
              textAlign: 'center'
            }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 800 }}>🏆 Podium Final</h2>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
                {ranking.slice(0, 3).map((p, i) => (
                  <div key={p.studentId || i} style={{
                    padding: '16px 24px',
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    minWidth: 120
                  }}>
                    <div style={{ fontSize: 40 }}>{getMedal(i)}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{p.name || p.studentId}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#f59e0b', marginTop: 4 }}>{p.score || 0}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Live event feed */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.1)',
          padding: 20,
          maxHeight: 'calc(100vh - 140px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            📡 Fil en direct
          </h3>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#475569', fontSize: 13 }}>
                En attente d'événements...
              </div>
            ) : events.map((ev, i) => {
              const evColors = {
                pair: '#10b981',
                start: '#f59e0b',
                end: '#8b5cf6',
                round: '#3b82f6',
                tie: '#f97316',
                join: '#06b6d4',
                system: '#64748b',
                error: '#ef4444',
                info: '#94a3b8'
              };
              return (
                <div key={i} style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  borderLeft: `3px solid ${evColors[ev.type] || '#64748b'}`,
                  fontSize: 13,
                  color: '#cbd5e1',
                  animation: i === 0 ? 'fadeIn 0.3s ease' : 'none'
                }}>
                  <span style={{ color: '#475569', fontSize: 11, marginRight: 8 }}>
                    {new Date(ev.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  {ev.text}
                </div>
              );
            })}
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
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
      `}</style>
    </div>
  );
}
