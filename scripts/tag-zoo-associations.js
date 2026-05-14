#!/usr/bin/env node
/**
 * Tag zoology associations with category: (animal type) and region: (habitat)
 * Run: node scripts/tag-zoo-associations.js
 */
const fs = require('fs');
const path = require('path');

const ASSOC_PATH = path.join(__dirname, '..', 'public', 'data', 'associations.json');
const data = JSON.parse(fs.readFileSync(ASSOC_PATH, 'utf-8'));

// Classification by animal name → category + regions
const ANIMAL_CLASSIFICATION = {
  // ===== OISEAUX =====
  'Colibri':                { category: 'oiseau', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:guyane'] },
  'Flamant rose':           { category: 'oiseau', regions: ['region:caraibe', 'region:guadeloupe', 'region:ameriques'] },
  'Grande aigrette':        { category: 'oiseau', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:international'] },
  'Héron vert':             { category: 'oiseau', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Ibis rouge':             { category: 'oiseau', regions: ['region:caraibe', 'region:guyane', 'region:ameriques'] },
  'Moqueur gorge-rouge':    { category: 'oiseau', regions: ['region:caraibe', 'region:martinique'] },
  'Pélican brun':           { category: 'oiseau', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:ameriques'] },
  'Sucrier à ventre jaune': { category: 'oiseau', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Toucan':                 { category: 'oiseau', regions: ['region:guyane', 'region:ameriques'] },
  'Tourterelle':            { category: 'oiseau', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:international'] },

  // ===== MAMMIFÈRES =====
  'Cabri':                  { category: 'mammifere', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:international'] },
  'Dauphin':                { category: 'mammifere', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:international'] },
  'Fourmilier géant':       { category: 'mammifere', regions: ['region:guyane', 'region:ameriques'] },
  'Jaguar':                 { category: 'mammifere', regions: ['region:guyane', 'region:ameriques'] },
  'Lamantin':               { category: 'mammifere', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:guyane'] },
  'Mangouste':              { category: 'mammifere', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Manicou':                { category: 'mammifere', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:guyane'] },
  'Paresseux':              { category: 'mammifere', regions: ['region:guyane', 'region:ameriques'] },
  'Raton laveur':           { category: 'mammifere', regions: ['region:caraibe', 'region:guadeloupe', 'region:ameriques'] },
  'Tapir':                  { category: 'mammifere', regions: ['region:guyane', 'region:ameriques'] },
  'Tatou':                  { category: 'mammifere', regions: ['region:guyane', 'region:ameriques'] },

  // ===== REPTILES =====
  'Caïman':                 { category: 'reptile', regions: ['region:guyane', 'region:ameriques'] },
  'Iguane vert':            { category: 'reptile', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:guyane'] },
  'Tortue imbriquée':       { category: 'reptile', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:international'] },
  'Zandoli':                { category: 'reptile', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },

  // ===== POISSONS =====
  'Dorade coryphène':       { category: 'poisson', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:international'] },
  'Orphie':                 { category: 'poisson', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Poisson-perroquet':      { category: 'poisson', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Poisson-écureuil':       { category: 'poisson', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Vivaneau rouge':         { category: 'poisson', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Vivaneau à queue jaune': { category: 'poisson', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Raie manta':             { category: 'poisson', regions: ['region:caraibe', 'region:international'] },

  // ===== CRUSTACÉS =====
  'Bernard-l\'hermite':     { category: 'crustace', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:international'] },
  'Crabe de terre':         { category: 'crustace', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Langouste':              { category: 'crustace', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Écrevisse':              { category: 'crustace', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:guyane'] },

  // ===== CORAUX =====
  'Corail cerveau':         { category: 'corail', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Corail corne d\'élan':   { category: 'corail', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Corail tabulaire':       { category: 'corail', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },

  // ===== MOLLUSQUES & INVERTÉBRÉS MARINS =====
  'Lambi':                  { category: 'mollusque', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique'] },
  'Oursin':                 { category: 'mollusque', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:international'] },
  'Scolopendre':            { category: 'mollusque', regions: ['region:caraibe', 'region:guadeloupe', 'region:martinique', 'region:guyane'] },
};

// Build text ID → name map
const textMap = Object.fromEntries(data.textes.map(t => [t.id, t.content]));

let tagged = 0;
let notFound = [];

for (const assoc of data.associations) {
  if (!assoc.texteId || !assoc.imageId) continue;
  const themes = assoc.themes || [];
  if (!themes.includes('domain:zoology')) continue;

  const name = textMap[assoc.texteId];
  if (!name) { notFound.push(assoc.texteId); continue; }

  const classification = ANIMAL_CLASSIFICATION[name];
  if (!classification) { notFound.push(name); continue; }

  // Build new themes: keep existing + add category + regions (no duplicates)
  const newThemes = new Set(themes);
  newThemes.add(`category:${classification.category}`);
  for (const r of classification.regions) newThemes.add(r);
  assoc.themes = [...newThemes];
  tagged++;
}

// Also tag the individual textes and images with the same tags
for (const txt of data.textes) {
  const txtThemes = txt.themes || [];
  if (!txtThemes.includes('domain:zoology')) continue;
  const name = txt.content;
  const classification = ANIMAL_CLASSIFICATION[name];
  if (!classification) continue;
  const newThemes = new Set(txtThemes);
  newThemes.add(`category:${classification.category}`);
  for (const r of classification.regions) newThemes.add(r);
  txt.themes = [...newThemes];
}

for (const img of data.images) {
  const imgThemes = img.themes || [];
  if (!imgThemes.includes('domain:zoology')) continue;
  // Find matching text via associations
  const assoc = data.associations.find(a => a.imageId === img.id && a.texteId);
  if (!assoc) continue;
  const name = textMap[assoc.texteId];
  const classification = name ? ANIMAL_CLASSIFICATION[name] : null;
  if (!classification) continue;
  const newThemes = new Set(imgThemes);
  newThemes.add(`category:${classification.category}`);
  for (const r of classification.regions) newThemes.add(r);
  img.themes = [...newThemes];
}

fs.writeFileSync(ASSOC_PATH, JSON.stringify(data, null, 2), 'utf-8');

console.log(`✅ Tagged ${tagged} zoology associations`);
if (notFound.length > 0) {
  console.log(`⚠️ Not found: ${notFound.join(', ')}`);
}

// Summary by category
const summary = {};
for (const assoc of data.associations) {
  if (!(assoc.themes || []).includes('domain:zoology')) continue;
  const cat = (assoc.themes || []).find(t => t.startsWith('category:'));
  if (cat) summary[cat] = (summary[cat] || 0) + 1;
}
console.log('\nBy category:');
Object.entries(summary).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

// Summary by region
const regionSummary = {};
for (const assoc of data.associations) {
  if (!(assoc.themes || []).includes('domain:zoology')) continue;
  for (const t of (assoc.themes || []).filter(t => t.startsWith('region:'))) {
    regionSummary[t] = (regionSummary[t] || 0) + 1;
  }
}
console.log('\nBy region:');
Object.entries(regionSummary).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
