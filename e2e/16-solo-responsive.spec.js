// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

/**
 * CTO-008 — Non-régression responsive du plateau (mode Solo).
 *
 * Le test charge une fixture statique qui reprend la structure DOM du plateau
 * de Carte.js et la feuille de style réelle (src/styles/Carte.css). Aucun
 * backend ni compte n'est nécessaire.
 *
 * Invariants vérifiés à chaque breakpoint supporté :
 *  - le plateau est carré (sinon object-fit:cover + overlay SVG "slice" rognent
 *    les bords, donc les zones satellites) ;
 *  - il tient entièrement dans le viewport et ne chevauche pas la sidebar ;
 *  - chaque zone satellite est dans le cadre du plateau ET cliquable
 *    (elementFromPoint en son centre renvoie bien la zone).
 */

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures', 'solo-board.html');

const VIEWPORTS = [
  { name: 'mobile portrait 320x480', width: 320, height: 480 },
  { name: 'mobile portrait 390x844', width: 390, height: 844 },
  { name: 'mobile paysage 640x360', width: 640, height: 360 },
  { name: 'mobile paysage 844x390', width: 844, height: 390 },
  { name: 'tablette portrait 768x1024', width: 768, height: 1024 },
  { name: 'tablette portrait 810x1080', width: 810, height: 1080 },
  { name: 'tablette portrait 1024x1366', width: 1024, height: 1366 },
  { name: 'tablette paysage 1080x810', width: 1080, height: 810 },
  { name: 'tablette paysage 1366x1024', width: 1366, height: 1024 },
  { name: 'desktop 1024x768', width: 1024, height: 768 },
  { name: 'desktop 1440x900', width: 1440, height: 900 },
  { name: 'desktop 1920x1080', width: 1920, height: 1080 },
];

async function readGeometry(page) {
  return page.evaluate(() => {
    const carteEl = document.querySelector('.carte');
    const sidebarEl = document.querySelector('.game-sidebar-fixed');
    const carte = carteEl.getBoundingClientRect();
    const sidebarVisible = sidebarEl && getComputedStyle(sidebarEl).display !== 'none';
    const sidebar = sidebarVisible ? sidebarEl.getBoundingClientRect() : null;
    const zones = [...document.querySelectorAll('.clickable-shape')].map((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        id: el.getAttribute('data-zone'),
        insideCarte:
          r.x >= carte.x - 1 && r.y >= carte.y - 1 &&
          r.right <= carte.right + 1 && r.bottom <= carte.bottom + 1,
        insideViewport:
          r.x >= -1 && r.y >= -1 &&
          r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1,
        clickable: !!hit && hit.getAttribute && hit.getAttribute('data-zone') === el.getAttribute('data-zone'),
      };
    });
    return {
      width: carte.width,
      height: carte.height,
      insideViewport:
        carte.x >= -1 && carte.y >= -1 &&
        carte.right <= window.innerWidth + 1 && carte.bottom <= window.innerHeight + 1,
      overlapsSidebar: sidebar
        ? !(carte.right <= sidebar.x + 1 || sidebar.right <= carte.x + 1 ||
            carte.bottom <= sidebar.y + 1 || sidebar.bottom <= carte.y + 1)
        : false,
      sidebarVisible: !!sidebarVisible,
      zones,
    };
  });
}

test.describe('CTO-008 — responsive du plateau Solo', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} : plateau carré, dans le cadre, zones satellites cliquables`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(FIXTURE);
      await page.waitForSelector('.clickable-shape');

      const g = await readGeometry(page);

      expect(Math.abs(g.width - g.height), 'plateau carré').toBeLessThanOrEqual(1);
      expect(g.width, 'plateau non dégénéré').toBeGreaterThan(100);
      expect(g.insideViewport, 'plateau entièrement dans le viewport').toBe(true);
      expect(g.overlapsSidebar, 'plateau ne chevauche pas la colonne latérale').toBe(false);
      expect(g.zones.length).toBe(8);

      const outOfFrame = g.zones.filter((z) => !z.insideCarte || !z.insideViewport).map((z) => z.id);
      expect(outOfFrame, 'zones satellites hors cadre').toEqual([]);
      const notClickable = g.zones.filter((z) => !z.clickable).map((z) => z.id);
      expect(notClickable, 'zones satellites non cliquables').toEqual([]);
    });
  }
});
