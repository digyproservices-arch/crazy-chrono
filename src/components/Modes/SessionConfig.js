import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataContext } from '../../context/DataContext';
import { isFree } from '../../utils/subscription';

const CLASS_LEVELS = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
const LEVEL_INDEX = Object.fromEntries(CLASS_LEVELS.map((l, i) => [l, i]));

// Categories already included at each level (cumulative from lower levels)
const LEVEL_INCLUDES = {
  'CP':  new Set(['category:addition']),
  'CE1': new Set(['category:addition', 'category:soustraction']),
  'CE2': new Set(['category:addition', 'category:soustraction', 'category:table_2', 'category:table_3', 'category:table_4', 'category:table_5']),
  'CM1': new Set(['category:addition', 'category:soustraction', 'category:table_2', 'category:table_3', 'category:table_4', 'category:table_5', 'category:table_6', 'category:table_7', 'category:table_8', 'category:table_9']),
  'CM2': new Set(['category:addition', 'category:soustraction', 'category:table_2', 'category:table_3', 'category:table_4', 'category:table_5', 'category:table_6', 'category:table_7', 'category:table_8', 'category:table_9', 'category:table_10', 'category:table_11', 'category:table_12']),
  '6e':  new Set(['category:addition', 'category:soustraction', 'category:table_2', 'category:table_3', 'category:table_4', 'category:table_5', 'category:table_6', 'category:table_7', 'category:table_8', 'category:table_9', 'category:table_10', 'category:table_11', 'category:table_12', 'category:division', 'category:numeration']),
  '5e':  new Set(['category:addition', 'category:soustraction', 'category:table_2', 'category:table_3', 'category:table_4', 'category:table_5', 'category:table_6', 'category:table_7', 'category:table_8', 'category:table_9', 'category:table_10', 'category:table_11', 'category:table_12', 'category:division', 'category:numeration', 'category:fraction']),
  '4e':  new Set(['category:addition', 'category:soustraction', 'category:table_2', 'category:table_3', 'category:table_4', 'category:table_5', 'category:table_6', 'category:table_7', 'category:table_8', 'category:table_9', 'category:table_10', 'category:table_11', 'category:table_12', 'category:division', 'category:numeration', 'category:fraction', 'category:equation']),
  '3e':  new Set(['category:addition', 'category:soustraction', 'category:table_2', 'category:table_3', 'category:table_4', 'category:table_5', 'category:table_6', 'category:table_7', 'category:table_8', 'category:table_9', 'category:table_10', 'category:table_11', 'category:table_12', 'category:division', 'category:numeration', 'category:fraction', 'category:equation', 'category:multiplication_avancee']),
};

const CATEGORY_LABELS = {
  'category:fruit': '🍎 Fruits',
  'category:epice': '🌶️ Épices',
  'category:plante_medicinale': '🌿 Plantes médicinales',
  'category:plante_aromatique': '🌱 Plantes aromatiques',
  'category:fleur': '🌺 Fleurs',
  'category:tubercule': '🥔 Tubercules',
  'category:arbre': '🌳 Arbres',
  'category:legumineuse': '🫘 Légumineuses',
  'category:legume': '🥬 Légumes',
  'category:cereale': '🌾 Céréales',
  'category:palmier': '🌴 Palmiers',
  'category:table_2': '×2 Table de 2',
  'category:table_3': '×3 Table de 3',
  'category:table_4': '×4 Table de 4',
  'category:table_5': '×5 Table de 5',
  'category:table_6': '×6 Table de 6',
  'category:table_7': '×7 Table de 7',
  'category:table_8': '×8 Table de 8',
  'category:table_9': '×9 Table de 9',
  'category:table_10': '×10 Table de 10',
  'category:table_11': '×11 Table de 11',
  'category:table_12': '×12 Table de 12',
  'category:addition': '➕ Additions',
  'category:soustraction': '➖ Soustractions',
  'category:division': '➗ Divisions',
  'category:fraction': '🔣 Fractions',
  'category:equation': '📐 Équations',
  'category:numeration': '🔢 Numération',
  'category:multiplication_avancee': '✖️ Mult. avancées',
  'category:table_15': '×15 Table de 15',
};

