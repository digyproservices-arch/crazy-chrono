// ==========================================
// COMPOSANT: RÉSULTATS D'UN MATCH (Arena ou Training)
// Affiche le podium et les détails des résultats
// ==========================================

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

const medalEmojis = ['🥇', '🥈', '🥉'];
const podiumColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function MatchResults() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [mode, setMode] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/tournament/matches/${matchId}/results`);
        const data = await res.json();

        if (data.success) {
          setResults(data.results || []);
          setMode(data.mode || 'unknown');
          setSessionName(data.sessionName || '');
        } else {
          setError(data.error || 'Erreur lors du chargement des résultats');
        }
      } catch (err) {
        console.error('[MatchResults] Fetch error:', err);
        setError('Impossible de charger les résultats');
      } finally {
        setLoading(false);
      }
    };

    if (matchId) fetchResults();
  }, [matchId]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h2>Chargement des résultats...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h2 style={{ color: '#ef4444' }}>Erreur</h2>
        <p>{error}</p>
        <button onClick={() => navigate(-1)} style={btnBack}>← Retour</button>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
        <h2>Aucun résultat</h2>
        <p style={{ color: '#6b7280' }}>
          Les résultats de ce match ne sont pas encore disponibles ou ont été supprimés.
        </p>
        <button onClick={() => navigate(-1)} style={btnBack}>← Retour</button>
      </div>
    );
  }

  const winner = results[0];
  const modeLabel = mode === 'arena' ? 'Arena' : mode === 'training' ? 'Entraînement' : 'Match';

  return (
    <div style={{ 
      maxWidth: 800, 
      margin: '0 auto', 
      padding: 40,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1f2937', marginBottom: 4 }}>
          Résultats du match
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          Mode {modeLabel}
          {sessionName ? ` — ${sessionName}` : ''}
        </p>
      </div>

      {/* Podium top 3 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: 16,
        marginBottom: 40,
        padding: '0 20px'
      }}>
        {/* 2e place */}
        {results.length > 1 && (
          <PodiumCard player={results[1]} position={2} />
        )}
        {/* 1re place */}
        <PodiumCard player={winner} position={1} />
        {/* 3e place */}
        {results.length > 2 && (
          <PodiumCard player={results[2]} position={3} />
        )}
      </div>

      {/* Tableau détaillé */}
      <div style={{
        background: '#fff',
        border: '2px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          padding: '12px 20px',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          fontWeight: 700,
          fontSize: 14,
          color: '#374151',
          display: 'grid',
          gridTemplateColumns: '50px 1fr 80px 80px 80px',
          gap: 8
        }}>
          <span>#</span>
          <span>Joueur</span>
          <span style={{ textAlign: 'center' }}>Score</span>
          <span style={{ textAlign: 'center' }}>Paires</span>
          <span style={{ textAlign: 'center' }}>Erreurs</span>
        </div>
        {results.map((r, idx) => (
          <div
            key={idx}
            style={{
              padding: '14px 20px',
              borderBottom: idx < results.length - 1 ? '1px solid #f3f4f6' : 'none',
              display: 'grid',
              gridTemplateColumns: '50px 1fr 80px 80px 80px',
              gap: 8,
              alignItems: 'center',
              background: idx === 0 ? '#fefce8' : '#fff'
            }}
          >
            <span style={{ fontSize: 20 }}>
              {medalEmojis[idx] || `${idx + 1}.`}
            </span>
            <span style={{ fontWeight: idx === 0 ? 700 : 500, color: '#1f2937' }}>
              {r.studentName}
            </span>
            <span style={{ textAlign: 'center', fontWeight: 700, color: '#1AACBE', fontSize: 18 }}>
              {r.score}
            </span>
            <span style={{ textAlign: 'center', color: '#6b7280' }}>
              {r.pairs_validated ?? '-'}
            </span>
            <span style={{ textAlign: 'center', color: r.errors > 0 ? '#ef4444' : '#6b7280' }}>
              {r.errors ?? '-'}
            </span>
          </div>
        ))}
      </div>

      {/* Bouton retour */}
      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <button onClick={() => navigate(-1)} style={btnBack}>
          ← Retour
        </button>
      </div>
    </div>
  );
}

function PodiumCard({ player, position }) {
  const heights = { 1: 160, 2: 120, 3: 100 };
  const height = heights[position] || 80;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: position === 1 ? 160 : 130
    }}>
      <div style={{ fontSize: 32, marginBottom: 4 }}>
        {medalEmojis[position - 1]}
      </div>
      <div style={{
        fontWeight: 700,
        fontSize: position === 1 ? 16 : 14,
        color: '#1f2937',
        marginBottom: 4,
        textAlign: 'center',
        wordBreak: 'break-word'
      }}>
        {player.studentName}
      </div>
      <div style={{
        fontSize: position === 1 ? 24 : 18,
        fontWeight: 800,
        color: '#1AACBE',
        marginBottom: 8
      }}>
        {player.score} pts
      </div>
      <div style={{
        width: '100%',
        height,
        background: `linear-gradient(180deg, ${podiumColors[position - 1]}44, ${podiumColors[position - 1]}88)`,
        borderRadius: '8px 8px 0 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
        fontWeight: 800,
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.2)'
      }}>
        {position}
      </div>
    </div>
  );
}

const btnBack = {
  padding: '10px 24px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600
};
