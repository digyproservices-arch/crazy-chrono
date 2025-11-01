/**
 * Générateur de zones côté serveur pour le mode multijoueur
 * Copie EXACTE de la logique client (elementsLoader.js) pour garantir la synchronisation
 * 
 * RÈGLE CRITIQUE : Ce fichier ne doit être utilisé QUE pour le mode multijoueur
 * Le mode solo utilise toujours elementsLoader.js côté client
 */

const fs = require('fs');
const path = require('path');

/**
 * Charge les données depuis le dossier server/data/
 */
function loadServerData() {
  const dataDir = path.join(__dirname, '..', 'data');
  
  const zonesPath = path.join(dataDir, 'zones2.json');
  const associationsPath = path.join(dataDir, 'associations.json');
  
  if (!fs.existsSync(zonesPath)) {
    throw new Error(`[ServerZoneGen] zones2.json not found at ${zonesPath}`);
  }
  if (!fs.existsSync(associationsPath)) {
    throw new Error(`[ServerZoneGen] associations.json not found at ${associationsPath}`);
  }
  
  const zones = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));
  const associations = JSON.parse(fs.readFileSync(associationsPath, 'utf8'));
  
  return { zones, associations };
}

/**
 * Générateur de nombres pseudo-aléatoires basé sur une seed
 * Identique à la version client pour garantir le déterminisme
 */
