import React, { useState } from 'react';

const CC = {
  teal: '#1AACBE',
  tealDark: '#0D6A7A',
  yellow: '#F5A623',
  brown: '#4A3728',
  white: '#FFFFFF',
};

const STEPS = [
  {
    icon: '👋',
    title: 'Bienvenue sur Crazy Chrono !',
    text: 'Un jeu éducatif où tu dois trouver les bonnes associations le plus vite possible. Calculs, images, plantes, fruits... chaque carte cache une paire à retrouver !',
  },
  {
    icon: '🎯',
    title: 'Comment jouer ?',
    text: 'Clique sur deux zones de la carte qui vont ensemble. Par exemple : un calcul et son résultat, ou une image et son nom. Trouve la bonne paire avant la fin du chrono !',
  },
  {
    icon: '⚡',
    title: 'Gagne des points',
    text: 'Chaque bonne association te donne +1 point. Plus tu es rapide, meilleure sera ta rapidité en paires/minute. Essaie de battre ton record !',
  },
  {
    icon: '🏆',
    title: 'Progresse et débloque des badges',
    text: 'En jouant, tu gagnes des badges Bronze 🥉, Argent 🥈 et Or 🥇 dans chaque thème. Consulte tes performances pour voir ta progression !',
  },
  {
    icon: '🚀',
    title: 'Prêt à jouer ?',
    text: 'Commence par le Mode Solo pour t\'entraîner. Tu as 3 sessions gratuites par jour. Lance ta première partie !',
  },
];

const STORAGE_KEY = 'cc_onboarding_done';

export function shouldShowOnboarding() {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch { return false; }
}

export function markOnboardingDone() {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
}

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      markOnboardingDone();
      onDone();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    markOnboardingDone();
    onDone();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: CC.white, borderRadius: 24, padding: '40px 32px 32px',
        maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        animation: 'fadeIn 0.3s ease',
      }}>
        {/* Indicateur d'étape */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 4,
              background: i === step ? CC.teal : i < step ? CC.tealDark : '#e2e8f0',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* Icône */}
        <div style={{
          fontSize: 64, marginBottom: 16, lineHeight: 1,
          animation: 'bounceIn 0.4s ease',
        }}>
          {current.icon}
        </div>

        {/* Titre */}
        <h2 style={{
          fontSize: 22, fontWeight: 800, color: CC.brown,
          marginBottom: 12, lineHeight: 1.3,
        }}>
          {current.title}
        </h2>

        {/* Texte */}
        <p style={{
          fontSize: 15, color: '#64748b', lineHeight: 1.6,
          marginBottom: 32, padding: '0 8px',
        }}>
          {current.text}
        </p>

        {/* Boutons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {!isLast && (
            <button onClick={handleSkip} style={{
              padding: '12px 24px', borderRadius: 12,
              border: '1px solid #e2e8f0', background: 'transparent',
              color: '#94a3b8', fontSize: 14, fontWeight: 600,
              cursor: 'pointer',
            }}>
              Passer
            </button>
          )}
          <button onClick={handleNext} style={{
            padding: '12px 32px', borderRadius: 12, border: 'none',
            background: isLast
              ? `linear-gradient(135deg, ${CC.yellow} 0%, #d4900e 100%)`
              : `linear-gradient(135deg, ${CC.teal} 0%, ${CC.tealDark} 100%)`,
            color: CC.white, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
            transition: 'transform 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {isLast ? '🎮 Commencer !' : 'Suivant →'}
          </button>
        </div>

        {/* Compteur */}
        <div style={{ marginTop: 16, fontSize: 12, color: '#cbd5e1' }}>
          {step + 1} / {STEPS.length}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes bounceIn {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
