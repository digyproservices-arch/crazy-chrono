// =============================================
// Harnais de test HTTP: démarre le VRAI server.js avec un Supabase stub
// déterministe (aucun réseau, aucune base de production) et envoie de vraies
// requêtes HTTP au pipeline Express complet.
// =============================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const BOOT_TIMEOUT = 30_000;
const HOST = '127.0.0.1';

function startServer({ port, fixture, env = {} }) {
  const fixtureFile = path.join(os.tmpdir(), `cc-fixture-${port}-${Date.now()}.json`);
  fs.writeFileSync(fixtureFile, JSON.stringify(fixture), 'utf8');
  // Pannes Supabase basculées en cours de test (rejeu après rétablissement).
  const controlFile = path.join(os.tmpdir(), `cc-control-${port}-${Date.now()}.json`);
  fs.writeFileSync(controlFile, JSON.stringify({ failWrites: {}, failReads: {} }), 'utf8');
  const preload = path.join(__dirname, 'supabaseStubPreload.js');

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        NODE_OPTIONS: `--require ${preload}`,
        CC_TEST_SUPABASE_FIXTURE: fixtureFile,
        CC_TEST_SUPABASE_CONTROL: controlFile,
        SUPABASE_URL: 'http://supabase.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-role-key',
        SUPABASE_ANON_KEY: 'stub-anon-key',
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        REVENUECAT_WEBHOOK_SECRET: '',
        CC_DEV_ALLOW_UNVERIFIED_MP: '',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error(`server boot timeout (port ${port})`)), BOOT_TIMEOUT - 2000);
    const onData = (buf) => {
      if (buf.toString().includes(`${port}`)) { clearTimeout(timer); resolve(handle); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);

    const handle = {
      port,
      stop() {
        try { child.kill('SIGKILL'); } catch {}
        try { fs.unlinkSync(fixtureFile); } catch {}
        try { fs.unlinkSync(controlFile); } catch {}
      },
      /** Injecte/retire des pannes Supabase: { failWrites, failReads }. */
      setFaults(control) {
        fs.writeFileSync(controlFile, JSON.stringify(control || {}), 'utf8');
      },
      request(method, urlPath, opts) { return request(port, method, urlPath, opts); },
    };
  });
}

function request(port, method, urlPath, { token, headers = {}, body } = {}) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const opts = {
    host: HOST,
    port,
    method,
    path: urlPath,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, raw, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { startServer, request, BOOT_TIMEOUT, HOST };
