import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import InteractiveDemo, { PointerHand } from './InteractiveDemo';

// ==========================================
// PAGE PRÉSENTATION ANIMÉE — Crazy Chrono
// Maquettes réalistes des vraies interfaces
// Pour démo rectorat, enseignants, visiteurs
// ==========================================

const CC = {
  teal: '#1AACBE', tealDark: '#148A9C', tealDeep: '#0D6A7A',
  yellow: '#F5A623', yellowLt: '#FFC940',
  brown: '#4A3728', brownLt: '#6B5443',
  white: '#FFFFFF', cream: '#FFF9F0',
  green: '#10b981', red: '#ef4444', blue: '#3b82f6',
  purple: '#8b5cf6', orange: '#f97316', pink: '#ec4899',
};

const PLAYER_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];
const PLAYER_NAMES = ['Emma', 'Lucas', 'Jade', 'Noah'];
const PLAYER_SCORES = [12, 10, 8, 6];

// ============ MOCK UI HELPERS ============

const Pill = ({ children, selected, color, bg }) => (
  <span style={{
    padding: '6px 14px', borderRadius: 10,
    border: selected ? `2px solid ${color || CC.tealDeep}` : '2px solid #e2e8f0',
    background: selected ? (color || CC.tealDeep) : (bg || '#fff'),
    color: selected ? '#fff' : '#475569',
    fontWeight: 700, fontSize: 13, display: 'inline-block',
  }}>{children}</span>
);

const Card = ({ children, style }) => (
  <div style={{
    background: '#fff', borderRadius: 16, padding: '16px 20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
    ...style,
  }}>{children}</div>
);

const GlassCard = ({ children, style }) => (
  <div style={{
    background: 'rgba(0,0,0,0.25)', borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.18)',
    padding: '14px 16px', backdropFilter: 'blur(8px)',
    ...style,
  }}>{children}</div>
);


// ============ MOCK SCOREBOARD (sidebar game) ============
const MockScoreboard = ({ scores, timeLeft, round, animIdx, width = 280 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width }}>
    <GlassCard>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          background: timeLeft < 10 ? 'rgba(220,38,38,0.85)' : 'rgba(0,0,0,0.3)',
          borderRadius: 14, padding: '8px 18px', border: '1px solid rgba(255,255,255,0.12)',
          fontSize: 24, fontWeight: 900, color: timeLeft < 10 ? '#fff' : '#10b981',
          fontFamily: 'monospace',
        }}>⏱ {timeLeft}s</div>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 14, padding: '8px 18px', border: '1px solid rgba(255,255,255,0.12)', fontSize: 16, fontWeight: 700, color: '#fff' }}>
          Manche {round} / 5
        </div>
      </div>
    </GlassCard>
    <GlassCard>
      <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#fff' }}>🏆 Classement</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scores.map((s, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 12,
            background: idx === animIdx ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${idx === animIdx ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
            transition: 'all 0.5s ease',
            transform: idx === animIdx ? 'scale(1.03)' : 'scale(1)',
          }}>
            <div style={{ fontSize: idx === 0 ? 26 : 18, fontWeight: 900, minWidth: 30, textAlign: 'center' }}>
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '4.'}
            </div>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: `linear-gradient(135deg, ${s.color}, ${s.color}88)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>{s.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{s.name}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{s.pairs} paires</div>
            </div>
            <div style={{
              background: '#fff', borderRadius: 12, padding: '4px 14px',
              minWidth: 44, textAlign: 'center',
            }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1.1 }}>{s.score}</div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
    <GlassCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, background: PLAYER_COLORS[0] }} />
        <span style={{ fontSize: 15, color: '#fff' }}><b>Emma</b>: 🐬 Dauphin ↔ Dauphin</span>
      </div>
    </GlassCard>
  </div>
);

// ============ MOCK TEACHER STUDENT LIST ============
const MockStudentList = ({ selected, phase }) => {
  const students = [
    { name: 'Alice Martin', level: 'CM1', perf: 85 },
    { name: 'Bob Dupont', level: 'CM2', perf: 72 },
    { name: 'Chloé Petit', level: 'CM1', perf: 91 },
    { name: 'David Bernard', level: 'CE2', perf: 68 },
    { name: 'Eva Thomas', level: 'CM2', perf: 78 },
    { name: 'Félix Roux', level: 'CM1', perf: 55 },
    { name: 'Gabrielle Moreau', level: 'CE2', perf: 82 },
    { name: 'Hugo Laurent', level: 'CM2', perf: 64 },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
      {students.map((s, i) => {
        const isSel = selected.includes(i);
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            background: isSel ? 'rgba(26,172,190,0.12)' : '#fff',
            border: isSel ? '2px solid #1AACBE' : '1px solid #e2e8f0',
            cursor: 'pointer', transition: 'all 0.3s',
            animation: (phase >= 2 && selected.includes(i)) ? 'presGlow 1s ease-in-out' : 'none',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: isSel ? 'linear-gradient(135deg, #1AACBE, #0D6A7A)' : '#e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: isSel ? '#fff' : '#64748b',
            }}>{s.name[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{s.level} • {s.perf}%</div>
            </div>
            {isSel && <span style={{ fontSize: 16 }}>✓</span>}
          </div>
        );
      })}
    </div>
  );
};

// ============ MOCK TOURNAMENT BRACKET ============
const MockBracket = ({ phase }) => {
  const groups = [
    { name: 'Groupe A', players: ['Alice', 'Bob', 'Chloé', 'David'], winner: 'Alice' },
    { name: 'Groupe B', players: ['Eva', 'Félix', 'Gabrielle', 'Hugo'], winner: 'Eva' },
    { name: 'Groupe C', players: ['Inès', 'Jules', 'Karim', 'Léa'], winner: 'Inès' },
    { name: 'Groupe D', players: ['Marie', 'Nathan', 'Olivia', 'Paul'], winner: 'Marie' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center' }}>
      {/* Phase 1: Groupes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map((g, i) => (
          <div key={i} style={{
            background: phase >= 1 ? '#fff' : 'rgba(255,255,255,0.5)',
            borderRadius: 12, padding: '10px 14px', minWidth: 140,
            border: `2px solid ${phase >= 1 ? CC.teal : '#e2e8f0'}`,
            boxShadow: phase >= 1 ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.5s',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: CC.tealDeep, marginBottom: 4 }}>{g.name}</div>
            {g.players.map((p, j) => (
              <div key={j} style={{
                fontSize: 12, padding: '2px 0', color: '#334155',
                fontWeight: phase >= 2 && p === g.winner ? 800 : 400,
                color: phase >= 2 && p === g.winner ? CC.teal : '#64748b',
              }}>
                {phase >= 2 && p === g.winner ? '🏆 ' : '• '}{p}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Flèches */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 60, opacity: phase >= 2 ? 1 : 0.2, transition: 'opacity 0.5s' }}>
        <div style={{ fontSize: 28 }}>→</div>
        <div style={{ fontSize: 28 }}>→</div>
      </div>
      {/* Demi-finales */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40, opacity: phase >= 2 ? 1 : 0.2, transition: 'opacity 0.5s' }}>
        {[['Alice', 'Eva'], ['Inès', 'Marie']].map((match, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: 12, padding: '12px 16px',
            border: `2px solid ${phase >= 3 ? CC.yellow : CC.teal}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: CC.yellow, marginBottom: 4 }}>Demi-finale {i + 1}</div>
            {match.map((p, j) => (
              <div key={j} style={{
                fontSize: 13, padding: '3px 0',
                fontWeight: phase >= 3 && j === 0 ? 800 : 400,
                color: phase >= 3 && j === 0 ? CC.teal : '#64748b',
              }}>{phase >= 3 && j === 0 ? '🏆 ' : '• '}{p}</div>
            ))}
          </div>
        ))}
      </div>
      {/* Flèche finale */}
      <div style={{ fontSize: 28, opacity: phase >= 3 ? 1 : 0.2, transition: 'opacity 0.5s' }}>→</div>
      {/* Finale */}
      <div style={{
        background: phase >= 4 ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : '#fff',
        borderRadius: 16, padding: '16px 20px',
        border: '3px solid #fbbf24',
        boxShadow: phase >= 4 ? '0 8px 30px rgba(245,166,35,0.4)' : '0 2px 8px rgba(0,0,0,0.1)',
        opacity: phase >= 3 ? 1 : 0.2, transition: 'all 0.5s',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: phase >= 4 ? '#fff' : CC.yellow, marginBottom: 4 }}>🏆 FINALE</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: phase >= 4 ? '#fff' : '#334155' }}>Alice</div>
        <div style={{ fontSize: 12, color: phase >= 4 ? 'rgba(255,255,255,0.8)' : '#64748b' }}>vs</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: phase >= 4 ? '#fff' : '#334155' }}>Inès</div>
        {phase >= 4 && <div style={{ marginTop: 6, fontSize: 24 }}>👑</div>}
      </div>
    </div>
  );
};

