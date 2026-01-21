// ==========================================
// COMPOSANT: JEU TRAINING ARENA
// Interface de jeu avec scores temps réel des 4 joueurs
// Réutilise la logique de Carte.js mais en mode compétitif
// ==========================================

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getBackendUrl } from '../../utils/subscription';
import CarteRenderer from '../CarteRenderer';
import { animateBubblesFromZones } from '../Carte';

// ✅ COPIE EXACTE Arena: Couleurs par joueur
const PLAYER_PRIMARY_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#0ea5e9'];
const PLAYER_BORDER_COLORS = ['#111827', '#fbbf24', '#dc2626'];

function getPlayerColorComboByIndex(idx) {
  const safe = Number.isFinite(idx) ? idx : 0;
  const base = safe < 0 ? 0 : safe;
  const primary = PLAYER_PRIMARY_COLORS[base % PLAYER_PRIMARY_COLORS.length];
  const group = Math.floor(base / PLAYER_PRIMARY_COLORS.length);
  const border = PLAYER_BORDER_COLORS[group % PLAYER_BORDER_COLORS.length];
  return { primary, border };
}

function getInitials(name) {
  const str = String(name || '').trim();
  if (!str) return '';
  const parts = str.split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TrainingArenaGame() {
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
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [lastWonPair, setLastWonPair] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [showBigCross, setShowBigCross] = useState(false);
  const mpLastPairRef = useRef(null);
  const gameActiveTimeoutRef = useRef(null);
  
  useEffect(() => {
    // Récupérer les infos de la partie
    const gameInfo = JSON.parse(localStorage.getItem('cc_training_arena_game') || '{}');
    
    console.log('[TrainingArena] GameInfo complet:', gameInfo);
    console.log('[TrainingArena] Type de zones:', typeof gameInfo.zones, 'isArray:', Array.isArray(gameInfo.zones));
    
    if (!gameInfo.matchId || !gameInfo.zones) {
      console.error('[TrainingArena] Données manquantes, redirection');
      navigate('/training-arena/setup');
      return;
    }
    
    // Convertir zones en tableau si nécessaire
    const zonesArray = Array.isArray(gameInfo.zones) ? gameInfo.zones : (gameInfo.zones?.zones || []);
    
    console.log('[TrainingArena] Zones finales (array):', zonesArray);
    console.log('[TrainingArena] Zones avec content:', zonesArray.filter(z => z.content));
    console.log('[TrainingArena] Zones SANS content:', zonesArray.filter(z => !z.content));
    
    // ✅ FIX CLOSURE: Stocker players en const locale pour listeners socket
    const playersArray = gameInfo.players || [];
    
    // ✅ DEBUG: Afficher ordre joueurs + couleurs HUD
    console.log('[TrainingArena] 🎮 MON studentId:', gameInfo.myStudentId);
    console.log('[TrainingArena] 🎮 ORDRE JOUEURS:', JSON.stringify(playersArray.map((p, idx) => ({
      idx,
      studentId: p.studentId,
      name: p.name,
      color: getPlayerColorComboByIndex(idx).primary
    }))));
    
    setZones(zonesArray);
    setPlayers(playersArray);
    setMyStudentId(gameInfo.myStudentId);  // ✅ FIX: Utiliser gameInfo.myStudentId (pas .studentId)
    setGameStartTime(gameInfo.startTime);
    setTimeLeft(gameInfo.duration || 60);
    
    // ✅ CRITIQUE: Construire calcAngles depuis zones.angle (comme mode classique)
    try {
      const angles = {};
      zonesArray.forEach(z => {
        if ((z.type === 'calcul' || z.type === 'chiffre') && typeof z.angle === 'number') {
          angles[z.id] = z.angle;
        }
      });
      setCalcAngles(angles);
      console.log('[TrainingArena] Angles construits depuis zones:', angles);
    } catch (e) {
      console.warn('[TrainingArena] Erreur construction angles:', e);
    }
    
    // ✅ FIX CRITIQUE: Activer gameActive dès le chargement initial (comme Arena avec !gameEnded)
    // Sans ça, la première manche n'est PAS cliquable jusqu'au premier training:round-new
    setTimeout(() => {
      setGameActive(true);
      console.log('[TrainingArena] ✅ gameActive=true (zones initiales chargées)');
    }, 100);
    
    // Connexion Socket.IO
    const socket = io(getBackendUrl(), {
      transports: ['websocket'],
      reconnection: true
    });
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('[TrainingArena] Connecté pour la partie, socketId:', socket.id);
      
      // CRITIQUE: Rejoindre la room du match pour recevoir les événements
      socket.emit('training:join', {
        matchId: gameInfo.matchId,
        studentData: {
          studentId: gameInfo.myStudentId,
          name: gameInfo.players.find(p => p.studentId === gameInfo.myStudentId)?.name || 'Joueur',
          avatar: '/avatars/default.png'
        }
      }, (response) => {
        if (response?.ok) {
          console.log('[TrainingArena] ✅ Rejoint la room du match pour recevoir événements');
        }
      });
    });
    
    socket.on('training:scores-update', ({ scores }) => {
      console.log('[TrainingArena] 📊 Scores mis à jour:', scores);
      setPlayers(scores);
    });
    
    socket.on('training:tie-detected', ({ tiedPlayers, message }) => {
      console.log('[TrainingArena] ⚖️ Égalité détectée !', tiedPlayers);
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
        overlay.id = 'training-arena-tie';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);z-index:10000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `<div style="text-align:center;color:white;max-width:800px;padding:40px;"><h1 style="font-size:64px;margin-bottom:20px;">⚖️</h1><h2 style="font-size:42px;margin-bottom:20px;">ÉGALITÉ !</h2><p style="font-size:24px;margin-bottom:30px;">${message}</p><div style="display:flex;gap:20px;justify-content:center;">${tieRanking.map(p => `<div style="background:white;border-radius:16px;padding:24px;border:4px solid #fbbf24;"><div style="font-size:48px;margin-bottom:12px;">🤝</div><div style="color:#111;font-weight:700;font-size:20px;margin-bottom:8px;">${p.name}</div><div style="color:#6b7280;font-size:16px;">Score: <span style="color:#f59e0b;font-weight:700;">${p.score}</span></div></div>`).join('')}</div><p style="margin-top:40px;font-size:18px;color:#fef3c7;">⏳ En attente de la décision du professeur...</p></div>`;
        document.body.appendChild(overlay);
      }, 1000);
    });

    socket.on('training:tiebreaker-start', ({ zones: newZones, duration, tiedPlayers }) => {
      console.log('[TrainingArena] 🔄 Démarrage manche de départage !');
      setZones(newZones);
      setTimeLeft(duration);
      setGameEnded(false);
      setSelectedZones([]);
      alert(`🔄 MANCHE DE DÉPARTAGE !\n\n${tiedPlayers.map(p => p.name).join(' vs ')}\n\n3 nouvelles cartes - 30 secondes !`);
    });

    socket.on('training:game-end', ({ ranking: finalRanking, winner: finalWinner, isTiebreaker }) => {
      console.log('[TrainingArena] Partie terminée !', finalWinner);
      setGameEnded(true);
      setRanking(finalRanking);
      setWinner(finalWinner);
      
      // Afficher le podium après 1s
      setTimeout(() => {
        showPodium(finalRanking, finalWinner, isTiebreaker);
      }, 1000);
    });
    
    // ✅ FIX BUG #35: Écouter training:round-new (nouvelles cartes)
    socket.on('training:round-new', ({ zones: newZones, roundIndex, totalRounds, timestamp }) => {
      console.log('[TrainingArena] 🎯 Nouvelle carte reçue:', { 
        zonesCount: newZones?.length,
        roundIndex, 
        totalRounds 
      });
      
      if (newZones && Array.isArray(newZones)) {
        // ✅ CRITIQUE: Annuler setTimeout précédent si double event
        if (gameActiveTimeoutRef.current) {
          clearTimeout(gameActiveTimeoutRef.current);
          console.log('[TrainingArena] ⚠️ setTimeout précédent annulé (double training:round-new)');
        }
        
        // ✅ CRITIQUE: Forcer validated=false pour éviter héritage entre manches
        const cleanZones = newZones.map(z => ({ ...z, validated: false }));
        setZones(cleanZones);
        console.log('[TrainingArena] ✅ Zones mises à jour (validated=false forcé):', cleanZones.length);
        
        // ✅ CRITIQUE: Réactiver le jeu AVEC setTimeout pour synchro React state
        gameActiveTimeoutRef.current = setTimeout(() => {
          setGameActive(true);
          gameActiveTimeoutRef.current = null;
          console.log('[TrainingArena] ✅ gameActive=true (après setTimeout)');
        }, 50);
        
        setSelectedZones([]);
        
        // ✅ CRITIQUE: Reconstruire calcAngles depuis zones.angle
        try {
          const angles = {};
          newZones.forEach(z => {
            if ((z.type === 'calcul' || z.type === 'chiffre') && typeof z.angle === 'number') {
              angles[z.id] = z.angle;
            }
          });
          setCalcAngles(angles);
        } catch (e) {
          console.warn('[TrainingArena] Erreur reconstruction angles:', e);
        }
      }
    });
    
    // ✅ FIX BUG #36: Écouter training:timer-tick du backend (comme Arena)
    socket.on('training:timer-tick', ({ timeLeft: serverTimeLeft, currentRound, totalRounds }) => {
      console.log('[TrainingArena] ⏱️ Timer tick:', { serverTimeLeft, currentRound, totalRounds });
      setTimeLeft(serverTimeLeft);
      if (typeof currentRound === 'number') {
        setRoundsPlayed(currentRound);
      }
    });
    
    // ✅ FIX BUG #37: Écouter training:pair-validated (sync paires validées entre joueurs)
    socket.on('training:pair-validated', ({ studentId, playerName, playerIdx, pairId, zoneAId, zoneBId }) => {
      console.log('[TrainingArena] 🎯 Paire validée par', playerName, ':', pairId);
      console.log('[TrainingArena] ⚠️ gameActive=false (paire validée, attente nouvelle carte)');
      
      // ✅ CRITIQUE: Mettre à jour scores (comme Arena)
      socket.emit('training:get-scores', { matchId: gameInfo.matchId }, ({ scores }) => {
        if (scores) {
          console.log('[TrainingArena] 📊 Scores mis à jour:', scores);
          setPlayers(scores);
        }
      });
      
      setZones(prevZones => {
        const ZA = prevZones.find(z => z.id === zoneAId);
        const ZB = prevZones.find(z => z.id === zoneBId);
        
        // ✅ ANIMATION BULLES - Couleur par joueur (COPIE EXACTE Arena)
        if (ZA && ZB) {
          let color = '#22c55e';
          let borderColor = '#ffffff';
          let label = '';
          
          try {
            // ✅ CRITIQUE: Utiliser playerIdx REÇU DU BACKEND (pas calculé localement)
            // Cela garantit que TOUS les clients voient la MÊME couleur pour le même joueur
            if (typeof playerIdx === 'number' && playerIdx >= 0) {
              const { primary, border } = getPlayerColorComboByIndex(playerIdx);
              color = primary;
              borderColor = border;
              label = getInitials(playerName || 'Joueur');
              console.log('[TrainingArena] 🎨 COULEUR:', JSON.stringify({ studentId, playerIdx, color, border, label }));
            } else {
              console.warn('[TrainingArena] ⚠️ playerIdx invalide, fallback:', playerIdx);
            }
          } catch (e) {
            console.warn('[TrainingArena] Erreur couleur joueur:', e);
          }
          
          // ✅ setTimeout pour attendre le rendu React
          setTimeout(() => {
            try {
              animateBubblesFromZones(ZA.id, ZB.id, color, ZA, ZB, borderColor, label);
              console.log('[TrainingArena] 🎨 Animation bulles lancée pour:', ZA.id, ZB.id);
            } catch (e) {
              console.warn('[TrainingArena] Erreur animation bulle:', e);
            }
          }, 100);
          
          // ✅ HISTORIQUE PÉDAGOGIQUE (avec couleur joueur)
          const pairText = `${ZA.label || ZA.content} ↔ ${ZB.label || ZB.content}`;
          setLastWonPair({
            color,
            borderColor,
            winnerName: playerName || 'Joueur',
            text: pairText
          });
          
          // ✅ CONFETTIS pour bonne paire (COPIE Arena)
          try {
            showConfetti();
          } catch (e) {
            console.warn('[TrainingArena] Erreur confetti:', e);
          }
        }
        
        return prevZones.map(z => {
          if (z.id === zoneAId || z.id === zoneBId) {
            return { ...z, validated: true };
          }
          return z;
        });
      });
      
      // ✅ CRITIQUE: Désactiver gameActive pendant transition (1.5s backend)
      setGameActive(false);
      console.log('[TrainingArena] ⚠️ gameActive=false (paire validée, attente nouvelle carte)');
    });
    
    return () => {
      socket.disconnect();
    };
  }, [navigate]);
  
  const handleZoneClick = (zoneId) => {
    if (!gameActive || gameEnded || timeLeft === 0) return;
    
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
      
      // ✅ CONFETTIS (COPIE Arena)
      try {
        showConfetti();
      } catch (e) {
        console.warn('[TrainingArena] Erreur confetti:', e);
      }
      
      // ✅ CRITIQUE: Marquer validated=true SANS retirer (animation bulle en cours)
      setZones(prev => prev.map(z => 
        (z.id === zoneIdA || z.id === zoneIdB) ? { ...z, validated: true } : z
      ));
      setSelectedZones([]);
      
      // Notifier le serveur avec pairId + zones IDs
      socketRef.current?.emit('training:pair-validated', {
        studentId: myStudentId,
        isCorrect: true,
        timeMs,
        pairId: pairA,
        zoneAId: zoneIdA,
        zoneBId: zoneIdB
      });
    } else {
      // Mauvaise paire - CROIX ROUGE (COPIE EXACTE Arena, PAS shake)
      playErrorSound();
      setShowBigCross(true);
      
      setTimeout(() => {
        setSelectedZones([]);
        setShowBigCross(false);
      }, 500);
      
      // Notifier le serveur (pas de pairId car erreur)
      socketRef.current?.emit('training:pair-validated', {
        studentId: myStudentId,
        isCorrect: false,
        timeMs
      });
    }
  };
  
  const showPodium = (finalRanking, finalWinner, isTiebreaker = false) => {
    // Créer un overlay podium
    const overlay = document.createElement('div');
    overlay.id = 'training-arena-podium';
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
      navigate('/training-arena/setup');
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
    try {
      // Animation bulles identique au mode classique
      const color = '#22c55e'; // Vert pour succès
      const borderColor = '#ffffff';
      const label = myStudentId ? myStudentId.substring(0, 3).toUpperCase() : '';
      animateBubblesFromZones(ZA.id, ZB.id, color, ZA, ZB, borderColor, label);
    } catch (e) {
      console.warn('[TrainingArena] Erreur animation bulle:', e);
    }
  };
  
  // ✅ CONFETTIS (COPIE EXACTE Arena ligne 2645-2670)
  const showConfetti = () => {
    try {
      const root = document.body;
      const rect = root.getBoundingClientRect();
      for (let i = 0; i < 36; i++) {
        const d = document.createElement('div');
        const size = 6 + Math.random() * 6;
        d.style.position = 'fixed';
        d.style.zIndex = '99999';
        d.style.left = `${rect.left + rect.width / 2}px`;
        d.style.top = `${rect.top + 60}px`;
        d.style.width = `${size}px`;
        d.style.height = `${size}px`;
        d.style.background = `hsl(${Math.floor(Math.random() * 360)},90%,55%)`;
        d.style.borderRadius = '2px';
        d.style.pointerEvents = 'none';
        root.appendChild(d);
        const dx = (Math.random() - 0.5) * rect.width;
        const dy = 120 + Math.random() * 200;
        d.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0 }
        ], { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => d.remove();
      }
    } catch (e) {
      console.warn('[TrainingArena] Erreur confetti:', e);
    }
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
      {/* HUD Pills compacts - identique mode multijoueur */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        display: 'flex',
        gap: 12,
        zIndex: 100,
        flexWrap: 'wrap',
        maxWidth: '90vw'
      }}>
        <div style={{
          background: timeLeft < 10 ? '#fee2e2' : 'rgba(255,255,255,0.95)',
          borderRadius: 12,
          padding: '8px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: 18,
          fontWeight: 700,
          color: timeLeft < 10 ? '#dc2626' : '#111',
          fontFamily: 'monospace'
        }}>
          ⏱ {Math.max(0, timeLeft)}s
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 12,
          padding: '8px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: 18,
          fontWeight: 700
        }}>
          ⭐ {players.find(p => p.studentId === myStudentId)?.score || 0}
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 12,
          padding: '8px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: 18,
          fontWeight: 700
        }}>
          Manche: {roundsPlayed}
        </div>
        <div ref={mpLastPairRef} data-cc-vignette="last-pair" style={{
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 12,
          padding: '8px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: 14,
          fontWeight: 400,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: '40vw'
        }}>
          <span style={{ 
            width: 12, 
            height: 12, 
            borderRadius: 999, 
            background: lastWonPair?.color || '#e5e7eb',
            boxShadow: lastWonPair ? `0 0 6px 2px ${(lastWonPair.color || '#e5e7eb')}55` : 'none',
            border: lastWonPair?.borderColor ? `2px solid ${lastWonPair.borderColor}` : 'none'
          }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lastWonPair ? (
              <><b>{lastWonPair.winnerName}</b>: {lastWonPair.text}</>
            ) : 'Dernière paire: —'}
          </span>
        </div>
      </div>
      
      {/* Carte SVG avec CarteRenderer */}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        {/* ✅ CROIX ROUGE pour mauvaise paire (COPIE EXACTE Arena ligne 6081-6084) */}
        {showBigCross && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: 16, background: 'rgba(220,0,0,0.85)', transform: 'translate(-50%, -50%) rotate(45deg)', borderRadius: 8 }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: 16, background: 'rgba(220,0,0,0.85)', transform: 'translate(-50%, -50%) rotate(-45deg)', borderRadius: 8 }} />
          </div>
        )}
        
        <CarteRenderer
          zones={zones}
          onZoneClick={handleZoneClickFromRenderer}
          calcAngles={calcAngles}
          gameSelectedIds={selectedZones}
          gameActive={gameActive}
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
