const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const { generateRoundZones } = require('./utils/serverZoneGenerator');
const logger = require('./logger'); // ✅ Winston logger professionnel

// Load env (safe)
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch {}
const app = express();

// ==========================================
// CORS CONFIGURATION (MUST BE FIRST)
// ==========================================
const corsOptions = {
  origin: [
    'https://app.crazy-chrono.com',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

logger.info('[Server] Starting Crazy Chrono backend...', { 
  nodeVersion: process.version, 
  env: process.env.NODE_ENV || 'development' 
});

// ==========================================
// PERFORMANCE MONITORING - Real-time event emitter
// Logs via Winston + emits to monitoring room
// ==========================================
function emitPerfEvent(type, data = {}) {
  const event = { type, ...data, ts: new Date().toISOString() };
  logger.info(`[Perf][${type}]`, event);
  try { io.to('monitoring').emit('monitoring:perf', event); } catch {}
}

// Initialiser Supabase Admin AVANT CrazyArenaManager
let supabaseAdmin = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const supaUrl = process.env.SUPABASE_URL;
  const supaSrv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaUrl && supaSrv) {
    supabaseAdmin = createClient(supaUrl, supaSrv, { auth: { persistSession: false } });
    console.log('[Server] Supabase Admin client initialized');
    
    // ✅ Initialiser Winston avec transport Supabase pour logs persistants
    logger.initSupabase(supabaseAdmin);
  }
} catch (e) {
  console.warn('[Server] Supabase admin not configured:', e.message);
}

// Crazy Arena Manager pour tournois (groupes de 4) - AVEC Supabase
const CrazyArenaManager = require('./crazyArenaManager');
const crazyArena = new CrazyArenaManager(io, supabaseAdmin);

// Exposer crazyArena pour les routes (tournament.js)
global.crazyArena = crazyArena;

// ✅ Monter les routes admin logs (Winston) - APRÈS CORS
const adminLogsRouter = require('./routes/adminLogs');
app.use('/api/admin/logs', adminLogsRouter);
logger.info('[Server] Admin logs API mounted at /api/admin/logs');

// Admin-only: change a user's role by email
// POST /admin/users/role { target_email, role }
app.post('/admin/users/role', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ ok: false, error: 'supabase_not_configured' });
    const authz = String(req.headers['authorization'] || '').trim();
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_token' });
    const token = authz.slice(7).trim();

    // Authenticate caller
    const { data: who, error: whoErr } = await supabaseAdmin.auth.getUser(token);
    if (whoErr || !who?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
    const caller = { id: who.user.id, email: who.user.email };

    // Check caller is admin
    const { data: cProf, error: cErr } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .limit(1);
    const callerRole = (!cErr && Array.isArray(cProf) && cProf[0]?.role) ? cProf[0].role : 'user';
    if (callerRole !== 'admin') return res.status(403).json({ ok: false, error: 'forbidden' });

    // Validate payload
    const targetEmail = String(req.body?.target_email || '').trim().toLowerCase();
    const newRole = String(req.body?.role || '').trim().toLowerCase();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(400).json({ ok: false, error: 'invalid_target_email' });
    }
    if (!['admin','editor','user'].includes(newRole)) {
      return res.status(400).json({ ok: false, error: 'invalid_role' });
    }

    // Find target user id in auth.users
    const { data: tgt, error: tErr } = await supabaseAdmin
      .from('auth.users')
      .select('id,email')
      .eq('email', targetEmail)
      .limit(1);
    if (tErr || !Array.isArray(tgt) || !tgt[0]) return res.status(404).json({ ok: false, error: 'user_not_found' });
    const target = { id: tgt[0].id, email: tgt[0].email };

    // Upsert role in user_profiles
    const { error: upErr } = await supabaseAdmin
      .from('user_profiles')
      .upsert({ id: target.id, email: target.email, role: newRole }, { onConflict: 'id' });
    if (upErr) return res.status(500).json({ ok: false, error: 'update_failed' });

    return res.json({ ok: true, target: { id: target.id, email: target.email }, role: newRole });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// CORS déjà configuré au début du fichier (ligne 16)

// ===== Image Monitoring System =====
const monitoringRoutes = require('./routes/monitoring');
const { startWeeklyMonitoring, startDailyMonitoring } = require('./cronJobs');
app.use('/api/monitoring', monitoringRoutes);

// ===== Tournament / Battle Royale Routes =====
const tournamentRoutes = require('./routes/tournament');
app.use('/api/tournament', tournamentRoutes);

// ===== Training Routes (Mode Entraînement) =====
const trainingRoutes = require('./routes/training');
app.use('/api/training', trainingRoutes);

// ===== Notifications Routes =====
const notificationsRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationsRoutes);

// ===== Auth Routes (Licences professionnelles) =====
const authRoutes = require('./routes/auth');

// Exposer supabaseAdmin pour les routes
app.locals.supabaseAdmin = supabaseAdmin;

// Monter les routes auth (après création de supabaseAdmin)
app.use('/api/auth', authRoutes);

// ===== Progress Routes (sessions + attempts pour Maîtrise) =====
const progressRoutes = require('./routes/progress');
app.use('/api/progress', progressRoutes);

// POST /usage/can-start { user_id }
// Returns { ok:true, allow:boolean, limit:number, sessionsToday:number, reason?:string }
app.post('/usage/can-start', async (req, res) => {
  try {
    const userId = String(req.body?.user_id || '').trim();
    const FREE_LIMIT = Number(process.env.FREE_SESSIONS_PER_DAY || 3);
    if (!userId) return res.status(400).json({ ok: false, error: 'missing_user_id' });

    // If Supabase admin is not set, allow to avoid blocking; frontend still enforces local limit
    if (!supabaseAdmin) {
      return res.json({ ok: true, allow: true, limit: FREE_LIMIT, sessionsToday: 0, reason: 'no_admin_config' });
    }

    // If user has active subscription, allow
    try {
      const { data: subs, error: subErr } = await supabaseAdmin
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!subErr && Array.isArray(subs) && subs[0] && ['active', 'trialing'].includes(String(subs[0].status))) {
        return res.json({ ok: true, allow: true, limit: null, sessionsToday: 0, reason: 'pro_active' });
      }
    } catch {}

    // Count sessions today for this user
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const startIso = start.toISOString();
    let sessionsToday = 0;
    try {
      const { count, error: cntErr } = await supabaseAdmin
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startIso);
      if (!cntErr && typeof count === 'number') sessionsToday = count;
    } catch {}

    const allow = sessionsToday < FREE_LIMIT;
    return res.json({ ok: true, allow, limit: FREE_LIMIT, sessionsToday, reason: allow ? 'under_limit' : 'limit_reached' });
  } catch (e) {
    console.error('[Usage] can-start error', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});
