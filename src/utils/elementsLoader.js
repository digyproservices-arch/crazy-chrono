console.log('ELEMENTS LOADER CHARGE');
// Charge, mélange et attribue les éléments à des zones de la carte
// Utilisation : import { assignElementsToZones, fetchElements } from '../utils/elementsLoader';

// ===== Cache du référentiel botanique pour localisation =====
let _botanicalRefCache = null;
let _botanicalRefLoading = null;
async function loadBotanicalRef() {
  if (_botanicalRefCache) return _botanicalRefCache;
  if (_botanicalRefLoading) return _botanicalRefLoading;
  _botanicalRefLoading = (async () => {
    try {
      const res = await fetch((process.env.PUBLIC_URL || '') + '/data/references/botanical_reference.json');
      if (!res.ok) return null;
      const ref = await res.json();
      _botanicalRefCache = ref;
      return ref;
    } catch { return null; }
  })();
  const result = await _botanicalRefLoading;
  _botanicalRefLoading = null;
  return result;
}

function buildLocalizationMap(botanicalRef, playerZone) {
  if (!botanicalRef || !playerZone) return null;
  const plants = botanicalRef.plants || [];
  const map = new Map(); // originalName (lowercase) → localName
  for (const p of plants) {
    const regionEntry = (p.regions || []).find(r => r.key === playerZone);
    if (!regionEntry || !regionEntry.localName) continue;
    // Map each matchName to the localized name
    for (const mn of (p.matchNames || [])) {
      map.set(mn.toLowerCase(), regionEntry.localName);
    }
  }
  return map.size > 0 ? map : null;
}

function localizeText(text, locMap) {
  if (!locMap || !text) return text;
  const lower = text.toLowerCase().trim();
  const local = locMap.get(lower);
  return local || text;
}

// ===== Anti-Repetition Deck System =====
// Persists across rounds within a session. Each element type has its own "deck" (shuffled pool).
// Elements are drawn sequentially from the deck. When exhausted, the deck is refilled & reshuffled.
// This guarantees maximum variety: every element appears before any element repeats.
let _deckState = null;

export function resetElementDecks(sessionId) {
  _deckState = {
    sessionId: sessionId || Date.now(),
    decks: {},
    roundCount: 0,
  };
  console.log('[elementsLoader] Anti-repetition decks reset for session:', _deckState.sessionId);
}

function _ensureDeckState() {
  if (!_deckState) resetElementDecks();
}

// Draw one element from a named deck that passes filterFn.
// If the deck is empty or has no valid element, refill from allIds (shuffled) and retry.
function _drawFromDeck(deckName, allIds, rng, filterFn) {
  _ensureDeckState();
  if (!_deckState.decks[deckName]) _deckState.decks[deckName] = [];
  const deck = _deckState.decks[deckName];

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
  _deckState.decks[deckName] = fresh;

  for (let i = 0; i < _deckState.decks[deckName].length; i++) {
    if (filterFn(_deckState.decks[deckName][i])) {
      return _deckState.decks[deckName].splice(i, 1)[0];
    }
  }

  return undefined; // No valid element in entire pool
}

// Public API: draw from a named deck for use by Carte.js post-processing
// Uses the same anti-repetition deck state (session-scoped).
export function drawFromDeck(deckName, allIds, rng, filterFn) {
  return _drawFromDeck(deckName, allIds, rng, filterFn || (() => true));
}

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

