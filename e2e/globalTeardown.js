/**
 * Global Teardown — Nettoyer le keep-alive backend
 */
async function globalTeardown() {
  if (globalThis.__CC_KEEPALIVE_INTERVAL__) {
    clearInterval(globalThis.__CC_KEEPALIVE_INTERVAL__);
    console.log('   🧹 [GlobalTeardown] Keep-alive arrêté');
  }
}

module.exports = globalTeardown;
