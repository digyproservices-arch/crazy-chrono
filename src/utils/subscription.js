// Lightweight freemium helpers for Sprint A
// Storage keys
const KEY_STATUS = 'cc_subscription_status'; // 'free' | 'pro'
const KEY_QUOTA = 'cc_free_quota'; // { dayISO:string, sessions:number }
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com';

export function getSubscriptionStatus() {
  try {
    const raw = localStorage.getItem(KEY_STATUS);
    const v = raw ? String(raw) : 'free';
    return v === 'pro' ? 'pro' : 'free';
  } catch { return 'free'; }
}

export function setSubscriptionStatus(status) {
  try { localStorage.setItem(KEY_STATUS, status === 'pro' ? 'pro' : 'free'); } catch {}
  try { window.dispatchEvent(new Event('cc:subscriptionChanged')); } catch {}
}

function todayISO() {
  try { return new Date().toISOString().slice(0,10); } catch { return '1970-01-01'; }
}

export function getDailyCounts() {
  try {
    const raw = localStorage.getItem(KEY_QUOTA);
    const obj = raw ? JSON.parse(raw) : null;
    if (!obj || obj.dayISO !== todayISO()) return { dayISO: todayISO(), sessions: 0 };
    return obj;
  } catch { return { dayISO: todayISO(), sessions: 0 }; }
}

export function canStartSessionToday(limit = 3) {
  const q = getDailyCounts();
  return (q.sessions || 0) < limit;
}

export function incrementSessionCount() {
  try {
    const q = getDailyCounts();
    const next = { dayISO: todayISO(), sessions: (q.sessions || 0) + 1 };
    localStorage.setItem(KEY_QUOTA, JSON.stringify(next));
    try { window.dispatchEvent(new Event('cc:quotaChanged')); } catch {}
    return next.sessions;
  } catch { return null; }
}

export function isPro() {
  return getSubscriptionStatus() === 'pro';
}

export function isFree() { return !isPro(); }

// Fetch real status from backend and sync local storage
export async function fetchAndSyncStatus(userId) {
  try {
    const uid = String(userId || '').trim();
    if (!uid) return { ok: false, error: 'missing_user_id' };
    const url = `${BACKEND_URL}/me/subscription?user_id=${encodeURIComponent(uid)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const json = await res.json().catch(() => ({}));
    const active = !!(json && json.ok && (json.status === 'active' || json.status === 'trialing'));
    setSubscriptionStatus(active ? 'pro' : 'free');
    return { ok: true, status: active ? 'active' : (json?.status || null), raw: json };
  } catch (e) {
    // Network error: do not flip status to free aggressively; keep previous value
    return { ok: false, error: e?.message || 'fetch_failed' };
  }
}

export function getBackendUrl() { return BACKEND_URL; }
