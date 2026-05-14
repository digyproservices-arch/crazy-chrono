#!/usr/bin/env node
/**
 * Generate missing learn-strategies for associations that don't have one yet.
 * Run: node scripts/generate-missing-strategies.js
 */
const fs = require('fs');
const path = require('path');

const ASSOC_PATH = path.join(__dirname, '..', 'public', 'data', 'associations.json');
const STRAT_PATH = path.join(__dirname, '..', 'public', 'data', 'learn-strategies.json');

const assocData = JSON.parse(fs.readFileSync(ASSOC_PATH, 'utf-8'));
const stratData = JSON.parse(fs.readFileSync(STRAT_PATH, 'utf-8'));

const { textes = [], images = [], calculs = [], chiffres = [], associations = [] } = assocData;
const textMap = Object.fromEntries(textes.map(t => [t.id, t]));
const imgMap = Object.fromEntries(images.map(i => [i.id, i]));
const calcMap = Object.fromEntries(calculs.map(c => [c.id, c]));
const numMap = Object.fromEntries(chiffres.map(n => [n.id, n]));

const strategies = { ...stratData.strategies };
let generated = 0;

// ============================================================
// NATURE / ZOOLOGY STRATEGIES
// ============================================================
const NATURE_FACTS = {
  'Carambole': {
    strategy: "La carambole a une forme d'étoile très reconnaissable quand on la coupe en tranches. Sa peau est lisse et jaune-vert.",
    ecoFact: "La carambole pousse sur un arbre appelé carambolier, originaire d'Asie du Sud-Est. Aux Antilles, on en fait du jus et des confitures. Elle est riche en vitamine C.",
    hint: "Cherche le fruit en forme d'étoile."
  },
  'Sapotille': {
    strategy: "La sapotille est un petit fruit rond à la peau rugueuse brun clair. Sa chair est sucrée et fondante, elle rappelle le caramel ou la poire.",
    ecoFact: "Le sapotillier produit aussi du chicle, la matière première des chewing-gums ! Cet arbre peut vivre plus de 100 ans et atteindre 30 mètres de haut.",
    hint: "Cherche le petit fruit brun à chair douce comme du caramel."
  },
  'Nèfle': {
    strategy: "La nèfle du Japon est un fruit ovale orangé avec une peau lisse. Elle pousse en grappes et a un gros noyau à l'intérieur.",
    ecoFact: "La nèfle est riche en fibres et en potassium. Aux Antilles, le néflier est un arbre d'ombrage apprécié dans les jardins créoles.",
    hint: "Cherche le fruit ovale orangé qui pousse en grappes."
  },
  'Tamarin': {
    strategy: "Le tamarin se présente en gousses brunes contenant une pulpe collante et acide. La coque est dure et cassante.",
    ecoFact: "Le tamarinier est un arbre majestueux qui peut vivre 200 ans. Sa pulpe est utilisée dans la cuisine antillaise pour faire des boissons, des confiseries et des sauces.",
    hint: "Cherche les gousses brunes avec une pulpe collante."
  },
  'Quenette': {
    strategy: "La quenette (ou kenep) est un petit fruit vert en grappes. On casse la fine coque verte pour accéder à la chair translucide et juteuse autour d'un gros noyau.",
    ecoFact: "La quenette est le fruit préféré des enfants aux Antilles ! Le quenettier fait partie du paysage créole. On dit que manger des quenettes tache les vêtements.",
    hint: "Cherche les petits fruits verts en grappes."
  },
  'Corossol': {
    strategy: "Le corossol est un gros fruit vert couvert de petites épines molles. Sa chair blanche est crémeuse et parfumée.",
    ecoFact: "Le corossolier est très apprécié aux Antilles pour ses fruits et ses feuilles utilisées en tisane. Le jus de corossol est une boisson populaire dans toute la Caraïbe.",
    hint: "Cherche le gros fruit vert avec des petites pointes."
  },
  'Christophine': {
    strategy: "La christophine (chayote) est un légume vert en forme de poire avec des plis. Sa peau peut être lisse ou légèrement épineuse.",
    ecoFact: "La christophine est un légume incontournable de la cuisine créole. On la mange en gratin, en purée ou en salade. Sa liane grimpe facilement sur les treilles.",
    hint: "Cherche le légume vert en forme de poire avec des plis."
  },
  'Giraumon': {
    strategy: "Le giraumon est une courge ronde et aplatie, souvent verte avec des taches orangées. Il ressemble à un petit potiron coloré.",
    ecoFact: "Le giraumon est à la base du célèbre « gratin de giraumon » antillais. Ce cucurbitacée est riche en bêta-carotène et en fibres.",
    hint: "Cherche la courge ronde verte et orange."
  },
  'Manioc': {
    strategy: "Le manioc est un tubercule allongé à la peau brune et rugueuse, avec une chair blanche féculente à l'intérieur.",
    ecoFact: "Le manioc est un aliment de base aux Antilles et dans le monde entier. On en fait de la farine, des cassaves et du tapioca. Attention : il doit toujours être cuit car il contient de l'acide cyanhydrique cru.",
    hint: "Cherche le long tubercule brun à chair blanche."
  },
  'Gombo': {
    strategy: "Le gombo est un petit légume vert allongé, en forme de capsule côtelée. Quand on le coupe, il libère un liquide visqueux caractéristique.",
    ecoFact: "Le gombo est utilisé dans les soupes et ragoûts créoles. Il est aussi un ingrédient clé du gumbo cajun en Louisiane. Il est riche en vitamines C et K.",
    hint: "Cherche le petit légume vert allongé et côtelé."
  },
  'Cythère': {
    strategy: "La cythère (pomme cythère) est un fruit ovale vert qui devient jaune à maturité. Sa chair est croquante et acidulée avec un gros noyau épineux.",
    ecoFact: "La cythère se mange verte avec du sel et du piment aux Antilles. L'arbre, le prunier de Cythère, produit de longues grappes de fruits.",
    hint: "Cherche le fruit ovale vert-jaune à chair croquante."
  },
  'Maracuja': {
    strategy: "Le maracuja (fruit de la passion) est rond ou ovale avec une peau épaisse violette ou jaune. À l'intérieur, des graines noires entourées d'une pulpe orange juteuse.",
    ecoFact: "Le maracuja pousse sur une liane grimpante aux fleurs spectaculaires appelées « fleurs de la passion ». Son jus parfumé est utilisé dans les cocktails et desserts tropicaux.",
    hint: "Cherche le fruit rond violet ou jaune rempli de graines."
  },
  'Madère': {
    strategy: "Le madère est un tubercule à peau brune et chair blanche ou violacée. Il ressemble à une grosse pomme de terre allongée.",
    ecoFact: "Le madère (ou taro/dachine) est un tubercule traditionnel des Antilles. Il entre dans la composition du fameux « bouillon » créole, un plat de fête.",
    hint: "Cherche le tubercule brun allongé à chair blanche ou violette."
  },
  'Igname': {
    strategy: "L'igname est un gros tubercule irrégulier à la peau brune-noire et rugueuse. Sa chair est blanche et farineuse.",
    ecoFact: "L'igname est un aliment de base en Afrique et aux Antilles. Il existe des centaines de variétés. Aux Antilles, on le cuit en court-bouillon, en purée ou frit.",
    hint: "Cherche le gros tubercule irrégulier à peau rugueuse."
  },
  'Papaye': {
    strategy: "La papaye est un gros fruit ovale, vert à l'extérieur qui devient jaune-orange à maturité. L'intérieur est orange vif avec des graines noires rondes.",
    ecoFact: "Le papayer pousse très vite et peut produire des fruits dès la première année ! La papaïne, une enzyme de la papaye, est utilisée pour attendrir la viande.",
    hint: "Cherche le gros fruit ovale orange avec des graines noires."
  },
  'Goyave': {
    strategy: "La goyave est un fruit rond ou en forme de poire, vert à l'extérieur avec une chair rose ou blanche très parfumée. Elle a de nombreuses petites graines.",
    ecoFact: "Le goyavier est l'un des arbres fruitiers les plus communs aux Antilles. On fait du jus, de la gelée et de la pâte de goyave (confiture épaisse) très appréciée.",
    hint: "Cherche le fruit vert rond à chair rose très parfumée."
  },
  'Raifort': {
    strategy: "Le raifort (ou « zoranjé » en créole) est une plante médicinale aux feuilles très découpées et à l'odeur forte. Ses racines sont utilisées en phytothérapie.",
    ecoFact: "En médecine traditionnelle antillaise, le raifort est utilisé contre le rhume et la grippe. On prépare une décoction de ses feuilles et racines.",
    hint: "Cherche la plante aux feuilles très découpées et à l'odeur forte."
  },
  'Tajétes': {
    strategy: "Les tagètes (ou œillets d'Inde) sont des fleurs jaune-orange vives à l'odeur caractéristique. Elles poussent en touffes compactes.",
    ecoFact: "Les tagètes sont utilisées en médecine traditionnelle antillaise et comme répulsif naturel contre les moustiques et les pucerons au jardin.",
    hint: "Cherche les fleurs jaune-orange vives à odeur forte."
  },
  'Cerise Péyi': {
    strategy: "La cerise péyi (acérola) est un petit fruit rouge vif, rond et brillant. Elle pousse en grappes sur un arbuste.",
    ecoFact: "La cerise péyi est l'un des fruits les plus riches en vitamine C au monde — jusqu'à 40 fois plus que l'orange ! Aux Antilles, on en fait du jus et des sorbets.",
    hint: "Cherche le petit fruit rouge vif très brillant."
  },
  'Pomme Malaka': {
    strategy: "La pomme malaka (jamalac) est un fruit en forme de cloche, rouge ou rose, à chair blanche croquante et juteuse. Elle a un goût très rafraîchissant.",
    ecoFact: "Le jambosier rouge (arbre de la pomme malaka) est originaire d'Asie et s'est adapté aux Antilles. C'est un fruit désaltérant que les enfants adorent.",
    hint: "Cherche le fruit en forme de cloche rouge ou rose."
  },
  'Zandoli': {
    strategy: "Le zandoli (anolis) est un petit lézard vert vif très agile. Le mâle a une crête dorsale et un fanon gulaire orange-rouge qu'il déploie pour impressionner.",
    ecoFact: "Le zandoli est le lézard le plus commun des Antilles. Il régule les populations d'insectes et joue un rôle essentiel dans l'écosystème. Chaque île a souvent sa propre espèce d'anolis.",
    hint: "Cherche le petit lézard vert très agile."
  },
};

