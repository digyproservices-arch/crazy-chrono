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

function getDomain(themes) {
  const t = themes || [];
  for (const th of t) {
    if (th.startsWith('domain:')) {
      const key = th.slice(7);
      if (DOMAIN_META[key]) return key;
    }
  }
  return null;
}

function getRegion(themes) {
  for (const th of (themes || [])) {
    if (th.startsWith('region:')) return th.slice(7);
  }
  return null;
}

export default function RectoratLibrary({ data, setData, saveToBackend }) {
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

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
      const region = getRegion(a.themes);
      return { ...a, idx, isMath, left, right, domain, region };
    });
  }, [data]);

  // Domain stats
  const domainStats = useMemo(() => {
    const stats = {};
    for (const a of enriched) {
      const d = a.domain || 'unknown';
      stats[d] = (stats[d] || 0) + 1;
    }
    return stats;
  }, [enriched]);

  // Filter
  const filtered = useMemo(() => {
    let list = enriched;
    if (filterDomain !== 'all') {
      list = list.filter(a => a.domain === filterDomain);
    }
    if (filterLevel !== 'all') {
      list = list.filter(a => a.levelClass === filterLevel);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.left.toLowerCase().includes(q) || a.right.toLowerCase().includes(q));
    }
    return list;
  }, [enriched, filterDomain, filterLevel, search]);

  const deleteAssoc = (assocIdx) => {
    if (!window.confirm('Supprimer cette association ?')) return;
    setData(prev => {
      const assocs = (prev.associations || []).filter((_, i) => i !== assocIdx);
      const nd = { ...prev, associations: assocs };
      if (saveToBackend) saveToBackend(nd);
      return nd;
    });
  };

  const updateLevel = (assocIdx, level) => {
    setData(prev => {
      const assocs = (prev.associations || []).slice();
      assocs[assocIdx] = { ...assocs[assocIdx], levelClass: level };
      const nd = { ...prev, associations: assocs };
      if (saveToBackend) saveToBackend(nd);
      return nd;
    });
  };

  const totalAssocs = data?.associations?.length || 0;
  const totalTextes = data?.textes?.length || 0;
  const totalImages = data?.images?.length || 0;
  const totalCalculs = data?.calculs?.length || 0;

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'Associations', value: totalAssocs, icon: '🔗', color: '#0D6A7A' },
          { label: 'Textes', value: totalTextes, icon: '📝', color: '#7c3aed' },
          { label: 'Images', value: totalImages, icon: '🖼️', color: '#16a34a' },
          { label: 'Calculs', value: totalCalculs, icon: '🔢', color: '#2563eb' },
        ].map(s => (
          <div key={s.label} style={{ flex: '1 1 140px', padding: '14px 16px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Domain tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, padding: '8px 0', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setFilterDomain('all')}
          style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: filterDomain === 'all' ? '#0D6A7A' : '#f1f5f9',
            color: filterDomain === 'all' ? '#fff' : '#64748b',
          }}
        >
          Tous ({totalAssocs})
        </button>
        {Object.entries(DOMAIN_META).map(([key, meta]) => {
          const count = domainStats[key] || 0;
          if (count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setFilterDomain(filterDomain === key ? 'all' : key)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: filterDomain === key ? meta.color : meta.bg,
                color: filterDomain === key ? '#fff' : meta.color,
              }}
            >
              {meta.icon} {meta.label} ({count})
            </button>
          );
        })}
        {(domainStats['unknown'] || 0) > 0 && (
          <button
            onClick={() => setFilterDomain(filterDomain === 'unknown' ? 'all' : 'unknown')}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: filterDomain === 'unknown' ? '#64748b' : '#f1f5f9',
              color: filterDomain === 'unknown' ? '#fff' : '#94a3b8',
            }}
          >
            Non classé ({domainStats['unknown']})
          </button>
        )}
      </div>

      {/* Filters bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ flex: '1 1 250px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher un texte, calcul, image..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 600 }}
        >
          <option value="all">Tous niveaux</option>
          {CLASS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setViewMode('cards')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: viewMode === 'cards' ? '#0D6A7A' : '#fff', color: viewMode === 'cards' ? '#fff' : '#64748b', cursor: 'pointer', fontSize: 14 }} title="Vue cartes">▦</button>
          <button onClick={() => setViewMode('table')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: viewMode === 'table' ? '#0D6A7A' : '#fff', color: viewMode === 'table' ? '#fff' : '#64748b', cursor: 'pointer', fontSize: 14 }} title="Vue tableau">☰</button>
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        {filtered.length} association{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
      </div>

      {/* Cards view */}
      {viewMode === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {filtered.slice(0, 100).map(a => {
            const meta = DOMAIN_META[a.domain] || { icon: '❓', label: 'Non classé', color: '#94a3b8', bg: '#f8fafc' };
            const isImage = !a.isMath && a.right && /\.(jpe?g|png|gif|webp|svg)/i.test(a.right);
            return (
              <div key={a.idx} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'box-shadow 0.2s' }}>
                {/* Image preview */}
                {isImage && (
                  <div style={{ height: 120, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <img
                      src={process.env.PUBLIC_URL + '/' + a.right}
                      alt={a.left}
                      style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  </div>
                )}
                {/* Math visual */}
                {a.isMath && (
                  <div style={{ height: 80, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: '#1d4ed8' }}>{a.left}</span>
                    <span style={{ fontSize: 16, color: '#93c5fd' }}>=</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{a.right}</span>
                  </div>
                )}
                {/* No image text */}
                {!a.isMath && !isImage && (
                  <div style={{ height: 80, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#6d28d9', textAlign: 'center' }}>{a.left}</span>
                  </div>
                )}
                {/* Card body */}
                <div style={{ padding: '10px 12px' }}>
                  {!a.isMath && (
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.left}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color, border: `1px solid ${meta.color}20` }}>
                      {meta.icon} {meta.label}
                    </span>
                    {a.levelClass && (
                      <select
                        value={a.levelClass}
                        onChange={e => updateLevel(a.idx, e.target.value)}
                        style={{ padding: '2px 6px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#0D6A7A', background: '#f0fdfa', cursor: 'pointer' }}
                      >
                        {CLASS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    )}
                    <button
                      onClick={() => deleteAssoc(a.idx)}
                      style={{ marginLeft: 'auto', padding: '2px 6px', fontSize: 11, background: 'none', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, cursor: 'pointer' }}
                      title="Supprimer"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table view */}
      {viewMode === 'table' && (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569' }}>Paire</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569', width: 80 }}>Niveau</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569', width: 130 }}>Domaine</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569', width: 60 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(a => {
                const meta = DOMAIN_META[a.domain] || { icon: '❓', label: '—', color: '#94a3b8', bg: '#f8fafc' };
                return (
                  <tr key={a.idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{a.left}</span>
                      <span style={{ color: '#94a3b8', margin: '0 6px' }}>↔</span>
                      <span style={{ color: '#64748b' }}>{a.right || '—'}</span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <select
                        value={a.levelClass || ''}
                        onChange={e => updateLevel(a.idx, e.target.value)}
                        style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}
                      >
                        <option value="">—</option>
                        {CLASS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: meta.bg, color: meta.color }}>
                        {meta.icon} {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button onClick={() => deleteAssoc(a.idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }} title="Supprimer">🗑️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > (viewMode === 'cards' ? 100 : 200) && (
        <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 13 }}>
          Affichage limité à {viewMode === 'cards' ? 100 : 200} résultats. Utilisez les filtres pour affiner.
        </div>
      )}
    </div>
  );
}
