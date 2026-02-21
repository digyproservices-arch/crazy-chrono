import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

const CLASS_LEVELS = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
const DOMAINS = [
  { value: 'botany', label: 'Botanique', icon: '🌿' },
  { value: 'zoology', label: 'Zoologie', icon: '🐾' },
  { value: 'math', label: 'Mathématiques', icon: '🔢' },
  { value: 'language', label: 'Langue', icon: '📝' },
  { value: 'science', label: 'Sciences', icon: '🔬' },
  { value: 'geography', label: 'Géographie', icon: '🌍' },
  { value: 'history_civics', label: 'Histoire & EMC', icon: '📜' },
  { value: 'arts', label: 'Arts', icon: '🎨' },
  { value: 'culture', label: 'Culture', icon: '🎭' },
  { value: 'environment', label: 'Environnement', icon: '♻️' },
  { value: 'sports', label: 'Sports', icon: '⚽' },
];
const REGIONS = [
  { value: 'guadeloupe', label: 'Guadeloupe' },
  { value: 'martinique', label: 'Martinique' },
  { value: 'guyane', label: 'Guyane' },
  { value: 'reunion', label: 'Réunion' },
  { value: 'mayotte', label: 'Mayotte' },
  { value: 'haiti', label: 'Haïti' },
  { value: 'cuba', label: 'Cuba' },
  { value: 'trinidad', label: 'Trinidad' },
  { value: 'france', label: 'France métro.' },
  { value: 'senegal', label: 'Sénégal' },
  { value: 'cote_ivoire', label: "Côte d'Ivoire" },
  { value: 'cameroun', label: 'Cameroun' },
  { value: 'madagascar', label: 'Madagascar' },
  { value: 'afrique', label: 'Afrique' },
  { value: 'asie', label: 'Asie' },
  { value: 'polynesie', label: 'Polynésie' },
  { value: 'nouvelle_caledonie', label: 'Nlle-Calédonie' },
  { value: 'international', label: 'International' },
];
const CATEGORIES = [
  { value: 'fruit', label: 'Fruits', icon: '🍎' },
  { value: 'epice', label: 'Épices', icon: '🌶️' },
  { value: 'plante_medicinale', label: 'Plantes médicinales', icon: '🌿' },
  { value: 'plante_aromatique', label: 'Plantes aromatiques', icon: '🌱' },
  { value: 'tubercule', label: 'Tubercules', icon: '🥔' },
  { value: 'legume', label: 'Légumes', icon: '🥦' },
  { value: 'legumineuse', label: 'Légumineuses', icon: '🌾' },
  { value: 'fleur', label: 'Fleurs', icon: '🌺' },
  { value: 'arbre', label: 'Arbres', icon: '🌳' },
  { value: 'plante_industrielle', label: 'Plantes industrielles', icon: '🏭' },
  { value: 'plante_tinctoriale', label: 'Plantes tinctoriales', icon: '🎨' },
  { value: 'table_2', label: 'Table de 2' }, { value: 'table_3', label: 'Table de 3' },
  { value: 'table_4', label: 'Table de 4' }, { value: 'table_5', label: 'Table de 5' },
  { value: 'table_6', label: 'Table de 6' }, { value: 'table_7', label: 'Table de 7' },
  { value: 'table_8', label: 'Table de 8' }, { value: 'table_9', label: 'Table de 9' },
  { value: 'table_10', label: 'Table de 10' },
  { value: 'addition', label: 'Addition', icon: '➕' },
  { value: 'soustraction', label: 'Soustraction', icon: '➖' },
];

function detectPairType(headers) {
  const h = headers.map(s => String(s || '').toLowerCase().trim());
  const hasCalc = h.some(x => /calcul|opéra|express/.test(x));
  const hasResult = h.some(x => /résultat|chiffre|réponse|result/.test(x));
  if (hasCalc && hasResult) return 'math';
  return 'text_image';
}

