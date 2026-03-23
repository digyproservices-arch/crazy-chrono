// ==========================================
// MONITORING DASHBOARD - Dashboard visuel de monitoring
// Graphiques temporels, sélecteur date/heure, indicateurs d'erreurs
// ==========================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../utils/apiHelpers';
import { getRoundLogs, clearRoundLogs } from '../utils/roundLogger';
import { getAuthLogs, clearAuthLogs } from '../utils/authLogger';
import { getAllScreenshotMetas, getScreenshot } from '../utils/cardScreenshot';

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
  const [activeTab, setActiveTab] = useState('report'); // report | incidents | rounds | e2e | players
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('all');
  const [roundLogs, setRoundLogs] = useState([]);
  const [authLogs, setAuthLogs] = useState([]);
  const [e2eScreenshots, setE2eScreenshots] = useState([]);
  const [e2eLoading, setE2eLoading] = useState(false);
  const [e2eSelectedImg, setE2eSelectedImg] = useState(null);
  const [screenshotMetas, setScreenshotMetas] = useState([]);
  const [screenshotViewImg, setScreenshotViewImg] = useState(null); // data URL for lightbox
  const [screenshotLoading, setScreenshotLoading] = useState(false);
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

  // ── Players tab state ──
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [onlinePlayersError, setOnlinePlayersError] = useState(null);
  const [paymentEvents, setPaymentEvents] = useState([]);
  const [usageStats, setUsageStats] = useState(null);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersSubTab, setPlayersSubTab] = useState('online'); // online | payments | usage
  const [auditResult, setAuditResult] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // ── Arena tab state ──
  const [arenaStats, setArenaStats] = useState(null);
  const [arenaLoading, setArenaLoading] = useState(false);

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

  const purgeAll = async () => {
    if (!window.confirm('⚠️ Supprimer TOUS les incidents, manches, screenshots et logs auth ? Cette action est irréversible.')) return;
    try {
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      // Purge server-side data in parallel
      await Promise.allSettled([
        fetch(`${backendUrl}/api/monitoring/incidents`, { method: 'DELETE', headers }),
        fetch(`${backendUrl}/api/monitoring/game-screenshots`, { method: 'DELETE', headers }),
      ]);
      // Purge local data
      try { localStorage.removeItem('cc_game_incidents'); } catch {}
      clearRoundLogs();
      clearAuthLogs();
      setIncidents([]);
      setRoundLogs([]);
      setAuthLogs([]);
      setScreenshotMetas([]);
      alert('✅ Tout a été purgé. Vous repartez à zéro.');
    } catch (err) {
      console.error('[Monitoring] Purge error:', err);
      alert('Erreur lors de la purge: ' + err.message);
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

  const fetchOnlinePlayers = useCallback(async () => {
    try {
      setOnlinePlayersError(null);
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/monitoring/online-players`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) setOnlinePlayers(data.players || []);
      } else {
        setOnlinePlayersError(`HTTP ${res.status} — ${res.status === 401 ? 'Token invalide' : res.status === 403 ? 'Accès refusé (rôle insuffisant)' : res.status === 503 ? 'Backend indisponible' : 'Erreur serveur'}`);
      }
    } catch (err) {
      setOnlinePlayersError(`Réseau: ${err.message || 'Backend injoignable (cold start?)'}`);
      console.warn('[Monitoring] Online players fetch failed:', err.message);
    }
  }, []);

  const fetchPaymentEvents = useCallback(async () => {
    try {
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/monitoring/payment-events`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) setPaymentEvents(data.events || []);
      }
    } catch (err) {
      console.warn('[Monitoring] Payment events fetch failed:', err.message);
    }
  }, []);

  const fetchUsageStats = useCallback(async () => {
    try {
      setPlayersLoading(true);
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/monitoring/usage-stats`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) setUsageStats(data.stats);
      }
    } catch (err) {
      console.warn('[Monitoring] Usage stats fetch failed:', err.message);
    } finally {
      setPlayersLoading(false);
    }
  }, []);

  const fetchScreenshotMetas = useCallback(async () => {
    // 1) Server screenshots (centralisé, visible par tout admin)
    try {
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/monitoring/game-screenshots`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.screenshots)) {
          setScreenshotMetas(data.screenshots);
          return;
        }
      }
    } catch (err) {
      console.warn('[Monitoring] Server screenshots fetch failed:', err.message);
    }
    // 2) Fallback: local IndexedDB metas
    try { setScreenshotMetas(getAllScreenshotMetas()); } catch {}
  }, []);

  const fetchAuditParser = useCallback(async () => {
    try {
      setAuditLoading(true);
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/monitoring/audit-parser`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) setAuditResult(data);
      }
    } catch (err) {
      console.warn('[Monitoring] Audit parser fetch failed:', err.message);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const fetchArenaStats = useCallback(async () => {
    try {
      setArenaLoading(true);
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/monitoring/arena-stats`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) setArenaStats(data);
      }
    } catch (err) {
      console.warn('[Monitoring] Arena stats fetch failed:', err.message);
    } finally {
      setArenaLoading(false);
    }
  }, []);

  const viewScreenshot = useCallback(async (roundId) => {
    if (!roundId) return;
    setScreenshotLoading(true);
    try {
      // 1) Try server (centralisé)
      const meta = screenshotMetas.find(m => m.roundId === roundId);
      if (meta && meta.filename) {
        const token = getAuthToken();
        const backendUrl = getBackendUrl();
        const res = await fetch(`${backendUrl}/api/monitoring/game-screenshots/${meta.filename}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setScreenshotViewImg(url);
          return;
        }
      }
      // 2) Fallback: local IndexedDB
      const dataUrl = await getScreenshot(roundId);
      if (dataUrl) setScreenshotViewImg(dataUrl);
      else alert('Screenshot non trouvé pour cette manche.');
    } catch (e) {
      console.warn('[Monitoring] Screenshot load failed:', e);
    } finally {
      setScreenshotLoading(false);
    }
  }, [screenshotMetas]);

  useEffect(() => {
    fetchIncidents(); fetchRoundLogs(); fetchAuthLogs(); fetchScreenshotMetas();
    fetchArenaStats(); // ✅ Auto-charger Arena pour le rapport complet
    setLoading(false);
    setLastRefresh(new Date());
  }, [fetchIncidents, fetchRoundLogs, fetchAuthLogs, fetchScreenshotMetas, fetchArenaStats]);

  useEffect(() => {
    if (activeTab === 'incidents' || activeTab === 'report') {
      fetchIncidents();
    }
    if (activeTab === 'report') {
      fetchArenaStats();
    }
    if (activeTab === 'players') {
      fetchOnlinePlayers();
      fetchPaymentEvents();
      fetchUsageStats();
    }
    if (activeTab === 'arena') {
      fetchArenaStats();
    }
  }, [activeTab, fetchIncidents, fetchOnlinePlayers, fetchPaymentEvents, fetchUsageStats, fetchArenaStats]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchIncidents(); fetchRoundLogs(); fetchAuthLogs(); fetchScreenshotMetas();
      if (activeTab === 'players') { fetchOnlinePlayers(); fetchPaymentEvents(); }
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchIncidents, fetchRoundLogs, fetchAuthLogs, fetchOnlinePlayers, fetchPaymentEvents, activeTab]);

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
            <button
              onClick={() => window.open('/tournament-real-test.html', '_blank')}
              style={btnStyle('#7c3aed')}
            >
              🏆 Test Tournoi Réel
            </button>
            <button
              onClick={() => window.open('/bot-tester.html', '_blank')}
              style={btnStyle('#0d9488')}
            >
              🤖 Bot Tester
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
            { id: 'players', label: `👥 Joueurs (${onlinePlayers.length} en ligne)`, icon: '' },
            { id: 'arena', label: `🏟️ Arena ${arenaStats?.stats ? `(${arenaStats.stats.totalMatches})` : ''}`, icon: '' },
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

                // Arena stats (si chargées)
                sections.push(`--- ARENA / TOURNOIS ---`);
                if (arenaStats?.stats) {
                  const s = arenaStats.stats;
                  sections.push(`Tournois: ${s.totalTournaments} | Matchs: ${s.totalMatches} | Terminés: ${s.matchesByStatus?.finished || 0} | En cours: ${(s.matchesByStatus?.in_progress || 0) + (s.matchesByStatus?.playing || 0)}`);
                  sections.push(`Paires trouvées: ${s.totalPairsFound} | Erreurs: ${s.totalErrors} | Matchs live: ${s.liveMatchesCount}`);
                  if (arenaStats.tournaments?.length > 0) {
                    sections.push(`Tournois récents:`);
                    arenaStats.tournaments.slice(0, 5).forEach((t, i) => {
                      sections.push(`  [${i+1}] ${t.name || t.id.slice(0, 20)} — ${t.status} — ${t.created_at ? new Date(t.created_at).toLocaleString('fr-FR') : ''}`);
                    });
                  }
                  if (arenaStats.matches?.length > 0) {
                    const finished = arenaStats.matches.filter(m => m.status === 'finished');
                    const pending = arenaStats.matches.filter(m => m.status === 'pending');
                    sections.push(`Matchs: ${finished.length} terminés, ${pending.length} en attente, ${arenaStats.matches.length - finished.length - pending.length} autres`);
                  }
                  if (arenaStats.results?.length > 0) {
                    sections.push(`Top résultats:`);
                    arenaStats.results.filter(r => r.position === 1).slice(0, 10).forEach((r, i) => {
                      sections.push(`  🥇 ${r.student_id} — score: ${r.score}, paires: ${r.pairs_found || 0}`);
                    });
                  }
                } else {
                  sections.push('Données Arena non chargées. Ouvrez l\'onglet Arena pour les charger.');
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
                        onClick={() => { fetchIncidents(); fetchRoundLogs(); fetchScreenshotMetas(); }}
                        style={btnStyle(COLORS.info)}
                      >
                        🔄 Rafraîchir tout
                      </button>
                      <button
                        onClick={purgeAll}
                        style={btnStyle('#dc2626')}
                      >
                        🗑️ Purger tout
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

                  {/* Audit Parser section */}
                  <div style={{ ...cardStyle, marginBottom: 16, borderLeft: `4px solid ${auditResult ? (auditResult.standalone.failed === 0 && auditResult.pairs.mismatch === 0 ? '#10b981' : '#ef4444') : COLORS.info}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h3 style={{ ...cardTitleStyle, margin: 0, color: auditResult ? (auditResult.standalone.failed === 0 && auditResult.pairs.mismatch === 0 ? '#10b981' : '#ef4444') : COLORS.text }}>
                        {auditResult
                          ? (auditResult.standalone.failed === 0 && auditResult.pairs.mismatch === 0
                            ? `✅ Audit Parser — ${auditResult.standalone.passed}/${auditResult.standalone.total} expressions OK, ${auditResult.pairs.correct}/${auditResult.pairs.total} paires OK`
                            : `❌ Audit Parser — ${auditResult.standalone.failed} non parsées, ${auditResult.pairs.mismatch} mismatch`)
                          : '🔍 Audit Parser'}
                      </h3>
                      <button
                        onClick={fetchAuditParser}
                        disabled={auditLoading}
                        style={{ ...btnStyle(COLORS.info), opacity: auditLoading ? 0.6 : 1, fontSize: 13, padding: '6px 16px' }}
                      >
                        {auditLoading ? '⏳ Analyse...' : '🔍 Lancer l\'audit'}
                      </button>
                    </div>
                    {!auditResult && <p style={{ color: COLORS.textMuted, fontSize: 13, margin: 0 }}>Teste toutes les expressions de calcul de la bibliothèque contre le parser.</p>}
                    {auditResult && auditResult.standalone.failed > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontWeight: 700, color: '#ef4444', fontSize: 13, marginBottom: 4 }}>Expressions non parsées :</div>
                        {auditResult.standalone.failures.map((f, i) => (
                          <div key={i} style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: 4, marginBottom: 2, fontSize: 12, color: COLORS.text }}>
                            ❌ <code>{f.content}</code> <span style={{ color: COLORS.textMuted }}>({f.levelClass}, {f.themes})</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {auditResult && auditResult.pairs.mismatch > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 13, marginBottom: 4 }}>Paires avec mauvais résultat :</div>
                        {auditResult.pairs.mismatchList.map((m, i) => (
                          <div key={i} style={{ padding: '4px 8px', background: 'rgba(245,158,11,0.1)', borderRadius: 4, marginBottom: 2, fontSize: 12, color: COLORS.text }}>
                            ⚠️ <code>{m.calcContent}</code> → parser: {m.parsedResult}, chiffre: <code>{m.chiffreContent}</code> ({m.chiffreValue}) <span style={{ color: COLORS.textMuted }}>({m.levelClass})</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {auditResult && auditResult.standalone.failed === 0 && auditResult.pairs.mismatch === 0 && (
                      <p style={{ color: '#10b981', fontSize: 13, margin: '8px 0 0' }}>Toutes les expressions sont correctement parsées et toutes les paires correspondent.</p>
                    )}
                    {auditResult && (
                      <div style={{ marginTop: 8, fontSize: 11, color: COLORS.textMuted }}>
                        Audit le {new Date(auditResult.timestamp).toLocaleString('fr-FR')} — {auditResult.counts.calculs} calculs, {auditResult.counts.chiffres} chiffres, {auditResult.counts.associations} associations
                      </div>
                    )}
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
                        {(() => { const _ssIds = new Set(screenshotMetas.map(m => m.roundId)); return roundLogs.slice(0, 15).map((r, i) => {
                          const hasIssue = r.doublePairIssues > 0;
                          const ts = r.timestamp ? new Date(r.timestamp).toLocaleString('fr-FR') : 'N/A';
                          const hasSS = _ssIds.has(r.id);
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
                              {hasSS && (
                                <button onClick={() => viewScreenshot(r.id)} disabled={screenshotLoading} title="Voir screenshot" style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>📷</button>
                              )}
                              {r.issues && r.issues.map((iss, j) => (
                                <div key={j} style={{ marginLeft: 20, color: '#ef4444', fontSize: 11, marginTop: 2 }}>
                                  ⚠️ {iss.message || JSON.stringify(iss)}
                                </div>
                              ))}
                            </div>
                          );
                        }); })()}
                      </div>
                    ) : (
                      <div style={{ padding: 12, color: COLORS.textMuted, textAlign: 'center' }}>
                        Aucune manche enregistrée. Jouez une partie pour voir les logs ici.
                      </div>
                    )}
                  </div>

                  {/* Server Screenshots section */}
                  <div style={{ ...cardStyle, marginBottom: 16, borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h3 style={{ ...cardTitleStyle, color: '#3b82f6', margin: 0 }}>
                        📷 Screenshots serveur ({screenshotMetas.length})
                      </h3>
                      <button onClick={() => fetchScreenshotMetas()} style={btnStyle(COLORS.info)}>🔄</button>
                    </div>
                    {screenshotMetas.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                        {screenshotMetas.slice(0, 12).map((ss, i) => {
                          const ts = ss.timestamp ? new Date(ss.timestamp).toLocaleString('fr-FR') : 'N/A';
                          return (
                            <div key={ss.roundId || i} style={{ background: 'rgba(59,130,246,0.06)', border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: 8, fontSize: 11 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#3b82f6', color: '#fff' }}>{ss.mode}</span>
                                <span style={{ color: COLORS.textMuted, fontSize: 9 }}>{ts}</span>
                              </div>
                              {ss.email && <div style={{ color: COLORS.textMuted, fontSize: 9 }}>👤 {ss.email}</div>}
                              {ss.issueCount > 0 && <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 10 }}>🚨 {ss.issueCount} incident(s)</div>}
                              <button
                                onClick={() => viewScreenshot(ss.roundId)}
                                disabled={screenshotLoading}
                                style={{ width: '100%', marginTop: 4, padding: '4px 0', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', opacity: screenshotLoading ? 0.5 : 1 }}
                              >
                                {screenshotLoading ? '...' : '📷 Voir'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: 12, color: COLORS.textMuted, textAlign: 'center', fontSize: 12 }}>
                        Aucun screenshot serveur. Les captures s'effectuent automatiquement lors des incidents de jeu.
                        <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                          Vérifiez dans la console du navigateur (F12) les messages [Screenshot] pour diagnostiquer.
                        </div>
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
            {activeTab === 'rounds' && (() => {
              const ssRoundIds = new Set(screenshotMetas.map(m => m.roundId));
              return (
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
                      const hasSS = ssRoundIds.has(r.id);
                      return (
                        <div key={r.id || i} style={{
                          ...cardStyle,
                          marginBottom: 8,
                          borderLeft: `4px solid ${hasIssue ? '#ef4444' : '#10b981'}`,
                          background: hasIssue ? 'rgba(239,68,68,0.05)' : COLORS.card,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: hasIssue ? '#ef4444' : '#10b981', color: '#fff' }}>
                                {r.mode}
                              </span>
                              <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{ts}</span>
                              {hasIssue && <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>🚨 {r.doublePairIssues} DOUBLE PAIRE(S)</span>}
                              {hasSS && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); viewScreenshot(r.id); }}
                                  disabled={screenshotLoading}
                                  title="Voir le screenshot de la carte"
                                  style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', opacity: screenshotLoading ? 0.5 : 1 }}
                                >
                                  {screenshotLoading ? '...' : '📷 Voir'}
                                </button>
                              )}
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
              {/* ── Server Screenshots Gallery ── */}
              {screenshotMetas.length > 0 && screenshotMetas[0]?.filename && (
                <div style={{ ...cardStyle, marginTop: 20, borderLeft: '4px solid #3b82f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold', color: '#3b82f6' }}>📷 Screenshots serveur ({screenshotMetas.length})</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => fetchScreenshotMetas()} style={btnStyle(COLORS.info)}>🔄</button>
                      <button onClick={async () => {
                        if (!window.confirm('Supprimer tous les screenshots serveur ?')) return;
                        try {
                          const token = getAuthToken();
                          const backendUrl = getBackendUrl();
                          await fetch(`${backendUrl}/api/monitoring/game-screenshots`, {
                            method: 'DELETE',
                            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                          });
                          setScreenshotMetas([]);
                        } catch {}
                      }} style={btnStyle('#dc2626')}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    {screenshotMetas.map((ss, i) => {
                      const ts = ss.timestamp ? new Date(ss.timestamp).toLocaleString('fr-FR') : 'N/A';
                      return (
                        <div key={ss.roundId || i} style={{ background: 'rgba(59,130,246,0.06)', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10, fontSize: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#3b82f6', color: '#fff' }}>{ss.mode}</span>
                            <span style={{ color: COLORS.textMuted, fontSize: 10 }}>{ts}</span>
                          </div>
                          {ss.email && <div style={{ color: COLORS.textMuted, fontSize: 10, marginBottom: 4 }}>👤 {ss.email}</div>}
                          {ss.issueCount > 0 && <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 11, marginBottom: 4 }}>🚨 {ss.issueCount} incident(s)</div>}
                          {Array.isArray(ss.issues) && ss.issues.length > 0 && (
                            <div style={{ marginBottom: 6 }}>
                              {ss.issues.slice(0, 3).map((iss, j) => (
                                <div key={j} style={{ fontSize: 10, color: '#f59e0b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  ⚠️ {typeof iss === 'string' ? iss : (iss.message || iss.type || JSON.stringify(iss)).substring(0, 60)}
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => viewScreenshot(ss.roundId)}
                            disabled={screenshotLoading}
                            style={{ width: '100%', padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', opacity: screenshotLoading ? 0.5 : 1 }}
                          >
                            {screenshotLoading ? '...' : '📷 Voir le screenshot'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
            );})()}


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

            {/* ====== PLAYERS TAB ====== */}
            {activeTab === 'players' && (
              <div>
                {/* Header */}
                <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 'bold' }}>👥 Joueurs & Utilisation</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { fetchOnlinePlayers(); fetchPaymentEvents(); fetchUsageStats(); }} style={btnStyle(COLORS.info)}>🔄 Rafraîchir</button>
                  </div>
                </div>

                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <KPICard title="En ligne" value={onlinePlayers.length} icon="🟢" color="#22c55e" highlight={false} />
                  <KPICard title="Utilisateurs" value={usageStats?.totalUsers || '—'} icon="👤" color="#3b82f6" />
                  <KPICard title="Abonnés actifs" value={usageStats?.activeSubscribers || '—'} icon="⭐" color="#f59e0b" />
                  <KPICard title="Enseignants" value={usageStats?.teachers || '—'} icon="🎓" color="#8b5cf6" />
                  <KPICard title="Paiements" value={paymentEvents.length} icon="💳" color="#06b6d4" />
                </div>

                {/* Sub-tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${COLORS.border}` }}>
                  {[
                    { id: 'online', label: `🟢 En ligne (${onlinePlayers.length})` },
                    { id: 'payments', label: `💳 Paiements (${paymentEvents.length})` },
                    { id: 'usage', label: '📈 Fréquence d\'utilisation' },
                  ].map(st => (
                    <button key={st.id} onClick={() => setPlayersSubTab(st.id)} style={{
                      padding: '8px 16px', border: 'none',
                      borderBottom: playersSubTab === st.id ? `2px solid ${COLORS.info}` : '2px solid transparent',
                      background: 'transparent', color: playersSubTab === st.id ? '#fff' : COLORS.textMuted,
                      cursor: 'pointer', fontWeight: playersSubTab === st.id ? 700 : 500, fontSize: 13,
                    }}>{st.label}</button>
                  ))}
                </div>

                {/* ── SUB-TAB: En ligne ── */}
                {playersSubTab === 'online' && (
                  <div>
                    {onlinePlayersError && (
                      <div style={{ ...cardStyle, marginBottom: 12, padding: '12px 16px', background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: 8, fontSize: 13 }}>
                        <strong>Erreur fetch joueurs:</strong> {onlinePlayersError}
                      </div>
                    )}
                    {onlinePlayers.length === 0 && !onlinePlayersError ? (
                      <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: COLORS.textMuted }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🌙</div>
                        <p>Aucun joueur en ligne actuellement.</p>
                        <p style={{ fontSize: 12 }}>Les joueurs connectés apparaîtront ici en temps réel (rafraîchissement auto toutes les 30s).</p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {onlinePlayers.map((p, i) => {
                          const modeColors = { solo: '#22c55e', arena: '#ef4444', training: '#8b5cf6', multiplayer: '#3b82f6', 'grande-salle': '#f59e0b', objectif: '#06b6d4', admin: '#64748b', monitoring: '#64748b', navigation: '#94a3b8', modes: '#94a3b8', account: '#94a3b8', pricing: '#94a3b8' };
                          const modeIcons = { solo: '👤', arena: '⚔️', training: '📚', multiplayer: '👥', 'grande-salle': '🏟️', objectif: '🎯', admin: '⚙️', monitoring: '📊', navigation: '🧭', modes: '🎮', account: '👤', pricing: '💰' };
                          const color = modeColors[p.mode] || '#94a3b8';
                          const icon = modeIcons[p.mode] || '🎮';
                          const isPlaying = ['solo', 'arena', 'training', 'multiplayer', 'grande-salle', 'objectif'].includes(p.mode);
                          return (
                            <div key={p.userId || i} style={{
                              ...cardStyle,
                              borderLeft: `4px solid ${color}`,
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '12px 16px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.idleSeconds < 15 ? '#22c55e' : p.idleSeconds < 60 ? '#f59e0b' : '#94a3b8' }} />
                                <div>
                                  <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>
                                    {p.pseudo || p.email?.split('@')[0] || 'Anonyme'}
                                  </div>
                                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                                    {p.email || p.userId?.substring(0, 8)}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{
                                  padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  background: isPlaying ? color : 'rgba(148,163,184,0.2)',
                                  color: isPlaying ? '#fff' : COLORS.textMuted,
                                }}>
                                  {icon} {p.mode || '—'}
                                </span>
                                <span style={{ fontSize: 11, color: COLORS.textMuted, minWidth: 60, textAlign: 'right' }}>
                                  {p.page || '/'}
                                </span>
                                <span style={{ fontSize: 11, color: p.idleSeconds < 15 ? '#22c55e' : COLORS.textMuted }}>
                                  {p.idleSeconds < 5 ? 'actif' : `${p.idleSeconds}s`}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── SUB-TAB: Paiements ── */}
                {playersSubTab === 'payments' && (
                  <div>
                    {paymentEvents.length === 0 ? (
                      <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: COLORS.textMuted }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>💳</div>
                        <p>Aucun événement de paiement enregistré.</p>
                        <p style={{ fontSize: 12 }}>Les tentatives de paiement Stripe et les webhooks RevenueCat apparaîtront ici.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {paymentEvents.map((evt, i) => {
                          const isSuccess = ['active', 'checkout.session.completed', 'initial_purchase', 'renewal'].some(k => (evt.status || evt.type || '').includes(k));
                          const isFail = ['past_due', 'expired', 'billing_issue', 'cancellation', 'failed'].some(k => (evt.status || evt.type || '').includes(k));
                          const borderColor = isSuccess ? '#22c55e' : isFail ? '#ef4444' : '#f59e0b';
                          const ts = evt.timestamp ? new Date(evt.timestamp).toLocaleString('fr-FR') : '';
                          return (
                            <div key={i} style={{
                              ...cardStyle, borderLeft: `4px solid ${borderColor}`, padding: '12px 16px',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                    background: evt.source === 'stripe' ? '#6772e5' : '#ff6b6b',
                                    color: '#fff',
                                  }}>
                                    {evt.source === 'stripe' ? '💳 Stripe' : '📱 RevenueCat'}
                                  </span>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                    background: isSuccess ? 'rgba(34,197,94,0.2)' : isFail ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                                    color: isSuccess ? '#22c55e' : isFail ? '#ef4444' : '#f59e0b',
                                  }}>
                                    {evt.type}
                                  </span>
                                </div>
                                <span style={{ fontSize: 12, color: COLORS.textMuted }}>{ts}</span>
                              </div>
                              <div style={{ fontSize: 12, color: COLORS.text }}>
                                {evt.userId && <span style={{ marginRight: 12 }}>👤 {evt.userId.substring(0, 12)}...</span>}
                                {evt.email && <span style={{ marginRight: 12 }}>📧 {evt.email}</span>}
                                {evt.status && <span style={{ marginRight: 12 }}>État: <strong>{evt.status}</strong></span>}
                                {evt.amount && <span style={{ marginRight: 12 }}>💰 {evt.amount} {(evt.currency || '').toUpperCase()}</span>}
                                {evt.entitlement && <span>🏷️ {evt.entitlement}</span>}
                              </div>
                              {evt.stripeCustomer && (
                                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>Customer: {evt.stripeCustomer}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── SUB-TAB: Fréquence d'utilisation ── */}
                {playersSubTab === 'usage' && (
                  <div>
                    {playersLoading ? (
                      <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted }}>Chargement des statistiques...</div>
                    ) : !usageStats || !usageStats.users ? (
                      <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: COLORS.textMuted }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
                        <p>Statistiques non disponibles.</p>
                        <p style={{ fontSize: 12 }}>Vérifiez que Supabase est configuré sur le backend.</p>
                      </div>
                    ) : (() => {
                      const users = usageStats.users || [];
                      const now = new Date();
                      const classify = (u) => {
                        if (!u.lastActive) return 'inactive';
                        const diff = (now - new Date(u.lastActive)) / (1000 * 60 * 60 * 24);
                        if (diff < 1) return 'today';
                        if (diff < 7) return 'week';
                        if (diff < 30) return 'month';
                        return 'inactive';
                      };
                      const today = users.filter(u => classify(u) === 'today');
                      const week = users.filter(u => classify(u) === 'week');
                      const month = users.filter(u => classify(u) === 'month');
                      const inactive = users.filter(u => classify(u) === 'inactive');

                      return (
                        <div>
                          {/* Frequency KPIs */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                            <KPICard title="Actif aujourd'hui" value={today.length} icon="🔥" color="#22c55e" />
                            <KPICard title="Cette semaine" value={week.length} icon="📅" color="#3b82f6" />
                            <KPICard title="Ce mois" value={month.length} icon="📆" color="#8b5cf6" />
                            <KPICard title="Inactifs (>30j)" value={inactive.length} icon="💤" color="#94a3b8" />
                          </div>

                          {/* Users table */}
                          <div style={cardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Détail par joueur ({users.length})</h4>
                            </div>
                            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted }}>
                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Joueur</th>
                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Email</th>
                                    <th style={{ textAlign: 'center', padding: '6px 8px' }}>Rôle</th>
                                    <th style={{ textAlign: 'center', padding: '6px 8px' }}>Abo</th>
                                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Dernière activité</th>
                                    <th style={{ textAlign: 'center', padding: '6px 8px' }}>Fréquence</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {users.map((u, i) => {
                                    const freq = classify(u);
                                    const freqColors = { today: '#22c55e', week: '#3b82f6', month: '#8b5cf6', inactive: '#64748b' };
                                    const freqLabels = { today: "Aujourd'hui", week: 'Cette semaine', month: 'Ce mois', inactive: 'Inactif' };
                                    const roleColors = { admin: '#ef4444', teacher: '#8b5cf6', user: '#94a3b8' };
                                    const subColor = ['active', 'trialing'].includes(u.subscription) ? '#22c55e' : '#64748b';
                                    const lastActive = u.lastActive ? new Date(u.lastActive).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                                    return (
                                      <tr key={u.id || i} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                                        <td style={{ padding: '8px', fontWeight: 600, color: '#fff' }}>
                                          {u.pseudo || '—'}
                                        </td>
                                        <td style={{ padding: '8px', color: COLORS.textMuted }}>
                                          {u.email ? u.email.substring(0, 30) : '—'}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                          <span style={{
                                            padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                            background: roleColors[u.role] || '#64748b', color: '#fff',
                                          }}>{u.role}</span>
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                          <span style={{
                                            padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                            background: `${subColor}22`, color: subColor,
                                          }}>{u.subscription || 'free'}</span>
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right', color: COLORS.textMuted, fontSize: 11 }}>
                                          {lastActive}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                          <span style={{
                                            padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                                            background: `${freqColors[freq]}22`, color: freqColors[freq],
                                          }}>{freqLabels[freq]}</span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ====== ARENA TAB ====== */}
            {activeTab === 'arena' && (
              <div>
                <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>🏟️ Statistiques Arena & Tournois</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={fetchArenaStats} style={btnStyle(COLORS.info)} disabled={arenaLoading}>
                      {arenaLoading ? '⏳ Chargement...' : '🔄 Rafraîchir'}
                    </button>
                    <button onClick={() => window.open('/tournament-real-test.html', '_blank')} style={btnStyle('#7c3aed')}>
                      🏆 Test Tournoi Réel
                    </button>
                  </div>
                </div>

                {!arenaStats ? (
                  <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: COLORS.textMuted }}>
                    {arenaLoading ? '⏳ Chargement des données Arena...' : 'Cliquez Rafraîchir pour charger les stats Arena'}
                  </div>
                ) : (
                  <>
                    {/* KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                      <KPICard title="Tournois" value={arenaStats.stats.totalTournaments} icon="🏆" color={COLORS.info} />
                      <KPICard title="Matchs total" value={arenaStats.stats.totalMatches} icon="⚔️" color="#fff" />
                      <KPICard title="Terminés" value={arenaStats.stats.matchesByStatus?.finished || 0} icon="✅" color={COLORS.success} />
                      <KPICard title="En cours" value={(arenaStats.stats.matchesByStatus?.in_progress || 0) + (arenaStats.stats.matchesByStatus?.playing || 0)} icon="▶️" color={COLORS.warn} />
                      <KPICard title="Paires trouvées" value={arenaStats.stats.totalPairsFound} icon="🎯" color="#a78bfa" />
                      <KPICard title="Erreurs" value={arenaStats.stats.totalErrors} icon="❌" color={COLORS.error} highlight={arenaStats.stats.totalErrors > 0} />
                      <KPICard title="Matchs live" value={arenaStats.stats.liveMatchesCount} icon="📡" color="#f472b6" highlight={arenaStats.stats.liveMatchesCount > 0} />
                    </div>

                    {/* Live matches */}
                    {arenaStats.liveMatches.length > 0 && (
                      <div style={{ ...cardStyle, marginBottom: 16 }}>
                        <h4 style={cardTitleStyle}>📡 Matchs en direct ({arenaStats.liveMatches.length})</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                          {arenaStats.liveMatches.map(lm => (
                            <div key={lm.matchId} style={{ background: '#0f172a', borderRadius: 8, padding: 12, border: `1px solid ${lm.status === 'playing' ? COLORS.success : COLORS.border}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: 'monospace' }}>{lm.matchId.slice(0, 20)}...</span>
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: lm.status === 'playing' ? COLORS.success : lm.status === 'waiting' ? COLORS.warn : COLORS.border, color: '#fff', fontWeight: 600 }}>{lm.status}</span>
                              </div>
                              {lm.players.map(p => (
                                <div key={p.studentId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                                  <span>{p.connected ? '🟢' : '🔴'} {p.name}</span>
                                  <span style={{ fontWeight: 600 }}>{p.score} pts</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tournaments */}
                    {arenaStats.tournaments.length > 0 && (
                      <div style={{ ...cardStyle, marginBottom: 16 }}>
                        <h4 style={cardTitleStyle}>🏆 Tournois récents ({arenaStats.tournaments.length})</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                              <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Nom</th>
                              <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Statut</th>
                              <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Créé le</th>
                            </tr>
                          </thead>
                          <tbody>
                            {arenaStats.tournaments.map(t => (
                              <tr key={t.id} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                                <td style={{ padding: '6px 8px' }}>{t.name || t.id.slice(0, 20)}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: t.status === 'active' ? COLORS.success : t.status === 'finished' ? '#6366f1' : COLORS.border, color: '#fff' }}>{t.status}</span>
                                </td>
                                <td style={{ padding: '6px 8px', color: COLORS.textMuted }}>{formatDateTime(t.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Matches */}
                    <div style={{ ...cardStyle, marginBottom: 16 }}>
                      <h4 style={cardTitleStyle}>⚔️ Matchs récents ({arenaStats.matches.length})</h4>
                      {arenaStats.matches.length === 0 ? (
                        <p style={{ color: COLORS.textMuted, textAlign: 'center' }}>Aucun match Arena trouvé sur les 7 derniers jours</p>
                      ) : (
                        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead style={{ position: 'sticky', top: 0, background: COLORS.card }}>
                              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Match</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Statut</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Room</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Créé</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Démarré</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Terminé</th>
                              </tr>
                            </thead>
                            <tbody>
                              {arenaStats.matches.map(m => {
                                const statusColors = { pending: COLORS.textMuted, in_progress: COLORS.warn, playing: COLORS.warn, finished: COLORS.success, deleted: COLORS.error, tie: '#f59e0b' };
                                return (
                                  <tr key={m.id} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                                    <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 11 }}>{m.id.slice(0, 18)}...</td>
                                    <td style={{ padding: '5px 8px' }}>
                                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: statusColors[m.status] || COLORS.border, color: '#fff' }}>{m.status}</span>
                                    </td>
                                    <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{m.room_code}</td>
                                    <td style={{ padding: '5px 8px', color: COLORS.textMuted }}>{formatDateTime(m.created_at)}</td>
                                    <td style={{ padding: '5px 8px', color: COLORS.textMuted }}>{m.started_at ? formatDateTime(m.started_at) : '—'}</td>
                                    <td style={{ padding: '5px 8px', color: COLORS.textMuted }}>{m.finished_at ? formatDateTime(m.finished_at) : '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Results */}
                    {arenaStats.results.length > 0 && (
                      <div style={{ ...cardStyle }}>
                        <h4 style={cardTitleStyle}>🏅 Résultats joueurs ({arenaStats.results.length})</h4>
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead style={{ position: 'sticky', top: 0, background: COLORS.card }}>
                              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Match</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted }}>Joueur</th>
                                <th style={{ textAlign: 'center', padding: '6px 8px', color: COLORS.textMuted }}>Pos</th>
                                <th style={{ textAlign: 'center', padding: '6px 8px', color: COLORS.textMuted }}>Score</th>
                                <th style={{ textAlign: 'center', padding: '6px 8px', color: COLORS.textMuted }}>Paires</th>
                                <th style={{ textAlign: 'center', padding: '6px 8px', color: COLORS.textMuted }}>Erreurs</th>
                                <th style={{ textAlign: 'center', padding: '6px 8px', color: COLORS.textMuted }}>Temps</th>
                              </tr>
                            </thead>
                            <tbody>
                              {arenaStats.results.map(r => (
                                <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                                  <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: 10 }}>{r.match_id.slice(0, 14)}...</td>
                                  <td style={{ padding: '4px 8px' }}>{r.student_id}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: r.position === 1 ? '#fbbf24' : r.position === 2 ? '#94a3b8' : r.position === 3 ? '#cd7f32' : COLORS.textMuted }}>
                                    {r.position === 1 ? '🥇' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : `#${r.position}`}
                                  </td>
                                  <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 700 }}>{r.score}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'center' }}>{r.pairs_found || 0}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'center', color: r.errors > 0 ? COLORS.error : COLORS.textMuted }}>{r.errors || 0}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'center', color: COLORS.textMuted }}>{r.time_ms ? `${(r.time_ms / 1000).toFixed(1)}s` : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

          </>
        )}

        {/* 📷 Screenshot Lightbox */}
        {screenshotViewImg && (
          <div onClick={() => setScreenshotViewImg(null)} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, cursor: 'zoom-out', padding: 20, flexDirection: 'column', gap: 16,
          }}>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>📷 Screenshot de la carte — cliquez pour fermer</div>
            <img src={screenshotViewImg} alt="Screenshot carte" style={{ maxWidth: '95vw', maxHeight: '85vh', borderRadius: 8, boxShadow: '0 4px 30px rgba(0,0,0,0.5)' }} />
          </div>
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
