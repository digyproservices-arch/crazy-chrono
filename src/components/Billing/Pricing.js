import React, { useState } from 'react';

export default function Pricing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const subscribe = async () => {
    try {
      setLoading(true); setError('');
      let userId = null; try { userId = JSON.parse(localStorage.getItem('cc_auth') || 'null')?.id || null; } catch {}
      const resp = await fetch('http://localhost:4000/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_id: process.env.REACT_APP_STRIPE_PRICE_ID || undefined,
          user_id: userId || undefined,
          success_url: window.location.origin + '/account?checkout=success',
          cancel_url: window.location.origin + '/pricing?checkout=cancel'
        })
      });
      const json = await resp.json();
      if (!resp.ok || !json?.url) throw new Error(json?.error || 'checkout_failed');
      window.location.assign(json.url);
    } catch (e) {
      setError(e.message || String(e));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Tarifs</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', maxWidth: 420, gap: 12 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Abonnement mensuel</div>
          <div style={{ color: '#374151', marginTop: 4 }}>
            Accès au jeu, sessions multi‑joueurs, historique et mises à jour.
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>9,99 € / mois</div>
          <button onClick={subscribe} disabled={loading} style={{ marginTop: 12, width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #3b82f6', background: '#3b82f6', color: '#fff', fontWeight: 700 }}>
            {loading ? 'Redirection…' : 'S’abonner'}
          </button>
          {error && <div style={{ marginTop: 8, color: '#b91c1c' }}>{String(error)}</div>}
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
            Mode test: si les clés Stripe ne sont pas configurées, une URL de succès simulée sera utilisée.
          </div>
        </div>
      </div>
    </div>
  );
}