function findColumnIndex(headers, patterns) {
  const h = headers.map(s => String(s || '').toLowerCase().trim());
  for (const p of patterns) {
    const idx = h.findIndex(x => p.test(x));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length < 2) return { error: 'Fichier vide ou sans données.' };

  const headers = raw[0].map(String);
  const type = detectPairType(headers);
  const pairs = [];

  // Colonnes communes
  const levelIdx = findColumnIndex(headers, [/niveau/, /classe/, /level/]);
  const domainIdx = findColumnIndex(headers, [/domaine/, /domain/]);
  const categoryIdx = findColumnIndex(headers, [/catégorie/, /categorie/, /category/]);
  const regionsIdx = findColumnIndex(headers, [/région/, /region/]);

  const readCommon = (row) => ({
    level: levelIdx >= 0 ? String(row[levelIdx] || '').trim() : '',
    domain: domainIdx >= 0 ? String(row[domainIdx] || '').trim() : '',
    category: categoryIdx >= 0 ? String(row[categoryIdx] || '').trim() : '',
    regions: regionsIdx >= 0 ? String(row[regionsIdx] || '').trim() : '',
    selected: true,
  });

  if (type === 'math') {
    const calcIdx = findColumnIndex(headers, [/calcul/, /opéra/, /express/, /formule/]);
    const resultIdx = findColumnIndex(headers, [/résultat/, /chiffre/, /réponse/, /result/]);
    if (calcIdx < 0 || resultIdx < 0) return { error: 'Colonnes "Calcul" et "Résultat" non trouvées.' };

    for (let i = 1; i < raw.length; i++) {
      const calc = String(raw[i][calcIdx] || '').trim();
      const result = String(raw[i][resultIdx] || '').trim();
      if (!calc || !result) continue;
      pairs.push({ type: 'math', left: calc, right: result, ...readCommon(raw[i]) });
    }
  } else {
    const textIdx = findColumnIndex(headers, [/texte/, /mot/, /nom/, /word/, /terme/, /label/]);
    const imgIdx = findColumnIndex(headers, [/image/, /photo/, /url/, /fichier/, /img/]);
    const leftIdx = textIdx >= 0 ? textIdx : 0;
    const rightIdx = imgIdx >= 0 ? imgIdx : (headers.length > 1 ? 1 : -1);
    if (rightIdx < 0) return { error: 'Au moins 2 colonnes requises.' };

    for (let i = 1; i < raw.length; i++) {
      const left = String(raw[i][leftIdx] || '').trim();
      const right = String(raw[i][rightIdx] || '').trim();
      if (!left) continue;
      pairs.push({ type: 'text_image', left, right: right || '', ...readCommon(raw[i]) });
    }
  }

  return { pairs, detectedType: type, headers };
}

