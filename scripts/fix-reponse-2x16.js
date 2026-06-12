/**
 * Correction pédagogique (validée) : "2 × 1/6" → "1/3" au lieu de "0,333333"
 * (réponse générée tronquée — 1/3 est un décimal illimité, l'affichage 0,333333
 * était inexact et hors programme CM2 ; "1/3" est exact et dans l'esprit
 * de la catégorie Fractions du rectorat).
 * Modifie server/data + public/data, met à jour la stratégie, bump _dataVersion.
 */
const fs = require('fs');
const path = require('path');

const CHIFFRE_ID = 'ncmult_1772259541773_81'; // "0,333333"
const CALC_ID = 'cmult_1772259541773_81';     // "2 × 1/6"
const NEW_ANSWER = '1/3';

for (const base of ['server/data', 'public/data']) {
  const assocPath = path.join(__dirname, '..', base, 'associations.json');
  const j = JSON.parse(fs.readFileSync(assocPath, 'utf8'));
  let touched = false;
  for (const key of Object.keys(j)) {
    if (!Array.isArray(j[key])) continue;
    for (const e of j[key]) {
      if (e && e.id === CHIFFRE_ID) {
        console.log(`${base}/associations.json: "${e.content}" -> "${NEW_ANSWER}"`);
        e.content = NEW_ANSWER;
        touched = true;
      }
    }
  }
  if (touched && typeof j._dataVersion === 'number') {
    j._dataVersion += 1;
    console.log(`${base}/associations.json: _dataVersion -> ${j._dataVersion}`);
  }
  if (touched) fs.writeFileSync(assocPath, JSON.stringify(j, null, 2) + '\n', 'utf8');

  const lsPath = path.join(__dirname, '..', base, 'learn-strategies.json');
  if (fs.existsSync(lsPath)) {
    const raw = fs.readFileSync(lsPath, 'utf8');
    const ls = JSON.parse(raw);
    let lsTouched = false;
    const scrub = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      const entry = obj[CALC_ID];
      if (entry && typeof entry === 'object') {
        if (typeof entry.strategy === 'string' && entry.strategy.includes('0,333333')) {
          entry.strategy = '2 × 1/6 = 2/6 = 1/3. Deux fois un sixième, c\u2019est deux sixièmes, et 2/6 se simplifie en 1/3.';
          lsTouched = true;
        }
        if (typeof entry.hint === 'string' && entry.hint.includes('0,333333')) {
          entry.hint = 'Le résultat est 1/3.';
          lsTouched = true;
        }
      }
      for (const v of Object.values(obj)) { if (v && typeof v === 'object' && !Array.isArray(v)) scrub(v); }
    };
    scrub(ls);
    if (lsTouched) {
      fs.writeFileSync(lsPath, JSON.stringify(ls, null, 2) + '\n', 'utf8');
      console.log(`${base}/learn-strategies.json: stratégie et indice mis à jour`);
    }
  }
}
console.log('Terminé.');
