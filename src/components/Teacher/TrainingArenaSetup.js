// ==========================================
// COMPOSANT: CONFIGURATION BATTLE ROYALE (Groupes de 4)
// Interface enseignant pour créer des groupes et lancer les matchs
// ==========================================

import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders } from '../../utils/apiHelpers';
import { DataContext } from '../../context/DataContext';

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

// ===== Constantes pédagogiques (partagées avec SessionConfig) =====
const CLASS_LEVELS = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
const LEVEL_INDEX = Object.fromEntries(CLASS_LEVELS.map((l, i) => [l, i]));
const NORM_LEVEL = (s) => {
  const x = String(s || '').toLowerCase();
  if (/\bcp\b/.test(x)) return 'CP';
  if (/\bce1\b/.test(x)) return 'CE1';
  if (/\bce2\b/.test(x)) return 'CE2';
  if (/\bcm1\b/.test(x)) return 'CM1';
  if (/\bcm2\b/.test(x)) return 'CM2';
  if (/\b6e\b|\bsixieme\b/.test(x)) return '6e';
  if (/\b5e\b|\bcinquieme\b/.test(x)) return '5e';
  if (/\b4e\b|\bquatrieme\b/.test(x)) return '4e';
  if (/\b3e\b|\btroisieme\b/.test(x)) return '3e';
  return '';
};

const DOMAIN_LABELS = {
  'domain:botany': { label: 'Botanique', icon: '🌿', color: '#16a34a', bg: '#f0fdf4' },
  'domain:zoology': { label: 'Zoologie', icon: '🐾', color: '#ea580c', bg: '#fff7ed' },
  'domain:math': { label: 'Mathématiques', icon: '🔢', color: '#2563eb', bg: '#eff6ff' },
  'domain:language': { label: 'Langue', icon: '📝', color: '#7c3aed', bg: '#f5f3ff' },
  'domain:science': { label: 'Sciences', icon: '🔬', color: '#0891b2', bg: '#ecfeff' },
  'domain:geography': { label: 'Géographie', icon: '🌍', color: '#ca8a04', bg: '#fefce8' },
  'domain:history_civics': { label: 'Histoire & EMC', icon: '📜', color: '#b45309', bg: '#fffbeb' },
  'domain:arts': { label: 'Arts', icon: '🎨', color: '#db2777', bg: '#fdf2f8' },
  'domain:culture': { label: 'Culture', icon: '🎭', color: '#9333ea', bg: '#faf5ff' },
  'domain:environment': { label: 'Environnement', icon: '♻️', color: '#059669', bg: '#ecfdf5' },
  'domain:sports': { label: 'Sports', icon: '⚽', color: '#dc2626', bg: '#fef2f2' },
};
const CATEGORY_LABELS = {
  'category:fruit': '🍎 Fruits', 'category:epice': '🌶️ Épices',
  'category:plante_medicinale': '🌿 Plantes médicinales', 'category:plante_aromatique': '🌱 Plantes aromatiques',
  'category:fleur': '🌺 Fleurs', 'category:tubercule': '🥔 Tubercules',
  'category:arbre': '🌳 Arbres', 'category:legumineuse': '🫘 Légumineuses',
  'category:legume': '🥬 Légumes', 'category:cereale': '🌾 Céréales', 'category:palmier': '🌴 Palmiers',
  'category:table_2': '×2', 'category:table_3': '×3', 'category:table_4': '×4',
  'category:table_5': '×5', 'category:table_6': '×6', 'category:table_7': '×7',
  'category:table_8': '×8', 'category:table_9': '×9', 'category:table_10': '×10',
  'category:table_11': '×11', 'category:table_12': '×12',
  'category:addition': '➕ Additions', 'category:soustraction': '➖ Soustractions',
};
function themeDisplayLabel(t) {
  if (DOMAIN_LABELS[t]) return DOMAIN_LABELS[t].icon + ' ' + DOMAIN_LABELS[t].label;
  if (CATEGORY_LABELS[t]) return CATEGORY_LABELS[t];
  if (t.startsWith('region:')) return '🌍 ' + t.slice(7).charAt(0).toUpperCase() + t.slice(8);
  if (t.startsWith('group:')) return '📦 ' + t.slice(6);
  return t;
}

