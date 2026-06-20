import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackendUrl } from '../../utils/apiHelpers';
import supabase from '../../utils/supabaseClient';

async function getAdminHeaders() {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (token) return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  } catch {}
  try {
    const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
    if (auth.token) return { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' };
  } catch {}
  return { 'Content-Type': 'application/json' };
}

const DURATIONS = [
  { value: 1, label: '1 mois' },
  { value: 3, label: '3 mois' },
  { value: 6, label: '6 mois' },
  { value: 12, label: '12 mois' },
];

const C = { teal: '#0D6A7A', teal2: '#148A9C', yellow: '#F5A623', brown: '#4A3728' };

export default function GiftCodes() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    type: 'generic',
    durationMonths: 6,
    quantity: 10,
    beneficiaryLabel: '',
    campaign: '',
    prefix: 'CADEAU',
    notes: '',
  });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null); // { created, codes:[] }
  const [err, setErr] = useState('');
  const [list, setList] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [loadingList, setLoadingList] = useState(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const headers = await getAdminHeaders();
      const qs = filterStatus ? `?status=${encodeURIComponent(filterStatus)}` : '';
      const res = await fetch(`${getBackendUrl()}/api/admin/gift-codes${qs}`, { headers });
      const data = await res.json();
      if (data.ok) { setList(data.codes || []); setSummary(data.summary || null); }
    } catch (e) { console.error('loadList', e); }
    finally { setLoadingList(false); }
  }, [filterStatus]);

  useEffect(() => { loadList(); }, [loadList]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setErr(''); setCreated(null);
    if (form.type === 'nominative' && !form.beneficiaryLabel.trim()) {
      setErr('Indique le nom du bénéficiaire pour un bon nominatif.');
      return;
    }
    setCreating(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${getBackendUrl()}/api/admin/gift-codes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: form.type,
          durationMonths: Number(form.durationMonths),
          quantity: form.type === 'nominative' ? 1 : Number(form.quantity),
          beneficiaryLabel: form.beneficiaryLabel.trim() || null,
          campaign: form.campaign.trim() || null,
          prefix: form.prefix.trim() || 'CADEAU',
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erreur de génération');
      setCreated(data);
      loadList();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (code) => {
    if (!window.confirm(`Désactiver le code ${code} ?`)) return;
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${getBackendUrl()}/api/admin/gift-codes/${encodeURIComponent(code)}/revoke`, { method: 'POST', headers });
      const data = await res.json();
      if (!data.ok) { alert(data.error || 'Erreur'); return; }
      loadList();
    } catch (e) { alert(e.message); }
  };

  const exportCsv = async () => {
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${getBackendUrl()}/api/admin/gift-codes/export`, { headers });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'bons_cadeaux.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
  };

  const copyCodes = () => {
    if (!created?.codes?.length) return;
    const text = created.codes.map(c => c.code).join('\n');
    navigator.clipboard?.writeText(text);
  };

  const statusBadge = (s) => {
    const map = {
      active: { bg: '#dcfce7', color: '#16a34a', label: 'Disponible' },
      redeemed: { bg: '#dbeafe', color: '#2563eb', label: 'Utilisé' },
      revoked: { bg: '#fee2e2', color: '#dc2626', label: 'Désactivé' },
      expired: { bg: '#fef3c7', color: '#d97706', label: 'Expiré' },
    };
    const st = map[s] || map.active;
    return <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>;
  };

  const input = { width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
  const lbl = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 };

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(135deg, ${C.teal} 0%, ${C.teal2} 100%)`, padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: 0 }}>🎁 Bons cadeaux</h1>
          <button onClick={() => navigate('/admin/dashboard')} style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>← Dashboard</button>
        </div>

        {/* Création */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: `2px solid ${C.yellow}`, marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginTop: 0 }}>Générer des bons</h2>
          <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, alignItems: 'end' }}>
            <div>
              <label style={lbl}>Type</label>
              <select style={input} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="generic">Génériques (en lot)</option>
                <option value="nominative">Nominatif (1 bénéficiaire)</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Durée offerte</label>
              <select style={input} value={form.durationMonths} onChange={e => setForm(f => ({ ...f, durationMonths: e.target.value }))}>
                {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            {form.type === 'generic' ? (
              <div>
                <label style={lbl}>Quantité</label>
                <input type="number" min="1" max="1000" style={input} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
            ) : (
              <div>
                <label style={lbl}>Bénéficiaire</label>
                <input type="text" placeholder="Marie DUPONT" style={input} value={form.beneficiaryLabel} onChange={e => setForm(f => ({ ...f, beneficiaryLabel: e.target.value }))} />
              </div>
            )}
            <div>
              <label style={lbl}>Préfixe du code</label>
              <input type="text" placeholder="CADEAU" style={input} value={form.prefix} onChange={e => setForm(f => ({ ...f, prefix: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Campagne (optionnel)</label>
              <input type="text" placeholder="Noël 2026" style={input} value={form.campaign} onChange={e => setForm(f => ({ ...f, campaign: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center' }}>
              <button type="submit" disabled={creating} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #22c55e, #16a34a)', opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Génération…' : '✨ Générer les bons'}
              </button>
              {err && <span style={{ color: '#dc2626', fontSize: 14 }}>{err}</span>}
            </div>
          </form>

          {created?.codes?.length > 0 && (
            <div style={{ marginTop: 18, padding: 16, background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ color: '#16a34a' }}>✅ {created.created} bon(s) généré(s)</strong>
                <button onClick={copyCodes} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>📋 Copier les codes</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {created.codes.map(c => (
                  <code key={c.code} style={{ fontSize: 14, fontWeight: 700, color: C.teal, background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', letterSpacing: 1 }}>{c.code}</code>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Liste */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: `2px solid ${C.yellow}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.teal, margin: 0 }}>Bons existants</h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...input, width: 'auto' }}>
                <option value="">Tous</option>
                <option value="active">Disponibles</option>
                <option value="redeemed">Utilisés</option>
                <option value="revoked">Désactivés</option>
              </select>
              <button onClick={exportCsv} style={{ padding: '8px 14px', borderRadius: 8, border: '2px solid #F5A623', background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>📥 Export CSV</button>
            </div>
          </div>

          {summary && (
            <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap', fontSize: 14, color: '#64748b' }}>
              <span>Total : <strong style={{ color: C.teal }}>{summary.total}</strong></span>
              <span>Disponibles : <strong style={{ color: '#16a34a' }}>{summary.active}</strong></span>
              <span>Utilisés : <strong style={{ color: '#2563eb' }}>{summary.redeemed}</strong></span>
              <span>Désactivés : <strong style={{ color: '#dc2626' }}>{summary.revoked}</strong></span>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f0f0f0', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: 8 }}>Code</th>
                  <th style={{ padding: 8 }}>Type</th>
                  <th style={{ padding: 8 }}>Durée</th>
                  <th style={{ padding: 8 }}>Statut</th>
                  <th style={{ padding: 8 }}>Bénéficiaire</th>
                  <th style={{ padding: 8 }}>Campagne</th>
                  <th style={{ padding: 8 }}>Activé par</th>
                  <th style={{ padding: 8 }}>Expire le</th>
                  <th style={{ padding: 8 }}></th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr><td colSpan={9} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Chargement…</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Aucun bon pour l'instant.</td></tr>
                ) : list.map(c => (
                  <tr key={c.code} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: 8 }}><code style={{ fontWeight: 700, color: C.teal }}>{c.code}</code></td>
                    <td style={{ padding: 8, color: '#64748b' }}>{c.type === 'nominative' ? 'Nominatif' : 'Générique'}</td>
                    <td style={{ padding: 8 }}>{c.duration_months} mois</td>
                    <td style={{ padding: 8 }}>{statusBadge(c.status)}</td>
                    <td style={{ padding: 8, color: '#334155' }}>{c.beneficiary_label || '—'}</td>
                    <td style={{ padding: 8, color: '#64748b' }}>{c.campaign || '—'}</td>
                    <td style={{ padding: 8, color: '#64748b' }}>{c.redeemed_by_email || '—'}</td>
                    <td style={{ padding: 8, color: '#64748b' }}>{c.valid_until ? new Date(c.valid_until).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: 8 }}>
                      {c.status === 'active' && (
                        <button onClick={() => revoke(c.code)} style={{ padding: '4px 8px', fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer' }}>Désactiver</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