async function parseWord(buffer) {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = result.value || '';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return { error: 'Document vide.' };

    const pairs = [];
    for (const line of lines) {
      // Try tab/semicolon/pipe separated
      let parts = null;
      if (line.includes('\t')) parts = line.split('\t');
      else if (line.includes(';')) parts = line.split(';');
      else if (line.includes('|')) parts = line.split('|');
      else if (line.includes(' - ')) parts = line.split(' - ');

      if (parts && parts.length >= 2) {
        pairs.push({
          type: 'text_image',
          left: parts[0].trim(),
          right: parts[1].trim(),
          level: parts.length > 2 ? parts[2].trim() : '',
          selected: true,
        });
      } else if (line.length > 0 && line.length < 100) {
        // Single word/term — add as text only
        pairs.push({
          type: 'text_image',
          left: line,
          right: '',
          level: '',
          selected: true,
        });
      }
    }
    if (pairs.length === 0) return { error: 'Aucune paire détectée. Utilisez un format structuré (séparateur tab, ;, | ou -).' };
    return { pairs, detectedType: 'text_image' };
  } catch (e) {
    return { error: 'Erreur lecture Word: ' + e.message };
  }
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Texte ↔ Image (botanique, zoologie, culture, etc.)
  const textData = [
    ['Texte', 'Image', 'Niveau', 'Domaine', 'Catégorie', 'Régions'],
    ['Banane', 'images/banane.png', 'CP', 'botany', 'fruit', 'guadeloupe, martinique, guyane, reunion, afrique'],
    ['Cannelle', 'images/cannelle.png', 'CP', 'botany', 'epice', 'guadeloupe, martinique, reunion, asie, france, international'],
    ['Aloe Vera', 'images/aloe_vera.png', 'CE1', 'botany', 'plante_medicinale', 'guadeloupe, martinique, reunion, afrique, international'],
    ['Igname', 'images/igname.png', 'CE1', 'botany', 'tubercule', 'guadeloupe, martinique, guyane, haiti, afrique, asie'],
    ['Gombo', 'images/gombo.png', 'CE2', 'botany', 'legume', 'guadeloupe, martinique, guyane, haiti, afrique, france'],
    ['Colibri', 'images/colibri.png', 'CE2', 'zoology', '', 'guadeloupe, martinique'],
    ['Volcan', 'images/volcan.png', 'CM1', 'geography', '', ''],
    ['Madras', 'images/madras.png', 'CP', 'culture', '', 'guadeloupe, martinique'],
    ['', '', '', '', '', ''],
    ['=== INSTRUCTIONS ===', '', '', '', '', ''],
    ['Texte', 'Le mot ou terme affiché au joueur', '', '', '', ''],
    ['Image', 'Chemin du fichier image (ex: images/banane.png) ou URL', '', '', '', ''],
    ['Niveau', 'CP, CE1, CE2, CM1, CM2, 6e, 5e, 4e, 3e', '', '', '', ''],
    ['Domaine', 'botany, zoology, math, language, science, geography, history_civics, arts, culture, environment, sports', '', '', '', ''],
    ['Catégorie', 'fruit, epice, plante_medicinale, plante_aromatique, tubercule, legume, legumineuse, fleur, arbre, plante_industrielle, plante_tinctoriale', '', '', '', ''],
    ['Régions', 'Liste séparée par virgules: guadeloupe, martinique, guyane, reunion, haiti, france, afrique, asie, international...', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['CONSEIL', 'Seules les colonnes Texte et Image sont obligatoires. Niveau, Domaine, Catégorie et Régions sont optionnels — vous pouvez les définir après import dans la Bibliothèque.', '', '', '', ''],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(textData);
  ws1['!cols'] = [{ wch: 20 }, { wch: 35 }, { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Texte - Image');

  // Sheet 2: Calcul ↔ Résultat
  const mathData = [
    ['Calcul', 'Résultat', 'Niveau', 'Domaine', 'Catégorie'],
    ['3 + 5', '8', 'CP', 'math', 'addition'],
    ['12 - 7', '5', 'CP', 'math', 'soustraction'],
    ['2 × 3', '6', 'CE1', 'math', 'table_2'],
    ['7 × 6', '42', 'CE2', 'math', 'table_7'],
    ['9 × 8', '72', 'CM1', 'math', 'table_9'],
    ['12 × 12', '144', 'CM2', 'math', 'table_12'],
    ['', '', '', '', ''],
    ['=== INSTRUCTIONS ===', '', '', '', ''],
    ['Calcul', 'L\'opération affichée au joueur (utiliser × pour multiplier, + pour additionner, - pour soustraire)', '', '', ''],
    ['Résultat', 'La bonne réponse numérique', '', '', ''],
    ['Niveau', 'CP, CE1, CE2, CM1, CM2, 6e, 5e, 4e, 3e', '', '', ''],
    ['Catégorie', 'table_2 à table_12, addition, soustraction', '', '', ''],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(mathData);
  ws2['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Calcul - Résultat');

  // Sheet 3: Référence — listes des valeurs possibles
  const refData = [
    ['=== RÉFÉRENCE DES VALEURS ===', '', ''],
    ['', '', ''],
    ['NIVEAUX', 'DOMAINES', 'CATÉGORIES BOTANIQUE'],
    ['CP', 'botany', 'fruit'],
    ['CE1', 'zoology', 'epice'],
    ['CE2', 'math', 'plante_medicinale'],
    ['CM1', 'language', 'plante_aromatique'],
    ['CM2', 'science', 'tubercule'],
    ['6e', 'geography', 'legume'],
    ['5e', 'history_civics', 'legumineuse'],
    ['4e', 'arts', 'fleur'],
    ['3e', 'culture', 'arbre'],
    ['', 'environment', 'plante_industrielle'],
    ['', 'sports', 'plante_tinctoriale'],
    ['', '', ''],
    ['RÉGIONS DISPONIBLES', '', 'CATÉGORIES MATH'],
    ['guadeloupe', 'haiti', 'addition'],
    ['martinique', 'cuba', 'soustraction'],
    ['guyane', 'trinidad', 'table_2 à table_12'],
    ['reunion', 'senegal', ''],
    ['mayotte', 'cote_ivoire', ''],
    ['france', 'cameroun', ''],
    ['afrique', 'madagascar', ''],
    ['asie', 'polynesie', ''],
    ['international', 'nouvelle_caledonie', ''],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(refData);
  ws3['!cols'] = [{ wch: 25 }, { wch: 22 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Référence');

  XLSX.writeFile(wb, 'Modele_CrazyChrono.xlsx');
}

export default function RectoratUpload({ data, setData, saveToBackend }) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [pairs, setPairs] = useState([]);
  const [detectedType, setDetectedType] = useState('');
  const [defaultLevel, setDefaultLevel] = useState('CE1');
  const [defaultDomain, setDefaultDomain] = useState('botany');
  const [defaultRegion, setDefaultRegion] = useState('caribbean');
  const [imported, setImported] = useState(false);
  const fileRef = useRef(null);

  const processFile = useCallback(async (file) => {
    setParseError('');
    setPairs([]);
    setImported(false);
    setFileName(file.name);
    setParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const ext = file.name.split('.').pop().toLowerCase();
      let result;

      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        result = parseExcel(buffer);
      } else if (ext === 'docx' || ext === 'doc') {
        result = await parseWord(buffer);
      } else {
        setParseError(`Format non supporté: .${ext}. Utilisez .xlsx, .docx ou .csv`);
        setParsing(false);
        return;
      }

      if (result.error) {
        setParseError(result.error);
      } else {
        setPairs(result.pairs || []);
        setDetectedType(result.detectedType || '');
        if (result.detectedType === 'math') {
          setDefaultDomain('math');
        }
      }
    } catch (e) {
      setParseError('Erreur: ' + e.message);
    }
    setParsing(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const togglePair = (idx) => {
    setPairs(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p));
  };
  const selectAll = (val) => setPairs(prev => prev.map(p => ({ ...p, selected: val })));

  const handleImport = () => {
    const selected = pairs.filter(p => p.selected);
    if (selected.length === 0) return;

    setData(prev => {
      const now = Date.now();
      let newTextes = [...(prev.textes || [])];
      let newImages = [...(prev.images || [])];
      let newCalculs = [...(prev.calculs || [])];
      let newChiffres = [...(prev.chiffres || [])];
      let newAssoc = [...(prev.associations || [])];

      selected.forEach((p, idx) => {
        const ts = now + idx;
        const level = p.level || defaultLevel;

        // Build themes from per-row data or defaults
        const themes = [];
        const rowDomain = p.domain || defaultDomain;
        if (rowDomain) themes.push(`domain:${rowDomain}`);
        const rowCategory = p.category || '';
        if (rowCategory) themes.push(`category:${rowCategory}`);
        // Regions: from row (comma-separated) or default
        const rowRegions = p.regions
          ? p.regions.split(',').map(r => r.trim()).filter(Boolean)
          : (defaultRegion ? [defaultRegion] : []);
        for (const rk of rowRegions) themes.push(`region:${rk}`);

        if (p.type === 'math') {
          const cId = `c${ts}`;
          const nId = `n${ts}`;
          newCalculs.push({ id: cId, content: p.left });
          newChiffres.push({ id: nId, content: p.right });
          newAssoc.push({ calculId: cId, chiffreId: nId, levelClass: level, themes });
        } else {
          const tId = `t${ts}`;
          newTextes.push({ id: tId, content: p.left });
          if (p.right) {
            const iId = `i${ts}`;
            newImages.push({ id: iId, url: p.right });
            newAssoc.push({ texteId: tId, imageId: iId, levelClass: level, themes });
          }
        }
      });

      const newData = {
        ...prev,
        textes: newTextes,
        images: newImages,
        calculs: newCalculs,
        chiffres: newChiffres,
        associations: newAssoc,
      };
      if (saveToBackend) saveToBackend(newData);
      return newData;
    });

    setImported(true);
  };

  const selectedCount = pairs.filter(p => p.selected).length;

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `3px dashed ${dragOver ? '#0D6A7A' : '#cbd5e1'}`,
          borderRadius: 16,
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? '#e0f7fa' : '#f8fafc',
          transition: 'all 0.2s',
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 8 }}>📁</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
          Glissez votre fichier ici
        </div>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          ou cliquez pour parcourir — Excel (.xlsx), Word (.docx), CSV
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.docx,.csv"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Parsing state */}
      {parsing && (
        <div style={{ textAlign: 'center', padding: 24, color: '#0D6A7A', fontWeight: 600 }}>
          Analyse de {fileName}...
        </div>
      )}

      {parseError && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: 16, borderRadius: 12, marginBottom: 16, fontWeight: 600 }}>
          {parseError}
        </div>
      )}

      {/* Results */}
      {pairs.length > 0 && !imported && (
        <div>
          {/* Config bar */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16, padding: 16, background: '#f0fdfa', borderRadius: 12, border: '1px solid #99f6e4' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0D6A7A', width: '100%', marginBottom: 4 }}>
              📋 {pairs.length} paires extraites de <strong>{fileName}</strong> — {detectedType === 'math' ? '🔢 Maths' : '📝 Texte/Image'}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 2 }}>Niveau par défaut</label>
              <select value={defaultLevel} onChange={e => setDefaultLevel(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}>
                {CLASS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 2 }}>Domaine</label>
              <select value={defaultDomain} onChange={e => setDefaultDomain(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}>
                {DOMAINS.map(d => <option key={d.value} value={d.value}>{d.icon} {d.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 2 }}>Région</label>
              <select value={defaultRegion} onChange={e => setDefaultRegion(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}>
                {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* Selection controls */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <button onClick={() => selectAll(true)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Tout sélectionner</button>
            <button onClick={() => selectAll(false)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Tout désélectionner</button>
            <span style={{ fontSize: 12, color: '#64748b' }}>{selectedCount} / {pairs.length} sélectionnées</span>
          </div>

          {/* Pairs table */}
          <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', width: 40 }}>✓</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: 700, color: '#334155', fontSize: 13 }}>
                    {detectedType === 'math' ? 'Calcul' : 'Texte'}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: 700, color: '#334155', fontSize: 13 }}>
                    {detectedType === 'math' ? 'Résultat' : 'Image'}
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', fontWeight: 700, color: '#334155', fontSize: 13, width: 80 }}>Niveau</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p, idx) => (
                  <tr key={idx} style={{ background: p.selected ? '#fff' : '#f1f5f9', opacity: p.selected ? 1 : 0.5 }}>
                    <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                      <input type="checkbox" checked={p.selected} onChange={() => togglePair(idx)} />
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#334155' }}>{p.left}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#64748b' }}>{p.right || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                      <select
                        value={p.level || defaultLevel}
                        onChange={e => setPairs(prev => prev.map((pp, i) => i === idx ? { ...pp, level: e.target.value } : pp))}
                        style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}
                      >
                        {CLASS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import button */}
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              style={{
                padding: '12px 32px',
                fontSize: 15,
                fontWeight: 700,
                background: selectedCount > 0 ? '#0D6A7A' : '#94a3b8',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
                boxShadow: '0 4px 12px rgba(13,106,122,0.3)',
              }}
            >
              Importer {selectedCount} paire{selectedCount > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Import success */}
      {imported && (
        <div style={{ textAlign: 'center', padding: 32, background: '#f0fdf4', borderRadius: 16, border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>
            {selectedCount} paire{selectedCount > 1 ? 's' : ''} importée{selectedCount > 1 ? 's' : ''} avec succès !
          </div>
          <button
            onClick={() => { setPairs([]); setImported(false); setFileName(''); }}
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#0D6A7A', border: '2px solid #0D6A7A', borderRadius: 8, cursor: 'pointer', marginTop: 8 }}
          >
            Importer un autre fichier
          </button>
        </div>
      )}

      {/* Template help */}
      {pairs.length === 0 && !parsing && !imported && (
        <div style={{ padding: 20, background: '#fffbeb', borderRadius: 12, border: '1px solid #fde68a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: '#92400e' }}>💡 Format attendu</div>
            <button
              onClick={downloadTemplate}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 700,
                background: '#0D6A7A',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(13,106,122,0.25)',
              }}
            >
              � Télécharger le modèle Excel
            </button>
          </div>
          <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
            <strong>Excel (.xlsx) — Texte/Image :</strong><br />
            Colonnes : <code>Texte | Image | Niveau | Domaine | Catégorie | Régions</code><br />
            <em style={{ fontSize: 11, color: '#92400e' }}>Seules Texte et Image sont obligatoires. Domaine, Catégorie et Régions sont optionnels.</em><br /><br />
            <strong>Excel (.xlsx) — Maths :</strong><br />
            Colonnes : <code>Calcul | Résultat | Niveau | Domaine | Catégorie</code><br /><br />
            <strong>Word (.docx) :</strong><br />
            Une paire par ligne, séparée par <code>tab</code>, <code>;</code>, <code>|</code> ou <code> - </code><br />
            Ex: <code>Banane ; images/banane.jpeg</code><br /><br />
            <strong>3 onglets dans le modèle :</strong> Texte-Image, Calcul-Résultat, Référence (listes des valeurs)
          </div>
        </div>
      )}
    </div>
  );
}
