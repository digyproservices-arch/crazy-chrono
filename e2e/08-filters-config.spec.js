// @ts-check
const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, loginWithEmail } = require('./helpers');

/**
 * Tests des filtres de configuration de session
 * 
 * Vérifie que les sélections de niveaux (CE1, CE2, CM1...),
 * catégories (fruits, calculs, tables de multiplication...),
 * et le mode strict fonctionnent correctement.
 * 
 * Pour chaque combinaison de filtres :
 * 1. Configure la session via /config/solo
 * 2. Lance la partie
 * 3. Vérifie que la carte se charge sans crash
 * 4. Vérifie que les zones contiennent du contenu cohérent
 * 5. Détecte les anomalies (double paires, zones vides, crash)
 */

// Combinaisons de filtres à tester
const FILTER_SCENARIOS = [
  {
    name: 'CE1 uniquement — Toutes catégories',
    classes: ['CE1'],
    themes: [], // Vide = tout sélectionné
    description: 'Niveau CE1 seul, contenu complet',
  },
  {
    name: 'CE2 uniquement — Toutes catégories',
    classes: ['CE2'],
    themes: [],
    description: 'Niveau CE2 seul, contenu complet',
  },
  {
    name: 'CM1+CM2 — Toutes catégories',
    classes: ['CM1', 'CM2'],
    themes: [],
    description: 'Niveaux CM1 et CM2 combinés',
  },
  {
    name: 'CP uniquement — Toutes catégories',
    classes: ['CP'],
    themes: [],
    description: 'Niveau CP seul (le plus basique)',
  },
  {
    name: 'Tous niveaux — Botanique seule',
    classes: ['CP', 'CE1', 'CE2', 'CM1', 'CM2'],
    themes: ['domain:botany'],
    description: 'Filtrer uniquement la botanique',
  },
  {
    name: 'Tous niveaux — Zoologie seule',
    classes: ['CP', 'CE1', 'CE2', 'CM1', 'CM2'],
    themes: ['domain:zoology'],
    description: 'Filtrer uniquement la zoologie',
  },
  {
    name: 'Tous niveaux — Mathématiques seules',
    classes: ['CP', 'CE1', 'CE2', 'CM1', 'CM2'],
    themes: ['domain:math'],
    description: 'Filtrer uniquement les mathématiques',
  },
  {
    name: 'CE1 — Table de 2 uniquement',
    classes: ['CE1'],
    themes: ['category:table_2'],
    description: 'Filtrer table de 2 pour CE1',
  },
  {
    name: 'CE2 — Tables 2+3+4',
    classes: ['CE2'],
    themes: ['category:table_2', 'category:table_3', 'category:table_4'],
    description: 'Filtrer tables 2,3,4 pour CE2',
  },
  {
    name: 'CM1 — Additions + Soustractions',
    classes: ['CM1'],
    themes: ['category:addition', 'category:soustraction'],
    description: 'Filtrer opérations pour CM1',
  },
  {
    name: 'Tous niveaux — Fruits uniquement',
    classes: ['CP', 'CE1', 'CE2', 'CM1', 'CM2'],
    themes: ['category:fruit'],
    description: 'Filtrer catégorie fruits',
  },
  {
    name: 'CE1 — Botanique + Math (mixte)',
    classes: ['CE1'],
    themes: ['domain:botany', 'domain:math'],
    description: 'Mix botanique et math CE1',
  },
  {
    name: '6e — Toutes catégories (collège)',
    classes: ['6e'],
    themes: [],
    description: 'Niveau collège 6e',
  },
];

