import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../../utils/subscription';
import { DataContext } from '../../context/DataContext';
import PedagogicConfig from '../Shared/PedagogicConfig';

const PAGE = { minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', color: '#fff', padding: '20px 16px' };
const CARD = { background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.1)' };
const INPUT = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const BTN = (bg) => ({ padding: '10px 20px', borderRadius: 10, border: 'none', background: bg, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' });
const BADGE = (c) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 14, background: c, fontSize: 11, fontWeight: 700 });

const STATUS_COLORS = { scheduled: '#3b82f6', open: '#10b981', playing: '#F5A623', finished: '#6b7280', cancelled: '#ef4444' };
const STATUS_LABELS = { scheduled: 'Programmé', open: 'Ouvert', playing: 'En cours', finished: 'Terminé', cancelled: 'Annulé' };

const ACCESS_TYPES = [
  { key: 'free', label: 'Gratuit', icon: '🎉', color: '#10b981', desc: 'Ouvert à tous, sans paiement' },
  { key: 'subscribers', label: 'Abonnés', icon: '⭐', color: '#F5A623', desc: 'Réservé aux abonnés Crazy Chrono' },
  { key: 'paid', label: 'Payant', icon: '💳', color: '#8b5cf6', desc: 'Participation payante (gratuit pour les abonnés)' },
];

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

  const { data } = useContext(DataContext);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationRound, setDurationRound] = useState(90);
  const [eliminationPercent, setEliminationPercent] = useState(25);
  const [minPlayers, setMinPlayers] = useState(3);
  const [manualStart, setManualStart] = useState(true);
  const [accessType, setAccessType] = useState('free');
  const [entryPrice, setEntryPrice] = useState(0);
  const [partnerName, setPartnerName] = useState('');
  const [partnerLogoUrl, setPartnerLogoUrl] = useState('');
  const [partnerLot, setPartnerLot] = useState('');
  const [partnerVideoUrl, setPartnerVideoUrl] = useState('');
  const pedagogicRef = useRef({});
  const [pedInitial, setPedInitial] = useState(null);

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
    setTitle(''); setDescription('');
    setScheduledAt(''); setDurationRound(90); setEliminationPercent(25); setMinPlayers(3);
    setManualStart(true); setAccessType('free'); setEntryPrice(0);
    setPartnerName(''); setPartnerLogoUrl(''); setPartnerLot(''); setPartnerVideoUrl('');
    setPedInitial(null); pedagogicRef.current = {};
    setEditId(null); setShowForm(false); setError(null);
  };

  const openEdit = (t) => {
    setEditId(t.id); setTitle(t.title); setDescription(t.description || '');
    const d = new Date(t.scheduled_at);
    setScheduledAt(d.toISOString().slice(0, 16));
    setDurationRound(t.duration_round || 90); setEliminationPercent(t.elimination_percent || 25);
    setMinPlayers(t.min_players || 3); setManualStart(t.manual_start !== false);
    setAccessType(t.access_type || 'free'); setEntryPrice(t.entry_price || 0);
    setPartnerName(t.partner_name || ''); setPartnerLogoUrl(t.partner_logo_url || '');
    setPartnerLot(t.partner_lot || ''); setPartnerVideoUrl(t.partner_video_url || '');
    // Restaurer la config pédagogique
    const pc = t.pedagogic_config || {};
    setPedInitial({
      selectedLevel: pc.selectedLevel || t.selected_level || 'CP',
      extras: pc.extras || [],
      enabledDomains: pc.enabledDomains || undefined,
      themes: t.themes || [],
      classes: t.classes || [],
    });
    setShowForm(true); setError(null);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Le titre est requis'); return; }
    if (!scheduledAt) { setError('La date est requise'); return; }
    setSaving(true); setError(null);

    const pc = pedagogicRef.current || {};
    const payload = {
      title: title.trim(), description: description.trim(),
      themes: pc.themes || [], classes: pc.classes || [],
      scheduled_at: new Date(scheduledAt).toISOString(),
      duration_round: pc.duration || durationRound || 60, elimination_percent: eliminationPercent, min_players: minPlayers,
      manual_start: manualStart,
      access_type: accessType,
      entry_price: accessType === 'paid' ? Math.max(0, entryPrice) : 0,
      selected_level: pc.selectedLevel || 'CP',
      pedagogic_config: pc,
      partner_name: partnerName.trim(),
      partner_logo_url: partnerLogoUrl.trim(),
      partner_lot: partnerLot.trim(),
      partner_video_url: partnerVideoUrl.trim(),
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

            {/* Type d'accès */}
            <div>
              <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6, display: 'block' }}>Type d’accès</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {ACCESS_TYPES.map(at => (
                  <button key={at.key} onClick={() => setAccessType(at.key)} style={{
                    padding: '12px 10px', borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                    border: accessType === at.key ? `2px solid ${at.color}` : '1px solid rgba(255,255,255,0.15)',
                    background: accessType === at.key ? `${at.color}22` : 'rgba(255,255,255,0.04)',
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{at.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: accessType === at.key ? at.color : '#94a3b8' }}>{at.label}</div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{at.desc}</div>
                  </button>
                ))}
              </div>
              {accessType === 'paid' && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Prix d’entrée (€)</label>
                  <input type="number" value={entryPrice / 100} onChange={e => setEntryPrice(Math.round(Number(e.target.value) * 100))} min={0} step={0.5} style={INPUT} />
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Les abonnés participent gratuitement</div>
                </div>
              )}
            </div>

            {/* Configuration pédagogique (niveaux, thèmes, domaines) */}
            <div>
              <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6, display: 'block' }}>Configuration pédagogique</label>
              <PedagogicConfig
                data={data}
                onChange={(cfg) => { pedagogicRef.current = cfg; }}
                initialConfig={pedInitial}
                options={{ showPlayerZone: false, showFreeLimits: false, showAllowEmptyMath: false, showObjectiveTarget: false, showObjectiveMode: false, hideHelp: true }}
              />
            </div>

            {/* Partenaire (lot sponsorisé) */}
            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: '#F5A623', fontWeight: 700 }}>🏆 Partenaire — lot à gagner (optionnel)</label>
                <button type="button" onClick={() => { setPartnerName('Crazy Chrono'); setPartnerLot('3 mois d\'abonnement offerts'); setPartnerLogoUrl('/images/logo_crazy_chrono.png'); setPartnerVideoUrl(''); }} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(245,166,35,0.25)', color: '#F5A623', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>⭐ Lot interne</button>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Nom du partenaire</label>
                    <input value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder="Ex: Librairie Antilles" style={INPUT} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>URL du logo</label>
                    <input value={partnerLogoUrl} onChange={e => setPartnerLogoUrl(e.target.value)} placeholder="https://.../logo.png" style={INPUT} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Description du lot</label>
                  <input value={partnerLot} onChange={e => setPartnerLot(e.target.value)} placeholder="Ex: Une tablette + un bon d'achat de 50€" style={INPUT} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Vidéo YouTube de présentation du lot</label>
                  <input value={partnerVideoUrl} onChange={e => setPartnerVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." style={INPUT} />
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Diffusée dans la salle d'attente du tournoi (chaîne YouTube Crazy Chrono)</div>
                </div>
                {partnerLogoUrl.trim() && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={partnerLogoUrl.trim()} alt="Logo partenaire" style={{ height: 40, borderRadius: 6, background: '#fff', padding: 4 }} onError={(e) => { e.target.style.display = 'none'; }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>Aperçu du logo</span>
                  </div>
                )}
              </div>
            </div>

            {/* Lancement manuel */}
            <div
              onClick={() => setManualStart(!manualStart)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: manualStart ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)', border: manualStart ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 22 }}>{manualStart ? '✅' : '⬜'}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: manualStart ? '#10b981' : '#94a3b8' }}>Lancement manuel</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{manualStart ? 'Vous décidez quand le jeu démarre' : 'Le jeu démarre automatiquement après 60s'}</div>
              </div>
            </div>

            {/* Settings row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              {(() => { const at = ACCESS_TYPES.find(a => a.key === (t.access_type || 'free')); return at ? <span style={{ ...BADGE(at.color + '33'), color: at.color }}>{at.icon} {at.label}{t.access_type === 'paid' && t.entry_price ? ` (${(t.entry_price / 100).toFixed(2)}€)` : ''}</span> : null; })()}
              {t.partner_name && <span style={{ ...BADGE('rgba(245,166,35,0.25)'), color: '#F5A623' }}>🏆 {t.partner_name}</span>}
            </div>
            {t.description && <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{t.description}</div>}
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {new Date(t.scheduled_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {t.selected_level && <span> — Niveau {t.selected_level}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => navigate(`/grande-salle/live/${t.id}`)} style={BTN('rgba(16,185,129,0.3)')}>📺 Live</button>
            <button onClick={() => {
              const url = `${window.location.origin}/grande-salle/join/${t.id}`;
              navigator.clipboard?.writeText(url).then(() => alert('Lien copié !')).catch(() => prompt('Copiez ce lien :', url));
            }} style={BTN('rgba(139,92,246,0.3)')}>🔗 Copier lien</button>
            <button onClick={() => openEdit(t)} style={BTN('rgba(59,130,246,0.3)')}>Modifier</button>
            <button onClick={() => handleDelete(t.id)} style={BTN('rgba(239,68,68,0.3)')}>Supprimer</button>
          </div>
          {/* QR preview mini */}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(`${window.location.origin}/grande-salle/join/${t.id}`)}&color=0D6A7A`} alt="QR" style={{ width: 48, height: 48, borderRadius: 6, background: '#fff', padding: 2 }} />
            <span style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-all' }}>{window.location.origin}/grande-salle/join/{t.id}</span>
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
