import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const CC = {
  teal: '#1AACBE', tealDark: '#148A9C', tealDeep: '#0D6A7A',
  yellow: '#F5A623', yellowLt: '#FFF3C4',
  brown: '#4A3728', brownLt: '#6B5443',
  white: '#FFFFFF', green: '#10b981',
  bgGradient: 'radial-gradient(ellipse at 50% 120%, #1AACBE 0%, #0D6A7A 55%, #073B45 100%)',
};

// ==========================================
// PROMO VIDEO PAGE - Showcase pour enregistrement vidéo
// Vraies cartes + bulles qui s'envolent + main animée + confettis
// ==========================================

// Données de zones simplifiées pour la démo
const DEMO_ZONES = [
  // Chiffres
  { id: 'c1', type: 'chiffre', content: '12', x: 15, y: 15, size: 12, angle: 0 },
  { id: 'c2', type: 'chiffre', content: '7', x: 75, y: 20, size: 12, angle: 45 },
  { id: 'c3', type: 'chiffre', content: '3', x: 20, y: 75, size: 12, angle: -30 },
  { id: 'c4', type: 'chiffre', content: '9', x: 70, y: 70, size: 12, angle: 15 },
  // Calculs
  { id: 'calc1', type: 'calcul', content: '4×3', x: 35, y: 35, size: 10, angle: 0 },
  { id: 'calc2', type: 'calcul', content: '5+2', x: 55, y: 45, size: 10, angle: 0 },
  { id: 'calc3', type: 'calcul', content: '6+3', x: 45, y: 60, size: 10, angle: 0 },
  { id: 'calc4', type: 'calcul', content: '3×4', x: 30, y: 55, size: 10, angle: 0 },
];

const PAIRS = [
  { calc: 'calc1', chiffre: 'c1', calcContent: '4×3', chiffreContent: '12' },
  { calc: 'calc2', chiffre: 'c2', calcContent: '5+2', chiffreContent: '7' },
  { calc: 'calc3', chiffre: 'c4', calcContent: '6+3', chiffreContent: '9' },
  { calc: 'calc4', chiffre: 'c3', calcContent: '3×4', chiffreContent: '3' },
];

// Confettis
const Confetti = ({ active }) => {
  if (!active) return null;
  const colors = ['#FFD34D', '#F5A623', '#FF6B35', '#34d399', '#60a5fa', '#f472b6'];
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 100 }}>
      {Array.from({ length: 50 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ y: -20, x: `${Math.random() * 100}%`, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: 720, opacity: 0 }}
          transition={{ duration: 3 + Math.random() * 2, delay: Math.random() * 2, repeat: Infinity }}
          style={{
            position: 'absolute',
            width: 8 + Math.random() * 8,
            height: 8 + Math.random() * 8,
            background: colors[i % colors.length],
            borderRadius: i % 3 === 0 ? '50%' : 2,
          }}
        />
      ))}
    </div>
  );
};

// Main animée qui clique
const HandCursor = ({ x, y, clicking, visible }) => {
  if (!visible) return null;
  return (
    <motion.div
      initial={{ x, y }}
      animate={{ 
        x, y,
        scale: clicking ? [1, 0.9, 1] : 1,
      }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed',
        left: 0, top: 0,
        width: 60, height: 60,
        pointerEvents: 'none',
        zIndex: 1000,
        fontSize: 50,
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
      }}
    >
      👆
    </motion.div>
  );
};

// Bulles qui s'envolent (comme Carte.js)
const FlyingBubbles = ({ startX, startY, color, active }) => {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ x: startX, y: startY, scale: 0, opacity: 1 }}
          animate={{
            x: startX + (Math.random() - 0.5) * 200,
            y: startY - 100 - Math.random() * 150,
            scale: [0, 1.5, 0],
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 1.2, delay: i * 0.1 }}
          style={{
            position: 'fixed',
            width: 20 + Math.random() * 20,
            height: 20 + Math.random() * 20,
            borderRadius: '50%',
            background: color,
            pointerEvents: 'none',
            zIndex: 999,
          }}
        />
      ))}
    </>
  );
};

