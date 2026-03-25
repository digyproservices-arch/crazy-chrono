// ==========================================
// COMPOSANT: CONFIGURATION BATTLE ROYALE (Groupes de 4)
// Interface enseignant pour créer des groupes et lancer les matchs
// ==========================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders } from '../../utils/apiHelpers';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

// Helper : Parser student_ids avec support multi-format
const parseStudentIds = (studentIds) => {
  try {
    if (Array.isArray(studentIds)) {
      return studentIds; // Déjà un array
    }
    if (typeof studentIds === 'string') {
      if (studentIds.startsWith('[')) {
        return JSON.parse(studentIds); // Format JSON array
      } else {
        return studentIds.split(',').map(id => id.trim()).filter(id => id); // Format string avec virgules
      }
    }
    return [];
  } catch (err) {
    console.error('[CrazyArena] Error parsing student_ids:', studentIds, err);
    return [];
  }
};

// Variable globale pour éviter les chargements multiples même si le composant se démonte/remonte
let globalLoadLock = false;
let globalLoadTimeout = null;

// Clés sessionStorage pour cache
const CACHE_KEY_TOURNAMENT = 'br_cache_tournament';
const CACHE_KEY_STUDENTS = 'br_cache_students';
const CACHE_KEY_GROUPS = 'br_cache_groups';

