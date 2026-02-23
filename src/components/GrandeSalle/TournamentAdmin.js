import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../../utils/subscription';

const PAGE = { minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', color: '#fff', padding: '20px 16px' };
const CARD = { background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.1)' };
const INPUT = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const BTN = (bg) => ({ padding: '10px 20px', borderRadius: 10, border: 'none', background: bg, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' });
const BADGE = (c) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 14, background: c, fontSize: 11, fontWeight: 700 });

const STATUS_COLORS = { scheduled: '#3b82f6', open: '#10b981', playing: '#F5A623', finished: '#6b7280', cancelled: '#ef4444' };
const STATUS_LABELS = { scheduled: 'Programmé', open: 'Ouvert', playing: 'En cours', finished: 'Terminé', cancelled: 'Annulé' };

const AVAILABLE_THEMES = [
  'Plantes médicinales', 'Géographie', 'Animaux', 'Fruits & Légumes',
  'Table de 2', 'Table de 3', 'Table de 4', 'Table de 5',
  'Table de 6', 'Table de 7', 'Table de 8', 'Table de 9',
];
const AVAILABLE_CLASSES = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];

function getToken() {
  try {
    const a = JSON.parse(localStorage.getItem('cc_auth') || '{}');
    return a.token || a.access_token || null;
  } catch { return null; }
}

