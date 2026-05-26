// =============================================
// Overlay pause Arena — composant séparé (Phase 5)
// Affiché quand un joueur se déconnecte pendant un match
// =============================================
import React, { useState, useEffect } from 'react';

function ArenaPauseOverlay({ disconnectedPlayer, gracePeriodMs }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil((gracePeriodMs || 15000) / 1000));
  useEffect(() => {
    const iv = setInterval(() => {
      setSecondsLeft(s => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#fff', textAlign: 'center', pointerEvents: 'all'
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>&#9208;</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Match en pause</div>
      <div style={{ fontSize: 18, marginBottom: 20, opacity: 0.9 }}>
        <strong>{disconnectedPlayer || 'Un joueur'}</strong> s&#39;est d&#233;connect&#233;
      </div>
      <div style={{
        fontSize: 48, fontWeight: 900, color: secondsLeft <= 5 ? '#ef4444' : '#f59e0b',
        marginBottom: 12, transition: 'color 0.3s'
      }}>
        {secondsLeft}s
      </div>
      <div style={{ fontSize: 14, opacity: 0.7 }}>
        Reprise automatique &#224; la reconnexion ou forfait dans {secondsLeft}s
      </div>
    </div>
  );
}

export default ArenaPauseOverlay;
