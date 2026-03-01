import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com';
const supabase = (process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY)
  ? createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY)
  : null;

const readAuth = () => {
  try { return JSON.parse(localStorage.getItem('cc_auth') || 'null'); } catch { return null; }
};

const writeAuth = (auth) => {
  try { localStorage.setItem('cc_auth', JSON.stringify(auth)); } catch {}
  try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
};

const Account = () => {
  const [auth, setAuth] = useState(() => readAuth());
  const isAdmin = useMemo(() => !!(auth && (auth.isAdmin || auth.isEditor || auth.role === 'admin' || auth.role === 'editor')), [auth]);

  const [name, setName] = useState(auth?.name || auth?.username || '');
  const [role, setRole] = useState(auth?.role || (auth?.isAdmin ? 'admin' : auth?.isEditor ? 'editor' : 'user'));
  const [remember, setRemember] = useState(!!auth?.remember);
  const [language, setLanguage] = useState(auth?.language || 'fr');
  const [strictElementsMode, setStrictElementsMode] = useState(!!auth?.strictElementsMode);
  const [avatar, setAvatar] = useState(auth?.avatar || '');
  const [saved, setSaved] = useState(false);
  const [rgpdLoading, setRgpdLoading] = useState('');
  const [rgpdMsg, setRgpdMsg] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    const onAuth = () => setAuth(readAuth());
    window.addEventListener('cc:authChanged', onAuth);
    return () => window.removeEventListener('cc:authChanged', onAuth);
  }, []);

  const onUploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setAvatar(String(dataUrl));
    };
    reader.readAsDataURL(file);
  };

  // RGPD: get Supabase JWT token
  const getToken = useCallback(async () => {
    if (!supabase) return null;
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  }, []);

  // RGPD: Export personal data
  const handleExportData = useCallback(async () => {
    setRgpdLoading('export');
    setRgpdMsg('');
    try {
      const token = await getToken();
      if (!token) { setRgpdMsg('Vous devez être connecté pour exporter vos données.'); return; }
      const res = await fetch(`${BACKEND_URL}/api/rgpd/export-data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setRgpdMsg(json.error || 'Erreur lors de l\'export.'); return; }
      // Download as JSON file
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mes-donnees-crazy-chrono.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setRgpdMsg('Export téléchargé avec succès.');
    } catch (e) {
      setRgpdMsg('Erreur réseau. Réessayez plus tard.');
    } finally {
      setRgpdLoading('');
    }
  }, [getToken]);

  // RGPD: Delete account
  const handleDeleteAccount = useCallback(async () => {
    setRgpdLoading('delete');
    setRgpdMsg('');
    try {
      const token = await getToken();
      if (!token) { setRgpdMsg('Vous devez être connecté pour supprimer votre compte.'); return; }
      const res = await fetch(`${BACKEND_URL}/api/rgpd/delete-account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setRgpdMsg(json.error || 'Erreur lors de la suppression.'); return; }
      // Clear local storage and redirect
      try { localStorage.clear(); } catch {}
      try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
      setRgpdMsg('Compte supprimé. Vous allez être redirigé...');
      setTimeout(() => { window.location.href = '/'; }, 2000);
    } catch (e) {
      setRgpdMsg('Erreur réseau. Réessayez plus tard.');
    } finally {
      setRgpdLoading('');
      setShowDeleteConfirm(false);
    }
  }, [getToken]);

  const onSave = () => {
    const next = {
      ...(auth || {}),
      name,
      username: name,
      role,
      isAdmin: role === 'admin' || !!auth?.isAdmin,
      isEditor: role === 'editor' || !!auth?.isEditor,
      remember,
      language,
      strictElementsMode,
      avatar,
    };
    setAuth(next);
    writeAuth(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div style={{ maxWidth: 720, margin: '18px auto', padding: '0 16px' }}>
      <h2>Mon compte</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ width: 120, height: 120, borderRadius: '50%', overflow: 'hidden', background: '#e5e7eb', border: '1px solid #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatar ? (
              <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: '#6b7280' }}>Aucun avatar</span>
            )}
          </div>
          <label style={{ display: 'inline-block', marginTop: 10, cursor: 'pointer' }}>
            <span style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb' }}>Choisir un avatar</span>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onUploadAvatar} />
          </label>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600 }}>Pseudo</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Joueur-123" style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600 }}>Rôle</label>
            <select value={role} onChange={e => setRole(e.target.value)} disabled={!isAdmin} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', background: !isAdmin ? '#f3f4f6' : '#fff' }}>
              <option value="user">Utilisateur</option>
              <option value="editor">Éditeur</option>
              <option value="admin">Administrateur</option>
            </select>
            {!isAdmin && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Seul un administrateur peut modifier le rôle.</div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600 }}>Langue</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600 }}>Se souvenir de moi</label>
              <div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                  Conserver la session sur cet appareil
                </label>
              </div>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600 }}>Politique stricte éléments (par défaut)</label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={strictElementsMode} onChange={e => setStrictElementsMode(e.target.checked)} />
              Exiger que les éléments correspondent au niveau et aux thèmes sélectionnés
            </label>
          </div>
          <div>
            <button onClick={onSave} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #1AACBE, #148A9C)', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 10px rgba(26,172,190,0.3)' }}>Enregistrer</button>
            {saved && <span style={{ marginLeft: 10, color: '#1AACBE', fontWeight: 600 }}>Enregistré ✓</span>}
          </div>
        </div>
      </div>
      {/* RGPD Section */}
      <div style={{ marginTop: 40, borderTop: '2px solid #fee2e2', paddingTop: 24 }}>
        <h3 style={{ color: '#991b1b', fontSize: 18, marginBottom: 12 }}>Mes données personnelles (RGPD)</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Conformément au Règlement Général sur la Protection des Données (RGPD), vous pouvez à tout moment exporter ou supprimer vos données personnelles.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleExportData}
            disabled={!!rgpdLoading}
            style={{
              padding: '10px 18px', borderRadius: 10, border: '2px solid #1AACBE',
              background: '#f0fafb', color: '#0D6A7A', fontWeight: 700, cursor: rgpdLoading ? 'wait' : 'pointer',
              opacity: rgpdLoading ? 0.6 : 1,
            }}
          >
            {rgpdLoading === 'export' ? 'Export en cours...' : 'Télécharger mes données'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!!rgpdLoading}
            style={{
              padding: '10px 18px', borderRadius: 10, border: '2px solid #dc2626',
              background: '#fff', color: '#dc2626', fontWeight: 700, cursor: rgpdLoading ? 'wait' : 'pointer',
              opacity: rgpdLoading ? 0.6 : 1,
            }}
          >
            Supprimer mon compte
          </button>
        </div>
        {rgpdMsg && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: rgpdMsg.includes('succ') || rgpdMsg.includes('supprim') ? '#ecfdf5' : '#fef2f2', color: rgpdMsg.includes('succ') || rgpdMsg.includes('supprim') ? '#065f46' : '#991b1b', fontSize: 14, fontWeight: 600 }}>
            {rgpdMsg}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 12px', color: '#991b1b', fontSize: 20 }}>Supprimer mon compte</h3>
            <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
              Cette action est <strong>irréversible</strong>. Toutes vos données seront définitivement supprimées :
            </p>
            <ul style={{ color: '#374151', fontSize: 13, lineHeight: 1.8, paddingLeft: 20, margin: '8px 0 16px' }}>
              <li>Votre profil et compte</li>
              <li>Votre historique de jeu</li>
              <li>Vos abonnements</li>
              <li>Vos résultats d'entraînement</li>
            </ul>
            <p style={{ color: '#374151', fontSize: 14, marginBottom: 12 }}>
              Tapez <strong>SUPPRIMER</strong> pour confirmer :
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '2px solid #d1d5db', fontSize: 16, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#f3f4f6', color: '#374151', fontWeight: 700, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'SUPPRIMER' || !!rgpdLoading}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: 'none',
                  background: deleteConfirmText === 'SUPPRIMER' ? '#dc2626' : '#d1d5db',
                  color: '#fff', fontWeight: 700, cursor: deleteConfirmText === 'SUPPRIMER' ? 'pointer' : 'not-allowed',
                }}
              >
                {rgpdLoading === 'delete' ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Account;