// Zone de carte cliquable
const CardZone = ({ zone, onClick, selected, found }) => {
  const getColor = () => {
    if (found) return '#10b981';
    if (selected) return CC.yellow;
    return zone.type === 'chiffre' ? '#e8f5e9' : '#fff3e0';
  };

  return (
    <motion.div
      onClick={() => onClick(zone)}
      whileHover={{ scale: found ? 1 : 1.05 }}
      whileTap={{ scale: found ? 1 : 0.95 }}
      animate={found ? { scale: [1, 1.1, 1], opacity: [1, 0.8, 0.4] } : {}}
      transition={{ duration: 0.3 }}
      style={{
        position: 'absolute',
        left: `${zone.x}%`,
        top: `${zone.y}%`,
        width: `${zone.size}%`,
        height: `${zone.size * 0.8}%`,
        background: getColor(),
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'clamp(16px, 3vw, 32px)',
        fontWeight: 900,
        color: zone.type === 'chiffre' ? '#2e7d32' : '#e65100',
        border: selected ? `3px solid ${CC.yellow}` : '2px solid rgba(0,0,0,0.1)',
        boxShadow: selected 
          ? `0 0 20px ${CC.yellow}88, 0 4px 12px rgba(0,0,0,0.2)` 
          : '0 4px 12px rgba(0,0,0,0.15)',
        cursor: found ? 'default' : 'pointer',
        transform: `rotate(${zone.angle}deg)`,
        zIndex: selected ? 10 : 1,
      }}
    >
      {zone.content}
    </motion.div>
  );
};

// Écran titre
const TitleScreen = ({ onStart }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{
      position: 'fixed', inset: 0,
      background: CC.bgGradient,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'white', textAlign: 'center',
    }}
  >
    <Confetti active={true} />
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 100, delay: 0.3 }}
      style={{ fontSize: 120, marginBottom: 20 }}
    >
      🃏
    </motion.div>
    <motion.h1
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5 }}
      style={{ fontSize: 'clamp(32px, 8vw, 72px)', fontWeight: 900, marginBottom: 16 }}
    >
      CRAZY CHRONO
    </motion.h1>
    <motion.p
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.7 }}
      style={{ fontSize: 'clamp(18px, 3vw, 28px)', color: CC.yellow, fontWeight: 700 }}
    >
      Le jeu qui rend les maths addictives !
    </motion.p>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.2 }}
      style={{ marginTop: 40, fontSize: 14, color: 'rgba(255,255,255,0.6)' }}
    >
      Cliquez pour commencer la démo
    </motion.div>
    <motion.button
      onClick={onStart}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      style={{
        marginTop: 20,
        padding: '16px 40px',
        borderRadius: 16,
        border: 'none',
        background: `linear-gradient(135deg, ${CC.yellow}, #ff6b35)`,
        color: 'white',
        fontSize: 20,
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: '0 8px 32px rgba(245,166,35,0.4)',
      }}
    >
      ▶ DÉMARRER
    </motion.button>
  </motion.div>
);

