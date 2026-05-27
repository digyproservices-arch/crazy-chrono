import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getBackendUrl } from '../../utils/subscription';

const PAGE = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
  color: '#fff',
  padding: '20px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const CARD = {
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '24px 20px',
  border: '1px solid rgba(255,255,255,0.1)',
  marginBottom: 16,
};

const INPUT = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '2px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: '#e2e8f0',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

export default function GrandeSalleJoin() {
  const navigate = useNavigate();
  const { tournamentId } = useParams();
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get('payment');

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState(null);
  const [joining, setJoining] = useState(false);

  // Check if already logged in
  const existingAuth = (() => {
    try {
      const a = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (a.token || a.access_token) return a;
    } catch {}
    return null;
  })();

  // Fetch tournament info
  useEffect(() => {
    if (!tournamentId) { setError('ID de tournoi manquant'); setLoading(false); return; }
    const backendUrl = getBackendUrl();
    fetch(`${backendUrl}/api/gs/tournaments/${tournamentId}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.tournament) {
          setTournament(j.tournament);
          // If tournament is finished or cancelled, show error
          if (['finished', 'cancelled'].includes(j.tournament.status)) {
            setError(j.tournament.status === 'finished' ? 'Ce tournoi est terminé.' : 'Ce tournoi a été annulé.');
          }
        } else {
          setError('Tournoi introuvable');
        }
      })
      .catch(() => setError('Impossible de charger le tournoi. Vérifiez votre connexion.'))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  // Pre-fill from existing auth if available
  useEffect(() => {
    if (!existingAuth) return;
    if (existingAuth.firstName && !firstName) setFirstName(existingAuth.firstName);
    if (existingAuth.lastName && !lastName) setLastName(existingAuth.lastName);
    if (existingAuth.email && !email) setEmail(existingAuth.email);
    if (existingAuth.name && existingAuth.name !== 'Utilisateur' && !firstName) {
      const parts = existingAuth.name.split(' ');
      if (parts.length >= 2) { setFirstName(parts[0]); setLastName(parts.slice(1).join(' ')); }
      else setFirstName(parts[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim();

    if (!fn) { setFormError('Le prénom est requis'); return; }
    if (!ln) { setFormError('Le nom est requis'); return; }
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setFormError('Email invalide'); return; }

    setFormError(null);
    setJoining(true);

    // Store guest info for GrandeSalle.js to use
    const guestData = {
      firstName: fn,
      lastName: ln,
      email: em,
      displayName: `${fn} ${ln}`,
      tournamentId,
      joinedAt: Date.now(),
      isGuest: !existingAuth,
    };
    localStorage.setItem('cc_gs_guest', JSON.stringify(guestData));

    // Enregistrer l'entrée pour la collecte marketing (fire and forget)
    const backendUrl = getBackendUrl();
    fetch(`${backendUrl}/api/gs/tournaments/${tournamentId}/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: fn, last_name: ln, email: em }),
    }).catch(() => {});

    // Navigate to the tournament lobby
    navigate(`/grande-salle/tournament/${tournamentId}`);
  };

  // Quick join for already-logged-in users
  const handleQuickJoin = () => {
    if (!existingAuth) return;
    const name = existingAuth.name && existingAuth.name !== 'Utilisateur'
      ? existingAuth.name
      : [existingAuth.firstName, existingAuth.lastName].filter(Boolean).join(' ').trim() || existingAuth.email?.split('@')[0] || 'Joueur';

    const guestEmail = existingAuth.email || '';
    const guestFN = existingAuth.firstName || name.split(' ')[0] || '';
    const guestLN = existingAuth.lastName || name.split(' ').slice(1).join(' ') || '';
    localStorage.setItem('cc_gs_guest', JSON.stringify({
      firstName: guestFN,
      lastName: guestLN,
      email: guestEmail,
      displayName: name,
      tournamentId,
      joinedAt: Date.now(),
      isGuest: false,
      userId: existingAuth.id || localStorage.getItem('cc_user_id') || null,
    }));

    // Enregistrer l'entrée (fire and forget)
    if (guestEmail) {
      const backendUrl = getBackendUrl();
      fetch(`${backendUrl}/api/gs/tournaments/${tournamentId}/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: guestFN, last_name: guestLN, email: guestEmail, user_id: existingAuth.id || null, is_subscriber: true }),
      }).catch(() => {});
    }
    navigate(`/grande-salle/tournament/${tournamentId}`);
  };

  // ===== LOADING =====
  if (loading) return (
    <div style={PAGE}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>🏟️</div>
        <div style={{ color: '#94a3b8', fontSize: 16 }}>Chargement du tournoi...</div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    </div>
  );

  // ===== ERROR =====
  if (error) return (
    <div style={PAGE}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', margin: '0 0 12px' }}>{error}</h2>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Vérifiez le lien ou contactez l'organisateur.</p>
        <button
          onClick={() => navigate('/')}
          style={{ marginTop: 20, padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #0D6A7A, #1AACBE)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Accueil Crazy Chrono
        </button>
      </div>
    </div>
  );

  const scheduled = tournament?.scheduled_at ? new Date(tournament.scheduled_at) : null;

  return (
    <div style={PAGE}>
      <div style={{ maxWidth: 440, width: '100%' }}>

        {/* ===== Tournament header ===== */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🏟️</div>
          <h1 style={{
            fontSize: 26, fontWeight: 900, margin: '0 0 6px',
            background: 'linear-gradient(135deg, #F5A623, #ff6b35)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {tournament?.title || 'Tournoi Grande Salle'}
          </h1>
          {tournament?.description && (
            <p style={{ color: '#94a3b8', fontSize: 14, margin: '4px 0 0', lineHeight: 1.5 }}>
              {tournament.description}
            </p>
          )}
          {scheduled && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>
              📅 {scheduled.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          {/* Badge type d'accès */}
          {tournament?.access_type && tournament.access_type !== 'free' && (
            <div style={{ marginTop: 8 }}>
              {tournament.access_type === 'subscribers' && (
                <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: 'rgba(245,166,35,0.2)', color: '#F5A623', fontSize: 12, fontWeight: 700 }}>⭐ Réservé aux abonnés</span>
              )}
              {tournament.access_type === 'paid' && (
                <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: 'rgba(139,92,246,0.2)', color: '#8b5cf6', fontSize: 12, fontWeight: 700 }}>
                  💳 Participation : {tournament.entry_price ? `${(tournament.entry_price / 100).toFixed(2)}€` : 'Payant'}
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}> (gratuit pour les abonnés)</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ===== Payment success banner ===== */}
        {paymentStatus === 'success' && (
          <div style={{ ...CARD, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981', marginBottom: 6 }}>Paiement confirmé !</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Vous pouvez maintenant rejoindre le tournoi.</div>
          </div>
        )}
        {paymentStatus === 'cancel' && (
          <div style={{ ...CARD, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>Paiement annulé. Vous pouvez réessayer ci-dessous.</div>
          </div>
        )}

        {/* ===== Quick join for logged-in users ===== */}
        {existingAuth && (
          <div style={{ ...CARD, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#10b981', fontWeight: 700, marginBottom: 8 }}>
              ✅ Vous êtes connecté
            </div>
            <div style={{ fontSize: 15, color: '#e2e8f0', marginBottom: 14 }}>
              {existingAuth.name || existingAuth.firstName || existingAuth.email?.split('@')[0]}
            </div>
            <button
              onClick={handleQuickJoin}
              style={{
                width: '100%', padding: '14px 24px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(16,185,129,0.4)',
              }}
            >
              🚀 Rejoindre le tournoi
            </button>
          </div>
        )}

        {/* ===== Separator if logged in ===== */}
        {existingAuth && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>OU</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>
        )}

        {/* ===== Guest join form ===== */}
        <div style={CARD}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#e2e8f0', textAlign: 'center' }}>
            {existingAuth ? 'Ou entrez vos informations' : 'Rejoignez le tournoi'}
          </h3>

          {formError && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 12,
              background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 13,
            }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Prénom *
              </label>
              <input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Ex: Jean"
                style={INPUT}
                autoComplete="given-name"
                autoFocus={!existingAuth}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Nom *
              </label>
              <input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Ex: Dupont"
                style={INPUT}
                autoComplete="family-name"
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Ex: jean.dupont@email.com"
                style={INPUT}
                autoComplete="email"
              />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Pour recevoir vos résultats et les prochains tournois
              </div>
            </div>
          </div>

          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              width: '100%', padding: '14px 24px', borderRadius: 12, border: 'none',
              background: joining ? '#64748b' : 'linear-gradient(135deg, #F5A623, #ff6b35)',
              color: '#fff', fontWeight: 800, fontSize: 16, cursor: joining ? 'default' : 'pointer',
              boxShadow: joining ? 'none' : '0 4px 15px rgba(245,166,35,0.4)',
              marginTop: 16, transition: 'all 0.2s',
            }}
          >
            {joining ? 'Connexion...' : '🏟️ Entrer dans la salle'}
          </button>
        </div>

        {/* ===== Login link for existing users ===== */}
        {!existingAuth && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button
              onClick={() => navigate(`/login?redirect=/grande-salle/join/${tournamentId}`)}
              style={{
                background: 'transparent', border: 'none', color: '#1AACBE',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              J'ai déjà un compte Crazy Chrono
            </button>
          </div>
        )}

        {/* ===== How it works ===== */}
        <div style={{ ...CARD, marginTop: 16, background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#F5A623', fontWeight: 700 }}>Comment ça marche ?</h4>
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8 }}>
            <div><strong>1.</strong> Entrez vos informations et rejoignez la salle</div>
            <div><strong>2.</strong> Attendez que l'organisateur lance la partie</div>
            <div><strong>3.</strong> Trouvez les paires le plus vite possible !</div>
            <div><strong>4.</strong> Les derniers du classement sont éliminés</div>
            <div><strong>5.</strong> Le dernier survivant remporte la victoire !</div>
          </div>
        </div>

        {/* ===== Branding ===== */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <div style={{ fontSize: 11, color: '#475569' }}>
            Propulsé par <strong style={{ color: '#0D6A7A' }}>Crazy Chrono</strong> — Le jeu éducatif
          </div>
        </div>
      </div>
    </div>
  );
}
