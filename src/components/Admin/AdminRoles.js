import React, { useMemo, useState } from 'react';
import supabase from '../../utils/supabaseClient';
import { getBackendUrl } from '../../utils/subscription';

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
    if (!['admin','editor','user'].includes(role)) { setErr('Rôle invalide'); return; }
    if (!supabase) { setErr('Supabase non configuré'); return; }
    try {
      setLoading(true);
      
      // Mise à jour directe dans Supabase
      const { data: updated, error } = await supabase
        .from('user_profiles')
        .update({ role })
        .eq('email', em)
        .select();
      
      if (error) throw error;
      if (!updated || updated.length === 0) {
        setErr('Utilisateur non trouvé');
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
            <option value="editor">editor</option>
            <option value="user">user</option>
          </select>
        </label>
        {err ? <div style={{ color:'#b91c1c' }}>{err}</div> : null}
        {msg ? <div style={{ color:'#065f46' }}>{msg}</div> : null}
        <button type="submit" disabled={loading} style={{ padding:'10px 12px', borderRadius:8, border:'1px solid #10b981', background:'#10b981', color:'#fff', fontWeight:600 }}>
          {loading ? 'Mise à jour…' : 'Mettre à jour le rôle'}
        </button>
      </form>
    </div>
  );
}
