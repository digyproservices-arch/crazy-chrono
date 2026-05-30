// ==========================================
// ROUTES SESSION — Enforcement de session unique
// 1 licence = 1 session active à la fois
// ==========================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// ── In-memory cache pour éviter de frapper Supabase à chaque vérification ──
const sessionCache = new Map();
const SESSION_CACHE_TTL = 60_000; // 1 min

function getCachedSession(token) {
  const entry = sessionCache.get(token);
  if (!entry) return null;
  if (Date.now() - entry.ts > SESSION_CACHE_TTL) { sessionCache.delete(token); return null; }
  return entry.data;
}

function setCachedSession(token, data) {
  if (sessionCache.size > 2000) {
    // Purge oldest 500 entries
    const keys = [...sessionCache.keys()].slice(0, 500);
    keys.forEach(k => sessionCache.delete(k));
  }
  sessionCache.set(token, { data, ts: Date.now() });
}

function invalidateCachedSession(token) {
  sessionCache.delete(token);
}

// Exposer pour usage dans Socket.IO middleware
router._sessionCache = sessionCache;
router._getCachedSession = getCachedSession;
router._setCachedSession = setCachedSession;
router._invalidateCachedSession = invalidateCachedSession;

/**
 * POST /api/session/create
 * Crée une session active et invalide toutes les précédentes pour ce user.
 * Body: { deviceId? }
 * Headers: Authorization: Bearer <jwt>
 * Returns: { ok, sessionToken, invalidatedCount }
 */
