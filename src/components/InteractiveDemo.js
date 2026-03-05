import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { pointsToBezierPath } from './CarteUtils';

// ==========================================
// DÉMO ANIMÉE — Copie exacte du rendu Carte.js
// Vraie carte-svg.svg + vrais zones2.json + vraies images
// Texte courbé via textPath, calculs/chiffres rotés, couleurs identiques
// Bulles qui s'envolent (comme animateBubblesFromZones) + particules ✨⭐💫
// ==========================================

const CC = {
  teal: '#1AACBE',
  tealDark: '#148A9C',
  tealDeep: '#0D6A7A',
  yellow: '#F5A623',
  brown: '#4A3728',
  brownLt: '#6B5443',
  white: '#FFFFFF',
  green: '#10b981',
};

// ============ REAL ZONE DATA (zones2.json exact) ============
// Real zone IDs from zones2.json
const ZONES_RAW = [
  // 4 chiffre zones
  {"id":"1752568799658","type":"chiffre","points":[{"x":654.24,"y":0,"handleIn":{"x":604.24,"y":0},"handleOut":{"x":682.58,"y":32.14}},{"x":667.58,"y":56.67,"handleIn":{"x":669.24,"y":50.47},"handleOut":{"x":682.58,"y":97.14}},{"x":337.58,"y":52.14,"handleIn":{"x":464.24,"y":255.47},"handleOut":{"x":339.24,"y":40.47}},{"x":364.24,"y":0.47,"handleIn":{"x":340.91,"y":15.47},"handleOut":{"x":414.24,"y":0.47}}]},
  {"id":"1752569687819","type":"chiffre","points":[{"x":997.58,"y":652.29,"handleIn":{"x":939.24,"y":748.95},"handleOut":{"x":915.91,"y":703.5}},{"x":847.58,"y":498.5,"handleIn":{"x":857.58,"y":590.17},"handleOut":{"x":880.91,"y":330.17}},{"x":997.58,"y":353.5,"handleIn":{"x":980.91,"y":315.17},"handleOut":{"x":969.24,"y":295.17}}]},
  {"id":"1752569809115","type":"chiffre","points":[{"x":640.91,"y":998.04,"handleIn":{"x":592.58,"y":994.85},"handleOut":{"x":722.58,"y":948.04}},{"x":500.91,"y":841.52,"handleIn":{"x":595.91,"y":839.71},"handleOut":{"x":410.91,"y":839.71}},{"x":357.58,"y":998.04,"handleIn":{"x":290.91,"y":928.04},"handleOut":{"x":385.91,"y":944.85}}]},
  {"id":"1752569975013","type":"chiffre","points":[{"x":-0.76,"y":642.89,"handleIn":{"x":-40.76,"y":633.04},"handleOut":{"x":57.58,"y":714.56}},{"x":154.24,"y":502.89,"handleIn":{"x":157.58,"y":592.89},"handleOut":{"x":160.91,"y":421.23}},{"x":-0.76,"y":362.89,"handleIn":{"x":79.24,"y":276.23},"handleOut":{"x":85.91,"y":336.23}}]},
  // 4 texte zones (with arcPoints)
  {"id":"1752570164541","type":"texte","arcPoints":[4,5],"points":[{"x":482.58,"y":151.83,"handleIn":{"x":412.58,"y":161.67},"handleOut":{"x":512.58,"y":161.67}},{"x":447.58,"y":143.5,"handleIn":{"x":447.58,"y":143.5},"handleOut":{"x":315.91,"y":163.5}},{"x":145.91,"y":431.83,"handleIn":{"x":182.58,"y":251.83},"handleOut":{"x":165.91,"y":481.83}},{"x":159.24,"y":481.83,"handleIn":{"x":142.58,"y":471.83},"handleOut":{"x":160.91,"y":483.5}},{"x":232.58,"y":485.17,"handleIn":{"x":232.58,"y":480.17},"handleOut":{"x":239.24,"y":370.17}},{"x":484.24,"y":236.83,"handleIn":{"x":334.24,"y":243.5},"handleOut":{"x":515.91,"y":218.8}}]},
  {"id":"1752570391219","type":"texte","arcPoints":[5,4],"points":[{"x":524.24,"y":158.2,"handleIn":{"x":532.58,"y":177.73},"handleOut":{"x":525.91,"y":154.86}},{"x":565.91,"y":144.86,"handleIn":{"x":555.91,"y":143.2},"handleOut":{"x":715.91,"y":168.2}},{"x":857.58,"y":444.86,"handleIn":{"x":842.58,"y":309.86},"handleOut":{"x":862.58,"y":439.86}},{"x":847.58,"y":481.53,"handleIn":{"x":847.58,"y":476.53},"handleOut":{"x":845.91,"y":481.53}},{"x":764.24,"y":481.53,"handleIn":{"x":780.91,"y":484.86},"handleOut":{"x":755.91,"y":361.53}},{"x":525.91,"y":238.2,"handleIn":{"x":662.58,"y":251.53},"handleOut":{"x":582.58,"y":218.2}}]},
  {"id":"1752570607347","type":"texte","arcPoints":[5,4],"points":[{"x":840.91,"y":523.79,"handleIn":{"x":832.58,"y":525.32},"handleOut":{"x":857.58,"y":523.65}},{"x":854.24,"y":555.46,"handleIn":{"x":847.58,"y":551.98},"handleOut":{"x":849.24,"y":698.65}},{"x":565.91,"y":851.98,"handleIn":{"x":690.91,"y":845.32},"handleOut":{"x":557.58,"y":851.98}},{"x":524.24,"y":838.65,"handleIn":{"x":539.24,"y":851.98},"handleOut":{"x":522.58,"y":831.98}},{"x":520.91,"y":761.98,"handleIn":{"x":525.91,"y":771.98},"handleOut":{"x":625.91,"y":756.98}},{"x":760.91,"y":525.32,"handleIn":{"x":752.58,"y":668.65},"handleOut":{"x":820.91,"y":541.98}}]},
  {"id":"1752570866370","type":"texte","arcPoints":[5,4],"points":[{"x":484.24,"y":839.41,"handleIn":{"x":482.58,"y":841.07},"handleOut":{"x":480.91,"y":846.07}},{"x":434.24,"y":852.74,"handleIn":{"x":444.24,"y":851.07},"handleOut":{"x":285.91,"y":829.41}},{"x":145.91,"y":566.07,"handleIn":{"x":160.91,"y":697.74},"handleOut":{"x":144.24,"y":561.07}},{"x":155.91,"y":522.74,"handleIn":{"x":155.91,"y":524.41},"handleOut":{"x":159.24,"y":524.41}},{"x":235.91,"y":524.41,"handleIn":{"x":230.91,"y":521.07},"handleOut":{"x":240.91,"y":636.07}},{"x":482.58,"y":761.07,"handleIn":{"x":342.58,"y":761.07},"handleOut":{"x":474.24,"y":767.74}}]},
  // 4 image zones
  {"id":"1752571224092","type":"image","points":[{"x":997.58,"y":-1.2,"handleIn":{"x":747.58,"y":38.8},"handleOut":{"x":997.58,"y":3.8}},{"x":997.58,"y":343.8,"handleIn":{"x":997.58,"y":267.14},"handleOut":{"x":947.58,"y":320.47}},{"x":857.58,"y":443.8,"handleIn":{"x":914.24,"y":338.8},"handleOut":{"x":837.58,"y":278.8}},{"x":565.91,"y":145.47,"handleIn":{"x":677.58,"y":155.47},"handleOut":{"x":642.58,"y":113.8}},{"x":657.58,"y":0.47,"handleIn":{"x":697.58,"y":53.8},"handleOut":{"x":742.58,"y":113.8}}]},
  {"id":"1752571493404","type":"image","points":[{"x":365.91,"y":0.92,"handleIn":{"x":-9.09,"y":37.13},"handleOut":{"x":300.91,"y":40.92}},{"x":449.24,"y":140.92,"handleIn":{"x":375.91,"y":122.59},"handleOut":{"x":299.24,"y":159.26}},{"x":147.58,"y":435.92,"handleIn":{"x":160.91,"y":289.26},"handleOut":{"x":114.24,"y":334.26}},{"x":-0.76,"y":359.26,"handleIn":{"x":40.91,"y":312.59},"handleOut":{"x":4.24,"y":349.26}},{"x":-0.76,"y":-0.74,"handleIn":{"x":-0.76,"y":35.92},"handleOut":{"x":42.58,"y":220.92}}]},
  {"id":"1752571661490","type":"image","points":[{"x":997.58,"y":997.14,"handleIn":{"x":944.24,"y":892.14},"handleOut":{"x":997.58,"y":972.14}},{"x":997.58,"y":650.47,"handleIn":{"x":997.58,"y":663.8},"handleOut":{"x":955.91,"y":688.8}},{"x":857.58,"y":557.14,"handleIn":{"x":895.91,"y":663.8},"handleOut":{"x":825.91,"y":723.8}},{"x":557.58,"y":857.14,"handleIn":{"x":702.58,"y":833.8},"handleOut":{"x":647.58,"y":875.47}},{"x":640.91,"y":997.14,"handleIn":{"x":704.24,"y":972.14},"handleOut":{"x":865.91,"y":912.14}}]},
  {"id":"1752571830304","type":"image","points":[{"x":-0.76,"y":639.86,"handleIn":{"x":-4.09,"y":883.34},"handleOut":{"x":42.58,"y":704.86}},{"x":145.91,"y":559.86,"handleIn":{"x":110.91,"y":643.2},"handleOut":{"x":177.58,"y":741.53}},{"x":442.58,"y":856.53,"handleIn":{"x":299.24,"y":823.2},"handleOut":{"x":372.58,"y":876.53}},{"x":365.91,"y":998.2,"handleIn":{"x":290.91,"y":939.86},"handleOut":{"x":357.58,"y":996.53}},{"x":2.58,"y":998.2,"handleIn":{"x":19.24,"y":998.2},"handleOut":{"x":30.91,"y":988.2}}]},
  // 4 calcul zones
  {"id":"1752572018539","type":"calcul","points":[{"x":482.58,"y":320.17,"handleIn":{"x":482.58,"y":305.17},"handleOut":{"x":399.24,"y":333.5}},{"x":315.91,"y":485.17,"handleIn":{"x":329.24,"y":385.17},"handleOut":{"x":314.24,"y":483.5}},{"x":232.58,"y":483.5,"handleIn":{"x":232.58,"y":486.83},"handleOut":{"x":249.24,"y":356.83}},{"x":482.58,"y":235.17,"handleIn":{"x":337.58,"y":246.83},"handleOut":{"x":510.91,"y":248.5}}]},
  {"id":"1752572187590","type":"calcul","points":[{"x":524.24,"y":322.89,"handleIn":{"x":522.58,"y":314.56},"handleOut":{"x":614.24,"y":331.23}},{"x":682.58,"y":480.76,"handleIn":{"x":667.58,"y":397.89},"handleOut":{"x":684.24,"y":482.89}},{"x":765.91,"y":482.89,"handleIn":{"x":762.58,"y":482.89},"handleOut":{"x":750.91,"y":389.56}},{"x":524.24,"y":234.56,"handleIn":{"x":699.24,"y":257.89},"handleOut":{"x":682.58,"y":347.89}}]},
  {"id":"1752572384939","type":"calcul","points":[{"x":684.24,"y":519.1,"handleIn":{"x":674.24,"y":522.14},"handleOut":{"x":665.91,"y":642.14}},{"x":517.58,"y":689.1,"handleIn":{"x":575.91,"y":687.14},"handleOut":{"x":517.58,"y":702.14}},{"x":524.24,"y":762.14,"handleIn":{"x":524.24,"y":758.8},"handleOut":{"x":655.91,"y":753.8}},{"x":764.24,"y":522.14,"handleIn":{"x":750.91,"y":643.8},"handleOut":{"x":799.24,"y":550.47}}]},
  {"id":"1752572591501","type":"calcul","points":[{"x":234.24,"y":522.28,"handleIn":{"x":234.24,"y":517.74},"handleOut":{"x":240.91,"y":634.41}},{"x":480.91,"y":764.41,"handleIn":{"x":345.91,"y":762.74},"handleOut":{"x":482.58,"y":764.41}},{"x":482.58,"y":689.41,"handleIn":{"x":482.58,"y":686.07},"handleOut":{"x":440.91,"y":691.07}},{"x":319.24,"y":522.74,"handleIn":{"x":319.24,"y":637.74},"handleOut":{"x":357.58,"y":482.74}}]},
];

