import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../../utils/supabaseClient';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [signupMode, setSignupMode] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user) {
            const user = data.session.user;
            const profile = { id: user.id, email: user.email, name: user.user_metadata?.name || user.email?.split('@')[0], role: 'user' };
            try { localStorage.setItem('cc_auth', JSON.stringify(profile)); } catch {}
            onLogin && onLogin(profile);
            navigate('/modes', { replace: true });
            return;
          }
        }
        // fallback local guest
        const saved = localStorage.getItem('cc_auth');
        if (saved) {
          const payload = JSON.parse(saved);
          if (payload?.id || payload?.pseudo) navigate('/modes', { replace: true });
        }
      } catch {}
    })();
  }, [navigate, onLogin]);

  const saveAuth = (auth) => {
    try { if (remember) localStorage.setItem('cc_auth', JSON.stringify(auth)); } catch {}
    try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
  };

  const isStrongPassword = (pwd) => {
    // Min 8 chars, at least 1 lower, 1 upper, 1 digit, 1 special
    if (!pwd || pwd.length < 8) return false;
    const hasLower = /[a-z]/.test(pwd);
    const hasUpper = /[A-Z]/.test(pwd);
    const hasDigit = /\d/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    return hasLower && hasUpper && hasDigit && hasSpecial;
  };

  const strengthInfo = (pwd) => {
    let score = 0;
    if (!pwd) return { score: 0, label: 'Vide', color: '#9ca3af' };
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    // cap 4 for UI scale 0..4
    if (score > 4) score = 4;
    const labels = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Fort'];
    const colors = ['#ef4444', '#f59e0b', '#fbbf24', '#10b981', '#059669'];
    return { score, label: labels[score], color: colors[score] };
  };

  const handleResendConfirmation = async () => {
    try {
      setError(''); setInfo('');
      const em = (email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setError('Email invalide');
        return;
      }
      // Supabase v2 resend confirmation
      const { error: err } = await supabase.auth.resend({
        type: 'signup',
        email: em,
        options: { emailRedirectTo: window.location.origin + '/login' }
      });
      if (err) throw err;
      setInfo('Email de confirmation renvoyé. Vérifie ta boîte de réception.');
    } catch (e) {
      setError(e?.message || 'Impossible de renvoyer l’email pour le moment.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!supabase) { setError('Supabase non configuré'); return; }
    try {
      setLoading(true);
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      const user = data?.user || data?.session?.user;
      if (user) {
        const profile = { id: user.id, email: user.email, name: user.user_metadata?.name || user.email?.split('@')[0], role: 'user' };
        saveAuth(profile);
        onLogin && onLogin(profile);
        navigate('/modes', { replace: true });
      }
    } catch (e1) {
      setError(e1.message || 'Erreur de connexion');
    } finally { setLoading(false); }
  };

  const handleSignup = async () => {
    setError('');
    setInfo('');
    if (!supabase) { setError('Supabase non configuré'); return; }
    try {
      setLoading(true);
      const em = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setError('Email invalide');
        return;
      }
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }
      if (!isStrongPassword(password)) {
        setError('Mot de passe trop faible. Utilise 8+ caractères avec majuscule, minuscule, chiffre et caractère spécial.');
        return;
      }
      const { data, error: err } = await supabase.auth.signUp({
        email: em,
        password,
        options: { emailRedirectTo: window.location.origin + '/login' }
      });
      if (err) throw err;
      const user = data?.user;
      const session = data?.session;
      if (session && session.user) {
        // Cas où la confirmation email est désactivée côté projet
        const u = session.user;
        const profile = { id: u.id, email: u.email, name: u.user_metadata?.name || u.email?.split('@')[0], role: 'user' };
        saveAuth(profile);
        onLogin && onLogin(profile);
        navigate('/modes', { replace: true });
        return;
      }
      // Cas standard: confirmation e‑mail requise
      if (user) {
        setInfo("Compte créé. Vérifie ta boîte e‑mail et clique sur le lien de confirmation pour activer ton compte.");
        return;
      }
      setInfo("Vérifie ton e‑mail pour confirmer l'inscription.");
    } catch (e1) {
      setError(e1.message || "Erreur d'inscription");
    } finally { setLoading(false); }
  };

  const handleGuest = () => {
    const pseudo = 'Invité-' + Math.floor(Math.random()*1000);
    const auth = { id: 'guest:' + Date.now(), name: pseudo, role: 'guest' };
    saveAuth(auth);
    onLogin && onLogin(auth);
    navigate('/modes', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onSubmit={handleLogin} style={{ width: 380, maxWidth: '92vw', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, boxShadow: '0 8px 28px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Connexion</h2>
        <label style={{ display: 'block', marginBottom: 6 }}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }} />
        <label style={{ display: 'block', margin: '10px 0 6px' }}>
          Mot de passe
          {signupMode && (
            <span title="Au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial." style={{ marginLeft: 6, cursor: 'help', color: '#6b7280' }}>ⓘ</span>
          )}
        </label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={signupMode ? '8+ caractères, majuscule, minuscule, chiffre, spécial' : '••••••••'} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }} />
        {signupMode && (
          <>
            <label style={{ display: 'block', margin: '10px 0 6px' }}>Confirme le mot de passe</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }} />
            <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>
              Le mot de passe doit contenir au minimum 8 caractères, dont au moins: une majuscule, une minuscule, un chiffre et un caractère spécial.
            </div>
            {password && (
              (()=>{
                const s = strengthInfo(password);
                const pct = (s.score/4)*100;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: s.color, transition: 'width 200ms ease' }} />
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, color: s.color }}>{s.label}</div>
                  </div>
                );
              })()
            )}
          </>
        )}
        <div style={{ marginTop: 10 }}>
          <label><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Se souvenir de moi</label>
        </div>
        {error && <div style={{ marginTop: 10, color: '#b91c1c' }}>{error}</div>}
        {info && <div style={{ marginTop: 10, color: '#065f46' }}>{info}</div>}
        <button type="submit" disabled={loading} style={{ marginTop: 16, width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #10b981', background: '#10b981', color: '#fff', fontWeight: 600 }}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!signupMode) {
              setSignupMode(true);
              setInfo(''); setError('');
              return;
            }
            await handleSignup();
          }}
          disabled={loading}
          style={{ marginTop: 8, width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #3b82f6', background: signupMode ? '#3b82f6' : '#eff6ff', color: signupMode ? '#fff' : '#1e3a8a', fontWeight: 600 }}
        >
          {signupMode ? 'Valider l’inscription' : 'Créer un compte'}
        </button>
        {signupMode && (
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <button type="button" onClick={handleResendConfirmation} style={{ background: 'transparent', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}>
              Renvoyer e‑mail de confirmation
            </button>
          </div>
        )}
        <div style={{ marginTop: 10, textAlign: 'center', color: '#6b7280' }}>— ou —</div>
        <button type="button" onClick={handleGuest} style={{ marginTop: 8, width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#111827', fontWeight: 600 }}>
          Continuer en invité
        </button>
      </form>
    </div>
  );
}