// GET /me  -> { ok:true, user:{id,email}, role, subscription }
app.get('/me', async (req, res) => {
  try {
    // 1) Try to authenticate via Supabase JWT if provided
    const authz = String(req.headers['authorization'] || '').trim();
    let user = null;
    if (supabaseAdmin && authz && authz.startsWith('Bearer ')) {
      const token = authz.slice(7).trim();
      try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && data && data.user) {
          user = { id: data.user.id, email: data.user.email };
        }
      } catch {}
    }
    // 2) Bootstrap fallback: lookup by email using Supabase Admin API
    //    Note: querying auth.users via PostgREST is not supported; use auth.admin.listUsers
    if (!user) {
      const qEmail = String(req.query.email || '').trim().toLowerCase();
      if (supabaseAdmin && qEmail) {
        try {
          const { data: usersPage, error: lErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          if (!lErr && usersPage && Array.isArray(usersPage.users)) {
            const found = usersPage.users.find(u => String(u.email || '').toLowerCase() === qEmail);
            if (found) user = { id: found.id, email: found.email };
          }
        } catch {}
      }
    }
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

    // 3) Role from user_profiles (default: 'user')
    let role = 'user';
    try {
      if (supabaseAdmin) {
        const { data: prof, error: perr } = await supabaseAdmin
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .limit(1);
        if (!perr && Array.isArray(prof) && prof[0] && prof[0].role) role = prof[0].role;
      }
    } catch {}

    // 4) Subscription status from subscriptions table
    let subscription = null;
    try {
      if (supabaseAdmin) {
        const { data: rows, error: sErr } = await supabaseAdmin
          .from('subscriptions')
          .select('status,updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (!sErr && Array.isArray(rows) && rows[0]) subscription = rows[0].status || null;
      }
    } catch {}

    // 5) Business rule: Admins are PRO by default
    try {
      if (role === 'admin' && !['active','trialing'].includes(String(subscription || '').toLowerCase())) {
        subscription = 'active';
      }
    } catch {}

    return res.json({ ok: true, user, role, subscription });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Debug endpoint to verify path is correct (GET should return 200; real webhook uses POST)
app.get('/webhooks/revenuecat', (req, res) => {
  return res.status(200).json({ ok: true, path: '/webhooks/revenuecat', method: 'GET', note: 'Use POST for RevenueCat webhooks' });
});

// Webhook RevenueCat: valide le bearer secret et synchronise public.subscriptions
// Env: REVENUECAT_WEBHOOK_SECRET (Authorization: Bearer <secret>)
app.post('/webhooks/revenuecat', async (req, res) => {
  try {
    // 1) Auth normalisée (accepte "Bearer SECRET" et "SECRET")
    const shared = process.env.REVENUECAT_WEBHOOK_SECRET || '';
    const rawAuth = String(req.headers['authorization'] || '').trim();
    const provided = rawAuth.startsWith('Bearer ')
      ? rawAuth.slice(7).trim()
      : rawAuth;
    if (shared && (!provided || provided !== shared)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    // 2) Prépare le payload
    const payload = req.body && req.body.event ? req.body.event : (req.body || {});
    const type = String(payload.type || '').toLowerCase();
    const env = payload.environment || null;
    const eventId = String(payload.id || req.body?.id || '').trim();
    const userId = payload.app_user_id || req.body?.app_user_id || req.body?.subscriber?.app_user_id;
    if (!userId) return res.status(400).json({ ok: false, error: 'missing_app_user_id' });

    // 3) Idempotence optionnelle (si table webhook_events existe)
    if (supabaseAdmin && eventId) {
      try {
        await supabaseAdmin.from('webhook_events').insert({ event_id: eventId });
      } catch (e) {
        // Si contrainte unique violée => déjà traité
        if (String(e?.message || '').toLowerCase().includes('duplicate')) {
          return res.json({ ok: true, duplicate: true });
        }
        // Sinon, continuer (table peut ne pas exister en dev)
      }
    }

    // 4) Champs utiles pour subscriptions
    const entitlement = payload.entitlement_id || (Array.isArray(payload.entitlement_ids) ? payload.entitlement_ids[0] : null) || 'pro';
    const productId = payload.product_id || payload.product_identifier || null;
    const expMs = payload.expiration_at_ms || payload.expires_at_ms || null;
    const current_period_end = expMs ? new Date(Number(expMs)).toISOString() : null;

    // Map type -> status
    let status = null;
    if (['initial_purchase', 'renewal', 'product_change', 'non_renewing_purchase', 'uncancellation', 'subscription_resumed'].includes(type)) status = 'active';
    else if (['cancellation', 'subscriber_alias', 'billing_issue', 'subscription_paused'].includes(type)) status = 'past_due';
    else if (['expiration'].includes(type)) status = 'expired';

    // Fallback: si on a une échéance future, considère active
    if (!status) {
      if (current_period_end && Date.parse(current_period_end) > Date.now()) status = 'active';
      else status = 'expired';
    }

    // 5) Si pas de Supabase admin, on s'arrête ici en OK (pour ne pas bloquer)
    if (!supabaseAdmin) {
      console.log('[RevenueCat] no_admin_config - received:', { type, env, userId, entitlement, productId });
      return res.json({ ok: true, skipped: 'no_admin_config' });
    }

    // 6) Upsert subscriptions par user_id (requiert un index unique sur user_id)
    const row = {
      user_id: userId,
      price_id: productId || entitlement,
      entitlement,
      status,
      current_period_end,
      updated_at: new Date().toISOString(),
    };
    try {
      await supabaseAdmin
        .from('subscriptions')
        .upsert(row, { onConflict: 'user_id' });
    } catch (e) {
      console.error('[RevenueCat] upsert error', e);
    }

    console.log('[RevenueCat] webhook synced:', { type, env, userId, status, entitlement, productId });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[RevenueCat] webhook error', e);
    return res.status(500).json({ ok: false });
  }
});

// GET /me/subscription?user_id=...  -> { ok:true, status, current_period_end }
app.get('/me/subscription', async (req, res) => {
  try {
    const userId = String(req.query.user_id || req.headers['x-user-id'] || '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'missing_user_id' });
    if (!supabaseAdmin) return res.json({ ok: true, status: null, current_period_end: null });
    const { data: rows, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status,current_period_end,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) return res.status(500).json({ ok: false, error: 'db_error' });
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    return res.json({ ok: true, status: row?.status || null, current_period_end: row?.current_period_end || null });
  } catch (e) {
    console.error('/me/subscription error', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) || 4000 : 4000;
// Fenêtre d'égalité (ms): si plusieurs clics pour la même paire arrivent dans cet intervalle,
// tous les joueurs concernés reçoivent 1 point et l'événement est marqué tie=true
const TIE_WINDOW_MS = 200;

// CORS déjà configuré plus haut (ligne 118)
app.use(bodyParser.json({ limit: '10mb' }));
// Stripe webhooks require raw body; mount a dedicated raw parser on that route below

// Ajout du support upload images
const uploadRouter = require('./upload');
app.use(uploadRouter);

// Ajout du support listage images
const listImagesRouter = require('./listImages');
app.use(listImagesRouter);

// Endpoint pour sauvegarder le JSON associations
app.post('/save-associations', (req, res) => {
  const data = req.body;
  const filePath = path.join(__dirname, '../public/data/associations.json');
  fs.writeFile(filePath, JSON.stringify(data, null, 2), err => {
    if (err) {
      console.error('Erreur lors de la sauvegarde:', err);
      return res.status(500).json({ success: false, message: 'Erreur lors de la sauvegarde.' });
    }
    res.json({ success: true });
  });
});

// Récupérer les positions/angles des éléments math enregistrés
app.get('/math-positions', async (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/data/math_positions.json');
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const json = JSON.parse(raw);
    return res.json({ success: true, data: json });
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      // Fichier absent: retourner objet vide
      return res.json({ success: true, data: {} });
    }
    console.error('Erreur lecture math_positions.json:', e);
    return res.status(500).json({ success: false, message: 'Erreur lors de la lecture des positions.' });
  }
});

// Sauvegarder les positions/angles des éléments math dans public/data/math_positions.json
app.post('/save-math-positions', async (req, res) => {
  try {
    // Autoriser soit {data: {...}}, soit {...} directement
    const payload = (req.body && req.body.data != null) ? req.body.data : req.body;
    const publicBase = path.resolve(__dirname, '..', 'public');
    const dataDir = path.join(publicBase, 'data');
    const filePath = path.join(dataDir, 'math_positions.json');
    await fs.promises.mkdir(dataDir, { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(payload || {}, null, 2), 'utf8');
    return res.json({ success: true });
  } catch (err) {
    console.error('Erreur lors de la sauvegarde des positions:', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la sauvegarde des positions.' });
  }
});

// Endpoint pour renommer une image
app.post('/rename-image', (req, res) => {
  const { oldPath, newPath } = req.body;
  const baseDir = path.join(__dirname, '../public/');
  const absOld = path.join(baseDir, oldPath);
  const absNew = path.join(baseDir, newPath);

  // Sécurité : on vérifie que les chemins restent dans le dossier public
  if (!absOld.startsWith(baseDir) || !absNew.startsWith(baseDir)) {
    return res.status(400).json({ success: false, message: 'Chemin non autorisé.' });
  }

  fs.rename(absOld, absNew, (err) => {
    if (err) {
      console.error('Erreur renommage image:', err);
      return res.status(500).json({ success: false, message: 'Erreur lors du renommage.' });
    }
    res.json({ success: true });
  });
});

// Route racine pour vérification rapide
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'crazy-chrono-backend' });
});

// Endpoint de santé pour éviter les 502 à froid et diagnostiquer
app.get('/healthz', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), uptime: process.uptime() });
});

// Debug: expose whether Supabase admin is configured (no secrets leaked)
app.get('/debug/supabase', (req, res) => {
  try {
    const hasUrl = !!process.env.SUPABASE_URL;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminConfigured = !!supabaseAdmin;
    return res.json({ ok: true, hasUrl, hasServiceKey, adminConfigured });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'debug_error' });
  }
});

