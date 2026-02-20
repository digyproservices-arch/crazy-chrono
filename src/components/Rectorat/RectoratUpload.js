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
  { value: 'caribbean', label: 'Caraïbes' },
  { value: 'amazonia', label: 'Amazonie' },
  { value: 'europe', label: 'Europe' },
  { value: 'indian_ocean', label: 'Océan Indien' },
  { value: 'pacific', label: 'Pacifique' },
  { value: 'africa', label: 'Afrique' },
  { value: 'worldwide', label: 'Monde' },
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

  if (type === 'math') {
    const calcIdx = findColumnIndex(headers, [/calcul/, /opéra/, /express/, /formule/]);
    const resultIdx = findColumnIndex(headers, [/résultat/, /chiffre/, /réponse/, /result/]);
    const levelIdx = findColumnIndex(headers, [/niveau/, /classe/, /level/]);
    if (calcIdx < 0 || resultIdx < 0) return { error: 'Colonnes "Calcul" et "Résultat" non trouvées.' };

    for (let i = 1; i < raw.length; i++) {
      const calc = String(raw[i][calcIdx] || '').trim();
      const result = String(raw[i][resultIdx] || '').trim();
      if (!calc || !result) continue;
      pairs.push({
        type: 'math',
        left: calc,
        right: result,
        level: levelIdx >= 0 ? String(raw[i][levelIdx] || '').trim() : '',
        selected: true,
      });
    }
  } else {
    const textIdx = findColumnIndex(headers, [/texte/, /mot/, /nom/, /word/, /terme/, /label/]);
    const imgIdx = findColumnIndex(headers, [/image/, /photo/, /url/, /fichier/, /img/]);
    const levelIdx = findColumnIndex(headers, [/niveau/, /classe/, /level/]);
    const leftIdx = textIdx >= 0 ? textIdx : 0;
    const rightIdx = imgIdx >= 0 ? imgIdx : (headers.length > 1 ? 1 : -1);
    if (rightIdx < 0) return { error: 'Au moins 2 colonnes requises.' };

    for (let i = 1; i < raw.length; i++) {
      const left = String(raw[i][leftIdx] || '').trim();
      const right = String(raw[i][rightIdx] || '').trim();
      if (!left) continue;
      pairs.push({
        type: 'text_image',
        left,
        right: right || '',
        level: levelIdx >= 0 ? String(raw[i][levelIdx] || '').trim() : '',
        selected: true,
      });
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

  // Sheet 1: Texte ↔ Image
  const textData = [
    ['Texte', 'Image', 'Niveau', 'Domaine'],
    ['Banane', 'images/banane.png', 'CE1', 'botanique'],
    ['Colibri', 'images/colibri.png', 'CE2', 'zoologie'],
    ['Volcan', 'images/volcan.png', 'CM1', 'géographie'],
    ['Madras', 'images/madras.png', 'CP', 'culture'],
    ['', '', '', ''],
    ['--- Instructions ---', '', '', ''],
    ['Texte = le mot ou terme affiché', '', '', ''],
    ['Image = chemin ou URL de l\'image', '', '', ''],
    ['Niveau = CP, CE1, CE2, CM1, CM2, 6e, 5e, 4e, 3e', '', '', ''],
    ['Domaine = botanique, zoologie, math, langue, sciences, géographie, histoire, arts, culture, environnement, sports', '', '', ''],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(textData);
  ws1['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Texte - Image');

  // Sheet 2: Calcul ↔ Résultat
  const mathData = [
    ['Calcul', 'Résultat', 'Niveau', 'Domaine'],
    ['3 + 5', '8', 'CP', 'math'],
    ['7 × 6', '42', 'CE2', 'math'],
    ['45 ÷ 9', '5', 'CM1', 'math'],
    ['12 × 12', '144', 'CM2', 'math'],
    ['', '', '', ''],
    ['--- Instructions ---', '', '', ''],
    ['Calcul = l\'opération affichée au joueur', '', '', ''],
    ['Résultat = la bonne réponse', '', '', ''],
    ['Niveau = CP, CE1, CE2, CM1, CM2, 6e, 5e, 4e, 3e', '', '', ''],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(mathData);
  ws2['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Calcul - Résultat');

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
        const themes = [`domain:${defaultDomain}`];
        if (defaultRegion) themes.push(`region:${defaultRegion}`);
        themes.push(`curriculum_grade:${level}`);

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
            Colonnes : <code>Texte | Image | Niveau</code> (ou <code>Mot | URL | Classe</code>)<br /><br />
            <strong>Excel (.xlsx) — Maths :</strong><br />
            Colonnes : <code>Calcul | Résultat | Niveau</code><br /><br />
            <strong>Word (.docx) :</strong><br />
            Une paire par ligne, séparée par <code>tab</code>, <code>;</code>, <code>|</code> ou <code> - </code><br />
            Ex: <code>Banane ; images/banane.jpeg</code><br />
            Ou simplement une liste de mots (un par ligne)
          </div>
        </div>
      )}
    </div>
  );
}
