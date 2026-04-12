import React, { useState, useEffect } from 'react';

/**
 * PWA Update Button
 * Affiche un badge quand une mise à jour est disponible et permet de forcer la mise à jour
 */
const PWAUpdateButton = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [version, setVersion] = useState(null);

  useEffect(() => {
    // Vérifier si on peut détecter les mises à jour
    if (!('serviceWorker' in navigator)) return;

    // Écouter les mises à jour du service worker
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] New service worker controlling page');
      window.location.reload();
    });

    // Vérifier immédiatement si une mise à jour est en attente
    checkForUpdate();
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

      // Vérifier la version du serveur vs cache
      const response = await fetch('/?check-sw-update=' + Date.now(), {
        cache: 'no-store'
      });
      const serverVersion = response.headers.get('x-vercel-deployment-url') || 
                           response.headers.get('x-deployment-id') || 
                           'unknown';
      
      // Stocker la version actuelle pour affichage
      setVersion(serverVersion.slice(0, 8));

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
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      // Si un worker attend, lui dire de prendre le contrôle immédiatement
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Sinon, désactiver le cache et recharger
      if (window.caches) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map(name => window.caches.delete(name)));
      }

      // Recharger la page
      window.location.reload();
    } catch (err) {
      console.error('[PWA] Force update failed:', err);
      // Fallback: rechargement simple
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
