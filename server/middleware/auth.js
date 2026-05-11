// ==========================================
// SHARED AUTH MIDDLEWARE
// Validates JWT token via Supabase + role checks
// ==========================================

const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

// ✅ PERF: Cache JWT en mémoire (évite d'appeler supabase.auth.getUser pour chaque requête)
const _authCache = new Map();
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const AUTH_CACHE_MAX = 500;

function getCachedAuth(token) {
  const entry = _authCache.get(token);
  if (!entry) return null;
  if (Date.now() - entry.ts > AUTH_CACHE_TTL) { _authCache.delete(token); return null; }
  return entry.user;
}
function setCachedAuth(token, user) {
  if (_authCache.size >= AUTH_CACHE_MAX) {
    const oldest = _authCache.keys().next().value;
    _authCache.delete(oldest);
  }
  _authCache.set(token, { user, ts: Date.now() });
}

// Require any authenticated user (valid JWT)
async function requireAuth(req, res, next) {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'service_unavailable' });
    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    // Vérifier le cache d'abord
    const cached = getCachedAuth(token);
    if (cached) {
      req.authUser = cached;
      return next();
    }
    const { data: who, error: whoErr } = await supabase.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
    const authUser = { id: who.user.id, email: who.user.email };
    setCachedAuth(token, authUser);
    req.authUser = authUser;
    next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'auth_error' });
  }
}

// Require admin role (JWT + user_profiles.role === 'admin')
async function requireAdminAuth(req, res, next) {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'service_unavailable' });
    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabase.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
    const { data: prof } = await supabase.from('user_profiles').select('role').eq('id', who.user.id).single();
    if (!prof || prof.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    req.adminUser = { id: who.user.id, email: who.user.email };
    next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'auth_error' });
  }
}

// Require CPD (ex-rectorat) or admin role — vue globale région académique
async function requireRectoratAuth(req, res, next) {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'service_unavailable' });
    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabase.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
    const { data: prof } = await supabase.from('user_profiles').select('role, region, circonscription_id').eq('id', who.user.id).single();
    const CPD_ROLES = ['cpd', 'rectorat', 'admin'];
    if (!prof || !CPD_ROLES.includes(prof.role)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    req.rectoratUser = { id: who.user.id, email: who.user.email, role: prof.role, region: prof.region, circonscription_id: prof.circonscription_id || null };
    next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'auth_error' });
  }
}

// Require CPC role — vue limitée à une seule circonscription
async function requireCPCAuth(req, res, next) {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'service_unavailable' });
    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabase.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
    const { data: prof } = await supabase.from('user_profiles').select('role, region, circonscription_id').eq('id', who.user.id).single();
    if (!prof || (prof.role !== 'cpc' && prof.role !== 'admin')) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    if (prof.role === 'cpc' && !prof.circonscription_id) {
      return res.status(403).json({ ok: false, error: 'cpc_missing_circonscription' });
    }
    req.cpcUser = { id: who.user.id, email: who.user.email, role: prof.role, region: prof.region, circonscription_id: prof.circonscription_id };
    next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'auth_error' });
  }
}

// Require CPD, CPC, or admin — pour les routes partagées (écoles, classes, matchs)
async function requireCPDOrCPCAuth(req, res, next) {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'service_unavailable' });
    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabase.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
    const { data: prof } = await supabase.from('user_profiles').select('role, region, circonscription_id').eq('id', who.user.id).single();
    const ALLOWED_ROLES = ['cpd', 'cpc', 'rectorat', 'admin'];
    if (!prof || !ALLOWED_ROLES.includes(prof.role)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    if (prof.role === 'cpc' && !prof.circonscription_id) {
      return res.status(403).json({ ok: false, error: 'cpc_missing_circonscription' });
    }
    req.acadUser = {
      id: who.user.id,
      email: who.user.email,
      role: prof.role,
      region: prof.region,
      circonscription_id: prof.circonscription_id || null,
      isCPC: prof.role === 'cpc',
      isCPD: prof.role === 'cpd' || prof.role === 'rectorat',
      isAdmin: prof.role === 'admin'
    };
    next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'auth_error' });
  }
}

module.exports = { requireAuth, requireAdminAuth, requireRectoratAuth, requireCPCAuth, requireCPDOrCPCAuth };
