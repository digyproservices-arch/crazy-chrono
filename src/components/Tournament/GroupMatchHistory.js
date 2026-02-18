// ==========================================
// COMPOSANT: HISTORIQUE DES MATCHS D'UN GROUPE
// Affiche tous les matchs joués avec dates + podium du dernier match
// ==========================================

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

const medalEmojis = ['🥇', '🥈', '🥉'];
const podiumColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function PodiumCard({ player, position }) {
  const heights = { 1: 140, 2: 110, 3: 90 };
  const sizes = { 1: 64, 2: 52, 3: 48 };
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      width: sizes[position] + 40, order: position === 1 ? 2 : position === 2 ? 1 : 3
    }}>
      <div style={{ fontSize: position === 1 ? 36 : 28, marginBottom: 4 }}>
        {medalEmojis[position - 1]}
      </div>
      <div style={{
        width: sizes[position], height: sizes[position], borderRadius: '50%',
        background: `linear-gradient(135deg, ${podiumColors[position - 1]}33, ${podiumColors[position - 1]}66)`,
        border: `3px solid ${podiumColors[position - 1]}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: position === 1 ? 20 : 16, fontWeight: 800, color: '#1f2937',
        marginBottom: 6
      }}>
        {(player.studentName || '?').charAt(0).toUpperCase()}
      </div>
      <div style={{ fontWeight: 700, fontSize: position === 1 ? 15 : 13, color: '#1f2937', textAlign: 'center', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.studentName}
      </div>
      <div style={{ fontWeight: 800, fontSize: position === 1 ? 22 : 18, color: '#1AACBE', marginTop: 2 }}>
        {player.score}
      </div>
      <div style={{
        width: '100%', height: heights[position],
        background: `linear-gradient(to top, ${podiumColors[position - 1]}22, ${podiumColors[position - 1]}55)`,
        borderRadius: '8px 8px 0 0', marginTop: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 900, color: podiumColors[position - 1]
      }}>
        {position}
      </div>
    </div>
  );
}

export default function GroupMatchHistory() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedMatch, setExpandedMatch] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/tournament/groups/${groupId}/match-history`);
        const json = await res.json();

        if (json.success) {
          setData(json);
          // Auto-expand the latest match
          if (json.matches && json.matches.length > 0) {
            setExpandedMatch(json.matches[0].sessionId);
          }
        } else {
          setError(json.error || 'Erreur lors du chargement');
        }
      } catch (err) {
        console.error('[GroupMatchHistory] Fetch error:', err);
        setError('Impossible de charger l\'historique');
      } finally {
        setLoading(false);
      }
    };

    if (groupId) fetchHistory();
  }, [groupId]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h2>Chargement de l'historique...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h2 style={{ color: '#ef4444' }}>Erreur</h2>
        <p>{error}</p>
        <button onClick={() => navigate(-1)} style={btnStyle}>← Retour</button>
      </div>
    );
  }

  if (!data || !data.matches || data.matches.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
        <h2>Aucun résultat</h2>
        <p style={{ color: '#6b7280' }}>
          Aucun match terminé pour ce groupe.
        </p>
        <button onClick={() => navigate(-1)} style={btnStyle}>← Retour</button>
      </div>
    );
  }

  const latestMatch = data.matches[0];
  const totalMatches = data.matches.length;

  return (
    <div style={{ 
      maxWidth: 850, margin: '0 auto', padding: '24px 16px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1f2937', marginBottom: 4 }}>
          {data.groupName || 'Groupe'}
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          {totalMatches} match{totalMatches > 1 ? 's' : ''} joué{totalMatches > 1 ? 's' : ''}
        </p>
      </div>

      {/* Podium du DERNIER match */}
      <div style={{
        background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
        borderRadius: 16, padding: '20px 16px 8px', marginBottom: 24,
        border: '1px solid #bae6fd'
      }}>
        <h2 style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#0c4a6e', marginBottom: 4 }}>
          Dernier match — {formatDate(latestMatch.date)}
        </h2>
        {latestMatch.results.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
            gap: 12, padding: '12px 8px 0'
          }}>
            {latestMatch.results.length > 1 && (
              <PodiumCard player={latestMatch.results[1]} position={2} />
            )}
            <PodiumCard player={latestMatch.results[0]} position={1} />
            {latestMatch.results.length > 2 && (
              <PodiumCard player={latestMatch.results[2]} position={3} />
            )}
          </div>
        )}
      </div>

      {/* Historique de tous les matchs */}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>
        Historique des matchs
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.matches.map((match, matchIdx) => {
          const isExpanded = expandedMatch === match.sessionId;
          const isLatest = matchIdx === 0;
          const winner = match.results[0];

          return (
            <div key={match.sessionId} style={{
              background: '#fff',
              border: isLatest ? '2px solid #1AACBE' : '1px solid #e5e7eb',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
            }}>
              {/* Match header - clickable */}
              <div
                onClick={() => setExpandedMatch(isExpanded ? null : match.sessionId)}
                style={{
                  padding: '14px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none',
                  background: isLatest ? '#f0fdfa' : '#fff'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ 
                    fontSize: 13, fontWeight: 700, 
                    background: isLatest ? '#1AACBE' : '#6b7280',
                    color: '#fff', borderRadius: 6, padding: '2px 8px',
                    minWidth: 60, textAlign: 'center'
                  }}>
                    {isLatest ? 'Dernier' : `#${totalMatches - matchIdx}`}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937' }}>
                      {formatDate(match.date)}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {winner ? `Vainqueur: ${winner.studentName} (${winner.score} pts)` : 'Aucun résultat'}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 18, color: '#9ca3af', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  ▼
                </span>
              </div>

              {/* Match details - expandable */}
              {isExpanded && match.results.length > 0 && (
                <div style={{ borderTop: '1px solid #f3f4f6' }}>
                  {/* Table header */}
                  <div style={{
                    padding: '8px 16px',
                    background: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 700, fontSize: 12, color: '#6b7280',
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr 70px 70px 70px',
                    gap: 6, textTransform: 'uppercase', letterSpacing: '0.5px'
                  }}>
                    <span>#</span>
                    <span>Joueur</span>
                    <span style={{ textAlign: 'center' }}>Score</span>
                    <span style={{ textAlign: 'center' }}>Paires</span>
                    <span style={{ textAlign: 'center' }}>Erreurs</span>
                  </div>
                  {/* Results rows */}
                  {match.results.map((r, idx) => (
                    <div
                      key={r.studentId}
                      style={{
                        padding: '10px 16px',
                        borderBottom: idx < match.results.length - 1 ? '1px solid #f3f4f6' : 'none',
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr 70px 70px 70px',
                        gap: 6, alignItems: 'center',
                        background: idx === 0 ? '#fefce8' : '#fff'
                      }}
                    >
                      <span style={{ fontSize: 18 }}>
                        {medalEmojis[idx] || `${idx + 1}.`}
                      </span>
                      <span style={{ fontWeight: idx === 0 ? 700 : 500, color: '#1f2937', fontSize: 14 }}>
                        {r.studentName}
                      </span>
                      <span style={{ textAlign: 'center', fontWeight: 700, color: '#1AACBE', fontSize: 16 }}>
                        {r.score}
                      </span>
                      <span style={{ textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                        {r.pairs_validated ?? '-'}
                      </span>
                      <span style={{ textAlign: 'center', color: r.errors > 0 ? '#ef4444' : '#6b7280', fontSize: 13 }}>
                        {r.errors ?? '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bouton retour */}
      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <button onClick={() => navigate(-1)} style={btnStyle}>
          ← Retour
        </button>
      </div>
    </div>
  );
}

const btnStyle = {
  padding: '10px 24px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#374151',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer'
};
