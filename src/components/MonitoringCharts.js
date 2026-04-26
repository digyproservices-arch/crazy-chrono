// ==========================================
// MONITORING CHARTS — Graphiques temporels, APM, Error Groups, Alertes
// Sous-composant du MonitoringDashboard
// ==========================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { getBackendUrl } from '../utils/apiHelpers';

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

const cardStyle = {
  background: COLORS.card,
  borderRadius: 12,
  padding: 16,
  border: `1px solid ${COLORS.border}`,
  marginBottom: 16,
};

const btnStyle = (bg) => ({
  padding: '6px 14px',
  borderRadius: 8,
  border: 'none',
  background: bg,
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
});

function getAuthToken() {
  try { return JSON.parse(localStorage.getItem('cc_auth') || '{}').token || ''; } catch { return ''; }
}

export default function MonitoringCharts() {
  const [timeSeries, setTimeSeries] = useState({ errors: [], players: [], apm: [] });
  const [apmMetrics, setApmMetrics] = useState(null);
  const [errorGroups, setErrorGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(168); // 7 jours
  const [alertTestMsg, setAlertTestMsg] = useState(null);
  const [activeSection, setActiveSection] = useState('overview'); // overview | apm | errors | alerts

  const fetchAll = useCallback(async () => {
    const token = getAuthToken();
    const backendUrl = getBackendUrl();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const fetchers = [
      fetch(`${backendUrl}/api/monitoring/time-series?hours=${timeRange}`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${backendUrl}/api/monitoring/apm-metrics`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${backendUrl}/api/monitoring/error-groups?hours=${Math.min(timeRange, 72)}`, { headers }).then(r => r.json()).catch(() => null),
    ];

    const [tsData, apmData, errData] = await Promise.all(fetchers);
    if (tsData?.ok && tsData.data) setTimeSeries(tsData.data);
    if (apmData?.ok && apmData.metrics) setApmMetrics(apmData.metrics);
    if (errData?.ok && errData.groups) setErrorGroups(errData.groups);
    setLoading(false);
  }, [timeRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const testDiscordAlert = async () => {
    try {
      const token = getAuthToken();
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/monitoring/test-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      setAlertTestMsg(data.sent ? '✅ Alerte Discord envoyée !' : `⚠️ Non envoyée: ${data.hint || 'cooldown ou webhook manquant'}`);
      setTimeout(() => setAlertTestMsg(null), 5000);
    } catch (e) {
      setAlertTestMsg(`❌ Erreur: ${e.message}`);
    }
  };

  const formatHour = (hourStr) => {
    if (!hourStr) return '';
    try {
      const d = new Date(hourStr + ':00:00Z');
      return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit' }).replace(' ', '\n');
    } catch { return hourStr; }
  };

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
        <div style={{ color: '#94a3b8', marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>
            {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32 }}>📊</div>
        <div style={{ color: COLORS.textMuted, marginTop: 8 }}>Chargement des graphiques...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { id: 'overview', label: '📊 Vue d\'ensemble' },
          { id: 'apm', label: '⚡ Performance API' },
          { id: 'errors', label: `❌ Erreurs groupées (${errorGroups.length})` },
          { id: 'alerts', label: '🔔 Alertes' },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              ...btnStyle(activeSection === s.id ? COLORS.info : '#334155'),
              fontSize: 12,
              padding: '7px 14px',
              opacity: activeSection === s.id ? 1 : 0.7,
            }}
          >
            {s.label}
          </button>
        ))}
        <select
          value={timeRange}
          onChange={e => setTimeRange(Number(e.target.value))}
          style={{ background: '#334155', color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12 }}
        >
          <option value={24}>24 heures</option>
          <option value={72}>3 jours</option>
          <option value={168}>7 jours</option>
        </select>
        <button onClick={fetchAll} style={btnStyle(COLORS.info)}>🔄</button>
      </div>

      {/* ====== OVERVIEW ====== */}
      {activeSection === 'overview' && (
        <>
          {/* Errors over time chart */}
          <div style={cardStyle}>
            <h3 style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
              🚨 Événements monitoring par heure
            </h3>
            {timeSeries.errors.length === 0 ? (
              <div style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>
                Aucune donnée. Les événements apparaîtront après exécution de la migration SQL et réception de données.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timeSeries.errors}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="hour" tickFormatter={formatHour} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip content={customTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="errors" stackId="1" stroke="#ef4444" fill="rgba(239,68,68,0.3)" name="Erreurs" />
                  <Area type="monotone" dataKey="warnings" stackId="1" stroke="#f59e0b" fill="rgba(245,158,11,0.2)" name="Warnings" />
                  <Area type="monotone" dataKey="info" stackId="1" stroke="#06b6d4" fill="rgba(6,182,212,0.1)" name="Info" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Players over time chart */}
          <div style={cardStyle}>
            <h3 style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
              👥 Joueurs connectés dans le temps
            </h3>
            {timeSeries.players.length === 0 ? (
              <div style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>
                Aucun snapshot. Les données apparaîtront après 5 min d'activité (snapshots automatiques toutes les 5 min).
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={timeSeries.players}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="ts"
                    tickFormatter={v => {
                      try { return new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit' }); } catch { return ''; }
                    }}
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip content={customTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="online" stroke="#06b6d4" strokeWidth={2} dot={false} name="En ligne" />
                  <Line type="monotone" dataKey="playing" stroke="#10b981" strokeWidth={2} dot={false} name="En jeu" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* APM summary chart */}
          {apmMetrics && apmMetrics.hourly.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
                ⚡ Latence API par heure (p50 / p95)
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={apmMetrics.hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="hour" tickFormatter={formatHour} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit="ms" />
                  <Tooltip content={customTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="p50Ms" stroke="#10b981" strokeWidth={2} dot={false} name="p50 (ms)" />
                  <Line type="monotone" dataKey="p95Ms" stroke="#f59e0b" strokeWidth={2} dot={false} name="p95 (ms)" />
                  <Line type="monotone" dataKey="avgMs" stroke="#8b5cf6" strokeWidth={1} dot={false} name="Avg (ms)" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ====== APM DETAIL ====== */}
      {activeSection === 'apm' && (
        <>
          {/* Server summary KPIs */}
          {apmMetrics?.summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Requêtes totales', value: apmMetrics.summary.totalRequests, color: '#06b6d4' },
                { label: 'Latence moy.', value: `${apmMetrics.summary.avgMs}ms`, color: '#10b981' },
                { label: 'Latence max', value: `${apmMetrics.summary.maxMs}ms`, color: apmMetrics.summary.maxMs > 2000 ? '#ef4444' : '#f59e0b' },
                { label: 'Erreurs API', value: apmMetrics.summary.totalErrors, color: apmMetrics.summary.totalErrors > 0 ? '#ef4444' : '#10b981' },
                { label: 'Taux erreur', value: `${apmMetrics.summary.errorRate}%`, color: apmMetrics.summary.errorRate > 5 ? '#ef4444' : '#10b981' },
                { label: 'Uptime', value: `${Math.round(apmMetrics.summary.uptime / 3600)}h`, color: '#8b5cf6' },
                { label: 'Mémoire', value: `${apmMetrics.summary.memoryMB}MB`, color: apmMetrics.summary.memoryMB > 200 ? '#f59e0b' : '#06b6d4' },
              ].map((kpi, i) => (
                <div key={i} style={{ background: '#0f172a', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{kpi.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Endpoints table */}
          <div style={cardStyle}>
            <h3 style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
              📡 Endpoints — Temps de réponse
            </h3>
            {!apmMetrics?.paths?.length ? (
              <div style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>
                En attente de trafic API. Les métriques apparaîtront après les premières requêtes.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      {['Endpoint', 'Requêtes', 'Avg (ms)', 'Max (ms)', 'Erreurs', 'Taux err.'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: COLORS.textMuted, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apmMetrics.paths.map((p, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(51,65,85,0.5)` }}>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: COLORS.text, fontSize: 10 }}>{p.path}</td>
                        <td style={{ padding: '5px 8px', color: '#06b6d4' }}>{p.count}</td>
                        <td style={{ padding: '5px 8px', color: p.avgMs > 500 ? '#f59e0b' : '#10b981' }}>{p.avgMs}</td>
                        <td style={{ padding: '5px 8px', color: p.maxMs > 2000 ? '#ef4444' : COLORS.textMuted }}>{p.maxMs}</td>
                        <td style={{ padding: '5px 8px', color: p.errors > 0 ? '#ef4444' : COLORS.textMuted }}>{p.errors}</td>
                        <td style={{ padding: '5px 8px', color: p.errorRate > 5 ? '#ef4444' : COLORS.textMuted }}>{p.errorRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Throughput chart */}
          {apmMetrics?.hourly?.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
                📈 Débit requêtes / heure
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={apmMetrics.hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="hour" tickFormatter={formatHour} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip content={customTooltip} />
                  <Bar dataKey="count" fill="rgba(6,182,212,0.6)" name="Requêtes" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="errors" fill="rgba(239,68,68,0.6)" name="Erreurs" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ====== ERROR GROUPS ====== */}
      {activeSection === 'errors' && (
        <div style={cardStyle}>
          <h3 style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
            ❌ Erreurs groupées par fingerprint ({errorGroups.length} groupes)
          </h3>
          {errorGroups.length === 0 ? (
            <div style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>
              Aucune erreur groupée. Les données apparaîtront après exécution de la migration SQL et réception d'erreurs.
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {errorGroups.map((g, i) => (
                <div key={i} style={{
                  padding: '10px 12px',
                  background: i % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'transparent',
                  borderLeft: `3px solid ${g.severity === 'critical' ? '#dc2626' : g.severity === 'error' ? '#ef4444' : '#f59e0b'}`,
                  borderRadius: '0 6px 6px 0',
                  marginBottom: 4,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '1px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        background: g.severity === 'critical' ? '#dc2626' : g.severity === 'error' ? '#ef4444' : '#f59e0b',
                        color: '#fff',
                        marginRight: 6,
                      }}>
                        ×{g.count}
                      </span>
                      <span style={{ fontSize: 11, color: '#06b6d4', fontWeight: 600 }}>{g.eventType}</span>
                      <div style={{ fontSize: 12, color: COLORS.text, marginTop: 4 }}>{g.message || '(no message)'}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 10, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                      <div>{g.devices} device{g.devices > 1 ? 's' : ''} · {g.users} user{g.users > 1 ? 's' : ''}</div>
                      <div>Première: {new Date(g.firstSeen).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      <div>Dernière: {new Date(g.lastSeen).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====== ALERTS ====== */}
      {activeSection === 'alerts' && (
        <>
          <div style={cardStyle}>
            <h3 style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
              🔔 Configuration des alertes
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontWeight: 700, color: COLORS.text, fontSize: 13, marginBottom: 4 }}>Discord Webhook</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                  Configurez <code>DISCORD_WEBHOOK_URL</code> dans les variables d'environnement Render pour recevoir les alertes.
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={testDiscordAlert} style={btnStyle('#5865F2')}>🔔 Tester l'alerte Discord</button>
                  {alertTestMsg && <span style={{ fontSize: 11, color: alertTestMsg.startsWith('✅') ? '#10b981' : '#f59e0b' }}>{alertTestMsg}</span>}
                </div>
              </div>
              <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontWeight: 700, color: COLORS.text, fontSize: 13, marginBottom: 4 }}>Alertes automatiques</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6 }}>
                  • <strong style={{ color: '#ef4444' }}>Pic d'erreurs</strong> : 10+ erreurs client en 5 min<br />
                  • <strong style={{ color: '#f59e0b' }}>Erreur serveur</strong> : réponse 5xx sur un endpoint<br />
                  • <strong style={{ color: '#dc2626' }}>Paiement échoué</strong> : Stripe/RevenueCat failure<br />
                  • <strong style={{ color: '#10b981' }}>Record joueurs</strong> : palier 10+ joueurs simultanés<br />
                  • <strong style={{ color: '#06b6d4' }}>Déploiement</strong> : notification à chaque redémarrage serveur
                </div>
              </div>
            </div>
          </div>

          {/* Migration SQL reminder */}
          <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b' }}>
            <h3 style={{ color: '#f59e0b', fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>
              📋 Migration SQL requise
            </h3>
            <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>
              Pour activer la persistance Supabase (graphiques temporels, erreurs groupées, APM), exécutez le fichier
              <code style={{ color: '#06b6d4' }}> server/db/migration_monitoring.sql</code> dans le SQL Editor de Supabase.
              <br />Sans cette migration, les données sont stockées en mémoire (perdues au redémarrage) + fichiers JSON (éphémères sur Render).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
