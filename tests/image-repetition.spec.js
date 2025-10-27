// Test Playwright pour détecter la répétition d'images
// Gratuit en local, $0 pour CI/CD avec GitHub Actions (2000 min/mois)

const { test, expect } = require('@playwright/test');

test('Détecte la répétition excessive d\'images', async ({ page }) => {
  await page.goto('https://app.crazy-chrono.com/modes');
  
  const imagesSeen = new Map();
  const rounds = 5;
  
  for (let round = 0; round < rounds; round++) {
    // Attendre que les images soient chargées
    await page.waitForSelector('img[src*="images/"]', { timeout: 10000 });
    
    // Récupérer toutes les images du round
    const images = await page.$$eval('img[src*="images/"]', imgs => 
      imgs.map(img => img.src)
    );
    
    images.forEach(img => {
      const count = imagesSeen.get(img) || 0;
      imagesSeen.set(img, count + 1);
    });
    
    // Passer au round suivant (simuler validation)
    if (round < rounds - 1) {
      await page.click('[data-testid="next-round"]'); // Adapter le sélecteur
      await page.waitForTimeout(1000);
    }
  }
  
  // Calculer le taux de répétition
  const totalImages = rounds * 4; // 4 images par round
  const uniqueImages = imagesSeen.size;
  const repetitionRate = 1 - (uniqueImages / totalImages);
  
  console.log(`Images uniques: ${uniqueImages}/${totalImages}`);
  console.log(`Taux de répétition: ${(repetitionRate * 100).toFixed(1)}%`);
  
  // Échec si répétition > 40%
  expect(repetitionRate).toBeLessThan(0.4);
});

// Installation:
// npm install -D @playwright/test
// npx playwright install

// Exécution:
// npx playwright test tests/image-repetition.spec.js
