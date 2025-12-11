// ==========================================
// COMPOSANT: JEU CRAZY ARENA
// Interface de jeu avec scores temps réel des 4 joueurs
// Réutilise la logique de Carte.js mais en mode compétitif
// ==========================================

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

export default function CrazyArenaGame() {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const svgOverlayRef = useRef(null);
  
  // État du jeu
  const [zones, setZones] = useState([]);
  const [selectedZones, setSelectedZones] = useState([]);
  const [players, setPlayers] = useState([]);
  const [myStudentId, setMyStudentId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [gameEnded, setGameEnded] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [winner, setWinner] = useState(null);
  
  useEffect(() => {
    // Récupérer les infos de la partie
    const gameInfo = JSON.parse(localStorage.getItem('cc_crazy_arena_game') || '{}');
    
    if (!gameInfo.matchId || !gameInfo.zones) {
      navigate('/tournament/setup');
      return;
    }
    
    setZones(gameInfo.zones);
    setPlayers(gameInfo.players);
    setMyStudentId(gameInfo.myStudentId);
    setGameStartTime(gameInfo.startTime);
    setTimeLeft(gameInfo.duration || 60);
    
    // Connexion Socket.IO
    const socket = io(getBackendUrl(), {
      transports: ['websocket'],
      reconnection: true
    });
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('[CrazyArena] Connecté pour la partie');
    });
    
    socket.on('arena:scores-update', ({ scores }) => {
      setPlayers(scores);
    });
    
    socket.on('arena:game-end', ({ ranking: finalRanking, winner: finalWinner }) => {
      console.log('[CrazyArena] Partie terminée !', finalWinner);
      setGameEnded(true);
      setRanking(finalRanking);
      setWinner(finalWinner);
      
      // Afficher le podium après 1s
      setTimeout(() => {
        showPodium(finalRanking, finalWinner);
      }, 1000);
    });
    
    // Timer local
    const interval = setInterval(() => {
      if (gameInfo.startTime) {
        const elapsed = Math.floor((Date.now() - gameInfo.startTime) / 1000);
        const remaining = Math.max(0, (gameInfo.duration || 60) - elapsed);
        setTimeLeft(remaining);
        
        if (remaining === 0) {
          clearInterval(interval);
        }
      }
    }, 100);
    
    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [navigate]);
  
  const handleZoneClick = (zoneId) => {
    if (gameEnded || timeLeft === 0) return;
    
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    
    // Logique de sélection (max 2 zones)
    if (selectedZones.includes(zoneId)) {
      setSelectedZones(prev => prev.filter(id => id !== zoneId));
      return;
    }
    
    if (selectedZones.length === 2) {
      // Déjà 2 zones sélectionnées, remplacer la première
      setSelectedZones([selectedZones[1], zoneId]);
      return;
    }
    
    const newSelected = [...selectedZones, zoneId];
    setSelectedZones(newSelected);
    
    // Si 2 zones, vérifier la paire
    if (newSelected.length === 2) {
      checkPair(newSelected[0], newSelected[1]);
    }
  };
  
  const checkPair = (zoneIdA, zoneIdB) => {
    const ZA = zones.find(z => z.id === zoneIdA);
    const ZB = zones.find(z => z.id === zoneIdB);
    
    if (!ZA || !ZB) {
      setSelectedZones([]);
      return;
    }
    
    const pairA = ZA.pairId || '';
    const pairB = ZB.pairId || '';
    const isCorrect = pairA && pairB && pairA === pairB;
    
    const clickTime = Date.now();
    const timeMs = clickTime - (gameStartTime || Date.now());
    
    if (isCorrect) {
      // Bonne paire !
      playCorrectSound();
      showSuccessAnimation(ZA, ZB);
      
      // Retirer les zones validées
      setZones(prev => prev.filter(z => z.id !== zoneIdA && z.id !== zoneIdB));
      setSelectedZones([]);
      
      // Notifier le serveur
      socketRef.current?.emit('arena:pair-validated', {
        studentId: myStudentId,
        isCorrect: true,
        timeMs
      });
    } else {
      // Mauvaise paire
      playErrorSound();
      showErrorAnimation(ZA, ZB);
      
      setTimeout(() => {
        setSelectedZones([]);
      }, 500);
      
      // Notifier le serveur
      socketRef.current?.emit('arena:pair-validated', {
        studentId: myStudentId,
        isCorrect: false,
        timeMs
      });
    }
  };
  
  const showPodium = (finalRanking, finalWinner) => {
    // Créer un overlay podium
    const overlay = document.createElement('div');
    overlay.id = 'crazy-arena-podium';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.5s;
    `;
    
    overlay.innerHTML = `
      <div style="text-align: center; color: white;">
        <h1 style="font-size: 48px; margin-bottom: 20px; text-shadow: 0 2px 10px rgba(0,0,0,0.3);">
          🏆 Partie Terminée !
        </h1>
        <div style="font-size: 32px; margin-bottom: 40px;">
          Vainqueur : <span style="color: #fbbf24; font-weight: 900;">${finalWinner.name}</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; max-width: 800px; margin: 0 auto;">
          ${finalRanking.map((p, idx) => `
            <div style="
              background: white;
              border-radius: 16px;
              padding: 24px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.2);
              ${idx === 0 ? 'border: 4px solid #fbbf24; transform: scale(1.1);' : ''}
            ">
              <div style="font-size: 48px; margin-bottom: 12px;">
                ${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅'}
              </div>
              <div style="color: #111; font-weight: 700; font-size: 20px; margin-bottom: 8px;">
                ${p.name}
              </div>
              <div style="color: #6b7280; font-size: 16px;">
                Score: <span style="color: #10b981; font-weight: 700;">${p.score}</span>
              </div>
              <div style="color: #6b7280; font-size: 14px; margin-top: 4px;">
                Paires: ${p.pairsValidated} | Erreurs: ${p.errors}
              </div>
            </div>
          `).join('')}
        </div>
        <button id="back-btn" style="
          margin-top: 40px;
          padding: 16px 40px;
          border-radius: 12px;
          border: none;
          background: white;
          color: #667eea;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        ">
          Retour au menu
        </button>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('back-btn').addEventListener('click', () => {
      navigate('/tournament/setup');
    });
  };
  
  const playCorrectSound = () => {
    try {
      const audio = new Audio('/sounds/correct.mp3');
      audio.play().catch(() => {});
    } catch {}
  };
  
  const playErrorSound = () => {
    try {
      const audio = new Audio('/sounds/error.mp3');
      audio.play().catch(() => {});
    } catch {}
  };
  
  const showSuccessAnimation = (ZA, ZB) => {
    // TODO: Animation bulles (réutiliser animateBubblesFromZones si disponible)
    console.log('[CrazyArena] Bonne paire validée !', ZA, ZB);
  };
  
  const showErrorAnimation = (ZA, ZB) => {
    // TODO: Animation d'erreur (shake)
    console.log('[CrazyArena] Mauvaise paire', ZA, ZB);
  };
  
  // Rendu SVG des zones
  const renderZones = () => {
    if (!zones || zones.length === 0) return null;
    
    return zones.map(zone => {
      const isSelected = selectedZones.includes(zone.id);
      const points = zone.points || [];
      
      if (points.length === 0) return null;
      
      // Construire le path SVG
      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        if (p.handleOut) {
          d += ` C ${p.handleOut.x} ${p.handleOut.y}, ${p.handleIn?.x || p.x} ${p.handleIn?.y || p.y}, ${p.x} ${p.y}`;
        } else {
          d += ` L ${p.x} ${p.y}`;
        }
      }
      d += ' Z';
      
      return (
        <path
          key={zone.id}
          d={d}
          fill={isSelected ? '#3b82f6' : 'transparent'}
          fillOpacity={isSelected ? 0.3 : 0}
          stroke={isSelected ? '#3b82f6' : '#6b7280'}
          strokeWidth={isSelected ? 3 : 1}
          style={{ cursor: 'pointer', transition: 'all 0.2s' }}
          onClick={() => handleZoneClick(zone.id)}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.target.setAttribute('fill-opacity', '0.1');
              e.target.setAttribute('fill', '#10b981');
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.target.setAttribute('fill-opacity', '0');
            }
          }}
        />
      );
    });
  };
  
  if (gameEnded) {
    return null; // Le podium sera affiché via overlay
  }
  
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* HUD - Scores des joueurs */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        minWidth: 250,
        zIndex: 100
      }}>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 16 }}>
          🏆 Classement
        </div>
        {players.map((p, idx) => (
          <div 
            key={p.studentId}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: p.studentId === myStudentId ? '#fef3c7' : (idx === 0 ? '#ecfdf5' : '#f9fafb'),
              borderRadius: 8,
              marginBottom: 8,
              border: idx === 0 ? '2px solid #10b981' : '1px solid #e5e7eb'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅'}
              </span>
              <span style={{ fontWeight: p.studentId === myStudentId ? 700 : 400 }}>
                {p.name}
              </span>
            </div>
            <div style={{ fontWeight: 700, color: idx === 0 ? '#10b981' : '#111' }}>
              {p.score}
            </div>
          </div>
        ))}
      </div>
      
      {/* Timer */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: timeLeft < 10 ? '#fee2e2' : 'rgba(255,255,255,0.95)',
        borderRadius: 12,
        padding: '12px 24px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 100
      }}>
        <div style={{ 
          fontSize: 32, 
          fontWeight: 900, 
          color: timeLeft < 10 ? '#dc2626' : '#111',
          fontFamily: 'monospace'
        }}>
          {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
        </div>
      </div>
      
      {/* Carte SVG */}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <object
          type="image/svg+xml"
          data={`${process.env.PUBLIC_URL}/images/carte-svg.svg`}
          style={{
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        >
          Votre navigateur ne supporte pas les SVG
        </object>
        <svg
          ref={svgOverlayRef}
          viewBox="0 0 1000 1000"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'auto',
            zIndex: 2
          }}
        >
          {renderZones()}
        </svg>
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
