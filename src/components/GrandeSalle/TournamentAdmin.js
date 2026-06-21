import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../../utils/subscription';
import { DataContext } from '../../context/DataContext';
import PedagogicConfig from '../Shared/PedagogicConfig';
import { generateDrawSeed, shuffleArrayWithSeed, positionLabel, getTieRanks } from '../../utils/draw';

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

  // Détail historique (podium + classement + cartes générées)
  const [detail, setDetail] = useState(null); // { tournament, ranking, rounds }
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

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


  const openDetails = async (t) => {
    setDetail({ tournament: t, ranking: [], rounds: [] });
    setDetailLoading(true);
    setDetailError(null);
    try {
      const token = getToken();
      const res = await fetch(`${backendUrl}/api/gs/tournaments/${t.id}/details`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.ok) setDetail({ tournament: json.tournament || t, ranking: json.ranking || [], rounds: json.rounds || [], draws: json.draws || [] });
      else setDetailError(json.error || 'Erreur inconnue');
    } catch (e) { setDetailError(e.message); }
    setDetailLoading(false);
  };

  // Enregistre un tirage effectué depuis l'historique puis rafraîchit la liste des tirages
  const saveHistoryDraw = async (tournamentId, payload) => {
    try {
      const token = getToken();
      await fetch(`${backendUrl}/api/gs/tournaments/${tournamentId}/draws`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...payload, drawn_from: 'history' }),
      });
      const res = await fetch(`${backendUrl}/api/gs/tournaments/${tournamentId}/draws`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.ok) setDetail(d => (d && d.tournament?.id === tournamentId) ? { ...d, draws: json.draws } : d);
    } catch (e) { console.warn('[GS Admin] saveHistoryDraw error:', e.message); }
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
          <div key={t.id} onClick={() => openDetails(t)} title="Voir le détail (podium, classement, cartes)" style={{ ...CARD, marginBottom: 8, opacity: 0.85, cursor: 'pointer', transition: 'opacity 0.15s, border-color 0.15s', border: '1px solid rgba(255,255,255,0.1)' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.borderColor = 'rgba(245,166,35,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = 0.85; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{t.title}</span>
                <span style={{ ...BADGE(STATUS_COLORS[t.status] || '#64748b'), marginLeft: 8 }}>{STATUS_LABELS[t.status] || t.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
                {new Date(t.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                <span style={{ color: '#F5A623', fontWeight: 700 }}>Détail →</span>
              </div>
            </div>
            {t.winner_name && <div style={{ fontSize: 13, color: '#F5A623', marginTop: 6 }}>🏆 {t.winner_name} ({t.winner_score} pts) — {t.total_players} joueurs, {t.total_rounds} manches</div>}
          </div>
        ))}
      </>}

      {detail && (
        <TournamentDetailModal
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onSaveDraw={saveHistoryDraw}
          onClose={() => { setDetail(null); setDetailError(null); }}
        />
      )}
    </div></div>
  );
}

// ==========================================
// MODAL DÉTAIL HISTORIQUE — podium, classement, cartes générées
// ==========================================
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const RANK_COLORS = { 1: '#F5A623', 2: '#cbd5e1', 3: '#cd7f32' };

function PairTypeLabel(type) {
  if (type === 'TI') return 'Texte ↔ Image';
  if (type === 'CC') return 'Calcul ↔ Chiffre';
  return type || '—';
}

