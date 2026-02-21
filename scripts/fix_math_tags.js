// Script pour:
// 1. Ajouter _dataVersion au JSON
// 2. Corriger les tags de TOUTES les entrées math (associations, calculs, chiffres)
// 3. Vérifier la complétude des tables
// Usage: node scripts/fix_math_tags.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'data', 'associations.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

// ===== 1. Ajouter _dataVersion =====
data._dataVersion = 2;

// ===== 2. Construire un index calcul → contenu =====
const calcMap = new Map(data.calculs.map(c => [c.id, c.content]));

// ===== 3. Fixer les tags de TOUTES les associations math =====
let fixed = 0;
let alreadyOk = 0;

data.associations = data.associations.map(a => {
  if (!a.calculId || !a.chiffreId) return a;
  
  const content = (calcMap.get(a.calculId) || '').trim();
  if (!content) return a;
  
  // Detect operation
  let category = null;
  const mulMatch = content.match(/(\d+)\s*[×x*]\s*(\d+)/i);
  const addMatch = !mulMatch && content.match(/(\d+)\s*[+]\s*(\d+)/);
  const subMatch = !mulMatch && !addMatch && content.match(/(\d+)\s*[−\-]\s*(\d+)/);
  
  if (mulMatch) {
    const firstOp = parseInt(mulMatch[1], 10);
    category = `table_${firstOp}`;
  } else if (addMatch) {
    category = 'addition';
  } else if (subMatch) {
    category = 'soustraction';
  }
  
  if (!category) return a;
  
  const themes = (a.themes || []).slice();
  const hasDomain = themes.includes('domain:math');
  const hasCategory = themes.some(t => t === 'category:' + category);
  
  if (hasDomain && hasCategory) { alreadyOk++; return a; }
  
  fixed++;
  // Remove old tags
  const updated = themes.filter(t => t !== 'multiplication' && !t.startsWith('category:'));
  if (!hasDomain) updated.push('domain:math');
  updated.push('category:' + category);
  return { ...a, themes: updated };
});

// ===== 4. Fixer aussi les tags des calculs et chiffres =====
let fixedCalc = 0;
data.calculs = data.calculs.map(c => {
  const content = (c.content || '').trim();
  const themes = (c.themes || []).slice();
  
  let category = null;
  const mulMatch = content.match(/(\d+)\s*[×x*]\s*(\d+)/i);
  const addMatch = !mulMatch && content.match(/(\d+)\s*[+]\s*(\d+)/);
  const subMatch = !mulMatch && !addMatch && content.match(/(\d+)\s*[−\-]\s*(\d+)/);
  
  if (mulMatch) {
    const firstOp = parseInt(mulMatch[1], 10);
    category = `table_${firstOp}`;
  } else if (addMatch) {
    category = 'addition';
  } else if (subMatch) {
    category = 'soustraction';
  }
  
  if (!category) return c;
  
  const hasDomain = themes.includes('domain:math');
  const hasCategory = themes.some(t => t === 'category:' + category);
  if (hasDomain && hasCategory) return c;
  
  fixedCalc++;
  const updated = themes.filter(t => t !== 'multiplication' && !t.startsWith('category:'));
  if (!hasDomain) updated.push('domain:math');
  updated.push('category:' + category);
  return { ...c, themes: updated };
});

// ===== 5. Vérifier complétude des tables =====
console.log('\n=== Complétude des tables ===');
const tableEntries = {};
data.associations.forEach(a => {
  if (!a.calculId) return;
  const content = calcMap.get(a.calculId) || '';
  const m = content.match(/(\d+)\s*[×x*]\s*(\d+)/i);
  if (!m) return;
  const A = parseInt(m[1], 10);
  const B = parseInt(m[2], 10);
  const table = A; // Premier opérande = numéro de table
  const factor = B;
  if (!tableEntries[table]) tableEntries[table] = new Set();
  tableEntries[table].add(factor);
});

for (let t = 2; t <= 12; t++) {
  const entries = tableEntries[t] || new Set();
  const expected = [];
  for (let n = 1; n <= 10; n++) expected.push(n);
  const missing = expected.filter(n => !entries.has(n) && !entries.has(n)); // n >= t check
  console.log(`Table ${t}: ${entries.size} entrées (facteurs: ${[...entries].sort((a,b)=>a-b).join(',')})`);
  if (missing.length > 0) console.log(`  ⚠️ Facteurs manquants: ${missing.join(', ')}`);
}

console.log(`\n=== Résultat ===`);
console.log(`Associations fixées: ${fixed} (déjà OK: ${alreadyOk})`);
console.log(`Calculs fixés: ${fixedCalc}`);
console.log(`_dataVersion: ${data._dataVersion}`);

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
console.log('\nassociations.json mis à jour!');
