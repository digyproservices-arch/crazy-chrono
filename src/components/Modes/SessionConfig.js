import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataContext } from '../../context/DataContext';
import { isFree } from '../../utils/subscription';

const CLASS_LEVELS = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
const LEVEL_INDEX = Object.fromEntries(CLASS_LEVELS.map((l, i) => [l, i]));

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

const REGION_LABELS = {};
PLAYER_ZONES.forEach(z => { REGION_LABELS['region:' + z.key] = z; });
// Extra region keys that may exist in data
['afrique', 'asie', 'international', 'ameriques', 'caraibes', 'europe', 'oceanie'].forEach(k => {
  if (!REGION_LABELS['region:' + k]) REGION_LABELS['region:' + k] = { key: k, label: k.charAt(0).toUpperCase() + k.slice(1), icon: '🌍' };
});

const ZONE_GROUPS = [
  { label: 'Caraïbes & Amériques', keys: ['guadeloupe', 'martinique', 'guyane', 'haiti', 'cuba', 'trinidad'] },
  { label: 'Océan Indien', keys: ['reunion', 'mayotte', 'madagascar'] },
  { label: 'Afrique', keys: ['senegal', 'cote_ivoire', 'cameroun'] },
  { label: 'Pacifique & Europe', keys: ['france', 'polynesie', 'nouvelle_caledonie'] },
];

