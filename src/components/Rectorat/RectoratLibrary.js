import React, { useMemo, useState } from 'react';

const CLASS_LEVELS = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];

const DOMAIN_META = {
  botany: { label: 'Botanique', icon: '🌿', color: '#16a34a', bg: '#f0fdf4' },
  zoology: { label: 'Zoologie', icon: '🐾', color: '#ea580c', bg: '#fff7ed' },
  math: { label: 'Mathématiques', icon: '🔢', color: '#2563eb', bg: '#eff6ff' },
  language: { label: 'Langue', icon: '📝', color: '#7c3aed', bg: '#f5f3ff' },
  science: { label: 'Sciences', icon: '🔬', color: '#0891b2', bg: '#ecfeff' },
  geography: { label: 'Géographie', icon: '🌍', color: '#ca8a04', bg: '#fefce8' },
  history_civics: { label: 'Histoire & EMC', icon: '📜', color: '#b45309', bg: '#fffbeb' },
  arts: { label: 'Arts', icon: '🎨', color: '#db2777', bg: '#fdf2f8' },
  culture: { label: 'Culture', icon: '🎭', color: '#9333ea', bg: '#faf5ff' },
  environment: { label: 'Environnement', icon: '♻️', color: '#059669', bg: '#ecfdf5' },
  sports: { label: 'Sports', icon: '⚽', color: '#dc2626', bg: '#fef2f2' },
  digital_citizenship: { label: 'Citoyenneté numérique', icon: '💻', color: '#4f46e5', bg: '#eef2ff' },
};

const REGIONS = [
  { key: 'guadeloupe', label: 'Guadeloupe', icon: '🏝️' },
  { key: 'martinique', label: 'Martinique', icon: '🏝️' },
  { key: 'guyane', label: 'Guyane', icon: '🌴' },
  { key: 'reunion', label: 'Réunion', icon: '🌋' },
  { key: 'mayotte', label: 'Mayotte', icon: '🏝️' },
  { key: 'haiti', label: 'Haïti', icon: '🇭🇹' },
  { key: 'cuba', label: 'Cuba', icon: '🇨🇺' },
  { key: 'trinidad', label: 'Trinidad', icon: '🇹🇹' },
  { key: 'france', label: 'France métro.', icon: '🇫🇷' },
  { key: 'caraibe', label: 'Caraïbe', icon: '🌊' },
  { key: 'afrique', label: 'Afrique', icon: '🌍' },
  { key: 'senegal', label: 'Sénégal', icon: '🇸🇳' },
  { key: 'cote_ivoire', label: "Côte d'Ivoire", icon: '🇨🇮' },
  { key: 'cameroun', label: 'Cameroun', icon: '🇨🇲' },
  { key: 'madagascar', label: 'Madagascar', icon: '🇲🇬' },
  { key: 'asie', label: 'Asie', icon: '🌏' },
  { key: 'oceanie', label: 'Océanie', icon: '🏝️' },
  { key: 'polynesie', label: 'Polynésie', icon: '🌺' },
  { key: 'nouvelle_caledonie', label: 'Nlle-Calédonie', icon: '🏝️' },
  { key: 'ameriques', label: 'Amériques', icon: '🌎' },
  { key: 'europe', label: 'Europe', icon: '🇪🇺' },
  { key: 'international', label: 'International', icon: '🌐' },
];

const CATEGORY_META = {
  fruit: { label: 'Fruits', icon: '🍎', color: '#dc2626', bg: '#fef2f2' },
  epice: { label: 'Épices', icon: '🌶️', color: '#ea580c', bg: '#fff7ed' },
  plante_medicinale: { label: 'Plantes médicinales', icon: '🌿', color: '#16a34a', bg: '#f0fdf4' },
  plante_aromatique: { label: 'Plantes aromatiques', icon: '🌱', color: '#059669', bg: '#ecfdf5' },
  fleur: { label: 'Fleurs', icon: '🌺', color: '#db2777', bg: '#fdf2f8' },
  tubercule: { label: 'Tubercules', icon: '🥔', color: '#ca8a04', bg: '#fefce8' },
  arbre: { label: 'Arbres', icon: '🌳', color: '#166534', bg: '#f0fdf4' },
  legumineuse: { label: 'Légumineuses', icon: '🫘', color: '#854d0e', bg: '#fefce8' },
  legume: { label: 'Légumes', icon: '🥬', color: '#15803d', bg: '#f0fdf4' },
  cereale: { label: 'Céréales', icon: '🌾', color: '#a16207', bg: '#fefce8' },
  palmier: { label: 'Palmiers', icon: '🌴', color: '#065f46', bg: '#ecfdf5' },
};

