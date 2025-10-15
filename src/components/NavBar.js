import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isFree, getDailyCounts } from '../utils/subscription';

const NavBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [editOn, setEditOn] = useState(false);
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_auth') || 'null'); } catch { return null; }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [quota, setQuota] = useState(() => getDailyCounts());

  useEffect(() => {
    const onChanged = (e) => {
      if (e && e.detail && typeof e.detail.editMode === 'boolean') {
        setEditOn(e.detail.editMode);
      }
    };
    const onAuth = () => {
      try { setAuth(JSON.parse(localStorage.getItem('cc_auth') || 'null')); } catch { setAuth(null); }
    };
    window.addEventListener('cc:editModeChanged', onChanged);
    window.addEventListener('cc:authChanged', onAuth);
    const onQ = () => setQuota(getDailyCounts());
    window.addEventListener('cc:quotaChanged', onQ);
    window.addEventListener('cc:subscriptionChanged', onQ);
    return () => {
      window.removeEventListener('cc:editModeChanged', onChanged);
      window.removeEventListener('cc:authChanged', onAuth);
      window.removeEventListener('cc:quotaChanged', onQ);
      window.removeEventListener('cc:subscriptionChanged', onQ);
    };
  }, []);

  const isLogin = location.pathname.startsWith('/login');
  const isAdmin = useMemo(() => !!(auth && (auth.isAdmin || auth.isEditor || auth.role === 'admin' || auth.role === 'editor')), [auth]);
  const isLogged = !!auth;

  const onLogout = () => {
    try { localStorage.removeItem('cc_auth'); } catch {}
    try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
    navigate('/login', { replace: true });
  };

  if (isLogin) {
    return (
      <header style={{ padding: '12px 16px 0', textAlign: 'center' }}>
        <h1 style={{ margin: 0, color: '#1f2937' }}>Éditeur de Carte</h1>
        <div style={{ color: '#6b7280', marginTop: 4 }}>Connectez‑vous pour jouer ou administrer</div>
      </header>
    );
  }

  return (
    <nav style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
      <Link to="/" style={{ fontWeight: location.pathname === "/" ? "bold" : "normal" }}>Carte</Link>
      <a href="https://crazy-chrono.com" style={{ marginLeft: 12, textDecoration: 'none', color: '#1f2937' }}>Retour boutique</a>
      {isAdmin && (
        <Link to="/admin" style={{ fontWeight: location.pathname === "/admin" ? "bold" : "normal" }}>Admin</Link>
      )}
      <span style={{ width: 1, height: 18, background: '#ccc', margin: '0 8px' }} />
      {/* Global free quota badge + link to pricing */}
      {isFree() && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span title="Quota quotidien en version gratuite" style={{ fontSize: 12, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '4px 8px' }}>
            Free: {quota.sessions || 0}/3 aujourd'hui
          </span>
          <Link to="/pricing" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #3b82f6', background: '#3b82f6', color: '#fff', fontWeight: 700 }}>S’abonner</Link>
        </div>
      )}

      {isAdmin && (
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #999', background: '#f3f4f6', cursor: 'pointer', fontWeight: 700 }}
            title="Paramètres d'édition"
            aria-expanded={menuOpen}
          >
            ⚙️ Paramètres
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, minWidth: 200, zIndex: 20 }}>
              <button
                type="button"
                onClick={() => { window.dispatchEvent(new Event('cc:toggleEditMode')); setMenuOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: editOn ? '#dcfce7' : '#f9fafb', cursor: 'pointer', marginBottom: 6 }}
              >
                ✏️ Mode édition: {editOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => { window.dispatchEvent(new Event('cc:saveMathPositions')); setMenuOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#e0f2fe', cursor: 'pointer' }}
              >
                💾 Sauvegarder
              </button>
            </div>
          )}
        </div>
      )}

      <span style={{ width: 1, height: 18, background: '#ccc', margin: '0 8px' }} />
      {/* Always expose a Save button to keep previous UX intact */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('cc:saveMathPositions'))}
        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #93c5fd', background: '#e0f2fe', cursor: 'pointer' }}
        title="Sauvegarder positions/rotations"
      >
        💾 Sauvegarder
      </button>
      {isLogged && (
        <ProfileMenu auth={auth} onLogout={onLogout} navigate={navigate} />
      )}
    </nav>
  );
};

const ProfileMenu = ({ auth, onLogout, navigate }) => {
  const [open, setOpen] = useState(false);
  const name = auth?.name || auth?.username || auth?.user || 'Utilisateur';
  const initials = String(name).trim().split(/\s+/).map(s => s[0]).join('').slice(0,2).toUpperCase() || 'U';
  const role = auth?.role || (auth?.isAdmin ? 'admin' : (auth?.isEditor ? 'editor' : 'user'));
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff' }}
        title={`${name} (${role})`}
        aria-expanded={open}
      >
        <span style={{ width: 26, height: 26, borderRadius: 999, background: '#e5e7eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{initials}</span>
        <span style={{ maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, minWidth: 200, zIndex: 20 }}>
          <div style={{ padding: '6px 8px', fontSize: 12, color: '#6b7280' }}>{name} · {role}</div>
          <button
            type="button"
            onClick={() => { try { window.dispatchEvent(new Event('cc:openAccount')); } catch {}; try { navigate && navigate('/admin'); } catch {}; setOpen(false); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', marginTop: 6 }}
          >
            👤 Mon compte
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onLogout(); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fee2e2', cursor: 'pointer', marginTop: 6 }}
          >
            🚪 Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
};

export default NavBar;
