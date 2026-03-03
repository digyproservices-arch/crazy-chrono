import React, { useState, useEffect, useCallback, useRef } from 'react';

const TIER_CONFIG = {
  bronze: {
    emoji: '🥉',
    label: 'DÉCOUVERTE',
    bg: 'linear-gradient(135deg, #92400e 0%, #d97706 40%, #fbbf24 60%, #d97706 100%)',
    glow: 'rgba(217, 119, 6, 0.5)',
    text: '#fffbeb',
    accent: '#fbbf24',
  },
  silver: {
    emoji: '🥈',
    label: 'MAÎTRISE',
    bg: 'linear-gradient(135deg, #475569 0%, #94a3b8 40%, #e2e8f0 60%, #94a3b8 100%)',
    glow: 'rgba(148, 163, 184, 0.5)',
    text: '#f8fafc',
    accent: '#e2e8f0',
  },
  gold: {
    emoji: '🥇',
    label: 'EXCELLENCE',
    bg: 'linear-gradient(135deg, #92400e 0%, #f59e0b 30%, #fef3c7 50%, #f59e0b 70%, #92400e 100%)',
    glow: 'rgba(245, 158, 11, 0.6)',
    text: '#fffbeb',
    accent: '#fef3c7',
  },
};

const DISPLAY_MS = 3200;

export default function MasteryBubble({ event, onDone }) {
  const [phase, setPhase] = useState('hidden'); // hidden | enter | show | exit
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const stableDone = useCallback(() => {
    if (doneRef.current) doneRef.current();
  }, []);

  useEffect(() => {
    if (!event) { setPhase('hidden'); return; }
    setPhase('enter');
    const t1 = setTimeout(() => setPhase('show'), 80);
    const t2 = setTimeout(() => setPhase('exit'), DISPLAY_MS - 600);
    const t3 = setTimeout(() => { setPhase('hidden'); stableDone(); }, DISPLAY_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [event, stableDone]);

  // Spawn particles on enter
  const containerRef = useRef(null);
  useEffect(() => {
    if (phase !== 'show' || !event) return;
    const tier = TIER_CONFIG[event.tier] || TIER_CONFIG.bronze;
    const root = document.body;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (let i = 0; i < 24; i++) {
      const d = document.createElement('div');
      const size = 4 + Math.random() * 6;
      const angle = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.4;
      const dist = 80 + Math.random() * 160;
      d.style.cssText = `position:fixed;z-index:100001;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${tier.accent};border-radius:50%;pointer-events:none;`;
      root.appendChild(d);
      d.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0.3)`, opacity: 0 },
      ], { duration: 800 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => d.remove();
    }
  }, [phase, event]);

  if (phase === 'hidden' || !event) return null;

  const tier = TIER_CONFIG[event.tier] || TIER_CONFIG.bronze;

  const opacity = phase === 'enter' ? 0 : phase === 'exit' ? 0 : 1;
  const scale = phase === 'enter' ? 0.4 : phase === 'exit' ? 0.85 : 1;
  const transition = phase === 'enter'
    ? 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease'
    : 'transform 0.45s ease, opacity 0.4s ease';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100000, pointerEvents: 'none',
        background: phase === 'show' ? 'rgba(0,0,0,0.3)' : 'transparent',
        transition: 'background 0.4s ease',
      }}
    >
      <div style={{
        background: tier.bg,
        borderRadius: 20,
        padding: '32px 52px',
        textAlign: 'center',
        boxShadow: `0 0 80px ${tier.glow}, 0 0 40px ${tier.glow}, 0 8px 32px rgba(0,0,0,0.4)`,
        transform: `scale(${scale})`,
        opacity,
        transition,
        maxWidth: '88vw',
        border: `2px solid ${tier.accent}44`,
      }}>
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 10, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }}>
          {tier.emoji}
        </div>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 4, color: tier.text,
          opacity: 0.7, marginBottom: 6, textTransform: 'uppercase',
        }}>
          THÈME MAÎTRISÉ
        </div>
        <div style={{
          fontSize: 28, fontWeight: 900, color: tier.text, lineHeight: 1.2,
          marginBottom: 8, textShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {event.label}
        </div>
        <div style={{
          display: 'inline-block', padding: '4px 18px', borderRadius: 20,
          background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)',
        }}>
          <span style={{
            fontSize: 15, fontWeight: 800, letterSpacing: 3,
            color: tier.accent, textTransform: 'uppercase',
          }}>
            {tier.label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: tier.text, opacity: 0.6, marginTop: 10 }}>
          {event.total}/{event.total} paires validées
        </div>
      </div>
    </div>
  );
}
