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
  const [licenseUI, setLicenseUI] = useState({ open: false, scope: 'all', schoolId: '', classId: '', count: 100, loading: false, result: null });
  const [filters, setFilters] = useState({ schools: [], classes: [], summary: null });
  // Onboarding école
  const [onboarding, setOnboarding] = useState({
    step: 0, // 0=fermé, 1=infos école, 2=upload CSV, 3=aperçu, 4=confirmation, 5=résultat
    schoolName: '', schoolCity: '', schoolType: 'primaire', circonscriptionId: '',
    bonCommande: '', bonCommandeValide: false,
    csvFile: null, csvPreview: null, csvError: null,
    activateLicenses: true, loading: false, result: null,
    existingSchoolId: null, // Set when adding students to existing school
  });
  const [schoolsList, setSchoolsList] = useState([]);

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
    // Load schools list on init
    async function fetchSchools() {
      try {
        const backendUrl = getBackendUrl();
        const res = await fetch(`${backendUrl}/api/admin/onboarding/schools`);
        const data = await res.json();
        if (data.ok) setSchoolsList(data.schools || []);
      } catch (e) { console.error('Erreur schools:', e); }
    }
    fetchSchools();
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
                  <span style={{ fontSize: '14px', color: '#64748b' }}>Élèves enregistrés</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#0D6A7A' }}>{stats.totalStudents}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>Élèves licenciés</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>{stats.licensedStudents}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>Abonnés Stripe</span>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#6366f1' }}>{stats.usersWithLicense}</span>
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

        {/* ===== GESTION LICENCES EN MASSE ===== */}
        <div style={{ marginTop: '30px', background: '#fff', padding: '20px', borderRadius: '12px', border: '2px solid #F5A623', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0D6A7A', margin: 0 }}>
              🎫 Gestion des licences élèves
            </h2>
            {!licenseUI.open ? (
              <button
                onClick={async () => {
                  setLicenseUI(prev => ({ ...prev, open: true, result: null }));
                  try {
                    const backendUrl = getBackendUrl();
                    const res = await fetch(`${backendUrl}/api/admin/licenses/filters`);
                    const data = await res.json();
                    if (data.ok) setFilters({ schools: data.schools, classes: data.classes, summary: data.summary });
                  } catch (e) { console.error('Filters error:', e); }
                }}
                style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #F5A623 0%, #d4900e 100%)', color: '#4A3728', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
              >
                ⚡ Activer des licences
              </button>
            ) : (
              <button
                onClick={() => setLicenseUI(prev => ({ ...prev, open: false, result: null }))}
                style={{ padding: '6px 14px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
              >
                ✕ Fermer
              </button>
            )}
          </div>

          {/* Summary bar */}
          {filters.summary && (
            <div style={{ display: 'flex', gap: 20, marginBottom: licenseUI.open ? 16 : 0, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, color: '#64748b' }}>
                Total élèves : <strong style={{ color: '#0D6A7A' }}>{filters.summary.totalStudents}</strong>
              </div>
              <div style={{ fontSize: 14, color: '#64748b' }}>
                Licenciés : <strong style={{ color: '#22c55e' }}>{filters.summary.licensedTotal}</strong>
              </div>
              <div style={{ fontSize: 14, color: '#64748b' }}>
                Sans licence : <strong style={{ color: '#ef4444' }}>{filters.summary.unlicensedTotal}</strong>
              </div>
            </div>
          )}

          {licenseUI.open && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0' }}>
              {/* Scope selector */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Périmètre d'activation :</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { value: 'all', label: '🌍 Tous les élèves' },
                    { value: 'school', label: '🏫 Par école' },
                    { value: 'class', label: '📚 Par classe' },
                    { value: 'count', label: '🔢 Par nombre' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setLicenseUI(prev => ({ ...prev, scope: opt.value, result: null }))}
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        background: licenseUI.scope === opt.value ? '#0D6A7A' : '#fff',
                        color: licenseUI.scope === opt.value ? '#fff' : '#334155',
                        border: licenseUI.scope === opt.value ? '2px solid #0D6A7A' : '1px solid #e2e8f0',
                        transition: 'all 0.2s',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* School selector */}
              {licenseUI.scope === 'school' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>École :</label>
                  <select
                    value={licenseUI.schoolId}
                    onChange={e => setLicenseUI(prev => ({ ...prev, schoolId: e.target.value, result: null }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
                  >
                    <option value="">-- Sélectionner une école --</option>
                    {filters.schools.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.city ? `(${s.city})` : ''} — {s.total} élèves, {s.licensed} licenciés
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Class selector */}
              {licenseUI.scope === 'class' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Classe :</label>
                  <select
                    value={licenseUI.classId}
                    onChange={e => setLicenseUI(prev => ({ ...prev, classId: e.target.value, result: null }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
                  >
                    <option value="">-- Sélectionner une classe --</option>
                    {filters.classes.map(c => {
                      const school = filters.schools.find(s => s.id === c.school_id);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.level}) {school ? `— ${school.name}` : ''} — {c.total} élèves, {c.licensed} licenciés
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Count input */}
              {licenseUI.scope === 'count' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Nombre de licences à activer :
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={licenseUI.count}
                    onChange={e => setLicenseUI(prev => ({ ...prev, count: parseInt(e.target.value) || 0, result: null }))}
                    style={{ width: 200, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 16, fontWeight: 700 }}
                  />
                  <span style={{ marginLeft: 10, fontSize: 13, color: '#64748b' }}>
                    (les {licenseUI.count} premiers élèves sans licence)
                  </span>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  disabled={licenseUI.loading || (licenseUI.scope === 'school' && !licenseUI.schoolId) || (licenseUI.scope === 'class' && !licenseUI.classId)}
                  onClick={async () => {
                    const msg = licenseUI.scope === 'all' ? 'Activer les licences pour TOUS les élèves ?' :
                      licenseUI.scope === 'count' ? `Activer ${licenseUI.count} licences ?` : 'Activer les licences pour la sélection ?';
                    if (!window.confirm(msg)) return;
                    setLicenseUI(prev => ({ ...prev, loading: true, result: null }));
                    try {
                      const backendUrl = getBackendUrl();
                      const res = await fetch(`${backendUrl}/api/admin/licenses/bulk-activate`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scope: licenseUI.scope, schoolId: licenseUI.schoolId, classId: licenseUI.classId, count: licenseUI.count }),
                      });
                      const data = await res.json();
                      setLicenseUI(prev => ({ ...prev, loading: false, result: { type: 'success', message: `✅ ${data.activated} licence(s) activée(s) !` } }));
                      // Refresh filters
                      const fRes = await fetch(`${backendUrl}/api/admin/licenses/filters`);
                      const fData = await fRes.json();
                      if (fData.ok) setFilters({ schools: fData.schools, classes: fData.classes, summary: fData.summary });
                      // Refresh stats
                      const sRes = await fetch(`${backendUrl}/api/admin/dashboard-stats`);
                      const sData = await sRes.json();
                      if (sData.ok) { setStats({ ...sData.stats, loading: false }); setRecentUsers(sData.users || []); }
                    } catch (e) {
                      setLicenseUI(prev => ({ ...prev, loading: false, result: { type: 'error', message: `❌ Erreur: ${e.message}` } }));
                    }
                  }}
                  style={{
                    padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
                    opacity: licenseUI.loading ? 0.6 : 1,
                    boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                  }}
                >
                  {licenseUI.loading ? '⏳ Activation...' : '✅ Activer les licences'}
                </button>

                <button
                  disabled={licenseUI.loading || licenseUI.scope === 'count' || (licenseUI.scope === 'school' && !licenseUI.schoolId) || (licenseUI.scope === 'class' && !licenseUI.classId)}
                  onClick={async () => {
                    if (!window.confirm('⚠️ Désactiver les licences pour la sélection ?')) return;
                    setLicenseUI(prev => ({ ...prev, loading: true, result: null }));
                    try {
                      const backendUrl = getBackendUrl();
                      const res = await fetch(`${backendUrl}/api/admin/licenses/bulk-deactivate`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scope: licenseUI.scope, schoolId: licenseUI.schoolId, classId: licenseUI.classId }),
                      });
                      const data = await res.json();
                      setLicenseUI(prev => ({ ...prev, loading: false, result: { type: 'warning', message: `🔒 ${data.deactivated} licence(s) désactivée(s).` } }));
                      const fRes = await fetch(`${backendUrl}/api/admin/licenses/filters`);
                      const fData = await fRes.json();
                      if (fData.ok) setFilters({ schools: fData.schools, classes: fData.classes, summary: fData.summary });
                    } catch (e) {
                      setLicenseUI(prev => ({ ...prev, loading: false, result: { type: 'error', message: `❌ Erreur: ${e.message}` } }));
                    }
                  }}
                  style={{
                    padding: '10px 24px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    background: '#fff', color: '#ef4444',
                    opacity: licenseUI.loading || licenseUI.scope === 'count' ? 0.4 : 1,
                  }}
                >
                  🔒 Désactiver
                </button>
              </div>

              {/* Result message */}
              {licenseUI.result && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  background: licenseUI.result.type === 'success' ? '#f0fdf4' : licenseUI.result.type === 'warning' ? '#fffbeb' : '#fef2f2',
                  color: licenseUI.result.type === 'success' ? '#16a34a' : licenseUI.result.type === 'warning' ? '#d97706' : '#dc2626',
                  border: `1px solid ${licenseUI.result.type === 'success' ? '#bbf7d0' : licenseUI.result.type === 'warning' ? '#fde68a' : '#fecaca'}`,
                }}>
                  {licenseUI.result.message}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== ONBOARDING ÉCOLE — WORKFLOW CSV ===== */}
        <div style={{ marginTop: '30px', background: '#fff', padding: '20px', borderRadius: '12px', border: '2px solid #F5A623', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0D6A7A', margin: 0 }}>
              🏫 Inscription école
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={`${getBackendUrl()}/api/admin/onboarding/csv-template`}
                download
                style={{ padding: '8px 14px', background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
              >
                📥 Modèle CSV
              </a>
              {onboarding.step === 0 ? (
                <button
                  onClick={async () => {
                    setOnboarding(prev => ({ ...prev, step: 1, result: null, csvPreview: null, csvError: null }));
                    try {
                      const res = await fetch(`${getBackendUrl()}/api/admin/onboarding/schools`);
                      const data = await res.json();
                      if (data.ok) setSchoolsList(data.schools || []);
                    } catch (e) { console.error(e); }
                  }}
                  style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #0D6A7A, #148A9C)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                >
                  + Nouvelle école
                </button>
              ) : (
                <button
                  onClick={() => setOnboarding(prev => ({ ...prev, step: 0, csvPreview: null, csvError: null, result: null }))}
                  style={{ padding: '6px 14px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                >
                  ✕ Fermer
                </button>
              )}
            </div>
          </div>

          {/* Schools list (when closed) */}
          {onboarding.step === 0 && schoolsList.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                    <th style={{ padding: 8, textAlign: 'left', color: '#64748b' }}>École</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#64748b' }}>Ville</th>
                    <th style={{ padding: 8, textAlign: 'center', color: '#64748b' }}>Classes</th>
                    <th style={{ padding: 8, textAlign: 'center', color: '#64748b' }}>Élèves</th>
                    <th style={{ padding: 8, textAlign: 'center', color: '#64748b' }}>Licenciés</th>
                    <th style={{ padding: 8, textAlign: 'center', color: '#64748b' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schoolsList.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: 8, color: '#334155', fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: 8, color: '#64748b' }}>{s.city || '—'}</td>
                      <td style={{ padding: 8, textAlign: 'center', color: '#334155' }}>{s.classCount}</td>
                      <td style={{ padding: 8, textAlign: 'center', color: '#334155' }}>{s.studentCount}</td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700, background: s.licensedCount === s.studentCount && s.studentCount > 0 ? '#dcfce7' : '#fef3c7', color: s.licensedCount === s.studentCount && s.studentCount > 0 ? '#16a34a' : '#d97706' }}>
                          {s.licensedCount}/{s.studentCount}
                        </span>
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <button
                          onClick={() => setOnboarding(prev => ({
                            ...prev,
                            step: 2,
                            existingSchoolId: s.id,
                            schoolName: s.name,
                            schoolCity: s.city || '',
                            schoolType: s.type || 'primaire',
                            result: null, csvPreview: null, csvError: null,
                          }))}
                          style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#f0f9ff', color: '#0D6A7A', border: '1px solid #bae6fd', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          + Élèves
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {onboarding.step === 0 && schoolsList.length === 0 && (
            <div style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', padding: 20 }}>
              Aucune école enregistrée. Cliquez sur "+ Nouvelle école" ou téléchargez le modèle CSV.
            </div>
          )}

          {/* STEP 1: School info + Bon de commande */}
          {onboarding.step === 1 && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                {['1. École', '2. CSV', '3. Aperçu', '4. Import'].map((label, idx) => (
                  <div key={idx} style={{ flex: 1, padding: '6px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, borderRadius: 6, background: onboarding.step === idx + 1 ? '#0D6A7A' : '#e2e8f0', color: onboarding.step === idx + 1 ? '#fff' : '#94a3b8' }}>
                    {label}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Nom de l'école *</label>
                  <input value={onboarding.schoolName} onChange={e => setOnboarding(p => ({ ...p, schoolName: e.target.value }))} placeholder="École Primaire Lamentin" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Ville</label>
                  <input value={onboarding.schoolCity} onChange={e => setOnboarding(p => ({ ...p, schoolCity: e.target.value }))} placeholder="Lamentin" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Type</label>
                  <select value={onboarding.schoolType} onChange={e => setOnboarding(p => ({ ...p, schoolType: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}>
                    <option value="primaire">Primaire</option>
                    <option value="college">Collège</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Circonscription</label>
                  <input value={onboarding.circonscriptionId} onChange={e => setOnboarding(p => ({ ...p, circonscriptionId: e.target.value }))} placeholder="CIRC_GP_1" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom: 12, padding: 12, background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#92400e', display: 'block', marginBottom: 4 }}>📋 Bon de commande</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input value={onboarding.bonCommande} onChange={e => setOnboarding(p => ({ ...p, bonCommande: e.target.value }))} placeholder="N° bon de commande (optionnel)" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #fde68a', fontSize: 14 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                    <input type="checkbox" checked={onboarding.bonCommandeValide} onChange={e => setOnboarding(p => ({ ...p, bonCommandeValide: e.target.checked }))} />
                    Validé / Payé
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  disabled={!onboarding.schoolName.trim()}
                  onClick={() => setOnboarding(p => ({ ...p, step: 2 }))}
                  style={{ padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: onboarding.schoolName.trim() ? '#0D6A7A' : '#e2e8f0', color: onboarding.schoolName.trim() ? '#fff' : '#94a3b8' }}
                >
                  Suivant →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Upload CSV */}
          {onboarding.step === 2 && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                {['1. École', '2. CSV', '3. Aperçu', '4. Import'].map((label, idx) => (
                  <div key={idx} style={{ flex: 1, padding: '6px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, borderRadius: 6, background: onboarding.step === idx + 1 ? '#0D6A7A' : idx + 1 < onboarding.step ? '#22c55e' : '#e2e8f0', color: onboarding.step === idx + 1 || idx + 1 < onboarding.step ? '#fff' : '#94a3b8' }}>
                    {idx + 1 < onboarding.step ? '✓' : ''} {label}
                  </div>
                ))}
              </div>
              {onboarding.existingSchoolId && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', fontSize: 13, color: '#0D6A7A', fontWeight: 600 }}>
                  ➕ Ajout d'élèves à l'école existante : <strong>{onboarding.schoolName}</strong>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginTop: 4 }}>
                    Utilisez le même nom de classe dans le CSV pour ajouter les élèves à une classe existante, ou un nouveau nom pour créer une nouvelle classe.
                  </div>
                </div>
              )}
              <div style={{ textAlign: 'center', padding: '30px 20px', border: '2px dashed #cbd5e1', borderRadius: 12, background: '#fff', marginBottom: 12 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 12 }}>
                  Déposez ici le fichier CSV {onboarding.existingSchoolId ? 'avec les nouveaux élèves' : "rempli par l'école"}
                </div>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setOnboarding(p => ({ ...p, csvFile: file, loading: true, csvError: null, csvPreview: null }));
                    try {
                      // Read with encoding detection (Excel saves as Windows-1252, not UTF-8)
                      const buffer = await file.arrayBuffer();
                      const bytes = new Uint8Array(buffer);
                      let text;
                      // Check for UTF-8 BOM
                      if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
                        text = new TextDecoder('utf-8').decode(buffer);
                      } else {
                        // Try UTF-8; if it produces replacement chars, fall back to Windows-1252
                        const utf8Text = new TextDecoder('utf-8').decode(buffer);
                        text = utf8Text.includes('\uFFFD')
                          ? new TextDecoder('windows-1252').decode(buffer)
                          : utf8Text;
                      }
                      const backendUrl = getBackendUrl();
                      const res = await fetch(`${backendUrl}/api/admin/onboarding/preview-csv`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: text,
                      });
                      const data = await res.json();
                      if (data.ok) {
                        setOnboarding(p => ({ ...p, csvPreview: data.preview, loading: false, step: 3 }));
                      } else {
                        setOnboarding(p => ({ ...p, csvError: data.error, loading: false }));
                      }
                    } catch (err) {
                      setOnboarding(p => ({ ...p, csvError: err.message, loading: false }));
                    }
                  }}
                  style={{ display: 'block', margin: '0 auto' }}
                />
                {onboarding.loading && <div style={{ marginTop: 10, fontSize: 14, color: '#0D6A7A', fontWeight: 600 }}>⏳ Analyse du fichier...</div>}
                {onboarding.csvError && <div style={{ marginTop: 10, fontSize: 14, color: '#dc2626', fontWeight: 600 }}>❌ {onboarding.csvError}</div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => setOnboarding(p => ({ ...p, step: p.existingSchoolId ? 0 : 1, existingSchoolId: p.existingSchoolId ? null : p.existingSchoolId }))} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 600, background: '#fff', color: '#64748b' }}>
                  ← Retour
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Preview parsed data */}
          {onboarding.step === 3 && onboarding.csvPreview && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                {['1. École', '2. CSV', '3. Aperçu', '4. Import'].map((label, idx) => (
                  <div key={idx} style={{ flex: 1, padding: '6px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, borderRadius: 6, background: onboarding.step === idx + 1 ? '#0D6A7A' : idx + 1 < onboarding.step ? '#22c55e' : '#e2e8f0', color: onboarding.step === idx + 1 || idx + 1 < onboarding.step ? '#fff' : '#94a3b8' }}>
                    {idx + 1 < onboarding.step ? '✓' : ''} {label}
                  </div>
                ))}
              </div>

              {/* Summary cards */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#0D6A7A' }}>{onboarding.csvPreview.totalStudents}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Élèves</div>
                </div>
                <div style={{ flex: 1, minWidth: 120, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#0D6A7A' }}>{onboarding.csvPreview.totalClasses}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Classes</div>
                </div>
                <div style={{ flex: 1, minWidth: 120, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#0D6A7A' }}>{onboarding.schoolName}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>École</div>
                </div>
              </div>

              {/* Errors */}
              {onboarding.csvPreview.errors?.length > 0 && (
                <div style={{ marginBottom: 12, padding: 10, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', fontSize: 13, color: '#dc2626' }}>
                  <strong>⚠️ {onboarding.csvPreview.errors.length} avertissement(s) :</strong>
                  <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                    {onboarding.csvPreview.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                    {onboarding.csvPreview.errors.length > 5 && <li>...et {onboarding.csvPreview.errors.length - 5} autres</li>}
                  </ul>
                </div>
              )}

              {/* Classes detail */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Classes détectées :</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {onboarding.csvPreview.classes.map((c, i) => (
                    <div key={i} style={{ padding: '6px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                      <strong>{c.name}</strong> ({c.level}) — {c.studentCount} élèves
                      {c.teacherName && <span style={{ color: '#64748b' }}> — {c.teacherName}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Students preview */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Aperçu élèves (50 premiers) :</div>
                <div style={{ maxHeight: 200, overflowY: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#f8fafc' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b' }}>Prénom</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b' }}>Nom</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b' }}>Classe</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b' }}>Niveau</th>
                      </tr>
                    </thead>
                    <tbody>
                      {onboarding.csvPreview.students.map((s, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '4px 8px', color: '#334155' }}>{s.firstName}</td>
                          <td style={{ padding: '4px 8px', color: '#334155' }}>{s.lastName}</td>
                          <td style={{ padding: '4px 8px', color: '#64748b' }}>{s.className}</td>
                          <td style={{ padding: '4px 8px', color: '#64748b' }}>{s.level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Activate licenses checkbox */}
              <div style={{ marginBottom: 14, padding: 10, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
                  <input type="checkbox" checked={onboarding.activateLicenses} onChange={e => setOnboarding(p => ({ ...p, activateLicenses: e.target.checked }))} />
                  ✅ Activer les licences immédiatement pour tous les élèves
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => setOnboarding(p => ({ ...p, step: 2, csvPreview: null }))} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 600, background: '#fff', color: '#64748b' }}>
                  ← Retour
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Importer ${onboarding.csvPreview.totalStudents} élèves dans ${onboarding.csvPreview.totalClasses} classes pour "${onboarding.schoolName}" ?`)) return;
                    setOnboarding(p => ({ ...p, loading: true, step: 4 }));
                    try {
                      const backendUrl = getBackendUrl();
                      const res = await fetch(`${backendUrl}/api/admin/onboarding/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          schoolName: onboarding.schoolName,
                          schoolCity: onboarding.schoolCity,
                          schoolType: onboarding.schoolType,
                          circonscriptionId: onboarding.circonscriptionId,
                          classes: onboarding.csvPreview.classes,
                          students: onboarding.csvPreview.allStudents,
                          activateLicenses: onboarding.activateLicenses,
                          bonCommande: onboarding.bonCommande,
                          existingSchoolId: onboarding.existingSchoolId || undefined,
                        }),
                      });
                      const data = await res.json();
                      if (data.ok) {
                        setOnboarding(p => ({ ...p, loading: false, result: data.result, step: 5 }));
                        // Refresh dashboard
                        const sRes = await fetch(`${backendUrl}/api/admin/dashboard-stats`);
                        const sData = await sRes.json();
                        if (sData.ok) { setStats({ ...sData.stats, loading: false }); setRecentUsers(sData.users || []); }
                        const fRes = await fetch(`${backendUrl}/api/admin/licenses/filters`);
                        const fData = await fRes.json();
                        if (fData.ok) setFilters({ schools: fData.schools, classes: fData.classes, summary: fData.summary });
                        const scRes = await fetch(`${backendUrl}/api/admin/onboarding/schools`);
                        const scData = await scRes.json();
                        if (scData.ok) setSchoolsList(scData.schools || []);
                      } else {
                        setOnboarding(p => ({ ...p, loading: false, result: null, csvError: data.error, step: 3 }));
                      }
                    } catch (err) {
                      setOnboarding(p => ({ ...p, loading: false, csvError: err.message, step: 3 }));
                    }
                  }}
                  style={{ padding: '10px 28px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', boxShadow: '0 2px 8px rgba(34,197,94,0.3)' }}
                >
                  🚀 Importer {onboarding.csvPreview.totalStudents} élèves
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Loading */}
          {onboarding.step === 4 && onboarding.loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0D6A7A' }}>Import en cours...</div>
              <div style={{ fontSize: 14, color: '#64748b', marginTop: 6 }}>Création de l'école, des classes et des élèves dans la base de données</div>
            </div>
          )}

          {/* STEP 5: Result */}
          {onboarding.step === 5 && onboarding.result && (
            <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 20, border: '1px solid #bbf7d0', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', marginBottom: 16 }}>Import réussi !</div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ padding: '10px 20px', background: '#fff', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#0D6A7A' }}>{onboarding.result.classesCreated}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Classes créées</div>
                </div>
                <div style={{ padding: '10px 20px', background: '#fff', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#0D6A7A' }}>{onboarding.result.studentsImported}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Élèves importés</div>
                </div>
                <div style={{ padding: '10px 20px', background: '#fff', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: onboarding.result.licensesActivated > 0 ? '#22c55e' : '#d97706' }}>{onboarding.result.licensesActivated}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Licences activées</div>
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
                École <strong>{onboarding.result.schoolName}</strong> — ID : <code style={{ fontSize: 11, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>{onboarding.result.schoolId}</code>
                {onboarding.result.bonCommande && <> — BC : <strong>{onboarding.result.bonCommande}</strong></>}
              </div>

              {/* Access codes preview */}
              {onboarding.result.accessCodes?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>🔑 Codes d'accès générés :</div>
                  <div style={{ maxHeight: 180, overflowY: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#f8fafc' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b' }}>Élève</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b' }}>Classe</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b' }}>Code d'accès</th>
                        </tr>
                      </thead>
                      <tbody>
                        {onboarding.result.accessCodes.slice(0, 30).map((ac, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '4px 8px', color: '#334155' }}>{ac.name}</td>
                            <td style={{ padding: '4px 8px', color: '#64748b' }}>{ac.className}</td>
                            <td style={{ padding: '4px 8px' }}>
                              <code style={{ fontSize: 13, fontWeight: 700, color: '#0D6A7A', background: '#f0f9ff', padding: '2px 8px', borderRadius: 4, letterSpacing: 1 }}>{ac.code}</code>
                            </td>
                          </tr>
                        ))}
                        {onboarding.result.accessCodes.length > 30 && (
                          <tr><td colSpan={3} style={{ padding: 6, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>...et {onboarding.result.accessCodes.length - 30} autres (téléchargez le CSV)</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {onboarding.result.schoolId && (
                  <a
                    href={`${getBackendUrl()}/api/admin/onboarding/export-codes/${onboarding.result.schoolId}`}
                    download
                    style={{ padding: '10px 20px', borderRadius: 8, border: '2px solid #F5A623', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: '#fffbeb', color: '#92400e', textDecoration: 'none', display: 'inline-block' }}
                  >
                    📥 Télécharger les codes (CSV)
                  </a>
                )}
                <button
                  onClick={() => setOnboarding({ step: 0, schoolName: '', schoolCity: '', schoolType: 'primaire', circonscriptionId: '', bonCommande: '', bonCommandeValide: false, csvFile: null, csvPreview: null, csvError: null, activateLicenses: true, loading: false, result: null })}
                  style={{ padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: '#0D6A7A', color: '#fff' }}
                >
                  ✓ Terminé
                </button>
              </div>
            </div>
          )}
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
