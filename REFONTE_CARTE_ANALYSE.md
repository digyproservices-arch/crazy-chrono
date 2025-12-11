# ANALYSE COMPLÈTE CARTE.JS → RÉUTILISATION POUR CRAZY ARENA

**Date**: 11 décembre 2025  
**Objectif**: Réutiliser le composant Carte.js (mode multijoueur) dans CrazyArenaGame.js pour éviter la duplication de code et garantir un rendu identique.

---

## 📊 STRUCTURE ACTUELLE DE CARTE.JS

### **Taille et complexité**
- **6109 lignes** de code
- **40+ états useState** différents
- Composant monolithique avec toute la logique métier intégrée

### **États principaux identifiés**

#### **Rendu de la carte**
```javascript
const [zones, setZones] = useState([]);                    // Zones de jeu
const [customTextSettings, setCustomTextSettings] = useState({});  // Styles texte personnalisés
const [selectedArcPoints, setSelectedArcPoints] = useState({});    // Points d'arc pour textes courbés
const [calcAngles, setCalcAngles] = useState({});          // Angles des calculs (CRITIQUE pour rotation)
const [hoveredZoneId, setHoveredZoneId] = useState(null);  // Zone survolée
```

#### **État du jeu (mode solo)**
```javascript
const [gameActive, setGameActive] = useState(false);
const [timeLeft, setTimeLeft] = useState(60);
const [score, setScore] = useState(0);
const [gameSelectedIds, setGameSelectedIds] = useState([]);
const [correctZoneId, setCorrectZoneId] = useState(null);
const [correctImageZoneId, setCorrectImageZoneId] = useState(null);
```

#### **État multijoueur (Socket.IO)**
```javascript
const [roomId, setRoomId] = useState('default');
const [playerName, setPlayerName] = useState('');
const [roomPlayers, setRoomPlayers] = useState([]);
const [roomScores, setRoomScores] = useState([]);
const socketRef = useRef(null);
const [socketConnected, setSocketConnected] = useState(false);
const [currentTargetPairKey, setCurrentTargetPairKey] = useState(null);
```

#### **UI et édition (mode admin)**
```javascript
const [fullScreen, setFullScreen] = useState(false);
const [editingZoneId, setEditingZoneId] = useState(null);
const [drawingMode, setDrawingMode] = useState(false);
const [diagOpen, setDiagOpen] = useState(false);
const [isAdminUI, setIsAdminUI] = useState(false);
```

---

## 🔍 FONCTIONS CRITIQUES POUR LE RENDU

### **Rendu des zones (lignes ~4700-5700)**

#### **Calcul de la bounding box**
```javascript
function getZoneBoundingBox(points) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return { 
    minX: Math.min(...xs), 
    maxX: Math.max(...xs), 
    minY: Math.min(...ys), 
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}
```

#### **Référence de taille pour chiffres (chiffreRefBase)**
```javascript
const chiffreRefBase = useMemo(() => {
  const bases = zones
    .filter(z => z?.type === 'chiffre')
    .map(z => {
      const bbox = getZoneBoundingBox(z.points);
      return Math.max(12, Math.min(bbox.width, bbox.height));
    });
  return bases.reduce((a, b) => a + b, 0) / bases.length;
}, [zones]);
```

#### **Rendu des textes courbés (textPath)**
```javascript
// Pour zones type='texte'
<textPath 
  href={`#arc-${zone.id}`}
  startOffset="50%"
  textAnchor="middle"
  style={{ fontSize: dynamicFontSize }}
>
  {zone.content}
</textPath>
```

#### **Rendu des calculs/chiffres (CENTRÉS + ROTATION)**
```javascript
// Pour zones type='calcul' ou 'chiffre'
const angle = calcAngles[zone.id] || zone.angle || 0;
const base = Math.max(12, Math.min(bbox.width, bbox.height));
const chiffreBaseMin = chiffreRefBase ? 0.95 * chiffreRefBase : base;
const effectiveBase = (zone.type === 'chiffre') ? Math.max(base, chiffreBaseMin) : base;
const fontSize = (zone.type === 'chiffre' ? 0.42 : 0.28) * effectiveBase;

<text
  x={cx}
  y={cy}
  transform={`rotate(${angle}, ${cx}, ${cy})`}
  fill="#456451"
  fontSize={fontSize}
  textAnchor="middle"
  alignmentBaseline="central"
>
  {zone.content}
</text>

