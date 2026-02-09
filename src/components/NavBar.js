import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isFree, getDailyCounts } from '../utils/subscription';
import supabase from '../utils/supabaseClient';

// ==========================================
// NAVBAR MODERNE — CRAZY CHRONO
// Navigation role-based: Admin / Enseignant / Élève
// ==========================================

const NavBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_auth') || 'null'); } catch { return null; }
  });
  const [quota, setQuota] = useState(() => getDailyCounts());
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onAuth = () => {
      try { setAuth(JSON.parse(localStorage.getItem('cc_auth') || 'null')); } catch { setAuth(null); }
    };
    window.addEventListener('cc:authChanged', onAuth);
    const onQ = () => setQuota(getDailyCounts());
    window.addEventListener('cc:quotaChanged', onQ);
    window.addEventListener('cc:subscriptionChanged', onQ);
    return () => {
      window.removeEventListener('cc:authChanged', onAuth);
      window.removeEventListener('cc:quotaChanged', onQ);
      window.removeEventListener('cc:subscriptionChanged', onQ);
    };
  }, []);

  const isLogin = location.pathname.startsWith('/login') || location.pathname.startsWith('/forgot') || location.pathname.startsWith('/reset');
  const role = useMemo(() => {
    if (!auth) return 'guest';
    if (auth.role === 'admin' || auth.isAdmin) return 'admin';
    if (auth.role === 'teacher' || auth.role === 'editor' || auth.isEditor) return 'teacher';
    return 'student';
  }, [auth]);
  const isLogged = !!auth;
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher' || role === 'admin';

  const onLogout = async () => {
    try { await supabase?.auth?.signOut?.(); } catch {}
    try { localStorage.removeItem('cc_auth'); } catch {}
    try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
    navigate('/login', { replace: true });
  };

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  if (isLogin) return null;

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <>
      <nav style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 60,
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        {/* ===== LOGO ===== */}
        <Link to="/modes" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', flexShrink: 0
        }}>
          <span style={{ fontSize: 28 }}>🎲</span>
          <span style={{
            fontSize: 20, fontWeight: 900, letterSpacing: 1,
            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #ec4899 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>
            CRAZY CHRONO
          </span>
        </Link>

        {/* ===== DESKTOP NAV ===== */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          '@media (max-width: 768px)': { display: 'none' }
        }} className="cc-nav-desktop">
          {/* Jouer / Modes */}
          <NavLink icon="🎮" label={isTeacher ? "Modes de jeu" : "Jouer"} to="/modes" active={isActive('/modes')} navigate={navigate} />

          {/* Enseignant: Entraînement dropdown */}
          {isTeacher && (
            <NavDropdown icon="📚" label="Entraînement" active={isActive('/training-arena')}>
              <DropdownItem icon="➕" label="Créer une session" to="/training-arena/setup" navigate={navigate} active={isActive('/training-arena/setup')} />
              <DropdownItem icon="📋" label="Gérer les matchs" to="/training-arena/manager" navigate={navigate} active={isActive('/training-arena/manager')} />
            </NavDropdown>
          )}

          {/* Enseignant: Tournoi dropdown */}
          {isTeacher && (
            <NavDropdown icon="🏆" label="Tournoi" active={isActive('/teacher/tournament') || isActive('/crazy-arena')}>
              <DropdownItem icon="⚙️" label="Configuration" to="/teacher/tournament" navigate={navigate} active={isActive('/teacher/tournament')} />
              <DropdownItem icon="📋" label="Gérer les matchs" to="/crazy-arena/manager" navigate={navigate} active={isActive('/crazy-arena/manager')} />
              <DropdownItem icon="🏅" label="Compétition / Bracket" to="/crazy-arena/competition" navigate={navigate} active={isActive('/crazy-arena/competition')} />
            </NavDropdown>
          )}

          {/* Performances */}
          <NavLink icon="📊" label="Performances" to="/my-performance" active={isActive('/my-performance')} navigate={navigate} />

          {/* Admin dropdown */}
          {isAdmin && (
            <NavDropdown icon="⚙️" label="Administration" active={
              isActive('/admin') || isActive('/debug')
            }>
              <DropdownItem icon="📊" label="Dashboard" to="/admin/dashboard" navigate={navigate} active={isActive('/admin/dashboard')} />
              <DropdownItem icon="👥" label="Rôles" to="/admin/roles" navigate={navigate} active={isActive('/admin/roles')} />
              <DropdownItem icon="✉️" label="Invitations" to="/admin/invite" navigate={navigate} active={isActive('/admin/invite')} />
              <DropdownItem icon="🔍" label="Debug" to="/debug/progress" navigate={navigate} active={isActive('/debug/progress')} />
              <DropdownItem icon="📡" label="Monitoring" to="/admin/monitoring" navigate={navigate} active={isActive('/admin/monitoring')} />
              <DropdownItem icon="🏛️" label="Rectorat" to="/admin" navigate={navigate} active={location.pathname === '/admin'} />
              <DropdownSeparator />
              <DropdownItem icon="✏️" label="Mode édition" onClick={() => window.dispatchEvent(new Event('cc:toggleEditMode'))} />
              <DropdownItem icon="💾" label="Sauvegarder carte" onClick={() => window.dispatchEvent(new Event('cc:saveMathPositions'))} />
            </NavDropdown>
          )}
        </div>

        {/* ===== RIGHT SIDE ===== */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Free quota badge */}
          {isFree() && (
            <Link to="/pricing" style={{
              fontSize: 11, color: '#fbbf24', background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.3)', borderRadius: 20,
              padding: '4px 10px', textDecoration: 'none', fontWeight: 600,
              whiteSpace: 'nowrap'
            }}>
              Free {quota.sessions || 0}/3 · Upgrade
            </Link>
          )}

          {/* Boutique link */}
          <a href="https://crazy-chrono.com" style={{
            fontSize: 12, color: '#94a3b8', textDecoration: 'none',
            padding: '6px 10px', borderRadius: 6,
            transition: 'color 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
          >
            🏪 Boutique
          </a>

          {/* Profile */}
          {isLogged && (
            <ProfileMenu auth={auth} role={role} onLogout={onLogout} navigate={navigate} />
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="cc-nav-mobile-btn"
            style={{
              display: 'none', // shown via CSS media query
              background: 'none', border: '1px solid rgba(255,255,255,0.2)',
              color: '#e2e8f0', borderRadius: 6, padding: '6px 8px',
              cursor: 'pointer', fontSize: 18
            }}
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* ===== MOBILE MENU ===== */}
      {mobileOpen && (
        <div className="cc-nav-mobile-menu" style={{
          background: '#1e293b', padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', flexDirection: 'column', gap: 4,
          position: 'sticky', top: 60, zIndex: 999
        }}>
          <MobileLink icon="🎮" label={isTeacher ? "Modes de jeu" : "Jouer"} to="/modes" navigate={navigate} active={isActive('/modes')} />
          {isTeacher && <MobileLink icon="📚" label="Entraînement — Créer" to="/training-arena/setup" navigate={navigate} active={isActive('/training-arena/setup')} />}
          {isTeacher && <MobileLink icon="📋" label="Entraînement — Matchs" to="/training-arena/manager" navigate={navigate} active={isActive('/training-arena/manager')} />}
          {isTeacher && <MobileLink icon="🏆" label="Tournoi — Config" to="/teacher/tournament" navigate={navigate} active={isActive('/teacher/tournament')} />}
          {isTeacher && <MobileLink icon="📋" label="Tournoi — Matchs" to="/crazy-arena/manager" navigate={navigate} active={isActive('/crazy-arena/manager')} />}
          {isTeacher && <MobileLink icon="🏅" label="Compétition" to="/crazy-arena/competition" navigate={navigate} active={isActive('/crazy-arena/competition')} />}
          <MobileLink icon="📊" label="Performances" to="/my-performance" navigate={navigate} active={isActive('/my-performance')} />
          {isAdmin && <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '6px 0' }} />}
          {isAdmin && <MobileLink icon="📊" label="Admin Dashboard" to="/admin/dashboard" navigate={navigate} active={isActive('/admin/dashboard')} />}
          {isAdmin && <MobileLink icon="👥" label="Rôles" to="/admin/roles" navigate={navigate} active={isActive('/admin/roles')} />}
          {isAdmin && <MobileLink icon="✉️" label="Invitations" to="/admin/invite" navigate={navigate} active={isActive('/admin/invite')} />}
          {isAdmin && <MobileLink icon="🔍" label="Debug" to="/debug/progress" navigate={navigate} active={isActive('/debug/progress')} />}
        </div>
      )}

      {/* ===== CSS for responsive ===== */}
      <style>{`
        @media (max-width: 860px) {
          .cc-nav-desktop { display: none !important; }
          .cc-nav-mobile-btn { display: block !important; }
        }
        @media (min-width: 861px) {
          .cc-nav-mobile-menu { display: none !important; }
        }
      `}</style>
    </>
  );
};