for (const assoc of associations) {
  if (!assoc.texteId || !assoc.imageId) continue;
  const key = `${assoc.texteId}:${assoc.imageId}`;
  if (strategies[key]) continue;

  const text = textMap[assoc.texteId];
  const img = imgMap[assoc.imageId];
  if (!text) continue;

  const name = text.content;
  const info = NATURE_FACTS[name];
  if (!info) continue;

  strategies[key] = {
    title: name,
    strategy: info.strategy,
    ecoFact: info.ecoFact,
    hint: info.hint
  };
  generated++;
}

// ============================================================
// MATH STRATEGIES
// ============================================================

function generateDivisionStrategy(expr, result) {
  const title = expr;
  // Pattern: "la moitié de X" 
  const moitieMatch = expr.match(/la moitié de ([\d,.]+)/i);
  if (moitieMatch) {
    const n = moitieMatch[1];
    return {
      title,
      strategy: `La moitié d'un nombre, c'est le diviser par 2. La moitié de ${n}, c'est ${result}.`,
      hint: `Le résultat est ${result}.`
    };
  }
  // Pattern: "le tiers de X"
  const tiersMatch = expr.match(/le tiers de ([\d,.]+)/i);
  if (tiersMatch) {
    const n = tiersMatch[1];
    return {
      title,
      strategy: `Le tiers d'un nombre, c'est le diviser par 3. Le tiers de ${n}, c'est ${result}.`,
      hint: `Le résultat est ${result}.`
    };
  }
  // Pattern: "le quart de X"
  const quartMatch = expr.match(/le quart de ([\d,.]+)/i);
  if (quartMatch) {
    const n = quartMatch[1];
    return {
      title,
      strategy: `Le quart d'un nombre, c'est le diviser par 4. Le quart de ${n}, c'est ${result}.`,
      hint: `Le résultat est ${result}.`
    };
  }
  // Pattern: "X ÷ Y"
  const divMatch = expr.match(/([\d,.]+)\s*÷\s*([\d,.]+)/);
  if (divMatch) {
    const a = divMatch[1], b = divMatch[2];
    if (b === '2') {
      return {
        title,
        strategy: `Diviser par 2 c'est chercher la moitié. ${a} divisé par 2 égale ${result}.`,
        hint: `Le résultat est ${result}.`
      };
    }
    if (b === '10' || b === '100' || b === '1000') {
      return {
        title,
        strategy: `Diviser par ${b} revient à déplacer la virgule de ${b === '10' ? '1' : b === '100' ? '2' : '3'} rang${b === '10' ? '' : 's'} vers la gauche. ${a} ÷ ${b} = ${result}.`,
        hint: `Le résultat est ${result}.`
      };
    }
    return {
      title,
      strategy: `On cherche combien de fois ${b} entre dans ${a}. ${b} × ${result} = ${a}, donc ${a} ÷ ${b} = ${result}.`,
      hint: `Le résultat est ${result}.`
    };
  }
  return { title, strategy: `Le résultat de ${expr} est ${result}.`, hint: `Le résultat est ${result}.` };
}

