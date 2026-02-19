import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../../utils/subscription';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedClass, setSelectedClass] = useState('all');
  const [showCodes, setShowCodes] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const backendUrl = getBackendUrl();
      const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      const token = auth.token;

      if (!token) {
        setError('Non connecté. Veuillez vous reconnecter.');
        return;
      }

      const res = await fetch(`${backendUrl}/api/auth/teacher-dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();

      if (!json.ok) {
        if (json.error === 'invalid_token') {
          setError('Session expirée. Veuillez vous reconnecter.');
        } else {
          setError(json.error || 'Erreur de chargement');
        }
        return;
      }

      setData(json);

      // Store class_id for training setup
      if (json.classes?.length > 0) {
        localStorage.setItem('cc_class_id', json.classes[0].id);
      }
    } catch (err) {
      console.error('[TeacherDashboard] Error:', err);
      setError('Impossible de charger les données. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];
    let list = data.students;
    if (selectedClass !== 'all') {
      list = list.filter(s => s.classId === selectedClass);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(s =>
        s.fullName?.toLowerCase().includes(q) ||
        s.firstName?.toLowerCase().includes(q) ||
        s.lastName?.toLowerCase().includes(q) ||
        s.accessCode?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, selectedClass, searchTerm]);

  const handleExportCodes = () => {
    if (!data?.students?.length) return;
    const students = selectedClass === 'all' ? data.students : data.students.filter(s => s.classId === selectedClass);
    const BOM = '\uFEFF';
    const sep = ';';
    const header = ['Prénom', 'Nom', 'Classe', 'Niveau', "Code d'accès"].join(sep);
    const rows = students.filter(s => s.accessCode).map(s =>
      [s.firstName, s.lastName, s.className, s.level, s.accessCode].join(sep)
    );
    const csv = BOM + header + '\n' + rows.join('\n') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const className = selectedClass === 'all' ? 'toutes_classes' : data.classes.find(c => c.id === selectedClass)?.name || 'classe';
    a.download = `codes_acces_${className.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintCodes = () => {
    const students = selectedClass === 'all' ? data.students : data.students.filter(s => s.classId === selectedClass);
    const codesWithCode = students.filter(s => s.accessCode);
    if (!codesWithCode.length) return;

    const schoolName = data.school?.name || '';
    const className = selectedClass === 'all' ? 'Toutes les classes' : data.classes.find(c => c.id === selectedClass)?.name || '';

    const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Codes d'accès - ${schoolName}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      h1 { font-size: 18px; color: #0D6A7A; margin-bottom: 4px; }
      h2 { font-size: 14px; color: #666; margin-top: 0; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
      .card { border: 2px solid #0D6A7A; border-radius: 8px; padding: 12px; text-align: center; page-break-inside: avoid; }
      .name { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 4px; }
      .class { font-size: 11px; color: #666; margin-bottom: 8px; }
      .code { font-size: 18px; font-weight: 900; color: #0D6A7A; letter-spacing: 2px; font-family: monospace; background: #f0f9ff; padding: 6px 10px; border-radius: 6px; }
      .url { font-size: 9px; color: #999; margin-top: 6px; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <h1>🔑 Codes d'accès élèves — ${schoolName}</h1>
    <h2>${className}</h2>
    <p style="font-size:12px;color:#666;">Chaque élève utilise son code pour se connecter sur <strong>app.crazy-chrono.com</strong> → "Je suis élève"</p>
    <div class="grid">
    ${codesWithCode.map(s => `<div class="card">
      <div class="name">${s.firstName} ${s.lastName}</div>
      <div class="class">${s.className} — ${s.level}</div>
      <div class="code">${s.accessCode}</div>
      <div class="url">app.crazy-chrono.com</div>
    </div>`).join('')}
    </div>
    <script>window.onload = () => window.print();</script>
    </body></html>`;

    const w = window.open('', '_blank');
    w.document.write(printHtml);
    w.document.close();
  };

  // Styles
  const card = { background: '#fff', borderRadius: 12, border: '2px solid #e2e8f0', padding: 20, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' };
  const statCard = { ...card, textAlign: 'center', padding: '16px 12px' };
  const btn = (bg, color) => ({ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: bg, color });

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12, animation: 'spin 1s linear infinite' }}>⏳</div>
          <p style={{ color: '#64748b', fontSize: 16 }}>Chargement de votre classe...</p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...card, maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
          <h2 style={{ color: '#b91c1c', marginBottom: 8 }}>Erreur</h2>
          <p style={{ color: '#64748b', marginBottom: 16 }}>{error}</p>
          <button onClick={() => navigate('/login')} style={btn('#0D6A7A', '#fff')}>Se reconnecter</button>
        </div>
      </div>
    );
  }

  if (!data || data.classes?.length === 0) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...card, maxWidth: 450, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          <h2 style={{ color: '#334155', marginBottom: 8 }}>Aucune classe trouvée</h2>
          <p style={{ color: '#64748b', marginBottom: 16 }}>
            Votre adresse e-mail n'est associée à aucune classe.
            Contactez l'administrateur de votre école pour qu'il importe votre classe via le CSV.
          </p>
          <button onClick={() => navigate('/modes')} style={btn('#0D6A7A', '#fff')}>Retour</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1f2937', margin: 0 }}>
            📚 Mon espace enseignant
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>
            {data.school?.name || ''} {data.school?.city ? `— ${data.school.city}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/training-arena/setup')} style={btn('linear-gradient(135deg, #1AACBE, #148A9C)', '#fff')}>
            🎮 Lancer un entraînement
          </button>
          <button onClick={() => navigate('/modes')} style={btn('#f1f5f9', '#334155')}>
            ← Retour
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={statCard}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0D6A7A' }}>{data.stats.totalStudents}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Élèves</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#22c55e' }}>{data.stats.licensedStudents}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Licences actives</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#F5A623' }}>{data.stats.studentsWithCode}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Codes d'accès</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#6366f1' }}>{data.stats.totalMatches}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Matchs joués</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0D6A7A' }}>{data.classes.length}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Classe(s)</div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20, padding: '12px 16px' }}>
        {data.classes.length > 1 && (
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600 }}
          >
            <option value="all">Toutes les classes ({data.stats.totalStudents})</option>
            {data.classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} — {c.level}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Rechercher un élève..."
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
        />
        <button
          onClick={() => setShowCodes(!showCodes)}
          style={{ ...btn(showCodes ? '#0D6A7A' : '#f0f9ff', showCodes ? '#fff' : '#0D6A7A'), border: '1px solid #0D6A7A', fontSize: 13 }}
        >
          {showCodes ? '🔒 Masquer codes' : '🔑 Afficher codes'}
        </button>
        <button onClick={handleExportCodes} style={{ ...btn('#fffbeb', '#92400e'), border: '1px solid #F5A623', fontSize: 13 }}>
          📥 Export CSV
        </button>
        <button onClick={handlePrintCodes} style={{ ...btn('#f0fdf4', '#166534'), border: '1px solid #22c55e', fontSize: 13 }}>
          🖨️ Imprimer
        </button>
      </div>

      {/* Students table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Élève</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Classe</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>Licence</th>
                {showCodes && <th style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>Code d'accès</th>}
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>Matchs</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={showCodes ? 6 : 5} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    {searchTerm ? 'Aucun élève ne correspond à la recherche' : 'Aucun élève dans cette classe'}
                  </td>
                </tr>
              ) : filteredStudents.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #F5A623, #FFD700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#4A3728', flexShrink: 0 }}>
                        {s.firstName?.charAt(0)}{s.lastName?.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1f2937' }}>{s.firstName} {s.lastName}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.level}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{s.className}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: s.licensed ? '#dcfce7' : '#fef2f2', color: s.licensed ? '#166534' : '#991b1b' }}>
                      {s.licensed ? '✅ Active' : '❌ Inactive'}
                    </span>
                  </td>
                  {showCodes && (
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {s.accessCode ? (
                        <code style={{ fontSize: 13, fontWeight: 700, color: '#0D6A7A', background: '#f0f9ff', padding: '3px 10px', borderRadius: 6, letterSpacing: 1.5, fontFamily: 'monospace', cursor: 'pointer' }}
                          onClick={() => { navigator.clipboard?.writeText(s.accessCode); }}
                          title="Cliquer pour copier"
                        >{s.accessCode}</code>
                      ) : (
                        <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                  )}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 600, color: s.matchCount > 0 ? '#6366f1' : '#cbd5e1' }}>
                      {s.matchCount || 0}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <button
                      onClick={() => window.open(`/student/${s.id}/performance`, '_blank')}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569' }}
                    >
                      📊 Voir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredStudents.length > 0 && (
          <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b' }}>
            {filteredStudents.length} élève(s) affiché(s)
            {selectedClass !== 'all' && ` sur ${data.stats.totalStudents} au total`}
          </div>
        )}
      </div>

      {/* Quick help */}
      <div style={{ marginTop: 20, padding: 16, background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
        <strong>💡 Comment ça marche ?</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Cliquez sur <strong>"🔑 Afficher codes"</strong> pour voir les codes d'accès de vos élèves</li>
          <li>Cliquez sur <strong>"🖨️ Imprimer"</strong> pour obtenir une fiche à découper et distribuer en classe</li>
          <li>Chaque élève entre son code sur <strong>app.crazy-chrono.com</strong> → bouton <strong>"Je suis élève"</strong></li>
          <li>Cliquez sur <strong>"🎮 Lancer un entraînement"</strong> pour créer une session de jeu pour votre classe</li>
        </ul>
      </div>
    </div>
  );
}