router.post('/create', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.status(503).json({ ok: false, error: 'service_unavailable' });

    // 1) Auth: vérifier JWT
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'missing_token' });
    }
    const jwt = authHeader.slice(7).trim();
    const { data: who, error: whoErr } = await supabase.auth.getUser(jwt);
    if (whoErr || !who?.user) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }

    const userId = who.user.id;
    const { deviceId } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // 2) Générer un session token unique
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // 3) Invalider toutes les sessions précédentes
    const { data: invalidated, error: invErr } = await supabase.rpc('invalidate_user_sessions', {
      p_user_id: userId,
      p_except_token: null // invalider TOUTES (la nouvelle n'existe pas encore)
    });

    // Purger le cache mémoire pour les anciennes sessions de cet utilisateur
    for (const [k, v] of sessionCache.entries()) {
      if (v.data?.userId === userId) sessionCache.delete(k);
    }

    if (invErr) console.warn('[Session] invalidate_user_sessions error:', invErr.message);
    const invalidatedCount = invalidated || 0;

    // 4) Créer la nouvelle session
    const { error: insErr } = await supabase
      .from('active_sessions')
      .insert({
        user_id: userId,
        session_token: sessionToken,
        device_id: deviceId || null,
        ip_address: ip,
        user_agent: userAgent ? userAgent.slice(0, 500) : null,
      });

    if (insErr) {
      console.error('[Session] insert error:', insErr.message);
      return res.status(500).json({ ok: false, error: 'session_create_failed' });
    }

    // 5) Mettre en cache
    setCachedSession(sessionToken, { userId, isActive: true });

    console.log(`[Session] ✅ Nouvelle session pour ${who.user.email} | invalidated=${invalidatedCount} | device=${deviceId || 'none'}`);

    // 6) Notifier les sockets connectés de cet utilisateur qu'ils sont éjectés
    try {
      const io = req.app.locals.io;
      if (io) {
        io.emit('session:kicked', { userId, reason: 'new_login' });
      }
      // Invalider le cache Socket.IO middleware pour forcer rejet à la prochaine connexion
      const invalidateCache = req.app.locals.invalidateSocketSessionCache;
      if (invalidateCache) invalidateCache(userId);
    } catch {}

    return res.json({
      ok: true,
      sessionToken,
      invalidatedCount
    });

  } catch (error) {
    console.error('[Session] Error in /create:', error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * POST /api/session/validate
 * Vérifie si la session est toujours active.
 * Body: { sessionToken }
 * Returns: { ok, isActive }
 */
router.post('/validate', async (req, res) => {
  try {
    const { sessionToken } = req.body || {};
    if (!sessionToken) return res.status(400).json({ ok: false, error: 'missing_session_token' });

    // Check cache first
    const cached = getCachedSession(sessionToken);
    if (cached) {
      return res.json({ ok: true, isActive: cached.isActive });
    }

    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.status(503).json({ ok: false, error: 'service_unavailable' });

    const { data, error } = await supabase.rpc('check_session_active', { p_token: sessionToken });

    if (error) {
      console.warn('[Session] check_session_active error:', error.message);
      // En cas d'erreur Supabase, autoriser (fail-open) pour ne pas bloquer les joueurs
      return res.json({ ok: true, isActive: true, fallback: true });
    }

    const result = data && data.length > 0 ? data[0] : null;
    const isActive = result?.is_valid ?? false;

    // Cache result
    setCachedSession(sessionToken, { userId: result?.user_id, isActive });

    return res.json({ ok: true, isActive });

  } catch (error) {
    console.error('[Session] Error in /validate:', error);
    // Fail-open
    return res.json({ ok: true, isActive: true, fallback: true });
  }
});

/**
 * POST /api/session/heartbeat
 * Mise à jour last_seen pour maintenir la session active.
 * Body: { sessionToken }
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const { sessionToken } = req.body || {};
    if (!sessionToken) return res.status(400).json({ ok: false, error: 'missing_session_token' });

    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.json({ ok: true }); // fail-open

    const { error } = await supabase
      .from('active_sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('session_token', sessionToken)
      .eq('is_active', true);

    if (error) console.warn('[Session] heartbeat update error:', error.message);

    return res.json({ ok: true });

  } catch (error) {
    return res.json({ ok: true }); // fail-open
  }
});

/**
 * POST /api/session/logout
 * Invalide la session courante.
 * Body: { sessionToken }
 */
router.post('/logout', async (req, res) => {
  try {
    const { sessionToken } = req.body || {};
    if (!sessionToken) return res.json({ ok: true });

    invalidateCachedSession(sessionToken);

    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) return res.json({ ok: true });

    await supabase
      .from('active_sessions')
      .update({ is_active: false, invalidated_at: new Date().toISOString() })
      .eq('session_token', sessionToken);

    return res.json({ ok: true });

  } catch (error) {
    return res.json({ ok: true });
  }
});

// ==========================================
// PHASE 3 — DEVICE MANAGEMENT
// 1 licence = max 2 appareils
// ==========================================

// POST /api/session/device/register — Enregistrer un device au login
router.post('/device/register', async (req, res) => {
  try {
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    if (!supabaseAdmin) return res.json({ ok: true, status: 'ok', deviceCount: 0 }); // fail-open

    // Authentifier
    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabaseAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });

    const userId = who.user.id;
    const { fingerprint, name, browser, os } = req.body || {};

    if (!fingerprint) return res.status(400).json({ ok: false, error: 'missing_fingerprint' });

    // Limite de devices selon le rôle:
    // - student: max 2 (anti-partage de code entre copains)
    // - tous les autres: PAS DE LIMITE — la session unique (Phase 1) empêche l'usage simultané
    const { data: prof } = await supabaseAdmin.from('user_profiles').select('role').eq('id', userId).single();
    const role = prof?.role || 'parent';

    // Non-student: enregistrer le device pour info/monitoring, mais ne jamais bloquer
    if (role !== 'student') {
      // Enregistrer silencieusement pour le monitoring, sans limite
      await supabaseAdmin.rpc('register_device', {
        p_user_id: userId,
        p_fingerprint: fingerprint,
        p_device_name: name || null,
        p_browser: browser || null,
        p_os: os || null,
        p_max_devices: 9999,
      }).catch(() => {});
      console.log(`[Device] ✅ ${role} ${who.user.email} — device enregistré (pas de limite)`);
      return res.json({ ok: true, status: 'ok', deviceCount: 0 });
    }

    // Student: limite de 2 devices
    const maxDevices = 2;

    // Appeler la fonction SQL register_device
    const { data, error } = await supabaseAdmin.rpc('register_device', {
      p_user_id: userId,
      p_fingerprint: fingerprint,
      p_device_name: name || null,
      p_browser: browser || null,
      p_os: os || null,
      p_max_devices: maxDevices,
    });

    if (error) {
      console.error('[Device] register_device error:', error.message);
      return res.json({ ok: true, status: 'ok', deviceCount: 0 }); // fail-open
    }

    const result = data && data.length > 0 ? data[0] : { status: 'ok', device_count: 0 };
    const status = result.status || 'ok';
    const deviceCount = result.device_count || 0;

    if (status === 'limit_reached') {
      console.warn(`[Device] ⚠️ Limite atteinte pour ${who.user.email} (${deviceCount} devices, max=${maxDevices})`);
      return res.status(403).json({
        ok: false,
        error: 'device_limit_reached',
        deviceCount,
        maxDevices,
        message: `Limite de ${maxDevices} appareils atteinte. Révoque un appareil existant pour en ajouter un nouveau.`,
      });
    }

    if (status === 'revoked') {
      console.warn(`[Device] 🚫 Device révoqué pour ${who.user.email} (fp=${fingerprint.slice(0, 10)})`);
      return res.status(403).json({
        ok: false,
        error: 'device_revoked',
        message: 'Cet appareil a été révoqué. Contacte ton enseignant.',
      });
    }

    console.log(`[Device] ✅ Device enregistré pour ${who.user.email} (${deviceCount} devices, fp=${fingerprint.slice(0, 10)})`);
    return res.json({ ok: true, status: 'ok', deviceCount });

  } catch (error) {
    console.error('[Device] Error in /device/register:', error);
    return res.json({ ok: true, status: 'ok', deviceCount: 0 }); // fail-open
  }
});

