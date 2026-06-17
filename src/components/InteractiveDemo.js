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

// ID des zones par position sur la carte (géométrie fixe)
const Z = {
  imgTR: '1752571224092', imgTL: '1752571493404', imgBR: '1752571661490', imgBL: '1752571830304',
  txtTL: '1752570164541', txtTR: '1752570391219', txtBR: '1752570607347', txtBL: '1752570866370',
  calcTL: '1752572018539', calcTR: '1752572187590', calcBR: '1752572384939', calcBL: '1752572591501',
  numTop: '1752568799658', numRight: '1752569687819', numBottom: '1752569809115', numLeft: '1752569975013',
};

// Construit le contenu complet d'une carte (16 zones).
// IMPORTANT : comme dans le vrai jeu, chaque carte ne contient qu'UNE SEULE bonne
// association ; les 14 autres zones sont des distracteurs qui ne s'apparient pas.
const makeCard = ({ images, textes, calculs, chiffres, pairA, pairB, tooltips }) => ({
  content: {
    [Z.imgTR]: { image: images.TR }, [Z.imgTL]: { image: images.TL },
    [Z.imgBR]: { image: images.BR }, [Z.imgBL]: { image: images.BL },
    [Z.txtTL]: { display: textes.TL }, [Z.txtTR]: { display: textes.TR },
    [Z.txtBR]: { display: textes.BR }, [Z.txtBL]: { display: textes.BL },
    [Z.calcTL]: { display: calculs.TL }, [Z.calcTR]: { display: calculs.TR },
    [Z.calcBR]: { display: calculs.BR }, [Z.calcBL]: { display: calculs.BL },
    [Z.numTop]: { display: chiffres.top }, [Z.numRight]: { display: chiffres.right },
    [Z.numBottom]: { display: chiffres.bottom }, [Z.numLeft]: { display: chiffres.left },
  },
  pairA, pairB, tooltips,
});

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

