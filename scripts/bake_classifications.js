// Script pour intégrer TOUTES les classifications (botanique + math) directement dans associations.json
// Réplique la logique de autoClassifyBotany et autoClassifyMath de AdminPanel.js
// Usage: node scripts/bake_classifications.js

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'public', 'data', 'associations.json');
const refPath = path.join(__dirname, '..', 'public', 'data', 'references', 'botanical_reference.json');

const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const ref = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
const plants = ref.plants || [];

// ===== 1. BOTANIQUE =====
// Build lookup: lowercase matchName → plant entry
const lookup = new Map();
for (const p of plants) {
  for (const mn of (p.matchNames || [])) {
    lookup.set(mn.toLowerCase(), p);
  }
}

const tMap = new Map((data.textes || []).map(t => [t.id, t]));
const iMap = new Map((data.images || []).map(i => [i.id, i]));

let botanyMatched = 0;
let botanyAlready = 0;

data.associations = data.associations.map(a => {
  if (a.calculId && a.chiffreId) return a; // skip math pairs

  const textContent = (tMap.get(a.texteId)?.content || '').toLowerCase();
  const imgUrl = (iMap.get(a.imageId)?.url || '').toLowerCase();

  // Try to match text or image filename against any plant matchName
  let matchedPlant = null;
  for (const [name, plant] of lookup) {
    if (textContent.includes(name) || imgUrl.includes(name.replace(/\s+/g, '_')) || imgUrl.includes(name.replace(/\s+/g, '-'))) {
      matchedPlant = plant;
      break;
    }
  }

  if (!matchedPlant) return a;

  const themes = (a.themes || []).slice();
  const hasDomainBotany = themes.includes('domain:botany');
  const existingRegions = new Set(themes.filter(t => t.startsWith('region:')).map(t => t.slice(7)));
  const plantRegions = (matchedPlant.regions || []).map(r => r.key);
  const newRegions = plantRegions.filter(rk => !existingRegions.has(rk));
  const existingCategory = themes.find(t => t.startsWith('category:'));
  const plantCategory = matchedPlant.category || '';
  const needsCategory = plantCategory && (!existingCategory || existingCategory !== 'category:' + plantCategory);

  if (hasDomainBotany && newRegions.length === 0 && !needsCategory) {
    botanyAlready++;
    return a;
  }

  botanyMatched++;

  // Remove old 'botanique' theme if present, add domain:botany
  const updatedThemes = themes.filter(t => t !== 'botanique');
  if (!hasDomainBotany) updatedThemes.push('domain:botany');
  for (const rk of newRegions) updatedThemes.push('region:' + rk);
  // Add category tag
  if (needsCategory) {
    const idx = updatedThemes.findIndex(t => t.startsWith('category:'));
    if (idx >= 0) updatedThemes.splice(idx, 1);
    updatedThemes.push('category:' + plantCategory);
  }

  const updated = { ...a, themes: updatedThemes };

  // Apply suggested level if none set
  if (!a.levelClass && matchedPlant.suggestedLevel) {
    updated.levelClass = matchedPlant.suggestedLevel;
  }

  return updated;
});

console.log(`\n=== Botanique ===`);
console.log(`${botanyMatched} associations classifiées`);
console.log(`${botanyAlready} déjà OK`);

// ===== 2. MATH =====
const calcMap = new Map((data.calculs || []).map(c => [c.id, c]));
let mathMatched = 0;
let mathAlready = 0;

data.associations = data.associations.map(a => {
  if (!a.calculId || !a.chiffreId) return a;

  const calcContent = (calcMap.get(a.calculId)?.content || '').trim();
  if (!calcContent) return a;

  let category = null;
  const mulMatch = calcContent.match(/(\d+)\s*[×x*]\s*(\d+)/i);
  const addMatch = !mulMatch && calcContent.match(/(\d+)\s*[+]\s*(\d+)/);
  const subMatch = !mulMatch && !addMatch && calcContent.match(/(\d+)\s*[−\-]\s*(\d+)/);

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

  if (hasDomain && hasCategory) { mathAlready++; return a; }

  mathMatched++;
  const updated = themes.filter(t => t !== 'multiplication' && !t.startsWith('category:'));
  if (!hasDomain) updated.push('domain:math');
  updated.push('category:' + category);
  return { ...a, themes: updated };
});

// Also fix calculs and chiffres tags
let calcFixed = 0;
data.calculs = (data.calculs || []).map(c => {
  const content = (c.content || '').trim();
  const themes = (c.themes || []).slice();
  let category = null;
  const mulMatch = content.match(/(\d+)\s*[×x*]\s*(\d+)/i);
  const addMatch = !mulMatch && content.match(/(\d+)\s*[+]\s*(\d+)/);
  const subMatch = !mulMatch && !addMatch && content.match(/(\d+)\s*[−\-]\s*(\d+)/);
  if (mulMatch) { category = `table_${parseInt(mulMatch[1], 10)}`; }
  else if (addMatch) { category = 'addition'; }
  else if (subMatch) { category = 'soustraction'; }
  if (!category) return c;
  const hasDomain = themes.includes('domain:math');
  const hasCategory = themes.some(t => t === 'category:' + category);
  if (hasDomain && hasCategory) return c;
  calcFixed++;
  const updated = themes.filter(t => t !== 'multiplication' && !t.startsWith('category:'));
  if (!hasDomain) updated.push('domain:math');
  updated.push('category:' + category);
  return { ...c, themes: updated };
});

console.log(`\n=== Math ===`);
console.log(`${mathMatched} associations classifiées`);
console.log(`${mathAlready} déjà OK`);
console.log(`${calcFixed} calculs fixés`);

// ===== 3. Bump version =====
data._dataVersion = (data._dataVersion || 0) + 1;
console.log(`\n_dataVersion: ${data._dataVersion}`);

// ===== 4. Verification =====
console.log(`\n=== Vérification finale ===`);
const stats = { domains: {}, categories: {}, levels: {} };
(data.associations || []).forEach(a => {
  const dom = (a.themes || []).find(t => t.startsWith('domain:')) || 'none';
  const cat = (a.themes || []).find(t => t.startsWith('category:')) || 'none';
  const lv = a.levelClass || 'none';
  stats.domains[dom] = (stats.domains[dom] || 0) + 1;
  stats.categories[cat] = (stats.categories[cat] || 0) + 1;
  stats.levels[lv] = (stats.levels[lv] || 0) + 1;
});
console.log('Domaines:', stats.domains);
console.log('Catégories:', stats.categories);
console.log('Niveaux:', stats.levels);

// ===== 5. Sauvegarder =====
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
console.log('\nassociations.json mis à jour!');
