import React, { useMemo } from 'react';

const CLASS_LEVELS = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
const DOMAINS = ['botany','zoology','environment','sports','math','language','science','geography','history_civics','arts','culture','digital_citizenship'];
const REGIONS = ['caribbean','amazonia','europe','indian_ocean','pacific','africa','worldwide'];
const BOTANY_GROUPS = ['food_plants','medicinal_plants','fruit_trees','ornamental_plants'];
const MATH_GROUPS = ['addition','subtraction','multiplication','division'];

const DOMAIN_LABELS_FR = {
  botany: 'Botanique',
  zoology: 'Zoologie',
  environment: 'Environnement',
  sports: 'Sports',
  math: 'Mathématiques',
  language: 'Langue',
  science: 'Sciences',
  geography: 'Géographie',
  history_civics: 'Histoire & EMC',
  arts: 'Arts',
  culture: 'Culture',
  digital_citizenship: 'Citoyenneté numérique',
};

const REGION_LABELS_FR = {
  caribbean: 'Caraïbes',
  amazonia: 'Amazonie',
  europe: 'Europe',
  indian_ocean: 'Océan Indien',
  pacific: 'Pacifique',
  africa: 'Afrique',
  worldwide: 'Monde',
};

const BOTANY_GROUP_LABELS_FR = {
  food_plants: 'Plantes alimentaires',
  medicinal_plants: 'Plantes médicinales',
  fruit_trees: 'Arbres fruitiers',
  ornamental_plants: 'Plantes ornementales',
};

const MATH_GROUP_LABELS_FR = {
  addition: 'Addition',
  subtraction: 'Soustraction',
  multiplication: 'Multiplication',
  division: 'Division',
};