function makeRngFromSeed(seed) {
  if (!Number.isFinite(seed)) return Math.random;
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return function() {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/**
 * Mélange un tableau avec un RNG donné (Fisher-Yates)
 */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Choisit un élément aléatoire dans un tableau
 */
function choose(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Normalise une URL d'image en encodant le nom de fichier
 */
function encodedImageUrl(u) {
  if (!u) return '';
  try { u = decodeURIComponent(u); } catch {}
  const p = u.replace(/\\/g, '/');
  const filename = p.split('/').pop();
  return `images/${encodeURIComponent(filename)}`;
}

module.exports = { generateRoundZones };

/**
 * Génère les zones pour une manche avec filtrage thématique et exclusion des paires validées
 */
function generateRoundZones(seed, config = {}) {
  console.log('[ServerZoneGen] Starting generation', { 
    seed, 
    themes: config.themes?.length || 0, 
    classes: config.classes?.length || 0, 
    excludedPairs: config.excludedPairIds?.size || 0 
  });
  
  const rng = makeRngFromSeed(seed);
  const { zones: baseZones, associations: assocData } = loadServerData();
  
  // Extraire les données
  let textes = Array.isArray(assocData.textes) ? assocData.textes : [];
  let images = Array.isArray(assocData.images) ? assocData.images : [];
  let calculs = Array.isArray(assocData.calculs) ? assocData.calculs : [];
  let chiffres = Array.isArray(assocData.chiffres) ? assocData.chiffres : [];
  let associations = Array.isArray(assocData.associations) ? assocData.associations : [];
  
  // FILTRAGE PAR THÉMATIQUES ET CLASSES
  const selectedClasses = Array.isArray(config.classes) ? new Set(config.classes) : null;
  const selectedThemes = Array.isArray(config.themes) ? config.themes.filter(Boolean) : [];
  const matchMode = config.themeMatch === 'all' ? 'all' : 'any';
  const includeUntagged = config.includeUntagged !== false;
  
  const hasClass = (el) => !selectedClasses || selectedClasses.has(el?.levelClass);
  const hasThemes = (el) => {
    const tags = Array.isArray(el?.themes) ? el.themes.map(String) : [];
    if (!selectedThemes.length) return true;
    if (!tags.length) return includeUntagged;
    if (matchMode === 'all') {
      return selectedThemes.every(t => tags.includes(t));
    }
    return selectedThemes.some(t => tags.includes(t));
  };
  
  const filterEl = (el) => hasClass(el) && hasThemes(el);
  
  textes = textes.filter(filterEl);
  images = images.filter(filterEl);
  calculs = calculs.filter(filterEl);
  chiffres = chiffres.filter(filterEl);
  
  console.log('[ServerZoneGen] After theme/class filtering:', { 
    textes: textes.length, 
    images: images.length, 
    calculs: calculs.length, 
    chiffres: chiffres.length 
  });
  
  // Filtrer associations
  const byIdGeneric = (arr) => new Map(arr.map(x => [x.id, x]));
  const T = byIdGeneric(textes), I = byIdGeneric(images);
  const C = byIdGeneric(calculs), N = byIdGeneric(chiffres);
  
  associations = associations.filter(a => {
    const hasTI = a.texteId && a.imageId;
    const hasCN = a.calculId && a.chiffreId;
    const aHasMeta = (a.themes && a.themes.length) || a.levelClass;
    if (aHasMeta) return filterEl(a);
    if (hasTI) return T.has(a.texteId) && I.has(a.imageId);
    if (hasCN) return C.has(a.calculId) && N.has(a.chiffreId);
    return false;
  });
  
  // FILTRAGE DES PAIRES VALIDÉES
  const excludedPairIds = config.excludedPairIds || new Set();
  if (excludedPairIds.size > 0) {
    const buildPairId = (a) => {
      if (a.texteId && a.imageId) return `assoc-img-${a.imageId}-txt-${a.texteId}`;
      if (a.calculId && a.chiffreId) return `assoc-calc-${a.calculId}-num-${a.chiffreId}`;
      return null;
    };
    associations = associations.filter(a => {
      const pairId = buildPairId(a);
      return !pairId || !excludedPairIds.has(pairId);
    });
    console.log('[ServerZoneGen] After excluding validated pairs:', { 
      remaining: associations.length, 
      excluded: excludedPairIds.size 
    });
  }
  
  // Créer les index
  const byId = (arr, key='id') => Object.fromEntries(arr.map(x => [x[key], x]));
  const textesById = byId(textes);
  const imagesById = byId(images, 'id');
  const calculsById = byId(calculs);
  const chiffresById = byId(chiffres);
  
  // Maps d'associations
  const texteToImages = new Map();
  const imageToTextes = new Map();
  const calculToChiffres = new Map();
  const chiffreToCalculs = new Map();
  const addMap = (m, a, b) => { 
    if (!m.has(a)) m.set(a, new Set()); 
    m.get(a).add(b); 
  };
  
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
  
  // Zones par type
  const imageZones = baseZones.filter(z => (z.type || 'image') === 'image');
  const texteZones = baseZones.filter(z => z.type === 'texte');
  const calculZones = baseZones.filter(z => z.type === 'calcul');
  const chiffreZones = baseZones.filter(z => z.type === 'chiffre');
  
  // Candidats avec associations
  const imageIds = [...imageToTextes.keys()];
  const texteIds = [...texteToImages.keys()];
  const calculIds = [...calculToChiffres.keys()];
  const chiffreIds = [...chiffreToCalculs.keys()];
  
  const result = baseZones.map(z => ({ ...z }));
  const used = { image: new Set(), texte: new Set(), calcul: new Set(), chiffre: new Set() };
  
  // Sélectionner le type de paire à poser
  let placedPairType = null;
  const canTI = imageZones.length && texteZones.length && imageIds.length && texteIds.length;
  const canCC = calculZones.length && chiffreZones.length && calculIds.length && chiffreIds.length;
  
  if (canTI && canCC) {
    placedPairType = rng() < 0.5 ? 'TI' : 'CC';
  } else if (canTI) {
    placedPairType = 'TI';
  } else if (canCC) {
    placedPairType = 'CC';
  }
  
  const placeIntoZone = (zoneList, payloadBuilder) => {
    if (!zoneList.length) return null;
    const z = choose(zoneList, rng);
    const idx = result.findIndex(r => r.id === z.id);
    const payload = payloadBuilder();
    if (idx >= 0 && payload) Object.assign(result[idx], payload);
    return z.id;
  };
  
  // Place 1 paire correcte
  let goodPairIds = null;
  if (placedPairType === 'TI') {
    const links = [];
    for (const [tId, imgSet] of texteToImages.entries()) {
      for (const imgId of imgSet) links.push({ tId, imgId });
    }
    shuffle(links, rng);
    const chosen = links.find(l => imageIds.includes(l.imgId) && texteIds.includes(l.tId));
    if (chosen) {
      const tzId = placeIntoZone(texteZones, () => ({ 
        type: 'texte', 
        content: textesById[chosen.tId]?.content || '' 
      }));
      const izId = placeIntoZone(imageZones, () => ({ 
        type: 'image', 
        content: encodedImageUrl(imagesById[chosen.imgId]?.url || ''), 
        label: '', 
        pairId: '' 
      }));
      if (tzId && izId) {
        used.texte.add(chosen.tId);
        used.image.add(chosen.imgId);
        goodPairIds = { texteId: chosen.tId, imageId: chosen.imgId };
      }
    }
  } else if (placedPairType === 'CC') {
    const links = [];
    for (const [cId, nSet] of calculToChiffres.entries()) {
      for (const nId of nSet) links.push({ cId, nId });
    }
    shuffle(links, rng);
    const chosen = links.find(l => calculIds.includes(l.cId) && chiffreIds.includes(l.nId));
    if (chosen) {
      const czId = placeIntoZone(calculZones, () => ({ 
        type: 'calcul', 
        content: calculsById[chosen.cId]?.content || '' 
      }));
      const nzId = placeIntoZone(chiffreZones, () => ({ 
        type: 'chiffre', 
        content: chiffresById[chosen.nId]?.content || '' 
      }));
      if (czId && nzId) {
        used.calcul.add(chosen.cId);
        used.chiffre.add(chosen.nId);
        goodPairIds = { calculId: chosen.cId, chiffreId: chosen.nId };
      }
    }
  }
  
  // Remplissage distracteurs
  const pickImageDistractor = (forbiddenTextIds) => {
    const pool = shuffle(imageIds.slice(), rng);
    return pool.find(imgId => 
      !used.image.has(imgId) && 
      (!forbiddenTextIds || !imageToTextes.get(imgId) || 
       ![...imageToTextes.get(imgId)].some(t => forbiddenTextIds.has(t)))
    );
  };
  
  const pickTexteDistractor = (forbiddenImageIds) => {
    const pool = shuffle(texteIds.slice(), rng);
    return pool.find(tId => 
      !used.texte.has(tId) && 
      (!forbiddenImageIds || !texteToImages.get(tId) || 
       ![...texteToImages.get(tId)].some(i => forbiddenImageIds.has(i)))
    );
  };
  
  const pickCalculDistractor = (forbiddenChiffreIds) => {
    const pool = shuffle(calculIds.slice(), rng);
    return pool.find(cId => 
      !used.calcul.has(cId) && 
      (!forbiddenChiffreIds || !calculToChiffres.get(cId) || 
       ![...calculToChiffres.get(cId)].some(n => forbiddenChiffreIds.has(n)))
    );
  };
  
  const pickChiffreDistractor = (forbiddenCalculIds) => {
    const pool = shuffle(chiffreIds.slice(), rng);
    return pool.find(nId => 
      !used.chiffre.has(nId) && 
      (!forbiddenCalculIds || !chiffreToCalculs.get(nId) || 
       ![...chiffreToCalculs.get(nId)].some(c => forbiddenCalculIds.has(c)))
    );
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
      if (imgId) { 
        z.content = encodedImageUrl(imagesById[imgId]?.url || ''); 
        used.image.add(imgId); 
      }
    } else if (type === 'texte' && !z.content) {
      const tId = pickTexteDistractor(forbiddenImageIds);
      if (tId) { 
        z.content = textesById[tId]?.content || ''; 
        used.texte.add(tId); 
      }
    } else if (type === 'calcul' && !z.content) {
      const cId = pickCalculDistractor(forbiddenChiffreIds);
      if (cId) { 
        z.content = calculsById[cId]?.content || ''; 
        used.calcul.add(cId); 
      }
    } else if (type === 'chiffre' && !z.content) {
      const nId = pickChiffreDistractor(forbiddenCalculIds);
      if (nId) { 
        z.content = chiffresById[nId]?.content || ''; 
        used.chiffre.add(nId); 
      }
    }
  }
  
  console.log('[ServerZoneGen] Generation complete:', { 
    totalZones: result.length, 
    placedPairType, 
    goodPair: goodPairIds 
  });
  
  return result;
}
