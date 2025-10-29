// Analyse des images botaniques dans associations.json
const fs = require('fs');
const path = require('path');

const assocPath = path.join(__dirname, 'public', 'data', 'associations.json');
const data = JSON.parse(fs.readFileSync(assocPath, 'utf8'));

// Extraire toutes les images avec thème "botanique"
const botanicalImages = (data.images || []).filter(img => {
  const themes = img.themes || [];
  return themes.includes('botanique');
});

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   ANALYSE DE LA CONFIGURATION - THÈME BOTANIQUE           ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log(`📋 Total d'images avec thème "botanique": ${botanicalImages.length}\n`);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('✅ IMAGES CONFIGURÉES AVEC THÈME "BOTANIQUE":\n');

const byLevel = {};
botanicalImages.forEach(img => {
  const level = img.levelClass || 'Non spécifié';
  if (!byLevel[level]) byLevel[level] = [];
  const filename = (img.url || '').split('/').pop().replace('.jpeg', '');
  byLevel[level].push({ id: img.id, filename, url: img.url });
});

Object.keys(byLevel).sort().forEach(level => {
  console.log(`\n  📚 Niveau: ${level} (${byLevel[level].length} images)`);
  byLevel[level].forEach(img => {
    console.log(`     • ${img.filename} (id: ${img.id})`);
  });
});

// Vérifier les 15 images physiques disponibles
const expectedBotanical = [
  'aloe-vera.jpeg',
  'cerise-peyi.jpeg',
  'farine-chaud.jpeg',
  'fruit-a-pain.jpeg',
  'grenn-anba-fey.jpeg',
  'gwo-ten.jpeg',
  'herbe-charpentier.jpeg',
  'patate-chandelier.jpeg',
  'patate-douce.jpeg',
  'pois-d-angole.jpeg',
  'pomme-malaka.jpeg',
  'pomme-surette.jpeg',
  'simen-kontra.jpeg',
  'soulier-zombie.jpeg',
  'ti-poul-bwa.jpeg'
];

const configuredFilenames = botanicalImages.map(img => (img.url || '').split('/').pop());
const missing = expectedBotanical.filter(f => !configuredFilenames.includes(f));
const extra = configuredFilenames.filter(f => !expectedBotanical.includes(f));

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('❌ IMAGES PHYSIQUES MANQUANTES DANS LA CONFIG:\n');
if (missing.length > 0) {
  missing.forEach(f => {
    console.log(`  ⚠️  ${f.replace('.jpeg', '')} - EXISTE dans /images mais PAS dans associations.json`);
  });
} else {
  console.log('  ✅ Toutes les images physiques sont configurées');
}

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('🔍 IMAGES DANS LA CONFIG MAIS PAS DANS LA LISTE ATTENDUE:\n');
if (extra.length > 0) {
  extra.forEach(f => {
    console.log(`  ℹ️  ${f.replace('.jpeg', '')}`);
  });
} else {
  console.log('  ✅ Aucune image supplémentaire');
}

// Vérifier les associations pour ces images
const botanicalImageIds = new Set(botanicalImages.map(img => img.id));
const associations = data.associations || [];
const botanicalAssociations = associations.filter(a => 
  a.imageId && botanicalImageIds.has(a.imageId)
);

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('🔗 ASSOCIATIONS CONFIGURÉES:\n');
console.log(`  Total: ${botanicalAssociations.length} associations image-texte\n`);

const assocByImage = {};
botanicalAssociations.forEach(a => {
  if (!assocByImage[a.imageId]) assocByImage[a.imageId] = [];
  const texte = (data.textes || []).find(t => t.id === a.texteId);
  assocByImage[a.imageId].push(texte?.content || a.texteId);
});

botanicalImages.forEach(img => {
  const filename = (img.url || '').split('/').pop().replace('.jpeg', '');
  const assocs = assocByImage[img.id] || [];
  if (assocs.length > 0) {
    console.log(`  ✅ ${filename}: ${assocs.length} association(s)`);
    assocs.forEach(txt => console.log(`     → "${txt}"`));
  } else {
    console.log(`  ❌ ${filename}: AUCUNE association`);
  }
});

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('💡 DIAGNOSTIC:\n');
console.log(`  • Images avec thème "botanique" dans config: ${botanicalImages.length}/15`);
console.log(`  • Images manquantes dans config: ${missing.length}`);
console.log(`  • Images avec associations: ${Object.keys(assocByImage).length}`);

if (missing.length > 0) {
  console.log('\n  🔴 PROBLÈME IDENTIFIÉ:');
  console.log(`     ${missing.length} images physiques ne sont PAS marquées avec le thème "botanique"`);
  console.log('     dans associations.json, donc elles ne peuvent JAMAIS être sélectionnées');
  console.log('     quand le filtre thématique est actif.');
}

console.log('\n═══════════════════════════════════════════════════════════\n');