const CARD = { background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', marginBottom: 16 };
const SECTION_TITLE = { fontSize: 15, fontWeight: 800, color: '#0D6A7A', marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 };

const SIMPLE_THEME_LABELS = {
  'botanique': '🌿 Botanique',
  'animaux': '🐾 Animaux',
};

function themeDisplayLabel(t) {
  if (DOMAIN_LABELS[t]) return DOMAIN_LABELS[t].icon + ' ' + DOMAIN_LABELS[t].label;
  if (CATEGORY_LABELS[t]) return CATEGORY_LABELS[t];
  if (SIMPLE_THEME_LABELS[t]) return SIMPLE_THEME_LABELS[t];
  if (REGION_LABELS[t]) return (REGION_LABELS[t].icon || '🌍') + ' ' + REGION_LABELS[t].label;
  if (t.startsWith('group:')) return '📦 ' + t.slice(6);
  return t;
}

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
  const [selectedClasses, setSelectedClasses] = useState(["CP","CE1","CE2","CM1","CM2"]);
  const [selectedThemes, setSelectedThemes] = useState([]);
  const userManuallyToggledThemes = useRef(false);
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

  // Helper dans le scope du composant: déterminer si un thème a des données pour les classes sélectionnées
  function themeHasData(theme) {
    try {
      const maxIdx = Math.max(...selectedClasses.map(c => LEVEL_INDEX[NORM_LEVEL(c)] ?? -1));
      const matchLevel = (obj) => {
        if (selectedClasses.length === 0) return true;
        const lc = obj?.levelClass ? [String(obj.levelClass)] : [];
        const arr = obj?.levels || obj?.classes || obj?.classLevels || [];
        const vals = [...lc, ...arr].map(NORM_LEVEL).filter(Boolean);
        return vals.length === 0 || vals.some(v => (LEVEL_INDEX[v] ?? 99) <= maxIdx);
      };
      const matchTheme = (obj) => (obj?.themes || []).map(String).includes(String(theme));
      // 1) Associations
      const assoc = (data?.associations || []);
      const anyAssoc = assoc.some(a => matchLevel(a) && matchTheme(a));
      if (anyAssoc) return true;
      // 2) Fallback éléments
      const anyElem = (arr) => (arr || []).some(x => matchLevel(x) && matchTheme(x));
      return anyElem(data?.textes) || anyElem(data?.images) || anyElem(data?.calculs) || anyElem(data?.chiffres);
    } catch { return false; }
  }

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

  // Thèmes filtrés par niveaux sélectionnés (logique cumulative: CM2 inclut CP→CM2)
  const allThemes = useMemo(() => {
    const maxIdx = Math.max(...selectedClasses.map(c => LEVEL_INDEX[NORM_LEVEL(c)] ?? -1));
    const matchesLevel = (obj) => {
      if (selectedClasses.length === 0) return true;
      const lc = obj?.levelClass ? [String(obj.levelClass)] : [];
      const arr = obj?.levels || obj?.classes || obj?.classLevels || [];
      const vals = [...lc, ...arr].map(NORM_LEVEL).filter(Boolean);
      return vals.length === 0 || vals.some(v => (LEVEL_INDEX[v] ?? 99) <= maxIdx);
    };
    const bag = new Set();
    // 1) Thèmes issus des associations correspondant aux niveaux sélectionnés
    (data?.associations || []).forEach(a => {
      if (!matchesLevel(a)) return;
      (a?.themes || []).forEach(t => bag.add(String(t)));
    });
    // 2) Si aucun thème détecté, fallback sur les éléments (textes/images/calculs/chiffres) filtrés par niveau
    if (bag.size === 0) {
      const push = (arr) => (arr || []).forEach(x => { if (matchesLevel(x)) (x?.themes || []).forEach(t => bag.add(String(t))); });
      push(data?.textes); push(data?.images); push(data?.calculs); push(data?.chiffres);
    }
    return Array.from(bag).sort();
  }, [data, selectedClasses]);

  // Découper les facettes (domain:/region:/group:) et autres thèmes
  const { domains, categories, regions, groups, others } = useMemo(() => {
    const d = new Set(); const c = new Set(); const r = new Set(); const g = new Set(); const o = new Set();
    for (const t of allThemes) {
      if (/^domain:/.test(t)) d.add(t);
      else if (/^category:/.test(t)) c.add(t);
      else if (/^region:/.test(t)) r.add(t);
      else if (/^group:/.test(t)) g.add(t);
      else o.add(t);
    }
    return {
      domains: Array.from(d).sort(),
      categories: Array.from(c).sort(),
      regions: Array.from(r).sort(),
      groups: Array.from(g).sort(),
      others: Array.from(o).sort(),
    };
  }, [allThemes]);

  const toggleClass = (lv) => {
    userManuallyToggledThemes.current = false;
    setSelectedClasses(prev => prev.includes(lv) ? prev.filter(x => x !== lv) : [...prev, lv]);
  };

  const toggleTheme = (t) => {
    userManuallyToggledThemes.current = true;
    setSelectedThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  // Auto-sélectionner tous les thèmes disponibles quand les niveaux changent
  // (sauf si l'utilisateur a manuellement modifié la sélection de thèmes)
  useEffect(() => {
    if (!userManuallyToggledThemes.current && allThemes.length > 0) {
      setSelectedThemes(allThemes);
    }
  }, [allThemes]);

  

  // Estimation de suffisance des données pour la config courante
  const dataStats = useMemo(() => {
    const maxIdx = Math.max(...selectedClasses.map(c => LEVEL_INDEX[NORM_LEVEL(c)] ?? -1));
    const themeSet = new Set(selectedThemes);
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
  }, [data, selectedClasses, selectedThemes]);

  // Prefill depuis une éventuelle config stockée
  useEffect(() => {
    try {
      const prev = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
      if (prev && typeof prev === 'object') {
        if (Array.isArray(prev.classes) && prev.classes.length) setSelectedClasses(prev.classes);
        if (Array.isArray(prev.themes) && prev.themes.length > 0) {
          setSelectedThemes(prev.themes);
          userManuallyToggledThemes.current = true;
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
          classes: selectedClasses,
          themes: selectedThemes,
          rounds,
          duration,
          allowEmptyMathWhenNoData: !!allowEmptyMath,
          playerZone: playerZone || '',
          objectiveMode: !!objectiveMode,
          objectiveTarget: objectiveMode ? objectiveTarget : null,
          objectiveThemes: objectiveMode ? objectiveThemes : [],
          helpEnabled: !!helpEnabled,
        };
        localStorage.setItem('cc_session_cfg', JSON.stringify(payload));
        if (playerZone) localStorage.setItem('cc_player_zone', playerZone);
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [mode, selectedClasses, selectedThemes, rounds, duration, allowEmptyMath, playerZone, objectiveMode, objectiveTarget, objectiveThemes, helpEnabled]);

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
    const payload = { mode, classes: selectedClasses, themes: selectedThemes, rounds: r, duration: objectiveMode ? null : d, allowEmptyMathWhenNoData: !!allowEmptyMath, playerZone: playerZone || '', objectiveMode: !!objectiveMode, objectiveTarget: objectiveMode ? objectiveTarget : null, objectiveThemes: objectiveMode ? objectiveThemes : [], helpEnabled: !!helpEnabled };
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

  const ThemePill = ({ t }) => {
    const sel = selectedThemes.includes(t);
    const hasData = themeHasData(t);
    const dl = DOMAIN_LABELS[t];
    const rl = REGION_LABELS[t];
    let label = themeDisplayLabel(t);
    let pillBg = sel ? '#0D6A7A' : '#fff';
    let pillColor = sel ? '#fff' : '#475569';
    let pillBorder = sel ? '#0D6A7A' : '#e2e8f0';
    if (!sel && dl) { pillBg = dl.bg; pillColor = dl.color; pillBorder = dl.color + '44'; }
    if (!sel && rl) { pillBorder = '#94a3b8'; }
    return (
      <button onClick={() => toggleTheme(t)} disabled={!hasData}
        title={hasData ? (sel ? 'Cliquez pour retirer' : 'Cliquez pour filtrer') : 'Aucune donnée pour les niveaux sélectionnés'}
        style={{ padding: '6px 12px', borderRadius: 10, border: '2px solid ' + pillBorder, background: pillBg, color: pillColor, fontWeight: 600, fontSize: 12, cursor: hasData ? 'pointer' : 'not-allowed', opacity: hasData ? 1 : 0.4, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
        {label}
      </button>
    );
  };

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

      {/* ===== 1. NIVEAUX SCOLAIRES ===== */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}><span>📚</span> Niveaux scolaires</h3>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Primaire</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {["CP","CE1","CE2","CM1","CM2"].map(lv => (
              <button key={lv} onClick={() => toggleClass(lv)} style={PILL(selectedClasses.includes(lv))}>{lv}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Collège</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {["6e","5e","4e","3e"].map(lv => (
              <button key={lv} onClick={() => toggleClass(lv)} style={PILL(selectedClasses.includes(lv))}>{lv}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 2. ZONE GÉOGRAPHIQUE ===== */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}><span>🌍</span> Ma zone géographique</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px', lineHeight: 1.5 }}>
          Adapte les noms locaux des plantes selon votre région. Ex : <em>Madère</em> (GP) devient <em>Dachine</em> (MQ) ou <em>Taro</em> (Asie).
        </p>
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setPlayerZone('')} style={{ ...PILL_ZONE(!playerZone), background: !playerZone ? '#0D6A7A' : '#f0fdfa', color: !playerZone ? '#fff' : '#0D6A7A', border: !playerZone ? '2px solid #0D6A7A' : '2px solid #99f6e4' }}>
            🌐 Toutes zones
          </button>
        </div>
        {ZONE_GROUPS.map(grp => (
          <div key={grp.label} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{grp.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {grp.keys.map(k => {
                const z = PLAYER_ZONES.find(pz => pz.key === k);
                if (!z) return null;
                return (
                  <button key={k} onClick={() => setPlayerZone(k)} style={PILL_ZONE(playerZone === k)}>
                    {z.icon} {z.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ===== 3. CONTENU PÉDAGOGIQUE (THÈMES) ===== */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}><span>🎯</span> Contenu pédagogique</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '-4px 0 14px', lineHeight: 1.5 }}>
          Filtrez le contenu par domaine, catégorie ou région. Sans sélection, tout le contenu est disponible.
        </p>

        {/* Domaines */}
        {domains.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Domaines</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {domains.map(t => <ThemePill key={t} t={t} />)}
            </div>
          </div>
        )}

        {/* Catégories */}
        {categories.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Catégories</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {categories.map(t => <ThemePill key={t} t={t} />)}
            </div>
          </div>
        )}

        {/* Régions (thèmes) */}
        {regions.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Régions du contenu</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {regions.map(t => <ThemePill key={t} t={t} />)}
            </div>
          </div>
        )}

        {/* Groupes + Autres */}
        {(groups.length > 0 || others.length > 0) && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Autres filtres</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {groups.map(t => <ThemePill key={t} t={t} />)}
              {others.map(t => <ThemePill key={t} t={t} />)}
            </div>
          </div>
        )}

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
          {selectedThemes.length > 0 && (
            <>
              <div style={{ width: 1, background: '#e2e8f0', margin: '0 4px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>Filtres actifs :</span>
                {selectedThemes.map(t => (
                  <span key={t} onClick={() => toggleTheme(t)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#0D6A7A', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                    {themeDisplayLabel(t)} ✕
                  </span>
                ))}
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

      {/* ===== 4. PARAMÈTRES DE JEU ===== */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}><span>⚙️</span> Paramètres de jeu</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>🔄 Nombre de manches</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => stepRounds(-1)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>−</button>
              <div style={{ flex: 1, textAlign: 'center', padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', fontWeight: 800, fontSize: 18, color: '#0D6A7A' }}>{rounds}</div>
              <button onClick={() => stepRounds(+1)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>+</button>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>1 à {maxRounds} manches{isFree() ? ' (Free)' : ''}</div>
          </div>
          {!objectiveMode && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>⏱️ Durée par manche</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => stepDuration(-5)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>−5</button>
              <div style={{ flex: 1, textAlign: 'center', padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', fontWeight: 800, fontSize: 18, color: '#0D6A7A' }}>{duration}<span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>s</span></div>
              <button onClick={() => stepDuration(+5)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>+5</button>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>15 à {maxDuration} secondes{isFree() ? ' (Free)' : ''}</div>
          </div>
          )}
        </div>

        {/* Mode Objectif */}
        {(() => {
          const locked = isFree();
          const availableCategories = categories.filter(t => selectedThemes.includes(t));
          const toggleObjTheme = (t) => setObjectiveThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
          return (
            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, border: objectiveMode && !locked ? '2px solid #0D6A7A' : '2px solid #e2e8f0', background: objectiveMode && !locked ? '#f0fdfa' : locked ? '#f8fafc' : '#fff', transition: 'all 0.2s', opacity: locked ? 0.7 : 1, position: 'relative' }}>
              {locked && (
                <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 10, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', padding: '2px 8px', borderRadius: 6 }}>
                  PRO
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: locked ? 'not-allowed' : 'pointer', marginBottom: objectiveMode && !locked ? 12 : 0 }}>
                <input type="checkbox" checked={objectiveMode && !locked} disabled={locked}
                  onChange={e => { if (!locked) setObjectiveMode(e.target.checked); }}
                  style={{ width: 18, height: 18, accentColor: '#0D6A7A' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: locked ? '#94a3b8' : '#334155' }}>🎯 Mode Objectif</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                    {locked
                      ? <>Réservé aux abonnés. <a href="/pricing" style={{ color: '#0D6A7A', fontWeight: 700 }}>Passer en Pro</a></>
                      : 'Maîtrisez des thématiques précises. La partie se termine quand tous les objectifs sont atteints.'}
                  </div>
                </div>
              </label>
              {objectiveMode && !locked && (
                <div style={{ paddingLeft: 28 }}>
                  {availableCategories.length > 0 ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Sélectionnez les thématiques à maîtriser :</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {availableCategories.map(t => {
                          const isObj = objectiveThemes.includes(t);
                          const label = CATEGORY_LABELS[t] || t.replace('category:', '');
                          return (
                            <button key={t} onClick={() => toggleObjTheme(t)}
                              style={{
                                padding: '5px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                border: isObj ? '2px solid #0D6A7A' : '2px solid #e2e8f0',
                                background: isObj ? 'linear-gradient(135deg, #0D6A7A, #1AACBE)' : '#fff',
                                color: isObj ? '#fff' : '#475569',
                                boxShadow: isObj ? '0 2px 8px rgba(13,106,122,0.3)' : 'none',
                              }}>
                              {isObj ? '🎯 ' : ''}{label}
                            </button>
                          );
                        })}
                      </div>
                      {objectiveThemes.length > 0 && (
                        <div style={{ fontSize: 11, color: '#0D6A7A', fontWeight: 600 }}>
                          {objectiveThemes.length} objectif{objectiveThemes.length > 1 ? 's' : ''} sélectionné{objectiveThemes.length > 1 ? 's' : ''} — Trouvez toutes les paires de chaque thème pour gagner
                        </div>
                      )}
                      {objectiveThemes.length === 0 && (
                        <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                          ⚠️ Sélectionnez au moins une thématique pour activer le mode objectif
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>
                        Aucune catégorie disponible pour les filtres actuels. Utilisez le mode simple (nombre de paires) :
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => setObjectiveTarget(t => Math.max(3, t - 1))} style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid #e2e8f0', background: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>−</button>
                        <div style={{ minWidth: 60, textAlign: 'center', padding: '6px 12px', border: '2px solid #0D6A7A', borderRadius: 8, background: '#fff', fontWeight: 800, fontSize: 18, color: '#0D6A7A' }}>{objectiveTarget}</div>
                        <button onClick={() => setObjectiveTarget(t => Math.min(50, t + 1))} style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid #e2e8f0', background: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>+</button>
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>3 à 50 paires · Le temps est mesuré</div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Système d'aide */}
        <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 12, border: helpEnabled ? '2px solid #f59e0b' : '2px solid #e2e8f0', background: helpEnabled ? '#fffbeb' : '#fff', transition: 'all 0.2s' }}>
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