function isImageUrl(s) {
  return typeof s === 'string' && (/^https?:\/\//.test(s) || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(s));
}

function TournamentDetailModal({ detail, loading, error, onSaveDraw, onClose }) {
  const t = detail.tournament || {};
  const ranking = detail.ranking || [];
  const rounds = detail.rounds || [];
  const draws = detail.draws || [];
  const byRank = (r) => ranking.filter(p => (p.finalRank || 0) === r);
  const tieRanks = getTieRanks(ranking);

  // Tirage relancé depuis l'historique : { spinning, position, label, seed, winner }
  const [draw, setDraw] = useState(null);

  const runDraw = (position) => {
    const candidates = (position == null
      ? ranking
      : ranking.filter(p => (p.finalRank || 0) === position)
    ).map(p => ({ id: p.id, name: p.name, score: p.score }));
    if (candidates.length === 0) return;
    const label = positionLabel(position);
    const seed = generateDrawSeed();
    setDraw({ spinning: true, position, label, seed, winner: null });
    setTimeout(() => {
      const winner = shuffleArrayWithSeed(candidates, seed)[0];
      setDraw({ spinning: false, position, label, seed, winner });
      if (onSaveDraw && t.id) onSaveDraw(t.id, { position, label, seed, candidates, winner });
    }, 2500);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 16, maxWidth: 760, width: '100%', padding: 24, color: '#e2e8f0', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: '#F5A623', fontWeight: 900 }}>{t.title || 'Tournoi'}</h2>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {t.scheduled_at && new Date(t.scheduled_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {t.total_players != null && <span> · {t.total_players} joueurs · {t.total_rounds || 0} manches</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {loading && <div style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>Chargement du détail…</div>}
        {error && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {!loading && ranking.length === 0 && rounds.length === 0 && !error && (
          <div style={{ color: '#94a3b8', padding: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13 }}>
            Aucun détail enregistré pour ce tournoi. Les tournois joués <strong>après cette mise à jour</strong> afficheront le classement complet et les cartes générées.
          </div>
        )}

        {/* PODIUM */}
        {ranking.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Podium</h3>
            {[1, 2, 3].map(r => {
              const players = byRank(r);
              if (players.length === 0) return null;
              return (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 6, borderRadius: 10, background: `${RANK_COLORS[r]}1a`, border: `1px solid ${RANK_COLORS[r]}55` }}>
                  <span style={{ fontSize: 22 }}>{MEDALS[r]}</span>
                  <span style={{ flex: 1, fontWeight: 700 }}>
                    {players.map(p => p.name).join(' · ')}
                    {players.length > 1 && <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}> (ex-aequo)</span>}
                  </span>
                  <span style={{ fontWeight: 800, color: RANK_COLORS[r] }}>{players[0].score} pts</span>
                </div>
              );
            })}
          </div>
        )}

        {/* CLASSEMENT COMPLET */}
        {ranking.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Classement complet ({ranking.length})</h3>
            <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
              {ranking.map((p, i) => (
                <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 12px', background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent', fontSize: 13 }}>
                  <span style={{ width: 34, fontWeight: 800, color: p.finalRank <= 3 ? RANK_COLORS[p.finalRank] : '#64748b' }}>#{p.finalRank}</span>
                  <span style={{ flex: 1, fontWeight: 600 }}>{p.name}{p.eliminated ? <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 6 }}>éliminé</span> : null}</span>
                  <span style={{ fontWeight: 700, color: '#94a3b8' }}>{p.score} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TIRAGE AU SORT (relançable depuis l'historique) */}
        {ranking.length > 0 && (
          <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: 'rgba(245,166,35,0.08)', border: '2px dashed rgba(245,166,35,0.4)' }}>
            <h3 style={{ fontSize: 14, color: '#F5A623', margin: '0 0 10px', fontWeight: 800 }}>🎲 Tirage au sort</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              {tieRanks.length > 0 ? (
                <>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Départager la :</span>
                  {tieRanks.map(r => (
                    <button key={r} onClick={() => runDraw(r)} disabled={draw?.spinning}
                      style={{ padding: '7px 14px', borderRadius: 10, border: '2px solid #FFD34D', background: 'rgba(245,166,35,0.3)', color: '#FFD34D', fontSize: 12, fontWeight: 700, cursor: draw?.spinning ? 'wait' : 'pointer' }}>
                      {positionLabel(r)} ({byRank(r).length} ex-aequo)
                    </button>
                  ))}
                </>
              ) : (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>Aucune égalité à départager.</span>
              )}
              <button onClick={() => runDraw(null)} disabled={draw?.spinning}
                style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.2)', color: '#10b981', fontSize: 12, fontWeight: 700, cursor: draw?.spinning ? 'wait' : 'pointer' }}>
                🎲 Tous les participants
              </button>
            </div>
            {draw?.spinning && (
              <div style={{ fontSize: 13, color: '#FFD34D', fontWeight: 700 }}>Tirage en cours… <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>graine {draw.seed}</span></div>
            )}
            {draw && !draw.spinning && draw.winner && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(245,166,35,0.25), rgba(255,107,53,0.25))', border: '1px solid rgba(245,166,35,0.5)' }}>
                <span style={{ fontSize: 20 }}>🏆</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{draw.winner.name} <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>— {draw.label}</span></div>
                  <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>🔐 graine {draw.seed}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TIRAGES ENREGISTRÉS */}
        {draws.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Tirages enregistrés ({draws.length})</h3>
            {draws.map((d, i) => (
              <div key={d.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 6, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12 }}>
                <span style={{ fontSize: 16 }}>🎲</span>
                <div style={{ flex: 1 }}>
                  <div><strong style={{ color: '#e2e8f0' }}>{d.winner_name}</strong> <span style={{ color: '#94a3b8' }}>— {d.label || (d.position ? positionLabel(d.position) : 'Tous')}</span></div>
                  <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 10 }}>🔐 {d.seed} · {d.drawn_from === 'history' ? 'a posteriori' : 'live'} · {d.created_at && new Date(d.created_at).toLocaleString('fr-FR')}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CARTES GÉNÉRÉES PAR MANCHE */}
        {rounds.length > 0 && (
          <div>
            <h3 style={{ fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Cartes générées ({rounds.length} manches)</h3>
            {rounds.map((rd, i) => {
              const gp = rd.good_pair_content;
              const zones = Array.isArray(rd.zones) ? rd.zones : [];
              const pairsFound = Array.isArray(rd.pairs_found) ? rd.pairs_found : [];
              // Bonne paire de secours (anciennes données sans pairs_found détaillé)
              const goodZones = zones.filter(z => z?.pairId && !z?.isDistractor);
              let pairA, pairB;
              if (gp && typeof gp === 'object') { pairA = gp.a; pairB = gp.b; }
              else if (goodZones.length >= 2) { pairA = goodZones[0].content; pairB = goodZones[1].content; }
              else { pairA = goodZones[0]?.content ?? (typeof gp === 'string' ? gp : null); pairB = goodZones[1]?.content ?? null; }
              const renderCell = (v) => isImageUrl(v) ? <img src={v} alt="" style={{ height: 26, borderRadius: 4 }} /> : <strong>{v != null ? String(v) : '—'}</strong>;
              return (
                <div key={i} style={{ marginBottom: 10, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontWeight: 800, color: '#F5A623' }}>Manche {rd.round_number}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{PairTypeLabel(rd.good_pair_type)}{rd.good_pair_theme ? ` · ${rd.good_pair_theme}` : ''}{rd.good_pair_level ? ` · ${rd.good_pair_level}` : ''}</span>
                  </div>

                  {/* Paires trouvées pendant la manche */}
                  {pairsFound.length > 0 ? (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: '#10b981', fontWeight: 700, marginBottom: 6 }}>PAIRES TROUVÉES ({pairsFound.length})</div>
                      {pairsFound.map((pf, pi) => (
                        <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', marginBottom: 4, borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 13, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13 }}>{pi === 0 ? '🏆' : '✓'}</span>
                          <strong style={{ color: '#e2e8f0' }}>{pf.display_name || '—'}</strong>
                          {(pf.pair_a != null || pf.pair_b != null) && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                              {renderCell(pf.pair_a)}<span style={{ color: '#64748b' }}>↔</span>{renderCell(pf.pair_b)}
                            </span>
                          )}
                          {pf.time_ms != null && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>{(pf.time_ms / 1000).toFixed(1)}s</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Ancien format : une seule paire / un seul gagnant
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
                        <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>BONNE PAIRE</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)' }}>
                          {renderCell(pairA)}<span style={{ color: '#64748b' }}>↔</span>{renderCell(pairB)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        {rd.winner_display_name
                          ? <>🏆 Trouvé par <strong style={{ color: '#e2e8f0' }}>{rd.winner_display_name}</strong>{rd.winner_time_ms ? ` en ${(rd.winner_time_ms / 1000).toFixed(1)}s` : ''}</>
                          : 'Personne n\'a trouvé cette manche'}
                      </div>
                    </>
                  )}
                  {Array.isArray(rd.errors) && rd.errors.length > 0 && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 4 }}>{rd.errors.length} erreur(s) durant la manche</div>
                  )}
                  {/* Zones (cartes affichées) */}
                  {zones.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 12, color: '#64748b' }}>Voir les {zones.length} cartes affichées</summary>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {zones.map((z, zi) => (
                          <span key={zi} style={{ display: 'inline-flex', alignItems: 'center', maxWidth: 140, padding: '3px 8px', borderRadius: 6, fontSize: 11, background: z && !z.isDistractor ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)', border: z && !z.isDistractor ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isImageUrl(z?.content) ? <img src={z.content} alt="" style={{ height: 22, borderRadius: 3 }} /> : (z?.content != null ? String(z.content) : '—')}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
