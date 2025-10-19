const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

// Load env (safe)
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch {}
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

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

// Early middleware: enable CORS and JSON parsing before defining routes (including webhooks)
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===== Usage/Quota (Mini-sprint): server-side check tied to Supabase user =====
let supabaseAdmin = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const supaUrl = process.env.SUPABASE_URL;
  const supaSrv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaUrl && supaSrv) {
    supabaseAdmin = createClient(supaUrl, supaSrv, { auth: { persistSession: false } });
  }
} catch (e) {
  console.warn('[Usage] Supabase admin not configured:', e.message);
}

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

app.use(cors());
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
  if (!rooms.has(roomCode)) rooms.set(roomCode, { players: new Map(), resolved: false, status: 'lobby', hostId: null, duration: 60, sessionActive: false, sessions: [], roundsPerSession: 3, roundsPlayed: 0, roundTimer: null, pendingClaims: new Map() });
  const r = rooms.get(roomCode);
  if (!r.pendingClaims) r.pendingClaims = new Map();
  return r;
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
  io.to(roomCode).emit('round:new', {
    seed,
    duration: room.duration || 60,
    roundIndex: room.roundsPlayed,
    roundsTotal: isFinite(room.roundsPerSession) ? room.roundsPerSession : null,
    zonesFile: 'zones2'
  });
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
  const summary = {
    endedAt: Date.now(),
    roomCode,
    winner: winner || null,
    winnerTitle: winner ? 'Crazy Winner' : null,
    scores: entries.map(([id, pl]) => ({ id, name: pl.name, score: pl.score || 0 }))
  };
  try { room.sessions.push(summary); } catch {}
  room.sessionActive = false;
  room.status = 'lobby';
  if (room.roundTimer) { try { clearTimeout(room.roundTimer); } catch {} room.roundTimer = null; }
  io.to(roomCode).emit('session:end', summary);
  emitRoomState(roomCode);
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerName = `Joueur-${socket.id.slice(0,4)}`;

  // Créer une salle et renvoyer le code au client (ack)
  socket.on('room:create', (cb) => {
    const code = genRoomCode();
    getRoom(code); // initialise
    if (typeof cb === 'function') cb({ ok: true, roomCode: code });
  });

  // Rejoindre une salle existante (ou défaut)
  socket.on('joinRoom', ({ roomId, name }) => {
    const newRoom = String(roomId || 'default');
    playerName = String(name || playerName);
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
    room.players.set(socket.id, { name: playerName, score: existing.score || 0, ready: false });
    if (!room.hostId || !room.players.has(room.hostId)) {
      room.hostId = socket.id; // premier connecté devient hôte
    }
    room.status = 'lobby';
    emitRoomState(currentRoom);
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
    // reset scores for new session
    for (const [id, pl] of room.players.entries()) {
      pl.score = 0;
      pl.ready = false;
      room.players.set(id, pl);
    }
    room.sessionActive = true;
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
    room.status = 'playing';
    room.resolved = false;
    room.roundsPlayed = 0;
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
        // Calculer une seed déterministe identique pour tous
        const base = Number.isFinite(room.roundSeed) ? room.roundSeed : Math.floor(Date.now() % 2147483647);
        const count = room.pairsValidated;
        const seedNext = (Math.imul((base ^ 0x9E3779B1) + count * 10007, 2654435761) >>> 0) % 2147483647;
        // Compat: 'by' = premier cliqueur; ajoute tie + winners si égalité
        const first = claimants[0] || socket.id;
        const isTie = claimants.length >= 2;
        io.to(currentRoom).emit('pair:valid', {
          by: first,
          a, b,
          ts: Date.now(),
          count,
          seedNext,
          zonesFile: 'zones2',
          tie: isTie,
          winners: claimants
        });
      } catch (e) {
        console.error('[MP] pending claim finalize error', e);
      }
    }, Math.max(50, TIE_WINDOW_MS));
    room.pendingClaims.set(claimKey, entry);
  });

  // Fin de session (hôte): annonce le gagnant et passe en lobby
  socket.on('session:end', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    if (socket.id !== room.hostId) return;
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

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.players.delete(socket.id);
    if (room.hostId === socket.id) {
      // réassigner l'hôte si possible
      const first = room.players.keys().next();
      room.hostId = first.done ? null : first.value;
    }
    // si plus personne, supprimer la salle
    if (room.players.size === 0) {
      rooms.delete(currentRoom);
    } else {
      emitRoomState(currentRoom);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend lancé sur http://localhost:${PORT}`);
});
