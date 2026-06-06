import React from 'react';
import { getBackendUrl } from '../utils/subscription';

function _deviceId() {
  try {
    let id = localStorage.getItem('cc_device_id');
    if (!id) { id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem('cc_device_id', id); }
    return id;
  } catch { return 'unknown'; }
}
function _userId() {
  try { return JSON.parse(localStorage.getItem('cc_auth') || '{}').id || null; } catch { return null; }
}
function _token() {
  try { return JSON.parse(localStorage.getItem('cc_auth') || '{}').token || null; } catch { return null; }
}

/**
 * Error Boundary dédié aux composants de jeu (/carte, TrainingArenaGame).
 * En cas d'erreur React pendant le rendu :
 *  1. Nettoie les styles body bloquants (overflow:hidden, cc-game)
 *  2. Envoie immédiatement un événement error:react-boundary via sendBeacon
 *  3. Affiche un écran de récupération avec bouton "Retour à l'accueil"
 */
class GameErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message?.slice(0, 200) || 'Erreur inconnue' };
  }

  componentDidCatch(error, info) {
    // 1. Nettoyer les styles body laissés par le jeu
    try { document.body.classList.remove('cc-game'); } catch {}
    try { document.body.style.overflow = ''; } catch {}

    // 2. Envoyer telemetry via sendBeacon (résiste au crash de la page)
    try {
      const backendUrl = getBackendUrl();
      if (backendUrl && navigator.sendBeacon) {
        const token = _token();
        const payload = JSON.stringify({
          events: [{
            event: 'error:react-boundary',
            ts: new Date().toISOString(),
            deviceId: _deviceId(),
            userId: _userId(),
            url: window.location.pathname + window.location.search,
            errorMsg: error?.message?.slice(0, 300) || 'unknown',
            errorName: error?.name || 'Error',
            componentStack: info?.componentStack?.slice(0, 600) || '',
            platform: /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop',
            ua: navigator.userAgent?.slice(0, 120),
          }],
          deviceId: _deviceId(),
          userId: _userId(),
          ...(token ? { token } : {}),
        });
        navigator.sendBeacon(
          `${backendUrl}/api/monitoring/client-telemetry`,
          new Blob([payload], { type: 'application/json' })
        );
      }
    } catch {}

    console.error('[GameErrorBoundary] Erreur React capturée:', error?.message, info?.componentStack?.split('\n')[1]);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#0D6A7A', color: '#fff',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 32, textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Le jeu a rencontré une erreur</h2>
          <p style={{ opacity: 0.8, marginBottom: 28, maxWidth: 380, lineHeight: 1.5, fontSize: 15 }}>
            Une erreur inattendue a interrompu la partie.<br />
            Elle a été enregistrée automatiquement.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => { window.location.href = '/modes'; }}
              style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: '#F5A623', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}
            >
              Retour à l'accueil
            </button>
            <button
              onClick={() => { window.location.reload(); }}
              style={{ padding: '12px 28px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default GameErrorBoundary;