// ============ DEMO CARDS ============
// Chaque carte = UNE seule bonne association + 14 distracteurs (comme le vrai jeu).
// Les calculs distracteurs ne valent jamais l'un des chiffres affichés ; les images
// distractrices n'ont pas leur mot affiché et inversement.
const T4 = (a, b, c, d) => [
  { text: a, time: 0 }, { text: b, time: 2000 }, { text: c, time: 4200 }, { text: d, time: 6400 },
];
const SCENARIOS = [
  // 0 — TI marine : Dauphin
  makeCard({
    images: { TR: 'images/colibri.jpeg', TL: 'images/flamant-rose.jpeg', BR: 'images/dauphin.jpeg', BL: 'images/heron-vert.jpeg' },
    textes: { TL: 'Scolopendre', TR: 'Dauphin', BR: 'Grande aigrette', BL: 'Tortue luth' },
    calculs: { TL: '6 × 7', TR: '120 ÷ 4', BR: '15 + 9', BL: '50 − 8' },
    chiffres: { top: '18', right: '8', bottom: '4', left: '60' },
    pairA: Z.imgBR, pairB: Z.txtTR,
    tooltips: T4('� Observe la carte...', '🐬 Je reconnais un Dauphin !', '📝 Son nom est ici : « Dauphin »', '✨ Bravo ! La paire s\'envole !'),
  }),
  // 1 — CC faune : 7 × 8 = 56
  makeCard({
    images: { TR: 'images/ibis-rouge.jpeg', TL: 'images/iguane-vert.jpeg', BR: 'images/caiman.jpeg', BL: 'images/cabri.jpeg' },
    textes: { TL: 'Dauphin', TR: 'Flamant rose', BR: 'Héron vert', BL: 'Colibri' },
    calculs: { TL: '7 × 8', TR: '90 ÷ 3', BR: '45 + 9', BL: '100 − 36' },
    chiffres: { top: '56', right: '8', bottom: '4', left: '18' },
    pairA: Z.calcTL, pairB: Z.numTop,
    tooltips: T4('👀 Nouvelle manche !', '🔢 Je vois le calcul : 7 × 8', '🎯 Son résultat est 56 !', '✨ Bravo ! Les étoiles célèbrent !'),
  }),
  // 2 — TI faune : Iguane vert
  makeCard({
    images: { TR: 'images/ibis-rouge.jpeg', TL: 'images/iguane-vert.jpeg', BR: 'images/caiman.jpeg', BL: 'images/cabri.jpeg' },
    textes: { TL: 'Iguane vert', TR: 'Tortue luth', BR: 'Dauphin', BL: 'Flamant rose' },
    calculs: { TL: '8 × 4', TR: '60 ÷ 5', BR: '27 + 6', BL: '90 − 45' },
    chiffres: { top: '100', right: '8', bottom: '4', left: '18' },
    pairA: Z.imgTL, pairB: Z.txtTL,
    tooltips: T4('👀 Observe la carte...', '🦎 Un Iguane vert en haut à gauche !', '📝 Et voilà son nom juste à côté !', '✨ Parfait ! Ça s\'envole !'),
  }),
  // 3 — TI jardin : Goyave
  makeCard({
    images: { TR: 'images/goyave.jpeg', TL: 'images/corossol.jpeg', BR: 'images/carambole.jpeg', BL: 'images/gombo.jpeg' },
    textes: { TL: 'Igname', TR: 'Goyave', BR: 'Christophine', BL: 'Cythère' },
    calculs: { TL: '5 × 6', TR: '144 ÷ 12', BR: '28 + 9', BL: '81 − 36' },
    chiffres: { top: '54', right: '8', bottom: '4', left: '18' },
    pairA: Z.imgTR, pairB: Z.txtTR,
    tooltips: T4('👀 Nouvelle manche !', '🍈 Je reconnais une Goyave !', '📝 Son nom est ici : « Goyave »', '✨ Bravo ! La paire s\'envole !'),
  }),
  // 4 — CC jardin : 144 ÷ 12 = 12
  makeCard({
    images: { TR: 'images/goyave.jpeg', TL: 'images/corossol.jpeg', BR: 'images/carambole.jpeg', BL: 'images/gombo.jpeg' },
    textes: { TL: 'Igname', TR: 'Christophine', BR: 'Aloe vera', BL: 'Cythère' },
    calculs: { TL: '6 × 9', TR: '144 ÷ 12', BR: '27 + 8', BL: '81 − 36' },
    chiffres: { top: '60', right: '12', bottom: '4', left: '18' },
    pairA: Z.calcTR, pairB: Z.numRight,
    tooltips: T4('👀 Dernière manche !', '🔢 Je vois le calcul : 144 ÷ 12', '🎯 Son résultat est 12 !', '✨ Bravo ! Les étoiles célèbrent !'),
  }),
  // 5 — TI faune : Caïman
  makeCard({
    images: { TR: 'images/ibis-rouge.jpeg', TL: 'images/iguane-vert.jpeg', BR: 'images/caiman.jpeg', BL: 'images/cabri.jpeg' },
    textes: { TL: 'Flamant rose', TR: 'Dauphin', BR: 'Caïman', BL: 'Héron vert' },
    calculs: { TL: '9 × 3', TR: '80 ÷ 4', BR: '14 + 8', BL: '70 − 35' },
    chiffres: { top: '56', right: '8', bottom: '4', left: '18' },
    pairA: Z.imgBR, pairB: Z.txtBR,
    tooltips: T4('👀 Observe la carte...', '🐊 Je reconnais un Caïman !', '📝 Son nom est ici : « Caïman »', '✨ Parfait ! Ça s\'envole !'),
  }),
  // 6 — TI récifs : Dorade coryphène
  makeCard({
    images: { TR: 'images/dorade-coryphene.jpeg', TL: 'images/bernard-lhermite.jpeg', BR: 'images/ecrevisse.jpeg', BL: 'images/corail-cerveau.jpeg' },
    textes: { TL: 'Oursin', TR: 'Dorade coryphène', BR: 'Langouste', BL: 'Étoile de mer' },
    calculs: { TL: '3 × 9', TR: '72 ÷ 8', BR: '13 + 6', BL: '90 − 45' },
    chiffres: { top: '42', right: '20', bottom: '4', left: '18' },
    pairA: Z.imgTR, pairB: Z.txtTR,
    tooltips: T4('👀 Nouvelle manche !', '🐟 Je reconnais une Dorade coryphène !', '📝 Son nom est ici !', '✨ Bravo ! La paire s\'envole !'),
  }),
];

