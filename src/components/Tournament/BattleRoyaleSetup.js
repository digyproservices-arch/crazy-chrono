// ==========================================
// COMPOSANT: CONFIGURATION BATTLE ROYALE (Groupes de 4)
// Interface enseignant pour créer des groupes et lancer les matchs
// ==========================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

export default function BattleRoyaleSetup() {
  const navigate = useNavigate();
  
  // État
  const [students, setStudents] = useState([]); // Liste des élèves de la classe
  const [groups, setGroups] = useState([]); // Groupes de 4 créés
  const [selectedStudents, setSelectedStudents] = useState([]); // Élèves sélectionnés pour former un groupe
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState(null);
  
  // Charger les données au montage
  useEffect(() => {
    loadTournamentData();
  }, []);
  
  const loadTournamentData = async () => {
    try {
      setLoading(true);
      
      const backendUrl = getBackendUrl();
      
      // 1. Récupérer le tournoi actif
      const tournamentRes = await fetch(`${backendUrl}/api/tournament/tournaments/tour_2025_gp`);
      const tournamentData = await tournamentRes.json();
      setTournament(tournamentData.tournament);
      
      // 2. Récupérer les élèves de la classe (depuis config ou localStorage)
      const classConfig = JSON.parse(localStorage.getItem('cc_session_cfg') || '{}');
      const classId = classConfig.classId || 'ce1_a_lamentin'; // Exemple
      
      // Fetch students from API
      const studentsRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/students`);
      const studentsData = await studentsRes.json();
      setStudents(studentsData.students || []);
      
      // 3. Récupérer les groupes déjà créés pour cette classe
      const groupsRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/groups`);
      const groupsData = await groupsRes.json();
      setGroups(groupsData.groups || []);
      
    } catch (error) {
      console.error('[BattleRoyale] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId);
      } else {
        if (prev.length < 4) {
          return [...prev, studentId];
        }
        return prev; // Max 4 élèves
      }
    });
  };
  
  const createGroup = async () => {
    if (selectedStudents.length !== 4) {
      alert('Vous devez sélectionner exactement 4 élèves pour former un groupe.');
      return;
    }
    
    if (!groupName.trim()) {
      alert('Veuillez donner un nom au groupe.');
      return;
    }
    
    try {
      const classConfig = JSON.parse(localStorage.getItem('cc_session_cfg') || '{}');
      const classId = classConfig.classId || 'ce1_a_lamentin';
      const backendUrl = getBackendUrl();
      
      const res = await fetch(`${backendUrl}/api/tournament/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tournament.id,
          phaseLevel: tournament.current_phase,
          classId,
          name: groupName,
          studentIds: selectedStudents
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        alert(`Groupe "${groupName}" créé avec succès !`);
        setSelectedStudents([]);
        setGroupName('');
        loadTournamentData(); // Recharger
      } else {
        alert('Erreur lors de la création du groupe: ' + data.error);
      }
    } catch (error) {
      console.error('[BattleRoyale] Error creating group:', error);
      alert('Erreur réseau lors de la création du groupe.');
    }
  };
  
  const launchMatch = async (group) => {
    try {
      const classConfig = JSON.parse(localStorage.getItem('cc_session_cfg') || '{}');
      const backendUrl = getBackendUrl();
      
      // Créer le match
      const res = await fetch(`${backendUrl}/api/tournament/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tournament.id,
          phaseId: `phase_${tournament.current_phase}_${tournament.id}`,
          groupId: group.id,
          config: {
            rounds: 3,
            duration: 60,
            classes: classConfig.classes || ['CE1'],
            themes: classConfig.themes || []
          }
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Afficher le code de salle
        alert(`Match créé ! Code de salle: ${data.roomCode}\n\nLes 4 élèves doivent rejoindre avec ce code.`);
        
        // Stocker l'info du match pour le mode Battle Royale
        localStorage.setItem('cc_battle_royale_match', JSON.stringify({
          matchId: data.matchId,
          roomCode: data.roomCode,
          groupId: group.id,
          studentIds: JSON.parse(group.student_ids)
        }));
        
        // Rediriger vers la salle d'attente Battle Royale
        navigate(`/battle-royale/lobby/${data.roomCode}`);
      } else {
        alert('Erreur lors de la création du match: ' + data.error);
      }
    } catch (error) {
      console.error('[BattleRoyale] Error launching match:', error);
      alert('Erreur réseau lors du lancement du match.');
    }
  };
  
  const deleteGroup = async (groupId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce groupe ?')) return;
    
    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/tournament/groups/${groupId}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      
      if (data.success) {
        alert('Groupe supprimé.');
        loadTournamentData();
      }
    } catch (error) {
      console.error('[BattleRoyale] Error deleting group:', error);
    }
  };
  
  // Élèves déjà dans des groupes
  const studentsInGroups = new Set();
  groups.forEach(g => {
    try {
      const ids = JSON.parse(g.student_ids);
      ids.forEach(id => studentsInGroups.add(id));
    } catch {}
  });
  
  const availableStudents = students.filter(s => !studentsInGroups.has(s.id));
  
  if (loading) {
    return (
      <div style={{ maxWidth: 980, margin: '24px auto', padding: '0 16px', textAlign: 'center' }}>
        <p>Chargement...</p>
      </div>
    );
  }
  
  return (
    <div style={{ maxWidth: 980, margin: '24px auto', padding: '0 16px' }}>
      <h2>🏆 Configuration Battle Royale - Groupes de 4</h2>
      
      {tournament && (
        <div style={{ padding: '12px 16px', background: '#eff6ff', borderRadius: 8, marginBottom: 16, border: '1px solid #3b82f6' }}>
          <strong>Tournoi:</strong> {tournament.name}<br />
          <strong>Phase actuelle:</strong> Phase {tournament.current_phase} / 4
        </div>
      )}
      
      {/* Formulaire création groupe */}
      <section style={{ marginBottom: 24, padding: 16, background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
        <h3>Créer un nouveau groupe</h3>
        
        <div style={{ marginBottom: 12 }}>
          <label>Nom du groupe</label>
          <input 
            type="text" 
            value={groupName} 
            onChange={e => setGroupName(e.target.value)} 
            placeholder="ex: Les Champions"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, marginTop: 4 }}
          />
        </div>
        
        <div style={{ marginBottom: 12 }}>
          <label>Sélectionner 4 élèves ({selectedStudents.length}/4)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 8 }}>
            {availableStudents.map(s => (
              <label 
                key={s.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8, 
                  padding: '8px 12px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: 8, 
                  background: selectedStudents.includes(s.id) ? '#10b981' : '#fff',
                  color: selectedStudents.includes(s.id) ? '#fff' : '#111',
                  cursor: 'pointer'
                }}
              >
                <input 
                  type="checkbox" 
                  checked={selectedStudents.includes(s.id)} 
                  onChange={() => toggleStudentSelection(s.id)}
                  disabled={!selectedStudents.includes(s.id) && selectedStudents.length >= 4}
                />
                <span>{s.full_name || s.first_name}</span>
              </label>
            ))}
          </div>
          {availableStudents.length === 0 && (
            <p style={{ color: '#6b7280', marginTop: 8 }}>Tous les élèves sont déjà dans des groupes.</p>
          )}
        </div>
        
        <button 
          onClick={createGroup}
          disabled={selectedStudents.length !== 4 || !groupName.trim()}
          style={{ 
            padding: '10px 20px', 
            borderRadius: 8, 
            border: '1px solid #10b981', 
            background: '#10b981', 
            color: '#fff', 
            fontWeight: 700,
            cursor: selectedStudents.length !== 4 || !groupName.trim() ? 'not-allowed' : 'pointer',
            opacity: selectedStudents.length !== 4 || !groupName.trim() ? 0.5 : 1
          }}
        >
          Créer le groupe
        </button>
      </section>
      
      {/* Liste des groupes créés */}
      <section>
        <h3>Groupes créés ({groups.length})</h3>
        
        {groups.length === 0 && (
          <p style={{ color: '#6b7280' }}>Aucun groupe créé pour le moment.</p>
        )}
        
        <div style={{ display: 'grid', gap: 12 }}>
          {groups.map(group => {
            const studentIds = JSON.parse(group.student_ids);
            const groupStudents = students.filter(s => studentIds.includes(s.id));
            
            return (
              <div 
                key={group.id} 
                style={{ 
                  padding: 16, 
                  border: '1px solid #e5e7eb', 
                  borderRadius: 12, 
                  background: '#fff' 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0 }}>{group.name}</h4>
                  <span 
                    style={{ 
                      padding: '4px 12px', 
                      borderRadius: 999, 
                      fontSize: 12, 
                      fontWeight: 700, 
                      background: group.status === 'finished' ? '#10b981' : group.status === 'playing' ? '#f59e0b' : '#6b7280',
                      color: '#fff'
                    }}
                  >
                    {group.status === 'finished' ? 'Terminé' : group.status === 'playing' ? 'En cours' : 'En attente'}
                  </span>
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <strong>Élèves:</strong>
                  <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                    {groupStudents.map(s => (
                      <li key={s.id}>{s.full_name || s.first_name}</li>
                    ))}
                  </ul>
                </div>
                
                {group.winner_id && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef3c7', borderRadius: 8 }}>
                    <strong>🏆 Gagnant:</strong> {groupStudents.find(s => s.id === group.winner_id)?.full_name}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: 8 }}>
                  {group.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => launchMatch(group)}
                        style={{ 
                          padding: '8px 16px', 
                          borderRadius: 8, 
                          border: '1px solid #3b82f6', 
                          background: '#3b82f6', 
                          color: '#fff', 
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        🚀 Lancer le match
                      </button>
                      <button 
                        onClick={() => deleteGroup(group.id)}
                        style={{ 
                          padding: '8px 16px', 
                          borderRadius: 8, 
                          border: '1px solid #ef4444', 
                          background: '#fff', 
                          color: '#ef4444',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Supprimer
                      </button>
                    </>
                  )}
                  {group.match_id && (
                    <button 
                      onClick={() => navigate(`/tournament/match/${group.match_id}/results`)}
                      style={{ 
                        padding: '8px 16px', 
                        borderRadius: 8, 
                        border: '1px solid #6b7280', 
                        background: '#fff', 
                        color: '#111',
                        cursor: 'pointer'
                      }}
                    >
                      📊 Voir résultats
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      
      <div style={{ marginTop: 24 }}>
        <button 
          onClick={() => navigate('/modes')}
          style={{ 
            padding: '10px 20px', 
            borderRadius: 8, 
            border: '1px solid #d1d5db', 
            background: '#fff',
            cursor: 'pointer'
          }}
        >
          ← Retour
        </button>
      </div>
    </div>
  );
}
