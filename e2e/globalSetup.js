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

  // Pré-charger les ressources critiques pour qu'elles soient en cache côté serveur
  console.log('   📦 Pré-chargement des ressources...');
  const resources = [
    '/associations.json',
    '/math-positions',
  ];

  for (const path of resources) {
    try {
      const res = await fetch(`${BACKEND_URL}${path}`, { signal: AbortSignal.timeout(10000) });
      console.log(`   ${res.ok ? '✅' : '⚠️'} ${path} (${res.status})`);
    } catch (err) {
      console.log(`   ⚠️ ${path} — ${err.message}`);
    }
  }

  // Keep-alive: ping le backend toutes les 5 min pour éviter qu'il se rendorme
  // pendant le run E2E (~24 min)
  const keepAliveInterval = setInterval(async () => {
    try {
      await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(10000) });
      console.log('   � [KeepAlive] Ping backend OK');
    } catch {
      console.log('   ⚠️ [KeepAlive] Ping backend échoué');
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Stocker l'intervalle pour le teardown
  globalThis.__CC_KEEPALIVE_INTERVAL__ = keepAliveInterval;

  console.log('   �🏁 GlobalSetup terminé (keep-alive actif toutes les 5 min)\n');
}

module.exports = globalSetup;
