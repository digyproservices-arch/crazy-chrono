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
  const Card = ({ title, subtitle, onClick, icon, gradient }) => (
    <button onClick={onClick} style={{
      width: '100%',
      textAlign: 'left',
      padding: 24,
      borderRadius: 16,
      border: 'none',
      background: gradient || 'linear-gradient(135deg, #1AACBE 0%, #0D6A7A 100%)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
      color: '#fff',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      position: 'relative',
      overflow: 'hidden'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = '0 15px 40px rgba(0,0,0,0.25)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
    }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ opacity: 0.9, fontSize: 14, lineHeight: 1.5 }}>{subtitle}</div>
    </button>
  );
  return (
    <div style={{ maxWidth: 980, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ 
          fontSize: 42, 
          fontWeight: 900, 
          background: 'linear-gradient(135deg, #1AACBE 0%, #0D6A7A 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 12
        }}>
          🎮 Choisissez votre mode
        </h1>
        <p style={{ fontSize: 16, color: '#6B5443', maxWidth: 500, margin: '0 auto' }}>
          Sélectionnez un mode de jeu pour commencer à vous amuser !
        </p>
      </div>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
        gap: 24, 
        marginTop: 32 
      }}>
        <Card 
          title="Mode Solo" 
          subtitle="Jouez seul et améliorez vos compétences à votre rythme"
          icon="🎯"
          gradient="linear-gradient(135deg, #1AACBE 0%, #148A9C 100%)"
          onClick={() => go('solo')} 
        />
        <Card 
          title="Multijoueur" 
          subtitle="Défiez vos amis en ligne et créez des parties privées"
          icon="👥"
          gradient="linear-gradient(135deg, #F5A623 0%, #d4900e 100%)"
          onClick={() => go('online')} 
        />
        <Card 
          title="Mes Performances" 
          subtitle="Analyse ta progression, ta rapidité et ta précision match par match"
          icon="📊"
          gradient="linear-gradient(135deg, #0D6A7A 0%, #148A9C 100%)"
          onClick={() => navigate('/my-performance')} 
        />
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
