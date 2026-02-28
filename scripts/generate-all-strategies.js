/**
 * Script to generate complete learn-strategies.json
 * covering ALL associations in the game.
 * Run: node scripts/generate-all-strategies.js
 */
const fs = require('fs');
const path = require('path');

const assocPath = path.join(__dirname, '..', 'public', 'data', 'associations.json');
const outPath = path.join(__dirname, '..', 'public', 'data', 'learn-strategies.json');

const data = JSON.parse(fs.readFileSync(assocPath, 'utf8'));
const { textes, images, calculs, chiffres, associations } = data;

const textMap = Object.fromEntries(textes.map(t => [t.id, t]));
const imgMap = Object.fromEntries(images.map(i => [i.id, i]));
const calcMap = Object.fromEntries(calculs.map(c => [c.id, c]));
const numMap = Object.fromEntries(chiffres.map(n => [n.id, n]));

// Load existing strategies to preserve hand-written ones
let existing = {};
try {
  const ex = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  existing = ex.strategies || {};
} catch {}

const strategies = { ...existing };

// ============================
// BOTANIQUE strategies
// ============================
const botaniqueFacts = {
  "Cannelle": {
    strategy: "La cannelle se reconnaît à ses bâtons enroulés de couleur brun clair. C'est l'écorce intérieure d'un arbre tropical. Son parfum chaud et sucré est unique.",
    ecoFact: "La cannelle vient du cannelier, un arbre de la famille des lauriers. Aux Antilles, elle est utilisée dans de nombreuses recettes traditionnelles comme le chocolat chaud créole et les gâteaux.",
    hint: "Cherche les bâtons d'écorce enroulés brun clair."
  },
  "Gingembre": {
    strategy: "Le gingembre est un rhizome (tige souterraine) de forme irrégulière, avec une peau beige et une chair jaune piquante. Il a un goût piquant et frais.",
    ecoFact: "Le gingembre est cultivé aux Antilles depuis des siècles. Il est utilisé comme épice et en médecine traditionnelle pour ses propriétés anti-inflammatoires. Le « jus de gingembre » est une boisson festive incontournable.",
    hint: "Cherche la racine noueuse de couleur beige."
  },
  "FARINE CHAUD": {
    strategy: "La farine chaud (ou toloman) est un tubercule tropical qui produit une fécule très fine. La plante a de grandes feuilles vertes et des fleurs spectaculaires.",
    ecoFact: "Le toloman est cultivé aux Antilles pour ses rhizomes dont on tire une fécule digestible. C'est un aliment de substitution important en cas de pénurie de blé, et il pousse bien dans les jardins créoles.",
    hint: "Cherche le tubercule tropical aux grandes feuilles."
  },
  "Orthosiphon": {
    strategy: "L'orthosiphon (ou moustache de chat) a des fleurs blanches ou mauves avec de très longues étamines qui ressemblent à des moustaches de chat.",
    ecoFact: "L'orthosiphon est utilisé en phytothérapie aux Antilles et en Asie pour ses propriétés diurétiques. Il aide à drainer les reins naturellement. C'est une plante médicinale précieuse des jardins créoles.",
    hint: "Cherche la plante avec des fleurs aux longues étamines comme des moustaches."
  },
  "Patate Chandelier": {
    strategy: "La patate chandelier est un tubercule tropical de forme allongée. Sa chair est blanche et farineuse. La plante grimpe et s'enroule autour des supports.",
    ecoFact: "La patate chandelier est un igname sauvage des Antilles, riche en amidon. Elle fait partie du patrimoine culinaire créole et pousse naturellement dans les forêts tropicales humides.",
    hint: "Cherche le tubercule allongé qui pousse sur une liane."
  },
  "Soulier zombie": {
    strategy: "Le soulier zombie (ou sabot de Vénus tropical) est une orchidée remarquable dont la fleur a la forme d'un petit sabot ou d'une chaussure. Ses couleurs sont souvent vives.",
    ecoFact: "Cette orchidée rare des forêts tropicales est menacée par la déforestation. Elle pousse sur les troncs d'arbres (épiphyte) et participe à la biodiversité des forêts antillaises. Sa pollinisation est assurée par des insectes spécifiques.",
    hint: "Cherche l'orchidée en forme de petit sabot."
  },
  "Consoude": {
    strategy: "La consoude a de grandes feuilles velues et rugueuses, et des petites fleurs en clochettes violettes, roses ou blanches regroupées en grappes.",
    ecoFact: "La consoude est une plante médicinale puissante utilisée depuis l'Antiquité pour aider à la cicatrisation des os (d'où son nom). Au jardin, elle est un excellent engrais vert et attire les pollinisateurs.",
    hint: "Cherche la plante aux feuilles velues et fleurs en clochettes."
  },
  "Bleuets": {
    strategy: "Le bleuet est une fleur sauvage d'un bleu intense, avec des pétales fins et découpés en étoile. On le trouve souvent dans les champs de céréales.",
    ecoFact: "Le bleuet est devenu rare à cause de l'agriculture intensive. Il est le symbole du souvenir des combattants en France. Ses pétales sont utilisés en cosmétique pour apaiser les yeux fatigués.",
    hint: "Cherche la fleur bleu vif aux pétales découpés."
  },
  "Mélisse": {
    strategy: "La mélisse a des feuilles dentelées qui ressemblent à celles de la menthe, mais dégagent une odeur citronnée quand on les froisse.",
    ecoFact: "La mélisse citronnelle est cultivée aux Antilles et en Europe pour ses vertus calmantes. En tisane, elle aide à dormir et à digérer. Elle attire les abeilles (son nom vient du grec « melissa » = abeille).",
    hint: "Cherche la plante aux feuilles dentelées à odeur de citron."
  },
  "Paroka": {
    strategy: "Le paroka (ou margose, pomme coolie) est un fruit allongé et bosselé, de couleur verte, qui devient orange à maturité. Sa chair est très amère.",
    ecoFact: "Le paroka est un légume-fruit tropical consommé aux Antilles et en Asie pour ses propriétés médicinales. Il aide à réguler le taux de sucre dans le sang. Malgré son amertume, il est très nutritif.",
    hint: "Cherche le fruit vert allongé et bosselé."
  },
  "Atoumo": {
    strategy: "L'atoumo (ou bois d'Inde, bay rum) a des feuilles aromatiques vert foncé et brillantes. Froissées, elles dégagent une forte odeur épicée rappelant le clou de girofle.",
    ecoFact: "L'atoumo est un arbre emblématique des Antilles utilisé en médecine traditionnelle créole. Ses feuilles servent à préparer des bains démarrage et des tisanes. Son huile essentielle est recherchée en parfumerie.",
    hint: "Cherche l'arbre aux feuilles brillantes à odeur de clou de girofle."
  },
  "Curcuma": {
    strategy: "Le curcuma est un rhizome (comme le gingembre) avec une chair orange vif caractéristique. La poudre de curcuma donne la couleur jaune au curry.",
    ecoFact: "Le curcuma est cultivé aux Antilles et en Asie. Sa curcumine (pigment orange) a des propriétés anti-inflammatoires reconnues. Il est utilisé dans la cuisine créole et comme colorant naturel pour les tissus.",
    hint: "Cherche le rhizome à la chair orange vif."
  },
  "Grenn anba fey": {
    strategy: "Le grenn anba fey (graines sous les feuilles, ou phyllanthus) est une petite plante dont les minuscules fruits sont alignés sous les feuilles, le long des tiges.",
    ecoFact: "Cette plante médicinale créole est utilisée aux Antilles pour les problèmes de foie et de reins. Elle pousse spontanément dans les jardins et est un trésor de la pharmacopée traditionnelle.",
    hint: "Cherche la plante avec de petits fruits alignés sous les feuilles."
  },
  "Romarin": {
    strategy: "Le romarin a des feuilles fines, allongées, vert foncé dessus et blanchâtres dessous, comme des aiguilles. Il dégage un parfum puissant et aromatique.",
    ecoFact: "Le romarin est une plante méditerranéenne adaptée aux Antilles. Il est utilisé en cuisine, en médecine traditionnelle et en cosmétique. Il attire les abeilles et résiste bien à la sécheresse.",
    hint: "Cherche la plante aux feuilles en aiguilles très parfumées."
  },
  "Aloé Vera": {
    strategy: "L'aloé vera a d'épaisses feuilles charnues en forme de lance, bordées de petites épines. Quand on coupe une feuille, un gel transparent apparaît.",
    ecoFact: "L'aloé vera est cultivé aux Antilles pour son gel aux multiples vertus : brûlures, cicatrisation, hydratation de la peau. Cette plante succulente nécessite peu d'eau et pousse facilement dans les jardins créoles.",
    hint: "Cherche la plante aux feuilles épaisses et charnues remplies de gel."
  },
  "Gwo Ten": {
    strategy: "Le gwo ten (ou grand thym, origan français) est un petit arbuste aux feuilles épaisses, charnues et très aromatiques, utilisé comme condiment aux Antilles.",
    ecoFact: "Le gwo ten est incontournable dans la cuisine créole : il parfume les courts-bouillons, les grillades et les bouillons. C'est aussi une plante médicinale utilisée contre la toux et les refroidissements.",
    hint: "Cherche le petit arbuste aux feuilles épaisses et aromatiques."
  },
  "Malnommée": {
    strategy: "La malnommée (ou euphorbe) est une petite plante rampante avec de minuscules feuilles et un latex blanc qui coule quand on la casse.",
    ecoFact: "La malnommée est une plante médicinale commune aux Antilles, utilisée en tisane pour les problèmes digestifs et les infections. Malgré son nom péjoratif, elle est très appréciée en médecine traditionnelle créole.",
    hint: "Cherche la petite plante rampante au latex blanc."
  },
  "Fruit à Pain": {
    strategy: "Le fruit à pain est un gros fruit rond et vert, à la peau bosselée, qui pousse sur un grand arbre tropical. Sa chair blanche et farineuse se cuisine comme un féculent.",
    ecoFact: "L'arbre à pain est essentiel aux Antilles : un seul arbre peut produire jusqu'à 200 fruits par an ! Il a nourri des générations. Le fruit se mange grillé, frit ou en purée. C'est un pilier de la cuisine créole.",
    hint: "Cherche le gros fruit vert et rond à la peau bosselée."
  },
  "Pomme Surette": {
    strategy: "La pomme surette (ou jujube) est un petit fruit rond, jaune-vert à brun, avec un noyau dur. Sa chair est croquante et acidulée.",
    ecoFact: "La pomme surette pousse sur un arbre épineux commun aux Antilles. Riche en vitamine C, elle est consommée fraîche ou confite. Les enfants antillais la cueillent directement sur l'arbre.",
    hint: "Cherche le petit fruit rond et acidulé jaune-vert."
  },
  "Pois d'Angole": {
    strategy: "Le pois d'Angole est une légumineuse tropicale dont les graines rondes poussent dans des gousses. La plante forme un petit arbuste aux feuilles composées de trois folioles.",
    ecoFact: "Le pois d'Angole est cultivé aux Antilles depuis des siècles. Riche en protéines, il est un aliment de base. L'arbre enrichit aussi le sol en azote, aidant les autres cultures à pousser.",
    hint: "Cherche les gousses contenant des graines rondes sur un arbuste."
  },
  "Patate Douce": {
    strategy: "La patate douce est un tubercule à la peau fine, rose, violette ou beige, avec une chair orange, blanche ou violette. Ses feuilles en forme de cœur sont aussi comestibles.",
    ecoFact: "La patate douce est l'un des aliments les plus nutritifs au monde : riche en vitamines A et C, en fibres et en antioxydants. Aux Antilles, elle se mange en purée, frite, ou en dessert.",
    hint: "Cherche le tubercule à la chair orangée."
  },
  "Pomme Malaka": {
    strategy: "La pomme malaka (ou jamalac, pomme de Malaisie) est un fruit en forme de cloche, rouge ou rose, à la chair blanche croquante et juteuse.",
    ecoFact: "La pomme malaka est originaire d'Asie du Sud-Est et s'est bien adaptée aux Antilles. Son arbre fournit de l'ombre et ses fruits désaltérants sont riches en eau, parfaits pour les climats tropicaux.",
    hint: "Cherche le fruit en forme de cloche rouge ou rose."
  },
  "Herbe Charpentier": {
    strategy: "L'herbe charpentier (ou herbe à charpentier) est une plante aux longues feuilles vertes et aux fleurs jaunes. Son nom vient de son utilisation pour soigner les coupures.",
    ecoFact: "L'herbe charpentier est une plante médicinale des Antilles : les charpentiers l'utilisaient autrefois pour soigner leurs blessures de travail. Ses feuilles fraîches, écrasées, ont des propriétés cicatrisantes.",
    hint: "Cherche la plante aux feuilles longues utilisée pour les coupures."
  },
  "Simen Kontra": {
    strategy: "Le simen kontra (ou semen contra, armoise) est une plante aromatique aux feuilles finement découpées, gris-vert, très parfumées.",
    ecoFact: "Le simen kontra est utilisé aux Antilles en médecine traditionnelle comme vermifuge (contre les vers intestinaux). C'est l'un des remèdes créoles les plus anciens, transmis de génération en génération.",
    hint: "Cherche la plante aux feuilles finement découpées gris-vert."
  },
  "Ti Poul Bwa": {
    strategy: "Le ti poul bwa (ou petit poulbois) est un petit arbuste aux feuilles aromatiques utilisées en tisane. Ses feuilles sont petites, ovales et dégagent une odeur mentholée.",
    ecoFact: "Le ti poul bwa est une plante médicinale endémique des Antilles, utilisée contre les refroidissements et la fièvre. C'est un trésor de la pharmacopée créole menacé par la déforestation.",
    hint: "Cherche le petit arbuste aux feuilles ovales et mentholées."
  }
};

