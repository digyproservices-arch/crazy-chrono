// ==========================================
// COMPOSANT: JEU TRAINING ARENA
// Interface de jeu avec scores temps réel des 4 joueurs
// Réutilise la logique de Carte.js mais en mode compétitif
// ==========================================

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getBackendUrl } from '../../utils/subscription';
import { pointsToBezierPath } from '../CarteUtils';
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

// ✅ COPIE EXACTE Arena (Carte.js ligne 541-583): Fonctions helper SVG
function interpolateArc(points, idxStart, idxEnd, marginPx) {
  const start = points[idxStart];
  const end = points[idxEnd];
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = (Math.hypot(start.x - centerX, start.y - centerY) + Math.hypot(end.x - centerX, end.y - centerY)) / 2;
  const angleStart = Math.atan2(start.y - centerY, start.x - centerX);
  const angleEnd = Math.atan2(end.y - centerY, end.x - centerX);
  let delta = angleEnd - angleStart;
  if (delta < 0) delta += 2 * Math.PI;
  const arcLen = r * delta;
  const marginAngle = marginPx / r;
  const newAngleStart = angleStart + marginAngle;
  const newAngleEnd = angleEnd - marginAngle;
  const newStart = {
    x: centerX + r * Math.cos(newAngleStart),
    y: centerY + r * Math.sin(newAngleStart)
  };
  const newEnd = {
    x: centerX + r * Math.cos(newAngleEnd),
    y: centerY + r * Math.sin(newAngleEnd)
  };
  return { newStart, newEnd, r, centerX, centerY, largeArcFlag: 0, sweepFlag: 1, arcLen, delta };
}

function getArcPathFromZonePoints(points, zoneId, selectedArcPoints, arcPointsFromZone, marginPx = 0) {
  if (!points || points.length < 2) return '';
  let idxStart, idxEnd;
  if (Array.isArray(arcPointsFromZone) && arcPointsFromZone.length === 2) {
    idxStart = arcPointsFromZone[0];
    idxEnd = arcPointsFromZone[1];
  } else if (selectedArcPoints && selectedArcPoints[zoneId] && selectedArcPoints[zoneId].length === 2) {
    idxStart = selectedArcPoints[zoneId][0];
    idxEnd = selectedArcPoints[zoneId][1];
  } else {
    idxStart = 0;
    idxEnd = 1;
  }
  const { newStart, newEnd, r, centerX, centerY, largeArcFlag, sweepFlag } = interpolateArc(points, idxStart, idxEnd, marginPx);
  return `M ${newStart.x},${newStart.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag} ${newEnd.x},${newEnd.y}`;
}

