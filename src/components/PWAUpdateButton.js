import React, { useState, useEffect } from 'react';

/**
 * PWA Update Button
 * Affiche un badge quand une mise à jour est disponible et permet de forcer la mise à jour
 */
const PWAUpdateButton = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [version] = useState(
    process.env.REACT_APP_GIT_SHA || process.env.REACT_APP_BUILD_TIME || null
  );

  useEffect(() => {
    // Vérifier si on peut détecter les mises à jour
    if (!('serviceWorker' in navigator)) return;

    // Garde anti-boucle: ne pas re-vérifier juste après un forceUpdate
    const justUpdated = sessionStorage.getItem('pwa_just_updated');
    if (justUpdated) {
      const elapsed = Date.now() - parseInt(justUpdated, 10);
      if (elapsed < 30000) {
        console.log('[PWA] Skip update check — just updated', Math.round(elapsed / 1000), 's ago');
        sessionStorage.removeItem('pwa_just_updated');
        return;
      }
      sessionStorage.removeItem('pwa_just_updated');
    }

    // Vérifier après un délai (pas immédiatement au montage)
    const timer = setTimeout(() => checkForUpdate(), 3000);
    return () => clearTimeout(timer);
  }, []);

  const checkForUpdate = async () => {
    setChecking(true);
    try {
      if (!navigator.serviceWorker?.controller) {
        setChecking(false);
        return;
      }

      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setChecking(false);
        return;
      }

      // Forcer la vérification de mise à jour
      await reg.update();

      // Vérifier si un nouveau worker est en attente
      if (reg.waiting) {
        console.log('[PWA] Update found: waiting worker detected');
        setUpdateAvailable(true);
      }

      // Écouter les nouveaux workers en cours d'installation
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New version available');
              setUpdateAvailable(true);
            }
          });
        }
      });

    } catch (err) {
      console.warn('[PWA] Update check failed:', err);
    } finally {
      setChecking(false);
    }
  };

  const forceUpdate = async () => {
    try {
      // Marquer pour empêcher la boucle de re-check au prochain montage
      sessionStorage.setItem('pwa_just_updated', String(Date.now()));

      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.waiting) {
        // Dire au worker en attente de prendre le contrôle
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // Attendre un instant que le controllerchange se propage
        await new Promise(r => setTimeout(r, 300));
      }

      // Recharger la page une seule fois
      window.location.reload();
    } catch (err) {
      console.error('[PWA] Force update failed:', err);
      window.location.reload();
    }
  };

  // Ne rien afficher si pas de mise à jour détectée (sauf en dev)
  if (!updateAvailable && process.env.NODE_ENV === 'production') {
    return (
      <button 
        onClick={checkForUpdate}
        style={{
          position: 'fixed',
          bottom: 8,
          right: 8,
          padding: '4px 8px',
          fontSize: 10,
          opacity: 0.3,
          background: 'transparent',
          border: 'none',
          color: '#666',
          cursor: 'pointer',
          zIndex: 1000
        }}
        title="Vérifier les mises à jour"
      >
        {checking ? '⏳' : 'v' + (version || '?')}
      </button>
    );
  }

  return (
    <button
      onClick={forceUpdate}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        padding: '12px 16px',
        background: '#0D6A7A',
        color: 'white',
        border: 'none',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 'bold',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        animation: 'pulse 2s infinite'
      }}
    >
      <span>🔄</span>
      <span>Mettre à jour</span>
      {version && <span style={{ fontSize: 10, opacity: 0.8 }}>({version})</span>}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </button>
  );
};

export default PWAUpdateButton;