const DOMAIN_KEYS = Object.keys(DOMAIN_META);

function getDomain(themes) {
  for (const th of (themes || [])) {
    if (th.startsWith('domain:')) {
      const key = th.slice(7);
      if (DOMAIN_META[key]) return key;
    }
  }
  return null;
}

function getRegions(themes) {
  const regions = [];
  for (const th of (themes || [])) {
    if (th.startsWith('region:')) regions.push(th.slice(7));
  }
  return regions;
}

function getCategory(themes) {
  for (const th of (themes || [])) {
    if (th.startsWith('category:')) return th.slice(9);
  }
  return null;
}

export default function RectoratLibrary({ data, setData, saveToBackend }) {
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('cards');

  // Build enriched associations list
  const enriched = useMemo(() => {
    if (!data?.associations) return [];
    const tMap = new Map((data.textes || []).map(x => [x.id, x]));
    const iMap = new Map((data.images || []).map(x => [x.id, x]));
    const cMap = new Map((data.calculs || []).map(x => [x.id, x]));
    const nMap = new Map((data.chiffres || []).map(x => [x.id, x]));

    return data.associations.map((a, idx) => {
      const isMath = !!(a.calculId && a.chiffreId);
      const left = isMath ? (cMap.get(a.calculId)?.content || '') : (tMap.get(a.texteId)?.content || '');
      const right = isMath ? (nMap.get(a.chiffreId)?.content || '') : (iMap.get(a.imageId)?.url || '');
      const domain = getDomain(a.themes);
      const category = getCategory(a.themes);
      const regions = getRegions(a.themes);
      return { ...a, idx, isMath, left, right, domain, category, regions };
    });
  }, [data]);

  // Stats
  const domainStats = useMemo(() => {
    const stats = {};
    for (const a of enriched) { stats[a.domain || 'unknown'] = (stats[a.domain || 'unknown'] || 0) + 1; }
    return stats;
  }, [enriched]);

  const regionStats = useMemo(() => {
    const stats = {};
    let list = enriched;
    if (filterDomain !== 'all') list = list.filter(a => (a.domain || 'unknown') === filterDomain);
    for (const a of list) {
      if (a.regions.length === 0) { stats['unknown'] = (stats['unknown'] || 0) + 1; }
      else { for (const r of a.regions) { stats[r] = (stats[r] || 0) + 1; } }
    }
    return stats;
  }, [enriched, filterDomain]);

  const categoryStats = useMemo(() => {
    const stats = {};
    let list = enriched;
    if (filterDomain !== 'all') list = list.filter(a => (a.domain || 'unknown') === filterDomain);
    for (const a of list) { stats[a.category || 'unknown'] = (stats[a.category || 'unknown'] || 0) + 1; }
    return stats;
  }, [enriched, filterDomain]);

  // Filter chain: Domain → Category → Region → Level → Search
  const filtered = useMemo(() => {
    let list = enriched;
    if (filterDomain !== 'all') list = list.filter(a => (a.domain || 'unknown') === filterDomain);
    if (filterCategory !== 'all') list = list.filter(a => (a.category || 'unknown') === filterCategory);
    if (filterRegion !== 'all') list = list.filter(a => filterRegion === 'unknown' ? a.regions.length === 0 : a.regions.includes(filterRegion));
    if (filterLevel !== 'all') list = list.filter(a => a.levelClass === filterLevel);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.left.toLowerCase().includes(q) || a.right.toLowerCase().includes(q));
    }
    return list;
  }, [enriched, filterDomain, filterCategory, filterRegion, filterLevel, search]);

  // Mutators
  const deleteAssoc = (assocIdx) => {
    if (!window.confirm('Supprimer cette association ?')) return;
    setData(prev => {
      const assocs = (prev.associations || []).filter((_, i) => i !== assocIdx);
      const nd = { ...prev, associations: assocs };
      if (saveToBackend) saveToBackend(nd);
      return nd;
    });
  };

  const updateAssocField = (assocIdx, updater) => {
    setData(prev => {
      const assocs = (prev.associations || []).slice();
      assocs[assocIdx] = updater(assocs[assocIdx]);
      const nd = { ...prev, associations: assocs };
      if (saveToBackend) saveToBackend(nd);
      return nd;
    });
  };

  const updateLevel = (idx, level) => updateAssocField(idx, a => ({ ...a, levelClass: level }));

  const updateDomain = (idx, domainKey) => {
    updateAssocField(idx, a => {
      const themes = (a.themes || []).filter(t => !t.startsWith('domain:'));
      if (domainKey) themes.push('domain:' + domainKey);
      return { ...a, themes };
    });
  };

  const toggleRegion = (idx, regionKey) => {
    updateAssocField(idx, a => {
      const themes = (a.themes || []).slice();
      const tag = 'region:' + regionKey;
      const i = themes.indexOf(tag);
      if (i >= 0) themes.splice(i, 1); else themes.push(tag);
      return { ...a, themes };
    });
  };

  const totalAssocs = data?.associations?.length || 0;

  // Breadcrumb display
  const breadcrumb = [];
  breadcrumb.push('Tous');
  if (filterDomain !== 'all') {
    const dm = DOMAIN_META[filterDomain] || { icon: '❓', label: filterDomain };
    breadcrumb.push(dm.icon + ' ' + dm.label);
  }
  if (filterCategory !== 'all') {
    const cm = CATEGORY_META[filterCategory];
    breadcrumb.push(cm ? cm.icon + ' ' + cm.label : (filterCategory === 'unknown' ? 'Sans catégorie' : filterCategory));
  }
  if (filterRegion !== 'all') {
    const rm = REGIONS.find(r => r.key === filterRegion);
    breadcrumb.push(rm ? rm.icon + ' ' + rm.label : (filterRegion === 'unknown' ? 'Sans région' : filterRegion));
  }
  if (filterLevel !== 'all') breadcrumb.push(filterLevel);

  return (
    <div>
      {/* Title + stats summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0D6A7A', margin: '0 0 4px' }}>📚 Bibliothèque de contenu</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            {totalAssocs} association{totalAssocs > 1 ? 's' : ''} · {(data?.textes||[]).length} textes · {(data?.images||[]).length} images · {(data?.calculs||[]).length} calculs
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setViewMode('cards')} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: viewMode === 'cards' ? '#0D6A7A' : '#fff', color: viewMode === 'cards' ? '#fff' : '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>▦ Cartes</button>
          <button onClick={() => setViewMode('table')} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: viewMode === 'table' ? '#0D6A7A' : '#fff', color: viewMode === 'table' ? '#fff' : '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>☰ Tableau</button>
        </div>
      </div>

      {/* === STEP 1: Domain pills === */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => { setFilterDomain('all'); setFilterCategory('all'); setFilterRegion('all'); }} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: filterDomain === 'all' ? '#0D6A7A' : '#f1f5f9', color: filterDomain === 'all' ? '#fff' : '#64748b' }}>
          Tous ({totalAssocs})
        </button>
        {Object.entries(DOMAIN_META).map(([key, meta]) => {
          const count = domainStats[key] || 0;
          if (count === 0) return null;
          const active = filterDomain === key;
          return (
            <button key={key} onClick={() => { setFilterDomain(active ? 'all' : key); setFilterCategory('all'); setFilterRegion('all'); }}
              style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: active ? meta.color : meta.bg, color: active ? '#fff' : meta.color }}>
              {meta.icon} {meta.label} ({count})
            </button>
          );
        })}
        {(domainStats['unknown'] || 0) > 0 && (
          <button onClick={() => { setFilterDomain(filterDomain === 'unknown' ? 'all' : 'unknown'); setFilterCategory('all'); setFilterRegion('all'); }}
            style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: filterDomain === 'unknown' ? '#64748b' : '#f1f5f9', color: filterDomain === 'unknown' ? '#fff' : '#94a3b8' }}>
            Non classé ({domainStats['unknown']})
          </button>
        )}
      </div>

      {/* === STEP 2: Category pills (shown when a domain is selected) === */}
      {filterDomain !== 'all' && Object.keys(categoryStats).length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, paddingLeft: 12, borderLeft: '3px solid ' + (DOMAIN_META[filterDomain]?.color || '#94a3b8') }}>
          <button onClick={() => setFilterCategory('all')} style={{ padding: '5px 12px', borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filterCategory === 'all' ? '#334155' : '#fff', color: filterCategory === 'all' ? '#fff' : '#64748b' }}>
            Toutes catégories
          </button>
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            const count = categoryStats[key] || 0;
            if (count === 0) return null;
            const active = filterCategory === key;
            return (
              <button key={key} onClick={() => setFilterCategory(active ? 'all' : key)}
                style={{ padding: '5px 12px', borderRadius: 16, border: '1px solid ' + (active ? meta.color : '#e2e8f0'), fontSize: 12, fontWeight: 600, cursor: 'pointer', background: active ? meta.color : meta.bg, color: active ? '#fff' : meta.color }}>
                {meta.icon} {meta.label} ({count})
              </button>
            );
          })}
          {(categoryStats['unknown'] || 0) > 0 && (
            <button onClick={() => setFilterCategory(filterCategory === 'unknown' ? 'all' : 'unknown')}
              style={{ padding: '5px 12px', borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filterCategory === 'unknown' ? '#334155' : '#fff', color: filterCategory === 'unknown' ? '#fff' : '#94a3b8' }}>
              Sans catégorie ({categoryStats['unknown']})
            </button>
          )}
        </div>
      )}

      {/* === STEP 3: Region pills (shown when a domain is selected) === */}
      {filterDomain !== 'all' && Object.keys(regionStats).length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, paddingLeft: 12, borderLeft: '3px solid ' + (DOMAIN_META[filterDomain]?.color || '#94a3b8') }}>
          <button onClick={() => setFilterRegion('all')} style={{ padding: '5px 12px', borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filterRegion === 'all' ? '#334155' : '#fff', color: filterRegion === 'all' ? '#fff' : '#64748b' }}>
            Toutes régions
          </button>
          {REGIONS.map(r => {
            const count = regionStats[r.key] || 0;
            if (count === 0) return null;
            const active = filterRegion === r.key;
            return (
              <button key={r.key} onClick={() => setFilterRegion(active ? 'all' : r.key)}
                style={{ padding: '5px 12px', borderRadius: 16, border: '1px solid ' + (active ? '#334155' : '#e2e8f0'), fontSize: 12, fontWeight: 600, cursor: 'pointer', background: active ? '#334155' : '#fff', color: active ? '#fff' : '#475569' }}>
                {r.icon} {r.label} ({count})
              </button>
            );
          })}
          {(regionStats['unknown'] || 0) > 0 && (
            <button onClick={() => setFilterRegion(filterRegion === 'unknown' ? 'all' : 'unknown')}
              style={{ padding: '5px 12px', borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filterRegion === 'unknown' ? '#334155' : '#fff', color: filterRegion === 'unknown' ? '#fff' : '#94a3b8' }}>
              Sans région ({regionStats['unknown']})
            </button>
          )}
        </div>
      )}

      {/* === STEP 3: Level + Search bar === */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher..." style={{ flex: '1 1 220px', padding: '9px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 600 }}>
          <option value="all">Tous niveaux</option>
          {CLASS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Breadcrumb + count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {breadcrumb.join(' › ')}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
          {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Cards view — grouped by domain then category */}
      {viewMode === 'cards' && (() => {
        const renderCard = (a) => {
          const meta = DOMAIN_META[a.domain] || { icon: '❓', label: 'Non classé', color: '#94a3b8', bg: '#f8fafc' };
          const catMeta = CATEGORY_META[a.category] || null;
          const regionMetas = a.regions.map(rk => REGIONS.find(r => r.key === rk)).filter(Boolean);
          const isImage = !a.isMath && a.right && /\.(jpe?g|png|gif|webp|svg)/i.test(a.right);
          return (
            <div key={a.idx} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              {isImage && (
                <div style={{ height: 110, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src={process.env.PUBLIC_URL + '/' + a.right} alt={a.left} style={{ maxWidth: '100%', maxHeight: 110, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
                </div>
              )}
              {a.isMath && (
                <div style={{ height: 70, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8' }}>{a.left}</span>
                  <span style={{ fontSize: 15, color: '#93c5fd' }}>=</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{a.right}</span>
                </div>
              )}
              {!a.isMath && !isImage && (
                <div style={{ height: 70, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#6d28d9', textAlign: 'center' }}>{a.left}</span>
                </div>
              )}
              <div style={{ padding: '8px 10px' }}>
                {!a.isMath && <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.left}</div>}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <select value={a.domain || ''} onChange={e => updateDomain(a.idx, e.target.value)}
                    style={{ padding: '2px 4px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg, cursor: 'pointer', maxWidth: 130 }}>
                    <option value="">Domaine...</option>
                    {DOMAIN_KEYS.map(k => <option key={k} value={k}>{DOMAIN_META[k].icon} {DOMAIN_META[k].label}</option>)}
                  </select>
                  {catMeta && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: catMeta.bg, color: catMeta.color, fontWeight: 600 }}>{catMeta.icon} {catMeta.label}</span>}
                </div>
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 4 }}>
                  {regionMetas.map(rm => (
                    <span key={rm.key} onClick={() => toggleRegion(a.idx, rm.key)} title={`Retirer ${rm.label}`}
                      style={{ fontSize: 9, padding: '1px 5px', borderRadius: 10, background: '#334155', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {rm.icon} {rm.label} ✕
                    </span>
                  ))}
                  <select value="" onChange={e => { if (e.target.value) toggleRegion(a.idx, e.target.value); e.target.value = ''; }}
                    style={{ padding: '1px 3px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8', cursor: 'pointer', maxWidth: 80 }}>
                    <option value="">+ Région</option>
                    {REGIONS.filter(r => !a.regions.includes(r.key)).map(r => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <select value={a.levelClass || ''} onChange={e => updateLevel(a.idx, e.target.value)}
                    style={{ padding: '2px 4px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, color: '#0D6A7A', background: '#f0fdfa', cursor: 'pointer' }}>
                    <option value="">Niveau...</option>
                    {CLASS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  {regionMetas.length > 0 && <span style={{ fontSize: 10, color: '#94a3b8' }}>{regionMetas.map(r => r.icon).join('')}</span>}
                  <button onClick={() => deleteAssoc(a.idx)} style={{ marginLeft: 'auto', padding: '2px 5px', fontSize: 10, background: 'none', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 5, cursor: 'pointer' }} title="Supprimer">🗑️</button>
                </div>
              </div>
            </div>
          );
        };

        // Build grouped structure
        const capped = filtered.slice(0, 120);
        const domainOrder = [...Object.keys(DOMAIN_META), 'unknown'];
        const catOrder = [...Object.keys(CATEGORY_META), 'unknown'];

        // Group by domain → category
        const groups = new Map();
        for (const a of capped) {
          const dk = a.domain || 'unknown';
          const ck = a.category || 'unknown';
          if (!groups.has(dk)) groups.set(dk, new Map());
          const catMap = groups.get(dk);
          if (!catMap.has(ck)) catMap.set(ck, []);
          catMap.get(ck).push(a);
        }

        // If a specific domain is already filtered, just group by category
        if (filterDomain !== 'all') {
          const catMap = groups.values().next().value || new Map();
          const sortedCats = catOrder.filter(ck => catMap.has(ck));
          return (
            <div>
              {sortedCats.map(ck => {
                const items = catMap.get(ck);
                const cm = CATEGORY_META[ck];
                const catLabel = cm ? `${cm.icon} ${cm.label}` : 'Sans catégorie';
                return (
                  <div key={ck} style={{ marginBottom: 20 }}>
                    {sortedCats.length > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: '2px solid ' + (cm?.color || '#e2e8f0') }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: cm?.color || '#64748b' }}>{catLabel}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>({items.length})</span>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
                      {items.map(renderCard)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        // "Tous" view: group by domain, then by category within each domain
        const sortedDomains = domainOrder.filter(dk => groups.has(dk));
        return (
          <div>
            {sortedDomains.map(dk => {
              const dm = DOMAIN_META[dk] || { icon: '❓', label: 'Non classé', color: '#94a3b8', bg: '#f8fafc' };
              const catMap = groups.get(dk);
              const sortedCats = catOrder.filter(ck => catMap.has(ck));
              const domainTotal = sortedCats.reduce((s, ck) => s + catMap.get(ck).length, 0);
              return (
                <div key={dk} style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 8, borderBottom: '3px solid ' + dm.color }}>
                    <span style={{ fontSize: 20 }}>{dm.icon}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: dm.color }}>{dm.label}</span>
                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>({domainTotal})</span>
                  </div>
                  {sortedCats.map(ck => {
                    const items = catMap.get(ck);
                    const cm = CATEGORY_META[ck];
                    const catLabel = cm ? `${cm.icon} ${cm.label}` : '';
                    return (
                      <div key={ck} style={{ marginBottom: 16, paddingLeft: sortedCats.length > 1 && cm ? 12 : 0 }}>
                        {sortedCats.length > 1 && cm && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: cm.color }}>{catLabel}</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>({items.length})</span>
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
                          {items.map(renderCard)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Table view */}
      {viewMode === 'table' && (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569' }}>Paire</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569', width: 120 }}>Domaine</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569', width: 110 }}>Région</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569', width: 70 }}>Niveau</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569', width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(a => {
                const meta = DOMAIN_META[a.domain] || { icon: '❓', label: '—', color: '#94a3b8', bg: '#f8fafc' };
                return (
                  <tr key={a.idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 10px', fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{a.left}</span>
                      <span style={{ color: '#94a3b8', margin: '0 6px' }}>↔</span>
                      <span style={{ color: '#64748b' }}>{a.right || '—'}</span>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <select value={a.domain || ''} onChange={e => updateDomain(a.idx, e.target.value)}
                        style={{ padding: '2px 4px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg, cursor: 'pointer' }}>
                        <option value="">—</option>
                        {DOMAIN_KEYS.map(k => <option key={k} value={k}>{DOMAIN_META[k].icon} {DOMAIN_META[k].label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                        {a.regions.map(rk => {
                          const rm = REGIONS.find(r => r.key === rk);
                          return rm ? (
                            <span key={rk} onClick={() => toggleRegion(a.idx, rk)} title={`Retirer ${rm.label}`}
                              style={{ fontSize: 9, padding: '0px 4px', borderRadius: 8, background: '#334155', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {rm.icon}✕
                            </span>
                          ) : null;
                        })}
                        <select value="" onChange={e => { if (e.target.value) toggleRegion(a.idx, e.target.value); e.target.value = ''; }}
                          style={{ padding: '1px 2px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8', cursor: 'pointer', width: 22 }}>
                          <option value="">+</option>
                          {REGIONS.filter(r => !a.regions.includes(r.key)).map(r => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
                        </select>
                      </div>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <select value={a.levelClass || ''} onChange={e => updateLevel(a.idx, e.target.value)}
                        style={{ padding: '2px 4px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, cursor: 'pointer' }}>
                        <option value="">—</option>
                        {CLASS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <button onClick={() => deleteAssoc(a.idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }} title="Supprimer">🗑️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > (viewMode === 'cards' ? 120 : 200) && (
        <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 13 }}>
          Affichage limité. Utilisez les filtres pour affiner.
        </div>
      )}
    </div>
  );
}
