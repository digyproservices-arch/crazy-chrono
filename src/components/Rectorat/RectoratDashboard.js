import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../../utils/subscription';
import { getAuthHeaders } from '../../utils/apiHelpers';
import './RectoratDashboard.css';

const CARD = { background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', marginBottom: 16 };

const RectoratDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [competitions, setCompetitions] = useState([]);
  const [filterOfficial, setFilterOfficial] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchCards, setMatchCards] = useState(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [schools, setSchools] = useState([]);
  const [circonscriptions, setCirconscriptions] = useState([]);
  const [selectedCirc, setSelectedCirc] = useState('');
  const [expandedSchool, setExpandedSchool] = useState(null);
  const [allClasses, setAllClasses] = useState([]);
  const [userRegion, setUserRegion] = useState('');

  useEffect(() => {
    try {
      const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      setUserRegion(auth.region || '');
    } catch {}
    loadStats();
    loadCompetitions();
  }, []);

  useEffect(() => {
    loadCompetitions();
  }, [filterOfficial]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getBackendUrl()}/api/rectorat/stats`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.ok) setStats(data.stats);
    } catch (err) {
      console.error('[Rectorat] stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCompetitions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filterOfficial) params.set('official', 'true');
      const res = await fetch(`${getBackendUrl()}/api/rectorat/competitions?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.ok) setCompetitions(data.competitions || []);
    } catch (err) {
      console.error('[Rectorat] competitions error:', err);
    }
  }, [filterOfficial]);

  const loadMatchCards = async (matchId) => {
    try {
      setLoadingCards(true);
      setSelectedMatch(matchId);
      const res = await fetch(`${getBackendUrl()}/api/rectorat/match/${matchId}/cards`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.ok) {
        setMatchCards(data);
      } else {
        setMatchCards({ error: data.error || 'Erreur' });
      }
    } catch (err) {
      console.error('[Rectorat] cards error:', err);
      setMatchCards({ error: err.message });
    } finally {
      setLoadingCards(false);
    }
  };

  const loadSchools = async (circ) => {
    try {
      const params = circ ? `?circonscription=${encodeURIComponent(circ)}` : '';
      const res = await fetch(`${getBackendUrl()}/api/rectorat/schools${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.ok) {
        setSchools(data.schools || []);
        if (data.circonscriptions) setCirconscriptions(data.circonscriptions);
      }
    } catch (err) {
      console.error('[Rectorat] schools error:', err);
    }
  };

  const loadClasses = async (circ) => {
    try {
      const params = circ ? `?circonscription=${encodeURIComponent(circ)}` : '';
      const res = await fetch(`${getBackendUrl()}/api/rectorat/classes${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.ok) setAllClasses(data.classes || []);
      // Charger les circonscriptions si pas encore fait
      if (circonscriptions.length === 0) loadSchools();
    } catch (err) {
      console.error('[Rectorat] classes error:', err);
    }
  };

  const exportClassCodes = (className, schoolName, students) => {
    if (!students || students.length === 0) return;
    const bom = '\uFEFF';
    const header = 'Classe;École;Prénom;Nom;Code d\'accès\n';
    const rows = students.map(st => `${className};${schoolName};${st.firstName};${st.lastName};${st.accessCode || 'N/A'}`).join('\n');
    const csv = bom + header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codes_${className.replace(/\s/g, '_')}_${schoolName.replace(/\s/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ========== RENDER ==========
  if (loading && !stats) {
    return (
      <div style={{ maxWidth: 1100, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, color: '#64748b' }}>Chargement du tableau de bord...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', margin: 0 }}>
            🏛️ Tableau de Bord Rectorat
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>
            Supervision académique {userRegion ? `— ${userRegion}` : ''}
          </p>
        </div>
        <button
          onClick={() => { loadStats(); loadCompetitions(); }}
          style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
        >
          🔄 Actualiser
        </button>
      </div>

      {/* TAB NAVIGATION */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
        {[
          { key: 'overview', label: '📊 Vue d\'ensemble' },
          { key: 'competitions', label: '⚔️ Compétitions' },
          { key: 'cards', label: '🃏 Cartes jouées' },
          { key: 'schools', label: '🏫 Écoles' },
          { key: 'classes', label: '📋 Classes' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'schools' && schools.length === 0) loadSchools(); if (tab.key === 'classes' && allClasses.length === 0) loadClasses(); }}
            style={{
              padding: '12px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', border: 'none',
              borderBottom: activeTab === tab.key ? '3px solid #1d4ed8' : '3px solid transparent',
              background: 'transparent', color: activeTab === tab.key ? '#1d4ed8' : '#64748b',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: VUE D'ENSEMBLE */}
      {activeTab === 'overview' && stats && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { icon: '🏫', value: stats.schools, label: 'Écoles', color: '#3b82f6' },
              { icon: '🎓', value: stats.licensedStudents, label: 'Élèves licenciés', color: '#10b981' },
              { icon: '⚔️', value: stats.totalMatches, label: 'Matchs total', color: '#f59e0b' },
              { icon: '🏛️', value: stats.officialMatches, label: 'Compétitions officielles', color: '#1d4ed8' },
              { icon: '✅', value: stats.finishedMatches, label: 'Matchs terminés', color: '#059669' },
            ].map((s, i) => (
              <div key={i} style={{ ...CARD, textAlign: 'center', borderTop: `4px solid ${s.color}` }}>
                <div style={{ fontSize: 28 }}>{s.icon}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: s.color, margin: '8px 0 4px' }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={CARD}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginTop: 0 }}>Dernières compétitions</h3>
            {competitions.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>Aucune compétition enregistrée</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {competitions.slice(0, 5).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>
                    <span style={{ fontSize: 20 }}>{c.type === 'arena' ? '🏆' : '📚'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatDate(c.createdAt)}</div>
                    </div>
                    {c.isOfficial && <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#1d4ed8', color: '#fff' }}>OFFICIEL</span>}
                    <span style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                      background: c.status === 'finished' ? '#059669' : c.status === 'playing' ? '#f59e0b' : '#94a3b8',
                      color: '#fff'
                    }}>
                      {c.status === 'finished' ? 'Terminé' : c.status === 'playing' ? 'En cours' : 'En attente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: COMPETITIONS */}
      {activeTab === 'competitions' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div
                onClick={() => setFilterOfficial(p => !p)}
                style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: filterOfficial ? '#1d4ed8' : '#cbd5e1', transition: 'background 0.2s', cursor: 'pointer' }}>
                <div style={{ position: 'absolute', top: 2, left: filterOfficial ? 22 : 2, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Officielles uniquement</span>
            </label>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{competitions.length} résultat(s)</span>
          </div>

          {competitions.length === 0 ? (
            <div style={{ ...CARD, textAlign: 'center', color: '#94a3b8', padding: 40 }}>
              Aucune compétition {filterOfficial ? 'officielle ' : ''}trouvée
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {competitions.map(c => (
                <div key={c.id} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                  onClick={() => { setActiveTab('cards'); loadMatchCards(c.id); }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.06)'}
                >
                  <span style={{ fontSize: 24 }}>{c.type === 'arena' ? '🏆' : '📚'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {formatDate(c.createdAt)}
                      {c.config?.rounds && ` — ${c.config.rounds} manches`}
                      {c.config?.duration && ` × ${c.config.duration}s`}
                    </div>
                  </div>
                  {c.isOfficial && <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#1d4ed8', color: '#fff' }}>OFFICIEL</span>}
                  {c.winner && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Gagnant</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>🏆 {c.winner.name || c.winner.studentId?.slice(0, 12)}</div>
                    </div>
                  )}
                  <span style={{
                    padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: c.status === 'finished' ? '#059669' : c.status === 'playing' ? '#f59e0b' : '#94a3b8', color: '#fff'
                  }}>
                    {c.status === 'finished' ? 'Terminé' : c.status === 'playing' ? 'En cours' : 'En attente'}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: 18 }}>→</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: CARTES JOUÉES */}
      {activeTab === 'cards' && (
        <div>
          {!selectedMatch && (
            <div style={{ ...CARD, textAlign: 'center', color: '#94a3b8', padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🃏</div>
              <p style={{ fontSize: 16, fontWeight: 600 }}>Sélectionnez une compétition dans l'onglet "Compétitions" pour voir les cartes jouées</p>
              <button onClick={() => setActiveTab('competitions')} style={{ marginTop: 12, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                ⚔️ Voir les compétitions
              </button>
            </div>
          )}

          {selectedMatch && loadingCards && (
            <div style={{ ...CARD, textAlign: 'center', padding: 40 }}>
              <p>Chargement des cartes...</p>
            </div>
          )}

          {selectedMatch && !loadingCards && matchCards && (
            <div>
              {matchCards.error ? (
                <div style={{ ...CARD, textAlign: 'center', color: '#ef4444', padding: 40 }}>
                  <p>Erreur: {matchCards.error}</p>
                </div>
              ) : (
                <>
                  <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 24 }}>{matchCards.type === 'arena' ? '🏆' : '📚'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>Match {selectedMatch.slice(-8)}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        Type: {matchCards.type === 'arena' ? 'Arena (Tournoi)' : 'Entraînement'}
                        {matchCards.config?.classes && ` — Niveaux: ${matchCards.config.classes.join(', ')}`}
                      </div>
                    </div>
                    <button onClick={() => { setSelectedMatch(null); setMatchCards(null); setActiveTab('competitions'); }}
                      style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                      ← Retour
                    </button>
                  </div>

                  {(!matchCards.rounds || matchCards.rounds.length === 0) ? (
                    <div style={{ ...CARD, textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
                      <p>Aucune carte archivée pour ce match</p>
                      <p style={{ fontSize: 12 }}>Les cartes sont archivées pour les matchs joués après l'activation de cette fonctionnalité.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {matchCards.rounds.map((round, ri) => (
                        <div key={ri} style={CARD}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <span style={{ padding: '4px 12px', borderRadius: 8, fontSize: 13, fontWeight: 800, background: '#1d4ed8', color: '#fff' }}>
                              Manche {round.roundIndex + 1}
                            </span>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(round.timestamp)}</span>
                            <span style={{ fontSize: 12, color: '#64748b' }}>{round.zones?.length || 0} zones</span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                            {(round.zones || []).map((zone, zi) => (
                              <div key={zi} style={{
                                padding: '10px 12px', borderRadius: 10,
                                border: zone.pairId ? '2px solid #10b981' : '2px solid #e2e8f0',
                                background: zone.isDistractor ? '#fef2f2' : zone.pairId ? '#f0fdf4' : '#f8fafc',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                    background: zone.type === 'image' ? '#dbeafe' : zone.type === 'texte' ? '#fef3c7' : zone.type === 'calcul' ? '#ede9fe' : '#e2e8f0',
                                    color: zone.type === 'image' ? '#1d4ed8' : zone.type === 'texte' ? '#b45309' : zone.type === 'calcul' ? '#7c3aed' : '#64748b',
                                  }}>
                                    {zone.type}
                                  </span>
                                  {zone.pairId && <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>paire: {zone.pairId}</span>}
                                  {zone.isDistractor && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>distracteur</span>}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', wordBreak: 'break-word' }}>
                                  {zone.type === 'image'
                                    ? (typeof zone.content === 'string' ? zone.content.split('/').pop() : 'image')
                                    : String(zone.content || '').substring(0, 60)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: ÉCOLES */}
      {activeTab === 'schools' && (
        <div>
          {/* Filtre par circonscription */}
          {circonscriptions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>📍 Circonscription :</span>
              <button
                onClick={() => { setSelectedCirc(''); loadSchools(''); }}
                style={{ padding: '6px 14px', borderRadius: 8, border: !selectedCirc ? '2px solid #1d4ed8' : '1px solid #e2e8f0', background: !selectedCirc ? '#eff6ff' : '#fff', color: !selectedCirc ? '#1d4ed8' : '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
              >Toutes ({circonscriptions.length})</button>
              {circonscriptions.map(c => {
                const label = c.replace('circ_', '').replace(/_/g, ' ').replace(/(^|\s)\w/g, l => l.toUpperCase());
                return (
                  <button key={c}
                    onClick={() => { setSelectedCirc(c); loadSchools(c); }}
                    style={{ padding: '6px 14px', borderRadius: 8, border: selectedCirc === c ? '2px solid #1d4ed8' : '1px solid #e2e8f0', background: selectedCirc === c ? '#eff6ff' : '#fff', color: selectedCirc === c ? '#1d4ed8' : '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                  >{label}</button>
                );
              })}
            </div>
          )}

          {schools.length === 0 ? (
            <div style={{ ...CARD, textAlign: 'center', color: '#94a3b8', padding: 40 }}>
              Aucune école enregistrée
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {schools.map(s => (
                <div key={s.id} style={{ ...CARD, padding: '16px 20px', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                  onClick={() => setExpandedSchool(expandedSchool === s.id ? null : s.id)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.06)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 24 }}>🏫</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{s.city} {s.postal_code}</div>
                    </div>
                    {s.circonscription_id && (
                      <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#b45309' }}>
                        {s.circonscription_id.replace('circ_', '').replace(/_/g, ' ')}
                      </span>
                    )}
                    <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8' }}>
                      {s.studentCount} élèves
                    </span>
                    <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#f0fdf4', color: '#059669' }}>
                      {s.classCount} classe(s)
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: 16, transform: expandedSchool === s.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
                  </div>
                  {/* Classes de l'école */}
                  {expandedSchool === s.id && s.classes && s.classes.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                        {s.classes.map(c => (
                          <div key={c.id} style={{ padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>📚 {c.name} — {c.level}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{c.teacherName || 'Pas de professeur'}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.studentCount || c.students?.length || 0} élèves</div>
                            {c.students && c.students.length > 0 && (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                  {c.students.map(st => (
                                    <span key={st.id} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }} title={st.accessCode ? `Code: ${st.accessCode}` : ''}>
                                      {st.fullName || `${st.firstName} ${st.lastName}`} {st.accessCode && <span style={{ color: '#6b7280', fontWeight: 400 }}>| {st.accessCode}</span>}
                                    </span>
                                  ))}
                                </div>
                                <button onClick={() => exportClassCodes(c.name, s.name, c.students)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>📥 Exporter codes CSV</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: CLASSES (pour lancer entraînements / tournois) */}
      {activeTab === 'classes' && (
        <div>
          {/* Filtre par circonscription */}
          {circonscriptions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>📍 Circonscription :</span>
              <button
                onClick={() => { setSelectedCirc(''); loadClasses(''); }}
                style={{ padding: '6px 14px', borderRadius: 8, border: !selectedCirc ? '2px solid #1d4ed8' : '1px solid #e2e8f0', background: !selectedCirc ? '#eff6ff' : '#fff', color: !selectedCirc ? '#1d4ed8' : '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
              >Toutes</button>
              {circonscriptions.map(c => {
                const label = c.replace('circ_', '').replace(/_/g, ' ').replace(/(^|\s)\w/g, l => l.toUpperCase());
                return (
                  <button key={c}
                    onClick={() => { setSelectedCirc(c); loadClasses(c); }}
                    style={{ padding: '6px 14px', borderRadius: 8, border: selectedCirc === c ? '2px solid #1d4ed8' : '1px solid #e2e8f0', background: selectedCirc === c ? '#eff6ff' : '#fff', color: selectedCirc === c ? '#1d4ed8' : '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                  >{label}</button>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
            {allClasses.length} classe(s) • Sélectionnez une classe pour lancer un entraînement ou un tournoi Arena
          </div>

          {allClasses.length === 0 ? (
            <div style={{ ...CARD, textAlign: 'center', color: '#94a3b8', padding: 40 }}>
              Aucune classe trouvée
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allClasses.map(c => (
                <div key={c.id} style={{ ...CARD, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 22 }}>📚</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{c.name} — {c.level}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        🏫 {c.schoolName} • {c.city}
                        {c.circonscription && <span style={{ marginLeft: 8, color: '#b45309' }}>📍 {c.circonscription.replace('circ_', '').replace(/_/g, ' ')}</span>}
                      </div>
                      {c.teacherName && <div style={{ fontSize: 11, color: '#94a3b8' }}>👩‍🏫 {c.teacherName}</div>}
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8' }}>
                      {c.students?.length || c.studentCount} élèves
                    </span>
                    <button
                      onClick={() => navigate(`/training-arena/setup?classId=${c.id}&className=${encodeURIComponent(c.name + ' - ' + c.schoolName)}`)}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                    >📚 Entraînement</button>
                    <button
                      onClick={() => navigate(`/teacher/tournament?classId=${c.id}&className=${encodeURIComponent(c.name + ' - ' + c.schoolName)}`)}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                    >🏆 Tournoi Arena</button>
                  </div>
                  {c.students && c.students.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {c.students.map(st => (
                          <span key={st.id} style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
                            🎓 {st.fullName || `${st.firstName} ${st.lastName}`} {st.accessCode && <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 10 }}>| {st.accessCode}</span>}
                          </span>
                        ))}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); exportClassCodes(c.name, c.schoolName, c.students); }} style={{ padding: '5px 14px', borderRadius: 8, border: '1px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>📥 Exporter les codes d'accès (CSV)</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RectoratDashboard;
