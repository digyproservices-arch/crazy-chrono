import React, { useState, useEffect, useRef } from 'react';

const CC = {
  yellow: '#F5A623',
  bgGradient: 'radial-gradient(ellipse at 50% 120%, #1AACBE 0%, #0D6A7A 55%, #073B45 100%)',
};

// Confettis
const Confetti = ({ active }) => {
  if (!active) return null;
  const colors = ['#FFD34D', '#F5A623', '#FF6B35', '#34d399', '#60a5fa', '#f472b6'];
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 100 }}>
      {Array.from({ length: 30 }).map((_, i) => (
        <div key={i} className="confetti-fall" style={{
          position: 'absolute', left: `${Math.random() * 100}%`, width: 8 + Math.random() * 8,
          height: 8 + Math.random() * 8, background: colors[i % colors.length],
          borderRadius: i % 3 === 0 ? '50%' : 2, animationDelay: `${Math.random() * 2}s`,
          animationDuration: `${3 + Math.random() * 2}s`,
        }} />
      ))}
    </div>
  );
};

// Main animée
const HandCursor = ({ x, y, clicking, visible }) => {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed', left: x, top: y, width: 60, height: 60, pointerEvents: 'none',
      zIndex: 1000, fontSize: 50, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
      transition: 'transform 0.3s ease', transform: clicking ? 'scale(0.9)' : 'scale(1)',
    }}>👆</div>
  );
};

// Bulles
const FlyingBubbles = ({ startX, startY, color, active }) => {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flying-bubble" style={{
          position: 'fixed', left: startX + (Math.random() - 0.5) * 200,
          top: startY - 100 - Math.random() * 150, width: 20 + Math.random() * 20,
          height: 20 + Math.random() * 20, borderRadius: '50%', background: color,
          pointerEvents: 'none', zIndex: 999, animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </>
  );
};

// Zone de carte
const CardZone = ({ zone, onClick, selected, found }) => {
  const bg = found ? '#10b981' : selected ? CC.yellow : zone.type === 'chiffre' ? '#e8f5e9' : '#fff3e0';
  return (
    <div onClick={() => onClick(zone)} className={`card-zone ${found ? 'found' : ''}`}
      style={{
        position: 'absolute', left: `${zone.x}%`, top: `${zone.y}%`,
        width: `${zone.size}%`, height: `${zone.size * 0.8}%`, background: bg,
        borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'clamp(16px, 3vw, 32px)', fontWeight: 900,
        color: zone.type === 'chiffre' ? '#2e7d32' : '#e65100',
        border: selected ? `3px solid ${CC.yellow}` : '2px solid rgba(0,0,0,0.1)',
        boxShadow: selected ? `0 0 20px ${CC.yellow}88` : '0 4px 12px rgba(0,0,0,0.15)',
        cursor: found ? 'default' : 'pointer', transform: `rotate(${zone.angle}deg)`,
        zIndex: selected ? 10 : 1, transition: 'all 0.3s ease',
      }}>{zone.content}</div>
  );
};

const ZONES = [
  { id: 'c1', type: 'chiffre', content: '12', x: 15, y: 15, size: 12, angle: 0 },
  { id: 'c2', type: 'chiffre', content: '7', x: 75, y: 20, size: 12, angle: 45 },
  { id: 'c3', type: 'chiffre', content: '3', x: 20, y: 75, size: 12, angle: -30 },
  { id: 'c4', type: 'chiffre', content: '9', x: 70, y: 70, size: 12, angle: 15 },
  { id: 'calc1', type: 'calcul', content: '4×3', x: 35, y: 35, size: 10, angle: 0 },
  { id: 'calc2', type: 'calcul', content: '5+2', x: 55, y: 45, size: 10, angle: 0 },
  { id: 'calc3', type: 'calcul', content: '6+3', x: 45, y: 60, size: 10, angle: 0 },
  { id: 'calc4', type: 'calcul', content: '3×4', x: 30, y: 55, size: 10, angle: 0 },
];

const PAIRS = [
  { calc: 'calc1', chiffre: 'c1' }, { calc: 'calc2', chiffre: 'c2' },
  { calc: 'calc3', chiffre: 'c4' }, { calc: 'calc4', chiffre: 'c3' },
];

