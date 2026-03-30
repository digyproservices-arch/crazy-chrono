import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import InteractiveDemo from './InteractiveDemo';

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

// ============ MOCK CLOCK FACE ============
const MockClockFace = ({ highlight, animPhase }) => {
  const zones = [
    { type: 'image', label: '🐬', angle: 315, color: '#3b82f6' },
    { type: 'image', label: '🦅', angle: 225, color: '#10b981' },
    { type: 'image', label: '🌺', angle: 135, color: '#f59e0b' },
    { type: 'image', label: '🦜', angle: 45, color: '#ec4899' },
    { type: 'text', label: 'Dauphin', angle: 340, color: '#fff' },
    { type: 'text', label: 'Héron vert', angle: 200, color: '#fff' },
    { type: 'text', label: 'Hibiscus', angle: 160, color: '#fff' },
    { type: 'text', label: 'Perroquet', angle: 20, color: '#fff' },
    { type: 'calc', label: '8×7', angle: 290, color: '#456451' },
    { type: 'calc', label: '12+13', angle: 250, color: '#456451' },
    { type: 'num', label: '56', angle: 110, color: '#456451' },
    { type: 'num', label: '25', angle: 70, color: '#456451' },
  ];
  const r = 160;
  const cx = 200, cy = 200;
  return (
    <svg viewBox="0 0 400 400" style={{ width: '100%', maxWidth: 380, filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.25))' }}>
      {/* Fond cadran */}
      <defs>
        <radialGradient id="clock-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.3" />
          <stop offset="100%" stopColor={CC.tealDeep} stopOpacity="0.9" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={195} fill="url(#clock-bg)" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      {/* Croix centrale */}
      <line x1={cx} y1={cy - 180} x2={cx} y2={cy + 180} stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
      <line x1={cx - 180} y1={cy} x2={cx + 180} y2={cy} stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
      {/* Zones */}
      {zones.map((z, i) => {
        const rad = (z.angle * Math.PI) / 180;
        const x = cx + r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        const isHighlighted = highlight && highlight.includes(i);
        const scale = isHighlighted ? 1.15 : 1;
        const glow = isHighlighted ? 'drop-shadow(0 0 12px rgba(245,166,35,0.8))' : 'none';
        return (
          <g key={i} style={{ filter: glow, transition: 'all 0.5s' }}>
            {z.type === 'image' ? (
              <>
                <circle cx={x} cy={y} r={28 * scale} fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={24 * scale}>{z.label}</text>
              </>
            ) : z.type === 'text' ? (
              <>
                <rect x={x - 42} y={y - 14} width={84} height={28} rx={8} fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={z.color} fontWeight="bold">{z.label}</text>
              </>
            ) : (
              <>
                <circle cx={x} cy={y} r={22 * scale} fill="rgba(69,100,81,0.15)" stroke="rgba(69,100,81,0.3)" strokeWidth="1" />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={14 * scale} fill={z.color} fontWeight="bold">{z.label}</text>
              </>
            )}
          </g>
        );
      })}
      {/* Lignes de paire si highlight */}
      {highlight && highlight.length === 2 && (
        <line
          x1={cx + r * Math.cos((zones[highlight[0]].angle * Math.PI) / 180)}
          y1={cy + r * Math.sin((zones[highlight[0]].angle * Math.PI) / 180)}
          x2={cx + r * Math.cos((zones[highlight[1]].angle * Math.PI) / 180)}
          y2={cy + r * Math.sin((zones[highlight[1]].angle * Math.PI) / 180)}
          stroke={CC.yellow} strokeWidth="3" strokeDasharray="8 4" opacity="0.8"
        />
      )}
    </svg>
  );
};