// Find and add botanique associations
let botaniqueCount = 0;
for (const assoc of associations) {
  if (!assoc.texteId || !assoc.imageId) continue;
  const themes = assoc.themes || [];
  if (!themes.some(t => t === 'domain:botany' || t === 'botanique')) continue;
  
  const texte = textMap[assoc.texteId];
  const image = imgMap[assoc.imageId];
  if (!texte) continue;
  
  const key = `${assoc.texteId}:${assoc.imageId}`;
  if (strategies[key]) continue; // Already exists
  
  const name = texte.content;
  const facts = botaniqueFacts[name];
  if (facts) {
    strategies[key] = {
      title: name,
      ...facts
    };
    botaniqueCount++;
  }
}
console.log(`Botanique: ${botaniqueCount} new entries added`);

// ============================
// Also need Fruit à Pain association - find it
// ============================
for (const assoc of associations) {
  if (!assoc.texteId || !assoc.imageId) continue;
  const texte = textMap[assoc.texteId];
  if (texte && texte.content === 'Fruit à Pain') {
    const key = `${assoc.texteId}:${assoc.imageId}`;
    if (!strategies[key]) {
      strategies[key] = {
        title: "Fruit à Pain",
        ...botaniqueFacts["Fruit à Pain"]
      };
      console.log(`Found Fruit à Pain: ${key}`);
    }
  }
}

