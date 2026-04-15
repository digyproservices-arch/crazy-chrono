// ==========================================
// COMPOSANT: CONFIGURATION BATTLE ROYALE (Groupes de 4)
// Interface enseignant pour créer des groupes et lancer les matchs
// ==========================================

import React, { useState, useEffect, useRef, useMemo, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders, getBackendUrl } from '../../utils/apiHelpers';
import { DataContext } from '../../context/DataContext';
import PedagogicConfig, { CARD, SECTION_TITLE, CLASS_LEVELS, CONTENT_DOMAINS } from '../Shared/PedagogicConfig';


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
    console.error('[TrainingArena] Error parsing student_ids:', studentIds, err);
    return [];
  }
};

// Variable globale pour éviter les chargements multiples même si le composant se démonte/remonte
let globalLoadLock = false;
let globalLoadTimeout = null;

// Clés sessionStorage pour cache
const CACHE_KEY_TOURNAMENT = 'tr_cache_tournament';
const CACHE_KEY_STUDENTS = 'tr_cache_students';
const CACHE_KEY_GROUPS = 'tr_cache_groups';

// Les constantes (CARD, SECTION_TITLE) sont importées depuis PedagogicConfig

export default function TrainingArenaSetup() {
  const navigate = useNavigate();
  const loadedRef = useRef(false);
  const { data } = useContext(DataContext);
  
  // État
  const [students, setStudents] = useState([]); // Liste des élèves de la classe
  const [groups, setGroups] = useState([]); // Groupes de 4 créés
  const [selectedStudents, setSelectedStudents] = useState([]); // Élèves sélectionnés pour former un groupe
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState(null);
  const [perfMap, setPerfMap] = useState({}); // studentId → performance stats
  const [configOpen, setConfigOpen] = useState(false); // Toggle panneau config
  const [checkedGroups, setCheckedGroups] = useState(new Set()); // Groupes cochés pour notif bulk
  const [bulkLoading, setBulkLoading] = useState(false);
  const [groupConfigs, setGroupConfigs] = useState({}); // groupId → config snapshot
  const [tourStatus, setTourStatus] = useState(null); // { tours, currentTour, classWinner }
  const [creatingNextTour, setCreatingNextTour] = useState(false);

  // ===== Configuration pédagogique (composant partagé PedagogicConfig) =====
  const [pedConfig, setPedConfig] = useState(null);
  const initialPedConfig = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('cc_training_cfg') || 'null') || undefined; } catch { return undefined; }
  }, []);

  // Training-specific: compétition officielle
  const [isOfficial, setIsOfficial] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem('cc_training_cfg'))?.isOfficial; } catch { return false; }
  });

  // Persister la config pédagogique (debounce 300ms)
  useEffect(() => {
    if (!pedConfig) return;
    const t = setTimeout(() => {
      try {
        const { dataStats: _ds, ...rest } = pedConfig;
        localStorage.setItem('cc_training_cfg', JSON.stringify({ ...rest, isOfficial }));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [pedConfig, isOfficial]);
  
  // Charger les données au montage (CACHE DÉSACTIVÉ pour stabilité)
  useEffect(() => {
    console.log('[TrainingArena] 🔵 useEffect montage - loadedRef:', loadedRef.current, 'globalLoadLock:', globalLoadLock);
    
    // ⚠️ CACHE TEMPORAIREMENT DÉSACTIVÉ pour résoudre erreur de parsing JSON
    // Vider tout cache existant au montage
    try {
      sessionStorage.removeItem(CACHE_KEY_TOURNAMENT);
      sessionStorage.removeItem(CACHE_KEY_STUDENTS);
      sessionStorage.removeItem(CACHE_KEY_GROUPS);
      console.log('[TrainingArena] 🗑️ Cache vidé (désactivé temporairement)');
    } catch (e) {
      console.log('[TrainingArena] ⚠️ Erreur vidage cache:', e);
    }
    
    // Protection double : useRef local + variable globale
    if (loadedRef.current || globalLoadLock) {
      console.log('[TrainingArena] 🚫 Chargement bloqué par lock');
      return;
    }
    
    loadedRef.current = true;
    globalLoadLock = true;
    
    // Réinitialiser le lock après 5 secondes pour permettre un refresh manuel
    if (globalLoadTimeout) clearTimeout(globalLoadTimeout);
    globalLoadTimeout = setTimeout(() => {
      globalLoadLock = false;
      console.log('[TrainingArena] 🔓 globalLoadLock libéré');
    }, 5000);
    
    loadTournamentData();
  }, []);
  
  const loadTournamentData = async () => {
    try {
      console.log('[TrainingArena] 🔄 Chargement des données...');
      setLoading(true);
      
      const backendUrl = getBackendUrl();
      console.log('[TrainingArena] 🌐 Backend URL:', backendUrl);
      
      // 1. Récupérer le tournoi actif
      const tournamentRes = await fetch(`${backendUrl}/api/tournament/tournaments/tour_2025_gp`, { headers: getAuthHeaders() });
      const tournamentData = await tournamentRes.json();
      console.log('[TrainingArena] 🏆 Tournament data:', tournamentData);
      setTournament(tournamentData.tournament);
      
      // 2. Récupérer la liste des élèves de la classe
      // ✅ FIX: Lire classId depuis URL params (rectorat dashboard) OU localStorage (prof)
      const urlParams = new URLSearchParams(window.location.search);
      const classId = urlParams.get('classId') || localStorage.getItem('cc_class_id');
      console.log('[TrainingArena] 📚 Class ID:', classId, '(source:', urlParams.get('classId') ? 'URL' : 'localStorage', ')');
      
      if (urlParams.get('classId')) {
        localStorage.setItem('cc_class_id', urlParams.get('classId'));
      }
      
      if (!classId) {
        console.error('[TrainingArena] ❌ classId non trouvé (ni URL ni localStorage)');
        throw new Error('Classe non trouvée. Veuillez vous reconnecter.');
      }
      
      const studentsRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/students`, { headers: getAuthHeaders() });
      const studentsData = await studentsRes.json();
      console.log('[TrainingArena] 👥 Students data:', studentsData);
      console.log('[TrainingArena] 👥 Students count:', studentsData.students?.length || 0);
      setStudents(studentsData.students || []);
      
      // 3. Récupérer les groupes déjà créés
      const groupsRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/groups?mode=training`, { headers: getAuthHeaders() });
      const groupsData = await groupsRes.json();
      console.log('[TrainingArena] 👥 Groups data:', groupsData);
      console.log('[TrainingArena] 👥 Groups count:', groupsData.groups?.length || 0);
      setGroups(groupsData.groups || []);
      
      // 4. Récupérer les performances des élèves
      try {
        const perfRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/students-performance`, { headers: getAuthHeaders() });
        const perfData = await perfRes.json();
        if (perfData.success && perfData.students) {
          const map = {};
          perfData.students.forEach(s => { map[s.studentId] = s; });
          setPerfMap(map);
          console.log('[TrainingArena] 📊 Performance data loaded for', perfData.students.length, 'students');
        }
      } catch (perfErr) {
        console.warn('[TrainingArena] ⚠️ Performance data unavailable:', perfErr.message);
      }
      
      // 5. Récupérer le statut des tours
      try {
        const tourRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/tour-status?mode=training&phase_level=${tournamentData.tournament?.current_phase || 1}`, { headers: getAuthHeaders() });
        const tourData = await tourRes.json();
        if (tourData.success) setTourStatus(tourData);
      } catch (e) { console.warn('[TrainingArena] Tour status non disponible:', e); }
      
      console.log('[TrainingArena] ✅ Chargement terminé!');
      console.log('[TrainingArena] 📊 État final - Students:', studentsData.students?.length, 'Groups:', groupsData.groups?.length);
      
      // ⚠️ CACHE DÉSACTIVÉ TEMPORAIREMENT - Ne pas sauvegarder pour éviter erreurs parsing
      console.log('[TrainingArena] ℹ️ Cache désactivé - données non sauvegardées');
    } catch (error) {
      console.error('[TrainingArena] ❌ Error loading data:', error);
    } finally {
      // IMPORTANT : setLoading(false) IMMÉDIAT sans setTimeout !
      setLoading(false);
      console.log('[TrainingArena] 🏁 Loading = false');
    }
  };
  
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId); // Désélectionner
      } else {
        return [...prev, studentId];
      }
    });
  };
  
  const createGroup = async () => {
    if (selectedStudents.length < 2) {
      alert('Vous devez sélectionner au moins 2 élèves pour former un groupe.');
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
          studentIds: selectedStudents,
          mode: 'training'
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        // ✅ Snapshot de la config pédagogique actuelle pour ce groupe
        if (data.groupId && pedConfig) {
          setGroupConfigs(prev => ({ ...prev, [data.groupId]: { ...pedConfig } }));
        }
        alert(`Groupe "${groupName}" créé avec succès !`);
        setSelectedStudents([]);
        setGroupName('');
        loadTournamentData(); // Recharger
      } else {
        alert('Erreur lors de la création du groupe: ' + data.error);
      }
    } catch (error) {
      console.error('[TrainingArena] Error creating group:', error);
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
        console.error('[TrainingArena] Erreur bulk notify:', e);
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
      
      // ✅ FIX: Utiliser la config spécifique du groupe si elle existe, sinon la config globale
      const gc = groupConfigs[group.id];
      const pc = gc || pedConfig || {};
      const matchConfig = {
        rounds: pc.objectiveMode ? 99 : (pc.rounds || 3),
        duration: pc.objectiveMode ? 9999 : (pc.duration || 60),
        classes: (Array.isArray(pc.classes) && pc.classes.length > 0) ? pc.classes : ['CP'],
        themes: Array.isArray(pc.themes) ? pc.themes : [],
        extras: Array.isArray(pc.extras) ? pc.extras : [],
        objectiveMode: !!pc.objectiveMode,
        objectiveTarget: pc.objectiveTarget || null,
        objectiveThemes: pc.objectiveThemes || [],
        helpEnabled: !!pc.helpEnabled,
        isOfficial: isOfficial,
        selectedLevel: pc.selectedLevel || null,
      };
      
      console.log('[TrainingArena] 🚀 Lancement match Training');
      console.log('[TrainingArena] 📋 Config utilisée:', matchConfig);
      console.log('[TrainingArena] 👥 Élèves:', parseStudentIds(group.student_ids));
      
      // ✅ FIX CRITIQUE: Appeler API Training (pas Arena)
      const res = await fetch(`${backendUrl}/api/training/matches`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          studentIds: parseStudentIds(group.student_ids),
          config: {
            ...matchConfig,
            sessionName: group.name || 'Session Entraînement'
          },
          classId: classId,
          teacherId: localStorage.getItem('cc_user_id') || JSON.parse(localStorage.getItem('cc_auth') || '{}').id || 'unknown'
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        // ✅ FIX: Mettre à jour le match_id du groupe en DB pour que "Voir résultats" pointe vers le bon match
        try {
          await fetch(`${backendUrl}/api/tournament/groups/${group.id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ matchId: data.matchId, status: 'playing' })
          });
        } catch (patchErr) {
          console.warn('[TrainingArena] ⚠️ Erreur mise à jour group.match_id:', patchErr);
        }
        
        const playerCount = parseStudentIds(group.student_ids).length;
        
        if (silent) {
          return { groupName: group.name, roomCode: data.roomCode, matchId: data.matchId, playerCount };
        }
        
        alert(`✅ Salle créée !\n\nCode de salle: ${data.roomCode}\n\n📋 Les ${playerCount} élève(s) doivent se connecter avec leur code d'accès et rejoindre la salle.\n\nURL: https://app.crazy-chrono.com/training-arena/lobby/${data.roomCode}`);
        loadTournamentData();
        return { groupName: group.name, roomCode: data.roomCode, matchId: data.matchId, playerCount };
      } else {
        if (!silent) alert('Erreur lors de la création de la salle: ' + data.error);
        return null;
      }
    } catch (error) {
      console.error('[TrainingArena] Error launching match:', error);
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
      console.error('[TrainingArena] Error deleting group:', error);
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
  console.log('[TrainingArena] 🔄 RENDER - loading:', loading, 'students:', students.length, 'groups:', groups.length);
  
  if (loading) {
    console.log('[TrainingArena] 🕒 Affichage "Chargement..."');
    return (
      <div style={{ maxWidth: 980, margin: '24px auto', padding: '0 16px', textAlign: 'center' }}>
        <p>Chargement...</p>
      </div>
    );
  }
  
  console.log('[TrainingArena] ✅ Affichage de l\'UI complète');
  
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            🏆 Mode Entraînement - Training Arena
          </h1>
          <p style={{ fontSize: 16, color: '#666', marginBottom: 0 }}>
            Créez des groupes d'au moins 2 élèves et lancez des matchs compétitifs
          </p>
        </div>
        
        <button
          onClick={() => navigate('/training-arena/manager')}
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
      
      {tournament && (
        <div style={{ padding: '12px 16px', background: '#f0fafb', borderRadius: 8, marginBottom: 16, border: '1px solid #1AACBE' }}>
          <strong>Tournoi:</strong> {tournament.name}<br />
          <strong>Phase actuelle:</strong> Phase {tournament.current_phase} / 4
        </div>
      )}
      
      {/* ===== CONFIGURATION PÉDAGOGIQUE (collapsible) ===== */}
      <div style={CARD}>
        <div
          onClick={() => setConfigOpen(p => !p)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <h3 style={{ ...SECTION_TITLE, marginBottom: 0 }}>
            <span>📚</span> Configuration pédagogique
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {pedConfig?.dataStats && (
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ padding: '3px 10px', borderRadius: 8, background: '#f0fdfa', color: '#0D6A7A', fontWeight: 700 }}>
                  🖼️ {pedConfig.dataStats.textImage} paires
                </span>
                <span style={{ padding: '3px 10px', borderRadius: 8, background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>
                  🔢 {pedConfig.dataStats.calcNum} calculs
                </span>
                {pedConfig.objectiveMode && (
                  <span style={{ padding: '3px 10px', borderRadius: 8, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                    🎯 Objectif
                  </span>
                )}
              </div>
            )}
            <span style={{ fontSize: 18, color: '#94a3b8', transition: 'transform 0.2s', transform: configOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
          </div>
        </div>
      </div>

      {/* Toujours monté pour que pedConfig soit rempli même quand fermé */}
      <div style={configOpen ? undefined : { display: 'none' }}>
        <PedagogicConfig
          data={data}
          onChange={setPedConfig}
          initialConfig={initialPedConfig}
          options={{ showPlayerZone: false, showFreeLimits: false, showAllowEmptyMath: true, showObjectiveTarget: true }}
        />

        {/* ✅ Boutons pour appliquer la config à un groupe spécifique */}
        {groups.filter(g => g.status === 'pending' && !g.match_id).length > 0 && (
          <div style={{ ...CARD, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 8 }}>
              Appliquer cette config à un groupe spécifique :
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {groups.filter(g => g.status === 'pending' && !g.match_id).map(g => (
                <button
                  key={g.id}
                  onClick={() => {
                    if (pedConfig) {
                      setGroupConfigs(prev => ({ ...prev, [g.id]: { ...pedConfig } }));
                      alert(`Config appliquée au groupe "${g.name}" ✅`);
                    }
                  }}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #93c5fd', background: '#fff', color: '#1e40af', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  📋 {g.name}
                </button>
              ))}
              <button
                onClick={() => {
                  if (pedConfig) {
                    const pending = groups.filter(g => g.status === 'pending' && !g.match_id);
                    const newConfigs = {};
                    pending.forEach(g => { newConfigs[g.id] = { ...pedConfig }; });
                    setGroupConfigs(prev => ({ ...prev, ...newConfigs }));
                    alert(`Config appliquée à ${pending.length} groupe(s) ✅`);
                  }
                }}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #1d4ed8', background: '#1d4ed8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Appliquer à tous
              </button>
            </div>
          </div>
        )}

        {/* Training-specific: Compétition Officielle */}
        <div style={CARD}>
          <div style={{ padding: 14, borderRadius: 12, border: isOfficial ? '2px solid #1d4ed8' : '2px solid #e2e8f0', background: isOfficial ? '#eff6ff' : '#fff', transition: 'all 0.2s' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div
                onClick={() => setIsOfficial(p => !p)}
                style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: isOfficial ? '#1d4ed8' : '#cbd5e1', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: isOfficial ? 22 : 2, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>🏛️ Compétition Officielle</div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginTop: 2 }}>
                  {isOfficial
                    ? 'Les résultats et cartes seront visibles par le rectorat.'
                    : 'Session d\'entraînement simple (non comptabilisée).'}
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

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
              <strong>✅ {availableStudents.length} élève(s) disponible(s)</strong> - Sélectionnez au moins 2 élèves pour créer un groupe ({selectedStudents.length} sélectionné(s))
            </div>
          )}
          
          {availableStudents.length === 0 && (
            <div style={{ marginTop: 8, marginBottom: 8, padding: 8, background: '#fef3c7', borderRadius: 6 }}>
              <strong>⚠️ Tous les élèves sont déjà dans des groupes</strong> - Supprimez un groupe pour libérer des élèves
            </div>
          )}
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, marginTop: 8 }}>
            {students.map(s => {
              const isInGroup = studentsInGroups.has(s.id);
              const isSelected = selectedStudents.includes(s.id);
              const isDisabled = isInGroup;
              const perf = perfMap[s.id];
              const levelColors = {
                'Expert': { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
                'Avancé': { bg: '#dbeafe', color: '#1e40af', border: '#3b82f6' },
                'Intermédiaire': { bg: '#e0f2fe', color: '#075985', border: '#0ea5e9' },
                'Débutant': { bg: '#fee2e2', color: '#991b1b', border: '#ef4444' },
                'Nouveau': { bg: '#f3f4f6', color: '#6b7280', border: '#9ca3af' }
              };
              const lc = levelColors[perf?.level] || levelColors['Nouveau'];
              
              return (
                <label 
                  key={s.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    padding: '8px 12px', 
                    border: isSelected ? '2px solid #1AACBE' : `1px solid ${isInGroup ? '#e5e7eb' : '#d1d5db'}`, 
                    borderRadius: 10, 
                    background: isSelected ? '#f0fdfa' : isInGroup ? '#f3f4f6' : '#fff',
                    color: isInGroup ? '#9ca3af' : '#111',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isInGroup ? 0.6 : 1,
                    transition: 'all 0.15s'
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={isSelected} 
                    onChange={() => toggleStudentSelection(s.id)}
                    disabled={isDisabled}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(`/student/${s.id}/performance`, '_blank'); }}
                        style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2, color: 'inherit' }}
                        title="Voir les performances"
                      >{s.full_name || s.first_name}</span>
                    </div>
                    {perf && perf.totalMatches > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: lc.bg, color: lc.color, fontWeight: 700, border: `1px solid ${lc.border}22` }}>
                          {perf.level}
                        </span>
                        <span style={{ fontSize: 10, color: '#6b7280' }}>📊 {perf.avgScore} pts</span>
                        <span style={{ fontSize: 10, color: '#6b7280' }}>🎯 {perf.accuracy}%</span>
                        {perf.competitiveMatches > 0 && (
                          <span style={{ fontSize: 10, color: '#6b7280' }}>🏆 {perf.winRate}%</span>
                        )}
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>{perf.totalMatches} match{perf.totalMatches > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {(!perf || perf.totalMatches === 0) && (
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Aucune donnée de performance</div>
                    )}
                  </div>
                  {isInGroup && <span style={{ fontSize: 11, flexShrink: 0 }}>📦</span>}
                </label>
              );
            })}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            onClick={createGroup}
            disabled={selectedStudents.length < 2 || !groupName.trim()}
            style={{ 
              padding: '10px 20px', 
              borderRadius: 8, 
              border: 'none', 
              background: 'linear-gradient(135deg, #1AACBE, #148A9C)', 
              color: '#fff', 
              fontWeight: 700,
              cursor: (selectedStudents.length < 2 || !groupName.trim()) ? 'not-allowed' : 'pointer',
              opacity: (selectedStudents.length < 2 || !groupName.trim()) ? 0.5 : 1
            }}
          >
            Créer le groupe ({selectedStudents.length} élève(s))
          </button>
          
          {availableStudents.length >= 2 && (
            <button
              onClick={() => {
                // Auto-grouper par niveau : trier les élèves disponibles par levelScore et faire des groupes équilibrés de 2-4
                const sorted = [...availableStudents].sort((a, b) => {
                  const pa = perfMap[a.id]?.levelScore || 0;
                  const pb = perfMap[b.id]?.levelScore || 0;
                  return pb - pa;
                });
                const groupSize = sorted.length <= 4 ? sorted.length : sorted.length <= 8 ? Math.ceil(sorted.length / 2) : Math.ceil(sorted.length / Math.ceil(sorted.length / 4));
                const autoGroups = [];
                // Serpentine distribution for balanced groups
                const numGroups = Math.ceil(sorted.length / Math.min(4, Math.max(2, groupSize)));
                const buckets = Array.from({ length: numGroups }, () => []);
                sorted.forEach((s, i) => {
                  const round = Math.floor(i / numGroups);
                  const idx = round % 2 === 0 ? (i % numGroups) : (numGroups - 1 - (i % numGroups));
                  if (buckets[idx].length < 4) buckets[idx].push(s);
                });
                // Filter valid groups (2-4 students)
                const validGroups = buckets.filter(b => b.length >= 2);
                if (validGroups.length === 0) {
                  alert('Pas assez d\'élèves disponibles pour créer des groupes.');
                  return;
                }
                const msg = validGroups.map((g, i) => {
                  const names = g.map(s => {
                    const p = perfMap[s.id];
                    return `${s.full_name || s.first_name} (${p?.level || 'Nouveau'})`;
                  }).join(', ');
                  return `Groupe ${groups.length + i + 1}: ${names}`;
                }).join('\n');
                if (window.confirm(`Créer ${validGroups.length} groupe(s) équilibré(s) par niveau ?\n\n${msg}`)) {
                  validGroups.forEach(async (g, i) => {
                    const name = `Groupe ${groups.length + i + 1}`;
                    const ids = g.map(s => s.id);
                    try {
                      const classId = localStorage.getItem('cc_class_id');
                      await fetch(`${getBackendUrl()}/api/tournament/groups`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                          tournamentId: tournament.id,
                          phaseLevel: tournament.current_phase,
                          classId,
                          name,
                          studentIds: ids
                        })
                      });
                    } catch (err) {
                      console.error('[TrainingArena] Auto-group error:', err);
                    }
                  });
                  // Refresh after a short delay to let all creates finish
                  setTimeout(() => loadTournamentData(), 1500);
                }
              }}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid #f59e0b',
                background: '#fffbeb',
                color: '#92400e',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              ⚡ Grouper par niveau ({availableStudents.length} élèves)
            </button>
          )}
        </div>
      </section>
      
      {/* Liste des groupes créés — organisés par tour */}
      {(() => {
        const tourColors = [
          { bg: '#fff', border: '#e5e7eb', headerBg: 'transparent', headerColor: '#111' },
          { bg: '#eff6ff', border: '#93c5fd', headerBg: '#dbeafe', headerColor: '#1e40af' },
          { bg: '#fef3c7', border: '#fbbf24', headerBg: '#fde68a', headerColor: '#92400e' },
          { bg: '#f0fdf4', border: '#86efac', headerBg: '#dcfce7', headerColor: '#166534' },
        ];
        const groupsByTour = {};
        groups.forEach(g => {
          const tn = g.tour_number || 1;
          if (!groupsByTour[tn]) groupsByTour[tn] = [];
          groupsByTour[tn].push(g);
        });
        const tourNumbers = Object.keys(groupsByTour).map(Number).sort((a, b) => a - b);

        return tourNumbers.map(tn => {
          const tourGroups = groupsByTour[tn];
          const colors = tourColors[Math.min(tn - 1, tourColors.length - 1)];
          const isTour1 = tn === 1;
          return (
            <section key={`tour-section-${tn}`} style={!isTour1 ? { marginTop: 20, padding: 16, background: colors.bg, borderRadius: 14, border: `2px solid ${colors.border}` } : undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                {isTour1 ? (
                  <h3 style={{ margin: 0 }}>Groupes créés ({tourGroups.length})</h3>
                ) : (
                  <h3 style={{ margin: 0, padding: '4px 14px', borderRadius: 8, background: colors.headerBg, color: colors.headerColor, fontSize: 15 }}>
                    🔁 Tour {tn} — {tourGroups.length} groupe(s)
                  </h3>
                )}
                {isTour1 && groups.filter(g => g.status === 'pending' && !g.match_id).length > 0 && (
                  <button onClick={selectAllPendingGroups} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #6b7280', background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {checkedGroups.size === groups.filter(g => g.status === 'pending' && !g.match_id).length ? '☐ Tout désélectionner' : '☑ Tout sélectionner'}
                  </button>
                )}
              </div>
              
              {isTour1 && tourGroups.length === 0 && (
                <p style={{ color: '#6b7280' }}>Aucun groupe créé pour le moment.</p>
              )}
              
              <div style={{ display: 'grid', gap: 12 }}>
                {tourGroups.map(group => {
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
                
                {/* ✅ Indicateur visuel de la config pédagogique du groupe */}
                {(() => {
                  const gc = groupConfigs[group.id] || pedConfig;
                  const level = gc?.selectedLevel || '?';
                  const domains = CONTENT_DOMAINS.filter(d => {
                    if (!gc?.themes || gc.themes.length === 0) return true;
                    return d.tags.some(t => gc.themes.includes(t));
                  });
                  const hasCustom = !!groupConfigs[group.id];
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                        {level}
                      </span>
                      {domains.map(d => (
                        <span key={d.key} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: d.bg, color: d.color, fontWeight: 600 }}>
                          {d.icon} {d.label}
                        </span>
                      ))}
                      {gc?.objectiveMode && (
                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                          🎯 Objectif
                        </span>
                      )}
                      {hasCustom && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: '#dbeafe', color: '#1e40af', fontWeight: 700, border: '1px solid #93c5fd' }}>
                          config propre
                        </span>
                      )}
                      {isPending && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Copier la config globale actuelle pour ce groupe
                            if (!groupConfigs[group.id] && pedConfig) {
                              setGroupConfigs(prev => ({ ...prev, [group.id]: { ...pedConfig } }));
                            }
                            setConfigOpen(true);
                            alert(`Pour modifier la config du groupe "${group.name}":\n\n1. Ajustez la Configuration pédagogique ci-dessus\n2. Cliquez sur "Appliquer à ${group.name}" qui apparaîtra`);
                          }}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer' }}
                          title="Modifier la config de ce groupe"
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  );
                })()}

                <div style={{ marginBottom: 12 }}>
                  <strong>Élèves:</strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    {groupStudents.map(s => {
                      const perf = perfMap[s.id];
                      const levelColors = {
                        'Expert': '#f59e0b', 'Avancé': '#3b82f6',
                        'Intermédiaire': '#0ea5e9', 'Débutant': '#ef4444', 'Nouveau': '#9ca3af'
                      };
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: levelColors[perf?.level] || '#9ca3af', flexShrink: 0 }} />
                          <span
                            onClick={() => window.open(`/student/${s.id}/performance`, '_blank')}
                            style={{ fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}
                            title="Voir les performances"
                          >{s.full_name || s.first_name}</span>
                          {perf && perf.totalMatches > 0 && (
                            <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>
                              {perf.level} · {perf.avgScore} pts · 🎯{perf.accuracy}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                  {group.status === 'finished' && (
                    <>
                      <button 
                        onClick={() => launchMatch(group)}
                        style={{ 
                          padding: '8px 16px', 
                          borderRadius: 8, 
                          border: 'none', 
                          background: 'linear-gradient(135deg, #F5A623, #e6951a)', 
                          color: '#fff', 
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        🔄 Relancer le match
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
                  {group.status === 'playing' && (
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
                  )}
                  {group.match_id && (
                    <button 
                      onClick={() => navigate(`/tournament/group/${group.id}/history`)}
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

              {/* Bouton bulk: Notifier tous les groupes sélectionnés (Tour 1 uniquement) */}
              {isTour1 && checkedGroups.size > 0 && (
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
          );
        });
      })()}
      
      {/* ===== SECTION PROGRESSION TOURNOI ===== */}
      {tourStatus && tourStatus.tours.length > 0 && (() => {
        const completedTours = tourStatus.tours.filter(t => t.allFinished);
        const lastComplete = completedTours[completedTours.length - 1];
        const hasClassWinner = !!tourStatus.classWinner;
        const canCreateNext = lastComplete && lastComplete.winners.length >= 2 && !hasClassWinner;
        const nextTourExists = tourStatus.tours.some(t => t.tourNumber === (lastComplete?.tourNumber || 0) + 1);

        return (
          <section style={{ marginTop: 24, padding: 20, background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', borderRadius: 16, border: '2px solid #86efac' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#065f46' }}>
              🏆 Progression du tournoi
            </h3>

            {tourStatus.tours.map(tour => (
              <div key={tour.tourNumber} style={{
                padding: 12, marginBottom: 10, borderRadius: 10,
                background: tour.allFinished ? '#fff' : '#fefce8',
                border: tour.allFinished ? '1px solid #d1fae5' : '1px solid #fde68a'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: 14, color: '#1e293b' }}>Tour {tour.tourNumber}</strong>
                  <span style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: tour.allFinished ? '#d1fae5' : '#fef3c7',
                    color: tour.allFinished ? '#065f46' : '#92400e'
                  }}>
                    {tour.allFinished ? `✅ Terminé` : `⏳ ${tour.finishedGroups}/${tour.totalGroups} groupes`}
                  </span>
                </div>
                {tour.allFinished && tour.winners.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {tour.winners.map(w => (
                      <span key={w.studentId} style={{
                        padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: '#dcfce7', color: '#166534', border: '1px solid #86efac'
                      }}>
                        🏅 {w.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {hasClassWinner && (
              <div style={{
                padding: 16, borderRadius: 12, textAlign: 'center',
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                color: '#fff', marginTop: 8
              }}>
                <div style={{ fontSize: 36, marginBottom: 4 }}>🏆</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Gagnant de classe</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{tourStatus.classWinner.name}</div>
              </div>
            )}

            {canCreateNext && !nextTourExists && (
              <button
                onClick={async () => {
                  setCreatingNextTour(true);
                  try {
                    const classId = localStorage.getItem('cc_class_id');
                    const resp = await fetch(`${getBackendUrl()}/api/tournament/classes/${classId}/next-tour`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({
                        mode: 'training',
                        phase_level: tournament?.current_phase || 1,
                        tournamentId: tournament?.id
                      })
                    });
                    const data = await resp.json();
                    if (data.success) {
                      alert(data.message);
                      loadTournamentData();
                    } else {
                      alert('Erreur: ' + (data.error || 'Erreur inconnue'));
                    }
                  } catch (err) {
                    alert('Erreur de connexion: ' + err.message);
                  } finally {
                    setCreatingNextTour(false);
                  }
                }}
                disabled={creatingNextTour}
                style={{
                  marginTop: 12, width: '100%', padding: '14px 24px',
                  borderRadius: 10, border: 'none',
                  background: creatingNextTour ? '#94a3b8' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  color: '#fff', fontWeight: 800, fontSize: 15,
                  cursor: creatingNextTour ? 'wait' : 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {creatingNextTour
                  ? '⏳ Création en cours...'
                  : `➡️ Créer le Tour ${(lastComplete?.tourNumber || 1) + 1} avec ${lastComplete.winners.length} gagnant(s)`}
              </button>
            )}
          </section>
        );
      })()}

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