export default function AdminAssocMeta({ data, setData, save }) {
  const index = useMemo(() => {
    const t = new Map((data?.textes || []).map(x => [x.id, x]));
    const i = new Map((data?.images || []).map(x => [x.id, x]));
    const c = new Map((data?.calculs || []).map(x => [x.id, x]));
    const n = new Map((data?.chiffres || []).map(x => [x.id, x]));
    return { t, i, c, n };
  }, [data]);

  const [showRawThemes, setShowRawThemes] = React.useState(false);
  const [showThemesColumn, setShowThemesColumn] = React.useState(false);

  const allThemes = useMemo(() => {
    const bag = new Set();
    for (const a of (data?.associations || [])) {
      (a?.themes || []).forEach(t => bag.add(String(t)));
    }
    return Array.from(bag).sort();
  }, [data?.associations]);

  const [query, setQuery] = React.useState('');
  const filteredAssocs = useMemo(() => {
    const q = (query || '').toLowerCase().trim();
    if (!q) return data?.associations || [];
    return (data?.associations || []).filter(a => {
      const left = a.texteId ? (index.t.get(a.texteId)?.content || '') : (a.calculId ? (index.c.get(a.calculId)?.content || '') : '');
      const right = a.imageId ? (index.i.get(a.imageId)?.url || '') : (a.chiffreId ? (index.n.get(a.chiffreId)?.content || '') : '');
      const themes = (a.themes || []).join(',');
      return [left, right, themes].some(s => String(s).toLowerCase().includes(q));
    });
  }, [data?.associations, index, query]);

  const updateAssoc = (assocIdx, patch) => {
    setData(prev => {
      const list = (prev.associations || []).slice();
      list[assocIdx] = { ...(list[assocIdx] || {}), ...patch };
      const next = { ...prev, associations: list };
      try {
        if (save) {
          const r = save(next);
          if (r && typeof r.then === 'function') r.catch(() => {});
        }
      } catch {}
      return next;
    });
  };

  // Composant enfant pour gérer les sélections par ligne (respect des règles des hooks)
  function FacetQuickControls({ kind = 'botany', initialRegion = 'caribbean', onApply, currentThemes = [] }) {
    const [dom, setDom] = React.useState('');
    const [reg, setReg] = React.useState(`region:${initialRegion}`);
    const [grp, setGrp] = React.useState('');

    // Synchroniser les sélections avec les thèmes actuels
    React.useEffect(() => {
      const themes = new Set(currentThemes || []);
      const domFound = Array.from(themes).find(t => t.startsWith('domain:')) || '';
      const regFound = Array.from(themes).find(t => t.startsWith('region:')) || `region:${initialRegion}`;
      const grpFound = Array.from(themes).find(t => t.startsWith('group:')) || '';
      setDom(domFound);
      setReg(regFound);
      setGrp(grpFound);
    }, [currentThemes, initialRegion]);
    const apply = () => {
      const base = new Set(currentThemes || []);
      if (dom) base.add(dom);
      if (reg) base.add(reg);
      if (grp) base.add(grp);
      onApply(Array.from(base));
    };
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <small style={{ color: '#374151' }}>Domaine</small>
          <select value={dom} onChange={e=>setDom(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}>
            <option value="">domaine :(aucun)</option>
            {DOMAINS.map(d => (
              <option key={d} value={`domain:${d}`}>{DOMAIN_LABELS_FR[d] || d}</option>
            ))}
          </select>
        </div>
        {kind === 'botany' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <small style={{ color: '#374151' }}>Région</small>
              <select value={reg} onChange={e=>setReg(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}>
                {REGIONS.map(r => (
                  <option key={r} value={`region:${r}`}>{REGION_LABELS_FR[r] || r}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <small style={{ color: '#374151' }}>Catégorie</small>
              <select value={grp} onChange={e=>setGrp(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}>
                <option value="">groupe :(aucun)</option>
                {BOTANY_GROUPS.map(g => (
                  <option key={g} value={`group:${g}`}>{BOTANY_GROUP_LABELS_FR[g] || g}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {kind === 'math' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <small style={{ color: '#374151' }}>Opération</small>
            <select value={grp} onChange={e=>setGrp(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}>
              <option value="">groupe :(aucun)</option>
              {MATH_GROUPS.map(g => (
                <option key={g} value={`group:${g}`}>{MATH_GROUP_LABELS_FR[g] || g}</option>
              ))}
            </select>
          </div>
        )}
        <button type="button" onClick={apply} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', height: 36 }}>Ajouter</button>
      </div>
    );
  }

  // Helper: transforme un slug (domain:/region:/group:/subtopic:/curriculum_grade:) en libellé FR
  function labelThemeFr(t) {
    if (!t) return '';
    if (t.startsWith('domain:')) {
      const k = t.slice('domain:'.length);
      return DOMAIN_LABELS_FR[k] || t;
    }
    if (t.startsWith('region:')) {
      const k = t.slice('region:'.length);
      return REGION_LABELS_FR[k] || t;
    }
    if (t.startsWith('group:')) {
      const k = t.slice('group:'.length);
      return BOTANY_GROUP_LABELS_FR[k] || MATH_GROUP_LABELS_FR[k] || k;
    }
    if (t.startsWith('curriculum_grade:')) {
      return 'Niveau: ' + t.slice('curriculum_grade:'.length);
    }
    if (t.startsWith('subtopic:')) {
      const k = t.slice('subtopic:'.length).replace(/_/g, ' ').replace('<=', '≤');
      return k;
    }
    return t;
  }

  // Heuristique de pré-remplissage: rempli uniquement si manquant
  const inferForAssoc = (a) => {
    const out = {};
    // Calcul ↔ Chiffre
    if (a.calculId && a.chiffreId) {
      const calc = String(index.c.get(a.calculId)?.content || '').trim();
      const num = parseFloat(index.n.get(a.chiffreId)?.content || '');

      const hasMult = /\d\s*[x×*]\s*\d/i.test(calc);
      const hasAdd = /\d\s*\+\s*\d/.test(calc);
      const hasSub = /\d\s*-\s*\d/.test(calc);
      const hasDiv = /\d\s*[/:]\s*\d/.test(calc);

      if (hasMult) {
        // Multiplication: A x B
        const m = calc.match(/(\d+)\s*[x×*]\s*(\d+)/i);
        if (m) {
          const A = parseInt(m[1], 10), B = parseInt(m[2], 10);
          const M = Math.max(A, B);
          const P = isFinite(num) ? num : (A * B);
          // Programme: tables jusqu'à 10 maîtrisées en CE2
          // - si facteurs ≤10 et produit ≤100 → CE2
          // - si facteurs ≤12 et produit ≤144 → CM1
          // - si facteurs ≤20 et produit ≤400 → CM2
          // - sinon → 6e
          let levelClass = 'CE2';
          if (M <= 10 && P <= 100) levelClass = 'CE2';
          else if (M <= 12 && P <= 144) levelClass = 'CM1';
          else if (M <= 20 && P <= 400) levelClass = 'CM2';
          else levelClass = '6e';
          out.levelClass = out.levelClass || levelClass;
          // Facettes: domaine/group + sous-thèmes
          const themes = new Set(out.themes || []);
          themes.add('domain:math');
          themes.add('group:multiplication');
          if (M <= 10) themes.add('subtopic:tables_1_10');
          else if (M <= 12) themes.add('subtopic:tables_11_12');
          if (P <= 100) themes.add('subtopic:produit_<=100');
          // Niveau scolaire comme facette
          themes.add(`curriculum_grade:${out.levelClass}`);
          out.themes = Array.from(themes);
        }
      } else if (hasAdd) {
        // Addition: A + B
        const m = calc.match(/(\d+)\s*\+\s*(\d+)/);
        if (m) {
          const A = parseInt(m[1], 10), B = parseInt(m[2], 10);
          const S = isFinite(num) ? num : (A + B);
          // Repères: additions jusqu'à 20 → CE1, jusqu'à 100 → CE2, au-delà → CM1
          let levelClass = 'CE1';
          if (S <= 20) levelClass = 'CE1';
          else if (S <= 100) levelClass = 'CE2';
          else levelClass = 'CM1';
          out.levelClass = out.levelClass || levelClass;
          const themes = new Set(out.themes || []);
          themes.add('domain:math');
          themes.add('group:addition');
          if (S <= 20) themes.add('subtopic:somme_<=20');
          else if (S <= 100) themes.add('subtopic:somme_<=100');
          themes.add(`curriculum_grade:${out.levelClass}`);
          out.themes = Array.from(themes);
        }
      } else if (hasSub) {
        // Soustraction: A - B
        const m = calc.match(/(\d+)\s*-\s*(\d+)/);
        if (m) {
          const A = parseInt(m[1], 10), B = parseInt(m[2], 10);
          const D = isFinite(num) ? num : (A - B);
          // Repères: soustractions jusqu'à 20 → CE1, jusqu'à 100 → CE2, au-delà → CM1
          let levelClass = 'CE1';
          if (Math.abs(D) <= 20 && A <= 20 && B <= 20) levelClass = 'CE1';
          else if (Math.abs(D) <= 100 && A <= 100 && B <= 100) levelClass = 'CE2';
          else levelClass = 'CM1';
          out.levelClass = out.levelClass || levelClass;
          const themes = new Set(out.themes || []);
          themes.add('domain:math');
          themes.add('group:subtraction');
          if (Math.abs(D) <= 20 && A <= 20 && B <= 20) themes.add('subtopic:diff_<=20');
          else if (Math.abs(D) <= 100 && A <= 100 && B <= 100) themes.add('subtopic:diff_<=100');
          themes.add(`curriculum_grade:${out.levelClass}`);
          out.themes = Array.from(themes);
        }
      } else if (hasDiv) {
        // Division: A : B ou A / B
        const m = calc.match(/(\d+)\s*[/:]\s*(\d+)/);
        if (m) {
          const A = parseInt(m[1], 10), B = parseInt(m[2], 10) || 1;
          const Q = isFinite(num) ? num : (A / B);
          // Repères: divisions simples (tables) → CM1, divisions plus grandes → CM2/6e
          let levelClass = 'CM1';
          if (A <= 100 && B <= 12 && Number.isInteger(Q)) levelClass = 'CM1';
          else if (A <= 400 && B <= 20) levelClass = 'CM2';
          else levelClass = '6e';
          out.levelClass = out.levelClass || levelClass;
          const themes = new Set(out.themes || []);
          themes.add('domain:math');
          themes.add('group:division');
          if (Number.isInteger(Q)) themes.add('subtopic:division_entiere');
          themes.add(`curriculum_grade:${out.levelClass}`);
          out.themes = Array.from(themes);
        }
      } else {
        // Par défaut pour expressions numériques non reconnues
        const themes = new Set(out.themes || []);
        themes.add('domain:math');
        themes.add('group:calcul');
        out.themes = Array.from(themes);
        out.levelClass = out.levelClass || 'CE2';
      }
    }
    // Texte ↔ Image
    if (a.texteId && a.imageId) {
      const texte = index.t.get(a.texteId)?.content || '';
      const imgUrl = index.i.get(a.imageId)?.url || '';
      // Par défaut, facettes botaniques Caraïbes
      const themes = new Set(out.themes || []);
      themes.add('domain:botany');
      themes.add('region:caribbean');
      // Mapping simple mots-clés -> groupe
      const s = (texte + ' ' + imgUrl).toLowerCase();
      const isAny = (arr) => arr.some(k => s.includes(k));
      const spices = ['cannelle','curcuma','gingembre','clou de girofle','poivre','vanille','muscade'];
      const fruits = [
        'goyave','corossol','quenette','papaye','tamarin','sapotille','nefle','nèfle','cerise','carambole','maracuja',
        'pomme surette','pomme-surette','pomme malaka','pomme cythere','pomme-cythere','cythere','pomme liane',
        'ananas','mangue','manguier','banane','bananier','sapotillier','fruit a pain','fruit à pain','fruit-a-pain','breadfruit','artocarpus'
      ];
      const veryCommonFruits = ['banane','bananier','mangue','manguier','ananas','goyave','corossol','quenette','fruit a pain','fruit à pain','fruit-a-pain','breadfruit'];
      const foodVeggies = [
        'christophine','chayotte','giraumon','patate douce','manioc','gombo','pois d\'angole','pois d-angole','igname','madere','madère'
      ];
      const medicinal = [
        'aloe','aloé','aloe vera','atoumo','orthosiphon','consoude','melisse','mélisse','raifort','romarin','curcuma','gingembre','herbe charpentier','herbe-charpentier','simen kontra','simen-kontra'
      ];
      const ornamental = ['tajetes','tagetes','koklaya','ornement','fleur','bleuets','hibiscus','bougainvillee','bougainvillée'];

      let detectedGroup = '';
      if (isAny(spices) || isAny(['épice','epice'])) detectedGroup = 'group:food_plants';
      else if (isAny(foodVeggies)) detectedGroup = 'group:food_plants';
      else if (isAny(fruits)) detectedGroup = 'group:fruit_trees';
      else if (isAny(medicinal) || isAny(['tisane','infusion','remede','remède'])) detectedGroup = 'group:medicinal_plants';
      else if (isAny(ornamental)) detectedGroup = 'group:ornamental_plants';
      if (detectedGroup) themes.add(detectedGroup);

      // Déterminer le niveau selon le groupe et la familiarité locale
      let level = out.levelClass || '';
      if (!level) {
        if (detectedGroup === 'group:fruit_trees') {
          level = isAny(veryCommonFruits) ? 'CE1' : 'CE2';
        } else if (detectedGroup === 'group:food_plants') {
          level = 'CE2';
        } else if (detectedGroup === 'group:medicinal_plants') {
          level = 'CM1';
        } else if (detectedGroup === 'group:ornamental_plants') {
          level = 'CE2';
        } else {
          level = 'CE2';
        }
      }
      out.levelClass = out.levelClass || level;

      // Raffinement texte très court / majuscules → au pire CE2 (on ne remonte pas au‑dessus)
      const t = String(texte).trim();
      if (!/[a-z]/.test(t) || t.length <= 6) {
        if (!out.levelClass) out.levelClass = 'CE2';
      }

      // Ajouter la facette curriculum_grade correspondant au niveau
      if (out.levelClass) themes.add(`curriculum_grade:${out.levelClass}`);
      out.themes = Array.from(themes);
    }
    return out;
  };

  const applyPrefill = (overwrite = false) => {
    setData(prev => {
      const list = (prev.associations || []).map((a) => {
        const inf = inferForAssoc(a);
        const patch = {};
        if (overwrite) {
          if (inf.levelClass) patch.levelClass = inf.levelClass;
          if (inf.themes) patch.themes = inf.themes;
        } else {
          if (!a.levelClass && inf.levelClass) patch.levelClass = inf.levelClass;
          if ((!a.themes || a.themes.length === 0) && inf.themes) patch.themes = inf.themes;
        }
        return Object.keys(patch).length ? { ...a, ...patch } : a;
      });
      const next = { ...prev, associations: list };
      try {
        if (save) {
          const r = save(next);
          if (r && typeof r.then === 'function') r.catch(() => {});
        }
      } catch {}
      return next;
    });
  };

  return (
    <section style={{ marginTop: 12 }}>
      <h2>Catégoriser les associations (classe & thèmes)</h2>
      <p style={{ color: '#666' }}>Définissez la difficulté (classe) et les thèmes sur chaque paire. Ces métadonnées priment sur celles des éléments.</p>
      <div style={{ margin: '8px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => applyPrefill(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #10b981', background: '#10b981', color: '#fff', fontWeight: 700 }}>
          Préremplir (ne remplit que les champs vides)
        </button>
        <button type="button" onClick={() => { if (window.confirm('Réappliquer et ÉCRASER toutes les classes et thèmes existants selon les nouvelles règles ?\n\nCette action est irréversible (mais vous pouvez re-modifier ensuite).')) applyPrefill(true); }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ef4444', background: '#ef4444', color: '#fff', fontWeight: 700 }}>
          Réappliquer et écraser les existants
        </button>
        <small style={{ color: '#666' }}>Le premier n'écrit que les vides; le second remplace classe et thèmes selon les nouvelles règles.</small>
      </div>
      <div style={{ margin: '8px 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher (texte, image, thème)" style={{ width: 380, maxWidth: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db' }} />
          <small style={{ marginLeft: 8, color: '#666' }}>{filteredAssocs.length} / {(data?.associations || []).length} associations</small>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Paire</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Classe</th>
              {showThemesColumn && (
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Thèmes</th>
              )}
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6 }}>Thématiques</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssocs.map((a, idx) => {
              const left = a.texteId ? (index.t.get(a.texteId)?.content || '') : (a.calculId ? (index.c.get(a.calculId)?.content || '') : '');
              const right = a.imageId ? (index.i.get(a.imageId)?.url || '') : (a.chiffreId ? (index.n.get(a.chiffreId)?.content || '') : '');
              const kind = a.calculId && a.chiffreId ? 'math' : (a.texteId && a.imageId ? 'botany' : 'generic');
              return (
                <tr key={idx}>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: 6 }}>
                    {left} <span style={{ opacity: 0.6 }}>↔</span> {right}
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: 6 }}>
                    <select
                      value={a.levelClass || ''}
                      onChange={(e) => updateAssoc(idx, { levelClass: e.target.value })}
                      style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}
                    >
                      <option value="">(non défini)</option>
                      {CLASS_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  {showThemesColumn && (
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 6 }}>
                      {showRawThemes ? (
                        <input
                          placeholder="ex: domain:botany, region:caribbean, group:fruit_trees"
                          value={(a.themes || []).join(', ')}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const themes = raw.split(',').map(s => s.trim()).filter(Boolean);
                            updateAssoc(idx, { themes });
                          }}
                          list="assoc-themes"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {(a.themes || []).map((t) => (
                            <span key={t} style={{ background: '#eef2ff', color: '#3730a3', padding: '4px 8px', borderRadius: 999, border: '1px solid #c7d2fe', fontSize: 12 }}>
                              {labelThemeFr(t)}
                            </span>
                          ))}
                          {(a.themes || []).length === 0 && (
                            <span style={{ color: '#6b7280' }}>(aucun thème)</span>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: 6, minWidth: 320 }}>
                    <FacetQuickControls
                      kind={kind}
                      initialRegion="caribbean"
                      currentThemes={a.themes || []}
                      onApply={(themes) => updateAssoc(idx, { themes })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <datalist id="assoc-themes">
        {allThemes.map(t => <option key={t} value={t} />)}
      </datalist>
    </section>
  );
}
