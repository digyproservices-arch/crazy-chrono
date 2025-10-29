// Analyse complète des 15 images botaniques
const logs = `2025-10-28T15:33:27.027Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"35"},{"id":1752569687819,"type":"chiffre","content":"14"},{"id":1752569809115,"type":"chiffre","content":"28"},{"id":1752569975013,"type":"chiffre","content":"8"},{"id":1752570164541,"type":"texte","content":"FARINE CHAUD"},{"id":1752570391219,"type":"texte","content":"Curcuma"},{"id":1752570607347,"type":"texte","content":"Gingembre"},{"id":1752570866370,"type":"texte","content":"Malnommée","pairId":"assoc-img-i1754579810850ah7e-txt-t27"},{"id":1752571224092,"type":"image","content":"images/cerise-peyi.jpeg"},{"id":1752571493404,"type":"image","content":"images/malnommee.jpeg","label":"Malnommée","pairId":"assoc-img-i1754579810850ah7e-txt-t27"},{"id":1752571661490,"type":"image","content":"images/fruit-a-pain.jpeg"},{"id":1752571830304,"type":"image","content":"images/melisse.jpeg"}]]}
2025-10-28T15:33:40.976Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"25"},{"id":1752569687819,"type":"chiffre","content":"28"},{"id":1752569809115,"type":"chiffre","content":"18"},{"id":1752569975013,"type":"chiffre","content":"30","pairId":"assoc-calc-c1754621357628_19-num-n1754621357628_19"},{"id":1752570164541,"type":"texte","content":"FARINE CHAUD"},{"id":1752570391219,"type":"texte","content":"Consoude"},{"id":1752570607347,"type":"texte","content":"Curcuma"},{"id":1752570866370,"type":"texte","content":"Grenn anba fey"},{"id":1752571224092,"type":"image","content":"images/malnommee.jpeg"},{"id":1752571493404,"type":"image","content":"images/aloe-vera.jpeg"},{"id":1752571661490,"type":"image","content":"images/gingembre.jpeg"},{"id":1752571830304,"type":"image","content":"images/orthosiphon.jpeg"}]]}
2025-10-28T15:33:41.988Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"42"},{"id":1752569687819,"type":"chiffre","content":"36"},{"id":1752569809115,"type":"chiffre","content":"12"},{"id":1752569975013,"type":"chiffre","content":"30"},{"id":1752570164541,"type":"texte","content":"Curcuma","pairId":"assoc-img-i17545798108509dt9-txt-t22"},{"id":1752570391219,"type":"texte","content":"Paroka"},{"id":1752570607347,"type":"texte","content":"Atoumo"},{"id":1752570866370,"type":"texte","content":"Aloé Vera"},{"id":1752571224092,"type":"image","content":"images/curcuma.jpeg","pairId":"assoc-img-i17545798108509dt9-txt-t22","label":"Curcuma"},{"id":1752571493404,"type":"image","content":"images/fruit-a-pain.jpeg"},{"id":1752571661490,"type":"image","content":"images/gingembre.jpeg"},{"id":1752571830304,"type":"image","content":"images/melisse.jpeg"}]]}
2025-10-28T15:37:44.616Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"10"},{"id":1752569687819,"type":"chiffre","content":"8"},{"id":1752569809115,"type":"chiffre","content":"35"},{"id":1752569975013,"type":"chiffre","content":"18"},{"id":1752570164541,"type":"texte","content":"Cannelle"},{"id":1752570391219,"type":"texte","content":"Fruit à Pain"},{"id":1752570607347,"type":"texte","content":"Mélisse"},{"id":1752570866370,"type":"texte","content":"Paroka"},{"id":1752571224092,"type":"image","content":"images/malnommee.jpeg"},{"id":1752571493404,"type":"image","content":"images/farine-chaud.jpeg"},{"id":1752571661490,"type":"image","content":"images/aloe-vera.jpeg"},{"id":1752571830304,"type":"image","content":"images/gingembre.jpeg"}]]}
2025-10-28T15:37:49.681Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"15"},{"id":1752569687819,"type":"chiffre","content":"12"},{"id":1752569809115,"type":"chiffre","content":"42"},{"id":1752569975013,"type":"chiffre","content":"28"},{"id":1752570164541,"type":"texte","content":"Grenn anba fey","pairId":"assoc-img-i17545798108507u7h-txt-t23"},{"id":1752570391219,"type":"texte","content":"Orthosiphon"},{"id":1752570607347,"type":"texte","content":"Atoumo"},{"id":1752570866370,"type":"texte","content":"FARINE CHAUD"},{"id":1752571224092,"type":"image","content":"images/cerise-peyi.jpeg"},{"id":1752571493404,"type":"image","content":"images/fruit-a-pain.jpeg"},{"id":1752571661490,"type":"image","content":"images/grenn-anba-fey.jpeg","pairId":"assoc-img-i17545798108507u7h-txt-t23","label":"Grenn anba fey"},{"id":1752571830304,"type":"image","content":"images/melisse.jpeg"}]]}
2025-10-28T15:37:52.283Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"15"},{"id":1752569687819,"type":"chiffre","content":"12"},{"id":1752569809115,"type":"chiffre","content":"18"},{"id":1752569975013,"type":"chiffre","content":"30"},{"id":1752570164541,"type":"texte","content":"Romarin"},{"id":1752570391219,"type":"texte","content":"Orthosiphon","pairId":"assoc-img-i1754579810850f3d6-txt-t6"},{"id":1752570607347,"type":"texte","content":"Atoumo"},{"id":1752570866370,"type":"texte","content":"Curcuma"},{"id":1752571224092,"type":"image","content":"images/cerise-peyi.jpeg"},{"id":1752571493404,"type":"image","content":"images/malnommee.jpeg"},{"id":1752571661490,"type":"image","content":"images/farine-chaud.jpeg"},{"id":1752571830304,"type":"image","content":"images/orthosiphon.jpeg","pairId":"assoc-img-i1754579810850f3d6-txt-t6","label":"Orthosiphon"}]]}`;

