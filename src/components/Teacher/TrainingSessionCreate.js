import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../../utils/subscription';
import './TrainingSessionCreate.css';

const TrainingSessionCreate = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [config, setConfig] = useState({
    sessionName: 'Session Entraînement',
    rounds: 3,
    durationPerRound: 60,
    level: 'CE1'
  });

  useEffect(() => {
    loadStudentsWithLicenses();
  }, []);

  const loadStudentsWithLicenses = async () => {
    try {
      setLoading(true);
      const classId = localStorage.getItem('cc_class_id');
      
      if (!classId) {
        setError('Classe non trouvée');
        return;
      }

      const res = await fetch(`${getBackendUrl()}/api/tournament/classes/${classId}/students`);
      const data = await res.json();

      if (data.success) {
        setStudents(data.students || []);
      }
    } catch (err) {
      console.error('[TrainingCreate] Erreur chargement élèves:', err);
      setError('Erreur chargement élèves');
    } finally {
      setLoading(false);
    }
  };

  const toggleStudent = (studentId) => {
    setSelectedStudents(prev => 
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const createGroups = async () => {
    if (selectedStudents.length < 2) {
      alert('Sélectionnez au moins 2 élèves');
      return;
    }

    if (selectedStudents.length % 4 !== 0) {
      const confirm = window.confirm(
        `Vous avez sélectionné ${selectedStudents.length} élèves. ` +
        `Le dernier groupe aura ${selectedStudents.length % 4} élèves. Continuer ?`
      );
      if (!confirm) return;
    }

    const groups = [];
    for (let i = 0; i < selectedStudents.length; i += 4) {
      groups.push(selectedStudents.slice(i, i + 4));
    }

    console.log('[TrainingCreate] Groupes créés:', groups);
    console.log('[TrainingCreate] Config:', config);

    navigate('/teacher/training/lobby', {
      state: { groups, config }
    });
  };

  const licensedStudents = students.filter(s => s.licensed);
  const unlicensedStudents = students.filter(s => !s.licensed);

  if (loading) {
    return (
      <div className="training-create-container">
        <div className="loading">Chargement des élèves...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="training-create-container">
        <div className="error">{error}</div>
        <button onClick={() => navigate('/teacher')}>Retour</button>
      </div>
    );
  }

  return (
    <div className="training-create-container">
      <div className="training-create-header">
        <button className="back-button" onClick={() => navigate('/teacher')}>
          ← Retour
        </button>
        <h1>📚 Nouvelle Session d'Entraînement</h1>
      </div>

      <div className="training-create-content">
        <div className="section students-section">
          <h2>1️⃣ Sélectionner les élèves</h2>
          <p className="section-hint">
            Seuls les élèves avec licence active peuvent participer
          </p>

          {licensedStudents.length === 0 ? (
            <div className="no-students">
              Aucun élève avec licence active dans cette classe
            </div>
          ) : (
            <div className="students-grid">
              {licensedStudents.map(student => (
                <div
                  key={student.id}
                  className={`student-card ${selectedStudents.includes(student.id) ? 'selected' : ''}`}
                  onClick={() => toggleStudent(student.id)}
                >
                  <div className="student-avatar">
                    {student.avatar_url ? (
                      <img src={student.avatar_url} alt={student.full_name} />
                    ) : (
                      <div className="avatar-placeholder">
                        {student.full_name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                  <div className="student-info">
                    <div className="student-name">{student.full_name}</div>
                    <div className="student-license">✅ Licence valide</div>
                  </div>
                  {selectedStudents.includes(student.id) && (
                    <div className="selected-badge">✓</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {unlicensedStudents.length > 0 && (
            <div className="unlicensed-section">
              <h3>Élèves sans licence active ({unlicensedStudents.length})</h3>
              <div className="students-grid disabled">
                {unlicensedStudents.map(student => (
                  <div key={student.id} className="student-card disabled">
                    <div className="student-avatar">
                      <div className="avatar-placeholder">
                        {student.full_name?.charAt(0) || '?'}
                      </div>
                    </div>
                    <div className="student-info">
                      <div className="student-name">{student.full_name}</div>
                      <div className="student-license expired">❌ Licence expirée</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="selection-summary">
            <strong>{selectedStudents.length}</strong> élève(s) sélectionné(s)
            {selectedStudents.length > 0 && (
              <span> → {Math.ceil(selectedStudents.length / 4)} groupe(s) de 4</span>
            )}
          </div>
        </div>

        <div className="section config-section">
          <h2>2️⃣ Configuration</h2>

          <div className="config-form">
            <div className="form-group">
              <label>Nom de la session</label>
              <input
                type="text"
                value={config.sessionName}
                onChange={(e) => setConfig({ ...config, sessionName: e.target.value })}
                placeholder="Ex: Entraînement CE1-A"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Nombre de manches</label>
                <select
                  value={config.rounds}
                  onChange={(e) => setConfig({ ...config, rounds: parseInt(e.target.value) })}
                >
                  <option value="1">1 manche</option>
                  <option value="2">2 manches</option>
                  <option value="3">3 manches</option>
                  <option value="5">5 manches</option>
                </select>
              </div>

              <div className="form-group">
                <label>Durée par manche</label>
                <select
                  value={config.durationPerRound}
                  onChange={(e) => setConfig({ ...config, durationPerRound: parseInt(e.target.value) })}
                >
                  <option value="30">30 secondes</option>
                  <option value="60">60 secondes</option>
                  <option value="90">90 secondes</option>
                  <option value="120">120 secondes</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Niveau scolaire</label>
              <select
                value={config.level}
                onChange={(e) => setConfig({ ...config, level: e.target.value })}
              >
                <option value="CP">CP</option>
                <option value="CE1">CE1</option>
                <option value="CE2">CE2</option>
                <option value="CM1">CM1</option>
                <option value="CM2">CM2</option>
                <option value="6e">6ème</option>
                <option value="5e">5ème</option>
                <option value="4e">4ème</option>
                <option value="3e">3ème</option>
              </select>
            </div>
          </div>
        </div>

        <div className="actions">
          <button
            className="create-button"
            onClick={createGroups}
            disabled={selectedStudents.length < 2}
          >
            CRÉER GROUPES DE 4
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrainingSessionCreate;
