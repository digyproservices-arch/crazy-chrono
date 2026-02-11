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
  const [activeTab, setActiveTab] = useState('overview'); // overview | logs | errors | performance
  const [copyFeedback, setCopyFeedback] = useState(null); // 'logs' | 'errors' | null
  const [perfEvents, setPerfEvents] = useState([]);
  const [perfConnected, setPerfConnected] = useState(false);
  const perfSocketRef = useRef(null);
  const perfBottomRef = useRef(null);
  const [perfAutoScroll, setPerfAutoScroll] = useState(true);

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
    if (activeTab !== 'performance') return;
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
    if (activeTab === 'logs' || activeTab === 'errors') {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

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
            { id: 'overview', label: '📈 Vue d\'ensemble', icon: '' },
            { id: 'logs', label: '📋 Logs détaillés', icon: '' },
            { id: 'errors', label: `🔴 Erreurs (${totalErrors})`, icon: '' },
            { id: 'performance', label: `🎯 Performance${perfConnected ? ' 🟢' : ''}`, icon: '' },
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
