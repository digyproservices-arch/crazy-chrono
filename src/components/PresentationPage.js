import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import InteractiveDemo from './InteractiveDemo';

// ==========================================
// PAGE PRÉSENTATION ANIMÉE — Crazy Chrono
// Diaporama plein écran auto-défilant
// Pour démo rectorat, enseignants, visiteurs
// ==========================================

const CC = {
  teal: '#1AACBE',
  tealDark: '#148A9C',
  tealDeep: '#0D6A7A',
  yellow: '#F5A623',
  yellowLt: '#FFC940',
  brown: '#4A3728',
  brownLt: '#6B5443',
  white: '#FFFFFF',
  cream: '#FFF9F0',
  green: '#10b981',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  orange: '#f97316',
};

const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981'];
const PLAYER_NAMES = ['Emma', 'Lucas', 'Jade', 'Noah'];

// ============ SLIDE DATA ============
const SLIDES = [
  // 0 — TITLE
  {
    id: 'title',
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
    duration: 8000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: CC.white, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 100, marginBottom: 20, animation: 'presFloat 3s ease-in-out infinite', filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.3))' }}>🕐</div>
        <h1 style={{ fontSize: 'clamp(48px, 8vw, 80px)', fontWeight: 900, margin: 0, letterSpacing: -2, lineHeight: 1.1 }}>
          Crazy Chrono
        </h1>
        <p style={{ fontSize: 'clamp(18px, 3vw, 26px)', opacity: 0.9, marginTop: 16, maxWidth: 600, lineHeight: 1.5 }}>
          Le jeu pédagogique qui transforme l'apprentissage en défi passionnant
        </p>
        <div style={{ display: 'flex', gap: 16, marginTop: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e'].map((level, i) => (
            <span key={level} style={{
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
              padding: '8px 18px', borderRadius: 20, fontSize: 16, fontWeight: 700,
              border: '1px solid rgba(255,255,255,0.25)',
              animation: `presFadeInUp 0.5s ease-out ${0.3 + i * 0.1}s both`,
            }}>{level}</span>
          ))}
        </div>
        {/* Floating bubbles decoration */}
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 20 + i * 12, height: 20 + i * 12, borderRadius: '50%',
            background: `rgba(255,255,255,${0.04 + i * 0.02})`,
            left: `${10 + i * 15}%`, bottom: `${5 + (i % 3) * 20}%`,
            animation: `presFloat ${3 + i * 0.7}s ease-in-out infinite ${i * 0.5}s`,
          }} />
        ))}
      </div>
    ),
  },

  // 1 — LE CONCEPT
  {
    id: 'concept',
    bg: CC.cream,
    duration: 10000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🗺️</div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, color: CC.tealDeep, margin: 0 }}>
          Le Concept
        </h2>
        <p style={{ fontSize: 18, color: CC.brownLt, maxWidth: 600, marginTop: 12, lineHeight: 1.6 }}>
          Une carte unique avec 16 zones. Trouve les paires le plus vite possible !
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginTop: 36, maxWidth: 800, width: '100%' }}>
          {[
            { icon: '🖼️', title: 'Image ↔ Nom', desc: 'Associe l\'animal ou le fruit à son nom', color: CC.blue },
            { icon: '🔢', title: 'Calcul ↔ Résultat', desc: 'Trouve le résultat du calcul mental', color: CC.green },
            { icon: '📖', title: 'Mot ↔ Définition', desc: 'Enrichis ton vocabulaire en jouant', color: CC.purple },
          ].map((item, i) => (
            <div key={i} style={{
              background: CC.white, borderRadius: 20, padding: '28px 20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
              border: `2px solid ${item.color}22`,
              animation: `presFadeInUp 0.6s ease-out ${0.2 + i * 0.15}s both`,
            }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>{item.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: item.color, margin: '0 0 6px' }}>{item.title}</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 2 — DÉMO EN ACTION
  {
    id: 'demo',
    bg: CC.white,
    duration: 12000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '30px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, color: CC.tealDeep, margin: '0 0 4px' }}>
          Voyez le jeu en action !
        </h2>
        <p style={{ fontSize: 15, color: CC.brownLt, margin: '0 0 16px' }}>
          Le joueur trouve une paire image ↔ nom... les bulles s'envolent !
        </p>
        <div style={{ maxWidth: 480, width: '100%' }}>
          <InteractiveDemo />
        </div>
      </div>
    ),
  },

  // 3 — THÉMATIQUES
  {
    id: 'themes',
    bg: `linear-gradient(160deg, #f0fdff 0%, ${CC.cream} 100%)`,
    duration: 9000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: CC.brown, margin: 0 }}>
          Des thématiques locales et variées
        </h2>
        <p style={{ fontSize: 16, color: CC.brownLt, maxWidth: 550, marginTop: 10, lineHeight: 1.6 }}>
          Contenu ancré dans la culture caribéenne et adapté aux programmes scolaires
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 36, maxWidth: 700 }}>
          {[
            { emoji: '🦜', label: 'Faune des Antilles', delay: 0 },
            { emoji: '🌺', label: 'Flore tropicale', delay: 0.1 },
            { emoji: '🍎', label: 'Fruits & Légumes péyi', delay: 0.2 },
            { emoji: '🔢', label: 'Calcul mental (CP→CM2)', delay: 0.3 },
            { emoji: '🧪', label: 'Sciences', delay: 0.4 },
            { emoji: '📖', label: 'Vocabulaire', delay: 0.5 },
            { emoji: '🌊', label: 'Faune marine', delay: 0.6 },
            { emoji: '🌿', label: 'Plantes médicinales', delay: 0.7 },
          ].map((t, i) => (
            <div key={i} style={{
              background: CC.white, border: '2px solid #e2e8f0', borderRadius: 16,
              padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 16, fontWeight: 700, color: CC.brown,
              boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
              animation: `presFadeInUp 0.5s ease-out ${t.delay}s both`,
            }}>
              <span style={{ fontSize: 26 }}>{t.emoji}</span> {t.label}
            </div>
          ))}
        </div>
        {/* Sample images */}
        <div style={{ display: 'flex', gap: 12, marginTop: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['colibri', 'flamant-rose', 'fruit-a-pain', 'dauphin'].map((img, i) => (
            <div key={img} style={{
              width: 80, height: 80, borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              animation: `presFadeInUp 0.5s ease-out ${0.4 + i * 0.1}s both`,
            }}>
              <img src={`${process.env.PUBLIC_URL}/images/${img}.jpeg`} alt={img}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 4 — MODE SOLO
  {
    id: 'solo',
    bg: CC.white,
    duration: 9000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: `linear-gradient(135deg, ${CC.green}, #059669)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, marginBottom: 20, boxShadow: '0 8px 30px rgba(16,185,129,0.3)',
        }}>🎯</div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: CC.tealDeep, margin: 0 }}>
          Mode Solo
        </h2>
        <p style={{ fontSize: 17, color: CC.brownLt, maxWidth: 500, marginTop: 10, lineHeight: 1.6 }}>
          L'élève s'entraîne à son rythme, sans pression. Idéal pour progresser.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 32, maxWidth: 650, width: '100%' }}>
          {[
            { icon: '⏱️', title: 'Contre le chrono', desc: 'Le temps défile, trouve les paires vite !' },
            { icon: '🎯', title: 'Mode Objectif', desc: 'Atteins un nombre de paires pour gagner' },
            { icon: '📈', title: 'Records personnels', desc: 'Bats ton meilleur score et ta meilleure vitesse' },
            { icon: '🆓', title: 'Gratuit', desc: '3 sessions par jour sans abonnement' },
          ].map((f, i) => (
            <div key={i} style={{
              background: '#f0fdf4', borderRadius: 16, padding: '20px 16px',
              border: '2px solid #bbf7d0',
              animation: `presFadeInUp 0.5s ease-out ${0.1 + i * 0.12}s both`,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{f.icon}</div>
              <h4 style={{ fontSize: 15, fontWeight: 800, color: '#065f46', margin: '0 0 4px' }}>{f.title}</h4>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 5 — MODE MULTIJOUEUR
  {
    id: 'multi',
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 100%)`,
    duration: 10000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center', color: CC.white }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>⚔️</div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, margin: 0 }}>
          Mode Multijoueur
        </h2>
        <p style={{ fontSize: 17, opacity: 0.9, maxWidth: 550, marginTop: 10, lineHeight: 1.6 }}>
          Même carte, même chrono. Qui trouvera les paires le plus vite ?
        </p>
        {/* Simulated scoreboard */}
        <div style={{
          background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)',
          borderRadius: 20, padding: '24px 32px', marginTop: 32, maxWidth: 400, width: '100%',
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.7, marginBottom: 16, letterSpacing: 1 }}>CLASSEMENT EN DIRECT</div>
          {PLAYER_NAMES.map((name, i) => {
            const scores = [8, 6, 5, 3];
            const barWidth = (scores[i] / 8) * 100;
            return (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
                animation: `presFadeInUp 0.4s ease-out ${0.3 + i * 0.15}s both`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: PLAYER_COLORS[i], display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 900, color: '#fff',
                  boxShadow: `0 3px 12px ${PLAYER_COLORS[i]}66`,
                }}>{name[0]}</div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
                  <div style={{
                    height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)', marginTop: 4,
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: PLAYER_COLORS[i],
                      width: `${barWidth}%`, transition: 'width 1s ease-out',
                    }} />
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, minWidth: 30, textAlign: 'right' }}>{scores[i]}</div>
              </div>
            );
          })}
        </div>
        {/* Bubbles with player initials */}
        <div style={{ display: 'flex', gap: 16, marginTop: 28, justifyContent: 'center' }}>
          {PLAYER_NAMES.map((name, i) => (
            <div key={name} style={{
              width: 50, height: 50, borderRadius: '50%',
              background: PLAYER_COLORS[i], display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 900, color: '#fff',
              border: '3px solid #fff',
              boxShadow: `0 4px 20px ${PLAYER_COLORS[i]}55`,
              animation: `presFloat ${2.5 + i * 0.3}s ease-in-out infinite ${i * 0.4}s`,
            }}>{name[0]}</div>
          ))}
        </div>
        <p style={{ fontSize: 14, opacity: 0.8, marginTop: 16 }}>
          Les bulles s'envolent avec les couleurs de chaque joueur !
        </p>
      </div>
    ),
  },

  // 6 — CRAZY ARENA
  {
    id: 'arena',
    bg: CC.white,
    duration: 10000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, marginBottom: 20, boxShadow: '0 8px 30px rgba(245,158,11,0.3)',
        }}>🏆</div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: CC.brown, margin: 0 }}>
          Crazy Arena — Le Tournoi
        </h2>
        <p style={{ fontSize: 17, color: CC.brownLt, maxWidth: 550, marginTop: 10, lineHeight: 1.6 }}>
          4 joueurs s'affrontent dans un tournoi à élimination directe. Le plus rapide gagne !
        </p>
        {/* Bracket visualization */}
        <div style={{ marginTop: 32, position: 'relative', maxWidth: 500, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Left bracket */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {[['Emma', 'Lucas'], ['Jade', 'Noah']].map((pair, pi) => (
                <div key={pi} style={{
                  background: '#f8fafc', borderRadius: 12, padding: '12px 20px',
                  border: '2px solid #e2e8f0', minWidth: 130,
                  animation: `presFadeInUp 0.5s ease-out ${pi * 0.2}s both`,
                }}>
                  {pair.map((name, ni) => (
                    <div key={name} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                      fontWeight: ni === 0 ? 800 : 600,
                      color: ni === 0 ? CC.green : '#94a3b8',
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: PLAYER_COLORS[pi * 2 + ni],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, color: '#fff', fontWeight: 900,
                      }}>{name[0]}</div>
                      <span style={{ fontSize: 14 }}>{name}</span>
                      {ni === 0 && <span style={{ marginLeft: 'auto', fontSize: 12 }}>🏅</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {/* Arrow */}
            <div style={{ fontSize: 32, color: CC.yellow, animation: 'presPulse 1.5s ease-in-out infinite' }}>→</div>
            {/* Final */}
            <div style={{
              background: `linear-gradient(135deg, ${CC.yellow}22, ${CC.yellow}11)`,
              borderRadius: 16, padding: '16px 24px',
              border: `2px solid ${CC.yellow}`,
              animation: 'presFadeInUp 0.5s ease-out 0.5s both',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: CC.yellow, marginBottom: 8 }}>🏆 FINALE</div>
              {['Emma', 'Jade'].map((name, i) => (
                <div key={name} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                  fontWeight: i === 0 ? 800 : 600,
                  color: i === 0 ? CC.green : '#94a3b8',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: PLAYER_COLORS[i * 2],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#fff', fontWeight: 900,
                  }}>{name[0]}</div>
                  <span style={{ fontSize: 14 }}>{name}</span>
                  {i === 0 && <span style={{ marginLeft: 'auto' }}>🥇</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { icon: '👁️', text: 'Mode spectateur en direct' },
            { icon: '📊', text: 'Statistiques par match' },
            { icon: '🎓', text: 'Géré par l\'enseignant' },
          ].map((f, i) => (
            <span key={i} style={{
              background: '#f8fafc', padding: '8px 16px', borderRadius: 10,
              fontSize: 13, fontWeight: 700, color: CC.brownLt,
              border: '1px solid #e2e8f0',
            }}>{f.icon} {f.text}</span>
          ))}
        </div>
      </div>
    ),
  },

  // 7 — GRANDE SALLE
  {
    id: 'grande-salle',
    bg: `linear-gradient(160deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)`,
    duration: 9000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center', color: CC.white }}>
        <div style={{ fontSize: 64, marginBottom: 16, animation: 'presPulse 2s ease-in-out infinite' }}>🏟️</div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, margin: 0 }}>
          La Grande Salle
        </h2>
        <p style={{ fontSize: 17, opacity: 0.9, maxWidth: 550, marginTop: 12, lineHeight: 1.6 }}>
          Course éliminatoire massive. Des dizaines d'élèves dans la même arène !
        </p>
        {/* Simulated crowd */}
        <div style={{ marginTop: 32, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 400 }}>
          {[...Array(20)].map((_, i) => (
            <div key={i} style={{
              width: 40, height: 40, borderRadius: '50%',
              background: PLAYER_COLORS[i % 4],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 900, color: '#fff',
              opacity: i < 12 ? 1 : 0.4,
              border: i < 12 ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
              animation: `presFadeInUp 0.3s ease-out ${i * 0.05}s both`,
            }}>
              {i < 12 ? String.fromCharCode(65 + i) : '?'}
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 24, background: 'rgba(255,255,255,0.1)', borderRadius: 12,
          padding: '12px 24px', fontSize: 14, fontWeight: 700,
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          <span style={{ color: CC.green }}>12 actifs</span> &nbsp;·&nbsp;
          <span style={{ color: CC.red }}>8 éliminés</span> &nbsp;·&nbsp;
          <span style={{ color: CC.yellow }}>Tour 3/5</span>
        </div>
        <p style={{ fontSize: 14, opacity: 0.7, marginTop: 16, maxWidth: 400 }}>
          Les derniers à chaque tour sont éliminés. Seul le plus rapide survit !
        </p>
      </div>
    ),
  },

  // 8 — L'ENSEIGNANT
  {
    id: 'teacher',
    bg: CC.cream,
    duration: 10000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: `linear-gradient(135deg, ${CC.teal}, ${CC.tealDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, marginBottom: 20, boxShadow: '0 8px 30px rgba(26,172,190,0.3)',
        }}>👩‍🏫</div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: CC.tealDeep, margin: 0 }}>
          L'Espace Enseignant
        </h2>
        <p style={{ fontSize: 17, color: CC.brownLt, maxWidth: 550, marginTop: 10, lineHeight: 1.6 }}>
          Un tableau de bord complet pour piloter les sessions et suivre les élèves
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 32, maxWidth: 700, width: '100%' }}>
          {[
            { icon: '👥', title: 'Gestion des classes', desc: 'Créez vos classes, ajoutez des élèves par import CSV ou invitation', color: CC.blue },
            { icon: '🎮', title: 'Sessions dirigées', desc: 'Lancez des sessions solo, multijoueur ou Arena pour votre classe', color: CC.green },
            { icon: '📋', title: 'Groupes de travail', desc: 'Organisez les élèves en groupes pour des défis ciblés', color: CC.purple },
            { icon: '⚙️', title: 'Configuration fine', desc: 'Choisissez les thèmes, le niveau, la durée, les contraintes', color: CC.orange },
          ].map((f, i) => (
            <div key={i} style={{
              background: CC.white, borderRadius: 16, padding: '22px 18px', textAlign: 'left',
              border: `2px solid ${f.color}22`,
              boxShadow: '0 3px 15px rgba(0,0,0,0.04)',
              animation: `presFadeInUp 0.5s ease-out ${0.1 + i * 0.12}s both`,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${f.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, marginBottom: 10,
              }}>{f.icon}</div>
              <h4 style={{ fontSize: 15, fontWeight: 800, color: CC.brown, margin: '0 0 4px' }}>{f.title}</h4>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },

  // 9 — SUIVI DES ÉLÈVES
  {
    id: 'tracking',
    bg: CC.white,
    duration: 10000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: CC.tealDeep, margin: 0 }}>
          Suivi des Performances
        </h2>
        <p style={{ fontSize: 17, color: CC.brownLt, maxWidth: 550, marginTop: 10, lineHeight: 1.6 }}>
          Chaque élève a son tableau de bord personnel. L'enseignant voit tout.
        </p>
        {/* Mock dashboard */}
        <div style={{
          background: '#f8fafc', borderRadius: 20, padding: 24, marginTop: 28,
          maxWidth: 600, width: '100%', border: '2px solid #e2e8f0',
          textAlign: 'left',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: CC.blue,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 900, color: '#fff',
            }}>E</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: CC.brown }}>Emma Dupont</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>CE2 · Classe de Mme Martin</div>
            </div>
          </div>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { value: '156', label: 'Paires', color: CC.blue },
              { value: '2.3s', label: 'Moy. réponse', color: CC.green },
              { value: '94%', label: 'Réussite', color: CC.purple },
              { value: '12', label: 'Badges', color: CC.yellow },
            ].map((s, i) => (
              <div key={i} style={{
                background: CC.white, borderRadius: 12, padding: '12px 8px', textAlign: 'center',
                border: '1px solid #e2e8f0',
              }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* Progress bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: CC.brownLt, marginBottom: 6 }}>
              <span>Progression globale</span><span style={{ color: CC.green }}>78%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#e2e8f0' }}>
              <div style={{ height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${CC.green}, ${CC.teal})`, width: '78%' }} />
            </div>
          </div>
          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['🦜 Faune', '🔢 Calcul', '🌿 Plantes', '🍎 Fruits'].map((badge, i) => (
              <span key={i} style={{
                background: `${CC.green}15`, padding: '4px 12px', borderRadius: 8,
                fontSize: 12, fontWeight: 700, color: '#065f46',
              }}>{badge}</span>
            ))}
          </div>
        </div>
      </div>
    ),
  },

  // 10 — DASHBOARD RECTORAT
  {
    id: 'rectorat',
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, #0f4c5c 100%)`,
    duration: 10000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center', color: CC.white }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, marginBottom: 20, border: '2px solid rgba(255,255,255,0.2)',
        }}>🏛️</div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, margin: 0 }}>
          Dashboard Rectorat
        </h2>
        <p style={{ fontSize: 17, opacity: 0.9, maxWidth: 550, marginTop: 10, lineHeight: 1.6 }}>
          Vue d'ensemble pour les cadres académiques. Pilotage à l'échelle.
        </p>
        {/* Mock KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginTop: 32, maxWidth: 600, width: '100%' }}>
          {[
            { value: '1 247', label: 'Élèves actifs', icon: '👨‍🎓' },
            { value: '58', label: 'Enseignants', icon: '👩‍🏫' },
            { value: '23', label: 'Établissements', icon: '🏫' },
            { value: '45 210', label: 'Parties jouées', icon: '🎮' },
          ].map((kpi, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)',
              borderRadius: 16, padding: '20px 16px',
              border: '1px solid rgba(255,255,255,0.15)',
              animation: `presFadeInUp 0.5s ease-out ${0.1 + i * 0.12}s both`,
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{kpi.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{kpi.value}</div>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 600, marginTop: 4 }}>{kpi.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            '📈 Progression par école',
            '🗺️ Carte des établissements',
            '📋 Rapports exportables',
          ].map((f, i) => (
            <span key={i} style={{
              background: 'rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: 10,
              fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,255,255,0.2)',
            }}>{f}</span>
          ))}
        </div>
      </div>
    ),
  },

  // 11 — COMPÉTITION / CLASSEMENT
  {
    id: 'competition',
    bg: `linear-gradient(160deg, #fef3c7 0%, #fde68a 50%, #fbbf24 100%)`,
    duration: 9000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏅</div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: CC.brown, margin: 0 }}>
          Compétition & Classement
        </h2>
        <p style={{ fontSize: 17, color: CC.brownLt, maxWidth: 550, marginTop: 10, lineHeight: 1.6 }}>
          Organisez des compétitions entre classes, suivez les résultats en direct
        </p>
        {/* Podium */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 36, justifyContent: 'center' }}>
          {[
            { place: '🥈', name: 'CE2-B', score: 142, h: 100, color: '#94a3b8' },
            { place: '🥇', name: 'CM1-A', score: 186, h: 140, color: CC.yellow },
            { place: '🥉', name: 'CE1-C', score: 98, h: 70, color: '#cd7f32' },
          ].map((p, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              animation: `presFadeInUp 0.5s ease-out ${0.2 + i * 0.15}s both`,
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>{p.place}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: CC.brown }}>{p.name}</div>
              <div style={{ fontSize: 12, color: CC.brownLt }}>{p.score} pts</div>
              <div style={{
                width: 80, height: p.h, borderRadius: '12px 12px 0 0', marginTop: 8,
                background: `linear-gradient(180deg, ${p.color}, ${p.color}88)`,
              }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['Inter-classes', 'Inter-écoles', 'Académique'].map((level, i) => (
            <span key={i} style={{
              background: CC.white, padding: '8px 18px', borderRadius: 10,
              fontSize: 14, fontWeight: 700, color: CC.brown,
              border: '2px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>🏆 {level}</span>
          ))}
        </div>
      </div>
    ),
  },

  // 12 — CONCLUSION
  {
    id: 'conclusion',
    bg: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.green} 100%)`,
    duration: 10000,
    render: (p) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: CC.white, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 80, marginBottom: 20, animation: 'presFloat 3s ease-in-out infinite' }}>🕐</div>
        <h2 style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 900, margin: 0, lineHeight: 1.15 }}>
          Crazy Chrono
        </h2>
        <p style={{ fontSize: 'clamp(18px, 3vw, 24px)', opacity: 0.95, maxWidth: 600, marginTop: 16, lineHeight: 1.5, fontWeight: 600 }}>
          L'outil pédagogique numérique qui rend l'apprentissage ludique, compétitif et mesurable.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 36, maxWidth: 650, width: '100%' }}>
          {[
            { icon: '🎯', text: 'Adapté du CP au collège' },
            { icon: '🌴', text: 'Contenu caribéen local' },
            { icon: '📊', text: 'Suivi en temps réel' },
            { icon: '🏆', text: 'Compétitions motivantes' },
            { icon: '👩‍🏫', text: 'Piloté par l\'enseignant' },
            { icon: '📱', text: 'Fonctionne sur tout appareil' },
          ].map((f, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)',
              borderRadius: 14, padding: '14px 16px',
              border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 14, fontWeight: 700,
              animation: `presFadeInUp 0.4s ease-out ${0.1 + i * 0.1}s both`,
            }}>
              <span style={{ fontSize: 22 }}>{f.icon}</span> {f.text}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 20, fontWeight: 800, marginTop: 36, opacity: 0.9 }}>
          app.crazy-chrono.com
        </p>
      </div>
    ),
  },
];

// ============ MAIN COMPONENT ============
export default function PresentationPage() {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const startTimeRef = useRef(Date.now());
  const animRef = useRef(null);

  const slide = SLIDES[currentSlide];

  const goToSlide = useCallback((idx) => {
    if (idx === currentSlide || transitioning) return;
    setTransitioning(true);
    setTimeout(() => {
      setCurrentSlide(idx);
      setProgress(0);
      startTimeRef.current = Date.now();
      setTransitioning(false);
    }, 400);
  }, [currentSlide, transitioning]);

  const nextSlide = useCallback(() => {
    const next = (currentSlide + 1) % SLIDES.length;
    goToSlide(next);
  }, [currentSlide, goToSlide]);

  const prevSlide = useCallback(() => {
    const prev = (currentSlide - 1 + SLIDES.length) % SLIDES.length;
    goToSlide(prev);
  }, [currentSlide, goToSlide]);

  // Auto-advance
  useEffect(() => {
    if (paused) return;
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const duration = SLIDES[currentSlide]?.duration || 8000;
      const p = Math.min(1, elapsed / duration);
      setProgress(p);
      if (p >= 1) {
        nextSlide();
      } else {
        animRef.current = requestAnimationFrame(tick);
      }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [currentSlide, paused, nextSlide]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextSlide(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevSlide(); }
      if (e.key === 'Escape') navigate(-1);
      if (e.key === 'p' || e.key === 'P') setPaused(p => !p);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nextSlide, prevSlide, navigate]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      fontFamily: "'Nunito', 'Segoe UI', system-ui, sans-serif",
      overflow: 'hidden',
    }}>
      {/* Slide background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: slide.bg,
        transition: 'opacity 0.4s ease',
        opacity: transitioning ? 0 : 1,
      }} />

      {/* Slide content */}
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        opacity: transitioning ? 0 : 1,
        transform: transitioning ? 'scale(0.97)' : 'scale(1)',
        transition: 'all 0.4s ease',
        overflowY: 'auto',
      }}>
        {slide.render(progress)}
      </div>

      {/* Top bar: close + pause + slide counter */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', zIndex: 10,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
          border: 'none', borderRadius: 10, padding: '8px 16px',
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ← Quitter
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setPaused(p => !p)} style={{
            background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
            border: 'none', borderRadius: 10, padding: '8px 14px',
            color: '#fff', fontSize: 16, cursor: 'pointer',
          }}>
            {paused ? '▶' : '⏸'}
          </button>
          <span style={{
            background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
            borderRadius: 10, padding: '8px 14px',
            color: '#fff', fontSize: 13, fontWeight: 700,
          }}>
            {currentSlide + 1} / {SLIDES.length}
          </span>
        </div>
      </div>

      {/* Navigation arrows */}
      <button onClick={prevSlide} style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)',
        border: 'none', borderRadius: 14, padding: '16px 12px',
        color: '#fff', fontSize: 24, cursor: 'pointer', zIndex: 10,
        opacity: 0.7, transition: 'opacity 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
      onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
      >‹</button>
      <button onClick={nextSlide} style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)',
        border: 'none', borderRadius: 14, padding: '16px 12px',
        color: '#fff', fontSize: 24, cursor: 'pointer', zIndex: 10,
        opacity: 0.7, transition: 'opacity 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
      onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
      >›</button>

      {/* Bottom: progress bar + dots */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0 0 16px', zIndex: 10,
      }}>
        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', margin: '0 20px 12px' }}>
          <div style={{
            height: '100%', background: CC.yellow,
            width: `${progress * 100}%`, borderRadius: 2,
            transition: progress < 0.02 ? 'none' : 'width 0.3s linear',
          }} />
        </div>
        {/* Dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {SLIDES.map((s, i) => (
            <button key={s.id} onClick={() => goToSlide(i)} style={{
              width: currentSlide === i ? 24 : 8, height: 8,
              borderRadius: 4, border: 'none', cursor: 'pointer',
              background: currentSlide === i ? CC.yellow : 'rgba(255,255,255,0.35)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      </div>

      {/* Pause overlay */}
      {paused && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
          cursor: 'pointer',
        }} onClick={() => setPaused(false)}>
          <div style={{
            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)',
            borderRadius: 24, padding: '24px 40px',
            color: '#fff', fontSize: 20, fontWeight: 800,
            border: '2px solid rgba(255,255,255,0.3)',
          }}>
            ⏸ En pause — Cliquez pour reprendre
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes presFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes presFadeInUp {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes presPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
