import React, { useMemo } from 'react';
import { pointsToBezierPath } from './CarteUtils';
import '../styles/Carte.css';

/**
 * CarteRenderer - Composant de rendu pur pour la carte de jeu
 * 
 * Extrait de Carte.js pour être réutilisé dans :
 * - Mode multijoueur classique (Carte.js)
 * - Mode tournoi Crazy Arena (CrazyArenaGame.js)
 * 
 * Props:
 * @param {Array} zones - Liste des zones à afficher
 * @param {Function} onZoneClick - Callback appelé lors du clic sur une zone (zone) => void
 * @param {Object} calcAngles - Angles de rotation des zones calcul/chiffre { zoneId: angle }
 * @param {Object} customTextSettings - Paramètres de style pour les textes { zoneId: { fontFamily, color, fontSize, text } }
 * @param {Object} selectedArcPoints - Points d'arc pour textes courbés { zoneId: [idx1, idx2] }
 * @param {Number} hoveredZoneId - ID de la zone survolée (optionnel)
 * @param {Array} gameSelectedIds - IDs des zones sélectionnées par le joueur
 * @param {Boolean} gameActive - Jeu actif ou pas (affecte les interactions)
 * @param {Boolean} readOnly - Mode lecture seule (pas de clics)
 */

// Mapping des zones nécessitant un flip de l'arc pour le texte
const FLIP_TEXT_ARC_ZONE_IDS = {
  1752570164541: true,
  1752570866370: true
};

// Calcule un arc entre deux points, mais avec une marge en pixels sur chaque extrémité
function interpolateArc(points, idxStart, idxEnd, marginPx) {
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
  const newStart = {
    x: centerX + r * Math.cos(newAngleStart),
    y: centerY + r * Math.sin(newAngleStart)
  };
  const newEnd = {
    x: centerX + r * Math.cos(newAngleEnd),
    y: centerY + r * Math.sin(newAngleEnd)
  };
  return { newStart, newEnd, r, centerX, centerY, largeArcFlag: 0, sweepFlag: 1, arcLen, delta };
}

function getArcPathFromZonePoints(points, zoneId, selectedArcPoints, arcPointsFromZone, marginPx = 0) {
  if (!points || points.length < 2) return '';
  let idxStart, idxEnd;
  if (Array.isArray(arcPointsFromZone) && arcPointsFromZone.length === 2) {
    idxStart = arcPointsFromZone[0];
    idxEnd = arcPointsFromZone[1];
  } else if (selectedArcPoints && selectedArcPoints[zoneId] && selectedArcPoints[zoneId].length === 2) {
    idxStart = selectedArcPoints[zoneId][0];
    idxEnd = selectedArcPoints[zoneId][1];
  } else {
    idxStart = 0;
    idxEnd = 1;
  }
  const { newStart, newEnd, r, centerX, centerY, largeArcFlag, sweepFlag } = interpolateArc(points, idxStart, idxEnd, marginPx);
  return `M ${newStart.x},${newStart.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag} ${newEnd.x},${newEnd.y}`;
}

