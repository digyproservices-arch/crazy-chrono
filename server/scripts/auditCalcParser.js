#!/usr/bin/env node
/**
 * Audit script — Tests every calcul expression in associations.json
 * against the parser to find unparseable expressions.
 *
 * Usage: node server/scripts/auditCalcParser.js
 */

const fs = require('fs');
const path = require('path');

// ── Parser (copy of evaluateCalcul from serverZoneGenerator.js) ──
function evaluateCalcul(calcul) {
  if (!calcul || typeof calcul !== 'string') return null;
  const raw = calcul.trim();
  const _pn = (t) => { const c = String(t).replace(/\s/g, '').replace(/,/g, '.'); const v = parseFloat(c); return Number.isFinite(v) ? v : NaN; };
  const _r8 = (v) => Math.round(v * 1e8) / 1e8;
  // Format textuel (le/la optional)
  const tm = raw.match(/^(?:l[ea]\s+)?(double|triple|tiers|quart|moiti[ée])\s+de\s+(.+)$/i);
  if (tm) {
    const k = tm[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const v = _pn(tm[2]); if (Number.isNaN(v)) return null;
    let r; switch (k) { case 'double': r = v*2; break; case 'triple': r = v*3; break; case 'moitie': r = v/2; break; case 'tiers': r = v/3; break; case 'quart': r = v/4; break; default: return null; }
    return Number.isFinite(r) ? _r8(r) : null;
  }
  // Numération: "X dizaines/dixièmes/centièmes/quarts"
  const numMatch = raw.match(/^([\d\s,.]+)\s*(dizaines?|dixi[eè]mes?|centi[eè]mes?|quarts?)$/i);
  if (numMatch) {
    const v = _pn(numMatch[1]); if (Number.isNaN(v)) return null;
    const u = numMatch[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (u.startsWith('dizaine')) return _r8(v * 10);
    if (u.startsWith('dixieme')) return _r8(v * 0.1);
    if (u.startsWith('centieme')) return _r8(v * 0.01);
    if (u.startsWith('quart')) return _r8(v * 0.25);
  }
  // Textual: "X fois Y centièmes" → X * Y/100
  const foisCent = raw.match(/^([\d\s,.]+)\s*fois\s+([\d\s,.]+)\s*centi[eè]mes?$/i);
  if (foisCent) {
    const a = parseFloat(foisCent[1].replace(/\s/g, '').replace(/,/g, '.'));
    const b = parseFloat(foisCent[2].replace(/\s/g, '').replace(/,/g, '.'));
    if (Number.isFinite(a) && Number.isFinite(b)) return _r8(a * b / 100);
  }
  // Format "A = ?/B" → A * B
  const eqSlash = raw.match(/^([\d\s,.]+)\s*=\s*\?\s*[\/÷]\s*([\d\s,.]+)$/);
  if (eqSlash) {
    const a = _pn(eqSlash[1]), b = _pn(eqSlash[2]);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return _r8(a * b);
  }
  // Format "A op ? = C" and "? op B = C"
  const norm = raw.replace(/×/g, '*').replace(/÷/g, '/').replace(/:/g, '/').replace(/x/gi, '*').replace(/−/g, '-').replace(/\bfois\b/gi, '*');
  const um = norm.match(/^(.+?)\s*([+\-*/])\s*\?\s*=\s*(.+)$/);
  if (um) {
    const a = _pn(um[1]), op = um[2], c = _pn(um[3]);
    if (Number.isNaN(a) || Number.isNaN(c)) return null;
    let r; switch (op) { case '+': r = c-a; break; case '-': r = a-c; break; case '*': r = a!==0?c/a:NaN; break; case '/': r = c!==0?a/c:NaN; break; default: return null; }
    return Number.isFinite(r) ? _r8(r) : null;
  }
  const um2 = norm.match(/^\?\s*([+\-*/])\s*(.+?)\s*=\s*(.+)$/);
  if (um2) {
    const op = um2[1], b = _pn(um2[2]), c = _pn(um2[3]);
    if (Number.isNaN(b) || Number.isNaN(c)) return null;
    let r; switch (op) { case '+': r = c-b; break; case '-': r = c+b; break; case '*': r = b!==0?c/b:NaN; break; case '/': r = c!==0?c*b:NaN; break; default: return null; }
    return Number.isFinite(r) ? _r8(r) : null;
  }
  const result = _safeEvalMath(norm);
  return result;
}

function _safeEvalMath(expr) {
  if (!expr) return null;
  let s = String(expr).replace(/,/g, '.');
  s = s.replace(/(\d)\s+(\d{3})(?!\d)/g, '$1$2');
  s = s.replace(/\s/g, '');
  if (!/^[\d.+\-*/()]+$/.test(s)) return null;
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '(' || s[i] === ')') { tokens.push(s[i]); i++; }
    else if ('+-*/'.includes(s[i])) {
      if (s[i] === '-' && (tokens.length === 0 || tokens[tokens.length - 1] === '(' || typeof tokens[tokens.length - 1] === 'string' && '+-*/'.includes(tokens[tokens.length - 1]))) {
        let num = '-'; i++;
        while (i < s.length && (s[i] >= '0' && s[i] <= '9' || s[i] === '.')) { num += s[i]; i++; }
        if (num === '-') return null;
        tokens.push(parseFloat(num));
      } else { tokens.push(s[i]); i++; }
    } else if (s[i] >= '0' && s[i] <= '9' || s[i] === '.') {
      let num = '';
      while (i < s.length && (s[i] >= '0' && s[i] <= '9' || s[i] === '.')) { num += s[i]; i++; }
      tokens.push(parseFloat(num));
    } else { return null; }
  }
  let pos = 0;
  function parseExpr() {
    let left = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++]; const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseTerm() {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++]; const right = parseFactor();
      if (op === '*') left *= right;
      else { if (right === 0) return NaN; left /= right; }
    }
    return left;
  }
  function parseFactor() {
    if (tokens[pos] === '(') { pos++; const val = parseExpr(); if (tokens[pos] === ')') pos++; return val; }
    if (typeof tokens[pos] === 'number') return tokens[pos++];
    return NaN;
  }
  const result = parseExpr();
  if (pos !== tokens.length) return null;
  return Number.isFinite(result) ? Math.round(result * 1e8) / 1e8 : null;
}

