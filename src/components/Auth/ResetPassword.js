import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../../utils/supabaseClient';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isStrongPassword = (pwd) => {
    if (!pwd || pwd.length < 8) return false;
    const hasLower = /[a-z]/.test(pwd);
    const hasUpper = /[A-Z]/.test(pwd);
    const hasDigit = /\d/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    return hasLower && hasUpper && hasDigit && hasSpecial;
  };

  const strengthInfo = (pwd) => {
    const empty = { score: 0, label: 'Vide', color: '#9ca3af', flags: { len:false, upper:false, lower:false, digit:false, special:false } };
    if (!pwd) return empty;
    const flags = {
      len: pwd.length >= 8,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      digit: /\d/.test(pwd),
      special: /[^A-Za-z0-9]/.test(pwd),
    };
    const met = Object.values(flags).reduce((a,b)=>a+(b?1:0),0);
    const score = met;
    let label = 'Très faible';
    let color = '#ef4444';
    if (met >= 5) { label = 'Fort'; color = '#059669'; }
    else if (met === 4) { label = 'Bon'; color = '#10b981'; }
    else if (met === 3) { label = 'Moyen'; color = '#fbbf24'; }
    else if (met === 2) { label = 'Faible'; color = '#f59e0b'; }
    return { score, label, color, flags };
  };

  const PasswordStrength = ({ pwd }) => {
    const s = strengthInfo(pwd || '');
    const pct = Math.max(0, Math.min(100, (s.score/5)*100));
    const bullet = (ok, text) => (
      <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color: ok ? '#065f46' : '#7f1d1d' }}>
        <span style={{ width:10, height:10, borderRadius:999, background: ok ? '#10b981' : '#ef4444' }} /> {text}
      </div>
    );
    return (
      <div aria-live="polite" style={{ marginTop: 8 }}>
        <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: pct + '%', height: '100%', background: s.color, transition: 'width 200ms ease' }} />
        </div>
        <div style={{ fontSize: 12, marginTop: 4, color: s.color }}>{s.label}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginTop:6 }}>
          {bullet(s.flags.len, '8+ caractères')}
          {bullet(s.flags.upper, '1 majuscule')}
          {bullet(s.flags.lower, '1 minuscule')}
          {bullet(s.flags.digit, '1 chiffre')}
          {bullet(s.flags.special, '1 caractère spécial')}
        </div>
      </div>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!supabase) {
      setError('Supabase non configuré');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (!isStrongPassword(password)) {
      setError('Mot de passe trop faible. Utilise 8+ caractères avec majuscule, minuscule, chiffre et caractère spécial.');
      return;
    }

    try {
      setLoading(true);

      // Mettre à jour le mot de passe avec Supabase
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) throw updateError;

      setSuccess(true);
      
      // Rediriger vers la page de connexion après 2 secondes
      setTimeout(() => {
        navigate('/login');
      }, 2000);

    } catch (err) {
      setError(err.message || 'Erreur lors de la réinitialisation du mot de passe');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'linear-gradient(135deg, #0D6A7A 0%, #1AACBE 50%, #148A9C 100%)' }}>
      <div style={{ width: 420, maxWidth: '92vw', background: '#fff', border: 'none', borderRadius: 16, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 24, fontWeight: 700, color: '#4A3728' }}>
          Nouveau mot de passe
        </h2>
        <p style={{ marginTop: 0, marginBottom: 20, color: '#6b7280', fontSize: 14 }}>
          Entrez votre nouveau mot de passe ci-dessous.
        </p>

        {success ? (
          <div style={{ padding: 16, borderRadius: 8, background: '#d1fae5', border: '1px solid #10b981' }}>
            <div style={{ fontWeight: 600, color: '#065f46', marginBottom: 4 }}>
              ✓ Mot de passe réinitialisé avec succès !
            </div>
            <div style={{ fontSize: 14, color: '#047857' }}>
              Redirection vers la page de connexion...
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
              Nouveau mot de passe
              <span title="Au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial." style={{ marginLeft: 6, cursor: 'help', color: '#6b7280' }}>ⓘ</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ caractères, majuscule, minuscule, chiffre, spécial"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 14,
                marginBottom: 12,
              }}
            />

            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 14,
                marginBottom: 8,
              }}
            />

            <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>
              Le mot de passe doit contenir au minimum 8 caractères, dont au moins: une majuscule, une minuscule, un chiffre et un caractère spécial.
            </div>

            {password ? <PasswordStrength pwd={password} /> : null}

            {error && (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#fee2e2', border: '1px solid #ef4444' }}>
                <div style={{ fontSize: 14, color: '#b91c1c' }}>{error}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                background: loading ? '#9ca3af' : '#1AACBE',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 16,
              }}
            >
              {loading ? 'Réinitialisation en cours...' : 'Réinitialiser le mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
