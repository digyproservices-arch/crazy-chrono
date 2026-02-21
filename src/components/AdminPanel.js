import React, { useContext, useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import AdminAssocMeta from "./AdminAssocMeta";
import { DataContext } from "../context/DataContext";
import RectoratUpload from "./Rectorat/RectoratUpload";
import RectoratLibrary from "./Rectorat/RectoratLibrary";

function AdminPanel() {
  const { data, setData, importJson, downloadJson } = useContext(DataContext);
  const [newTexte, setNewTexte] = useState("");
  const [newImage, setNewImage] = useState("");
  const [newCalcul, setNewCalcul] = useState("");
  const [newChiffre, setNewChiffre] = useState("");
  const [selectedTexte, setSelectedTexte] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedCalcul, setSelectedCalcul] = useState("");
  const [selectedChiffre, setSelectedChiffre] = useState("");
  const [editImageId, setEditImageId] = useState(null);
  const [editImageValue, setEditImageValue] = useState("");
  const [editTexteId, setEditTexteId] = useState(null);
  const [editTexteValue, setEditTexteValue] = useState("");
  const [editCalculId, setEditCalculId] = useState(null);
  const [editCalculValue, setEditCalculValue] = useState("");
  const [editChiffreId, setEditChiffreId] = useState(null);
  const [editChiffreValue, setEditChiffreValue] = useState("");
  const [activeTab, setActiveTab] = useState('library'); // 'upload' | 'library'

  // Niveaux scolaires disponibles (aligné avec SessionConfig)
  const CLASS_LEVELS = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
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

  // ===== Auto-tagging intelligent (niveaux & catégories) =====
  const parseOperands = (expr) => {
    const s = String(expr || '').replace(/[×x]/g, 'x').replace(/[÷:]/g, '/');
    const mMul = s.match(/(\d+)\s*[x*]\s*(\d+)/i);
    const mAdd = s.match(/(\d+)\s*\+\s*(\d+)/);
    const mSub = s.match(/(\d+)\s*[-−]\s*(\d+)/);
    const mDiv = s.match(/(\d+)\s*\/\s*(\d+)/);
    return { mMul, mAdd, mSub, mDiv };
  };
  const inferCalcLevel = (expr) => {
    const { mMul, mAdd, mSub, mDiv } = parseOperands(expr);
    if (mDiv) return 'CM1';
    if (mMul) {
      const a = parseInt(mMul[1],10), b = parseInt(mMul[2],10);
      const max = Math.max(a,b), prod = a*b;
      if (max <= 5 && prod <= 50) return 'CE1';
      if (max <= 9 && prod <= 100) return 'CE2';
      return 'CM1';
    }
    if (mAdd || mSub) {
      const a = mAdd ? parseInt(mAdd[1],10) : parseInt(mSub[1],10);
      const b = mAdd ? parseInt(mAdd[2],10) : parseInt(mSub[2],10);
      if (a <= 10 && b <= 10) return 'CP';
      return 'CE1';
    }
    return '';
  };
  const mostFrequentLevel = (arr) => {
    const freq = new Map();
    for (const lv of arr.map(NORM_LEVEL).filter(Boolean)) freq.set(lv, (freq.get(lv)||0)+1);
    if (freq.size === 0) return '';
    // tri par fréquence puis par ordre pédagogique
    const order = new Map(CLASS_LEVELS.map((lv,i)=>[lv,i]));
    const sorted = Array.from(freq.entries()).sort((a,b)=> b[1]-a[1] || (order.get(a[0]) - order.get(b[0])));
    return sorted[0][0];
  };
  const uniqSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort();

  const autoTagElements = () => {
    const assoc = Array.isArray(data?.associations) ? data.associations : [];
    // index: id -> {themes:Set, levels:[]}
    const themesById = { textes: new Map(), images: new Map(), calculs: new Map(), chiffres: new Map() };
    const levelsById = { textes: new Map(), images: new Map(), calculs: new Map(), chiffres: new Map() };
    for (const a of assoc) {
      const ths = (a?.themes || []).map(String);
      const lvCandidates = [a?.levelClass, ...(a?.levels||[]), ...(a?.classes||[]), ...(a?.classLevels||[])].map(NORM_LEVEL).filter(Boolean);
      if (a.texteId && a.imageId) {
        const tSet = themesById.textes.get(a.texteId) || new Set(); ths.forEach(x=>tSet.add(x)); themesById.textes.set(a.texteId, tSet);
        const iSet = themesById.images.get(a.imageId) || new Set(); ths.forEach(x=>iSet.add(x)); themesById.images.set(a.imageId, iSet);
        const tLv = levelsById.textes.get(a.texteId) || []; levelsById.textes.set(a.texteId, tLv.concat(lvCandidates));
        const iLv = levelsById.images.get(a.imageId) || []; levelsById.images.set(a.imageId, iLv.concat(lvCandidates));
      }
      if (a.calculId && a.chiffreId) {
        const cSet = themesById.calculs.get(a.calculId) || new Set(); ths.forEach(x=>cSet.add(x)); themesById.calculs.set(a.calculId, cSet);
        const nSet = themesById.chiffres.get(a.chiffreId) || new Set(); ths.forEach(x=>nSet.add(x)); themesById.chiffres.set(a.chiffreId, nSet);
        const cLv = levelsById.calculs.get(a.calculId) || []; levelsById.calculs.set(a.calculId, cLv.concat(lvCandidates));
        const nLv = levelsById.chiffres.get(a.chiffreId) || []; levelsById.chiffres.set(a.chiffreId, nLv.concat(lvCandidates));
      }
    }

    // Construire nouvelles listes
    const nextTextes = (data.textes || []).map(t => {
      const themes = themesById.textes.get(t.id);
      const lv = mostFrequentLevel(levelsById.textes.get(t.id) || []);
      return { ...t, themes: themes ? uniqSorted(Array.from(themes)) : t.themes, levelClass: lv || t.levelClass };
    });
    const nextImages = (data.images || []).map(i => {
      const themes = themesById.images.get(i.id);
      const lv = mostFrequentLevel(levelsById.images.get(i.id) || []);
      return { ...i, themes: themes ? uniqSorted(Array.from(themes)) : i.themes, levelClass: lv || i.levelClass };
    });
    const nextCalculs = (data.calculs || []).map(c => {
      const themes = themesById.calculs.get(c.id);
      let lv = mostFrequentLevel(levelsById.calculs.get(c.id) || []);
      if (!lv) lv = inferCalcLevel(c.content);
      return { ...c, themes: themes ? uniqSorted(Array.from(themes)) : c.themes, levelClass: lv || c.levelClass };
    });
    const nextChiffres = (data.chiffres || []).map(n => {
      const themes = themesById.chiffres.get(n.id);
      // Niveau chiffre: hériter du niveau prédominant des associations si présent
      const lv = mostFrequentLevel(levelsById.chiffres.get(n.id) || []);
      return { ...n, themes: themes ? uniqSorted(Array.from(themes)) : n.themes, levelClass: lv || n.levelClass };
    });

    const newData = { ...data, textes: nextTextes, images: nextImages, calculs: nextCalculs, chiffres: nextChiffres };
    setData(newData);
    saveToBackend(newData);
    const count = (before, after, field) => {
      let n = 0; for (let i=0;i<after.length;i++){ const a=after[i], b=before[i]; if (!!a[field] && !b[field]) n++; }
      return n;
    };
    try {
      alert(
        `Auto-tagging terminé.\n`+
        `Textes: +${count(data.textes || [], nextTextes, 'levelClass')} niveaux, +${count(data.textes || [], nextTextes, 'themes')} thèmes\n`+
        `Images: +${count(data.images || [], nextImages, 'levelClass')} niveaux, +${count(data.images || [], nextImages, 'themes')} thèmes\n`+
        `Calculs: +${count(data.calculs || [], nextCalculs, 'levelClass')} niveaux, +${count(data.calculs || [], nextCalculs, 'themes')} thèmes\n`+
        `Chiffres: +${count(data.chiffres || [], nextChiffres, 'levelClass')} niveaux, +${count(data.chiffres || [], nextChiffres, 'themes')} thèmes`
      );
    } catch {}
  };

  // ===== Auto-classification botanique (référentiel → domain + régions) =====
  const autoClassifyBotany = async () => {
    try {
      const res = await fetch(process.env.PUBLIC_URL + '/data/references/botanical_reference.json');
      if (!res.ok) { alert('Impossible de charger le référentiel botanique.'); return; }
      const ref = await res.json();
      const plants = ref.plants || [];
      if (plants.length === 0) { alert('Référentiel vide.'); return; }

      // Build lookup: lowercase matchName → plant entry
      const lookup = new Map();
      for (const p of plants) {
        for (const mn of (p.matchNames || [])) {
          lookup.set(mn.toLowerCase(), p);
        }
      }

      const assocs = data?.associations || [];
      const textes = data?.textes || [];
      const images = data?.images || [];
      const tMap = new Map(textes.map(t => [t.id, t]));
      const iMap = new Map(images.map(i => [i.id, i]));

      let matched = 0;
      let alreadyTagged = 0;

      const nextAssocs = assocs.map(a => {
        if (a.calculId && a.chiffreId) return a; // skip math pairs

        const textContent = (tMap.get(a.texteId)?.content || '').toLowerCase();
        const imgUrl = (iMap.get(a.imageId)?.url || '').toLowerCase();

        // Try to match text or image filename against any plant matchName
        let matchedPlant = null;
        for (const [name, plant] of lookup) {
          if (textContent.includes(name) || imgUrl.includes(name.replace(/\s+/g, '_')) || imgUrl.includes(name.replace(/\s+/g, '-'))) {
            matchedPlant = plant;
            break;
          }
        }

        if (!matchedPlant) return a;

        // Check if already classified
        const themes = (a.themes || []).slice();
        const hasDomainBotany = themes.includes('domain:botany');
        const existingRegions = new Set(themes.filter(t => t.startsWith('region:')).map(t => t.slice(7)));
        const plantRegions = (matchedPlant.regions || []).map(r => r.key);
        const newRegions = plantRegions.filter(rk => !existingRegions.has(rk));
        const existingCategory = themes.find(t => t.startsWith('category:'));
        const plantCategory = matchedPlant.category || '';
        const needsCategory = plantCategory && (!existingCategory || existingCategory !== 'category:' + plantCategory);

        if (hasDomainBotany && newRegions.length === 0 && !needsCategory) {
          alreadyTagged++;
          return a;
        }

        matched++;

        // Remove old 'botanique' theme if present, add domain:botany
        const updatedThemes = themes.filter(t => t !== 'botanique');
        if (!hasDomainBotany) updatedThemes.push('domain:botany');
        for (const rk of newRegions) updatedThemes.push('region:' + rk);
        // Add category tag (remove old one if different)
        if (needsCategory) {
          const idx = updatedThemes.findIndex(t => t.startsWith('category:'));
          if (idx >= 0) updatedThemes.splice(idx, 1);
          updatedThemes.push('category:' + plantCategory);
        }

        const updated = { ...a, themes: updatedThemes };

        // Apply suggested level if none set
        if (!a.levelClass && matchedPlant.suggestedLevel) {
          updated.levelClass = matchedPlant.suggestedLevel;
        }

        return updated;
      });

      const newData = { ...data, associations: nextAssocs };
      setData(newData);
      saveToBackend(newData);

      alert(
        `Classification botanique terminée.\n` +
        `${matched} association(s) mise(s) à jour.\n` +
        `${alreadyTagged} déjà classée(s).\n` +
        `${plants.length} plantes dans le référentiel.`
      );
    } catch (err) {
      console.error('autoClassifyBotany error:', err);
      alert('Erreur lors de la classification botanique: ' + (err.message || err));
    }
  };

  // Filtres pour faciliter la recherche dans les listes d'association
  const [texteFilter, setTexteFilter] = useState("");
  const [imageFilter, setImageFilter] = useState("");
  const [calculFilter, setCalculFilter] = useState("");
  const [chiffreFilter, setChiffreFilter] = useState("");

  // Prévisualisation: contrôles d'affichage (non persistés)
  const [previewCols, setPreviewCols] = useState(3);
  const [previewFont, setPreviewFont] = useState(24);
  const [previewGap, setPreviewGap] = useState(8);
  const [previewMode, setPreviewMode] = useState('associations'); // 'associations' | 'calculs' | 'chiffres'
  const [previewShuffleKey, setPreviewShuffleKey] = useState(0);
  const [editPositions, setEditPositions] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [printMode, setPrintMode] = useState(false);
  const previewContainerRef = useRef(null);
  const [dragging, setDragging] = useState(null); // { key, startX, startY, origX, origY }

  // Positions locales, persistées dans data.positions
  const [positionsLocal, setPositionsLocal] = useState({ associations: {}, calculs: {}, chiffres: {} });
  useEffect(() => {
    const pos = data?.positions || { associations: {}, calculs: {}, chiffres: {} };
    setPositionsLocal({
      associations: pos.associations || {},
      calculs: pos.calculs || {},
      chiffres: pos.chiffres || {},
    });
  }, [data]);

  // Refs pour chaque élément des listes afin de pouvoir revenir précisément à l'élément modifié
  const itemRefs = useRef({
    textes: new Map(),
    images: new Map(),
    calculs: new Map(),
    chiffres: new Map(),
  });
  // Dernier élément à remettre au centre de l'écran après mise à jour
  const lastFocus = useRef({ type: null, id: null });

  // Évite que le navigateur modifie automatiquement la position de scroll
  useEffect(() => {
    if (typeof window !== 'undefined' && window.history && 'scrollRestoration' in window.history) {
      const prev = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
      return () => { window.history.scrollRestoration = prev; };
    }
  }, []);

  // Action manuelle: scanner et nettoyer toutes les zones orphelines (référencent des images absentes)
  async function scanAndCleanOrphanZones() {
    try {
      const zones = await loadZonesWithFallback();
      if (!Array.isArray(zones) || zones.length === 0) {
        alert('Aucune zone à scanner.');
        return;
      }
      // Étape 0: Purge serveur de elements.json (supprime les entrées d'images non listées dans l'Admin)
      let purgeInfo = '';
      try {
        const resp = await fetch('http://localhost:4000/purge-elements', { method: 'POST' });
        const pj = await resp.json();
        if (pj && pj.success) {
          console.info('purge-elements:', pj);
          if (typeof pj.removed === 'number' && pj.removed > 0) {
            purgeInfo = `\n(Purge elements.json: ${pj.removed} supprimé(s))`;
          }
        }
      } catch (e) {
        console.warn('purge-elements indisponible (backend non lancé ?):', e.message || e);
      }
      const known = new Set((data?.images || []).map(i => normalizePath(i.url)));
      const orphans = zones
        .map((z, idx) => ({ z, idx }))
        .filter(({ z }) => z?.type === 'image' && z?.content && !known.has(normalizePath(z.content)));
      if (orphans.length === 0) {
        alert('Aucune zone orpheline détectée.');
        return;
      }
      const table = orphans.map(m => ({ index: m.idx, zoneId: m.z.id, type: m.z.type, image: m.z.content }));
      console.table(table);
      const listing = table.slice(0, 10).map(r => `- zone ${r.zoneId} → ${r.image}`).join('\n');
      const extra = table.length > 10 ? `\n(+${table.length - 10} de plus…)` : '';
      const doClean = window.confirm(
        `${orphans.length} zone(s) référencent des images absentes de l'Admin.${purgeInfo}\n\n` +
        `${listing}${extra}\n\n` +
        `Voulez-vous les nettoyer maintenant ?\n(Leurs champs type/content seront vidés côté navigateur)`
      );
      if (!doClean) return;
      const cleaned = zones.map((z) => {
        if (z?.type === 'image' && z?.content && !known.has(normalizePath(z.content))) {
          return { ...z, type: '', content: '' };
        }
        return z;
      });
      localStorage.setItem('zones', JSON.stringify(cleaned));
      const reload = window.confirm(`Nettoyage des zones orphelines effectué (${orphans.length}).\n\nRecharger la carte maintenant pour appliquer ?`);
      if (reload) {
        try { window.location.reload(); } catch {}
      }
    } catch (e) {
      console.warn('scanAndCleanOrphanZones error:', e);
      alert('Erreur lors du scan/cleanup des zones. Voir console.');
    }
  }

  useLayoutEffect(() => {
    const val = localStorage.getItem('admin-scroll');
    if (!val) return;
    const y = parseInt(val, 10);
    window.scrollTo(0, y);
    localStorage.removeItem('admin-scroll');
  }, [data]);

  // Après chaque mise à jour de data, si un élément modifié est enregistré, on le remet au centre
  useLayoutEffect(() => {
    const { type, id } = lastFocus.current || {};
    if (!type || !id) return;
    const el = itemRefs.current?.[type]?.get(id);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'instant' in window ? 'instant' : 'auto' });
    }
    // reset
    lastFocus.current = { type: null, id: null };
  }, [data]);

  // Fonction pour sauvegarder côté backend
  const saveToBackend = async (dataToSave) => {
    try {
      const res = await fetch('http://localhost:4000/save-associations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      });
      // Même si le backend renvoie une erreur, ne pas casser l'UI
      if (!res.ok) console.warn('save-associations HTTP', res.status);
      return true;
    } catch (e) {
      console.warn('save-associations failed (backend offline?)', e);
      return false;
    }
  };

  // Handlers de mise à jour Niveau/Catégories pour Images / Calculs / Chiffres
  const handleUpdateImageLevel = (imageId, level) => {
    setData(d => {
      const imgs = (d.images || []).map(i => i.id === imageId ? { ...i, levelClass: level || undefined } : i);
      const nd = { ...d, images: imgs };
      saveToBackend(nd);
      return nd;
    });
  };
  const handleUpdateImageThemes = (imageId, csv) => {
    const arr = String(csv || '').split(',').map(s => s.trim()).filter(Boolean);
    setData(d => {
      const imgs = (d.images || []).map(i => i.id === imageId ? { ...i, themes: arr.length ? arr : undefined } : i);
      const nd = { ...d, images: imgs };
      saveToBackend(nd);
      return nd;
    });
  };
  const handleUpdateCalculLevel = (calculId, level) => {
    setData(d => {
      const cs = (d.calculs || []).map(c => c.id === calculId ? { ...c, levelClass: level || undefined } : c);
      const nd = { ...d, calculs: cs };
      saveToBackend(nd);
      return nd;
    });
  };
  const handleUpdateCalculThemes = (calculId, csv) => {
    const arr = String(csv || '').split(',').map(s => s.trim()).filter(Boolean);
    setData(d => {
      const cs = (d.calculs || []).map(c => c.id === calculId ? { ...c, themes: arr.length ? arr : undefined } : c);
      const nd = { ...d, calculs: cs };
      saveToBackend(nd);
      return nd;
    });
  };
  const handleUpdateChiffreLevel = (numId, level) => {
    setData(d => {
      const ns = (d.chiffres || []).map(n => n.id === numId ? { ...n, levelClass: level || undefined } : n);
      const nd = { ...d, chiffres: ns };
      saveToBackend(nd);
      return nd;
    });
  };
  const handleUpdateChiffreThemes = (numId, csv) => {
    const arr = String(csv || '').split(',').map(s => s.trim()).filter(Boolean);
    setData(d => {
      const ns = (d.chiffres || []).map(n => n.id === numId ? { ...n, themes: arr.length ? arr : undefined } : n);
      const nd = { ...d, chiffres: ns };
      saveToBackend(nd);
      return nd;
    });
  };

  // Mettre à jour le niveau d'un texte (colonne Niveau)
  const handleUpdateTexteLevel = (texteId, level) => {
    setData(d => {
      const newTextes = (d.textes || []).map(t =>
        t.id === texteId ? { ...t, levelClass: level || undefined } : t
      );
      const newData = { ...d, textes: newTextes };
      saveToBackend(newData);
      return newData;
    });
  };

  // Mettre à jour les catégories d'un texte (colonne Catégorie) - input CSV → Array<string>
  const handleUpdateTexteThemes = (texteId, csv) => {
    const arr = String(csv || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    setData(d => {
      const newTextes = (d.textes || []).map(t =>
        t.id === texteId ? { ...t, themes: arr.length ? arr : undefined } : t
      );
      const newData = { ...d, textes: newTextes };
      saveToBackend(newData);
      return newData;
    });
  };

  // ===== OUTILS: Déduplications =====
  const dedupeImages = () => {
    setData(prev => {
      const seen = new Set();
      const out = [];
      for (const img of (prev.images || [])) {
        const key = normalizePath(img.url || '');
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(img);
      }
      if (out.length === (prev.images || []).length) {
        alert('Aucun doublon d\'images détecté.');
        return prev;
      }
      const next = { ...prev, images: out };
      saveToBackend(next);
      alert(`Images dédupliquées: ${(prev.images || []).length - out.length} doublon(s) supprimé(s).`);
      return next;
    });
  };

  const dedupeAssociations = () => {
    setData(prev => {
      const seen = new Set();
      const out = [];
      for (const a of (prev.associations || [])) {
        const key = a.texteId && a.imageId
          ? `TI:${a.texteId}->${a.imageId}`
          : (a.calculId && a.chiffreId ? `CC:${a.calculId}->${a.chiffreId}` : null);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(a);
      }
      if (out.length === (prev.associations || []).length) {
        alert('Aucun doublon d\'associations détecté.');
        return prev;
      }
      const next = { ...prev, associations: out };
      saveToBackend(next);
      alert(`Associations dédupliquées: ${(prev.associations || []).length - out.length} doublon(s) supprimé(s).`);
      return next;
    });
  };

  // Pré-remplissage: 30 multiplications + associations
  const seedMultiplications = () => {
    if (!window.confirm("Ajouter 30 multiplications avec leurs résultats et créer les associations ?")) return;
    const now = Date.now();
    const pairs = [];
    // 30 paires: a in 2..7 (6 valeurs), b in 2..6 (5 valeurs) => 30
    for (let a = 2; a <= 7; a++) {
      for (let b = 2; b <= 6; b++) {
        pairs.push([a, b]);
      }
    }
    setData(prev => {
      const newCalculs = [...prev.calculs];
      const newChiffres = [...prev.chiffres];
      const newAssoc = [...prev.associations];

      pairs.forEach(([a, b], idx) => {
        const calcId = `c${now}_${idx}`;
        const numId = `n${now}_${idx}`;
        const calcContent = `${a} × ${b}`;
        const numContent = String(a * b);
        newCalculs.push({ id: calcId, content: calcContent });
        newChiffres.push({ id: numId, content: numContent });
        newAssoc.push({ calculId: calcId, chiffreId: numId });
      });

      const newData = { ...prev, calculs: newCalculs, chiffres: newChiffres, associations: newAssoc };
      saveToBackend(newData);
      return newData;
    });
  };

  // Fonction pour valider la modification d'image
  // Fonction pour renommer physiquement un fichier image
  const renameImageOnServer = async (oldUrl, newUrl) => {
    if (oldUrl === newUrl) return;
    const response = await fetch('http://localhost:4000/rename-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: oldUrl, newPath: newUrl })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Erreur renommage');
  };

  // Utilitaire: slugify d'un nom de fichier (garde l'essence, supprime accents/symboles, espaces -> -)
  const slugify = (str) => {
    return String(str)
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  };

  // Normalise un chemin d'image saisi dans l'admin (préfixe images/, slugifie le nom, conserve l'extension)
  const normalizeImagePath = (inputPath) => {
    if (!inputPath) return inputPath;
    // Retire PUBLIC_URL éventuel
    let p = inputPath.replace(/^https?:\/\/[^/]+\//, '/');
    // Force dossier
    if (p.startsWith('http')) return p; // laisser URL absolue intacte
    if (p.startsWith('/')) p = p.slice(1);
    const hasImagesPrefix = p.startsWith('images/');
    const rest = hasImagesPrefix ? p.slice('images/'.length) : p;
    // Sépare nom & extension
    const lastDot = rest.lastIndexOf('.');
    const base = lastDot > 0 ? rest.slice(0, lastDot) : rest;
    const ext = lastDot > 0 ? rest.slice(lastDot) : '';
    const slug = slugify(base);
    const finalPath = `images/${slug}${ext || '.jpeg'}`;
    return finalPath;
  };

  // Fonction pour valider la modification d'image (avec renommage physique) + normalisation
  const handleEditImageSave = async (imageId) => {
    const oldUrl = data.images.find(img => img.id === imageId)?.url;
    const normalizedNew = normalizeImagePath(editImageValue);
    try {
      localStorage.setItem('admin-scroll', window.scrollY);
      lastFocus.current = { type: 'images', id: imageId };
      await renameImageOnServer(oldUrl, normalizedNew);
      setData(d => {
        const newImages = d.images.map(img =>
          img.id === imageId ? { ...img, url: normalizedNew } : img
        );
        const newData = { ...d, images: newImages };
        saveToBackend(newData);
        return newData;
      });
      setEditImageId(null);
    } catch (e) {
      alert('Erreur lors du renommage du fichier image : ' + e.message);
    }
  };

  // Vérifier toutes les images (JSON + dossier) et afficher un rapport lisible
  const handleVerifyAllImages = async () => {
    console.clear();
    try {
      // 1) Liste depuis le backend (dossier public/images)
      let folderList = [];
      try {
        const resp = await fetch('http://localhost:4000/list-images');
        const res = await resp.json();
        if (res.success && Array.isArray(res.images)) folderList = res.images;
      } catch (_) { /* backend peut être hors ligne: on continue */ }

      // 2) Liste depuis le JSON Admin
      const jsonList = (data?.images || []).map(i => i.url);

      // 3) Union et normalisation légère (préfixe images/ si manquant)
      const set = new Set();
      [...folderList, ...jsonList].forEach(p => {
        if (!p) return;
        let path = p.startsWith('http') ? p : (p.startsWith('images/') ? p : `images/${p}`);
        set.add(path);
      });
      const all = [...set];

      // 4) Test HTTP de chacune
      const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
      const urls = all.map(p => p.startsWith('http') ? p : `${base}/${p}`);
      const results = await Promise.allSettled(urls.map(u => fetch(u)));
      const rows = results.map((res, i) => ({
        path: all[i],
        url: urls[i],
        status: res.status === 'fulfilled' ? res.value.status : 'ERROR',
        ok: res.status === 'fulfilled' ? res.value.ok : false
      }));
      const fails = rows.filter(r => !r.ok);
      console.table(fails.length ? fails : rows);
      alert(fails.length ? `${fails.length} image(s) en erreur. Ouvre la console pour le détail.` : `Toutes les ${rows.length} image(s) répondent.`);
    } catch (err) {
      alert('Vérification interrompue: ' + (err.message || err));
    }
  };

  const savePositions = () => {
    setData(prev => {
      const newData = { ...prev, positions: positionsLocal };
      saveToBackend(newData);
      return newData;
    });
  };

  const saveUiSettings = () => {
    setData(prev => {
      const settings = {
        ...(prev.settings || {}),
        preview: { cols: previewCols, font: previewFont, gap: previewGap, mode: previewMode }
      };
      const newData = { ...prev, settings };
      saveToBackend(newData);
      return newData;
    });
  };


  // Fonction pour valider la modification de texte
  const handleEditTexteSave = (texteId) => {
    localStorage.setItem('admin-scroll', window.scrollY);
    lastFocus.current = { type: 'textes', id: texteId };
    setData(d => {
      const newTextes = d.textes.map(t =>
        t.id === texteId ? { ...t, content: editTexteValue } : t
      );
      const newData = { ...d, textes: newTextes };
      saveToBackend(newData);
      return newData;
    });
    setEditTexteId(null);
  };

  // Prévisualisation: préparer les jeux de données
  const assocCards = useMemo(() => {
    if (!data) return [];
    return (data.associations || []).map(a => {
      const calc = data.calculs.find(c => c.id === a.calculId)?.content || '';
      const num = data.chiffres.find(n => n.id === a.chiffreId)?.content || '';
      return { calc, num };
    }).filter(x => x.calc && x.num);
  }, [data]);
  const assocCardsPreview = useMemo(() => {
    const arr = assocCards.slice();
    if (previewShuffleKey) arr.sort(() => Math.random() - 0.5);
    return arr;
  }, [assocCards, previewShuffleKey]);
  const calculsPreview = useMemo(() => {
    const arr = (data?.calculs || []).slice();
    if (previewShuffleKey) arr.sort(() => Math.random() - 0.5);
    return arr;
  }, [data?.calculs, previewShuffleKey]);
  const chiffresPreview = useMemo(() => {
    const arr = (data?.chiffres || []).slice();
    if (previewShuffleKey) arr.sort(() => Math.random() - 0.5);
    return arr;
  }, [data?.chiffres, previewShuffleKey]);

  // Helpers Preview items par mode
  const previewItems = useMemo(() => {
    if (previewMode === 'associations') {
      return assocCardsPreview.map((p, idx) => ({ key: String(idx), primary: p.calc, secondary: p.num }));
    }
    if (previewMode === 'calculs') {
      return calculsPreview.map(c => ({ key: c.id, primary: c.content }));
    }
    return chiffresPreview.map(n => ({ key: n.id, primary: n.content }));
  }, [previewMode, assocCardsPreview, calculsPreview, chiffresPreview]);

  const getItemPos = (key) => {
    const map = positionsLocal[previewMode] || {};
    return map[key] || { x: 20, y: 20 };
  };
  const setItemPos = (key, x, y) => {
    setPositionsLocal(prev => ({
      ...prev,
      [previewMode]: { ...prev[previewMode], [key]: { x, y } }
    }));
  };

  // DnD gestion
  const onMouseDownCard = (e, key) => {
    if (!editPositions) return;
    const rect = previewContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { x, y } = getItemPos(key);
    setDragging({ key, startX: e.clientX, startY: e.clientY, origX: x, origY: y, rect });
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      // Snap 4px
      const nx = Math.max(0, Math.round((dragging.origX + dx) / 4) * 4);
      const ny = Math.max(0, Math.round((dragging.origY + dy) / 4) * 4);
      setItemPos(dragging.key, nx, ny);
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  

  // Fonction pour valider la modification de calcul
  const handleEditCalculSave = (calculId) => {
    localStorage.setItem('admin-scroll', window.scrollY);
    lastFocus.current = { type: 'calculs', id: calculId };
    setData(d => {
      const newCalculs = d.calculs.map(c =>
        c.id === calculId ? { ...c, content: editCalculValue } : c
      );
      const newData = { ...d, calculs: newCalculs };
      saveToBackend(newData);
      return newData;
    });
    setEditCalculId(null);
  };

  // Fonction pour valider la modification de chiffre
  const handleEditChiffreSave = (chiffreId) => {
    localStorage.setItem('admin-scroll', window.scrollY);
    lastFocus.current = { type: 'chiffres', id: chiffreId };
    setData(d => {
      const newChiffres = d.chiffres.map(n =>
        n.id === chiffreId ? { ...n, content: editChiffreValue } : n
      );
      const newData = { ...d, chiffres: newChiffres };
      saveToBackend(newData);
      return newData;
    });
    setEditChiffreId(null);
  };

  // Suppressions
  const deleteImageOnServer = async (relPath) => {
    const res = await fetch('http://localhost:4000/delete-image', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relPath })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Suppression image échouée');
  };

  const handleDeleteTexte = (texteId) => {
    if (!window.confirm('Supprimer ce texte ?')) return;
    localStorage.setItem('admin-scroll', window.scrollY);
    setData(d => {
      const newTextes = d.textes.filter(t => t.id !== texteId);
      const newData = { ...d, textes: newTextes };
      saveToBackend(newData);
      return newData;
    });
  };

  const handleDeleteCalcul = (calculId) => {
    if (!window.confirm('Supprimer ce calcul ?')) return;
    localStorage.setItem('admin-scroll', window.scrollY);
    setData(d => {
      const newCalculs = d.calculs.filter(c => c.id !== calculId);
      const newData = { ...d, calculs: newCalculs };
      saveToBackend(newData);
      return newData;
    });
  };

  const handleDeleteChiffre = (chiffreId) => {
    if (!window.confirm('Supprimer ce chiffre ?')) return;
    localStorage.setItem('admin-scroll', window.scrollY);
    setData(d => {
      const newChiffres = d.chiffres.filter(n => n.id !== chiffreId);
      const newData = { ...d, chiffres: newChiffres };
      saveToBackend(newData);
      return newData;
    });
  };

  const handleDeleteImage = async (imageId) => {
    const img = data.images.find(i => i.id === imageId);
    if (!img) return;
    if (!window.confirm('Supprimer cette image dans l\'admin ET physiquement ?')) return;
    try {
      localStorage.setItem('admin-scroll', window.scrollY);
      await deleteImageOnServer(img.url);
      setData(d => {
        const newImages = d.images.filter(i => i.id !== imageId);
        const newData = { ...d, images: newImages };
        saveToBackend(newData);
        return newData;
      });
      // Après suppression, vérifier les zones qui référencent encore ce chemin et proposer le nettoyage
      await checkZonesReferencingAndClean(img.url);
    } catch (e) {
      alert('Erreur lors de la suppression de l\'image: ' + (e.message || e));
    }
  };

  // --- Vérification et nettoyage des zones après suppression d'une image ---
  async function loadZonesWithFallback() {
    // 1) zones depuis localStorage si présent (prioritaire car éditables côté client)
    try {
      const ls = localStorage.getItem('zones');
      if (ls) {
        const parsed = JSON.parse(ls);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    // 2) sinon fetch data/zones2.json puis fallback data/zones.json
    const tryFetch = async (path) => {
      const r = await fetch(path);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    };
    const p2 = (process.env.PUBLIC_URL || '') + '/data/zones2.json';
    const p1 = (process.env.PUBLIC_URL || '') + '/data/zones.json';
    try {
      return await tryFetch(p2);
    } catch {
      try {
        return await tryFetch(p1);
      } catch {
        return [];
      }
    }
  }

  // Normalisation robuste des chemins/URLs d'images pour comparaison tolérante
  function normalizePath(s) {
    if (!s || typeof s !== 'string') return '';
    try {
      // retire PUBLIC_URL si présent
      const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
      if (base && s.startsWith(base)) s = s.slice(base.length);
    } catch {}
    // remplace backslashes, retire leading slash, retire prefix images/
    s = s.replace(/\\/g, '/');
    // décodage URL (tolérant)
    try { s = decodeURI(s); } catch {}
    // convertir %20 etc.
    s = s.replace(/%20/gi, ' ').replace(/%28/gi, '(').replace(/%29/gi, ')');
    s = s.replace(/^\//, '');
    s = s.replace(/^images\//i, '');
    return s;
  }

  function sameImagePath(a, b) {
    return normalizePath(a) === normalizePath(b);
  }

  async function checkZonesReferencingAndClean(deletedPath) {
    try {
      const zones = await loadZonesWithFallback();
      if (!Array.isArray(zones) || zones.length === 0) return;
      const matches = zones
        .map((z, idx) => ({ z, idx }))
        .filter(({ z }) => (z?.type === 'image') && sameImagePath(z?.content || '', deletedPath));
      if (matches.length === 0) {
        console.info('Aucune zone ne référence exactement le chemin supprimé. Tentative de détection des zones orphelines…');
        // Fallback: détecter toutes les zones dont l'image n'existe plus dans data.images
        const known = new Set((data?.images || []).map(i => normalizePath(i.url)));
        const orphans = zones
          .map((z, idx) => ({ z, idx }))
          .filter(({ z }) => z?.type === 'image' && z?.content && !known.has(normalizePath(z.content)));
        if (orphans.length === 0) return;
        console.table(orphans.map(m => ({ index: m.idx, id: m.z.id, type: m.z.type, content: m.z.content })));
        const doCleanOrphans = window.confirm(`${orphans.length} zone(s) référencent des images absentes de l'Admin.\nVoulez-vous nettoyer ces zones (vider type/content) ?`);
        if (!doCleanOrphans) return;
        const cleanedO = zones.map((z) => {
          if (z?.type === 'image' && z?.content && !known.has(normalizePath(z.content))) {
            return { ...z, type: '', content: '' };
          }
          return z;
        });
        localStorage.setItem('zones', JSON.stringify(cleanedO));
        alert(`Nettoyage des zones orphelines effectué (${orphans.length}). Rechargez la carte.`);
        return;
      }
      console.table(matches.map(m => ({ index: m.idx, id: m.z.id, type: m.z.type, content: m.z.content })));
      const doClean = window.confirm(`${matches.length} zone(s) référencent encore « ${deletedPath} ».\nVoulez-vous nettoyer ces zones maintenant ?\n(Leurs champs type/content seront vidés côté navigateur)`);
      if (!doClean) return;
      const cleaned = zones.map((z) => {
        if ((z?.type === 'image') && sameImagePath(z?.content || '', deletedPath)) {
          return { ...z, type: '', content: '' };
        }
        return z;
      });
      localStorage.setItem('zones', JSON.stringify(cleaned));
      alert(`Nettoyage effectué pour ${matches.length} zone(s). Pensez à recharger la carte.`);
    } catch (e) {
      console.warn('checkZonesReferencingAndClean error:', e);
    }
  }


  // Ajout d’éléments
  // Sets d'IDs déjà associés pour filtrer les listes d'association
  const usedTexteIds = useMemo(() => new Set((data?.associations || []).filter(a => a.texteId && a.imageId).map(a => a.texteId)), [data?.associations]);
  const usedImageIds = useMemo(() => new Set((data?.associations || []).filter(a => a.texteId && a.imageId).map(a => a.imageId)), [data?.associations]);
  const usedCalculIds = useMemo(() => new Set((data?.associations || []).filter(a => a.calculId && a.chiffreId).map(a => a.calculId)), [data?.associations]);
  const usedChiffreIds = useMemo(() => new Set((data?.associations || []).filter(a => a.calculId && a.chiffreId).map(a => a.chiffreId)), [data?.associations]);

  // Listes filtrées pour les selects d'association
  const textesDispos = useMemo(() => (data?.textes || []).filter(t => !usedTexteIds.has(t.id)), [data?.textes, usedTexteIds]);
  const imagesDispos = useMemo(() => (data?.images || []).filter(i => !usedImageIds.has(i.id)), [data?.images, usedImageIds]);
  const calculsDispos = useMemo(() => (data?.calculs || []).filter(c => !usedCalculIds.has(c.id)), [data?.calculs, usedCalculIds]);
  const chiffresDispos = useMemo(() => (data?.chiffres || []).filter(n => !usedChiffreIds.has(n.id)), [data?.chiffres, usedChiffreIds]);

  // Versions filtrées + triées (alphabétique) selon les champs de recherche
  const textesFiltered = useMemo(() =>
    textesDispos
      .filter(t => t.content.toLowerCase().includes(texteFilter.toLowerCase()))
      .slice()
      .sort((a,b) => a.content.localeCompare(b.content)),
    [textesDispos, texteFilter]
  );
  const imagesFiltered = useMemo(() =>
    imagesDispos
      .filter(i => i.url.toLowerCase().includes(imageFilter.toLowerCase()))
      .slice()
      .sort((a,b) => a.url.localeCompare(b.url)),
    [imagesDispos, imageFilter]
  );
  const calculsFiltered = useMemo(() =>
    calculsDispos
      .filter(c => c.content.toLowerCase().includes(calculFilter.toLowerCase()))
      .slice()
      .sort((a,b) => a.content.localeCompare(b.content)),
    [calculsDispos, calculFilter]
  );
  const chiffresFiltered = useMemo(() =>
    chiffresDispos
      .filter(n => n.content.toLowerCase().includes(chiffreFilter.toLowerCase()))
      .slice()
      .sort((a,b) => a.content.localeCompare(b.content)),
    [chiffresDispos, chiffreFilter]
  );

  const addTexte = () => {
    setData(d => ({
      ...d,
      textes: [...d.textes, { id: "t" + Date.now(), content: newTexte }]
    }));
    setNewTexte("");
  };
  const addImage = () => {
    setData(d => ({
      ...d,
      images: [...d.images, { id: "i" + Date.now(), url: newImage }]
    }));
    setNewImage("");
  };
  const addCalcul = () => {
    setData(d => ({
      ...d,
      calculs: [...d.calculs, { id: "c" + Date.now(), content: newCalcul }]
    }));
    setNewCalcul("");
  };
  const addChiffre = () => {
    setData(d => ({
      ...d,
      chiffres: [...d.chiffres, { id: "n" + Date.now(), content: newChiffre }]
    }));
    setNewChiffre("");
  };

// Association
  const associerTexteImage = () => {
    setData(d => ({
      ...d,
      associations: [...d.associations, { texteId: selectedTexte, imageId: selectedImage }]
    }));
    setSelectedTexte("");
    setSelectedImage("");
  };
  const associerCalculChiffre = () => {
    setData(d => ({
      ...d,
      associations: [...d.associations, { calculId: selectedCalcul, chiffreId: selectedChiffre }]
    }));
    setSelectedCalcul("");
    setSelectedChiffre("");
  };

  // Upload JSON
  const handleJsonUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        importJson(JSON.parse(evt.target.result));
      } catch {
        alert("Fichier invalide !");
      }
    };
    reader.readAsText(file);
  };

  const TAB_STYLE = (isActive) => ({
    padding: '12px 24px',
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    borderBottom: isActive ? '3px solid #0D6A7A' : '3px solid transparent',
    background: 'none',
    color: isActive ? '#0D6A7A' : '#94a3b8',
    cursor: 'pointer',
    transition: 'all 0.2s',
    letterSpacing: 0.3,
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0D6A7A 0%, #148A9C 100%)', padding: '20px 24px', color: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Plateforme de Contenu Pédagogique</h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.85 }}>Enrichissez le jeu avec du contenu éducatif</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="/admin/dashboard" style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.2)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>📊 Dashboard</a>
              <a href="/admin/roles" style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.2)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>👥 Rôles</a>
              <a href="/admin/invite" style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.2)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>✉️ Invitations</a>
              <a href="/admin/monitoring" style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.2)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>📡 Monitoring</a>
            </div>
          </div>
        </div>
      </div>

      {!data ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#64748b', fontSize: 16 }}>Chargement…</div>
      ) : (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 40px' }}>
          {/* 2 Main Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 24, background: '#fff', borderRadius: '12px 12px 0 0', padding: '0 8px', marginTop: -1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <button style={TAB_STYLE(activeTab === 'upload')} onClick={() => setActiveTab('upload')}>📤 Importer</button>
            <button style={TAB_STYLE(activeTab === 'library')} onClick={() => setActiveTab('library')}>📚 Bibliothèque</button>
          </div>

          {/* TAB: Importer */}
          {activeTab === 'upload' && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0D6A7A', marginTop: 0, marginBottom: 4 }}>📤 Importer des ressources</h2>
              <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>Déposez un fichier Excel ou Word pour extraire automatiquement des paires de contenu pédagogique.</p>
              <RectoratUpload data={data} setData={setData} saveToBackend={saveToBackend} />
            </div>
          )}

          {/* TAB: Bibliothèque */}
          {activeTab === 'library' && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <RectoratLibrary data={data} setData={setData} saveToBackend={saveToBackend} />
            </div>
          )}

          {/* ─── Admin avancé (repliable) ─── */}
          <div style={{ marginTop: 40 }}>
            <details>
              <summary style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontSize: 13, fontWeight: 600, userSelect: 'none' }}>
                🔧 Admin avancé
              </summary>

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* JSON & Dedup & Auto-tag */}
                <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginTop: 0, marginBottom: 12 }}>📦 Maintenance données</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                    <button onClick={downloadJson} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #0D6A7A', background: '#f0fdfa', color: '#0D6A7A', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>📥 Export JSON</button>
                    <label style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                      📤 Import JSON
                      <input type="file" accept="application/json" onChange={handleJsonUpload} style={{ display: 'none' }} />
                    </label>
                    <button type="button" onClick={dedupeImages} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>🧹 Dédup images</button>
                    <button type="button" onClick={dedupeAssociations} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>🧹 Dédup assoc.</button>
                    <button type="button" onClick={autoTagElements} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#065f46', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>🏷️ Auto-tag</button>
                    <button type="button" onClick={autoClassifyBotany} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #86efac', background: '#f0fdf4', color: '#166534', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>🌿 Classif. botanique</button>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    Textes: {(data.textes||[]).length} · Images: {(data.images||[]).length} · Calculs: {(data.calculs||[]).length} · Chiffres: {(data.chiffres||[]).length} · Associations: {(data.associations||[]).length}
                  </div>
                </div>

                {/* Catégorisation avancée (AdminAssocMeta) */}
                <details style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#475569' }}>🏷️ Catégorisation avancée des associations</summary>
                  <div style={{ marginTop: 12 }}>
                    <AdminAssocMeta data={data} setData={setData} save={saveToBackend} />
                  </div>
                </details>

                {/* Images tools */}
                <details style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#475569' }}>🖼️ Outils images</summary>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                    <button type="button" onClick={handleVerifyAllImages} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, cursor: 'pointer' }}>Vérifier images</button>
                    <button type="button" onClick={scanAndCleanOrphanZones} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, cursor: 'pointer' }}>Scanner orphelines</button>
                    <button type="button" style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, cursor: 'pointer' }} onClick={async () => {
                      try {
                        const response = await fetch('http://localhost:4000/list-images');
                        const result = await response.json();
                        if (!result.success) { alert(result.message || 'Erreur'); return; }
                        const existing = new Set(data.images.map(img => img.url));
                        const toAdd = result.images.filter(url => !existing.has(url));
                        if (toAdd.length === 0) { alert('Aucune nouvelle image.'); return; }
                        setData(d => { const nd = { ...d, images: [...d.images, ...toAdd.map(url => ({ id: 'i' + Date.now() + Math.random().toString(36).slice(2, 6), url }))] }; saveToBackend(nd); return nd; });
                        alert(toAdd.length + ' images ajoutées !');
                      } catch (err) { alert('Erreur: ' + (err.message || err)); }
                    }}>Sync dossier</button>
                    <div style={{ marginTop: 8, width: '100%' }}>
                      <input type="file" accept="image/*" multiple id="multi-upload" style={{ display: 'none' }} onChange={async e => {
                        const files = Array.from(e.target.files); if (files.length === 0) return;
                        const formData = new FormData(); files.forEach(f => formData.append('images', f));
                        try {
                          const response = await fetch('http://localhost:4000/upload-images', { method: 'POST', body: formData });
                          const result = await response.json();
                          if (!result.success) { alert(result.message || 'Erreur'); return; }
                          setData(d => { const nd = { ...d, images: [...d.images, ...result.files.map(f => ({ id: 'i' + Date.now() + Math.random().toString(36).slice(2, 6), url: f.path }))] }; saveToBackend(nd); return nd; });
                          e.target.value = '';
                        } catch (err) { alert('Erreur: ' + (err.message || err)); }
                      }} />
                      <button type="button" onClick={() => document.getElementById('multi-upload').click()} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, cursor: 'pointer' }}>📷 Upload images</button>
                    </div>
                  </div>
                </details>

                {/* Tables brutes */}
                <details style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#475569' }}>📋 Tables brutes (éléments individuels)</summary>
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Textes */}
                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>📝 Textes ({(data.textes||[]).length})</summary>
                      <div style={{ overflowX: 'auto', marginTop: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569' }}>Texte</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569', width: 90 }}>Niveau</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569' }}>Catégories</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569', width: 80 }}>Actions</th>
                          </tr></thead>
                          <tbody>
                            {data.textes.map(t => (
                              <tr key={t.id} ref={el => itemRefs.current.textes.set(t.id, el)}>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px', maxWidth: 280 }}>
                                  {editTexteId === t.id ? <input value={editTexteValue} onChange={e => setEditTexteValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleEditTexteSave(t.id); if (e.key === 'Escape') setEditTexteId(null); }} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12 }} autoFocus /> : <span style={{ fontSize: 12 }}>{t.content}</span>}
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  <select value={t.levelClass || ''} onChange={e => handleUpdateTexteLevel(t.id, e.target.value)} style={{ width: '100%', padding: '2px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11 }}><option value="">—</option>{CLASS_LEVELS.map(lv => <option key={lv} value={lv}>{lv}</option>)}</select>
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  <input value={(t.themes || []).join(', ')} onChange={e => handleUpdateTexteThemes(t.id, e.target.value)} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11 }} />
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                  {editTexteId === t.id ? (<><button type="button" onClick={() => handleEditTexteSave(t.id)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 11, cursor: 'pointer' }}>✓</button> <button type="button" onClick={() => setEditTexteId(null)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11, cursor: 'pointer' }}>✕</button></>) : (<><button type="button" onClick={() => { setEditTexteId(t.id); setEditTexteValue(t.content); }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11, cursor: 'pointer' }}>✏️</button> <button type="button" onClick={() => handleDeleteTexte(t.id)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #fecaca', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>🗑️</button></>)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                        <input value={newTexte} onChange={e => setNewTexte(e.target.value)} placeholder="Nouveau texte" style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                        <button type="button" onClick={addTexte} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0D6A7A', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>+</button>
                      </div>
                    </details>

                    {/* Images */}
                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>🖼️ Images ({(data.images||[]).length})</summary>
                      <div style={{ overflowX: 'auto', marginTop: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569', width: 50 }}>Img</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569' }}>Chemin</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569', width: 90 }}>Niveau</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569' }}>Catégories</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569', width: 80 }}>Actions</th>
                          </tr></thead>
                          <tbody>
                            {data.images.map(i => (
                              <tr key={i.id} ref={el => itemRefs.current.images.set(i.id, el)}>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '3px 6px' }}><img src={process.env.PUBLIC_URL + '/' + i.url} alt={i.url} style={{ width: 36, height: 36, borderRadius: 4, border: '1px solid #e2e8f0', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} /></td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  {editImageId === i.id ? <input value={editImageValue} onChange={e => setEditImageValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditImageSave(i.id); } if (e.key === 'Escape') { e.preventDefault(); setEditImageId(null); } }} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11 }} autoFocus /> : <span style={{ fontSize: 11 }}>{i.url}</span>}
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  <select value={i.levelClass || ''} onChange={e => handleUpdateImageLevel(i.id, e.target.value)} style={{ width: '100%', padding: '2px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11 }}><option value="">—</option>{CLASS_LEVELS.map(lv => <option key={lv} value={lv}>{lv}</option>)}</select>
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  <input value={(i.themes || []).join(', ')} onChange={e => handleUpdateImageThemes(i.id, e.target.value)} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11 }} />
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                  {editImageId === i.id ? (<><button type="button" onClick={() => handleEditImageSave(i.id)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 11, cursor: 'pointer' }}>✓</button> <button type="button" onClick={() => setEditImageId(null)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11, cursor: 'pointer' }}>✕</button></>) : (<><button type="button" onClick={() => { setEditImageId(i.id); setEditImageValue(i.url); }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11, cursor: 'pointer' }}>✏️</button> <button type="button" onClick={() => handleDeleteImage(i.id)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #fecaca', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>🗑️</button></>)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                        <input value={newImage} onChange={e => setNewImage(e.target.value)} placeholder="URL image" style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                        <button type="button" onClick={addImage} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0D6A7A', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>+</button>
                      </div>
                    </details>

                    {/* Calculs */}
                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>🔢 Calculs ({(data.calculs||[]).length})</summary>
                      <div style={{ overflowX: 'auto', marginTop: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569' }}>Calcul</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569', width: 90 }}>Niveau</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569' }}>Catégories</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569', width: 80 }}>Actions</th>
                          </tr></thead>
                          <tbody>
                            {data.calculs.map(c => (
                              <tr key={c.id} ref={el => itemRefs.current.calculs.set(c.id, el)}>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  {editCalculId === c.id ? <input value={editCalculValue} onChange={e => setEditCalculValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditCalculSave(c.id); } if (e.key === 'Escape') { e.preventDefault(); setEditCalculId(null); } }} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12 }} autoFocus /> : <span style={{ fontSize: 12 }}>{c.content}</span>}
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  <select value={c.levelClass || ''} onChange={e => handleUpdateCalculLevel(c.id, e.target.value)} style={{ width: '100%', padding: '2px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11 }}><option value="">—</option>{CLASS_LEVELS.map(lv => <option key={lv} value={lv}>{lv}</option>)}</select>
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  <input value={(c.themes || []).join(', ')} onChange={e => handleUpdateCalculThemes(c.id, e.target.value)} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11 }} />
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                  {editCalculId === c.id ? (<><button type="button" onClick={() => handleEditCalculSave(c.id)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 11, cursor: 'pointer' }}>✓</button> <button type="button" onClick={() => setEditCalculId(null)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11, cursor: 'pointer' }}>✕</button></>) : (<><button type="button" onClick={() => { setEditCalculId(c.id); setEditCalculValue(c.content); }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11, cursor: 'pointer' }}>✏️</button> <button type="button" onClick={() => handleDeleteCalcul(c.id)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #fecaca', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>🗑️</button></>)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                        <input value={newCalcul} onChange={e => setNewCalcul(e.target.value)} placeholder="Nouveau calcul" style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                        <button type="button" onClick={addCalcul} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0D6A7A', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>+</button>
                      </div>
                      <button type="button" onClick={seedMultiplications} style={{ marginTop: 6, padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, cursor: 'pointer' }}>Pré-remplir 30 multiplications</button>
                    </details>

                    {/* Chiffres */}
                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>🔢 Chiffres ({(data.chiffres||[]).length})</summary>
                      <div style={{ overflowX: 'auto', marginTop: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569' }}>Chiffre</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569', width: 90 }}>Niveau</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569' }}>Catégories</th>
                            <th style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', padding: '6px', fontSize: 11, color: '#475569', width: 80 }}>Actions</th>
                          </tr></thead>
                          <tbody>
                            {data.chiffres.map(n => (
                              <tr key={n.id} ref={el => itemRefs.current.chiffres.set(n.id, el)}>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  {editChiffreId === n.id ? <input value={editChiffreValue} onChange={e => setEditChiffreValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditChiffreSave(n.id); } if (e.key === 'Escape') { e.preventDefault(); setEditChiffreId(null); } }} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12 }} autoFocus /> : <span style={{ fontSize: 12 }}>{n.content}</span>}
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  <select value={n.levelClass || ''} onChange={e => handleUpdateChiffreLevel(n.id, e.target.value)} style={{ width: '100%', padding: '2px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11 }}><option value="">—</option>{CLASS_LEVELS.map(lv => <option key={lv} value={lv}>{lv}</option>)}</select>
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                  <input value={(n.themes || []).join(', ')} onChange={e => handleUpdateChiffreThemes(n.id, e.target.value)} style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11 }} />
                                </td>
                                <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                  {editChiffreId === n.id ? (<><button type="button" onClick={() => handleEditChiffreSave(n.id)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 11, cursor: 'pointer' }}>✓</button> <button type="button" onClick={() => setEditChiffreId(null)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11, cursor: 'pointer' }}>✕</button></>) : (<><button type="button" onClick={() => { setEditChiffreId(n.id); setEditChiffreValue(n.content); }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 11, cursor: 'pointer' }}>✏️</button> <button type="button" onClick={() => handleDeleteChiffre(n.id)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #fecaca', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>🗑️</button></>)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                        <input value={newChiffre} onChange={e => setNewChiffre(e.target.value)} placeholder="Nouveau chiffre" style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                        <button type="button" onClick={addChiffre} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0D6A7A', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>+</button>
                      </div>
                    </details>

                    {/* Associations manuelles */}
                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>🔗 Associations manuelles</summary>
                      <div style={{ marginTop: 8 }}>
                        <h4 style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Texte ↔ Image</h4>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <input placeholder="Rechercher texte" value={texteFilter} onChange={e => setTexteFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                          <input placeholder="Rechercher image" value={imageFilter} onChange={e => setImageFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <select value={selectedTexte} onChange={e => setSelectedTexte(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}><option value="">-- Texte --</option>{textesFiltered.map(t => <option value={t.id} key={t.id}>{t.content}</option>)}</select>
                          <select value={selectedImage} onChange={e => setSelectedImage(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}><option value="">-- Image --</option>{imagesFiltered.map(i => <option value={i.id} key={i.id}>{i.url}</option>)}</select>
                          <button onClick={associerTexteImage} disabled={!selectedTexte || !selectedImage} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: (!selectedTexte || !selectedImage) ? '#94a3b8' : '#0D6A7A', color: '#fff', fontWeight: 600, fontSize: 12, cursor: (!selectedTexte || !selectedImage) ? 'not-allowed' : 'pointer' }}>Associer</button>
                        </div>
                        <hr style={{ margin: '12px 0', borderColor: '#f1f5f9' }} />
                        <h4 style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Calcul ↔ Chiffre</h4>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <input placeholder="Rechercher calcul" value={calculFilter} onChange={e => setCalculFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                          <input placeholder="Rechercher chiffre" value={chiffreFilter} onChange={e => setChiffreFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <select value={selectedCalcul} onChange={e => setSelectedCalcul(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}><option value="">-- Calcul --</option>{calculsFiltered.map(c => <option value={c.id} key={c.id}>{c.content}</option>)}</select>
                          <select value={selectedChiffre} onChange={e => setSelectedChiffre(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}><option value="">-- Chiffre --</option>{chiffresFiltered.map(n => <option value={n.id} key={n.id}>{n.content}</option>)}</select>
                          <button onClick={associerCalculChiffre} disabled={!selectedCalcul || !selectedChiffre} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: (!selectedCalcul || !selectedChiffre) ? '#94a3b8' : '#0D6A7A', color: '#fff', fontWeight: 600, fontSize: 12, cursor: (!selectedCalcul || !selectedChiffre) ? 'not-allowed' : 'pointer' }}>Associer</button>
                        </div>
                      </div>
                    </details>
                  </div>
                </details>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