// ==========================================
// SUB-COMPONENTS
// ==========================================

const NavLink = ({ icon, label, to, active, navigate }) => (
  <button
    onClick={() => navigate(to)}
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 8, border: 'none',
      background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
      color: active ? '#fff' : '#94a3b8',
      fontSize: 13, fontWeight: active ? 700 : 500,
      cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'
    }}
    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0'; } }}
    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; } }}
  >
    <span style={{ fontSize: 15 }}>{icon}</span>
    {label}
  </button>
);

const NavDropdown = ({ icon, label, active, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8, border: 'none',
          background: active || open ? 'rgba(255,255,255,0.12)' : 'transparent',
          color: active || open ? '#fff' : '#94a3b8',
          fontSize: 13, fontWeight: active ? 700 : 500,
          cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'
        }}
        onMouseEnter={e => { if (!active && !open) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0'; } }}
        onMouseLeave={e => { if (!active && !open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; } }}
      >
        <span style={{ fontSize: 15 }}>{icon}</span>
        {label}
        <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          padding: 6, minWidth: 220, zIndex: 1001
        }}>
          {React.Children.map(children, child =>
            child ? React.cloneElement(child, { closeMenu: () => setOpen(false) }) : null
          )}
        </div>
      )}
    </div>
  );
};

const DropdownItem = ({ icon, label, to, navigate, active, onClick, closeMenu }) => (
  <button
    onClick={() => {
      if (onClick) onClick();
      else if (to && navigate) navigate(to);
      if (closeMenu) closeMenu();
    }}
    style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
      padding: '10px 12px', borderRadius: 8, border: 'none',
      background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
      color: active ? '#60a5fa' : '#cbd5e1',
      fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
    }}
    onMouseEnter={e => { e.currentTarget.style.background = active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(59,130,246,0.15)' : 'transparent'; }}
  >
    <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{icon}</span>
    {label}
  </button>
);

const DropdownSeparator = () => (
  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 8px' }} />
);

const MobileLink = ({ icon, label, to, navigate, active }) => (
  <button
    onClick={() => navigate(to)}
    style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 8, border: 'none',
      background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
      color: active ? '#60a5fa' : '#cbd5e1',
      fontSize: 14, fontWeight: active ? 600 : 400,
      cursor: 'pointer', textAlign: 'left', width: '100%'
    }}
  >
    <span style={{ fontSize: 16 }}>{icon}</span>
    {label}
  </button>
);

