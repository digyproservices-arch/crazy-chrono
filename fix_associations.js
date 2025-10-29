const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'data', 'associations.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Mapping des textes manquants avec leurs IDs et images correspondantes
const missingMappings = [
  { textId: 't7', textContent: 'Patate Chandelier', imageId: 'i1754579810850yj17', level: 'CM1' },
  { textId: 't8', textContent: 'Soulier zombie', imageId: 'i1754579810850upfg', level: 'CM1' },
  // Créer de nouveaux textes pour les autres
  { textContent: 'Pomme Surette', imageId: 'i12', level: 'CP' },
  { textContent: "Pois d'Angole", imageId: 'i1754579810850k1r7', level: 'CE1' },
  { textContent: 'Patate Douce', imageId: 'i17545798108509av3', level: 'CE1' },
  { textContent: 'Pomme Malaka', imageId: 'i1754579810850pucr', level: 'CP' },
  { textContent: 'Herbe Charpentier', imageId: 'i1754579810850p76v', level: 'CM1' },
  { textContent: 'Gwo Ten', imageId: 'i1754579810850bq7v', level: 'CM1' },
  { textContent: 'Simen Kontra', imageId: 'i1754579810850tdtf', level: 'CM1' },
  { textContent: 'Ti Poul Bwa', imageId: 'i1754579810850ya9j', level: 'CM1' }
];

// 1. Ajouter le thème botanique aux textes existants
data.textes.forEach(t => {
  if (t.id === 't7' || t.id === 't8') {
    if (!t.themes) t.themes = [];
    if (!t.themes.includes('botanique')) t.themes.push('botanique');
    if (!t.levelClass) {
      t.levelClass = missingMappings.find(m => m.textId === t.id)?.level || 'CM1';
    }
  }
});

// 2. Créer les nouveaux textes manquants
let nextTextId = Date.now();
missingMappings.forEach(mapping => {
  if (!mapping.textId) {
    // Vérifier si le texte existe déjà
    const existing = data.textes.find(t => t.content === mapping.textContent);
    if (!existing) {
      const newText = {
        id: `t${nextTextId++}`,
        content: mapping.textContent,
        themes: ['botanique'],
        levelClass: mapping.level
      };
      data.textes.push(newText);
      mapping.textId = newText.id;
    } else {
      mapping.textId = existing.id;
      // Ajouter le thème si manquant
      if (!existing.themes) existing.themes = [];
      if (!existing.themes.includes('botanique')) existing.themes.push('botanique');
      if (!existing.levelClass) existing.levelClass = mapping.level;
    }
  }
});

// 3. Créer les associations manquantes
missingMappings.forEach(mapping => {
  const existingAssoc = data.associations.find(a => 
    a.imageId === mapping.imageId && a.texteId === mapping.textId
  );
  
  if (!existingAssoc) {
    data.associations.push({
      texteId: mapping.textId,
      imageId: mapping.imageId,
      levelClass: mapping.level,
      themes: ['botanique']
    });
  }
});

// Sauvegarder
fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

console.log('✅ Corrections appliquées:');
console.log(`   - Textes botaniques: ${data.textes.filter(t => (t.themes||[]).includes('botanique')).length}`);
console.log(`   - Associations image-texte botaniques: ${data.associations.filter(a => a.texteId && a.imageId && (a.themes||[]).includes('botanique')).length}`);