export async function assignElementsToZones(zones, _elements, assocData, rng = Math.random, excludedPairIds = new Set()) {
  // Utiliser uniquement les éléments présents dans associations.json
  const data = assocData || {};

  // ===== Localisation botanique selon zone joueur =====
  let locMap = null;
  let playerZone = '';
  try {
    const zoneCfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
    playerZone = zoneCfg?.playerZone || localStorage.getItem('cc_player_zone') || '';
  } catch {}
  if (playerZone) {
    try {
      const ref = await loadBotanicalRef();
      locMap = buildLocalizationMap(ref, playerZone);
      if (locMap) console.log('[elementsLoader] Localisation botanique active pour zone:', playerZone, '(' + locMap.size + ' entrées)');
    } catch {}
  }
  let textes = Array.isArray(data.textes) ? data.textes : [];
  let images = Array.isArray(data.images) ? data.images : [];
  let calculs = Array.isArray(data.calculs) ? data.calculs : [];
  let chiffres = Array.isArray(data.chiffres) ? data.chiffres : [];
  let associations = Array.isArray(data.associations) ? data.associations : [];

  // Overrides utilisateur: texteId → nom local pour la zone joueur
  const userOverrides = new Map();
  if (playerZone) {
    const tById = new Map(textes.map(t => [t.id, t]));
    for (const a of associations) {
      if (a.localNameOverrides && a.localNameOverrides[playerZone] && a.texteId) {
        const textContent = (tById.get(a.texteId)?.content || '').toLowerCase().trim();
        if (textContent) userOverrides.set(textContent, a.localNameOverrides[playerZone]);
      }
    }
    if (userOverrides.size > 0) {
      // Fusionner dans locMap (overrides prioritaires)
      if (!locMap) locMap = new Map();
      for (const [k, v] of userOverrides) locMap.set(k, v);
      console.log('[elementsLoader] User overrides pour zone ' + playerZone + ':', userOverrides.size);
    }
  }

  // ===== Filtrage par SessionConfig (classes/thèmes) =====
  // Lecture configuration côté client (définie par SessionConfig)
  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
  const isObjectiveMode = !!(cfg && cfg.objectiveMode && Array.isArray(cfg.objectiveThemes) && cfg.objectiveThemes.length > 0);
  if (cfg && (Array.isArray(cfg.classes) || Array.isArray(cfg.themes) || isObjectiveMode)) {
    // En mode objectif: ignorer le filtre de niveau (classes), filtrer UNIQUEMENT par objectiveThemes
    const selectedClasses = isObjectiveMode ? null : (Array.isArray(cfg.classes) ? cfg.classes : null);
    const LEVEL_ORDER = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
    const lvlIdx = Object.fromEntries(LEVEL_ORDER.map((l, i) => [l, i]));
    const maxLvlIdx = selectedClasses ? Math.max(...selectedClasses.map(c => lvlIdx[c] ?? -1)) : 99;
    // En mode objectif thématique, filtrer par objectiveThemes pour que le plateau ne montre QUE les paires des objectifs
    const rawThemes = isObjectiveMode
      ? cfg.objectiveThemes
      : (Array.isArray(cfg.themes) ? cfg.themes : []);
    const selectedThemes = rawThemes.filter(Boolean);
    const matchMode = cfg.themeMatch === 'all' ? 'all' : 'any';
    // En mode objectif: pas d'éléments non taggés (on veut UNIQUEMENT les paires des tables choisies)
    const includeUntagged = isObjectiveMode ? false : (cfg.includeUntagged !== false);

    const hasClass = (el) => !selectedClasses || !el?.levelClass || (lvlIdx[el.levelClass] ?? 99) <= maxLvlIdx;
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

    // Re-inclure éléments référencés par associations survivantes mais filtrés à tort
    // (ex: image a themes=["botanique"] mais l'association a themes=["category:fruit","region:guadeloupe"])
    if (selectedThemes.length > 0) {
      const origTextes = Array.isArray(data.textes) ? data.textes : [];
      const origImages = Array.isArray(data.images) ? data.images : [];
      const origCalculs = Array.isArray(data.calculs) ? data.calculs : [];
      const origChiffres = Array.isArray(data.chiffres) ? data.chiffres : [];
      const assocImgIds = new Set(associations.filter(a => a.imageId).map(a => a.imageId));
      const assocTxtIds = new Set(associations.filter(a => a.texteId).map(a => a.texteId));
      const assocCalcIds = new Set(associations.filter(a => a.calculId).map(a => a.calculId));
      const assocNumIds = new Set(associations.filter(a => a.chiffreId).map(a => a.chiffreId));
      const existTxt = new Set(textes.map(t => t.id));
      const existImg = new Set(images.map(i => i.id));
      const existCalc = new Set(calculs.map(c => c.id));
      const existNum = new Set(chiffres.map(n => n.id));
      for (const t of origTextes) if (assocTxtIds.has(t.id) && !existTxt.has(t.id) && hasClass(t)) textes.push(t);
      for (const i of origImages) if (assocImgIds.has(i.id) && !existImg.has(i.id) && hasClass(i)) images.push(i);
      for (const c of origCalculs) if (assocCalcIds.has(c.id) && !existCalc.has(c.id) && hasClass(c)) calculs.push(c);
      for (const n of origChiffres) if (assocNumIds.has(n.id) && !existNum.has(n.id) && hasClass(n)) chiffres.push(n);
      console.log('[elementsLoader] Re-included elements from associations:', { textes: textes.length, images: images.length, calculs: calculs.length, chiffres: chiffres.length });
    }
  }

  // ===== Filtrage des paires déjà validées =====
  // Construire les pairIds pour chaque association et exclure celles déjà validées
  // Format: assoc-img-{imageId}-txt-{texteId} ou assoc-calc-{calculId}-num-{chiffreId}
  if (excludedPairIds && excludedPairIds.size > 0) {
    const buildPairId = (a) => {
      if (a.texteId && a.imageId) return `assoc-img-${a.imageId}-txt-${a.texteId}`;
      if (a.calculId && a.chiffreId) return `assoc-calc-${a.calculId}-num-${a.chiffreId}`;
      return null;
    };
    associations = associations.filter(a => {
      const pairId = buildPairId(a);
      return !pairId || !excludedPairIds.has(pairId);
    });
    console.log('[elementsLoader] Filtered out validated pairs:', excludedPairIds.size, 'remaining associations:', associations.length);
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

  // Place 1 paire correcte (using deck for variety across rounds)
  let goodPairIds = null; // {texteId,imageId} ou {calculId,chiffreId}
  if (placedPairType === 'TI') {
    // Build stable key map for TI associations
    const tiLinkMap = new Map();
    for (const [tId, imgSet] of texteToImages.entries()) {
      for (const imgId of imgSet) {
        tiLinkMap.set(`ti-${tId}-${imgId}`, { tId, imgId });
      }
    }
    const tiKeys = [...tiLinkMap.keys()];
    const chosenKey = _drawFromDeck('assocTI', tiKeys, rng, (key) => {
      const l = tiLinkMap.get(key);
      return l && imageIds.includes(l.imgId) && texteIds.includes(l.tId);
    });
    const chosen = chosenKey ? tiLinkMap.get(chosenKey) : null;
    if (chosen) {
      const pairKey = `assoc-img-${chosen.imgId}-txt-${chosen.tId}`;
      const rawText = textesById[chosen.tId]?.content || '';
      const tzId = placeIntoZone(texteZones, () => ({ type: 'texte', content: localizeText(rawText, locMap), pairId: pairKey }));
      const izId = placeIntoZone(imageZones, () => ({ type: 'image', content: encodedImageUrl(imagesById[chosen.imgId]?.url || ''), label: '', pairId: pairKey }));
      if (tzId && izId) {
        used.texte.add(chosen.tId); used.image.add(chosen.imgId);
        goodPairIds = { texteId: chosen.tId, imageId: chosen.imgId };
      }
    }
  } else if (placedPairType === 'CC') {
    // Build stable key map for CC associations
    const ccLinkMap = new Map();
    for (const [cId, nSet] of calculToChiffres.entries()) {
      for (const nId of nSet) {
        ccLinkMap.set(`cc-${cId}-${nId}`, { cId, nId });
      }
    }
    const ccKeys = [...ccLinkMap.keys()];
    const chosenKey = _drawFromDeck('assocCC', ccKeys, rng, (key) => {
      const l = ccLinkMap.get(key);
      return l && calculIds.includes(l.cId) && chiffreIds.includes(l.nId);
    });
    const chosen = chosenKey ? ccLinkMap.get(chosenKey) : null;
    if (chosen) {
      const pairKey = `assoc-calc-${chosen.cId}-num-${chosen.nId}`;
      const czId = placeIntoZone(calculZones, () => ({ type: 'calcul', content: calculsById[chosen.cId]?.content || '', pairId: pairKey }));
      const nzId = placeIntoZone(chiffreZones, () => ({ type: 'chiffre', content: chiffresById[chosen.nId]?.content || '', pairId: pairKey }));
      if (czId && nzId) {
        used.calcul.add(chosen.cId); used.chiffre.add(chosen.nId);
        goodPairIds = { calculId: chosen.cId, chiffreId: chosen.nId };
      }
    }
  }

  // Remplissage distracteurs via deck (anti-répétition inter-manches)
  const pickImageDistractor = (forbiddenTextIds) => {
    return _drawFromDeck('distImg', imageIds, rng, (imgId) =>
      !used.image.has(imgId) && (!forbiddenTextIds || !imageToTextes.get(imgId) || ![...imageToTextes.get(imgId)].some(t => forbiddenTextIds.has(t)))
    );
  };
  const pickTexteDistractor = (forbiddenImageIds) => {
    return _drawFromDeck('distTxt', texteIds, rng, (tId) =>
      !used.texte.has(tId) && (!forbiddenImageIds || !texteToImages.get(tId) || ![...texteToImages.get(tId)].some(i => forbiddenImageIds.has(i)))
    );
  };
  const pickCalculDistractor = (forbiddenChiffreIds) => {
    return _drawFromDeck('distCalc', calculIds, rng, (cId) =>
      !used.calcul.has(cId) && (!forbiddenChiffreIds || !calculToChiffres.get(cId) || ![...calculToChiffres.get(cId)].some(n => forbiddenChiffreIds.has(n)))
    );
  };
  const pickChiffreDistractor = (forbiddenCalculIds) => {
    return _drawFromDeck('distNum', chiffreIds, rng, (nId) =>
      !used.chiffre.has(nId) && (!forbiddenCalculIds || !chiffreToCalculs.get(nId) || ![...chiffreToCalculs.get(nId)].some(c => forbiddenCalculIds.has(c)))
    );
  };

  const forbiddenTextIds = new Set(goodPairIds?.texteId ? [goodPairIds.texteId] : []);
  const forbiddenImageIds = new Set(goodPairIds?.imageId ? [goodPairIds.imageId] : []);
  const forbiddenCalculIds = new Set(goodPairIds?.calculId ? [goodPairIds.calculId] : []);
  const forbiddenChiffreIds = new Set(goodPairIds?.chiffreId ? [goodPairIds.chiffreId] : []);

  // ===== ANTI-FAUSSE-PAIRE: tracking numérique des valeurs placées =====
  // Évalue le résultat d'un calcul (ex: "15 - 6" → 9, "6 × 9" → 54)
  const _evalCalc = (expr) => {
    if (!expr) return NaN;
    const raw = String(expr).trim();
    // Format textuel (le double/moitié/tiers/quart/triple de X)
    const tm = raw.match(/^l[ea]\s+(double|triple|tiers|quart|moiti[ée])\s+de\s+(.+)$/i);
    if (tm) {
      const k = tm[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const v = parseFloat(String(tm[2]).replace(/\s/g, '').replace(/,/g, '.'));
      if (!Number.isFinite(v)) return NaN;
      switch (k) { case 'double': return v*2; case 'triple': return v*3; case 'moitie': return v/2; case 'tiers': return v/3; case 'quart': return v/4; default: return NaN; }
    }
    // Format "A op ? = C"
    const norm = raw.replace(/×/g, '*').replace(/÷/g, '/').replace(/:/g, '/');
    const um = norm.match(/^(.+?)\s*([+\-*/])\s*\?\s*=\s*(.+)$/);
    if (um) {
      const a = parseFloat(um[1].replace(/\s/g, '').replace(/,/g, '.')), op = um[2], c = parseFloat(um[3].replace(/\s/g, '').replace(/,/g, '.'));
      if (!Number.isFinite(a) || !Number.isFinite(c)) return NaN;
      switch (op) { case '+': return c-a; case '-': return a-c; case '*': return a!==0?c/a:NaN; case '/': return c!==0?a/c:NaN; default: return NaN; }
    }
    // Format simple "A op B"
    const stripped = norm.replace(/\s/g, '').replace(/,/g, '.');
    const sm = stripped.match(/^(-?[\d.]+)([+\-*/])(-?[\d.]+)$/);
    if (sm) {
      const a = parseFloat(sm[1]), op = sm[2], b = parseFloat(sm[3]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
      switch (op) { case '+': return a+b; case '-': return a-b; case '*': return a*b; case '/': return b!==0?a/b:NaN; default: return NaN; }
    }
    return NaN;
  };
  const _round8 = (v) => Math.round(v * 1e8) / 1e8;
  const _parseNum = (s) => { const v = parseFloat(String(s).replace(/\s/g, '').replace(/,/g, '.')); return Number.isFinite(v) ? _round8(v) : NaN; };

  // Track numeric values of all placed calculs/chiffres (good pair + distractors)
  const placedCalcResults = new Set(); // numeric results of placed calcul zones
  const placedChiffreValues = new Set(); // numeric values of placed chiffre zones

  // Seed with good pair values if CC type
  if (goodPairIds?.calculId) {
    const r = _evalCalc(calculsById[goodPairIds.calculId]?.content);
    if (Number.isFinite(r)) placedCalcResults.add(_round8(r));
  }
  if (goodPairIds?.chiffreId) {
    const v = _parseNum(chiffresById[goodPairIds.chiffreId]?.content);
    if (Number.isFinite(v)) placedChiffreValues.add(v);
  }

  // Remplir le reste des zones (avec mise à jour dynamique des interdits)
  for (const z of result) {
    const type = z.type || 'image';
    if (type === 'image' && !z.content) {
      const imgId = pickImageDistractor(forbiddenTextIds);
      if (imgId) {
        z.content = encodedImageUrl(imagesById[imgId]?.url || ''); used.image.add(imgId); z.isDistractor = true;
        // Update forbidden: prevent associated textes from being placed
        const assocT = imageToTextes.get(imgId);
        if (assocT) assocT.forEach(tId => forbiddenTextIds.add(tId));
      }
    } else if (type === 'texte' && !z.content) {
      const tId = pickTexteDistractor(forbiddenImageIds);
      if (tId) {
        z.content = localizeText(textesById[tId]?.content || '', locMap); used.texte.add(tId); z.isDistractor = true;
        // Update forbidden: prevent associated images from being placed
        const assocI = texteToImages.get(tId);
        if (assocI) assocI.forEach(imgId => forbiddenImageIds.add(imgId));
      }
    } else if (type === 'calcul' && !z.content) {
      const cId = pickCalculDistractor(forbiddenChiffreIds);
      if (cId) {
        const calcContent = calculsById[cId]?.content || '';
        const calcResult = _evalCalc(calcContent);
        const calcResultRounded = Number.isFinite(calcResult) ? _round8(calcResult) : NaN;
        // VALUE CHECK: reject if result matches any already-placed chiffre value
        if (Number.isFinite(calcResultRounded) && placedChiffreValues.has(calcResultRounded)) {
          // This calcul would form a false pair — skip it, mark zone empty
          z.isDistractor = true; z.content = '';
          console.warn('[elementsLoader] Rejected distractor calcul "' + calcContent + '" (result=' + calcResultRounded + ') — matches placed chiffre');
        } else {
          z.content = calcContent; used.calcul.add(cId); z.isDistractor = true;
          if (Number.isFinite(calcResultRounded)) placedCalcResults.add(calcResultRounded);
          // Update forbidden: prevent associated chiffres from being placed
          const assocN = calculToChiffres.get(cId);
          if (assocN) assocN.forEach(nId => forbiddenChiffreIds.add(nId));
        }
      }
    } else if (type === 'chiffre' && !z.content) {
      const nId = pickChiffreDistractor(forbiddenCalculIds);
      if (nId) {
        const numContent = chiffresById[nId]?.content || '';
        const numValue = _parseNum(numContent);
        // VALUE CHECK: reject if value matches any already-placed calcul result
        if (Number.isFinite(numValue) && placedCalcResults.has(numValue)) {
          // This chiffre would form a false pair — skip it, mark zone empty
          z.isDistractor = true; z.content = '';
          console.warn('[elementsLoader] Rejected distractor chiffre "' + numContent + '" (value=' + numValue + ') — matches placed calcul result');
        } else {
          z.content = numContent; used.chiffre.add(nId); z.isDistractor = true;
          if (Number.isFinite(numValue)) placedChiffreValues.add(numValue);
          // Update forbidden: prevent associated calculs from being placed
          const assocC = chiffreToCalculs.get(nId);
          if (assocC) assocC.forEach(cId => forbiddenCalculIds.add(cId));
        }
      }
    }
  }

  // ===== SECOND PASS: fill any zones left empty by false-pair rejection =====
  for (const z of result) {
    const type = z.type || 'image';
    if (z.isDistractor && !z.content) {
      if (type === 'calcul') {
        const cId = _drawFromDeck('distCalc', calculIds, rng, (cId) => {
          if (used.calcul.has(cId)) return false;
          const r = _evalCalc(calculsById[cId]?.content);
          return !Number.isFinite(r) || !placedChiffreValues.has(_round8(r));
        });
        if (cId) {
          const calcContent = calculsById[cId]?.content || '';
          z.content = calcContent; used.calcul.add(cId);
          const r = _evalCalc(calcContent);
          if (Number.isFinite(r)) placedCalcResults.add(_round8(r));
        }
      } else if (type === 'chiffre') {
        const nId = _drawFromDeck('distNum', chiffreIds, rng, (nId) => {
          if (used.chiffre.has(nId)) return false;
          const v = _parseNum(chiffresById[nId]?.content);
          return !Number.isFinite(v) || !placedCalcResults.has(v);
        });
        if (nId) {
          const numContent = chiffresById[nId]?.content || '';
          z.content = numContent; used.chiffre.add(nId);
          const v = _parseNum(numContent);
          if (Number.isFinite(v)) placedChiffreValues.add(v);
        }
      }
    }
  }

  // Increment round counter for logging (via monitoring pipeline)
  if (_deckState) {
    _deckState.roundCount++;
    const deckSizes = {
      round: _deckState.roundCount,
      assocTI: (_deckState.decks.assocTI || []).length,
      assocCC: (_deckState.decks.assocCC || []).length,
      distImg: (_deckState.decks.distImg || []).length,
      distTxt: (_deckState.decks.distTxt || []).length,
      distCalc: (_deckState.decks.distCalc || []).length,
      distNum: (_deckState.decks.distNum || []).length,
    };
    console.log('[elementsLoader] Round', _deckState.roundCount, '| Deck sizes:', deckSizes);
    try { if (window && typeof window.ccAddDiag === 'function') window.ccAddDiag('deck:anti-repetition', deckSizes); } catch {}
  }

  return result;
}
