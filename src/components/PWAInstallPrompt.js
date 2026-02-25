import React, { useState, useEffect } from 'react';

/**
 * PWA Install Prompt — affiche un bandeau discret invitant l'utilisateur
 * à installer Crazy Chrono comme application native.
 * 
 * Comportement :
 * - Android Chrome : intercepte l'event beforeinstallprompt et affiche le bouton "Installer"
 * - iOS Safari : détecte le navigateur et affiche les instructions "Ajouter à l'écran d'accueil"
 * - Déjà installé (standalone) : ne rien afficher
 * - Déjà fermé : ne rien afficher pendant 7 jours
 */
export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Ne rien afficher si déjà en mode standalone (PWA installée)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone === true) return;

    // Vérifier si l'utilisateur a déjà fermé le bandeau récemment
    try {
      const dismissedAt = localStorage.getItem('cc_pwa_dismissed');
      if (dismissedAt) {
        const diff = Date.now() - parseInt(dismissedAt, 10);
        if (diff < 7 * 24 * 60 * 60 * 1000) return; // 7 jours
      }
    } catch {}

    // Android Chrome : intercepter beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari : afficher les instructions manuelles
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(navigator.userAgent);
    // Aussi afficher pour les in-app browsers sur iOS (GSA, etc.)
    const isIOSInApp = isIOS && !isSafari;
    if (isIOS) {
      setShowIOSPrompt(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      console.log('[PWA] User accepted install');
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('cc_pwa_dismissed', String(Date.now())); } catch {}
  };

  // Rien à afficher
  if (dismissed) return null;
  if (!deferredPrompt && !showIOSPrompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      background: 'linear-gradient(135deg, #0D6A7A 0%, #148A9C 100%)',
      color: '#fff',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 14,
      borderTop: '1px solid rgba(255,255,255,0.2)',
      animation: 'slideUpPWA 0.4s ease-out',
    }}>
      <style>{`
        @keyframes slideUpPWA {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
          Installer Crazy Chrono
        </div>
        {deferredPrompt ? (
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Jouez en plein écran, sans barres de navigation
          </div>
        ) : showIOSPrompt ? (
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Appuyez sur <span style={{ fontWeight: 700 }}>Partager</span> (↑) puis <span style={{ fontWeight: 700 }}>"Sur l'écran d'accueil"</span> pour jouer en plein écran
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            style={{
              background: '#fff',
              color: '#0D6A7A',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Installer
          </button>
        )}
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            color: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
