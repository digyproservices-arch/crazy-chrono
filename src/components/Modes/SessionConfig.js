import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataContext } from '../../context/DataContext';
import { isFree } from '../../utils/subscription';
import PedagogicConfig, { CARD, SECTION_TITLE } from '../Shared/PedagogicConfig';
import { getBackendUrl } from '../../utils/apiHelpers';

const MODE_META = {
  solo: { icon: '🎮', label: 'Solo', desc: 'Jouez seul et progressez à votre rythme' },
  online: { icon: '🌐', label: 'Multijoueur en ligne', desc: 'Affrontez d\'autres joueurs en temps réel' },
  classroom: { icon: '🏫', label: 'Classe', desc: 'Session encadrée par un enseignant' },
  tournament: { icon: '🏆', label: 'Tournoi', desc: 'Compétition Battle Royale entre joueurs' },
};


export default function SessionConfig() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const { data } = useContext(DataContext);

  // Gate abonnement: multijoueur réservé aux abonnés
  useEffect(() => {
    if (mode === 'online' && isFree()) {
      navigate('/pricing', { replace: true });
    }
  }, [mode, navigate]);

  // Config pédagogique gérée par le composant partagé PedagogicConfig
  const [pedConfig, setPedConfig] = useState(null);
  const initialPedConfig = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('cc_session_cfg') || 'null') || undefined; } catch { return undefined; }
  }, []);

  // Detect PWA install banner height to shift action bar above it
  const [pwaBarHeight, setPwaBarHeight] = useState(() => document.body.style.paddingBottom || 0);
  useEffect(() => {
    const check = () => setPwaBarHeight(document.body.style.paddingBottom || 0);
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    return () => obs.disconnect();
  }, []);

  // ===== Mode-spécifique =====
  // Online (multijoueur)
  const [playerName, setPlayerName] = useState(() => {
    try {
      const a = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (a.name && a.name !== 'Utilisateur') return a.name;
      if (a.firstName) return [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
      if (a.email) return a.email.split('@')[0];
    } catch {}
    return '';
  });
  const [roomMode, setRoomMode] = useState('create'); // 'create' | 'join'
  const [roomCode, setRoomCode] = useState('');
  const [inLobby, setInLobby] = useState(false); // Salle d'attente
  const [lobbyPlayers, setLobbyPlayers] = useState([]); // Joueurs dans la salle
  const genCode = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
    setRoomCode(code);
  };

  // Classroom
  const [teacherName, setTeacherName] = useState('');
  const [students, setStudents] = useState([]); // [{id, name, licensed:true}]
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  useEffect(() => {
    if (mode !== 'classroom') return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/students`);
        if (!res.ok) throw new Error('http');
        const arr = await res.json();
        if (!cancelled) setStudents(Array.isArray(arr) ? arr : []);
      } catch {
        // Fallback local si backend absent
        const demo = [
          { id: 's1', name: 'Alice B.', licensed: true },
          { id: 's2', name: 'Boris C.', licensed: true },
          { id: 's3', name: 'Chloé D.', licensed: false },
          { id: 's4', name: 'David E.', licensed: true },
        ];
        if (!cancelled) setStudents(demo);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [mode]);
  const toggleStudent = (id) => {
    setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  };
  const filteredStudents = useMemo(() => {
    const q = studentQuery.toLowerCase().trim();
    return students.filter(s => (s.licensed) && (!q || (s.name||'').toLowerCase().includes(q)));
  }, [students, studentQuery]);

  // Persister la config pédagogique (léger debounce)
  useEffect(() => {
    if (!pedConfig) return;
    const t = setTimeout(() => {
      try {
        const { dataStats: _ds, ...rest } = pedConfig;
        const payload = { mode, ...rest };
        localStorage.setItem('cc_session_cfg', JSON.stringify(payload));
        if (pedConfig.playerZone) localStorage.setItem('cc_player_zone', pedConfig.playerZone);
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [mode, pedConfig]);

  const onStart = () => {
    if (!pedConfig) return;
    const { dataStats: _ds, ...rest } = pedConfig;
    const payload = { mode, ...rest };
    if (mode === 'online') {
      payload.playerName = playerName || 'Joueur';
      payload.room = { type: roomMode, code: (roomCode||'').toUpperCase() };
    }
    if (mode === 'classroom') {
      payload.classroom = { teacherName: teacherName || '', studentIds: selectedStudentIds };
    }
    try { localStorage.setItem('cc_session_cfg', JSON.stringify(payload)); } catch {}
    
    // Redirection selon le mode
    if (mode === 'tournament') {
      navigate('/tournament/setup');
    } else {
      navigate('/carte');
    }
    
    try { window.dispatchEvent(new CustomEvent('cc:sessionConfigured', { detail: payload })); } catch {}
  };

  const modeMeta = MODE_META[mode] || { icon: '🎮', label: mode, desc: '' };
  const PILL = (sel) => ({
    padding: '7px 14px', borderRadius: 10, border: sel ? '2px solid #0D6A7A' : '2px solid #e2e8f0',
    background: sel ? '#0D6A7A' : '#fff', color: sel ? '#fff' : '#475569',
    fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
  });
  const PILL_ZONE = (sel) => ({
    padding: '6px 12px', borderRadius: 10, border: sel ? '2px solid #0D6A7A' : '2px solid #e2e8f0',
    background: sel ? '#0D6A7A' : '#fff', color: sel ? '#fff' : '#475569',
    fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
  });

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 16px 80px' }}>

      {/* ===== MODE BANNER ===== */}
      <div style={{ background: 'linear-gradient(135deg, #0D6A7A 0%, #1AACBE 100%)', borderRadius: 18, padding: '24px 28px', marginBottom: 20, color: '#fff', boxShadow: '0 4px 20px rgba(13,106,122,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 36 }}>{modeMeta.icon}</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Configurer la session</h1>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 2 }}>Mode {modeMeta.label} — {modeMeta.desc}</div>
          </div>
        </div>
      </div>

      {/* ===== CONFIG PÉDAGOGIQUE (composant partagé Solo/Training/Arena) ===== */}
      <PedagogicConfig
        data={data}
        onChange={setPedConfig}
        initialConfig={initialPedConfig}
        options={{ showPlayerZone: true, showFreeLimits: true, showAllowEmptyMath: true, showObjectiveTarget: true }}
      />

      {/* ===== 5. MODE-SPÉCIFIQUE: Multijoueur ===== */}
      {mode === 'online' && (
        <div style={CARD}>
          <h3 style={SECTION_TITLE}><span>🌐</span> Multijoueur en ligne</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Nom du joueur</label>
              <input value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="ex: Léa"
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Type de salle</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setRoomMode('create')} style={PILL(roomMode === 'create')}>Créer</button>
                <button onClick={() => setRoomMode('join')} style={PILL(roomMode === 'join')}>Rejoindre</button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Code de salle</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder={roomMode==='create' ? 'Générer un code' : 'Saisir le code'}
                  style={{ flex: 1, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 13, letterSpacing: '0.1em', fontWeight: 700 }} />
                {roomMode==='create' && (
                  <button onClick={genCode} style={{ padding: '10px 14px', borderRadius: 10, border: '2px solid #0D6A7A', background: '#f0fdfa', color: '#0D6A7A', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Générer</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 5. MODE-SPÉCIFIQUE: Classe ===== */}
      {mode === 'classroom' && (
        <div style={CARD}>
          <h3 style={SECTION_TITLE}><span>🏫</span> Configuration de la classe</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Nom de l'enseignant(e)</label>
              <input value={teacherName} onChange={e=>setTeacherName(e.target.value)} placeholder="ex: Mme Martin"
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Élèves (licences actives)</label>
              <input value={studentQuery} onChange={e=>setStudentQuery(e.target.value)} placeholder="🔍 Rechercher un élève..."
                style={{ width: '100%', padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ border: '2px solid #e2e8f0', borderRadius: 10, padding: 10, maxHeight: 200, overflow: 'auto' }}>
                {filteredStudents.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', borderRadius: 6, cursor: 'pointer', background: selectedStudentIds.includes(s.id) ? '#f0fdfa' : 'transparent' }}>
                    <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={()=>toggleStudent(s.id)} />
                    <span style={{ fontSize: 13, fontWeight: selectedStudentIds.includes(s.id) ? 700 : 400, color: '#334155' }}>{s.name}</span>
                  </label>
                ))}
                {filteredStudents.length === 0 && (
                  <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 12 }}>Aucun élève trouvé</div>
                )}
              </div>
              {selectedStudentIds.length > 0 && (
                <div style={{ fontSize: 11, color: '#0D6A7A', fontWeight: 600, marginTop: 6 }}>{selectedStudentIds.length} élève(s) sélectionné(s)</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== ACTION BAR (sticky bottom — above PWA banner if visible) ===== */}
      <div style={{ position: 'fixed', bottom: pwaBarHeight, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', justifyContent: 'center', gap: 12, zIndex: 100, boxShadow: '0 -2px 10px rgba(0,0,0,0.06)', transition: 'bottom 0.3s ease' }}>
        <button onClick={() => navigate('/modes')}
          style={{ padding: '12px 24px', borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          ← Retour
        </button>
        <button onClick={onStart}
          style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #0D6A7A 0%, #1AACBE 100%)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 14px rgba(13,106,122,0.35)', letterSpacing: '-0.01em' }}>
          {modeMeta.icon} Démarrer la partie
        </button>
      </div>
    </div>
  );
}
