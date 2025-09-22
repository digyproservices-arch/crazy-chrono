console.log('ELEMENTS LOADER CHARGE');
// Charge, mélange et attribue les éléments à des zones de la carte
// Utilisation : import { assignElementsToZones, fetchElements } from '../utils/elementsLoader';

// Chargement dynamique des éléments depuis le dossier public/data/elements.json
export async function fetchElements() {
  try {
    const resp = await fetch(process.env.PUBLIC_URL + '/data/elements.json');
    if (!resp.ok) throw new Error('Erreur HTTP ' + resp.status);
    return await resp.json();
  } catch (e) {
    throw new Error('Erreur lors du chargement ou parsing de elements.json : ' + e.message);
  }
}

export async function assignElementsToZones(zones, _elements, assocData, rng = Math.random) {
  // Utiliser uniquement les éléments présents dans associations.json
  const data = assocData || {};
  let textes = Array.isArray(data.textes) ? data.textes : [];
  let images = Array.isArray(data.images) ? data.images : [];
  let calculs = Array.isArray(data.calculs) ? data.calculs : [];
  let chiffres = Array.isArray(data.chiffres) ? data.chiffres : [];
  let associations = Array.isArray(data.associations) ? data.associations : [];

  // ===== Filtrage par SessionConfig (classes/thèmes) =====
  // Lecture configuration côté client (définie par SessionConfig)
  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
  if (cfg && (Array.isArray(cfg.classes) || Array.isArray(cfg.themes))) {
    const selectedClasses = Array.isArray(cfg.classes) ? new Set(cfg.classes) : null;
    const selectedThemes = Array.isArray(cfg.themes) ? cfg.themes.filter(Boolean) : [];
    const matchMode = cfg.themeMatch === 'all' ? 'all' : 'any';
    const includeUntagged = cfg.includeUntagged !== false; // par défaut true

    const hasClass = (el) => !selectedClasses || selectedClasses.has(el?.levelClass);
    const hasThemes = (el) => {
      const tags = Array.isArray(el?.themes) ? el.themes.map(String) : [];
      if (!selectedThemes.length) return true; // pas de filtre thème
      if (!tags.length) return includeUntagged; // pas de thèmes => dépend de l'option
      if (matchMode === 'all') {
        return selectedThemes.every(t => tags.includes(t));
      }
      // any
      return selectedThemes.some(t => tags.includes(t));
    };

    const filterEl = (el) => hasClass(el) && hasThemes(el);
    // Filtrer éléments
    textes = textes.filter(filterEl);
    images = images.filter(filterEl);
    calculs = calculs.filter(filterEl);
    chiffres = chiffres.filter(filterEl);

    // Filtrer associations si elles ont leurs propres métadonnées; sinon, on garde si leurs deux côtés survivent
    const byIdGeneric = (arr) => new Map(arr.map(x => [x.id, x]));
    const T = byIdGeneric(textes), I = byIdGeneric(images), C = byIdGeneric(calculs), N = byIdGeneric(chiffres);
    associations = associations.filter(a => {
      const hasTI = a.texteId && a.imageId;
      const hasCN = a.calculId && a.chiffreId;
      const aHasMeta = (a.themes && a.themes.length) || a.levelClass;
      if (aHasMeta) {
        // si l'asso est explicitement taggée, on filtre sur elle
        return filterEl(a);
      }
      // sinon on vérifie les deux côtés
      if (hasTI) return T.has(a.texteId) && I.has(a.imageId);
      if (hasCN) return C.has(a.calculId) && N.has(a.chiffreId);
      return false;
    });
  }

  const byId = (arr, key='id') => Object.fromEntries(arr.map(x => [x[key], x]));
  const textesById = byId(textes);
  const imagesById = byId(images, 'id');
  const calculsById = byId(calculs);
  const chiffresById = byId(chiffres);

  // Maps association
  const texteToImages = new Map();
  const imageToTextes = new Map();
  const calculToChiffres = new Map();
  const chiffreToCalculs = new Map();
  const addMap = (m, a, b) => { if (!m.has(a)) m.set(a, new Set()); m.get(a).add(b); };
  for (const a of associations) {
    if (a.texteId && a.imageId) {
      if (textesById[a.texteId] && imagesById[a.imageId]) {
        addMap(texteToImages, a.texteId, a.imageId);
        addMap(imageToTextes, a.imageId, a.texteId);
      }
    }
    if (a.calculId && a.chiffreId) {
      if (calculsById[a.calculId] && chiffresById[a.chiffreId]) {
        addMap(calculToChiffres, a.calculId, a.chiffreId);
        addMap(chiffreToCalculs, a.chiffreId, a.calculId);
      }
    }
  }

  // Helpers
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng()*(i+1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  const choose = (arr) => arr[Math.floor(rng()*arr.length)];
  // Normalise une URL d'image en encodant le nom de fichier pour gérer accents/espaces
  // Forme finale: images/<encodeURIComponent(filename)>
  // Le filtre de Carte décode avant comparaison, donc l'appariement reste OK.
  const encodedImageUrl = (u) => {
    if (!u) return '';
    try { u = decodeURIComponent(u); } catch {}
    const p = u.replace(/\\/g, '/');
    const filename = p.split('/').pop();
    return `images/${encodeURIComponent(filename)}`;
  };

  // Zones par type
  const imageZones = zones.filter(z => (z.type || 'image') === 'image');
  const texteZones = zones.filter(z => z.type === 'texte');
  const calculZones = zones.filter(z => z.type === 'calcul');
  const chiffreZones = zones.filter(z => z.type === 'chiffre');

  // Candidats avec associations
  const imageIds = [...imageToTextes.keys()];
  const texteIds = [...texteToImages.keys()];
  const calculIds = [...calculToChiffres.keys()];
  const chiffreIds = [...chiffreToCalculs.keys()];

  const result = zones.map(z => ({ ...z }));
  const used = { image: new Set(), texte: new Set(), calcul: new Set(), chiffre: new Set() };

  // Sélectionne le type de paire à poser sans priorité: TI ou CC au hasard si les deux sont possibles
  let placedPairType = null;
  const canTI = imageZones.length && texteZones.length && imageIds.length && texteIds.length;
  const canCC = calculZones.length && chiffreZones.length && calculIds.length && chiffreIds.length;
  if (canTI && canCC) {
    placedPairType = (typeof rng === 'function' ? (rng() < 0.5) : (Math.random() < 0.5)) ? 'TI' : 'CC';
  } else if (canTI) {
    placedPairType = 'TI';
  } else if (canCC) {
    placedPairType = 'CC';
  }

  const placeIntoZone = (zoneList, payloadBuilder) => {
    if (!zoneList.length) return null;
    const z = choose(zoneList);
    const idx = result.findIndex(r => r.id === z.id);
    const payload = payloadBuilder();
    if (idx >= 0 && payload) Object.assign(result[idx], payload);
    return z.id;
  };

  // Place 1 paire correcte
  let goodPairIds = null; // {texteId,imageId} ou {calculId,chiffreId}
  if (placedPairType === 'TI') {
    // Choisir une association valide au hasard
    const links = [];
    for (const [tId, imgSet] of texteToImages.entries()) {
      for (const imgId of imgSet) links.push({ tId, imgId });
    }
    shuffle(links);
    const chosen = links.find(l => imageIds.includes(l.imgId) && texteIds.includes(l.tId));
    if (chosen) {
      const tzId = placeIntoZone(texteZones, () => ({ type: 'texte', content: textesById[chosen.tId]?.content || '' }));
      const izId = placeIntoZone(imageZones, () => ({ type: 'image', content: encodedImageUrl(imagesById[chosen.imgId]?.url || ''), label: '', pairId: '' }));
      if (tzId && izId) {
        used.texte.add(chosen.tId); used.image.add(chosen.imgId);
        goodPairIds = { texteId: chosen.tId, imageId: chosen.imgId };
      }
    }
  } else if (placedPairType === 'CC') {
    const links = [];
    for (const [cId, nSet] of calculToChiffres.entries()) {
      for (const nId of nSet) links.push({ cId, nId });
    }
    shuffle(links);
    const chosen = links.find(l => calculIds.includes(l.cId) && chiffreIds.includes(l.nId));
    if (chosen) {
      const czId = placeIntoZone(calculZones, () => ({ type: 'calcul', content: calculsById[chosen.cId]?.content || '' }));
      const nzId = placeIntoZone(chiffreZones, () => ({ type: 'chiffre', content: chiffresById[chosen.nId]?.content || '' }));
      if (czId && nzId) {
        used.calcul.add(chosen.cId); used.chiffre.add(chosen.nId);
        goodPairIds = { calculId: chosen.cId, chiffreId: chosen.nId };
      }
    }
  }

  // Remplissage distracteurs (sans créer d'autres paires, sans doublons)
  const pickImageDistractor = (forbiddenTextIds) => {
    const pool = shuffle(imageIds.slice());
    return pool.find(imgId => !used.image.has(imgId) && (!forbiddenTextIds || !imageToTextes.get(imgId) || ![...imageToTextes.get(imgId)].some(t => forbiddenTextIds.has(t))));
  };
  const pickTexteDistractor = (forbiddenImageIds) => {
    const pool = shuffle(texteIds.slice());
    return pool.find(tId => !used.texte.has(tId) && (!forbiddenImageIds || !texteToImages.get(tId) || ![...texteToImages.get(tId)].some(i => forbiddenImageIds.has(i))));
  };
  const pickCalculDistractor = (forbiddenChiffreIds) => {
    const pool = shuffle(calculIds.slice());
    return pool.find(cId => !used.calcul.has(cId) && (!forbiddenChiffreIds || !calculToChiffres.get(cId) || ![...calculToChiffres.get(cId)].some(n => forbiddenChiffreIds.has(n))));
  };
  const pickChiffreDistractor = (forbiddenCalculIds) => {
    const pool = shuffle(chiffreIds.slice());
    return pool.find(nId => !used.chiffre.has(nId) && (!forbiddenCalculIds || !chiffreToCalculs.get(nId) || ![...chiffreToCalculs.get(nId)].some(c => forbiddenCalculIds.has(c))));
  };

  const forbiddenTextIds = new Set(goodPairIds?.texteId ? [goodPairIds.texteId] : []);
  const forbiddenImageIds = new Set(goodPairIds?.imageId ? [goodPairIds.imageId] : []);
  const forbiddenCalculIds = new Set(goodPairIds?.calculId ? [goodPairIds.calculId] : []);
  const forbiddenChiffreIds = new Set(goodPairIds?.chiffreId ? [goodPairIds.chiffreId] : []);

  // Remplir le reste des zones
  for (const z of result) {
    const type = z.type || 'image';
    if (type === 'image' && !z.content) {
      const imgId = pickImageDistractor(forbiddenTextIds);
      if (imgId) { z.content = encodedImageUrl(imagesById[imgId]?.url || ''); used.image.add(imgId); }
    } else if (type === 'texte' && !z.content) {
      const tId = pickTexteDistractor(forbiddenImageIds);
      if (tId) { z.content = textesById[tId]?.content || ''; used.texte.add(tId); }
    } else if (type === 'calcul' && !z.content) {
      const cId = pickCalculDistractor(forbiddenChiffreIds);
      if (cId) { z.content = calculsById[cId]?.content || ''; used.calcul.add(cId); }
    } else if (type === 'chiffre' && !z.content) {
      const nId = pickChiffreDistractor(forbiddenCalculIds);
      if (nId) { z.content = chiffresById[nId]?.content || ''; used.chiffre.add(nId); }
    }
  }

  return result;
}