const PLAYER_ZONES = [
  { key: 'guadeloupe', label: 'Guadeloupe', icon: '🏝️' },
  { key: 'martinique', label: 'Martinique', icon: '🏝️' },
  { key: 'guyane', label: 'Guyane', icon: '🌴' },
  { key: 'reunion', label: 'Réunion', icon: '🌋' },
  { key: 'mayotte', label: 'Mayotte', icon: '🏝️' },
  { key: 'haiti', label: 'Haïti', icon: '🇭🇹' },
  { key: 'cuba', label: 'Cuba', icon: '🇨🇺' },
  { key: 'trinidad', label: 'Trinidad', icon: '🇹🇹' },
  { key: 'france', label: 'France métro.', icon: '🇫🇷' },
  { key: 'senegal', label: 'Sénégal', icon: '🇸🇳' },
  { key: 'cote_ivoire', label: "Côte d'Ivoire", icon: '🇨🇮' },
  { key: 'cameroun', label: 'Cameroun', icon: '🇨🇲' },
  { key: 'madagascar', label: 'Madagascar', icon: '🇲🇬' },
  { key: 'polynesie', label: 'Polynésie', icon: '🌺' },
  { key: 'nouvelle_caledonie', label: 'Nlle-Calédonie', icon: '🏝️' },
];

const MODE_META = {
  solo: { icon: '🎮', label: 'Solo', desc: 'Jouez seul et progressez à votre rythme' },
  online: { icon: '🌐', label: 'Multijoueur en ligne', desc: 'Affrontez d\'autres joueurs en temps réel' },
  classroom: { icon: '🏫', label: 'Classe', desc: 'Session encadrée par un enseignant' },
  tournament: { icon: '🏆', label: 'Tournoi', desc: 'Compétition Battle Royale entre joueurs' },
};

const CONTENT_DOMAINS = [
  { key: 'nature', domain: 'domain:botany', icon: '🌿', label: 'Nature',
    color: '#16a34a', bg: '#f0fdf4', tags: ['botanique', 'domain:botany'],
    categories: ['category:plante_medicinale', 'category:epice', 'category:fruit', 'category:fleur', 'category:tubercule', 'category:legumineuse', 'category:plante_aromatique'],
    hasGeo: true },
  { key: 'animaux', domain: 'domain:zoology', icon: '🐾', label: 'Animaux',
    color: '#ea580c', bg: '#fff7ed', tags: ['animaux', 'domain:zoology'], categories: [] },
  { key: 'math', domain: 'domain:math', icon: '🔢', label: 'Mathématiques',
    color: '#2563eb', bg: '#eff6ff', tags: ['domain:math', 'multiplication'],
    categories: [
      'category:addition', 'category:soustraction',
      'category:table_2', 'category:table_3', 'category:table_4', 'category:table_5',
      'category:table_6', 'category:table_7', 'category:table_8', 'category:table_9',
      'category:table_10', 'category:table_11', 'category:table_12', 'category:table_15',
      'category:division', 'category:fraction', 'category:equation', 'category:numeration',
      'category:multiplication_avancee',
    ] },
];

const ZONE_GROUPS = [
  { label: 'Caraïbes & Amériques', keys: ['guadeloupe', 'martinique', 'guyane', 'haiti', 'cuba', 'trinidad'] },
  { label: 'Océan Indien', keys: ['reunion', 'mayotte', 'madagascar'] },
  { label: 'Afrique', keys: ['senegal', 'cote_ivoire', 'cameroun'] },
  { label: 'Pacifique & Europe', keys: ['france', 'polynesie', 'nouvelle_caledonie'] },
];

