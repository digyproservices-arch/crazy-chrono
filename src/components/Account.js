import React, { useEffect, useMemo, useState } from 'react';

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
    </div>
  );
};

export default Account;
