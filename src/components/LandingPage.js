import React from 'react';
import { useNavigate } from 'react-router-dom';

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
};

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ fontFamily: "'Nunito', 'Segoe UI', system-ui, sans-serif", overflow: 'hidden' }}>

      {/* ===== HERO ===== */}
      <section style={{
        minHeight: '90vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        background: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
        color: CC.white, padding: '60px 20px 80px', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 20, left: 24, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 28 }}>🕐</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>Crazy Chrono</span>
        </div>
        <div style={{
          position: 'absolute', top: 20, right: 24, display: 'flex', gap: 10,
        }}>
          <button onClick={() => navigate('/login')} style={{
            padding: '8px 20px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.4)',
            background: 'transparent', color: CC.white, fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>
            Connexion
          </button>
          <button onClick={() => navigate('/login')} style={{
            padding: '8px 20px', borderRadius: 10, border: 'none',
            background: CC.yellow, color: CC.brown, fontWeight: 800, fontSize: 14, cursor: 'pointer',
          }}>
            Inscription
          </button>
        </div>

        <div style={{ fontSize: 80, marginBottom: 16, filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.3))' }}>🕐</div>
        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 900, margin: 0,
          lineHeight: 1.15, maxWidth: 700, letterSpacing: -1,
        }}>
          Apprendre en s'amusant,<br />contre la montre !
        </h1>
        <p style={{
          fontSize: 'clamp(16px, 2.5vw, 20px)', opacity: 0.9, maxWidth: 560,
          marginTop: 16, lineHeight: 1.6,
        }}>
          Le jeu de rapidité qui rend les maths, les sciences et le vocabulaire passionnants.
          Pour les enfants du CP au collège.
        </p>

        <div style={{ display: 'flex', gap: 14, marginTop: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/login')} style={{
            padding: '16px 36px', borderRadius: 14, border: 'none',
            background: `linear-gradient(135deg, ${CC.yellow}, ${CC.yellowLt})`,
            color: CC.brown, fontWeight: 900, fontSize: 18, cursor: 'pointer',
            boxShadow: '0 6px 24px rgba(245,166,35,0.4)',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            Commencer gratuitement
          </button>
          <button onClick={() => navigate('/pricing')} style={{
            padding: '16px 36px', borderRadius: 14, border: '2px solid rgba(255,255,255,0.5)',
            background: 'rgba(255,255,255,0.1)', color: CC.white,
            fontWeight: 700, fontSize: 16, cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}>
            Voir les tarifs
          </button>
        </div>

        <div style={{
          marginTop: 40, display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center',
          fontSize: 14, opacity: 0.85,
        }}>
          <span>✅ 3 sessions gratuites/jour</span>
          <span>✅ Aucune carte bancaire requise</span>
          <span>✅ CP → Collège</span>
        </div>
      </section>

      {/* ===== COMMENT ÇA MARCHE ===== */}
      <section style={{
        padding: '80px 20px', background: CC.cream, textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: CC.brown, margin: 0 }}>
          Comment ça marche ?
        </h2>
        <p style={{ color: CC.brownLt, fontSize: 16, marginTop: 8, maxWidth: 500, margin: '8px auto 0' }}>
          Un concept simple, une efficacité prouvée
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 24, marginTop: 48, maxWidth: 900, margin: '48px auto 0',
        }}>
          {[
            { icon: '🗺️', title: 'Découvre la carte', text: 'Chaque partie génère une carte unique avec des zones à explorer. Images, calculs, mots... tout est mélangé !' },
            { icon: '🔗', title: 'Trouve les paires', text: 'Associe les éléments qui vont ensemble : un calcul avec son résultat, une image avec son nom, une plante avec sa famille.' },
            { icon: '⏱️', title: 'Bats le chrono', text: 'Le temps défile ! Plus tu trouves de paires rapidement, plus ton score grimpe. Essaie de battre ton record !' },
          ].map((step, i) => (
            <div key={i} style={{
              background: CC.white, borderRadius: 20, padding: '32px 24px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
              border: '2px solid #f1f5f9',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: `linear-gradient(135deg, ${CC.teal}, ${CC.tealDeep})`,
                color: CC.white, fontWeight: 900, fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>{i + 1}</div>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{step.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: CC.brown, margin: '0 0 8px' }}>{step.title}</h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: 0 }}>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== THÉMATIQUES ===== */}
      <section style={{ padding: '80px 20px', background: CC.white, textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: CC.brown, margin: 0 }}>
          Des thématiques variées
        </h2>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center',
          marginTop: 40, maxWidth: 700, margin: '40px auto 0',
        }}>
          {[
            { emoji: '🔢', label: 'Calcul mental' },
            { emoji: '🌿', label: 'Botanique' },
            { emoji: '🍎', label: 'Fruits & Légumes' },
            { emoji: '🦁', label: 'Animaux' },
            { emoji: '📖', label: 'Vocabulaire' },
            { emoji: '🌍', label: 'Géographie' },
            { emoji: '🧪', label: 'Sciences' },
            { emoji: '🎨', label: 'Et bien plus...' },
          ].map((t, i) => (
            <div key={i} style={{
              background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: 14,
              padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 15, fontWeight: 700, color: CC.brown,
              transition: 'all 0.2s',
            }}>
              <span style={{ fontSize: 22 }}>{t.emoji}</span> {t.label}
            </div>
          ))}
        </div>
      </section>

      {/* ===== MODES DE JEU ===== */}
      <section style={{
        padding: '80px 20px',
        background: `linear-gradient(160deg, #f0fdff 0%, ${CC.cream} 100%)`,
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: CC.brown, margin: 0 }}>
          Plusieurs modes de jeu
        </h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20, marginTop: 40, maxWidth: 800, margin: '40px auto 0',
        }}>
          {[
            { icon: '🎯', title: 'Solo', desc: 'Entraîne-toi à ton rythme', badge: 'Gratuit' },
            { icon: '🔑', title: 'Salle Privée', desc: 'Défi entre amis en temps réel', badge: 'Pro' },
            { icon: '🏟️', title: 'Grande Salle', desc: 'Course éliminatoire massive', badge: 'Pro' },
            { icon: '📚', title: 'Mode Apprendre', desc: 'Révise avec stratégies et audio', badge: 'Pro' },
          ].map((m, i) => (
            <div key={i} style={{
              background: CC.white, borderRadius: 16, padding: '24px 20px',
              boxShadow: '0 3px 15px rgba(0,0,0,0.06)',
              border: '2px solid #e2e8f0', position: 'relative',
            }}>
              {m.badge && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  background: m.badge === 'Gratuit' ? '#10b981' : CC.yellow,
                  color: m.badge === 'Gratuit' ? CC.white : CC.brown,
                  fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
                }}>{m.badge}</div>
              )}
              <div style={{ fontSize: 40, marginBottom: 8 }}>{m.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: CC.brown, margin: '0 0 4px' }}>{m.title}</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== POUR QUI ===== */}
      <section style={{ padding: '80px 20px', background: CC.white, textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: CC.brown, margin: 0 }}>
          Pour qui ?
        </h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24, marginTop: 40, maxWidth: 900, margin: '40px auto 0',
        }}>
          {[
            { icon: '👦', title: 'Enfants', text: 'Du CP au collège. Apprends les maths, les sciences et le vocabulaire en jouant.' },
            { icon: '👨‍👩‍👧', title: 'Parents', text: 'Suivez la progression de vos enfants. Un outil éducatif amusant et sans écran passif.' },
            { icon: '👩‍🏫', title: 'Enseignants', text: 'Dashboard de suivi par élève, import CSV, sessions de classe dirigées. Idéal pour la différenciation.' },
          ].map((p, i) => (
            <div key={i} style={{
              background: '#f8fafc', borderRadius: 20, padding: '32px 24px',
              border: '2px solid #e2e8f0',
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{p.icon}</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: CC.tealDeep, margin: '0 0 8px' }}>{p.title}</h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: 0 }}>{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section style={{
        padding: '80px 20px', textAlign: 'center',
        background: `linear-gradient(160deg, ${CC.tealDeep} 0%, ${CC.teal} 100%)`,
        color: CC.white,
      }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 900, margin: 0 }}>
          Prêt à relever le défi ?
        </h2>
        <p style={{ fontSize: 18, opacity: 0.9, marginTop: 12, maxWidth: 500, margin: '12px auto 0' }}>
          Créez votre compte en 30 secondes et lancez votre première partie.
        </p>
        <button onClick={() => navigate('/login')} style={{
          marginTop: 28, padding: '18px 44px', borderRadius: 14, border: 'none',
          background: `linear-gradient(135deg, ${CC.yellow}, ${CC.yellowLt})`,
          color: CC.brown, fontWeight: 900, fontSize: 20, cursor: 'pointer',
          boxShadow: '0 8px 30px rgba(245,166,35,0.4)',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          Commencer gratuitement
        </button>
        <div style={{ marginTop: 16, fontSize: 14, opacity: 0.8 }}>
          Aucune carte bancaire requise
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{
        padding: '32px 20px', background: '#1a1a2e', color: '#94a3b8',
        textAlign: 'center', fontSize: 13,
      }}>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <a href="/pricing" style={{ color: '#94a3b8', textDecoration: 'none' }}>Tarifs</a>
          <a href="/legal" style={{ color: '#94a3b8', textDecoration: 'none' }}>Mentions légales</a>
          <a href="mailto:contact@crazy-chrono.com" style={{ color: '#94a3b8', textDecoration: 'none' }}>Contact</a>
        </div>
        <div>© {new Date().getFullYear()} Crazy Chrono — Tous droits réservés</div>
      </footer>
    </div>
  );
}
