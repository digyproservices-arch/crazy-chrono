import React, { useState, useEffect } from 'react';

// Bouton plein écran (API Fullscreen — iOS 16.4+, Android, desktop).
// Masqué automatiquement si non supporté ou si l'app tourne déjà en PWA standalone.
export default function FullscreenButton({ style = {} }) {
  const [isFs, setIsFs] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    setSupported(!!(el.requestFullscreen || el.webkitRequestFullscreen));
    const onChange = () => setIsFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const isStandalone = (() => {
    try {
      return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    } catch { return false; }
  })();

  if (!supported || isStandalone) return null;

  const toggle = () => {
    try {
      if (isFs) {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      } else {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
      }
    } catch (e) {
      console.warn('[Fullscreen] toggle failed:', e?.message);
    }
  };

  return (
    <button
      onClick={toggle}
      title={isFs ? 'Quitter le plein écran' : 'Plein écran'}
      style={{
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        color: '#e2e8f0',
        borderRadius: 8,
        padding: '8px 14px',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 700,
        ...style,
      }}
    >
      {isFs ? '✕ Quitter plein écran' : '⛶ Plein écran'}
    </button>
  );
}
