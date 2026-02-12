// ==========================================
// COMPOSANT: DASHBOARD PERFORMANCE ÉLÈVE
// Graphiques de progression, rapidité, précision
// ==========================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, Legend, Cell
} from 'recharts';

const getBackendUrl = () => process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'];

function MasteryTab({ themeMastery }) {
  const [expandedThemes, setExpandedThemes] = React.useState({});
  const toggleTheme = (theme) => setExpandedThemes(prev => ({ ...prev, [theme]: !prev[theme] }));

  if (!themeMastery || themeMastery.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>🧠 Maîtrise par thème</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px 0' }}>Analyse détaillée des points forts et axes d'amélioration</p>
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          Joue en mode Solo pour voir l'analyse de maîtrise par thème
        </div>
      </div>
    );
  }

  const getColor = (acc) => acc >= 80 ? '#059669' : acc >= 60 ? '#d97706' : '#dc2626';
  const getBg = (acc) => acc >= 80 ? '#f0fdf4' : acc >= 60 ? '#fffbeb' : '#fef2f2';
  const fmtLatency = (ms) => !ms ? '' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

  // Mastery label: requires both accuracy AND coverage (minimum unique items)
  const getMasteryLabel = (t) => {
    const isTable = t.theme.startsWith('Table de ');
    const uniqueItems = (t.items || []).length;
    // For tables: require at least 5 unique calculations to be "Maîtrisé"
    // For other themes: require at least 3 unique items
    const minCoverage = isTable ? 10 : 3;
    if (t.accuracy >= 80 && uniqueItems >= minCoverage) return '✅ Maîtrisé';
    if (t.accuracy >= 80 && uniqueItems < minCoverage) return '🔍 Vu partiellement';
    if (t.accuracy >= 60) return '⚠️ En progrès';
    return '❌ À travailler';
  };

  // Resolve image URL (relative → absolute with PUBLIC_URL)
  const resolveImg = (raw) => {
    if (!raw) return null;
    if (raw.startsWith('http')) return raw;
    const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    const path = raw.startsWith('/') ? raw : (raw.startsWith('images/') ? '/' + raw : '/images/' + raw);
    return base + path;
  };

  // Parse item_id: can be JSON {text, img} for image-texte or plain string for calc
  const parseItem = (raw) => {
    if (!raw) return { text: '', img: null };
    // Skip cryptic IDs (assoc-calc-..., assoc-img-..., UUIDs joined by |)
    if (/^assoc-/.test(raw) || /^[a-f0-9-]{20,}\|/.test(raw) || /^\d{10,}\|/.test(raw)) {
      return { text: null, img: null, hidden: true };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.text) {
        return { text: parsed.text, img: parsed.img ? resolveImg(parsed.img) : null };
      }
    } catch {}
    return { text: raw, img: null };
  };

  // Separate multiplication tables from other themes for grouped display
  const tables = themeMastery.filter(t => t.theme.startsWith('Table de '));
  const others = themeMastery.filter(t => !t.theme.startsWith('Table de ') && t.theme !== 'autre');

  // Aggregate multiplication tables stats
  const tablesAgg = tables.length > 0 ? {
    total: tables.reduce((s, t) => s + t.total, 0),
    correct: tables.reduce((s, t) => s + t.correct, 0),
    accuracy: Math.round(tables.reduce((s, t) => s + t.correct, 0) / Math.max(1, tables.reduce((s, t) => s + t.total, 0)) * 100),
    avgLatencyMs: Math.round(tables.reduce((s, t) => s + (t.avgLatencyMs * t.total), 0) / Math.max(1, tables.reduce((s, t) => s + t.total, 0)))
  } : null;

  const renderItemGrid = (items, themeType) => {
    if (!items || items.length === 0) return null;
    // Filter out items with cryptic IDs
    const displayItems = items.map(it => ({ ...it, parsed: parseItem(it.item) })).filter(it => !it.parsed.hidden);
    if (displayItems.length === 0) return null;
    const isImgTxt = themeType === 'imgtxt';
    return (
      <div style={{ display: 'grid', gridTemplateColumns: isImgTxt ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
        {displayItems.map((it, i) => {
          const c = getColor(it.accuracy);
          const icon = it.accuracy >= 80 ? '✓' : it.accuracy >= 60 ? '~' : '✗';
          const p = it.parsed;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8, fontSize: 12,
              background: getBg(it.accuracy), border: `1px solid ${c}22`
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: c, minWidth: 18, textAlign: 'center' }}>{icon}</span>
              {p.img && (
                <img
                  src={p.img} alt={p.text || ''}
                  style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0', flexShrink: 0 }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.text || it.item}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  {it.correct}/{it.total} — {it.accuracy}%{it.avgLatencyMs > 0 ? ` — ${fmtLatency(it.avgLatencyMs)}` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderThemeCard = (t) => {
    const color = getColor(t.accuracy);
    const isExpanded = expandedThemes[t.theme];
    const displayItems = (t.items || []).filter(it => !parseItem(it.item).hidden);
    const hasItems = displayItems.length > 0;
    const label = getMasteryLabel(t);
    const isTable = t.theme.startsWith('Table de ');
    // Determine if this theme has image-texte items
    const themeType = displayItems.some(it => { try { const p = JSON.parse(it.item); return p && p.img; } catch { return false; } }) ? 'imgtxt' : 'calc';
    return (
      <div key={t.theme} style={{ background: getBg(t.accuracy), borderRadius: 12, padding: '16px 18px', border: `1px solid ${color}22` }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, cursor: hasItems ? 'pointer' : 'default' }}
          onClick={() => hasItems && toggleTheme(t.theme)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasItems && <span style={{ fontSize: 12, color: '#64748b', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>}
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{t.theme}</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {t.correct}/{t.total} réussites{hasItems ? ` · ${displayItems.length} élément${displayItems.length > 1 ? 's' : ''} vu${displayItems.length > 1 ? 's' : ''}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
            <span style={{ fontSize: 20, fontWeight: 800, color }}>{t.accuracy}%</span>
          </div>
        </div>
        <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${t.accuracy}%`, background: color, borderRadius: 4, transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {t.avgLatencyMs > 0 && <span style={{ fontSize: 11, color: '#64748b' }}>⚡ {fmtLatency(t.avgLatencyMs)}</span>}
          {isTable && hasItems && (
            <span style={{ fontSize: 11, color: '#64748b' }}>
              📊 Couverture : {displayItems.length}/10 calculs
            </span>
          )}
          {t.levels && t.levels.length > 0 && t.levels.map(l => (
            <span key={l.level} style={{
              padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: getColor(l.accuracy) === '#059669' ? '#dcfce7' : getColor(l.accuracy) === '#d97706' ? '#fef3c7' : '#fecaca',
              color: getColor(l.accuracy) === '#059669' ? '#166534' : getColor(l.accuracy) === '#d97706' ? '#92400e' : '#991b1b'
            }}>
              {l.level}: {l.accuracy}% ({l.correct}/{l.total})
            </span>
          ))}
        </div>
        {isExpanded && hasItems && renderItemGrid(displayItems.map(it => ({ ...it })), themeType)}
      </div>
    );
  };

  // Count mastery using the new coverage-aware label
  const masteredCount = themeMastery.filter(t => getMasteryLabel(t) === '✅ Maîtrisé').length;
  const progressCount = themeMastery.filter(t => { const l = getMasteryLabel(t); return l === '⚠️ En progrès' || l === '🔍 Vu partiellement'; }).length;
  const needsWorkCount = themeMastery.filter(t => getMasteryLabel(t) === '❌ À travailler').length;

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>🧠 Maîtrise par thème</h3>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px 0' }}>Analyse détaillée des points forts et axes d'amélioration — cliquez sur un thème pour voir le détail</p>

      {/* Multiplication tables group */}
      {tables.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>🔢</span>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Tables de multiplication</h4>
            {tablesAgg && (
              <span style={{ fontSize: 12, fontWeight: 600, color: getColor(tablesAgg.accuracy), marginLeft: 'auto' }}>
                Global : {tablesAgg.accuracy}% ({tablesAgg.correct}/{tablesAgg.total})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tables.sort((a, b) => {
              const na = parseInt(a.theme.replace('Table de ', ''), 10) || 0;
              const nb = parseInt(b.theme.replace('Table de ', ''), 10) || 0;
              return na - nb;
            }).map(t => renderThemeCard(t))}
          </div>
        </div>
      )}

      {/* Other themes */}
      {others.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {tables.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🖼️</span>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Autres compétences</h4>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {others.map(t => renderThemeCard(t))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
        <div style={{ textAlign: 'center', padding: 14, background: '#f0fdf4', borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>Thèmes maîtrisés</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{masteredCount}</div>
          <div style={{ fontSize: 10, color: '#047857' }}>≥ 80% + couverture</div>
        </div>
        <div style={{ textAlign: 'center', padding: 14, background: '#fffbeb', borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>En progrès</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>{progressCount}</div>
          <div style={{ fontSize: 10, color: '#b45309' }}>Couverture partielle</div>
        </div>
        <div style={{ textAlign: 'center', padding: 14, background: '#fef2f2', borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 600 }}>À travailler</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>{needsWorkCount}</div>
          <div style={{ fontSize: 10, color: '#991b1b' }}>{'<'} 60% de réussite</div>
        </div>
      </div>
    </div>
  );
}

export default function StudentPerformance() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [progression, setProgression] = useState([]);
  const [streaks, setStreaks] = useState({ currentWin: 0, bestWin: 0 });
  const [themeMastery, setThemeMastery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const getAllStudentIds = () => {
    const ids = [];
    // 1. UUID auth Supabase (toujours compatible UUID et TEXT)
    try {
      const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (auth.id) ids.push(auth.id);
    } catch {}
    // 2. Student mapping ID (peut être 's001' etc.)
    const sid = localStorage.getItem('cc_student_id');
    if (sid && !ids.includes(sid)) ids.push(sid);
    return ids;
  };

  const fetchPerformance = async (studentId) => {
    const res = await fetch(`${getBackendUrl()}/api/tournament/students/${studentId}/performance`);
    const data = await res.json();
    return data;
  };

  const loadData = useCallback(async () => {
    try {
      const ids = getAllStudentIds();
      console.log('[Performance] Student IDs to try:', ids);
      if (ids.length === 0) {
        setError('ID élève non trouvé. Veuillez vous reconnecter.');
        setLoading(false);
        return;
      }

      // Essayer chaque ID jusqu'à trouver des données
      for (const studentId of ids) {
        try {
          console.log('[Performance] Trying studentId:', studentId);
          const data = await fetchPerformance(studentId);
          console.log('[Performance] Response for', studentId, ':', JSON.stringify(data).slice(0, 300));

          if (data.success && data.stats && data.stats.totalMatches > 0) {
            setStats(data.stats);
            setHistory(data.history || []);
            setProgression(data.progression || []);
            setStreaks(data.streaks || { currentWin: 0, bestWin: 0 });
            setThemeMastery(data.themeMastery || []);
            setError(null);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn('[Performance] Error for', studentId, ':', err.message);
        }
      }

      // Aucun ID n'a retourné de données — utiliser la réponse du premier ID
      try {
        const data = await fetchPerformance(ids[0]);
        if (data.success) {
          setStats(data.stats);
          setHistory(data.history || []);
          setProgression(data.progression || []);
          setStreaks(data.streaks || { currentWin: 0, bestWin: 0 });
          setThemeMastery(data.themeMastery || []);
          setError(null);
        } else {
          setError(data.error || 'Erreur de chargement');
        }
      } catch (err) {
        console.error('[Performance] Erreur finale:', err);
        setError('Erreur de connexion au serveur');
      }
    } catch (err) {
      console.error('[Performance] Erreur:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatTime = (ms) => {
    if (!ms) return '-';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h2>Chargement de tes performances...</h2>
      </div>
    );
  }

  const tabStyle = (active) => ({
    padding: '10px 18px',
    border: 'none',
    borderBottom: active ? '3px solid #1AACBE' : '3px solid transparent',
    background: 'none',
    color: active ? '#1AACBE' : '#6b7280',
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  });

  const noData = !stats || stats.totalMatches === 0;

  return (
    <div style={{
      maxWidth: 1100,
      margin: '0 auto',
      padding: '24px 20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minHeight: '100vh',
      background: '#f8fafc'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1e293b', margin: '0 0 4px 0' }}>
            📊 Mes Performances
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            Analyse de ta progression et de tes résultats
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadData} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🔄 Actualiser
          </button>
          <button onClick={() => navigate('/modes')} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ← Retour
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', marginBottom: 20, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {noData ? (
        <div style={{ padding: 60, textAlign: 'center', background: '#fff', borderRadius: 16, border: '2px dashed #d1d5db' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎮</div>
          <h2 style={{ color: '#374151', marginBottom: 8 }}>Aucune partie jouée</h2>
          <p style={{ color: '#6b7280', fontSize: 15, maxWidth: 400, margin: '0 auto' }}>
            Joue tes premières parties pour voir tes statistiques et ta progression ici !
          </p>
          <button
            onClick={() => navigate('/modes')}
            style={{
              marginTop: 20, padding: '12px 28px',
              background: 'linear-gradient(135deg, #1AACBE 0%, #148A9C 100%)',
              color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer'
            }}
          >
            🎯 Jouer maintenant
          </button>
        </div>
      ) : (
        <>
          {/* ===== STAT CARDS ===== */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Matchs joués', value: stats.totalMatches, icon: '🎮', color: '#1AACBE' },
              { label: 'Victoires', value: `${stats.totalWins} (${stats.winRate}%)`, icon: '🏆', color: '#F5A623' },
              { label: 'Score moyen', value: stats.avgScore, icon: '⭐', color: '#d97706' },
              { label: 'Meilleur score', value: stats.bestScore, icon: '🔥', color: '#dc2626' },
              { label: 'Précision', value: `${stats.accuracy}%`, icon: '🎯', color: '#8b5cf6' },
              { label: 'Rapidité moy.', value: `${stats.avgSpeed}/min`, icon: '⚡', color: '#0891b2' }
            ].map((s, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: 12, padding: '16px 14px',
                border: '1px solid #e2e8f0', textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Streaks */}
          {(streaks.currentWin > 0 || streaks.bestWin > 0) && (
            <div style={{
              display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap'
            }}>
              {streaks.currentWin > 0 && (
                <div style={{
                  flex: 1, minWidth: 200, padding: '14px 18px',
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                  border: '1px solid #86efac', borderRadius: 12,
                  display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <span style={{ fontSize: 28 }}>🔥</span>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{streaks.currentWin} victoire(s) d'affilée !</div>
                    <div style={{ fontSize: 12, color: '#047857' }}>Série en cours — continue !</div>
                  </div>
                </div>
              )}
              {streaks.bestWin > 1 && (
                <div style={{
                  flex: 1, minWidth: 200, padding: '14px 18px',
                  background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                  border: '1px solid #fcd34d', borderRadius: 12,
                  display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <span style={{ fontSize: 28 }}>⭐</span>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>Record : {streaks.bestWin} victoires</div>
                    <div style={{ fontSize: 12, color: '#b45309' }}>Meilleure série de victoires</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20,
            background: '#fff', borderRadius: '12px 12px 0 0', overflow: 'hidden'
          }}>
            <button onClick={() => setActiveTab('overview')} style={tabStyle(activeTab === 'overview')}>📈 Progression</button>
            <button onClick={() => setActiveTab('speed')} style={tabStyle(activeTab === 'speed')}>⚡ Rapidité</button>
            <button onClick={() => setActiveTab('accuracy')} style={tabStyle(activeTab === 'accuracy')}>🎯 Précision</button>
            <button onClick={() => setActiveTab('mastery')} style={tabStyle(activeTab === 'mastery')}>🧠 Maîtrise</button>
            <button onClick={() => setActiveTab('history')} style={tabStyle(activeTab === 'history')}>📋 Historique</button>
          </div>

          {/* ===== PROGRESSION TAB ===== */}
          {activeTab === 'overview' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>
                📈 Progression du score
              </h3>
              {progression.length < 2 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                  Joue au moins 2 parties pour voir ta progression
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={progression}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1AACBE" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#1AACBE" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="index" fontSize={11} tick={{ fill: '#94a3b8' }} label={{ value: 'Match #', position: 'bottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis fontSize={11} tick={{ fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value, name) => {
                        const labels = { score: 'Score', avgScore: 'Moyenne (5 matchs)' };
                        return [value, labels[name] || name];
                      }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="score" name="Score" stroke="#1AACBE" fill="url(#scoreGrad)" strokeWidth={2} dot={{ r: 3, fill: '#1AACBE' }} />
                    <Line type="monotone" dataKey="avgScore" name="Moyenne (5 matchs)" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* ===== SPEED TAB ===== */}
          {activeTab === 'speed' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                ⚡ Rapidité (paires validées par minute)
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px 0' }}>
                Plus la barre est haute, plus tu es rapide
              </p>
              {progression.length < 2 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                  Joue au moins 2 parties pour voir ta rapidité
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={progression}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="index" fontSize={11} tick={{ fill: '#94a3b8' }} label={{ value: 'Match #', position: 'bottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis fontSize={11} tick={{ fill: '#94a3b8' }} label={{ value: 'paires/min', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                      formatter={(value, name) => {
                        const labels = { speed: 'Rapidité', avgSpeed: 'Moyenne (5 matchs)' };
                        return [`${value} paires/min`, labels[name] || name];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="speed" name="Rapidité" radius={[4, 4, 0, 0]}>
                      {progression.map((entry, idx) => (
                        <Cell key={idx} fill={entry.isWin ? '#F5A623' : '#1AACBE'} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="avgSpeed" name="Moyenne (5 matchs)" stroke="#f97316" strokeWidth={2} dot={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {/* Speed stats summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
                <div style={{ textAlign: 'center', padding: 14, background: '#f0f9ff', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 600 }}>Rapidité moyenne</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7' }}>{stats.avgSpeed}</div>
                  <div style={{ fontSize: 10, color: '#0369a1' }}>paires/min</div>
                </div>
                <div style={{ textAlign: 'center', padding: 14, background: '#f0fdf4', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>Meilleure rapidité</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{stats.bestSpeed}</div>
                  <div style={{ fontSize: 10, color: '#047857' }}>paires/min</div>
                </div>
                <div style={{ textAlign: 'center', padding: 14, background: '#fffbeb', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>Temps moyen</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>{formatTime(stats.avgTime)}</div>
                  <div style={{ fontSize: 10, color: '#b45309' }}>par match</div>
                </div>
              </div>
            </div>
          )}

          {/* ===== ACCURACY TAB ===== */}
          {activeTab === 'accuracy' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                🎯 Précision (paires vs erreurs)
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px 0' }}>
                Compare tes bonnes réponses et tes erreurs match par match
              </p>

              {/* Accuracy gauge */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
                    <svg width="140" height="140" viewBox="0 0 140 140">
                      <circle cx="70" cy="70" r="60" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                      <circle
                        cx="70" cy="70" r="60" fill="none"
                        stroke={stats.accuracy >= 80 ? '#059669' : stats.accuracy >= 60 ? '#d97706' : '#dc2626'}
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${(stats.accuracy / 100) * 377} 377`}
                        transform="rotate(-90 70 70)"
                      />
                    </svg>
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                      fontSize: 28, fontWeight: 800,
                      color: stats.accuracy >= 80 ? '#059669' : stats.accuracy >= 60 ? '#d97706' : '#dc2626'
                    }}>
                      {stats.accuracy}%
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginTop: 8 }}>Taux de précision</div>
                </div>
              </div>

              {progression.length >= 2 && (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={progression}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="index" fontSize={11} tick={{ fill: '#94a3b8' }} />
                    <YAxis fontSize={11} tick={{ fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend />
                    <Bar dataKey="pairs" name="Paires validées" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="errors" name="Erreurs" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
                <div style={{ textAlign: 'center', padding: 14, background: '#f0fdf4', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>Total paires</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{stats.totalPairs}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 14, background: '#fef2f2', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 600 }}>Total erreurs</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>{stats.totalErrors}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 14, background: '#f5f3ff', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600 }}>Moy. erreurs/match</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed' }}>{stats.avgErrors}</div>
                </div>
              </div>
            </div>
          )}

          {/* ===== MASTERY TAB ===== */}
          {activeTab === 'mastery' && (
            <MasteryTab themeMastery={themeMastery} />
          )}

          {/* ===== HISTORY TAB ===== */}
          {activeTab === 'history' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #0D6A7A 0%, #148A9C 100%)' }}>
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff', width: 45 }}>#</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#fff' }}>Date</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Position</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Score</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Paires</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Erreurs</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Rapidité</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#fff' }}>Temps</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((h, idx) => {
                    const realIdx = history.length - 1 - idx;
                    return (
                      <tr key={h.id} style={{
                        background: h.isWin ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#f8fafc',
                        borderBottom: '1px solid #e2e8f0'
                      }}>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                          {realIdx + 1}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>
                          {formatDate(h.date)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {h.position <= 3 ? (
                            <span style={{ fontSize: 18 }}>{MEDAL_EMOJIS[h.position - 1]}</span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontWeight: 600 }}>{h.position}e</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#1AACBE', fontSize: 15 }}>
                          {h.score}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', color: '#148A9C', fontWeight: 600 }}>
                          {h.pairsValidated}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', color: h.errors > 0 ? '#dc2626' : '#059669' }}>
                          {h.errors}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#0891b2' }}>
                          {h.speed > 0 ? `${h.speed}/min` : '-'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>
                          {formatTime(h.timeMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
