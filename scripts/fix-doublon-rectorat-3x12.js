/**
 * Application de la version "deux étapes" du rectorat (validée par Pascal) :
 *   "3 × (1/2)" → "3/2"  puis  "3/2" → "1 + 1/2"   (paires principales, conservées)
 * → Suppression des paires GÉNÉRÉES en doublon d'une paire principale du rectorat
 *   (issues de distracteurs sans réponse fournie ; même expression que la paire
 *   principale → risque d'ambiguïté sur le plateau) :
 *   - "3 × 1/2" → "1,5"   (principale rectorat : "3 × (1/2)" → "3/2")
 *   - "2 × (1/4)" → "0,5" (principale rectorat : "2 × 1/4" → "1/2")
 *
 * Modifie : server/data + public/data (associations.json, learn-strategies.json)
 * Bump _dataVersion pour invalider le cache client.
 * Audit final : liste les autres expressions de calcul en doublon (non modifiées).
 */
const fs = require('fs');
const path = require('path');

const CALC_IDS = [
  'cmult_1772259541773_82', // "3 × 1/2" (doublon généré)
  'cmult_1772259541773_91', // "2 × (1/4)" (doublon généré)
];
const CHIFFRE_IDS = [
  'ncmult_1772259541773_82', // "1,5" (réponse générée)
  'ncmult_1772259541773_91', // "0,5" (réponse générée)
];

const normalize = (s) => String(s || '').replace(/[()\s]/g, '');

for (const base of ['server/data', 'public/data']) {
  const assocPath = path.join(__dirname, '..', base, 'associations.json');
  const j = JSON.parse(fs.readFileSync(assocPath, 'utf8'));

  for (const key of Object.keys(j)) {
    if (!Array.isArray(j[key])) continue;
    const before = j[key].length;
    j[key] = j[key].filter((e) => {
      if (!e || typeof e !== 'object') return true;
      if (CALC_IDS.includes(e.id) || CHIFFRE_IDS.includes(e.id)) return false;
      if (CALC_IDS.includes(e.calculId) || CHIFFRE_IDS.includes(e.chiffreId)) return false;
      return true;
    });
    const removed = before - j[key].length;
    if (removed > 0) console.log(`${base}/associations.json [${key}]: ${removed} entrée(s) supprimée(s)`);
  }
  if (typeof j._dataVersion === 'number') {
    j._dataVersion += 1;
    console.log(`${base}/associations.json: _dataVersion → ${j._dataVersion}`);
  }
  fs.writeFileSync(assocPath, JSON.stringify(j, null, 2) + '\n', 'utf8');

  const lsPath = path.join(__dirname, '..', base, 'learn-strategies.json');
  if (fs.existsSync(lsPath)) {
    const ls = JSON.parse(fs.readFileSync(lsPath, 'utf8'));
    let touched = false;
    const scrub = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const id of CALC_IDS) {
        if (Object.prototype.hasOwnProperty.call(obj, id)) { delete obj[id]; touched = true; }
      }
      for (const v of Object.values(obj)) { if (v && typeof v === 'object' && !Array.isArray(v)) scrub(v); }
    };
    scrub(ls);
    if (touched) {
      fs.writeFileSync(lsPath, JSON.stringify(ls, null, 2) + '\n', 'utf8');
      console.log(`${base}/learn-strategies.json: stratégie(s) supprimée(s)`);
    }
  }
}

// ===== AUDIT (lecture seule) : autres expressions de calcul en doublon =====
const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server/data/associations.json'), 'utf8'));
const calcs = [];
for (const key of Object.keys(j)) {
  if (!Array.isArray(j[key])) continue;
  for (const e of j[key]) {
    if (e && typeof e === 'object' && typeof e.id === 'string' && /^c/.test(e.id) && e.content) {
      calcs.push(e);
    }
  }
}
const byNorm = new Map();
for (const e of calcs) {
  const n = normalize(e.content);
  if (!byNorm.has(n)) byNorm.set(n, []);
  byNorm.get(n).push(e);
}
console.log('\n=== AUDIT: expressions de calcul en doublon (après correction) ===');
let dupCount = 0;
for (const [n, list] of byNorm) {
  if (list.length > 1) {
    dupCount++;
    console.log(`"${list[0].content}" → ${list.length} entrées: ${list.map((e) => e.id).join(', ')}`);
  }
}
if (dupCount === 0) console.log('Aucun doublon.');