// ============================
// MULTIPLICATION strategies (cmath_* series)
// ============================
function multiplicationStrategy(a, b) {
  const result = a * b;
  const title = `${a} × ${b} = ${result}`;
  let strategy = '';
  let hint = '';

  // Special cases
  if (b === 1) {
    strategy = `${a} × 1 = ${a}. Tout nombre multiplié par 1 reste identique. C'est l'élément neutre de la multiplication.`;
    hint = `× 1 = le nombre lui-même`;
  } else if (a === 1) {
    strategy = `1 × ${b} = ${b}. Multiplier par 1 ne change rien.`;
    hint = `1 × n'importe quoi = ce nombre`;
  } else if (b === 2 || a === 2) {
    const other = a === 2 ? b : a;
    strategy = `${a} × ${b} = ${result}. C'est le double de ${other} : ${other} + ${other} = ${result}.`;
    hint = `Double de ${other}`;
  } else if (b === 10 || a === 10) {
    const other = a === 10 ? b : a;
    strategy = `${a} × ${b} = ${result}. Pour multiplier par 10, il suffit d'ajouter un 0 à droite du nombre : ${other}0 = ${result}.`;
    hint = `Ajouter un 0 : ${other} → ${result}`;
  } else if (b === 11 || a === 11) {
    const other = a === 11 ? b : a;
    if (other <= 9) {
      strategy = `${a} × ${b} = ${result}. Astuce pour la table de 11 : jusqu'à 9, on double le chiffre : ${other}${other} → mais vérifie ! ${a} × ${b} = ${result}.`;
    } else {
      strategy = `${a} × ${b} = ${result}. Décompose : ${a} × ${b} = ${a} × 10 + ${a} = ${a * 10} + ${a} = ${result}.`;
    }
    hint = `${a} × 10 + ${a}`;
  } else if (b === 5 || a === 5) {
    const other = a === 5 ? b : a;
    strategy = `${a} × ${b} = ${result}. La table de 5 finit toujours par 0 ou 5. ${result % 10 === 0 ? 'Nombre pair × 5 finit par 0.' : 'Nombre impair × 5 finit par 5.'}`;
    hint = `Table de 5 → finit par ${result % 10}`;
  } else if (a === b) {
    strategy = `${a} × ${b} = ${result}. C'est un carré parfait ! ${a} rangées de ${a} = ${result}. Ou : ${a} × ${a-1} + ${a} = ${a*(a-1)} + ${a} = ${result}.`;
    hint = `Carré de ${a}`;
  } else if (b === 9 || a === 9) {
    const other = a === 9 ? b : a;
    strategy = `${a} × ${b} = ${result}. Astuce de la table de 9 : ${other} × 9 = ${other} × 10 − ${other} = ${other * 10} − ${other} = ${result}. Aussi : les chiffres du résultat s'additionnent pour faire 9 (${Math.floor(result/10)} + ${result%10} = ${Math.floor(result/10) + result%10}).`;
    hint = `${other} × 10 − ${other}`;
  } else if (b === 12 || a === 12) {
    const other = a === 12 ? b : a;
    strategy = `${a} × ${b} = ${result}. Décompose : ${other} × 12 = ${other} × 10 + ${other} × 2 = ${other*10} + ${other*2} = ${result}.`;
    hint = `${other} × 10 + ${other} × 2`;
  } else {
    // General case: decompose
    const smaller = Math.min(a, b);
    const bigger = Math.max(a, b);
    strategy = `${a} × ${b} = ${result}. Décompose : ${bigger} × ${smaller} = ${bigger} × ${smaller-1} + ${bigger} = ${bigger*(smaller-1)} + ${bigger} = ${result}.`;
    hint = `${bigger*(smaller-1)} + ${bigger}`;
  }

  return { title, strategy, hint };
}

