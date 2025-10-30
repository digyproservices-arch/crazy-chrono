import React, { useState, useEffect } from 'react';
import supabase from '../../utils/supabaseClient';

export default function AdminInvite() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [invitations, setInvitations] = useState([]);

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      const { data } = await supabase
        .from('invitations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setInvitations(data || []);
    } catch (e) {
      console.error('Erreur chargement invitations:', e);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setErr('Email invalide');
      return;
    }
    try {
      setLoading(true);
      
      // Générer token unique
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      // Créer invitation
      const { data: inv, error } = await supabase
        .from('invitations')
        .insert({
          email: em,
          role,
          token,
          invited_by: (await supabase.auth.getUser()).data?.user?.email
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const inviteLink = `${window.location.origin}/login?invite=${token}`;
      setMsg(`Invitation créée ! Lien : ${inviteLink}`);
      setEmail('');
      loadInvitations();
    } catch (e) {
      setErr(e.message || 'Erreur création invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h2>📧 Inviter des utilisateurs</h2>
      
      <form onSubmit={handleInvite} style={{ marginTop: 20, padding: 20, background: '#f9fafb', borderRadius: 8 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Email
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="utilisateur@domaine.com"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, marginTop: 4 }}
            />
          </label>
          
          <label>
            Rôle
            <select 
              value={role} 
              onChange={(e) => setRole(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, marginTop: 4 }}
            >
              <option value="user">Utilisateur</option>
              <option value="editor">Éditeur</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          
          {err && <div style={{ color: '#b91c1c', padding: 10, background: '#fee', borderRadius: 6 }}>{err}</div>}
          {msg && <div style={{ color: '#065f46', padding: 10, background: '#d1fae5', borderRadius: 6 }}>{msg}</div>}
          
          <button 
            type="submit" 
            disabled={loading}
            style={{ padding: '10px 12px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none', fontWeight: 600 }}
          >
            {loading ? 'Création...' : 'Créer invitation'}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 30 }}>
        <h3>Invitations récentes</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse', marginTop: 10 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: 10, textAlign: 'left' }}>Email</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Rôle</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Statut</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Créé le</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 10 }}>{inv.email}</td>
                  <td style={{ padding: 10 }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: 4, 
                      fontSize: 12,
                      background: inv.role === 'admin' ? '#7c3aed' : inv.role === 'editor' ? '#0891b2' : '#6b7280',
                      color: '#fff'
                    }}>
                      {inv.role}
                    </span>
                  </td>
                  <td style={{ padding: 10 }}>
                    {inv.used ? '✅ Utilisé' : new Date(inv.expires_at) < new Date() ? '⏰ Expiré' : '⏳ En attente'}
                  </td>
                  <td style={{ padding: 10, color: '#6b7280' }}>
                    {new Date(inv.created_at).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
