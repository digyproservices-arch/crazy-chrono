// Analyse rapide des images depuis les logs fournis
const logs = `2025-10-28T15:33:27.027Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"35"},{"id":1752569687819,"type":"chiffre","content":"14"},{"id":1752569809115,"type":"chiffre","content":"28"},{"id":1752569975013,"type":"chiffre","content":"8"},{"id":1752570164541,"type":"texte","content":"FARINE CHAUD"},{"id":1752570391219,"type":"texte","content":"Curcuma"},{"id":1752570607347,"type":"texte","content":"Gingembre"},{"id":1752570866370,"type":"texte","content":"Malnommée","pairId":"assoc-img-i1754579810850ah7e-txt-t27"},{"id":1752571224092,"type":"image","content":"images/cerise-peyi.jpeg"},{"id":1752571493404,"type":"image","content":"images/malnommee.jpeg","label":"Malnommée","pairId":"assoc-img-i1754579810850ah7e-txt-t27"},{"id":1752571661490,"type":"image","content":"images/fruit-a-pain.jpeg"},{"id":1752571830304,"type":"image","content":"images/melisse.jpeg"}]]}
2025-10-28T15:33:40.976Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"25"},{"id":1752569687819,"type":"chiffre","content":"28"},{"id":1752569809115,"type":"chiffre","content":"18"},{"id":1752569975013,"type":"chiffre","content":"30","pairId":"assoc-calc-c1754621357628_19-num-n1754621357628_19"},{"id":1752570164541,"type":"texte","content":"FARINE CHAUD"},{"id":1752570391219,"type":"texte","content":"Consoude"},{"id":1752570607347,"type":"texte","content":"Curcuma"},{"id":1752570866370,"type":"texte","content":"Grenn anba fey"},{"id":1752571224092,"type":"image","content":"images/malnommee.jpeg"},{"id":1752571493404,"type":"image","content":"images/aloe-vera.jpeg"},{"id":1752571661490,"type":"image","content":"images/gingembre.jpeg"},{"id":1752571830304,"type":"image","content":"images/orthosiphon.jpeg"}]]}
2025-10-28T15:33:41.988Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"42"},{"id":1752569687819,"type":"chiffre","content":"36"},{"id":1752569809115,"type":"chiffre","content":"12"},{"id":1752569975013,"type":"chiffre","content":"30"},{"id":1752570164541,"type":"texte","content":"Curcuma","pairId":"assoc-img-i17545798108509dt9-txt-t22"},{"id":1752570391219,"type":"texte","content":"Paroka"},{"id":1752570607347,"type":"texte","content":"Atoumo"},{"id":1752570866370,"type":"texte","content":"Aloé Vera"},{"id":1752571224092,"type":"image","content":"images/curcuma.jpeg","pairId":"assoc-img-i17545798108509dt9-txt-t22","label":"Curcuma"},{"id":1752571493404,"type":"image","content":"images/fruit-a-pain.jpeg"},{"id":1752571661490,"type":"image","content":"images/gingembre.jpeg"},{"id":1752571830304,"type":"image","content":"images/melisse.jpeg"}]]}
2025-10-28T15:37:44.616Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"10"},{"id":1752569687819,"type":"chiffre","content":"8"},{"id":1752569809115,"type":"chiffre","content":"35"},{"id":1752569975013,"type":"chiffre","content":"18"},{"id":1752570164541,"type":"texte","content":"Cannelle"},{"id":1752570391219,"type":"texte","content":"Fruit à Pain"},{"id":1752570607347,"type":"texte","content":"Mélisse"},{"id":1752570866370,"type":"texte","content":"Paroka"},{"id":1752571224092,"type":"image","content":"images/malnommee.jpeg"},{"id":1752571493404,"type":"image","content":"images/farine-chaud.jpeg"},{"id":1752571661490,"type":"image","content":"images/aloe-vera.jpeg"},{"id":1752571830304,"type":"image","content":"images/gingembre.jpeg"}]]}
2025-10-28T15:37:49.681Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"15"},{"id":1752569687819,"type":"chiffre","content":"12"},{"id":1752569809115,"type":"chiffre","content":"42"},{"id":1752569975013,"type":"chiffre","content":"28"},{"id":1752570164541,"type":"texte","content":"Grenn anba fey","pairId":"assoc-img-i17545798108507u7h-txt-t23"},{"id":1752570391219,"type":"texte","content":"Orthosiphon"},{"id":1752570607347,"type":"texte","content":"Atoumo"},{"id":1752570866370,"type":"texte","content":"FARINE CHAUD"},{"id":1752571224092,"type":"image","content":"images/cerise-peyi.jpeg"},{"id":1752571493404,"type":"image","content":"images/fruit-a-pain.jpeg"},{"id":1752571661490,"type":"image","content":"images/grenn-anba-fey.jpeg","pairId":"assoc-img-i17545798108507u7h-txt-t23","label":"Grenn anba fey"},{"id":1752571830304,"type":"image","content":"images/melisse.jpeg"}]]}
2025-10-28T15:37:52.283Z | console:log | {"args":["Zones après attribution automatique (post-traitées) :",[{"id":1752568799658,"type":"chiffre","content":"15"},{"id":1752569687819,"type":"chiffre","content":"12"},{"id":1752569809115,"type":"chiffre","content":"18"},{"id":1752569975013,"type":"chiffre","content":"30"},{"id":1752570164541,"type":"texte","content":"Romarin"},{"id":1752570391219,"type":"texte","content":"Orthosiphon","pairId":"assoc-img-i1754579810850f3d6-txt-t6"},{"id":1752570607347,"type":"texte","content":"Atoumo"},{"id":1752570866370,"type":"texte","content":"Curcuma"},{"id":1752571224092,"type":"image","content":"images/cerise-peyi.jpeg"},{"id":1752571493404,"type":"image","content":"images/malnommee.jpeg"},{"id":1752571661490,"type":"image","content":"images/farine-chaud.jpeg"},{"id":1752571830304,"type":"image","content":"images/orthosiphon.jpeg","pairId":"assoc-img-i1754579810850f3d6-txt-t6","label":"Orthosiphon"}]]}`;

// Extraire toutes les images
const imageMatches = logs.match(/"content":"images\/[^"]+\.jpeg"/g);
const imageCount = {};

if (imageMatches) {
  imageMatches.forEach(match => {
    const image = match.match(/"content":"(images\/[^"]+\.jpeg)"/)[1];
    imageCount[image] = (imageCount[image] || 0) + 1;
  });
}

// Trier par utilisation
const sorted = Object.entries(imageCount).sort((a, b) => b[1] - a[1]);

console.log('=== ANALYSE DES IMAGES (6 MANCHES) ===\n');
console.log(`Total d'images différentes: ${sorted.length}`);
console.log(`Total d'utilisations: ${imageMatches ? imageMatches.length : 0}\n`);

console.log('Distribution des images:\n');
sorted.forEach(([image, count]) => {
  const name = image.replace('images/', '').replace('.jpeg', '');
  const bar = '█'.repeat(count);
  console.log(`${count}x ${bar} ${name}`);
});

// Stats
if (sorted.length > 0) {
  const counts = sorted.map(([_, c]) => c);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  
  console.log('\n=== STATISTIQUES ===');
  console.log(`Maximum: ${max} utilisations`);
  console.log(`Minimum: ${min} utilisations`);
  console.log(`Moyenne: ${avg.toFixed(2)} utilisations`);
  console.log(`Écart-type: ${Math.sqrt(counts.map(c => Math.pow(c - avg, 2)).reduce((a,b) => a+b, 0) / counts.length).toFixed(2)}`);
}
