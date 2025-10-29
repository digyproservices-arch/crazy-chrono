import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../utils/supabaseClient';

function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    sessionsToday: 0,
    totalSessions: 0,
    loading: true
  });
  const [recentUsers, setRecentUsers] = useState([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Total utilisateurs
        const { count: totalUsers } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true });

        // Utilisateurs actifs aujourd'hui (dernière connexion < 24h)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const { count: activeToday } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true })
          .gte('last_sign_in_at', yesterday.toISOString());

        // Sessions de jeu (depuis image_usage_logs)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: sessionsData } = await supabase
          .from('image_usage_logs')
          .select('session_id')
          .gte('timestamp', today.toISOString());
        
        const uniqueSessionsToday = new Set(sessionsData?.map(s => s.session_id) || []).size;
        
        const { data: allSessions } = await supabase
          .from('image_usage_logs')
          .select('session_id');
        
        const totalSessions = new Set(allSessions?.map(s => s.session_id) || []).size;

        // Derniers utilisateurs inscrits
        const { data: users } = await supabase
          .from('user_profiles')
          .select('id, email, role, created_at, last_sign_in_at')
          .order('created_at', { ascending: false })
          .limit(10);

        setStats({ 
          totalUsers: totalUsers || 0, 
          activeToday: activeToday || 0,
          sessionsToday: uniqueSessionsToday,
          totalSessions: totalSessions,
          loading: false 
        });
        setRecentUsers(users || []);
      } catch (error) {
        console.error('Erreur stats:', error);
        setStats({ totalUsers: 0, activeToday: 0, sessionsToday: 0, totalSessions: 0, loading: false });
      }
    }
    fetchStats();
  }, []);

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
            {stats.loading ? (
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>Chargement...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>Total utilisateurs</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>{stats.totalUsers}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>Actifs aujourd'hui</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{stats.activeToday}</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Utilisation du jeu */}
          <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#34d399' }}>
              🎮 Utilisation du jeu
            </h2>
            {stats.loading ? (
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>Chargement...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>Sessions aujourd'hui</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#34d399' }}>{stats.sessionsToday}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>Total sessions</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>{stats.totalSessions}</span>
                </div>
              </div>
            )}
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

        {/* Liste des utilisateurs récents */}
        <div style={{ marginTop: '30px', background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#60a5fa' }}>
            👤 Utilisateurs récents
          </h2>
          {stats.loading ? (
            <div style={{ fontSize: '14px', color: '#94a3b8' }}>Chargement...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '10px', textAlign: 'left', color: '#94a3b8' }}>Email</th>
                    <th style={{ padding: '10px', textAlign: 'left', color: '#94a3b8' }}>Rôle</th>
                    <th style={{ padding: '10px', textAlign: 'left', color: '#94a3b8' }}>Inscrit le</th>
                    <th style={{ padding: '10px', textAlign: 'left', color: '#94a3b8' }}>Dernière connexion</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map(user => (
                    <tr key={user.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '10px', color: '#e2e8f0' }}>{user.email}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ 
                          padding: '4px 8px', 
                          borderRadius: '4px', 
                          fontSize: '12px',
                          background: user.role === 'admin' ? '#7c3aed' : user.role === 'editor' ? '#0891b2' : '#334155',
                          color: '#fff'
                        }}>
                          {user.role || 'user'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', color: '#94a3b8' }}>
                        {new Date(user.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td style={{ padding: '10px', color: '#94a3b8' }}>
                        {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('fr-FR') : 'Jamais'}
                      </td>
                    </tr>
                  ))}
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
