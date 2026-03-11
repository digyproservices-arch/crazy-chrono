/**
 * Helpers partagés pour les tests E2E Crazy Chrono
 */

// Comptes de test — à configurer via variables d'environnement ou .env
const TEST_ACCOUNTS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'verinmarius971@gmail.com',
    password: process.env.E2E_ADMIN_PASSWORD || '',
  },
  teacher: {
    email: process.env.E2E_TEACHER_EMAIL || 'verinmarius971@gmail.com',
    password: process.env.E2E_TEACHER_PASSWORD || '',
  },
  student: {
    code: process.env.E2E_STUDENT_CODE || '',
  },
};

const BACKEND_URL = process.env.E2E_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com';

/**
 * Login via email/password et attendre la redirection vers /modes
 */
async function loginWithEmail(page, email, password) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // S'assurer qu'on est en mode "Enseignant/Parent" (pas élève)
  const studentToggle = page.locator('text=Je suis élève');
  if (await studentToggle.isVisible()) {
    // On est déjà en mode enseignant/parent, rien à faire
  }

  // Remplir email et mot de passe
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Cliquer sur le bouton de connexion
  await page.click('button[type="submit"]');

  // Attendre la redirection vers /modes (timeout 20s pour cold start Render)
  await page.waitForURL('**/modes', { timeout: 30000 });
}

/**
 * Login via code élève
 */
async function loginWithStudentCode(page, code) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Basculer en mode "Je suis élève"
  const studentToggle = page.locator('text=Je suis élève');
  if (await studentToggle.isVisible()) {
    await studentToggle.click();
  }

  // Remplir le code d'accès
  await page.fill('input[placeholder*="code" i], input[placeholder*="accès" i], input[type="text"]', code);

  // Soumettre
  await page.click('button[type="submit"]');

  // Attendre la redirection
  await page.waitForURL('**/modes', { timeout: 30000 });
}

/**
 * Logout via la navbar
 */
async function logout(page) {
  // Cliquer sur le menu profil (avatar/icône utilisateur dans la navbar)
  const profileBtn = page.locator('[data-testid="profile-menu"], .profile-menu-trigger, button:has(svg)').first();
  
  // Essayer de trouver et cliquer sur le bouton de déconnexion
  // La navbar a un ProfileMenu avec un bouton déconnexion
  const logoutBtn = page.locator('text=Déconnexion, text=Se déconnecter, text=Logout').first();
  
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
  } else {
    // Ouvrir le menu profil d'abord
    await profileBtn.click();
    await page.waitForTimeout(500);
    const logoutInMenu = page.locator('text=Déconnexion, text=Se déconnecter').first();
    await logoutInMenu.click();
  }

  await page.waitForURL('**/login', { timeout: 10000 });
}

/**
 * Vérifier que la page n'a pas de crash React (page blanche / erreur)
 */
async function checkNoReactCrash(page) {
  // Vérifier qu'il n'y a pas d'erreur React visible
  const errorBoundary = page.locator('text=Something went wrong, text=Erreur, text=Error #');
  const hasError = await errorBoundary.isVisible().catch(() => false);
  return !hasError;
}

/**
 * Vérifier que le backend répond
 */
async function checkBackendHealth(page) {
  const response = await page.request.get(`${BACKEND_URL}/health`);
  return response.ok();
}

/**
 * Attendre que le backend Render se réveille (cold start ~30s)
 */
async function waitForBackend(page) {
  for (let i = 0; i < 5; i++) {
    try {
      const response = await page.request.get(`${BACKEND_URL}/health`, { timeout: 15000 });
      if (response.ok()) return true;
    } catch {
      await page.waitForTimeout(5000);
    }
  }
  return false;
}

/**
 * Collecter les erreurs console du navigateur
 */
function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

module.exports = {
  TEST_ACCOUNTS,
  BACKEND_URL,
  loginWithEmail,
  loginWithStudentCode,
  logout,
  checkNoReactCrash,
  checkBackendHealth,
  waitForBackend,
  collectConsoleErrors,
};
