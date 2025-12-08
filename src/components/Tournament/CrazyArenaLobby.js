// ==========================================
// COMPOSANT: LOBBY CRAZY ARENA
// Salle d'attente pour 4 joueurs avec countdown
// ==========================================

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

export default function CrazyArenaLobby() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  
  // État
  const [players, setPlayers] = useState([]);
  const [myStudentId, setMyStudentId] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  
  useEffect(() => {
    // Récupérer les infos du match depuis localStorage
    const matchInfo = JSON.parse(localStorage.getItem('cc_crazy_arena_match') || '{}');
    const studentId = localStorage.getItem('cc_student_id') || 's001'; // TODO: Vraie auth
    const studentName = localStorage.getItem('cc_student_name') || 'Joueur';
    
    setMyStudentId(studentId);
    
    // Connexion Socket.IO
    const socket = io(getBackendUrl(), {
      transports: ['websocket'],
      reconnection: true
    });
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('[CrazyArena] Connecté au serveur');
      
      // Rejoindre le match
      socket.emit('arena:join', {
        matchId: matchInfo.matchId,
        studentData: {
          studentId,
          name: studentName,
          avatar: '/avatars/default.png'
        }
      }, (response) => {
        if (!response.ok) {
          setError('Impossible de rejoindre le match');
        }
      });
    });
    
    socket.on('arena:error', ({ message }) => {
      setError(message);
    });
    
    socket.on('arena:player-joined', ({ players: updatedPlayers, count }) => {
      setPlayers(updatedPlayers);
      console.log(`[CrazyArena] ${count}/4 joueurs connectés`);
    });
    
    socket.on('arena:player-ready', ({ players: updatedPlayers }) => {
      setPlayers(updatedPlayers);
    });
    
    socket.on('arena:player-left', ({ name, remainingPlayers }) => {
      console.log(`[CrazyArena] ${name} est parti (${remainingPlayers}/4)`);
    });
    
    socket.on('arena:countdown', ({ count }) => {
      setCountdown(count);
      if (count === 0) {
        // Sons et effets
        playCountdownSound();
      }
    });
    
    socket.on('arena:game-start', ({ zones, duration, startTime, players: gamePlayers }) => {
      console.log('[CrazyArena] Partie démarrée !');
      
      // Stocker les infos de la partie
      localStorage.setItem('cc_crazy_arena_game', JSON.stringify({
        matchId: matchInfo.matchId,
        zones,
        duration,
        startTime,
        players: gamePlayers,
        myStudentId: studentId
      }));
      
      // Rediriger vers l'interface de jeu
      navigate('/crazy-arena/game');
    });
    
    return () => {
      socket.disconnect();
    };
  }, [roomCode, navigate]);
  
  const handleReady = () => {
    if (!socketRef.current || isReady) return;
    
    socketRef.current.emit('arena:ready', { studentId: myStudentId });
    setIsReady(true);
  };
  
  const playCountdownSound = () => {
    try {
      const audio = new Audio('/sounds/countdown.mp3');
      audio.play().catch(() => {});
    } catch {}
  };
  
  // Slots pour les 4 joueurs
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const player = players[i];
    slots.push(
      <div 
        key={i}
        style={{
          padding: 20,
          border: '3px solid ' + (player ? '#10b981' : '#d1d5db'),
          borderRadius: 16,
          background: player ? '#ecfdf5' : '#f9fafb',
          textAlign: 'center',
          minHeight: 150,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          transition: 'all 0.3s'
        }}
      >
        {player ? (
          <>
            <div style={{ 
              width: 80, 
              height: 80, 
              borderRadius: '50%', 
              background: '#fff', 
              border: '3px solid #10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              marginBottom: 12
            }}>
              👤
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
              {player.name}
            </div>
            {player.ready && (
              <div style={{ 
                padding: '4px 12px', 
                background: '#10b981', 
                color: '#fff', 
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                marginTop: 8
              }}>
                ✓ PRÊT
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ 
              width: 80, 
              height: 80, 
              borderRadius: '50%', 
              background: '#e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              color: '#9ca3af',
              marginBottom: 12
            }}>
              ?
            </div>
            <div style={{ color: '#6b7280', fontSize: 14 }}>
              En attente...
            </div>
          </>
        )}
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ 
          padding: 24, 
          background: '#fee2e2', 
          borderRadius: 12, 
          border: '2px solid #ef4444',
          marginBottom: 16
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>
            Erreur
          </div>
          <div style={{ color: '#7f1d1d' }}>
            {error}
          </div>
        </div>
        <button 
          onClick={() => navigate('/tournament/setup')}
          style={{ 
            padding: '12px 24px', 
            borderRadius: 8, 
            border: '1px solid #d1d5db', 
            background: '#fff',
            cursor: 'pointer'
          }}
        >
          ← Retour
        </button>
      </div>
    );
  }
  
  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
      {/* En-tête */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 36, marginBottom: 8 }}>
          🏆 Crazy Arena
        </h1>
        <div style={{ fontSize: 18, color: '#6b7280', marginBottom: 16 }}>
          Code de salle : <span style={{ 
            fontWeight: 700, 
            fontSize: 24, 
            color: '#111', 
            padding: '4px 12px', 
            background: '#fef3c7', 
            borderRadius: 8,
            fontFamily: 'monospace'
          }}>{roomCode}</span>
        </div>
        <div style={{ 
          fontSize: 16, 
          color: '#6b7280' 
        }}>
          {players.length}/4 joueurs connectés
        </div>
      </div>
      
      {/* Countdown géant */}
      {countdown !== null && countdown >= 0 && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }}>
          <div style={{
            fontSize: 200,
            fontWeight: 900,
            color: countdown === 0 ? '#10b981' : '#f59e0b',
            animation: 'pulse 0.5s infinite',
            textShadow: '0 0 30px rgba(255,255,255,0.5)'
          }}>
            {countdown === 0 ? 'GO!' : countdown}
          </div>
          {countdown > 0 && (
            <div style={{ fontSize: 24, color: '#fff', marginTop: 20 }}>
              Préparez-vous...
            </div>
          )}
        </div>
      )}
      
      {/* Grille des joueurs */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: 20,
        marginBottom: 32
      }}>
        {slots}
      </div>
      
      {/* Bouton Prêt */}
      {players.length > 0 && players.find(p => p.studentId === myStudentId) && !isReady && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button 
            onClick={handleReady}
            style={{
              padding: '16px 40px',
              borderRadius: 12,
              border: '3px solid #10b981',
              background: '#10b981',
              color: '#fff',
              fontSize: 20,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.05)';
              e.target.style.boxShadow = '0 6px 20px rgba(16,185,129,0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = '0 4px 12px rgba(16,185,129,0.3)';
            }}
          >
            ✓ Je suis prêt !
          </button>
          <div style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>
            La partie démarre quand les 4 joueurs sont prêts
          </div>
        </div>
      )}
      
      {/* Statut */}
      <div style={{ textAlign: 'center', marginTop: 32, color: '#6b7280' }}>
        {players.length < 4 && (
          <div>
            🕐 En attente de {4 - players.length} joueur(s) supplémentaire(s)...
          </div>
        )}
        {players.length === 4 && !players.every(p => p.ready) && (
          <div>
            ⏳ En attente que tous les joueurs soient prêts...
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
