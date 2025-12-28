#!/usr/bin/env node

/**
 * Script automatique de configuration pour nouveau PC
 * Usage: node setup-new-pc.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n🚀 SETUP AUTOMATIQUE - CRAZY CHRONO\n');
console.log('Ce script va configurer automatiquement tout le projet.\n');

// Questions interactives
const questions = [
  {
    key: 'SUPABASE_URL',
    prompt: '📋 SUPABASE_URL (ex: https://xxxxx.supabase.co): ',
    default: 'https://your-project.supabase.co'
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    prompt: '🔑 SUPABASE_SERVICE_ROLE_KEY (la clé secrète): ',
    default: 'your_service_role_key_here'
  }
];

let answers = {};
let currentQuestion = 0;

function askQuestion() {
  if (currentQuestion >= questions.length) {
    // Toutes les questions posées, on configure
    setupProject();
    return;
  }

  const q = questions[currentQuestion];
  rl.question(q.prompt, (answer) => {
    answers[q.key] = answer.trim() || q.default;
    currentQuestion++;
    askQuestion();
  });
}

function setupProject() {
  rl.close();
  
  console.log('\n✅ Configuration reçue !\n');
  console.log('🔧 Création de server/.env...');

  // Créer le fichier .env
  const envContent = `# Configuration Crazy Chrono
# Généré automatiquement le ${new Date().toLocaleString()}

PORT=4000
FRONTEND_URL=http://localhost:3000

# Supabase
SUPABASE_URL=${answers.SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${answers.SUPABASE_SERVICE_ROLE_KEY}

# Session limit
FREE_SESSIONS_PER_DAY=3
`;

  const envPath = path.join(__dirname, 'server', '.env');
  
  try {
    fs.writeFileSync(envPath, envContent);
    console.log('✅ server/.env créé avec succès !');
  } catch (err) {
    console.error('❌ Erreur lors de la création de .env:', err.message);
    process.exit(1);
  }

  // Vérifier si node_modules existe
  console.log('\n🔧 Vérification des dépendances...');
  
  const rootNodeModules = path.join(__dirname, 'node_modules');
  const serverNodeModules = path.join(__dirname, 'server', 'node_modules');
  
  let needInstall = false;
  
  if (!fs.existsSync(rootNodeModules)) {
    console.log('📦 Installation des dépendances frontend...');
    try {
      execSync('npm install', { stdio: 'inherit', cwd: __dirname });
      console.log('✅ Dépendances frontend installées !');
    } catch (err) {
      console.error('❌ Erreur installation frontend');
    }
  } else {
    console.log('✅ Dépendances frontend déjà installées');
  }
  
  if (!fs.existsSync(serverNodeModules)) {
    console.log('📦 Installation des dépendances backend...');
    try {
      execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, 'server') });
      console.log('✅ Dépendances backend installées !');
    } catch (err) {
      console.error('❌ Erreur installation backend');
    }
  } else {
    console.log('✅ Dépendances backend déjà installées');
  }

  // Afficher le résumé
  console.log('\n' + '='.repeat(60));
  console.log('🎉 CONFIGURATION TERMINÉE AVEC SUCCÈS !');
  console.log('='.repeat(60));
  console.log('\n📋 PROCHAINES ÉTAPES:\n');
  console.log('1️⃣  Démarre le backend:');
  console.log('   cd server');
  console.log('   node server.js\n');
  console.log('2️⃣  Dans un autre terminal, démarre le frontend:');
  console.log('   npm start\n');
  console.log('3️⃣  Ouvre ton navigateur sur: http://localhost:3000\n');
  console.log('📄 Pour plus d\'infos: Ouvre SESSION_09_DEC_2025_REPRISE.md\n');
  console.log('✅ Comptes configurés:');
  console.log('   - verinmarius971@gmail.com (Admin)');
  console.log('   - crazy.chrono.contact@gmail.com (s001)');
  console.log('   - digyproservices@gmail.com (s002)');
  console.log('   - rulingplace@gmail.com (s003)');
  console.log('   - designisland97@gmail.com (s004)\n');
}

// Lancer les questions
askQuestion();
