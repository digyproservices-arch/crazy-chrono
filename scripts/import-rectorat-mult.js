/**
 * Import des calculs multiplication/fractions/numération du Rectorat de Guadeloupe
 * 50 calculs principaux + ~150 distracteurs
 */
const fs = require('fs');
const path = require('path');

const ASSOC_PATH = path.join(__dirname, '..', 'public', 'data', 'associations.json');
const DATA_PATH = path.join(__dirname, 'rectorat-data-mult.json');
const STRAT_PATH = path.join(__dirname, '..', 'public', 'data', 'learn-strategies.json');

function parseFrNum(s) {
  if (!s) return NaN;
  let cleaned = s.toString().trim().replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

function formatFr(n) {
  if (isNaN(n)) return '?';
  if (Number.isInteger(n) && Math.abs(n) < 100000) return n.toString();
  let s = parseFloat(n.toFixed(6)).toString();
  return s.replace('.', ',');
}

// Evaluate a multiplication/fraction/numeration expression
function evalCalc(expr) {
  let e = expr.trim();

  // Fractions standalone: "3/2", "5/10", "320/100", etc.
  let m = e.match(/^(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1]) / parseInt(m[2]);

  // "X = ?/Y" → result is X*Y
  m = e.match(/^(.+?)\s*=\s*\?\s*\/\s*(.+)$/);
  if (m) return parseFrNum(m[1]) * parseFrNum(m[2]);

  // "? × Y = Z" or "? x Y = Z" → result is Z/Y
  m = e.match(/^\?\s*[×xX]\s*(.+?)\s*=\s*(.+)$/);
  if (m) return parseFrNum(m[2]) / parseFrNum(m[1]);

  // "X × ? = Z" → result is Z/X
  m = e.match(/^(.+?)\s*[×xX]\s*\?\s*=\s*(.+)$/);
  if (m) return parseFrNum(m[2]) / parseFrNum(m[1]);

  // "0,42 × ? = 42" style
  m = e.match(/^(.+?)\s*[×xX]\s*\?\s*=\s*(.+)$/);
  if (m) return parseFrNum(m[2]) / parseFrNum(m[1]);

  // "6 × ? = 24" style (with = sign)
  m = e.match(/^(.+?)\s*[×xX]\s*\?\s*=\s*(.+)$/);
  if (m) return parseFrNum(m[2]) / parseFrNum(m[1]);

  // "? × 100 = 6" style
  m = e.match(/^\?\s*[×xX]\s*(.+?)\s*=\s*(.+)$/);
  if (m) return parseFrNum(m[2]) / parseFrNum(m[1]);

  // "double de X" → 2*X
  m = e.match(/^double de (.+)$/i);
  if (m) return 2 * parseFrNum(m[1]);

  // "X dizaines" → X*10
  m = e.match(/^(.+?)\s*dizaines?$/i);
  if (m) return parseFrNum(m[1]) * 10;

  // "X dixièmes" → X*0.1
  m = e.match(/^(.+?)\s*dixi[eè]mes?$/i);
  if (m) return parseFrNum(m[1]) * 0.1;

  // "X centièmes" → X*0.01
  m = e.match(/^(.+?)\s*centi[eè]mes?$/i);
  if (m) return parseFrNum(m[1]) * 0.01;

  // "X quarts" → X*0.25
  m = e.match(/^(.+?)\s*quarts?$/i);
  if (m) return parseFrNum(m[1]) * 0.25;

  // "X fois Y/Z" → X * Y / Z
  m = e.match(/^(.+?)\s*fois\s*(\d+)\/(\d+)$/i);
  if (m) return parseFrNum(m[1]) * parseInt(m[2]) / parseInt(m[3]);

  // "X × (Y/Z)" → X * Y / Z
  m = e.match(/^(.+?)\s*[×xX]\s*\((\d+)\/(\d+)\)$/);
  if (m) return parseFrNum(m[1]) * parseInt(m[2]) / parseInt(m[3]);

  // "X × Y/Z" → X * Y / Z
  m = e.match(/^(.+?)\s*[×xX]\s*(\d+)\/(\d+)$/);
  if (m) return parseFrNum(m[1]) * parseInt(m[2]) / parseInt(m[3]);

  // "2 fois 2 centièmes" → 2 * 2 * 0.01
  m = e.match(/^(.+?)\s*fois\s*(.+?)\s*centi[eè]mes?$/i);
  if (m) return parseFrNum(m[1]) * parseFrNum(m[2]) * 0.01;

  // Triple multiplication: "X × Y × Z"
  m = e.match(/^(.+?)\s*[×xX]\s*(.+?)\s*[×xX]\s*(.+)$/);
  if (m) return parseFrNum(m[1]) * parseFrNum(m[2]) * parseFrNum(m[3]);

  // Simple multiplication: "X × Y"
  m = e.match(/^(.+?)\s*[×xX]\s*(.+)$/);
  if (m) return parseFrNum(m[1]) * parseFrNum(m[2]);

  // Just a number (standalone like "6,8")
  const num = parseFrNum(e);
  if (!isNaN(num)) return num;

  return NaN;
}

function roundSmart(n) {
  if (isNaN(n)) return NaN;
  return parseFloat(n.toFixed(6));
}

// Determine if result should be kept as-is (fraction string) or converted
function isFractionResult(result) {
  return /^\d+\/\d+$/.test(result.trim()) ||
         /^\d+\/\d+\s*\+\s*\d+\/\d+$/.test(result.trim()) ||
         /^\d+\s*\+\s*\d+\/\d+$/.test(result.trim());
}

function getLevelClass(expr) {
  const e = expr.toLowerCase();
  if (/\d\/\d/.test(e) || /quart/i.test(e)) return 'CM2';
  if (/dizaines|dixièmes|centièmes/i.test(e)) return 'CM1';
  if (/0,\d/.test(e) || /\d,\d/.test(e)) return 'CM1';
  if (/\?/.test(e)) return 'CE2';
  // Multi-digit multiplication
  if (/\d{2,}\s*[×xX]\s*\d{2,}/.test(e)) return 'CM2';
  if (/\d{2,}\s*[×xX]/.test(e) || /[×xX]\s*\d{2,}/.test(e)) return 'CM1';
  return 'CE2';
}

function categorize(expr, result) {
  const e = expr.toLowerCase();
  const r = (result || '').toLowerCase();
  if (/\d+\/\d+/.test(e) || /\d+\/\d+/.test(r) || /quart/i.test(e)) return 'category:fraction';
  if (/dizaines?|dixi[eè]mes?|centi[eè]mes?/i.test(e)) return 'category:numeration';
  if (/\?/.test(e) || /=/.test(e)) return 'category:equation';
  return 'category:multiplication_avancee';
}

// ========== MAIN ==========
const assocData = JSON.parse(fs.readFileSync(ASSOC_PATH, 'utf8'));
const rectoratData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

let stratFile = {};
try { stratFile = JSON.parse(fs.readFileSync(STRAT_PATH, 'utf8')); } catch {}
const existingStrategies = stratFile.strategies || {};

const timestamp = Date.now();
const prefix = `cmult_${timestamp}`;
let calcCounter = 0;
let newCalculs = [];
let newChiffres = [];
let newAssociations = [];
let newStrategies = {};

const existingCalcContents = new Set(assocData.calculs.map(c => c.content.toLowerCase().trim()));
const addedExpressions = new Set();

function addCalcEntry(expr, result, resultStr, levelClass, category, isMain, strategy) {
  const normExpr = expr.trim();
  const lowerExpr = normExpr.toLowerCase().trim();

  if (existingCalcContents.has(lowerExpr) || addedExpressions.has(lowerExpr)) {
    if (isMain && strategy) {
      const existing = assocData.calculs.find(c => c.content.toLowerCase().trim() === lowerExpr);
      if (existing) {
        newStrategies[existing.id] = {
          title: normExpr,
          strategy: strategy,
          hint: `Le résultat est ${resultStr}.`
        };
      }
    }
    return null;
  }

  addedExpressions.add(lowerExpr);

  const idx = calcCounter++;
  const calcId = `${prefix}_${idx}`;
  const chiffreId = `n${prefix}_${idx}`;
  const themes = ['domain:math', category];

  newCalculs.push({ id: calcId, content: normExpr, levelClass, themes });
  newChiffres.push({ id: chiffreId, content: resultStr, themes, levelClass });
  newAssociations.push({ calculId: calcId, chiffreId: chiffreId, levelClass, themes });

  if (isMain && strategy) {
    newStrategies[calcId] = {
      title: normExpr,
      strategy: strategy,
      hint: `Le résultat est ${resultStr}.`
    };
  }

  return { calcId, chiffreId };
}

console.log(`Processing ${rectoratData.length} groups...`);
let mainCount = 0, distractorCount = 0, skipCount = 0;

for (const group of rectoratData) {
  const { main, distractors, strategy } = group;
  const mainResultStr = main.result.trim();
  const category = categorize(main.calc, mainResultStr);
  const mainLevel = getLevelClass(main.calc);

  // Main calcul - use result as-is (could be fraction string like "3/2")
  const entry = addCalcEntry(main.calc, null, mainResultStr, mainLevel, category, true, strategy);
  if (entry) mainCount++;
  else skipCount++;

  // Distractors - compute correct result
  for (const d of distractors) {
    const dExpr = d.calc.trim();
    const dCategory = categorize(dExpr, '');
    const dLevel = getLevelClass(dExpr);

    // Try to evaluate for correct result
    let correctResult = roundSmart(evalCalc(dExpr));
    let resultStr;

    if (!isNaN(correctResult)) {
      resultStr = formatFr(correctResult);
    } else {
      // For expressions we can't evaluate (standalone fractions as calc, etc.)
      // Try treating it as a fraction or special form
      console.warn(`  ⚠ Cannot evaluate: "${dExpr}" - skipping`);
      continue;
    }

    const dEntry = addCalcEntry(dExpr, correctResult, resultStr, dLevel, dCategory, false, null);
    if (dEntry) distractorCount++;
    else skipCount++;
  }
}

// Merge into associations.json
assocData.calculs.push(...newCalculs);
assocData.chiffres.push(...newChiffres);
assocData.associations.push(...newAssociations);
fs.writeFileSync(ASSOC_PATH, JSON.stringify(assocData, null, 2), 'utf8');

// Merge strategies into nested structure
const mergedStrategies = { ...existingStrategies, ...newStrategies };
stratFile.strategies = mergedStrategies;
if (stratFile._stats) {
  stratFile._stats.multiplication_rectorat = Object.keys(newStrategies).length;
}
fs.writeFileSync(STRAT_PATH, JSON.stringify(stratFile, null, 2), 'utf8');

console.log(`\n=== RÉSULTATS ===`);
console.log(`Calculs principaux ajoutés: ${mainCount}`);
console.log(`Distracteurs ajoutés (résultats corrects): ${distractorCount}`);
console.log(`Doublons/ignorés: ${skipCount}`);
console.log(`Total nouvelles entrées: ${mainCount + distractorCount}`);
console.log(`\nTotal calculs dans le jeu: ${assocData.calculs.length}`);
console.log(`Total chiffres dans le jeu: ${assocData.chiffres.length}`);
console.log(`Total associations dans le jeu: ${assocData.associations.length}`);
console.log(`Total stratégies: ${Object.keys(mergedStrategies).length}`);