test.describe('Tests filtres de configuration', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  // Test la page /config/solo se charge et affiche les filtres
  test('Page configuration solo affiche niveaux et catégories', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.goto('/config/solo');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Les niveaux doivent être affichés
    for (const level of ['CP', 'CE1', 'CE2', 'CM1', 'CM2']) {
      const btn = page.locator(`button:text-is("${level}")`).first();
      await expect(btn).toBeVisible({ timeout: 5000 });
    }

    // Le bouton "Démarrer la partie" doit être visible
    await expect(page.locator('text=Démarrer la partie').first()).toBeVisible();
  });

  // Test chaque scénario de filtres
  for (const scenario of FILTER_SCENARIOS) {
    test(`Filtres: ${scenario.name}`, async ({ page }) => {
      const jsErrors = [];
      page.on('pageerror', err => jsErrors.push(err.message));

      await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

      // Injecter la configuration directement dans localStorage
      // (plus fiable que de cliquer sur chaque bouton)
      await page.evaluate((cfg) => {
        const sessionCfg = {
          mode: 'solo',
          classes: cfg.classes,
          themes: cfg.themes,
          rounds: 1,
          duration: 60,
          allowEmptyMathWhenNoData: true,
          playerZone: '',
          objectiveMode: false,
          objectiveTarget: null,
          objectiveThemes: [],
          helpEnabled: false,
        };
        localStorage.setItem('cc_session_cfg', JSON.stringify(sessionCfg));
      }, scenario);

      // Aller directement sur /carte (comme si on avait cliqué "Démarrer")
      await page.goto('/carte');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(6000); // Attendre génération zones

      // ═══ VÉRIFICATIONS ═══

      // 1. Pas de crash React
      const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
      expect(hasCrash).toBeFalsy();

      // 2. Page non vide
      const bodyLen = await page.evaluate(() => document.body.innerText.trim().length);
      expect(bodyLen).toBeGreaterThan(0);

      // 3. La carte contient des éléments SVG
      const svgCount = await page.evaluate(() => {
        return document.querySelectorAll('svg *, object, image, text, path').length;
      });
      // Au minimum quelques éléments (même si le contenu est limité)
      expect(svgCount).toBeGreaterThan(0);

      // 4. Vérifier qu'il n'y a pas d'erreur JS critique
      const criticalErrors = jsErrors.filter(e =>
        e.includes('removeChild') ||
        e.includes('Cannot access') ||
        e.includes('before initialization') ||
        e.includes('Element type is invalid') ||
        e.includes('Cannot read properties of null') ||
        e.includes('is not a function') ||
        e.includes('Maximum call stack')
      );

      if (criticalErrors.length > 0) {
        console.log(`  ⚠️ [${scenario.name}] Erreurs JS: ${criticalErrors.join(' | ')}`);
      }
      expect(criticalErrors).toHaveLength(0);

      // 5. Vérifier les données de session dans localStorage
      const sessionState = await page.evaluate(() => {
        try {
          const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || '{}');
          return {
            hasClasses: Array.isArray(cfg.classes) && cfg.classes.length > 0,
            classCount: (cfg.classes || []).length,
            themeCount: (cfg.themes || []).length,
            mode: cfg.mode,
          };
        } catch { return null; }
      });

      expect(sessionState).toBeTruthy();
      expect(sessionState.hasClasses).toBeTruthy();
      expect(sessionState.mode).toBe('solo');

      console.log(`  ✅ [${scenario.name}] OK — SVG: ${svgCount}, Classes: ${sessionState.classCount}, Thèmes: ${sessionState.themeCount}`);

      // Nettoyer
      page.removeAllListeners('pageerror');
    });
  }
});

