import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
// ── Imports statiques (toujours nécessaires au démarrage) ──
import NavBar from './components/NavBar';
import { DataProvider } from './context/DataContext';
import Login from './components/Auth/Login';
import { fetchAndSyncStatus, getBackendUrl } from './utils/subscription';
import supabase from './utils/supabaseClient';
import NotificationBadge from './components/NotificationBadge';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import PWAUpdateButton from './components/PWAUpdateButton';
import LandingPage from './components/LandingPage';
import MaintenancePage, { hasMaintenanceBypass } from './components/MaintenancePage';
import { startHeartbeat, stopHeartbeat } from './utils/presenceHeartbeat';
// ── Code splitting: chargement à la demande (React.lazy) ──
const Carte = lazy(() => import('./components/Carte'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const ForgotPassword = lazy(() => import('./components/Auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./components/Auth/ResetPassword'));
const ProgressDebug = lazy(() => import('./components/Debug/ProgressDebug'));
const Pricing = lazy(() => import('./components/Billing/Pricing'));
const Account = lazy(() => import('./components/Account'));
const ModeSelect = lazy(() => import('./components/Modes/ModeSelect'));
const SessionConfig = lazy(() => import('./components/Modes/SessionConfig'));
const CrazyArenaSetup = lazy(() => import('./components/Tournament/CrazyArenaSetup'));
const CrazyArenaLobby = lazy(() => import('./components/Tournament/CrazyArenaLobby'));
const TrainingArenaGame = lazy(() => import('./components/Training/TrainingArenaGame'));
const TrainingArenaSetup = lazy(() => import('./components/Teacher/TrainingArenaSetup'));
const TrainingArenaManagerDashboard = lazy(() => import('./components/Teacher/TrainingArenaManagerDashboard'));
const TrainingArenaLobby = lazy(() => import('./components/Teacher/TrainingArenaLobby'));
const ArenaManagerDashboard = lazy(() => import('./components/Tournament/ArenaManagerDashboard'));
const ArenaSpectator = lazy(() => import('./components/Tournament/ArenaSpectator'));
const CompetitionBracket = lazy(() => import('./components/Tournament/CompetitionBracket'));
const MatchResults = lazy(() => import('./components/Tournament/MatchResults'));
const GroupMatchHistory = lazy(() => import('./components/Tournament/GroupMatchHistory'));
const StudentPerformance = lazy(() => import('./components/Student/StudentPerformance'));
const AdminRoles = lazy(() => import('./components/Admin/AdminRoles'));
const MonitoringDashboard = lazy(() => import('./components/MonitoringDashboard'));
const AdminInvite = lazy(() => import('./components/Admin/AdminInvite'));
const RectoratDashboard = lazy(() => import('./components/Rectorat/RectoratDashboard'));
const TeacherModeSelector = lazy(() => import('./components/Teacher/TeacherModeSelector'));
const TeacherDashboard = lazy(() => import('./components/Teacher/TeacherDashboard'));
const TrainingSessionCreate = lazy(() => import('./components/Teacher/TrainingSessionCreate'));
const TrainingManagerDashboard = lazy(() => import('./components/Teacher/TrainingManagerDashboard'));
const TrainingPlayerLobby = lazy(() => import('./components/Teacher/TrainingPlayerLobby'));
const GrandeSalle = lazy(() => import('./components/GrandeSalle/GrandeSalle'));
const TournamentAdmin = lazy(() => import('./components/GrandeSalle/TournamentAdmin'));
const LearnMode = lazy(() => import('./components/Modes/LearnMode'));
const LegalPages = lazy(() => import('./components/LegalPages'));
const PresentationPage = lazy(() => import('./components/PresentationPage'));
// Fallback de chargement pour Suspense
const LazyFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh', color: '#0D6A7A', fontSize: 18 }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
      Chargement...
    </div>
  </div>
);

// ⚠️ MAINTENANCE MODE: mettre à true pour bloquer l'accès public
const MAINTENANCE_MODE = true;

// ✅ AUTH WRAPPERS (outside App to prevent remount loops!)
const RequireAuth = ({ children, auth }) => auth ? children : <Navigate to="/login" replace />;

const RequireAdmin = ({ children }) => {
  try {
    const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
    if (a && (a.role === 'admin' || a.isAdmin)) return children;
  } catch {}
  return <Navigate to="/modes" replace />;
};

const RequireRectorat = ({ children }) => {
  try {
    const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
    if (a && (a.role === 'rectorat' || a.role === 'admin' || a.isAdmin)) return children;
  } catch {}
  return <Navigate to="/modes" replace />;
};

const RequirePro = ({ children, auth }) => {
  if (!auth) return <Navigate to="/login" replace />;
  try {
    const status = localStorage.getItem('cc_subscription_status');
    if (status === 'pro') return children;
    const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
    if (a && (a.role === 'admin' || a.role === 'teacher')) return children;
  } catch {}
  return <Navigate to="/pricing" replace />;
};

function App() {
  const [gameMode, setGameMode] = useState(false);
  // Global Diagnostic UI state
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLines, setDiagLines] = useState([]);
  const [diagRecording, setDiagRecording] = useState(false);
  const diagRecRef = useRef(false);
  const [diagRecLines, setDiagRecLines] = useState([]);
  const [logsCopied, setLogsCopied] = useState(false);
  const [logsSent, setLogsSent] = useState(false);
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

  // ✅ FIX DÉFINITIF: Admin auto-detection SANS fetch /me au montage (éviter freeze UI)
  // Détection via URL admin=1, localStorage cc_admin_ui=1, ou cc_auth role uniquement
  useEffect(() => {
    const urlHasAdmin = () => {
      try { return new URLSearchParams(window.location.search).get('admin') === '1'; } catch { return false; }
    };
    const lsAdmin = () => { try { return localStorage.getItem('cc_admin_ui') === '1'; } catch { return false; } };
    const authIsAdmin = () => {
      try {
        const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
        return a && (a.role === 'admin' || a.isAdmin === true);
      } catch { return false; }
    };
    // Ne plus faire de fetch /me ici - cause de freeze page
    if (urlHasAdmin() || lsAdmin() || authIsAdmin()) {
      setIsAdminUI(true);
    }
  }, []);

  // Recording ref sync
  useEffect(() => { diagRecRef.current = !!diagRecording; }, [diagRecording]);

  // Télécharger les logs en fichier .txt
  const downloadDiagRecording = () => {
    try {
      const text = (diagRecLines || []).join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.download = `crazy-chrono-logs-${timestamp}.txt`;
      document.body.appendChild(a);
      a.click();
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[LOGS] Erreur téléchargement:', err);
      alert('Erreur lors du téléchargement.');
    }
  };

  // Envoyer les logs au backend
  const sendLogsToBackend = async () => {
    try {
      const text = (diagRecLines || []).join('\n');
      if (!text || text.length < 10) {
        alert('Aucun log à envoyer. Démarrez l\'enregistrement d\'abord.');
        return;
      }
      const response = await fetch(`${getBackendUrl()}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: text,
          timestamp: new Date().toISOString(),
          source: 'app-diagnostic-global',
          matchId: 'N/A',
          userAgent: navigator.userAgent
        })
      });
      if (response.ok) {
        const result = await response.json();
        console.log('[LOGS] Envoyé au backend:', result);
        setLogsSent(true);
        setTimeout(() => setLogsSent(false), 3000);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      console.error('[LOGS] Erreur envoi backend:', err);
      alert(`Erreur envoi logs: ${err.message}. Essayez le téléchargement à la place.`);
    }
  };

  // Copier avec feedback
  const copyDiagRecording = async () => {
    try {
      const text = (diagRecLines || []).join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        try { if (textarea.parentNode) textarea.parentNode.removeChild(textarea); } catch {}
      }
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2000);
    } catch (err) {
      console.error('[LOGS] Erreur copie:', err);
      alert('Erreur lors de la copie.');
    }
  };

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

  // Global addDiag exposed on window + server forwarding via batched HTTP
  const diagBufferRef = useRef([]);
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
        // Buffer for server forwarding
        diagBufferRef.current.push({ label, payload: payload !== undefined ? payload : null, ts });
      } catch {}
    };
    try { window.ccAddDiag = add; } catch {}
    // Flush buffer to server every 5 seconds
    const flushInterval = setInterval(() => {
      const buf = diagBufferRef.current;
      if (!buf.length) return;
      diagBufferRef.current = [];
      try {
        fetch(`${getBackendUrl()}/api/monitoring/client-diag`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: buf.slice(0, 50) }),
        }).catch(() => {});
      } catch {}
    }, 5000);
    return () => { clearInterval(flushInterval); try { delete window.ccAddDiag; } catch {} };
  }, []);

  function serializeSafe(v) {
    try {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack?.slice(0, 400) };
      // Simplification radicale : juste convertir en string pour éviter toute erreur JSON
      if (typeof v === 'object' && v !== null) {
        try {
          return JSON.parse(JSON.stringify(v, (key, val) => {
            if (typeof val === 'function' || typeof val === 'undefined' || typeof val === 'symbol') return null;
            if (typeof val === 'string' && val.length > 300) return val.substring(0, 300) + '...';
            return val;
          }));
        } catch {
          return '[Object - Cannot serialize]';
        }
      }
      return v;
    } catch { 
      return '[Error]';
    }
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
            // Charger les préférences profil TOUJOURS (pas soumis au throttle /me)
            try {
              const profRes = await fetch(`${getBackendUrl()}/api/auth/profile`, { headers: { Authorization: `Bearer ${token}` } });
              const profJson = await profRes.json().catch(() => ({}));
              if (profJson?.ok && profJson?.profile) {
                const p = profJson.profile;
                const cur = JSON.parse(localStorage.getItem('cc_auth') || '{}');
                let changed = false;
                if (p.pseudo && cur.name !== p.pseudo) { cur.name = p.pseudo; changed = true; }
                if (p.language && cur.language !== p.language) { cur.language = p.language; changed = true; }
                if (p.avatar_url && cur.avatar !== p.avatar_url) { cur.avatar = p.avatar_url; changed = true; }
                if (p.strict_elements_mode !== null && p.strict_elements_mode !== undefined && cur.strictElementsMode !== !!p.strict_elements_mode) { cur.strictElementsMode = !!p.strict_elements_mode; changed = true; }
                if (changed) {
                  localStorage.setItem('cc_auth', JSON.stringify(cur));
                  try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
                }
              }
            } catch {}
            try {
              // Throttle /me to avoid rapid loops
              const ME_THROTTLE_KEY = 'cc_last_me_fetch_ts';
              const now = Date.now();
              try {
                const last = parseInt(localStorage.getItem(ME_THROTTLE_KEY) || '0', 10);
                if (Number.isFinite(last) && now - last < 30000) { 
                  try { window.ccAddDiag && window.ccAddDiag('me:throttled', { lastMs: now - last }); } catch {}
                  return; // STOP: do not fetch /me
                }
                localStorage.setItem(ME_THROTTLE_KEY, String(now));
              } catch {}
              const res = await fetch(`${getBackendUrl()}/me`, { headers: { Authorization: `Bearer ${token}` } });
              const json = await res.json().catch(() => ({}));
              if (json && json.ok && json.user) {
                const role = json.role || 'user';
                const isPro = (json.subscription === 'active' || json.subscription === 'trialing' || role === 'admin' || role === 'teacher');
                try { localStorage.setItem('cc_subscription_status', isPro ? 'pro' : 'free'); } catch {}
                try { localStorage.setItem('cc_user_id', json.user.id); } catch {}
                try { 
                  const existingAuth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
                  const merged = { 
                    ...existingAuth,
                    id: json.user.id, 
                    email: json.user.email, 
                    role, 
                    isAdmin: role === 'admin', 
                    isEditor: role !== 'user' 
                  };
                  localStorage.setItem('cc_auth', JSON.stringify(merged)); 
                } catch {}
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
      try {
        const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
        setAuth(a);
        // Mettre à jour isAdminUI si l'auth change et que l'utilisateur est admin
        if (a && (a.role === 'admin' || a.isAdmin === true)) {
          setIsAdminUI(true);
        }
      } catch {
        setAuth(null);
      }
    };
    window.addEventListener('cc:authChanged', onAuth);
    return () => window.removeEventListener('cc:authChanged', onAuth);
  }, []);
  // Heartbeat: signal de présence pour le monitoring
  useEffect(() => {
    if (auth) { startHeartbeat(); } else { stopHeartbeat(); }
    return () => stopHeartbeat();
  }, [auth]);
  const carteVidePath = `${process.env.PUBLIC_URL}/images/carte-vide.png`;
  
  // Maintenance gate: bloquer tout accès si MAINTENANCE_MODE=true sauf bypass
  // Exception: /presentation est toujours accessible (démo rectorat, enseignants)
  const isPresentation = window.location.pathname === '/presentation';
  if (MAINTENANCE_MODE && !hasMaintenanceBypass() && !isPresentation) {
    return <MaintenancePage />;
  }

  return (
    <DataProvider>
      <Router>
        <div className="App">
          {/* Badge notifications Arena (visible partout) */}
          {auth && <NotificationBadge />}
          {!gameMode && <NavBar />}
          <main>
            <Suspense fallback={<LazyFallback />}>
            <Routes>
              <Route path="/" element={auth ? <Navigate to="/modes" replace /> : <LandingPage />} />
              <Route path="/login" element={<Login onLogin={(a) => { setAuth(a); try { localStorage.setItem('cc_auth', JSON.stringify(a)); } catch {}; }} />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/modes" element={<RequireAuth auth={auth}><ModeSelect auth={auth} /></RequireAuth>} />
              <Route path="/config/:mode" element={<RequireAuth auth={auth}><SessionConfig /></RequireAuth>} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
              <Route path="/admin/monitoring" element={<RequireAdmin><MonitoringDashboard /></RequireAdmin>} />
              <Route path="/admin/roles" element={<RequireAdmin><AdminRoles /></RequireAdmin>} />
              <Route path="/admin/invite" element={<RequireAdmin><AdminInvite /></RequireAdmin>} />
              <Route path="/account" element={<RequireAuth auth={auth}><Account /></RequireAuth>} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/debug/progress" element={<RequireAuth auth={auth}><ProgressDebug /></RequireAuth>} />
              {/* Teacher - Dashboard + Mode Selector */}
              <Route path="/teacher/dashboard" element={<RequireAuth auth={auth}><TeacherDashboard /></RequireAuth>} />
              <Route path="/teacher" element={<RequireAuth auth={auth}><TeacherModeSelector /></RequireAuth>} />
              <Route path="/teacher/training/create" element={<RequireAuth auth={auth}><TrainingSessionCreate /></RequireAuth>} />
              <Route path="/teacher/training/manager" element={<RequireAuth auth={auth}><TrainingManagerDashboard /></RequireAuth>} />
              <Route path="/teacher/tournament" element={<RequireAuth auth={auth}><CrazyArenaSetup /></RequireAuth>} />
              {/* Training Mode - Élève lobby puis jeu */}
              <Route path="/training/lobby/:matchId" element={<RequireAuth auth={auth}><TrainingPlayerLobby /></RequireAuth>} />
              {/* Crazy Arena (Tournoi 4 joueurs) - Lobby redirige vers /carte?arena=matchId */}
              <Route path="/tournament/setup" element={<RequireAuth auth={auth}><CrazyArenaSetup /></RequireAuth>} />
              <Route path="/crazy-arena/manager" element={<RequireAuth auth={auth}><ArenaManagerDashboard /></RequireAuth>} />
              <Route path="/crazy-arena/competition" element={<RequireAuth auth={auth}><CompetitionBracket /></RequireAuth>} />
              <Route path="/crazy-arena/lobby/:roomCode" element={<RequireAuth auth={auth}><CrazyArenaLobby /></RequireAuth>} />
              <Route path="/crazy-arena/spectate/:matchId" element={<RequireAuth auth={auth}><ArenaSpectator /></RequireAuth>} />
              <Route path="/tournament/match/:matchId/results" element={<RequireAuth auth={auth}><MatchResults /></RequireAuth>} />
              <Route path="/tournament/group/:groupId/history" element={<RequireAuth auth={auth}><GroupMatchHistory /></RequireAuth>} />
              {/* Dashboard Performance Élève */}
              <Route path="/my-performance" element={<RequirePro auth={auth}><StudentPerformance /></RequirePro>} />
              <Route path="/student/:studentId/performance" element={<RequireAuth auth={auth}><StudentPerformance /></RequireAuth>} />
              {/* Training Arena (Mode Entraînement - identique à Crazy Arena) */}
              <Route path="/training-arena/setup" element={<RequireAuth auth={auth}><TrainingArenaSetup /></RequireAuth>} />
              <Route path="/training-arena/manager" element={<RequireAuth auth={auth}><TrainingArenaManagerDashboard /></RequireAuth>} />
              <Route path="/training-arena/lobby/:roomCode" element={<RequireAuth auth={auth}><TrainingArenaLobby /></RequireAuth>} />
              <Route path="/training-arena/game" element={<RequireAuth auth={auth}><TrainingArenaGame /></RequireAuth>} />
              {/* Grande Salle publique */}
              <Route path="/grande-salle" element={<RequireAuth auth={auth}><GrandeSalle /></RequireAuth>} />
              <Route path="/grande-salle/tournament/:tournamentId" element={<RequireAuth auth={auth}><GrandeSalle /></RequireAuth>} />
              <Route path="/admin/tournaments" element={<RequireAdmin><TournamentAdmin /></RequireAdmin>} />
              {/* Dashboard Rectorat (cadres académiques) */}
              <Route path="/rectorat" element={<RequireRectorat><RectoratDashboard /></RequireRectorat>} />
              {/* Mode Apprendre (Premium) */}
              <Route path="/apprendre" element={<RequireAuth auth={auth}><LearnMode /></RequireAuth>} />
              {/* Carte (éditeur/jeu) accessible en direct si nécessaire, sinon on y accède après config */}
              <Route path="/carte" element={<div className="carte-container-wrapper"><Carte backgroundImage={carteVidePath} /></div>} />
              <Route path="/presentation" element={<PresentationPage />} />
              <Route path="/legal" element={<LegalPages />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </main>
          {!gameMode && (
            <footer style={{ background: '#0D6A7A', color: 'rgba(255,255,255,0.7)', padding: '16px 24px', textAlign: 'center', fontSize: 13 }}>
              <p style={{ margin: 0 }}>© 2025 CRAZY CHRONO — DIGIKAZ · Tous droits réservés</p>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                <a href="/legal?tab=mentions" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 12 }}>Mentions légales</a>
                <a href="/legal?tab=confidentialite" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 12 }}>Confidentialité</a>
                <a href="/legal?tab=cgu" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 12 }}>CGU / CGV</a>
              </div>
            </footer>
          )}
        </div>
        <PWAInstallPrompt />
        <PWAUpdateButton />
      </Router>
    </DataProvider>
  );
}

export default App;
