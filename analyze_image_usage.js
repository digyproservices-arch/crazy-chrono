// Script pour analyser l'utilisation des images dans les logs complets
const fs = require('fs');

// Lire le fichier de logs
const logsContent = `[PASTE YOUR LOGS HERE]`;

// Extraire toutes les occurrences d'images dans les zones assignées
const imageRegex = /"content":"(images\/[^"]+\.jpeg)"/g;
const matches = [...logsContent.matchAll(imageRegex)];

// Compter les occurrences
const imageCount = {};
matches.forEach(match => {
  const imagePath = match[1];
  imageCount[imagePath] = (imageCount[imagePath] || 0) + 1;
});

// Trier par nombre d'utilisations (décroissant)
const sorted = Object.entries(imageCount).sort((a, b) => b[1] - a[1]);

// Afficher les résultats
console.log('=== ANALYSE DES IMAGES UTILISÉES ===\n');
console.log(`Total d'images différentes: ${sorted.length}`);
console.log(`Total d'utilisations: ${matches.length}\n`);

console.log('Images par nombre d\'utilisations:\n');
sorted.forEach(([image, count]) => {
  const imageName = image.replace('images/', '').replace('.jpeg', '');
  console.log(`${count}x - ${imageName}`);
});

// Statistiques
if (sorted.length > 0) {
  const counts = sorted.map(([_, count]) => count);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const median = counts.length % 2 === 0 
    ? (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2
    : counts[Math.floor(counts.length / 2)];

  console.log('\n=== STATISTIQUES ===');
  console.log(`Maximum: ${max} utilisations`);
  console.log(`Minimum: ${min} utilisations`);
  console.log(`Moyenne: ${avg.toFixed(2)} utilisations`);
  console.log(`Médiane: ${median} utilisations`);
  
  // Identifier les images sur/sous-utilisées
  console.log('\n=== ANALYSE DE DISTRIBUTION ===');
  const overused = sorted.filter(([_, count]) => count > avg * 1.2);
  const underused = sorted.filter(([_, count]) => count < avg * 0.8);
  
  if (overused.length > 0) {
    console.log(`\nImages SURUTILISÉES (>${(avg * 1.2).toFixed(1)} utilisations):`);
    overused.forEach(([image, count]) => {
      const imageName = image.replace('images/', '').replace('.jpeg', '');
      console.log(`  - ${imageName}: ${count}x`);
    });
  }
  
  if (underused.length > 0) {
    console.log(`\nImages SOUS-UTILISÉES (<${(avg * 0.8).toFixed(1)} utilisations):`);
    underused.forEach(([image, count]) => {
      const imageName = image.replace('images/', '').replace('.jpeg', '');
      console.log(`  - ${imageName}: ${count}x`);
    });
  }
}