// Écran de jeu
const GameScreen = ({ onComplete, onHandMove }) => {
  const [selected, setSelected] = useState([]);
  const [found, setFound] = useState([]);
  const [bubbles, setBubbles] = useState(null);
  const [handPos, setHandPos] = useState({ x: 100, y: 100 });
  const [handClicking, setHandClicking] = useState(false);
  const [handVisible, setHandVisible] = useState(false);
  const demoStep = useRef(0);

  // Démo automatique avec la main
  useEffect(() => {
    const runDemo = async () => {
      setHandVisible(true);
      
      // Étape 1: Cliquer sur calc1
      await new Promise(r => setTimeout(r, 1000));
      const calc1 = DEMO_ZONES.find(z => z.id === 'calc1');
      setHandPos({ x: window.innerWidth * (calc1.x / 100) + 50, y: window.innerHeight * (calc1.y / 100) + 50 });
      await new Promise(r => setTimeout(r, 500));
      setHandClicking(true);
      await new Promise(r => setTimeout(r, 200));
      handleZoneClick(calc1);
      setHandClicking(false);
      
      // Étape 2: Cliquer sur c1
      await new Promise(r => setTimeout(r, 800));
      const c1 = DEMO_ZONES.find(z => z.id === 'c1');
      setHandPos({ x: window.innerWidth * (c1.x / 100) + 50, y: window.innerHeight * (c1.y / 100) + 50 });
      await new Promise(r => setTimeout(r, 500));
      setHandClicking(true);
      await new Promise(r => setTimeout(r, 200));
      handleZoneClick(c1);
      setHandClicking(false);
    };
    
    runDemo();
  }, []);

  const handleZoneClick = (zone) => {
    if (found.includes(zone.id)) return;
    
    if (selected.find(s => s.id === zone.id)) {
      setSelected(selected.filter(s => s.id !== zone.id));
      return;
    }

    const newSelected = [...selected, zone];
    setSelected(newSelected);

    if (newSelected.length === 2) {
      const pair = PAIRS.find(p => 
        (p.calc === newSelected[0].id && p.chiffre === newSelected[1].id) ||
        (p.calc === newSelected[1].id && p.chiffre === newSelected[0].id)
      );

      if (pair) {
        // Paire trouvée !
        const rect1 = document.getElementById(`zone-${newSelected[0].id}`)?.getBoundingClientRect();
        if (rect1) {
          setBubbles({ x: rect1.left + rect1.width/2, y: rect1.top + rect1.height/2, color: '#FFD34D' });
        }
        setTimeout(() => setFound([...found, newSelected[0].id, newSelected[1].id]), 300);
        setTimeout(() => setBubbles(null), 1200);
      }
      
      setTimeout(() => setSelected([]), 500);
    }
  };

  const progress = (found.length / DEMO_ZONES.length) * 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0,
        background: CC.bgGradient,
        display: 'flex', flexDirection: 'column',
        padding: 20,
      }}
    >
      <Confetti active={progress >= 50} />
      <FlyingBubbles {...bubbles} active={!!bubbles} />
      <HandCursor {...handPos} clicking={handClicking} visible={handVisible} />

      {/* Header */}
      <div style={{ textAlign: 'center', color: 'white', marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Trouvez les paires !</h2>
        <p style={{ fontSize: 16, opacity: 0.8 }}>Cliquez sur un calcul puis sur son résultat</p>
      </div>

      {/* Carte */}
      <div style={{
        flex: 1,
        position: 'relative',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 24,
        border: '2px solid rgba(255,255,255,0.2)',
        overflow: 'hidden',
      }}>
        {DEMO_ZONES.map(zone => (
          <div key={zone.id} id={`zone-${zone.id}`}>
            <CardZone
              zone={zone}
              onClick={handleZoneClick}
              selected={!!selected.find(s => s.id === zone.id)}
              found={found.includes(zone.id)}
            />
          </div>
        ))}
      </div>

      {/* Progress */}
      <div style={{ marginTop: 20 }}>
        <div style={{
          height: 8,
          background: 'rgba(255,255,255,0.2)',
          borderRadius: 4,
          overflow: 'hidden',
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            style={{ height: '100%', background: CC.yellow }}
          />
        </div>
        <p style={{ color: 'white', textAlign: 'center', marginTop: 8 }}>
          {found.length / 2} / {PAIRS.length} paires trouvées
        </p>
      </div>

      {progress === 100 && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onComplete}
          style={{
            marginTop: 20,
            padding: '16px 32px',
            borderRadius: 12,
            border: 'none',
            background: `linear-gradient(135deg, ${CC.yellow}, #ff6b35)`,
            color: 'white',
            fontSize: 18,
            fontWeight: 800,
            cursor: 'pointer',
            alignSelf: 'center',
          }}
        >
          CONTINUER →
        </motion.button>
      )}
    </motion.div>
  );
};

