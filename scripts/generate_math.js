// Script pour compléter les tables de multiplication + ajouter additions/soustractions
// Usage: node scripts/generate_math.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'data', 'associations.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

// ===== Analyser l'existant =====
const existingCalcContents = new Set(data.calculs.map(c => c.content.replace(/\s/g, '')));
console.log('Calculs existants:', existingCalcContents.size);

const ts = Date.now();
let idx = 0;
const newCalculs = [];
const newChiffres = [];
const newAssocs = [];

function addMathPair(expr, result, level, themes) {
  const normalized = expr.replace(/\s/g, '');
  // Check duplicates (normalize × to x for comparison)
  const variants = [normalized, normalized.replace(/×/g, 'x'), normalized.replace(/x/g, '×')];
  if (variants.some(v => existingCalcContents.has(v))) return;
  
  const cId = `cmath_${ts}_${idx}`;
  const nId = `nmath_${ts}_${idx}`;
  idx++;
  
  newCalculs.push({ id: cId, content: expr, themes, levelClass: level });
  newChiffres.push({ id: nId, content: String(result), themes, levelClass: level });
  newAssocs.push({ calculId: cId, chiffreId: nId, themes, levelClass: level });
  existingCalcContents.add(normalized);
}

// ===== Tables de multiplication 2-12 complètes =====
const tableLevels = {
  2: 'CE1', 3: 'CE1', 4: 'CE2', 5: 'CE1',
  6: 'CE2', 7: 'CE2', 8: 'CM1', 9: 'CM1',
  10: 'CE1', 11: 'CM1', 12: 'CM2'
};

for (let table = 2; table <= 12; table++) {
  const level = tableLevels[table];
  for (let n = 1; n <= 12; n++) {
    const expr = `${table} × ${n}`;
    const result = table * n;
    addMathPair(expr, result, level, ['domain:math', `category:table_${table}`]);
  }
}

// ===== Additions CP (résultats ≤ 20) =====
const additionPairsCP = [
  [1,1],[1,2],[1,3],[1,4],[1,5],[2,2],[2,3],[2,4],[2,5],[2,6],
  [3,3],[3,4],[3,5],[3,6],[3,7],[4,4],[4,5],[4,6],[5,5],[5,6],
  [6,4],[7,3],[8,2],[9,1],[6,6],[7,5],[8,4],[9,3],[7,7],[8,6],
];
for (const [a, b] of additionPairsCP) {
  addMathPair(`${a} + ${b}`, a + b, 'CP', ['domain:math', 'category:addition']);
}

// ===== Additions CE1 (résultats 20-100) =====
const additionPairsCE1 = [
  [12,15],[18,14],[23,19],[25,25],[30,17],[35,28],[42,36],[50,25],
  [15,27],[33,44],[27,18],[45,35],[38,22],[56,14],[61,29],[48,32],
];
for (const [a, b] of additionPairsCE1) {
  addMathPair(`${a} + ${b}`, a + b, 'CE1', ['domain:math', 'category:addition']);
}

// ===== Soustractions CE1 (résultats positifs, petits nombres) =====
const soustractionsCE1 = [
  [10,3],[10,5],[10,7],[12,4],[12,8],[15,6],[15,9],[18,7],
  [20,8],[20,12],[14,5],[16,9],[13,6],[17,8],[19,11],[11,4],
];
for (const [a, b] of soustractionsCE1) {
  addMathPair(`${a} − ${b}`, a - b, 'CE1', ['domain:math', 'category:soustraction']);
}

// ===== Soustractions CE2 (nombres plus grands) =====
const soustractionsCE2 = [
  [50,23],[45,18],[60,35],[72,29],[80,47],[55,28],[68,39],[75,46],
  [90,54],[100,37],[85,48],[63,27],[78,35],[95,58],[42,19],[67,34],
];
for (const [a, b] of soustractionsCE2) {
  addMathPair(`${a} − ${b}`, a - b, 'CE2', ['domain:math', 'category:soustraction']);
}

console.log(`\nNouvelles entrées générées:`);
console.log(`  Calculs: ${newCalculs.length}`);
console.log(`  Chiffres: ${newChiffres.length}`);
console.log(`  Associations: ${newAssocs.length}`);

// Merger
data.calculs.push(...newCalculs);
data.chiffres.push(...newChiffres);
data.associations.push(...newAssocs);

console.log(`\nTotaux après merge:`);
console.log(`  Calculs: ${data.calculs.length}`);
console.log(`  Chiffres: ${data.chiffres.length}`);
console.log(`  Associations: ${data.associations.length}`);

// Écrire le fichier
fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
console.log('\nassociations.json mis à jour avec succès!');