function generateMultAvStrategy(expr, result) {
  const title = expr;
  const match = expr.match(/([\d,.]+)\s*×\s*([\d,.]+)/);
  if (!match) return { title, strategy: `Le résultat de ${expr} est ${result}.`, hint: `Le résultat est ${result}.` };
  const a = match[1], b = match[2];
  const aNum = parseFloat(a), bNum = parseFloat(b);
  // Multiply by multiples of 10
  if (bNum % 10 === 0 && bNum >= 10) {
    const factor = bNum / 10;
    const intermediate = aNum * factor;
    return {
      title,
      strategy: `Stratégie : ${a} × ${b} = ${a} × ${factor} × 10. D'abord ${a} × ${factor} = ${intermediate}, puis ${intermediate} × 10 = ${result}.`,
      hint: `Le résultat est ${result}.`
    };
  }
  if (aNum % 10 === 0 && aNum >= 10) {
    const factor = aNum / 10;
    const intermediate = factor * bNum;
    return {
      title,
      strategy: `Stratégie : ${a} × ${b} = ${factor} × ${b} × 10. D'abord ${factor} × ${b} = ${intermediate}, puis ${intermediate} × 10 = ${result}.`,
      hint: `Le résultat est ${result}.`
    };
  }
  return {
    title,
    strategy: `${a} × ${b} = ${result}. On peut décomposer : cherche les facteurs les plus simples pour vérifier.`,
    hint: `Le résultat est ${result}.`
  };
}

