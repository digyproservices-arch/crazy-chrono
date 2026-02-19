// Build timestamp: 2025-12-10T12:48:00 - Force Vercel rebuild with token fix
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import supabase from '../../utils/supabaseClient';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [signupMode, setSignupMode] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [studentMode, setStudentMode] = useState(false);
  const [studentCode, setStudentCode] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Vérifier invitation
        const token = searchParams.get('invite');
        if (token) {
          const { data: inv } = await supabase
            .from('invitations')
            .select('*')
            .eq('token', token)
            .eq('used', false)
            .single();
          
          if (inv && new Date(inv.expires_at) > new Date()) {
            setInviteToken(token);
            setInviteRole(inv.role);
            setEmail(inv.email);
            setSignupMode(true);
            setInfo(`Invitation pour ${inv.email} en tant que ${inv.role}`);
            return;
          }
        }
        
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user) {
            const user = data.session.user;
            const profile = { 
              id: user.id, 
              email: user.email, 
              name: user.user_metadata?.name || user.email?.split('@')[0], 
              role: 'user',
              token: data.session.access_token // Ajouter le token pour les API calls
            };
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
  }, [navigate, onLogin, searchParams]);

  const saveAuth = (auth) => {
    // TOUJOURS sauvegarder le token pour les API calls, même si remember=false
    try { localStorage.setItem('cc_auth', JSON.stringify(auth)); } catch {}
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
    // score de 0..5 (pour la barre). Label aligné avec la validation: "Fort" seulement si TOUT est ok
    const score = met; // 0..5
    let label = 'Très faible';
    let color = '#ef4444';
    if (met >= 5) { label = 'Fort'; color = '#059669'; }
    else if (met === 4) { label = 'Bon'; color = '#10b981'; }
    else if (met === 3) { label = 'Moyen'; color = '#fbbf24'; }
    else if (met === 2) { label = 'Faible'; color = '#f59e0b'; }
    return { score, label, color, flags };
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
      
      // DEBUG: Vérifier la structure de data
      console.log('[Login DEBUG] data structure:', {
        hasData: !!data,
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        hasSessionUser: !!data?.session?.user,
        hasAccessToken: !!data?.session?.access_token,
        accessTokenValue: data?.session?.access_token ? data.session.access_token.substring(0, 20) + '...' : 'UNDEFINED'
      });
      
      const user = data?.user || data?.session?.user;
      if (user) {
        // Charger le profil depuis user_profiles
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        // Construire un nom d'affichage complet
        const firstName = userProfile?.first_name || user.user_metadata?.first_name || '';
        const lastName = userProfile?.last_name || user.user_metadata?.last_name || '';
        const fullDisplayName = [firstName, lastName].filter(Boolean).join(' ').trim();
        
        const profile = {
          id: user.id,
          email: user.email,
          name: fullDisplayName || user.user_metadata?.name || user.email?.split('@')[0] || 'Utilisateur',
          firstName: firstName,
          lastName: lastName,
          role: userProfile?.role || 'user',
          token: data?.session?.access_token
        };
        
        // DEBUG: Vérifier le profil avant sauvegarde
        console.log('[Login DEBUG] profile created:', {
          hasToken: !!profile.token,
          tokenPreview: profile.token ? profile.token.substring(0, 20) + '...' : 'UNDEFINED',
          email: profile.email
        });
        
        saveAuth(profile);
        // Stocker l'ID utilisateur pour filtrage matchs
        try { localStorage.setItem('cc_user_id', user.id); } catch {}
        
        // Si c'est un professeur, récupérer sa classe
        try {
          const classRes = await fetch(`${process.env.REACT_APP_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com'}/api/auth/teacher-class`, {
            headers: {
              'Authorization': `Bearer ${profile.token}`
            }
          });
          
          if (classRes.ok) {
            const classData = await classRes.json();
            if (classData.ok && classData.class) {
              localStorage.setItem('cc_class_id', classData.class.id);
              console.log('[Login] Classe professeur récupérée:', classData.class.name);
            }
          }
        } catch (classErr) {
          console.warn('[Login] Impossible de récupérer la classe:', classErr);
          // Ne pas bloquer le login si la récupération échoue
        }
        
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
      const fn = firstName.trim();
      const ln = lastName.trim();
      
      if (!fn || !ln) {
        setError('Nom et prénom requis');
        return;
      }
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
        options: { 
          emailRedirectTo: window.location.origin + '/login',
          data: { first_name: fn, last_name: ln }
        }
      });
      if (err) throw err;
      const user = data?.user;
      const session = data?.session;
      
      // Créer ou mettre à jour le profil utilisateur
      if (user) {
        const roleToAssign = inviteRole || 'user';
        
        // Créer le profil dans user_profiles
        await supabase
          .from('user_profiles')
          .upsert({
            id: user.id,
            email: em,
            first_name: fn,
            last_name: ln,
            role: roleToAssign
          }, { onConflict: 'id' });
        
        // Si invitation, marquer comme utilisée
        if (inviteToken) {
          await supabase
            .from('invitations')
            .update({ used: true, used_at: new Date().toISOString() })
            .eq('token', inviteToken);
        }
      }
      
      if (session && session.user) {
        // Cas où la confirmation email est désactivée côté projet
        const u = session.user;
        const profile = { 
          id: u.id, 
          email: u.email, 
          name: u.user_metadata?.name || u.email?.split('@')[0], 
          role: inviteRole || 'user',
          token: session.access_token // Ajouter le token pour les API calls
        };
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

  const handleStudentLogin = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    const code = studentCode.trim();
    if (!code || code.length < 5) { setError('Entre ton code d\'accès (ex: ALICE-CE1A-4823)'); return; }
    try {
      setLoading(true);
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com';
      const res = await fetch(`${backendUrl}/api/auth/student-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Code invalide'); return; }

      if (supabase && data.credentials) {
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: data.credentials.email,
          password: data.credentials.password,
        });
        if (authErr) throw authErr;

        const user = authData?.user || authData?.session?.user;
        if (user) {
          const profile = {
            id: user.id,
            email: user.email,
            name: data.student.fullName || data.student.firstName,
            role: 'student',
            token: authData?.session?.access_token,
            studentId: data.student.id,
          };
          saveAuth(profile);
          try { localStorage.setItem('cc_user_id', user.id); } catch {}
          onLogin && onLogin(profile);
          navigate('/modes', { replace: true });
        }
      }
    } catch (e1) {
      setError(e1.message || 'Erreur de connexion');
    } finally { setLoading(false); }
  };

  // Stable component for password strength to help React reconciliation
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'linear-gradient(135deg, #0D6A7A 0%, #1AACBE 50%, #148A9C 100%)' }}>
      <form onSubmit={handleLogin} style={{ width: 400, maxWidth: '92vw', background: '#fff', border: 'none', borderRadius: 16, padding: '32px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-block', position: 'relative', width: 120, height: 120, marginBottom: 10 }}>
            <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg, #F5A623 0%, #FFD700 100%)', border: '4px solid #0D6A7A', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 24px rgba(245,166,35,0.35)', animation: 'loginLogoFloat 3s ease-in-out infinite' }}>
              <img src={`${process.env.PUBLIC_URL}/images/logo_crazy_chrono.png`} alt="Crazy Chrono" style={{ height: 80, width: 'auto', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
          </div>
          <style>{`@keyframes loginLogoFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }`}</style>
          <p style={{ margin: 0, fontSize: 13, color: '#6B5443' }}>Connectez-vous pour jouer</p>
        </div>
        {/* Toggle Enseignant/Parent vs Élève */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '2px solid #e2e8f0', marginBottom: 16 }}>
          <button type="button" onClick={() => { setStudentMode(false); setError(''); setInfo(''); }} style={{ flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: !studentMode ? '#0D6A7A' : '#f8fafc', color: !studentMode ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            Connexion
          </button>
          <button type="button" onClick={() => { setStudentMode(true); setSignupMode(false); setError(''); setInfo(''); }} style={{ flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: studentMode ? '#F5A623' : '#f8fafc', color: studentMode ? '#4A3728' : '#64748b', transition: 'all 0.2s' }}>
            Je suis élève
          </button>
        </div>
        {/* STUDENT MODE */}
        {studentMode ? (
          <>
            <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, color: '#4A3728' }}>Connexion élève</h2>
            <p style={{ margin: '0 0 14px 0', fontSize: 13, color: '#6b7280' }}>Entre le code que ton professeur t'a donné</p>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#334155' }}>Code d'accès</label>
            <input
              type="text"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
              placeholder="ALICE-CE1A-4823"
              autoComplete="off"
              autoFocus
              style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: '2px solid #F5A623', fontSize: 18, fontWeight: 700, letterSpacing: 2, textAlign: 'center', fontFamily: 'monospace', boxSizing: 'border-box' }}
            />
            {error && <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 14 }}>{error}</div>}
            {info && <div style={{ marginTop: 10, color: '#065f46', fontSize: 14 }}>{info}</div>}
            <button
              type="button"
              onClick={handleStudentLogin}
              disabled={loading || !studentCode.trim()}
              style={{ marginTop: 16, width: '100%', padding: '14px 12px', borderRadius: 10, border: 'none', background: studentCode.trim() ? '#F5A623' : '#e2e8f0', color: studentCode.trim() ? '#4A3728' : '#94a3b8', fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: studentCode.trim() ? '0 3px 10px rgba(245,166,35,0.3)' : 'none', transition: 'all 0.2s' }}
            >
              {loading ? 'Connexion...' : 'Jouer !'}
            </button>
          </>
        ) : (
          <>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, color: '#4A3728' }}>{signupMode ? 'Créer un compte' : 'Connexion'}</h2>
        {signupMode && (
          <>
            <label style={{ display: 'block', marginBottom: 6 }}>Prénom *</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jean" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 10 }} />
            <label style={{ display: 'block', marginBottom: 6 }}>Nom *</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dupont" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 10 }} />
          </>
        )}
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
            {password ? <PasswordStrength pwd={password} /> : null}
          </>
        )}
        {!signupMode && (
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <a href="/forgot-password" style={{ fontSize: 14, color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
              Mot de passe oublié ?
            </a>
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <label><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Se souvenir de moi</label>
        </div>
        {error && <div style={{ marginTop: 10, color: '#b91c1c' }}>{error}</div>}
        {info && <div style={{ marginTop: 10, color: '#065f46' }}>{info}</div>}
        <button type="submit" disabled={loading} style={{ marginTop: 16, width: '100%', padding: '12px 12px', borderRadius: 10, border: 'none', background: '#1AACBE', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 3px 10px rgba(26,172,190,0.3)' }}>
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
          style={{ marginTop: 8, width: '100%', padding: '12px 12px', borderRadius: 10, border: signupMode ? 'none' : '2px solid #1AACBE', background: signupMode ? '#F5A623' : 'transparent', color: signupMode ? '#4A3728' : '#1AACBE', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          {signupMode ? 'Valider l’inscription' : 'Créer un compte'}
        </button>
        {signupMode && (
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <button type="button" onClick={handleResendConfirmation} style={{ background: 'transparent', border: 'none', color: '#1AACBE', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}>
              Renvoyer e‑mail de confirmation
            </button>
          </div>
        )}
          </>
        )}
      </form>
    </div>
  );
}
