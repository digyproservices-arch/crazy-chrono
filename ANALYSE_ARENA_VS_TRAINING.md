# ANALYSE EXHAUSTIVE Arena vs Training

## ❌ ÉTATS/REFS MANQUANTS DANS TRAINING

### 1. wonPairsHistory - CRITIQUE ❌
**Arena:** `const [wonPairsHistory, setWonPairsHistory] = useState([]);` (ligne 1069)
**Training:** ABSENT
**Impact:** Historique pédagogique incomplet, pas de scrolling des paires
**Action:** AJOUTER wonPairsHistory + mettre à jour dans training:pair-validated

### 2. validatedPairIds + Ref - CRITIQUE ❌
**Arena:** 
```js
const [validatedPairIds, setValidatedPairIds] = useState(new Set());
const validatedPairIdsRef = useRef(new Set());
useEffect(() => { validatedPairIdsRef.current = validatedPairIds; }, [validatedPairIds]);
```
**Training:** ABSENT
**Impact:** Pas de tracking paires validées session
**Action:** AJOUTER validatedPairIds state + ref + useEffect sync

### 3. zonesByIdRef - CRITIQUE ❌
**Arena:** 
```js
const zonesByIdRef = useRef(new Map());
useEffect(() => {
  try {
    const m = new Map();
    for (const z of zones) {
      if (z && z.id) m.set(z.id, z);
    }
    zonesByIdRef.current = m;
  } catch {}
  return m;
}, [zones]);
```
**Training:** ABSENT
**Impact:** Impossible récupérer textes zones après reshuffle
**Action:** AJOUTER zonesByIdRef + useEffect pour sync Map

### 4. roomPlayersRef + scoresRef - À VÉRIFIER
**Arena:** 
```js
const roomPlayersRef = useRef([]);
const scoresRef = useRef([]);
```
**Training:** Utilise state players au lieu de refs
**Impact:** Potentiels stale closures dans handlers
**Action:** VÉRIFIER si nécessaire (players state semble OK pour Training)

## 📋 HANDLERS SOCKET - DIFFÉRENCES CRITIQUES

### 5. arena:countdown - MANQUANT ❌
**Arena:** Handler complet avec overlay DOM (lignes 1346-1377)
- Créer overlay fullscreen noir z-index:99999
- Afficher 3, 2, 1, GO! avec animations
- Retirer overlay égalité au count=3
- Retirer countdown après GO!
**Training:** ABSENT COMPLÈTEMENT
**Impact:** Pas de countdown visuel avant départage
**Action:** AJOUTER handler training:countdown EXACT Arena

### 6. arena:game-end - DIFFÉRENT ⚠️
**Arena:** Utilise `setArenaGameEndOverlay()` (ligne 1690)
- Overlay géré par state React
- Rendering professionnel avec animations
**Training:** Appelle fonction `showPodium()` custom (ligne 301)
- Overlay créé manuellement DOM
**Impact:** Potentiellement différent visuellement
**Action:** VÉRIFIER si showPodium() Training === overlay Arena

## 🔊 SONS - DIFFÉRENCE MAJEURE

### 7. Sons AudioContext vs MP3 - DIFFÉRENT ⚠️
**Arena:** Utilise Web Audio API (AudioContext) (Carte.js lignes 11-53)
- `playCorrectSound()`: Oscillateur sine 880Hz, gain 0.3, durée 250ms
- `playWrongSound()`: Oscillateur square 220Hz, gain 0.35, durée 350ms
- AudioContext partagé `__audioCtx` pour performance
**Training:** Utilise fichiers MP3 (lignes 687-700)
- `/sounds/correct.mp3`
- `/sounds/error.mp3`
**Impact:** Sons possiblement différents
**DÉCISION:** Garder Training avec MP3 (plus simple, sons perso possibles)
**Action:** AUCUNE - acceptable si user satisfait

## ❌ HISTORIQUE PÉDAGOGIQUE UI - MANQUANT CRITIQUE

### 8. wonPairsHistory UI - ABSENT ❌
**Arena:** Affichage scrollable historique (Carte.js lignes 5819-5849)
- Section "Historique" collapsible
- Liste scrollable avec `wonPairsHistory.map()`
- Affiche images miniatures pour type imgtxt
- Affiche calcExpr = calcResult pour type calcnum
- Couleur/bordure par joueur
- Badge "Égalité" si tie
**Training:** `wonPairsHistory` state existe MAIS AUCUN rendering ❌
**Impact:** Historique pédagogique invisible pour prof
**Action:** AJOUTER section historique UI dans Training

## 📋 ANALYSE EN COURS...

### Phase 1-3: États/Refs ✅ (3 états, countdown, validatedPairIds reset)
### Phase 4: Confetti ✅ (identique)
### Phase 5: Historique UI ❌ CRITIQUE (EN COURS - doit ajouter)
### Phase 6: Format Manche (EN ATTENTE)
### Phase 7: Podium style (EN ATTENTE)