// ============ MOCK SCOREBOARD (sidebar game) ============
const MockScoreboard = ({ scores, timeLeft, round, animIdx }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
    <GlassCard>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          background: timeLeft < 10 ? 'rgba(220,38,38,0.85)' : 'rgba(0,0,0,0.3)',
          borderRadius: 12, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.12)',
          fontSize: 18, fontWeight: 900, color: timeLeft < 10 ? '#fff' : '#10b981',
          fontFamily: 'monospace',
        }}>⏱ {timeLeft}s</div>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.12)', fontSize: 13, fontWeight: 700, color: '#fff' }}>
          Manche {round} / 5
        </div>
      </div>
    </GlassCard>
    <GlassCard>
      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#fff' }}>🏆 Classement</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {scores.map((s, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 10,
            background: idx === animIdx ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${idx === animIdx ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
            transition: 'all 0.5s ease',
            transform: idx === animIdx ? 'scale(1.03)' : 'scale(1)',
          }}>
            <div style={{ fontSize: idx === 0 ? 20 : 14, fontWeight: 900, minWidth: 26, textAlign: 'center' }}>
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '4.'}
            </div>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: `linear-gradient(135deg, ${s.color}, ${s.color}88)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>{s.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{s.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{s.pairs} paires</div>
            </div>
            <div style={{
              background: '#fff', borderRadius: 10, padding: '3px 10px',
              minWidth: 36, textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1.1 }}>{s.score}</div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
    <GlassCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: PLAYER_COLORS[0] }} />
        <span style={{ fontSize: 13, color: '#fff' }}><b>Emma</b>: 🐬 Dauphin ↔ Dauphin</span>
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

// ============ SLIDES ============
const SLIDES = [
  // 0 — TITRE
  {
    id: 'title', duration: 8000,
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
    render: () => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: CC.white, textAlign: 'center', padding: 40, position: 'relative' }}>
        <FloatingBubbles count={8} />
        <div style={{ fontSize: 100, marginBottom: 20, animation: 'presFloat 3s ease-in-out infinite', filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.3))', zIndex: 1 }}>🕐</div>
        <h1 style={{ fontSize: 'clamp(48px, 8vw, 80px)', fontWeight: 900, margin: 0, letterSpacing: -2, lineHeight: 1.1, zIndex: 1 }}>Crazy Chrono</h1>
        <p style={{ fontSize: 'clamp(18px, 3vw, 26px)', opacity: 0.9, marginTop: 16, maxWidth: 700, lineHeight: 1.5, zIndex: 1 }}>
          Le jeu pédagogique qui transforme l'apprentissage en défi passionnant
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 40, flexWrap: 'wrap', justifyContent: 'center', zIndex: 1 }}>
          {['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e'].map((level, i) => (
            <span key={level} style={{
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
              padding: '8px 20px', borderRadius: 12, fontSize: 16, fontWeight: 700,
              border: '1px solid rgba(255,255,255,0.25)',
              animation: `presFadeIn 0.5s ease-out ${0.3 + i * 0.1}s both`,
            }}>{level}</span>
          ))}
        </div>
      </div>
    ),
  },

  // 1 — CONCEPT : LE CADRAN
  {
    id: 'concept', duration: 10000,
    bg: CC.cream,
    render: (_, phase) => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 60, padding: '40px 60px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 350px', maxWidth: 500 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: CC.teal, color: '#fff', padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>🎯 LE CONCEPT</div>
          <h2 style={{ fontSize: 38, fontWeight: 900, color: CC.tealDeep, margin: '0 0 16px', lineHeight: 1.2 }}>
            Trouvez les paires<br />sur le cadran !
          </h2>
          <p style={{ fontSize: 17, color: CC.brownLt, lineHeight: 1.7, marginBottom: 24 }}>
            Un cadran d'horloge avec 16 zones. Chaque zone contient une image, un texte, un calcul ou un nombre. Trouvez la bonne paire avant vos adversaires !
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { icon: '🖼️', label: 'Image ↔ Texte', desc: 'Dauphin ↔ "Dauphin"', color: CC.blue },
              { icon: '🔢', label: 'Calcul ↔ Résultat', desc: '8 × 7 ↔ 56', color: CC.green },
              { icon: '⏱️', label: 'Chronomètre', desc: 'Le plus rapide gagne !', color: CC.yellow },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                background: '#fff', borderRadius: 12, border: `2px solid ${item.color}22`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                animation: `presFadeIn 0.5s ease-out ${0.5 + i * 0.3}s both`,
              }}>
                <span style={{ fontSize: 28, width: 40, textAlign: 'center' }}>{item.icon}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#111' }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <MockClockFace highlight={phase >= 1 ? [0, 4] : null} />
        </div>
      </div>
    ),
  },

  // 2 — DÉMO EN DIRECT
  {
    id: 'demo', duration: 14000,
    bg: '#f8fafc',
    render: () => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 20px', gap: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #0D6A7A, #1AACBE)', color: '#fff', padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>▶️ DÉMO EN DIRECT</div>
          <h2 style={{ fontSize: 32, fontWeight: 900, color: CC.tealDeep, margin: '0 0 4px' }}>Le jeu en action</h2>
          <p style={{ fontSize: 15, color: CC.brownLt, margin: 0 }}>Observez le curseur trouver les paires — exactement comme les élèves jouent</p>
        </div>
        <div style={{ maxWidth: 560, width: '100%' }}>
          <InteractiveDemo />
        </div>
      </div>
    ),
  },

  // 3 — CHOIX DES MODES (ÉLÈVE)
  {
    id: 'modes', duration: 10000,
    bg: CC.cream,
    render: (_, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 60px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: CC.teal, color: '#fff', padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🎮 VUE ÉLÈVE</div>
        <h2 style={{ fontSize: 36, fontWeight: 900, color: CC.tealDeep, margin: '0 0 8px' }}>Choix du mode de jeu</h2>
        <p style={{ fontSize: 15, color: CC.brownLt, margin: '0 0 30px' }}>Chaque élève choisit son mode depuis cette interface</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, maxWidth: 1000, width: '100%' }}>
          {[
            { title: 'Mode Solo', icon: '🎯', sub: 'Jouer seul à son rythme', gradient: 'linear-gradient(135deg, #1AACBE 0%, #148A9C 100%)' },
            { title: 'Salle Privée', icon: '🔑', sub: 'Entre amis avec un code', gradient: 'linear-gradient(135deg, #F5A623 0%, #d4900e 100%)' },
            { title: 'Grande Salle', icon: '🏟️', sub: 'Course éliminatoire ouverte', gradient: 'linear-gradient(135deg, #ff6b35 0%, #F5A623 100%)' },
            { title: 'Mes Performances', icon: '📊', sub: 'Progression et statistiques', gradient: 'linear-gradient(135deg, #0D6A7A 0%, #148A9C 100%)' },
          ].map((mode, i) => (
            <div key={i} style={{
              background: mode.gradient, borderRadius: 16, padding: 24,
              color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              animation: `presFadeIn 0.5s ease-out ${0.2 + i * 0.15}s both`,
              transform: phase >= 1 && i === 0 ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.4s ease',
              border: phase >= 1 && i === 0 ? '3px solid #fff' : '3px solid transparent',
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{mode.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{mode.title}</div>
              <div style={{ opacity: 0.9, fontSize: 14 }}>{mode.sub}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 4 — ESPACE ENSEIGNANT : CONFIGURATION
  {
    id: 'teacher-config', duration: 10000,
    bg: '#f8fafc',
    render: (_, phase) => (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', height: '100%', gap: 30, padding: '30px 40px', flexWrap: 'wrap', overflow: 'auto' }}>
        <div style={{ flex: '1 1 500px', maxWidth: 600 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: CC.teal, color: '#fff', padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>👩‍🏫 VUE ENSEIGNANT</div>
          <h2 style={{ fontSize: 30, fontWeight: 900, color: CC.tealDeep, margin: '0 0 20px' }}>Configuration pédagogique</h2>
          <Card style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: CC.tealDeep, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>📚 Niveaux scolaires</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 60 }}>Primaire</span>
              {['CP', 'CE1', 'CE2', 'CM1', 'CM2'].map(lv => (
                <Pill key={lv} selected={['CM1', 'CM2'].includes(lv)}>{lv}</Pill>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 60 }}>Collège</span>
              {['6e', '5e', '4e', '3e'].map(lv => (
                <Pill key={lv} selected={lv === '6e'}>{lv}</Pill>
              ))}
            </div>
          </Card>
          <Card style={{ marginBottom: 16, animation: phase >= 1 ? 'presFadeIn 0.5s ease-out' : 'none', opacity: phase >= 1 ? 1 : 0.3 }}>
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
          <Card style={{ animation: phase >= 2 ? 'presFadeIn 0.5s ease-out' : 'none', opacity: phase >= 2 ? 1 : 0.3 }}>
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
        </div>
        <div style={{ flex: '0 0 280px', paddingTop: 50 }}>
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
        </div>
      </div>
    ),
  },

  // 5 — CRÉATION DE GROUPES
  {
    id: 'groups', duration: 12000,
    bg: '#f8fafc',
    render: (_, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '30px 40px', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: CC.teal, color: '#fff', padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>👩‍🏫 VUE ENSEIGNANT</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: CC.tealDeep, margin: 0 }}>Création des groupes d'entraînement</h2>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #1AACBE, #148A9C)', color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 700, fontSize: 15, boxShadow: '0 4px 12px rgba(26,172,190,0.3)' }}>
            📊 Gérer les matchs actifs
          </div>
        </div>
        <div style={{ display: 'flex', gap: 30, flex: 1 }}>
          {/* Liste des élèves */}
          <div style={{ flex: '1 1 500px' }}>
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
          </div>
          {/* Groupes créés */}
          <div style={{ flex: '0 0 300px' }}>
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
          </div>
        </div>
      </div>
    ),
  },

  // 6 — LANCEMENT DU MATCH
  {
    id: 'launch', duration: 10000,
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
    render: (_, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff', textAlign: 'center', padding: 40, position: 'relative' }}>
        <FloatingBubbles count={5} />
        <div style={{ zIndex: 1 }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>🚀</div>
          <h2 style={{ fontSize: 36, fontWeight: 900, margin: '0 0 12px' }}>Match lancé !</h2>
          <p style={{ fontSize: 18, opacity: 0.85, marginBottom: 30 }}>Les élèves rejoignent avec leur code d'accès</p>
          {phase >= 1 && (
            <div style={{
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
              borderRadius: 20, padding: '24px 40px', border: '2px solid rgba(255,255,255,0.25)',
              display: 'inline-block', animation: 'presFadeIn 0.5s ease-out',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.7, marginBottom: 8 }}>Code de salle</div>
              <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: 8, fontFamily: 'monospace' }}>A3X7</div>
            </div>
          )}
          {phase >= 2 && (
            <div style={{ marginTop: 30, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', animation: 'presFadeIn 0.5s ease-out' }}>
              {PLAYER_NAMES.map((name, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '12px 20px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  animation: `presFadeIn 0.4s ease-out ${i * 0.2}s both`,
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
              ))}
            </div>
          )}
          {phase >= 3 && (
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
    id: 'gameplay', duration: 14000,
    bg: `linear-gradient(135deg, ${CC.tealDeep} 0%, ${CC.tealDark} 30%, ${CC.teal} 60%, ${CC.tealDark} 100%)`,
    render: (_, phase) => {
      const scores = PLAYER_NAMES.map((name, i) => ({
        name, color: PLAYER_COLORS[i],
        score: phase >= 2 ? PLAYER_SCORES[i] : phase >= 1 ? Math.floor(PLAYER_SCORES[i] * 0.5) : 0,
        pairs: phase >= 2 ? Math.floor(PLAYER_SCORES[i] / 2) : phase >= 1 ? Math.floor(PLAYER_SCORES[i] / 4) : 0,
      })).sort((a, b) => b.score - a.score);
      const timeLeft = phase >= 3 ? 8 : phase >= 2 ? 24 : phase >= 1 ? 42 : 60;
      return (
        <div style={{ display: 'flex', height: '100%', padding: '12px 16px', gap: 16, maxWidth: 1400, margin: '0 auto', alignItems: 'stretch' }}>
          <div style={{ flex: 1, position: 'relative', borderRadius: 16, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 2 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '4px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>🏆 MATCH EN COURS</div>
            </div>
            <MockClockFace
              highlight={phase >= 1 ? [0, 4] : null}
              animPhase={phase}
            />
            {/* Bulles qui s'envolent */}
            {phase >= 2 && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${30 + i * 20}%`, bottom: `${20 + i * 15}%`,
                    width: 60, height: 60, borderRadius: '50%',
                    background: `${PLAYER_COLORS[i]}`,
                    border: '3px solid #fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: '#fff',
                    animation: `presBubbleFly ${2 + i * 0.3}s ease-out ${i * 0.5}s both`,
                    boxShadow: `0 0 20px ${PLAYER_COLORS[i]}88, 0 0 40px ${PLAYER_COLORS[i]}44`,
                  }}>
                    {PLAYER_NAMES[i][0]}{PLAYER_NAMES[i][1]}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: '0 0 280px' }}>
            <MockScoreboard
              scores={scores}
              timeLeft={timeLeft}
              round={phase >= 3 ? 4 : phase >= 2 ? 3 : phase >= 1 ? 2 : 1}
              animIdx={phase >= 1 ? 0 : -1}
            />
          </div>
        </div>
      );
    },
  },

  // 8 — TOURNOI : PYRAMIDE
  {
    id: 'tournament', duration: 12000,
    bg: CC.cream,
    render: (_, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '30px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: CC.yellow, color: '#fff', padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🏆 MODE COMPÉTITION</div>
          <h2 style={{ fontSize: 34, fontWeight: 900, color: CC.tealDeep, margin: '0 0 8px' }}>Tournoi — Phase éliminatoire</h2>
          <p style={{ fontSize: 15, color: CC.brownLt, margin: 0 }}>De la classe jusqu'à l'académie : 4 phases pour couronner le champion !</p>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          {['Phase 1 : Classe', 'Phase 2 : École', 'Phase 3 : Circonscription', 'Phase 4 : Académie'].map((p, i) => (
            <div key={i} style={{
              padding: '6px 14px', borderRadius: 10,
              background: phase >= i + 1 ? CC.teal : 'rgba(0,0,0,0.05)',
              color: phase >= i + 1 ? '#fff' : '#94a3b8',
              fontSize: 12, fontWeight: 700, transition: 'all 0.5s',
            }}>{p}</div>
          ))}
        </div>
        <MockBracket phase={Math.min(phase + 1, 4)} />
      </div>
    ),
  },

  // 9 — PODIUM
  {
    id: 'podium', duration: 10000,
    bg: `linear-gradient(135deg, ${CC.tealDeep} 0%, ${CC.teal} 100%)`,
    render: (_, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, position: 'relative' }}>
        <FloatingBubbles count={10} />
        <div style={{ zIndex: 1, textAlign: 'center', width: '100%' }}>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>🏆 Partie Terminée !</h2>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', margin: '0 0 30px' }}>
            Vainqueur : <span style={{ color: '#fbbf24', fontWeight: 900 }}>Emma</span> avec 12 points
          </p>
          <MockPodium phase={Math.min(phase + 1, 4)} />
        </div>
      </div>
    ),
  },

  // 10 — SUIVI ENSEIGNANT
  {
    id: 'tracking', duration: 12000,
    bg: '#f8fafc',
    render: (_, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '30px 40px', overflow: 'auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: CC.teal, color: '#fff', padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 16, alignSelf: 'flex-start' }}>📊 TABLEAU DE BORD ENSEIGNANT</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: CC.tealDeep, margin: '0 0 20px' }}>Suivi de la progression des élèves</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Élèves actifs', value: '28', icon: '👥', color: CC.teal },
            { label: 'Sessions aujourd\'hui', value: '12', icon: '🎮', color: CC.green },
            { label: 'PPM moyen', value: '4.2', icon: '⚡', color: CC.yellow },
            { label: 'Taux de réussite', value: '78%', icon: '🎯', color: CC.blue },
          ].map((stat, i) => (
            <Card key={i} style={{ textAlign: 'center', animation: `presFadeIn 0.4s ease-out ${i * 0.1}s both` }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{stat.label}</div>
            </Card>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 20, flex: 1 }}>
          <Card style={{ flex: 2, opacity: phase >= 1 ? 1 : 0.3, transition: 'opacity 0.5s' }}>
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
          <Card style={{ flex: 1, opacity: phase >= 2 ? 1 : 0.3, transition: 'opacity 0.5s' }}>
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
        </div>
      </div>
    ),
  },

  // 11 — CONCLUSION
  {
    id: 'conclusion', duration: 10000,
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
    render: (_, phase) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff', textAlign: 'center', padding: 40, position: 'relative' }}>
        <FloatingBubbles count={10} />
        <div style={{ zIndex: 1, maxWidth: 800 }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>🕐</div>
          <h2 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 900, margin: '0 0 16px' }}>Crazy Chrono</h2>
          <p style={{ fontSize: 20, opacity: 0.9, marginBottom: 40, lineHeight: 1.6 }}>
            Une plateforme pédagogique complète, ludique et compétitive
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 40 }}>
            {[
              { icon: '🎯', label: 'Mode Solo', desc: 'Progression autonome' },
              { icon: '⚔️', label: 'Multi & Arène', desc: 'Compétition en équipe' },
              { icon: '🏆', label: 'Tournois', desc: 'Classe → Académie' },
              { icon: '👩‍🏫', label: 'Espace Prof', desc: 'Suivi personnalisé' },
              { icon: '📊', label: 'Dashboards', desc: 'Statistiques détaillées' },
              { icon: '🌿', label: 'Multi-matières', desc: 'Nature, Maths, Langues' },
            ].map((item, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
                borderRadius: 14, padding: '16px 12px',
                border: '1px solid rgba(255,255,255,0.15)',
                animation: `presFadeIn 0.5s ease-out ${0.2 + i * 0.1}s both`,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{item.desc}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 16, opacity: 0.7 }}>
            Disponible sur tablettes, téléphones et ordinateurs — PWA installable
          </p>
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
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const pausedRef = useRef(false);

  const slide = SLIDES[slideIdx] || SLIDES[0];
  const phase = getPhase(elapsed, slide.duration);

  // Animation loop
  const tick = useCallback((timestamp) => {
    if (!startRef.current) startRef.current = timestamp;
    if (!pausedRef.current) {
      const dt = timestamp - startRef.current;
      setElapsed(dt);
      if (dt >= slide.duration) {
        startRef.current = null;
        setElapsed(0);
        setSlideIdx(prev => (prev + 1) % SLIDES.length);
      }
    } else {
      startRef.current = timestamp - elapsed;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [slide.duration, elapsed]);

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
        navigate('/');
      } else if (e.key === 'p' || e.key === 'P') {
        setPaused(p => { pausedRef.current = !p; return !p; });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate]);

  const goSlide = (idx) => { startRef.current = null; setElapsed(0); setSlideIdx(idx); };
  const togglePause = () => { setPaused(p => { pausedRef.current = !p; return !p; }); };
  const progress = elapsed / slide.duration;

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: slide.bg || CC.cream, transition: 'background 0.6s ease', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Slide content */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        {slide.render(elapsed, phase)}
      </div>

      {/* Progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'rgba(0,0,0,0.1)', zIndex: 10 }}>
        <div style={{ height: '100%', background: CC.yellow, width: `${progress * 100}%`, transition: 'width 0.1s linear' }} />
      </div>

      {/* Controls bar */}
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

        {/* Exit */}
        <button onClick={() => navigate('/')} style={{ ...btnStyle, fontSize: 12 }}>✕ Quitter</button>
      </div>

      {/* Keyboard hints */}
      {slideIdx === 0 && elapsed < 4000 && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.5)', fontSize: 12, zIndex: 10,
          animation: 'presFadeIn 1s ease-out 2s both',
        }}>
          ← → Navigation • Espace Suivant • P Pause • Échap Quitter
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
      `}</style>
    </div>
  );
}

const btnStyle = {
  background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
  fontSize: 14, fontWeight: 700, backdropFilter: 'blur(4px)',
};
