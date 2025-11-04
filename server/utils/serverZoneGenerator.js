// Générateur de zones côté serveur pour le mode multijoueur
// Adapté de src/utils/elementsLoader.js pour Node.js

const fs = require('fs');
const path = require('path');

/**
 * Génère les zones avec contenu pour une manche multijoueur
 * @param {number} seed - Seed pour RNG déterministe
 * @param {Object} config - Configuration { themes, classes, excludedPairIds }
 * @returns {Array} Zones avec contenu et pairId
 */
function generateRoundZones(seed, config = {}) {
  try {
    console.log('[ServerZoneGen] Starting with seed:', seed, 'config:', config);
    
    // Charger les données
    const zonesPath = path.join(__dirname, '..', 'data', 'zones2.json');
    const associationsPath = path.join(__dirname, '..', 'data', 'associations.json');
    
    const zonesData = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));
    const associationsFile = JSON.parse(fs.readFileSync(associationsPath, 'utf8'));
    
    // Extraire les tableaux
    let textes = Array.isArray(associationsFile.textes) ? associationsFile.textes : [];
    let images = Array.isArray(associationsFile.images) ? associationsFile.images : [];
    let calculs = Array.isArray(associationsFile.calculs) ? associationsFile.calculs : [];
    let chiffres = Array.isArray(associationsFile.chiffres) ? associationsFile.chiffres : [];
    let associations = Array.isArray(associationsFile.associations) ? associationsFile.associations : [];
    
    console.log('[ServerZoneGen] Loaded:', {
      textes: textes.length,
      images: images.length,
      calculs: calculs.length,
      chiffres: chiffres.length,
      associations: associations.length
    });
    
    // ===== Filtrage par thématiques et classes =====
    const selectedThemes = Array.isArray(config.themes) ? config.themes.filter(Boolean) : [];
    const selectedClasses = Array.isArray(config.classes) ? new Set(config.classes.filter(Boolean)) : null;
    const excludedPairIds = config.excludedPairIds || new Set();
    
    console.log('[ServerZoneGen] Filter config:', {
      themes: selectedThemes,
      classes: selectedClasses ? Array.from(selectedClasses) : null,
      hasThemes: selectedThemes.length > 0,
      hasClasses: selectedClasses && selectedClasses.size > 0
    });
    
    // Ne filtrer QUE si des thématiques ou classes sont RÉELLEMENT sélectionnées
    const shouldFilter = selectedThemes.length > 0 || (selectedClasses && selectedClasses.size > 0);
    
    if (shouldFilter) {
      const hasClass = (el) => !selectedClasses || selectedClasses.has(el?.levelClass);
      const hasThemes = (el) => {
        const tags = Array.isArray(el?.themes) ? el.themes : [];
        if (selectedThemes.length === 0) return true;
        if (tags.length === 0) return true; // includeUntagged par défaut
        return selectedThemes.some(t => tags.includes(t)); // mode 'any'
      };
      
      const filterEl = (el) => hasClass(el) && hasThemes(el);
      
      // Filtrer éléments
      textes = textes.filter(filterEl);
      images = images.filter(filterEl);
      calculs = calculs.filter(filterEl);
      chiffres = chiffres.filter(filterEl);
      
      // Filtrer associations
      const byIdGeneric = (arr) => new Map(arr.map(x => [x.id, x]));
      const T = byIdGeneric(textes);
      const I = byIdGeneric(images);
      const C = byIdGeneric(calculs);
      const N = byIdGeneric(chiffres);
      
      associations = associations.filter(a => {
        const hasTI = a.texteId && a.imageId;
        const hasCN = a.calculId && a.chiffreId;
        const aHasMeta = (a.themes && a.themes.length) || a.levelClass;
        
        if (aHasMeta) {
          return filterEl(a);
        }
        
        if (hasTI) return T.has(a.texteId) && I.has(a.imageId);
        if (hasCN) return C.has(a.calculId) && N.has(a.chiffreId);
        return false;
      });
      
      console.log('[ServerZoneGen] After filtering:', {
        textes: textes.length,
        images: images.length,
        calculs: calculs.length,
        chiffres: chiffres.length,
        associations: associations.length
      });
    }
    
    // ===== Filtrage des paires déjà validées =====
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
      
      console.log('[ServerZoneGen] After excluding validated pairs:', associations.length);
    }
    
    // ===== RNG déterministe =====
    let rngState = seed;
    const rng = () => {
      rngState = (rngState * 48271) % 2147483647;
      return rngState / 2147483647;
    };
    
    // ===== Helpers =====
    const shuffle = (arr) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };
    
    const choose = (arr) => arr[Math.floor(rng() * arr.length)];
    
    const encodedImageUrl = (u) => {
      if (!u) return '';
      try { u = decodeURIComponent(u); } catch {}
      const p = u.replace(/\\/g, '/');
      const filename = p.split('/').pop();
      return `images/${encodeURIComponent(filename)}`;
    };
    
    // ===== Créer les maps d'associations =====
    const byId = (arr) => Object.fromEntries(arr.map(x => [x.id, x]));
    const textesById = byId(textes);
    const imagesById = byId(images);
    const calculsById = byId(calculs);
    const chiffresById = byId(chiffres);
    
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
    
    // ===== Séparer les zones par type =====
    const imageZones = zonesData.filter(z => (z.type || 'image') === 'image');
    const texteZones = zonesData.filter(z => z.type === 'texte');
    const calculZones = zonesData.filter(z => z.type === 'calcul');
    const chiffreZones = zonesData.filter(z => z.type === 'chiffre');
    
    // ===== Candidats avec associations =====
    const imageIds = [...imageToTextes.keys()];
    const texteIds = [...texteToImages.keys()];
    const calculIds = [...calculToChiffres.keys()];
    const chiffreIds = [...chiffreToCalculs.keys()];
    
    let result = zonesData.map(z => ({ ...z }));
    const used = { image: new Set(), texte: new Set(), calcul: new Set(), chiffre: new Set() };
    
    // ===== Choisir le type de paire à placer =====
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
    
    console.log('[ServerZoneGen] Placing pair type:', placedPairType);
    
    const placeIntoZone = (zoneList, payloadBuilder) => {
      if (!zoneList.length) return null;
      const z = choose(zoneList);
      const idx = result.findIndex(r => r.id === z.id);
      const payload = payloadBuilder();
      if (idx >= 0 && payload) Object.assign(result[idx], payload);
      return z.id;
    };
    
    // ===== Placer UNE paire correcte =====
    let goodPairIds = null;
    
    if (placedPairType === 'TI') {
      // Paire Image-Texte
      const links = [];
      for (const [tId, imgSet] of texteToImages.entries()) {
        for (const imgId of imgSet) links.push({ tId, imgId });
      }
      shuffle(links);
      const chosen = links.find(l => imageIds.includes(l.imgId) && texteIds.includes(l.tId));
      
      if (chosen) {
        const pairId = `assoc-img-${chosen.imgId}-txt-${chosen.tId}`;
        
        const tzId = placeIntoZone(texteZones, () => ({
          type: 'texte',
          content: textesById[chosen.tId]?.content || '',
          label: textesById[chosen.tId]?.content || '',
          pairId: pairId
        }));
        
        const izId = placeIntoZone(imageZones, () => ({
          type: 'image',
          content: encodedImageUrl(imagesById[chosen.imgId]?.url || ''),
          label: textesById[chosen.tId]?.content || '',
          pairId: pairId
        }));
        
        if (tzId && izId) {
          used.texte.add(chosen.tId);
          used.image.add(chosen.imgId);
          goodPairIds = { texteId: chosen.tId, imageId: chosen.imgId, pairId };
          console.log('[ServerZoneGen] Placed TI pair:', pairId);
        }
      }
    } else if (placedPairType === 'CC') {
      // Paire Calcul-Chiffre
      const links = [];
      for (const [cId, nSet] of calculToChiffres.entries()) {
        for (const nId of nSet) links.push({ cId, nId });
      }
      shuffle(links);
      const chosen = links.find(l => calculIds.includes(l.cId) && chiffreIds.includes(l.nId));
      
      if (chosen) {
        const pairId = `assoc-calc-${chosen.cId}-num-${chosen.nId}`;
        
        const czId = placeIntoZone(calculZones, () => ({
          type: 'calcul',
          content: calculsById[chosen.cId]?.content || '',
          label: chiffresById[chosen.nId]?.content || '',
          pairId: pairId
        }));
        
        const nzId = placeIntoZone(chiffreZones, () => ({
          type: 'chiffre',
          content: chiffresById[chosen.nId]?.content || '',
          label: chiffresById[chosen.nId]?.content || '',
          pairId: pairId
        }));
        
        if (czId && nzId) {
          used.calcul.add(chosen.cId);
          used.chiffre.add(chosen.nId);
          goodPairIds = { calculId: chosen.cId, chiffreId: chosen.nId, pairId };
          console.log('[ServerZoneGen] Placed CC pair:', pairId);
        }
      }
    }
    
    // ===== Remplir avec des distracteurs (sans pairId) =====
    const pickImageDistractor = (forbiddenTextIds) => {
      const pool = shuffle(imageIds.slice());
      return pool.find(imgId => 
        !used.image.has(imgId) && 
        (!forbiddenTextIds || !imageToTextes.get(imgId) || 
         ![...imageToTextes.get(imgId)].some(t => forbiddenTextIds.has(t)))
      );
    };
    
    const pickTexteDistractor = (forbiddenImageIds) => {
      const pool = shuffle(texteIds.slice());
      return pool.find(tId => 
        !used.texte.has(tId) && 
        (!forbiddenImageIds || !texteToImages.get(tId) || 
         ![...texteToImages.get(tId)].some(i => forbiddenImageIds.has(i)))
      );
    };
    
    const pickCalculDistractor = (forbiddenChiffreIds) => {
      const pool = shuffle(calculIds.slice());
      return pool.find(cId => 
        !used.calcul.has(cId) && 
        (!forbiddenChiffreIds || !calculToChiffres.get(cId) || 
         ![...calculToChiffres.get(cId)].some(n => forbiddenChiffreIds.has(n)))
      );
    };
    
    const pickChiffreDistractor = (forbiddenCalculIds) => {
      const pool = shuffle(chiffreIds.slice());
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
    
    // Remplir le reste des zones (EXACTEMENT comme le mode solo)
    for (const z of result) {
      const type = z.type || 'image';
      if (type === 'image' && !z.content) {
        const imgId = pickImageDistractor(forbiddenTextIds);
        if (imgId) { 
          z.content = encodedImageUrl(imagesById[imgId]?.url || ''); 
          z.pairId = '';
          used.image.add(imgId); 
        }
      } else if (type === 'texte' && !z.content) {
        const tId = pickTexteDistractor(forbiddenImageIds);
        if (tId) { 
          z.content = textesById[tId]?.content || ''; 
          z.label = textesById[tId]?.content || '';
          z.pairId = '';
          used.texte.add(tId); 
        }
      } else if (type === 'calcul' && !z.content) {
        const cId = pickCalculDistractor(forbiddenChiffreIds);
        if (cId) { 
          z.content = calculsById[cId]?.content || ''; 
          z.pairId = '';
          used.calcul.add(cId); 
        }
      } else if (type === 'chiffre' && !z.content) {
        const nId = pickChiffreDistractor(forbiddenCalculIds);
        if (nId) { 
          z.content = chiffresById[nId]?.content || ''; 
          z.label = chiffresById[nId]?.content || '';
          z.pairId = '';
          used.chiffre.add(nId); 
        }
      }
    }
    
    // ===== SANITISATION: Garantir EXACTEMENT UNE paire valide =====
    // Collecter toutes les paires potentielles présentes
    const allPairs = [];
    
    // Paires Image-Texte
    for (const z1 of result) {
      if (z1.type === 'image' && z1.pairId) {
        for (const z2 of result) {
          if (z2.type === 'texte' && z2.pairId === z1.pairId) {
            allPairs.push({ key: z1.pairId, kind: 'IT', zones: [z1.id, z2.id] });
          }
        }
      }
    }
    
    // Paires Calcul-Chiffre
    for (const z1 of result) {
      if (z1.type === 'calcul' && z1.pairId) {
        for (const z2 of result) {
          if (z2.type === 'chiffre' && z2.pairId === z1.pairId) {
            allPairs.push({ key: z1.pairId, kind: 'CC', zones: [z1.id, z2.id] });
          }
        }
      }
    }
    
    // Ne garder QUE la première paire trouvée, vider les pairId des autres
    if (allPairs.length > 0) {
      const kept = allPairs[0];
      result = result.map(z => {
        if (z.pairId && !kept.zones.includes(z.id)) {
          return { ...z, pairId: '' };
        }
        return z;
      });
    }
    
    console.log('[ServerZoneGen] Generated zones:', result.length, 'with good pair:', goodPairIds?.pairId || 'NONE');
    return result;
    
  } catch (error) {
    console.error('[ServerZoneGen] FATAL ERROR:', error);
    console.error('[ServerZoneGen] Stack:', error.stack);
    return [];
  }
}

module.exports = { generateRoundZones };
