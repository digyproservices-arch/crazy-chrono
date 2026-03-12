// ==========================================
// MONITORING DASHBOARD - Dashboard visuel de monitoring
// Graphiques temporels, sélecteur date/heure, indicateurs d'erreurs
// ==========================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../utils/apiHelpers';
import { getRoundLogs, clearRoundLogs } from '../utils/roundLogger';
import { getAuthLogs, clearAuthLogs } from '../utils/authLogger';

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  info: '#1AACBE',
  warn: '#f59e0b',
  error: '#ef4444',
  success: '#148A9C',
  accent: '#8b5cf6',
};


function MonitoringDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeTab, setActiveTab] = useState('report'); // report | incidents | rounds | e2e
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('all');
  const [roundLogs, setRoundLogs] = useState([]);
  const [authLogs, setAuthLogs] = useState([]);
  const [e2eScreenshots, setE2eScreenshots] = useState([]);
  const [e2eLoading, setE2eLoading] = useState(false);
  const [e2eSelectedImg, setE2eSelectedImg] = useState(null);
  const [e2eResults, setE2eResults] = useState([]);
  const [e2eResultsLoading, setE2eResultsLoading] = useState(false);
  const [e2eError, setE2eError] = useState(null);
  const [e2eTriggerMsg, setE2eTriggerMsg] = useState(null);
  const [e2eGithubRuns, setE2eGithubRuns] = useState([]);
  const [e2eExpandedRun, setE2eExpandedRun] = useState(null);
  const [e2eSubTab, setE2eSubTab] = useState('results');
  const [e2eRunning, setE2eRunning] = useState(false);
  const [e2eRunStartTime, setE2eRunStartTime] = useState(null);
  const [e2eRunElapsed, setE2eRunElapsed] = useState(0);
  const E2E_ESTIMATED_DURATION = 1800; // 30 min estimé (setup GH + tests)

  const copyToClipboard = async (text, source) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        try { textarea.parentNode.removeChild(textarea); } catch {}
      }
      setCopyFeedback(source);
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch (err) {
      console.error('[Monitoring] Erreur copie:', err);
      alert('Erreur lors de la copie.');
    }
  };

  const fetchIncidents = useCallback(async () => {
    try {
      setIncidentsLoading(true);
      let backendIncidents = [];
      // 1) Tenter le backend
      try {
        const token = getAuthToken();
        const backendUrl = getBackendUrl();
        const sevParam = incidentSeverityFilter !== 'all' ? `&severity=${incidentSeverityFilter}` : '';
        const res = await fetch(`${backendUrl}/api/monitoring/incidents?limit=200${sevParam}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) backendIncidents = data.incidents || [];
        }
      } catch (err) {
        console.warn('[Monitoring] Backend incidents fetch failed:', err.message);
      }
      // 2) Toujours charger localStorage (incidents générés hors auth, mode solo/objectif)
      let localIncidents = [];
      try {
        localIncidents = JSON.parse(localStorage.getItem('cc_game_incidents') || '[]');
      } catch {}
      // 3) Fusionner et dédupliquer par id, trier par date décroissante
      const byId = new Map();
      for (const inc of [...backendIncidents, ...localIncidents]) {
        const key = inc.id || `${inc.type}_${inc.timestamp}`;
        if (!byId.has(key)) byId.set(key, inc);
      }
      const merged = [...byId.values()].sort((a, b) => {
        const ta = new Date(a.timestamp || 0).getTime();
        const tb = new Date(b.timestamp || 0).getTime();
        return tb - ta;
      }).slice(0, 200);
      setIncidents(merged);
    } finally {
      setIncidentsLoading(false);
    }
  }, [incidentSeverityFilter]);

  
  const fetchRoundLogs = useCallback(() => {
    try {
      const logs = getRoundLogs();
      // Sort newest first
      logs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      setRoundLogs(logs);
    } catch (e) {
      console.warn('[Monitoring] Error loading round logs:', e);
    }
  }, []);

const clearIncidents = async () => {
    try {
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      await fetch(`${backendUrl}/api/monitoring/incidents`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      try { localStorage.removeItem('cc_game_incidents'); } catch {}
      setIncidents([]);
    } catch (err) {
      console.error('[Monitoring] Error clearing incidents:', err);
    }
  };

  const formatIncidentsForCopy = (arr) => {
    if (!arr || !arr.length) return 'Aucun incident.';
    return arr.map((inc, i) => {
      const lines = [
        `--- Incident #${i + 1} ---`,
        `Type: ${inc.type || 'unknown'}`,
        `Sévérité: ${inc.severity || 'warning'}`,
        `Date: ${inc.timestamp ? new Date(inc.timestamp).toLocaleString('fr-FR') : 'N/A'}`,
      ];
      if (inc.details) {
        if (typeof inc.details === 'string') {
          lines.push(`Détails: ${inc.details}`);
        } else {
          lines.push(`Détails: ${JSON.stringify(inc.details, null, 2)}`);
        }
      }
      if (inc.deviceInfo) {
        lines.push(`Appareil: ${inc.deviceInfo.userAgent || 'N/A'}`);
        lines.push(`Écran: ${inc.deviceInfo.screenWidth || '?'}x${inc.deviceInfo.screenHeight || '?'}`);
      }
      if (inc.sessionInfo) {
        lines.push(`Session: ${JSON.stringify(inc.sessionInfo)}`);
      }
      return lines.join('\n');
    }).join('\n\n');
  };

  const getAuthToken = () => {
    // 1) Token frais depuis session Supabase (prioritaire)
    try {
      const sbKey = 'sb-' + (process.env.REACT_APP_SUPABASE_URL || '').replace(/https?:\/\//, '').split('.')[0] + '-auth-token';
      const raw = localStorage.getItem(sbKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.access_token) return parsed.access_token;
      }
    } catch {}
    // 2) Fallback: token stocké au login dans cc_auth
    try {
      const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      return auth.token;
    } catch { return null; }
  };

  const fetchAuthLogs = useCallback(() => {
    try { setAuthLogs(getAuthLogs()); } catch {}
  }, []);

  useEffect(() => {
    fetchIncidents(); fetchRoundLogs(); fetchAuthLogs();
    setLoading(false);
    setLastRefresh(new Date());
  }, [fetchIncidents, fetchRoundLogs, fetchAuthLogs]);

  useEffect(() => {
    if (activeTab === 'incidents' || activeTab === 'report') {
      fetchIncidents();
    }
  }, [activeTab, fetchIncidents]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchIncidents(); fetchRoundLogs(); fetchAuthLogs();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchIncidents, fetchRoundLogs, fetchAuthLogs, activeTab]);

  // Timer: mettre à jour le temps écoulé chaque seconde quand les tests tournent
  useEffect(() => {
    if (!e2eRunning || !e2eRunStartTime) return;
    const timer = setInterval(() => {
      setE2eRunElapsed(Math.floor((Date.now() - e2eRunStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [e2eRunning, e2eRunStartTime]);

  // Polling: vérifier la fin des tests toutes les 20s (résultats E2E + GitHub Actions)
  useEffect(() => {
    if (!e2eRunning || !e2eRunStartTime) return;
    const poll = setInterval(async () => {
      try {
        const backendUrl = getBackendUrl();
        const token = getAuthToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        // 1) Vérifier si de nouveaux résultats E2E sont apparus depuis le lancement
        try {
          const resR = await fetch(`${backendUrl}/api/monitoring/e2e-results`, { headers });
          if (resR.ok) {
            const dr = await resR.json();
            if (dr.ok && dr.results && dr.results.length > 0) {
              const latest = dr.results[0];
              const resultTime = new Date(latest.timestamp).getTime();
              // Si le résultat est postérieur au lancement → tests terminés
              if (resultTime > e2eRunStartTime - 60000) {
                setE2eResults(dr.results);
                setE2eRunning(false);
                const s = latest.summary || {};
                setE2eTriggerMsg({
                  type: (s.failed || 0) === 0 ? 'success' : 'error',
                  text: (s.failed || 0) === 0
                    ? `✅ Tests terminés — ${s.passed || 0} passés en ${((s.duration || 0) / 1000).toFixed(0)}s`
                    : `❌ Tests terminés — ${s.passed || 0} ✅ ${s.failed || 0} ❌ en ${((s.duration || 0) / 1000).toFixed(0)}s`,
                });
                return;
              }
            }
          }
        } catch {}

        // 2) Vérifier aussi le statut GitHub Actions
        try {
          const res = await fetch(`${backendUrl}/api/monitoring/e2e-status`, { headers });
          if (res.ok) {
            const d = await res.json();
            if (d.ok && d.runs && d.runs.length > 0) {
              setE2eGithubRuns(d.runs);
              const latest = d.runs[0];
              if (latest.conclusion) {
                setE2eRunning(false);
                setE2eTriggerMsg({
                  type: latest.conclusion === 'success' ? 'success' : 'error',
                  text: latest.conclusion === 'success'
                    ? '✅ Tests terminés avec succès !'
                    : `❌ Tests terminés — ${latest.conclusion}`,
                });
              }
            }
          }
        } catch {}
      } catch {}

      // 3) Failsafe: si > 2× la durée estimée, arrêter la barre (quelque chose a mal tourné)
      const elapsed = (Date.now() - e2eRunStartTime) / 1000;
      if (elapsed > E2E_ESTIMATED_DURATION * 2) {
        setE2eRunning(false);
        setE2eTriggerMsg({ type: 'error', text: '⚠️ Délai dépassé — les tests ont peut-être échoué silencieusement. Cliquez sur Rafraîchir.' });
      }
    }, 20000);
    return () => clearInterval(poll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e2eRunning, e2eRunStartTime]);

  const formatDateTime = (isoStr) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch { return ''; }
  };

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, padding: '20px' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', margin: 0 }}>
              📊 Monitoring Dashboard
            </h1>
            <p style={{ fontSize: 13, color: COLORS.textMuted, margin: '4px 0 0' }}>
              {lastRefresh ? `Dernière mise à jour: ${formatDateTime(lastRefresh.toISOString())}` : 'Chargement...'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.textMuted, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ accentColor: COLORS.success }}
              />
              Auto-refresh 30s
            </label>
            <button
              onClick={() => { fetchIncidents(); fetchRoundLogs(); fetchAuthLogs(); }}
              style={btnStyle(COLORS.info)}
            >
              🔄 Rafraîchir
            </button>
            <button onClick={() => navigate('/admin/dashboard')} style={btnStyle('#334155')}>
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '20px', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 0 }}>
          {[
            { id: 'report', label: '📊 Rapport complet', icon: '' },
            { id: 'incidents', label: `⚠️ Incidents (${incidents.length})`, icon: '' },
            { id: 'rounds', label: `🎮 Manches (${roundLogs.length}) ${roundLogs.some(r => r.doublePairIssues > 0) ? '🚨' : ''}`, icon: '' },
            { id: 'e2e', label: `🧪 Tests E2E ${e2eResults.length > 0 ? (e2eResults[0]?.summary?.status === 'PASS' ? '✅' : '❌') : ''}`, icon: '' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderBottom: activeTab === tab.id ? `3px solid ${COLORS.info}` : '3px solid transparent',
                background: 'transparent',
                color: activeTab === tab.id ? '#fff' : COLORS.textMuted,
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: 14,
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 18, color: COLORS.textMuted }}>Chargement des données...</div>
          </div>
        ) : (
          <>
            {/* ====== REPORT TAB ====== */}
            {activeTab === 'report' && (() => {
              const buildFullReport = () => {
                const sections = [];
                const now = new Date().toLocaleString('fr-FR');
                sections.push(`===== RAPPORT MONITORING CRAZY CHRONO =====`);
                sections.push(`Date: ${now}`);
                sections.push('');

                // KPIs
                sections.push(`--- KPIs ---`);
                sections.push(`Incidents: ${incidents.length} | Manches: ${roundLogs.length} | Auth: ${authLogs.length}`);
                sections.push('');

                // Incidents (max 20)
                sections.push(`--- INCIDENTS (${Math.min(incidents.length, 20)}/${incidents.length}) ---`);
                if (incidents.length === 0) {
                  sections.push('Aucun incident.');
                } else {
                  incidents.slice(0, 20).forEach((inc, i) => {
                    const ts = inc.timestamp ? new Date(inc.timestamp).toLocaleString('fr-FR') : 'N/A';
                    sections.push(`[${i+1}] ${(inc.severity||'warning').toUpperCase()} | ${inc.type || 'unknown'} | ${ts}`);
                    if (inc.details) sections.push(`    Détails: ${typeof inc.details === 'string' ? inc.details : JSON.stringify(inc.details)}`);
                  });
                }
                sections.push('');

                // Auth logs (connexions, sauvegardes profil)
                sections.push(`--- AUTHENTIFICATION (${Math.min(authLogs.length, 20)}/${authLogs.length}) ---`);
                if (authLogs.length === 0) {
                  sections.push('Aucun événement auth enregistré.');
                } else {
                  authLogs.slice(0, 20).forEach((a, i) => {
                    const ts = a.timestamp ? new Date(a.timestamp).toLocaleString('fr-FR') : 'N/A';
                    const icon = a.type === 'save_ok' ? '✅' : a.type === 'save_fail' ? '❌' : a.type === 'login' ? '🔑' : a.type === 'login_auto' ? '🔄' : a.type === 'logout' ? '🚪' : 'ℹ️';
                    sections.push(`[${i+1}] ${icon} ${a.type} | ${ts}`);
                    if (a.details) {
                      const d = a.details;
                      if (d.email) sections.push(`    Email: ${d.email}`);
                      if (d.nom_final) sections.push(`    Nom final: ${d.nom_final}`);
                      if (d.pseudo_db) sections.push(`    Pseudo DB: ${d.pseudo_db}`);
                      if (d.pseudo) sections.push(`    Pseudo envoyé: ${d.pseudo}`);
                      if (d.source) sections.push(`    Source du nom: ${d.source}`);
                      if (d.saved_pseudo) sections.push(`    Pseudo confirmé serveur: ${d.saved_pseudo}`);
                      if (d.existingAuth_name) sections.push(`    existingAuth.name: ${d.existingAuth_name}`);
                      if (d.status) sections.push(`    HTTP status: ${d.status}`);
                      if (d.error) sections.push(`    Erreur: ${d.error}`);
                      if (d.server_response && !d.saved_pseudo) sections.push(`    Réponse serveur: ${JSON.stringify(d.server_response)}`);
                    }
                  });
                }
                sections.push('');

                // Round logs (manches jouées)
                const recentRounds = roundLogs.slice(0, 20);
                sections.push(`--- MANCHES JOUÉES (${recentRounds.length}/${roundLogs.length}) ---`);
                if (recentRounds.length === 0) {
                  sections.push('Aucune manche enregistrée.');
                } else {
                  recentRounds.forEach((r, i) => {
                    const ts = r.timestamp ? new Date(r.timestamp).toLocaleString('fr-FR') : 'N/A';
                    const issues = r.doublePairIssues > 0 ? ` 🚨 ${r.doublePairIssues} DOUBLE PAIRE(S)` : '';
                    sections.push(`[${i+1}] ${ts} | mode: ${r.mode} | paires: ${r.validPairs} | zones: ${r.summary?.totalZones || '?'}${issues}`);
                    if (r.issues && r.issues.length > 0) {
                      r.issues.forEach(iss => {
                        sections.push(`    ⚠️ ${iss.message || JSON.stringify(iss)}`);
                      });
                    }
                    if (r.summary?.paired) {
                      r.summary.paired.forEach(p => {
                        sections.push(`    PA: [${p.type}] "${p.content}" pairId=${p.pairId}`);
                      });
                    }
                  });
                }
                sections.push('');

sections.push(`===== FIN DU RAPPORT =====`);
                return sections.join('\n');
              };

              const reportText = buildFullReport();

              return (
                <div>
                  {/* Action bar */}
                  <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>📊 Rapport complet — 1 clic pour tout copier</h3>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { fetchIncidents(); fetchRoundLogs(); }}
                        style={btnStyle(COLORS.info)}
                      >
                        🔄 Rafraîchir tout
                      </button>
                      <button
                        onClick={() => copyToClipboard(reportText, 'report')}
                        style={{
                          padding: '10px 24px',
                          background: copyFeedback === 'report' ? '#148A9C' : 'linear-gradient(135deg, #1AACBE 0%, #148A9C 100%)',
                          border: 'none',
                          borderRadius: 8,
                          color: '#fff',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 15,
                          transition: 'all 0.3s',
                          boxShadow: '0 4px 12px rgba(26,172,190,0.4)',
                        }}
                      >
                        {copyFeedback === 'report' ? '✅ Rapport copié !' : '📋 Copier tout le rapport'}
                      </button>
                    </div>
                  </div>

                  {/* KPI Summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                    <KPICard title="Incidents" value={incidents.length} icon="🚨" color={COLORS.accent} highlight={incidents.length > 0} />
                    <KPICard title="Manches" value={roundLogs.length} icon="🎮" color="#10b981" highlight={roundLogs.some(r => r.doublePairIssues > 0)} />
                    <KPICard title="Double paires" value={roundLogs.filter(r => r.doublePairIssues > 0).length} icon="🚨" color={COLORS.error} highlight={roundLogs.some(r => r.doublePairIssues > 0)} />
                  </div>

                  {/* Incidents section */}
                  <div style={{ ...cardStyle, marginBottom: 16, borderLeft: incidents.length > 0 ? `4px solid ${COLORS.warn}` : undefined }}>
                    <h3 style={{ ...cardTitleStyle, color: incidents.length > 0 ? COLORS.warn : COLORS.success }}>
                      {incidents.length > 0 ? `⚠️ ${incidents.length} incidents` : '✅ Aucun incident'}
                    </h3>
                    {incidents.length > 0 && (
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {incidents.slice(0, 10).map((inc, i) => (
                          <div key={i} style={{ padding: '6px 10px', borderLeft: `3px solid ${COLORS.warn}`, background: 'rgba(245,158,11,0.05)', marginBottom: 4, borderRadius: '0 6px 6px 0', fontSize: 12 }}>
                            <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: COLORS.warn, color: '#fff', marginRight: 6 }}>
                              {(inc.severity || 'warning').toUpperCase()}
                            </span>
                            <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{inc.type} </span>
                            <span style={{ color: COLORS.text }}>{typeof inc.details === 'string' ? inc.details.substring(0, 80) : JSON.stringify(inc.details || '').substring(0, 80)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  
                  {/* Round Logs section (manches jouées) */}
                  <div style={{ ...cardStyle, marginBottom: 16, borderLeft: roundLogs.some(r => r.doublePairIssues > 0) ? '4px solid #ef4444' : '4px solid #10b981' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h3 style={{ ...cardTitleStyle, color: roundLogs.some(r => r.doublePairIssues > 0) ? '#ef4444' : '#10b981', margin: 0 }}>
                        {roundLogs.some(r => r.doublePairIssues > 0)
                          ? `🚨 ${roundLogs.filter(r => r.doublePairIssues > 0).length} manche(s) avec double paires sur ${roundLogs.length}`
                          : `✅ ${roundLogs.length} manches jouées — aucune double paire`}
                      </h3>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => fetchRoundLogs()} style={btnStyle(COLORS.info)}>🔄</button>
                        <button onClick={() => { clearRoundLogs(); setRoundLogs([]); }} style={btnStyle('#dc2626')}>🗑️ Vider</button>
                      </div>
                    </div>
                    {roundLogs.length > 0 ? (
                      <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                        {roundLogs.slice(0, 15).map((r, i) => {
                          const hasIssue = r.doublePairIssues > 0;
                          const ts = r.timestamp ? new Date(r.timestamp).toLocaleString('fr-FR') : 'N/A';
                          return (
                            <div key={r.id || i} style={{
                              padding: '6px 10px',
                              borderLeft: `3px solid ${hasIssue ? '#ef4444' : '#10b981'}`,
                              background: hasIssue ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.05)',
                              marginBottom: 4, borderRadius: '0 6px 6px 0', fontSize: 12
                            }}>
                              <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{ts} </span>
                              <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: hasIssue ? '#ef4444' : '#10b981', color: '#fff', marginRight: 6 }}>
                                {r.mode}
                              </span>
                              <span style={{ color: COLORS.text }}>
                                {r.validPairs} paire(s) | {r.summary?.totalZones || '?'} zones
                              </span>
                              {hasIssue && (
                                <span style={{ color: '#ef4444', fontWeight: 700, marginLeft: 8 }}>
                                  🚨 {r.doublePairIssues} DOUBLE PAIRE(S)
                                </span>
                              )}
                              {r.issues && r.issues.map((iss, j) => (
                                <div key={j} style={{ marginLeft: 20, color: '#ef4444', fontSize: 11, marginTop: 2 }}>
                                  ⚠️ {iss.message || JSON.stringify(iss)}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: 12, color: COLORS.textMuted, textAlign: 'center' }}>
                        Aucune manche enregistrée. Jouez une partie pour voir les logs ici.
                      </div>
                    )}
                  </div>

                  {/* Full text preview */}
                  <div style={cardStyle}>
                    <h3 style={cardTitleStyle}>📄 Aperçu du rapport complet (texte brut)</h3>
                    <pre style={{
                      maxHeight: 300, overflowY: 'auto', fontSize: 11, color: COLORS.textMuted,
                      background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {reportText}
                    </pre>
                  </div>
                </div>
              );
            })()}

            {/* ====== INCIDENTS TAB ====== */}
            {activeTab === 'incidents' && (
              <div>
                {/* Incidents Header */}
                <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>⚠️ Incidents de jeu ({incidents.length})</h3>
                    <select
                      value={incidentSeverityFilter}
                      onChange={(e) => setIncidentSeverityFilter(e.target.value)}
                      style={{
                        padding: '6px 12px', background: COLORS.bg,
                        border: `1px solid ${COLORS.border}`, borderRadius: 8,
                        color: COLORS.text, fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      <option value="all">Toutes sévérités</option>
                      <option value="critical">🔴 Critical</option>
                      <option value="error">🟠 Error</option>
                      <option value="warning">🟡 Warning</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => fetchIncidents()}
                      style={btnStyle(COLORS.info)}
                    >
                      🔄 Rafraîchir
                    </button>
                    <button
                      onClick={() => copyToClipboard(formatIncidentsForCopy(incidents), 'incidents')}
                      disabled={!incidents.length}
                      style={{
                        ...btnStyle(copyFeedback === 'incidents' ? '#148A9C' : '#f59e0b'),
                        opacity: incidents.length ? 1 : 0.5,
                      }}
                    >
                      {copyFeedback === 'incidents' ? '✅ Copié !' : '📋 Copier les incidents'}
                    </button>
                    <button
                      onClick={clearIncidents}
                      disabled={!incidents.length}
                      style={{ ...btnStyle('#334155'), opacity: incidents.length ? 1 : 0.5 }}
                    >
                      🗑️ Vider
                    </button>
                  </div>
                </div>

                {/* Incidents List */}
                <div style={cardStyle}>
                  {incidentsLoading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted }}>Chargement des incidents...</div>
                  ) : incidents.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                      <div style={{ fontSize: 16, color: COLORS.success }}>Aucun incident détecté</div>
                      <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 8 }}>Les anomalies de jeu (paires dupliquées, SVG décalés, etc.) apparaîtront ici.</div>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                      {incidents.map((inc, i) => {
                        const sevColor = inc.severity === 'critical' ? '#ef4444' : inc.severity === 'error' ? '#f97316' : '#f59e0b';
                        return (
                          <div key={inc.id || i} style={{
                            padding: '12px 16px',
                            borderLeft: `4px solid ${sevColor}`,
                            background: `${sevColor}08`,
                            marginBottom: 8,
                            borderRadius: '0 8px 8px 0',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                  background: sevColor, color: '#fff',
                                }}>
                                  {(inc.severity || 'warning').toUpperCase()}
                                </span>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                  background: 'rgba(255,255,255,0.1)', color: COLORS.text,
                                }}>
                                  {inc.type || 'unknown'}
                                </span>
                              </div>
                              <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                                {inc.timestamp ? new Date(inc.timestamp).toLocaleString('fr-FR') : ''}
                              </span>
                            </div>
                            {inc.details && (
                              <pre style={{
                                fontSize: 11, color: COLORS.textMuted, margin: '6px 0 0',
                                background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 4,
                                overflow: 'auto', maxHeight: 150, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                              }}>
                                {typeof inc.details === 'string' ? inc.details : JSON.stringify(inc.details, null, 2)}
                              </pre>
                            )}
                            {inc.deviceInfo && (
                              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                                📱 {inc.deviceInfo.screenWidth}x{inc.deviceInfo.screenHeight} — {(inc.deviceInfo.userAgent || '').substring(0, 80)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}




            {/* ====== ROUNDS TAB ====== */}
            {activeTab === 'rounds' && (
              <div>
                <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>🎮 Historique des manches jouées ({roundLogs.length})</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => fetchRoundLogs()} style={btnStyle(COLORS.info)}>🔄 Rafraîchir</button>
                    <button onClick={() => { clearRoundLogs(); setRoundLogs([]); }} style={btnStyle('#dc2626')}>🗑️ Tout vider</button>
                    <button onClick={() => {
                      const text = roundLogs.map((r, i) => {
                        const ts = r.timestamp ? new Date(r.timestamp).toLocaleString('fr-FR') : 'N/A';
                        const lines = [`[${i+1}] ${ts} | mode: ${r.mode} | paires: ${r.validPairs} | zones: ${r.summary?.totalZones || '?'}`];
                        if (r.doublePairIssues > 0) lines.push(`  🚨 ${r.doublePairIssues} DOUBLE PAIRE(S)`);
                        if (r.issues) r.issues.forEach(iss => lines.push(`  ⚠️ ${iss.message || JSON.stringify(iss)}`));
                        if (r.summary?.paired) r.summary.paired.forEach(p => lines.push(`  PA: [${p.type}] "${p.content}" pairId=${p.pairId}`));
                        if (r.zonesSnapshot) lines.push(`  Zones: ${JSON.stringify(r.zonesSnapshot)}`);
                        return lines.join('\n');
                      }).join('\n\n');
                      copyToClipboard(text, 'rounds');
                    }} style={btnStyle(COLORS.success)}>📋 Copier tout</button>
                  </div>
                </div>
                {copyFeedback === 'rounds' && <div style={{ padding: 8, color: '#10b981', fontWeight: 700, textAlign: 'center' }}>✅ Copié !</div>}

                {/* Stats summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <KPICard title="Total manches" value={roundLogs.length} icon="🎮" color="#10b981" />
                  <KPICard title="Avec double paires" value={roundLogs.filter(r => r.doublePairIssues > 0).length} icon="🚨" color="#ef4444" highlight={roundLogs.some(r => r.doublePairIssues > 0)} />
                  <KPICard title="Mode solo" value={roundLogs.filter(r => r.mode === 'solo').length} icon="👤" color="#3b82f6" />
                  <KPICard title="Mode objectif" value={roundLogs.filter(r => r.mode === 'objective').length} icon="🎯" color="#8b5cf6" />
                  <KPICard title="Arena" value={roundLogs.filter(r => r.mode === 'arena' || r.mode === 'training-arena').length} icon="⚔️" color="#f59e0b" />
                  <KPICard title="Multi" value={roundLogs.filter(r => r.mode === 'multiplayer' || r.mode === 'training').length} icon="👥" color="#06b6d4" />
                </div>

                {/* Detailed list */}
                {roundLogs.length === 0 ? (
                  <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: COLORS.textMuted }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
                    <p>Aucune manche enregistrée.</p>
                    <p style={{ fontSize: 12 }}>Jouez une partie (solo, objectif, arena, multi) pour voir les données ici.</p>
                  </div>
                ) : (
                  <div>
                    {roundLogs.map((r, i) => {
                      const hasIssue = r.doublePairIssues > 0;
                      const ts = r.timestamp ? new Date(r.timestamp).toLocaleString('fr-FR') : 'N/A';
                      return (
                        <div key={r.id || i} style={{
                          ...cardStyle,
                          marginBottom: 8,
                          borderLeft: `4px solid ${hasIssue ? '#ef4444' : '#10b981'}`,
                          background: hasIssue ? 'rgba(239,68,68,0.05)' : COLORS.card,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div>
                              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: hasIssue ? '#ef4444' : '#10b981', color: '#fff', marginRight: 8 }}>
                                {r.mode}
                              </span>
                              <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{ts}</span>
                              {hasIssue && <span style={{ color: '#ef4444', fontWeight: 700, marginLeft: 12, fontSize: 13 }}>🚨 {r.doublePairIssues} DOUBLE PAIRE(S)</span>}
                            </div>
                            <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
                              {r.validPairs} paire(s) | {r.summary?.totalZones || '?'} zones | {r.summary?.byType ? Object.entries(r.summary.byType).map(([k,v]) => `${k}:${v}`).join(' ') : ''}
                            </span>
                          </div>

                          {/* Issues */}
                          {r.issues && r.issues.length > 0 && (
                            <div style={{ marginBottom: 6 }}>
                              {r.issues.map((iss, j) => (
                                <div key={j} style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: 4, marginBottom: 3, fontSize: 11, color: '#ef4444' }}>
                                  ⚠️ {iss.message}
                                  {iss.imageFile && <span style={{ color: COLORS.textMuted }}> | img: {iss.imageFile}</span>}
                                  {iss.texteContent && <span style={{ color: COLORS.textMuted }}> | txt: {iss.texteContent}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Paired zones */}
                          {r.summary?.paired && r.summary.paired.length > 0 && (
                            <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                              <strong>Paire(s) officielle(s) :</strong>{' '}
                              {r.summary.paired.map((p, j) => (
                                <span key={j} style={{ marginRight: 8 }}>
                                  [{p.type}] "{p.content}" <span style={{ color: '#10b981' }}>{p.pairId.substring(0, 30)}</span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Zones snapshot (collapsible) */}
                          {r.zonesSnapshot && (
                            <details style={{ marginTop: 6 }}>
                              <summary style={{ cursor: 'pointer', fontSize: 11, color: COLORS.textMuted }}>
                                Voir toutes les zones ({r.zonesSnapshot.length})
                              </summary>
                              <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 10, fontFamily: 'monospace', marginTop: 4, background: 'rgba(0,0,0,0.2)', padding: 6, borderRadius: 4 }}>
                                {r.zonesSnapshot.map((z, k) => (
                                  <div key={k} style={{ color: z.pairId ? '#10b981' : (z.isDistractor ? COLORS.textMuted : '#f59e0b') }}>
                                    {z.pairId ? '✅' : (z.isDistractor ? '⬜' : '⚠️')} [{z.type}] {z.content} {z.pairId ? `pairId=${z.pairId.substring(0,30)}` : ''}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}


            {/* ====== E2E CENTRE DE CONTRÔLE ====== */}
            {activeTab === 'e2e' && (() => {
              const backendUrl = getBackendUrl();
              const token = getAuthToken();
              const authHeaders = token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

              const safeJson = async (res) => {
                try {
                  const text = await res.text();
                  return JSON.parse(text);
                } catch { return null; }
              };

              const fetchE2eResults = async () => {
                setE2eResultsLoading(true);
                setE2eError(null);
                try {
                  const res = await fetch(`${backendUrl}/api/monitoring/e2e-results`, { headers: authHeaders });
                  if (res.ok) { const d = await safeJson(res); if (d && d.ok) setE2eResults(d.results || []); }
                  else if (res.status === 401 || res.status === 403) setE2eError('Token expiré ou droits insuffisants. Reconnecte-toi.');
                  else setE2eError(`Serveur a répondu HTTP ${res.status}`);
                } catch (err) {
                  console.warn('[E2E] Fetch results failed:', err.message);
                  setE2eError('Backend Render injoignable (serveur endormi?). Clique sur Rafraîchir pour réessayer.');
                }
                setE2eResultsLoading(false);
              };

              const fetchScreenshots = async () => {
                setE2eLoading(true);
                try {
                  const res = await fetch(`${backendUrl}/api/monitoring/e2e-screenshots`, { headers: authHeaders });
                  if (res.ok) { const d = await safeJson(res); if (d && d.ok) setE2eScreenshots(d.screenshots || []); }
                } catch (err) { console.warn('[E2E] Fetch screenshots failed:', err.message); }
                setE2eLoading(false);
              };

              const fetchGithubStatus = async () => {
                try {
                  const res = await fetch(`${backendUrl}/api/monitoring/e2e-status`, { headers: authHeaders });
                  if (res.ok) { const d = await safeJson(res); if (d && d.ok && d.runs) setE2eGithubRuns(d.runs); }
                } catch (err) { console.warn('[E2E] Fetch GitHub status failed:', err.message); }
              };

              const triggerTests = async () => {
                setE2eTriggerMsg({ type: 'loading', text: '🚀 Lancement des tests en cours...' });
                try {
                  const res = await fetch(`${backendUrl}/api/monitoring/trigger-e2e`, { method: 'POST', headers: authHeaders });
                  if (!res.ok) {
                    setE2eTriggerMsg({ type: 'error', text: `❌ Serveur a répondu HTTP ${res.status}. Le backend est peut-être en cours de redémarrage — réessayez dans 2 min.` });
                    return;
                  }
                  const d = await safeJson(res);
                  if (d && d.ok) {
                    setE2eRunning(true);
                    setE2eRunStartTime(Date.now());
                    setE2eRunElapsed(0);
                    setE2eTriggerMsg({ type: 'running', text: '🚀 Tests lancés ! Le workflow GitHub Actions est en cours d\'exécution.' });
                    setTimeout(() => fetchGithubStatus(), 5000);
                  } else {
                    setE2eTriggerMsg({ type: 'error', text: '❌ ' + (d?.error || 'Réponse inattendue du serveur'), help: d?.help });
                  }
                } catch (err) {
                  setE2eTriggerMsg({ type: 'error', text: '❌ ' + err.message });
                }
              };

              const fetchAll = () => { fetchE2eResults(); fetchScreenshots(); fetchGithubStatus(); };
              if (e2eResults.length === 0 && !e2eResultsLoading) fetchAll();

              const lastRun = e2eResults[0] || null;
              const lastSummary = lastRun?.summary || {};

              return (
                <div>
                  {/* Header + Bouton Lancer */}
                  <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 'bold' }}>🧪 Centre de Contrôle E2E</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: COLORS.textMuted }}>
                        Tests automatiques — résultats, screenshots, lancement
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={fetchAll} style={btnStyle(COLORS.info)}>🔄 Rafraîchir</button>
                      <button
                        onClick={triggerTests}
                        disabled={e2eRunning}
                        style={{
                          ...btnStyle(e2eRunning ? '#6b7280' : '#22c55e'),
                          fontSize: 14, padding: '10px 20px',
                          cursor: e2eRunning ? 'not-allowed' : 'pointer',
                          opacity: e2eRunning ? 0.6 : 1,
                        }}
                      >
                        {e2eRunning ? '⏳ Tests en cours...' : '🚀 Lancer les tests E2E'}
                      </button>
                    </div>
                  </div>

                  {/* Panneau de progression des tests */}
                  {e2eRunning && (() => {
                    const progress = Math.min(e2eRunElapsed / E2E_ESTIMATED_DURATION, 0.99);
                    const pct = Math.round(progress * 100);
                    const remainingSec = Math.max(E2E_ESTIMATED_DURATION - e2eRunElapsed, 0);
                    const remainingMin = Math.floor(remainingSec / 60);
                    const remainingS = remainingSec % 60;
                    const elapsedMin = Math.floor(e2eRunElapsed / 60);
                    const elapsedS = e2eRunElapsed % 60;
                    let phase = 'Installation des dépendances...';
                    if (e2eRunElapsed > 30) phase = 'Installation du navigateur Playwright...';
                    if (e2eRunElapsed > 90) phase = 'Réveil du backend Render...';
                    if (e2eRunElapsed > 180) phase = 'Exécution des tests E2E...';
                    if (e2eRunElapsed > 1400) phase = 'Fin des tests, envoi du rapport...';
                    if (e2eRunElapsed > 1600) phase = 'Presque terminé...';
                    return (
                      <div style={{
                        ...cardStyle, marginBottom: 16, padding: '20px 24px',
                        borderLeft: '4px solid #3b82f6',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.02) 100%)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                            🔄 Tests E2E en cours d'exécution
                          </div>
                          <div style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>
                            {elapsedMin}:{String(elapsedS).padStart(2, '0')} écoulé
                          </div>
                        </div>
                        {/* Barre de progression */}
                        <div style={{
                          width: '100%', height: 12, background: 'rgba(255,255,255,0.1)',
                          borderRadius: 6, overflow: 'hidden', marginBottom: 10,
                        }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: 'linear-gradient(90deg, #3b82f6 0%, #22c55e 100%)',
                            borderRadius: 6, transition: 'width 1s linear',
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                            <span style={{ marginRight: 12 }}>📋 {phase}</span>
                          </div>
                          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                            ~{remainingMin}:{String(remainingS).padStart(2, '0')} restant ({pct}%)
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
                          Les résultats s'afficheront automatiquement à la fin. Vous pouvez quitter cette page et revenir — le statut sera vérifié au prochain rafraîchissement.
                        </div>
                      </div>
                    );
                  })()}

                  {/* Message de feedback (succès/erreur) */}
                  {e2eTriggerMsg && !e2eRunning && (
                    <div style={{
                      ...cardStyle, marginBottom: 12, padding: '12px 16px',
                      borderLeft: `4px solid ${e2eTriggerMsg.type === 'success' ? '#22c55e' : e2eTriggerMsg.type === 'error' ? '#ef4444' : '#3b82f6'}`,
                      background: e2eTriggerMsg.type === 'error' ? 'rgba(239,68,68,0.1)' : e2eTriggerMsg.type === 'success' ? 'rgba(34,197,94,0.1)' : COLORS.card,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{e2eTriggerMsg.text}</div>
                      {e2eTriggerMsg.help && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>{e2eTriggerMsg.help}</div>}
                    </div>
                  )}

                  {/* KPIs du dernier run */}
                  {lastRun && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
                      <KPICard title="Dernier run" value={lastSummary.status || '?'} icon={lastSummary.status === 'PASS' ? '✅' : '❌'} color={lastSummary.status === 'PASS' ? '#22c55e' : '#ef4444'} highlight={lastSummary.status !== 'PASS'} />
                      <KPICard title="Tests passés" value={lastSummary.passed || 0} icon="✅" color="#22c55e" />
                      <KPICard title="Échoués" value={lastSummary.failed || 0} icon="❌" color="#ef4444" highlight={(lastSummary.failed || 0) > 0} />
                      <KPICard title="Skippés" value={lastSummary.skipped || 0} icon="⏭️" color="#f59e0b" />
                      <KPICard title="Durée" value={lastSummary.duration ? `${(lastSummary.duration / 1000).toFixed(0)}s` : '?'} icon="⏱️" color="#3b82f6" />
                      <KPICard title="Source" value={lastRun.source || '?'} icon="📍" color="#8b5cf6" />
                    </div>
                  )}

                  {/* Sub-tabs */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${COLORS.border}` }}>
                    {[
                      { id: 'results', label: `📋 Résultats (${e2eResults.length})` },
                      { id: 'screenshots', label: `📸 Screenshots (${e2eScreenshots.length})` },
                      { id: 'github', label: `🔗 GitHub Actions (${e2eGithubRuns.length})` },
                    ].map(st => (
                      <button key={st.id} onClick={() => setE2eSubTab(st.id)} style={{
                        padding: '8px 16px', border: 'none',
                        borderBottom: e2eSubTab === st.id ? `2px solid ${COLORS.info}` : '2px solid transparent',
                        background: 'transparent', color: e2eSubTab === st.id ? '#fff' : COLORS.textMuted,
                        cursor: 'pointer', fontWeight: e2eSubTab === st.id ? 700 : 500, fontSize: 13,
                      }}>{st.label}</button>
                    ))}
                  </div>

                  {/* ── SUB-TAB: Résultats ── */}
                  {e2eSubTab === 'results' && (
                    <div>
                      {e2eResults.length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: COLORS.textMuted }}>
                          <div style={{ fontSize: 48, marginBottom: 16 }}>{e2eError ? '⚠️' : '🧪'}</div>
                          {e2eError ? (
                            <>
                              <p style={{ color: COLORS.warn, fontWeight: 600 }}>{e2eError}</p>
                              <p style={{ fontSize: 12 }}>Le serveur Render (plan gratuit) s'endort après inactivité. Le premier clic sur Rafraîchir le réveille (~30s).</p>
                            </>
                          ) : (
                            <>
                              <p>Aucun résultat E2E disponible.</p>
                              <p style={{ fontSize: 12 }}>Cliquez sur "🚀 Lancer les tests E2E" pour démarrer, ou attendez l'exécution nocturne automatique.</p>
                            </>
                          )}
                        </div>
                      ) : (
                        e2eResults.map((run, ri) => {
                          const s = run.summary || {};
                          const isExpanded = e2eExpandedRun === ri;
                          const ts = run.timestamp ? new Date(run.timestamp).toLocaleString('fr-FR') : '';
                          const failed = (run.failedTests || []);
                          return (
                            <div key={ri} style={{
                              ...cardStyle, marginBottom: 8,
                              borderLeft: `4px solid ${s.status === 'PASS' ? '#22c55e' : '#ef4444'}`,
                              cursor: 'pointer',
                            }} onClick={() => setE2eExpandedRun(isExpanded ? null : ri)}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <span style={{ padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: s.status === 'PASS' ? '#22c55e' : '#ef4444', color: '#fff', marginRight: 8 }}>
                                    {s.status || '?'}
                                  </span>
                                  <span style={{ fontSize: 12, color: COLORS.textMuted }}>{ts}</span>
                                  <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 12 }}>
                                    {run.source === 'github-actions' ? '🔗 GitHub' : '💻 Local'} • {run.branch || ''} • {run.commit || ''}
                                  </span>
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                                  {s.passed}✅ {s.failed > 0 ? `${s.failed}❌` : ''} {s.skipped}⏭️ — {s.duration ? `${(s.duration / 1000).toFixed(0)}s` : ''}
                                </div>
                              </div>

                              {/* Failed tests preview */}
                              {failed.length > 0 && !isExpanded && (
                                <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444' }}>
                                  ❌ {failed.map(f => f.title).join(' | ')}
                                </div>
                              )}

                              {/* Expanded details */}
                              {isExpanded && run.tests && (
                                <div style={{ marginTop: 12, maxHeight: 400, overflowY: 'auto' }}>
                                  {run.tests.map((t, ti) => (
                                    <div key={ti} style={{
                                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                      padding: '4px 8px', borderRadius: 4, marginBottom: 2,
                                      background: t.status === 'failed' ? 'rgba(239,68,68,0.15)' : t.status === 'passed' ? 'rgba(34,197,94,0.05)' : 'transparent',
                                      fontSize: 11,
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>{t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'timedOut' ? '⏰' : '⏭️'}</span>
                                        <span style={{ color: COLORS.textMuted }}>{t.file}</span>
                                        <span style={{ color: '#fff' }}>{t.title}</span>
                                      </div>
                                      <span style={{ color: COLORS.textMuted }}>{t.duration}ms</span>
                                    </div>
                                  ))}
                                  {/* Error details */}
                                  {failed.length > 0 && (
                                    <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 10, fontFamily: 'monospace', color: '#ef4444' }}>
                                      <strong>Erreurs détaillées :</strong>
                                      {failed.map((f, fi) => (
                                        <div key={fi} style={{ marginTop: 4 }}>
                                          <strong>{f.file} › {f.title}</strong>: {f.error}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* ── SUB-TAB: Screenshots ── */}
                  {e2eSubTab === 'screenshots' && (
                    <div>
                      {e2eScreenshots.length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: COLORS.textMuted }}>
                          <div style={{ fontSize: 48, marginBottom: 16 }}>📸</div>
                          <p>Aucun screenshot E2E disponible.</p>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                            <KPICard title="Total captures" value={e2eScreenshots.length} icon="📸" color="#3b82f6" />
                            <KPICard title="Avec anomalies" value={e2eScreenshots.filter(s => s.anomalies && s.anomalies.length > 0).length} icon="🚨" color="#ef4444" highlight={e2eScreenshots.some(s => s.anomalies && s.anomalies.length > 0)} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                            {e2eScreenshots.map((ss, i) => {
                              const hasAnomaly = ss.anomalies && ss.anomalies.length > 0;
                              const ts = ss.timestamp ? new Date(ss.timestamp).toLocaleString('fr-FR') : '';
                              const imgUrl = `${backendUrl}/api/monitoring/e2e-screenshots/${ss.filename}`;
                              return (
                                <div key={i} style={{ ...cardStyle, borderLeft: `4px solid ${hasAnomaly ? '#ef4444' : '#10b981'}`, cursor: 'pointer' }} onClick={() => setE2eSelectedImg(imgUrl)}>
                                  <div style={{ marginBottom: 8 }}>
                                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: hasAnomaly ? '#ef4444' : '#10b981', color: '#fff', marginRight: 6 }}>{hasAnomaly ? 'ANOMALIE' : 'OK'}</span>
                                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>{ts}</span>
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{ss.scenarioName}</div>
                                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>{ss.screenshotName} ({(ss.size / 1024).toFixed(0)} KB)</div>
                                  {hasAnomaly && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 6 }}>{ss.anomalies.join(', ')}</div>}
                                  <img src={imgUrl} alt={ss.scenarioName} style={{ width: '100%', borderRadius: 6, border: `1px solid ${COLORS.border}` }} onError={(e) => { e.target.style.display = 'none'; }} />
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* ── SUB-TAB: GitHub Actions ── */}
                  {e2eSubTab === 'github' && (
                    <div>
                      {e2eGithubRuns.length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: COLORS.textMuted }}>
                          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
                          <p>Aucun workflow GitHub visible.</p>
                          <p style={{ fontSize: 12 }}>Configurez GITHUB_TOKEN sur Render pour voir le statut des workflows ici.</p>
                          <p style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 12 }}>
                            1. Allez sur github.com/settings/tokens → créer un token "Fine-grained" avec scope "Actions: read+write"<br/>
                            2. Ajoutez GITHUB_TOKEN dans Render → Environment Variables<br/>
                            3. Le bouton "Lancer les tests" et le statut GitHub fonctionneront.
                          </p>
                        </div>
                      ) : (
                        e2eGithubRuns.map((run, i) => {
                          const statusColor = run.conclusion === 'success' ? '#22c55e' : run.conclusion === 'failure' ? '#ef4444' : run.status === 'in_progress' ? '#3b82f6' : '#f59e0b';
                          const statusIcon = run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : run.status === 'in_progress' ? '🔄' : '⏳';
                          const ts = run.startedAt ? new Date(run.startedAt).toLocaleString('fr-FR') : '';
                          return (
                            <div key={i} style={{ ...cardStyle, marginBottom: 8, borderLeft: `4px solid ${statusColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <span style={{ padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: statusColor, color: '#fff', marginRight: 8 }}>
                                  {statusIcon} {run.conclusion || run.status}
                                </span>
                                <span style={{ fontSize: 12, color: COLORS.textMuted }}>{ts}</span>
                                <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 12 }}>{run.branch} • {run.commit}</span>
                              </div>
                              <a href={run.url} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('#334155'), fontSize: 11, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                                Voir sur GitHub ↗
                              </a>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Lightbox */}
                  {e2eSelectedImg && (
                    <div onClick={() => setE2eSelectedImg(null)} style={{
                      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                      background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      zIndex: 9999, cursor: 'zoom-out', padding: 20,
                    }}>
                      <img src={e2eSelectedImg} alt="Screenshot E2E" style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 4px 30px rgba(0,0,0,0.5)' }} />
                    </div>
                  )}
                </div>
              );
            })()}

          </>
        )}
      </div>
    </div>
  );
}

// ========== Sub-components ==========

function KPICard({ title, value, icon, color, highlight }) {
  return (
    <div style={{
      background: highlight ? 'rgba(239,68,68,0.1)' : COLORS.card,
      padding: '20px',
      borderRadius: 12,
      border: highlight ? `2px solid ${COLORS.error}` : `1px solid ${COLORS.border}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {highlight && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          background: COLORS.error, color: '#fff',
          padding: '2px 10px', borderRadius: '0 0 0 8px',
          fontSize: 10, fontWeight: 700,
        }}>
          ATTENTION
        </div>
      )}
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 8 }}>{icon} {title}</div>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: color || '#fff' }}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </div>
    </div>
  );
}

// ========== Styles ==========

const cardStyle = {
  background: COLORS.card,
  padding: '20px',
  borderRadius: 12,
  border: `1px solid ${COLORS.border}`,
};

const cardTitleStyle = {
  fontSize: 16,
  fontWeight: 'bold',
  marginBottom: 16,
  color: COLORS.text,
  margin: '0 0 16px 0',
};

const btnStyle = (bg) => ({
  padding: '8px 16px',
  background: bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
});

export default MonitoringDashboard;
