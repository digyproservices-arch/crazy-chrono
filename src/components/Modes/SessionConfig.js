import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataContext } from '../../context/DataContext';

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

export default function SessionConfig() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const { data } = useContext(DataContext);

  // Sélections
  const [selectedClasses, setSelectedClasses] = useState(["CP","CE1","CE2","CM1","CM2"]);
  const [selectedThemes, setSelectedThemes] = useState([]);
  // Garder des strings pour permettre la saisie sans "saut" (ex: vide, 1 puis 10, etc.)
  const [rounds, setRounds] = useState('3');
  const [duration, setDuration] = useState('60');
  const [allowEmptyMath, setAllowEmptyMath] = useState(true);
  const [playerZone, setPlayerZone] = useState(() => {
    try { return localStorage.getItem('cc_player_zone') || ''; } catch { return ''; }
  });

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
    setSelectedClasses(prev => prev.includes(lv) ? prev.filter(x => x !== lv) : [...prev, lv]);
  };

  const toggleTheme = (t) => {
    setSelectedThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  

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
        if (Array.isArray(prev.themes)) setSelectedThemes(prev.themes);
        if (prev.rounds != null) setRounds(String(prev.rounds));
        if (prev.duration != null) setDuration(String(prev.duration));
        if (typeof prev.allowEmptyMathWhenNoData === 'boolean') setAllowEmptyMath(prev.allowEmptyMathWhenNoData);
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
        };
        localStorage.setItem('cc_session_cfg', JSON.stringify(payload));
        if (playerZone) localStorage.setItem('cc_player_zone', playerZone);
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [mode, selectedClasses, selectedThemes, rounds, duration, allowEmptyMath, playerZone]);

  const clampInt = (val, lo, hi, fallback) => {
    const n = parseInt(String(val), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  };

  // Steppers for better UX (no focus issues on mobile)
  const stepRounds = (delta) => {
    setRounds(prev => String(clampInt((parseInt(prev, 10) || 3) + delta, 1, 20, 3)));
  };
  const stepDuration = (delta) => {
    setDuration(prev => String(clampInt((parseInt(prev, 10) || 60) + delta, 15, 600, 60)));
  };

  const onStart = () => {
    // Règle simple: si des thèmes sont sélectionnés, on ne garde QUE ceux-ci; sinon, tout est autorisé
    const r = clampInt(rounds, 1, 20, 3);
    const d = clampInt(duration, 15, 600, 60);
    const payload = { mode, classes: selectedClasses, themes: selectedThemes, rounds: r, duration: d, allowEmptyMathWhenNoData: !!allowEmptyMath, playerZone: playerZone || '' };
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

  return (
    <div style={{ maxWidth: 980, margin: '24px auto', padding: '0 16px' }}>
      <h2 style={{ marginTop: 12 }}>Configurer la session ({mode})</h2>

      <section style={{ marginTop: 12 }}>
        <h3>Classes</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CLASS_LEVELS.map(lv => (
            <button key={lv} onClick={() => toggleClass(lv)}
              style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: selectedClasses.includes(lv) ? '#1AACBE' : '#fff', color: selectedClasses.includes(lv) ? '#fff' : '#4A3728' }}>
              {lv}
            </button>
          ))}
        </div>
      </section>

      {/* Avertissements et options de cohérence */}
      <section style={{ marginTop: 16 }}>
        {(dataStats.textImage === 0 || dataStats.calcNum === 0) && (
          <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #f59e0b', background: '#fff7ed', color: '#92400e' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Avertissement contenu limité</div>
            <div>
              Associations disponibles avec cette configuration:
              <br />• Image ↔ Texte: {dataStats.textImage}
              <br />• Calcul ↔ Chiffre: {dataStats.calcNum}
            </div>
            <div style={{ marginTop: 6 }}>
              Si certaines catégories ne disposent pas de données suffisantes, des zones pourront rester vides.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input type="checkbox" checked={allowEmptyMath} onChange={e => setAllowEmptyMath(e.target.checked)} />
              Laisser volontairement vides les zones Calcul/Chiffre lorsqu'aucune association correspondante n'existe
            </label>
          </div>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>🌍 Ma zone géographique</h3>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px' }}>
          Sélectionnez votre zone pour adapter les noms locaux des plantes et le contenu affiché.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => setPlayerZone('')}
            style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: !playerZone ? '#1AACBE' : '#fff', color: !playerZone ? '#fff' : '#4A3728', fontWeight: 600, fontSize: 13 }}>
            🌐 Toutes zones
          </button>
          {PLAYER_ZONES.map(z => (
            <button key={z.key} onClick={() => setPlayerZone(z.key)}
              style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: playerZone === z.key ? '#1AACBE' : '#fff', color: playerZone === z.key ? '#fff' : '#4A3728', fontWeight: 600, fontSize: 13 }}>
              {z.icon} {z.label}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Thèmes par facettes</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 12 }}>
          <div>
            <h4>Domain</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {domains.map(t => {
                const hasData = themeHasData(t);
                return (
                  <button key={t} onClick={() => toggleTheme(t)} disabled={!hasData} title={hasData ? '' : 'Aucune donnée pour les classes sélectionnées'}
                    style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: selectedThemes.includes(t) ? '#1AACBE' : '#fff', color: selectedThemes.includes(t) ? '#fff' : '#4A3728', opacity: hasData ? 1 : 0.5, cursor: hasData ? 'pointer' : 'not-allowed' }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <h4>Catégorie</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {categories.map(t => {
                const hasData = themeHasData(t);
                return (
                  <button key={t} onClick={() => toggleTheme(t)} disabled={!hasData} title={hasData ? '' : 'Aucune donnée pour les classes sélectionnées'}
                    style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: selectedThemes.includes(t) ? '#1AACBE' : '#fff', color: selectedThemes.includes(t) ? '#fff' : '#4A3728', opacity: hasData ? 1 : 0.5, cursor: hasData ? 'pointer' : 'not-allowed' }}>
                    {CATEGORY_LABELS[t] || t.replace('category:', '')}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <h4>Region</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {regions.map(t => {
                const hasData = themeHasData(t);
                return (
                  <button key={t} onClick={() => toggleTheme(t)} disabled={!hasData} title={hasData ? '' : 'Aucune donnée pour les classes sélectionnées'}
                    style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: selectedThemes.includes(t) ? '#1AACBE' : '#fff', color: selectedThemes.includes(t) ? '#fff' : '#4A3728', opacity: hasData ? 1 : 0.5, cursor: hasData ? 'pointer' : 'not-allowed' }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <h4>Group</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {groups.map(t => {
                const hasData = themeHasData(t);
                return (
                  <button key={t} onClick={() => toggleTheme(t)} disabled={!hasData} title={hasData ? '' : 'Aucune donnée pour les classes sélectionnées'}
                    style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: selectedThemes.includes(t) ? '#1AACBE' : '#fff', color: selectedThemes.includes(t) ? '#fff' : '#4A3728', opacity: hasData ? 1 : 0.5, cursor: hasData ? 'pointer' : 'not-allowed' }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <h4>Autres</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {others.map(t => {
                const hasData = themeHasData(t);
                return (
                  <button key={t} onClick={() => toggleTheme(t)} disabled={!hasData} title={hasData ? '' : 'Aucune donnée pour les classes sélectionnées'}
                    style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: selectedThemes.includes(t) ? '#1AACBE' : '#fff', color: selectedThemes.includes(t) ? '#fff' : '#4A3728', opacity: hasData ? 1 : 0.5, cursor: hasData ? 'pointer' : 'not-allowed' }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, color: '#6b7280' }}>
          Seuls les éléments correspondant aux thèmes sélectionnés seront utilisés. Si aucun thème n'est sélectionné, tous les éléments pourront être utilisés. Les thèmes listés sont filtrés par les classes sélectionnées.
        </div>
      </section>

      <section style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 12 }}>
        <div>
          <label>Nombre de manches</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => stepRounds(-1)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}>−</button>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#f9fafb', fontWeight: 700 }}>{rounds}</div>
            <button onClick={() => stepRounds(+1)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}>+</button>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Entre 1 et 20 manches.</div>
        </div>
        <div>
          <label>Durée (secondes)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => stepDuration(-5)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}>−5</button>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#f9fafb', fontWeight: 700 }}>{duration}</div>
            <button onClick={() => stepDuration(+5)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}>+5</button>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Entre 15 et 600 secondes.</div>
        </div>
      </section>

      {/* Mode-spécifique: Multijoueur en ligne */}
      {mode === 'online' && (
        <section style={{ marginTop: 16 }}>
          <h3>Multijoueur en ligne</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 12 }}>
            <div>
              <label>Nom du joueur</label>
              <input value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="ex: Léa"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8 }} />
            </div>
            <div>
              <label>Type de salle</label>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <label><input type="radio" name="roomMode" checked={roomMode==='create'} onChange={()=>setRoomMode('create')} /> Créer</label>
                <label><input type="radio" name="roomMode" checked={roomMode==='join'} onChange={()=>setRoomMode('join')} /> Rejoindre</label>
              </div>
            </div>
            <div>
              <label>Code de salle</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder={roomMode==='create' ? 'Générer un code' : 'Saisir le code'}
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8 }} />
                {roomMode==='create' && (
                  <button onClick={genCode} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}>Générer</button>
                )}
              </div>
            </div>
          </div>
          <small style={{ color: '#6b7280' }}>Note: un code de salle à 6 caractères permet aux autres joueurs de rejoindre rapidement.</small>
        </section>
      )}

      {/* Mode-spécifique: Classe */}
      {mode === 'classroom' && (
        <section style={{ marginTop: 16 }}>
          <h3>Classe</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 12 }}>
            <div>
              <label>Nom de l’enseignant(e)</label>
              <input value={teacherName} onChange={e=>setTeacherName(e.target.value)} placeholder="ex: Mme Martin"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8 }} />
            </div>
            <div>
              <label>Élèves (licences actives)</label>
              <input value={studentQuery} onChange={e=>setStudentQuery(e.target.value)} placeholder="Rechercher un élève"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 6 }} />
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
                {filteredStudents.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={()=>toggleStudent(s.id)} /> {s.name}
                  </label>
                ))}
                {filteredStudents.length === 0 && (
                  <div style={{ color: '#6b7280' }}>(Aucun élève trouvé)</div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
        <button onClick={() => navigate('/modes')} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}>Retour</button>
        <button onClick={onStart} style={{ padding: '12px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #1AACBE, #148A9C)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 3px 10px rgba(26,172,190,0.3)' }}>
          Démarrer
        </button>
      </div>
    </div>
  );
}
