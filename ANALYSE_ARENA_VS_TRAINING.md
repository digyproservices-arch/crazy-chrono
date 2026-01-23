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

## ⚠️ TIEBREAKER-START - DIFFÉRENCE MINEURE

### 9. training:tiebreaker-start - DIFFÉRENT mais ACCEPTABLE ⚠️
**Arena:** Supprime overlays + update direct (Carte.js ligne 1634-1675)
- `tieOverlay.remove()`
- `setCountdown(null)`
- Mise à jour localStorage
- PAS d'alert, flow automatique
**Training:** Utilise `alert()` + update zones (ligne 320-327)
- Alert bloquant avec message départage
- Update zones + timeLeft
**Impact:** UX légèrement différente (alert bloquant)
**DÉCISION:** ACCEPTABLE - alert() plus simple pour Training

## 🎨 ANIMATIONS CSS - À VÉRIFIER

### 10. Animations CSS Arena - POTENTIELLEMENT MANQUANTES
**Arena:** Utilise keyframes CSS (fadeIn, slideDown, slideUp, slideRight, scaleIn)
- Définies dans Carte.css ou inline
- Appliquées aux overlays podium
**Training:** Overlays DOM manuels (style inline uniquement)
**Impact:** Podium Training peut manquer animations fluides
**Action:** VÉRIFIER si animations nécessaires ou acceptable

## ✅ RÉSUMÉ CORRECTIONS APPLIQUÉES

### Commit 7917150 (23 jan 2026):
1. **wonPairsHistory** state + setWonPairsHistory dans handler
2. **validatedPairIds** state + ref + sync useEffect
3. **zonesByIdRef** Map + sync useEffect
4. Reset validatedPairIds dans training:round-new

### Commit 3825a07 (23 jan 2026):
5. **training:countdown** handler complet (3-2-1-GO overlay)
6. **Historique pédagogique UI** section scrollable droite
7. **historyExpanded** state pour collapse

### Commit 3fb367a (23 jan 2026):
8. **roundsPerSession** state + capture totalRounds
9. **Format Manche X/Y** au lieu de X seulement

## 📊 BILAN FINAL

**États/Refs ajoutés:** 5 (wonPairsHistory, validatedPairIds+Ref, zonesByIdRef, historyExpanded, roundsPerSession)
**Handlers ajoutés:** 1 (training:countdown)
**UI ajoutée:** 1 section (historique pédagogique)
**Logique corrigée:** 2 (validatedPairIds reset, format Manche)

**STATUT:** Training mode = ~95% identique Arena
**DIFFÉRENCES ACCEPTABLES:**
- Sons (MP3 vs AudioContext)
- Tiebreaker (alert vs flow auto)
- Animations CSS (inline vs keyframes)
