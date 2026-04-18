// ==========================================
// COMPOSANT: DASHBOARD COMPÉTITION — VUE CADRES RECTORAT
// Vision world-class: hiérarchie complète, filtres, alertes, stats par entité
// Phases: Crazy Winner Classe → École → Circonscription → Académique
// ==========================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders, getBackendUrl } from '../../utils/apiHelpers';


const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'];

const PHASE_CONFIG = {
  1: { name: 'CRAZY WINNER CLASSE', icon: '🏫', color: '#1AACBE', bg: '#f0fafb' },
  2: { name: 'CRAZY WINNER ÉCOLE', icon: '🏛️', color: '#8b5cf6', bg: '#f5f3ff' },
  3: { name: 'CRAZY WINNER CIRCONSCRIPTION', icon: '🗺️', color: '#d97706', bg: '#fffbeb' },
  4: { name: 'CRAZY WINNER ACADÉMIQUE', icon: '🏆', color: '#dc2626', bg: '#fef2f2' }
};

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: '#6b7280', bg: '#f3f4f6', icon: '⏳' },
  playing: { label: 'En cours', color: '#d97706', bg: '#fef3c7', icon: '🎮' },
  finished: { label: 'Terminé', color: '#059669', bg: '#d1fae5', icon: '✅' },
  active: { label: 'Active', color: '#1AACBE', bg: '#d4f0f4', icon: '▶️' },
  no_match: { label: 'Non lancé', color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
  'tie-waiting': { label: 'Égalité', color: '#7c3aed', bg: '#ede9fe', icon: '⚖️' }
};

const CIRCO_LABELS = {
  'circ_abymes_1': 'Les Abymes 1', 'circ_abymes_2': 'Les Abymes 2',
  'circ_baie_mahault': 'Baie-Mahault', 'circ_basse_terre': 'Basse-Terre',
  'circ_bouillante': 'Bouillante', 'circ_capesterre': 'Capesterre',
  'circ_gosier': 'Le Gosier', 'circ_lamentin': 'Le Lamentin',
  'circ_moule': 'Le Moule', 'circ_pointe_a_pitre': 'Pointe-à-Pitre',
  'circ_sainte_anne': 'Sainte-Anne', 'circ_sainte_rose': 'Sainte-Rose',
  'circ_morne_a_eau': 'Morne-à-l\'Eau', 'circ_gp_1': 'CIRC GP 1',
};

