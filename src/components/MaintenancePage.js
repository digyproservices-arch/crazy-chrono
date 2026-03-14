import React, { useState, useEffect } from 'react';

const BYPASS_KEY = 'cc_maintenance_bypass';
const SECRET_CODE = 'crazychrono2026';

/**
 * Vérifie si l'utilisateur a le droit de passer la page maintenance.
 * Bypass possible via:
 * 1. URL param ?access=crazychrono2026
 * 2. localStorage cc_maintenance_bypass = '1'
 * 3. Être connecté en tant qu'admin
 */
export function hasMaintenanceBypass() {
  // Localhost / dev: toujours autoriser (tests e2e locaux, développement)
  try {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return true;
  } catch {}
  // Check URL param
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('access') === SECRET_CODE) {
      localStorage.setItem(BYPASS_KEY, '1');
      return true;
    }
  } catch {}
  // Check localStorage bypass
  try {
    if (localStorage.getItem(BYPASS_KEY) === '1') return true;
  } catch {}
  // Check admin auth
  try {
    const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
    if (a && (a.role === 'admin' || a.isAdmin)) return true;
  } catch {}
  return false;
}

export default function MaintenancePage() {
  const [dots, setDots] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (code.trim().toLowerCase() === SECRET_CODE) {
      localStorage.setItem(BYPASS_KEY, '1');
      window.location.reload();
    } else {
      setError('Code incorrect');
      setTimeout(() => setError(''), 2000);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0D6A7A 0%, #0a4f5c 40%, #083d47 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      color: '#fff',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Cercles décoratifs animés */}
      <div style={{
        position: 'absolute', top: '-80px', right: '-80px',
        width: 300, height: 300, borderRadius: '50%',
        background: 'rgba(255,255,255,0.03)',
        animation: 'pulse 4s ease-in-out infinite'
      }} />
      <div style={{
        position: 'absolute', bottom: '-60px', left: '-60px',
        width: 200, height: 200, borderRadius: '50%',
        background: 'rgba(255,214,0,0.05)',
        animation: 'pulse 5s ease-in-out infinite reverse'
      }} />

      {/* Logo / Icône chrono */}
      <div style={{
        fontSize: 72, marginBottom: 10,
        animation: 'bounce 2s ease-in-out infinite'
      }}>
        ⏱️
      </div>

      {/* Titre */}
      <h1 style={{
        fontSize: 'clamp(28px, 6vw, 48px)',
        fontWeight: 800,
        margin: '0 0 8px',
        textAlign: 'center',
        textShadow: '0 2px 10px rgba(0,0,0,0.3)',
        letterSpacing: 1
      }}>
        CRAZY CHRONO
      </h1>

      <div style={{
        width: 60, height: 4, borderRadius: 2,
        background: 'linear-gradient(90deg, #FFD600, #FFA000)',
        margin: '8px 0 24px'
      }} />

      {/* Message principal */}
      <h2 style={{
        fontSize: 'clamp(18px, 4vw, 26px)',
        fontWeight: 400,
        margin: '0 0 12px',
        textAlign: 'center',
        opacity: 0.95
      }}>
        Le jeu arrive bientôt{dots}
      </h2>

      <p style={{
        fontSize: 'clamp(14px, 3vw, 17px)',
        maxWidth: 500,
        textAlign: 'center',
        lineHeight: 1.6,
        opacity: 0.75,
        margin: '0 0 32px'
      }}>
        Nous préparons une expérience de jeu éducatif unique pour vos élèves.
        <br />Restez connectés, le lancement approche !
      </p>

      {/* Badges fonctionnalités */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        gap: 12, marginBottom: 40, maxWidth: 500
      }}>
        {['Calcul mental', 'Images & Textes', 'Mode Solo', 'Tournois', 'Entraînement'].map(tag => (
          <span key={tag} style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 20, padding: '6px 16px',
            fontSize: 13, fontWeight: 500,
            backdropFilter: 'blur(4px)'
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Contact */}
      <p style={{
        fontSize: 13, opacity: 0.5, textAlign: 'center', margin: '0 0 20px'
      }}>
        Contact : <a href="mailto:crazy.chrono.contact@gmail.com" style={{ color: '#FFD600', textDecoration: 'none' }}>crazy.chrono.contact@gmail.com</a>
      </p>

      {/* Zone secrète - clic sur le copyright pour afficher le champ code */}
      <p
        style={{
          fontSize: 12, opacity: 0.3, cursor: 'default', userSelect: 'none',
          margin: 0
        }}
        onClick={() => setShowSecret(s => !s)}
      >
        © 2025 DIGIKAZ · Tous droits réservés
      </p>

      {/* Champ code secret (caché par défaut) */}
      {showSecret && (
        <form onSubmit={handleSubmit} style={{
          marginTop: 16, display: 'flex', gap: 8, alignItems: 'center'
        }}>
          <input
            type="password"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Code d'accès"
            autoFocus
            style={{
              padding: '8px 14px', borderRadius: 8,
              border: error ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 14, outline: 'none',
              width: 160
            }}
          />
          <button type="submit" style={{
            padding: '8px 16px', borderRadius: 8,
            background: '#FFD600', color: '#0D6A7A',
            border: 'none', fontWeight: 700, fontSize: 14,
            cursor: 'pointer'
          }}>
            OK
          </button>
        </form>
      )}
      {error && (
        <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{error}</p>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}
