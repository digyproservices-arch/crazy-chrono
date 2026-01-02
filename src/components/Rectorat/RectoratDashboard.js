import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../../utils/subscription';
import './RectoratDashboard.css';

const RectoratDashboard = () => {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [phases, setPhases] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    if (selectedTournament) {
      loadPhases(selectedTournament.id);
    }
  }, [selectedTournament]);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getBackendUrl()}/api/tournament/list`);
      const data = await res.json();

      if (data.success) {
        setTournaments(data.tournaments || []);
        if (data.tournaments && data.tournaments.length > 0) {
          setSelectedTournament(data.tournaments[0]);
        }
      }
    } catch (err) {
      console.error('[Rectorat] Erreur chargement tournois:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPhases = async (tournamentId) => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/tournament/${tournamentId}/phases`);
      const data = await res.json();

      if (data.success) {
        setPhases(data.phases || []);
      }
    } catch (err) {
      console.error('[Rectorat] Erreur chargement phases:', err);
    }
  };

  const closePhase = async (phaseId) => {
    const confirm = window.confirm(
      'Voulez-vous vraiment clôturer cette phase ?\n\n' +
      'Cela passera automatiquement les gagnants à la phase suivante.'
    );

    if (!confirm) return;

    try {
      const res = await fetch(`${getBackendUrl()}/api/tournament/phases/${phaseId}/close`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();

      if (data.success) {
        alert(`Phase clôturée avec succès!\n${data.qualifiedCount} gagnant(s) qualifié(s) pour la phase suivante.`);
        loadPhases(selectedTournament.id);
      } else {
        alert(`Erreur: ${data.error}`);
      }
    } catch (err) {
      console.error('[Rectorat] Erreur clôture phase:', err);
      alert('Erreur lors de la clôture de la phase');
    }
  };

  const activateNextPhase = async (phaseId) => {
    const confirm = window.confirm(
      'Activer la phase suivante ?\n\n' +
      'Les gagnants de la phase actuelle pourront commencer leurs matchs.'
    );

    if (!confirm) return;

    try {
      const res = await fetch(`${getBackendUrl()}/api/tournament/phases/${phaseId}/activate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();

      if (data.success) {
        alert('Phase suivante activée avec succès!');
        loadPhases(selectedTournament.id);
      } else {
        alert(`Erreur: ${data.error}`);
      }
    } catch (err) {
      console.error('[Rectorat] Erreur activation phase:', err);
      alert('Erreur lors de l\'activation de la phase');
    }
  };

  const exportRanking = async (tournamentId) => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/tournament/${tournamentId}/ranking/pdf`);
      const blob = await res.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `classement_tournoi_${tournamentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert('Classement téléchargé avec succès!');
    } catch (err) {
      console.error('[Rectorat] Erreur export PDF:', err);
      alert('Erreur lors de l\'export du classement');
    }
  };

  const getPhaseStatusBadge = (phase) => {
    if (phase.status === 'pending') return { label: 'En attente', color: 'gray' };
    if (phase.status === 'active') return { label: 'En cours', color: 'blue' };
    if (phase.status === 'finished') return { label: 'Terminée', color: 'green' };
    return { label: phase.status, color: 'gray' };
  };

  const getPhaseName = (level) => {
    const names = {
      1: 'CRAZY WINNER CLASSE',
      2: 'CRAZY WINNER ÉCOLE',
      3: 'CRAZY WINNER CIRCONSCRIPTION',
      4: 'CRAZY WINNER ACADÉMIQUE'
    };
    return names[level] || `Phase ${level}`;
  };

  if (loading) {
    return (
      <div className="rectorat-dashboard-container">
        <div className="loading">Chargement des tournois...</div>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div className="rectorat-dashboard-container">
        <div className="empty-state">
          <h2>Aucun tournoi actif</h2>
          <p>Créez un tournoi pour commencer</p>
          <button onClick={() => navigate('/admin/tournament/create')}>
            Créer un tournoi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rectorat-dashboard-container">
      <div className="rectorat-header">
        <div className="header-left">
          <h1>🏛️ Tableau de Bord Rectorat</h1>
          <p>Gestion des phases tournois officiels</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => navigate('/admin')}>
            ← Retour Admin
          </button>
        </div>
      </div>

      <div className="tournament-selector">
        <label>Tournoi actif:</label>
        <select
          value={selectedTournament?.id || ''}
          onChange={(e) => {
            const t = tournaments.find(t => t.id === e.target.value);
            setSelectedTournament(t);
          }}
        >
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.status})
            </option>
          ))}
        </select>
        {selectedTournament && (
          <button
            className="export-button"
            onClick={() => exportRanking(selectedTournament.id)}
          >
            📥 Exporter Classement PDF
          </button>
        )}
      </div>

      {selectedTournament && (
        <div className="tournament-details">
          <div className="detail-card">
            <div className="detail-label">Nom:</div>
            <div className="detail-value">{selectedTournament.name}</div>
          </div>
          <div className="detail-card">
            <div className="detail-label">Statut:</div>
            <div className="detail-value">{selectedTournament.status}</div>
          </div>
          <div className="detail-card">
            <div className="detail-label">Phases:</div>
            <div className="detail-value">{phases.length} phases</div>
          </div>
        </div>
      )}

      <div className="phases-section">
        <h2>📊 Phases du Tournoi</h2>
        
        {phases.length === 0 ? (
          <div className="no-phases">
            Aucune phase créée pour ce tournoi
          </div>
        ) : (
          <div className="phases-grid">
            {phases.map(phase => {
              const statusBadge = getPhaseStatusBadge(phase);
              const completedGroups = phase.groups?.filter(g => g.status === 'finished').length || 0;
              const totalGroups = phase.groups?.length || 0;
              const progress = totalGroups > 0 ? Math.round((completedGroups / totalGroups) * 100) : 0;

              return (
                <div key={phase.id} className={`phase-card ${phase.status}`}>
                  <div className="phase-header">
                    <h3>{getPhaseName(phase.level)}</h3>
                    <span className={`phase-badge ${statusBadge.color}`}>
                      {statusBadge.label}
                    </span>
                  </div>

                  <div className="phase-stats">
                    <div className="stat">
                      <span className="stat-label">Groupes:</span>
                      <span className="stat-value">{totalGroups}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Terminés:</span>
                      <span className="stat-value">{completedGroups}/{totalGroups}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Progression:</span>
                      <span className="stat-value">{progress}%</span>
                    </div>
                  </div>

                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>

                  <div className="phase-actions">
                    {phase.status === 'active' && progress === 100 && (
                      <button
                        className="btn-close-phase"
                        onClick={() => closePhase(phase.id)}
                      >
                        🔒 Clôturer Phase
                      </button>
                    )}

                    {phase.status === 'finished' && phase.next_phase_id && (
                      <button
                        className="btn-activate-next"
                        onClick={() => activateNextPhase(phase.next_phase_id)}
                      >
                        🚀 Activer Phase Suivante
                      </button>
                    )}

                    {phase.status === 'pending' && (
                      <button
                        className="btn-activate"
                        onClick={() => activateNextPhase(phase.id)}
                      >
                        ▶️ Activer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="help-section">
        <h3>ℹ️ Aide</h3>
        <ul>
          <li><strong>Phase En cours:</strong> Les professeurs créent des matchs classe</li>
          <li><strong>Clôturer Phase:</strong> Quand tous les groupes sont terminés (100%)</li>
          <li><strong>Activer Phase Suivante:</strong> Lance la phase suivante pour les gagnants</li>
          <li><strong>Export PDF:</strong> Télécharge le classement complet du tournoi</li>
        </ul>
      </div>
    </div>
  );
};

export default RectoratDashboard;