const ProfileMenu = ({ auth, role, onLogout, navigate }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  let name = auth?.name || auth?.username || auth?.user || 'Utilisateur';
  if (name === 'Utilisateur' && auth?.email) {
    name = auth.email.split('@')[0];
  }
  const initials = String(name).trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase() || 'U';

  const ROLE_LABELS = { admin: 'Administrateur', teacher: 'Enseignant', student: 'Élève', guest: 'Invité' };
  const ROLE_COLORS = { admin: '#ef4444', teacher: '#8b5cf6', student: '#3b82f6', guest: '#6b7280' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 12px 4px 4px', borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.15)',
          background: open ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
          cursor: 'pointer', transition: 'all 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: 999,
          background: `linear-gradient(135deg, ${ROLE_COLORS[role]} 0%, ${ROLE_COLORS[role]}88 100%)`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 12, color: '#fff'
        }}>{initials}</span>
        <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          padding: 6, minWidth: 220, zIndex: 1001
        }}>
          {/* User info header */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{name}</div>
            <div style={{
              display: 'inline-block', fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 20, marginTop: 4,
              background: `${ROLE_COLORS[role]}22`, color: ROLE_COLORS[role],
              border: `1px solid ${ROLE_COLORS[role]}44`
            }}>
              {ROLE_LABELS[role] || role}
            </div>
          </div>
          <DropdownItem icon="👤" label="Mon compte" to="/account" navigate={navigate} closeMenu={() => setOpen(false)} />
          <DropdownItem icon="💰" label="Abonnement" to="/pricing" navigate={navigate} closeMenu={() => setOpen(false)} />
          <DropdownSeparator />
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 12px', borderRadius: 8, border: 'none',
              background: 'transparent', color: '#f87171',
              fontSize: 13, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>🚪</span>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
};

export default NavBar;
