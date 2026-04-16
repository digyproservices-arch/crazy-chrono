// ==========================================
// COMPOSANT: CONFIGURATION BATTLE ROYALE (Groupes de 4)
// Interface enseignant pour créer des groupes et lancer les matchs
// ==========================================

import React, { useState, useEffect, useRef, useMemo, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders, getBackendUrl } from '../../utils/apiHelpers';
import { DataContext } from '../../context/DataContext';
import PedagogicConfig, { CARD, SECTION_TITLE, CONTENT_DOMAINS } from '../Shared/PedagogicConfig';


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
  const { data } = useContext(DataContext);
  
  // État
  const [students, setStudents] = useState([]); // Liste des élèves de la classe
  const [groups, setGroups] = useState([]); // Groupes de 4 créés
  const [selectedStudents, setSelectedStudents] = useState([]); // Élèves sélectionnés pour former un groupe
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState(null);
  const [checkedGroups, setCheckedGroups] = useState(new Set()); // Groupes cochés pour notif bulk
  const [bulkLoading, setBulkLoading] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [groupConfigs, setGroupConfigs] = useState({}); // groupId → config snapshot
  const [tourStatus, setTourStatus] = useState(null); // { tours, currentTour, classWinner }
  const [creatingNextTour, setCreatingNextTour] = useState(false);

  // ===== Configuration pédagogique (composant partagé PedagogicConfig) =====
  const [pedConfig, setPedConfig] = useState(null);
  const initialPedConfig = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('cc_arena_cfg') || 'null') || undefined; } catch { return undefined; }
  }, []);

  // Persister la config pédagogique (debounce 300ms)
  useEffect(() => {
    if (!pedConfig) return;
    const t = setTimeout(() => {
      try {
        const { dataStats: _ds, ...rest } = pedConfig;
        localStorage.setItem('cc_arena_cfg', JSON.stringify(rest));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [pedConfig]);
  
  // Charger les données au montage (ENDPOINT COMBINÉ + CACHE)
  useEffect(() => {
    console.log('[CrazyArena] 🔵 useEffect montage - loadedRef:', loadedRef.current, 'globalLoadLock:', globalLoadLock);
    
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

    // Essayer le cache sessionStorage d'abord (TTL 60s)
    try {
      const cached = sessionStorage.getItem(CACHE_KEY_TOURNAMENT);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.students) && parsed.students.length > 0 && Date.now() - (parsed._ts || 0) < 60000) {
          console.log('[CrazyArena] ⚡ Cache hit — chargement instantané');
          setTournament(parsed.tournament);
          setStudents(parsed.students);
          setGroups(parsed.groups || []);
          if (parsed.tourStatus) setTourStatus(parsed.tourStatus);
          setLoading(false);
          return;
        }
        // Cache invalide ou expiré → nettoyer
        sessionStorage.removeItem(CACHE_KEY_TOURNAMENT);
      }
    } catch { sessionStorage.removeItem(CACHE_KEY_TOURNAMENT); }
    
    loadTournamentData();
  }, []);
  
  const loadTournamentData = async () => {
    try {
      console.log('[CrazyArena] 🔄 Chargement des données...');
      setLoading(true);
      
      const backendUrl = getBackendUrl();
      
      // Lire classId depuis URL params (rectorat dashboard) OU localStorage (prof)
      const urlParams = new URLSearchParams(window.location.search);
      const classId = urlParams.get('classId') || localStorage.getItem('cc_class_id');
      
      if (urlParams.get('classId')) {
        localStorage.setItem('cc_class_id', urlParams.get('classId'));
      }
      
      if (!classId) {
        console.error('[CrazyArena] ❌ classId non trouvé (ni URL ni localStorage)');
        throw new Error('Classe non trouvée. Veuillez vous reconnecter.');
      }
      
      // ✅ PERF: Essayer l'endpoint combiné, sinon fallback séquentiel
      let loaded = false;
      try {
        const t0 = performance.now();
        const res = await fetch(
          `${backendUrl}/api/tournament/classes/${classId}/setup-data?mode=arena&tournamentId=tour_2025_gp`,
          { headers: getAuthHeaders() }
        );
        if (res.ok) {
          const d = await res.json();
          if (d.success && d.students) {
            setTournament(d.tournament);
            setStudents(d.students || []);
            setGroups(d.groups || []);
            if (d.tourStatus?.success) setTourStatus(d.tourStatus);
            const elapsed = Math.round(performance.now() - t0);
            console.log(`[CrazyArena] ✅ setup-data OK en ${elapsed}ms — ${d.students?.length} élèves, ${d.groups?.length} groupes`);
            try {
              sessionStorage.setItem(CACHE_KEY_TOURNAMENT, JSON.stringify({
                tournament: d.tournament, students: d.students, groups: d.groups,
                tourStatus: d.tourStatus, _ts: Date.now()
              }));
            } catch {}
            loaded = true;
          }
        }
      } catch (e) {
        console.warn('[CrazyArena] ⚠️ setup-data indisponible, fallback séquentiel:', e.message);
      }
      
      // Fallback : anciens endpoints séquentiels
      if (!loaded) {
        console.log('[CrazyArena] 🔄 Fallback: chargement séquentiel...');
        const tournamentRes = await fetch(`${backendUrl}/api/tournament/tournaments/tour_2025_gp`, { headers: getAuthHeaders() });
        const tournamentData = await tournamentRes.json();
        setTournament(tournamentData.tournament);
        
        const studentsRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/students`, { headers: getAuthHeaders() });
        const studentsData = await studentsRes.json();
        setStudents(studentsData.students || []);
        
        const groupsRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/groups?mode=arena`, { headers: getAuthHeaders() });
        const groupsData = await groupsRes.json();
        setGroups(groupsData.groups || []);
        
        try {
          const tourRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/tour-status?mode=arena&phase_level=${tournamentData.tournament?.current_phase || 1}`, { headers: getAuthHeaders() });
          const tourData = await tourRes.json();
          if (tourData.success) setTourStatus(tourData);
        } catch (e) { console.warn('[CrazyArena] Tour status non disponible:', e); }
        
        console.log('[CrazyArena] ✅ Fallback terminé — Students:', studentsData.students?.length, 'Groups:', groupsData.groups?.length);
      }
    } catch (error) {
      console.error('[CrazyArena] ❌ Error loading data:', error);
    } finally {
      setLoading(false);
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
          mode: 'arena'
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
      
      // Utiliser la config pédagogique définie par le professeur (via PedagogicConfig partagé)
      const pc = pedConfig || {};
      const matchConfig = {
        rounds: pc.objectiveMode ? 99 : (pc.rounds || 3),
        duration: pc.objectiveMode ? 9999 : (pc.duration || 60),
        classes: pc.classes || ['CP','CE1','CE2','CM1','CM2'],
        themes: pc.themes || [],
        extras: pc.extras || [],
        objectiveMode: !!pc.objectiveMode,
        objectiveTarget: pc.objectiveTarget || null,
        objectiveThemes: pc.objectiveThemes || [],
        helpEnabled: !!pc.helpEnabled,
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
            Créez des groupes d'au moins 2 élèves et lancez des matchs compétitifs
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
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 8 }}>
            {students.map(s => {
              const isInGroup = studentsInGroups.has(s.id);
              const isSelected = selectedStudents.includes(s.id);
              const isDisabled = isInGroup;
              
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
      </section>
      
      {/* Liste des groupes créés — organisés par tour */}
      {(() => {
        // Regrouper par tour_number
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
                  {group.match_id && (
                    <>
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
                      {group.status !== 'finished' && group.status !== 'playing' && (
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
                    </>
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
        // Vérifier si le tour suivant existe déjà
        const nextTourExists = tourStatus.tours.some(t => t.tourNumber === (lastComplete?.tourNumber || 0) + 1);

        return (
          <section style={{ marginTop: 24, padding: 20, background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', borderRadius: 16, border: '2px solid #86efac' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#065f46' }}>
              🏆 Progression du tournoi
            </h3>

            {/* Résumé des tours */}
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

            {/* Gagnant de classe */}
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

            {/* Bouton créer tour suivant */}
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
                        mode: 'arena',
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