// Process all cmath_* multiplication associations
let multCount = 0;
for (const assoc of associations) {
  if (!assoc.calculId || !assoc.chiffreId) continue;
  const calc = calcMap[assoc.calculId];
  const num = numMap[assoc.chiffreId];
  if (!calc || !num) continue;
  
  const themes = assoc.themes || calc.themes || [];
  const isMultiplication = themes.some(t => t.startsWith('category:table_'));
  if (!isMultiplication) continue;
  
  const key = assoc.calculId;
  if (strategies[key]) continue; // Already exists
  
  // Parse the expression
  const content = calc.content;
  const match = content.match(/(\d+)\s*[×x]\s*(\d+)/);
  if (!match) continue;
  
  const a = parseInt(match[1]);
  const b = parseInt(match[2]);
  
  strategies[key] = multiplicationStrategy(a, b);
  multCount++;
}
console.log(`Multiplications: ${multCount} new entries added`);

// ============================
// ADDITION strategies
// ============================
function additionStrategy(expression, result) {
  const match = expression.match(/(\d+)\s*\+\s*(\d+)/);
  if (!match) return null;
  const a = parseInt(match[1]);
  const b = parseInt(match[2]);
  const sum = a + b;
  const title = `${a} + ${b} = ${sum}`;
  let strategy = '';
  let hint = '';

  if (a === b) {
    strategy = `${a} + ${b} = ${sum}. C'est un double ! ${a} + ${a} = ${sum}. Les doubles sont faciles à retenir.`;
    hint = `Double de ${a}`;
  } else if (a + b === 10) {
    strategy = `${a} + ${b} = 10. Ce sont des compléments à 10 ! Retiens les paires qui font 10 : 1+9, 2+8, 3+7, 4+6, 5+5.`;
    hint = `Compléments à 10`;
  } else if (a + b < 10) {
    strategy = `${a} + ${b} = ${sum}. Compte sur tes doigts ou utilise une droite numérique : pars de ${a} et avance de ${b}.`;
    hint = `Pars de ${a}, avance de ${b}`;
  } else if (a + b <= 20 && (a <= 10 && b <= 10)) {
    // Passage de la dizaine
    const compTo10 = 10 - Math.max(a, b);
    const rest = Math.min(a, b) - compTo10;
    strategy = `${a} + ${b} = ${sum}. Passe par 10 : ${Math.max(a,b)} + ${compTo10} = 10, puis 10 + ${rest} = ${sum}.`;
    hint = `Passer par 10`;
  } else if (a >= 10 || b >= 10) {
    // Larger additions
    const dizA = Math.floor(a / 10) * 10;
    const unitA = a % 10;
    const dizB = Math.floor(b / 10) * 10;
    const unitB = b % 10;
    if (unitA + unitB >= 10) {
      strategy = `${a} + ${b} = ${sum}. Décompose : ${dizA} + ${dizB} = ${dizA + dizB}, puis ${unitA} + ${unitB} = ${unitA + unitB}. Total : ${dizA + dizB} + ${unitA + unitB} = ${sum}. Attention à la retenue !`;
      hint = `${dizA + dizB} + ${unitA + unitB} (retenue)`;
    } else {
      strategy = `${a} + ${b} = ${sum}. Décompose : ${dizA} + ${dizB} = ${dizA + dizB}, puis ${unitA} + ${unitB} = ${unitA + unitB}. Total : ${dizA + dizB + unitA + unitB} = ${sum}.`;
      hint = `Dizaines + unités séparément`;
    }
  }

  return { title, strategy, hint };
}