// Liste complète des 15 images botaniques disponibles
const allBotanicalImages = [
  'aloe-vera',
  'cerise-peyi',
  'farine-chaud',
  'fruit-a-pain',
  'grenn-anba-fey',
  'gwo-ten',
  'herbe-charpentier',
  'patate-chandelier',
  'patate-douce',
  'pois-d-angole',
  'pomme-malaka',
  'pomme-surette',
  'simen-kontra',
  'soulier-zombie',
  'ti-poul-bwa'
];

// Extraire toutes les images utilisées dans les logs
const imageMatches = logs.match(/"content":"images\/[^"]+\.jpeg"/g);
const imageCount = {};

// Initialiser tous les compteurs à 0
allBotanicalImages.forEach(img => {
  imageCount[img] = 0;
});

// Compter les utilisations réelles
if (imageMatches) {
  imageMatches.forEach(match => {
    const fullPath = match.match(/"content":"images\/([^"]+)\.jpeg"/)[1];
    if (imageCount.hasOwnProperty(fullPath)) {
      imageCount[fullPath]++;
    }
  });
}

// Trier par utilisation (décroissant)
const sorted = Object.entries(imageCount).sort((a, b) => b[1] - a[1]);

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   ANALYSE COMPLÈTE - THÈME BOTANIQUE (15 IMAGES)          ║');
console.log('║   Échantillon: 6 manches jouées                            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log(`📊 Total d'images disponibles: ${allBotanicalImages.length}`);
console.log(`📊 Total d'utilisations: ${imageMatches ? imageMatches.length : 0}\n`);

// Séparer en catégories
const used = sorted.filter(([_, count]) => count > 0);
const unused = sorted.filter(([_, count]) => count === 0);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('✅ IMAGES UTILISÉES (' + used.length + '/15):\n');
used.forEach(([image, count]) => {
  const bar = '█'.repeat(count);
  const spaces = ' '.repeat(Math.max(0, 25 - image.length));
  console.log(`  ${count}x ${bar} ${image}${spaces}`);
});

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('❌ IMAGES JAMAIS UTILISÉES (' + unused.length + '/15):\n');
unused.forEach(([image, _]) => {
  console.log(`  0x   ${image}`);
});

// Stats sur les images utilisées
if (used.length > 0) {
  const counts = used.map(([_, c]) => c);
  const max = Math.max(...counts);
  const min = Math.min(...counts.filter(c => c > 0));
  const avg = counts.reduce((a, b) => a + b, 0) / used.length;
  const totalUsages = counts.reduce((a, b) => a + b, 0);
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  console.log('📈 STATISTIQUES (images utilisées uniquement):\n');
  console.log(`  Maximum:        ${max} utilisations`);
  console.log(`  Minimum:        ${min} utilisations`);
  console.log(`  Moyenne:        ${avg.toFixed(2)} utilisations`);
  console.log(`  Écart-type:     ${Math.sqrt(counts.map(c => Math.pow(c - avg, 2)).reduce((a,b) => a+b, 0) / counts.length).toFixed(2)}`);
  console.log(`  Taux d'usage:   ${((used.length / allBotanicalImages.length) * 100).toFixed(1)}% des images disponibles`);
  
  // Identifier les images sur/sous-utilisées
  const threshold = 0.20;
  const overused = used.filter(([_, c]) => c > avg * (1 + threshold));
  const underused = used.filter(([_, c]) => c > 0 && c < avg * (1 - threshold));
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  console.log('⚠️  DÉSÉQUILIBRES DÉTECTÉS:\n');
  
  if (overused.length > 0) {
    console.log(`  🔴 Sur-utilisées (>${(threshold*100).toFixed(0)}% au-dessus de la moyenne):`);
    overused.forEach(([img, count]) => {
      const percent = ((count - avg) / avg * 100).toFixed(0);
      console.log(`     • ${img}: ${count}x (+${percent}%)`);
    });
  }
  
  if (underused.length > 0) {
    console.log(`\n  🟡 Sous-utilisées (<${(threshold*100).toFixed(0)}% en-dessous de la moyenne):`);
    underused.forEach(([img, count]) => {
      const percent = ((avg - count) / avg * 100).toFixed(0);
      console.log(`     • ${img}: ${count}x (-${percent}%)`);
    });
  }
  
  if (unused.length > 0) {
    console.log(`\n  ⚫ Jamais utilisées (${unused.length} images):`);
    unused.forEach(([img, _]) => {
      console.log(`     • ${img}`);
    });
  }
}

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('💡 RECOMMANDATIONS:\n');
if (unused.length > 0) {
  console.log(`  • ${unused.length} images (${((unused.length/allBotanicalImages.length)*100).toFixed(0)}%) ne sont JAMAIS utilisées`);
  console.log(`  • Vérifier que ces images sont bien incluses dans le pool de sélection`);
}
if (used.length < allBotanicalImages.length) {
  console.log(`  • Augmenter le nombre de manches pour mieux évaluer la distribution`);
}
console.log('\n═══════════════════════════════════════════════════════════\n');
