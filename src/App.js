import React, { useEffect, useState } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Carte from './components/Carte';
import AdminPanel from './components/AdminPanel';
import NavBar from './components/NavBar';
import { DataProvider } from './context/DataContext';
import Login from './components/Auth/Login';
import ProgressDebug from './components/Debug/ProgressDebug';
import Pricing from './components/Billing/Pricing';
import Account from './components/Account';
import ModeSelect from './components/Modes/ModeSelect';
import SessionConfig from './components/Modes/SessionConfig';
import AdminRoles from './components/Admin/AdminRoles';
import { fetchAndSyncStatus, getBackendUrl } from './utils/subscription';
import supabase from './utils/supabaseClient';

function App() {
  const [gameMode, setGameMode] = useState(false);
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
  useEffect(() => {
    const sync = async () => {
      try {
        // 1) Try full sync from backend /me using Supabase JWT if available
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          const token = data?.session?.access_token || null;
          if (token) {
            try {
              const res = await fetch(`${getBackendUrl()}/me`, { headers: { Authorization: `Bearer ${token}` } });
              const json = await res.json().catch(() => ({}));
              if (json && json.ok && json.user) {
                const role = json.role || 'user';
                try { localStorage.setItem('cc_subscription_status', (json.subscription === 'active' || json.subscription === 'trialing') ? 'pro' : 'free'); } catch {}
                try { localStorage.setItem('cc_auth', JSON.stringify({ id: json.user.id, email: json.user.email, role, isAdmin: role === 'admin', isEditor: role !== 'user' })); } catch {}
                try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
              }
            } catch {}
          }
        }
        // 2) Fallback: keep previous behavior to sync subscription by user id if already known
        if (auth && auth.id) await fetchAndSyncStatus(auth.id);
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
              <Route path="/admin/roles" element={<RequireAdmin><AdminRoles /></RequireAdmin>} />
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
        </div>
      </Router>
    </DataProvider>
  );
}

export default App;
