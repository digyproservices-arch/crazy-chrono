// Lightweight freemium helpers for Sprint A
// Storage keys
import { getAuthToken } from './apiHelpers';
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

// Valeur par défaut (fallback) si le serveur n'a pas encore répondu.
// La source de vérité est la variable d'env FREE_SESSIONS_PER_DAY côté serveur,
// exposée via GET /api/config/free-limit et mise en cache localement.
export const FREE_SESSIONS_PER_DAY = 2;
const KEY_FREE_LIMIT = 'cc_free_limit';

// Limite courante : valeur serveur en cache, sinon fallback constant.
export function getFreeLimit() {
  try {
    const raw = localStorage.getItem(KEY_FREE_LIMIT);
    const n = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch {}
  return FREE_SESSIONS_PER_DAY;
}

// Récupère la limite réelle depuis le serveur et la met en cache.
// À appeler au démarrage (ex: NavBar). Émet 'cc:freeLimitChanged' si la valeur change.
export async function refreshFreeLimit() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/config/free-limit`, { headers: { 'Accept': 'application/json' } });
    const json = await res.json().catch(() => ({}));
    const limit = Number(json?.limit);
    if (json?.ok && Number.isFinite(limit) && limit > 0) {
      const prev = getFreeLimit();
      try { localStorage.setItem(KEY_FREE_LIMIT, String(limit)); } catch {}
      if (limit !== prev) {
        try { window.dispatchEvent(new Event('cc:freeLimitChanged')); } catch {}
      }
      return limit;
    }
  } catch {}
  return getFreeLimit();
}

export function canStartSessionToday(limit = getFreeLimit()) {
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
  if (getSubscriptionStatus() === 'pro') return true;
  try {
    const a = JSON.parse(localStorage.getItem('cc_auth') || 'null');
    if (a && (a.role === 'admin' || a.role === 'teacher' || a.role === 'cpd' || a.role === 'cpc' || a.role === 'rectorat' || a.role === 'student')) return true;
  } catch {}
  // Fallback: un élève connecté (cc_student_id présent) est toujours pro
  try { if (localStorage.getItem('cc_student_id')) return true; } catch {}
  return false;
}

export function isFree() { return !isPro(); }

// Fetch real status from backend and sync local storage
export async function fetchAndSyncStatus(userId) {
  try {
    const uid = String(userId || '').trim();
    if (!uid) return { ok: false, error: 'missing_user_id' };
    const url = `${BACKEND_URL}/me/subscription?user_id=${encodeURIComponent(uid)}`;
    const token = getAuthToken();
    const res = await fetch(url, { headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) } });
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