let addCount = 0;
for (const assoc of associations) {
  if (!assoc.calculId || !assoc.chiffreId) continue;
  const calc = calcMap[assoc.calculId];
  const num = numMap[assoc.chiffreId];
  if (!calc || !num) continue;
  
  const themes = assoc.themes || calc.themes || [];
  if (!themes.some(t => t === 'category:addition')) continue;
  
  const key = assoc.calculId;
  if (strategies[key]) continue;
  
  const strat = additionStrategy(calc.content, num.content);
  if (strat) {
    strategies[key] = strat;
    addCount++;
  }
}
console.log(`Additions: ${addCount} new entries added`);

// ============================
// SOUSTRACTION strategies
// ============================
function soustractionStrategy(expression) {
  const match = expression.match(/(\d+)\s*[−\-]\s*(\d+)/);
  if (!match) return null;
  const a = parseInt(match[1]);
  const b = parseInt(match[2]);
  const result = a - b;
  const title = `${a} − ${b} = ${result}`;
  let strategy = '';
  let hint = '';

  if (b <= 10 && a <= 20) {
    strategy = `${a} − ${b} = ${result}. Pense à l'addition inverse : ${result} + ${b} = ${a}. Si tu connais l'addition, tu connais la soustraction !`;
    hint = `${result} + ${b} = ${a}`;
  } else if (a % 10 >= b % 10) {
    // Pas de retenue
    const dizA = Math.floor(a / 10) * 10;
    const unitA = a % 10;
    const dizB = Math.floor(b / 10) * 10;
    const unitB = b % 10;
    strategy = `${a} − ${b} = ${result}. Sans retenue : dizaines ${Math.floor(a/10)} − ${Math.floor(b/10)} = ${Math.floor(a/10) - Math.floor(b/10)}, unités ${unitA} − ${unitB} = ${unitA - unitB}. Résultat : ${result}.`;
    hint = `Dizaines et unités séparément`;
  } else {
    // Avec retenue
    strategy = `${a} − ${b} = ${result}. Avec retenue : pense à « combien faut-il ajouter à ${b} pour obtenir ${a} ? ». Compte de ${b} à ${a} : +${result}. Ou décompose : ${a} − ${Math.floor(b/10)*10} = ${a - Math.floor(b/10)*10}, puis ${a - Math.floor(b/10)*10} − ${b%10} = ${result}.`;
    hint = `De ${b} à ${a}, il y a ${result}`;
  }

  return { title, strategy, hint };
}