// GET /api/session/device/list — Lister les devices d'un utilisateur
router.get('/device/list', async (req, res) => {
  try {
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    if (!supabaseAdmin) return res.json({ ok: true, devices: [] });

    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabaseAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });

    // Supporter la requête pour un autre utilisateur (enseignant → élève)
    const targetUserId = req.query.user_id || who.user.id;

    // Si c'est un autre utilisateur, vérifier que le demandeur est teacher/admin
    if (targetUserId !== who.user.id) {
      const { data: prof } = await supabaseAdmin.from('user_profiles').select('role').eq('id', who.user.id).single();
      if (!prof || !['admin', 'teacher', 'cpd', 'cpc', 'rectorat'].includes(prof.role)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
    }

    const { data, error } = await supabaseAdmin.rpc('list_user_devices', { p_user_id: targetUserId });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    return res.json({ ok: true, devices: data || [] });

  } catch (error) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// POST /api/session/device/revoke — Révoquer un device
router.post('/device/revoke', async (req, res) => {
  try {
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'service_unavailable' });

    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();
    const { data: who, error: whoErr } = await supabaseAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });

    const { deviceId } = req.body || {};
    if (!deviceId) return res.status(400).json({ ok: false, error: 'missing_device_id' });

    // Vérifier permission: soit c'est son propre device, soit teacher/admin
    const { data: device } = await supabaseAdmin.from('user_devices').select('user_id').eq('id', deviceId).single();
    if (!device) return res.status(404).json({ ok: false, error: 'device_not_found' });

    if (device.user_id !== who.user.id) {
      const { data: prof } = await supabaseAdmin.from('user_profiles').select('role').eq('id', who.user.id).single();
      if (!prof || !['admin', 'teacher', 'cpd', 'cpc', 'rectorat'].includes(prof.role)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
    }

    const { data: result, error } = await supabaseAdmin.rpc('revoke_device', {
      p_device_id: deviceId,
      p_revoked_by: who.user.email || 'user',
    });

    if (error) return res.status(500).json({ ok: false, error: error.message });

    console.log(`[Device] 🗑️ Device ${deviceId} révoqué par ${who.user.email}`);
    return res.json({ ok: true, revoked: result });

  } catch (error) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

module.exports = router;