export default function TournamentAdmin() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [themes, setThemes] = useState([]);
  const [classes, setClasses] = useState(['CP', 'CE1', 'CE2', 'CM1', 'CM2']);
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationRound, setDurationRound] = useState(90);
  const [eliminationPercent, setEliminationPercent] = useState(25);
  const [minPlayers, setMinPlayers] = useState(3);

  const backendUrl = getBackendUrl();

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${backendUrl}/api/gs/tournaments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.ok) setTournaments(json.tournaments || []);
    } catch (e) { console.error('[GS Admin] Fetch error:', e); }
    setLoading(false);
  }, [backendUrl]);

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);

  const resetForm = () => {
    setTitle(''); setDescription(''); setThemes([]); setClasses(['CP', 'CE1', 'CE2', 'CM1', 'CM2']);
    setScheduledAt(''); setDurationRound(90); setEliminationPercent(25); setMinPlayers(3);
    setEditId(null); setShowForm(false); setError(null);
  };

  const openEdit = (t) => {
    setEditId(t.id); setTitle(t.title); setDescription(t.description || '');
    setThemes(t.themes || []); setClasses(t.classes || []);
    const d = new Date(t.scheduled_at);
    setScheduledAt(d.toISOString().slice(0, 16));
    setDurationRound(t.duration_round || 90); setEliminationPercent(t.elimination_percent || 25);
    setMinPlayers(t.min_players || 3); setShowForm(true); setError(null);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Le titre est requis'); return; }
    if (!scheduledAt) { setError('La date est requise'); return; }
    setSaving(true); setError(null);

    const payload = {
      title: title.trim(), description: description.trim(), themes, classes,
      scheduled_at: new Date(scheduledAt).toISOString(),
      duration_round: durationRound, elimination_percent: eliminationPercent, min_players: minPlayers,
    };

    try {
      const token = getToken();
      const url = editId ? `${backendUrl}/api/gs/tournaments/${editId}` : `${backendUrl}/api/gs/tournaments`;
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) { resetForm(); fetchTournaments(); }
      else setError(json.error || 'Erreur inconnue');
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce tournoi ?')) return;
    try {
      const token = getToken();
      await fetch(`${backendUrl}/api/gs/tournaments/${id}`, {
        method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      fetchTournaments();
    } catch (e) { console.error(e); }
  };

  const toggleTheme = (t) => setThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const toggleClass = (c) => setClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const upcoming = tournaments.filter(t => ['scheduled', 'open'].includes(t.status));
  const past = tournaments.filter(t => ['finished', 'cancelled', 'playing'].includes(t.status));

  return (
    <div style={PAGE}><div style={{ maxWidth: 800, margin: '0 auto' }}>
      <button onClick={() => navigate('/modes')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', marginBottom: 20 }}>← Retour</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #F5A623, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Tournois Grande Salle</h1>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: '4px 0 0' }}>Créez et gérez vos événements</p>
        </div>
        {!showForm && <button onClick={() => { resetForm(); setShowForm(true); }} style={BTN('linear-gradient(135deg, #F5A623, #ff6b35)')}>+ Nouveau Tournoi</button>}
      </div>

      {/* CREATE / EDIT FORM */}
      {showForm && (
        <div style={{ ...CARD, marginBottom: 24, border: '1px solid rgba(245,166,35,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, color: '#F5A623' }}>{editId ? 'Modifier le tournoi' : 'Nouveau tournoi'}</h2>
            <button onClick={resetForm} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>

          {error && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Titre du tournoi *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Tournoi Géographie Antilles" style={INPUT} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Gagnez un voyage avec notre partenaire X !" rows={2} style={{ ...INPUT, resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Date et heure *</label>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={INPUT} />
            </div>

            {/* Themes */}
            <div>
              <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6, display: 'block' }}>Thématiques {themes.length === 0 && <span style={{ color: '#64748b' }}>(toutes si vide)</span>}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {AVAILABLE_THEMES.map(t => (
                  <button key={t} onClick={() => toggleTheme(t)} style={{ padding: '5px 12px', borderRadius: 8, border: themes.includes(t) ? '2px solid #F5A623' : '1px solid rgba(255,255,255,0.15)', background: themes.includes(t) ? 'rgba(245,166,35,0.2)' : 'rgba(255,255,255,0.04)', color: themes.includes(t) ? '#F5A623' : '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: themes.includes(t) ? 700 : 400 }}>{t}</button>
                ))}
              </div>
            </div>

            {/* Classes */}
            <div>
              <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6, display: 'block' }}>Niveaux</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {AVAILABLE_CLASSES.map(c => (
                  <button key={c} onClick={() => toggleClass(c)} style={{ padding: '5px 14px', borderRadius: 8, border: classes.includes(c) ? '2px solid #1AACBE' : '1px solid rgba(255,255,255,0.15)', background: classes.includes(c) ? 'rgba(26,172,190,0.2)' : 'rgba(255,255,255,0.04)', color: classes.includes(c) ? '#1AACBE' : '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: classes.includes(c) ? 700 : 400 }}>{c}</button>
                ))}
              </div>
            </div>

            {/* Settings row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Durée manche (s)</label>
                <input type="number" value={durationRound} onChange={e => setDurationRound(Number(e.target.value))} min={30} max={300} style={INPUT} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>% élimination</label>
                <input type="number" value={eliminationPercent} onChange={e => setEliminationPercent(Number(e.target.value))} min={10} max={50} style={INPUT} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Joueurs min.</label>
                <input type="number" value={minPlayers} onChange={e => setMinPlayers(Number(e.target.value))} min={2} max={100} style={INPUT} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={handleSave} disabled={saving} style={BTN(saving ? '#64748b' : 'linear-gradient(135deg, #F5A623, #ff6b35)')}>{saving ? 'Enregistrement...' : editId ? 'Modifier' : 'Créer le tournoi'}</button>
            <button onClick={resetForm} style={BTN('rgba(255,255,255,0.1)')}>Annuler</button>
          </div>
        </div>
      )}

      {/* UPCOMING */}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>Prochains tournois ({upcoming.length})</h2>
      {loading ? <div style={{ color: '#64748b', padding: 20 }}>Chargement...</div> : upcoming.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', color: '#64748b', padding: 30 }}>Aucun tournoi programmé</div>
      ) : upcoming.map(t => (
        <div key={t.id} style={{ ...CARD, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{t.title}</span>
              <span style={BADGE(STATUS_COLORS[t.status] || '#64748b')}>{STATUS_LABELS[t.status] || t.status}</span>
            </div>
            {t.description && <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{t.description}</div>}
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {new Date(t.scheduled_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {(t.themes || []).length > 0 && <span> — {t.themes.join(', ')}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => openEdit(t)} style={BTN('rgba(59,130,246,0.3)')}>Modifier</button>
            <button onClick={() => handleDelete(t.id)} style={BTN('rgba(239,68,68,0.3)')}>Supprimer</button>
          </div>
        </div>
      ))}

      {/* PAST */}
      {past.length > 0 && <>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginTop: 30, marginBottom: 12 }}>Historique ({past.length})</h2>
        {past.map(t => (
          <div key={t.id} style={{ ...CARD, marginBottom: 8, opacity: 0.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{t.title}</span>
                <span style={{ ...BADGE(STATUS_COLORS[t.status] || '#64748b'), marginLeft: 8 }}>{STATUS_LABELS[t.status] || t.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {new Date(t.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
            {t.winner_name && <div style={{ fontSize: 13, color: '#F5A623', marginTop: 6 }}>🏆 {t.winner_name} ({t.winner_score} pts) — {t.total_players} joueurs, {t.total_rounds} manches</div>}
          </div>
        ))}
      </>}
    </div></div>
  );
}
