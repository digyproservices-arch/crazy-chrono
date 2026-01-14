// ==========================================
// DASHBOARD PROFESSEUR - GESTION MATCHS TRAINING
// Liste des matchs training actifs avec contrôle
// Clone de ArenaManagerDashboard pour Training
// ==========================================

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { getBackendUrl } from '../../utils/subscription';

export default function TrainingManagerDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { groups, config } = location.state || {};
  
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  // Initialiser les matchs depuis groups/config
  useEffect(() => {
    if (!groups || !config) {
      navigate('/training-arena/setup');
      return;
    }

    const matchList = groups.map((group, idx) => ({
      matchId: `training_match_${Date.now()}_${idx}`,
      groupIndex: idx + 1,
      studentIds: group,
      sessionName: config.sessionName || `Groupe ${idx + 1}`,
      status: 'created',
      connectedPlayers: 0,
      readyPlayers: 0,
      players: [],
      config
    }));

    setMatches(matchList);
  }, [groups, config, navigate]);

  // Connexion Socket.IO unique
  useEffect(() => {
    const socket = io(getBackendUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[TrainingManager] ✅ Socket connecté');
    });

    socket.on('disconnect', () => {
      console.log('[TrainingManager] ❌ Socket déconnecté');
    });

    // Mise à jour joueurs en temps réel
    socket.on('training:players-update', ({ matchId, players }) => {
      console.log('[TrainingManager] Mise à jour joueurs:', matchId, players);
      setMatches(prev => prev.map(m => {
        if (m.matchId === matchId) {
          const connectedCount = players.length;
          const readyCount = players.filter(p => p.ready).length;
          return {
            ...m,
            connectedPlayers: connectedCount,
            readyPlayers: readyCount,
            players,
            status: connectedCount > 0 ? 'waiting' : m.status
          };
        }
        return m;
      }));
    });

    // Match démarré
    socket.on('training:game-start', ({ matchId }) => {
      console.log('[TrainingManager] 🎮 Match démarré:', matchId);
      setMatches(prev => prev.map(m => 
        m.matchId === matchId ? { ...m, status: 'playing' } : m
      ));
    });

    // Match terminé
    socket.on('training:game-end', ({ matchId }) => {
      console.log('[TrainingManager] 🏁 Match terminé:', matchId);
      setMatches(prev => prev.map(m => 
        m.matchId === matchId ? { ...m, status: 'finished' } : m
      ));
    });

    return () => socket.disconnect();
  }, []);

  // Souscrire aux matchs
  useEffect(() => {
    if (!socketRef.current) return;
    
    matches.forEach(match => {
      console.log('[TrainingManager] Souscription au match:', match.matchId);
      socketRef.current.emit('training:subscribe-manager', { matchId: match.matchId });
    });
  }, [matches.map(m => m.matchId).join(',')]);

  // Démarrer tous les matchs
  const handleStartAllMatches = () => {
    if (!socketRef.current) {
      alert('Connexion Socket.IO non disponible');
      return;
    }

    if (!window.confirm(`Démarrer ${matches.length} match(s) d'entraînement ?`)) {
      return;
    }

    matches.forEach(match => {
      console.log('[TrainingManager] Création match:', match.matchId);
      socketRef.current.emit('training:create-match', {
        matchId: match.matchId,
        studentIds: match.studentIds,
        config: match.config,
        classId: localStorage.getItem('cc_class_id'),
        teacherId: localStorage.getItem('cc_user_id')
      });

      // Marquer comme créé
      setMatches(prev => prev.map(m => 
        m.matchId === match.matchId ? { ...m, status: 'waiting' } : m
      ));
    });
  };

  // Démarrer un match manuellement
  const handleStartMatch = (matchId) => {
    if (!socketRef.current) return;

    const match = matches.find(m => m.matchId === matchId);
    if (!match) return;

    if (match.connectedPlayers === 0) {
      alert('Aucun joueur connecté pour ce match.');
      return;
    }

    if (!window.confirm(`Démarrer le match "${match.sessionName}" avec ${match.connectedPlayers} joueur(s) ?`)) {
      return;
    }

    socketRef.current.emit('training:force-start', { matchId });
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Chargement...</h2>
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
        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#1f2937', marginBottom: 8 }}>
          🎓 Gestion des Matchs d'Entraînement
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

      {/* Bouton démarrer tous */}
      {matches.some(m => m.status === 'created') && (
        <button
          onClick={handleStartAllMatches}
          style={{
            padding: '16px 32px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 18,
            fontWeight: 700,
            cursor: 'pointer',
            marginBottom: 32,
            boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
            display: 'block',
            width: '100%'
          }}
        >
          🚀 DÉMARRER TOUS LES MATCHS
        </button>
      )}

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
            Aucun match créé
          </h3>
          <p style={{ color: '#6b7280' }}>
            Retournez à la création de groupes
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          {matches.map(match => {
            const canStart = match.connectedPlayers > 0;

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
                {/* Header */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start',
                  marginBottom: 16
                }}>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>
                      {match.sessionName}
                    </h3>
                    <div style={{ fontSize: 14, color: '#6b7280' }}>
                      Groupe {match.groupIndex} • {match.studentIds.length} élèves
                    </div>
                  </div>

                  <div style={{
                    padding: '6px 12px',
                    background: match.status === 'playing' ? '#dcfce7' : 
                               match.status === 'waiting' ? '#fef3c7' : '#f3f4f6',
                    color: match.status === 'playing' ? '#15803d' : 
                           match.status === 'waiting' ? '#92400e' : '#6b7280',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700
                  }}>
                    {match.status === 'playing' ? '🎮 EN COURS' : 
                     match.status === 'waiting' ? '⏳ EN ATTENTE' : '📝 CRÉÉ'}
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
                      Total élèves
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2937' }}>
                      {match.studentIds.length}
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

                {/* Liste joueurs */}
                {match.players && match.players.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                      Joueurs connectés:
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
                {match.status === 'waiting' && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={() => handleStartMatch(match.matchId)}
                      disabled={!canStart}
                      style={{
                        flex: 1,
                        padding: '12px 24px',
                        background: canStart ? '#3b82f6' : '#e5e7eb',
                        color: canStart ? '#fff' : '#9ca3af',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: canStart ? 'pointer' : 'not-allowed',
                        opacity: canStart ? 1 : 0.6
                      }}
                    >
                      {canStart 
                        ? `🚀 DÉMARRER LE MATCH` 
                        : '⏳ En attente de joueurs...'
                      }
                    </button>
                  </div>
                )}

                {/* Message si aucun joueur */}
                {match.status === 'waiting' && match.connectedPlayers === 0 && (
                  <div style={{
                    marginTop: 12,
                    padding: 12,
                    background: '#fef3c7',
                    borderRadius: 8,
                    fontSize: 14,
                    color: '#92400e'
                  }}>
                    ⚠️ Aucun joueur connecté. Les élèves doivent cliquer sur leur notification.
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
