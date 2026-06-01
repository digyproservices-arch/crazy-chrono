import React, { useState, useEffect } from 'react';

/**
 * PWAInstallGuide — Écran intermédiaire avant la Grande Salle
 * Guide l'utilisateur pour installer la PWA (plein écran immersif)
 * ou continuer sans installer (avec optimisations CSS).
 * 
 * Props:
 *   onContinue() — appelé quand l'utilisateur veut continuer (avec ou sans installation)
 */

const CC = {
  teal: '#1AACBE',
  tealDark: '#148A9C',
  tealDeep: '#0D6A7A',
  gold: '#F5A623',
  dark: '#0f172a',
  darkCard: 'rgba(255,255,255,0.08)',
};

function detectPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edge|Edg|OPR/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return { isIOS, isSafari, isAndroid, isChrome, isStandalone };
}

export default function PWAInstallGuide({ onContinue }) {
  const [platform, setPlatform] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);

    // Si déjà en mode PWA, passer directement
    if (p.isStandalone) {
      onContinue();
      return;
    }

    // Android Chrome: intercepter beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Détecter si l'app vient d'être installée
    const onInstalled = () => {
      setInstalled(true);
      setTimeout(() => onContinue(), 1500);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [onContinue]);

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstalled(true);
        setTimeout(() => onContinue(), 1500);
      } else {
        setInstalling(false);
      }
    } catch {
      setInstalling(false);
    }
    setDeferredPrompt(null);
  };

  // Attendre la détection de la plateforme
  if (!platform) return null;

  // Déjà installé — transition rapide
  if (installed) {
    return (
      <div style={styles.page}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: '#10b981', fontSize: 22, fontWeight: 800, margin: 0 }}>
            Installé avec succès !
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>
            Lancement en plein écran...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: 420, width: '100%', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📱</div>
          <h1 style={{
            fontSize: 24, fontWeight: 900, margin: '0 0 8px', color: '#e2e8f0',
          }}>
            Meilleure expérience
          </h1>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
            Installez Crazy Chrono pour jouer en <strong style={{ color: CC.gold }}>plein écran</strong> sans barres de navigation
          </p>
        </div>

        {/* Comparaison visuelle */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24,
        }}>
          {/* Sans installation */}
          <div style={{
            ...styles.card,
            border: '2px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            textAlign: 'center', padding: '16px 12px',
          }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>😕</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>
              Sans installer
            </div>
            <div style={{
              background: '#1e293b', borderRadius: 8, padding: 6, position: 'relative',
              border: '1px solid #334155',
            }}>
              <div style={{
                background: '#334155', borderRadius: 4, padding: '4px 8px', marginBottom: 4,
                fontSize: 9, color: '#94a3b8', textAlign: 'left',
              }}>
                ▢ ◁ 🔒 app.crazy-chrono.com ↻
              </div>
              <div style={{
                background: CC.tealDeep, borderRadius: 4, height: 50,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>
                🎯
              </div>
              <div style={{
                background: '#334155', borderRadius: 4, padding: '3px 8px', marginTop: 4,
                fontSize: 8, color: '#94a3b8', textAlign: 'center',
              }}>
                ◁ □ ☰
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
              Barres visibles
            </div>
          </div>

          {/* Avec installation */}
          <div style={{
            ...styles.card,
            border: '2px solid rgba(16,185,129,0.4)',
            background: 'rgba(16,185,129,0.08)',
            textAlign: 'center', padding: '16px 12px',
          }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🤩</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>
              Après installation
            </div>
            <div style={{
              background: CC.tealDeep, borderRadius: 8, padding: 6, position: 'relative',
              border: '1px solid rgba(16,185,129,0.3)',
              height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 32 }}>🎯</div>
              <div style={{
                position: 'absolute', top: 4, right: 4, fontSize: 7,
                background: 'rgba(16,185,129,0.3)', color: '#10b981',
                padding: '2px 6px', borderRadius: 8, fontWeight: 700,
              }}>
                PLEIN ÉCRAN
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#10b981', marginTop: 6, fontWeight: 700 }}>
              100% immersif !
            </div>
          </div>
        </div>

        {/* Instructions spécifiques à la plateforme */}
        <div style={{ ...styles.card, padding: '20px 16px', marginBottom: 16 }}>

          {/* iOS Safari */}
          {platform.isIOS && (
            <>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#e2e8f0', textAlign: 'center' }}>
                Installation en 10 secondes
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <StepItem
                  number="1"
                  icon="↑"
                  text={<>Appuyez sur le bouton <strong>Partager</strong> <span style={{ fontSize: 18 }}>⬆️</span> en bas de Safari</>}
                />
                <StepItem
                  number="2"
                  icon="➕"
                  text={<>Faites défiler et appuyez sur <strong>"Sur l'écran d'accueil"</strong></>}
                />
                <StepItem
                  number="3"
                  icon="✅"
                  text={<>Appuyez <strong>"Ajouter"</strong> — c'est fait !</>}
                />
              </div>
              <div style={{
                marginTop: 14, padding: '10px 12px', borderRadius: 8,
                background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.2)',
                fontSize: 12, color: '#F5A623', textAlign: 'center',
              }}>
                💡 Ensuite, ouvrez Crazy Chrono depuis votre écran d'accueil
              </div>
            </>
          )}

          {/* Android avec prompt natif */}
          {platform.isAndroid && deferredPrompt && (
            <>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#e2e8f0', textAlign: 'center' }}>
                Un seul clic !
              </h3>
              <button
                onClick={handleAndroidInstall}
                disabled={installing}
                style={{
                  width: '100%', padding: '16px 24px', borderRadius: 12, border: 'none',
                  background: installing ? '#64748b' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff', fontWeight: 800, fontSize: 17, cursor: installing ? 'default' : 'pointer',
                  boxShadow: installing ? 'none' : '0 4px 20px rgba(16,185,129,0.4)',
                  transition: 'all 0.2s',
                }}
              >
                {installing ? '⏳ Installation...' : '📲 Installer Crazy Chrono'}
              </button>
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
                Aucun téléchargement — s'installe en 2 secondes
              </div>
            </>
          )}

          {/* Android sans prompt (déjà installé ou navigateur non compatible) */}
          {platform.isAndroid && !deferredPrompt && (
            <>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#e2e8f0', textAlign: 'center' }}>
                Installation rapide
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <StepItem
                  number="1"
                  icon="⋮"
                  text={<>Appuyez sur le menu <strong>⋮</strong> (3 points en haut à droite)</>}
                />
                <StepItem
                  number="2"
                  icon="📲"
                  text={<>Sélectionnez <strong>"Installer l'application"</strong> ou <strong>"Ajouter à l'écran d'accueil"</strong></>}
                />
                <StepItem
                  number="3"
                  icon="✅"
                  text={<>Confirmez — c'est fait !</>}
                />
              </div>
            </>
          )}

          {/* Desktop ou autre */}
          {!platform.isIOS && !platform.isAndroid && (
            <>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#e2e8f0', textAlign: 'center' }}>
                Jouer en plein écran
              </h3>
              <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
                Le jeu passera automatiquement en plein écran au lancement de la partie.
                Appuyez sur <strong>F11</strong> pour un plein écran immédiat.
              </p>
            </>
          )}
        </div>

        {/* Bouton continuer */}
        <button
          onClick={onContinue}
          style={{
            width: '100%', padding: '16px 24px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #F5A623, #ff6b35)',
            color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(245,166,35,0.4)',
            marginBottom: 12,
          }}
        >
          {platform.isIOS ? '👉 Continuer sans installer' : '🏟️ Continuer vers la salle'}
        </button>

        {platform.isIOS && (
          <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', lineHeight: 1.6 }}>
            Vous pourrez jouer normalement, mais l'écran sera un peu plus petit à cause des barres du navigateur.
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function StepItem({ number, icon, text }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      animation: `fadeInUp 0.4s ease-out ${number * 0.1}s both`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'linear-gradient(135deg, #0D6A7A, #1AACBE)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
      }}>
        {number}
      </div>
      <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.4 }}>
        {text}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    minHeight: '100dvh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    color: '#fff',
    padding: '24px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  card: {
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.1)',
  },
};
