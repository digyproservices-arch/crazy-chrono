// ==========================================
// COMPOSANT: DASHBOARD COMPÉTITION ARENA
// Vue bracket/organigramme + classement général
// ==========================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'];
const STATUS_CONFIG = {
  pending: { label: 'En attente', color: '#6b7280', bg: '#f3f4f6', icon: '⏳' },
  playing: { label: 'En cours', color: '#d97706', bg: '#fef3c7', icon: '🎮' },
  finished: { label: 'Terminé', color: '#059669', bg: '#d1fae5', icon: '✅' },
  'tie-waiting': { label: 'Égalité', color: '#7c3aed', bg: '#ede9fe', icon: '⚖️' }
};

export default function CompetitionBracket() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [overallRanking, setOverallRanking] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('bracket'); // 'bracket' | 'ranking'
  const [expandedGroup, setExpandedGroup] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const classId = localStorage.getItem('cc_class_id');
      if (!classId) {
        setError('Classe non trouvée. Veuillez vous reconnecter.');
        setLoading(false);
        return;
      }

      const res = await fetch(`${getBackendUrl()}/api/tournament/classes/${classId}/competition-results`);
      const data = await res.json();

      if (data.success) {
        setGroups(data.groups || []);
        setOverallRanking(data.overallRanking || []);
        setStats(data.stats || null);
        setError(null);
      } else {
        setError(data.error || 'Erreur chargement données');
      }
    } catch (err) {
      console.error('[Competition] Erreur:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const formatTime = (ms) => {
    if (!ms) return '-';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <h2>Chargement de la compétition...</h2>
      </div>
    );
  }

  const tabStyle = (active) => ({
    padding: '12px 24px',
    border: 'none',
    borderBottom: active ? '3px solid #3b82f6' : '3px solid transparent',
    background: 'none',
    color: active ? '#3b82f6' : '#6b7280',
    fontSize: 16,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  });

  return (
    <div style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: '24px 20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minHeight: '100vh',
      background: '#f8fafc'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', margin: '0 0 6px 0' }}>
            🏆 Suivi de la Compétition
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            Résultats, bracket et classement général
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={loadData}
            style={{
              padding: '10px 16px',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🔄 Actualiser
          </button>
          <button
            onClick={() => navigate('/tournament/arena-setup')}
            style={{
              padding: '10px 16px',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ← Retour
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 24
        }}>
          {[
            { label: 'Groupes', value: stats.totalGroups, icon: '👥', color: '#3b82f6' },
            { label: 'Terminés', value: stats.finishedMatches, icon: '✅', color: '#059669' },
            { label: 'En cours', value: stats.playingMatches, icon: '🎮', color: '#d97706' },
            { label: 'En attente', value: stats.pendingMatches, icon: '⏳', color: '#6b7280' },
            { label: 'Joueurs', value: stats.totalPlayers, icon: '🧑‍🎓', color: '#8b5cf6' }
          ].map((s, i) => (
            <div key={i} style={{
              background: '#fff',
              borderRadius: 12,
              padding: '16px 14px',
              border: '1px solid #e2e8f0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
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

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: 24,
        background: '#fff',
        borderRadius: '12px 12px 0 0',
        overflow: 'hidden'
      }}>
        <button onClick={() => setActiveTab('bracket')} style={tabStyle(activeTab === 'bracket')}>
          🏟️ Bracket / Matchs
        </button>
        <button onClick={() => setActiveTab('ranking')} style={tabStyle(activeTab === 'ranking')}>
          📊 Classement Général
        </button>
      </div>

      {/* Bracket Tab */}
      {activeTab === 'bracket' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {groups.length === 0 ? (
            <div style={{
              padding: 48,
              textAlign: 'center',
              background: '#fff',
              borderRadius: 12,
              border: '2px dashed #d1d5db'
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
              <h3 style={{ color: '#374151', marginBottom: 8 }}>Aucun match pour le moment</h3>
              <p style={{ color: '#6b7280' }}>
                Créez des groupes et lancez des matchs depuis la page de configuration.
              </p>
            </div>
          ) : (
            groups.map(group => {
              const statusCfg = STATUS_CONFIG[group.match?.status] || STATUS_CONFIG.pending;
              const isExpanded = expandedGroup === group.id;
              const isFinished = group.match?.status === 'finished';

              return (
                <div
                  key={group.id}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: isFinished ? '2px solid #10b981' : '1px solid #e2e8f0',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                  }}
                >
                  {/* Group Header */}
                  <div
                    onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px 20px',
                      cursor: 'pointer',
                      background: isFinished ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#fff',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div style={{ fontSize: 24 }}>
                        {isFinished ? '🏆' : statusCfg.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                          {group.name}
                        </div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                          {group.students.length} joueurs
                          {group.winnerName && (
                            <span style={{ color: '#059669', fontWeight: 600 }}>
                              {' '}• Gagnant: {group.winnerName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background: statusCfg.bg,
                        color: statusCfg.color
                      }}>
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                      <span style={{
                        fontSize: 18,
                        color: '#94a3b8',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                      }}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 20px 20px',
                      borderTop: '1px solid #e2e8f0'
                    }}>
                      {/* Players list */}
                      <div style={{ marginTop: 16, marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                          Joueurs du groupe:
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {group.students.map(s => (
                            <div key={s.id} style={{
                              padding: '6px 12px',
                              borderRadius: 999,
                              fontSize: 13,
                              fontWeight: 500,
                              background: s.id === group.winnerId ? '#dcfce7' : '#f1f5f9',
                              color: s.id === group.winnerId ? '#059669' : '#334155',
                              border: s.id === group.winnerId ? '1px solid #86efac' : '1px solid #e2e8f0'
                            }}>
                              {s.id === group.winnerId && '🏆 '}{s.name}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Match info */}
                      {group.match && (
                        <div style={{
                          background: '#f8fafc',
                          borderRadius: 8,
                          padding: 14,
                          marginBottom: 16,
                          fontSize: 13,
                          color: '#475569'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <span>Code: <strong style={{ fontFamily: 'monospace', color: '#3b82f6' }}>{group.match.roomCode}</strong></span>
                            {group.match.createdAt && (
                              <span>Créé: {new Date(group.match.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                            {group.match.finishedAt && (
                              <span>Terminé: {new Date(group.match.finishedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Results table */}
                      {group.results.length > 0 ? (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                            Résultats du match:
                          </div>
                          <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: 14
                          }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>#</th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Joueur</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Score</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Paires</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Erreurs</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Temps</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.results.map((r, idx) => (
                                <tr key={r.studentId} style={{
                                  background: idx === 0 ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#f8fafc',
                                  borderBottom: '1px solid #e2e8f0'
                                }}>
                                  <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 18 }}>
                                    {MEDAL_EMOJIS[idx] || `${idx + 1}`}
                                  </td>
                                  <td style={{
                                    padding: '10px 12px',
                                    fontWeight: idx === 0 ? 700 : 500,
                                    color: idx === 0 ? '#059669' : '#1e293b'
                                  }}>
                                    {r.studentName}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#3b82f6' }}>
                                    {r.score} pts
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                    {r.pairsValidated}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center', color: r.errors > 0 ? '#dc2626' : '#059669' }}>
                                    {r.errors}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'monospace' }}>
                                    {formatTime(r.timeMs)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{
                          textAlign: 'center',
                          padding: 24,
                          color: '#94a3b8',
                          fontSize: 14
                        }}>
                          {group.match ? 'Match en cours — résultats bientôt disponibles' : 'Match non encore lancé'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Ranking Tab */}
      {activeTab === 'ranking' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {overallRanking.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
              <h3 style={{ color: '#374151', marginBottom: 8 }}>Aucun résultat encore</h3>
              <p style={{ color: '#6b7280' }}>
                Les résultats apparaîtront ici après les premiers matchs terminés.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#fff', width: 60 }}>Rang</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: '#fff' }}>Joueur</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Victoires</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Matchs</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Score total</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Paires</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {overallRanking.map((player, idx) => {
                  const isTop3 = idx < 3;
                  return (
                    <tr key={player.studentId} style={{
                      background: isTop3
                        ? (idx === 0 ? '#fffbeb' : idx === 1 ? '#f8fafc' : '#fdf4ff')
                        : (idx % 2 === 0 ? '#fff' : '#f8fafc'),
                      borderBottom: '1px solid #e2e8f0',
                      transition: 'background 0.2s'
                    }}>
                      <td style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontSize: isTop3 ? 24 : 16,
                        fontWeight: 700
                      }}>
                        {MEDAL_EMOJIS[idx] || player.rank}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        fontWeight: isTop3 ? 700 : 500,
                        color: '#1e293b',
                        fontSize: isTop3 ? 16 : 14
                      }}>
                        {player.name}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontWeight: 700,
                        color: player.matchesWon > 0 ? '#059669' : '#94a3b8',
                        fontSize: 16
                      }}>
                        {player.matchesWon}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#475569' }}>
                        {player.matchesPlayed}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontWeight: 700,
                        color: '#3b82f6',
                        fontSize: 16
                      }}>
                        {player.totalScore}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#475569' }}>
                        {player.totalPairs}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        color: player.totalErrors > 0 ? '#dc2626' : '#059669'
                      }}>
                        {player.totalErrors}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