// ============ MOCK PODIUM ============
const MockPodium = ({ phase }) => {
  const players = [
    { name: 'Emma', score: 12, pairs: 6, errors: 1, medal: '🥇', place: 1 },
    { name: 'Lucas', score: 10, pairs: 5, errors: 2, medal: '🥈', place: 2 },
    { name: 'Jade', score: 8, pairs: 4, errors: 3, medal: '🥉', place: 3 },
    { name: 'Noah', score: 6, pairs: 3, errors: 4, medal: '🏅', place: 4 },
  ];
  const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd
  const heights = [140, 190, 100];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
      {/* Podium bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {podiumOrder.map((pIdx, i) => {
          const p = players[pIdx];
          const show = phase >= i + 1;
          return (
            <div key={pIdx} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              opacity: show ? 1 : 0.15, transform: show ? 'translateY(0)' : 'translateY(30px)',
              transition: 'all 0.6s ease',
            }}>
              <div style={{ fontSize: 40 }}>{p.medal}</div>
              <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>{p.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Score: {p.score}</div>
              <div style={{
                width: 120, height: heights[i],
                background: i === 1 ? 'linear-gradient(to top, #fbbf24, #f59e0b)' : i === 0 ? 'linear-gradient(to top, #94a3b8, #cbd5e1)' : 'linear-gradient(to top, #b45309, #d97706)',
                borderRadius: '12px 12px 0 0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, fontWeight: 900, color: 'rgba(255,255,255,0.5)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              }}>{p.place}</div>
            </div>
          );
        })}
      </div>
      {/* Cards */}
      {phase >= 4 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {players.map((p, i) => (
            <div key={i} style={{
              background: '#fff', borderRadius: 14, padding: '14px 18px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              border: i === 0 ? '3px solid #fbbf24' : '1px solid #e2e8f0',
              textAlign: 'center', minWidth: 130,
              animation: 'presFadeIn 0.5s ease-out',
              animationDelay: `${i * 0.15}s`, animationFillMode: 'both',
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{p.medal}</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#111', marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: CC.teal }}>{p.score}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Paires: {p.pairs} | Erreurs: {p.errors}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============ MOCK FLOATING BUBBLES ============
const FloatingBubbles = ({ count = 6 }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{
        position: 'absolute',
        left: `${10 + (i * 15) % 80}%`,
        bottom: `-${60 + (i * 20) % 80}px`,
        width: 40 + (i * 7) % 30,
        height: 40 + (i * 7) % 30,
        borderRadius: '50%',
        background: `${[CC.teal, CC.yellow, CC.green, CC.blue, CC.purple, CC.orange][i % 6]}22`,
        border: `2px solid ${[CC.teal, CC.yellow, CC.green, CC.blue, CC.purple, CC.orange][i % 6]}33`,
        animation: `presFloat ${5 + i * 0.8}s ease-in-out infinite`,
        animationDelay: `${i * 0.7}s`,
      }} />
    ))}
  </div>
);

// ============ HELPERS D'ANIMATION (motion design intégré) ============
const cc01 = (x) => Math.max(0, Math.min(1, x));
const ccEaseOut = (t) => 1 - Math.pow(1 - t, 3);
// seg(elapsed, start, durée) -> progression 0..1 avec easing
const ccSeg = (e, start, dur) => ccEaseOut(cc01((e - start) / dur));

// Conteneur animé : apparition (opacité + translation + scale) pilotée par elapsed
const Reveal = ({ e, start = 0, dur = 600, y = 28, x = 0, blur = 0, scaleFrom = 1, style, children }) => {
  const p = ccSeg(e, start, dur);
  return (
    <div style={{
      opacity: p,
      transform: `translate3d(${(1 - p) * x}px, ${(1 - p) * y}px, 0) scale(${scaleFrom + (1 - scaleFrom) * p})`,
      filter: blur ? `blur(${(1 - p) * blur}px)` : undefined,
      willChange: 'transform, opacity',
      ...style,
    }}>{children}</div>
  );
};

// Titre cinétique : révélation mot par mot (flou -> net, montée)
const KineticHeading = ({ e, start = 0, text, accentWords = [], accentColor = CC.yellow, stagger = 80, dur = 520, style }) => {
  const words = text.split(' ');
  return (
    <h2 style={{ display: 'flex', flexWrap: 'wrap', gap: '0 0.26em', margin: 0, ...style }}>
      {words.map((w, i) => {
        const p = ccSeg(e, start + i * stagger, dur);
        return (
          <span key={i} style={{
            display: 'inline-block', opacity: p,
            transform: `translateY(${(1 - p) * 26}px)`,
            filter: `blur(${(1 - p) * 8}px)`,
            color: accentWords.includes(i) ? accentColor : undefined,
          }}>{w}</span>
        );
      })}
    </h2>
  );
};

// Pastille "kicker" (badge de section) animée
const Kicker = ({ e, start = 0, children, bg = CC.teal, color = '#fff' }) => (
  <Reveal e={e} start={start} dur={500} y={18} style={{ display: 'inline-block' }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: bg, color, padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>{children}</span>
  </Reveal>
);

// ============ SCÈNE INTRO (PILOTE — typographie cinétique intégrée) ============
const IntroScene = ({ elapsed: e }) => {
  // Phase A — phrase cinétique mot par mot
  const words = [
    { t: 'Apprendre', start: 300, color: '#fff' },
    { t: 'devient', start: 780, color: '#fff' },
    { t: 'un jeu.', start: 1260, color: CC.yellow },
  ];
  const phraseOut = cc01((e - 2500) / 450);
  const phraseAlive = 1 - phraseOut;

  // Phase B — révélation de la marque
  const bIn = ccSeg(e, 2700, 700);
  const clockIn = ccSeg(e, 2700, 700);
  const tagIn = ccSeg(e, 3900, 700);
  const pills = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e'];

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', color: '#fff' }}>
      <FloatingBubbles count={10} />
      {/* halo lumineux animé */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 44%, rgba(255,201,64,${0.06 + bIn * 0.12}), transparent 60%)`,
      }} />

      {/* Phase A : phrase cinétique */}
      {phraseAlive > 0.01 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexWrap: 'wrap', gap: '0 0.32em',
          padding: '0 6vw', textAlign: 'center',
          opacity: phraseAlive,
          transform: `translateY(calc(-7vh - ${phraseOut * 44}px)) scale(${1 - phraseOut * 0.12})`,
        }}>
          {words.map((w, i) => {
            const p = ccSeg(e, w.start, 520);
            return (
              <span key={i} style={{
                display: 'inline-block',
                fontSize: 'clamp(44px, 8.4vw, 96px)', fontWeight: 900,
                letterSpacing: -2, lineHeight: 1, color: w.color,
                opacity: p, filter: `blur(${(1 - p) * 16}px)`,
                transform: `translateY(${(1 - p) * 64}px) scale(${0.8 + p * 0.2})`,
                textShadow: '0 12px 44px rgba(0,0,0,0.35)',
                marginRight: '0.25em',
              }}>{w.t}</span>
            );
          })}
        </div>
      )}

      {/* Phase B : bloc marque */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 5vw',
        opacity: bIn, transform: `translateY(${(1 - bIn) * 36}px)`, pointerEvents: 'none',
      }}>
        <img
          src={`${process.env.PUBLIC_URL}/images/logo_crazy_chrono.png`}
          alt="Crazy Chrono"
          style={{
            width: 'clamp(200px, 30vw, 380px)', height: 'auto', display: 'block',
            transform: `scale(${0.6 + clockIn * 0.4}) translateY(${(1 - clockIn) * 30}px)`,
            filter: 'drop-shadow(0 18px 50px rgba(0,0,0,0.45))',
          }}
        />

        <p style={{
          margin: 0, fontSize: 'clamp(16px, 2.6vw, 26px)', fontWeight: 600,
          maxWidth: 760, textAlign: 'center', lineHeight: 1.5,
          color: 'rgba(255,255,255,0.92)',
          opacity: tagIn, transform: `translateY(${(1 - tagIn) * 18}px)`,
        }}>Le jeu pédagogique qui transforme l'apprentissage en défi passionnant</p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
          {pills.map((lvl, i) => {
            const p = ccSeg(e, 4500 + i * 110, 450);
            return (
              <span key={lvl} style={{
                fontSize: 'clamp(13px, 1.6vw, 18px)', fontWeight: 800,
                padding: '8px 18px', borderRadius: 999,
                background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)',
                backdropFilter: 'blur(6px)',
                opacity: p, transform: `translateY(${(1 - p) * 16}px) scale(${0.85 + p * 0.15})`,
              }}>{lvl}</span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============ POINTEUR ÉCRAN (main premium réutilisée sur HTML) ============
// La pointe de l'index (origine 0,0 de PointerHand) est calée au point (x,y).
const ScreenPointer = ({ x, y, clicking = false, scale = 1, hidden = false }) => (
  <div style={{
    position: 'absolute', left: x, top: y,
    transform: 'translate(-46px, -6px)',
    pointerEvents: 'none', zIndex: 40,
    opacity: hidden ? 0 : 1,
    transition: 'left 0.55s cubic-bezier(0.45,0,0.2,1), top 0.55s cubic-bezier(0.45,0,0.2,1), opacity 0.3s',
    filter: 'drop-shadow(0 12px 16px rgba(0,0,0,0.4))',
  }}>
    {clicking && (
      <span style={{
        position: 'absolute', left: 46, top: 6, width: 18, height: 18,
        borderRadius: '50%', border: `4px solid ${CC.yellow}`,
        transform: 'translate(-50%,-50%)', animation: 'soloRipple 0.5s ease-out',
      }} />
    )}
    <svg width={140} height={240} viewBox="0 0 140 240">
      <g transform={`translate(46,6) scale(${0.46 * scale}) rotate(-7)`}><PointerHand /></g>
    </svg>
  </div>
);

// ============ PANNEAU RECORD + FLAMME (réplique fidèle de Carte.js) ============
const SoloRecordPanel = ({ score, pairs, recordToBeat, recordPairs, flame, holdRecord }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 300 }}>
    {/* Score live */}
    <div style={{
      background: 'rgba(0,0,0,0.28)', borderRadius: 16, padding: '14px 18px',
      border: '1px solid rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', textAlign: 'center',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Ton score</div>
      <div key={score} style={{ fontSize: 52, fontWeight: 900, color: '#fff', lineHeight: 1, animation: 'soloScorePop 0.45s ease-out' }}>{score}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{pairs} paires trouvées</div>
    </div>

    {/* Bloc record */}
    <div style={{
      background: holdRecord ? 'linear-gradient(135deg, rgba(245,166,35,0.30), rgba(255,107,53,0.18))' : 'rgba(0,0,0,0.28)',
      borderRadius: 16, padding: '14px 18px',
      border: holdRecord ? '1px solid rgba(245,166,35,0.6)' : '1px solid rgba(255,255,255,0.16)',
      backdropFilter: 'blur(8px)', transition: 'all 0.5s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>🏅 Mon record</span>
        <span style={{ fontSize: 18, fontWeight: 900, color: holdRecord ? CC.yellowLt : '#fff' }}>{Math.max(recordPairs, holdRecord ? pairs : recordPairs)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.8)' }}>🔥 Record à battre</span>
        <span style={{ fontSize: 18, fontWeight: 900, color: '#fca5a5' }}>{recordToBeat}</span>
      </div>
      {holdRecord && (
        <div style={{ marginTop: 12, textAlign: 'center', background: CC.yellow, color: CC.tealDeep, borderRadius: 10, padding: '7px 10px', fontSize: 13, fontWeight: 900 }}>
          🏆 Vous détenez le record !
        </div>
      )}
    </div>

    {/* Mode Objectif + Aide */}
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.28)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.16)' }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', marginBottom: 6 }}>🎯 Objectif : 8</div>
        <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 5, width: `${Math.min(100, (pairs / 8) * 100)}%`, background: 'linear-gradient(90deg,#10b981,#34d399)', transition: 'width 0.5s' }} />
        </div>
      </div>
      <div style={{
        background: 'rgba(0,0,0,0.28)', borderRadius: 12, padding: '10px 14px',
        border: '1px solid rgba(255,255,255,0.16)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', minWidth: 78,
      }}>
        <div style={{ fontSize: 22, animation: 'presPulse 1.6s ease-in-out infinite' }}>💡</div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', marginTop: 2 }}>Aide</div>
      </div>
    </div>

    {/* Flamme NOUVEAU RECORD ! */}
    {flame && (
      <div style={{
        background: 'linear-gradient(135deg, #ff6b35, #F5A623)', borderRadius: 16,
        padding: '14px 16px', textAlign: 'center', boxShadow: '0 10px 34px rgba(255,107,53,0.5)',
        animation: 'soloScorePop 0.5s ease-out',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, fontSize: 30, marginBottom: 2 }}>
          <span style={{ animation: 'ccFireFloat 0.9s ease-in-out infinite' }}>🔥</span>
          <span style={{ animation: 'ccFireFloat 0.9s ease-in-out infinite 0.2s' }}>🔥</span>
          <span style={{ animation: 'ccFireFloat 0.9s ease-in-out infinite 0.4s' }}>🔥</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: 0.5, animation: 'ccFirePulse 0.7s ease-in-out infinite' }}>NOUVEAU RECORD !</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginTop: 2 }}>Tu es le nouveau champion ! 👑</div>
      </div>
    )}
  </div>
);

// ============ SCÈNE SOLO (parcours : mode → niveau → partie + record/flamme) ============
const SoloScene = ({ elapsed: e }) => {
  const STEP_LEVEL = 3000;   // ouverture de la sélection de niveau
  const STEP_GAME = 6200;    // début de la partie
  const inModePick = e < STEP_LEVEL;
  const inLevelPick = e >= STEP_LEVEL && e < STEP_GAME;
  const inGame = e >= STEP_GAME;
  const gameE = Math.max(0, e - STEP_GAME);

  // --- Étape 1 : choix du mode (le doigt clique sur Solo) ---
  const modes = [
    { title: 'Apprendre', icon: '📖', grad: 'linear-gradient(135deg,#10b981,#059669)' },
    { title: 'Solo', icon: '🎯', grad: 'linear-gradient(135deg,#1AACBE,#148A9C)' },
    { title: 'Salle Privée', icon: '🔑', grad: 'linear-gradient(135deg,#F5A623,#d4900e)' },
  ];
  const soloPicked = e > 2000;
  // position du doigt : repos → carte Solo (centre) → clic
  const modePointer = e < 900 ? { x: '72%', y: '78%' } : { x: '50%', y: '52%' };
  const modeClicking = e >= 1750 && e < 2150;

  // --- Étape 2 : choix du niveau ---
  const levels = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e'];
  const lvlPicked = e > STEP_LEVEL + 1600;
  const lvlE = e - STEP_LEVEL;
  const lvlPointer = lvlE < 700 ? { x: '24%', y: '78%' }
    : lvlE < 2200 ? { x: '58%', y: '46%' }   // sur CM1
    : { x: '50%', y: '72%' };                 // sur Démarrer
  const lvlClicking = (lvlE >= 1300 && lvlE < 1700) || (lvlE >= 2500 && lvlE < 2900);

  // --- Étape 3 : score / record / flamme ---
  const RECORD_TO_BEAT = 5;
  const scoreSteps = [[600, 1], [1900, 2], [3100, 3], [4300, 4], [5500, 5], [6900, 6], [8400, 7], [10200, 8]];
  let pairs = 0;
  for (const [t, v] of scoreSteps) { if (gameE >= t) pairs = v; }
  const score = pairs; // 1 point / paire pour la démo
  const flame = gameE >= 6900 && gameE < 12200;     // pic "NOUVEAU RECORD"
  const holdRecord = gameE >= 6900;                 // record battu et conservé

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', color: '#fff' }}>
      <FloatingBubbles count={6} />

      {/* En-tête persistant */}
      <div style={{ position: 'absolute', top: 26, left: 0, right: 0, textAlign: 'center', zIndex: 5 }}>
        <Kicker e={e} start={120}>🎯 MODE SOLO · JOUE & BATS TES RECORDS</Kicker>
      </div>

      {/* ÉTAPE 1 — Choix du mode */}
      {inModePick && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <KineticHeading e={e} start={300} text="Choisis ton mode de jeu" accentColor={CC.yellowLt}
            style={{ fontSize: 30, fontWeight: 900, justifyContent: 'center', margin: '0 0 30px' }} />
          <div style={{ display: 'flex', gap: 22 }}>
            {modes.map((m, i) => {
              const isSolo = m.title === 'Solo';
              const active = isSolo && soloPicked;
              return (
                <Reveal key={i} e={e} start={400 + i * 150} dur={550} y={30} scaleFrom={0.9}>
                  <div style={{
                    width: 190, minHeight: 150, background: m.grad, borderRadius: 18, padding: '20px 18px',
                    boxShadow: active ? `0 0 0 4px ${CC.yellow}, 0 18px 40px rgba(0,0,0,0.35)` : '0 12px 30px rgba(0,0,0,0.25)',
                    transform: active ? 'translateY(-8px) scale(1.04)' : 'none', transition: 'all 0.35s',
                  }}>
                    <div style={{ fontSize: 44, marginBottom: 10 }}>{m.icon}</div>
                    <div style={{ fontSize: 22, fontWeight: 900 }}>{m.title}</div>
                    {active && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800, background: 'rgba(255,255,255,0.25)', borderRadius: 8, padding: '4px 8px', display: 'inline-block' }}>✓ Sélectionné</div>}
                  </div>
                </Reveal>
              );
            })}
          </div>
          <ScreenPointer x={modePointer.x} y={modePointer.y} clicking={modeClicking} />
        </div>
      )}

      {/* ÉTAPE 2 — Choix du niveau */}
      {inLevelPick && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 26px' }}>Choisis ton niveau</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 480 }}>
            {levels.map((lv) => {
              const sel = lv === 'CM1' && lvlPicked;
              return (
                <div key={lv} style={{
                  width: 140, padding: '18px 0', textAlign: 'center', borderRadius: 14,
                  background: sel ? CC.yellow : 'rgba(255,255,255,0.12)',
                  color: sel ? CC.tealDeep : '#fff', fontSize: 22, fontWeight: 900,
                  border: `2px solid ${sel ? CC.yellow : 'rgba(255,255,255,0.22)'}`,
                  boxShadow: sel ? '0 10px 28px rgba(245,166,35,0.45)' : 'none', transition: 'all 0.3s',
                }}>{lv}</div>
              );
            })}
          </div>
          <div style={{
            marginTop: 28, padding: '14px 40px', borderRadius: 999, fontSize: 18, fontWeight: 900,
            background: lvlE >= 2500 ? 'linear-gradient(135deg,#10b981,#059669)' : 'rgba(255,255,255,0.16)',
            boxShadow: lvlE >= 2500 ? '0 10px 28px rgba(16,185,129,0.45)' : 'none',
            transform: lvlE >= 2500 ? 'scale(1.05)' : 'none', transition: 'all 0.3s',
          }}>🚀 Démarrer la partie</div>
          <ScreenPointer x={lvlPointer.x} y={lvlPointer.y} clicking={lvlClicking} />
        </div>
      )}

      {/* ÉTAPE 3 — Partie : vraie carte + panneau record */}
      {inGame && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, padding: '70px 40px 30px', flexWrap: 'wrap' }}>
          <Reveal e={e} start={STEP_GAME + 100} dur={650} y={0} scaleFrom={0.92}
            style={{ flex: '0 0 auto', width: 'min(56vh, 460px)' }}>
            <InteractiveDemo maxWidth="100%" finger slow />
          </Reveal>
          <Reveal e={e} start={STEP_GAME + 350} dur={650} x={30} y={0} style={{ flex: '0 0 auto' }}>
            <SoloRecordPanel score={score} pairs={pairs} recordToBeat={RECORD_TO_BEAT} recordPairs={RECORD_TO_BEAT} flame={flame} holdRecord={holdRecord} />
          </Reveal>
        </div>
      )}
    </div>
  );
};

// ============ SLIDES ============
const SLIDES = [
  // 0 — INTRO (pilote motion design : texte intégré à la scène, pas d'overlay)
  {
    id: 'title', duration: 8000,
    caption: null,
    captionPos: 'none',
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
    render: (e) => <IntroScene elapsed={e} />,
  },

  // 1 — ACTE 2 · LES MODES DE JEU (6 modes)
  {
    id: 'modes', duration: 12000,
    caption: '6 façons de jouer : apprendre, jouer seul, défier ou rivaliser',
    captionPos: 'bottom',
    bg: CC.cream,
    render: (e) => {
      const modes = [
        { title: 'Apprendre', icon: '📖', sub: 'Découvre les associations à ton rythme, sans chrono', tag: 'Gratuit', tagBg: CC.green, gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
        { title: 'Solo', icon: '🎯', sub: 'Joue à ton rythme, bats tes records', tag: 'Gratuit', tagBg: CC.green, gradient: 'linear-gradient(135deg, #1AACBE 0%, #148A9C 100%)' },
        { title: 'Salle Privée', icon: '🔑', sub: 'Un code, tes amis, un défi en direct', tag: 'PRO', tagBg: CC.yellow, gradient: 'linear-gradient(135deg, #F5A623 0%, #d4900e 100%)' },
        { title: 'Grande Salle', icon: '🏟️', sub: 'Course éliminatoire + cadeaux partenaires', tag: 'PRO', tagBg: CC.yellow, gradient: 'linear-gradient(135deg, #ff6b35 0%, #F5A623 100%)' },
        { title: 'Entraînement', icon: '🎓', sub: 'Sessions encadrées par le prof, en groupes', tag: 'Classe', tagBg: CC.teal, gradient: 'linear-gradient(135deg, #0D6A7A 0%, #148A9C 100%)' },
        { title: 'Arena', icon: '⚔️', sub: 'Tournoi compétitif : classe → académie', tag: 'Compét.', tagBg: CC.purple, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' },
      ];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '30px 50px' }}>
          <Kicker e={e} start={150}>🎮 ACTE 2 · JOUER</Kicker>
          <KineticHeading e={e} start={400} text="Un mode pour chaque envie" accentColor={CC.teal}
            style={{ fontSize: 38, fontWeight: 900, color: CC.tealDeep, justifyContent: 'center', margin: '12px 0 6px' }} />
          <Reveal e={e} start={950} y={14}>
            <p style={{ fontSize: 15, color: CC.brownLt, margin: '0 0 28px' }}>Du jeu solo à la compétition académique — chacun trouve son terrain</p>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18, maxWidth: 1180, width: '100%' }}>
            {modes.map((m, i) => (
              <Reveal key={i} e={e} start={1300 + i * 200} dur={650} y={40} scaleFrom={0.88}>
                <div style={{
                  position: 'relative', background: m.gradient, borderRadius: 18, padding: '22px 20px',
                  color: '#fff', boxShadow: '0 12px 30px rgba(0,0,0,0.16)', minHeight: 168, overflow: 'hidden',
                }}>
                  <span style={{ position: 'absolute', top: 14, right: 14, background: m.tagBg, color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999 }}>{m.tag}</span>
                  <div style={{ fontSize: 46, marginBottom: 10 }}>{m.icon}</div>
                  <div style={{ fontSize: 21, fontWeight: 800, marginBottom: 8 }}>{m.title}</div>
                  <div style={{ opacity: 0.92, fontSize: 13.5, lineHeight: 1.45 }}>{m.sub}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      );
    },
  },

  // 2 — PARCOURS SOLO (mode → niveau → partie + record/flamme)
  {
    id: 'solo', duration: 19000,
    caption: 'En Solo : choisis ton niveau, joue et bats ton record',
    captionPos: 'bottom',
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
    render: (e) => <SoloScene elapsed={e} />,
  },

  // 3b — DUEL VS — Salle Privée (vraie carte au centre, paires différentes)
  {
    id: 'duel', duration: 14000,
    caption: 'Salle Privée : même carte, chacun trouve ses propres paires',
    captionPos: 'bottom',
    bg: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #1e1b4b 100%)',
    render: (e, phase) => {
      // Chaque joueur remporte des paires DIFFÉRENTES sur la même carte
      const emmaPairs = [
        { icon: '🐬', label: 'Dauphin' },
        { icon: '🦩', label: 'Flamant rose' },
        { icon: '🦅', label: 'Héron vert' },
      ];
      const lucasPairs = [
        { icon: '🔢', label: '10 × 10 = 100' },
        { icon: '➗', label: '146 ÷ 2 = 73' },
      ];
      const emmaShown = Math.min(phase, 3);
      const lucasShown = phase <= 1 ? 0 : phase === 2 ? 1 : 2;
      const win = phase >= 4; // Emma l'emporte 3 paires à 2
      const timeLeft = phase >= 4 ? 0 : phase >= 3 ? 9 : phase >= 2 ? 22 : phase >= 1 ? 38 : 60;

      const Panel = ({ name, color, pairs, shown, dir, isWinner }) => (
        <Reveal e={e} start={dir < 0 ? 500 : 700} dur={650} x={36 * dir} y={0} style={{ flex: '0 0 252px' }}>
          <div style={{
            background: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: '16px 16px 18px',
            border: `1px solid ${isWinner ? color : 'rgba(255,255,255,0.14)'}`,
            boxShadow: isWinner ? `0 0 34px ${color}66` : '0 10px 30px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(8px)', transition: 'all 0.5s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, ${color}, ${color}77)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 900, color: '#fff', border: '3px solid rgba(255,255,255,0.25)',
              }}>{name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{shown} paire{shown > 1 ? 's' : ''}</div>
              </div>
              <div style={{ fontSize: 38, fontWeight: 900, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{shown}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minHeight: 132 }}>
              {pairs.map((p, i) => {
                const visible = i < shown;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10,
                    background: visible ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${visible ? color + '55' : 'rgba(255,255,255,0.05)'}`,
                    opacity: visible ? 1 : 0.25,
                    transform: visible ? 'translateX(0)' : `translateX(${dir * 12}px)`,
                    transition: `all 0.45s ease ${i * 0.05}s`,
                  }}>
                    <span style={{ fontSize: 18 }}>{visible ? p.icon : '❔'}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{visible ? p.label : '—'}</span>
                    {visible && <span style={{ marginLeft: 'auto', fontSize: 13, color }}>✓</span>}
                  </div>
                );
              })}
            </div>
            {isWinner && <div style={{ marginTop: 12, textAlign: 'center', background: '#F5A623', color: '#1e1b4b', fontWeight: 900, padding: '7px 14px', borderRadius: 999, fontSize: 14, animation: 'presPulse 1.2s infinite' }}>👑 VAINQUEUR</div>}
          </div>
        </Reveal>
      );

      return (
        <div style={{ position: 'absolute', inset: 0, color: '#fff', overflow: 'hidden' }}>
          <FloatingBubbles count={6} />
          <div style={{ position: 'absolute', top: 22, left: 0, right: 0, textAlign: 'center', zIndex: 5 }}>
            <Kicker e={e} start={150} bg="linear-gradient(135deg,#8b5cf6,#6d28d9)">🔑 SALLE PRIVÉE · DUEL VS</Kicker>
          </div>
          {/* Chrono partagé */}
          <Reveal e={e} start={900} y={0} style={{ position: 'absolute', top: 66, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
            <div style={{
              background: timeLeft < 10 ? 'rgba(220,38,38,0.85)' : 'rgba(0,0,0,0.35)', borderRadius: 12,
              padding: '6px 18px', fontSize: 22, fontWeight: 900, fontFamily: 'monospace',
              color: timeLeft < 10 ? '#fff' : '#10b981', border: '1px solid rgba(255,255,255,0.15)',
            }}>⏱ {timeLeft}s</div>
          </Reveal>

          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '108px 36px 40px', flexWrap: 'wrap' }}>
            <Panel name="Emma" color="#22c55e" pairs={emmaPairs} shown={emmaShown} dir={-1} isWinner={win} />
            <Reveal e={e} start={650} dur={650} y={0} scaleFrom={0.93} style={{ flex: '0 0 auto', width: 'min(52vh, 420px)' }}>
              <InteractiveDemo maxWidth="100%" finger slow />
            </Reveal>
            <Panel name="Lucas" color="#3b82f6" pairs={lucasPairs} shown={lucasShown} dir={1} isWinner={false} />
          </div>
        </div>
      );
    },
  },

  // 3c — GRANDE SALLE : vagues d'élimination + cadeaux partenaires
  {
    id: 'grande-salle', duration: 14000,
    caption: 'Grande Salle : survis aux vagues, gagne des cadeaux',
    captionPos: 'bottom',
    bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    render: (e, phase) => {
      const waves = [
        { wave: 'Départ', count: 64, finale: false },
        { wave: 'Vague 1', count: 48, finale: false },
        { wave: 'Vague 2', count: 32, finale: false },
        { wave: 'Vague 3', count: 16, finale: false },
        { wave: 'Finale', count: 8, finale: true },
      ];
      const curWave = Math.min(phase, waves.length - 1);
      // Survivants en tête — chacun trouve des paires DIFFÉRENTES sur la même carte
      const survivors = [
        { name: 'Emma', color: '#22c55e', pair: '🐬 Dauphin', score: 9 },
        { name: 'Lucas', color: '#3b82f6', pair: '🔢 10 × 10 = 100', score: 8 },
        { name: 'Jade', color: '#f59e0b', pair: '🦩 Flamant rose', score: 7 },
      ];
      const gifts = [
        { rank: '🥇', who: 'Emma', gift: 'Pass Aquarium', partner: 'Aquasud', icon: '🐬' },
        { rank: '🥈', who: 'Lucas', gift: 'Bon Librairie', partner: 'LivreCo', icon: '📚' },
        { rank: '🥉', who: 'Jade', gift: 'Place de Cinéma', partner: 'CinéStar', icon: '🎬' },
      ];
      return (
        <div style={{ position: 'absolute', inset: 0, color: '#fff', overflow: 'hidden' }}>
          <FloatingBubbles count={6} />
          <div style={{ position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center', zIndex: 5 }}>
            <Kicker e={e} start={150} bg="linear-gradient(135deg, #ff6b35, #F5A623)">🏟️ GRANDE SALLE · COURSE ÉLIMINATOIRE</Kicker>
          </div>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '76px 40px 40px', flexWrap: 'wrap' }}>
            {/* Vraie carte de jeu */}
            <Reveal e={e} start={500} dur={700} y={0} scaleFrom={0.92} style={{ flex: '0 0 auto', width: 'min(50vh, 400px)' }}>
              <InteractiveDemo maxWidth="100%" finger slow />
            </Reveal>

            {/* Colonne droite : vagues + survivants + cadeaux */}
            <div style={{ flex: '0 0 360px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Statut des vagues */}
              <Reveal e={e} start={800} y={16}>
                <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: '12px 14px', backdropFilter: 'blur(8px)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 900 }}>🔥 {waves[curWave].wave}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#F5A623' }}>{waves[curWave].count} survivants</span>
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {waves.map((w, i) => (
                      <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i <= curWave ? (w.finale ? '#F5A623' : 'linear-gradient(90deg,#1AACBE,#0D6A7A)') : 'rgba(255,255,255,0.12)', transition: 'background 0.4s' }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 7 }}>À chaque vague, les plus lents sont éliminés.</div>
                </div>
              </Reveal>

              {/* Survivants en tête (paires différentes) */}
              <Reveal e={e} start={1100} y={16}>
                <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: '12px 14px', backdropFilter: 'blur(8px)' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>🏆 Survivants en tête</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {survivors.map((s, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.07)', border: `1px solid ${s.color}44`,
                        opacity: phase >= i ? 1 : 0.25, transition: `all 0.5s ease ${i * 0.1}s`,
                      }}>
                        <span style={{ fontSize: 15 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg, ${s.color}, ${s.color}77)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{s.name[0]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800 }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{s.pair}</div>
                        </div>
                        <span style={{ fontSize: 17, fontWeight: 900, color: s.color }}>{s.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>

              {/* Cadeaux partenaires */}
              <Reveal e={e} start={1500} y={16}>
                <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(245,166,35,0.4)', borderRadius: 16, padding: '12px 14px', backdropFilter: 'blur(8px)' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 4 }}>🎁 Cadeaux partenaires</div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginBottom: 9 }}>Offerts aux meilleurs survivants</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {gifts.map((g, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                        opacity: phase >= 3 ? 1 : 0.25, transform: phase >= 3 ? 'translateX(0)' : 'translateX(12px)',
                        transition: `all 0.5s ease ${i * 0.12}s`,
                      }}>
                        <div style={{ fontSize: 20 }}>{g.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800 }}>{g.rank} {g.gift}</div>
                          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)' }}>{g.who} • {g.partner}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      );
    },
  },

  // 4 — ESPACE ENSEIGNANT : CONFIGURATION
  {
    id: 'teacher-config', duration: 10000,
    caption: 'La difficulté s\'adapte à chaque classe',
    captionPos: 'bottom-right',
    bg: '#f8fafc',
    render: (e) => (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', height: '100%', gap: 30, padding: '30px 40px', flexWrap: 'wrap', overflow: 'auto' }}>
        <div style={{ flex: '1 1 500px', maxWidth: 600 }}>
          <Kicker e={e} start={150}>👩‍🏫 ACTE 3 · EN CLASSE</Kicker>
          <KineticHeading e={e} start={400} text="La difficulté s'adapte à chaque classe" accentColor={CC.teal}
            style={{ fontSize: 30, fontWeight: 900, color: CC.tealDeep, margin: '14px 0 20px', lineHeight: 1.15 }} />
          <Reveal e={e} start={1000} y={24}>
            <Card style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: CC.tealDeep, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>📚 Niveaux scolaires</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 60 }}>Primaire</span>
                {['CP', 'CE1', 'CE2', 'CM1', 'CM2'].map(lv => (
                  <Pill key={lv} selected={lv === 'CM1'}>{lv}</Pill>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 60 }}>Collège</span>
                {['6e', '5e', '4e', '3e'].map(lv => (
                  <Pill key={lv} selected={false}>{lv}</Pill>
                ))}
              </div>
            </Card>
          </Reveal>
          <Reveal e={e} start={1500} y={24}>
            <Card style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: CC.tealDeep, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>🌿 Domaines & Catégories</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {[
                  { label: '🌿 Botanique', sel: true, c: '#16a34a', bg: '#f0fdf4' },
                  { label: '🐾 Zoologie', sel: true, c: '#ea580c', bg: '#fff7ed' },
                  { label: '🔢 Maths', sel: true, c: '#2563eb', bg: '#eff6ff' },
                  { label: '🌍 Géographie', sel: false, c: '#ca8a04', bg: '#fefce8' },
                ].map((d, i) => (
                  <Pill key={i} selected={d.sel} color={d.c} bg={d.bg}>{d.label}</Pill>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['🍎 Fruits', '🌺 Fleurs', '×7', '×8', '×9', '➕ Additions'].map((cat, i) => (
                  <Pill key={i} selected={i < 3}>{cat}</Pill>
                ))}
              </div>
            </Card>
          </Reveal>
          <Reveal e={e} start={2000} y={24}>
            <Card>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: CC.tealDeep, margin: '0 0 12px' }}>⚙️ Paramètres du match</h3>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Manches</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: CC.tealDeep }}>5</div>
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Durée / manche</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: CC.tealDeep }}>60s</div>
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 8, background: '#f0fdfa', color: CC.tealDeep, fontWeight: 700 }}>🖼️ 248 paires</span>
                    <span style={{ padding: '3px 10px', borderRadius: 8, background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>🔢 336 calculs</span>
                  </div>
                </div>
              </div>
            </Card>
          </Reveal>
        </div>
        <Reveal e={e} start={1700} dur={700} y={0} scaleFrom={0.88} style={{ flex: '0 0 280px', paddingTop: 50 }}>
          <div style={{ background: CC.tealDeep, borderRadius: 16, padding: 20, color: '#fff', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📊 Données disponibles</div>
            <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>584</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>associations sélectionnées</div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 900 }}>248</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>Image↔Texte</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 900 }}>336</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>Calcul↔Nombre</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    ),
  },

  // 5 — CRÉATION DE GROUPES
  {
    id: 'groups', duration: 12000,
    caption: null,
    captionPos: 'none',
    bg: '#f8fafc',
    render: (e, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '30px 40px', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Kicker e={e} start={150}>👩‍🏫 VUE ENSEIGNANT</Kicker>
            <KineticHeading e={e} start={400} text="Des équipes sur mesure en quelques clics" accentColor={CC.teal}
              style={{ fontSize: 28, fontWeight: 900, color: CC.tealDeep, margin: '8px 0 0', lineHeight: 1.15 }} />
          </div>
          <Reveal e={e} start={800} x={20} y={0}>
            <div style={{ background: 'linear-gradient(135deg, #1AACBE, #148A9C)', color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 700, fontSize: 15, boxShadow: '0 4px 12px rgba(26,172,190,0.3)' }}>
              📊 Gérer les matchs actifs
            </div>
          </Reveal>
        </div>
        <div style={{ display: 'flex', gap: 30, flex: 1 }}>
          {/* Liste des élèves */}
          <Reveal e={e} start={1100} y={28} style={{ flex: '1 1 500px' }}>
            <Card>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: CC.tealDeep, margin: '0 0 12px' }}>👥 Élèves disponibles</h3>
              <MockStudentList selected={phase >= 1 ? [0, 2, 4, 7] : phase >= 0 ? [0, 2] : []} phase={phase} />
              {phase >= 2 && (
                <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', animation: 'presFadeIn 0.4s ease-out' }}>
                  <input readOnly value="Les Rapides ⚡" style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid #1AACBE', fontSize: 14, fontWeight: 600, color: '#111' }} />
                  <button style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>✅ Créer le groupe</button>
                </div>
              )}
            </Card>
          </Reveal>
          {/* Groupes créés */}
          <Reveal e={e} start={1400} y={28} style={{ flex: '0 0 300px' }}>
            <Card>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: CC.tealDeep, margin: '0 0 12px' }}>📋 Groupes créés</h3>
              {phase >= 3 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { name: 'Les Rapides ⚡', students: ['Alice', 'Chloé', 'Eva', 'Hugo'], status: 'ready' },
                    { name: 'Les Experts 🧠', students: ['Bob', 'David', 'Félix', 'Gabrielle'], status: 'ready' },
                  ].map((g, i) => (
                    <div key={i} style={{
                      border: '2px solid #1AACBE', borderRadius: 12, padding: 12,
                      animation: `presFadeIn 0.5s ease-out ${i * 0.3}s both`,
                    }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: CC.tealDeep, marginBottom: 6 }}>{g.name}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {g.students.map((s, j) => (
                          <span key={j} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f0fdfa', color: CC.tealDeep, fontWeight: 600 }}>{s}</span>
                        ))}
                      </div>
                      <button style={{ marginTop: 8, width: '100%', padding: '8px', background: 'linear-gradient(135deg, #1AACBE, #0D6A7A)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🚀 Lancer le match</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>
                  Sélectionnez 2 à 4 élèves puis créez un groupe
                </div>
              )}
            </Card>
          </Reveal>
        </div>
      </div>
    ),
  },

  // 6 — LANCEMENT DU MATCH
  {
    id: 'launch', duration: 10000,
    caption: 'Aucun code à saisir : un clic et c\'est parti',
    captionPos: 'top',
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
    render: (e) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff', textAlign: 'center', padding: 40, position: 'relative' }}>
        <FloatingBubbles count={5} />
        <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Reveal e={e} start={150} dur={600} y={0} scaleFrom={0.5}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>🚀</div>
          </Reveal>
          <KineticHeading e={e} start={450} text="Match lancé !" accentColor={CC.yellow}
            style={{ fontSize: 36, fontWeight: 900, justifyContent: 'center', margin: '0 0 12px' }} />
          <Reveal e={e} start={1000} y={16}>
            <p style={{ fontSize: 18, opacity: 0.85, margin: '0 0 30px', maxWidth: 620 }}>Une notification est envoyée automatiquement à chaque élève du groupe</p>
          </Reveal>
          <Reveal e={e} start={1500} dur={650} y={24} scaleFrom={0.9}>
            <div style={{
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
              borderRadius: 20, padding: '20px 32px', border: '2px solid rgba(255,255,255,0.25)',
              display: 'inline-flex', alignItems: 'center', gap: 18,
            }}>
              <div style={{ fontSize: 44, animation: 'presPulse 1.5s ease-in-out infinite' }}>🔔</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 19, fontWeight: 800 }}>Notification envoyée à 4 élèves</div>
                <div style={{ fontSize: 14, opacity: 0.8 }}>Ils rejoignent la partie en un seul clic — aucun code à saisir</div>
              </div>
            </div>
          </Reveal>
          <div style={{ marginTop: 30, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {PLAYER_NAMES.map((name, i) => (
              <Reveal key={i} e={e} start={2600 + i * 220} dur={500} y={20} scaleFrom={0.85}>
                <div style={{
                  background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '12px 20px',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', margin: '0 auto 8px',
                    background: `linear-gradient(135deg, ${PLAYER_COLORS[i]}, ${PLAYER_COLORS[i]}88)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800,
                  }}>{name[0]}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
                  <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>✅ Connecté</div>
                </div>
              </Reveal>
            ))}
          </div>
          {e > 4200 && (
            <div style={{ marginTop: 24, animation: 'presPulse 1.5s ease-in-out infinite' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>⏳ 3... 2... 1... GO !</div>
            </div>
          )}
        </div>
      </div>
    ),
  },

  // 7 — JEU MULTI EN COURS
  {
    id: 'gameplay', duration: 16000,
    caption: 'Rapidité et précision font la différence',
    captionPos: 'bottom-right',
    bg: `linear-gradient(135deg, ${CC.tealDeep} 0%, ${CC.tealDark} 30%, ${CC.teal} 60%, ${CC.tealDark} 100%)`,
    render: (e, phase) => {
      const scores = PLAYER_NAMES.map((name, i) => ({
        name, color: PLAYER_COLORS[i],
        score: phase >= 2 ? PLAYER_SCORES[i] : phase >= 1 ? Math.floor(PLAYER_SCORES[i] * 0.5) : 0,
        pairs: phase >= 2 ? Math.floor(PLAYER_SCORES[i] / 2) : phase >= 1 ? Math.floor(PLAYER_SCORES[i] / 4) : 0,
      })).sort((a, b) => b.score - a.score);
      const timeLeft = phase >= 3 ? 8 : phase >= 2 ? 24 : phase >= 1 ? 42 : 60;
      return (
        <div style={{ display: 'flex', height: '100%', padding: '10px 16px', gap: 14, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', top: 14, left: 18, zIndex: 3 }}>
            <Kicker e={e} start={150} bg="rgba(0,0,0,0.5)">🏆 MATCH EN COURS — duel en temps réel</Kicker>
          </div>
          <Reveal e={e} start={500} dur={750} y={0} scaleFrom={0.9}
            style={{ flex: '0 0 auto', width: 'min(calc(100vh - 80px), calc(100vw - 420px))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <InteractiveDemo maxWidth="100%" finger slow />
          </Reveal>
          <Reveal e={e} start={800} dur={650} x={28} y={0} style={{ flex: '0 0 360px', alignSelf: 'center' }}>
            <MockScoreboard
              scores={scores}
              timeLeft={timeLeft}
              round={phase >= 3 ? 4 : phase >= 2 ? 3 : phase >= 1 ? 2 : 1}
              animIdx={phase >= 1 ? 0 : -1}
              width={360}
            />
          </Reveal>
        </div>
      );
    },
  },

  // 8 — TOURNOI : PYRAMIDE
  {
    id: 'tournament', duration: 12000,
    caption: 'Jusqu\'au championnat académique',
    captionPos: 'bottom',
    bg: CC.cream,
    render: (e, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '30px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Kicker e={e} start={150} bg={CC.yellow}>🏆 MODE COMPÉTITION</Kicker>
          <KineticHeading e={e} start={400} text="De la classe jusqu'à l'académie" accentColor={CC.teal}
            style={{ fontSize: 34, fontWeight: 900, color: CC.tealDeep, justifyContent: 'center', margin: '12px 0 8px' }} />
          <Reveal e={e} start={950} y={14}>
            <p style={{ fontSize: 15, color: CC.brownLt, margin: 0 }}>4 phases à élimination pour couronner le champion !</p>
          </Reveal>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['Phase 1 : Classe', 'Phase 2 : École', 'Phase 3 : Circonscription', 'Phase 4 : Académie'].map((p, i) => (
            <Reveal key={i} e={e} start={1300 + i * 150} y={16}>
              <div style={{
                padding: '6px 14px', borderRadius: 10,
                background: phase >= i + 1 ? CC.teal : 'rgba(0,0,0,0.05)',
                color: phase >= i + 1 ? '#fff' : '#94a3b8',
                fontSize: 12, fontWeight: 700, transition: 'all 0.5s',
              }}>{p}</div>
            </Reveal>
          ))}
        </div>
        <Reveal e={e} start={1900} dur={700} y={30} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <MockBracket phase={Math.min(phase + 1, 4)} />
        </Reveal>
      </div>
    ),
  },

  // 9 — PODIUM
  {
    id: 'podium', duration: 10000,
    caption: 'La motivation au sommet',
    captionPos: 'bottom',
    bg: `linear-gradient(135deg, ${CC.tealDeep} 0%, ${CC.teal} 100%)`,
    render: (e, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, position: 'relative' }}>
        <FloatingBubbles count={10} />
        <div style={{ zIndex: 1, textAlign: 'center', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <KineticHeading e={e} start={200} text="🏆 Partie terminée !" accentColor={CC.yellow}
            style={{ fontSize: 36, fontWeight: 900, color: '#fff', justifyContent: 'center', margin: '0 0 8px' }} />
          <Reveal e={e} start={800} y={14}>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', margin: '0 0 30px' }}>
              Vainqueur : <span style={{ color: '#fbbf24', fontWeight: 900 }}>Emma</span> avec 12 points
            </p>
          </Reveal>
          <Reveal e={e} start={1100} dur={700} y={30} style={{ width: '100%' }}>
            <MockPodium phase={Math.min(phase + 1, 4)} />
          </Reveal>
        </div>
      </div>
    ),
  },

  // 10 — SUIVI ENSEIGNANT
  {
    id: 'tracking', duration: 12000,
    caption: 'Un suivi précis, élève par élève',
    captionPos: 'top-right',
    bg: '#f8fafc',
    render: (e, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '30px 40px', overflow: 'auto' }}>
        <div style={{ alignSelf: 'flex-start' }}>
          <Kicker e={e} start={150}>📊 TABLEAU DE BORD ENSEIGNANT</Kicker>
        </div>
        <KineticHeading e={e} start={400} text="Un suivi précis, élève par élève" accentColor={CC.teal}
          style={{ fontSize: 28, fontWeight: 900, color: CC.tealDeep, margin: '14px 0 20px', lineHeight: 1.15 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Élèves actifs', value: '28', icon: '👥', color: CC.teal },
            { label: 'Sessions aujourd\'hui', value: '12', icon: '🎮', color: CC.green },
            { label: 'PPM moyen', value: '4.2', icon: '⚡', color: CC.yellow },
            { label: 'Taux de réussite', value: '78%', icon: '🎯', color: CC.blue },
          ].map((stat, i) => (
            <Reveal key={i} e={e} start={900 + i * 130} y={22} scaleFrom={0.92}>
              <Card style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{stat.label}</div>
              </Card>
            </Reveal>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 20, flex: 1 }}>
          <Reveal e={e} start={1500} y={28} style={{ flex: 2, display: 'flex' }}>
          <Card style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: CC.tealDeep, margin: '0 0 16px' }}>📈 Progression par élève</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { name: 'Alice Martin', ppm: 5.8, accuracy: 92, sessions: 14, trend: '+12%' },
                { name: 'Bob Dupont', ppm: 3.2, accuracy: 71, sessions: 8, trend: '+5%' },
                { name: 'Chloé Petit', ppm: 6.1, accuracy: 95, sessions: 18, trend: '+18%' },
                { name: 'David Bernard', ppm: 2.8, accuracy: 65, sessions: 6, trend: '+3%' },
                { name: 'Eva Thomas', ppm: 4.5, accuracy: 82, sessions: 11, trend: '+9%' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${CC.teal}, ${CC.tealDeep})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: '#fff',
                  }}>{s.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{s.sessions} sessions</div>
                  </div>
                  <div style={{ width: 160, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: phase >= 1 ? `${s.accuracy}%` : '0%',
                      background: s.accuracy >= 90 ? '#10b981' : s.accuracy >= 75 ? '#f59e0b' : '#ef4444',
                      transition: 'width 1s ease-out',
                    }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: CC.teal, minWidth: 50, textAlign: 'right' }}>{s.ppm} PPM</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', minWidth: 50, textAlign: 'right' }}>{s.trend}</div>
                </div>
              ))}
            </div>
          </Card>
          </Reveal>
          <Reveal e={e} start={1800} y={28} style={{ flex: 1, display: 'flex' }}>
          <Card style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: CC.tealDeep, margin: '0 0 16px' }}>🏆 Top thèmes maîtrisés</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { theme: '🌿 Botanique', pct: 88 },
                { theme: '🔢 Tables ×7', pct: 82 },
                { theme: '🐾 Zoologie', pct: 76 },
                { theme: '➕ Additions', pct: 71 },
                { theme: '🌺 Fleurs', pct: 65 },
              ].map((t, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{t.theme}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: CC.teal }}>{t.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: phase >= 2 ? `${t.pct}%` : '0%',
                      background: `linear-gradient(90deg, ${CC.teal}, ${CC.tealDeep})`,
                      transition: 'width 1.2s ease-out',
                      transitionDelay: `${i * 0.15}s`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          </Reveal>
        </div>
      </div>
    ),
  },

  // 10b — MODE APPRENDRE (découverte, sans chrono)
  {
    id: 'apprendre', duration: 15000,
    caption: 'Mode Apprendre : on découvre et on mémorise, sans pression',
    captionPos: 'bottom',
    bg: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
    render: (e) => (
      <div style={{ position: 'absolute', inset: 0, color: '#fff', overflow: 'hidden' }}>
        <FloatingBubbles count={6} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 56, padding: '40px 56px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 340px', maxWidth: 480 }}>
            <Kicker e={e} start={150} bg="linear-gradient(135deg,#10b981,#059669)">📖 MODE APPRENDRE</Kicker>
            <KineticHeading e={e} start={400} text="Comprendre avant de jouer" accentColor={CC.yellowLt}
              style={{ fontSize: 36, fontWeight: 900, lineHeight: 1.12, margin: '14px 0 18px' }} />
            <Reveal e={e} start={1000} y={18}>
              <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.85)', lineHeight: 1.65, margin: '0 0 22px' }}>
                Pas de chronomètre, pas d'adversaire : l'élève explore les associations à son rythme et mémorise les bonnes paires.
              </p>
            </Reveal>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: '🧭', label: 'À son rythme', desc: 'Aucune limite de temps' },
                { icon: '🔁', label: 'Répétition', desc: 'On rejoue jusqu\'à maîtriser' },
                { icon: '🚀', label: 'Prêt pour le défi', desc: 'Puis on passe en Solo ou en duel' },
              ].map((item, i) => (
                <Reveal key={i} e={e} start={1500 + i * 220} y={22} x={-14}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)' }}>
                    <span style={{ fontSize: 26, width: 36, textAlign: 'center' }}>{item.icon}</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{item.label}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{item.desc}</div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
          <Reveal e={e} start={900} dur={750} y={0} scaleFrom={0.9} style={{ flex: '0 0 auto', width: 'min(54vh, 430px)' }}>
            <InteractiveDemo maxWidth="100%" finger slow tutorial />
          </Reveal>
        </div>
      </div>
    ),
  },

  // 11 — CONCLUSION
  {
    id: 'conclusion', duration: 10000,
    caption: 'Rendez-vous sur crazy-chrono.com',
    captionPos: 'bottom',
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
    render: (e) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff', textAlign: 'center', padding: 40, position: 'relative' }}>
        <FloatingBubbles count={10} />
        <div style={{ zIndex: 1, maxWidth: 820, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Reveal e={e} start={150} dur={600} y={0} scaleFrom={0.5}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>🕐</div>
          </Reveal>
          <KineticHeading e={e} start={450} text="Crazy Chrono" accentColor={CC.yellow}
            style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 900, justifyContent: 'center', margin: '0 0 16px' }} />
          <Reveal e={e} start={1000} y={16}>
            <p style={{ fontSize: 20, opacity: 0.9, margin: '0 0 40px', lineHeight: 1.6 }}>
              Une plateforme pédagogique complète, ludique et compétitive
            </p>
          </Reveal>
          <Reveal e={e} start={1300} y={18}>
            <p style={{ fontSize: 17, opacity: 0.85, margin: '0 0 38px', maxWidth: 660, lineHeight: 1.6 }}>
              Jouer, défier, progresser — du Solo à l'Arena académique, le tout piloté par l'enseignant.
            </p>
          </Reveal>
          <Reveal e={e} start={2400} dur={600} y={18} scaleFrom={0.9}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: CC.yellow, color: CC.tealDeep, padding: '13px 30px', borderRadius: 999, fontWeight: 900, fontSize: 19, boxShadow: '0 12px 34px rgba(0,0,0,0.28)' }}>
              👉 crazy-chrono.com
            </div>
          </Reveal>
          <Reveal e={e} start={2800} y={12}>
            <p style={{ fontSize: 15, opacity: 0.7, marginTop: 18 }}>
              Disponible sur tablettes, téléphones et ordinateurs — PWA installable
            </p>
          </Reveal>
        </div>
      </div>
    ),
  },
];

// ============ PHASE CALCULATOR ============
function getPhase(elapsed, duration) {
  const pct = elapsed / duration;
  if (pct < 0.15) return 0;
  if (pct < 0.35) return 1;
  if (pct < 0.55) return 2;
  if (pct < 0.75) return 3;
  return 4;
}

// ============ MAIN COMPONENT ============
export default function PresentationPage() {
  const navigate = useNavigate();
  const [slideIdx, setSlideIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [recording, setRecording] = useState(false);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const pausedRef = useRef(false);
  const recordingRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const slide = SLIDES[slideIdx] || SLIDES[0];
  const phase = getPhase(elapsed, slide.duration);

  // Masquer la barre de navigation pendant toute la présentation (vidéo propre)
  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent('cc:gameMode', { detail: { on: true } })); } catch {}
    return () => {
      try { window.dispatchEvent(new CustomEvent('cc:gameMode', { detail: { on: false } })); } catch {}
    };
  }, []);

  // ===== Enregistrement vidéo (capture d'onglet -> .webm) =====
  const finalizeStop = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert("Votre navigateur ne supporte pas l'enregistrement. Utilisez Chrome ou Edge sur ordinateur.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crazy-chrono-promo-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      // Si l'utilisateur arrête le partage depuis la barre du navigateur
      stream.getVideoTracks()[0].onended = () => finalizeStop();
      mediaRecorderRef.current = recorder;
      recorder.start();
      recordingRef.current = true;
      setRecording(true);
      // Relance la présentation depuis le début
      startRef.current = null;
      setElapsed(0);
      setSlideIdx(0);
      setPaused(false);
      pausedRef.current = false;
    } catch (err) {
      console.warn('Enregistrement annulé ou échoué:', err);
    }
  }, [finalizeStop]);

  // Animation loop
  const tick = useCallback((timestamp) => {
    if (!startRef.current) startRef.current = timestamp;
    if (!pausedRef.current) {
      const dt = timestamp - startRef.current;
      setElapsed(dt);
      if (dt >= slide.duration) {
        startRef.current = null;
        setElapsed(0);
        setSlideIdx(prev => {
          const next = (prev + 1) % SLIDES.length;
          // Fin d'un tour complet pendant l'enregistrement -> stop auto
          if (recordingRef.current && next === 0) {
            setTimeout(() => finalizeStop(), 400);
          }
          return next;
        });
      }
    } else {
      startRef.current = timestamp - elapsed;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [slide.duration, elapsed, finalizeStop]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        startRef.current = null; setElapsed(0);
        setSlideIdx(prev => (prev + 1) % SLIDES.length);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        startRef.current = null; setElapsed(0);
        setSlideIdx(prev => (prev - 1 + SLIDES.length) % SLIDES.length);
      } else if (e.key === 'Escape') {
        if (recordingRef.current) { finalizeStop(); } else { navigate('/'); }
      } else if (e.key === 'p' || e.key === 'P') {
        setPaused(p => { pausedRef.current = !p; return !p; });
      } else if (e.key === 's' || e.key === 'S') {
        if (recordingRef.current) finalizeStop();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate, finalizeStop]);

  const goSlide = (idx) => { startRef.current = null; setElapsed(0); setSlideIdx(idx); };
  const togglePause = () => { setPaused(p => { pausedRef.current = !p; return !p; }); };
  const progress = elapsed / slide.duration;

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: slide.bg || CC.cream, transition: 'background 0.6s ease', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Slide content */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        {slide.render(elapsed, phase)}
      </div>

      {/* Progress bar (masquée pendant l'enregistrement) */}
      {!recording && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'rgba(0,0,0,0.1)', zIndex: 10 }}>
          <div style={{ height: '100%', background: CC.yellow, width: `${progress * 100}%`, transition: 'width 0.1s linear' }} />
        </div>
      )}

      {/* Controls bar (masquée pendant l'enregistrement pour une vidéo propre) */}
      {!recording && (
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)',
        padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* Prev/Pause/Next */}
        <button onClick={() => goSlide((slideIdx - 1 + SLIDES.length) % SLIDES.length)}
          style={btnStyle}>◀</button>
        <button onClick={togglePause} style={btnStyle}>
          {paused ? '▶' : '⏸'}
        </button>
        <button onClick={() => goSlide((slideIdx + 1) % SLIDES.length)}
          style={btnStyle}>▶</button>

        {/* Slide dots */}
        <div style={{ flex: 1, display: 'flex', gap: 6, justifyContent: 'center' }}>
          {SLIDES.map((s, i) => (
            <button key={i} onClick={() => goSlide(i)} style={{
              width: i === slideIdx ? 24 : 10, height: 10, borderRadius: 5,
              background: i === slideIdx ? CC.yellow : 'rgba(255,255,255,0.3)',
              border: 'none', cursor: 'pointer', transition: 'all 0.3s',
              padding: 0,
            }} title={s.id} />
          ))}
        </div>

        {/* Slide counter */}
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
          {slideIdx + 1} / {SLIDES.length}
        </span>

        {/* Enregistrer */}
        <button onClick={startRecording} style={{ ...btnStyle, fontSize: 12, background: 'linear-gradient(135deg, #ef4444, #dc2626)', borderColor: 'rgba(255,255,255,0.3)' }}>
          🔴 Enregistrer
        </button>

        {/* Exit */}
        <button onClick={() => navigate('/')} style={{ ...btnStyle, fontSize: 12 }}>✕ Quitter</button>
      </div>
      )}

      {/* Indicateur discret pendant l'enregistrement (coin, hors zone de contenu) */}
      {recording && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(0,0,0,0.35)', borderRadius: 999, padding: '4px 10px',
          fontSize: 11, fontWeight: 700, color: '#fff', pointerEvents: 'none',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'presPulse 1s infinite' }} />
          REC — touche S pour arrêter
        </div>
      )}

      {/* Keyboard hints */}
      {!recording && slideIdx === 0 && elapsed < 4000 && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.5)', fontSize: 12, zIndex: 10,
          animation: 'presFadeIn 1s ease-out 2s both',
        }}>
          ← → Navigation • Espace Suivant • P Pause • C Texte • 🔴 Enregistrer • Échap Quitter
        </div>
      )}

      {/* Pause overlay */}
      {paused && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ color: '#fff', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>⏸</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>Présentation en pause</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>Appuyez sur P ou cliquez ▶ pour reprendre</div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes presFadeIn {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes presFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        @keyframes presPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes presGlow {
          0% { box-shadow: 0 0 0 0 rgba(26,172,190,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(26,172,190,0); }
          100% { box-shadow: 0 0 0 0 rgba(26,172,190,0); }
        }
        @keyframes presBubbleFly {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          20% { transform: translateY(-20px) scale(1); opacity: 1; }
          80% { transform: translateY(-200px) scale(1.1); opacity: 0.9; }
          100% { transform: translateY(-350px) scale(1.2); opacity: 0; }
        }
        @keyframes ccFireFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-6px) scale(1.12); }
        }
        @keyframes ccFirePulse {
          0%, 100% { transform: scale(1); text-shadow: 0 0 0 rgba(255,255,255,0); }
          50% { transform: scale(1.06); text-shadow: 0 0 16px rgba(255,255,255,0.7); }
        }
        @keyframes soloRipple {
          0% { width: 14px; height: 14px; opacity: 0.9; }
          100% { width: 84px; height: 84px; opacity: 0; }
        }
        @keyframes soloScorePop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const btnStyle = {
  background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
  fontSize: 14, fontWeight: 700, backdropFilter: 'blur(4px)',
};