// Soulignement pour chiffres
{zone.type === 'chiffre' && (
  <line
    x1={cx + offsetX - underlineW}
    y1={cy + underlineY}
    x2={cx + offsetX + underlineW}
    y2={cy + underlineY}
    stroke="#456451"
    strokeWidth={underlineThickness}
  />
)}
```

---

## 🎯 LOGIQUE DE GESTION DES CLICS

### **Fonction handleGameClick (ligne ~1989)**
```javascript
function handleGameClick(zone) {
  if (!gameActive || !zone) return;
  
  const zoneType = normType(zone.type);
  const clickedPairId = getPairId(zone);
  
  // Logique de validation de paire
  // Envoi Socket.IO si multijoueur
  // Feedback visuel (flashCorrect, flashWrong)
  // Incrémentation du score
  // Reshuffle automatique après validation
}
```

### **Événements Socket.IO multijoueur**
```javascript
socket.on('zones:assigned', ({ zones, seed, targetPairKey }) => {
  setZones(zones);
  setCurrentTargetPairKey(targetPairKey);
  // Invalider cache, réinitialiser sélections
});

socket.on('room:click', ({ playerId, zoneId, correct }) => {
  // Feedback visuel pour les clics des autres joueurs
  if (correct) {
    animateBubblesFromZones(zoneAId, zoneBId, playerColor);
  }
});

