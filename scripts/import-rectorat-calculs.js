/**
 * Import des calculs du Rectorat de Guadeloupe dans associations.json
 * - 50 calculs principaux avec résultats corrects et stratégies
 * - ~150 distracteurs avec résultats corrects calculés
 * - Thème: domain:math, category:division
 */
const fs = require('fs');
const path = require('path');

const ASSOC_PATH = path.join(__dirname, '..', 'public', 'data', 'associations.json');
const DATA_PATH = path.join(__dirname, 'rectorat-data.json');
const STRAT_PATH = path.join(__dirname, '..', 'public', 'data', 'learn-strategies.json');

// Parse French number: "1,7" → 1.7, "2 400" → 2400
function parseFrNum(s) {
  if (!s) return NaN;
  let cleaned = s.toString().trim().replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

// Format number for display (French style): 1.7 → "1,7"
function formatFr(n) {
  if (Number.isInteger(n) && Math.abs(n) < 100000) return n.toString();
  let s = n.toString();
  // Keep reasonable precision
  if (s.includes('.')) {
    // Remove trailing zeros after decimal, but keep at least one if needed
    s = parseFloat(s).toString();
  }
  return s.replace('.', ',');
}

// Evaluate a calcul expression and return its correct result
function evalCalc(expr) {
  let e = expr.trim();
  
  // "la moitié de X" → X/2
  let m = e.match(/^la moiti[ée] de (.+)$/i);
  if (m) return parseFrNum(m[1]) / 2;
  
  // "le tiers de X" → X/3
  m = e.match(/^le tiers de (.+)$/i);
  if (m) return parseFrNum(m[1]) / 3;
  
  // "le quart de X" → X/4
  m = e.match(/^le quart de (.+)$/i);
  if (m) return parseFrNum(m[1]) / 4;
  
  // "le double de X" → X*2
  m = e.match(/^le double de (.+)$/i);
  if (m) return parseFrNum(m[1]) * 2;
  
  // "X ÷ Y" or "X / Y"
  m = e.match(/^(.+?)\s*[÷\/]\s*(.+)$/);
  if (m) return parseFrNum(m[1]) / parseFrNum(m[2]);
  
  // "X × Y" or "X x Y"
  m = e.match(/^(.+?)\s*[×x]\s*(.+)$/);
  if (m) return parseFrNum(m[1]) * parseFrNum(m[2]);
  
  return NaN;
}

// Round to avoid floating point issues
function roundSmart(n) {
  if (isNaN(n)) return NaN;
  // Round to 6 decimal places to avoid floating point noise
  return parseFloat(n.toFixed(6));
}

// Determine level class based on complexity
function getLevelClass(expr) {
  const e = expr.toLowerCase();
  // Simple divisions by 2,3,5 with small numbers → CE2
  // Divisions by 10,100,1000 → CM1
  // Complex divisions (÷25, ÷50, ÷80, decimals) → CM2
  if (/÷\s*0,1/.test(e)) return 'CM2';
  if (/÷\s*(25|50|70|80|40|30|20|15|12)/.test(e.replace(/\s/g, ''))) return 'CM2';
  if (/÷\s*1\s*000/.test(e) || /÷\s*1000/.test(e.replace(/\s/g, ''))) return 'CM2';
  if (/÷\s*100/.test(e.replace(/\s/g, ''))) return 'CM1';
  if (/÷\s*10/.test(e.replace(/\s/g, '')) && !/÷\s*100/.test(e.replace(/\s/g, ''))) return 'CM1';
  if (/quart/i.test(e)) return 'CM1';
  if (/0,\d/.test(e) || /\d,\d/.test(e)) return 'CM1';
  if (/moiti/i.test(e) || /tiers/i.test(e) || /double/i.test(e)) return 'CE2';
  if (/÷\s*[2-9]/.test(e.replace(/\s/g, ''))) return 'CE2';
  return 'CM1';
}

// Normalize expression for display in game (clean up spacing)
function normalizeExpr(expr) {
  let e = expr.trim();
  // Normalize spaces around ÷
  e = e.replace(/\s*÷\s*/g, ' ÷ ');
  // Capitalize first letter for French expressions
  if (/^(la |le |l')/.test(e)) {
    // keep lowercase for these
  }
  return e;
}

// ========== MAIN ==========
const assocData = JSON.parse(fs.readFileSync(ASSOC_PATH, 'utf8'));
const rectoratData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

let existingStrategies = {};
try {
  existingStrategies = JSON.parse(fs.readFileSync(STRAT_PATH, 'utf8'));
} catch (e) {
  console.log('No existing strategies file, creating fresh.');
}

const timestamp = Date.now();
const prefix = `cdiv_${timestamp}`;
let calcCounter = 0;
let newCalculs = [];
let newChiffres = [];
let newAssociations = [];
let newStrategies = {};

// Track all expressions we add to avoid duplicates
const addedExpressions = new Set();
// Also check existing calculs
const existingCalcContents = new Set(assocData.calculs.map(c => c.content.toLowerCase().trim()));

function addCalcEntry(expr, correctResult, levelClass, isMain, strategy) {
  const normExpr = normalizeExpr(expr);
  const lowerExpr = normExpr.toLowerCase().trim();
  
  // Skip if already exists in game or already added
  if (existingCalcContents.has(lowerExpr) || addedExpressions.has(lowerExpr)) {
    // Still add strategy if main
    if (isMain && strategy) {
      // Find existing calcul ID
      const existing = assocData.calculs.find(c => c.content.toLowerCase().trim() === lowerExpr);
      if (existing) {
        newStrategies[existing.id] = {
          title: normExpr,
          strategy: strategy,
          hint: `Le résultat est ${formatFr(correctResult)}.`
        };
      }
    }
    return null;
  }
  
  addedExpressions.add(lowerExpr);
  
  const idx = calcCounter++;
  const calcId = `${prefix}_${idx}`;
  const chiffreId = `n${prefix}_${idx}`;
  const resultStr = formatFr(correctResult);
  
  const themes = ['domain:math', 'category:division'];
  
  newCalculs.push({
    id: calcId,
    content: normExpr,
    levelClass: levelClass,
    themes: themes
  });
  
  newChiffres.push({
    id: chiffreId,
    content: resultStr,
    themes: themes,
    levelClass: levelClass
  });
  
  newAssociations.push({
    calculId: calcId,
    chiffreId: chiffreId,
    levelClass: levelClass,
    themes: themes
  });
  
  if (isMain && strategy) {
    newStrategies[calcId] = {
      title: normExpr,
      strategy: strategy,
      hint: `Le résultat est ${resultStr}.`
    };
  }
  
  return { calcId, chiffreId, resultStr };
}

console.log(`Processing ${rectoratData.length} groups...`);

let mainCount = 0;
let distractorCount = 0;
let skipCount = 0;

for (const group of rectoratData) {
  const { main, distractors, strategy } = group;
  
  // Process main calcul
  const mainResult = parseFrNum(main.result);
  const mainLevel = getLevelClass(main.calc);
  
  if (!isNaN(mainResult)) {
    const entry = addCalcEntry(main.calc, mainResult, mainLevel, true, strategy);
    if (entry) mainCount++;
    else skipCount++;
  } else {
    console.warn(`  ⚠ Cannot parse main result: ${main.calc} = ${main.result}`);
  }
  
  // Process distractors - compute their CORRECT results
  for (const d of distractors) {
    const correctResult = roundSmart(evalCalc(d.calc));
    const level = getLevelClass(d.calc);
    
    if (!isNaN(correctResult)) {
      const entry = addCalcEntry(d.calc, correctResult, level, false, null);
      if (entry) distractorCount++;
      else skipCount++;
    } else {
      console.warn(`  ⚠ Cannot evaluate distractor: ${d.calc}`);
    }
  }
}

// Merge into associations.json
assocData.calculs.push(...newCalculs);
assocData.chiffres.push(...newChiffres);
assocData.associations.push(...newAssociations);

// Write associations.json
fs.writeFileSync(ASSOC_PATH, JSON.stringify(assocData, null, 2), 'utf8');

// Merge strategies
const mergedStrategies = { ...existingStrategies, ...newStrategies };
fs.writeFileSync(STRAT_PATH, JSON.stringify(mergedStrategies, null, 2), 'utf8');

console.log(`\n=== RÉSULTATS ===`);
console.log(`Calculs principaux ajoutés: ${mainCount}`);
console.log(`Distracteurs ajoutés (avec résultats corrects): ${distractorCount}`);
console.log(`Doublons ignorés: ${skipCount}`);
console.log(`Total nouvelles entrées: ${mainCount + distractorCount}`);
console.log(`\nTotal calculs dans le jeu: ${assocData.calculs.length}`);
console.log(`Total chiffres dans le jeu: ${assocData.chiffres.length}`);
console.log(`Total associations dans le jeu: ${assocData.associations.length}`);
console.log(`Total stratégies: ${Object.keys(mergedStrategies).length}`);
console.log(`\nFichiers mis à jour:`);
console.log(`  - ${ASSOC_PATH}`);
console.log(`  - ${STRAT_PATH}`);
