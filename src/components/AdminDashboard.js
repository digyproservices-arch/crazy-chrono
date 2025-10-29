import React from 'react';
import { useNavigate } from 'react-router-dom';

function AdminDashboard() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', padding: '20px' }}>
      {/* Header */}
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff' }}>
            📊 Dashboard Admin
          </h1>
          <button
            onClick={() => navigate('/')}
            style={{ 
              padding: '10px 20px', 
              background: '#1e293b', 
              border: '1px solid #334155', 
              borderRadius: '8px',
              color: '#e2e8f0',
              cursor: 'pointer'
            }}
          >
            ← Retour au jeu
          </button>
        </div>

        {/* Grid de sections */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          
          {/* Section 1: Vue d'ensemble */}
          <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#60a5fa' }}>
              👥 Vue d'ensemble
            </h2>
            <div style={{ fontSize: '14px', color: '#94a3b8' }}>
              Statistiques à venir...
            </div>
          </div>

          {/* Section 2: Utilisation du jeu */}
          <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#34d399' }}>
              🎮 Utilisation du jeu
            </h2>
            <div style={{ fontSize: '14px', color: '#94a3b8' }}>
              Statistiques à venir...
            </div>
          </div>

          {/* Section 3: Monitoring */}
          <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#f59e0b' }}>
              📊 Monitoring contenus
            </h2>
            <div style={{ fontSize: '14px', color: '#94a3b8' }}>
              Statistiques à venir...
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