let souCount = 0;
for (const assoc of associations) {
  if (!assoc.calculId || !assoc.chiffreId) continue;
  const calc = calcMap[assoc.calculId];
  if (!calc) continue;
  
  const themes = assoc.themes || calc.themes || [];
  if (!themes.some(t => t === 'category:soustraction')) continue;
  
  const key = assoc.calculId;
  if (strategies[key]) continue;
  
  const strat = soustractionStrategy(calc.content);
  if (strat) {
    strategies[key] = strat;
    souCount++;
  }
}
console.log(`Soustractions: ${souCount} new entries added`);

// ============================
// Also handle c3 (15x2) if it has an association
// ============================
for (const assoc of associations) {
  if (assoc.calculId === 'c3') {
    if (!strategies['c3']) {
      strategies['c3'] = multiplicationStrategy(15, 2);
      console.log('Added c3 (15×2)');
    }
  }
  // c1 and c2 are additions (5+7, 3+4) 
  if (assoc.calculId === 'c1' && !strategies['c1']) {
    strategies['c1'] = additionStrategy('5+7', '12');
    console.log('Added c1 (5+7)');
  }
  if (assoc.calculId === 'c2' && !strategies['c2']) {
    strategies['c2'] = additionStrategy('3+4', '7');
    console.log('Added c2 (3+4)');
  }
}

// Write output
const output = {
  _version: 2,
  _description: "Stratégies d'apprentissage pour le mode Apprendre. Couvre zoologie, botanique, multiplications, additions et soustractions.",
  _stats: {
    total: Object.keys(strategies).length,
    generated: new Date().toISOString()
  },
  strategies
};

fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nTotal strategies: ${Object.keys(strategies).length}`);
console.log(`Written to ${outPath}`);
