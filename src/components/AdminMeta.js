import React, { useMemo } from 'react';

const CLASS_LEVELS = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];

export default function AdminMeta({ data, setData, save }) {
  const allThemes = useMemo(() => {
    const bag = new Set();
    const push = (arr) => (arr || []).forEach(x => (x.themes || []).forEach(t => bag.add(String(t))));
    push(data?.textes); push(data?.images); push(data?.calculs); push(data?.chiffres);
    return Array.from(bag).sort();
  }, [data]);

  const updateItem = (type, id, patch) => {
    setData(prev => {
      const arr = prev[type].map(el => el.id === id ? { ...el, ...patch } : el);
      const next = { ...prev, [type]: arr };
      try { save && save(next); } catch {}
      return next;
    });
  };

  const Section = ({ label, type, fields }) => (
    <section style={{ marginTop: 18 }}>
      <h3>{label} — Catégorisation</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Contenu</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Classe</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Thèmes (séparés par des virgules)</th>
            </tr>
          </thead>
          <tbody>
            {(data?.[type] || []).map(el => (
              <tr key={el.id}>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 6 }}>
                  {type === 'images' ? (el.url || '') : (el.content || '')}
                </td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 6 }}>
                  <select
                    value={el.levelClass || ''}
                    onChange={(e) => updateItem(type, el.id, { levelClass: e.target.value })}
                    style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}
                  >
                    <option value="">(non défini)</option>
                    {CLASS_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 6 }}>
                  <input
                    placeholder="ex: botanique, animaux"
                    value={(el.themes || []).join(', ')}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const themes = raw.split(',').map(s => s.trim()).filter(Boolean);
                      updateItem(type, el.id, { themes });
                    }}
                    list={`themes-${type}`}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* datalist pour autocompléter les thèmes existants */}
      <datalist id={`themes-${type}`}>
        {allThemes.map(t => <option key={t} value={t} />)}
      </datalist>
    </section>
  );

  return (
    <div style={{ marginTop: 12 }}>
      <h2>Catégoriser les éléments (classe & thèmes)</h2>
      <p style={{ color: '#666' }}>Définissez la difficulté (classe) et les thèmes pour chaque élément afin d'activer les filtres dans la configuration des sessions.</p>
      <Section label="Textes" type="textes" />
      <Section label="Images" type="images" />
      <Section label="Calculs" type="calculs" />
      <Section label="Chiffres" type="chiffres" />
    </div>
  );
}
