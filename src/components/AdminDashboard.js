import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../utils/apiHelpers';
import supabase from '../utils/supabaseClient';

function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    sessionsToday: 0,
    totalSessions: 0,
    totalStudents: 0,
    licensedStudents: 0,
    usersWithLicense: 0,
    loading: true
  });
  const [recentUsers, setRecentUsers] = useState([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const backendUrl = getBackendUrl();
        const res = await fetch(`${backendUrl}/api/admin/dashboard-stats`);
        const data = await res.json();
        
        if (data.ok) {
          setStats({ ...data.stats, loading: false });
          setRecentUsers(data.users || []);
        } else {
          console.error('Dashboard stats error:', data.error);
          setStats(prev => ({ ...prev, loading: false }));
        }
      } catch (error) {
        console.error('Erreur stats:', error);
        setStats(prev => ({ ...prev, loading: false }));
      }
    }
    fetchStats();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0D6A7A 0%, #148A9C 100%)', color: '#e2e8f0', padding: '20px' }}>
      {/* Header */}
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff' }}>
            📊 Dashboard Admin
          </h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => navigate('/admin')}
              style={{ 
                padding: '10px 20px', 
                background: '#F5A623', 
                border: 'none', 
                borderRadius: '8px',
                color: '#4A3728',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              ⚙️ Admin Panel
            </button>
            <button
              onClick={() => navigate('/')}
              style={{ 
                padding: '10px 20px', 
                background: 'rgba(255,255,255,0.1)', 
                border: '1px solid rgba(255,255,255,0.2)', 
                borderRadius: '8px',
                color: '#e2e8f0',
                cursor: 'pointer'
              }}
            >
              ← Retour au jeu
            </button>
          </div>
        </div>

        {/* Grid de sections */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          
          {/* Section 1: Vue d'ensemble */}
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '2px solid #F5A623', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#0D6A7A' }}>
              👥 Vue d'ensemble
            </h2>
            {stats.loading ? (
              <div style={{ fontSize: '14px', color: '#64748b' }}>Chargement...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>Comptes inscrits</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#0D6A7A' }}>{stats.totalUsers}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>Avec licence active</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>{stats.usersWithLicense}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>Élèves enregistrés</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#0D6A7A' }}>{stats.totalStudents}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>Actifs aujourd'hui</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#F5A623' }}>{stats.activeToday}</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Utilisation du jeu */}
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '2px solid #F5A623', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#0D6A7A' }}>
              🎮 Utilisation du jeu
            </h2>
            {stats.loading ? (
              <div style={{ fontSize: '14px', color: '#64748b' }}>Chargement...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>Sessions aujourd'hui</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#F5A623' }}>{stats.sessionsToday}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>Total sessions</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#0D6A7A' }}>{stats.totalSessions}</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Monitoring */}
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '2px solid #F5A623', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#0D6A7A' }}>
              📊 Monitoring
            </h2>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '15px' }}>
              Dashboard visuel avec graphiques, timeline et détection d'erreurs en temps réel.
            </div>
            
            <button
              onClick={() => navigate('/admin/monitoring')}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: 'linear-gradient(135deg, #F5A623 0%, #d4900e 100%)',
                color: '#4A3728',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 700,
                transition: 'all 0.3s',
                marginBottom: '10px',
                boxShadow: '0 4px 12px rgba(245,166,35,0.3)',
              }}
            >
              📈 Ouvrir le Monitoring Dashboard
            </button>
            
            <button
              onClick={async () => {
                try {
                  const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
                  const token = auth.token;
                  if (!token) { alert('Connexion requise'); return; }
                  const backendUrl = getBackendUrl();
                  const response = await fetch(`${backendUrl}/api/admin/logs/latest`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (!response.ok) throw new Error(`Erreur ${response.status}`);
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `backend-logs-${new Date().toISOString().split('T')[0]}.log`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                } catch (err) {
                  alert(`Erreur téléchargement logs: ${err.message}`);
                }
              }}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: 'transparent',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              📥 Télécharger logs bruts
            </button>
          </div>

        </div>

        {/* Liste de TOUS les utilisateurs inscrits */}
        <div style={{ marginTop: '30px', background: '#fff', padding: '20px', borderRadius: '12px', border: '2px solid #F5A623', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#0D6A7A' }}>
            👤 Tous les utilisateurs inscrits ({recentUsers.length})
          </h2>
          {stats.loading ? (
            <div style={{ fontSize: '14px', color: '#64748b' }}>Chargement...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                    <th style={{ padding: '10px', textAlign: 'left', color: '#64748b' }}>Email</th>
                    <th style={{ padding: '10px', textAlign: 'left', color: '#64748b' }}>Rôle</th>
                    <th style={{ padding: '10px', textAlign: 'left', color: '#64748b' }}>Licence</th>
                    <th style={{ padding: '10px', textAlign: 'left', color: '#64748b' }}>Inscrit le</th>
                    <th style={{ padding: '10px', textAlign: 'left', color: '#64748b' }}>Dernière connexion</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map(user => {
                    const licenseColors = {
                      active: { bg: '#22c55e', label: '✓ Active' },
                      admin: { bg: '#e53e3e', label: '★ Admin' },
                      expired: { bg: '#f59e0b', label: '⚠ Expirée' },
                      free: { bg: '#94a3b8', label: 'Gratuit' },
                    };
                    const lic = licenseColors[user.licenseStatus] || licenseColors.free;
                    return (
                      <tr key={user.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '10px', color: '#334155' }}>{user.email}</td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ 
                            padding: '4px 8px', 
                            borderRadius: '4px', 
                            fontSize: '12px',
                            background: user.role === 'admin' ? '#e53e3e' : user.role === 'editor' ? '#1AACBE' : '#94a3b8',
                            color: '#fff'
                          }}>
                            {user.role || 'user'}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ 
                            padding: '4px 8px', 
                            borderRadius: '4px', 
                            fontSize: '12px',
                            background: lic.bg,
                            color: '#fff',
                            fontWeight: 600
                          }}>
                            {lic.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px', color: '#64748b' }}>
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR') : '—'}
                        </td>
                        <td style={{ padding: '10px', color: '#64748b' }}>
                          {user.lastSignIn ? new Date(user.lastSignIn).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Jamais'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