const CARD = { background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', marginBottom: 16 };
const SECTION_TITLE = { fontSize: 15, fontWeight: 800, color: '#0D6A7A', marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 };


export default function SessionConfig() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const { data } = useContext(DataContext);

  // Gate abonnement: multijoueur réservé aux abonnés
  useEffect(() => {
    if (mode === 'online' && isFree()) {
      navigate('/pricing', { replace: true });
    }
  }, [mode, navigate]);

  // Sélections
  // B4: sélection unique de niveau (radio) — le cumul est calculé automatiquement
  const [selectedLevel, setSelectedLevel] = useState('CP');
  // Calcul automatique des classes cumulatives (CE1 → ["CP","CE1"])
  const selectedClasses = useMemo(() => {
    const idx = LEVEL_INDEX[selectedLevel] ?? 0;
    return CLASS_LEVELS.slice(0, idx + 1);
  }, [selectedLevel]);
  // B4: matières bonus (ex: soustractions, multiplications hors programme)
  const [selectedExtras, setSelectedExtras] = useState([]);
  // Categories already covered by the selected level — used to hide redundant extras
  const levelIncludes = useMemo(() => LEVEL_INCLUDES[selectedLevel] || new Set(), [selectedLevel]);
  const [enabledDomains, setEnabledDomains] = useState(() => {
    const init = {};
    CONTENT_DOMAINS.forEach(d => { init[d.key] = true; });
    return init;
  });
  // Garder des strings pour permettre la saisie sans "saut" (ex: vide, 1 puis 10, etc.)
  const [rounds, setRounds] = useState('3');
  const [duration, setDuration] = useState('60');
  const [allowEmptyMath, setAllowEmptyMath] = useState(true);
  const [objectiveMode, setObjectiveMode] = useState(false);
  const [objectiveTarget, setObjectiveTarget] = useState(10);
  const [objectiveThemes, setObjectiveThemes] = useState([]);
  const [helpEnabled, setHelpEnabled] = useState(false);
  const [playerZone, setPlayerZone] = useState(() => {
    try { return localStorage.getItem('cc_player_zone') || ''; } catch { return ''; }
  });

  // Detect PWA install banner height to shift action bar above it
  const [pwaBarHeight, setPwaBarHeight] = useState(() => document.body.style.paddingBottom || 0);
  useEffect(() => {
    const check = () => setPwaBarHeight(document.body.style.paddingBottom || 0);
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    return () => obs.disconnect();
  }, []);

  // ===== Mode-spécifique =====
  // Online (multijoueur)
  const [playerName, setPlayerName] = useState(() => {
    try {
      const a = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (a.name && a.name !== 'Utilisateur') return a.name;
      if (a.firstName) return [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
      if (a.email) return a.email.split('@')[0];
    } catch {}
    return '';
  });
  const [roomMode, setRoomMode] = useState('create'); // 'create' | 'join'
  const [roomCode, setRoomCode] = useState('');
  const [inLobby, setInLobby] = useState(false); // Salle d'attente
  const [lobbyPlayers, setLobbyPlayers] = useState([]); // Joueurs dans la salle
  const genCode = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
    setRoomCode(code);
  };

  // Classroom
  const [teacherName, setTeacherName] = useState('');
  const [students, setStudents] = useState([]); // [{id, name, licensed:true}]
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  useEffect(() => {
    if (mode !== 'classroom') return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('http://localhost:4000/students');
        if (!res.ok) throw new Error('http');
        const arr = await res.json();
        if (!cancelled) setStudents(Array.isArray(arr) ? arr : []);
      } catch {
        // Fallback local si backend absent
        const demo = [
          { id: 's1', name: 'Alice B.', licensed: true },
          { id: 's2', name: 'Boris C.', licensed: true },
          { id: 's3', name: 'Chloé D.', licensed: false },
          { id: 's4', name: 'David E.', licensed: true },
        ];
        if (!cancelled) setStudents(demo);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [mode]);
  const toggleStudent = (id) => {
    setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  };
  const filteredStudents = useMemo(() => {
    const q = studentQuery.toLowerCase().trim();
    return students.filter(s => (s.licensed) && (!q || (s.name||'').toLowerCase().includes(q)));
  }, [students, studentQuery]);

  // ===== Normalisation de niveau =====
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

  // Compteurs d'associations par tag (domaine + catégorie) pour les niveaux sélectionnés
  const categoryCounts = useMemo(() => {
    const maxIdx = Math.max(...selectedClasses.map(c => LEVEL_INDEX[NORM_LEVEL(c)] ?? -1));
    const matchLevel = (obj) => {
      if (selectedClasses.length === 0) return true;
      const lc = obj?.levelClass ? [String(obj.levelClass)] : [];
      const arr = obj?.levels || obj?.classes || obj?.classLevels || [];
      const vals = [...lc, ...arr].map(NORM_LEVEL).filter(Boolean);
      return vals.length === 0 || vals.some(v => (LEVEL_INDEX[v] ?? 99) <= maxIdx);
    };
    const counts = {};
    (data?.associations || []).forEach(a => {
      if (!matchLevel(a)) return;
      (a?.themes || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });
    return counts;
  }, [data, selectedClasses]);

  // Compteurs globaux (tous niveaux) — pour afficher les bonus au-delà du niveau sélectionné
  const globalCategoryCounts = useMemo(() => {
    const counts = {};
    (data?.associations || []).forEach(a => {
      (a?.themes || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });
    return counts;
  }, [data]);

  // Thèmes dérivés des domaines activés (envoyés au serveur)
  const computedThemes = useMemo(() => {
    const allEnabled = CONTENT_DOMAINS.every(d => enabledDomains[d.key]);
    if (allEnabled && selectedExtras.length === 0) return [];
    const tags = [];
    CONTENT_DOMAINS.forEach(d => {
      if (enabledDomains[d.key]) {
        tags.push(...d.tags);
        d.categories.forEach(c => tags.push(c));
      }
    });
    selectedExtras.forEach(e => { if (!tags.includes(e)) tags.push(e); });
    return tags;
  }, [enabledDomains, selectedExtras]);

  // Sélection exclusive de niveau (radio) — auto-supprime les extras devenus redondants
  const selectLevel = (lv) => {
    setSelectedLevel(lv);
    const inc = LEVEL_INCLUDES[lv] || new Set();
    setSelectedExtras(prev => prev.filter(e => !inc.has(e)));
  };

  const toggleExtra = (cat) => {
    setSelectedExtras(prev => prev.includes(cat) ? prev.filter(x => x !== cat) : [...prev, cat]);
  };

  const toggleDomain = (key) => {
    setEnabledDomains(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Estimation de suffisance des données pour la config courante
  const dataStats = useMemo(() => {
    const maxIdx = Math.max(...selectedClasses.map(c => LEVEL_INDEX[NORM_LEVEL(c)] ?? -1));
    const themeSet = new Set(computedThemes);
    const matchLevel = (obj) => {
      if (selectedClasses.length === 0) return true;
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
  }, [data, selectedClasses, computedThemes]);

  // Prefill depuis une éventuelle config stockée
  useEffect(() => {
    try {
      const prev = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
      if (prev && typeof prev === 'object') {
        // B4: rétro-compatibilité — extraire le niveau max depuis l'ancien tableau classes
        if (prev.selectedLevel && CLASS_LEVELS.includes(prev.selectedLevel)) {
          setSelectedLevel(prev.selectedLevel);
        } else if (Array.isArray(prev.classes) && prev.classes.length) {
          const maxLv = prev.classes.reduce((best, c) => {
            const i = LEVEL_INDEX[c] ?? -1;
            return i > (LEVEL_INDEX[best] ?? -1) ? c : best;
          }, prev.classes[0]);
          if (maxLv) setSelectedLevel(maxLv);
        }
        if (Array.isArray(prev.extras)) setSelectedExtras(prev.extras);
        if (prev.enabledDomains && typeof prev.enabledDomains === 'object') {
          setEnabledDomains(prev.enabledDomains);
        } else if (Array.isArray(prev.themes) && prev.themes.length > 0) {
          const ts = new Set(prev.themes);
          const ed = {};
          CONTENT_DOMAINS.forEach(d => {
            ed[d.key] = d.tags.some(t => ts.has(t)) || d.categories.some(t => ts.has(t));
          });
          if (Object.values(ed).some(v => v)) setEnabledDomains(ed);
        }
        if (prev.rounds != null) setRounds(String(prev.rounds));
        if (prev.duration != null) setDuration(String(prev.duration));
        if (typeof prev.allowEmptyMathWhenNoData === 'boolean') setAllowEmptyMath(prev.allowEmptyMathWhenNoData);
        if (typeof prev.objectiveMode === 'boolean') setObjectiveMode(prev.objectiveMode);
        if (prev.objectiveTarget != null) setObjectiveTarget(clampInt(prev.objectiveTarget, 3, 50, 10));
        if (Array.isArray(prev.objectiveThemes)) setObjectiveThemes(prev.objectiveThemes);
        if (typeof prev.helpEnabled === 'boolean') setHelpEnabled(prev.helpEnabled);
        if (prev.playerZone) setPlayerZone(prev.playerZone);
      }
    } catch {}
  }, []);

  // Persister les modifications pendant la saisie (léger debounce)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const payload = {
          mode,
          selectedLevel,
          classes: selectedClasses,
          extras: selectedExtras,
          themes: computedThemes,
          enabledDomains,
          rounds,
          duration,
          allowEmptyMathWhenNoData: !!allowEmptyMath,
          playerZone: playerZone || '',
          objectiveMode: !!objectiveMode,
          objectiveTarget: objectiveMode ? objectiveTarget : null,
          objectiveThemes: objectiveMode ? computedThemes : [],
          helpEnabled: !!helpEnabled,
        };
        localStorage.setItem('cc_session_cfg', JSON.stringify(payload));
        if (playerZone) localStorage.setItem('cc_player_zone', playerZone);
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [mode, selectedLevel, selectedClasses, selectedExtras, computedThemes, enabledDomains, rounds, duration, allowEmptyMath, playerZone, objectiveMode, objectiveTarget, helpEnabled]);

  const clampInt = (val, lo, hi, fallback) => {
    const n = parseInt(String(val), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  };

  // Steppers for better UX (no focus issues on mobile)
  const FREE_MAX_ROUNDS = 3;
  const FREE_MAX_DURATION = 120;
  const maxRounds = isFree() ? FREE_MAX_ROUNDS : 20;
  const maxDuration = isFree() ? FREE_MAX_DURATION : 600;

  const stepRounds = (delta) => {
    setRounds(prev => String(clampInt((parseInt(prev, 10) || 3) + delta, 1, maxRounds, 3)));
  };
  const stepDuration = (delta) => {
    setDuration(prev => String(clampInt((parseInt(prev, 10) || 60) + delta, 15, maxDuration, 60)));
  };

  const onStart = () => {
    // Règle simple: si des thèmes sont sélectionnés, on ne garde QUE ceux-ci; sinon, tout est autorisé
    const r = clampInt(rounds, 1, maxRounds, 3);
    const d = clampInt(duration, 15, maxDuration, 60);
    const payload = { mode, selectedLevel, classes: selectedClasses, extras: selectedExtras, themes: computedThemes, enabledDomains, rounds: r, duration: objectiveMode ? null : d, allowEmptyMathWhenNoData: !!allowEmptyMath, playerZone: playerZone || '', objectiveMode: !!objectiveMode, objectiveTarget: objectiveMode ? objectiveTarget : null, objectiveThemes: objectiveMode ? computedThemes : [], helpEnabled: !!helpEnabled };
    if (mode === 'online') {
      payload.playerName = playerName || 'Joueur';
      payload.room = { type: roomMode, code: (roomCode||'').toUpperCase() };
    }
    if (mode === 'classroom') {
      payload.classroom = { teacherName: teacherName || '', studentIds: selectedStudentIds };
    }
    try { localStorage.setItem('cc_session_cfg', JSON.stringify(payload)); } catch {}
    
    // Redirection selon le mode
    if (mode === 'tournament') {
      // Mode tournoi : rediriger vers Battle Royale Setup
      navigate('/tournament/setup');
    } else {
      // Autres modes : rediriger vers la carte normale
      navigate('/carte');
    }
    
    // Un event global si utile
    try { window.dispatchEvent(new CustomEvent('cc:sessionConfigured', { detail: payload })); } catch {}
  };

  const modeMeta = MODE_META[mode] || { icon: '🎮', label: mode, desc: '' };
  const PILL = (sel) => ({
    padding: '7px 14px', borderRadius: 10, border: sel ? '2px solid #0D6A7A' : '2px solid #e2e8f0',
    background: sel ? '#0D6A7A' : '#fff', color: sel ? '#fff' : '#475569',
    fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
  });
  const PILL_ZONE = (sel) => ({
    padding: '6px 12px', borderRadius: 10, border: sel ? '2px solid #0D6A7A' : '2px solid #e2e8f0',
    background: sel ? '#0D6A7A' : '#fff', color: sel ? '#fff' : '#475569',
    fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
  });

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 16px 80px' }}>

      {/* ===== MODE BANNER ===== */}
      <div style={{ background: 'linear-gradient(135deg, #0D6A7A 0%, #1AACBE 100%)', borderRadius: 18, padding: '24px 28px', marginBottom: 20, color: '#fff', boxShadow: '0 4px 20px rgba(13,106,122,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 36 }}>{modeMeta.icon}</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Configurer la session</h1>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 2 }}>Mode {modeMeta.label} — {modeMeta.desc}</div>
          </div>
        </div>
      </div>

      {/* ===== 1. NIVEAU SCOLAIRE (sélection unique) ===== */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}><span>📚</span> Niveau scolaire</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '-4px 0 12px', lineHeight: 1.5 }}>
          Choisissez un niveau. Tout le contenu des niveaux inférieurs est automatiquement inclus.
        </p>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Primaire</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {["CP","CE1","CE2","CM1","CM2"].map(lv => (
              <button key={lv} onClick={() => selectLevel(lv)} style={PILL(selectedLevel === lv)}>{lv}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Collège</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {["6e","5e","4e","3e"].map(lv => (
              <button key={lv} onClick={() => selectLevel(lv)} style={PILL(selectedLevel === lv)}>{lv}</button>
            ))}
          </div>
        </div>
        {selectedLevel && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#0D6A7A', fontWeight: 600, background: '#f0fdfa', padding: '8px 12px', borderRadius: 8, border: '1px solid #99f6e4' }}>
            Contenu inclus : {selectedClasses.join(' + ')}
          </div>
        )}
      </div>

      {/* ===== 2. QUE VEUX-TU RÉVISER ? ===== */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}><span>🎯</span> Que veux-tu réviser ?</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '-4px 0 14px', lineHeight: 1.5 }}>
          Active ou désactive les domaines. Dans Mathématiques, les contenus de ton niveau sont automatiquement inclus (✅). Tu peux ajouter des bonus (➕).
        </p>

        {CONTENT_DOMAINS.map(dom => {
          const enabled = !!enabledDomains[dom.key];
          const domCount = dom.tags.reduce((s, t) => s + (categoryCounts[t] || 0), 0)
            + dom.categories.reduce((s, c) => s + (categoryCounts[c] || 0), 0);
          return (
            <div key={dom.key} style={{ marginBottom: 14, borderRadius: 12, border: `2px solid ${enabled ? dom.color + '44' : '#e2e8f0'}`, background: enabled ? dom.bg : '#fafafa', overflow: 'hidden', transition: 'all 0.2s' }}>
              {/* En-tête du domaine */}
              <div onClick={() => toggleDomain(dom.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ position: 'relative', width: 40, height: 22, borderRadius: 11, background: enabled ? dom.color : '#cbd5e1', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: enabled ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
                <span style={{ fontSize: 22 }}>{dom.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: enabled ? dom.color : '#94a3b8' }}>{dom.label}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{domCount} paire{domCount > 1 ? 's' : ''} disponible{domCount > 1 ? 's' : ''}</div>
                </div>
              </div>

              {/* Contenu du domaine (visible si activé) */}
              {enabled && (
                <div style={{ padding: '0 16px 14px' }}>

                  {/* Sous-catégories nature */}
                  {dom.categories.length > 0 && dom.key !== 'math' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {dom.categories.map(cat => {
                        const cnt = categoryCounts[cat] || 0;
                        if (cnt === 0) return null;
                        return (
                          <span key={cat} style={{ padding: '4px 10px', borderRadius: 8, background: dom.color + '18', color: dom.color, fontSize: 11, fontWeight: 600 }}>
                            {CATEGORY_LABELS[cat] || cat.replace('category:', '')} ({cnt})
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Zone géographique (inline dans Nature) */}
                  {dom.hasGeo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>🌍 Noms locaux :</span>
                      <select value={playerZone} onChange={e => setPlayerZone(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#334155', background: '#fff', cursor: 'pointer' }}>
                        <option value="">Toutes zones</option>
                        {ZONE_GROUPS.map(grp => (
                          <optgroup key={grp.label} label={grp.label}>
                            {grp.keys.map(k => {
                              const z = PLAYER_ZONES.find(pz => pz.key === k);
                              return z ? <option key={k} value={k}>{z.icon} {z.label}</option> : null;
                            })}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Mathématiques : inclus + bonus */}
                  {dom.key === 'math' && (() => {
                    const included = dom.categories.filter(c => levelIncludes.has(c));
                    const bonus = dom.categories.filter(c => !levelIncludes.has(c) && (globalCategoryCounts[c] || 0) > 0);
                    return (
                      <>
                        {included.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>✅ Inclus dans ton niveau ({selectedLevel})</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {included.map(cat => {
                                const cnt = categoryCounts[cat] || 0;
                                return (
                                  <span key={cat} style={{ padding: '5px 10px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a', fontSize: 11, fontWeight: 600 }}>
                                    {CATEGORY_LABELS[cat] || cat.replace('category:', '')} {cnt > 0 && <span style={{ opacity: 0.7 }}>({cnt})</span>}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {bonus.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>➕ Bonus (cliquer pour ajouter)</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {bonus.map(cat => {
                                const sel = selectedExtras.includes(cat);
                                const cnt = globalCategoryCounts[cat] || 0;
                                return (
                                  <button key={cat} onClick={() => toggleExtra(cat)}
                                    style={{ padding: '5px 10px', borderRadius: 8, border: sel ? '2px solid #f59e0b' : '2px solid #e2e8f0', background: sel ? '#f59e0b' : '#fff', color: sel ? '#fff' : '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                                    {CATEGORY_LABELS[cat] || cat.replace('category:', '')} ({cnt})
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {/* Résumé données */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 18 }}>🖼️</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: dataStats.textImage > 0 ? '#0D6A7A' : '#dc2626' }}>{dataStats.textImage}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: -2 }}>Image / Texte</div>
            </div>
          </div>
          <div style={{ width: 1, background: '#e2e8f0', margin: '0 4px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 18 }}>🔢</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: dataStats.calcNum > 0 ? '#0D6A7A' : '#dc2626' }}>{dataStats.calcNum}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: -2 }}>Calcul / Chiffre</div>
            </div>
          </div>
          {selectedExtras.length > 0 && (
            <>
              <div style={{ width: 1, background: '#e2e8f0', margin: '0 4px' }} />
              <div style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                {selectedExtras.length} bonus actif{selectedExtras.length > 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>

        {/* Avertissement si contenu limité */}
        {(dataStats.textImage === 0 || dataStats.calcNum === 0) && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, border: '1px solid #fde68a', background: '#fffbeb', fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚠️ Contenu limité</div>
            <div style={{ color: '#78350f', lineHeight: 1.5 }}>
              Certaines catégories manquent de données. Des zones pourront rester vides.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: '#92400e', cursor: 'pointer' }}>
              <input type="checkbox" checked={allowEmptyMath} onChange={e => setAllowEmptyMath(e.target.checked)} />
              Autoriser les zones vides si aucune association disponible
            </label>
          </div>
        )}
      </div>

      {/* ===== 3. COMMENT JOUER ? ===== */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}><span>⚙️</span> Comment jouer ?</h3>

        {/* Mode Objectif toggle */}
        {(() => {
          const locked = isFree();
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, padding: '12px 16px', borderRadius: 12, border: objectiveMode && !locked ? '2px solid #0D6A7A' : '2px solid #e2e8f0', background: objectiveMode && !locked ? '#f0fdfa' : '#fff', position: 'relative', transition: 'all 0.2s' }}>
              {locked && (
                <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 10, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', padding: '2px 8px', borderRadius: 6 }}>PRO</div>
              )}
              <div onClick={() => { if (!locked) setObjectiveMode(p => !p); }}
                style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: objectiveMode && !locked ? '#0D6A7A' : '#cbd5e1', transition: 'background 0.2s', cursor: locked ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: objectiveMode && !locked ? 22 : 2, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: locked ? '#94a3b8' : '#334155' }}>🎯 Mode Objectif</div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginTop: 2 }}>
                  {locked
                    ? <>Réservé aux abonnés. <a href="/pricing" style={{ color: '#0D6A7A', fontWeight: 700 }}>Passer en Pro</a></>
                    : objectiveMode
                      ? 'Activé — Pas de limite de temps. Trouvez toutes les paires pour terminer.'
                      : 'Sans limite de temps. Les domaines activés deviennent vos objectifs.'}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Manches & Durée — masqués en mode objectif */}
        {!objectiveMode && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>🔄 Nombre de manches</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => stepRounds(-1)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>−</button>
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', fontWeight: 800, fontSize: 18, color: '#0D6A7A' }}>{rounds}</div>
                <button onClick={() => stepRounds(+1)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>+</button>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>1 à {maxRounds} manches{isFree() ? ' (Free)' : ''}</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>⏱️ Durée par manche</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => stepDuration(-5)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>−5</button>
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', fontWeight: 800, fontSize: 18, color: '#0D6A7A' }}>{duration}<span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>s</span></div>
                <button onClick={() => stepDuration(+5)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>+5</button>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>15 à {maxDuration} secondes{isFree() ? ' (Free)' : ''}</div>
            </div>
          </div>
        )}

        {/* Système d'aide */}
        <div style={{ padding: '14px 16px', borderRadius: 12, border: helpEnabled ? '2px solid #f59e0b' : '2px solid #e2e8f0', background: helpEnabled ? '#fffbeb' : '#fff', transition: 'all 0.2s' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={helpEnabled} onChange={e => setHelpEnabled(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#f59e0b' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>💡 Système d'aide</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                Bouton d'aide pendant la partie. Niveau 1 : indice subtil (+5s). Niveau 2 : réponse complète (+10s).
              </div>
            </div>
          </label>
        </div>
        {isFree() && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
            ⚠️ Plan gratuit : max {FREE_MAX_ROUNDS} manches et {FREE_MAX_DURATION}s par manche.
            <a href="/pricing" style={{ color: '#0D6A7A', fontWeight: 700, marginLeft: 4 }}>Passer en Pro</a> pour débloquer toutes les options.
          </div>
        )}
      </div>

      {/* ===== 5. MODE-SPÉCIFIQUE: Multijoueur ===== */}
      {mode === 'online' && (
        <div style={CARD}>
          <h3 style={SECTION_TITLE}><span>🌐</span> Multijoueur en ligne</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Nom du joueur</label>
              <input value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="ex: Léa"
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Type de salle</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setRoomMode('create')} style={PILL(roomMode === 'create')}>Créer</button>
                <button onClick={() => setRoomMode('join')} style={PILL(roomMode === 'join')}>Rejoindre</button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Code de salle</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder={roomMode==='create' ? 'Générer un code' : 'Saisir le code'}
                  style={{ flex: 1, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 13, letterSpacing: '0.1em', fontWeight: 700 }} />
                {roomMode==='create' && (
                  <button onClick={genCode} style={{ padding: '10px 14px', borderRadius: 10, border: '2px solid #0D6A7A', background: '#f0fdfa', color: '#0D6A7A', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Générer</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 5. MODE-SPÉCIFIQUE: Classe ===== */}
      {mode === 'classroom' && (
        <div style={CARD}>
          <h3 style={SECTION_TITLE}><span>🏫</span> Configuration de la classe</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Nom de l'enseignant(e)</label>
              <input value={teacherName} onChange={e=>setTeacherName(e.target.value)} placeholder="ex: Mme Martin"
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Élèves (licences actives)</label>
              <input value={studentQuery} onChange={e=>setStudentQuery(e.target.value)} placeholder="🔍 Rechercher un élève..."
                style={{ width: '100%', padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ border: '2px solid #e2e8f0', borderRadius: 10, padding: 10, maxHeight: 200, overflow: 'auto' }}>
                {filteredStudents.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', borderRadius: 6, cursor: 'pointer', background: selectedStudentIds.includes(s.id) ? '#f0fdfa' : 'transparent' }}>
                    <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={()=>toggleStudent(s.id)} />
                    <span style={{ fontSize: 13, fontWeight: selectedStudentIds.includes(s.id) ? 700 : 400, color: '#334155' }}>{s.name}</span>
                  </label>
                ))}
                {filteredStudents.length === 0 && (
                  <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 12 }}>Aucun élève trouvé</div>
                )}
              </div>
              {selectedStudentIds.length > 0 && (
                <div style={{ fontSize: 11, color: '#0D6A7A', fontWeight: 600, marginTop: 6 }}>{selectedStudentIds.length} élève(s) sélectionné(s)</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== ACTION BAR (sticky bottom — above PWA banner if visible) ===== */}
      <div style={{ position: 'fixed', bottom: pwaBarHeight, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', justifyContent: 'center', gap: 12, zIndex: 100, boxShadow: '0 -2px 10px rgba(0,0,0,0.06)', transition: 'bottom 0.3s ease' }}>
        <button onClick={() => navigate('/modes')}
          style={{ padding: '12px 24px', borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          ← Retour
        </button>
        <button onClick={onStart}
          style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #0D6A7A 0%, #1AACBE 100%)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 14px rgba(13,106,122,0.35)', letterSpacing: '-0.01em' }}>
          {modeMeta.icon} Démarrer la partie
        </button>
      </div>
    </div>
  );
}
