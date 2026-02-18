import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isFree, getDailyCounts } from '../utils/subscription';
import supabase from '../utils/supabaseClient';

// ==========================================
// NAVBAR MODERNE — CRAZY CHRONO
// Charte graphique officielle:
//   Teal #1AACBE | Yellow #F5A623 | Brown #4A3728
// ==========================================

const CC = {
  teal:      '#1AACBE',
  tealDark:  '#148A9C',
  tealDeep:  '#0D6A7A',
  yellow:    '#F5A623',
  yellowLt:  '#FFC940',
  brown:     '#4A3728',
  brownLt:   '#6B5443',
  white:     '#FFFFFF',
  cream:     '#FFF9F0',
};

const NavBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_auth') || 'null'); } catch { return null; }
  });
  const [quota, setQuota] = useState(() => getDailyCounts());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [gameHidden, setGameHidden] = useState(false);

  useEffect(() => {
    const onAuth = () => {
      try { setAuth(JSON.parse(localStorage.getItem('cc_auth') || 'null')); } catch { setAuth(null); }
    };
    window.addEventListener('cc:authChanged', onAuth);
    const onQ = () => setQuota(getDailyCounts());
    window.addEventListener('cc:quotaChanged', onQ);
    window.addEventListener('cc:subscriptionChanged', onQ);
    // Masquer la navbar pendant le jeu (plein écran)
    const onGame = (e) => setGameHidden(!!e?.detail?.on);
    window.addEventListener('cc:gameMode', onGame);
    window.addEventListener('cc:gameFullscreen', onGame);
    return () => {
      window.removeEventListener('cc:authChanged', onAuth);
      window.removeEventListener('cc:quotaChanged', onQ);
      window.removeEventListener('cc:subscriptionChanged', onQ);
      window.removeEventListener('cc:gameMode', onGame);
      window.removeEventListener('cc:gameFullscreen', onGame);
    };
  }, []);

  // ✅ FIX: Hooks MUST be called before any conditional return (Rules of Hooks)
  const role = useMemo(() => {
    if (!auth) return 'guest';
    if (auth.role === 'admin' || auth.isAdmin) return 'admin';
    if (auth.role === 'teacher' || auth.role === 'editor' || auth.isEditor) return 'teacher';
    return 'student';
  }, [auth]);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Masquer complètement la navbar en mode jeu (plein écran tablette/mobile)
  if (gameHidden) return null;

  const isLogin = location.pathname.startsWith('/login') || location.pathname.startsWith('/forgot') || location.pathname.startsWith('/reset');
  if (isLogin) return null;

  const isLogged = !!auth;
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher' || role === 'admin';

  const onLogout = async () => {
    try { await supabase?.auth?.signOut?.(); } catch {}
    try { localStorage.removeItem('cc_auth'); } catch {}
    try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
    navigate('/login', { replace: true });
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const logoSrc = `${process.env.PUBLIC_URL}/images/logo_crazy_chrono.png`;

  return (
    <>
      <nav style={{
        background: `linear-gradient(135deg, ${CC.tealDeep} 0%, ${CC.teal} 50%, ${CC.tealDark} 100%)`,
        padding: '0 20px 0 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 62,
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 3px 16px rgba(13,106,122,0.35)',
        fontFamily: "'Nunito', 'Segoe UI', system-ui, sans-serif",
        overflow: 'visible'
      }}>
        {/* ===== LOGO IN CIRCLE — coin supérieur gauche, partiellement caché ===== */}
        <Link to="/modes" style={{
          position: 'absolute',
          top: -30,
          left: -30,
          zIndex: 1002,
          textDecoration: 'none'
        }}>
          <div style={{
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${CC.yellowLt} 0%, ${CC.yellow} 60%, #E89B1A 100%)`,
            border: `3.5px solid ${CC.teal}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 24px rgba(245,166,35,0.45), inset 0 -2px 8px rgba(0,0,0,0.08)`,
            transition: 'transform 0.2s',
            cursor: 'pointer'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <img
              src={logoSrc}
              alt="Crazy Chrono"
              className="cc-logo-float"
              style={{ height: 95, width: 'auto', objectFit: 'contain' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
        </Link>
        {/* Spacer pour le contenu de la nav après le cercle */}
        <div style={{ width: 110, flexShrink: 0 }} />

        {/* ===== DESKTOP NAV ===== */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2
        }} className="cc-nav-desktop">
          <NavLink icon="🎮" label={isTeacher ? "Modes de jeu" : "Jouer"} to="/modes" active={isActive('/modes')} navigate={navigate} />

          {isTeacher && (
            <NavDropdown icon="📚" label="Entraînement" active={isActive('/training-arena')}>
              <DropdownItem icon="➕" label="Créer une session" to="/training-arena/setup" navigate={navigate} active={isActive('/training-arena/setup')} />
              <DropdownItem icon="📋" label="Gérer les matchs" to="/training-arena/manager" navigate={navigate} active={isActive('/training-arena/manager')} />
            </NavDropdown>
          )}

          {isTeacher && (
            <NavDropdown icon="🏆" label="Tournoi" active={isActive('/teacher/tournament') || isActive('/crazy-arena')}>
              <DropdownItem icon="⚙️" label="Configuration" to="/teacher/tournament" navigate={navigate} active={isActive('/teacher/tournament')} />
              <DropdownItem icon="📋" label="Gérer les matchs" to="/crazy-arena/manager" navigate={navigate} active={isActive('/crazy-arena/manager')} />
              <DropdownItem icon="🏅" label="Compétition / Bracket" to="/crazy-arena/competition" navigate={navigate} active={isActive('/crazy-arena/competition')} />
            </NavDropdown>
          )}

          <NavLink icon="📊" label="Performances" to="/my-performance" active={isActive('/my-performance')} navigate={navigate} />

          {isAdmin && (
            <NavDropdown icon="⚙️" label="Administration" active={isActive('/admin') || isActive('/debug')}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isFree() && (
            <Link to="/pricing" style={{
              fontSize: 11, color: CC.brown, background: CC.yellow,
              border: 'none', borderRadius: 20,
              padding: '5px 12px', textDecoration: 'none', fontWeight: 700,
              whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
            }}>
              Free {quota.sessions || 0}/3 · Upgrade
            </Link>
          )}

          <a href="https://crazy-chrono.com" style={{
            fontSize: 12, color: 'rgba(255,255,255,0.7)', textDecoration: 'none',
            padding: '6px 10px', borderRadius: 6, transition: 'color 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
          >
            🏪 Boutique
          </a>

          {isLogged && (
            <ProfileMenu auth={auth} role={role} onLogout={onLogout} navigate={navigate} />
          )}

          <button
            onClick={() => setMobileOpen(v => !v)}
            className="cc-nav-mobile-btn"
            style={{
              display: 'none',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', borderRadius: 8, padding: '8px 10px',
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
          background: CC.tealDeep, padding: '12px 16px',
          borderBottom: `3px solid ${CC.yellow}`,
          display: 'flex', flexDirection: 'column', gap: 4,
          position: 'sticky', top: 62, zIndex: 999
        }}>
          <MobileLink icon="🎮" label={isTeacher ? "Modes de jeu" : "Jouer"} to="/modes" navigate={navigate} active={isActive('/modes')} />
          {isTeacher && <MobileLink icon="📚" label="Entraînement — Créer" to="/training-arena/setup" navigate={navigate} active={isActive('/training-arena/setup')} />}
          {isTeacher && <MobileLink icon="📋" label="Entraînement — Matchs" to="/training-arena/manager" navigate={navigate} active={isActive('/training-arena/manager')} />}
          {isTeacher && <MobileLink icon="🏆" label="Tournoi — Config" to="/teacher/tournament" navigate={navigate} active={isActive('/teacher/tournament')} />}
          {isTeacher && <MobileLink icon="📋" label="Tournoi — Matchs" to="/crazy-arena/manager" navigate={navigate} active={isActive('/crazy-arena/manager')} />}
          {isTeacher && <MobileLink icon="🏅" label="Compétition" to="/crazy-arena/competition" navigate={navigate} active={isActive('/crazy-arena/competition')} />}
          <MobileLink icon="📊" label="Performances" to="/my-performance" navigate={navigate} active={isActive('/my-performance')} />
          {isAdmin && <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', margin: '6px 0' }} />}
          {isAdmin && <MobileLink icon="📊" label="Admin Dashboard" to="/admin/dashboard" navigate={navigate} active={isActive('/admin/dashboard')} />}
          {isAdmin && <MobileLink icon="👥" label="Rôles" to="/admin/roles" navigate={navigate} active={isActive('/admin/roles')} />}
          {isAdmin && <MobileLink icon="✉️" label="Invitations" to="/admin/invite" navigate={navigate} active={isActive('/admin/invite')} />}
          {isAdmin && <MobileLink icon="🔍" label="Debug" to="/debug/progress" navigate={navigate} active={isActive('/debug/progress')} />}
        </div>
      )}

      <style>{`
        @keyframes cc-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .cc-logo-float {
          animation: cc-float 2.5s ease-in-out infinite;
        }
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
// SUB-COMPONENTS — Brand-themed
// ==========================================

const NavLink = ({ icon, label, to, active, navigate }) => (
  <button
    onClick={() => navigate(to)}
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 8, border: 'none',
      background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
      color: active ? CC.yellow : 'rgba(255,255,255,0.85)',
      fontSize: 13, fontWeight: active ? 700 : 600,
      cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
      textShadow: active ? 'none' : '0 1px 2px rgba(0,0,0,0.15)'
    }}
    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; } }}
    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; } }}
  >
    <span style={{ fontSize: 15 }}>{icon}</span>
    {label}
  </button>
);

const NavDropdown = ({ icon, label, active, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
          background: active || open ? 'rgba(255,255,255,0.2)' : 'transparent',
          color: active ? CC.yellow : (open ? '#fff' : 'rgba(255,255,255,0.85)'),
          fontSize: 13, fontWeight: active ? 700 : 600,
          cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
          textShadow: '0 1px 2px rgba(0,0,0,0.15)'
        }}
        onMouseEnter={e => { if (!active && !open) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; } }}
        onMouseLeave={e => { if (!active && !open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; } }}
      >
        <span style={{ fontSize: 15 }}>{icon}</span>
        {label}
        <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: CC.white, border: `2px solid ${CC.teal}`,
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
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
      background: active ? `${CC.teal}15` : 'transparent',
      color: active ? CC.teal : CC.brown,
      fontSize: 13, fontWeight: active ? 700 : 500,
      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
    }}
    onMouseEnter={e => { e.currentTarget.style.background = active ? `${CC.teal}22` : '#f0fafb'; }}
    onMouseLeave={e => { e.currentTarget.style.background = active ? `${CC.teal}15` : 'transparent'; }}
  >
    <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{icon}</span>
    {label}
  </button>
);

const DropdownSeparator = () => (
  <div style={{ height: 1, background: '#e5e7eb', margin: '4px 8px' }} />
);

const MobileLink = ({ icon, label, to, navigate, active }) => (
  <button
    onClick={() => navigate(to)}
    style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 8, border: 'none',
      background: active ? 'rgba(245,166,35,0.2)' : 'transparent',
      color: active ? CC.yellow : 'rgba(255,255,255,0.9)',
      fontSize: 14, fontWeight: active ? 700 : 500,
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
  const ROLE_COLORS = { admin: '#e53e3e', teacher: CC.teal, student: CC.yellow, guest: '#a0aec0' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 12px 4px 4px', borderRadius: 999,
          border: '2px solid rgba(255,255,255,0.25)',
          background: open ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
          cursor: 'pointer', transition: 'all 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: 999,
          background: CC.yellow,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 12, color: CC.brown,
          boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
        }}>{initials}</span>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: CC.white, border: `2px solid ${CC.teal}`,
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          padding: 6, minWidth: 220, zIndex: 1001
        }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: CC.brown }}>{name}</div>
            <div style={{
              display: 'inline-block', fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 20, marginTop: 4,
              background: `${ROLE_COLORS[role]}18`, color: ROLE_COLORS[role],
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
              background: 'transparent', color: '#e53e3e',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
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
