import React, { useState } from 'react';
// Chargement dynamique des zones depuis le dossier public
// (remplace l'import statique)

import './CarteJeu.css'; // Pour les effets CSS

const getZoneColor = (zone, selected, correct, wrong) => {
  if (correct && selected) return '#4caf50cc'; // Vert fun
  if (wrong && selected) return '#ff1744cc';   // Rouge fun
  if (selected) return '#ffd600cc';            // Jaune doré
  return 'transparent';
};

const getZoneClass = (zone, selected, correct, wrong) => {
  if (correct && selected) return 'zone-correct';
  if (wrong && selected) return 'zone-wrong';
  if (selected) return 'zone-selected';
  return '';
};

export default function CarteJeu() {
  const [selected, setSelected] = useState([]);
  const [score, setScore] = useState(0);
  const [effect, setEffect] = useState(null); // 'correct' | 'wrong' | null

  // Chargement dynamique des zones depuis le dossier public
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    const fetchZones = async () => {
      try {
        const tryFetch = async (path) => {
          const r = await fetch(path);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        };
        const p2 = process.env.PUBLIC_URL + '/data/zones2.json';
        const p1 = process.env.PUBLIC_URL + '/data/zones.json';
        let data;
        try {
          data = await tryFetch(p2);
        } catch (_) {
          data = await tryFetch(p1);
        }
        // Mélange les zones à chaque partie
        let arr = [...data];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        setZones(arr);
        setLoading(false);
      } catch (e) {
        setError('Erreur lors du chargement des zones : ' + e.message);
        setLoading(false);
      }
    };
    fetchZones();
  }, []);

  // Vérifie si deux zones sélectionnées forment une bonne association
  React.useEffect(() => {
    if (selected.length === 2) {
      const [z1, z2] = selected;
      const types = [z1.type, z2.type].sort().join('-');
      const validPairs = ['calcul-chiffre', 'image-texte', 'texte-image', 'chiffre-calcul'];
      const isPair = validPairs.includes(types);
      const isCorrect = isPair && z1.pairId === z2.pairId;

      if (isCorrect) {
        setEffect('correct');
        // Score géré par Carte.js dans votre app principale
        setTimeout(() => {
          setSelected([]);
          setEffect(null);
        }, 1200);
      } else {
        setEffect('wrong');
        setTimeout(() => {
          setSelected([]);
          setEffect(null);
        }, 1200);
      }
    }
  }, [selected]);

  const handleZoneClick = (zone) => {
    if (effect) return; // Bloque pendant l'animation
    if (selected.some(z => z.id === zone.id)) return;
    if (selected.length === 2) return;
    setSelected(sel => [...sel, zone]);
  };

  return (
    <div className="carte-jeu-container">
      <div className="score">Score : {score}</div>
      <svg
        width={1000}
        height={1000}
        viewBox="0 0 1000 1000"
        className="carte-svg-overlay"
        style={{ width: '100%', height: '100%', maxWidth: 600, border: '1px solid #eee', background: '#f9f9f9' }}
      >
        {zones.map(zone => {
          const isSelected = selected.some(z => z.id === zone.id);
          const isCorrect = effect === 'correct';
          const isWrong = effect === 'wrong';
          // Calcul du barycentre (centre géométrique)
          let cx = 0, cy = 0;
          if (zone.points && zone.points.length > 0) {
            cx = zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length;
            cy = zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length;
          }
          return (
            <g
              key={zone.id}
              data-zone-id={zone.id}
              id={`zone-${zone.id}`}
              className={getZoneClass(zone, isSelected, isCorrect, isWrong)}
              onClick={() => handleZoneClick(zone)}
              style={{ cursor: 'pointer' }}
            >
              <path
                d={zone.points && zone.points.length > 0 ? 
                  'M ' + zone.points.map(p => `${p.x},${p.y}`).join(' L ') + ' Z' : ''}
                fill={getZoneColor(zone, isSelected, isCorrect, isWrong)}
                stroke="none"
                style={{ transition: 'fill 0.15s' }}
              />
              {/* Affichage du contenu centré */}
              {zone.type === 'image' ? (
                (() => {
                  const raw = zone.content || '';
                  const normalized = raw.startsWith('http') ? raw : process.env.PUBLIC_URL + '/' + (raw.startsWith('/') ? raw.slice(1) : (raw.startsWith('images/') ? raw : 'images/' + raw));
                  const src = encodeURI(normalized)
                    .replace(/ /g, '%20')
                    .replace(/\(/g, '%28')
                    .replace(/\)/g, '%29');
                  return (
                    <image
                      href={src}
                      x={cx - 40}
                      y={cy - 40}
                      width={80}
                      height={80}
                      style={{ pointerEvents: 'none' }}
                    />
                  );
                })()
              ) : (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontSize={zone.type === 'chiffre' ? 36 : 20}
                  fill="#222"
                  fontWeight="bold"
                  pointerEvents="none"
                >
                  {zone.content}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* Effet fun */}
      {effect === 'correct' && <div className="confetti">🎉 Bonne réponse !</div>}
      {effect === 'wrong' && <div className="shake">❌ Mauvaise association !</div>}
    </div>
  );
}
