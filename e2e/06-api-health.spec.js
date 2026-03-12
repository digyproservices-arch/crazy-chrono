// @ts-check
const { test, expect } = require('@playwright/test');
const { BACKEND_URL } = require('./helpers');

/**
 * Tests API Backend — vérifie que les endpoints critiques répondent
 */
test.describe('API Backend - Endpoints critiques', () => {

  test('GET /health répond 200', async ({ request }) => {
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await request.get(`${BACKEND_URL}/health`, { timeout: 30000 });
        if (response.ok()) break;
      } catch {
        if (attempt < 3) await new Promise(r => setTimeout(r, 5000));
      }
    }
    expect(response?.ok()).toBeTruthy();
  });

  test('GET /me répond (même sans auth)', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/me`, { timeout: 15000 });
    // Sans token, doit répondre 401 pas 500
    expect(response.status()).toBeLessThan(500);
  });

  test('GET /api/training/records répond', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/training/records`, { timeout: 15000 });
    expect(response.status()).toBeLessThan(500);
  });

  test('POST /api/auth/student-login avec code invalide retourne erreur propre', async ({ request }) => {
    const response = await request.post(`${BACKEND_URL}/api/auth/student-login`, {
      data: { code: 'CODE-INVALIDE-9999' },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    // Doit retourner 400 ou 404, PAS 500
    expect(response.status()).toBeLessThan(500);
    const body = await response.json();
    expect(body.ok).toBeFalsy();
  });

  test('GET /api/auth/profile sans token retourne 401', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/auth/profile`, { timeout: 15000 });
    expect(response.status()).toBe(401);
  });

  test('PATCH /api/auth/profile sans token retourne 401', async ({ request }) => {
    const response = await request.patch(`${BACKEND_URL}/api/auth/profile`, {
      data: { pseudo: 'test' },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /associations.json est accessible (frontend)', async ({ page }) => {
    const baseUrl = page.context().pages().length ? page.url() : 'https://app.crazy-chrono.com';
    const response = await page.request.get(`https://app.crazy-chrono.com/data/associations.json`, { timeout: 15000 });
    // Le fichier doit être accessible depuis le frontend
    expect(response.status()).toBeLessThan(500);
  });

  test('GET /math-positions est accessible', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/math-positions`, { timeout: 15000 });
    expect(response.ok()).toBeTruthy();
  });
});
