import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../../utils/subscription';
import { getAuthHeaders } from '../../utils/apiHelpers';
import './RectoratDashboard.css';

const PHASE_ICONS = { 1: '🏫', 2: '🏫', 3: '🏛️', 4: '🏆' };
const PHASE_NAMES = {
  1: 'CRAZY WINNER CLASSE',
  2: 'CRAZY WINNER ÉCOLE',
  3: 'CRAZY WINNER CIRCONSCRIPTION',
  4: 'CRAZY WINNER ACADÉMIQUE'
};

const RectoratDashboard = () => {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [supervisorData, setSupervisorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('phases');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedTimeline, setExpandedTimeline] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadSupervisorData = useCallback(async (tournamentId) => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/tournament/${tournamentId}/supervisor`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setSupervisorData(data);
      }
    } catch (err) {
      console.error('[Rectorat] Erreur chargement supervisor:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedTournamentId) {
      loadSupervisorData(selectedTournamentId);
    }
  }, [selectedTournamentId, loadSupervisorData]);

  useEffect(() => {
    if (!autoRefresh || !selectedTournamentId) return;
    const interval = setInterval(() => loadSupervisorData(selectedTournamentId), 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedTournamentId, loadSupervisorData]);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getBackendUrl()}/api/tournament/list`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setTournaments(data.tournaments || []);
        if (data.tournaments && data.tournaments.length > 0) {
          setSelectedTournamentId(data.tournaments[0].id);
        }
      }
    } catch (err) {
      console.error('[Rectorat] Erreur chargement tournois:', err);
    } finally {
      setLoading(false);
    }
  };

  const closePhase = async (phaseId) => {
    if (!window.confirm('Voulez-vous vraiment clôturer cette phase ?\nCela passera automatiquement les gagnants à la phase suivante.')) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/tournament/phases/${phaseId}/close`, { method: 'PATCH', headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        alert(`Phase clôturée! ${data.qualifiedCount} gagnant(s) qualifié(s).`);
        loadSupervisorData(selectedTournamentId);
      } else {
        alert(`Erreur: ${data.error}`);
      }
    } catch (err) {
      console.error('[Rectorat] Erreur clôture:', err);
      alert('Erreur lors de la clôture de la phase');
    }
  };

  const activatePhase = async (phaseId) => {
    if (!window.confirm('Activer cette phase ?')) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/tournament/phases/${phaseId}/activate`, { method: 'PATCH', headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        alert('Phase activée!');
        loadSupervisorData(selectedTournamentId);
      } else {
        alert(`Erreur: ${data.error}`);
      }
    } catch (err) {
      console.error('[Rectorat] Erreur activation:', err);
    }
  };

  const exportRanking = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/tournament/${selectedTournamentId}/ranking/pdf`, { headers: getAuthHeaders() });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `classement_tournoi.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('[Rectorat] Erreur export PDF:', err);
      alert('Erreur lors de l\'export');
    }
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const toggleTimelineItem = (idx) => {
    setExpandedTimeline(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatTime = (ms) => {
    if (!ms) return '—';
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
  };

  // ========== RENDER ==========

  if (loading) {
    return <div className="rectorat-dashboard-container"><div className="loading">Chargement des tournois...</div></div>;
  }

  if (tournaments.length === 0) {
    return (
      <div className="rectorat-dashboard-container">
        <div className="empty-state">
          <h2>Aucun tournoi actif</h2>
          <p>Créez un tournoi ou lancez une simulation pour commencer</p>
          <a href="/tournament-simulator.html" target="_blank" rel="noopener noreferrer" style={{display:'inline-block',padding:'15px 40px',background:'linear-gradient(135deg, #7c3aed, #6d28d9)',color:'white',borderRadius:'10px',textDecoration:'none',fontWeight:600,fontSize:'1.1rem'}}>
            🏆 Lancer le Simulateur
          </a>
        </div>
      </div>
    );
  }

  const stats = supervisorData?.stats || {};
  const phases = supervisorData?.phases || [];
  const timeline = supervisorData?.timeline || [];

  return (
    <div className="rectorat-dashboard-container">
      {/* HEADER */}
      <div className="rectorat-header">
        <div className="header-left">
          <h1>🏛️ Dashboard Superviseur</h1>
          <p>Vue globale du tournoi — Rectorat</p>
        </div>
        <div className="header-actions">
          <label className="auto-refresh-toggle">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            <span>Auto-refresh 10s</span>
          </label>
          <a href="/tournament-simulator.html" target="_blank" rel="noopener noreferrer" className="btn-simulator" style={{padding:'8px 16px',borderRadius:'8px',background:'#7c3aed',color:'white',textDecoration:'none',fontWeight:600,fontSize:'0.85rem'}}>
            🏆 Simulateur
          </a>
          <a href="/bot-tester.html" target="_blank" rel="noopener noreferrer" className="btn-bots" style={{padding:'8px 16px',borderRadius:'8px',background:'#0d6a7a',color:'white',textDecoration:'none',fontWeight:600,fontSize:'0.85rem'}}>
            🤖 Robots
          </a>
          <button className="btn-secondary" onClick={() => navigate('/admin')}>← Admin</button>
        </div>
      </div>

      {/* TOURNAMENT SELECTOR */}
      <div className="tournament-selector">
        <label>Tournoi:</label>
        <select value={selectedTournamentId || ''} onChange={(e) => setSelectedTournamentId(e.target.value)}>
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
          ))}
        </select>
        <button className="export-button" onClick={exportRanking}>📥 Export PDF</button>
        <button className="btn-refresh" onClick={() => loadSupervisorData(selectedTournamentId)}>🔄 Actualiser</button>
      </div>

      {/* GLOBAL STATS */}
      <div className="stats-grid">
        <div className="stat-card stat-phases">
          <div className="stat-card-icon">📊</div>
          <div className="stat-card-value">{stats.finishedPhases || 0}/{stats.totalPhases || 0}</div>
          <div className="stat-card-label">Phases terminées</div>
        </div>
        <div className="stat-card stat-groups">
          <div className="stat-card-icon">👥</div>
          <div className="stat-card-value">{stats.totalGroups || 0}</div>
          <div className="stat-card-label">Groupes</div>
        </div>
        <div className="stat-card stat-matches">
          <div className="stat-card-icon">⚔️</div>
          <div className="stat-card-value">{stats.finishedMatches || 0}/{stats.totalMatches || 0}</div>
          <div className="stat-card-label">Matchs terminés</div>
        </div>
        <div className="stat-card stat-players">
          <div className="stat-card-icon">🎮</div>
          <div className="stat-card-value">{stats.totalPlayers || 0}</div>
          <div className="stat-card-label">Joueurs</div>
        </div>
        <div className="stat-card stat-playing">
          <div className="stat-card-icon">🔴</div>
          <div className="stat-card-value">{stats.playingMatches || 0}</div>
          <div className="stat-card-label">Matchs en cours</div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="tab-nav">
        <button className={`tab-btn ${activeTab === 'phases' ? 'active' : ''}`} onClick={() => setActiveTab('phases')}>
          📊 Phases & Groupes
        </button>
        <button className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>
          🔄 Replay Timeline ({timeline.length})
        </button>
      </div>

      {/* TAB: PHASES & GROUPS */}
      {activeTab === 'phases' && (
        <div className="phases-section">
          {phases.length === 0 ? (
            <div className="no-phases">Aucune phase créée pour ce tournoi</div>
          ) : (
            <div className="phases-grid">
              {phases.map(phase => {
                const progress = phase.totalGroups > 0 ? Math.round((phase.finishedGroups / phase.totalGroups) * 100) : 0;
                const statusBadge = phase.status === 'finished' ? { label: 'Terminée', color: 'green' }
                  : phase.status === 'active' ? { label: 'En cours', color: 'blue' }
                  : { label: 'En attente', color: 'gray' };

                return (
                  <div key={phase.id} className={`phase-card ${phase.status}`}>
                    <div className="phase-header">
                      <h3>{PHASE_ICONS[phase.level] || '📌'} {phase.name || PHASE_NAMES[phase.level]}</h3>
                      <span className={`phase-badge ${statusBadge.color}`}>{statusBadge.label}</span>
                    </div>

                    <div className="phase-stats">
                      <div className="stat"><span className="stat-label">Groupes</span><span className="stat-value">{phase.totalGroups}</span></div>
                      <div className="stat"><span className="stat-label">Terminés</span><span className="stat-value">{phase.finishedGroups}/{phase.totalGroups}</span></div>
                      <div className="stat"><span className="stat-label">Gagnants</span><span className="stat-value">{phase.winnersCount}</span></div>
                    </div>

                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                    </div>

                    {/* GROUPS DETAIL */}
                    <div className="groups-detail">
                      {(phase.groups || []).map(group => (
                        <div key={group.id} className={`group-row ${group.status}`} onClick={() => toggleGroup(group.id)}>
                          <div className="group-row-header">
                            <span className={`group-status-dot ${group.status}`}></span>
                            <span className="group-name">{group.name}</span>
                            <span className="group-players">{group.studentIds?.length || 0} joueurs</span>
                            {group.winnerId && <span className="group-winner">🏆 Gagnant</span>}
                            {group.match?.roomCode && <span className="group-code">Code: {group.match.roomCode}</span>}
                            <span className="group-expand">{expandedGroups[group.id] ? '▼' : '▶'}</span>
                          </div>

                          {expandedGroups[group.id] && group.match && (
                            <div className="group-match-detail" onClick={(e) => e.stopPropagation()}>
                              <div className="match-info-row">
                                <span>Match: {group.match.status}</span>
                                {group.match.finishedAt && <span>Terminé: {formatDate(group.match.finishedAt)}</span>}
                              </div>
                              {group.match.results && group.match.results.length > 0 && (
                                <table className="results-table">
                                  <thead>
                                    <tr><th>#</th><th>Joueur</th><th>Score</th><th>Paires</th><th>Erreurs</th><th>Temps</th></tr>
                                  </thead>
                                  <tbody>
                                    {group.match.results.map((r, i) => (
                                      <tr key={i} className={r.position === 1 ? 'winner-row' : ''}>
                                        <td>{r.position === 1 ? '🏆' : `#${r.position}`}</td>
                                        <td>{r.studentId?.slice(0, 16)}</td>
                                        <td className="score-cell">{r.score}</td>
                                        <td>{r.pairs}</td>
                                        <td>{r.errors}</td>
                                        <td>{formatTime(r.timeMs)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="phase-actions">
                      {phase.status === 'active' && progress === 100 && (
                        <button className="btn-close-phase" onClick={() => closePhase(phase.id)}>🔒 Clôturer Phase</button>
                      )}
                      {phase.status === 'pending' && (
                        <button className="btn-activate" onClick={() => activatePhase(phase.id)}>▶️ Activer</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: REPLAY TIMELINE */}
      {activeTab === 'timeline' && (
        <div className="timeline-section">
          <h2>🔄 Replay — Timeline Chronologique</h2>
          <p className="timeline-subtitle">Historique complet de tous les événements du tournoi</p>

          {timeline.length === 0 ? (
            <div className="no-phases">Aucun événement enregistré</div>
          ) : (
            <div className="timeline-list">
              {timeline.map((event, idx) => {
                const isPhaseEvent = event.type === 'phase_started' || event.type === 'phase_finished';
                const phaseColor = { 1: '#3b82f6', 2: '#8b5cf6', 3: '#f59e0b', 4: '#ef4444' }[event.phaseLevel] || '#6b7280';

                return (
                  <div key={idx} className={`timeline-item ${event.type}`} onClick={() => !isPhaseEvent && toggleTimelineItem(idx)}>
                    <div className="timeline-dot" style={{ background: phaseColor }}></div>
                    <div className="timeline-line"></div>
                    <div className="timeline-content">
                      <div className="timeline-time">{formatDate(event.timestamp)}</div>

                      {event.type === 'phase_started' && (
                        <div className="timeline-event phase-event">
                          <span className="timeline-icon">🚀</span>
                          <span>Phase {event.phaseLevel} démarrée — <strong>{event.phaseName}</strong></span>
                        </div>
                      )}

                      {event.type === 'phase_finished' && (
                        <div className="timeline-event phase-event">
                          <span className="timeline-icon">🔒</span>
                          <span>Phase {event.phaseLevel} terminée — <strong>{event.phaseName}</strong></span>
                        </div>
                      )}

                      {event.type === 'match_finished' && (
                        <>
                          <div className="timeline-event match-event">
                            <span className="timeline-phase-tag" style={{ background: phaseColor }}>P{event.phaseLevel}</span>
                            <span className="timeline-icon">⚔️</span>
                            <span><strong>{event.groupName}</strong> — {event.playerCount} joueurs</span>
                            {event.winnerId && <span className="timeline-winner">🏆 Score: {event.winnerScore}</span>}
                            <span className="timeline-expand">{expandedTimeline[idx] ? '▼' : '▶'}</span>
                          </div>

                          {expandedTimeline[idx] && event.results && (
                            <div className="timeline-results">
                              <table className="results-table compact">
                                <thead>
                                  <tr><th>#</th><th>Joueur</th><th>Score</th><th>Paires</th><th>Erreurs</th><th>Temps</th></tr>
                                </thead>
                                <tbody>
                                  {event.results.map((r, i) => (
                                    <tr key={i} className={r.position === 1 ? 'winner-row' : ''}>
                                      <td>{r.position === 1 ? '🏆' : `#${r.position}`}</td>
                                      <td>{r.studentId?.slice(0, 16)}</td>
                                      <td className="score-cell">{r.score}</td>
                                      <td>{r.pairs}</td>
                                      <td>{r.errors}</td>
                                      <td>{formatTime(r.timeMs)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HELP */}
      <div className="help-section">
        <h3>ℹ️ Aide</h3>
        <ul>
          <li><strong>Phases & Groupes:</strong> Visualisez chaque phase, cliquez sur un groupe pour voir les résultats détaillés du match</li>
          <li><strong>Replay Timeline:</strong> Revivez chronologiquement tous les événements du tournoi</li>
          <li><strong>Clôturer Phase:</strong> Quand tous les groupes sont terminés (100%), clôture et qualifie les gagnants</li>
          <li><strong>Auto-refresh:</strong> Activez pour suivre les matchs en temps réel (10s)</li>
        </ul>
      </div>
    </div>
  );
};

export default RectoratDashboard;