// ── Load associations ──
const dataPath = path.join(__dirname, '..', 'data', 'associations.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const calculs = data.calculs || [];
const chiffres = data.chiffres || [];
const associations = data.associations || [];

// Build lookup maps
const calculMap = new Map(calculs.map(c => [c.id, c]));
const chiffreMap = new Map(chiffres.map(c => [c.id, c]));

// Find calcul-chiffre associations
const calcAssocs = associations.filter(a => a.calculId && a.chiffreId);

console.log('========================================');
console.log('  AUDIT PARSER — Bibliothèque de calculs');
console.log('========================================\n');
console.log(`Calculs: ${calculs.length}`);
console.log(`Chiffres: ${chiffres.length}`);
console.log(`Associations calcul-chiffre: ${calcAssocs.length}\n`);

// ── Test 1: All standalone calcul expressions ──
console.log('── TEST 1: Expressions de calcul (standalone) ──\n');
const failedCalcs = [];
const passedCalcs = [];
for (const calc of calculs) {
  const result = evaluateCalcul(calc.content);
  if (result === null) {
    failedCalcs.push(calc);
  } else {
    passedCalcs.push({ ...calc, parsedResult: result });
  }
}
console.log(`✅ Parsées: ${passedCalcs.length}/${calculs.length}`);
console.log(`❌ Échouées: ${failedCalcs.length}/${calculs.length}\n`);

if (failedCalcs.length > 0) {
  console.log('Expressions NON PARSÉES:');
  for (const c of failedCalcs) {
    console.log(`  ❌ [${c.id}] "${c.content}" (class: ${c.levelClass || '?'}, themes: ${(c.themes || []).join(', ')})`);
  }
  console.log('');
}

// ── Test 2: Paired associations — does parser result match chiffre? ──
console.log('── TEST 2: Vérification paires calcul ↔ chiffre ──\n');
const mismatchPairs = [];
const unparsedPairs = [];
const okPairs = [];

for (const assoc of calcAssocs) {
  const calc = calculMap.get(assoc.calculId);
  const chiffre = chiffreMap.get(assoc.chiffreId);
  if (!calc || !chiffre) continue;

  const parsedResult = evaluateCalcul(calc.content);
  // Parse chiffre: try as number first, then as expression (handles "3/2", "1/4 + 1/4", etc.)
  const chiffreRaw = String(chiffre.content).replace(/\s/g, '').replace(',', '.');
  let chiffreValue = parseFloat(chiffreRaw);
  if (isNaN(chiffreValue) || !/^-?[\d.]+$/.test(chiffreRaw)) {
    const exprVal = evaluateCalcul(chiffre.content);
    if (exprVal !== null) chiffreValue = exprVal;
  }

  if (parsedResult === null) {
    unparsedPairs.push({ calcId: calc.id, calcContent: calc.content, chiffreContent: chiffre.content, levelClass: assoc.levelClass });
  } else if (Math.abs(parsedResult - chiffreValue) > 1e-6) {
    mismatchPairs.push({
      calcId: calc.id, calcContent: calc.content,
      parsedResult, chiffreContent: chiffre.content, chiffreValue,
      levelClass: assoc.levelClass
    });
  } else {
    okPairs.push({ calcContent: calc.content, result: parsedResult });
  }
}

console.log(`✅ Paires correctes: ${okPairs.length}/${calcAssocs.length}`);
console.log(`❌ Parser échoue: ${unparsedPairs.length}/${calcAssocs.length}`);
console.log(`⚠️  Résultat ≠ chiffre: ${mismatchPairs.length}/${calcAssocs.length}\n`);

if (unparsedPairs.length > 0) {
  console.log('Paires dont le calcul N\'EST PAS PARSÉ:');
  for (const p of unparsedPairs) {
    console.log(`  ❌ [${p.calcId}] "${p.calcContent}" ↔ "${p.chiffreContent}" (${p.levelClass || '?'})`);
  }
  console.log('');
}

if (mismatchPairs.length > 0) {
  console.log('Paires dont le résultat NE CORRESPOND PAS:');
  for (const p of mismatchPairs) {
    console.log(`  ⚠️  [${p.calcId}] "${p.calcContent}" → parser: ${p.parsedResult}, chiffre: "${p.chiffreContent}" (${p.chiffreValue}) (${p.levelClass || '?'})`);
  }
  console.log('');
}

// ── Test 3: Unique format analysis ──
console.log('── TEST 3: Formats uniques détectés ──\n');
const formatCounts = {};
for (const calc of calculs) {
  const s = calc.content;
  let fmt = 'unknown';
  if (/fois.*centi/i.test(s)) fmt = 'X fois Y centièmes';
  else if (/fois/i.test(s)) fmt = 'X fois Y';
  else if (/l[ea]\s+(double|triple|tiers|quart|moiti)/i.test(s)) fmt = 'textuel (double/moitié/...)';
  else if (/\?\s*=/.test(s)) fmt = 'A op ? = C';
  else if (/=\s*\?/.test(s)) fmt = 'A = ?/B';
  else if (/[×x*].*[×x*]/i.test(s)) fmt = 'chained multiply (A×B×C)';
  else if (/÷.*÷/.test(s)) fmt = 'chained divide';
  else if (/\d+\/\d+/.test(s) && /[+\-×÷*]/.test(s)) fmt = 'fraction + op';
  else if (/\d+\/\d+/.test(s)) fmt = 'fraction (A/B)';
  else if (/[+]/.test(s)) fmt = 'addition (A+B)';
  else if (/[-−]/.test(s)) fmt = 'soustraction (A-B)';
  else if (/[×x*]/i.test(s)) fmt = 'multiplication (A×B)';
  else if (/[÷\/]/.test(s)) fmt = 'division (A÷B)';
  else if (/^\d+[,.]?\d*$/.test(s.replace(/\s/g, ''))) fmt = 'nombre simple';
  formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
}
const sorted = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]);
for (const [fmt, count] of sorted) {
  const icon = failedCalcs.some(c => {
    // Quick check if any failed calc matches this format
    if (fmt === 'unknown') return true;
    return false;
  }) ? '⚠️ ' : '  ';
  console.log(`${icon} ${fmt}: ${count}`);
}

console.log('\n========================================');
console.log('  AUDIT TERMINÉ');
console.log('========================================');