function getZoneBoundingBox(points) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export default function TrainingArenaGame() {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const svgOverlayRef = useRef(null);
  
  // État du jeu
  const [zones, setZones] = useState([]);
  // ✅ COPIE EXACTE Arena (Carte.js ligne 2351-2352): Ref pour éviter stale closure
  const zonesRef = useRef([]);
  useEffect(() => { zonesRef.current = zones; }, [zones]); // ✅ COPIE EXACTE Arena
  const [selectedZones, setSelectedZones] = useState([]);
  const [players, setPlayers] = useState([]);
  const [myStudentId, setMyStudentId] = useState(null);
  // ✅ COPIE EXACTE Arena (Carte.js ligne 3007-3014): Charger depuis localStorage UNE FOIS
  const [calcAngles, setCalcAngles] = useState(() => {
    try {
      const raw = localStorage.getItem('cc_calc_angles');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  // ✅ COPIE EXACTE Arena (Carte.js ligne 3016-3021): mathOffsets pour positionner calculs
  const [mathOffsets, setMathOffsets] = useState(() => {
    try {
      const raw = localStorage.getItem('cc_math_offsets');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [gameEnded, setGameEnded] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [winner, setWinner] = useState(null);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [lastWonPair, setLastWonPair] = useState(null);
  // ✅ COPIE EXACTE Arena (Carte.js ligne 1069): Historique paires validées
  const [wonPairsHistory, setWonPairsHistory] = useState([]);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [gameActive, setGameActive] = useState(false);
  const [showBigCross, setShowBigCross] = useState(false);
  const mpLastPairRef = useRef(null);
  const gameActiveTimeoutRef = useRef(null);
  
  // ✅ COPIE EXACTE Arena (Carte.js ligne 1081-1083): Tracking paires validées session
  const [validatedPairIds, setValidatedPairIds] = useState(new Set());
  const validatedPairIdsRef = useRef(new Set());
  useEffect(() => { validatedPairIdsRef.current = validatedPairIds; }, [validatedPairIds]);
  
  // ✅ COPIE EXACTE Arena (Carte.js ligne 2356-2372): Map rapide id -> zone
  const zonesByIdRef = useRef(new Map());
  useEffect(() => {
    try {
      const m = new Map();
      for (const z of zones) {
        if (z && z.id) m.set(z.id, z);
      }
      zonesByIdRef.current = m;
    } catch {}
  }, [zones]);
  
  // ✅ COPIE EXACTE Arena (Carte.js ligne 2533): Référence taille moyenne zones chiffre
  const chiffreRefBase = React.useMemo(() => {
    try {
      if (!Array.isArray(zones) || zones.length === 0) return null;
      const getZoneBoundingBox = (points) => {
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        return {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys)
        };
      };
      const bases = zones
        .filter(z => z?.type === 'chiffre' && Array.isArray(z.points) && z.points.length)
        .map(z => {
          const b = getZoneBoundingBox(z.points);
          return Math.max(12, Math.min(b.width, b.height));
        });
      if (!bases.length) return null;
      return bases.reduce((a, b) => a + b, 0) / bases.length;
    } catch {
      return null;
    }
  }, [zones]);
  
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
    zonesRef.current = zonesArray; // ✅ COPIE EXACTE Arena: Synchro ref
    setPlayers(playersArray);
    setMyStudentId(gameInfo.myStudentId);  // ✅ FIX: Utiliser gameInfo.myStudentId (pas .studentId)
    setGameStartTime(gameInfo.startTime);
    setTimeLeft(gameInfo.duration || 60);
    
    // ✅ COPIE EXACTE Arena: NE PAS reconstruire calcAngles (localStorage suffit)
    console.log('[TrainingArena] calcAngles chargés depuis localStorage:', calcAngles);
    
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

    // ✅ COPIE EXACTE Arena (Carte.js ligne 1346-1377): Countdown 3-2-1 avant départage
    socket.on('training:countdown', ({ count }) => {
      console.log('[TrainingArena] 📣 Countdown reçu:', count);
      
      // Au premier count, retirer l'overlay égalité
      if (count === 3) {
        const tieOverlay = document.getElementById('training-arena-tie');
        if (tieOverlay) {
          tieOverlay.remove();
          console.log('[TrainingArena] 🗑️ Overlay égalité retiré (début countdown)');
        }
      }
      
      // Créer overlay countdown full-screen
      let countdownOverlay = document.getElementById('training-countdown-overlay');
      if (!countdownOverlay) {
        countdownOverlay = document.createElement('div');
        countdownOverlay.id = 'training-countdown-overlay';
        countdownOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(countdownOverlay);
      }
      
      // Afficher le chiffre ou GO!
      countdownOverlay.innerHTML = `<div style="font-size:200px;font-weight:900;color:${count === 0 ? '#10b981' : '#f59e0b'};text-shadow:0 0 30px rgba(255,255,255,0.5);">${count === 0 ? 'GO!' : count}</div>`;
      
      // Retirer overlay après "GO!"
      if (count === 0) {
        setTimeout(() => {
          countdownOverlay.remove();
          console.log('[TrainingArena] 🗑️ Overlay countdown retiré (GO! terminé)');
        }, 800);
      }
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
        
        // ✅ COPIE EXACTE Arena (Carte.js ligne 1733-1736): Réinitialiser état jeu
        setValidatedPairIds(new Set());
        setSelectedZones([]);
        
        // ✅ COPIE EXACTE Arena (Carte.js ligne 1739-1741): Mettre à jour compteur manches
        if (Number.isFinite(roundIndex)) {
          setRoundsPlayed(roundIndex + 1);
        }
        
        // ✅ COPIE EXACTE Arena: NE PAS reconstruire calcAngles (localStorage suffit)
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
      
      // ✅ COPIE EXACTE Arena (Carte.js ligne 1398): Utiliser zonesRef.current pour éviter stale closure
      const currentZones = zonesRef.current || [];
      const ZA = currentZones.find(z => z.id === zoneAId);
      const ZB = currentZones.find(z => z.id === zoneBId);
      
      // ✅ ANIMATION BULLES - Couleur par joueur (COPIE EXACTE Arena)
      if (ZA && ZB) {
        let color = '#22c55e';
        let borderColor = '#ffffff';
        let label = '';
        
        try {
          // ✅ CRITIQUE: Utiliser playerIdx REÇU DU BACKEND (pas calculé localement)
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
        
        // ✅ Animation bulle (comme Arena)
        animateBubblesFromZones(zoneAId, zoneBId, color, ZA, ZB, borderColor, label);
        
        // ✅ COPIE EXACTE Arena (Carte.js ligne 1425-1501): Historique pédagogique complet
        try {
          console.log('[TrainingArena] 🖼️ Diagnostic images historique:', { 
            ZA_type: ZA?.type, 
            ZA_content: ZA?.content, 
            ZB_type: ZB?.type, 
            ZB_content: ZB?.content 
          });
          const textFor = (Z) => {
            const t = (Z?.label || Z?.content || Z?.text || Z?.value || '').toString();
            if (t && t.trim()) return t;
            const pid = Z?.pairId || pairId;
            return pid ? `[${pid}]` : '…';
          };
          
          const textForCalc = (Z) => {
            const t = (Z?.content || Z?.label || Z?.text || Z?.value || '').toString();
            if (t && t.trim()) return t;
            const pid = Z?.pairId || pairId;
            return pid ? `[${pid}]` : '…';
          };
          
          const textA = textFor(ZA);
          const textB = textFor(ZB);
          const typeA = ZA?.type || '';
          const typeB = ZB?.type || '';
          let kind = null;
          let calcExpr = null;
          let calcResult = null;
          let imageSrc = null;
          let imageLabel = null;
          let displayText = `${textA || '…'} ↔ ${textB || '…'}`;
          
          const resolveImageSrc = (raw) => {
            if (!raw) return null;
            const normalized = String(raw).startsWith('http') ? String(raw) : process.env.PUBLIC_URL + '/' + (String(raw).startsWith('/') ? String(raw).slice(1) : (String(raw).startsWith('images/') ? String(raw) : 'images/' + String(raw)));
            return encodeURI(normalized).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
          };
          
          if ((typeA === 'calcul' && typeB === 'chiffre') || (typeA === 'chiffre' && typeB === 'calcul')) {
            kind = 'calcnum';
            const calcZone = typeA === 'calcul' ? ZA : ZB;
            const numZone = typeA === 'chiffre' ? ZA : ZB;
            calcExpr = textForCalc(calcZone);
            calcResult = textForCalc(numZone);
            displayText = (calcExpr && calcResult) ? `${calcExpr} = ${calcResult}` : `${textA || '…'} ↔ ${textB || '…'}`;
          } else if ((typeA === 'image' && typeB === 'texte') || (typeA === 'texte' && typeB === 'image')) {
            kind = 'imgtxt';
            const imgZone = typeA === 'image' ? ZA : ZB;
            const txtZone = typeA === 'texte' ? ZA : ZB;
            const raw = imgZone?.content || imgZone?.url || imgZone?.path || imgZone?.src || '';
            if (raw) imageSrc = resolveImageSrc(String(raw));
            imageLabel = textFor(txtZone);
            displayText = imageLabel || `${textA || '…'} ↔ ${textB || '…'}`;
          }
          
          const entry = {
            a: zoneAId,
            b: zoneBId,
            winnerId: studentId,
            winnerName: playerName || 'Joueur',
            color: color,
            borderColor: borderColor,
            initials: label,
            text: displayText,
            kind,
            calcExpr,
            calcResult,
            imageSrc,
            imageLabel
          };
          
          setLastWonPair(entry);
          // ✅ COPIE EXACTE Arena (Carte.js ligne 1498): Ajouter à l'historique scrollable
          setWonPairsHistory(h => [entry, ...(Array.isArray(h) ? h : [])].slice(0, 25));
        } catch (e) {
          console.warn('[TrainingArena] Erreur mise à jour historique:', e);
        }
      }
      
      // ✅ COPIE EXACTE Arena (Carte.js ligne 1503-1505): Désactiver gameActive AVANT setZones
      setGameActive(false);
      console.log('[TrainingArena] ⚠️ gameActive=false (paire validée, attente nouvelle carte)');
      
      // ✅ COPIE EXACTE Arena (Carte.js ligne 1507-1515): Masquer zones validées
      setZones(prevZones => {
        return prevZones.map(z => {
          if (z.id === zoneAId || z.id === zoneBId) {
            return { ...z, validated: true };
          }
          return z;
        });
      });
      // ✅ COPIE EXACTE Arena (Carte.js ligne 1517): Tracking paires validées
      setValidatedPairIds(prev => new Set([...prev, pairId]));
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
      // ✅ ANIMATION: Gérée par événement socket 'training:pair-validated' (couleur du gagnant)
      
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
  
  const svgPath = `${process.env.PUBLIC_URL}/images/carte-svg.svg`;
  
  if (gameEnded) {
    return null; // Le podium sera affiché via overlay
  }
  
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* ✅ COPIE EXACTE Arena HUD Pills */}
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
      
      {/* ✅ COPIE EXACTE Arena: Historique pédagogique (Carte.js ligne 5818-5853) */}
      {Array.isArray(wonPairsHistory) && wonPairsHistory.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 12,
          padding: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxWidth: 320,
          maxHeight: '80vh',
          overflowY: 'auto',
          zIndex: 100
        }}>
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              cursor: 'pointer', 
              padding: '6px 0',
              marginBottom: historyExpanded ? 8 : 0
            }} 
            onClick={() => setHistoryExpanded(v => !v)}
          >
            <div style={{ fontWeight: 'bold', fontSize: 14 }}>📚 Historique</div>
            <div style={{ opacity: 0.7, fontSize: 14 }}>{wonPairsHistory.length}</div>
          </div>
          {historyExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
              {wonPairsHistory.map((h, i) => {
                const label = (() => {
                  if (h.kind === 'calcnum' && h.calcExpr && h.calcResult) return `${h.calcExpr} = ${h.calcResult}`;
                  if (h.kind === 'imgtxt' && h.imageLabel) return h.imageLabel;
                  return h.text || '';
                })();
                return (
                  <div key={i} style={{ fontSize: 13, padding: '6px 8px', border: '1px solid ' + (h.borderColor || '#eee'), borderRadius: 6, background: '#fff', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: h.color || '#e5e7eb', border: h.borderColor ? `2px solid ${h.borderColor}` : 'none', flexShrink: 0 }} />
                      <span style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.winnerName || 'Joueur'}</span>
                    </div>
                    <div style={{ marginLeft: 16, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {h.kind === 'imgtxt' && h.imageSrc && (
                        <img src={h.imageSrc} alt={h.imageLabel || label || 'Image'} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 12, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* ✅ COPIE EXACTE Arena: SVG inline complet (Carte.js ligne 6092-6490) */}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        {showBigCross && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: 16, background: 'rgba(220,0,0,0.85)', transform: 'translate(-50%, -50%) rotate(45deg)', borderRadius: 8 }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: 16, background: 'rgba(220,0,0,0.85)', transform: 'translate(-50%, -50%) rotate(-45deg)', borderRadius: 8 }} />
          </div>
        )}
        <object
          type="image/svg+xml"
          data={svgPath}
          className="carte-bg"
        >
          Votre navigateur ne supporte pas les SVG
        </object>
        <svg
          ref={svgOverlayRef}
          className="carte-svg-overlay"
          width={1000}
          height={1000}
          viewBox="0 0 1000 1000"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'auto',
            width: '100%',
            height: '100%',
            zIndex: 2
          }}
        >
          <defs>
            {zones.filter(z => z.type === 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
              <clipPath id={`clip-zone-${zone.id}`} key={`clip-${zone.id}`} clipPathUnits="userSpaceOnUse">
                <path d={pointsToBezierPath(zone.points)} />
              </clipPath>
            ))}
            {zones.filter(z => z.type !== 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
              <path id={`text-curve-${zone.id}`} key={`textcurve-${zone.id}`} d={getArcPathFromZonePoints(zone.points, zone.id, {}, zone.arcPoints)} fill="none" />
            ))}
          </defs>
          {zones.filter(z => z && typeof z === 'object').map((zone) => (
            <g key={zone.id} data-zone-id={zone.id} id={`zone-${zone.id}`}>
              {zone.type === 'image' && zone.content && (() => {
                const raw = zone.content;
                const normalized = raw.startsWith('http')
                  ? raw
                  : process.env.PUBLIC_URL + '/' + (raw.startsWith('/')
                    ? raw.slice(1)
                    : (raw.startsWith('images/') ? raw : 'images/' + raw));
                const src = encodeURI(normalized)
                  .replace(/ /g, '%20')
                  .replace(/\(/g, '%28')
                  .replace(/\)/g, '%29');
                const bbox = getZoneBoundingBox(zone.points);
                return (
                  <image
                    href={src}
                    xlinkHref={src}
                    x={bbox.x}
                    y={bbox.y}
                    width={bbox.width}
                    height={bbox.height}
                    style={{ pointerEvents: 'none', objectFit: 'cover' }}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#clip-zone-${zone.id})`}
                  />
                );
              })()}
              
              <path
                d={pointsToBezierPath(zone.points)}
                fill={(() => {
                  const isSelected = gameActive && selectedZones.includes(zone.id);
                  if (zone.type === 'image') {
                    if (isSelected) return 'rgba(255, 214, 0, 0.55)';
                    return 'rgba(255, 214, 0, 0.01)';
                  }
                  if (zone.type === 'texte' || zone.type === 'chiffre' || zone.type === 'calcul') {
                    if (isSelected) return 'rgba(40, 167, 69, 0.55)';
                    return 'rgba(40, 167, 69, 0.01)';
                  }
                  return 'transparent';
                })()}
                stroke={'none'}
                pointerEvents="all"
                onClick={() => {
                  if (gameActive && (zone.type === 'image' || zone.type === 'texte' || zone.type === 'chiffre' || zone.type === 'calcul')) {
                    handleZoneClick(zone.id);
                  }
                }}
              />
              
              {zone.type === 'texte' && (() => {
                let idxStart, idxEnd;
                if (Array.isArray(zone.arcPoints) && zone.arcPoints.length === 2) {
                  idxStart = zone.arcPoints[0];
                  idxEnd = zone.arcPoints[1];
                } else {
                  idxStart = 0;
                  idxEnd = 1;
                }
                
                const pointsArr = Array.isArray(zone.points) && zone.points.length >= 2 ? zone.points : [{x:0,y:0},{x:1,y:1}];
                const { r, delta } = interpolateArc(pointsArr, idxStart, idxEnd, 0);
                const arcLen = r * delta;
                
                const textValue = zone.content || zone.label || '';
                const baseFontSize = 32;
                const safeTextValue = typeof textValue === 'string' ? textValue : '';
                const textLen = safeTextValue.length * baseFontSize * 0.6;
                const marginPx = 24;
                const fontSize = textLen > arcLen - 2 * marginPx
                  ? Math.max(12, (arcLen - 2 * marginPx) / (safeTextValue.length * 0.6))
                  : baseFontSize;
                
                return (
                  <text
                    fontSize={fontSize}
                    fontFamily={'Arial'}
                    fill={'#fff'}
                    fontWeight="bold"
                    pointerEvents="auto"
                    style={{ cursor: 'pointer' }}
                    onClick={() => gameActive && handleZoneClick(zone.id)}
                  >
                    <textPath 
                      xlinkHref={`#text-curve-${zone.id}`} 
                      startOffset="50%" 
                      textAnchor="middle" 
                      dominantBaseline="middle"
                    >
                      {textValue}
                    </textPath>
                  </text>
                );
              })()}
              
              {(zone.type === 'calcul' || zone.type === 'chiffre') && zone.content && (() => {
                const bbox = getZoneBoundingBox(zone.points);
                const cx = bbox.x + bbox.width / 2;
                const cy = bbox.y + bbox.height / 2;
                const base = Math.max(12, Math.min(bbox.width, bbox.height));
                const chiffreBaseMin = chiffreRefBase ? 0.95 * chiffreRefBase : base;
                const effectiveBase = (zone.type === 'chiffre') ? Math.max(base, chiffreBaseMin) : base;
                const fontSize = (zone.type === 'chiffre' ? 0.42 : 0.28) * effectiveBase;
                const angle = Number(calcAngles[zone.id] || 0);
                const mo = mathOffsets[zone.id] || { x: 0, y: 0 };
                
                const contentStr = String(zone.content ?? '').trim();
                const isSix = (zone.type === 'chiffre') && contentStr === '6';
                const offsetX = isSix ? (-0.04 * fontSize) : 0;
                const isMath = zone.type === 'calcul' || zone.type === 'chiffre';
                const isChiffre = zone.type === 'chiffre';
                
                return (
                  <g transform={`translate(${mo.x || 0} ${mo.y || 0}) rotate(${angle} ${cx} ${cy})`}>
                    <text
                      x={cx}
                      y={cy}
                      transform={offsetX ? `translate(${offsetX} 0)` : undefined}
                      textAnchor="middle"
                      alignmentBaseline="middle"
                      fontSize={fontSize}
                      fill={isMath ? '#456451' : '#222'}
                      fontWeight="bold"
                      stroke={isMath ? 'none' : '#fff'}
                      strokeWidth={isMath ? 0 : 4}
                      paintOrder="stroke"
                      pointerEvents={gameActive ? 'none' : 'auto'}
                      style={{ cursor: gameActive ? 'default' : 'pointer' }}
                      onClick={() => gameActive && handleZoneClick(zone.id)}
                    >
                      {zone.content}
                    </text>
                    {isChiffre && (() => {
                      const underLen = 0.5 * fontSize;
                      const half = underLen / 2;
                      const uy = cy + 0.54 * fontSize;
                      const strokeW = Math.max(1, 0.09 * fontSize);
                      const digitColor = '#456451';
                      const cxAdj = cx + (offsetX || 0);
                      return (
                        <line
                          x1={cxAdj - half}
                          y1={uy}
                          x2={cxAdj + half}
                          y2={uy}
                          stroke={digitColor}
                          strokeWidth={strokeW}
                          strokeLinecap="round"
                        />
                      );
                    })()}
                  </g>
                );
              })()}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