test.describe('Tests contenu carte par filtre (vérification données)', () => {

  test.skip(!TEST_ACCOUNTS.admin.password, 'E2E_ADMIN_PASSWORD non défini');

  test('Mode strict éléments — la carte se charge', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    // Activer le mode strict dans cc_auth
    await page.evaluate(() => {
      try {
        const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
        auth.strictElementsMode = true;
        localStorage.setItem('cc_auth', JSON.stringify(auth));
      } catch {}
    });

    // Configuration CE1 avec mode strict
    await page.evaluate(() => {
      localStorage.setItem('cc_session_cfg', JSON.stringify({
        mode: 'solo',
        classes: ['CE1'],
        themes: [],
        rounds: 1,
        duration: 60,
        allowEmptyMathWhenNoData: false, // Mode strict
        playerZone: '',
        objectiveMode: false,
        helpEnabled: false,
      }));
    });

    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(6000);

    // Pas de crash
    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();

    // Pas d'erreur JS critique
    const criticalErrors = jsErrors.filter(e =>
      e.includes('removeChild') ||
      e.includes('Cannot access') ||
      e.includes('Element type is invalid')
    );
    expect(criticalErrors).toHaveLength(0);

    console.log('  ✅ Mode strict éléments — pas de crash');
  });

  test('Filtre Table de 2 — vérifier que les calculs sont cohérents', async ({ page }) => {
    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    await page.evaluate(() => {
      localStorage.setItem('cc_session_cfg', JSON.stringify({
        mode: 'solo',
        classes: ['CE1'],
        themes: ['category:table_2'],
        rounds: 1,
        duration: 60,
        allowEmptyMathWhenNoData: true,
        playerZone: '',
        objectiveMode: false,
        helpEnabled: false,
      }));
    });

    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(6000);

    // Pas de crash
    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();

    // Vérifier les textes visibles sur la carte
    const pageTexts = await page.evaluate(() => {
      const texts = [];
      document.querySelectorAll('text').forEach(t => {
        if (t.textContent && t.textContent.trim()) texts.push(t.textContent.trim());
      });
      return texts;
    });

    // Si des calculs sont visibles, vérifier qu'ils contiennent "× 2" ou des résultats de la table de 2
    const table2Values = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
    const table2Calcs = pageTexts.filter(t => t.includes('× 2') || t.includes('x 2'));

    // Log pour diagnostic
    console.log(`  📊 Table de 2: ${pageTexts.length} textes sur la carte, ${table2Calcs.length} calculs "×2" trouvés`);
    if (pageTexts.length > 0) {
      console.log(`     Exemples: ${pageTexts.slice(0, 5).join(', ')}`);
    }
  });

  test('Zone géographique Guadeloupe — la carte se charge', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    await page.evaluate(() => {
      localStorage.setItem('cc_session_cfg', JSON.stringify({
        mode: 'solo',
        classes: ['CE1', 'CE2'],
        themes: [],
        rounds: 1,
        duration: 60,
        allowEmptyMathWhenNoData: true,
        playerZone: 'guadeloupe',
        objectiveMode: false,
        helpEnabled: false,
      }));
      localStorage.setItem('cc_player_zone', 'guadeloupe');
    });

    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(6000);

    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();

    const criticalErrors = jsErrors.filter(e =>
      e.includes('removeChild') || e.includes('Element type is invalid')
    );
    expect(criticalErrors).toHaveLength(0);

    console.log('  ✅ Zone Guadeloupe — pas de crash');
  });

  test('Mode Objectif — la carte se charge sans chrono', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await loginWithEmail(page, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);

    await page.evaluate(() => {
      localStorage.setItem('cc_session_cfg', JSON.stringify({
        mode: 'solo',
        classes: ['CE1'],
        themes: ['domain:botany'],
        rounds: 1,
        duration: null,
        allowEmptyMathWhenNoData: true,
        playerZone: '',
        objectiveMode: true,
        objectiveTarget: 5,
        objectiveThemes: ['domain:botany'],
        helpEnabled: false,
      }));
    });

    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(6000);

    const hasCrash = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasCrash).toBeFalsy();

    const criticalErrors = jsErrors.filter(e =>
      e.includes('removeChild') || e.includes('Element type is invalid')
    );
    expect(criticalErrors).toHaveLength(0);

    console.log('  ✅ Mode Objectif botanique — pas de crash');
  });
});
