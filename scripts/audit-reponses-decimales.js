/**
 * AUDIT (lecture seule) des réponses problématiques dans associations.json :
 *  1. Décimaux tronqués (≥ 4 décimales) → décimaux illimités approximés, hors programme CM1/CM2
 *  2. Réponses décimales dans la catégorie Fractions (pour information / décision pédagogique)
 * N'écrit RIEN — affiche seulement la liste.
 */
const fs = require('fs');
const path = require('path');

const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server/data/associations.json'), 'utf8'));
const all = [].concat(j.calculs || [], j.chiffres || []);
const byId = new Map(all.map((e) => [e.id, e]));

const truncated = [];
const decimalInFraction = [];

for (const p of j.associations || []) {
  const c = byId.get(p.calculId);
  const n = byId.get(p.chiffreId);
  if (!c || !n) continue;
  const ans = String(n.content || '').trim();
  const themes = (p.themes || []).concat(c.themes || []);
  const isFraction = themes.some((t) => String(t).includes('fraction'));
  const m = ans.match(/^-?\d+,(\d+)$/);
  if (m && m[1].length >= 4) {
    truncated.push({ calc: c.content, ans, level: p.levelClass || c.levelClass, id: c.id });
  } else if (isFraction && /^-?\d+(,\d+)?$/.test(ans) && ans.includes(',')) {
    decimalInFraction.push({ calc: c.content, ans, level: p.levelClass || c.levelClass, id: c.id });
  }
}

console.log('=== 1. DÉCIMAUX TRONQUÉS (réponse inexacte, à corriger en fraction) ===');
if (truncated.length === 0) console.log('  Aucun.');
for (const e of truncated) console.log(`  "${e.calc}" -> "${e.ans}"  [${e.level}]  (${e.id})`);

console.log('\n=== 2. RÉPONSES DÉCIMALES (exactes) EN CATÉGORIE FRACTIONS (pour info) ===');
if (decimalInFraction.length === 0) console.log('  Aucune.');
for (const e of decimalInFraction) console.log(`  "${e.calc}" -> "${e.ans}"  [${e.level}]  (${e.id})`);

console.log(`\nTotal: ${truncated.length} tronqué(s), ${decimalInFraction.length} décimale(s) exacte(s) en catégorie fractions.`);
