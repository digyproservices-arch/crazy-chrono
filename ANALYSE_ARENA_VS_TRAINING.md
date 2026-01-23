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

## 📋 ANALYSE EN COURS...

### Phase 1: États/Refs ✅ (IDENTIFIÉS)
### Phase 2: useEffect (EN COURS)
### Phase 3: Handlers Socket (EN ATTENTE)
### Phase 4: Logique handleZoneClick (EN ATTENTE)
### Phase 5: Rendu UI (EN ATTENTE)