// Timings de base (rythme normal). Le mode "slow" (pilote) étire ces valeurs
// et laisse beaucoup plus de temps sur l'association trouvée (MATCH -> FLY_AWAY).
const T_BASE = {
  CURSOR_TO_A: 2000,
  CLICK_A:     3200,
  CURSOR_TO_B: 4200,
  CLICK_B:     5400,
  MATCH:       5800,
  FLY_AWAY:    6400,
  PAUSE:       8500,
  SCENE:       9500,
};
const T_SLOW = {
  CURSOR_TO_A: 2600,
  CLICK_A:     4000,
  CURSOR_TO_B: 5600,
  CLICK_B:     7000,
  MATCH:       7500,
  FLY_AWAY:    9000,   // 1500 ms de pause sur la paire trouvée
  PAUSE:       13500,
  SCENE:       15000,
};
// Rythme "promo" : bref et lisible, pour les montages de gameplay où l'on veut
// voir plusieurs paires trouvées (le score grimpe à chaque association cliquée).
const T_PROMO = {
  CURSOR_TO_A: 850,
  CLICK_A:     1550,
  CURSOR_TO_B: 2400,
  CLICK_B:     3100,
  MATCH:       3400,
  FLY_AWAY:    3800,
  PAUSE:       4700,
  SCENE:       5100,
};

// ============ POINTER HAND (main premium dessinée en SVG) ============
// La pointe de l'index est calée exactement sur l'origine (0,0) :
// le parent applique translate(centreZone) rotate scale, donc la pointe
// touche toujours le centre exact de la zone.
export function PointerHand() {
  // Silhouette de la main (doigt + jointures + pouce + paume).
  // Les <rect> héritent du fill/stroke du <g> parent → technique "sticker"
  // (halo de contour dessiné dessous, remplissage uni au-dessus) pour une
  // silhouette unifiée et nette, sans coutures internes.
  // Asymétrie volontaire (style ☝️) : l'index est le SEUL doigt levé, les autres
  // sont repliés en bosses À DROITE, le pouce sur le côté gauche du poing.
  const shapes = (
    <>
      {/* Index : seul doigt levé, pointe à l'origine (0,0) */}
      <rect x={-21} y={0} width={42} height={134} rx={21} />
      {/* Doigts repliés : 3 bosses au sommet du poing, à droite de l'index */}
      <rect x={34} y={112} width={40} height={44} rx={20} />
      <rect x={65} y={108} width={40} height={46} rx={20} />
      <rect x={94} y={114} width={36} height={40} rx={18} />
      {/* Pouce : nettement plus bas, orienté vers le bas (dégage l'index) */}
      <g transform="rotate(-30 -22 214)">
        <rect x={-48} y={176} width={42} height={78} rx={21} />
      </g>
      {/* Poing : bord gauche aligné avec l'index → côté gauche bien droit */}
      <rect x={-21} y={120} width={143} height={124} rx={42} />
    </>
  );
  return (
    <g>
      <defs>
        {/* Peau afro-caribéenne : brun chaud profond */}
        <linearGradient id="cc-hand-skin" gradientUnits="userSpaceOnUse" x1="0" y1="-20" x2="0" y2="300">
          <stop offset="0" stopColor="#A06A3D" />
          <stop offset="0.55" stopColor="#7C4F2C" />
          <stop offset="1" stopColor="#5C381D" />
        </linearGradient>
        <linearGradient id="cc-hand-sleeve" gradientUnits="userSpaceOnUse" x1="0" y1="210" x2="0" y2="300">
          <stop offset="0" stopColor="#27B9CC" />
          <stop offset="1" stopColor="#0B6173" />
        </linearGradient>
      </defs>

      {/* Manche (derrière) */}
      <rect x={-28} y={216} width={150} height={82} rx={28} fill="#0B6173" stroke="#0B6173" strokeWidth={9} strokeLinejoin="round" />
      <rect x={-28} y={216} width={150} height={82} rx={28} fill="url(#cc-hand-sleeve)" />
      <rect x={-28} y={216} width={150} height={20} rx={10} fill="rgba(255,255,255,0.20)" />

      {/* Halo de contour de la main */}
      <g fill="#3F2510" stroke="#3F2510" strokeWidth={9} strokeLinejoin="round">{shapes}</g>
      {/* Remplissage peau */}
      <g fill="url(#cc-hand-skin)">{shapes}</g>

      {/* Détails premium : ongle, plis, reflet */}
      <ellipse cx={0} cy={22} rx={11} ry={15} fill="rgba(255,236,214,0.42)" />
      <path d="M -13 64 Q 0 71 13 64" fill="none" stroke="#3F2510" strokeWidth={3} strokeLinecap="round" opacity={0.4} />
      <path d="M -12 100 Q 0 107 12 100" fill="none" stroke="#3F2510" strokeWidth={3} strokeLinecap="round" opacity={0.35} />
      {/* Séparation index / doigts repliés */}
      <path d="M 24 120 Q 30 134 27 150" fill="none" stroke="#3F2510" strokeWidth={3} strokeLinecap="round" opacity={0.35} />
      <rect x={-16} y={14} width={7} height={104} rx={4} fill="rgba(255,255,255,0.16)" />
    </g>
  );
}

