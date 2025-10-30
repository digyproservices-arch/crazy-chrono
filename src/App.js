import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Carte from './components/Carte';
import AdminPanel from './components/AdminPanel';
import AdminDashboard from './components/AdminDashboard';
import NavBar from './components/NavBar';
import { DataProvider } from './context/DataContext';
import Login from './components/Auth/Login';
import ProgressDebug from './components/Debug/ProgressDebug';
import Pricing from './components/Billing/Pricing';
import Account from './components/Account';
import ModeSelect from './components/Modes/ModeSelect';
import SessionConfig from './components/Modes/SessionConfig';
import AdminRoles from './components/Admin/AdminRoles';
import AdminInvite from './components/Admin/AdminInvite';
import { fetchAndSyncStatus, getBackendUrl } from './utils/subscription';
import supabase from './utils/supabaseClient';

function App() {
  const [gameMode, setGameMode] = useState(false);
  // Global Diagnostic UI state
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLines, setDiagLines] = useState([]);
  const [diagRecording, setDiagRecording] = useState(false);
  const diagRecRef = useRef(false);
  const [diagRecLines, setDiagRecLines] = useState([]);
  const [isAdminUI, setIsAdminUI] = useState(false);
  const consoleOrigRef = useRef({ log: null, warn: null, error: null });
  const fetchOrigRef = useRef(null);
  const detachHandlersRef = useRef(() => {});
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_auth')) || null; } catch { return null; }
  });
  useEffect(() => {
    const onGame = (e) => {
      const on = !!(e && e.detail && e.detail.on);
      setGameMode(on);
    };
    window.addEventListener('cc:gameMode', onGame);
    return () => window.removeEventListener('cc:gameMode', onGame);
  }, []);

  // Admin auto-detection (URL admin=1, localStorage cc_admin_ui=1, or backend /me?email=...) with throttle
  useEffect(() => {
    const urlHasAdmin = () => {
      try { return new URLSearchParams(window.location.search).get('admin') === '1'; } catch { return false; }
    };
    const lsAdmin = () => { try { return localStorage.getItem('cc_admin_ui') === '1'; } catch { return false; } };
    const pre = urlHasAdmin() || lsAdmin();
    if (pre) { setIsAdminUI(true); return; }
    let email = null;
    try { email = (JSON.parse(localStorage.getItem('cc_auth')||'null')||{}).email || localStorage.getItem('cc_profile_email') || localStorage.getItem('user_email') || localStorage.getItem('email'); } catch {}
    if (!email) return;
    try {
      const THROTTLE_KEY = 'cc_last_me_email_fetch_ts';
      const now = Date.now();
      try {
        const last = parseInt(localStorage.getItem(THROTTLE_KEY) || '0', 10);
        if (Number.isFinite(last) && now - last < 60000) {
          try { window.ccAddDiag && window.ccAddDiag('me:email:throttled', { lastMs: now - last }); } catch {}
          return; // 60s throttle
        }
        localStorage.setItem(THROTTLE_KEY, String(now));
      } catch {}
      fetch(`${getBackendUrl()}/me?email=${encodeURIComponent(email)}`)
        .then(r => r.ok ? r.json() : null)
        .then(j => { if (j && j.ok && String(j.role||'').toLowerCase()==='admin') setIsAdminUI(true); })
        .catch(() => {});
    } catch {}
  }, []);

  // Recording ref sync
  useEffect(() => { diagRecRef.current = !!diagRecording; }, [diagRecording]);

  // Auto-start recording via ?rec=1
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('rec') === '1') {
        setDiagRecLines([]);
        setDiagRecording(true);
        try { window.ccAddDiag && window.ccAddDiag('recording:auto:start'); } catch {}
      }
    } catch {}
  }, []);

  // When recording is ON, capture console, errors, and fetch
  useEffect(() => {
    if (!diagRecording) {
      // restore
      try {
        if (consoleOrigRef.current.log) console.log = consoleOrigRef.current.log;
        if (consoleOrigRef.current.warn) console.warn = consoleOrigRef.current.warn;
        if (consoleOrigRef.current.error) console.error = consoleOrigRef.current.error;
        if (fetchOrigRef.current) window.fetch = fetchOrigRef.current;
      } catch {}
      try { detachHandlersRef.current && detachHandlersRef.current(); } catch {}
      return;
    }
    // install
    try {
      // console hooks
      consoleOrigRef.current = { log: console.log, warn: console.warn, error: console.error };
      const mk = (type) => (...args) => {
        try { window.ccAddDiag && window.ccAddDiag(`console:${type}`, { args: args.map(a => serializeSafe(a)).slice(0, 5) }); } catch {}
        try { (type==='log'? consoleOrigRef.current.log : type==='warn'? consoleOrigRef.current.warn : consoleOrigRef.current.error).apply(console, args); } catch {}
      };
      console.log = mk('log');
      console.warn = mk('warn');
      console.error = mk('error');
      // error handlers
      const onErr = (e) => {
        try { window.ccAddDiag && window.ccAddDiag('window:error', { msg: String(e?.message||''), src: e?.filename, lineno: e?.lineno, colno: e?.colno }); } catch {}
      };
      const onRej = (e) => {
        try { window.ccAddDiag && window.ccAddDiag('window:unhandledrejection', { reason: String(e?.reason||'') }); } catch {}
      };
      window.addEventListener('error', onErr);
      window.addEventListener('unhandledrejection', onRej);
      // fetch wrapper
      if (!fetchOrigRef.current) fetchOrigRef.current = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const started = Date.now();
        const url = typeof input === 'string' ? input : (input && input.url) || 'unknown';
        try { window.ccAddDiag && window.ccAddDiag('fetch:start', { url, method: init?.method||'GET' }); } catch {}
        try {
          const res = await fetchOrigRef.current(input, init);
          try { window.ccAddDiag && window.ccAddDiag('fetch:end', { url, status: res.status, ms: Date.now()-started }); } catch {}
          return res;
        } catch (err) {
          try { window.ccAddDiag && window.ccAddDiag('fetch:error', { url, ms: Date.now()-started, error: String(err) }); } catch {}
          throw err;
        }
      };
      detachHandlersRef.current = () => {
        try { window.removeEventListener('error', onErr); } catch {}
        try { window.removeEventListener('unhandledrejection', onRej); } catch {}
      };
    } catch {}
    // cleanup when recording toggles off
    return () => {
      try {
        if (consoleOrigRef.current.log) console.log = consoleOrigRef.current.log;
        if (consoleOrigRef.current.warn) console.warn = consoleOrigRef.current.warn;
        if (consoleOrigRef.current.error) console.error = consoleOrigRef.current.error;
        if (fetchOrigRef.current) window.fetch = fetchOrigRef.current;
      } catch {}
      try { detachHandlersRef.current && detachHandlersRef.current(); } catch {}
    };
  }, [diagRecording]);

  // Global addDiag exposed on window
  useEffect(() => {
    const add = (label, payload) => {
      try {
        const ts = new Date().toISOString();
        const line = payload!==undefined ? `${ts} | ${label} | ${JSON.stringify(payload)}` : `${ts} | ${label}`;
        setDiagLines(prev => {
          const arr = Array.isArray(prev)? [...prev, line] : [line];
          return arr.slice(Math.max(0, arr.length - 199));
        });
        if (diagRecRef.current) {
          setDiagRecLines(prev => {
            const arr = Array.isArray(prev)? [...prev, line] : [line];
            return arr.slice(Math.max(0, arr.length - 999));
          });
        }
      } catch {}
    };
    try { window.ccAddDiag = add; } catch {}
    return () => { try { delete window.ccAddDiag; } catch {} };
  }, []);

  function serializeSafe(v) {
    try {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack?.slice(0, 400) };
      if (typeof v === 'object') return JSON.parse(JSON.stringify(v));
      return v;
    } catch { return String(v); }
  }

  // Keyboard shortcut Ctrl+Alt+D to toggle panel
  useEffect(() => {
    const onKey = (e) => {
      try {
        const k = String(e.key||'').toLowerCase();
        if (e.ctrlKey && e.altKey && k==='d') { e.preventDefault(); setDiagOpen(v=>!v); }
      } catch {}
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const sync = async () => {
      try {
        let syncedFromMe = false;
        // 1) Try full sync from backend /me using Supabase JWT if available
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          const token = data?.session?.access_token || null;
          if (token) {
            try {
              // Throttle /me to avoid rapid loops
              const ME_THROTTLE_KEY = 'cc_last_me_fetch_ts';
              const now = Date.now();
              try {
                const last = parseInt(localStorage.getItem(ME_THROTTLE_KEY) || '0', 10);
                if (Number.isFinite(last) && now - last < 30000) { 
                  try { window.ccAddDiag && window.ccAddDiag('me:throttled', { lastMs: now - last }); } catch {}
                  return; // STOP: do not fetch
                }
                localStorage.setItem(ME_THROTTLE_KEY, String(now));
              } catch {}
              const res = await fetch(`${getBackendUrl()}/me`, { headers: { Authorization: `Bearer ${token}` } });
              const json = await res.json().catch(() => ({}));
              if (json && json.ok && json.user) {
                const role = json.role || 'user';
                const isPro = (json.subscription === 'active' || json.subscription === 'trialing' || role === 'admin');
                try { localStorage.setItem('cc_subscription_status', isPro ? 'pro' : 'free'); } catch {}
                try { localStorage.setItem('cc_auth', JSON.stringify({ id: json.user.id, email: json.user.email, role, isAdmin: role === 'admin', isEditor: role !== 'user' })); } catch {}
                try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
                syncedFromMe = true;
              }
            } catch {}
          }
        }
        // 2) Fallback: only if NOT already synced from /me (prevents flicker and overrides)
        if (!syncedFromMe && auth && auth.id) await fetchAndSyncStatus(auth.id);
      } catch {}
    };
    sync();
  }, [auth]);
  useEffect(() => {
    const onAuth = () => {
      try { setAuth(JSON.parse(localStorage.getItem('cc_auth') || 'null')); } catch { setAuth(null); }
    };
    window.addEventListener('cc:authChanged', onAuth);
    return () => window.removeEventListener('cc:authChanged', onAuth);
  }, []);
  const carteVidePath = `${process.env.PUBLIC_URL}/images/carte-vide.png`;
  const RequireAuth = ({ children }) => auth ? children : <Navigate to="/login" replace />;
  const RequireAdmin = ({ children }) => {
    try {
      const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
      if (a && (a.role === 'admin' || a.isAdmin)) return children;
    } catch {}
    return <Navigate to="/modes" replace />;
  };
  return (
    <DataProvider>
      <Router>
        <div className="App">
          {!gameMode && (
            <header className="App-header">
              <h1>Éditeur de Carte</h1>
              <p>Ajoutez du texte sur votre carte</p>
            </header>
          )}
          {!gameMode && <NavBar />}
          <main>
            <Routes>
              <Route path="/" element={<Navigate to={auth ? "/modes" : "/login"} replace />} />
              <Route path="/login" element={<Login onLogin={(a) => { setAuth(a); try { localStorage.setItem('cc_auth', JSON.stringify(a)); } catch {}; }} />} />
              <Route path="/modes" element={<RequireAuth><ModeSelect /></RequireAuth>} />
              <Route path="/config/:mode" element={<RequireAuth><SessionConfig /></RequireAuth>} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
              <Route path="/admin/roles" element={<RequireAdmin><AdminRoles /></RequireAdmin>} />
              <Route path="/admin/invite" element={<RequireAdmin><AdminInvite /></RequireAdmin>} />
              <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
              <Route path="/pricing" element={<RequireAuth><Pricing /></RequireAuth>} />
              <Route path="/debug/progress" element={<RequireAuth><ProgressDebug /></RequireAuth>} />
              {/* Carte (éditeur/jeu) accessible en direct si nécessaire, sinon on y accède après config */}
              <Route path="/carte" element={<div className="carte-container-wrapper"><Carte backgroundImage={carteVidePath} /></div>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          {!gameMode && (
            <footer>
              <p>© 2025 - Éditeur de Carte</p>
            </footer>
          )}
          {/* Global Diagnostic floating button and panel */}
          <button
            onClick={() => setDiagOpen(v=>!v)}
            title="Diagnostic"
            style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 10000, background: '#111827', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '8px 12px', boxShadow: '0 6px 18px rgba(0,0,0,0.25)', opacity: 0.9 }}
          >Diagnostic</button>
          {diagOpen && (
            <div style={{ position: 'fixed', right: 12, bottom: 56, width: 420, maxWidth: '90vw', maxHeight: '70vh', overflow: 'auto', zIndex: 10000, background: '#111827', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: 'bold' }}>Diagnostic (global)</div>
                <button onClick={() => setDiagOpen(false)} style={{ color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', borderRadius: 6, padding: '4px 8px' }}>Fermer</button>
              </div>
              {isAdminUI ? (
                <div style={{ padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {!diagRecording && (
                      <button onClick={() => { setDiagRecLines([]); setDiagRecording(true); try { window.ccAddDiag && window.ccAddDiag('recording:start'); } catch {} }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #10b981', background: '#065f46', color: '#ecfdf5' }}>Démarrer</button>
                    )}
                    {diagRecording && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 20, background: '#10b981', boxShadow: '0 0 0 0 rgba(16,185,129,0.7)', animation: 'cc-blink 1s infinite' }} />
                          <span style={{ fontSize: 13, color: '#a7f3d0' }}>Enregistrement global en cours…</span>
                        </div>
                        <button onClick={() => { setDiagRecording(false); try { window.ccAddDiag && window.ccAddDiag('recording:stop', { count: diagRecLines.length }); } catch {} }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ef4444', background: '#7f1d1d', color: '#fee2e2' }}>Arrêter</button>
                      </>
                    )}
                    <button onClick={async()=>{ try { await navigator.clipboard.writeText((diagRecLines||[]).join('\n')); } catch {} }} disabled={!diagRecLines.length} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#e5e7eb' }}>Copier</button>
                    <button onClick={()=>{ setDiagLines([]); setDiagRecLines([]); }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#e5e7eb' }}>Vider</button>
                  </div>
                  <style>{`@keyframes cc-blink { 0%{opacity:1} 50%{opacity:0.3} 100%{opacity:1} }`}</style>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Derniers évènements</div>
                  <div style={{ maxHeight: 180, overflow: 'auto', background: '#0b1220', padding: 8, borderRadius: 6 }}>
                    {(diagLines||[]).slice(-120).map((l,i)=>(<div key={i} style={{ whiteSpace: 'pre-wrap' }}>{l}</div>))}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, margin: '6px 0 4px' }}>Enregistrement ({diagRecLines.length} lignes)</div>
                  <div style={{ maxHeight: 160, overflow: 'auto', background: '#0b1220', padding: 8, borderRadius: 6 }}>
                    {(diagRecLines||[]).map((l,i)=>(<div key={i} style={{ whiteSpace: 'pre-wrap' }}>{l}</div>))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: 10, fontSize: 14 }}>
                  <div style={{ marginBottom: 6, fontWeight: 'bold' }}>Accès restreint</div>
                  <div style={{ opacity: 0.9, marginBottom: 8 }}>Panneau réservé aux administrateurs. Connectez‑vous avec un compte admin.</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Raccourci: Ctrl+Alt+D</div>
                </div>
              )}
            </div>
          )}
        </div>
      </Router>
    </DataProvider>
  );
}

export default App;
