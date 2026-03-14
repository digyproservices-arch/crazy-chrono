/**
 * hintGenerator.js — Génération d'indices pédagogiques pour le système d'aide
 * 
 * Niveau 1 (indice subtil) : donne un indice contextuel sans révéler la réponse
 * Niveau 2 (réponse complète) : révèle la bonne paire avec explication
 */

// ─── Évaluation calcul (repris de elementsLoader.js) ───
function _evalCalc(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  const _pn = (t) => { const c = String(t).replace(/\s/g, '').replace(/,/g, '.'); const v = parseFloat(c); return Number.isFinite(v) ? v : NaN; };
  const _r8 = (v) => Math.round(v * 1e8) / 1e8;
  // Format textuel
  const tm = s.match(/^l[ea]\s+(double|triple|tiers|quart|moiti[ée])\s+de\s+(.+)$/i);
  if (tm) {
    const k = tm[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const v = _pn(tm[2]); if (Number.isNaN(v)) return null;
    let r; switch (k) { case 'double': r = v*2; break; case 'triple': r = v*3; break; case 'moitie': r = v/2; break; case 'tiers': r = v/3; break; case 'quart': r = v/4; break; default: return null; }
    return Number.isFinite(r) ? _r8(r) : null;
  }
  // Format "A op ? = C"
  const norm = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/:/g, '/').replace(/x/gi, '*').replace(/−/g, '-');
  const um = norm.match(/^(.+?)\s*([+\-*/])\s*\?\s*=\s*(.+)$/);
  if (um) {
    const a = _pn(um[1]), op = um[2], c = _pn(um[3]);
    if (Number.isNaN(a) || Number.isNaN(c)) return null;
    let r; switch (op) { case '+': r = c-a; break; case '-': r = a-c; break; case '*': r = a!==0?c/a:NaN; break; case '/': r = c!==0?a/c:NaN; break; default: return null; }
    return Number.isFinite(r) ? _r8(r) : null;
  }
  // Format simple "A op B"
  const stripped = norm.replace(/\s/g, '').replace(/,/g, '.');
  const sm = stripped.match(/^(-?[\d.]+)([+\-*/])(-?[\d.]+)$/);
  if (sm) {
    const a = parseFloat(sm[1]), op = sm[2], b = parseFloat(sm[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    let r; switch (op) { case '+': r = a+b; break; case '-': r = a-b; break; case '*': r = a*b; break; case '/': r = b!==0?a/b:NaN; break; default: return null; }
    return Number.isFinite(r) ? _r8(r) : null;
  }
  return null;
}

// ─── Détection type d'opération ───
function _getOperationType(calcContent) {
  if (!calcContent) return null;
  const s = String(calcContent).trim();
  if (/double|triple|moiti|tiers|quart/i.test(s)) return 'textual';
  if (/\?/.test(s)) return 'missing';
  if (/[×x*]/i.test(s)) return 'multiplication';
  if (/÷|\/|:/.test(s)) return 'division';
  if (/\+/.test(s)) return 'addition';
  if (/-/.test(s)) return 'subtraction';
  return 'unknown';
}

// ─── Noms d'opérations en français ───
const OP_NAMES = {
  multiplication: 'une multiplication',
  division: 'une division',
  addition: 'une addition',
  subtraction: 'une soustraction',
  textual: 'un calcul avec des mots',
  missing: 'un nombre manquant',
  unknown: 'un calcul',
};

/**
 * Trouver la bonne paire parmi les zones actuelles
 * @param {Array} zones - tableau de zones actuelles
 * @returns {{ zoneA: object, zoneB: object, pairId: string, kind: string } | null}
 */
export function findGoodPair(zones) {
  if (!Array.isArray(zones) || zones.length === 0) return null;
  
  // Chercher les zones qui ont un pairId non-vide
  const withPairId = zones.filter(z => {
    const pid = z?.pairId || z?.pairID || z?.pairid || z?.pair || z?.groupId || z?.groupID || z?.group;
    return !!pid;
  });
  
  if (withPairId.length < 2) return null;
  
  // Grouper par pairId
  const groups = {};
  for (const z of withPairId) {
    const pid = z.pairId || z.pairID || z.pairid || z.pair || z.groupId || z.groupID || z.group;
    const key = String(pid).trim().toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(z);
  }
  
  // Trouver le premier groupe avec 2 zones de types compatibles
  for (const [key, group] of Object.entries(groups)) {
    if (group.length < 2) continue;
    const normType = (t) => String(t || '').toLowerCase().trim();
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const t1 = normType(group[i].type);
        const t2 = normType(group[j].type);
        const isImgTxt = (t1 === 'image' && t2 === 'texte') || (t1 === 'texte' && t2 === 'image');
        const isCalcNum = (t1 === 'calcul' && t2 === 'chiffre') || (t1 === 'chiffre' && t2 === 'calcul');
        if (isImgTxt || isCalcNum) {
          return {
            zoneA: group[i],
            zoneB: group[j],
            pairId: key,
            kind: isImgTxt ? 'imgtxt' : 'calcnum',
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Générer un indice de niveau 1 (subtil, sans donner la réponse)
 * @param {Array} zones - zones actuelles
 * @returns {{ text: string, icon: string, kind: string } | null}
 */
export function generateHint(zones) {
  const pair = findGoodPair(zones);
  if (!pair) return null;
  
  const { zoneA, zoneB, kind } = pair;
  const normType = (t) => String(t || '').toLowerCase().trim();
  
  if (kind === 'imgtxt') {
    const imageZone = normType(zoneA.type) === 'image' ? zoneA : zoneB;
    const texteZone = normType(zoneA.type) === 'texte' ? zoneA : zoneB;
    const textContent = String(texteZone.content || texteZone.label || '').trim();
    
    // Indices variés pour image-texte
    const hints = [];
    
    // Indice sur la première lettre
    if (textContent.length > 0) {
      hints.push(`Le nom commence par la lettre "${textContent[0].toUpperCase()}"`);
    }
    
    // Indice sur le nombre de mots
    const words = textContent.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      hints.push(`Le nom contient ${words.length} mots`);
    } else if (textContent.length > 3) {
      hints.push(`Le nom contient ${textContent.length} lettres`);
    }
    
    // Indice sur la dernière lettre
    if (textContent.length > 2) {
      hints.push(`Le nom se termine par "${textContent.slice(-2)}"`);
    }
    
    // Choisir un indice aléatoire
    const hint = hints[Math.floor(Math.random() * hints.length)] || `Cherche bien parmi les textes !`;
    
    return {
      text: `🔍 ${hint}`,
      icon: '💡',
      kind: 'imgtxt',
    };
  }
  
  if (kind === 'calcnum') {
    const calculZone = normType(zoneA.type) === 'calcul' ? zoneA : zoneB;
    const chiffreZone = normType(zoneA.type) === 'chiffre' ? zoneA : zoneB;
    const calcContent = String(calculZone.content || '').trim();
    const result = _evalCalc(calcContent);
    const opType = _getOperationType(calcContent);
    
    const hints = [];
    
    // Indice sur le type d'opération
    if (opType && OP_NAMES[opType]) {
      hints.push(`C'est ${OP_NAMES[opType]}`);
    }
    
    // Indice pair/impair
    if (result !== null && Number.isInteger(result)) {
      hints.push(`Le résultat est un nombre ${result % 2 === 0 ? 'pair' : 'impair'}`);
    }
    
    // Indice fourchette
    if (result !== null) {
      const lo = Math.floor(result / 10) * 10;
      const hi = lo + 10;
      if (result >= 10) {
        hints.push(`Le résultat est entre ${lo} et ${hi}`);
      } else if (result >= 0) {
        hints.push(`Le résultat est un chiffre (< 10)`);
      }
    }
    
    // Indice nombre de chiffres
    if (result !== null && Number.isInteger(result) && result > 0) {
      const digits = String(Math.abs(result)).length;
      hints.push(`Le résultat a ${digits} chiffre${digits > 1 ? 's' : ''}`);
    }
    
    const hint = hints[Math.floor(Math.random() * hints.length)] || `Calcule bien !`;
    
    return {
      text: `🧮 ${hint}`,
      icon: '💡',
      kind: 'calcnum',
    };
  }
  
  return null;
}

/**
 * Générer la réponse complète de niveau 2 (réponse + explication)
 * @param {Array} zones - zones actuelles
 * @returns {{ text: string, icon: string, kind: string, zoneAId: string, zoneBId: string, explanation: string } | null}
 */
export function generateAnswer(zones) {
  const pair = findGoodPair(zones);
  if (!pair) return null;
  
  const { zoneA, zoneB, kind } = pair;
  const normType = (t) => String(t || '').toLowerCase().trim();
  
  if (kind === 'imgtxt') {
    const imageZone = normType(zoneA.type) === 'image' ? zoneA : zoneB;
    const texteZone = normType(zoneA.type) === 'texte' ? zoneA : zoneB;
    const textContent = String(texteZone.content || texteZone.label || '').trim();
    
    return {
      text: `La bonne paire est : "${textContent}"`,
      icon: '🎯',
      kind: 'imgtxt',
      zoneAId: zoneA.id,
      zoneBId: zoneB.id,
      explanation: `L'image correspond au texte "${textContent}". Clique sur l'image et le texte pour valider !`,
    };
  }
  
  if (kind === 'calcnum') {
    const calculZone = normType(zoneA.type) === 'calcul' ? zoneA : zoneB;
    const chiffreZone = normType(zoneA.type) === 'chiffre' ? zoneA : zoneB;
    const calcContent = String(calculZone.content || '').trim();
    const chiffreContent = String(chiffreZone.content || '').trim();
    const result = _evalCalc(calcContent);
    
    let explanation = `${calcContent} = ${chiffreContent}`;
    
    // Explication détaillée selon le type
    const opType = _getOperationType(calcContent);
    if (opType === 'multiplication') {
      const m = calcContent.match(/(\d+)\s*[×x*]\s*(\d+)/i);
      if (m) {
        explanation = `${m[1]} × ${m[2]} = ${result}. C'est la table de ${Math.min(parseInt(m[1]), parseInt(m[2]))} !`;
      }
    } else if (opType === 'addition') {
      explanation = `${calcContent} = ${result}. On additionne les deux nombres.`;
    } else if (opType === 'subtraction') {
      explanation = `${calcContent} = ${result}. On soustrait le deuxième nombre du premier.`;
    } else if (opType === 'textual') {
      explanation = `${calcContent} = ${result}`;
    }
    
    return {
      text: `La réponse est : ${calcContent} = ${chiffreContent}`,
      icon: '🎯',
      kind: 'calcnum',
      zoneAId: zoneA.id,
      zoneBId: zoneB.id,
      explanation,
    };
  }
  
  return null;
}

// Pénalités en secondes
export const HINT_PENALTY = 5;
export const ANSWER_PENALTY = 10;
