// ==========================================
// COMPOSANT: JEU CRAZY ARENA
// Interface de jeu avec scores temps réel des 4 joueurs
// Réutilise la logique de Carte.js mais en mode compétitif
// ==========================================

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getBackendUrl } from '../../utils/subscription';
import CarteRenderer from '../CarteRenderer';

export default function CrazyArenaGame() {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const svgOverlayRef = useRef(null);
  
  // État du jeu
  const [zones, setZones] = useState([]);
  const [selectedZones, setSelectedZones] = useState([]);
  const [players, setPlayers] = useState([]);
  const [myStudentId, setMyStudentId] = useState(null);
  const [calcAngles, setCalcAngles] = useState({});
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [gameEnded, setGameEnded] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [winner, setWinner] = useState(null);
  const [wonPairsHistory, setWonPairsHistory] = useState([]);
  
  useEffect(() => {
    // Récupérer les infos de la partie
    const gameInfo = JSON.parse(localStorage.getItem('cc_crazy_arena_game') || '{}');
    
    console.log('[CrazyArena] GameInfo complet:', gameInfo);
    console.log('[CrazyArena] Type de zones:', typeof gameInfo.zones, 'isArray:', Array.isArray(gameInfo.zones));
    
    if (!gameInfo.matchId || !gameInfo.zones) {
      console.error('[CrazyArena] Données manquantes, redirection');
      navigate('/tournament/setup');
      return;
    }
    
    // Convertir zones en tableau si nécessaire
    const zonesArray = Array.isArray(gameInfo.zones) ? gameInfo.zones : (gameInfo.zones?.zones || []);
    
    console.log('[CrazyArena] Zones finales (array):', zonesArray);
    console.log('[CrazyArena] Zones avec content:', zonesArray.filter(z => z.content));
    console.log('[CrazyArena] Zones SANS content:', zonesArray.filter(z => !z.content));
    
    setZones(zonesArray);
    setPlayers(gameInfo.players);
    setMyStudentId(gameInfo.myStudentId);
    setGameStartTime(gameInfo.startTime);
    setTimeLeft(gameInfo.duration || 60);
    
    // Charger les angles depuis localStorage (CRITIQUE pour rotation calculs)
    try {
      const savedAngles = localStorage.getItem('cc_calc_angles');
      if (savedAngles) {
        const parsed = JSON.parse(savedAngles);
        setCalcAngles(parsed);
        console.log('[CrazyArena] Angles chargés depuis localStorage:', parsed);
      }
    } catch (e) {
      console.warn('[CrazyArena] Erreur chargement angles:', e);
    }
    
    // Connexion Socket.IO
    const socket = io(getBackendUrl(), {
      transports: ['websocket'],
      reconnection: true
    });
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('[CrazyArena] Connecté pour la partie');
      
      // CRITIQUE: Rejoindre la room du match pour recevoir les événements
      socket.emit('arena:join', {
        matchId: gameInfo.matchId,
        studentData: {
          studentId: gameInfo.myStudentId,
          name: gameInfo.players.find(p => p.studentId === gameInfo.myStudentId)?.name || 'Joueur',
          avatar: '/avatars/default.png'
        }
      }, (response) => {
        if (response?.ok) {
          console.log('[CrazyArena] ✅ Rejoint la room du match pour recevoir événements');
        }
      });
    });
    
    socket.on('arena:scores-update', ({ scores }) => {
      setPlayers(scores);
    });
    
    // Mise à jour historique pédagogique quand une paire est validée
    socket.on('arena:pair-validated', ({ studentId, score, pairsValidated }) => {
      console.log('[CrazyArena] Paire validée par', studentId, 'score:', score);
      
      // Trouver le joueur qui a validé la paire
      const player = players.find(p => p.studentId === studentId);
      const playerName = player?.name || 'Joueur';
      const playerIdx = players.findIndex(p => p.studentId === studentId);
      
      // Couleur du joueur (même logique que Carte.js)
      const colors = [
        { primary: '#3b82f6', border: '#1e40af' }, // Bleu
        { primary: '#10b981', border: '#047857' }, // Vert
        { primary: '#f59e0b', border: '#d97706' }, // Orange
        { primary: '#ef4444', border: '#b91c1c' }  // Rouge
      ];
      const { primary, border } = colors[playerIdx % 4] || colors[0];
      
      // Créer entrée historique
      const entry = {
        winnerId: studentId,
        winnerName: playerName,
        color: primary,
        borderColor: border,
        text: `${playerName} - Paire ${pairsValidated}`,
        timestamp: Date.now()
      };
      
      setWonPairsHistory(h => [entry, ...(Array.isArray(h) ? h : [])].slice(0, 25));
    });
    
    socket.on('arena:tie-detected', ({ tiedPlayers, message }) => {
      console.log('[CrazyArena] ⚖️ Égalité détectée !', tiedPlayers);
      setGameEnded(true);
      
      // Créer podium égalité
      const tieRanking = tiedPlayers.map(p => ({
        name: p.name,
        score: p.score,
        position: 1,
        pairsValidated: 0,
        errors: 0
      }));
      
      // Afficher immédiatement
      setTimeout(() => {
        const overlay = document.createElement('div');
        overlay.id = 'crazy-arena-tie';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);z-index:10000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `<div style="text-align:center;color:white;max-width:800px;padding:40px;"><h1 style="font-size:64px;margin-bottom:20px;">⚖️</h1><h2 style="font-size:42px;margin-bottom:20px;">ÉGALITÉ !</h2><p style="font-size:24px;margin-bottom:30px;">${message}</p><div style="display:flex;gap:20px;justify-content:center;">${tieRanking.map(p => `<div style="background:white;border-radius:16px;padding:24px;border:4px solid #fbbf24;"><div style="font-size:48px;margin-bottom:12px;">🤝</div><div style="color:#111;font-weight:700;font-size:20px;margin-bottom:8px;">${p.name}</div><div style="color:#6b7280;font-size:16px;">Score: <span style="color:#f59e0b;font-weight:700;">${p.score}</span></div></div>`).join('')}</div><p style="margin-top:40px;font-size:18px;color:#fef3c7;">⏳ En attente de la décision du professeur...</p></div>`;
        document.body.appendChild(overlay);
      }, 1000);
    });

    socket.on('arena:tiebreaker-start', ({ zones: newZones, duration, tiedPlayers }) => {
      console.log('[CrazyArena] 🔄 Démarrage manche de départage !');
      setZones(newZones);
      setTimeLeft(duration);
      setGameEnded(false);
      setSelectedZones([]);
      alert(`🔄 MANCHE DE DÉPARTAGE !\n\n${tiedPlayers.map(p => p.name).join(' vs ')}\n\n3 nouvelles cartes - 30 secondes !`);
    });

    socket.on('arena:game-end', ({ ranking: finalRanking, winner: finalWinner, isTiebreaker }) => {
      console.log('[CrazyArena] Partie terminée !', finalWinner);
      setGameEnded(true);
      setRanking(finalRanking);
      setWinner(finalWinner);
      
      // Afficher le podium après 1s
      setTimeout(() => {
        showPodium(finalRanking, finalWinner, isTiebreaker);
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
  
  const showPodium = (finalRanking, finalWinner, isTiebreaker = false) => {
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
          🏆 ${isTiebreaker ? 'Départage Terminé !' : 'Partie Terminée !'}
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
  
  // Handler pour les clics sur les zones
  const handleZoneClickFromRenderer = (zone) => {
    if (gameEnded) return;
    handleZoneClick(zone.id);
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
        left: 20,
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
      
      {/* Historique pédagogique */}
      {wonPairsHistory.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxWidth: 300,
          maxHeight: 200,
          overflowY: 'auto',
          zIndex: 100
        }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: '#6b7280' }}>
            📚 Historique ({wonPairsHistory.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {wonPairsHistory.slice(0, 10).map((entry, idx) => (
              <div 
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  background: '#f9fafb',
                  borderRadius: 6,
                  borderLeft: `3px solid ${entry.color || '#6b7280'}`
                }}
              >
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: entry.color || '#6b7280',
                  border: `2px solid ${entry.borderColor || '#ffffff'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'white',
                  flexShrink: 0
                }}>
                  {entry.initials || entry.winnerName?.substring(0, 2).toUpperCase() || '?'}
                </div>
                <div style={{ 
                  fontSize: 12, 
                  color: '#111',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1
                }}>
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Carte SVG avec CarteRenderer */}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <CarteRenderer
          zones={zones}
          onZoneClick={handleZoneClickFromRenderer}
          calcAngles={calcAngles}
          gameSelectedIds={selectedZones}
          gameActive={!gameEnded}
        />
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