export default function CompetitionBracket() {
  const navigate = useNavigate();
  const [data, setData] = useState(null); // overview data from API
  const [groups, setGroups] = useState([]);
  const [overallRanking, setOverallRanking] = useState([]);
  const [stats, setStats] = useState(null);
  const [phases, setPhases] = useState([]);
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('bracket'); // 'bracket' | 'schools' | 'alerts' | 'ranking'
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [filterSchool, setFilterSchool] = useState('');
  const [filterCirco, setFilterCirco] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState('groups'); // 'groups' | 'table'
  const [emailModal, setEmailModal] = useState(null);
  const [emailAddress, setEmailAddress] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const sendResults = async () => {
    if (!emailAddress || !emailModal) return;
    setSending(true);
    setSendResult(null);
    try {
      const backendUrl = getBackendUrl();
      const resp = await fetch(`${backendUrl}/api/tournament/phases/${emailModal.phaseId}/send-results`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ recipientEmail: emailAddress, recipientName: recipientName || undefined })
      });
      const d = await resp.json();
      setSendResult(d.success ? { success: true, message: d.message || 'Email envoyé !' } : { success: false, message: d.error || 'Erreur' });
    } catch (err) {
      setSendResult({ success: false, message: 'Erreur de connexion' });
    } finally {
      setSending(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const backendUrl = getBackendUrl();
      const classId = localStorage.getItem('cc_class_id');

      // Charger l'overview transversal (vue rectorat)
      const [resTour] = await Promise.all([
        fetch(`${backendUrl}/api/tournament/tournaments/tour_2025_gp`, { headers: getAuthHeaders() })
      ]);
      const dataTour = await resTour.json();
      if (!dataTour.tournament) { setError('Tournoi introuvable'); setLoading(false); return; }

      setTournament(dataTour.tournament);
      const tournamentId = dataTour.tournament.id;

      // Overview transversal (toutes écoles/classes)
      const overviewUrl = selectedPhase
        ? `${backendUrl}/api/tournament/${tournamentId}/competition-overview?phase_level=${selectedPhase}`
        : `${backendUrl}/api/tournament/${tournamentId}/competition-overview`;
      const resOverview = await fetch(overviewUrl, { headers: getAuthHeaders() });
      const overviewData = await resOverview.json();

      if (overviewData.success) {
        setData(overviewData);
        setGroups(overviewData.groups || []);
        setPhases(overviewData.phaseStats || []);
        if (!selectedPhase && overviewData.tournament?.currentPhase) {
          setSelectedPhase(overviewData.tournament.currentPhase);
        }
      }

      // Classement général (depuis l'ancien endpoint si classId disponible)
      if (classId) {
        try {
          const resComp = await fetch(`${backendUrl}/api/tournament/classes/${classId}/competition-results`, { headers: getAuthHeaders() });
          const dataComp = await resComp.json();
          if (dataComp.success) {
            setOverallRanking(dataComp.overallRanking || []);
            setStats(dataComp.stats || null);
          }
        } catch {}
      }

      setError(null);
    } catch (err) {
      console.error('[Competition] Erreur:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ===== Filtered groups =====
  const filteredGroups = useMemo(() => {
    let result = groups;
    if (selectedPhase) result = result.filter(g => g.phaseLevel === selectedPhase);
    if (filterSchool) result = result.filter(g => g.schoolName === filterSchool);
    if (filterCirco) result = result.filter(g => g.circonscriptionId === filterCirco);
    if (filterStatus) {
      if (filterStatus === 'no_match') result = result.filter(g => g.matchStatus === 'no_match' || g.matchStatus === 'pending');
      else result = result.filter(g => g.matchStatus === filterStatus);
    }
    return result;
  }, [groups, selectedPhase, filterSchool, filterCirco, filterStatus]);

  // ===== Unique schools & circos for filters (from ALL schools, not just groups) =====
  const schoolOptions = useMemo(() => {
    const fromApi = (data?.allSchoolsList || []).map(s => s.name);
    const fromGroups = groups.map(g => g.schoolName);
    return [...new Set([...fromApi, ...fromGroups])].filter(n => n && n !== '—').sort();
  }, [data, groups]);
  const circoOptions = useMemo(() => {
    const fromApi = data?.allCirconscriptions || [];
    const fromGroups = groups.map(g => g.circonscriptionId);
    return [...new Set([...fromApi, ...fromGroups])].filter(c => c && c !== '—').sort();
  }, [data, groups]);

  const formatTime = (ms) => {
    if (!ms) return '-';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  const circoLabel = (id) => {
    if (!id || id === '—') return '—';
    if (CIRCO_LABELS[id]) return CIRCO_LABELS[id];
    // Auto-format: circ_xxx_yyy → Xxx Yyy
    return id.replace(/^circ_/, '').replace(/_/g, ' ').replace(/(^|\s)\w/g, l => l.toUpperCase());
  };

  // ===== Groups organized by circo → school =====
  const groupedByCircoSchool = useMemo(() => {
    const map = {};
    filteredGroups.forEach(g => {
      const circo = g.circonscriptionId || '—';
      const school = g.schoolName || '—';
      if (!map[circo]) map[circo] = {};
      if (!map[circo][school]) map[circo][school] = [];
      map[circo][school].push(g);
    });
    // Sort circos, then schools within each circo
    const sorted = {};
    Object.keys(map).sort((a, b) => circoLabel(a).localeCompare(circoLabel(b))).forEach(circo => {
      sorted[circo] = {};
      Object.keys(map[circo]).sort().forEach(school => {
        sorted[circo][school] = map[circo][school];
      });
    });
    return sorted;
  }, [filteredGroups]);

  // ===== Stat badge helper =====
  const StatBadge = ({ icon, value, label, color }) => (
    <div style={{ textAlign: 'center', padding: '10px 16px', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', minWidth: 80 }}>
      <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || '#1e293b' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );

  // ===== Render group card =====
  const renderGroupCard = (group) => {
    const statusCfg = STATUS_CONFIG[group.matchStatus] || STATUS_CONFIG.pending;
    const isExpanded = expandedGroup === group.id;
    const isFinished = group.matchStatus === 'finished';

    return (
      <div key={group.id} style={{ background: '#fff', borderRadius: 12, border: isFinished ? '2px solid #148A9C' : '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 8 }}>
        <div onClick={() => setExpandedGroup(isExpanded ? null : group.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: isFinished ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#fff', transition: 'background 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20 }}>{isFinished ? '🏆' : statusCfg.icon}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{group.name}</span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{group.playerCount} joueurs</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span title="Classe">🏫 {group.className}</span>
                <span style={{ color: '#d1d5db' }}>|</span>
                <span title="Professeur">👨‍🏫 {group.teacherName}</span>
                <span style={{ color: '#d1d5db' }}>|</span>
                <span title="École">🏛️ {group.schoolName}</span>
                <span style={{ color: '#d1d5db' }}>|</span>
                <span title="Circonscription">📍 {circoLabel(group.circonscriptionId)}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {group.winnerName && <span style={{ fontSize: 12, color: '#059669', fontWeight: 700 }}>🏆 {group.winnerName}</span>}
            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: statusCfg.bg, color: statusCfg.color, whiteSpace: 'nowrap' }}>
              {statusCfg.icon} {statusCfg.label}
            </span>
            <span style={{ fontSize: 14, color: '#94a3b8', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
          </div>
        </div>

        {isExpanded && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid #e2e8f0' }}>
            {/* Hiérarchie détaillée */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 12, marginBottom: 12 }}>
              {[
                { label: 'Classe', value: group.className, icon: '🏫' },
                { label: 'Niveau', value: group.classLevel, icon: '📚' },
                { label: 'Professeur', value: group.teacherName, icon: '👨‍🏫' },
                { label: 'École', value: group.schoolName, icon: '🏛️' },
                { label: 'Circonscription', value: circoLabel(group.circonscriptionId), icon: '📍' },
                { label: 'Académie', value: group.academie || '—', icon: '🎓' },
              ].map(({ label, value, icon }) => (
                <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', fontSize: 11 }}>
                  <div style={{ color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{icon} {label}</div>
                  <div style={{ color: '#1e293b', fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Joueurs */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Joueurs:</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {group.students.map(s => (
                  <span key={s.id} style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: s.id === group.winnerId ? '#dcfce7' : '#f1f5f9', color: s.id === group.winnerId ? '#059669' : '#334155', border: s.id === group.winnerId ? '1px solid #86efac' : '1px solid #e2e8f0' }}>
                    {s.id === group.winnerId && '🏆 '}{s.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Match info */}
            {group.roomCode && (
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 11, color: '#475569' }}>
                <span>Code: <strong style={{ fontFamily: 'monospace', color: '#1AACBE' }}>{group.roomCode}</strong></span>
                {group.matchFinishedAt && <span style={{ marginLeft: 16 }}>Terminé: {new Date(group.matchFinishedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            )}

            {/* Résultats */}
            {group.results && group.results.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    {['#', 'Joueur', 'Score', 'Paires', 'Erreurs', 'Temps'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Joueur' ? 'left' : 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.results.map((r, idx) => (
                    <tr key={r.studentId} style={{ background: idx === 0 ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, fontSize: 14, textAlign: 'center' }}>{MEDAL_EMOJIS[idx] || `${idx + 1}`}</td>
                      <td style={{ padding: '6px 8px', fontWeight: idx === 0 ? 700 : 500, color: idx === 0 ? '#059669' : '#1e293b' }}>{r.studentName}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: '#1AACBE' }}>{r.score} pts</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.pairsValidated}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: r.errors > 0 ? '#dc2626' : '#059669' }}>{r.errors}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{formatTime(r.timeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: 16, color: '#94a3b8', fontSize: 12 }}>
                {group.matchStatus === 'playing' ? 'Match en cours — résultats bientôt' : 'Match non encore lancé'}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <h2>Chargement de la compétition...</h2>
      </div>
    );
  }

  const tabStyle = (active) => ({
    padding: '12px 20px',
    border: 'none',
    borderBottom: active ? '3px solid #1AACBE' : '3px solid transparent',
    background: 'none',
    color: active ? '#1AACBE' : '#6b7280',
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  });

  const currentPhase = tournament?.current_phase || 1;
  const totals = data?.totals || {};
  const alerts = data?.alerts || {};
  const aggregations = data?.aggregations || {};
  const alertCount = (alerts.schoolsNotStarted || []).length;

  return (
    <div style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: '24px 20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minHeight: '100vh',
      background: '#f8fafc'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1e293b', margin: '0 0 4px 0' }}>
            🏆 Suivi de la Compétition
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            {tournament?.name || 'Tournoi Crazy Chrono'} — Phase {currentPhase}/4: {PHASE_CONFIG[currentPhase]?.name || ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadData} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🔄 Actualiser
          </button>
          <button onClick={() => navigate('/tournament/arena-setup')} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ← Retour
          </button>
        </div>
      </div>

      {/* ===== STATS GLOBALES ===== */}
      {totals.totalGroups > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <StatBadge icon="🏫" value={totals.totalSchools || 0} label="Écoles" color="#1AACBE" />
          <StatBadge icon="📍" value={totals.totalCirconscriptions || 0} label="Circos" color="#8b5cf6" />
          <StatBadge icon="👥" value={totals.totalStudents || 0} label="Élèves" color="#1e293b" />
          <StatBadge icon="🎮" value={totals.totalGroups || 0} label="Groupes" color="#475569" />
          <StatBadge icon="✅" value={totals.totalFinished || 0} label="Terminés" color="#059669" />
          <StatBadge icon="▶️" value={totals.totalPlaying || 0} label="En cours" color="#d97706" />
          <StatBadge icon="🔴" value={totals.totalPending || 0} label="Non lancés" color="#ef4444" />
        </div>
      )}

      {/* ===== PYRAMIDE DES 4 PHASES ===== */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: 16,
        padding: '20px 16px',
        marginBottom: 24,
        color: '#fff'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
          Progression de la compétition
        </div>

        {/* Phase pyramid - 4 levels */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {[4, 3, 2, 1].map(level => {
            const cfg = PHASE_CONFIG[level];
            const phase = phases.find(p => p.level === level);
            const isActive = phase?.status === 'active';
            const isFinished = phase?.status === 'finished';
            const isCurrent = currentPhase === level;
            const isPending = !phase || phase.status === 'pending';
            const completedGroups = phase?.finished || 0;
            const totalGroups = phase?.totalGroups || 0;
            const winnersCount = phase?.winnersCount || 0;
            const schoolsCount = phase?.schoolsCount || 0;

            // Width shrinks as level increases (pyramid effect)
            const widthPct = level === 1 ? 100 : level === 2 ? 80 : level === 3 ? 60 : 45;

            return (
              <div
                key={level}
                onClick={() => { setSelectedPhase(level); setActiveTab('bracket'); }}
                style={{
                  width: `${widthPct}%`,
                  minWidth: 280,
                  padding: '12px 16px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  border: isCurrent ? `2px solid ${cfg.color}` : '1px solid rgba(255,255,255,0.1)',
                  background: isFinished
                    ? 'rgba(16,185,129,0.15)'
                    : isActive
                      ? `rgba(59,130,246,0.15)`
                      : 'rgba(255,255,255,0.05)',
                  transition: 'all 0.2s',
                  opacity: isPending && !isCurrent ? 0.5 : 1
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{cfg.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                        Phase {level}: {cfg.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {isFinished
                          ? `✅ Terminée — ${winnersCount} qualifié(s)`
                          : isActive || totalGroups > 0
                            ? `${totalGroups > 0 ? `${completedGroups}/${totalGroups} groupes` : '0 groupe'} | ${schoolsCount} école(s)`
                            : '⏳ En attente'}
                      </div>
                    </div>
                  </div>
                  {totalGroups > 0 && (
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: isFinished ? '#059669' : isActive ? cfg.color : '#475569',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: '#fff'
                    }}>
                      {totalGroups > 0 ? `${Math.round((completedGroups / totalGroups) * 100)}%` : '—'}
                    </div>
                  )}
                </div>
                {(isActive || totalGroups > 0) && totalGroups > 0 && (
                  <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(completedGroups / totalGroups) * 100}%`, background: cfg.color, borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                )}
                {isFinished && phase && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmailModal({ phaseId: phase.id, phaseLevel: level });
                      setSendResult(null);
                      setEmailAddress('');
                      setRecipientName('');
                    }}
                    style={{
                      marginTop: 8, padding: '6px 14px',
                      background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                  >
                    📧 Envoyer résultats par email
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Connection arrows */}
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#64748b' }}>
          🏫 Classe → 🏛️ École → 🗺️ Circonscription → 🏆 Académique
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', marginBottom: 20, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: 20,
        background: '#fff',
        borderRadius: '12px 12px 0 0',
        overflow: 'hidden',
        flexWrap: 'wrap'
      }}>
        <button onClick={() => setActiveTab('bracket')} style={tabStyle(activeTab === 'bracket')}>
          🏟️ Matchs {selectedPhase ? `(Phase ${selectedPhase})` : ''}
        </button>
        <button onClick={() => setActiveTab('schools')} style={tabStyle(activeTab === 'schools')}>
          🏛️ Vue par école
        </button>
        <button onClick={() => setActiveTab('alerts')} style={tabStyle(activeTab === 'alerts')}>
          🚨 Alertes {alertCount > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 800, marginLeft: 6 }}>{alertCount}</span>}
        </button>
        <button onClick={() => setActiveTab('ranking')} style={tabStyle(activeTab === 'ranking')}>
          📊 Classement Général
        </button>
      </div>

      {/* ===== BRACKET TAB ===== */}
      {activeTab === 'bracket' && (
        <div>
          {/* Phase selector + Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setSelectedPhase(null)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: !selectedPhase ? '#1e293b' : '#fff',
                color: !selectedPhase ? '#fff' : '#475569',
                border: !selectedPhase ? 'none' : '1px solid #d1d5db'
              }}
            >
              Tous
            </button>
            {[1, 2, 3, 4].map(level => {
              const cfg = PHASE_CONFIG[level];
              const isSelected = selectedPhase === level;
              return (
                <button
                  key={level}
                  onClick={() => setSelectedPhase(level)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: isSelected ? cfg.color : '#fff',
                    color: isSelected ? '#fff' : cfg.color,
                    border: isSelected ? 'none' : `1px solid ${cfg.color}40`
                  }}
                >
                  {cfg.icon} Phase {level}
                </button>
              );
            })}
          </div>

          {/* Filters row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12, color: '#475569', background: '#fff', cursor: 'pointer' }}>
              <option value="">🏛️ Toutes les écoles</option>
              {schoolOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterCirco} onChange={e => setFilterCirco(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12, color: '#475569', background: '#fff', cursor: 'pointer' }}>
              <option value="">📍 Toutes les circos</option>
              {circoOptions.map(c => <option key={c} value={c}>{circoLabel(c)}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12, color: '#475569', background: '#fff', cursor: 'pointer' }}>
              <option value="">📋 Tous les statuts</option>
              <option value="finished">✅ Terminés</option>
              <option value="playing">🎮 En cours</option>
              <option value="no_match">🔴 Non lancés</option>
            </select>
            {(filterSchool || filterCirco || filterStatus) && (
              <button onClick={() => { setFilterSchool(''); setFilterCirco(''); setFilterStatus(''); }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                ✕ Réinitialiser
              </button>
            )}
            <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center', marginLeft: 'auto' }}>
              {filteredGroups.length} groupe(s)
            </span>
          </div>

          {/* Group cards or table */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setViewMode('groups')} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: viewMode === 'groups' ? '#1e293b' : '#fff', color: viewMode === 'groups' ? '#fff' : '#475569', border: '1px solid #d1d5db' }}>
              🃏 Cartes
            </button>
            <button onClick={() => setViewMode('table')} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: viewMode === 'table' ? '#1e293b' : '#fff', color: viewMode === 'table' ? '#fff' : '#475569', border: '1px solid #d1d5db' }}>
              📊 Tableau
            </button>
          </div>

          {filteredGroups.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', background: '#fff', borderRadius: 12, border: '2px dashed #d1d5db' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
              <h3 style={{ color: '#374151', marginBottom: 8 }}>
                {selectedPhase ? `Aucun match pour la Phase ${selectedPhase}` : 'Aucun match pour le moment'}
              </h3>
              <p style={{ color: '#6b7280', fontSize: 14 }}>
                {(filterSchool || filterCirco || filterStatus) ? 'Essayez de modifier les filtres.' : 'Créez des groupes et lancez des matchs.'}
              </p>
            </div>
          ) : viewMode === 'groups' ? (
            <div style={{ display: 'grid', gap: 16 }}>
              {Object.entries(groupedByCircoSchool).map(([circoId, schools]) => (
                <div key={circoId}>
                  {/* Circo header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 14px', background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', borderRadius: 10, color: '#fff' }}>
                    <span style={{ fontSize: 18 }}>📍</span>
                    <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>{circoLabel(circoId)}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                      {Object.keys(schools).length} école(s) · {Object.values(schools).reduce((sum, arr) => sum + arr.length, 0)} groupe(s)
                    </span>
                  </div>
                  {Object.entries(schools).map(([schoolName, schoolGroups]) => (
                    <div key={schoolName} style={{ marginLeft: 12, marginBottom: 12 }}>
                      {/* School sub-header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 12px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
                        <span style={{ fontSize: 15 }}>🏛️</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>{schoolName}</span>
                        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                          ({schoolGroups.length} groupe{schoolGroups.length > 1 ? 's' : ''})
                        </span>
                        {(() => {
                          const done = schoolGroups.filter(g => g.matchStatus === 'finished').length;
                          const total = schoolGroups.length;
                          return done > 0 ? <span style={{ fontSize: 11, color: '#059669', fontWeight: 700, marginLeft: 'auto' }}>✅ {done}/{total}</span> : null;
                        })()}
                      </div>
                      <div style={{ display: 'grid', gap: 6, marginLeft: 8 }}>
                        {schoolGroups.map(group => renderGroupCard(group))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            /* TABLE VIEW */
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}>
                    {['Groupe', 'Classe', 'Professeur', 'École', 'Circonscription', 'Joueurs', 'Statut', 'Gagnant'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((g, idx) => {
                    const sc = STATUS_CONFIG[g.matchStatus] || STATUS_CONFIG.pending;
                    return (
                      <tr key={g.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{g.name}</td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>{g.className} ({g.classLevel})</td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>{g.teacherName}</td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>{g.schoolName}</td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>{circoLabel(g.circonscriptionId)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#475569' }}>{g.playerCount}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{sc.icon} {sc.label}</span>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: g.winnerName ? '#059669' : '#94a3b8' }}>{g.winnerName || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== SCHOOLS TAB ===== */}
      {activeTab === 'schools' && (
        <div>
          <div style={{ display: 'grid', gap: 12 }}>
            {/* Group schools by circo */}
            {(() => {
              const byCircoEntries = {};
              Object.entries(aggregations.bySchool || {}).forEach(([schoolName, info]) => {
                const circo = info.circo || '—';
                if (!byCircoEntries[circo]) byCircoEntries[circo] = [];
                byCircoEntries[circo].push([schoolName, info]);
              });
              return Object.entries(byCircoEntries).sort((a, b) => circoLabel(a[0]).localeCompare(circoLabel(b[0]))).map(([circoId, schoolList]) => (
                <div key={circoId} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 12px', background: '#f1f5f9', borderRadius: 8 }}>
                    <span style={{ fontSize: 15 }}>📍</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{circoLabel(circoId)}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>— {schoolList.length} école(s)</span>
                  </div>
                  {schoolList.sort((a, b) => a[0].localeCompare(b[0])).map(([schoolName, info]) => {
              const pct = info.totalGroups > 0 ? Math.round((info.finished / info.totalGroups) * 100) : 0;
              const allDone = info.finished === info.totalGroups && info.totalGroups > 0;
              const notStarted = info.totalGroups > 0 && info.finished === 0 && info.playing === 0;
              const noGroups = info.totalGroups === 0;
              return (
                <div key={schoolName} style={{ background: '#fff', borderRadius: 12, border: allDone ? '2px solid #059669' : notStarted ? '2px solid #ef4444' : noGroups ? '1px dashed #d1d5db' : '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 8, opacity: noGroups ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{allDone ? '✅' : notStarted ? '🔴' : noGroups ? '⚪' : '🏛️'}</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{schoolName}</span>
                        {noGroups && <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Aucun groupe</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>📍 {circoLabel(info.circo)}</span>
                        <span>🏙️ {info.city || '—'}</span>
                      </div>
                    </div>
                    {!noGroups && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: allDone ? '#059669' : '#1e293b' }}>{info.finished}/{info.totalGroups}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>TERMINÉS</div>
                      </div>
                      {info.playing > 0 && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>{info.playing}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>EN COURS</div>
                        </div>
                      )}
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: allDone ? '#059669' : notStarted ? '#ef4444' : '#1AACBE',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color: '#fff'
                      }}>
                        {pct}%
                      </div>
                    </div>
                    )}
                  </div>
                  {/* Progress bar */}
                  {!noGroups && (
                  <div style={{ height: 4, background: '#f1f5f9' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: allDone ? '#059669' : '#1AACBE', transition: 'width 0.5s' }} />
                  </div>
                  )}
                </div>
              );
            })}
                </div>
              ));
            })()}
            {Object.keys(aggregations.bySchool || {}).length === 0 && (
              <div style={{ padding: 48, textAlign: 'center', background: '#fff', borderRadius: 12 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏛️</div>
                <p style={{ color: '#6b7280' }}>Aucune école inscrite pour le moment.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ALERTS TAB ===== */}
      {activeTab === 'alerts' && (
        <div>
          {/* Schools not started */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
              🔴 Écoles n'ayant pas encore démarré ({(alerts.schoolsNotStarted || []).length})
            </h3>
            {(alerts.schoolsNotStarted || []).length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', background: '#f0fdf4', borderRadius: 12, border: '1px solid #86efac' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
                <p style={{ color: '#059669', fontWeight: 600, fontSize: 14 }}>Toutes les écoles ont démarré au moins un match !</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {(alerts.schoolsNotStarted || []).map(school => (
                  <div key={school.name} style={{ background: '#fff', borderRadius: 10, border: '1px solid #fca5a5', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>🔴 {school.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        📍 {circoLabel(school.circo)} | {school.pendingGroups} groupe(s) en attente
                      </div>
                    </div>
                    <span style={{ padding: '4px 12px', borderRadius: 999, background: '#fef2f2', color: '#ef4444', fontSize: 11, fontWeight: 700 }}>Non démarré</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Schools no groups */}
          {(alerts.schoolsNoGroups || []).length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
                ⚪ Écoles sans aucun groupe créé ({(alerts.schoolsNoGroups || []).length})
              </h3>
              <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {(alerts.schoolsNoGroups || []).map(school => (
                  <div key={school.name} style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', padding: '10px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>🏛️ {school.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>📍 {circoLabel(school.circo)} · {school.city || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Circo overview */}
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
            📍 Vue par circonscription ({Object.keys(aggregations.byCirconscription || {}).length})
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {Object.entries(aggregations.byCirconscription || {}).sort((a, b) => circoLabel(a[0]).localeCompare(circoLabel(b[0]))).map(([circoId, info]) => {
              const pct = info.totalGroups > 0 ? Math.round((info.finished / info.totalGroups) * 100) : 0;
              const noGroups = info.totalGroups === 0;
              return (
                <div key={circoId} style={{ background: '#fff', borderRadius: 10, border: noGroups ? '1px dashed #d1d5db' : '1px solid #e2e8f0', padding: '12px 16px', opacity: noGroups ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>📍 {circoLabel(circoId)}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{info.schools.length} école(s): {info.schools.join(', ')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#059669', fontWeight: 700 }}>✅ {info.finished}</span>
                      <span style={{ fontSize: 12, color: '#d97706', fontWeight: 700 }}>▶️ {info.playing}</span>
                      <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>🔴 {info.pending}</span>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: pct === 100 ? '#059669' : '#1AACBE',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: '#fff'
                      }}>{pct}%</div>
                    </div>
                  </div>
                  <div style={{ height: 3, background: '#f1f5f9', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#059669' : '#1AACBE', borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== RANKING TAB ===== */}
      {activeTab === 'ranking' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {overallRanking.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
              <h3 style={{ color: '#374151', marginBottom: 8 }}>Aucun résultat encore</h3>
              <p style={{ color: '#6b7280' }}>Les résultats apparaîtront après les premiers matchs terminés.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}>
                  <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff', width: 50 }}>Rang</th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#fff' }}>Joueur</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Victoires</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Matchs</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Score</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Paires</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {overallRanking.map((player, idx) => {
                  const isTop3 = idx < 3;
                  return (
                    <tr key={player.studentId} style={{
                      background: isTop3 ? (idx === 0 ? '#fffbeb' : idx === 1 ? '#f8fafc' : '#fdf4ff') : (idx % 2 === 0 ? '#fff' : '#f8fafc'),
                      borderBottom: '1px solid #e2e8f0'
                    }}>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: isTop3 ? 22 : 14, fontWeight: 700 }}>{MEDAL_EMOJIS[idx] || player.rank}</td>
                      <td style={{ padding: '10px 14px', fontWeight: isTop3 ? 700 : 500, color: '#1e293b', fontSize: isTop3 ? 15 : 13 }}>{player.name}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: player.matchesWon > 0 ? '#059669' : '#94a3b8', fontSize: 15 }}>{player.matchesWon}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#475569' }}>{player.matchesPlayed}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#1AACBE', fontSize: 15 }}>{player.totalScore}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#475569' }}>{player.totalPairs}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: player.totalErrors > 0 ? '#dc2626' : '#059669' }}>{player.totalErrors}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      {/* ===== EMAIL MODAL ===== */}
      {emailModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999
        }}
          onClick={() => { if (!sending) setEmailModal(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: '28px 32px', width: '100%', maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)', position: 'relative'
            }}
          >
            <button
              onClick={() => { if (!sending) setEmailModal(null); }}
              style={{
                position: 'absolute', top: 12, right: 16, background: 'none', border: 'none',
                fontSize: 20, cursor: 'pointer', color: '#94a3b8'
              }}
            >✕</button>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📧</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                Envoyer les résultats
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                Phase {emailModal.phaseLevel}: {PHASE_CONFIG[emailModal.phaseLevel]?.name || ''}
              </p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                Email du destinataire *
              </label>
              <input
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="rectorat@ac-guadeloupe.fr"
                style={{
                  width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8,
                  fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => { e.target.style.borderColor = '#1AACBE'; }}
                onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; }}
                disabled={sending}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                Nom du destinataire (optionnel)
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="M. le Recteur"
                style={{
                  width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8,
                  fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => { e.target.style.borderColor = '#1AACBE'; }}
                onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; }}
                disabled={sending}
              />
            </div>

            {sendResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600,
                background: sendResult.success ? '#f0fdf4' : '#fef2f2',
                color: sendResult.success ? '#059669' : '#dc2626',
                border: sendResult.success ? '1px solid #86efac' : '1px solid #fca5a5'
              }}>
                {sendResult.success ? '✅' : '❌'} {sendResult.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { if (!sending) setEmailModal(null); }}
                style={{
                  flex: 1, padding: '10px 16px', background: '#f1f5f9', border: '1px solid #d1d5db',
                  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#475569'
                }}
                disabled={sending}
              >
                Annuler
              </button>
              <button
                onClick={sendResults}
                disabled={sending || !emailAddress}
                style={{
                  flex: 2, padding: '10px 16px',
                  background: sending ? '#94a3b8' : !emailAddress ? '#cbd5e1' : 'linear-gradient(135deg, #1AACBE 0%, #148A9C 100%)',
                  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                  cursor: sending || !emailAddress ? 'not-allowed' : 'pointer',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                {sending ? (
                  <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Envoi en cours...</>
                ) : (
                  <>📧 Envoyer le PDF</>
                )}
              </button>
            </div>

            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
              Un PDF avec le classement complet sera envoyé en pièce jointe.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
