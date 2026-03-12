/**
 * Global Setup — Réveiller le backend Render AVANT de lancer les tests
 * 
 * Le serveur Render (plan gratuit) s'endort après 15 min d'inactivité.
 * Le cold start prend ~30s. Sans ce warm-up, les 10-20 premiers tests
 * échouent en timeout car loginWithEmail et les API calls attendent trop longtemps.
 * 
 * Ce script ping /health en boucle jusqu'à ce que le backend réponde,
 * PUIS charge aussi /associations.json et /math-positions pour les mettre en cache.
 */

const BACKEND_URL = process.env.E2E_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com';
const MAX_ATTEMPTS = 6;
const WAIT_BETWEEN = 10000; // 10s entre chaque tentative

async function globalSetup() {
  console.log('\n🔧 [GlobalSetup] Réveil du backend Render...');
  console.log(`   URL: ${BACKEND_URL}`);

  let awake = false;

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      console.log(`   🏓 Ping #${i}/${MAX_ATTEMPTS}...`);
      const res = await fetch(`${BACKEND_URL}/health`, {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`   ✅ Backend réveillé! (${res.status}) ${data.uptime ? `Uptime: ${Math.round(data.uptime)}s` : ''}`);
        awake = true;
        break;
      } else {
        console.log(`   ⚠️ Réponse ${res.status}, retry...`);
      }
    } catch (err) {
      console.log(`   ⏳ Tentative ${i} échouée (${err.message}), attente ${WAIT_BETWEEN / 1000}s...`);
    }
    if (i < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, WAIT_BETWEEN));
    }
  }

  if (!awake) {
    console.warn('   ❌ Backend non réveillé après toutes les tentatives — les tests vont probablement échouer');
    return;
  }

  // Vérifier que le backend répond VITE (pas juste qu'il est réveillé)
  console.log('   🔥 Vérification réponse rapide...');
  for (let i = 0; i < 3; i++) {
    try {
      const start = Date.now();
      const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(8000) });
      const ms = Date.now() - start;
      if (res.ok && ms < 5000) {
        console.log(`   ✅ Réponse rapide: ${ms}ms`);
        break;
      }
      console.log(`   ⏳ Réponse lente: ${ms}ms, re-ping...`);
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 3000));
  }

  // Pré-charger les ressources ET endpoints critiques pour les mettre en cache
  console.log('   📦 Pré-chargement des ressources et endpoints...');
  const resources = [
    '/associations.json',
    '/math-positions',
    '/me',
    '/api/training/records',
    '/api/auth/profile',
  ];

  for (const path of resources) {
    try {
      const res = await fetch(`${BACKEND_URL}${path}`, { signal: AbortSignal.timeout(10000) });
      console.log(`   ${res.ok || res.status === 401 ? '✅' : '⚠️'} ${path} (${res.status})`);
    } catch (err) {
      console.log(`   ⚠️ ${path} — ${err.message}`);
    }
  }

  // Keep-alive: ping le backend toutes les 3 min pour éviter qu'il se rendorme
  // pendant le run E2E (~20 min)
  const keepAliveInterval = setInterval(async () => {
    try {
      await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(10000) });
      console.log('   🏓 [KeepAlive] Ping backend OK');
    } catch {
      console.log('   ⚠️ [KeepAlive] Ping backend échoué');
    }
  }, 3 * 60 * 1000); // 3 minutes (plus fréquent pour Render)

  // Stocker l'intervalle pour le teardown
  globalThis.__CC_KEEPALIVE_INTERVAL__ = keepAliveInterval;

  console.log('   🏁 GlobalSetup terminé (keep-alive actif toutes les 3 min)\n');
}

module.exports = globalSetup;