export default function CrazyArenaSetup() {
  const navigate = useNavigate();
  const loadedRef = useRef(false);
  
  // État
  const [students, setStudents] = useState([]); // Liste des élèves de la classe
  const [groups, setGroups] = useState([]); // Groupes de 4 créés
  const [selectedStudents, setSelectedStudents] = useState([]); // Élèves sélectionnés pour former un groupe
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState(null);
  const [checkedGroups, setCheckedGroups] = useState(new Set()); // Groupes cochés pour notif bulk
  const [bulkLoading, setBulkLoading] = useState(false);
  
  // Charger les données au montage (CACHE DÉSACTIVÉ pour stabilité)
  useEffect(() => {
    console.log('[CrazyArena] 🔵 useEffect montage - loadedRef:', loadedRef.current, 'globalLoadLock:', globalLoadLock);
    
    // ⚠️ CACHE TEMPORAIREMENT DÉSACTIVÉ pour résoudre erreur de parsing JSON
    // Vider tout cache existant au montage
    try {
      sessionStorage.removeItem(CACHE_KEY_TOURNAMENT);
      sessionStorage.removeItem(CACHE_KEY_STUDENTS);
      sessionStorage.removeItem(CACHE_KEY_GROUPS);
      console.log('[CrazyArena] 🗑️ Cache vidé (désactivé temporairement)');
    } catch (e) {
      console.log('[CrazyArena] ⚠️ Erreur vidage cache:', e);
    }
    
    // Protection double : useRef local + variable globale
    if (loadedRef.current || globalLoadLock) {
      console.log('[CrazyArena] 🚫 Chargement bloqué par lock');
      return;
    }
    
    loadedRef.current = true;
    globalLoadLock = true;
    
    // Réinitialiser le lock après 5 secondes pour permettre un refresh manuel
    if (globalLoadTimeout) clearTimeout(globalLoadTimeout);
    globalLoadTimeout = setTimeout(() => {
      globalLoadLock = false;
      console.log('[CrazyArena] 🔓 globalLoadLock libéré');
    }, 5000);
    
    loadTournamentData();
  }, []);
  
  const loadTournamentData = async () => {
    try {
      console.log('[CrazyArena] 🔄 Chargement des données...');
      setLoading(true);
      
      const backendUrl = getBackendUrl();
      console.log('[CrazyArena] 🌐 Backend URL:', backendUrl);
      
      // 1. Récupérer le tournoi actif
      const tournamentRes = await fetch(`${backendUrl}/api/tournament/tournaments/tour_2025_gp`, { headers: getAuthHeaders() });
      const tournamentData = await tournamentRes.json();
      console.log('[CrazyArena] 🏆 Tournament data:', tournamentData);
      setTournament(tournamentData.tournament);
      
      // 2. Récupérer la liste des élèves de la classe
      // ✅ FIX: Lire classId depuis URL params (rectorat dashboard) OU localStorage (prof)
      const urlParams = new URLSearchParams(window.location.search);
      const classId = urlParams.get('classId') || localStorage.getItem('cc_class_id');
      console.log('[CrazyArena] 📚 Class ID:', classId, '(source:', urlParams.get('classId') ? 'URL' : 'localStorage', ')');
      
      if (urlParams.get('classId')) {
        localStorage.setItem('cc_class_id', urlParams.get('classId'));
      }
      
      if (!classId) {
        console.error('[CrazyArena] ❌ classId non trouvé (ni URL ni localStorage)');
        throw new Error('Classe non trouvée. Veuillez vous reconnecter.');
      }
      
      const studentsRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/students`, { headers: getAuthHeaders() });
      const studentsData = await studentsRes.json();
      console.log('[CrazyArena] 👥 Students data:', studentsData);
      console.log('[CrazyArena] 👥 Students count:', studentsData.students?.length || 0);
      setStudents(studentsData.students || []);
      
      // 3. Récupérer les groupes déjà créés
      const groupsRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/groups`, { headers: getAuthHeaders() });
      const groupsData = await groupsRes.json();
      console.log('[CrazyArena] 👥 Groups data:', groupsData);
      console.log('[CrazyArena] 👥 Groups count:', groupsData.groups?.length || 0);
      setGroups(groupsData.groups || []);
      
      console.log('[CrazyArena] ✅ Chargement terminé!');
      console.log('[CrazyArena] 📊 État final - Students:', studentsData.students?.length, 'Groups:', groupsData.groups?.length);
      
      // ⚠️ CACHE DÉSACTIVÉ TEMPORAIREMENT - Ne pas sauvegarder pour éviter erreurs parsing
      console.log('[CrazyArena] ℹ️ Cache désactivé - données non sauvegardées');
    } catch (error) {
      console.error('[CrazyArena] ❌ Error loading data:', error);
    } finally {
      // IMPORTANT : setLoading(false) IMMÉDIAT sans setTimeout !
      setLoading(false);
      console.log('[CrazyArena] 🏁 Loading = false');
    }
  };
  
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId); // Désélectionner
      } else {
        if (prev.length < 4) {
          return [...prev, studentId];
        }
        return prev; // Max 4 élèves (modifiable 2-4)
      }
    });
  };
  
  const createGroup = async () => {
    if (selectedStudents.length < 2 || selectedStudents.length > 4) {
      alert('Vous devez sélectionner entre 2 et 4 élèves pour former un groupe.');
      return;
    }
    
    if (!groupName.trim()) {
      alert('Veuillez donner un nom au groupe.');
      return;
    }
    
    try {
      // ✅ FIX: Utiliser cc_class_id (identique à loadTournamentData)
      const classId = localStorage.getItem('cc_class_id');
      if (!classId) {
        alert('Erreur: Classe non trouvée. Veuillez vous reconnecter.');
        return;
      }
      const backendUrl = getBackendUrl();
      
      const res = await fetch(`${backendUrl}/api/tournament/groups`, {
        method: 'POST',
        headers: getAuthHeaders(),
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
      console.error('[CrazyArena] Error creating group:', error);
      alert('Erreur réseau lors de la création du groupe.');
    }
  };
  
  const toggleGroupCheck = (groupId) => {
    setCheckedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const selectAllPendingGroups = () => {
    const pending = groups.filter(g => g.status === 'pending' && !g.match_id);
    if (checkedGroups.size === pending.length) {
      setCheckedGroups(new Set());
    } else {
      setCheckedGroups(new Set(pending.map(g => g.id)));
    }
  };

  const bulkNotifyGroups = async () => {
    const toNotify = groups.filter(g => checkedGroups.has(g.id) && g.status === 'pending' && !g.match_id);
    if (toNotify.length === 0) return;
    if (!window.confirm(`Créer les salles et notifier les élèves pour ${toNotify.length} groupe(s) ?\n\nLes élèves devront se connecter avec leur code d'accès pour rejoindre la salle.`)) return;
    
    setBulkLoading(true);
    const results = [];
    for (const group of toNotify) {
      try {
        const result = await launchMatch(group, true);
        if (result) results.push(result);
      } catch (e) {
        console.error('[CrazyArena] Erreur bulk notify:', e);
      }
    }
    setBulkLoading(false);
    setCheckedGroups(new Set());
    
    if (results.length > 0) {
      const recap = results.map(r => `• ${r.groupName}: Code ${r.roomCode}`).join('\n');
      alert(`✅ ${results.length} salle(s) créée(s) !\n\n${recap}\n\nLes élèves doivent se connecter avec leur code d'accès et rejoindre la salle.`);
    }
    loadTournamentData();
  };

  const launchMatch = async (group, silent = false) => {
    try {
      // ✅ FIX: Utiliser cc_class_id (identique à loadTournamentData)
      const classId = localStorage.getItem('cc_class_id');
      if (!classId) {
        alert('Erreur: Classe non trouvée. Veuillez vous reconnecter.');
        return;
      }
      const backendUrl = getBackendUrl();
      
      // Mapper le numéro de phase vers l'ID réel dans Supabase
      const phaseNames = {
        1: 'phase_1_classe',
        2: 'phase_2_ecole',
        3: 'phase_3_circ',
        4: 'phase_4_acad'
      };
      const phaseId = phaseNames[tournament.current_phase] || 'phase_1_classe';
      
      // FORCER classes et themes en dur pour mode tournoi
      // Ne pas utiliser localStorage qui peut être vide ou mal configuré
      const matchConfig = {
        rounds: 3,
        duration: 60,
        classes: ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e'],
        themes: ['botanique', 'multiplication']
      };
      
      console.log('[CrazyArena] 🚀 Lancement match - Phase:', tournament.current_phase, '→ ID:', phaseId);
      console.log('[CrazyArena] 📋 Config utilisée:', matchConfig);
      
      // Créer le match
      const res = await fetch(`${backendUrl}/api/tournament/matches`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tournamentId: tournament.id,
          phaseId: phaseId,
          groupId: group.id,
          config: matchConfig
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        const playerCount = parseStudentIds(group.student_ids).length;
        
        if (silent) {
          return { groupName: group.name, roomCode: data.roomCode, matchId: data.matchId, playerCount };
        }
        
        alert(`✅ Salle créée !\n\nCode de salle: ${data.roomCode}\n\n📋 Les ${playerCount} élève(s) doivent se connecter avec leur code d'accès et rejoindre la salle.\n\nURL: https://app.crazy-chrono.com/crazy-arena/lobby/${data.roomCode}`);
        loadTournamentData();
        return { groupName: group.name, roomCode: data.roomCode, matchId: data.matchId, playerCount };
      } else {
        if (!silent) alert('Erreur lors de la création de la salle: ' + data.error);
        return null;
      }
    } catch (error) {
      console.error('[CrazyArena] Error launching match:', error);
      if (!silent) alert('Erreur réseau lors de la création de la salle.');
      return null;
    }
  };
  
  const deleteGroup = async (groupId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce groupe ?')) return;
    
    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/tournament/groups/${groupId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      
      const data = await res.json();
      
      if (data.success) {
        alert('Groupe supprimé.');
        loadTournamentData();
      }
    } catch (error) {
      console.error('[CrazyArena] Error deleting group:', error);
    }
  };
  
  // Élèves déjà dans des groupes (useMemo pour éviter recalcul à chaque render)
  const studentsInGroups = useMemo(() => {
    const inGroups = new Set();
    groups.forEach(g => {
      const ids = parseStudentIds(g.student_ids);
      ids.forEach(id => inGroups.add(id));
    });
    return inGroups;
  }, [groups]);
  
  const availableStudents = useMemo(() => {
    return students.filter(s => !studentsInGroups.has(s.id));
  }, [students, studentsInGroups]);
  
  // Log pour tracer les renders
  console.log('[CrazyArena] 🔄 RENDER - loading:', loading, 'students:', students.length, 'groups:', groups.length);
  
  if (loading) {
    console.log('[CrazyArena] 🕒 Affichage "Chargement..."');
    return (
      <div style={{ maxWidth: 980, margin: '24px auto', padding: '0 16px', textAlign: 'center' }}>
        <p>Chargement...</p>
      </div>
    );
  }
  
  console.log('[CrazyArena] ✅ Affichage de l\'UI complète');
  
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            🏆 Mode Tournoi - Crazy Arena
          </h1>
          <p style={{ fontSize: 16, color: '#666', marginBottom: 0 }}>
            Créez des groupes de 2 à 4 élèves et lancez des matchs compétitifs
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate('/crazy-arena/competition')}
            style={{
              padding: '14px 28px',
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(5, 150, 105, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(5, 150, 105, 0.3)';
            }}
          >
            <span style={{ fontSize: 20 }}>🏆</span>
            <span>Suivi Compétition</span>
          </button>
          <button
            onClick={() => navigate('/crazy-arena/manager')}
            style={{
              padding: '14px 28px',
              background: 'linear-gradient(135deg, #1AACBE 0%, #148A9C 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
            }}
          >
            <span style={{ fontSize: 20 }}>📊</span>
            <span>Gérer les matchs actifs</span>
          </button>
        </div>
      </div>
      
      {tournament && (
        <div style={{ padding: '12px 16px', background: '#f0fafb', borderRadius: 8, marginBottom: 16, border: '1px solid #1AACBE' }}>
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
          <label>Liste des élèves ({students.length} au total)</label>
          
          {availableStudents.length > 0 && (
            <div style={{ marginTop: 8, marginBottom: 8, padding: 8, background: '#dbeafe', borderRadius: 6 }}>
              <strong>✅ {availableStudents.length} élève(s) disponible(s)</strong> - Sélectionnez 2 à 4 élèves pour créer un groupe ({selectedStudents.length}/4)
            </div>
          )}
          
          {availableStudents.length === 0 && (
            <div style={{ marginTop: 8, marginBottom: 8, padding: 8, background: '#fef3c7', borderRadius: 6 }}>
              <strong>⚠️ Tous les élèves sont déjà dans des groupes</strong> - Supprimez un groupe pour libérer des élèves
            </div>
          )}
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 8 }}>
            {students.map(s => {
              const isInGroup = studentsInGroups.has(s.id);
              const isSelected = selectedStudents.includes(s.id);
              const isDisabled = isInGroup || (!isSelected && selectedStudents.length >= 4);
              
              return (
                <label 
                  key={s.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    padding: '8px 12px', 
                    border: '1px solid #d1d5db', 
                    borderRadius: 8, 
                    background: isSelected ? '#1AACBE' : isInGroup ? '#f3f4f6' : '#fff',
                    color: isSelected ? '#fff' : isInGroup ? '#9ca3af' : '#111',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isInGroup ? 0.6 : 1
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={isSelected} 
                    onChange={() => toggleStudentSelection(s.id)}
                    disabled={isDisabled}
                  />
                  <span>{s.full_name || s.first_name}</span>
                  {isInGroup && <span style={{ fontSize: 11, marginLeft: 'auto' }}>📦 Déjà groupé</span>}
                </label>
              );
            })}
          </div>
        </div>
        
        <button 
          onClick={createGroup}
          disabled={selectedStudents.length < 2 || selectedStudents.length > 4 || !groupName.trim()}
          style={{ 
            padding: '10px 20px', 
            borderRadius: 8, 
            border: 'none', 
            background: 'linear-gradient(135deg, #1AACBE, #148A9C)', 
            color: '#fff', 
            fontWeight: 700,
            cursor: (selectedStudents.length < 2 || selectedStudents.length > 4 || !groupName.trim()) ? 'not-allowed' : 'pointer',
            opacity: (selectedStudents.length < 2 || selectedStudents.length > 4 || !groupName.trim()) ? 0.5 : 1
          }}
        >
          Créer le groupe ({selectedStudents.length} élève(s))
        </button>
      </section>
      
      {/* Liste des groupes créés */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Groupes créés ({groups.length})</h3>
          {groups.filter(g => g.status === 'pending' && !g.match_id).length > 0 && (
            <button onClick={selectAllPendingGroups} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #6b7280', background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {checkedGroups.size === groups.filter(g => g.status === 'pending' && !g.match_id).length ? '☐ Tout désélectionner' : '☑ Tout sélectionner'}
            </button>
          )}
        </div>
        
        {groups.length === 0 && (
          <p style={{ color: '#6b7280' }}>Aucun groupe créé pour le moment.</p>
        )}
        
        <div style={{ display: 'grid', gap: 12 }}>
          {groups.map(group => {
            const studentIds = parseStudentIds(group.student_ids);
            const groupStudents = students.filter(s => studentIds.includes(s.id));
            const isPending = group.status === 'pending' && !group.match_id;
            const isChecked = checkedGroups.has(group.id);
            
            return (
              <div 
                key={group.id} 
                style={{ 
                  padding: 16, 
                  border: isChecked ? '2px solid #1AACBE' : '1px solid #e5e7eb', 
                  borderRadius: 12, 
                  background: isChecked ? '#f0fafb' : '#fff',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  {isPending && (
                    <input type="checkbox" checked={isChecked} onChange={() => toggleGroupCheck(group.id)}
                      style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#1AACBE' }} />
                  )}
                  <h4 style={{ margin: 0, flex: 1 }}>{group.name}</h4>
                  <span 
                    style={{ 
                      padding: '4px 12px', 
                      borderRadius: 999, 
                      fontSize: 12, 
                      fontWeight: 700, 
                      background: group.status === 'finished' ? '#148A9C' : group.status === 'playing' ? '#F5A623' : group.match_id ? '#3b82f6' : '#6b7280',
                      color: '#fff'
                    }}
                  >
                    {group.status === 'finished' ? 'Terminé' : group.status === 'playing' ? 'En cours' : group.match_id ? 'Salle créée' : 'En attente'}
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
                
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isPending && (
                    <>
                      <button 
                        onClick={() => launchMatch(group)}
                        style={{ 
                          padding: '8px 16px', 
                          borderRadius: 8, 
                          border: 'none', 
                          background: 'linear-gradient(135deg, #1AACBE, #148A9C)', 
                          color: '#fff', 
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        � Créer la salle et notifier
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

        {/* Bouton bulk: Notifier tous les groupes sélectionnés */}
        {checkedGroups.size > 0 && (
          <div style={{ marginTop: 16, padding: 16, background: '#f0fafb', borderRadius: 12, border: '2px solid #1AACBE' }}>
            <button
              onClick={bulkNotifyGroups}
              disabled={bulkLoading}
              style={{
                width: '100%',
                padding: '14px 24px',
                borderRadius: 10,
                border: 'none',
                background: bulkLoading ? '#94a3b8' : 'linear-gradient(135deg, #1AACBE, #148A9C)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 16,
                cursor: bulkLoading ? 'wait' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {bulkLoading ? '⏳ Création des salles en cours...' : `📨 Créer les salles et notifier les élèves (${checkedGroups.size} groupe(s))`}
            </button>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
              Les élèves recevront une invitation à rejoindre leur salle de jeu. Ils devront se connecter avec leur code d'accès.
            </p>
          </div>
        )}
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
