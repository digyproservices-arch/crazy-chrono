const a = require('../public/data/associations.json');
const s = require('../public/data/learn-strategies.json').strategies;

let count = 0;
for (const assoc of a.associations) {
  const key = assoc.calculId || (assoc.texteId + ':' + assoc.imageId);
  if (s[key]) count++;
}
console.log('Total slides avec strategie:', count);

const cats = {};
for (const assoc of a.associations) {
  const key = assoc.calculId || (assoc.texteId + ':' + assoc.imageId);
  if (!s[key]) continue;
  (assoc.themes || []).forEach(function(t) {
    cats[t] = (cats[t] || 0) + 1;
  });
}
console.log('\nPar categorie:');
Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; }).forEach(function(e) {
  console.log('  ' + e[0] + ': ' + e[1]);
});
