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

// Require any authenticated user (valid JWT)
async function requireAuth(req, res, next) {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'service_unavailable' });
    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabase.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
    req.authUser = { id: who.user.id, email: who.user.email };
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

// Require rectorat or admin role
async function requireRectoratAuth(req, res, next) {
  try {
    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ ok: false, error: 'service_unavailable' });
    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabase.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
    const { data: prof } = await supabase.from('user_profiles').select('role, region').eq('id', who.user.id).single();
    if (!prof || (prof.role !== 'rectorat' && prof.role !== 'admin')) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    req.rectoratUser = { id: who.user.id, email: who.user.email, role: prof.role, region: prof.region };
    next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'auth_error' });
  }
}

module.exports = { requireAuth, requireAdminAuth, requireRectoratAuth };
