import React, { useContext, useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import AdminAssocMeta from "./AdminAssocMeta";
import { DataContext } from "../context/DataContext";

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

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "auto" }}>
      {!data ? (
        <div>Chargement…</div>
      ) : (
        <>
      <h2>Admin - Gestion des éléments et associations</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <button onClick={downloadJson}>Télécharger le JSON</button>
        <button type="button" onClick={dedupeImages} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}>Supprimer doublons d'images</button>
        <button type="button" onClick={dedupeAssociations} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}>Supprimer doublons d'associations</button>
      </div>
      <input type="file" accept="application/json" onChange={handleJsonUpload} style={{ marginLeft: 10 }} />
      <hr />

      {/* Nouvelle section: Catégoriser les associations (classe & thèmes) */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
        <button type="button" onClick={autoTagElements} title="Déduire niveaux & catégories des éléments à partir des associations et heuristiques">
          Auto-tag niveaux & catégories
        </button>
        <small style={{ color:'#6b7280' }}>Déduit les thèmes depuis les associations et estime le niveau pour les calculs si absent.</small>
      </div>
      <AdminAssocMeta data={data} setData={setData} save={saveToBackend} />
      <hr />

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Textes</summary>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Texte</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Niveau</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Catégories</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.textes.map(t => (
                <tr key={t.id} ref={el => itemRefs.current.textes.set(t.id, el)}>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px', maxWidth: 320 }}>
                    {editTexteId === t.id ? (
                      <>
                        <input
                          value={editTexteValue}
                          onChange={e => setEditTexteValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleEditTexteSave(t.id);
                            if (e.key === 'Escape') setEditTexteId(null);
                          }}
                          style={{ width: '100%' }}
                          autoFocus
                        />
                      </>
                    ) : (
                      <span>{t.content}</span>
                    )}
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px', width: 160 }}>
                    <select
                      value={t.levelClass || ''}
                      onChange={e => handleUpdateTexteLevel(t.id, e.target.value)}
                      style={{ width: '100%', padding: '6px 8px' }}
                    >
                      <option value="">—</option>
                      {CLASS_LEVELS.map(lv => (
                        <option key={lv} value={lv}>{lv}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px' }}>
                    <input
                      value={(t.themes || []).join(', ')}
                      placeholder="Ex: botanique, saveurs"
                      onChange={e => handleUpdateTexteThemes(t.id, e.target.value)}
                      style={{ width: '100%', padding: '6px 8px' }}
                    />
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {editTexteId === t.id ? (
                      <>
                        <button type="button" onClick={() => handleEditTexteSave(t.id)}>Valider</button>
                        <button type="button" onClick={() => setEditTexteId(null)} style={{ marginLeft: 6 }}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setEditTexteId(t.id); setEditTexteValue(t.content); }}>Modifier</button>
                        <button type="button" style={{ marginLeft: 8, color: '#b00020' }} onClick={() => handleDeleteTexte(t.id)}>Supprimer</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <input value={newTexte} onChange={e => setNewTexte(e.target.value)} placeholder="Nouveau texte" style={{ flex: 1 }} />
          <button type="button" onClick={addTexte}>Ajouter</button>
        </div>
      </details>

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Images</summary>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={handleVerifyAllImages}>Vérifier toutes les images</button>
          <small style={{ color: '#666' }}>Affiche un rapport dans la console + alerte de synthèse</small>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={scanAndCleanOrphanZones}>Scanner / nettoyer zones orphelines</button>
          <small style={{ color: '#666' }}>Détecte et nettoie les zones qui référencent des images supprimées ou manquantes</small>
        </div>
        <button type="button" style={{marginBottom:12}} onClick={async () => {
          try {
            const response = await fetch('http://localhost:4000/list-images');
            const result = await response.json();
            if (!result.success) {
              alert(result.message || 'Erreur lors du listage des images.');
              return;
            }
            // Images déjà dans le JSON
            const existing = new Set(data.images.map(img => img.url));
            // Images du dossier absentes du JSON
            const toAdd = result.images.filter(url => !existing.has(url));
            if (toAdd.length === 0) {
              alert('Aucune nouvelle image à ajouter.');
              return;
            }
            setData(d => {
              const newImages = [
                ...d.images,
                ...toAdd.map(url => ({ id: 'i' + Date.now() + Math.random().toString(36).slice(2, 6), url }))
              ];
              const newData = { ...d, images: newImages };
              saveToBackend(newData);
              return newData;
            });
            alert(toAdd.length + ' images ajoutées à la liste !');
          } catch (err) {
            alert('Erreur lors de la synchronisation : ' + (err.message || err));
          }
      }}>
          Synchroniser images dossier
        </button>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Aperçu</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Chemin</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Niveau</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Catégories</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.images.map(i => (
                <tr key={i.id} ref={el => itemRefs.current.images.set(i.id, el)}>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px' }}>
                    <img src={process.env.PUBLIC_URL + '/' + i.url} alt={i.url} style={{ width: 60, height: 'auto', borderRadius: 4, border: '1px solid #ccc', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px' }}>
                    {editImageId === i.id ? (
                      <>
                        <input
                          value={editImageValue}
                          onChange={e => setEditImageValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleEditImageSave(i.id); }
                            if (e.key === 'Escape') { e.preventDefault(); setEditImageId(null); }
                          }}
                          style={{ width: '100%' }}
                          autoFocus
                        />
                      </>
                    ) : (
                      <span>{i.url}</span>
                    )}
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px', width: 160 }}>
                    <select value={i.levelClass || ''} onChange={e => handleUpdateImageLevel(i.id, e.target.value)} style={{ width: '100%', padding: '6px 8px' }}>
                      <option value="">—</option>
                      {CLASS_LEVELS.map(lv => <option key={lv} value={lv}>{lv}</option>)}
                    </select>
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px' }}>
                    <input value={(i.themes || []).join(', ')} placeholder="Ex: botanique, fruits" onChange={e => handleUpdateImageThemes(i.id, e.target.value)} style={{ width: '100%', padding: '6px 8px' }} />
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {editImageId === i.id ? (
                      <>
                        <button type="button" onClick={() => handleEditImageSave(i.id)}>Valider</button>
                        <button type="button" onClick={() => setEditImageId(null)} style={{ marginLeft: 6 }}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setEditImageId(i.id); setEditImageValue(i.url); }}>Modifier</button>
                        <button type="button" style={{ marginLeft: 8, color: '#b00020' }} onClick={() => handleDeleteImage(i.id)}>Supprimer</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <input value={newImage} onChange={e => setNewImage(e.target.value)} placeholder="URL image" style={{ flex: 1 }} />
          <button type="button" onClick={addImage}>Ajouter</button>
        </div>


        <div style={{ marginTop: 10 }}>
          <input type="file" accept="image/*" multiple id="multi-upload" style={{ display: 'none' }} onChange={async e => {
     const files = Array.from(e.target.files);
     if (files.length === 0) return;
     const formData = new FormData();
     files.forEach(f => formData.append('images', f));
     try {
       const response = await fetch('http://localhost:4000/upload-images', {
         method: 'POST',
         body: formData
       });
       const result = await response.json();
       if (!result.success) {
         alert(result.message || 'Erreur lors de l\'upload.');
         return;
       }
       // Ajoute chaque image uploadée au JSON
       setData(d => {
         const newImages = [
           ...d.images,
           ...result.files.map(f => ({ id: 'i' + Date.now() + Math.random().toString(36).slice(2, 6), url: f.path }))
         ];
         const newData = { ...d, images: newImages };
         saveToBackend(newData);
         return newData;
       });
       e.target.value = '';
     } catch (err) {
       alert('Erreur lors de l\'upload : ' + (err.message || err));
     }
   }} />
          <button type="button" onClick={() => document.getElementById('multi-upload').click()} style={{ marginTop: 8 }}>
            Ajouter plusieurs images
          </button>
        </div>
      </details>

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Calculs</summary>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Calcul</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Niveau</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Catégories</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.calculs.map(c => (
                <tr key={c.id} ref={el => itemRefs.current.calculs.set(c.id, el)}>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px' }}>
                    {editCalculId === c.id ? (
                      <input value={editCalculValue} onChange={e => setEditCalculValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditCalculSave(c.id); } if (e.key === 'Escape') { e.preventDefault(); setEditCalculId(null); } }} style={{ width: '100%' }} autoFocus />
                    ) : (
                      <span>{c.content}</span>
                    )}
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px', width: 160 }}>
                    <select value={c.levelClass || ''} onChange={e => handleUpdateCalculLevel(c.id, e.target.value)} style={{ width: '100%', padding: '6px 8px' }}>
                      <option value="">—</option>
                      {CLASS_LEVELS.map(lv => <option key={lv} value={lv}>{lv}</option>)}
                    </select>
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px' }}>
                    <input value={(c.themes || []).join(', ')} placeholder="Ex: addition, tables" onChange={e => handleUpdateCalculThemes(c.id, e.target.value)} style={{ width: '100%', padding: '6px 8px' }} />
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {editCalculId === c.id ? (
                      <>
                        <button type="button" onClick={() => handleEditCalculSave(c.id)}>Valider</button>
                        <button type="button" onClick={() => setEditCalculId(null)} style={{ marginLeft: 6 }}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setEditCalculId(c.id); setEditCalculValue(c.content); }}>Modifier</button>
                        <button type="button" style={{ marginLeft: 8, color: '#b00020' }} onClick={() => handleDeleteCalcul(c.id)}>Supprimer</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <input value={newCalcul} onChange={e => setNewCalcul(e.target.value)} placeholder="Nouveau calcul" style={{ flex: 1 }} />
          <button type="button" onClick={addCalcul}>Ajouter</button>
        </div>
      </details>

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Chiffres</summary>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Chiffre</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Niveau</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Catégories</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.chiffres.map(n => (
                <tr key={n.id} ref={el => itemRefs.current.chiffres.set(n.id, el)}>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px' }}>
                    {editChiffreId === n.id ? (
                      <input value={editChiffreValue} onChange={e => setEditChiffreValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditChiffreSave(n.id); } if (e.key === 'Escape') { e.preventDefault(); setEditChiffreId(null); } }} style={{ width: '100%' }} autoFocus />
                    ) : (
                      <span>{n.content}</span>
                    )}
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px', width: 160 }}>
                    <select value={n.levelClass || ''} onChange={e => handleUpdateChiffreLevel(n.id, e.target.value)} style={{ width: '100%', padding: '6px 8px' }}>
                      <option value="">—</option>
                      {CLASS_LEVELS.map(lv => <option key={lv} value={lv}>{lv}</option>)}
                    </select>
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px' }}>
                    <input value={(n.themes || []).join(', ')} placeholder="Ex: résultats pairs" onChange={e => handleUpdateChiffreThemes(n.id, e.target.value)} style={{ width: '100%', padding: '6px 8px' }} />
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {editChiffreId === n.id ? (
                      <>
                        <button type="button" onClick={() => handleEditChiffreSave(n.id)}>Valider</button>
                        <button type="button" onClick={() => setEditChiffreId(null)} style={{ marginLeft: 6 }}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setEditChiffreId(n.id); setEditChiffreValue(n.content); }}>Modifier</button>
                        <button type="button" style={{ marginLeft: 8, color: '#b00020' }} onClick={() => handleDeleteChiffre(n.id)}>Supprimer</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <input value={newChiffre} onChange={e => setNewChiffre(e.target.value)} placeholder="Nouveau chiffre" style={{ flex: 1 }} />
          <button type="button" onClick={addChiffre}>Ajouter</button>
        </div>
      </details>

      <hr />

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Associer Texte ↔ Image</summary>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <input placeholder="Rechercher texte" value={texteFilter} onChange={e => setTexteFilter(e.target.value)} />
          <input placeholder="Rechercher image" value={imageFilter} onChange={e => setImageFilter(e.target.value)} />
        </div>
        <select value={selectedTexte} onChange={e => setSelectedTexte(e.target.value)}>
          <option value="">-- Texte --</option>
          {textesFiltered.map(t => <option value={t.id} key={t.id}>{t.content}</option>)}
        </select>
        <select value={selectedImage} onChange={e => setSelectedImage(e.target.value)}>
          <option value="">-- Image --</option>
          {imagesFiltered.map(i => <option value={i.id} key={i.id}>{i.url}</option>)}
        </select>
        <button onClick={associerTexteImage} disabled={!selectedTexte || !selectedImage}>Associer</button>
      </details>

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Associer Calcul ↔ Chiffre</summary>
        <button type="button" onClick={seedMultiplications} style={{ marginBottom: 8 }}>Pré-remplir 30 multiplications</button>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <input placeholder="Rechercher calcul" value={calculFilter} onChange={e => setCalculFilter(e.target.value)} />
          <input placeholder="Rechercher chiffre" value={chiffreFilter} onChange={e => setChiffreFilter(e.target.value)} />
        </div>
        <select value={selectedCalcul} onChange={e => setSelectedCalcul(e.target.value)}>
          <option value="">-- Calcul --</option>
          {calculsFiltered.map(c => <option value={c.id} key={c.id}>{c.content}</option>)}
        </select>
        <select value={selectedChiffre} onChange={e => setSelectedChiffre(e.target.value)}>
          <option value="">-- Chiffre --</option>
          {chiffresFiltered.map(n => <option value={n.id} key={n.id}>{n.content}</option>)}
        </select>
        <button onClick={associerCalculChiffre} disabled={!selectedCalcul || !selectedChiffre}>Associer</button>
      </details>

      
        </>
      )}
    </div>
  );
}

export default AdminPanel;