function generateFractionStrategy(expr, result) {
  const title = expr;
  return {
    title,
    strategy: `${expr} = ${result}. Pour les fractions, pense à simplifier d'abord et à chercher les équivalences avec les entiers.`,
    hint: `Le résultat est ${result}.`
  };
}

function generateEquationStrategy(expr, result) {
  const title = expr;
  // Pattern: "A × ? = B"
  const mulEq = expr.match(/([\d,.]+)\s*×\s*\?\s*=\s*([\d,.]+)/);
  if (mulEq) {
    return {
      title,
      strategy: `On cherche le nombre qui, multiplié par ${mulEq[1]}, donne ${mulEq[2]}. C'est ${mulEq[2]} ÷ ${mulEq[1]} = ${result}.`,
      hint: `Le résultat est ${result}.`
    };
  }
  // Pattern: "? × A = B"
  const mulEq2 = expr.match(/\?\s*×\s*([\d,.]+)\s*=\s*([\d,.]+)/);
  if (mulEq2) {
    return {
      title,
      strategy: `On cherche le nombre qui, multiplié par ${mulEq2[1]}, donne ${mulEq2[2]}. C'est ${mulEq2[2]} ÷ ${mulEq2[1]} = ${result}.`,
      hint: `Le résultat est ${result}.`
    };
  }
  return {
    title,
    strategy: `${expr} → Le nombre manquant est ${result}. Pense à l'opération inverse pour trouver la valeur inconnue.`,
    hint: `Le résultat est ${result}.`
  };
}

function generateNumerationStrategy(expr, result) {
  const title = expr;
  return {
    title,
    strategy: `${expr} = ${result}. En numération, décompose le nombre en unités, dizaines, centaines pour mieux comprendre.`,
    hint: `Le résultat est ${result}.`
  };
}

// Process math associations
for (const assoc of associations) {
  if (!assoc.calculId) continue;
  const key = assoc.calculId;
  if (strategies[key]) continue;

  const calc = calcMap[assoc.calculId];
  const num = numMap[assoc.chiffreId];
  if (!calc || !num) continue;

  const expr = calc.content;
  const result = num.content;
  const themes = assoc.themes || [];

  let strat;
  if (themes.includes('category:division')) {
    strat = generateDivisionStrategy(expr, result);
  } else if (themes.includes('category:multiplication_avancee')) {
    strat = generateMultAvStrategy(expr, result);
  } else if (themes.includes('category:fraction')) {
    strat = generateFractionStrategy(expr, result);
  } else if (themes.includes('category:equation')) {
    strat = generateEquationStrategy(expr, result);
  } else if (themes.includes('category:numeration')) {
    strat = generateNumerationStrategy(expr, result);
  } else {
    strat = { title: expr, strategy: `${expr} = ${result}.`, hint: `Le résultat est ${result}.` };
  }

  strategies[key] = strat;
  generated++;
}

// Save updated file
const output = {
  ...stratData,
  _stats: {
    ...stratData._stats,
    total: Object.keys(strategies).length,
    generated_update: new Date().toISOString(),
    added_in_update: generated,
  },
  strategies
};

fs.writeFileSync(STRAT_PATH, JSON.stringify(output, null, 2), 'utf-8');
console.log(`✅ Generated ${generated} new strategies. Total: ${Object.keys(strategies).length}`);

// Verify none left
const remaining = [];
for (const x of associations) {
  let k;
  if (x.texteId && x.imageId) k = x.texteId + ':' + x.imageId;
  else if (x.calculId) k = x.calculId;
  else continue;
  if (!strategies[k]) remaining.push(k);
}
if (remaining.length > 0) {
  console.log(`⚠️ Still missing ${remaining.length} strategies`);
  remaining.slice(0, 5).forEach(k => console.log('  -', k));
} else {
  console.log('🎉 All associations now have strategies!');
}
