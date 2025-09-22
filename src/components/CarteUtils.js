// Outils utilitaires pour la gestion des polygones/zones sur la carte

export function pointToSvgCoords(event, svgElement) {
  const rect = svgElement.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const svgWidth = svgElement.viewBox?.baseVal?.width || 1000;
  const svgHeight = svgElement.viewBox?.baseVal?.height || 1000;
  const xPx = event.clientX - rect.left;
  const yPx = event.clientY - rect.top;
  const x = (xPx / width) * svgWidth;
  const y = (yPx / height) * svgHeight;
  return { x, y };
}


export function polygonToPointsStr(points) {
  // Convertit un tableau de points en string pour l'attribut 'points' de <polygon>
  return points.map(p => `${p.x},${p.y}`).join(' ');
}

// Génère un chemin SVG (d) à partir d'une séquence libre de segments (lignes et courbes)
export function segmentsToSvgPath(segments) {
  if (!segments || segments.length === 0) return '';
  let d = '';
  segments.forEach((seg, idx) => {
    if (seg.type === 'M') {
      d += `M ${seg.to.x},${seg.to.y} `;
    } else if (seg.type === 'L') {
      d += `L ${seg.to.x},${seg.to.y} `;
    } else if (seg.type === 'Q') {
      d += `Q ${seg.control.x},${seg.control.y} ${seg.to.x},${seg.to.y} `;
    } else if (seg.type === 'C') {
      d += `C ${seg.control1.x},${seg.control1.y} ${seg.control2.x},${seg.control2.y} ${seg.to.x},${seg.to.y} `;
    }
  });
  d += 'Z'; // ferme le chemin
  return d;
}

// Génère un chemin SVG (d) à partir d'une liste de points et de poignées (mode Illustrator)
export function pointsToBezierPath(points) {
  if (!points || points.length === 0) return '';
  let d = `M ${points[0].x},${points[0].y} `;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev.handleOut && curr.handleIn) {
      // Cubic Bézier
      d += `C ${prev.handleOut.x},${prev.handleOut.y} ${curr.handleIn.x},${curr.handleIn.y} ${curr.x},${curr.y} `;
    } else if (curr.handleIn) {
      // Quadratic Bézier
      d += `Q ${curr.handleIn.x},${curr.handleIn.y} ${curr.x},${curr.y} `;
    } else {
      // Ligne droite
      d += `L ${curr.x},${curr.y} `;
    }
  }
  d += 'Z';
  return d;
}
