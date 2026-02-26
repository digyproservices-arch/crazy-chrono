// Générateur de zones côté serveur pour le mode multijoueur
// Adapté de src/utils/elementsLoader.js pour Node.js

const fs = require('fs');
const path = require('path');

/**
 * Évalue un calcul mathématique simple (multiplication uniquement)
 * @param {string} calcul - Ex: "3 × 4" ou "2 × 5"
 * @returns {number|null} Résultat ou null si invalide
 */
function evaluateCalcul(calcul) {
  if (!calcul || typeof calcul !== 'string') return null;
  
  // Nettoyer et normaliser (× ou x)
  const normalized = calcul.trim().replace(/\s+/g, ' ').replace(/x/gi, '×');
  
  // Extraire les nombres autour du ×
  const match = normalized.match(/^(\d+)\s*×\s*(\d+)$/);
  if (!match) return null;
  
  const a = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  
  return a * b;
}

/**
 * Vérifie si un calcul et un chiffre forment une paire valide
 * @param {string} calculContent - Ex: "3 × 4"
 * @param {string} chiffreContent - Ex: "12"
 * @returns {boolean} true si c'est une paire valide
 */
function isValidMathPair(calculContent, chiffreContent) {
  const result = evaluateCalcul(calculContent);
  if (result === null) return false;
  
  const chiffre = parseInt(String(chiffreContent).trim(), 10);
  if (!Number.isFinite(chiffre)) return false;
  
  return result === chiffre;
}

// ===== Anti-Repetition Deck System (server-side) =====
// Same principle as client-side: elements are drawn sequentially from a shuffled deck.
// When the deck is exhausted, it is refilled & reshuffled. Guarantees maximum variety.
// The deckState object is owned by the room/match and passed via config.deckState.

function createDeckState() {
  return { decks: {}, roundCount: 0 };
}

function _drawFromDeck(deckState, deckName, allIds, rng, filterFn) {
  if (!deckState || !deckState.decks) return undefined;
  if (!deckState.decks[deckName]) deckState.decks[deckName] = [];
  const deck = deckState.decks[deckName];

  // Try drawing from existing deck
  for (let i = 0; i < deck.length; i++) {
    if (filterFn(deck[i])) {
      return deck.splice(i, 1)[0];
    }
  }

  // Deck exhausted → refill with all IDs (shuffled) and try again
  const fresh = allIds.slice();
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }
  deckState.decks[deckName] = fresh;

  for (let i = 0; i < deckState.decks[deckName].length; i++) {
    if (filterFn(deckState.decks[deckName][i])) {
      return deckState.decks[deckName].splice(i, 1)[0];
    }
  }

  return undefined;
}

/**
 * Génère les zones avec contenu pour une manche multijoueur
 * @param {number} seed - Seed pour RNG déterministe
 * @param {Object} config - Configuration { themes, classes, excludedPairIds, logFn, deckState }
 * @returns {Object} { zones, goodPairIds }
 */
