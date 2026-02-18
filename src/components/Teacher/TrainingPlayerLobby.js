// ==========================================
// COMPOSANT: LOBBY TRAINING MODE
// Salle d'attente pour élèves avec "Je suis prêt"
// Clone de CrazyArenaLobby adapté pour Training
// ==========================================

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { getBackendUrl } from '../../utils/subscription';

export default function TrainingPlayerLobby() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  
  const [players, setPlayers] = useState([]);
  const [myStudentId, setMyStudentId] = useState(null);
  const [studentName, setStudentName] = useState('Joueur');
  const [countdown, setCountdown] = useState(null);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [matchInfo, setMatchInfo] = useState(null);
  
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
        const studentId = localStorage.getItem('cc_student_id');
        const studentName = localStorage.getItem('cc_student_name') || 'Joueur';
        
        if (!studentId) {
          setError('Aucun élève lié à ce compte');
          setLoading(false);
          return null;
        }

        setMyStudentId(studentId);
        setStudentName(studentName);
        setLoading(false);
        
        return { studentId, studentName };
      } catch (err) {
        console.error('[TrainingLobby] Erreur récupération données:', err);
        setError('Erreur de connexion');
        setLoading(false);
        return null;
      }
    };
    
    fetchUserData().then(async (userData) => {
      if (!userData) return;
      
      const { studentId, studentName } = userData;
    
      const socket = io(getBackendUrl(), {
        transports: ['websocket', 'polling'],
        reconnection: true
      });
      socketRef.current = socket;
      
      socket.on('connect', () => {
        console.log('[TrainingLobby] Connecté au serveur');
        
        // Rejoindre le match training
        socket.emit('training:join', {
          matchId,
          studentData: {
            studentId,
            name: studentName,
            avatar: '/avatars/default.png'
          }
        }, (response) => {
          if (response && response.ok) {
            console.log('[TrainingLobby] Rejoint avec succès');
            if (response.matchInfo) {
              setMatchInfo(response.matchInfo);
            }
          } else {
            setError('Impossible de rejoindre le match');
          }
        });
      });
    
      socket.on('training:error', ({ message }) => {
        setError(message);
      });

      socket.on('training:match-lost', ({ reason }) => {
        console.error('[TrainingLobby] Match perdu:', reason);
        setError('Le match a été interrompu : ' + (reason || 'serveur redémarré'));
      });
      
      socket.on('training:player-joined', ({ players: updatedPlayers }) => {
        console.log('[TrainingLobby] Joueurs mis à jour:', updatedPlayers);
        setPlayers(updatedPlayers);
      });
      
      socket.on('training:player-ready', ({ players: updatedPlayers }) => {
        console.log('[TrainingLobby] État ready mis à jour');
        setPlayers(updatedPlayers);
      });
      
      socket.on('training:countdown', ({ count }) => {
        console.log('[TrainingLobby] Countdown:', count);
        setCountdown(count);
      });
      
      socket.on('training:game-start', ({ zones, duration, startTime, config, players: gamePlayers }) => {
        console.log('[TrainingLobby] 🎮 Partie démarrée !');
        console.log('[TrainingLobby] 🔍 zones reçues?', !!zones, 'isArray?', Array.isArray(zones), 'length?', zones?.length);
        console.log('[TrainingLobby] 🔍 Config reçue:', config);
        console.log('[TrainingLobby] 🔍 duration:', duration, 'startTime:', startTime);
        
        const gameData = {
          matchId: matchId,
          zones,
          duration,
          startTime,
          config,  // ✅ Stocker config avec themes et classes
          players: gamePlayers, // ✅ DIFF 4: Utiliser players du backend, pas state local
          myStudentId: studentId
        };
        
        console.log('[TrainingLobby] 💾 Données à stocker dans localStorage:', gameData);
        
        // Stocker les infos de la partie pour TrainingArenaGame
        localStorage.setItem('cc_training_arena_game', JSON.stringify(gameData));
        
        console.log('[TrainingLobby] ➡️  Redirection vers /training-arena/game');
        
        // Rediriger vers le composant TrainingArenaGame (copie exacte de CrazyArenaGame)
        navigate('/training-arena/game');
      });
      
      return () => socket.disconnect();
    });
  }, [matchId, navigate]);
  
  const handleReady = () => {
    if (!socketRef.current || isReady) return;
    
    console.log('[TrainingLobby] Marquer comme prêt');
    socketRef.current.emit('training:ready', { matchId, studentId: myStudentId });
    setIsReady(true);
    
    // Activer le plein écran natif (comme Solo/Jouer) — geste utilisateur direct ✅
    try {
      const el = document.documentElement;
      const fs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (fs && !document.fullscreenElement && !document.webkitFullscreenElement) {
        fs.call(el).catch(() => {});
      }
    } catch {}
  };
  
  if (loading) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#6b7280' }}>
          Chargement...
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
      </div>
    );
  }
  
  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
      {/* En-tête */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 36, marginBottom: 8 }}>
          🎓 Mode Entraînement
        </h1>
        {matchInfo && (
          <div style={{ fontSize: 18, color: '#6b7280', marginBottom: 16 }}>
            Session : <span style={{ fontWeight: 700, color: '#111' }}>
              {matchInfo.sessionName || 'Entraînement'}
            </span>
          </div>
        )}
        <div style={{ fontSize: 16, color: '#6b7280' }}>
          {players.length} joueur{players.length > 1 ? 's' : ''} connecté{players.length > 1 ? 's' : ''}
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
            color: countdown === 0 ? '#1AACBE' : '#F5A623',
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
      
      {/* Liste des joueurs */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: players.length <= 2 ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)', 
        gap: 20,
        marginBottom: 32
      }}>
        {players.map((player, idx) => (
          <div 
            key={idx}
            style={{
              padding: 20,
              border: '3px solid ' + (player.ready ? '#1AACBE' : '#d1d5db'),
              borderRadius: 16,
              background: player.ready ? '#f0fafb' : '#f9fafb',
              textAlign: 'center',
              minHeight: 150,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              transition: 'all 0.3s'
            }}
          >
            <div style={{ 
              width: 80, 
              height: 80, 
              borderRadius: '50%', 
              background: '#fff', 
              border: '3px solid ' + (player.ready ? '#1AACBE' : '#d1d5db'),
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
                background: '#1AACBE', 
                color: '#fff', 
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                marginTop: 8
              }}>
                ✓ PRÊT
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Bouton Prêt */}
      {players.find(p => p.studentId === myStudentId) && !isReady && countdown === null && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button 
            onClick={handleReady}
            style={{
              padding: '16px 40px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #1AACBE, #148A9C)',
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
            En attente du démarrage par le professeur
          </div>
        </div>
      )}
      
      {/* Statut */}
      <div style={{ textAlign: 'center', marginTop: 32, color: '#6b7280' }}>
        {players.length === 0 && (
          <div>🕐 En attente d'autres joueurs...</div>
        )}
        {players.length > 0 && countdown === null && !isReady && (
          <div>⏳ Cliquez sur "Je suis prêt" pour commencer</div>
        )}
        {isReady && countdown === null && (
          <div>✅ Vous êtes prêt ! En attente des autres joueurs...</div>
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
