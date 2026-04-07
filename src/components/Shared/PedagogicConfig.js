import React, { useState, useMemo, useEffect } from 'react';
import { isFree } from '../../utils/subscription';

// =============================================
// CONSTANTES PÉDAGOGIQUES PARTAGÉES
// Source de vérité unique pour Solo, Training et Arena
// =============================================

export const CLASS_LEVELS = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
export const LEVEL_INDEX = Object.fromEntries(CLASS_LEVELS.map((l, i) => [l, i]));

// Categories already included at each level (cumulative from lower levels)
export const LEVEL_INCLUDES = {
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

export const CATEGORY_LABELS = {
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

export const CONTENT_DOMAINS = [
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

export const PLAYER_ZONES = [
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

export const ZONE_GROUPS = [
  { label: 'Caraïbes & Amériques', keys: ['guadeloupe', 'martinique', 'guyane', 'haiti', 'cuba', 'trinidad'] },
  { label: 'Océan Indien', keys: ['reunion', 'mayotte', 'madagascar'] },
  { label: 'Afrique', keys: ['senegal', 'cote_ivoire', 'cameroun'] },
  { label: 'Pacifique & Europe', keys: ['france', 'polynesie', 'nouvelle_caledonie'] },
];

export const NORM_LEVEL = (s) => {
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

export function clampInt(val, lo, hi, fallback) {
  const n = parseInt(String(val), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

// ===== Styles partagés =====
export const CARD = { background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', marginBottom: 16 };
export const SECTION_TITLE = { fontSize: 15, fontWeight: 800, color: '#0D6A7A', marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 };

const PILL = (sel) => ({
  padding: '7px 14px', borderRadius: 10, border: sel ? '2px solid #0D6A7A' : '2px solid #e2e8f0',
  background: sel ? '#0D6A7A' : '#fff', color: sel ? '#fff' : '#475569',
  fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
});

// =============================================
// COMPOSANT PARTAGÉ: Configuration pédagogique
// Props:
//   data          — DataContext data (associations, textes, images, calculs, chiffres)
//   onChange       — callback(config) déclenché à chaque changement
//   initialConfig  — objet pour pré-remplir l'état au montage
//   options        — { showPlayerZone, showFreeLimits, showAllowEmptyMath, showObjectiveTarget }
// =============================================
export default function PedagogicConfig({ data, onChange, initialConfig, options = {} }) {
  const {
    showPlayerZone = false,
    showFreeLimits = true,
    showAllowEmptyMath = true,
    showObjectiveTarget = true,
    showObjectiveMode = true,
  } = options;

  // ===== State =====
  const [selectedLevel, setSelectedLevel] = useState('CP');
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [enabledDomains, setEnabledDomains] = useState(() => {
    const init = {};
    CONTENT_DOMAINS.forEach(d => { init[d.key] = true; });
    return init;
  });
  const [rounds, setRounds] = useState('3');
  const [duration, setDuration] = useState('60');
  const [allowEmptyMath, setAllowEmptyMath] = useState(true);
  const [objectiveMode, setObjectiveMode] = useState(false);
  const [objectiveTarget, setObjectiveTarget] = useState(10);
  const [helpEnabled, setHelpEnabled] = useState(false);
  const [playerZone, setPlayerZone] = useState('');

  // ===== Prefill from initialConfig (mount only) =====
  useEffect(() => {
    if (!initialConfig || typeof initialConfig !== 'object') return;
    const prev = initialConfig;
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
    if (typeof prev.helpEnabled === 'boolean') setHelpEnabled(prev.helpEnabled);
    if (prev.playerZone) setPlayerZone(prev.playerZone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Computed values =====
  const selectedClasses = useMemo(() => {
    const idx = LEVEL_INDEX[selectedLevel] ?? 0;
    return CLASS_LEVELS.slice(0, idx + 1);
  }, [selectedLevel]);

  const levelIncludes = useMemo(() => LEVEL_INCLUDES[selectedLevel] || new Set(), [selectedLevel]);

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

  const globalCategoryCounts = useMemo(() => {
    const counts = {};
    (data?.associations || []).forEach(a => {
      (a?.themes || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });
    return counts;
  }, [data]);

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

  // ===== Free tier limits =====
  const FREE_MAX_ROUNDS = 3;
  const FREE_MAX_DURATION = 120;
  const isFreeTier = showFreeLimits && isFree();
  const maxRounds = isFreeTier ? FREE_MAX_ROUNDS : 20;
  const maxDuration = isFreeTier ? FREE_MAX_DURATION : 600;

  // ===== Handlers =====
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
  const stepRounds = (delta) => {
    setRounds(prev => String(clampInt((parseInt(prev, 10) || 3) + delta, 1, maxRounds, 3)));
  };
  const stepDuration = (delta) => {
    setDuration(prev => String(clampInt((parseInt(prev, 10) || 60) + delta, 15, maxDuration, 60)));
  };

  // ===== Notify parent of config changes =====
  useEffect(() => {
    if (!onChange) return;
    const r = clampInt(rounds, 1, maxRounds, 3);
    const d = clampInt(duration, 15, maxDuration, 60);
    onChange({
      selectedLevel,
      classes: selectedClasses,
      extras: selectedExtras,
      themes: computedThemes,
      enabledDomains,
      rounds: r,
      duration: objectiveMode ? null : d,
      objectiveMode: !!objectiveMode,
      objectiveTarget: objectiveMode ? (showObjectiveTarget ? objectiveTarget : computedThemes.length) : null,
      objectiveThemes: objectiveMode ? computedThemes : [],
      helpEnabled: !!helpEnabled,
      allowEmptyMathWhenNoData: !!allowEmptyMath,
      playerZone: playerZone || '',
      dataStats,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLevel, selectedClasses, selectedExtras, computedThemes, enabledDomains, rounds, duration, objectiveMode, objectiveTarget, helpEnabled, allowEmptyMath, playerZone, dataStats, maxRounds, maxDuration]);

  // ===== UI =====
  return (
    <>
      {/* ===== 1. NIVEAU SCOLAIRE (sélection unique cumulative) ===== */}
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

                  {/* Sous-catégories (inclus + bonus) pour domaines non-math */}
                  {dom.categories.length > 0 && dom.key !== 'math' && (() => {
                    const included = dom.categories.filter(c => (categoryCounts[c] || 0) > 0);
                    const bonus = dom.categories.filter(c => (categoryCounts[c] || 0) === 0 && (globalCategoryCounts[c] || 0) > 0);
                    return (
                      <>
                        {included.length > 0 && (
                          <div style={{ marginBottom: bonus.length > 0 ? 10 : 8 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {included.map(cat => {
                                const cnt = categoryCounts[cat] || 0;
                                return (
                                  <span key={cat} style={{ padding: '4px 10px', borderRadius: 8, background: dom.color + '18', color: dom.color, fontSize: 11, fontWeight: 600 }}>
                                    {CATEGORY_LABELS[cat] || cat.replace('category:', '')} ({cnt})
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {bonus.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>➕ Bonus (cliquer pour ajouter)</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {bonus.map(cat => {
                                const sel = selectedExtras.includes(cat);
                                const cnt = globalCategoryCounts[cat] || 0;
                                return (
                                  <button key={cat} onClick={() => toggleExtra(cat)}
                                    style={{ padding: '4px 10px', borderRadius: 8, border: sel ? '2px solid #f59e0b' : '2px solid #e2e8f0', background: sel ? '#f59e0b' : '#fff', color: sel ? '#fff' : '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
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

                  {/* Zone géographique (inline dans Nature) */}
                  {showPlayerZone && dom.hasGeo && (
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
            {showAllowEmptyMath && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: '#92400e', cursor: 'pointer' }}>
                <input type="checkbox" checked={allowEmptyMath} onChange={e => setAllowEmptyMath(e.target.checked)} />
                Autoriser les zones vides si aucune association disponible
              </label>
            )}
          </div>
        )}
      </div>

      {/* ===== 3. COMMENT JOUER ? ===== */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}><span>⚙️</span> Comment jouer ?</h3>

        {/* Mode Objectif toggle */}
        {showObjectiveMode && (() => {
          const locked = isFreeTier;
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
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>1 à {maxRounds} manches{isFreeTier ? ' (Free)' : ''}</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>⏱️ Durée par manche</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => stepDuration(-5)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>−5</button>
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', fontWeight: 800, fontSize: 18, color: '#0D6A7A' }}>{duration}<span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>s</span></div>
                <button onClick={() => stepDuration(+5)} style={{ width: 40, height: 40, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>+5</button>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>15 à {maxDuration} secondes{isFreeTier ? ' (Free)' : ''}</div>
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
        {isFreeTier && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
            ⚠️ Plan gratuit : max {FREE_MAX_ROUNDS} manches et {FREE_MAX_DURATION}s par manche.
            <a href="/pricing" style={{ color: '#0D6A7A', fontWeight: 700, marginLeft: 4 }}>Passer en Pro</a> pour débloquer toutes les options.
          </div>
        )}
      </div>
    </>
  );
}
