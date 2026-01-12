import React from 'react';
import { useNavigate } from 'react-router-dom';
import TeacherModeSelector from '../Teacher/TeacherModeSelector';

export default function ModeSelect() {
  const navigate = useNavigate();
  const go = (mode) => navigate(`/config/${mode}`);
  const [history, setHistory] = React.useState([]);
  const [showAll, setShowAll] = React.useState(false);
  
  // Détecter si l'utilisateur est professeur ou admin
  const auth = React.useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('cc_auth') || '{}');
    } catch {
      return {};
    }
  }, []);
  
  // Si professeur/admin, afficher TeacherModeSelector (Training/Arena)
  if (auth.role === 'teacher' || auth.role === 'admin') {
    return <TeacherModeSelector />;
  }
  
  React.useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem('cc_history') || '[]');
      setHistory(Array.isArray(h) ? h : []);
    } catch { setHistory([]); }
  }, []);
  const Card = ({ title, subtitle, onClick }) => (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: 16, borderRadius: 12,
      border: '1px solid #e5e7eb', background: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.06)'
    }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
      <div style={{ opacity: 0.75, marginTop: 6 }}>{subtitle}</div>
    </button>
  );
  return (
    <div style={{ maxWidth: 980, margin: '24px auto', padding: '0 16px' }}>
      <h2 style={{ marginTop: 12 }}>Choisissez un mode de jeu</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 16 }}>
        <Card title="Jouer en mode Solo" subtitle="Partie locale rapide" onClick={() => go('solo')} />
        <Card title="Jouer en multijoueur en ligne" subtitle="Créer / rejoindre une salle" onClick={() => go('online')} />
        <Card title="Jouer en classe" subtitle="Session encadrée pour la classe" onClick={() => go('classroom')} />
        <Card title="Jouer en mode tournois" subtitle="Organiser plusieurs manches et équipes" onClick={() => go('tournament')} />
      </div>
      {Array.isArray(history) && history.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Dernières sessions</h3>
            <button onClick={() => setShowAll(s => !s)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' }}>
              {showAll ? 'Réduire' : 'Voir tout'}
            </button>
          </div>
          <div style={{ marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            {(showAll ? history : history.slice(0, 5)).map((s, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 160px', gap: 8, padding: '8px 12px', borderTop: idx===0 ? 'none' : '1px solid #f3f4f6', background: idx % 2 ? '#fff' : '#fafafa' }}>
                <div style={{ fontFamily: 'monospace', color: '#374151' }}>{new Date(s.endedAt || Date.now()).toLocaleString()}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong style={{ color: '#111827' }}>{(s.mode || '—').toUpperCase()}</strong>
                  {s.roomCode ? ` • Salle ${s.roomCode}` : ''}
                  {Array.isArray(s.scores) && s.scores.length > 0 && (
                    <span style={{ color: '#6b7280' }}> • Scores: {s.scores.map(p => `${p.name||'Joueur'}:${p.score||0}`).join(' | ')}</span>
                  )}
                </div>
                <div style={{ textAlign: 'right', color: '#374151' }}>
                  {s.winner ? `Gagnant: ${s.winner.name} (${s.winner.score||0})` : '—'}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