// Écran des modes
const ModesScreen = ({ onComplete }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{
      position: 'fixed', inset: 0,
      background: CC.bgGradient,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'white', padding: 40,
    }}
  >
    <Confetti active={true} />
    <motion.h2
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, marginBottom: 40, textAlign: 'center' }}
    >
      3 modes de jeu
    </motion.h2>

    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
      {[
        { icon: '👤', title: 'Solo', desc: 'Entraînez-vous à votre rythme', color: '#34d399' },
        { icon: '🏟️', title: 'Grande Salle', desc: 'Affrontez jusqu\'à 100 joueurs', color: '#f472b6' },
        { icon: '🎓', title: 'Classe', desc: 'Défis entre camarades', color: '#60a5fa' },
      ].map((mode, i) => (
        <motion.div
          key={mode.title}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: i * 0.2, type: 'spring' }}
          whileHover={{ scale: 1.05, y: -10 }}
          style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 24,
            padding: '32px 24px',
            width: 260,
            textAlign: 'center',
            border: `2px solid ${mode.color}44`,
            boxShadow: `0 8px 32px ${mode.color}22`,
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>{mode.icon}</div>
          <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: mode.color }}>{mode.title}</h3>
          <p style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>{mode.desc}</p>
        </motion.div>
      ))}
    </div>

    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
      onClick={onComplete}
      style={{
        marginTop: 40,
        padding: '16px 40px',
        borderRadius: 16,
        border: 'none',
        background: `linear-gradient(135deg, ${CC.yellow}, #ff6b35)`,
        color: 'white',
        fontSize: 18,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      DÉCOUVREZ LE JEU →
    </motion.button>
  </motion.div>
);

// Écran final CTA
const FinalScreen = ({ onRestart }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{
      position: 'fixed', inset: 0,
      background: CC.bgGradient,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'white', textAlign: 'center', padding: 40,
    }}
  >
    <Confetti active={true} />
    
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', delay: 0.2 }}
      style={{ fontSize: 100, marginBottom: 20 }}
    >
      🏆
    </motion.div>

    <motion.h2
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.4 }}
      style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 900, marginBottom: 20 }}
    >
      Rejoignez l'aventure !
    </motion.h2>

    <motion.p
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.6 }}
      style={{ fontSize: 20, opacity: 0.9, marginBottom: 30 }}
    >
      Gratuit • Sans pub • Pour tous les niveaux
    </motion.p>

    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.8 }}
      style={{
        background: 'white',
        padding: 20,
        borderRadius: 16,
        marginBottom: 30,
      }}
    >
      <div style={{ color: '#333', fontSize: 14, marginBottom: 8 }}>Scannez pour jouer</div>
      <img 
        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent('https://app.crazy-chrono.com')}&color=0D6A7A`}
        alt="QR"
        style={{ width: 180, height: 180 }}
      />
    </motion.div>

    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
      style={{ fontSize: 24, fontWeight: 800, color: CC.yellow }}
    >
      crazy-chrono.com
    </motion.div>

    <motion.button
      onClick={onRestart}
      whileHover={{ scale: 1.05 }}
      style={{
        marginTop: 30,
        padding: '12px 24px',
        borderRadius: 12,
        border: '2px solid rgba(255,255,255,0.3)',
        background: 'transparent',
        color: 'white',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      ↻ Revoir la démo
    </motion.button>
  </motion.div>
);

// Composant principal
export default function PromoVideoPage() {
  const [screen, setScreen] = useState('title');
  const navigate = useNavigate();

  return (
    <AnimatePresence mode="wait">
      {screen === 'title' && (
        <TitleScreen key="title" onStart={() => setScreen('game')} />
      )}
      {screen === 'game' && (
        <GameScreen key="game" onComplete={() => setScreen('modes')} />
      )}
      {screen === 'modes' && (
        <ModesScreen key="modes" onComplete={() => setScreen('final')} />
      )}
      {screen === 'final' && (
        <FinalScreen key="final" onRestart={() => setScreen('title')} />
      )}
    </AnimatePresence>
  );
}
