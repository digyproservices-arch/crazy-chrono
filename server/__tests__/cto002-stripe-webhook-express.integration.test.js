// =============================================
// CTO-002 (revue finale) — Webhook Stripe à travers le VRAI pipeline Express
//
// Les tests unitaires de makeWebhookHandler ne prouvent rien sur l'ordre des
// middlewares: si express.json() consomme le corps avant bodyParser.raw(),
// req.body devient un objet et la signature Stripe n'est plus vérifiable.
// Ce test démarre server.js (même pile de middlewares que la production) et
// envoie de vraies requêtes HTTP signées localement avec le SDK Stripe.
//
// Aucun appel réseau: generateTestHeaderString et constructEvent sont locaux,
// aucune clé réelle, aucune Supabase, aucun Stripe de production.
// =============================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const Stripe = require('stripe');

const PORT = 4581;
const HOST = '127.0.0.1';
const WEBHOOK_SECRET = 'whsec_cto002_local_test_secret';
const BOOT_TIMEOUT = 30_000;

const stripe = Stripe('sk_test_cto002_local_dummy_key');

let serverProcess = null;
let eventStoreFile = null;

function startServer() {
  eventStoreFile = path.join(os.tmpdir(), `cto002-stripe-events-${Date.now()}.json`);
  return new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        // SDK Stripe instancié avec une clé factice: constructEvent est purement local.
        STRIPE_SECRET_KEY: 'sk_test_cto002_local_dummy_key',
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        CC_STRIPE_EVENT_STORE: eventStoreFile,
        // Aucune Supabase: on n'envoie donc que des événements non critiques.
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        SUPABASE_ANON_KEY: '',
        CC_DEV_ALLOW_UNVERIFIED_MP: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error('server boot timeout')), BOOT_TIMEOUT - 2000);
    const onData = (buf) => {
      if (buf.toString().includes(`${PORT}`)) { clearTimeout(timer); resolve(); }
    };
    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', onData);
    serverProcess.on('error', reject);
  });
}

/** POST brut: on contrôle exactement les octets envoyés (aucun re-encodage). */
function post(urlPath, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: HOST, port: PORT, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* réponse non JSON */ }
        resolve({ status: res.statusCode, body: json, raw: data });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function stripeEvent(id, type = 'invoice.payment_succeeded') {
  return JSON.stringify({
    id,
    object: 'event',
    type,
    created: 1730000000,
    data: { object: { id: 'in_cto002', object: 'invoice', customer: 'cus_cto002', status: 'paid', currency: 'eur', amount_total: 990 } },
  });
}

function sign(payload) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
}

beforeAll(async () => { await startServer(); }, BOOT_TIMEOUT);

afterAll(() => {
  if (serverProcess) serverProcess.kill('SIGKILL');
  if (eventStoreFile) { try { fs.unlinkSync(eventStoreFile); } catch { /* déjà absent */ } }
});

describe('CTO-002 P0 — /webhooks/stripe reçoit le corps HTTP brut', () => {
  test('1. webhook signé valide → constructEvent réussit, métier appelé, 200', async () => {
    const payload = stripeEvent('evt_cto002_valid_1');
    const res = await post('/webhooks/stripe', payload, { 'Stripe-Signature': sign(payload) });

    // Avant correction: express.json() consommait le corps → 400 invalid_payload.
    expect(res.body).not.toMatchObject({ error: 'invalid_payload' });
    expect(res.body).not.toMatchObject({ error: 'invalid_signature' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('1bis. le traitement métier a bien eu lieu (rejeu du même event.id → doublon)', async () => {
    const payload = stripeEvent('evt_cto002_valid_2');
    const first = await post('/webhooks/stripe', payload, { 'Stripe-Signature': sign(payload) });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });

    const replay = await post('/webhooks/stripe', payload, { 'Stripe-Signature': sign(payload) });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ received: true, duplicate: true });

    // L'idempotence n'est atteinte qu'après vérification de signature et traitement:
    // l'event.id n'existe qu'une fois dans le journal persistant.
    const seen = JSON.parse(fs.readFileSync(eventStoreFile, 'utf8'));
    expect(seen.filter((id) => id === 'evt_cto002_valid_2')).toHaveLength(1);
  });

  test('2. payload modifié après signature → 400 invalid_signature', async () => {
    const payload = stripeEvent('evt_cto002_tampered');
    const signature = sign(payload);
    const tampered = payload.replace('"amount_total":990', '"amount_total":1');
    expect(tampered).not.toBe(payload);

    const res = await post('/webhooks/stripe', tampered, { 'Stripe-Signature': signature });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'invalid_signature' });
  });

  test('2bis. corps identique mais réordonné (même JSON logique) → 400: la signature porte sur les octets', async () => {
    const payload = stripeEvent('evt_cto002_reencoded');
    const signature = sign(payload);
    const reencoded = JSON.stringify(JSON.parse(payload), null, 2); // ce que produirait un JSON.stringify(req.body)

    const res = await post('/webhooks/stripe', reencoded, { 'Stripe-Signature': signature });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'invalid_signature' });
  });

  test('3. signature absente → 400 missing_signature', async () => {
    const payload = stripeEvent('evt_cto002_nosig');
    const res = await post('/webhooks/stripe', payload);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'missing_signature' });
  });

  test('4. les autres routes JSON ne régressent pas (express.json toujours actif)', async () => {
    // /api/logs renvoie 400 "Missing logs" si req.body n'est pas un objet parsé.
    const res = await post('/api/logs', JSON.stringify({ logs: 'ligne A\nligne B', source: 'cto002-test' }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});