// Real calcAngles and mathOffsets from math_positions.json
const CALC_ANGLES = {
  "1752568799658": 0,
  "1752572187590": 45,
  "1752572018539": 315,
  "1752572591501": 45,
  "1752572384939": 315,
  "1752569687819": 270,
  "1752569975013": 90,
};
const MATH_OFFSETS = {
  "1752568799658": { x: 0, y: 58.33 },
  "1752572187590": { x: 1.67, y: -6.67 },
  "1752572018539": { x: -15, y: 1.67 },
  "1752572591501": { x: -11.67, y: 16.67 },
  "1752572384939": { x: 13.33, y: 21.67 },
  "1752569687819": { x: 0, y: 0 },
  "1752569975013": { x: 0, y: 0 },
};

// Zones that need arc flip (same as FLIP_TEXT_ARC_ZONE_IDS in Carte.js)
const FLIP_ARC_IDS = { "1752570164541": true, "1752570866370": true };

// Demo content assignment
const DEMO_CONTENT = {
  "1752568799658": { display: '60' },   // chiffre top
  "1752569687819": { display: '8' },    // chiffre right
  "1752569809115": { display: '4' },    // chiffre bottom
  "1752569975013": { display: '18' },   // chiffre left
  "1752571224092": { image: 'images/colibri.jpeg' },        // image top-right
  "1752571493404": { image: 'images/flamant-rose.jpeg' },   // image top-left
  "1752571661490": { image: 'images/dauphin.jpeg' },        // image bottom-right
  "1752571830304": { image: 'images/heron-vert.jpeg' },     // image bottom-left
  "1752570164541": { display: 'Héron vert' },     // texte top-left inner
  "1752570391219": { display: 'Dauphin' },        // texte top-right inner
  "1752570607347": { display: 'Grande aigrette' },// texte bottom-right inner
  "1752570866370": { display: 'Scolopendre' },    // texte bottom-left inner
  "1752572018539": { display: '10 × 10' },  // calcul top-left
  "1752572187590": { display: '146 ÷ 2' },  // calcul top-right
  "1752572384939": { display: '32 = ?/10' }, // calcul bottom-right
  "1752572591501": { display: '60 − 35' },  // calcul bottom-left
};

