const fs = require('fs');
const c = fs.readFileSync('src/components/Carte.js', 'utf8');

// Find all variables used in JSX conditional patterns
const condRe = /\{(\s*!?\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*&&/g;
const ternRe = /\{([a-zA-Z_][a-zA-Z0-9_]*)\s*\?/g;
const dotRe = /\{([a-zA-Z_][a-zA-Z0-9_]*)\.(\w+)/g;

const allCandidates = new Set();
let m;
while (m = condRe.exec(c)) allCandidates.add(m[2]);
while (m = ternRe.exec(c)) allCandidates.add(m[1]);
while (m = dotRe.exec(c)) allCandidates.add(m[1]);

const builtins = new Set([
  'window','document','console','Math','JSON','Array','Object','Number',
  'String','Date','Error','Promise','navigator','screen','localStorage',
  'sessionStorage','location','history','process','module','require',
  'exports','global','self','this','event','true','false','null',
  'undefined','NaN','Infinity','React','prev','ov','zone','player'
]);

const results = [];
allCandidates.forEach(v => {
  if (builtins.has(v) || v.length < 3) return;
  
  // Check all declaration patterns
  const hasUseState = c.includes('[' + v + ',') || c.includes('[' + v + ']');
  const hasConst = new RegExp('const\\s+' + v + '\\s*[=;,]').test(c);
  const hasLet = new RegExp('let\\s+' + v + '\\s*[=;,]').test(c);
  const hasVar = new RegExp('var\\s+' + v + '\\s*[=;,]').test(c);
  const hasFunc = new RegExp('function\\s+' + v + '\\s*\\(').test(c);
  const hasParam = new RegExp('[({,]\\s*' + v + '\\s*[,}):]').test(c);
  const hasImport = new RegExp('import.*\\b' + v + '\\b').test(c);
  const hasRef = new RegExp('const\\s+' + v + '\\s*=\\s*useRef').test(c);
  
  if (!hasUseState && !hasConst && !hasLet && !hasVar && !hasFunc && !hasParam && !hasImport && !hasRef) {
    results.push(v);
  }
});

console.log('Truly undeclared vars used in JSX conditions/expressions:');
if (results.length === 0) {
  console.log('  (none found)');
} else {
  results.sort().forEach(v => {
    // Show where it's used
    const lines = c.split('\n');
    const usages = [];
    lines.forEach((l, i) => {
      if (l.includes(v)) usages.push(i + 1);
    });
    console.log('  ' + v + ' (lines: ' + usages.slice(0, 5).join(', ') + (usages.length > 5 ? '...' : '') + ')');
  });
}