// ===== Stripe billing: Sprint 1 skeleton =====
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET, STRIPE_CUSTOMER_PORTAL_RETURN_URL
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch (e) { console.warn('[Stripe] SDK not available:', e.message); }

// Create Checkout Session (enhanced)
app.post('/stripe/create-checkout-session', async (req, res) => {
  try {
    const priceId = req.body?.price_id || process.env.STRIPE_PRICE_ID;
    const userId = req.body?.user_id ? String(req.body.user_id) : null;
    const success_url = req.body?.success_url || (process.env.FRONTEND_URL || 'http://localhost:3000') + '/account?checkout=success';
    const cancel_url = req.body?.cancel_url || (process.env.FRONTEND_URL || 'http://localhost:3000') + '/pricing?checkout=cancel';
    if (!stripe || !priceId) {
      // Sprint 1: ne bloque pas – renvoie une URL factice pour tester le flux
      const mock = success_url + '&mock=1';
      return res.json({ ok: true, url: mock, mocked: true });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      allow_promotion_codes: true,
      metadata: userId ? { user_id: userId } : undefined
    });
    return res.json({ ok: true, url: session.url });
  } catch (e) {
    console.error('[Stripe] create-checkout-session error', e);
    return res.status(500).json({ ok: false, error: 'checkout_error' });
  }
});

// Create Customer Portal Session (skeleton)
app.post('/stripe/create-portal-session', async (req, res) => {
  try {
    if (!stripe) {
      // Fallback de démo: renvoie pricing page
      const url = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/pricing?portal=mock';
      return res.json({ ok: true, url, mocked: true });
    }
    const { customer_id } = req.body || {};
    if (!customer_id) return res.status(400).json({ ok: false, error: 'missing_customer_id' });
    const return_url = process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL || (process.env.FRONTEND_URL || 'http://localhost:3000') + '/account';
    const session = await stripe.billingPortal.sessions.create({ customer: customer_id, return_url });
    return res.json({ ok: true, url: session.url });
  } catch (e) {
    console.error('[Stripe] create-portal-session error', e);
    return res.status(500).json({ ok: false, error: 'portal_error' });
  }
});

// Webhook Stripe (sprint 1: stub + signature check si dispo)
const rawParser = bodyParser.raw({ type: 'application/json' });
app.post('/webhooks/stripe', rawParser, async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event = null;
    if (stripe && whSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, whSecret);
      } catch (err) {
        console.error('[Stripe] webhook signature verification failed', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    } else {
      // Pas de vérification en Sprint 1
      event = { id: 'evt_mock', type: 'mock.event', data: { object: {} } };
    }
    console.log('[Stripe] webhook received:', event.type);
    // Sprint 2 minimal: upsert subscriptions on key events if supabaseAdmin available
    try {
      if (supabaseAdmin && event && event.type) {
        if (event.type === 'checkout.session.completed') {
          const s = event.data.object;
          const userId = s?.metadata?.user_id || null;
          const subscriptionId = s?.subscription || null;
          if (userId && subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const payload = {
              user_id: userId,
              stripe_subscription_id: sub.id,
              price_id: sub.items?.data?.[0]?.price?.id || null,
              status: sub.status,
              current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            };
            await supabaseAdmin.from('subscriptions').upsert(payload, { onConflict: 'stripe_subscription_id' });
          }
        }
        if (event.type.startsWith('customer.subscription.')) {
          const sub = event.data.object;
          // We need user_id: fetch latest checkout session metadata if possible is complex; if we already have row, update by stripe_subscription_id
          if (sub?.id) {
            const payload = {
              stripe_subscription_id: sub.id,
              price_id: sub.items?.data?.[0]?.price?.id || null,
              status: sub.status,
              current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
              updated_at: new Date().toISOString(),
            };
            await supabaseAdmin.from('subscriptions').update(payload).eq('stripe_subscription_id', sub.id);
          }
        }
      }
    } catch (e) { console.error('[Stripe] webhook handling error', e); }
    return res.json({ received: true });
  } catch (e) {
    console.error('[Stripe] webhook error', e);
    return res.status(500).end();
  }
});