// ============ ARC PATH FUNCTIONS (exact copy from Carte.js) ============
function interpolateArc(points, idxStart, idxEnd, marginPx) {
  if (!points || points.length < 2) return { newStart:{x:0,y:0}, newEnd:{x:1,y:1}, r:1, centerX:0.5, centerY:0.5, largeArcFlag:0, sweepFlag:1, arcLen:1, delta:0.01 };
  if (idxStart >= points.length || !points[idxStart]) idxStart = 0;
  if (idxEnd >= points.length || !points[idxEnd]) idxEnd = Math.min(1, points.length - 1);
  const start = points[idxStart];
  const end = points[idxEnd];
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = (Math.hypot(start.x - centerX, start.y - centerY) + Math.hypot(end.x - centerX, end.y - centerY)) / 2;
  const angleStart = Math.atan2(start.y - centerY, start.x - centerX);
  const angleEnd = Math.atan2(end.y - centerY, end.x - centerX);
  let delta = angleEnd - angleStart;
  if (delta < 0) delta += 2 * Math.PI;
  const arcLen = r * delta;
  const marginAngle = marginPx / r;
  const newAngleStart = angleStart + marginAngle;
  const newAngleEnd = angleEnd - marginAngle;
  const newStart = { x: centerX + r * Math.cos(newAngleStart), y: centerY + r * Math.sin(newAngleStart) };
  const newEnd = { x: centerX + r * Math.cos(newAngleEnd), y: centerY + r * Math.sin(newAngleEnd) };
  return { newStart, newEnd, r, centerX, centerY, largeArcFlag: 0, sweepFlag: 1, arcLen, delta };
}

