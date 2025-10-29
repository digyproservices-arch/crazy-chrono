// Analyse du biais de sélection entre les images botaniques
const fs = require('fs');
const path = require('path');

const assocPath = path.join(__dirname, 'public', 'data', 'associations.json');
const data = JSON.parse(fs.readFileSync(assocPath, 'utf8'));

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   ANALYSE DU BIAIS DE SÉLECTION                            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Extraire les images botaniques
const botanicalImages = (data.images || []).filter(img => {
  const themes = img.themes || [];
  return themes.includes('botanique');
});

// Extraire les associations
const associations = data.associations || [];
const imageAssociations = associations.filter(a => a.imageId && a.texteId);

// Compter les associations par image
const assocCountByImage = {};
botanicalImages.forEach(img => {
  const count = imageAssociations.filter(a => a.imageId === img.id).length;
  const filename = (img.url || '').split('/').pop().replace('.jpeg', '');
  assocCountByImage[filename] = {
    id: img.id,
    url: img.url,
    level: img.levelClass || 'Non spécifié',
    assocCount: count,
    themes: img.themes || []
  };
});

// Résultats des logs utilisateur
const usageFromLogs = {
  'malnommee': 4,
  'cerise-peyi': 3,
  'fruit-a-pain': 3,
  'melisse': 3,
  'gingembre': 3,
  'aloe-vera': 2,
  'orthosiphon': 2,
  'farine-chaud': 2,
  'curcuma': 1,
  'grenn-anba-fey': 1
};

console.log('═══════════════════════════════════════════════════════════\n');
console.log('📊 COMPARAISON: ASSOCIATIONS vs UTILISATION RÉELLE\n');

// Trier par utilisation réelle
const sorted = Object.entries(assocCountByImage).sort((a, b) => {
  const usageA = usageFromLogs[a[0]] || 0;
  const usageB = usageFromLogs[b[0]] || 0;
  return usageB - usageA;
});

sorted.forEach(([filename, info]) => {
  const usage = usageFromLogs[filename] || 0;
  const bar = usage > 0 ? '█'.repeat(usage) : '·';
  const assocInfo = info.assocCount > 0 ? `✓ ${info.assocCount} assoc` : '✗ 0 assoc';
  const status = usage > 0 ? '✅' : '❌';
  console.log(`${status} ${filename.padEnd(20)} ${bar.padEnd(5)} (${usage}x) | ${assocInfo} | ${info.level}`);
});

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('🔍 ANALYSE DES IMAGES NON UTILISÉES:\n');

const notUsed = sorted.filter(([filename, _]) => !usageFromLogs[filename]);
notUsed.forEach(([filename, info]) => {
  console.log(`  ❌ ${filename}`);
  console.log(`     • Niveau: ${info.level}`);
  console.log(`     • Associations: ${info.assocCount}`);
  console.log(`     • ID: ${info.id}`);
  console.log('');
});

console.log('═══════════════════════════════════════════════════════════\n');
console.log('💡 HYPOTHÈSES SUR LE BIAIS:\n');

// Vérifier si les images utilisées ont plus d'associations
const usedImages = Object.entries(usageFromLogs);
const avgAssocUsed = usedImages.reduce((sum, [name, _]) => {
  return sum + (assocCountByImage[name]?.assocCount || 0);
}, 0) / usedImages.length;

const notUsedImages = notUsed.map(([name, info]) => info);
const avgAssocNotUsed = notUsedImages.reduce((sum, info) => sum + info.assocCount, 0) / (notUsedImages.length || 1);

console.log(`  1. Nombre d'associations:`);
console.log(`     • Images utilisées: ${avgAssocUsed.toFixed(2)} associations en moyenne`);
console.log(`     • Images non utilisées: ${avgAssocNotUsed.toFixed(2)} associations en moyenne`);

// Vérifier la distribution par niveau
const levelDistribution = {};
sorted.forEach(([filename, info]) => {
  const level = info.level;
  if (!levelDistribution[level]) {
    levelDistribution[level] = { total: 0, used: 0 };
  }
  levelDistribution[level].total++;
  if (usageFromLogs[filename]) {
    levelDistribution[level].used++;
  }
});

console.log(`\n  2. Distribution par niveau de classe:`);
Object.keys(levelDistribution).sort().forEach(level => {
  const stats = levelDistribution[level];
  const percent = ((stats.used / stats.total) * 100).toFixed(0);
  console.log(`     • ${level}: ${stats.used}/${stats.total} utilisées (${percent}%)`);
});

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('🎯 CONCLUSION:\n');

if (avgAssocUsed > avgAssocNotUsed) {
  console.log('  Les images AVEC associations sont plus utilisées.');
  console.log('  → Le système privilégie les images ayant des associations définies.\n');
}

const cm1Stats = levelDistribution['CM1'];
if (cm1Stats && cm1Stats.used / cm1Stats.total > 0.5) {
  console.log('  Les images CM1 sont majoritairement utilisées.');
  console.log('  → Vérifier le niveau de classe sélectionné dans SessionConfig.\n');
}

console.log('═══════════════════════════════════════════════════════════\n');
