// ==========================================
// DASHBOARD PROFESSEUR - GESTION MATCHS TRAINING ARENA
// Liste des matchs actifs avec contrôle de démarrage
// ==========================================

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

export default function TrainingArenaManagerDashboard() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  // Récupérer les matchs actifs depuis l'API
  const loadActiveMatches = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/api/tournament/active-matches`);
      const data = await response.json();
      
      if (data.success) {
        // Rejoindre les rooms des nouveaux matchs Training
        if (socketRef.current?.connected && data.matches) {
          const trainingMatchIds = data.matches
            .filter(m => m.mode === 'training')
            .map(m => m.matchId);
          
          if (trainingMatchIds.length > 0) {
            socketRef.current.emit('training:teacher-join', { matchIds: trainingMatchIds });
          }
        }
        
        // FUSIONNER avec état existant au lieu d'écraser
        setMatches(prevMatches => {
          const apiMatches = data.matches || [];
          
          // Si première fois, utiliser données API
          if (prevMatches.length === 0) {
            return apiMatches;
          }
          
          // Sinon, fusionner intelligemment
          return apiMatches.map(apiMatch => {
            const existingMatch = prevMatches.find(m => m.matchId === apiMatch.matchId);
            
            if (existingMatch) {
              // CRITIQUE: Ne JAMAIS écraser avec undefined
              const merged = {
                ...apiMatch,
                connectedPlayers: existingMatch.connectedPlayers || apiMatch.connectedPlayers || 0,
                readyPlayers: existingMatch.readyPlayers || apiMatch.readyPlayers || 0,
                players: existingMatch.players || apiMatch.players || [],
                status: existingMatch.status || apiMatch.status,
                tiedPlayers: existingMatch.tiedPlayers,
                ranking: existingMatch.ranking,
                isTiebreaker: existingMatch.isTiebreaker
              };
              
              // ✅ COPIE EXACTE Arena (ArenaManagerDashboard.js lignes 54-60)
              // Préserver playersReadyCount du cache (socket temps réel) plutôt que l'écraser avec API (polling retardé)
              if (existingMatch.playersReadyCount !== undefined) {
                merged.playersReadyCount = existingMatch.playersReadyCount;
              }
              if (existingMatch.playersTotalCount !== undefined) {
                merged.playersTotalCount = existingMatch.playersTotalCount;
              }
              
              // Log diagnostic pour tie-waiting
              if (existingMatch.status === 'tie-waiting') {
                console.log(`[TrainingArenaManager] 🔄 POLLING API - Match ${apiMatch.matchId.slice(-8)}:`, {
                  avant: { ready: existingMatch.playersReadyCount, total: existingMatch.playersTotalCount },
                  apres: { ready: merged.playersReadyCount, total: merged.playersTotalCount }
                });
              }
              
              return merged;
            }
            
            return apiMatch;
          });
        });
        setError(null);
      } else {
        setError('Erreur lors du chargement des matchs');
      }
    } catch (err) {
      console.error('[TrainingArenaManager] Erreur chargement matchs:', err);
      setError('Impossible de charger les matchs actifs');
    } finally {
      setLoading(false);
    }
  };

  // Initialisation et polling
  useEffect(() => {
    loadActiveMatches();
    
    // Rafraîchir toutes les 5 secondes
    const interval = setInterval(loadActiveMatches, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Connexion Socket.IO - UNE SEULE FOIS au montage du composant
  useEffect(() => {
    const socket = io(getBackendUrl(), {
      transports: ['websocket'],
      reconnection: true
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[TrainingArenaManager] ✅ Socket connecté, ID:', socket.id);
      console.log('[TrainingArenaManager] 🔍 URL backend:', getBackendUrl());
      
      // Rejoindre toutes les rooms des matchs actifs (Training + Arena)
      fetch(`${getBackendUrl()}/api/tournament/active-matches`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.matches) {
            const allMatchIds = data.matches.map(m => m.matchId);
            
            if (allMatchIds.length > 0) {
              console.log('[TrainingArenaManager] 🔗 Rejoindre ALL rooms:', allMatchIds);
              socket.emit('training:teacher-join', { matchIds: allMatchIds });
            }
          }
        })
        .catch(err => console.error('[TrainingArenaManager] Erreur chargement matchs pour join:', err));
    });
    
    socket.on('disconnect', () => {
      console.log('[TrainingArenaManager] ❌ Socket déconnecté');
    });
    
    socket.on('connect_error', (err) => {
      console.error('[TrainingArenaManager] ❌ Erreur connexion:', err?.message);
    });

    // Mise à jour des joueurs en temps réel
    socket.on('training:players-update', ({ matchId, players }) => {
      console.log('[TrainingArenaManager] 👥 Players update reçu:', { matchId, players: players.map(p => ({ socketId: p.socketId, ready: p.ready })) });
      try { window.ccAddDiag && window.ccAddDiag('dashboard:training:players-update', { matchId: matchId?.slice(-8), playersCount: players.length, readyCount: players.filter(p => p.ready).length, players: players.map(p => ({ ready: p.ready, score: p.score })) }); } catch {}
      setMatches(prevMatches => {
        console.log('[TrainingArenaManager] 🔍 Matchs actuels:', prevMatches.map(m => ({ 
          id: m.matchId.slice(-8), 
          connectedPlayers: m.connectedPlayers,
          players: m.players?.length || 0
        })));
        
        const updated = prevMatches.map(m => {
          if (m.matchId === matchId) {
            const connectedCount = players.length;
            const readyCount = players.filter(p => p.ready).length;
            console.log('[TrainingArenaManager] ✅ Match trouvé! Update:', {
              matchId: matchId.slice(-8),
              avant: { connectedPlayers: m.connectedPlayers, readyPlayers: m.readyPlayers },
              après: { connectedPlayers: connectedCount, readyPlayers: readyCount }
            });
            try { window.ccAddDiag && window.ccAddDiag('dashboard:match-update', { matchId: matchId?.slice(-8), avant: { connected: m.connectedPlayers, ready: m.readyPlayers }, après: { connected: connectedCount, ready: readyCount } }); } catch {}
            return {
              ...m,
              connectedPlayers: connectedCount,
              readyPlayers: readyCount,
              players: players
            };
          }
          return m;
        });
        
        console.log('[TrainingArenaManager] 📊 Matchs après update:', updated.map(m => ({ 
          id: m.matchId.slice(-8), 
          connectedPlayers: m.connectedPlayers,
          readyPlayers: m.readyPlayers
        })));
        try { window.ccAddDiag && window.ccAddDiag('dashboard:matches-state', { matches: updated.map(m => ({ id: m.matchId?.slice(-8), connected: m.connectedPlayers, ready: m.readyPlayers, status: m.status })) }); } catch {}
        
        return updated;
      });
    });

    // Match démarré
    socket.on('training:game-start', ({ matchId }) => {
      console.log('[TrainingArenaManager] 🎮 Match démarré:', matchId);
      try { window.ccAddDiag && window.ccAddDiag('dashboard:training:game-start', { matchId: matchId?.slice(-8) }); } catch {}
      setMatches(prevMatches => 
        prevMatches.map(m => {
          if (m.matchId === matchId) {
            return { ...m, status: 'playing' };
          }
          return m;
        })
      );
    });

    // Match terminé
    socket.on('training:game-end', ({ matchId }) => {
      console.log('[TrainingArenaManager] 🏁 Match terminé:', matchId);
      setMatches(prevMatches => 
        prevMatches.map(m => {
          if (m.matchId === matchId) {
            return { ...m, status: 'finished' };
          }
          return m;
        })
      );
    });

    // Égalité détectée - Attente décision professeur
    socket.on('training:tie-waiting-teacher', ({ matchId, tiedPlayers, ranking }) => {
      console.log('[TrainingArenaManager] ⚖️ Égalité détectée, attente décision professeur');
      setMatches(prevMatches => 
        prevMatches.map(m => {
          if (m.matchId === matchId) {
            return {
              ...m,
              status: 'tie-waiting',
              tiedPlayers,
              ranking,
              playersReadyCount: m.playersReadyCount || 0,
              playersTotalCount: m.playersTotalCount || tiedPlayers?.length || 2
            };
          }
          return m;
        })
      );
    });

    // Mise à jour joueurs prêts pour départage
    socket.on('training:tiebreaker-ready-update', ({ matchId, readyCount, totalCount }) => {
      console.log(`[TrainingArenaManager] 🎯 ÉVÉNEMENT REÇU: training:tiebreaker-ready-update`, { matchId, readyCount, totalCount });
      setMatches(prevMatches => {
        console.log('[TrainingArenaManager] 🔍 Matchs actuels:', prevMatches.map(m => ({ id: m.matchId, status: m.status })));
        const updated = prevMatches.map(m => {
          if (m.matchId === matchId) {
            console.log(`[TrainingArenaManager] ✅ Match trouvé, mise à jour: ${readyCount}/${totalCount}`);
            return {
              ...m,
              playersReadyCount: readyCount,
              playersTotalCount: totalCount
            };
          }
          return m;
        });
        console.log('[TrainingArenaManager] 📊 Matchs après update:', updated.map(m => ({ id: m.matchId, ready: m.playersReadyCount })));
        return updated;
      });
    });
    
    console.log('[TrainingArenaManager] ✅ Listener training:tiebreaker-ready-update attaché');

    // Tiebreaker démarré
    socket.on('training:tiebreaker-start', ({ matchId }) => {
      console.log('[TrainingArenaManager] 🔄 Tiebreaker démarré:', matchId);
      setMatches(prevMatches => 
        prevMatches.map(m => {
          if (m.matchId === matchId) {
            return { ...m, status: 'playing', isTiebreaker: true };
          }
          return m;
        })
      );
    });

    return () => socket.disconnect();
  }, []); // UNE SEULE connexion Socket.IO

  // Souscrire aux matchs actifs quand la liste change
  useEffect(() => {
    if (!socketRef.current) return;
    
    // S'abonner à tous les matchs actifs
    matches.forEach(match => {
      console.log('[TrainingArenaManager] Souscription au match:', match.matchId);
      socketRef.current.emit('training:subscribe-manager', { matchId: match.matchId });
    });
  }, [matches.map(m => m.matchId).join(',')]);

  // Démarrer un match manuellement
  const handleStartMatch = (matchId) => {
    console.log('[TrainingArenaManager] 🚀 handleStartMatch appelé pour:', matchId);
    
    if (!socketRef.current) {
      console.error('[TrainingArenaManager] ❌ Socket non disponible');
      alert('Connexion Socket.IO non disponible');
      return;
    }

    const match = matches.find(m => m.matchId === matchId);
    console.log('[TrainingArenaManager] 🔍 Match trouvé:', match);
    
    if (!match) {
      console.error('[TrainingArenaManager] ❌ Match non trouvé dans la liste');
      return;
    }

    console.log('[TrainingArenaManager] 📊 État du match:', {
      matchId,
      connectedPlayers: match.connectedPlayers,
      readyPlayers: match.readyPlayers,
      totalPlayers: match.totalPlayers,
      players: match.players,
      status: match.status
    });

    if (match.connectedPlayers < 2) {
      console.warn('[TrainingArenaManager] ⚠️ Pas assez de joueurs connectés');
      alert('Au moins 2 joueurs doivent être connectés pour démarrer le match.');
      return;
    }

    const confirmMsg = `Démarrer le match "${match.groupName}" avec ${match.connectedPlayers} joueur(s) connecté(s) ?`;
    console.log('[TrainingArenaManager] ❓ Demande confirmation:', confirmMsg);
    
    if (!window.confirm(confirmMsg)) {
      console.log('[TrainingArenaManager] ❌ Démarrage annulé par l\'utilisateur');
      return;
    }

    // Émettre l'événement de démarrage forcé
    console.log('[TrainingArenaManager] 📤 Émission training:force-start pour matchId:', matchId);
    socketRef.current.emit('training:force-start', { matchId }, (response) => {
      console.log('[TrainingArenaManager] 📥 Réponse reçue:', response);
      if (response && response.ok) {
        console.log('[TrainingArenaManager] ✅ Match démarré avec succès');
        // Le match sera retiré de la liste au prochain refresh (status = playing)
      } else {
        console.error('[TrainingArenaManager] ❌ Erreur démarrage:', response);
        alert('Erreur lors du démarrage du match: ' + (response?.error || 'Inconnue'));
      }
    });
  };

  const handleStartTiebreaker = (matchId) => {
    if (!socketRef.current) return;
    
    if (!window.confirm('Lancer la manche de départage (3 cartes - 30 secondes) ?')) return;
    
    console.log(`[TrainingArenaManager] 🔄 Lancement départage pour match ${matchId}`);
    socketRef.current.emit('training:start-tiebreaker', { matchId });
  };

  // Supprimer un match manuellement
  const handleDeleteMatch = (matchId) => {
    if (!socketRef.current) {
      alert('Erreur: Socket non connecté');
      return;
    }
    
    console.log(`[TrainingArenaManager] 🗑️ Suppression match ${matchId}`);
    socketRef.current.emit('delete-match', { matchId }, (response) => {
      console.log('[TrainingArenaManager] 📥 Réponse suppression:', response);
      
      // ✅ FIX: Supprimer de la liste même si backend échoue
      // (matchs Training peuvent être perdus après redémarrage backend)
      setMatches(prevMatches => prevMatches.filter(m => m.matchId !== matchId));
      
      if (response && response.ok) {
        console.log('[TrainingArenaManager] ✅ Match supprimé avec succès');
        alert('Match supprimé avec succès');
      } else {
        console.warn('[TrainingArenaManager] ⚠️ Backend: match déjà supprimé ou introuvable');
        alert('Match retiré de la liste (peut avoir été supprimé automatiquement après un redémarrage)');
      }
    });
  };

  // Voir le lobby d'un match (optionnel)
  const handleViewLobby = (roomCode) => {
    navigate(`/training-arena/lobby/${roomCode}`);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Chargement des matchs actifs...</h2>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: 40, 
      maxWidth: 1200, 
      margin: '0 auto',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* En-tête */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ 
          fontSize: 32, 
          fontWeight: 800, 
          color: '#1f2937',
          marginBottom: 8
        }}>
          📊 Gestion des Matchs Training Arena
        </h1>
        <p style={{ fontSize: 16, color: '#6b7280' }}>
          Supervisez et démarrez les matchs en attente
        </p>
      </div>

      {/* Bouton retour */}
      <button
        onClick={() => navigate('/training-arena/setup')}
        style={{
          padding: '10px 20px',
          background: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 24
        }}
      >
        ← Retour à la création de groupes
      </button>

      {/* Message erreur */}
      {error && (
        <div style={{
          padding: 16,
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: 8,
          color: '#991b1b',
          marginBottom: 24
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Liste des matchs */}
      {matches.length === 0 ? (
        <div style={{
          padding: 48,
          textAlign: 'center',
          background: '#f9fafb',
          borderRadius: 12,
          border: '2px dashed #d1d5db'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Aucun match actif
          </h3>
          <p style={{ color: '#6b7280' }}>
            Créez un groupe et lancez un match pour commencer
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          {matches.map(match => {
            const canStart = match.connectedPlayers >= 2;
            const allReady = match.connectedPlayers > 0 && 
                           match.readyPlayers === match.connectedPlayers;
            
            console.log('[TrainingArenaManager] 🎨 RENDER match:', {
              matchId: match.matchId.slice(-8),
              connectedPlayers: match.connectedPlayers,
              readyPlayers: match.readyPlayers,
              playersArray: match.players?.length || 0,
              canStart,
              allReady,
              status: match.status
            });

            return (
              <div
                key={match.matchId}
                style={{
                  padding: 24,
                  background: '#fff',
                  border: '2px solid #e5e7eb',
                  borderRadius: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                {/* Header du match */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start',
                  marginBottom: 16
                }}>
                  <div>
                    <h3 style={{ 
                      fontSize: 20, 
                      fontWeight: 700, 
                      color: '#1f2937',
                      marginBottom: 4
                    }}>
                      {match.groupName}
                    </h3>
                    <div style={{ fontSize: 14, color: '#6b7280' }}>
                      Code: <span style={{ 
                        fontWeight: 700, 
                        color: '#3b82f6',
                        fontFamily: 'monospace',
                        fontSize: 16
                      }}>
                        {match.roomCode}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    padding: '6px 12px',
                    background: match.status === 'playing' ? '#dcfce7' : '#fef3c7',
                    color: match.status === 'playing' ? '#15803d' : '#92400e',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700
                  }}>
                    {match.status === 'playing' ? '🎮 EN COURS' : '⏳ EN ATTENTE'}
                  </div>
                </div>

                {/* Stats joueurs */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                  marginBottom: 16,
                  padding: 16,
                  background: '#f9fafb',
                  borderRadius: 8
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                      Total joueurs
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2937' }}>
                      {match.totalPlayers}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                      Connectés
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>
                      {match.connectedPlayers || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                      Prêts
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                      {match.readyPlayers || 0} ✓
                    </div>
                  </div>
                </div>

                {/* Liste des joueurs connectés */}
                {match.players && match.players.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                      Joueurs dans le lobby:
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {match.players.map((player, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '6px 12px',
                            background: player.ready ? '#dcfce7' : '#f3f4f6',
                            border: '1px solid ' + (player.ready ? '#86efac' : '#d1d5db'),
                            borderRadius: 999,
                            fontSize: 14,
                            fontWeight: 500,
                            color: '#1f2937'
                          }}
                        >
                          {player.name} {player.ready && '✓'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {match.status === 'tie-waiting' && (
                    <div style={{ width: '100%', marginBottom: 12 }}>
                      <div style={{
                        background: '#fef3c7',
                        border: '2px solid #f59e0b',
                        borderRadius: 8,
                        padding: 16,
                        marginBottom: 12
                      }}>
                        <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                          ⚖️ ÉGALITÉ DÉTECTÉE !
                        </div>
                        <div style={{ color: '#78350f', fontSize: 14, marginBottom: 8 }}>
                          {match.tiedPlayers?.map(p => p.name).join(', ')} sont à égalité avec {match.tiedPlayers?.[0]?.score} points
                        </div>
                        <div style={{ 
                          color: '#15803d', 
                          fontSize: 14, 
                          fontWeight: 600,
                          marginTop: 8,
                          padding: 8,
                          background: '#dcfce7',
                          borderRadius: 6
                        }}>
                          {(() => {
                            const readyCount = match.playersReadyCount ?? 0;
                            const totalCount = match.playersTotalCount ?? (match.tiedPlayers?.length || 2);
                            console.log(`[TrainingArenaManager] 🖼️ RENDU JSX Match ${match.matchId.slice(-8)}:`, { readyCount, totalCount, raw: match.playersReadyCount });
                            return `✋ Joueurs prêts: ${readyCount}/${totalCount}`;
                          })()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleStartTiebreaker(match.matchId)}
                        style={{
                          width: '100%',
                          padding: '12px 24px',
                          background: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: 16,
                          transition: 'all 0.2s'
                        }}
                      >
                        🔄 LANCER DÉPARTAGE (3 cartes - 30s)
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => handleStartMatch(match.matchId)}
                    disabled={!canStart || match.status === 'tie-waiting'}
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      background: canStart ? '#f97316' : '#e5e7eb',
                      color: canStart ? '#fff' : '#9ca3af',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: canStart ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                      opacity: canStart ? 1 : 0.6
                    }}
                  >
                    {canStart 
                      ? `🚀 DÉMARRER LE MATCH${allReady ? ' (tous prêts)' : ''}` 
                      : '⏳ En attente de joueurs...'
                    }
                  </button>

                  <button
                    onClick={() => handleViewLobby(match.roomCode)}
                    style={{
                      padding: '12px 24px',
                      background: '#fff',
                      color: '#3b82f6',
                      border: '2px solid #3b82f6',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    👁️ Voir lobby
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(`Voulez-vous vraiment supprimer le match "${match.groupName}" ?\n\nLes joueurs seront déconnectés et le match sera perdu.`)) {
                        handleDeleteMatch(match.matchId);
                      }
                    }}
                    style={{
                      padding: '12px 24px',
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#dc2626'}
                    onMouseLeave={(e) => e.target.style.background = '#ef4444'}
                  >
                    🗑️ Supprimer
                  </button>
                </div>

                {/* Message si insuffisant de joueurs */}
                {!canStart && match.connectedPlayers < 2 && (
                  <div style={{
                    marginTop: 12,
                    padding: 12,
                    background: '#fef3c7',
                    borderRadius: 8,
                    fontSize: 14,
                    color: '#92400e'
                  }}>
                    ⚠️ Au moins 2 joueurs doivent être connectés pour démarrer
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
