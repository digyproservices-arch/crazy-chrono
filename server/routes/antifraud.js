// ==========================================
// PHASE 4 — MONITORING ANTI-FRAUDE
// Rate-limiting login, audit log, alertes
// ==========================================

const express = require('express');
const router = express.Router();

// ── In-memory rate limiter (login attempts) ──
const loginAttempts = new Map(); // key: identifier → { count, firstAttempt }
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 min
const RATE_LIMIT_MAX = 5;

function isRateLimited(identifier) {
  const entry = loginAttempts.get(identifier);
  if (!entry) return false;
  if (Date.now() - entry.firstAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.delete(identifier);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX;
}

function recordLoginAttempt(identifier) {
  const entry = loginAttempts.get(identifier);
  if (!entry || Date.now() - entry.firstAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.set(identifier, { count: 1, firstAttempt: Date.now() });
  } else {
    entry.count++;
  }
  // Cleanup si trop d'entrées
  if (loginAttempts.size > 10000) {
    const now = Date.now();
    for (const [k, v] of loginAttempts.entries()) {
      if (now - v.firstAttempt > RATE_LIMIT_WINDOW) loginAttempts.delete(k);
    }
  }
}

function clearLoginAttempts(identifier) {
  loginAttempts.delete(identifier);
}

// ── Audit log helper ──
async function logAuditEvent(supabaseAdmin, { userId, eventType, ip, userAgent, fingerprint, metadata }) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('auth_audit_log').insert({
      user_id: userId,
      event_type: eventType,
      ip_address: ip || null,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      device_fingerprint: fingerprint || null,
      metadata: metadata || {},
    });
  } catch (e) {
    console.warn('[Audit] log error:', e.message);
  }
}

// POST /api/antifraud/check-rate-limit — Vérifier si un identifiant est rate-limité
router.post('/check-rate-limit', (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier) return res.status(400).json({ ok: false, error: 'missing_identifier' });
  
  const limited = isRateLimited(identifier);
  return res.json({ ok: true, rateLimited: limited, remaining: Math.max(0, RATE_LIMIT_MAX - (loginAttempts.get(identifier)?.count || 0)) });
});

// POST /api/antifraud/record-attempt — Enregistrer une tentative de login
router.post('/record-attempt', async (req, res) => {
  const { identifier, success, userId, fingerprint } = req.body || {};
  if (!identifier) return res.status(400).json({ ok: false, error: 'missing_identifier' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  const supabaseAdmin = req.app.locals.supabaseAdmin;

  if (success) {
    // Login réussi: reset le compteur + log audit
    clearLoginAttempts(identifier);
    if (userId) {
      await logAuditEvent(supabaseAdmin, {
        userId,
        eventType: 'login',
        ip,
        userAgent,
        fingerprint,
        metadata: { identifier },
      });

      // Vérifier le nombre d'IPs uniques sur 24h
      if (supabaseAdmin) {
        try {
          const { data } = await supabaseAdmin.rpc('count_unique_ips_24h', { p_user_id: userId });
          const uniqueIps = typeof data === 'number' ? data : 0;
          if (uniqueIps >= 3) {
            console.warn(`[Antifraud] ⚠️ ALERTE: ${identifier} a ${uniqueIps} IPs uniques en 24h!`);
            // Stocker l'alerte pour le dashboard admin
            await logAuditEvent(supabaseAdmin, {
              userId,
              eventType: 'suspicious_ips',
              ip,
              userAgent,
              fingerprint,
              metadata: { identifier, uniqueIps, alert: true },
            });
          }
        } catch {}
      }
    }
    return res.json({ ok: true });
  } else {
    // Login échoué: incrémenter le compteur + log
    recordLoginAttempt(identifier);
    recordLoginAttempt(ip); // aussi par IP

    if (supabaseAdmin) {
      // Utiliser un UUID fictif pour les login fails (on ne connaît pas le user)
      const fakeUserId = '00000000-0000-0000-0000-000000000000';
      await logAuditEvent(supabaseAdmin, {
        userId: fakeUserId,
        eventType: 'login_failed',
        ip,
        userAgent,
        fingerprint,
        metadata: { identifier },
      });
    }

    const limited = isRateLimited(identifier) || isRateLimited(ip);
    return res.json({ ok: true, rateLimited: limited });
  }
});

// GET /api/antifraud/suspicious — Lister les comptes suspects (admin only)
router.get('/suspicious', async (req, res) => {
  try {
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    if (!supabaseAdmin) return res.json({ ok: true, accounts: [] });

    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabaseAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });

    // Vérifier que c'est un admin
    const { data: prof } = await supabaseAdmin.from('user_profiles').select('role').eq('id', who.user.id).single();
    if (!prof || !['admin', 'rectorat'].includes(prof.role)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const minIps = parseInt(req.query.min_ips) || 3;
    const { data, error } = await supabaseAdmin.rpc('detect_suspicious_accounts', { p_min_ips: minIps });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    return res.json({ ok: true, accounts: data || [] });

  } catch (error) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/antifraud/audit-log — Historique audit (admin only)
router.get('/audit-log', async (req, res) => {
  try {
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    if (!supabaseAdmin) return res.json({ ok: true, logs: [] });

    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabaseAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });

    // Vérifier admin/teacher
    const { data: prof } = await supabaseAdmin.from('user_profiles').select('role').eq('id', who.user.id).single();
    if (!prof || !['admin', 'rectorat', 'teacher'].includes(prof.role)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const userId = req.query.user_id || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let query = supabaseAdmin.from('auth_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    return res.json({ ok: true, logs: data || [] });

  } catch (error) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Exporter le helper pour utilisation dans d'autres routes
module.exports = router;
module.exports.logAuditEvent = logAuditEvent;
module.exports.isRateLimited = isRateLimited;
module.exports.recordLoginAttempt = recordLoginAttempt;
module.exports.clearLoginAttempts = clearLoginAttempts;