// Calcule la bounding box d'une zone à partir de ses points
function getZoneBoundingBox(points) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export function CarteRenderer({
  zones = [],
  onZoneClick = null,
  calcAngles = {},
  customTextSettings = {},
  selectedArcPoints = {},
  hoveredZoneId = null,
  gameSelectedIds = [],
  gameActive = false,
  readOnly = false
}) {
  // Référence de taille moyenne des zones chiffre pour homogénéiser leur taille (COPIE EXACTE Carte.js ligne 2533)
  const chiffreRefBase = useMemo(() => {
    try {
      if (!Array.isArray(zones) || zones.length === 0) return null;
      const bases = zones
        .filter(z => z?.type === 'chiffre' && Array.isArray(z.points) && z.points.length)
        .map(z => {
          const b = getZoneBoundingBox(z.points);
          return Math.max(12, Math.min(b.width, b.height));
        });
      if (!bases.length) return null;
      const avg = bases.reduce((a, b) => a + b, 0) / bases.length;
      return avg;
    } catch {
      return null;
    }
  }, [zones]);

  const svgPath = `${process.env.PUBLIC_URL}/images/carte-svg.svg`;

  const handleZoneClick = (zone, e) => {
    if (readOnly || !onZoneClick) return;
    if (e) e.stopPropagation();
    onZoneClick(zone);
  };

  return (
    <div className="carte-renderer" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <object
        type="image/svg+xml"
        data={svgPath}
        className="carte-bg"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }}
      >
        Votre navigateur ne supporte pas les SVG
      </object>
      
      <svg
        className="carte-svg-overlay"
        width={1000}
        height={1000}
        viewBox="0 0 1000 1000"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'auto',
          width: '100%',
          height: '100%',
          zIndex: 2
        }}
      >
        {/* Définitions SVG */}
        <defs>
          {/* ClipPaths pour zones images */}
          {zones.filter(z => z.type === 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
            <clipPath id={`clip-zone-${zone.id}`} key={`clip-${zone.id}`} clipPathUnits="userSpaceOnUse">
              <path d={pointsToBezierPath(zone.points)} />
            </clipPath>
          ))}
          {/* Paths pour texte courbé (zones non-image) */}
          {zones.filter(z => z.type !== 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
            <path 
              id={`text-curve-${zone.id}`} 
              key={`textcurve-${zone.id}`} 
              d={getArcPathFromZonePoints(zone.points, zone.id, selectedArcPoints, zone.arcPoints)} 
              fill="none" 
            />
          ))}
        </defs>

        {zones.filter(z => z && typeof z === 'object').map((zone) => (
          <g
            key={zone.id}
            data-zone-id={zone.id}
            id={`zone-${zone.id}`}
            style={{
              cursor: readOnly ? 'default' : 'pointer',
              filter: hoveredZoneId === zone.id ? 'drop-shadow(0 0 8px #007bff)' : 'none',
              opacity: 1
            }}
          >
            {/* IMAGE EN FOND */}
            {zone.type === 'image' && zone.content && (() => {
              const raw = zone.content;
              const normalized = raw.startsWith('http')
                ? raw
                : process.env.PUBLIC_URL + '/' + (raw.startsWith('/')
                  ? raw.slice(1)
                  : (raw.startsWith('images/') ? raw : 'images/' + raw));
              const src = encodeURI(normalized)
                .replace(/ /g, '%20')
                .replace(/\(/g, '%28')
                .replace(/\)/g, '%29');
              const bbox = getZoneBoundingBox(zone.points);
              return (
                <image
                  href={src}
                  xlinkHref={src}
                  x={bbox.x}
                  y={bbox.y}
                  width={bbox.width}
                  height={bbox.height}
                  style={{ pointerEvents: 'none', objectFit: 'cover' }}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#clip-zone-${zone.id})`}
                  onError={() => console.warn('Erreur chargement image:', src)}
                />
              );
            })()}

            {/* PATH DE LA ZONE */}
            <path
              d={pointsToBezierPath(zone.points)}
              fill={(() => {
                const isHover = hoveredZoneId === zone.id;
                const isSelected = gameActive && gameSelectedIds.includes(zone.id);
                if (zone.type === 'image') {
                  if (isSelected) return 'rgba(255, 214, 0, 0.55)';
                  return isHover ? 'rgba(255, 214, 0, 0.5)' : 'rgba(255, 214, 0, 0.01)';
                }
                if (zone.type === 'texte' || zone.type === 'chiffre' || zone.type === 'calcul') {
                  if (isSelected) return 'rgba(40, 167, 69, 0.55)';
                  return isHover ? 'rgba(40, 167, 69, 0.35)' : 'rgba(40, 167, 69, 0.01)';
                }
                return 'transparent';
              })()}
              stroke={'none'}
              pointerEvents="all"
              onClick={(e) => {
                if (gameActive && (zone.type === 'image' || zone.type === 'texte' || zone.type === 'chiffre' || zone.type === 'calcul')) {
                  handleZoneClick(zone, e);
                }
              }}
            />

            {/* TEXTE COURBÉ (type='texte') */}
            {zone.type === 'texte' && (() => {
              let idxStart, idxEnd;
              if (Array.isArray(zone.arcPoints) && zone.arcPoints.length === 2) {
                idxStart = zone.arcPoints[0];
                idxEnd = zone.arcPoints[1];
              } else if (Array.isArray(selectedArcPoints[zone.id]) && selectedArcPoints[zone.id].length === 2) {
                idxStart = selectedArcPoints[zone.id][0];
                idxEnd = selectedArcPoints[zone.id][1];
              } else {
                idxStart = 0;
                idxEnd = 1;
              }
              
              const pointsArr = Array.isArray(zone.points) && zone.points.length >= 2 ? zone.points : [{x:0,y:0},{x:1,y:1}];
              const { r, delta } = interpolateArc(pointsArr, idxStart, idxEnd, 0);
              const arcLen = r * delta;
              
              const textValue = (customTextSettings[zone.id]?.text && customTextSettings[zone.id]?.text.trim() !== '')
                ? customTextSettings[zone.id]?.text
                : (zone.content || zone.label || '');
              
              const baseFontSize = customTextSettings[zone.id]?.fontSize || 32;
              const safeTextValue = typeof textValue === 'string' ? textValue : '';
              const textLen = safeTextValue.length * baseFontSize * 0.6;
              const marginPx = 24;
              const fontSize = textLen > arcLen - 2 * marginPx
                ? Math.max(12, (arcLen - 2 * marginPx) / (safeTextValue.length * 0.6))
                : baseFontSize;
              
              return (
                <text
                  fontSize={fontSize}
                  fontFamily={customTextSettings[zone.id]?.fontFamily || 'Arial'}
                  fill={customTextSettings[zone.id]?.color || '#fff'}
                  fontWeight="bold"
                  pointerEvents="auto"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => handleZoneClick(zone, e)}
                >
                  <textPath 
                    xlinkHref={`#text-curve-${zone.id}`} 
                    startOffset="50%" 
                    textAnchor="middle" 
                    dominantBaseline="middle"
                  >
                    {textValue}
                  </textPath>
                </text>
              );
            })()}

            {/* CALCULS ET CHIFFRES CENTRÉS (type='calcul' ou 'chiffre') */}
            {(zone.type === 'calcul' || zone.type === 'chiffre') && zone.content && (() => {
              const bbox = getZoneBoundingBox(zone.points);
              const cx = bbox.x + bbox.width / 2;
              const cy = bbox.y + bbox.height / 2;
              const base = Math.max(12, Math.min(bbox.width, bbox.height));
              
              // Pour les chiffres, garantir une taille minimale basée sur la moyenne
              const chiffreBaseMin = chiffreRefBase ? 0.95 * chiffreRefBase : base;
              const effectiveBase = (zone.type === 'chiffre') ? Math.max(base, chiffreBaseMin) : base;
              const fontSize = (zone.type === 'chiffre' ? 0.42 : 0.28) * effectiveBase;
              
              const angle = Number(calcAngles[zone.id] || zone.angle || 0);
              
              // Offset spécial pour le chiffre "6"
              const contentStr = String(zone.content ?? '').trim();
              const isSix = (zone.type === 'chiffre') && contentStr === '6';
              const offsetX = isSix ? (-0.04 * fontSize) : 0;
              
              const isMath = zone.type === 'calcul' || zone.type === 'chiffre';
              const isChiffre = zone.type === 'chiffre';
              
              return (
                <g transform={`rotate(${angle} ${cx} ${cy})`}>
                  <text
                    x={cx}
                    y={cy}
                    transform={offsetX ? `translate(${offsetX} 0)` : undefined}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fontSize={fontSize}
                    fill={isMath ? '#456451' : '#222'}
                    fontWeight="bold"
                    stroke={isMath ? 'none' : '#fff'}
                    strokeWidth={isMath ? 0 : 4}
                    paintOrder="stroke"
                    pointerEvents={gameActive ? 'none' : 'auto'}
                    style={{ cursor: gameActive ? 'default' : 'pointer' }}
                  >
                    {zone.content}
                  </text>
                  
                  {/* Soulignement pour les chiffres */}
                  {isChiffre && (() => {
                    const underLen = 0.5 * fontSize;
                    const half = underLen / 2;
                    const uy = cy + 0.54 * fontSize;
                    const strokeW = Math.max(1, 0.09 * fontSize);
                    const digitColor = '#456451';
                    const cxAdj = cx + (offsetX || 0);
                    return (
                      <line
                        x1={cxAdj - half}
                        y1={uy}
                        x2={cxAdj + half}
                        y2={uy}
                        stroke={digitColor}
                        strokeWidth={strokeW}
                        strokeLinecap="round"
                      />
                    );
                  })()}
                </g>
              );
            })()}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default CarteRenderer;