// Endpoint: liste d'élèves (avec option de filtrage licensed=true)
app.get('/students', async (req, res) => {
  try {
    const publicBase = path.resolve(__dirname, '..', 'public');
    const filePath = path.join(publicBase, 'data', 'students.json');
    let list = [];
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const json = JSON.parse(raw);
      if (Array.isArray(json)) list = json;
    } catch (e) {
      // Fallback de démonstration si fichier absent
      if (e && e.code !== 'ENOENT') console.warn('students.json read error:', e.message);
      list = [
        { id: 's1', name: 'Alice B.', licensed: true },
        { id: 's2', name: 'Boris C.', licensed: true },
        { id: 's3', name: 'Chloé D.', licensed: false },
        { id: 's4', name: 'David E.', licensed: true },
      ];
    }
    const onlyLicensed = String(req.query.licensed || '').toLowerCase() === 'true';
    if (onlyLicensed) list = list.filter(s => !!s.licensed);
    return res.json(list);
  } catch (err) {
    console.error('GET /students failed:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Supprimer une image physiquement du dossier public
// Body attendu: { path: 'images/nom-fichier.png' } (chemin relatif depuis public)
app.delete('/delete-image', async (req, res) => {
  try {
    const relPath = (req.body && req.body.path) ? String(req.body.path) : '';
    if (!relPath) {
      return res.status(400).json({ success: false, message: 'Chemin d\'image manquant.' });
    }
    // Empêche les traversals et résout vers le dossier public
    const publicBase = path.resolve(__dirname, '..', 'public');
    const absTarget = path.resolve(publicBase, relPath);
    if (!absTarget.startsWith(publicBase)) {
      return res.status(400).json({ success: false, message: 'Chemin invalide.' });
    }
    // Supprime si existe
    await fs.promises.unlink(absTarget).catch(err => {
      if (err.code === 'ENOENT') return; // Fichier déjà absent
      throw err;
    });
    // Nettoyage en cascade dans data/elements.json
    const elementsPath = path.join(publicBase, 'data', 'elements.json');
    let removedCount = 0;
    try {
      const raw = await fs.promises.readFile(elementsPath, 'utf8');
      const json = JSON.parse(raw);
      if (Array.isArray(json)) {
        const norm = (p) => {
          if (!p) return '';
          try { p = decodeURIComponent(p); } catch {}
          p = String(p).toLowerCase().replace(/\\\\/g, '/');
          if (p.startsWith('/')) p = p.slice(1);
          return p;
        };
        const target = norm(relPath);
        const filtered = json.filter(e => norm(e?.content) !== target);
        removedCount = json.length - filtered.length;
        if (removedCount > 0) {
          await fs.promises.writeFile(elementsPath, JSON.stringify(filtered, null, 2), 'utf8');
        }
      }
    } catch (e) {
      console.warn('Nettoyage elements.json ignoré:', e.message);
    }
    return res.json({ success: true, removedFromElements: removedCount });
  } catch (err) {
    console.error('Erreur suppression image:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors de la suppression de l\'image.' });
  }
});

// Endpoint pour recevoir les logs depuis le frontend
app.post('/api/logs', async (req, res) => {
  try {
    const { logs, timestamp, source, matchId, userAgent } = req.body;
    
    if (!logs || typeof logs !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing logs' });
    }
    
    // Créer dossier logs/ s'il n'existe pas
    const logsDir = path.join(__dirname, 'logs');
    try {
      await fs.promises.mkdir(logsDir, { recursive: true });
    } catch {}
    
    // Nom fichier avec timestamp
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `logs-${ts}-${source || 'unknown'}.txt`;
    const filepath = path.join(logsDir, filename);
    
    // Contenu enrichi
    const header = `=== CRAZY CHRONO LOGS ===
Source: ${source || 'unknown'}
Match ID: ${matchId || 'N/A'}
Timestamp: ${timestamp || new Date().toISOString()}
User Agent: ${userAgent || 'N/A'}
Log Lines: ${logs.split('\n').length}
==============================

`;
    
    const fullContent = header + logs;
    
    // Écrire dans fichier
    await fs.promises.writeFile(filepath, fullContent, 'utf8');
    
    // Afficher dans console serveur (premières lignes)
    console.log('\n[LOGS REÇUS] ==================');
    console.log(`Source: ${source}, Match: ${matchId}`);
    console.log(`Fichier: ${filename}`);
    console.log('Aperçu (50 premières lignes):');
    console.log(logs.split('\n').slice(0, 50).join('\n'));
    console.log('==============================\n');
    
    res.json({ 
      ok: true, 
      message: 'Logs reçus et enregistrés',
      filename,
      lines: logs.split('\n').length
    });
  } catch (err) {
    console.error('[LOGS] Erreur réception:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Purge globale: enlève de elements.json toutes les images non listées dans associations.json
app.post('/purge-elements', async (req, res) => {
  try {
    const publicBase = path.resolve(__dirname, '..', 'public');
    const assocPath = path.join(publicBase, 'data', 'associations.json');
    const elementsPath = path.join(publicBase, 'data', 'elements.json');
    const norm = (p) => {
      if (!p) return '';
      try { p = decodeURIComponent(p); } catch {}
      p = String(p).toLowerCase().replace(/\\/g, '/');
      if (p.startsWith('/')) p = p.slice(1);
      return p;
    };
    const assoc = JSON.parse(await fs.promises.readFile(assocPath, 'utf8'));
    const known = new Set((assoc?.images || []).map(i => norm(i.url)));
    const raw = await fs.promises.readFile(elementsPath, 'utf8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return res.json({ success: true, removed: 0 });
    const filtered = list.filter(e => known.has(norm(e?.content)));
    const removed = list.length - filtered.length;
    if (removed > 0) {
      await fs.promises.writeFile(elementsPath, JSON.stringify(filtered, null, 2), 'utf8');
    }
    res.json({ success: true, removed });
  } catch (e) {
    console.error('Erreur purge-elements:', e);
    res.status(500).json({ success: false, message: 'Erreur lors de la purge des éléments.' });
  }
});

// --- Socket.IO: arbitrage simple multi-joueur + lobby/ready ---
// rooms: Map<roomCode, { players: Map<socketId,{name,score,ready}>, resolved:boolean, status:'lobby'|'countdown'|'playing', hostId:string|null, duration:number, sessionActive:boolean, sessions:Array, roundsPerSession:number, roundsPlayed:number, roundTimer:any, pendingClaims:Map<string,{claimants:Set<string>, timer:any}> }>
const rooms = new Map();

function getRoom(roomCode) {
  if (!rooms.has(roomCode)) rooms.set(roomCode, { players: new Map(), resolved: false, status: 'lobby', hostId: null, duration: 60, sessionActive: false, sessions: [], roundsPerSession: 3, roundsPlayed: 0, roundTimer: null, pendingClaims: new Map(), validatedPairIds: new Set(), selectedThemes: [], selectedClasses: [] });
  const r = rooms.get(roomCode);
  if (!r.pendingClaims) r.pendingClaims = new Map();
  if (!r.validatedPairIds) r.validatedPairIds = new Set();
  if (!r.selectedThemes) r.selectedThemes = [];
  if (!r.selectedClasses) r.selectedClasses = [];
  return r;
}

// Helper: Émettre un log serveur aux clients d'une room (pour l'enregistrement global)
function emitServerLog(roomCode, level, message, data = {}) {
  try {
    const timestamp = new Date().toISOString();
    io.to(roomCode).emit('server:log', {
      timestamp,
      level, // 'info', 'warn', 'error', 'debug'
      message,
      data
    });
  } catch (err) {
    console.error('[ServerLog] Failed to emit log:', err);
  }
}

function genRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function emitRoomState(roomCode) {
  const room = getRoom(roomCode);
  const payload = {
    roomCode,
    status: room.status,
    duration: room.duration || 60,
    players: Array.from(room.players.entries()).map(([id, p]) => ({ id, nickname: p.name, score: p.score || 0, ready: !!p.ready, isHost: id === room.hostId })),
    roundsPerSession: room.roundsPerSession,
    roundsPlayed: room.roundsPlayed
  };
  console.log(`[MP] emitRoomState room=${roomCode} status=${payload.status} duration=${payload.duration} rps=${isFinite(payload.roundsPerSession)?payload.roundsPerSession:'∞'} rp=${payload.roundsPlayed}`);
  io.to(roomCode).emit('room:state', payload);
  // compat: ancien event
  io.to(roomCode).emit('roomState', { players: Array.from(room.players.entries()).map(([id, p]) => ({ id, name: p.name, score: p.score || 0 })) });
}

// Démarre une nouvelle manche et pose un timer d'expiration
function startRound(roomCode) {
  const room = getRoom(roomCode);
  if (!room.sessionActive) return;
  // Garde-fou: ne pas démarrer au-delà de la limite configurée
  if (Number.isFinite(room.roundsPerSession) && (room.roundsPlayed || 0) >= room.roundsPerSession) {
    console.warn(`[MP] startRound prevented: limit reached rp=${room.roundsPlayed}/${room.roundsPerSession} room=${roomCode}`);
    endSession(roomCode);
    return;
  }
  // Incrémente le nombre de manches jouées et vérifie la limite
  room.roundsPlayed = (room.roundsPlayed || 0) + 1;
  console.log(`[MP] startRound room=${roomCode} idx=${room.roundsPlayed}/${isFinite(room.roundsPerSession)?room.roundsPerSession:'∞'} duration=${room.duration}`);
  emitRoomState(roomCode);
  room.status = 'playing';
  room.resolved = false;
  // Snapshot des scores au début de la manche pour déterminer le gagnant à l'expiration
  try {
    room.roundBaseScores = new Map(Array.from(room.players.entries()).map(([id, pl]) => [id, pl.score || 0]));
  } catch { room.roundBaseScores = new Map(); }
  // Réinitialiser l'ensemble des paires déjà trouvées pour cette manche
  room.foundPairs = new Set();
  // ✅ FIX ZONES VIDES: Réinitialiser validatedPairIds à chaque nouveau round
  // Sans ce reset, les paires validées précédemment sont exclues de la génération
  room.validatedPairIds = new Set();
  // Nettoyer toute fenêtre d'égalité précédente
  try {
    if (room.pendingClaims && room.pendingClaims.size) {
      for (const [, entry] of room.pendingClaims.entries()) {
        try { if (entry && entry.timer) clearTimeout(entry.timer); } catch {}
      }
      room.pendingClaims.clear();
    } else {
      room.pendingClaims = new Map();
    }
  } catch {}
  // Nettoyer un ancien timer au cas où
  if (room.roundTimer) { try { clearTimeout(room.roundTimer); } catch {} room.roundTimer = null; }
  const seed = Math.floor(Date.now() % 2147483647);
  room.roundSeed = seed;
  room.pairsValidated = 0;
  
  // Générer les zones côté serveur pour synchronisation multijoueur
  emitServerLog(roomCode, 'info', '[MP] Starting zone generation', {
    seed,
    themesCount: (room.selectedThemes || []).length,
    classesCount: (room.selectedClasses || []).length,
    excludedPairsCount: (room.validatedPairIds || new Set()).size
  });
  
  const zoneGenResult = generateRoundZones(seed, {
    themes: room.selectedThemes || [],
    classes: room.selectedClasses || [],
    excludedPairIds: room.validatedPairIds || new Set(),
    logFn: (level, message, data) => emitServerLog(roomCode, level, message, data)
  });
  
  // Extraire le tableau zones depuis l'objet retourné {zones, goodPairIds}
  const zones = Array.isArray(zoneGenResult) ? zoneGenResult : (zoneGenResult?.zones || []);
  
  // Stocker les zones dans la room pour validation ultérieure
  room.currentZones = zones;
  
  console.log(`[MP] Generated ${zones.length} zones for room=${roomCode}`);
  console.log(`[MP] Sample zone:`, zones[0] ? { id: zones[0].id, type: zones[0].type, hasContent: !!zones[0].content, pairId: zones[0].pairId } : 'NONE');
  
  emitServerLog(roomCode, 'info', '[MP] Zones generated', {
    zonesCount: zones.length,
    sampleZone: zones[0] ? { id: zones[0].id, type: zones[0].type, hasContent: !!zones[0].content, pairId: zones[0].pairId } : null
  });
  
  const payload = {
    seed,
    duration: room.duration || 60,
    roundIndex: room.roundsPlayed,
    roundsTotal: isFinite(room.roundsPerSession) ? room.roundsPerSession : null,
    hasZones: true,
    zones: zones // Envoyer les zones complètes
  };
  
  console.log(`[MP] Emitting round:new with payload:`, {
    seed: payload.seed,
    duration: payload.duration,
    roundIndex: payload.roundIndex,
    roundsTotal: payload.roundsTotal,
    hasZones: !!payload.zones,
    zonesCount: payload.zones?.length || 0,
    zonesIsArray: Array.isArray(payload.zones)
  });
  
  emitServerLog(roomCode, 'info', '[MP] Emitting round:new', {
    seed: payload.seed,
    duration: payload.duration,
    roundIndex: payload.roundIndex,
    roundsTotal: payload.roundsTotal,
    hasZones: !!payload.zones,
    zonesCount: payload.zones?.length || 0,
    zonesIsArray: Array.isArray(payload.zones),
    firstZoneId: payload.zones?.[0]?.id || null
  });
  
  io.to(roomCode).emit('round:new', payload);
  // Timer d'expiration pour annoncer le résultat si personne n'a gagné
  room.roundTimer = setTimeout(() => {
    // A l'expiration, invalider toute fenêtre d'égalité en cours
    try {
      if (room.pendingClaims && room.pendingClaims.size) {
        for (const [, entry] of room.pendingClaims.entries()) {
          try { if (entry && entry.timer) clearTimeout(entry.timer); } catch {}
        }
        room.pendingClaims.clear();
      }
    } catch {}
    const base = room.roundBaseScores instanceof Map ? room.roundBaseScores : new Map();
    const deltas = Array.from(room.players.entries()).map(([id, pl]) => {
      const start = base.has(id) ? base.get(id) : 0;
      const now = pl.score || 0;
      return { id, name: pl.name, delta: now - start, now };
    });
    // Trouver le gagnant de la manche: plus grand delta strictement positif; en cas d'égalité, pas de gagnant
    let best = -Infinity; let winners = [];
    for (const d of deltas) {
      if (d.delta > best) { best = d.delta; winners = [d]; }
      else if (d.delta === best) { winners.push(d); }
    }
    let winnerId = null, winnerName = null;
    if (best > 0 && winners.length === 1) { winnerId = winners[0].id; winnerName = winners[0].name; }
    console.log(`[MP] round timeout room=${roomCode} idx=${room.roundsPlayed} winner=${winnerName||'none'} delta=${best}`);
    io.to(roomCode).emit('round:result', { winnerId, winnerName, roundIndex: room.roundsPlayed, roundsTotal: isFinite(room.roundsPerSession) ? room.roundsPerSession : null });
    // Enchaîner uniquement si la session est active et si on n'a pas atteint la limite
    const more = !isFinite(room.roundsPerSession) || (room.roundsPlayed < room.roundsPerSession);
    if (more && room.sessionActive) {
      console.log(`[MP] scheduling next round after timeout (idx=${room.roundsPlayed+1})`);
      // petite pause avant la prochaine manche
      try { if (room.roundTimer) { clearTimeout(room.roundTimer); } } catch {}
      room.roundTimer = setTimeout(() => {
        const r = getRoom(roomCode);
        if (!r || !r.sessionActive) return;
        startRound(roomCode);
      }, 400);
    } else {
      // fin de session automatique
      console.log('[MP] ending session after timeout');
      endSession(roomCode);
    }
  }, (room.duration || 60) * 1000);
}

function endSession(roomCode) {
  const room = getRoom(roomCode);
  // calcul du gagnant global
  const entries = Array.from(room.players.entries());
  let winner = null;
  let best = -Infinity;
  for (const [id, pl] of entries) {
    const sc = pl.score || 0;
    if (sc > best) { best = sc; winner = { id, name: pl.name, score: sc }; }
  }
  const sessionDurationSec = room.sessionStartedAt ? Math.round((Date.now() - room.sessionStartedAt) / 1000) : (room.duration || 60);
  const summary = {
    endedAt: Date.now(),
    roomCode,
    winner: winner || null,
    winnerTitle: winner ? 'Crazy Winner' : null,
    scores: entries.map(([id, pl]) => ({ id, name: pl.name, score: pl.score || 0, errors: pl.errors || 0 })),
    duration: sessionDurationSec
  };
  try { room.sessions.push(summary); } catch {}
  room.sessionActive = false;
  room.status = 'lobby';
  if (room.roundTimer) { try { clearTimeout(room.roundTimer); } catch {} room.roundTimer = null; }
  io.to(roomCode).emit('session:end', summary);
  emitRoomState(roomCode);
  
  // ✅ Sauvegarder résultats Multijoueur pour les joueurs identifiés (studentId)
  (async () => { try {
    const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const ranking = entries
      .map(([id, pl], idx) => ({ socketId: id, studentId: pl.studentId, name: pl.name, score: pl.score || 0, errors: pl.errors || 0 }))
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({ ...p, position: idx + 1 }));
    
    // Résoudre les studentIds non-UUID (ex: "s001") vers UUID auth via user_student_mapping
    if (supabaseAdmin) {
      for (const p of ranking) {
        if (p.studentId && !isUUID(p.studentId)) {
          try {
            const { data: mapping } = await supabaseAdmin
              .from('user_student_mapping')
              .select('user_id')
              .eq('student_id', p.studentId)
              .eq('active', true)
              .single();
            if (mapping?.user_id) {
              emitPerfEvent('endSession:resolve', { from: p.studentId, to: mapping.user_id });
              p.studentId = mapping.user_id;
            }
          } catch {}
        }
      }
    }

    emitPerfEvent('endSession', { room: roomCode, players: ranking.map(p => ({ name: p.name, studentId: p.studentId, score: p.score, errors: p.errors || 0 })) });
    const identifiedPlayers = ranking.filter(p => p.studentId);
    emitPerfEvent('endSession:identified', { room: roomCode, identified: identifiedPlayers.length, total: ranking.length });
    if (identifiedPlayers.length > 0) {
      const selfPort = process.env.PORT || 4000;
      const backendUrl = process.env.BACKEND_URL || `http://localhost:${selfPort}`;
      fetch(`${backendUrl}/api/training/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: `mp_${roomCode}_${Date.now()}`,
          classId: null,
          teacherId: null,
          sessionName: `Multijoueur - ${roomCode}`,
          config: { mode: 'multiplayer', duration: room.duration || 60, roomCode },
          completedAt: new Date().toISOString(),
          results: identifiedPlayers.map(p => ({
            studentId: p.studentId,
            position: p.position,
            score: p.score,
            timeMs: room.sessionStartedAt ? (Date.now() - room.sessionStartedAt) : ((room.duration || 60) * 1000),
            pairsValidated: p.score,
            errors: p.errors || 0
          }))
        })
      }).then(async r => {
        if (r.ok) {
          emitPerfEvent('save:success', { room: roomCode, players: identifiedPlayers.length, status: r.status });
        } else {
          const body = await r.text().catch(() => '');
          emitPerfEvent('save:error', { room: roomCode, status: r.status, body: body.slice(0, 300) });
        }
      }).catch(e => {
        emitPerfEvent('save:error', { room: roomCode, error: e.message });
      });
    } else {
      emitPerfEvent('save:skipped', { room: roomCode, reason: 'no identified players' });
    }
  } catch (e) {
    emitPerfEvent('save:exception', { room: roomCode, error: e.message });
  } })();
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerName = `Joueur-${socket.id.slice(0,4)}`;

  // Identifier le joueur (studentId) pour le tracking des stats
  let playerStudentId = null;
  // Monitoring: permettre au dashboard de rejoindre la room monitoring
  socket.on('monitoring:join', () => {
    socket.join('monitoring');
    socket.emit('monitoring:perf', { type: 'connected', ts: new Date().toISOString(), msg: 'Connecté au monitoring temps réel' });
  });
  // Monitoring: relayer les events client vers la room monitoring + logger dans Winston
  socket.on('monitoring:client-event', (data) => {
    try {
      const enriched = { ...data, source: 'client', ts: new Date().toISOString() };
      io.to('monitoring').emit('monitoring:perf', enriched);
      // Logger dans Winston pour visibilité dans Render logs
      const evType = data?.type || 'unknown';
      logger.info(`[Client] ${evType}`, enriched);
    } catch {}
  });

  socket.on('mp:identify', ({ studentId }) => {
    playerStudentId = studentId || null;
    emitPerfEvent('mp:identify', { socketId: socket.id, studentId: playerStudentId });
    // Mettre à jour le joueur dans la room si déjà rejoint
    if (currentRoom) {
      const room = getRoom(currentRoom);
      const p = room.players.get(socket.id);
      if (p) { p.studentId = playerStudentId; room.players.set(socket.id, p); }
      emitPerfEvent('mp:identify-updated', { socketId: socket.id, room: currentRoom, studentId: playerStudentId });
    }
  });

  // Créer une salle et renvoyer le code au client (ack)
  socket.on('room:create', (cb) => {
    const code = genRoomCode();
    getRoom(code); // initialise
    if (typeof cb === 'function') cb({ ok: true, roomCode: code });
  });

  // Rejoindre une salle existante (ou défaut)
  socket.on('joinRoom', ({ roomId, name, studentId: sid }) => {
    const newRoom = String(roomId || 'default');
    playerName = String(name || playerName);
    if (sid) playerStudentId = sid;
    emitPerfEvent('joinRoom', { socketId: socket.id, room: newRoom, studentId: playerStudentId, sidFromClient: sid || null });
    // si le joueur était déjà dans une autre salle, on le retire proprement
    if (currentRoom && currentRoom !== newRoom) {
      const old = getRoom(currentRoom);
      old.players.delete(socket.id);
      if (old.hostId === socket.id) {
        const first = old.players.keys().next();
        old.hostId = first.done ? null : first.value;
      }
      socket.leave(currentRoom);
      if (old.players.size === 0) {
        rooms.delete(currentRoom);
      } else {
        emitRoomState(currentRoom);
      }
    }
    currentRoom = newRoom;
    socket.join(currentRoom);
    const room = getRoom(currentRoom);
    const existing = room.players.get(socket.id) || {};
    room.players.set(socket.id, { name: playerName, score: existing.score || 0, errors: existing.errors || 0, ready: false, studentId: playerStudentId || existing.studentId || null });
    if (!room.hostId || !room.players.has(room.hostId)) {
      room.hostId = socket.id; // premier connecté devient hôte
    }
    // Ne réinitialiser le statut à 'lobby' que si aucune session n'est active
    if (!room.sessionActive) {
      room.status = 'lobby';
    }
    emitRoomState(currentRoom);
    
    // Si une manche est en cours, envoyer immédiatement les données au joueur qui rejoint
    if (room.sessionActive && room.status === 'playing' && room.roundSeed) {
      socket.emit('round:new', {
        seed: room.roundSeed,
        duration: room.duration || 60,
        roundIndex: room.roundsPlayed,
        roundsTotal: isFinite(room.roundsPerSession) ? room.roundsPerSession : null,
        zonesFile: 'zones2'
      });
      console.log(`[MP] Late joiner ${socket.id} synced to ongoing round ${room.roundsPlayed} in room ${currentRoom}`);
    }
  });

  // Hôte: définir la durée par manche (secondes)
  socket.on('room:duration:set', ({ duration }) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (socket.id !== room.hostId) return;
    const d = parseInt(duration, 10);
    if (!Number.isFinite(d) || d < 10 || d > 600) return;
    room.duration = d;
    emitRoomState(currentRoom);
  });

  // Hôte: définir le nombre de manches d'une session
  socket.on('room:setRounds', (rounds, cb) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (socket.id !== room.hostId) return;
    let n = parseInt(rounds, 10);
    if (!Number.isFinite(n)) n = 3;
    // borne serveur 1..20
    n = Math.min(20, Math.max(1, n));
    room.roundsPerSession = n;
    console.log(`[MP] setRounds room=${currentRoom} roundsPerSession=${room.roundsPerSession}`);
    emitRoomState(currentRoom);
    // Si une session est en cours et qu'on abaisse la limite sous le nombre déjà joué,
    // on termine immédiatement la session pour éviter des états 4/3, etc.
    if (room.sessionActive && Number.isFinite(room.roundsPerSession) && (room.roundsPlayed || 0) >= room.roundsPerSession) {
      console.warn(`[MP] ending session due to rounds limit decrease rp=${room.roundsPlayed}/${room.roundsPerSession} room=${currentRoom}`);
      endSession(currentRoom);
    }
    if (typeof cb === 'function') {
      try { cb({ ok: true, roundsPerSession: room.roundsPerSession }); } catch {}
    }
  });

  // Hôte: définir les thématiques et classes pour la génération de zones
  socket.on('room:setConfig', ({ themes, classes }) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (socket.id !== room.hostId) return;
    
    room.selectedThemes = Array.isArray(themes) ? themes : [];
    room.selectedClasses = Array.isArray(classes) ? classes : [];
    
    console.log(`[MP] setConfig room=${currentRoom} themes=${room.selectedThemes.length} classes=${room.selectedClasses.length}`);
    console.log(`[MP] Themes:`, room.selectedThemes);
    console.log(`[MP] Classes:`, room.selectedClasses);
  });

  // Toggle prêt/pas prêt
  socket.on('ready:toggle', ({ ready }) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    const p = room.players.get(socket.id);
    if (!p) return;
    p.ready = !!ready;
    room.players.set(socket.id, p);
    emitRoomState(currentRoom);
  });

  // Démarrage de la partie (hôte uniquement) si tous prêts et >=2 joueurs
  socket.on('room:start', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (socket.id !== room.hostId) return; // seul l'hôte démarre
    // Eviter de relancer une session si elle est déjà active
    if (room.sessionActive) {
      console.warn(`[MP] room:start ignored: session already active room=${currentRoom}`);
      return;
    }
    console.log(`[MP] room:start room=${currentRoom} roundsPerSession=${isFinite(room.roundsPerSession)?room.roundsPerSession:'∞'} duration=${room.duration}`);
    const playersArr = Array.from(room.players.values());
    const allReady = playersArr.length >= 2 && playersArr.every(p => p.ready);
    if (!allReady) return;
    // reset scores and errors for new session
    for (const [id, pl] of room.players.entries()) {
      pl.score = 0;
      pl.errors = 0;
      pl.ready = false;
      room.players.set(id, pl);
    }
    room.sessionActive = true;
    room.sessionStartedAt = Date.now();
    room.status = 'countdown';
    room.roundsPlayed = 0;
    emitRoomState(currentRoom);
    // Compte à rebours
    let t = 3;
    io.to(currentRoom).emit('room:countdown', { t });
    const intv = setInterval(() => {
      t -= 1;
      if (t > 0) {
        io.to(currentRoom).emit('room:countdown', { t });
      } else {
        clearInterval(intv);
        // reset resolved + ready flags pour tous
        room.resolved = false;
        for (const [id, pl] of room.players.entries()) {
          pl.ready = false;
          room.players.set(id, pl);
        }
        emitRoomState(currentRoom);
        startRound(currentRoom);
      }
    }, 1000);
  });

  // startGame (compat): démarre une session solo/simple en suivant le même pipeline que room:start
  socket.on('startGame', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    // Ne rien faire si une session est déjà en cours
    if (room.sessionActive) {
      console.warn(`[MP] startGame ignored: session already active room=${currentRoom}`);
      return;
    }
    // Initialiser une session même en solo afin que les timeouts et résultats enchaînent correctement
    room.sessionActive = true;
    room.sessionStartedAt = Date.now();
    room.status = 'playing';
    room.resolved = false;
    room.roundsPlayed = 0;
    // Réinitialiser les erreurs de chaque joueur pour cette nouvelle session
    for (const [id, pl] of room.players.entries()) {
      pl.score = 0;
      pl.errors = 0;
      room.players.set(id, pl);
    }
    emitRoomState(currentRoom);
    // Utiliser la même mécanique que room:start pour garantir roundIndex/roundsTotal et timers
    startRound(currentRoom);
  });

  // MVP+: tentative de paire pendant la manche avec gestion d'égalité (sans paire-cible unique)
  socket.on('attemptPair', ({ a, b }) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    // Ignorer si la manche n'est pas en cours de jeu
    if (room.status !== 'playing' || room.resolved) {
      console.log(`[MP] attemptPair ignored (status=${room.status}, resolved=${room.resolved}) room=${currentRoom}`);
      return;
    }
    // Anti double-clic: simple debounce par joueur (300ms)
    if (!room.attemptDebounce) room.attemptDebounce = new Map();
    const now = Date.now();
    const last = room.attemptDebounce.get(socket.id) || 0;
    if (now - last < 300) {
      console.log(`[MP] attemptPair ignored (debounce) room=${currentRoom} by=${socket.id}`);
      return;
    }
    room.attemptDebounce.set(socket.id, now);
    // Clé logique basée uniquement sur les IDs de zones (retour ancien comportement)
    const keyZones = [String(a), String(b)].sort().join('|');
    // Déjà résolue ?
    if (room.foundPairs && room.foundPairs.has(keyZones)) {
      console.log(`[MP] attemptPair ignored (already claimed) room=${currentRoom} key=${keyZones}`);
      return;
    }
    if (!room.pendingClaims) room.pendingClaims = new Map();
    if (!room.foundPairs) room.foundPairs = new Set();
    // Utiliser uniquement la clé zones pour la fenêtre d'égalité
    const claimKey = keyZones;
    // S'il y a déjà une réclamation en attente pour cette paire, on ajoute le joueur
    const pending = room.pendingClaims.get(claimKey);
    if (pending && pending.timer) {
      pending.claimants.add(socket.id);
      room.pendingClaims.set(claimKey, pending);
      return;
    }
    // Première réclamation: créer l'entrée et programmer la résolution
    const entry = { claimants: new Set([socket.id]), timer: null };
    entry.timer = setTimeout(() => {
      try {
        const pend = room.pendingClaims.get(claimKey);
        room.pendingClaims.delete(claimKey);
        // Marquer la paire comme prise pour bloquer les futurs clics
        room.foundPairs.add(claimKey);
        const claimants = Array.from(pend?.claimants || []);
        
        // Extraire le pairId des zones et l'ajouter au Set des paires validées
        try {
          if (room.currentZones && Array.isArray(room.currentZones)) {
            const zoneA = room.currentZones.find(z => String(z.id) === String(a));
            const zoneB = room.currentZones.find(z => String(z.id) === String(b));
            const pairIdA = zoneA?.pairId || '';
            const pairIdB = zoneB?.pairId || '';
            
            // Si les deux zones ont le même pairId non vide, l'ajouter au Set
            if (pairIdA && pairIdB && pairIdA === pairIdB) {
              if (!room.validatedPairIds) room.validatedPairIds = new Set();
              
              // FIFO Rotation: Garder seulement les 15 dernières paires validées
              const MAX_EXCLUDED_PAIRS = 15;
              if (room.validatedPairIds.size >= MAX_EXCLUDED_PAIRS) {
                // Convertir le Set en Array pour accéder au premier élément (le plus ancien)
                const pairIdsArray = Array.from(room.validatedPairIds);
                const oldestPairId = pairIdsArray[0];
                room.validatedPairIds.delete(oldestPairId);
                console.log(`[MP] FIFO: Removed oldest pairId: ${oldestPairId} (was at position 0/${pairIdsArray.length})`);
              }
              
              room.validatedPairIds.add(pairIdA);
              console.log(`[MP] Added validated pairId: ${pairIdA} (total: ${room.validatedPairIds.size}/${MAX_EXCLUDED_PAIRS})`);
            }
          }
        } catch (e) {
          console.error('[MP] Error extracting pairId:', e);
        }
        
        // Incrémenter le compteur de paires validées une seule fois
        room.pairsValidated = (room.pairsValidated || 0) + 1;
        // Attribuer +1 à tous les joueurs concernés
        for (const id of claimants) {
          const pl = room.players.get(id);
          if (pl) {
            pl.score = (pl.score || 0) + 1;
            room.players.set(id, pl);
          }
        }
        const scores = Array.from(room.players.entries()).map(([id, pl]) => ({ id, name: pl.name, score: pl.score || 0 }));
        io.to(currentRoom).emit('score:update', { scores });
        
        // Régénérer une nouvelle carte avec les paires validées exclues
        const newSeed = Math.floor(Date.now() % 2147483647);
        room.roundSeed = newSeed;
        
        logger.info('[Server][Multijoueur] Démarrage régénération carte', { 
          roomCode: currentRoom, 
          excludedPairs: 0,
          newSeed 
        });
        
        let newZones = [];
        try {
          const config = {
            themes: room.selectedThemes || [],
            classes: room.selectedClasses || [],
            excludedPairIds: new Set(),
            logFn: (level, message, data) => emitServerLog(currentRoom, level, message, data)
          };
          const regenResult = generateRoundZones(newSeed, config);
          newZones = Array.isArray(regenResult) ? regenResult : (regenResult?.zones || []);
          room.currentZones = newZones;
          
          logger.info('[Server][Multijoueur] Carte régénérée', { 
            roomCode: currentRoom, 
            zonesCount: newZones.length,
            excludedPairsCount: config.excludedPairIds.size,
            seed: newSeed
          });
        } catch (err) {
          logger.error('[Server][Multijoueur] Erreur régénération carte', { 
            roomCode: currentRoom, 
            error: err.message,
            stack: err.stack?.slice(0, 200)
          });
        }
        
        // Réinitialiser l'état pour permettre la validation de la nouvelle carte
        room.resolved = false;
        room.foundPairs.clear();
        
        // Envoyer la nouvelle carte à tous les joueurs
        console.log(`[MP] About to emit round:new after validation with ${newZones.length} zones`);
        emitServerLog(currentRoom, 'info', '[MP] Emitting round:new after validation', {
          zonesCount: newZones.length,
          seed: newSeed,
          roundIndex: room.roundsPlayed,
          firstZoneId: newZones[0]?.id || null,
          lastZoneId: newZones[newZones.length - 1]?.id || null
        });
        io.to(currentRoom).emit('round:new', {
          seed: newSeed,
          zones: newZones,
          hasZones: true,
          duration: room.duration || 60,
          roundIndex: room.roundsPlayed,
          roundsTotal: isFinite(room.roundsPerSession) ? room.roundsPerSession : null,
          zonesFile: 'zones2'
        });
        
        // Compat: 'by' = premier cliqueur; ajoute tie + winners si égalité
        const first = claimants[0] || socket.id;
        const isTie = claimants.length >= 2;
        io.to(currentRoom).emit('pair:valid', {
          by: first,
          a, b,
          ts: Date.now(),
          count: room.pairsValidated,
          tie: isTie,
          winners: claimants
        });
      } catch (e) {
        console.error('[MP] pending claim finalize error', e);
      }
    }, Math.max(50, TIE_WINDOW_MS));
    room.pendingClaims.set(claimKey, entry);
  });

  // Comptabiliser les erreurs (mauvaises associations) côté serveur
  socket.on('pair:error', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (room.status !== 'playing') return;
    const pl = room.players.get(socket.id);
    if (pl) {
      pl.errors = (pl.errors || 0) + 1;
      room.players.set(socket.id, pl);
      console.log(`[MP] pair:error room=${currentRoom} player=${socket.id} errors=${pl.errors}`);
    }
  });

  // Fin de session (hôte): annonce le gagnant et passe en lobby
  socket.on('session:end', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    endSession(currentRoom);
  });

  // Récupération historique des sessions (ack)
  socket.on('session:history:get', (cb) => {
    if (!currentRoom) { if (typeof cb === 'function') cb({ ok: true, sessions: [] }); return; }
    const room = getRoom(currentRoom);
    const list = Array.isArray(room.sessions) ? room.sessions : [];
    if (typeof cb === 'function') cb({ ok: true, sessions: list });
  });

  // (removed duplicate room:setRounds handler)

  // ===== TRAINING MODE EVENTS (Mode Entraînement) =====
  
  socket.on('training:create-match', ({ matchId, studentIds, config, classId, teacherId }) => {
    logger.info('[Server][Training] Création match', { matchId, studentCount: studentIds.length, classId, teacherId });
    
    crazyArena.createTrainingMatch(matchId, studentIds, config, classId, teacherId);
    
    // Confirmer la création
    socket.emit('training:match-started', { matchId });
    
    console.log(`[Server][Training] Match ${matchId} créé avec succès`);
  });

  socket.on('training:join', async ({ matchId, studentData }, cb) => {
    logger.info('[Server][Training] Joueur tente de rejoindre', { matchId, studentId: studentData.studentId, name: studentData.name, socketId: socket.id });
    const success = await crazyArena.joinTrainingMatch(socket, matchId, studentData);
    if (success) {
      logger.info('[Server][Training] Joueur rejoint avec succès', { matchId, studentId: studentData.studentId, socketId: socket.id });
    } else {
      logger.warn('[Server][Training] Échec join - match introuvable ou erreur', { matchId, studentId: studentData.studentId, socketId: socket.id });
    }
    if (typeof cb === 'function') {
      cb({ ok: success, matchInfo: { sessionName: 'Training' } });
    }
  });

  socket.on('training:ready', ({ matchId, studentId }) => {
    logger.info('[Server][Training] Joueur marque prêt', { matchId, studentId, socketId: socket.id });
    crazyArena.trainingPlayerReady(socket, matchId, studentId);
  });

  socket.on('training:teacher-join', ({ matchIds }) => {
    console.log(`[Server][Training] Professeur rejoint rooms Training:`, matchIds);
    matchIds.forEach(matchId => {
      socket.join(matchId);
      console.log(`[Server][Training] 🔗 Prof joined room: ${matchId}`);
      
      // Envoyer immédiatement l'état actuel des joueurs pour ce match
      const matchState = crazyArena.getTrainingMatchState(matchId);
      if (matchState && matchState.players && matchState.players.length > 0) {
        socket.emit('training:players-update', {
          matchId,
          players: matchState.players.map(p => ({
            studentId: p.studentId,
            name: p.name,
            avatar: p.avatar,
            ready: p.ready
          }))
        });
        console.log(`[Server][Training] 📤 Envoyé état initial ${matchState.players.length} joueurs à prof pour ${matchId}`);
      }
    });
  });

  socket.on('training:force-start', ({ matchId }, cb) => {
    console.log(`[Server][Training] Démarrage forcé match ${matchId}`);
    const success = crazyArena.trainingForceStart(matchId);
    if (typeof cb === 'function') {
      cb({ ok: success });
    }
  });

  // Training: Validation de paire (IDENTIQUE HANDLER ARENA)
  socket.on('training:pair-validated', (data) => {
    logger.info('[Server][Training] Paire validée', { 
      matchId: data.matchId?.slice(-8), 
      studentId: data.studentId,
      zoneA: data.zoneA, 
      zoneB: data.zoneB,
      socketId: socket.id 
    });
    crazyArena.trainingPairValidated(socket, data);
  });

  socket.on('training:subscribe-manager', ({ matchId }) => {
    console.log(`[Server][Training] Manager souscrit au match ${matchId}`);
    socket.join(matchId);
  });

  socket.on('training:player-ready-tiebreaker', ({ matchId, studentId, playerName }) => {
    console.log(`[Server][Training] Joueur ${playerName} prêt pour départage match ${matchId}`);
    logger.training('player-ready-tiebreaker', { 
      matchId: matchId?.slice(-8), 
      studentId, 
      playerName, 
      socketId: socket.id,
      timestamp: Date.now()
    });
    crazyArena.trainingPlayerReadyForTiebreaker(matchId, studentId, playerName, io);
  });

  socket.on('training:start-tiebreaker', async ({ matchId }) => {
    console.log(`[Server][Training] Professeur lance départage pour match ${matchId}`);
    await crazyArena.trainingStartTiebreakerByTeacher(matchId);
  });

  // Training/Arena: Suppression manuelle d'un match par le prof
  socket.on('delete-match', ({ matchId }, cb) => {
    logger.info('[Server] Demande suppression match', { matchId, socketId: socket.id });
    const result = crazyArena.deleteMatch(matchId);
    
    if (result.ok) {
      logger.info('[Server] Match supprimé avec succès', { matchId });
    } else {
      logger.warn('[Server] Échec suppression match', { matchId, error: result.error });
    }
    
    if (typeof cb === 'function') {
      cb(result);
    }
  });

  // ===== CRAZY ARENA EVENTS (Tournoi groupes de 4) =====
  
  socket.on('arena:join', async ({ matchId, studentData }, cb) => {
    logger.info('[Server][Arena] Joueur rejoint', { matchId, studentId: studentData.studentId, name: studentData.name, socketId: socket.id });
    const success = await crazyArena.joinMatch(socket, matchId, studentData);
    if (typeof cb === 'function') {
      cb({ ok: success });
    }
  });

  socket.on('arena:ready', ({ studentId }) => {
    logger.info('[Server][Arena] Joueur marque prêt (lobby)', { studentId, socketId: socket.id });
    crazyArena.playerReady(socket, studentId);
  });

  socket.on('arena:pair-validated', (data) => {
    logger.info('[Server][Arena] Paire validée', { 
      matchId: data.matchId?.slice(-8), 
      studentId: data.studentId,
      zoneA: data.zoneA, 
      zoneB: data.zoneB,
      socketId: socket.id 
    });
    crazyArena.pairValidated(socket, data);
  });

  socket.on('arena:force-start', ({ matchId }, cb) => {
    // Démarrage forcé par le professeur (2-4 joueurs)
    console.log(`[Server] arena:force-start reçu pour match ${matchId}`);
    const success = crazyArena.forceStart(matchId);
    if (typeof cb === 'function') {
      cb({ ok: success });
    }
  });

  socket.on('arena:subscribe-manager', ({ matchId }) => {
    // Le dashboard professeur s'abonne aux mises à jour d'un match
    console.log(`[Server] Dashboard s'abonne au match ${matchId}`);
    socket.join(matchId);
    
    // Envoyer immédiatement l'état actuel des joueurs
    const currentState = crazyArena.getMatchState(matchId);
    if (currentState) {
      socket.emit('arena:players-update', {
        matchId,
        players: currentState.players
      });
    }
  });

  socket.on('arena:spectate-join', ({ matchId }, cb) => {
    // Mode spectateur: rejoindre la room pour recevoir tous les événements en lecture seule
    console.log(`[Server] 👁️ Spectateur rejoint le match ${matchId}`);
    socket.join(matchId);
    
    const state = crazyArena.getMatchState(matchId);
    if (state) {
      socket.emit('arena:spectate-state', state);
    }
    if (typeof cb === 'function') {
      cb({ ok: !!state, state });
    }
  });

  // Joueur clique "Je suis prêt" pour le départage
  socket.on('arena:player-ready-tiebreaker', ({ matchId, studentId, playerName }) => {
    logger.info('[Server][Arena] Joueur prêt pour départage', { matchId, studentId, playerName, socketId: socket.id });
    crazyArena.playerReadyForTiebreaker(matchId, studentId, playerName, io);
  });

  socket.on('arena:start-tiebreaker', async ({ matchId }) => {
    // Le professeur lance manuellement le départage
    console.log(`[Server] Professeur lance départage pour match ${matchId}`);
    await crazyArena.startTiebreakerByTeacher(matchId);
  });

  socket.on('disconnect', () => {
    // Gérer déconnexion Crazy Arena
    crazyArena.handleDisconnect(socket);
    
    // Gérer déconnexion multijoueur classique
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.players.delete(socket.id);
    if (room.hostId === socket.id) {
      // réassigner l'hôte si possible
      const first = room.players.keys().next();
      room.hostId = first.done ? null : first.value;
    }
    // si plus personne, nettoyer les timers et supprimer la salle
    if (room.players.size === 0) {
      if (room.roundTimer) { try { clearTimeout(room.roundTimer); } catch {} room.roundTimer = null; }
      try {
        if (room.pendingClaims && room.pendingClaims.size) {
          for (const [, entry] of room.pendingClaims.entries()) {
            try { if (entry && entry.timer) clearTimeout(entry.timer); } catch {}
          }
          room.pendingClaims.clear();
        }
      } catch {}
      room.sessionActive = false;
      rooms.delete(currentRoom);
      console.log(`[MP] Room ${currentRoom} supprimée (dernier joueur déconnecté)`);
    } else {
      emitRoomState(currentRoom);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend lancé sur http://localhost:${PORT}`);
  
  // Démarrer les tâches cron de monitoring
  try {
    startWeeklyMonitoring();
    startDailyMonitoring();
  } catch (err) {
    console.warn('[Monitoring] Erreur démarrage cron:', err.message);
  }
});

// ==========================================
// GRACEFUL SHUTDOWN
// Sauvegarder tous les matchs actifs avant arrêt
// ==========================================
async function gracefulShutdown(signal) {
  console.log(`\n[Server] ⚠️  Signal ${signal} reçu - Sauvegarde des matchs actifs...`);
  try {
    await crazyArena.saveAllActiveMatches();
    console.log('[Server] ✅ Sauvegarde terminée - Arrêt du serveur');
  } catch (err) {
    console.error('[Server] ❌ Erreur sauvegarde graceful shutdown:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
