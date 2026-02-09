// ==========================================
// COMPOSANT: DASHBOARD COMPÉTITION ARENA
// Vue bracket/organigramme 4 phases + classement général
// Phases: Crazy Winner Classe → École → Circonscription → Académique
// ==========================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

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
  'tie-waiting': { label: 'Égalité', color: '#7c3aed', bg: '#ede9fe', icon: '⚖️' }
};

export default function CompetitionBracket() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [overallRanking, setOverallRanking] = useState([]);
  const [stats, setStats] = useState(null);
  const [phases, setPhases] = useState([]);
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('phases'); // 'phases' | 'bracket' | 'ranking'
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [emailModal, setEmailModal] = useState(null); // { phaseId, phaseLevel }
  const [emailAddress, setEmailAddress] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { success, message }

  const sendResults = async () => {
    if (!emailAddress || !emailModal) return;
    setSending(true);
    setSendResult(null);
    try {
      const backendUrl = getBackendUrl();
      const resp = await fetch(`${backendUrl}/api/tournament/phases/${emailModal.phaseId}/send-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: emailAddress, recipientName: recipientName || undefined })
      });
      const data = await resp.json();
      if (data.success) {
        setSendResult({ success: true, message: data.message || 'Email envoyé avec succès !' });
      } else {
        setSendResult({ success: false, message: data.error || 'Erreur lors de l\'envoi' });
      }
    } catch (err) {
      setSendResult({ success: false, message: 'Erreur de connexion au serveur' });
    } finally {
      setSending(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const classId = localStorage.getItem('cc_class_id');
      if (!classId) {
        setError('Classe non trouvée. Veuillez vous reconnecter.');
        setLoading(false);
        return;
      }

      const backendUrl = getBackendUrl();

      // Charger résultats compétition
      const resComp = await fetch(`${backendUrl}/api/tournament/classes/${classId}/competition-results`);
      const dataComp = await resComp.json();

      if (dataComp.success) {
        setGroups(dataComp.groups || []);
        setOverallRanking(dataComp.overallRanking || []);
        setStats(dataComp.stats || null);
      }

      // Charger tournoi + phases
      try {
        const resTour = await fetch(`${backendUrl}/api/tournament/tournaments/tour_2025_gp`);
        const dataTour = await resTour.json();
        if (dataTour.tournament) {
          setTournament(dataTour.tournament);

          const resPhases = await fetch(`${backendUrl}/api/tournament/${dataTour.tournament.id}/phases`);
          const dataPhases = await resPhases.json();
          if (dataPhases.success) {
            setPhases(dataPhases.phases || []);
            if (!selectedPhase && dataPhases.phases?.length > 0) {
              const activePhase = dataPhases.phases.find(p => p.status === 'active');
              setSelectedPhase(activePhase?.level || dataPhases.phases[0]?.level || 1);
            }
          }
        }
      } catch (tourErr) {
        console.warn('[Competition] Phases non disponibles:', tourErr);
      }

      setError(null);
    } catch (err) {
      console.error('[Competition] Erreur:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }, [selectedPhase]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const formatTime = (ms) => {
    if (!ms) return '-';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  // Helper: render a group card (used in bracket tab)
  const renderGroupCard = (group) => {
    const statusCfg = STATUS_CONFIG[group.match?.status] || STATUS_CONFIG.pending;
    const isExpanded = expandedGroup === group.id;
    const isFinished = group.match?.status === 'finished';

    return (
      <div
        key={group.id}
        style={{
          background: '#fff',
          borderRadius: 12,
          border: isFinished ? '2px solid #148A9C' : '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}
      >
        <div
          onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            cursor: 'pointer',
            background: isFinished ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#fff',
            transition: 'background 0.2s'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ fontSize: 22 }}>{isFinished ? '🏆' : statusCfg.icon}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{group.name}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {group.students.length} joueurs
                {group.winnerName && <span style={{ color: '#059669', fontWeight: 600 }}> • {group.winnerName}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: statusCfg.bg, color: statusCfg.color }}>
              {statusCfg.icon} {statusCfg.label}
            </span>
            <span style={{ fontSize: 16, color: '#94a3b8', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
          </div>
        </div>

        {isExpanded && (
          <div style={{ padding: '0 18px 18px', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ marginTop: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Joueurs:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {group.students.map(s => (
                  <div key={s.id} style={{
                    padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                    background: s.id === group.winnerId ? '#dcfce7' : '#f1f5f9',
                    color: s.id === group.winnerId ? '#059669' : '#334155',
                    border: s.id === group.winnerId ? '1px solid #86efac' : '1px solid #e2e8f0'
                  }}>
                    {s.id === group.winnerId && '🏆 '}{s.name}
                  </div>
                ))}
              </div>
            </div>

            {group.match && (
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12, color: '#475569' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <span>Code: <strong style={{ fontFamily: 'monospace', color: '#1AACBE' }}>{group.match.roomCode}</strong></span>
                  {group.match.finishedAt && <span>Terminé: {new Date(group.match.finishedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
            )}

            {group.results.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>#</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Joueur</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Score</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Paires</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Erreurs</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Temps</th>
                  </tr>
                </thead>
                <tbody>
                  {group.results.map((r, idx) => (
                    <tr key={r.studentId} style={{ background: idx === 0 ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontSize: 16 }}>{MEDAL_EMOJIS[idx] || `${idx + 1}`}</td>
                      <td style={{ padding: '8px 10px', fontWeight: idx === 0 ? 700 : 500, color: idx === 0 ? '#059669' : '#1e293b' }}>{r.studentName}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1AACBE' }}>{r.score} pts</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.pairsValidated}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: r.errors > 0 ? '#dc2626' : '#059669' }}>{r.errors}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{formatTime(r.timeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>
                {group.match ? 'Match en cours — résultats bientôt' : 'Match non encore lancé'}
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
            const completedGroups = phase?.completedGroups || 0;
            const totalGroups = phase?.totalGroups || 0;
            const winnersCount = phase?.winnersCount || 0;

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
                          : isActive
                            ? `▶️ En cours — ${completedGroups}/${totalGroups} groupes terminés`
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
                {isActive && totalGroups > 0 && (
                  <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${totalGroups > 0 ? (completedGroups / totalGroups) * 100 : 0}%`, background: cfg.color, borderRadius: 4, transition: 'width 0.5s' }} />
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
                      marginTop: 8,
                      padding: '6px 14px',
                      background: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s'
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
        overflow: 'hidden'
      }}>
        <button onClick={() => setActiveTab('bracket')} style={tabStyle(activeTab === 'bracket')}>
          🏟️ Matchs {selectedPhase ? `(Phase ${selectedPhase})` : ''}
        </button>
        <button onClick={() => setActiveTab('ranking')} style={tabStyle(activeTab === 'ranking')}>
          📊 Classement Général
        </button>
      </div>

      {/* ===== BRACKET TAB ===== */}
      {activeTab === 'bracket' && (
        <div>
          {/* Phase selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
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

          {/* Filtered groups */}
          {(() => {
            const filteredGroups = selectedPhase
              ? groups.filter(g => g.phaseLevel === selectedPhase)
              : groups;
            return (
              <div style={{ display: 'grid', gap: 12 }}>
                {filteredGroups.length === 0 ? (
                  <div style={{ padding: 48, textAlign: 'center', background: '#fff', borderRadius: 12, border: '2px dashed #d1d5db' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
                    <h3 style={{ color: '#374151', marginBottom: 8 }}>
                      {selectedPhase ? `Aucun match pour la Phase ${selectedPhase}` : 'Aucun match pour le moment'}
                    </h3>
                    <p style={{ color: '#6b7280', fontSize: 14 }}>
                      {selectedPhase
                        ? `Les matchs de ${PHASE_CONFIG[selectedPhase]?.name || ''} apparaîtront ici.`
                        : 'Créez des groupes et lancez des matchs depuis la page de configuration.'}
                    </p>
                  </div>
                ) : (
                  filteredGroups.map(group => renderGroupCard(group))
                )}
              </div>
            );
          })()}
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
