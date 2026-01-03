import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getBackendUrl } from '../../utils/subscription';
import './TrainingLobby.css';

const TrainingLobby = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { groups, config } = location.state || {};
  
  const [socket, setSocket] = useState(null);
  const [matches, setMatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLaunchMessage, setShowLaunchMessage] = useState(false);

  useEffect(() => {
    if (!groups || !config) {
      navigate('/teacher/training/create');
      return;
    }

    loadStudentDetails();
    initializeMatches();
  }, [groups, config]);

  // Cleanup socket au démontage du composant
  useEffect(() => {
    return () => {
      if (socket) {
        console.log('[TrainingLobby] Nettoyage socket');
        socket.disconnect();
      }
    };
  }, [socket]);

  const loadStudentDetails = async () => {
    try {
      const classId = localStorage.getItem('cc_class_id');
      const res = await fetch(`${getBackendUrl()}/api/tournament/classes/${classId}/students`);
      const data = await res.json();
      
      if (data.success) {
        setStudents(data.students || []);
      }
    } catch (err) {
      console.error('[TrainingLobby] Erreur chargement élèves:', err);
    } finally {
      setLoading(false);
    }
  };

  const initializeMatches = () => {
    const matchList = groups.map((group, idx) => ({
      id: `training_match_${Date.now()}_${idx}`,
      groupIndex: idx + 1,
      studentIds: group,
      status: 'waiting',
      config
    }));

    setMatches(matchList);
  };

  const getStudentById = (studentId) => {
    return students.find(s => s.id === studentId) || { 
      id: studentId, 
      full_name: 'Élève inconnu',
      avatar_url: null 
    };
  };

  const startAllMatches = async () => {
    // Éviter de créer plusieurs sockets
    if (socket) {
      console.log('[TrainingLobby] Socket déjà existant, réutilisation');
      return;
    }

    const s = io(getBackendUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true
    });

    // Écouter events AVANT d'émettre
    s.on('training:match-started', ({ matchId }) => {
      console.log(`[TrainingLobby] Match ${matchId} démarré`);
      setMatches(prev => prev.map(m => 
        m.id === matchId ? { ...m, status: 'playing' } : m
      ));
    });

    s.on('training:match-finished', ({ matchId, results }) => {
      console.log(`[TrainingLobby] Match ${matchId} terminé`, results);
      setMatches(prev => prev.map(m => 
        m.id === matchId ? { ...m, status: 'finished', results } : m
      ));
    });

    setSocket(s);

    for (const match of matches) {
      console.log(`[TrainingLobby] Démarrage match groupe ${match.groupIndex}...`);
      
      s.emit('training:create-match', {
        matchId: match.id,
        studentIds: match.studentIds,
        config: match.config,
        classId: localStorage.getItem('cc_class_id'),
        teacherId: localStorage.getItem('cc_user_id')
      });

      setMatches(prev => prev.map(m => 
        m.id === match.id ? { ...m, status: 'starting' } : m
      ));
    }

    setTimeout(() => {
      setShowLaunchMessage(true);
    }, 1000);
  };

  const allMatchesFinished = matches.every(m => m.status === 'finished');

  const goToResults = () => {
    navigate('/teacher/training/results', { state: { matches, config } });
  };

  if (loading) {
    return (
      <div className="training-lobby-container">
        <div className="loading">Chargement...</div>
      </div>
    );
  }

  if (!groups || !config) {
    return (
      <div className="training-lobby-container">
        <div className="error">Configuration manquante</div>
        <button onClick={() => navigate('/teacher/training/create')}>Retour</button>
      </div>
    );
  }

  return (
    <div className="training-lobby-container">
      <div className="training-lobby-header">
        <button className="back-button" onClick={() => navigate('/teacher')}>
          ← Retour
        </button>
        <h1>📚 Lobby - {config.sessionName}</h1>
      </div>

      <div className="session-info-card">
        <div className="info-row">
          <span className="label">Groupes:</span>
          <span className="value">{matches.length} groupe(s) de 4</span>
        </div>
        <div className="info-row">
          <span className="label">Manches:</span>
          <span className="value">{config.rounds}</span>
        </div>
        <div className="info-row">
          <span className="label">Durée par manche:</span>
          <span className="value">{config.durationPerRound}s</span>
        </div>
        <div className="info-row">
          <span className="label">Niveau:</span>
          <span className="value">{config.level}</span>
        </div>
      </div>

      <div className="matches-grid">
        {matches.map((match) => (
          <div key={match.id} className={`match-card ${match.status}`}>
            <div className="match-header">
              <h3>Groupe {match.groupIndex}</h3>
              <span className={`status-badge ${match.status}`}>
                {match.status === 'waiting' && '⏳ En attente'}
                {match.status === 'starting' && '🚀 Démarrage...'}
                {match.status === 'playing' && '🎮 En cours'}
                {match.status === 'finished' && '✅ Terminé'}
              </span>
            </div>

            <div className="match-students">
              {match.studentIds.map(studentId => {
                const student = getStudentById(studentId);
                return (
                  <div key={studentId} className="student-item">
                    <div className="student-avatar">
                      {student.avatar_url ? (
                        <img src={student.avatar_url} alt={student.full_name} />
                      ) : (
                        <div className="avatar-placeholder">
                          {student.full_name?.charAt(0) || '?'}
                        </div>
                      )}
                    </div>
                    <span className="student-name">{student.full_name}</span>
                  </div>
                );
              })}
            </div>

            {match.status === 'finished' && match.results && (
              <div className="match-results">
                <div className="result-header">Résultats:</div>
                {match.results.slice(0, 3).map((result, idx) => (
                  <div key={idx} className="result-item">
                    <span className="position">{idx + 1}.</span>
                    <span className="name">{getStudentById(result.studentId).full_name}</span>
                    <span className="score">{result.score} pts</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {showLaunchMessage && (
        <div className="launch-message">
          <div className="message-content">
            <span className="icon">🚀</span>
            <div>
              <strong>Matchs lancés avec succès !</strong>
              <p>Les élèves peuvent maintenant rejoindre via leurs notifications.</p>
            </div>
            <button 
              className="close-message" 
              onClick={() => setShowLaunchMessage(false)}
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="lobby-actions">
        {matches.some(m => m.status === 'waiting') && (
          <button className="start-button" onClick={startAllMatches}>
            🚀 DÉMARRER TOUS LES MATCHS
          </button>
        )}

        {allMatchesFinished && (
          <button className="results-button" onClick={goToResults}>
            📊 VOIR RÉSULTATS COMPLETS
          </button>
        )}
      </div>

      <div className="instructions">
        <h3>Instructions:</h3>
        <ol>
          <li>Cliquez sur "DÉMARRER TOUS LES MATCHS"</li>
          <li>Les élèves recevront une invitation sur leur compte</li>
          <li>Ils rejoignent via la notification en haut à droite</li>
          <li>Le match démarre automatiquement quand 4 joueurs sont connectés</li>
        </ol>
      </div>
    </div>
  );
};

export default TrainingLobby;