function generateRoundZones(seed, config = {}) {
  try {
    const logFn = config.logFn || (() => {}); // Callback optionnel pour logs
    const deckState = config.deckState || null; // Anti-repetition deck (mutable, owned by room)
    console.log('[ServerZoneGen] Starting with seed:', seed, 'hasDeck:', !!deckState);
    logFn('info', '[ZoneGen] Starting generation', {
      seed,
      themesCount: (config.themes || []).length,
      classesCount: (config.classes || []).length,
      excludedPairsCount: (config.excludedPairIds || new Set()).size
    });
    
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
    
    // ✅ FIX: Charger math_positions.json pour injecter angle + offset dans les zones
    // En mode Arena/Training, le client utilise zone.angle directement (pas localStorage)
    let mathPositions = { calcAngles: {}, mathOffsets: {} };
    try {
      const mpPath = path.join(__dirname, '..', '..', 'public', 'data', 'math_positions.json');
      if (fs.existsSync(mpPath)) {
        mathPositions = JSON.parse(fs.readFileSync(mpPath, 'utf8'));
        console.log('[ServerZoneGen] math_positions.json chargé:', {
          anglesCount: Object.keys(mathPositions.calcAngles || {}).length,
          offsetsCount: Object.keys(mathPositions.mathOffsets || {}).length
        });
      } else {
        console.warn('[ServerZoneGen] math_positions.json introuvable:', mpPath);
      }
    } catch (mpErr) {
      console.warn('[ServerZoneGen] Erreur chargement math_positions.json:', mpErr.message);
    }
    const mpAngles = mathPositions.calcAngles || {};
    const mpOffsets = mathPositions.mathOffsets || {};

    let result = zonesData.map(z => {
      const zone = { ...z };
      // Injecter angle et offset depuis math_positions.json pour calcul/chiffre
      if ((zone.type === 'calcul' || zone.type === 'chiffre') && zone.id) {
        const zoneIdStr = String(zone.id);
        if (mpAngles[zoneIdStr] !== undefined) {
          zone.angle = mpAngles[zoneIdStr];
        }
        if (mpOffsets[zoneIdStr]) {
          zone.mathOffset = mpOffsets[zoneIdStr];
        }
      }
      return zone;
    });
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
      // Paire Image-Texte (deck-based for variety)
      const tiLinkMap = new Map();
      for (const [tId, imgSet] of texteToImages.entries()) {
        for (const imgId of imgSet) {
          tiLinkMap.set(`ti-${tId}-${imgId}`, { tId, imgId });
        }
      }
      const tiKeys = [...tiLinkMap.keys()];
      let chosen = null;
      if (deckState) {
        const chosenKey = _drawFromDeck(deckState, 'assocTI', tiKeys, rng, (key) => {
          const l = tiLinkMap.get(key);
          return l && imageIds.includes(l.imgId) && texteIds.includes(l.tId);
        });
        chosen = chosenKey ? tiLinkMap.get(chosenKey) : null;
      } else {
        const validLinks = tiKeys.filter(k => { const l = tiLinkMap.get(k); return l && imageIds.includes(l.imgId) && texteIds.includes(l.tId); });
        const key = validLinks.length > 0 ? validLinks[Math.floor(rng() * validLinks.length)] : null;
        chosen = key ? tiLinkMap.get(key) : null;
      }
      
      console.log('[ServerZoneGen] Image-Texte pairs available:', tiKeys.length);
      logFn('info', '[ZoneGen] Image-Texte selection', {
        availablePairs: tiKeys.length,
        chosenTexteId: chosen?.tId,
        chosenImageId: chosen?.imgId,
        chosenTexteContent: chosen ? textesById[chosen.tId]?.content : null
      });
      
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
          logFn('info', '[ZoneGen] Placed Image-Texte pair', {
            pairId,
            texteZoneId: tzId,
            imageZoneId: izId,
            texteContent: textesById[chosen.tId]?.content || '',
            imageId: chosen.imgId
          });
        }
      }
    } else if (placedPairType === 'CC') {
      // Paire Calcul-Chiffre (deck-based for variety)
      const ccLinkMap = new Map();
      for (const [cId, nSet] of calculToChiffres.entries()) {
        for (const nId of nSet) {
          ccLinkMap.set(`cc-${cId}-${nId}`, { cId, nId });
        }
      }
      const ccKeys = [...ccLinkMap.keys()];
      let chosen = null;
      if (deckState) {
        const chosenKey = _drawFromDeck(deckState, 'assocCC', ccKeys, rng, (key) => {
          const l = ccLinkMap.get(key);
          return l && calculIds.includes(l.cId) && chiffreIds.includes(l.nId);
        });
        chosen = chosenKey ? ccLinkMap.get(chosenKey) : null;
      } else {
        const validLinks = ccKeys.filter(k => { const l = ccLinkMap.get(k); return l && calculIds.includes(l.cId) && chiffreIds.includes(l.nId); });
        const key = validLinks.length > 0 ? validLinks[Math.floor(rng() * validLinks.length)] : null;
        chosen = key ? ccLinkMap.get(key) : null;
      }
      
      console.log('[ServerZoneGen] Calcul-Chiffre pairs available:', ccKeys.length);
      logFn('info', '[ZoneGen] Calcul-Chiffre selection', {
        availablePairs: ccKeys.length,
        chosenCalculId: chosen?.cId,
        chosenChiffreId: chosen?.nId,
        chosenCalculContent: chosen ? calculsById[chosen.cId]?.content : null,
        chosenChiffreContent: chosen ? chiffresById[chosen.nId]?.content : null
      });
      
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
          logFn('info', '[ZoneGen] Placed Calcul-Chiffre pair', {
            pairId,
            calculZoneId: czId,
            chiffreZoneId: nzId,
            calculContent: calculsById[chosen.cId]?.content || '',
            chiffreContent: chiffresById[chosen.nId]?.content || ''
          });
        }
      }
    }
    
    // ===== Remplir avec des distracteurs via deck (anti-répétition inter-manches) =====
    const _imgFilter = (forbiddenTextIds, usedContents) => (imgId) => {
      const url = imagesById[imgId]?.url;
      return !used.image.has(imgId) && 
             !usedContents.has(url) &&
             (!forbiddenTextIds || !imageToTextes.get(imgId) || 
              ![...imageToTextes.get(imgId)].some(t => forbiddenTextIds.has(t)));
    };
    const pickImageDistractor = (forbiddenTextIds, usedContents) => {
      if (deckState) return _drawFromDeck(deckState, 'distImg', imageIds, rng, _imgFilter(forbiddenTextIds, usedContents));
      const pool = shuffle(imageIds.slice());
      return pool.find(_imgFilter(forbiddenTextIds, usedContents));
    };
    
    const _txtFilter = (forbiddenImageIds, usedContents) => (tId) => {
      const content = textesById[tId]?.content;
      return !used.texte.has(tId) && 
             !usedContents.has(content) &&
             (!forbiddenImageIds || !texteToImages.get(tId) || 
              ![...texteToImages.get(tId)].some(i => forbiddenImageIds.has(i)));
    };
    const pickTexteDistractor = (forbiddenImageIds, usedContents) => {
      if (deckState) return _drawFromDeck(deckState, 'distTxt', texteIds, rng, _txtFilter(forbiddenImageIds, usedContents));
      const pool = shuffle(texteIds.slice());
      return pool.find(_txtFilter(forbiddenImageIds, usedContents));
    };
    
    const _calcFilter = (forbiddenChiffreIds, usedContents, placedChiffreContents) => (cId) => {
      const content = calculsById[cId]?.content;
      if (placedChiffreContents && placedChiffreContents.size > 0) {
        for (const chiffreContent of placedChiffreContents) {
          if (isValidMathPair(content, chiffreContent)) return false;
        }
      }
      return !used.calcul.has(cId) && 
             !usedContents.has(content) &&
             (!forbiddenChiffreIds || !calculToChiffres.get(cId) || 
              ![...calculToChiffres.get(cId)].some(n => forbiddenChiffreIds.has(n)));
    };
    const pickCalculDistractor = (forbiddenChiffreIds, usedContents, placedChiffreContents) => {
      if (deckState) return _drawFromDeck(deckState, 'distCalc', calculIds, rng, _calcFilter(forbiddenChiffreIds, usedContents, placedChiffreContents));
      const pool = shuffle(calculIds.slice());
      return pool.find(_calcFilter(forbiddenChiffreIds, usedContents, placedChiffreContents));
    };
    
    const _numFilter = (forbiddenCalculIds, usedContents, placedCalculContents) => (nId) => {
      const content = chiffresById[nId]?.content;
      if (placedCalculContents && placedCalculContents.size > 0) {
        for (const calculContent of placedCalculContents) {
          if (isValidMathPair(calculContent, content)) return false;
        }
      }
      return !used.chiffre.has(nId) && 
             !usedContents.has(content) &&
             (!forbiddenCalculIds || !chiffreToCalculs.get(nId) || 
              ![...chiffreToCalculs.get(nId)].some(c => forbiddenCalculIds.has(c)));
    };
    const pickChiffreDistractor = (forbiddenCalculIds, usedContents, placedCalculContents) => {
      if (deckState) return _drawFromDeck(deckState, 'distNum', chiffreIds, rng, _numFilter(forbiddenCalculIds, usedContents, placedCalculContents));
      const pool = shuffle(chiffreIds.slice());
      return pool.find(_numFilter(forbiddenCalculIds, usedContents, placedCalculContents));
    };
    
    // Interdire les éléments de la paire correcte
    const forbiddenTextIds = new Set(goodPairIds?.texteId ? [goodPairIds.texteId] : []);
    const forbiddenImageIds = new Set(goodPairIds?.imageId ? [goodPairIds.imageId] : []);
    const forbiddenCalculIds = new Set(goodPairIds?.calculId ? [goodPairIds.calculId] : []);
    const forbiddenChiffreIds = new Set(goodPairIds?.chiffreId ? [goodPairIds.chiffreId] : []);
    
    // Suivre les IDs des distracteurs déjà placés pour éviter les associations entre eux
    const placedDistractorTextIds = new Set();
    const placedDistractorImageIds = new Set();
    const placedDistractorCalculIds = new Set();
    const placedDistractorChiffreIds = new Set();
    
    // Suivre les CONTENUS déjà placés pour éviter les doublons visuels
    const usedTextContents = new Set();
    const usedImageContents = new Set();
    const usedCalculContents = new Set();
    const usedChiffreContents = new Set();
    
    // Ajouter les contenus de la paire correcte
    if (goodPairIds?.texteId) usedTextContents.add(textesById[goodPairIds.texteId]?.content);
    if (goodPairIds?.imageId) usedImageContents.add(imagesById[goodPairIds.imageId]?.url);
    if (goodPairIds?.calculId) usedCalculContents.add(calculsById[goodPairIds.calculId]?.content);
    if (goodPairIds?.chiffreId) usedChiffreContents.add(chiffresById[goodPairIds.chiffreId]?.content);
    
    // Compter les zones avec pairId avant remplissage
    const pairsBeforeFill = result.filter(z => z.pairId);
    logFn('info', '[ZoneGen] Before filling distractors', {
      zonesWithPairId: pairsBeforeFill.length,
      zones: pairsBeforeFill.map(z => ({ 
        id: z.id, 
        type: z.type, 
        pairId: z.pairId,
        content: String(z.content || z.label || '').substring(0, 30)
      }))
    });
    
    // Remplir le reste des zones en évitant les associations entre distracteurs
    for (const z of result) {
      const type = z.type || 'image';
      const hasValidContent = z.content && z.content !== null && String(z.content).trim() !== '';
      
      if (type === 'image' && !hasValidContent) {
        // Interdire les textes de la paire correcte ET les textes des distracteurs déjà placés
        const allForbiddenTextIds = new Set([...forbiddenTextIds, ...placedDistractorTextIds]);
        const imgId = pickImageDistractor(allForbiddenTextIds, usedImageContents);
        let url = '';
        if (imgId) {
          url = imagesById[imgId]?.url || '';
          used.image.add(imgId);
          placedDistractorImageIds.add(imgId);
          usedImageContents.add(url);
        } else {
          // FALLBACK: Prendre n'importe quelle image disponible non utilisée
          const availableImages = images.filter(img => 
            !usedImageContents.has(img.url) && 
            !used.image.has(img.id)
          );
          if (availableImages.length > 0) {
            const fallbackImg = choose(availableImages, rng);
            url = fallbackImg.url;
            used.image.add(fallbackImg.id);
            usedImageContents.add(url);
            logFn('info', '[ZoneGen] FALLBACK: Using any available image', {
              zoneId: z.id,
              imageId: fallbackImg.id,
              reason: 'No valid distractors found'
            });
          } else {
            // Dernière option: prendre la première image disponible même si déjà utilisée
            if (images.length > 0) {
              url = images[0].url;
              logFn('warn', '[ZoneGen] FALLBACK: Reusing first image (no unused images)', {
                zoneId: z.id
              });
            }
          }
        }
        z.content = encodedImageUrl(url); 
        z.pairId = '';
      } else if (type === 'texte' && !hasValidContent) {
        // Interdire les images de la paire correcte ET les images des distracteurs déjà placés
        const allForbiddenImageIds = new Set([...forbiddenImageIds, ...placedDistractorImageIds]);
        const tId = pickTexteDistractor(allForbiddenImageIds, usedTextContents);
        if (tId) {
          const content = textesById[tId]?.content || '';
          z.content = content; 
          z.label = content;
          z.pairId = '';
          used.texte.add(tId);
          placedDistractorTextIds.add(tId);
          usedTextContents.add(content);
        }
      } else if (type === 'calcul' && !hasValidContent) {
        // Interdire les chiffres de la paire correcte ET les chiffres des distracteurs déjà placés
        const allForbiddenChiffreIds = new Set([...forbiddenChiffreIds, ...placedDistractorChiffreIds]);
        const cId = pickCalculDistractor(allForbiddenChiffreIds, usedCalculContents, usedChiffreContents);
        let content = '';
        if (cId) {
          content = calculsById[cId]?.content || '';
          logFn('info', '[ZoneGen] Placing calcul distractor', {
            zoneId: z.id,
            calculId: cId,
            content,
            forbiddenChiffreIds: Array.from(allForbiddenChiffreIds),
            placedChiffresCount: placedDistractorChiffreIds.size,
            placedChiffreContents: Array.from(usedChiffreContents)
          });
          used.calcul.add(cId);
          placedDistractorCalculIds.add(cId);
          usedCalculContents.add(content);
        } else {
          // FALLBACK: Générer opération aléatoire si aucun distracteur trouvé
          let randomCalc;
          let attempts = 0;
          do {
            const a = Math.floor(rng() * 9) + 1; // 1-9
            const b = Math.floor(rng() * 9) + 1; // 1-9
            randomCalc = `${a} × ${b}`;
            attempts++;
          } while (usedCalculContents.has(randomCalc) && attempts < 100);
          content = randomCalc;
          logFn('info', '[ZoneGen] FALLBACK: Generating random calcul', {
            zoneId: z.id,
            randomContent: content,
            reason: 'No valid distractors found'
          });
          usedCalculContents.add(content);
        }
        z.content = content; 
        z.pairId = '';
      } else if (type === 'chiffre' && !hasValidContent) {
        // Interdire les calculs de la paire correcte ET les calculs des distracteurs déjà placés
        const allForbiddenCalculIds = new Set([...forbiddenCalculIds, ...placedDistractorCalculIds]);
        const nId = pickChiffreDistractor(allForbiddenCalculIds, usedChiffreContents, usedCalculContents);
        let content = '';
        if (nId) {
          content = chiffresById[nId]?.content || '';
          logFn('info', '[ZoneGen] Placing chiffre distractor', {
            zoneId: z.id,
            chiffreId: nId,
            content,
            forbiddenCalculIds: Array.from(allForbiddenCalculIds),
            placedCalculsCount: placedDistractorCalculIds.size,
            placedCalculContents: Array.from(usedCalculContents)
          });
          used.chiffre.add(nId);
          placedDistractorChiffreIds.add(nId);
          usedChiffreContents.add(content);
        } else {
          // FALLBACK: Générer nombre aléatoire si aucun distracteur trouvé
          let randomNum;
          let attempts = 0;
          do {
            randomNum = Math.floor(rng() * 50) + 1; // 1-50
            attempts++;
          } while (usedChiffreContents.has(String(randomNum)) && attempts < 100);
          content = String(randomNum);
          logFn('info', '[ZoneGen] FALLBACK: Generating random chiffre', {
            zoneId: z.id,
            randomContent: content,
            reason: 'No valid distractors found'
          });
          usedChiffreContents.add(content);
        }
        z.content = content; 
        z.label = content;
        z.pairId = '';
      }
    }
    
    // Compter les zones avec pairId après remplissage
    const pairsAfterFill = result.filter(z => z.pairId);
    logFn('info', '[ZoneGen] After filling distractors', {
      zonesWithPairId: pairsAfterFill.length,
      zones: pairsAfterFill.map(z => ({ 
        id: z.id, 
        type: z.type, 
        pairId: z.pairId,
        content: String(z.content || z.label || '').substring(0, 30)
      }))
    });
    
    // ===== SANITISATION: Garantir EXACTEMENT UNE paire valide =====
    // Collecter toutes les paires potentielles présentes
    const allPairs = [];
    
    // Paires Image-Texte (PAR CONTENU, pas seulement pairId)
    for (const z1 of result) {
      if (z1.type === 'image' && z1.content) {
        for (const z2 of result) {
          if (z2.type === 'texte' && z2.content) {
            // Vérifier si image et texte forment une paire valide dans associations.json
            const imageUrl = String(z1.content || '').replace(/^.*\/images\//, '').replace(/%20/g, ' ');
            const texteContent = String(z2.content || '').toLowerCase();
            
            // Chercher dans associations si cette image et ce texte sont liés
            let isPair = false;
            for (const [imgId, imgData] of Object.entries(imagesById)) {
              if (imgData.url && String(imgData.url).includes(imageUrl)) {
                const linkedTexteIds = imageToTextes.get(imgId) || new Set();
                for (const tId of linkedTexteIds) {
                  const linkedText = textesById[tId]?.content || '';
                  if (linkedText.toLowerCase() === texteContent) {
                    isPair = true;
                    break;
                  }
                }
              }
              if (isPair) break;
            }
            
            if (isPair) {
              const key = z1.pairId || `content-img-${z1.id}-txt-${z2.id}`;
              allPairs.push({ key, kind: 'IT', zones: [z1.id, z2.id], hasPairId: !!z1.pairId });
            }
          }
        }
      }
    }
    
    // Paires Calcul-Chiffre (PAR VALIDATION MATHÉMATIQUE, pas seulement pairId)
    for (const z1 of result) {
      if (z1.type === 'calcul' && z1.content) {
        for (const z2 of result) {
          if (z2.type === 'chiffre' && z2.content) {
            // Vérifier si calcul et chiffre forment une paire valide mathématiquement
            if (isValidMathPair(String(z1.content), String(z2.content))) {
              const key = z1.pairId || `content-calc-${z1.id}-num-${z2.id}`;
              allPairs.push({ key, kind: 'CC', zones: [z1.id, z2.id], hasPairId: !!z1.pairId });
            }
          }
        }
      }
    }
    
    console.log('[ServerZoneGen] Found pairs before sanitization:', allPairs.length, allPairs.map(p => p.key));
    logFn('info', '[ZoneGen] Pairs found before sanitization', {
      count: allPairs.length,
      pairs: allPairs.map(p => ({
        pairId: p.key,
        type: p.kind,
        zoneIds: p.zones
      }))
    });
    
    // Ne garder QUE la première paire trouvée, SUPPRIMER physiquement les zones formant les autres paires
    if (allPairs.length > 0) {
      const kept = allPairs[0];
      console.log('[ServerZoneGen] Keeping only pair:', kept.key, 'zones:', kept.zones);
      logFn('info', '[ZoneGen] Keeping only one pair', {
        keptPairKey: kept.key,
        keptZones: kept.zones,
        removedCount: allPairs.length - 1
      });
      
      // Collecter tous les zoneIds des paires en trop à SUPPRIMER PHYSIQUEMENT
      const zoneIdsToRemove = new Set();
      for (let i = 1; i < allPairs.length; i++) {
        for (const zoneId of allPairs[i].zones) {
          zoneIdsToRemove.add(zoneId);
        }
      }
      
      const removedZones = [];
      // FILTRER pour SUPPRIMER les zones formant paires en trop
      result = result.filter(z => {
        if (zoneIdsToRemove.has(z.id)) {
          console.log('[ServerZoneGen] 🗑️  SUPPRESSION zone paire en trop:', z.id, z.type, z.content, 'pairId:', z.pairId);
          removedZones.push({ zoneId: z.id, type: z.type, content: z.content, pairId: z.pairId });
          return false;  // ❌ SUPPRIMER cette zone
        }
        return true;  // ✅ GARDER cette zone
      });
      
      if (removedZones.length > 0) {
        console.log(`[ServerZoneGen] ✅ Sanitization: ${removedZones.length} zones SUPPRIMÉES pour garantir 1 seule paire visible`);
        logFn('info', '[ZoneGen] Removed zones forming extra pairs', {
          removedCount: removedZones.length,
          removedZones
        });
      }
      
      // ✅ CRITIQUE: ASSIGNER le pairId aux zones de la paire gardée
      for (const zone of result) {
        if (kept.zones.includes(zone.id)) {
          zone.pairId = kept.key;
          console.log('[ServerZoneGen] ✅ Assigné pairId:', kept.key, 'à zone:', zone.id, zone.type, zone.content);
        }
      }
    }
    
    // Log final: toutes les zones avec pairId
    const finalPairIds = result
      .filter(z => z.pairId)
      .map(z => ({ id: z.id, type: z.type, pairId: z.pairId, content: String(z.content || z.label || '').substring(0, 20) }));
    
    console.log('[ServerZoneGen] Generated zones:', result.length, 'with good pair:', goodPairIds?.pairId || 'NONE');
    logFn('info', '[ZoneGen] Final zones with pairId', {
      count: finalPairIds.length,
      zones: finalPairIds
    });
    
    // Increment deck round counter for logging (via monitoring pipeline)
    if (deckState) {
      deckState.roundCount = (deckState.roundCount || 0) + 1;
      const deckSizes = {
        round: deckState.roundCount,
        assocTI: (deckState.decks.assocTI || []).length,
        assocCC: (deckState.decks.assocCC || []).length,
        distImg: (deckState.decks.distImg || []).length,
        distTxt: (deckState.decks.distTxt || []).length,
        distCalc: (deckState.decks.distCalc || []).length,
        distNum: (deckState.decks.distNum || []).length,
      };
      console.log('[ServerZoneGen] Deck round', deckState.roundCount, '| Deck sizes:', deckSizes);
      logFn('info', '[ZoneGen] Deck anti-repetition status', deckSizes);
    }

    return {
      zones: result,
      goodPairIds: goodPairIds
    };
    
  } catch (error) {
    console.error('[ServerZoneGen] FATAL ERROR:', error);
    console.error('[ServerZoneGen] Stack:', error.stack);
    return [];
  }
}

module.exports = { generateRoundZones, createDeckState };
