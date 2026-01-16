// ==========================================
// COMPOSANT: LOBBY TRAINING ARENA
// Salle d'attente pour 4 joueurs avec countdown
// ==========================================

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

export default function TrainingArenaLobby() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  
  // État
  const [players, setPlayers] = useState([]);
  const [myStudentId, setMyStudentId] = useState(null);
  const [studentName, setStudentName] = useState('Joueur');
  const [countdown, setCountdown] = useState(null);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);
  const [currentMatchId, setCurrentMatchId] = useState(null);
  
  useEffect(() => {
    // Fonction pour récupérer les données utilisateur depuis l'API
    const fetchUserData = async () => {
      try {
        const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
        
        // Détecter si professeur/admin
        if (auth.role === 'admin' || auth.role === 'teacher' || auth.isAdmin) {
          setIsTeacher(true);
        }
        
        if (!auth.token) {
          // Fallback localStorage pour compatibilité
          console.warn('[TrainingArena] Pas de token auth, utilisation localStorage');
          const fallbackId = localStorage.getItem('cc_student_id') || 's001';
          const fallbackName = localStorage.getItem('cc_student_name') || 'Joueur';
          setMyStudentId(fallbackId);
          setStudentName(fallbackName);
          setLoading(false);
          return { studentId: fallbackId, studentName: fallbackName };
        }

        // Appel API pour récupérer student_id
        const response = await fetch(`${getBackendUrl()}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${auth.token}`
          }
        });

        const data = await response.json();
        
        if (data.ok && data.student) {
          const studentId = data.student.id;
          const studentName = data.student.full_name || data.student.first_name || 'Joueur';
          
          setMyStudentId(studentId);
          setStudentName(studentName);
          setLoading(false);
          
          // Stocker dans localStorage pour NotificationBadge
          localStorage.setItem('cc_student_id', studentId);
          localStorage.setItem('cc_student_name', studentName);
          
          return { studentId, studentName };
        } else {
          console.error('[TrainingArena] ❌ Aucun élève lié à ce compte');
          setError('Votre compte n\'est pas lié à un élève. Contactez l\'administrateur.');
          setLoading(false);
          return null;
        }
      } catch (err) {
        console.error('[TrainingArena] Erreur récupération données:', err);
        // Fallback localStorage en cas d'erreur
        const fallbackId = localStorage.getItem('cc_student_id') || 's001';
        const fallbackName = localStorage.getItem('cc_student_name') || 'Joueur';
        setMyStudentId(fallbackId);
        setStudentName(fallbackName);
        setLoading(false);
        return { studentId: fallbackId, studentName: fallbackName };
      }
    };

    // Récupérer student_id puis connecter socket
    fetchUserData().then(async (userData) => {
      if (!userData) return; // Erreur, pas de student lié
      
      const { studentId, studentName } = userData;
      
      // ✅ Pour Training: matchId = roomCode (pas besoin d'API)
      // Les matchs Training sont en mémoire, pas en DB
      const matchId = roomCode;
      setCurrentMatchId(matchId); // Stocker pour bouton professeur
      
      console.log('[TrainingArena] 🎯 Utilisation matchId:', matchId);
    
      // Connexion Socket.IO
      const socket = io(getBackendUrl(), {
        transports: ['websocket'],
        reconnection: true
      });
      socketRef.current = socket;
      
      socket.on('connect', () => {
        console.log('[TrainingArena] Connecté au serveur');
        
        // Rejoindre le match
        socket.emit('training:join', {
          matchId: matchId,
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
    
      socket.on('training:error', ({ message }) => {
        setError(message);
      });
      
      socket.on('training:player-joined', ({ players: updatedPlayers, count }) => {
        setPlayers(updatedPlayers);
        console.log(`[TrainingArena] ${count}/4 joueurs connectés`);
      });
      
      socket.on('training:player-ready', ({ players: updatedPlayers }) => {
        setPlayers(updatedPlayers);
      });
      
      socket.on('training:player-left', ({ name, remainingPlayers }) => {
        console.log(`[TrainingArena] ${name} est parti (${remainingPlayers}/4)`);
      });
      
      socket.on('training:countdown', ({ count }) => {
        setCountdown(count);
        if (count === 0) {
          // Sons et effets
          playCountdownSound();
        }
      });
      
      socket.on('training:game-start', ({ zones, duration, startTime, config, players: gamePlayers }) => {
        console.log('[TrainingArena] 🎮 Partie démarrée !');
        console.log('[TrainingArena] 🔍 zones reçues?', !!zones, 'isArray?', Array.isArray(zones), 'length?', zones?.length);
        console.log('[TrainingArena] 🔍 Config reçue:', config);
        console.log('[TrainingArena] 🔍 duration:', duration, 'startTime:', startTime);
        
        const gameData = {
          matchId: matchId,
          zones,
          duration,
          startTime,
          config,  // ✅ Stocker config avec themes et classes
          players: gamePlayers,
          myStudentId: studentId
        };
        
        console.log('[TrainingArena] 💾 Données à stocker dans localStorage:', gameData);
        
        // Stocker les infos de la partie pour le jeu
        localStorage.setItem('cc_training_arena_game', JSON.stringify(gameData));
        
        console.log('[TrainingArena] ➡️  Redirection vers /training-arena/game');
        
        // Rediriger vers le jeu Training Arena
        navigate('/training-arena/game');
      });
      
      return () => socket.disconnect();
    });
  }, [roomCode, navigate]);
  
  const handleReady = () => {
    if (!socketRef.current || isReady) return;
    
    console.log('[TrainingArena] 📤 Émission training:ready:', { matchId: currentMatchId, studentId: myStudentId });
    socketRef.current.emit('training:ready', { matchId: currentMatchId, studentId: myStudentId });
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
  
  // État de chargement pendant récupération student_id
  if (loading) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#6b7280' }}>
          Chargement de vos informations...
        </div>
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
          onClick={() => navigate('/training-arena/setup')}
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
          🏆 Training Arena
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
            {isTeacher ? 'Cliquez sur "Démarrer" quand vous êtes prêt (2 joueurs minimum)' : 'En attente du démarrage par le professeur'}
          </div>
        </div>
      )}
      
      {/* Bouton Démarrer (Professeur uniquement) */}
      {isTeacher && players.length >= 2 && countdown === null && (
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <button
            onClick={() => {
              if (socketRef.current && currentMatchId) {
                console.log('[TrainingArena] Professeur démarre le match:', currentMatchId);
                socketRef.current.emit('training:force-start', { matchId: currentMatchId });
              } else {
                console.error('[TrainingArena] Socket ou matchId manquant:', { socket: !!socketRef.current, matchId: currentMatchId });
              }
            }}
            style={{
              padding: '20px 60px',
              borderRadius: 16,
              border: '4px solid #f59e0b',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff',
              fontSize: 24,
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(245,158,11,0.4)',
              transition: 'all 0.3s',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.1) translateY(-4px)';
              e.target.style.boxShadow = '0 12px 32px rgba(245,158,11,0.6)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1) translateY(0)';
              e.target.style.boxShadow = '0 8px 24px rgba(245,158,11,0.4)';
            }}
          >
            🚀 Démarrer le Match
          </button>
          <div style={{ marginTop: 16, fontSize: 16, color: '#6b7280' }}>
            {players.length}/4 joueurs connectés · Minimum 2 requis
          </div>
        </div>
      )}
      
      {/* Statut */}
      <div style={{ textAlign: 'center', marginTop: 32, color: '#6b7280' }}>
        {!isTeacher && players.length < 2 && (
          <div>
            🕐 En attente d'au moins 2 joueurs...
          </div>
        )}
        {!isTeacher && players.length >= 2 && countdown === null && (
          <div>
            ⏳ En attente du démarrage par le professeur...
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