function getArcPathFromZonePoints(points, zoneId, arcPointsFromZone, marginPx = 0, autoFlip = false) {
  if (!points || points.length < 2) return '';
  let idxStart, idxEnd;
  if (Array.isArray(arcPointsFromZone) && arcPointsFromZone.length === 2) {
    idxStart = arcPointsFromZone[0];
    idxEnd = arcPointsFromZone[1];
  } else {
    idxStart = 0;
    idxEnd = 1;
  }
  const { newStart, newEnd, r, centerX, centerY, largeArcFlag, sweepFlag } = interpolateArc(points, idxStart, idxEnd, marginPx);
  if (autoFlip) {
    const startAngle = Math.atan2(newStart.y - centerY, newStart.x - centerX);
    const endAngle = Math.atan2(newEnd.y - centerY, newEnd.x - centerX);
    let arcDelta = endAngle - startAngle;
    if (arcDelta < 0) arcDelta += 2 * Math.PI;
    const midAngle = startAngle + arcDelta / 2;
    const normMid = ((midAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (normMid > 0.05 && normMid < Math.PI - 0.05) {
      return `M ${newEnd.x},${newEnd.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag === 1 ? 0 : 1} ${newStart.x},${newStart.y}`;
    }
  }
  return `M ${newStart.x},${newStart.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag} ${newEnd.x},${newEnd.y}`;
}

function getZoneBoundingBox(points) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function getZoneCenter(points) {
  const b = getZoneBoundingBox(points);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

// ============ DEMO SCENARIOS ============
const SCENARIOS = [
  {
    pairA: '1752571661490', // dauphin image (bottom-right)
    pairB: '1752570391219', // "Dauphin" text (top-right inner)
    tooltips: [
      { text: '👀 Observe la carte...', time: 0 },
      { text: '🐬 Je reconnais un Dauphin !', time: 2000 },
      { text: '📝 Son nom est ici : « Dauphin »', time: 4200 },
      { text: '✨ Bravo ! La paire s\'envole !', time: 6400 },
    ],
  },
  {
    pairA: '1752571830304', // héron vert image (bottom-left)
    pairB: '1752570164541', // "Héron vert" text (top-left inner)
    tooltips: [
      { text: '👀 Nouvelle manche !', time: 0 },
      { text: '🦅 Un Héron vert en bas à gauche !', time: 2000 },
      { text: '📝 Et voilà son nom en haut !', time: 4200 },
      { text: '✨ Parfait ! Ça s\'envole !', time: 6400 },
    ],
  },
  {
    pairA: '1752572018539', // calcul "10 × 10" (top-left inner)
    pairB: '1752568799658', // chiffre top petal
    contentOverrides: {
      '1752568799658': { display: '100' },
    },
    tooltips: [
      { text: '👀 Dernière manche !', time: 0 },
      { text: '🔢 Je vois le calcul : 10 × 10', time: 2000 },
      { text: '🎯 Son résultat est 100 !', time: 4200 },
      { text: '✨ Bravo ! Les étoiles célèbrent !', time: 6400 },
    ],
  },
];

const SCENE_DURATION = 9500;
const T = {
  CURSOR_TO_A: 2000,
  CLICK_A:     3200,
  CURSOR_TO_B: 4200,
  CLICK_B:     5400,
  MATCH:       5800,
  FLY_AWAY:    6400,
  PAUSE:       8500,
};

// ============ COMPONENT ============
export default function InteractiveDemo() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [bubbles, setBubbles] = useState([]); // flying bubbles
  const animRef = useRef(null);
  const startRef = useRef(null);
  const containerRef = useRef(null);

  const scene = SCENARIOS[sceneIdx % SCENARIOS.length];

  const getContent = useCallback((zoneId) => {
    const override = scene.contentOverrides?.[zoneId];
    if (override) return { ...DEMO_CONTENT[zoneId], ...override };
    return DEMO_CONTENT[zoneId] || {};
  }, [scene]);

  // chiffreRefBase (same logic as Carte.js)
  const chiffreRefBase = useMemo(() => {
    const bases = ZONES_RAW.filter(z => z.type === 'chiffre').map(z => {
      const b = getZoneBoundingBox(z.points);
      return Math.max(12, Math.min(b.width, b.height));
    });
    if (!bases.length) return null;
    return bases.reduce((a, b) => a + b, 0) / bases.length;
  }, []);

  // Animation loop
  const tick = useCallback((timestamp) => {
    if (!startRef.current) startRef.current = timestamp;
    const dt = timestamp - startRef.current;
    setElapsed(dt);
    if (dt >= SCENE_DURATION) {
      startRef.current = null;
      setBubbles([]);
      setSceneIdx(prev => (prev + 1) % SCENARIOS.length);
    }
    animRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [tick]);

  // Spawn bubbles when match happens
  const bubblesSpawnedRef = useRef(false);
  useEffect(() => {
    if (elapsed >= T.FLY_AWAY && !bubblesSpawnedRef.current) {
      bubblesSpawnedRef.current = true;
      const zA = ZONES_RAW.find(z => z.id === scene.pairA);
      const zB = ZONES_RAW.find(z => z.id === scene.pairB);
      const cA = zA ? getZoneCenter(zA.points) : { x: 500, y: 500 };
      const cB = zB ? getZoneCenter(zB.points) : { x: 500, y: 500 };
      const contentA = getContent(scene.pairA);
      const contentB = getContent(scene.pairB);
      setBubbles([
        { id: 'bA', sx: cA.x, sy: cA.y, content: contentA, type: zA?.type, startTime: T.FLY_AWAY },
        { id: 'bB', sx: cB.x, sy: cB.y, content: contentB, type: zB?.type, startTime: T.FLY_AWAY + 80 },
      ]);
    }
    if (elapsed < T.FLY_AWAY) {
      bubblesSpawnedRef.current = false;
    }
  }, [elapsed, scene, getContent]);

  // Helpers
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const zoneA = ZONES_RAW.find(z => z.id === scene.pairA);
  const zoneB = ZONES_RAW.find(z => z.id === scene.pairB);
  const centerA = zoneA ? getZoneCenter(zoneA.points) : { x: 500, y: 500 };
  const centerB = zoneB ? getZoneCenter(zoneB.points) : { x: 500, y: 500 };

  const getCursorPos = () => {
    const rest = { x: 500, y: 600 };
    if (elapsed >= T.CURSOR_TO_A && elapsed < T.CLICK_A) {
      const p = easeInOut(Math.min(1, (elapsed - T.CURSOR_TO_A) / (T.CLICK_A - T.CURSOR_TO_A)));
      return { x: rest.x + (centerA.x - rest.x) * p, y: rest.y + (centerA.y - rest.y) * p };
    }
    if (elapsed >= T.CLICK_A && elapsed < T.CURSOR_TO_B) return centerA;
    if (elapsed >= T.CURSOR_TO_B && elapsed < T.CLICK_B) {
      const p = easeInOut(Math.min(1, (elapsed - T.CURSOR_TO_B) / (T.CLICK_B - T.CURSOR_TO_B)));
      return { x: centerA.x + (centerB.x - centerA.x) * p, y: centerA.y + (centerB.y - centerA.y) * p };
    }
    if (elapsed >= T.CLICK_B && elapsed < T.FLY_AWAY) return centerB;
    return rest;
  };

  const getZoneState = (zone) => {
    const isA = zone.id === scene.pairA;
    const isB = zone.id === scene.pairB;
    if ((isA || isB) && elapsed >= T.MATCH) return { selected: false, matched: true };
    if (isB && elapsed >= T.CLICK_B) return { selected: true, matched: false };
    if (isA && elapsed >= T.CLICK_A) return { selected: true, matched: false };
    return { selected: false, matched: false };
  };

  const getTooltip = () => {
    let active = null;
    for (const tt of scene.tooltips) { if (elapsed >= tt.time) active = tt; }
    return active;
  };

  // Particles
  const getParticles = () => {
    if (elapsed < T.FLY_AWAY || elapsed > T.FLY_AWAY + 1800) return [];
    const progress = (elapsed - T.FLY_AWAY) / 1800;
    const particles = [];
    const emojis = ['✨', '⭐', '💫', '🌟', '✨', '⭐', '💫', '🌟'];
    [centerA, centerB].forEach((pos, zi) => {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + zi * 0.5;
        const dist = progress * 120;
        const opacity = Math.max(0, 1 - progress * 1.3);
        particles.push({
          key: `${zi}-${i}`,
          x: pos.x + Math.cos(angle) * dist,
          y: pos.y + Math.sin(angle) * dist - progress * 60,
          opacity, emoji: emojis[i], scale: 1.2 - progress * 0.7,
        });
      }
    });
    return particles;
  };

  const cursorPos = getCursorPos();
  const tooltip = getTooltip();
  const particles = getParticles();
  const isClicking = (elapsed >= T.CLICK_A && elapsed < T.CLICK_A + 250) || (elapsed >= T.CLICK_B && elapsed < T.CLICK_B + 250);

  const svgPath = `${process.env.PUBLIC_URL}/images/carte-svg.svg`;

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      position: 'relative', userSelect: 'none', maxWidth: 560, margin: '0 auto',
    }}>
      {/* Tooltip bubble */}
      <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {tooltip && (
          <div key={tooltip.text} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: CC.white, borderRadius: 16, padding: '10px 22px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1), 0 0 0 2px rgba(26,172,190,0.15)',
            fontSize: 15, fontWeight: 700, color: CC.tealDeep,
            animation: 'demoBubbleIn 0.4s ease-out', maxWidth: 400, textAlign: 'center',
          }}>
            {tooltip.text}
          </div>
        )}
      </div>

      {/* Card container */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 500,
        aspectRatio: '1 / 1', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(13,106,122,0.3)', background: CC.teal,
      }}>
        {/* Real SVG card background */}
        <object type="image/svg+xml" data={svgPath} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 0,
        }} aria-label="Carte du jeu Crazy Chrono">Carte SVG</object>

        {/* SVG overlay — viewBox 1000x1000 like real game */}
        <svg viewBox="0 0 1000 1000" style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 2,
        }}>
          <defs>
            {/* ClipPaths for image zones */}
            {ZONES_RAW.filter(z => z.type === 'image').map(zone => (
              <clipPath id={`demo-clip-${zone.id}`} key={`clip-${zone.id}`} clipPathUnits="userSpaceOnUse">
                <path d={pointsToBezierPath(zone.points)} />
              </clipPath>
            ))}
            {/* Arc paths for texte zones (curved text) — with autoFlip like the real game */}
            {ZONES_RAW.filter(z => z.type === 'texte').map(zone => (
              <path
                id={`demo-textcurve-${zone.id}`}
                key={`tc-${zone.id}`}
                d={getArcPathFromZonePoints(zone.points, zone.id, zone.arcPoints, 0, true)}
                fill="none"
              />
            ))}
            {/* Selection glow filters */}
            <filter id="demo-glow-sel" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="8" result="b" />
              <feFlood floodColor="#F5A623" floodOpacity="0.6" result="c" />
              <feComposite in="c" in2="b" operator="in" result="g" />
              <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="demo-glow-match" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="12" result="b" />
              <feFlood floodColor="#10b981" floodOpacity="0.7" result="c" />
              <feComposite in="c" in2="b" operator="in" result="g" />
              <feMerge><feMergeNode in="g" /><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {/* Bubble glow filter — matches real game boxShadow */}
            <filter id="demo-bubble-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur2" />
              <feMerge>
                <feMergeNode in="blur1" />
                <feMergeNode in="blur2" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Render each zone — exact same structure as Carte.js */}
          {ZONES_RAW.map(zone => {
            const state = getZoneState(zone);
            const content = getContent(zone.id);
            const bbox = getZoneBoundingBox(zone.points);
            const path = pointsToBezierPath(zone.points);

            // Selection/match filter
            let filter = 'none';
            if (state.selected) filter = 'url(#demo-glow-sel)';
            if (state.matched) filter = 'url(#demo-glow-match)';

            // Matched zones fade out (bubbles take over)
            let opacity = 1;
            if (state.matched && elapsed >= T.FLY_AWAY) {
              const p = Math.min(1, (elapsed - T.FLY_AWAY) / 600);
              opacity = Math.max(0, 1 - p);
            }

            return (
              <g key={zone.id} filter={filter} opacity={opacity}>
                {/* IMAGE zones — image clipped to zone shape */}
                {zone.type === 'image' && content.image && (
                  <image
                    href={`${process.env.PUBLIC_URL}/${content.image}`}
                    x={bbox.x} y={bbox.y} width={bbox.width} height={bbox.height}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#demo-clip-${zone.id})`}
                  />
                )}

                {/* Zone path fill for selection/match highlight */}
                <path d={path} fill={(() => {
                  if (zone.type === 'image') {
                    if (state.selected) return 'rgba(255, 214, 0, 0.55)';
                    if (state.matched) return 'rgba(40, 167, 69, 0.55)';
                    return 'transparent';
                  }
                  if (state.selected) return 'rgba(40, 167, 69, 0.55)';
                  if (state.matched) return 'rgba(40, 167, 69, 0.55)';
                  return 'transparent';
                })()} stroke="none" />

                {/* TEXTE zones — curved text along arc (exactly like Carte.js) */}
                {zone.type === 'texte' && content.display && (() => {
                  const idxStart = zone.arcPoints?.[0] ?? 0;
                  const idxEnd = zone.arcPoints?.[1] ?? 1;
                  const pts = zone.points;
                  const { r, delta } = interpolateArc(pts, idxStart, idxEnd, 0);
                  const arcLen = r * delta;
                  const baseFontSize = 32;
                  const textLen = content.display.length * baseFontSize * 0.6;
                  const marginPx = 24;
                  const fontSize = textLen > arcLen - 2 * marginPx
                    ? Math.max(12, (arcLen - 2 * marginPx) / (content.display.length * 0.6))
                    : baseFontSize;
                  return (
                    <text
                      fontSize={fontSize}
                      fontFamily="Arial"
                      fill="#fff"
                      fontWeight="bold"
                    >
                      <textPath
                        xlinkHref={`#demo-textcurve-${zone.id}`}
                        startOffset="50%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {content.display}
                      </textPath>
                    </text>
                  );
                })()}

                {/* CALCUL and CHIFFRE zones — centered rotated text (exactly like Carte.js) */}
                {(zone.type === 'calcul' || zone.type === 'chiffre') && content.display && (() => {
                  const cx = bbox.x + bbox.width / 2;
                  const cy = bbox.y + bbox.height / 2;
                  const base = Math.max(12, Math.min(bbox.width, bbox.height));
                  const chiffreBaseMin = chiffreRefBase ? 0.95 * chiffreRefBase : base;
                  const effectiveBase = zone.type === 'chiffre' ? Math.max(base, chiffreBaseMin) : base;
                  const rawFontSize = (zone.type === 'chiffre' ? 0.42 : 0.38) * effectiveBase;
                  const contentStr = content.display;
                  const charW = 0.52;
                  const fitW = contentStr.length > 0 ? (bbox.width * 0.92) / (contentStr.length * charW) : rawFontSize;
                  const fitH = bbox.height * 0.75;
                  const fontSize = Math.max(10, Math.min(rawFontSize, fitW, fitH));
                  const angle = CALC_ANGLES[zone.id] || 0;
                  const mo = MATH_OFFSETS[zone.id] || { x: 0, y: 0 };
                  const isSix = zone.type === 'chiffre' && contentStr === '6';
                  const offsetX = isSix ? (-0.04 * fontSize) : 0;
                  const isChiffre = zone.type === 'chiffre';
                  return (
                    <g transform={`translate(${mo.x || 0} ${mo.y || 0}) rotate(${angle} ${cx} ${cy})`}>
                      <text
                        x={cx} y={cy}
                        transform={offsetX ? `translate(${offsetX} 0)` : undefined}
                        textAnchor="middle"
                        alignmentBaseline="middle"
                        fontSize={fontSize}
                        fill="#456451"
                        fontWeight="bold"
                        stroke="none"
                        paintOrder="stroke"
                      >
                        {contentStr}
                      </text>
                      {isChiffre && (() => {
                        const underLen = 0.5 * fontSize;
                        const half = underLen / 2;
                        const uy = cy + 0.54 * fontSize;
                        const strokeW = Math.max(1, 0.09 * fontSize);
                        const cxAdj = cx + (offsetX || 0);
                        return (
                          <line
                            x1={cxAdj - half} y1={uy} x2={cxAdj + half} y2={uy}
                            stroke="#456451" strokeWidth={strokeW} strokeLinecap="round"
                          />
                        );
                      })()}
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* Flying bubbles — exact match with animateBubblesFromZones (Carte.js) */}
          {/* BUBBLE_MAIN_SIZE=110px → 220 SVG units in 1000×1000 viewBox at 500px display */}
          {bubbles.map(bubble => {
            const dt = elapsed - bubble.startTime;
            if (dt < 0) return null;
            const dur = 2600; // shorter than real 5200ms but proportional for demo
            const p = Math.min(1, dt / dur);
            if (p >= 1) return null;
            // Fly toward top-center (simulating vignette target)
            const tx = 500, ty = 60;
            const dx = tx - bubble.sx;
            const dy = ty - bubble.sy;
            const dist = Math.hypot(dx, dy) || 1;
            const perpX = -dy / dist;
            const perpY = dx / dist;
            const curve = 120; // same curve amplitude as real game (scaled to SVG)
            // Cubic-bezier-like curve matching Carte.js: 0.33 and 0.66 waypoints
            let bx, by;
            if (p < 0.35) {
              const t = p / 0.35;
              bx = bubble.sx + dx * 0.33 * t + perpX * curve * t;
              by = bubble.sy + dy * 0.33 * t + perpY * curve * t;
            } else if (p < 0.7) {
              const t = (p - 0.35) / 0.35;
              bx = bubble.sx + dx * 0.33 + (dx * 0.33) * t + perpX * curve * (1 - t);
              by = bubble.sy + dy * 0.33 + (dy * 0.33) * t + perpY * curve * (1 - t) * -1;
            } else {
              const t = (p - 0.7) / 0.3;
              bx = bubble.sx + dx * 0.66 + (dx * 0.34) * t;
              by = bubble.sy + dy * 0.66 + (dy * 0.34) * t;
            }
            // Scale: 0.9 → 1.02 → 1.08 → 1.22 (matching real game keyframes)
            let scale;
            if (p < 0.35) scale = 0.9 + 0.12 * (p / 0.35);
            else if (p < 0.7) scale = 1.02 + 0.06 * ((p - 0.35) / 0.35);
            else scale = 1.08 + 0.14 * ((p - 0.7) / 0.3);
            // Opacity: 0.98 → stays high → fades to 0 at end
            const bOpacity = p < 0.7 ? 0.98 - p * 0.04 : Math.max(0, (1 - p) / 0.3 * 0.94);
            const bSize = 220 * scale; // 220 SVG units = 110px at 500px display
            const isImage = bubble.type === 'image';
            const bubbleColor = '#3b82f6';
            const borderWidth = 4; // 2px real → 4 SVG units
            return (
              <g key={bubble.id} opacity={bOpacity} filter="url(#demo-bubble-glow)">
                {/* Background circle with border */}
                <circle cx={bx} cy={by} r={bSize / 2}
                  fill={bubbleColor}
                  stroke="#ffffff" strokeWidth={borderWidth}
                />
                {/* Image content */}
                {isImage && bubble.content.image && (
                  <g>
                    <clipPath id={`demo-bclip-${bubble.id}`}>
                      <circle cx={bx} cy={by} r={bSize / 2 - borderWidth} />
                    </clipPath>
                    <image
                      href={`${process.env.PUBLIC_URL}/${bubble.content.image}`}
                      x={bx - bSize / 2 + borderWidth} y={by - bSize / 2 + borderWidth}
                      width={bSize - borderWidth * 2} height={bSize - borderWidth * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#demo-bclip-${bubble.id})`}
                    />
                  </g>
                )}
                {/* Text content */}
                {!isImage && bubble.content.display && (
                  <text x={bx} y={by} textAnchor="middle" dominantBaseline="central"
                    fill="#fff" fontSize={Math.max(22, bSize * 0.26)} fontWeight="bold">
                    {bubble.content.display}
                  </text>
                )}
              </g>
            );
          })}

          {/* Particles ✨⭐💫 */}
          {particles.map(p => (
            <text key={p.key} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
              fontSize={22 * p.scale} opacity={p.opacity}>
              {p.emoji}
            </text>
          ))}

          {/* Animated cursor */}
          {elapsed < T.PAUSE && (
            <g transform={`translate(${cursorPos.x},${cursorPos.y})`}>
              {isClicking && (
                <circle cx={0} cy={0} r={35} fill="none" stroke={CC.yellow} strokeWidth={3} opacity={0.7}>
                  <animate attributeName="r" from="15" to="50" dur="0.4s" fill="freeze" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="0.4s" fill="freeze" />
                </circle>
              )}
              <g transform={`scale(${isClicking ? 0.85 : 1})`}>
                <path d="M0 0 L3 18 L7.5 12 L14 16 L10 10 L16 8 Z"
                  fill={CC.white} stroke={CC.brown} strokeWidth={1.5} strokeLinejoin="round"
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }} />
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* Scenario indicators */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        {SCENARIOS.map((_, i) => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: '50%',
            background: (sceneIdx % SCENARIOS.length) === i ? CC.teal : '#cbd5e1',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>

      <style>{`
        @keyframes demoBubbleIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