// Écran Titre
const TitleScreen = ({ onStart }) => (
  <div className="screen" style={{ animation: 'fadeIn 0.5s ease' }}>
    <Confetti active={true} />
    <div style={{ fontSize: 120, marginBottom: 20, animation: 'bounceIn 0.8s ease' }}>🃏</div>
    <h1 style={{ animation: 'slideUp 0.6s ease 0.3s both' }}>CRAZY CHRONO</h1>
    <p style={{ color: CC.yellow, animation: 'slideUp 0.6s ease 0.5s both' }}>Le jeu qui rend les maths addictives !</p>
    <button className="btn-promo" onClick={onStart}>▶ DÉMARRER</button>
  </div>
);

// Écran Jeu
const GameScreen = ({ onComplete }) => {
  const [selected, setSelected] = useState([]);
  const [found, setFound] = useState([]);
  const [bubbles, setBubbles] = useState(null);
  const [hand, setHand] = useState({ x: 100, y: 100, clicking: false, visible: false });

  useEffect(() => {
    const run = async () => {
      setHand({ x: 100, y: 100, clicking: false, visible: true });
      await new Promise(r => setTimeout(r, 1000));
      const c1 = ZONES.find(z => z.id === 'calc1');
      setHand({ x: window.innerWidth * (c1.x / 100) + 50, y: window.innerHeight * (c1.y / 100) + 50, clicking: false, visible: true });
      await new Promise(r => setTimeout(r, 500));
      setHand({ x: window.innerWidth * (c1.x / 100) + 50, y: window.innerHeight * (c1.y / 100) + 50, clicking: true, visible: true });
      handleClick(c1);
      await new Promise(r => setTimeout(r, 200));
      setHand({ x: window.innerWidth * (c1.x / 100) + 50, y: window.innerHeight * (c1.y / 100) + 50, clicking: false, visible: true });
    };
    run();
  }, []);

  const handleClick = (zone) => {
    if (found.includes(zone.id)) return;
    if (selected.find(s => s.id === zone.id)) {
      setSelected(selected.filter(s => s.id !== zone.id)); return;
    }
    const newSel = [...selected, zone];
    setSelected(newSel);
    if (newSel.length === 2) {
      const pair = PAIRS.find(p => (p.calc === newSel[0].id && p.chiffre === newSel[1].id) || (p.calc === newSel[1].id && p.chiffre === newSel[0].id));
      if (pair) {
        const el = document.getElementById(`zone-${newSel[0].id}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          setBubbles({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, color: '#FFD34D' });
        }
        setTimeout(() => setFound([...found, newSel[0].id, newSel[1].id]), 300);
        setTimeout(() => setBubbles(null), 1200);
      }
      setTimeout(() => setSelected([]), 500);
    }
  };

  const progress = (found.length / ZONES.length) * 100;

  return (
    <div className="screen" style={{ padding: 20 }}>
      <Confetti active={progress >= 50} />
      <FlyingBubbles {...bubbles} active={!!bubbles} />
      <HandCursor {...hand} />
      <div style={{ textAlign: 'center', color: 'white', marginBottom: 20 }}>
        <h2>Trouvez les paires !</h2>
        <p>Cliquez sur un calcul puis sur son résultat</p>
      </div>
      <div style={{ flex: 1, position: 'relative', background: 'rgba(255,255,255,0.1)', borderRadius: 24, border: '2px solid rgba(255,255,255,0.2)' }}>
        {ZONES.map(zone => <div key={zone.id} id={`zone-${zone.id}`}><CardZone zone={zone} onClick={handleClick} selected={!!selected.find(s => s.id === zone.id)} found={found.includes(zone.id)} /></div>)}
      </div>
      <div style={{ marginTop: 20 }}>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 4 }}>
          <div style={{ width: `${progress}%`, height: '100%', background: CC.yellow, transition: 'width 0.5s' }} />
        </div>
        <p style={{ color: 'white', textAlign: 'center' }}>{found.length / 2} / {PAIRS.length} paires</p>
      </div>
      {progress === 100 && <button className="btn-promo" onClick={onComplete}>CONTINUER →</button>}
    </div>
  );
};

// Écran Modes
const ModesScreen = ({ onComplete }) => (
  <div className="screen" style={{ animation: 'fadeIn 0.5s ease' }}>
    <Confetti active={true} />
    <h2 style={{ animation: 'slideDown 0.6s ease' }}>3 modes de jeu</h2>
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
      {[{ icon: '👤', title: 'Solo', desc: 'Entraînez-vous', color: '#34d399' }, { icon: '🏟️', title: 'Grande Salle', desc: '100 joueurs', color: '#f472b6' }, { icon: '🎓', title: 'Classe', desc: 'Défis amicaux', color: '#60a5fa' }].map((m, i) => (
        <div key={m.title} className="mode-card" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: '32px 24px', width: 260, textAlign: 'center', border: `2px solid ${m.color}44`, boxShadow: `0 8px 32px ${m.color}22`, animation: `popIn 0.5s ease ${i * 0.2}s both` }}>
          <div style={{ fontSize: 56 }}>{m.icon}</div>
          <h3 style={{ color: m.color }}>{m.title}</h3>
          <p>{m.desc}</p>
        </div>
      ))}
    </div>
    <button className="btn-promo" onClick={onComplete} style={{ marginTop: 40 }}>DÉCOUVREZ →</button>
  </div>
);

// Écran Final
const FinalScreen = ({ onRestart }) => (
  <div className="screen" style={{ animation: 'fadeIn 0.5s ease' }}>
    <Confetti active={true} />
    <div style={{ fontSize: 100, animation: 'bounceIn 0.8s ease' }}>🏆</div>
    <h2 style={{ animation: 'slideUp 0.6s ease 0.3s both' }}>Rejoignez l'aventure !</h2>
    <p style={{ animation: 'slideUp 0.6s ease 0.5s both' }}>Gratuit • Sans pub • Pour tous</p>
    <div className="qr-pulse" style={{ background: 'white', padding: 20, borderRadius: 16, marginBottom: 30, animation: 'popIn 0.5s ease 0.7s both' }}>
      <div style={{ color: '#333' }}>Scannez pour jouer</div>
      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent('https://app.crazy-chrono.com')}&color=0D6A7A`} alt="QR" style={{ width: 180, height: 180 }} />
    </div>
    <div style={{ fontSize: 24, fontWeight: 800, color: CC.yellow, animation: 'fadeIn 0.5s ease 0.9s both' }}>crazy-chrono.com</div>
    <button className="btn-outline" onClick={onRestart}>↻ Revoir</button>
  </div>
);

export default function VideoPromo() {
  const [screen, setScreen] = useState('title');

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounceIn { 0% { opacity: 0; transform: scale(0); } 60% { transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes confettiFall { 0% { transform: translateY(-20px) rotate(0); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }
        @keyframes flyingBubble { 0% { transform: scale(0); opacity: 1; } 50% { transform: scale(1.5); } 100% { transform: scale(0); opacity: 0; } }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .confetti-fall { animation: confettiFall linear infinite; }
        .flying-bubble { animation: flyingBubble 1.2s ease forwards; }
        .qr-pulse { animation: pulse 2s ease-in-out infinite; }
        .card-zone:hover:not(.found) { transform: scale(1.05) !important; }
        .card-zone.found { opacity: 0.4; animation: foundPulse 0.5s; }
        @keyframes foundPulse { 50% { transform: scale(1.1); } }
        .screen { position: fixed; inset: 0; background: ${CC.bgGradient}; display: flex; flexDirection: column; alignItems: center; justifyContent: center; color: white; textAlign: center; }
        .screen h1 { fontSize: clamp(32px, 8vw, 72px); fontWeight: 900; marginBottom: 16; }
        .screen h2 { fontSize: clamp(28px, 5vw, 48px); fontWeight: 900; marginBottom: 40; }
        .screen h3 { fontSize: 24; fontWeight: 800; marginBottom: 8; }
        .screen p { fontSize: 18; opacity: 0.9; }
        .btn-promo { padding: 16px 40px; borderRadius: 16; border: none; background: linear-gradient(135deg, #F5A623, #ff6b35); color: white; fontSize: 20; fontWeight: 800; cursor: pointer; boxShadow: 0 8px 32px rgba(245,166,35,0.4); transition: transform 0.2s; marginTop: 20; }
        .btn-promo:hover { transform: scale(1.05); }
        .btn-promo:active { transform: scale(0.95); }
        .btn-outline { marginTop: 30; padding: 12px 24px; borderRadius: 12; border: 2px solid rgba(255,255,255,0.3); background: transparent; color: white; fontSize: 14; cursor: pointer; }
        .btn-outline:hover { background: rgba(255,255,255,0.1); }
        .mode-card { transition: transform 0.3s; }
        .mode-card:hover { transform: scale(1.05) translateY(-10px) !important; }
      `}</style>
      {screen === 'title' && <TitleScreen onStart={() => setScreen('game')} />}
      {screen === 'game' && <GameScreen onComplete={() => setScreen('modes')} />}
      {screen === 'modes' && <ModesScreen onComplete={() => setScreen('final')} />}
      {screen === 'final' && <FinalScreen onRestart={() => setScreen('title')} />}
    </>
  );
}
