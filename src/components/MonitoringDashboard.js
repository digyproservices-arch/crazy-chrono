// ==========================================
// MONITORING DASHBOARD - Dashboard visuel de monitoring
// Graphiques temporels, sélecteur date/heure, indicateurs d'erreurs
// ==========================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../utils/apiHelpers';
import { io } from 'socket.io-client';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Area, AreaChart
} from 'recharts';

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

const LEVEL_COLORS = {
  info: '#1AACBE',
  warn: '#f59e0b',
  error: '#ef4444',
};

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3j', hours: 72 },
  { label: '7j', hours: 168 },
];

function MonitoringDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedRange, setSelectedRange] = useState(24);
  const [levelFilter, setLevelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeTab, setActiveTab] = useState('report'); // report | overview | logs | errors | performance
  const [copyFeedback, setCopyFeedback] = useState(null); // 'logs' | 'errors' | null
  const [perfEvents, setPerfEvents] = useState([]);
  const [perfConnected, setPerfConnected] = useState(false);
  const perfSocketRef = useRef(null);
  const perfBottomRef = useRef(null);
  const [perfAutoScroll, setPerfAutoScroll] = useState(true);
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('all');
  const [rumEvents, setRumEvents] = useState([]);

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

  const formatLogsForCopy = (logsArr) => {
    return logsArr.map(log => {
      const ts = log.timestamp || '';
      const lvl = (log.level || 'info').toUpperCase();
      const msg = log.message || '';
      const meta = log.meta && Object.keys(log.meta).length > 0 ? ' ' + JSON.stringify(log.meta) : '';
      return `${ts} [${lvl}] ${msg}${meta}`;
    }).join('\n');
  };

  const fetchIncidents = useCallback(async () => {
    try {
      setIncidentsLoading(true);
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      const sevParam = incidentSeverityFilter !== 'all' ? `&severity=${incidentSeverityFilter}` : '';
      const res = await fetch(`${backendUrl}/api/monitoring/incidents?limit=200${sevParam}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) setIncidents(data.incidents || []);
    } catch (err) {
      console.error('[Monitoring] Error fetching incidents:', err);
      // Fallback: load from localStorage
      try {
        const local = JSON.parse(localStorage.getItem('cc_game_incidents') || '[]');
        setIncidents(local);
      } catch {}
    } finally {
      setIncidentsLoading(false);
    }
  }, [incidentSeverityFilter]);

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
    try {
      const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      return auth.token;
    } catch { return null; }
  };

  const fetchStats = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) return;
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/admin/logs/stats?hours=${selectedRange}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.ok) {
        setStats(data);
        setLastRefresh(new Date());
      }
    } catch (err) {
      console.error('[Monitoring] Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedRange]);

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const token = getAuthToken();
      if (!token) return;
      const backendUrl = getBackendUrl();
      const levelParam = levelFilter !== 'all' ? `&level=${levelFilter}` : '';
      const response = await fetch(
        `${backendUrl}/api/admin/logs/json?hours=${selectedRange}&limit=500${levelParam}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.ok) setLogs(data.logs || []);
    } catch (err) {
      console.error('[Monitoring] Error fetching logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [selectedRange, levelFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Socket.IO connection for real-time performance monitoring
  useEffect(() => {
    if (activeTab !== 'performance' && activeTab !== 'rum') return;
    const base = getBackendUrl();
    const s = io(base, { transports: ['websocket'], withCredentials: false });
    perfSocketRef.current = s;
    s.on('connect', () => {
      setPerfConnected(true);
      s.emit('monitoring:join');
    });
    s.on('disconnect', () => setPerfConnected(false));
    s.on('monitoring:perf', (event) => {
      setPerfEvents(prev => [...prev.slice(-499), event]);
      if (event && event.type === 'rum:layout') {
        setRumEvents(prev => [...prev.slice(-199), { ...event, _receivedAt: new Date().toISOString() }]);
      }
    });
    return () => { s.disconnect(); perfSocketRef.current = null; };
  }, [activeTab]);

  // Auto-scroll performance log
  useEffect(() => {
    if (perfAutoScroll && perfBottomRef.current) {
      perfBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [perfEvents, perfAutoScroll]);

  useEffect(() => {
    if (activeTab === 'logs' || activeTab === 'errors' || activeTab === 'report') {
      fetchLogs();
    }
    if (activeTab === 'incidents' || activeTab === 'report') {
      fetchIncidents();
    }
  }, [activeTab, fetchLogs, fetchIncidents]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats();
      if (activeTab === 'logs' || activeTab === 'errors') fetchLogs();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats, fetchLogs, activeTab]);

  const formatTime = (isoStr) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const formatDateTime = (isoStr) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch { return ''; }
  };

  const formatChartTime = (isoStr) => {
    try {
      const d = new Date(isoStr);
      if (selectedRange <= 24) {
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
        d.toLocaleTimeString('fr-FR', { hour: '2-digit' }) + 'h';
    } catch { return ''; }
  };

  const filteredLogs = logs.filter(log => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (log.message || '').toLowerCase().includes(q) ||
        JSON.stringify(log.meta || {}).toLowerCase().includes(q);
    }
    return true;
  });

  const errorLogs = logs.filter(l => l.level === 'error');

  const totalErrors = stats?.levelCounts?.error || 0;
  const totalWarns = stats?.levelCounts?.warn || 0;
  const totalInfo = stats?.levelCounts?.info || 0;
  const totalLogs = stats?.totalLogs || 0;

  const pieData = stats ? [
    { name: 'Info', value: totalInfo, color: LEVEL_COLORS.info },
    { name: 'Warn', value: totalWarns, color: LEVEL_COLORS.warn },
    { name: 'Error', value: totalErrors, color: LEVEL_COLORS.error },
  ].filter(d => d.value > 0) : [];

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
              onClick={() => { fetchStats(); if (activeTab !== 'overview') fetchLogs(); }}
              style={btnStyle(COLORS.info)}
            >
              🔄 Rafraîchir
            </button>
            <button onClick={() => navigate('/admin/dashboard')} style={btnStyle('#334155')}>
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Time Range Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: COLORS.textMuted, marginRight: 8 }}>Période :</span>
          {TIME_RANGES.map(r => (
            <button
              key={r.hours}
              onClick={() => { setSelectedRange(r.hours); setLoading(true); }}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: selectedRange === r.hours ? `2px solid ${COLORS.info}` : `1px solid ${COLORS.border}`,
                background: selectedRange === r.hours ? 'rgba(59,130,246,0.2)' : COLORS.card,
                color: selectedRange === r.hours ? COLORS.info : COLORS.textMuted,
                cursor: 'pointer',
                fontWeight: selectedRange === r.hours ? 700 : 500,
                fontSize: 14,
                transition: 'all 0.2s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '20px', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 0 }}>
          {[
            { id: 'report', label: '📊 Rapport complet', icon: '' },
            { id: 'overview', label: '📈 Vue d\'ensemble', icon: '' },
            { id: 'logs', label: '📋 Logs détaillés', icon: '' },
            { id: 'errors', label: `🔴 Erreurs (${totalErrors})`, icon: '' },
            { id: 'incidents', label: `⚠️ Incidents (${incidents.length})`, icon: '' },
            { id: 'performance', label: `🎯 Performance${perfConnected ? ' 🟢' : ''}`, icon: '' },
            { id: 'rum', label: `📱 RUM (${rumEvents.length})`, icon: '' },
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
                sections.push(`Date: ${now} | Période: ${selectedRange}h`);
                sections.push('');

                // KPIs
                sections.push(`--- KPIs ---`);
                sections.push(`Total logs: ${totalLogs} | Info: ${totalInfo} | Warn: ${totalWarns} | Erreurs: ${totalErrors}`);
                sections.push(`Incidents: ${incidents.length} | Perf events: ${perfEvents.length} | RUM snapshots: ${rumEvents.length}`);
                sections.push('');

                // Recent errors (max 20)
                const recentErrors = logs.filter(l => l.level === 'error').slice(0, 20);
                sections.push(`--- ERREURS (${recentErrors.length} dernières) ---`);
                if (recentErrors.length === 0) {
                  sections.push('Aucune erreur.');
                } else {
                  recentErrors.forEach(log => {
                    const ts = log.timestamp || '';
                    const msg = log.message || '';
                    const meta = log.meta && Object.keys(log.meta).length > 0 ? ' ' + JSON.stringify(log.meta) : '';
                    sections.push(`${ts} [ERROR] ${msg}${meta}`);
                  });
                }
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

                // All logs (max 100)
                const allLogs = logs.slice(0, 100);
                sections.push(`--- LOGS DÉTAILLÉS (${allLogs.length}/${logs.length} derniers) ---`);
                allLogs.forEach(log => {
                  const ts = log.timestamp || '';
                  const lvl = (log.level || 'info').toUpperCase();
                  const msg = log.message || '';
                  const meta = log.meta && Object.keys(log.meta).length > 0 ? ' ' + JSON.stringify(log.meta) : '';
                  sections.push(`${ts} [${lvl}] ${msg}${meta}`);
                });
                sections.push('');

                // Performance events (max 50)
                if (perfEvents.length > 0) {
                  const perfSlice = perfEvents.slice(-50);
                  sections.push(`--- PERFORMANCE (${perfSlice.length} derniers events) ---`);
                  perfSlice.forEach(evt => {
                    const ts = evt.ts ? new Date(evt.ts).toLocaleTimeString('fr-FR') : '';
                    const src = evt.source === 'client' ? 'CLIENT' : 'SERVER';
                    sections.push(`${ts} [${src}] ${evt.type || '?'} ${JSON.stringify(evt)}`);
                  });
                  sections.push('');
                }

                // RUM (max 10)
                if (rumEvents.length > 0) {
                  const rumSlice = rumEvents.slice(-10);
                  sections.push(`--- RUM LAYOUT (${rumSlice.length} derniers snapshots) ---`);
                  rumSlice.forEach(evt => {
                    const ts = evt.ts ? new Date(evt.ts).toLocaleTimeString('fr-FR') : '';
                    const device = evt.mobile ? 'MOBILE' : 'DESKTOP';
                    const vp = evt.viewport ? `${evt.viewport.w}x${evt.viewport.h}@${evt.viewport.dpr}x` : '?';
                    const anomalies = evt.anomalies && evt.anomalies.length > 0 ? ` ANOMALIES: ${evt.anomalies.join(', ')}` : '';
                    sections.push(`${ts} [${device}] viewport=${vp}${anomalies}`);
                  });
                  sections.push('');
                }

                sections.push(`===== FIN DU RAPPORT =====`);
                return sections.join('\n');
              };

              const reportText = buildFullReport();
              const recentErrors = logs.filter(l => l.level === 'error').slice(0, 20);

              return (
                <div>
                  {/* Action bar */}
                  <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>📊 Rapport complet — 1 clic pour tout copier</h3>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { fetchStats(); fetchLogs(); fetchIncidents(); }}
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                    <KPICard title="Total Logs" value={totalLogs} icon="📊" color={COLORS.info} />
                    <KPICard title="Erreurs" value={totalErrors} icon="🔴" color={COLORS.error} highlight={totalErrors > 0} />
                    <KPICard title="Warnings" value={totalWarns} icon="⚠️" color={COLORS.warn} />
                    <KPICard title="Incidents" value={incidents.length} icon="🚨" color={COLORS.accent} highlight={incidents.length > 0} />
                    <KPICard title="Perf Events" value={perfEvents.length} icon="🎯" color={COLORS.success} />
                    <KPICard title="RUM" value={rumEvents.length} icon="📱" color="#8b5cf6" />
                  </div>

                  {/* Errors section */}
                  <div style={{ ...cardStyle, marginBottom: 16, borderLeft: recentErrors.length > 0 ? `4px solid ${COLORS.error}` : undefined }}>
                    <h3 style={{ ...cardTitleStyle, color: recentErrors.length > 0 ? COLORS.error : COLORS.success }}>
                      {recentErrors.length > 0 ? `🔴 ${recentErrors.length} erreurs récentes` : '✅ Aucune erreur'}
                    </h3>
                    {recentErrors.length > 0 && (
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {recentErrors.map((log, i) => (
                          <div key={i} style={{ padding: '6px 10px', borderLeft: `3px solid ${COLORS.error}`, background: 'rgba(239,68,68,0.05)', marginBottom: 4, borderRadius: '0 6px 6px 0', fontSize: 12 }}>
                            <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{formatDateTime(log.timestamp)} </span>
                            <span style={{ color: COLORS.text }}>{log.message}</span>
                          </div>
                        ))}
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

                  {/* Logs preview */}
                  <div style={{ ...cardStyle, marginBottom: 16 }}>
                    <h3 style={cardTitleStyle}>📋 Derniers logs ({Math.min(logs.length, 30)} affichés / {logs.length} total)</h3>
                    {logsLoading ? (
                      <div style={{ textAlign: 'center', padding: 20, color: COLORS.textMuted }}>Chargement...</div>
                    ) : (
                      <div style={{ maxHeight: 300, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
                        {logs.slice(0, 30).map((log, i) => {
                          const lvlColor = LEVEL_COLORS[log.level] || COLORS.info;
                          return (
                            <div key={i} style={{ padding: '3px 8px', borderLeft: `3px solid ${lvlColor}`, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', marginBottom: 1 }}>
                              <span style={{ color: COLORS.textMuted }}>{formatDateTime(log.timestamp)} </span>
                              <span style={{ color: lvlColor, fontWeight: 700 }}>[{(log.level || 'info').toUpperCase()}] </span>
                              <span style={{ color: COLORS.text }}>{log.message}</span>
                              {log.meta && Object.keys(log.meta).length > 0 && (
                                <span style={{ color: COLORS.textMuted }}> {JSON.stringify(log.meta).substring(0, 100)}</span>
                              )}
                            </div>
                          );
                        })}
                        {logs.length === 0 && (
                          <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted }}>Aucun log sur cette période</div>
                        )}
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

            {/* ====== OVERVIEW TAB ====== */}
            {activeTab === 'overview' && (
              <>
                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                  <KPICard title="Total Logs" value={totalLogs} icon="📊" color={COLORS.info} />
                  <KPICard title="Infos" value={totalInfo} icon="ℹ️" color={COLORS.info} />
                  <KPICard title="Avertissements" value={totalWarns} icon="⚠️" color={COLORS.warn} />
                  <KPICard title="Erreurs" value={totalErrors} icon="🔴" color={COLORS.error}
                    highlight={totalErrors > 0} />
                </div>

                {/* Charts Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 24 }}>
                  {/* Timeline Bar Chart */}
                  <div style={cardStyle}>
                    <h3 style={cardTitleStyle}>📊 Volume de logs par heure</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={stats?.timeline || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="time"
                          tickFormatter={formatChartTime}
                          stroke={COLORS.textMuted}
                          fontSize={11}
                          interval="preserveStartEnd"
                        />
                        <YAxis stroke={COLORS.textMuted} fontSize={12} />
                        <Tooltip
                          contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }}
                          labelFormatter={(v) => formatChartTime(v)}
                        />
                        <Legend />
                        <Bar dataKey="info" name="Info" fill={LEVEL_COLORS.info} stackId="a" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="warn" name="Warn" fill={LEVEL_COLORS.warn} stackId="a" />
                        <Bar dataKey="error" name="Error" fill={LEVEL_COLORS.error} stackId="a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Pie Chart - Level Distribution */}
                  <div style={cardStyle}>
                    <h3 style={cardTitleStyle}>🎯 Répartition par niveau</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%" cy="50%"
                          innerRadius={55} outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Error Trend Line Chart */}
                <div style={{ ...cardStyle, marginBottom: 24 }}>
                  <h3 style={cardTitleStyle}>📈 Tendance des erreurs</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={stats?.timeline || []}>
                      <defs>
                        <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.error} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.error} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="warnGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.warn} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.warn} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="time" tickFormatter={formatChartTime} stroke={COLORS.textMuted} fontSize={11} interval="preserveStartEnd" />
                      <YAxis stroke={COLORS.textMuted} fontSize={12} />
                      <Tooltip
                        contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }}
                        labelFormatter={formatChartTime}
                      />
                      <Area type="monotone" dataKey="error" name="Erreurs" stroke={COLORS.error} fill="url(#errorGrad)" strokeWidth={2} />
                      <Area type="monotone" dataKey="warn" name="Avertissements" stroke={COLORS.warn} fill="url(#warnGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Bottom Row: Modules + Recent Errors */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* Top Modules */}
                  <div style={cardStyle}>
                    <h3 style={cardTitleStyle}>🧩 Top Modules</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(stats?.modules || []).map((mod, i) => {
                        const maxCount = stats?.modules?.[0]?.count || 1;
                        const pct = (mod.count / maxCount) * 100;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: COLORS.textMuted, minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {mod.name}
                            </span>
                            <div style={{ flex: 1, height: 8, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: COLORS.accent, borderRadius: 4, transition: 'width 0.5s' }} />
                            </div>
                            <span style={{ fontSize: 12, color: COLORS.text, minWidth: 40, textAlign: 'right' }}>
                              {mod.count}
                            </span>
                          </div>
                        );
                      })}
                      {(!stats?.modules || stats.modules.length === 0) && (
                        <div style={{ fontSize: 13, color: COLORS.textMuted, padding: 16, textAlign: 'center' }}>Aucun module détecté</div>
                      )}
                    </div>
                  </div>

                  {/* Recent Errors */}
                  <div style={cardStyle}>
                    <h3 style={{ ...cardTitleStyle, color: COLORS.error }}>🔴 Erreurs récentes</h3>
                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                      {(stats?.recentErrors || []).length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: COLORS.success }}>
                          ✅ Aucune erreur détectée
                        </div>
                      ) : (
                        (stats?.recentErrors || []).map((err, i) => (
                          <div key={i} style={{
                            padding: '8px 12px',
                            borderLeft: `3px solid ${COLORS.error}`,
                            background: 'rgba(239,68,68,0.05)',
                            marginBottom: 6,
                            borderRadius: '0 6px 6px 0',
                            fontSize: 12,
                          }}>
                            <div style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 2 }}>
                              {formatDateTime(err.timestamp)}
                            </div>
                            <div style={{ color: COLORS.text, wordBreak: 'break-word' }}>
                              {err.message}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ====== LOGS TAB ====== */}
            {activeTab === 'logs' && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="🔍 Rechercher dans les logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      flex: 1, minWidth: 200, padding: '10px 14px',
                      background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, color: COLORS.text, fontSize: 14, outline: 'none',
                    }}
                  />
                  <select
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                    style={{
                      padding: '10px 14px', background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`, borderRadius: 8,
                      color: COLORS.text, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    <option value="all">Tous les niveaux</option>
                    <option value="info">ℹ️ Info</option>
                    <option value="warn">⚠️ Warn</option>
                    <option value="error">🔴 Error</option>
                  </select>
                  <span style={{ fontSize: 13, color: COLORS.textMuted }}>
                    {filteredLogs.length} résultat{filteredLogs.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => copyToClipboard(formatLogsForCopy(filteredLogs), 'logs')}
                    style={{
                      padding: '8px 16px',
                      background: copyFeedback === 'logs' ? '#148A9C' : '#1AACBE',
                      border: 'none',
                      borderRadius: 8,
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 13,
                      transition: 'all 0.3s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copyFeedback === 'logs' ? '✅ Copié !' : '📋 Copier les logs'}
                  </button>
                </div>

                {logsLoading ? (
                  <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted }}>Chargement des logs...</div>
                ) : (
                  <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${COLORS.border}`, position: 'sticky', top: 0, background: COLORS.card, zIndex: 1 }}>
                          <th style={thStyle}>Heure</th>
                          <th style={{ ...thStyle, width: 70 }}>Niveau</th>
                          <th style={thStyle}>Message</th>
                          <th style={thStyle}>Détails</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogs.map((log, i) => (
                          <tr key={log.id || i} style={{
                            borderBottom: `1px solid ${COLORS.border}`,
                            background: log.level === 'error' ? 'rgba(239,68,68,0.06)' :
                              log.level === 'warn' ? 'rgba(245,158,11,0.04)' : 'transparent',
                          }}>
                            <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 12, color: COLORS.textMuted }}>
                              {formatDateTime(log.timestamp)}
                            </td>
                            <td style={tdStyle}>
                              <span style={{
                                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                background: LEVEL_COLORS[log.level] || COLORS.info,
                                color: '#fff',
                              }}>
                                {(log.level || 'info').toUpperCase()}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-word' }}>
                              {log.message}
                            </td>
                            <td style={{ ...tdStyle, fontSize: 11, color: COLORS.textMuted, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {log.meta && Object.keys(log.meta).length > 0
                                ? JSON.stringify(log.meta).substring(0, 120)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                        {filteredLogs.length === 0 && (
                          <tr>
                            <td colSpan={4} style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>
                              Aucun log trouvé pour cette période / ce filtre
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ====== PERFORMANCE TAB ====== */}
            {activeTab === 'performance' && (
              <div>
                {/* Status Bar */}
                <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: perfConnected ? '#22c55e' : '#ef4444',
                      boxShadow: perfConnected ? '0 0 8px #22c55e' : '0 0 8px #ef4444',
                    }} />
                    <span style={{ fontSize: 14, color: perfConnected ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                      {perfConnected ? 'Connecté au monitoring temps réel' : 'Déconnecté'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.textMuted, cursor: 'pointer' }}>
                      <input type="checkbox" checked={perfAutoScroll} onChange={e => setPerfAutoScroll(e.target.checked)} style={{ accentColor: COLORS.success }} />
                      Auto-scroll
                    </label>
                    <button onClick={() => setPerfEvents([])} style={btnStyle('#334155')}>
                      🗑️ Vider
                    </button>
                    <button
                      onClick={() => copyToClipboard(perfEvents.map(e => `${e.ts} [${e.type}] ${e.source === 'client' ? '📱' : '🖥️'} ${JSON.stringify(e)}`).join('\n'), 'perf')}
                      style={btnStyle(COLORS.info)}
                    >
                      {copyFeedback === 'perf' ? '✅ Copié !' : '📋 Copier'}
                    </button>
                  </div>
                </div>

                {/* Event Legend */}
                <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                  <span style={{ color: COLORS.textMuted }}>Légende :</span>
                  <span><b style={{ color: '#22c55e' }}>●</b> save:success</span>
                  <span><b style={{ color: '#ef4444' }}>●</b> save:error / save:skipped</span>
                  <span><b style={{ color: '#3b82f6' }}>●</b> mp:identify / joinRoom</span>
                  <span><b style={{ color: '#f59e0b' }}>●</b> endSession</span>
                  <span><b style={{ color: '#a855f7' }}>●</b> client events</span>
                  <span><b style={{ color: '#14b8a6' }}>●</b> rum:layout</span>
                </div>

                {/* Live Event Stream */}
                <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 20px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>📡 Flux temps réel ({perfEvents.length} events)</h3>
                  </div>
                  <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '8px 0', fontFamily: 'monospace', fontSize: 12 }}>
                    {perfEvents.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>
                        En attente d'événements... Jouez une partie pour voir les logs ici.
                      </div>
                    ) : perfEvents.map((evt, i) => {
                      const color = getPerfEventColor(evt.type);
                      const icon = evt.source === 'client' ? '📱' : '🖥️';
                      return (
                        <div key={i} style={{
                          padding: '6px 16px',
                          borderLeft: `3px solid ${color}`,
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                          display: 'flex', gap: 10, alignItems: 'flex-start',
                        }}>
                          <span style={{ color: COLORS.textMuted, whiteSpace: 'nowrap', minWidth: 75 }}>
                            {evt.ts ? new Date(evt.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                          </span>
                          <span style={{ fontSize: 14 }}>{icon}</span>
                          <span style={{ color, fontWeight: 700, minWidth: 140 }}>{evt.type}</span>
                          <span style={{ color: COLORS.text, wordBreak: 'break-word', flex: 1 }}>
                            {formatPerfEventData(evt)}
                          </span>
                        </div>
                      );
                    })}
                    <div ref={perfBottomRef} />
                  </div>
                </div>
              </div>
            )}

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

            {/* ====== RUM TAB ====== */}
            {activeTab === 'rum' && (
              <div>
                {/* RUM Status Bar */}
                <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: perfConnected ? '#22c55e' : '#ef4444',
                      boxShadow: perfConnected ? '0 0 8px #22c55e' : '0 0 8px #ef4444',
                    }} />
                    <span style={{ fontSize: 14, color: perfConnected ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                      {perfConnected ? 'RUM connecté — en attente d\'événements' : 'Déconnecté — activez l\'onglet pour recevoir les données'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setRumEvents([])} style={btnStyle('#334155')}>🗑️ Vider</button>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(rumEvents, null, 2), 'rum')}
                      style={btnStyle(COLORS.info)}
                    >
                      {copyFeedback === 'rum' ? '✅ Copié !' : '📋 Copier JSON'}
                    </button>
                  </div>
                </div>

                {/* RUM KPI Cards */}
                {(() => {
                  const total = rumEvents.length;
                  const withAnomalies = rumEvents.filter(e => e.hasAnomalies).length;
                  const mobileEvents = rumEvents.filter(e => e.mobile).length;
                  const desktopEvents = total - mobileEvents;
                  const lastEvt = total > 0 ? rumEvents[total - 1] : null;
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                      <KPICard title="Snapshots RUM" value={total} icon="📸" color={COLORS.info} />
                      <KPICard title="Mobile" value={mobileEvents} icon="📱" color="#8b5cf6" />
                      <KPICard title="Desktop" value={desktopEvents} icon="🖥️" color="#3b82f6" />
                      <KPICard title="Anomalies" value={withAnomalies} icon="🚨" color={COLORS.error} highlight={withAnomalies > 0} />
                      {lastEvt && lastEvt.viewport && (
                        <KPICard title="Dernier viewport" value={`${lastEvt.viewport.w}×${lastEvt.viewport.h}`} icon="📐" color={COLORS.success} />
                      )}
                    </div>
                  );
                })()}

                {/* Anomaly Summary */}
                {(() => {
                  const allAnomalies = {};
                  rumEvents.forEach(e => {
                    if (e.anomalies && e.anomalies.length > 0) {
                      e.anomalies.forEach(a => { allAnomalies[a] = (allAnomalies[a] || 0) + 1; });
                    }
                  });
                  const anomalyKeys = Object.keys(allAnomalies);
                  if (anomalyKeys.length === 0) return null;
                  const anomalyDescriptions = {
                    'carte-collapsed': 'Carte effondrée (< 50px) → page blanche',
                    'carte-overflow': 'Carte dépasse le viewport',
                    'carte-offscreen': 'Carte hors écran',
                    'carte-clipped-top': 'Carte masquée en haut',
                    'carte-behind-hud': 'Carte cachée sous le HUD mobile',
                    'mobile-hud-missing': 'HUD mobile absent',
                    'svg-overlay-collapsed': 'SVG overlay effondré',
                  };
                  return (
                    <div style={{ ...cardStyle, marginBottom: 16, borderLeft: `4px solid ${COLORS.error}` }}>
                      <h3 style={{ ...cardTitleStyle, color: COLORS.error }}>🚨 Anomalies détectées</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {anomalyKeys.sort((a, b) => allAnomalies[b] - allAnomalies[a]).map(key => (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                            <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: 13, fontWeight: 700, background: COLORS.error, color: '#fff', minWidth: 32, textAlign: 'center' }}>
                              {allAnomalies[key]}×
                            </span>
                            <span style={{ fontWeight: 700, color: '#fff', minWidth: 180 }}>{key}</span>
                            <span style={{ fontSize: 13, color: COLORS.textMuted }}>{anomalyDescriptions[key] || ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* RUM Snapshots List */}
                <div style={cardStyle}>
                  <h3 style={cardTitleStyle}>📸 Snapshots layout ({rumEvents.length})</h3>
                  {rumEvents.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
                      <div style={{ fontSize: 16, color: COLORS.textMuted }}>Aucun snapshot RUM reçu</div>
                      <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 8 }}>
                        Lancez une partie sur mobile ou desktop pour voir les mesures de layout ici en temps réel.
                      </div>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                      {[...rumEvents].reverse().map((evt, i) => {
                        const hasAnomaly = evt.hasAnomalies;
                        const borderColor = hasAnomaly ? COLORS.error : evt.mobile ? '#8b5cf6' : '#3b82f6';
                        return (
                          <div key={i} style={{
                            padding: '12px 16px',
                            borderLeft: `4px solid ${borderColor}`,
                            background: hasAnomaly ? 'rgba(239,68,68,0.06)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'),
                            marginBottom: 6,
                            borderRadius: '0 8px 8px 0',
                          }}>
                            {/* Header row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 16 }}>{evt.mobile ? '📱' : '🖥️'}</span>
                                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: borderColor, color: '#fff' }}>
                                  {evt.mobile ? 'MOBILE' : 'DESKTOP'}
                                </span>
                                {hasAnomaly && (
                                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: COLORS.error, color: '#fff', animation: 'pulse 2s infinite' }}>
                                    🚨 ANOMALIE
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                                {evt.ts ? new Date(evt.ts).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                              </span>
                            </div>

                            {/* Measurements grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, fontSize: 12 }}>
                              {/* Viewport */}
                              {evt.viewport && (
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 6 }}>
                                  <div style={{ color: COLORS.textMuted, fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>Viewport</div>
                                  <div style={{ color: '#fff', fontWeight: 600, fontFamily: 'monospace' }}>
                                    {evt.viewport.w} × {evt.viewport.h} <span style={{ color: COLORS.textMuted }}>@{evt.viewport.dpr}x</span>
                                  </div>
                                </div>
                              )}
                              {/* Carte */}
                              {evt.carte && (
                                <div style={{ background: (evt.carte.w < 50 || evt.carte.h < 50) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 6 }}>
                                  <div style={{ color: COLORS.textMuted, fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>Carte (.carte)</div>
                                  <div style={{ color: '#fff', fontWeight: 600, fontFamily: 'monospace' }}>
                                    {evt.carte.w} × {evt.carte.h} <span style={{ color: COLORS.textMuted }}>pos({evt.carte.x},{evt.carte.y})</span>
                                  </div>
                                </div>
                              )}
                              {/* Container */}
                              {evt.container && (
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 6 }}>
                                  <div style={{ color: COLORS.textMuted, fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>Container</div>
                                  <div style={{ color: '#fff', fontWeight: 600, fontFamily: 'monospace' }}>
                                    {evt.container.w} × {evt.container.h} <span style={{ color: COLORS.textMuted }}>pos({evt.container.x},{evt.container.y})</span>
                                  </div>
                                </div>
                              )}
                              {/* HUD (mobile only) */}
                              {evt.hud && (
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 6 }}>
                                  <div style={{ color: COLORS.textMuted, fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>HUD Mobile</div>
                                  <div style={{ color: '#fff', fontWeight: 600, fontFamily: 'monospace' }}>
                                    {evt.hud.w} × {evt.hud.h} <span style={{ color: COLORS.textMuted }}>pos({evt.hud.x},{evt.hud.y})</span>
                                  </div>
                                </div>
                              )}
                              {/* SVG Overlay */}
                              {evt.svg && (
                                <div style={{ background: (evt.svg.w < 50 || evt.svg.h < 50) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 6 }}>
                                  <div style={{ color: COLORS.textMuted, fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>SVG Overlay</div>
                                  <div style={{ color: '#fff', fontWeight: 600, fontFamily: 'monospace' }}>
                                    {evt.svg.w} × {evt.svg.h} <span style={{ color: COLORS.textMuted }}>pos({evt.svg.x},{evt.svg.y})</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Anomalies */}
                            {evt.anomalies && evt.anomalies.length > 0 && (
                              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {evt.anomalies.map((a, j) => (
                                  <span key={j} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.2)', color: COLORS.error, border: `1px solid ${COLORS.error}` }}>
                                    {a}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* User Agent */}
                            {evt.ua && (
                              <div style={{ marginTop: 6, fontSize: 11, color: COLORS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                🌐 {evt.ua}
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

            {/* ====== ERRORS TAB ====== */}
            {activeTab === 'errors' && (
              <div>
                {/* Error Timeline */}
                <div style={{ ...cardStyle, marginBottom: 16 }}>
                  <h3 style={{ ...cardTitleStyle, color: COLORS.error }}>🔴 Timeline des erreurs</h3>
                  {stats?.timeline && (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={stats.timeline.filter(t => t.error > 0)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" tickFormatter={formatChartTime} stroke={COLORS.textMuted} fontSize={11} />
                        <YAxis stroke={COLORS.textMuted} fontSize={12} />
                        <Tooltip
                          contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }}
                          labelFormatter={formatChartTime}
                        />
                        <Bar dataKey="error" name="Erreurs" fill={COLORS.error} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Error List */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ ...cardTitleStyle, margin: 0 }}>
                      Liste des erreurs ({errorLogs.length})
                    </h3>
                    {errorLogs.length > 0 && (
                      <button
                        onClick={() => copyToClipboard(formatLogsForCopy(errorLogs), 'errors')}
                        style={{
                          padding: '8px 16px',
                          background: copyFeedback === 'errors' ? '#148A9C' : '#ef4444',
                          border: 'none',
                          borderRadius: 8,
                          color: '#fff',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: 13,
                          transition: 'all 0.3s',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {copyFeedback === 'errors' ? '✅ Copié !' : '📋 Copier les erreurs'}
                      </button>
                    )}
                  </div>
                  {logsLoading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: COLORS.textMuted }}>Chargement...</div>
                  ) : errorLogs.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                      <div style={{ fontSize: 16, color: COLORS.success }}>Aucune erreur sur cette période</div>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                      {errorLogs.map((log, i) => (
                        <div key={log.id || i} style={{
                          padding: '12px 16px',
                          borderLeft: `4px solid ${COLORS.error}`,
                          background: 'rgba(239,68,68,0.06)',
                          marginBottom: 8,
                          borderRadius: '0 8px 8px 0',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                              {formatDateTime(log.timestamp)}
                            </span>
                            <span style={{
                              padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                              background: COLORS.error, color: '#fff',
                            }}>
                              ERROR
                            </span>
                          </div>
                          <div style={{ color: COLORS.text, fontSize: 14, wordBreak: 'break-word', marginBottom: 4 }}>
                            {log.message}
                          </div>
                          {log.meta && Object.keys(log.meta).length > 0 && (
                            <pre style={{
                              fontSize: 11, color: COLORS.textMuted, margin: 0,
                              background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 4,
                              overflow: 'auto', maxHeight: 120,
                            }}>
                              {JSON.stringify(log.meta, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
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

const thStyle = {
  padding: '10px 8px',
  textAlign: 'left',
  color: COLORS.textMuted,
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
};

const tdStyle = {
  padding: '8px',
  color: COLORS.text,
};

// ========== Performance Monitoring Helpers ==========

function getPerfEventColor(type) {
  if (!type) return '#94a3b8';
  if (type.startsWith('save:success')) return '#22c55e';
  if (type.startsWith('save:error') || type.startsWith('save:exception')) return '#ef4444';
  if (type.startsWith('save:skipped')) return '#f59e0b';
  if (type.startsWith('mp:identify') || type === 'joinRoom') return '#3b82f6';
  if (type.startsWith('endSession')) return '#f59e0b';
  if (type === 'cc_student_id:resolved' || type === 'cc_student_id:missing') return '#8b5cf6';
  if (type === 'perf:transition' || type === 'perf:save-attempt' || type === 'perf:save-result') return '#a855f7';
  if (type === 'rum:layout') return '#14b8a6';
  if (type === 'connected') return '#22c55e';
  return '#94a3b8';
}

function formatPerfEventData(evt) {
  if (!evt) return '';
  const skip = new Set(['type', 'ts', 'source']);
  const parts = [];
  for (const [k, v] of Object.entries(evt)) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') {
      parts.push(`${k}=${JSON.stringify(v)}`);
    } else {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.join('  ');
}

export default MonitoringDashboard;