socket.on('room:scores', ({ scores }) => {
  setRoomScores(scores);
});
```

---

## ⚠️ DÉPENDANCES CRITIQUES

### **Gestion du state `calcAngles`**
- **Problème identifié**: `zones2.json` ne contient PAS les angles
- **Solution actuelle Carte.js**: État local `calcAngles` géré client-side
- **Stockage**: `localStorage.setItem('cc_calc_angles', JSON.stringify(calcAngles))`

### **Chargement des angles au démarrage**
```javascript
useEffect(() => {
  try {
    const saved = localStorage.getItem('cc_calc_angles');
    if (saved) {
      const parsed = JSON.parse(saved);
      setCalcAngles(parsed);
    }
  } catch {}
}, []);
```

### **Fonctions d'édition des angles (mode admin)**
```javascript
const handleRotate = (zoneId, delta) => {
  setCalcAngles(prev => {
    const current = prev[zoneId] || 0;
    const newAngle = (current + delta) % 360;
    const updated = { ...prev, [zoneId]: newAngle };
    localStorage.setItem('cc_calc_angles', JSON.stringify(updated));
    return updated;
  });
};
```

---

## 🚨 OBSTACLES À LA RÉUTILISATION

### **1. Monolithique et couplé**
- Toute la logique métier (solo, multi, admin) est dans un seul composant
- Impossible d'utiliser Carte.js tel quel sans embarquer 40+ états inutiles

### **2. État global partagé**
- Socket.IO instancié dans Carte.js
- Gestion des timers, scores, rounds intégrée
- Pas de séparation entre logique de rendu et logique métier

### **3. Dépendances localStorage**
- `cc_calc_angles` pour les rotations
- `cc_data_associations` pour le cache des données
- `cc_admin_ui` pour l'accès admin

### **4. Événements Socket.IO spécifiques**
- `zones:assigned`, `room:click`, `room:scores`
- Différents de ceux utilisés dans CrazyArenaGame.js
- (`arena:game-start`, `arena:click-zone`, `arena:scores-update`)

---

## 💡 STRATÉGIES POSSIBLES

### **Option A: Extraire la logique de rendu pure**
✅ **Avantages**:
- Composant réutilisable léger
- Pas de logique métier embarquée
- Props explicites

❌ **Inconvénients**:
- Duplication partielle du code de rendu
- Risque de bugs si extraction incomplète
- Maintenance de 2 versions du rendu

---

### **Option B: Rendre Carte.js configurable via props**
✅ **Avantages**:
- Un seul composant de rendu
- Maintenance centralisée
- Garantie de rendu identique

❌ **Inconvénients**:
- Complexité accrue de Carte.js
- Risque de régressions sur le mode multijoueur existant
- 40+ états à gérer conditionnellement

---

### **Option C: Créer un composant de rendu partagé (CarteRenderer)**
✅ **Avantages**:
- Logique de rendu pure extraite
- Réutilisable par Carte.js ET CrazyArenaGame.js
- Séparation claire rendu / logique métier

❌ **Inconvénients**:
- Refonte majeure de Carte.js
- Risque de casser le mode multijoueur existant
- Temps de développement important

---

## 🎯 RECOMMANDATION : OPTION A MODIFIÉE

### **Approche pragmatique**
Extraire **uniquement la fonction de rendu SVG** de Carte.js dans un nouveau composant `CarteRenderer.js`, puis l'utiliser dans les deux contextes.

### **Composant cible: CarteRenderer.js**
```javascript
export function CarteRenderer({
  zones = [],                    // Zones à afficher
  onZoneClick = null,            // Callback pour clics
  hoveredZoneId = null,          // Zone survolée (optionnel)
  correctZoneId = null,          // Zone correcte flashée (optionnel)
  wrongZoneIds = [],             // Zones incorrectes (optionnel)
  customTextSettings = {},       // Styles texte personnalisés (optionnel)
  selectedArcPoints = {},        // Points d'arc personnalisés (optionnel)
  calcAngles = {},               // Angles des calculs (CRITIQUE)
  readOnly = false,              // Mode lecture seule
  className = ''                 // Classes CSS additionnelles
}) {
  // Logique de rendu PURE (pas de Socket.IO, pas de timer, pas de score)
  // Copie EXACTE du code de rendu de Carte.js lignes 4700-5700
  
  return (
    <div className={`carte-renderer ${className}`}>
      <object data="/images/carte-svg.svg" type="image/svg+xml" />
      <svg viewBox="0 0 1000 1000">
        {/* Rendu des zones */}
      </svg>
    </div>
  );
}
```

### **Utilisation dans Carte.js**
```javascript
// Carte.js devient un wrapper avec toute la logique métier
export default function Carte() {
  // Tous les états existants (40+)
  const [zones, setZones] = useState([]);
  const [gameActive, setGameActive] = useState(false);
  // ... etc

  return (
    <div className="carte-container">
      <CarteRenderer
        zones={zones}
        onZoneClick={handleGameClick}
        hoveredZoneId={hoveredZoneId}
        correctZoneId={correctZoneId}
        calcAngles={calcAngles}
        customTextSettings={customTextSettings}
      />
      {/* UI: timer, scores, etc. */}
    </div>
  );
}
```

### **Utilisation dans CrazyArenaGame.js**
```javascript
export default function CrazyArenaGame() {
  const [zones, setZones] = useState([]);
  const [calcAngles, setCalcAngles] = useState({});

  // Charger angles depuis localStorage ou zones
  useEffect(() => {
    const saved = localStorage.getItem('cc_calc_angles');
    if (saved) setCalcAngles(JSON.parse(saved));
  }, []);

  const handleZoneClick = (zone) => {
    socketRef.current.emit('arena:click-zone', { 
      zoneId: zone.id,
      studentId: myStudentId 
    });
  };

  return (
    <div className="crazy-arena-game">
      <CarteRenderer
        zones={zones}
        onZoneClick={handleZoneClick}
        calcAngles={calcAngles}
      />
      {/* UI: timer, joueurs, etc. */}
    </div>
  );
}
```

---

## 📋 PLAN D'EXÉCUTION DÉTAILLÉ

### **Phase 1: Préparation (30 min)**
1. ✅ Créer backup de Carte.js et CrazyArenaGame.js
2. ✅ Créer nouveau fichier `src/components/CarteRenderer.js`
3. ✅ Créer branch Git `refactor/carte-renderer`

### **Phase 2: Extraction du rendu (1h)**
1. Copier la fonction de rendu SVG de Carte.js (lignes 4700-5700)
2. Identifier toutes les dépendances d'états
3. Remplacer par des props
4. Tester avec des données statiques

### **Phase 3: Intégration dans Carte.js (30 min)**
1. Importer CarteRenderer dans Carte.js
2. Remplacer le JSX de rendu par <CarteRenderer {...props} />
3. Tester mode multijoueur complet
4. Vérifier aucune régression visuelle

### **Phase 4: Intégration dans CrazyArenaGame.js (30 min)**
1. Importer CarteRenderer dans CrazyArenaGame.js
2. Charger calcAngles depuis localStorage
3. Adapter le handleZoneClick pour Socket.IO arena
4. Tester avec 4 joueurs

### **Phase 5: Tests et validation (30 min)**
1. Tester mode multijoueur classique
2. Tester mode Crazy Arena
3. Vérifier rendu IDENTIQUE (calculs inclinés, tailles uniformes)
4. Commit et push

---

## ⏱️ ESTIMATION TOTALE: 3 HEURES

**Risques identifiés**:
- Oubli de dépendance d'état → Tests rigoureux à chaque étape
- Régression mode multijoueur → Backup + tests avant merge
- Angles manquants → Charger depuis localStorage ET zones

**Validation de succès**:
- ✅ Mode multijoueur fonctionne sans changement visuel
- ✅ Crazy Arena affiche calculs inclinés correctement
- ✅ Tailles des chiffres uniformes (chiffreRefBase)
- ✅ Aucune régression de performance
