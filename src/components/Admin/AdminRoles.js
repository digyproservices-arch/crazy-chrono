import React, { useMemo, useState } from 'react';
import { getBackendUrl } from '../../utils/subscription';
import { getAuthHeaders } from '../../utils/apiHelpers';

export default function AdminRoles() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const isAdmin = useMemo(() => {
    try {
      const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
      return a && a.role === 'admin';
    } catch { return false; }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    const em = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setErr('Email invalide'); return; }
    if (!['admin','editor','user','teacher','cpd','cpc'].includes(role)) { setErr('Rôle invalide'); return; }
    try {
      setLoading(true);

      // CTO-005A : `user_profiles.role` n'est plus modifiable par le client
      // (RLS + trigger). L'administration des rôles passe par le service role.
      const res = await fetch(`${getBackendUrl()}/api/admin/set-role`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ email: em, role })
      });
      const data = await res.json();
      if (!data.ok) {
        setErr(data.error === 'user_not_found' ? 'Utilisateur non trouvé' : (data.error || 'Echec de mise à jour'));
        return;
      }

      setMsg(`Rôle mis à jour: ${em} → ${role}`);
      setEmail('');
    } catch (e1) {
      setErr(e1.message || 'Echec de mise à jour');
    } finally { setLoading(false); }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Administration des rôles</h2>
        <p>Accès refusé: admin requis.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 560 }}>
      <h2>Administration des rôles</h2>
      <form onSubmit={handleSubmit} style={{ marginTop: 12, display: 'grid', gap: 12 }}>
        <label>
          Email utilisateur
          <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="utilisateur@domaine.com" style={{ width:'100%', padding:'10px 12px', border:'1px solid #d1d5db', borderRadius:8 }} />
        </label>
        <label>
          Rôle
          <select value={role} onChange={(e)=>setRole(e.target.value)} style={{ width:'100%', padding:'10px 12px', border:'1px solid #d1d5db', borderRadius:8 }}>
            <option value="admin">admin</option>
            <option value="cpd">cpd (Conseiller Péd. Départemental)</option>
            <option value="cpc">cpc (Conseiller Péd. Circonscription)</option>
            <option value="teacher">teacher (Enseignant)</option>
            <option value="editor">editor</option>
            <option value="user">user</option>
          </select>
        </label>
        {err ? <div style={{ color:'#b91c1c' }}>{err}</div> : null}
        {msg ? <div style={{ color:'#065f46' }}>{msg}</div> : null}
        <button type="submit" disabled={loading} style={{ padding:'10px 14px', borderRadius:10, border:'none', background:'linear-gradient(135deg, #1AACBE, #148A9C)', color:'#fff', fontWeight:600, cursor:'pointer' }}>
          {loading ? 'Mise à jour…' : 'Mettre à jour le rôle'}
        </button>
      </form>
    </div>
  );
}