const CARD = { background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', marginBottom: 16 };
const SECTION_TITLE = { fontSize: 15, fontWeight: 800, color: '#0D6A7A', marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 };
const PILL = (sel) => ({
  padding: '7px 14px', borderRadius: 10, border: sel ? '2px solid #0D6A7A' : '2px solid #e2e8f0',
  background: sel ? '#0D6A7A' : '#fff', color: sel ? '#fff' : '#475569',
  fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
});

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

  // ===== Configuration pédagogique (avec persistance localStorage) =====
  const [selClasses, setSelClasses] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem('cc_training_cfg'))?.classes; return Array.isArray(c) && c.length ? c : ["CP","CE1","CE2","CM1","CM2"]; } catch { return ["CP","CE1","CE2","CM1","CM2"]; }
  });
  const [selThemes, setSelThemes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_training_cfg'))?.themes || []; } catch { return []; }
  });
  const [objectiveMode, setObjectiveMode] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem('cc_training_cfg'))?.objectiveMode; } catch { return false; }
  });
  const [matchRounds, setMatchRounds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_training_cfg'))?.rounds || 3; } catch { return 3; }
  });
  const [matchDuration, setMatchDuration] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_training_cfg'))?.duration || 60; } catch { return 60; }
  });
  const [helpEnabled, setHelpEnabled] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem('cc_training_cfg'))?.helpEnabled; } catch { return false; }
  });
  const [isOfficial, setIsOfficial] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem('cc_training_cfg'))?.isOfficial; } catch { return false; }
  });
  const userToggledThemes = useRef((() => {
    try { const t = JSON.parse(localStorage.getItem('cc_training_cfg'))?.themes; return Array.isArray(t) && t.length > 0; } catch { return false; }
  })());

  // Persister la config pédagogique (debounce 300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem('cc_training_cfg', JSON.stringify({
          classes: selClasses, themes: selThemes, objectiveMode, rounds: matchRounds, duration: matchDuration, helpEnabled, isOfficial
        }));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [selClasses, selThemes, objectiveMode, matchRounds, matchDuration, helpEnabled, isOfficial]);

  // Thèmes disponibles filtrés par niveaux sélectionnés
  const allThemes = useMemo(() => {
    if (!data) return [];
    const maxIdx = Math.max(...selClasses.map(c => LEVEL_INDEX[NORM_LEVEL(c)] ?? -1));
    const matchesLevel = (obj) => {
      if (selClasses.length === 0) return true;
      const lc = obj?.levelClass ? [String(obj.levelClass)] : [];
      const arr = obj?.levels || obj?.classes || obj?.classLevels || [];
      const vals = [...lc, ...arr].map(NORM_LEVEL).filter(Boolean);
      return vals.length === 0 || vals.some(v => (LEVEL_INDEX[v] ?? 99) <= maxIdx);
    };
    const bag = new Set();
    (data?.associations || []).forEach(a => {
      if (!matchesLevel(a)) return;
      (a?.themes || []).forEach(t => bag.add(String(t)));
    });
    if (bag.size === 0) {
      const push = (arr) => (arr || []).forEach(x => { if (matchesLevel(x)) (x?.themes || []).forEach(t => bag.add(String(t))); });
      push(data?.textes); push(data?.images); push(data?.calculs); push(data?.chiffres);
    }
    return Array.from(bag).sort();
  }, [data, selClasses]);

  // Découper en domaines / catégories / autres
  const themeFacets = useMemo(() => {
    const d = [], c = [], o = [];
    for (const t of allThemes) {
      if (/^domain:/.test(t)) d.push(t);
      else if (/^category:/.test(t)) c.push(t);
      else o.push(t);
    }
    return { domains: d, categories: c, others: o };
  }, [allThemes]);

  // Auto-sélectionner tous les thèmes quand les niveaux changent (sauf si modifié manuellement)
  useEffect(() => {
    if (!userToggledThemes.current && allThemes.length > 0) {
      setSelThemes(allThemes);
    }
  }, [allThemes]);

  // Stats données pour la config courante
  const dataStats = useMemo(() => {
    if (!data) return { textImage: 0, calcNum: 0 };
    const maxIdx = Math.max(...selClasses.map(c => LEVEL_INDEX[NORM_LEVEL(c)] ?? -1));
    const themeSet = new Set(selThemes);
    const matchLevel = (obj) => {
      if (selClasses.length === 0) return true;
      const lc = obj?.levelClass ? [String(obj.levelClass)] : [];
      const arr = obj?.levels || obj?.classes || obj?.classLevels || [];
      const vals = [...lc, ...arr].map(NORM_LEVEL).filter(Boolean);
      return vals.length === 0 || vals.some(v => (LEVEL_INDEX[v] ?? 99) <= maxIdx);
    };
    const matchTheme = (obj) => {
      const ts = (obj?.themes || []).map(String);
      return themeSet.size === 0 || ts.some(t => themeSet.has(t));
    };
    const assoc = (data?.associations || []);
    const ti = assoc.filter(a => a.texteId && a.imageId && matchLevel(a) && matchTheme(a)).length;
    const cn = assoc.filter(a => a.calculId && a.chiffreId && matchLevel(a) && matchTheme(a)).length;
    return { textImage: ti, calcNum: cn };
  }, [data, selClasses, selThemes]);

  const toggleClass = (lv) => {
    userToggledThemes.current = false;
    setSelClasses(prev => prev.includes(lv) ? prev.filter(x => x !== lv) : [...prev, lv]);
  };
  const toggleTheme = (t) => {
    userToggledThemes.current = true;
    setSelThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };
  
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
      
      if (classId && !localStorage.getItem('cc_class_id')) {
        localStorage.setItem('cc_class_id', classId);
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
      const groupsRes = await fetch(`${backendUrl}/api/tournament/classes/${classId}/groups`, { headers: getAuthHeaders() });
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
      
      // Utiliser la config pédagogique définie par le professeur
      const matchConfig = {
        rounds: objectiveMode ? 99 : matchRounds,
        duration: objectiveMode ? 9999 : matchDuration,
        classes: selClasses,
        themes: selThemes,
        objectiveMode: objectiveMode,
        objectiveTarget: objectiveMode ? selThemes.length : null,
        objectiveThemes: objectiveMode ? selThemes : [],
        helpEnabled: helpEnabled,
        isOfficial: isOfficial,
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
            Créez des groupes de 2 à 4 élèves et lancez des matchs compétitifs
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
      
      {/* ===== CONFIGURATION PÉDAGOGIQUE ===== */}
      <div style={CARD}>
        <div
          onClick={() => setConfigOpen(p => !p)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <h3 style={{ ...SECTION_TITLE, marginBottom: 0 }}>
            <span>📚</span> Configuration pédagogique
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
              <span style={{ padding: '3px 10px', borderRadius: 8, background: '#f0fdfa', color: '#0D6A7A', fontWeight: 700 }}>
                🖼️ {dataStats.textImage} paires
              </span>
              <span style={{ padding: '3px 10px', borderRadius: 8, background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>
                🔢 {dataStats.calcNum} calculs
              </span>
              {objectiveMode && (
                <span style={{ padding: '3px 10px', borderRadius: 8, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                  🎯 Objectif
                </span>
              )}
            </div>
            <span style={{ fontSize: 18, color: '#94a3b8', transition: 'transform 0.2s', transform: configOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
          </div>
        </div>

        {configOpen && (
          <div style={{ marginTop: 16 }}>
            {/* Niveaux scolaires */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Niveaux scolaires</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 60 }}>Primaire</span>
                {["CP","CE1","CE2","CM1","CM2"].map(lv => (
                  <button key={lv} onClick={() => toggleClass(lv)} style={PILL(selClasses.includes(lv))}>{lv}</button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 60 }}>Collège</span>
                {["6e","5e","4e","3e"].map(lv => (
                  <button key={lv} onClick={() => toggleClass(lv)} style={PILL(selClasses.includes(lv))}>{lv}</button>
                ))}
              </div>
            </div>

            {/* Thèmes — Domaines */}
            {themeFacets.domains.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Domaines</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {themeFacets.domains.map(t => {
                    const sel = selThemes.includes(t);
                    const dl = DOMAIN_LABELS[t];
                    return (
                      <button key={t} onClick={() => toggleTheme(t)}
                        style={{ padding: '6px 12px', borderRadius: 10, border: sel ? '2px solid #0D6A7A' : `2px solid ${dl ? dl.color + '44' : '#e2e8f0'}`, background: sel ? '#0D6A7A' : (dl?.bg || '#fff'), color: sel ? '#fff' : (dl?.color || '#475569'), fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                        {themeDisplayLabel(t)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Thèmes — Catégories */}
            {themeFacets.categories.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Catégories</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {themeFacets.categories.map(t => {
                    const sel = selThemes.includes(t);
                    return (
                      <button key={t} onClick={() => toggleTheme(t)}
                        style={{ padding: '6px 12px', borderRadius: 10, border: sel ? '2px solid #0D6A7A' : '2px solid #e2e8f0', background: sel ? '#0D6A7A' : '#fff', color: sel ? '#fff' : '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                        {themeDisplayLabel(t)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Thèmes — Autres */}
            {themeFacets.others.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Autres filtres</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {themeFacets.others.map(t => {
                    const sel = selThemes.includes(t);
                    return (
                      <button key={t} onClick={() => toggleTheme(t)}
                        style={{ padding: '6px 12px', borderRadius: 10, border: sel ? '2px solid #0D6A7A' : '2px solid #e2e8f0', background: sel ? '#0D6A7A' : '#fff', color: sel ? '#fff' : '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                        {themeDisplayLabel(t)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Résumé données */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18 }}>🖼️</span>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: dataStats.textImage > 0 ? '#0D6A7A' : '#dc2626' }}>{dataStats.textImage}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Image / Texte</div>
                </div>
              </div>
              <div style={{ width: 1, background: '#e2e8f0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18 }}>🔢</span>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: dataStats.calcNum > 0 ? '#0D6A7A' : '#dc2626' }}>{dataStats.calcNum}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Calcul / Chiffre</div>
                </div>
              </div>
            </div>

            {/* Mode Objectif + Paramètres */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {/* Mode Objectif */}
              <div style={{ padding: 14, borderRadius: 12, border: objectiveMode ? '2px solid #0D6A7A' : '2px solid #e2e8f0', background: objectiveMode ? '#f0fdfa' : '#fff', transition: 'all 0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div
                    onClick={() => setObjectiveMode(p => !p)}
                    style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: objectiveMode ? '#0D6A7A' : '#cbd5e1', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: objectiveMode ? 22 : 2, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>🎯 Mode Objectif</div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginTop: 2 }}>
                      {objectiveMode
                        ? 'Sans limite de temps. Les élèves jouent jusqu\'à trouver toutes les paires.'
                        : 'Chrono classique avec manches chronométrées.'}
                    </div>
                  </div>
                </label>
              </div>

              {/* Paramètres manches/durée */}
              {!objectiveMode && (
                <div style={{ padding: 14, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>⚙️ Paramètres</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Manches</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setMatchRounds(p => Math.max(1, p - 1))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, cursor: 'pointer' }}>−</button>
                        <span style={{ width: 30, textAlign: 'center', fontWeight: 800, fontSize: 16, color: '#0D6A7A' }}>{matchRounds}</span>
                        <button onClick={() => setMatchRounds(p => Math.min(10, p + 1))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, cursor: 'pointer' }}>+</button>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Durée</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setMatchDuration(p => Math.max(15, p - 15))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer' }}>−</button>
                        <span style={{ width: 40, textAlign: 'center', fontWeight: 800, fontSize: 16, color: '#0D6A7A' }}>{matchDuration}<span style={{ fontSize: 10, color: '#94a3b8' }}>s</span></span>
                        <button onClick={() => setMatchDuration(p => Math.min(300, p + 15))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer' }}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Aide */}
              <div style={{ padding: 14, borderRadius: 12, border: helpEnabled ? '2px solid #f59e0b' : '2px solid #e2e8f0', background: helpEnabled ? '#fffbeb' : '#fff', transition: 'all 0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={helpEnabled} onChange={e => setHelpEnabled(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#f59e0b' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>💡 Système d'aide</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Indices et réponses disponibles pendant le jeu</div>
                  </div>
                </label>
              </div>

              {/* Compétition Officielle */}
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
              <strong>✅ {availableStudents.length} élève(s) disponible(s)</strong> - Sélectionnez 2 à 4 élèves pour créer un groupe ({selectedStudents.length}/4)
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
              const isDisabled = isInGroup || (!isSelected && selectedStudents.length >= 4);
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