// ============ COMPONENT ============
export default function InteractiveDemo({ maxWidth = 500, finger = false, slow = false, tutorial = false, startScene = 0, pace, onMatch, showDots = true } = {}) {
  // La démo enchaîne des CARTES ; chaque slide démarre sur une carte différente
  // (startScene) pour varier les images/mots/calculs affichés.
  const [sceneIdx, setSceneIdx] = useState(startScene % SCENARIOS.length);
  const [elapsed, setElapsed] = useState(0);
  const [bubbles, setBubbles] = useState([]); // flying bubbles
  const animRef = useRef(null);
  const startRef = useRef(null);
  const containerRef = useRef(null);

  const scene = SCENARIOS[sceneIdx % SCENARIOS.length];

  // Rythme : normal, ralenti (pilote/tutoriel) ou promo (montage gameplay)
  const T = useMemo(() => {
    const p = pace || (slow ? 'slow' : 'normal');
    return p === 'promo' ? T_PROMO : p === 'slow' ? T_SLOW : T_BASE;
  }, [pace, slow]);
  const SCENE_DURATION = T.SCENE;
  // Remappe les temps des tooltips (calés sur le rythme de base) vers le rythme courant
  const scaleTime = useCallback((t) => {
    const baseAnchors = [0, 2000, 4200, 6400, 9500];
    const newAnchors = [0, T.CURSOR_TO_A, T.CURSOR_TO_B, T.FLY_AWAY, SCENE_DURATION];
    for (let i = 1; i < baseAnchors.length; i++) {
      if (t <= baseAnchors[i]) {
        const r = (t - baseAnchors[i - 1]) / (baseAnchors[i] - baseAnchors[i - 1]);
        return newAnchors[i - 1] + r * (newAnchors[i] - newAnchors[i - 1]);
      }
    }
    return SCENE_DURATION;
  }, [T, SCENE_DURATION]);

  const getContent = useCallback((zoneId) => {
    return scene.content?.[zoneId] || {};
  }, [scene]);

  // chiffreRefBase (médiane pour résister aux outliers)
  const chiffreRefBase = useMemo(() => {
    const bases = ZONES_RAW.filter(z => z.type === 'chiffre').map(z => {
      const b = getZoneBoundingBox(z.points);
      return Math.max(12, Math.min(b.width, b.height));
    });
    if (!bases.length) return null;
    const sorted = [...bases].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
  }, [SCENE_DURATION]);

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
  }, [elapsed, scene, getContent, T]);

  // Notifie le parent à CHAQUE paire trouvée (une fois par scène), pour
  // synchroniser le score exactement sur le clic de la bonne association.
  const matchFiredRef = useRef(-1);
  useEffect(() => {
    if (elapsed >= T.MATCH && matchFiredRef.current !== sceneIdx) {
      matchFiredRef.current = sceneIdx;
      if (onMatch) onMatch(sceneIdx, scene);
    }
  }, [elapsed, sceneIdx, scene, T.MATCH, onMatch]);

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
    for (const tt of scene.tooltips) { if (elapsed >= scaleTime(tt.time)) active = tt; }
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
      position: 'relative', userSelect: 'none', maxWidth, width: '100%', margin: '0 auto',
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
        position: 'relative', width: '100%', maxWidth,
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
                  const chiffreBaseMin = chiffreRefBase || base;
                  const effectiveBase = zone.type === 'chiffre' ? Math.max(base, chiffreBaseMin) : base;
                  const rawFontSize = (zone.type === 'chiffre' ? 0.42 : 0.38) * effectiveBase;
                  const contentStr = content.display;
                  const charW = 0.52;
                  const fitW = contentStr.length > 0 ? (bbox.width * 0.92) / (contentStr.length * charW) : rawFontSize;
                  const fitH = bbox.height * 0.75;
                  // Pour chiffres: bbox ne reflète pas la taille visuelle (handles Bézier hors bbox), skip fitH
                  const fontSize = Math.max(10, zone.type === 'chiffre' ? Math.min(rawFontSize, fitW) : Math.min(rawFontSize, fitW, fitH));
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

          {/* Pointeur : main humaine premium (mode finger) ou curseur flèche */}
          {elapsed < T.PAUSE && finger && (
            <g>
              {isClicking && (
                <circle cx={cursorPos.x} cy={cursorPos.y} r={35} fill="none" stroke={CC.yellow} strokeWidth={6} opacity={0.8}>
                  <animate attributeName="r" from="14" to="78" dur="0.5s" fill="freeze" />
                  <animate attributeName="opacity" from="0.9" to="0" dur="0.5s" fill="freeze" />
                </circle>
              )}
              {/* La pointe de l'index (origine 0,0) est translatée pile au centre
                  de la zone ; rotate/scale autour de l'origine ne déplacent pas la pointe. */}
              <g transform={`translate(${cursorPos.x},${cursorPos.y}) rotate(-7) scale(${isClicking ? 0.66 : 0.72})`}
                 style={{ filter: 'drop-shadow(0 12px 14px rgba(0,0,0,0.38))' }}>
                <PointerHand />
              </g>
            </g>
          )}
          {elapsed < T.PAUSE && !finger && (
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

      {/* Panneau tutoriel : HORS de la carte, dans l'espace bleu à gauche */}
      {tutorial && (() => {
        let n = null, label = null, color = '#0D6A7A';
        if (elapsed >= T.CURSOR_TO_A && elapsed < T.CURSOR_TO_B) { n = '1'; label = 'Repère un élément'; }
        else if (elapsed >= T.CURSOR_TO_B && elapsed < T.MATCH) { n = '2'; label = 'Trouve son association'; }
        else if (elapsed >= T.MATCH && elapsed < T.FLY_AWAY) { n = '✓'; label = 'Paire trouvée !'; color = '#10b981'; }
        if (!label) return null;
        return (
          <div key={label} style={{
            position: 'absolute', top: '50%', right: 'calc(100% + 28px)', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', gap: 12, background: color, color: '#fff',
            padding: '14px 20px', borderRadius: 18, boxShadow: '0 14px 34px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5, animation: 'demoBubbleIn 0.3s ease-out',
          }}>
            <span style={{ display: 'inline-flex', width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 19 }}>{n}</span>
            <span style={{ fontWeight: 800, fontSize: 'clamp(15px, 1.6vw, 20px)' }}>{label}</span>
          </div>
        );
      })()}

      {/* Scenario indicators */}
      {showDots && (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        {SCENARIOS.map((_, i) => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: '50%',
            background: (sceneIdx % SCENARIOS.length) === i ? CC.teal : '#cbd5e1',
            transition: 'all 0.3s',
          }} />
        ))}
      </div>
      )}

      <style>{`
        @keyframes demoBubbleIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
