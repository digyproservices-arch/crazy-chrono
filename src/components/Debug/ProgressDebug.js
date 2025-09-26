import React, { useEffect, useMemo, useState } from 'react';
import supabase from '../../utils/supabaseClient';
import { isFree, getDailyCounts } from '../../utils/subscription';

export default function ProgressDebug() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_auth')) || null; } catch { return null; }
  });
  const [userId, setUserId] = useState(null);
  const [latestSession, setLatestSession] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isGuest = useMemo(() => {
    const id = auth?.id;
    return !id || String(id).startsWith('guest:');
  }, [auth]);

  useEffect(() => {
    (async () => {
      try {
        if (!supabase) { setError('Supabase non configuré'); return; }
        setLoading(true);
        setError('');
        // Rafraîchir auth locale depuis Supabase si possible
        const { data } = await supabase.auth.getSession();
        const u = data?.session?.user || null;
        setUserId(u?.id || auth?.id || null);
        if (!u) {
          // si pas de session Supabase, on ne peut pas lire avec RLS
          return;
        }
        // Récupérer la dernière session
        const { data: sessRows, error: e1 } = await supabase
          .from('sessions')
          .select('*')
          .eq('user_id', u.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (e1) throw e1;
        const sess = Array.isArray(sessRows) && sessRows[0] ? sessRows[0] : null;
        setLatestSession(sess);
        // Récupérer les 20 dernières tentatives
        const { data: attRows, error: e2 } = await supabase
          .from('attempts')
          .select('*')
          .eq('user_id', u.id)
          .order('created_at', { ascending: false })
          .limit(20);
        if (e2) throw e2;
        setAttempts(Array.isArray(attRows) ? attRows : []);
      } catch (e) {
        setError(e?.message || String(e));
      } finally { setLoading(false); }
    })();
  }, [auth]);

  // Refresh badge on quota change
  const [quota, setQuota] = useState(() => getDailyCounts());
  useEffect(() => {
    const onQ = () => setQuota(getDailyCounts());
    window.addEventListener('cc:quotaChanged', onQ);
    window.addEventListener('cc:subscriptionChanged', onQ);
    return () => { window.removeEventListener('cc:quotaChanged', onQ); window.removeEventListener('cc:subscriptionChanged', onQ); };
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Debug Progress</h2>
      <div style={{ marginBottom: 12, color: '#374151' }}>Cette page affiche des informations de progression pour l'utilisateur connecté.</div>

      <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', marginBottom: 12 }}>
        <div><strong>User ID:</strong> {userId || '—'}</div>
        {isGuest && (
          <div style={{ marginTop: 8, color: '#b91c1c' }}>Tu es en mode invité. Aucune écriture/lecture RLS n'est possible. Connecte-toi avec e‑mail/mot de passe.</div>
        )}
      </div>

      {error && (
        <div style={{ padding: 12, border: '1px solid #fecaca', background: '#fee2e2', color: '#7f1d1d', borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Dernière session</div>
          {isFree() && (
            <div style={{ marginBottom: 8, fontSize: 12, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '6px 8px' }}>
              Free: {quota.sessions || 0}/3 sessions aujourd'hui
            </div>
          )}
          {loading ? (
            <div>Chargement…</div>
          ) : latestSession ? (
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 12 }}>
{JSON.stringify(latestSession, null, 2)}
            </pre>
          ) : (
            <div>Aucune session trouvée.</div>
          )}
        </div>

        <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Attempts récents</div>
          {loading ? (
            <div>Chargement…</div>
          ) : attempts && attempts.length ? (
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(isFree() ? attempts.slice(0, 10) : attempts.slice(0, 20)).map((a) => (
                <div key={a.id} style={{ border: '1px solid #f3f4f6', borderRadius: 6, padding: 8, background: '#fafafa' }}>
                  <div style={{ fontSize: 12 }}><strong>correct:</strong> {String(a.correct)}</div>
                  <div style={{ fontSize: 12 }}><strong>item_type:</strong> {a.item_type}</div>
                  <div style={{ fontSize: 12 }}><strong>item_id:</strong> {a.item_id}</div>
                  <div style={{ fontSize: 12 }}><strong>objective:</strong> {a.objective_key}</div>
                  <div style={{ fontSize: 12 }}><strong>latency_ms:</strong> {a.latency_ms}</div>
                  <div style={{ fontSize: 12 }}><strong>round_index:</strong> {a.round_index}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(a.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          ) : (
            <div>Aucune tentative trouvée.</div>
          )}
        </div>
      </div>
    </div>
  );
}
