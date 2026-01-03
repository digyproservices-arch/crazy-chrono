#!/usr/bin/env node

/**
 * SCRIPT IMPORT CSV RECTORAT GUADELOUPE
 * 
 * Import massif écoles + classes + élèves depuis fichiers CSV
 * Utilisation: node scripts/import_rectorat_csv.js
 * 
 * Fichiers requis dans server/data/:
 * - ecoles_guadeloupe.csv
 * - classes_guadeloupe.csv
 * - eleves_guadeloupe.csv
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialiser Supabase avec SERVICE_ROLE_KEY (bypass RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configuration
const DATA_DIR = path.join(__dirname, '..', 'data');
const BATCH_SIZE = 1000; // Limite Supabase: 1000 rows par requête

/**
 * Importer écoles depuis CSV
 */
async function importSchools(csvPath) {
  console.log('\n📚 IMPORT ÉCOLES');
  console.log('================');
  
  const schools = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        schools.push({
          id: row.id,
          name: row.name,
          type: row.type,
          city: row.city,
          circonscription_id: row.circonscription_id,
          postal_code: row.postal_code,
          email: row.email,
          phone: row.phone
        });
      })
      .on('end', async () => {
        console.log(`📋 ${schools.length} écoles lues depuis CSV`);
        
        try {
          const { data, error } = await supabase
            .from('schools')
            .upsert(schools, { onConflict: 'id' });
          
          if (error) {
            console.error('❌ Erreur Supabase:', error.message);
            reject(error);
          } else {
            console.log(`✅ ${schools.length} écoles importées`);
            resolve({ total: schools.length, imported: schools.length });
          }
        } catch (err) {
          console.error('❌ Exception:', err);
          reject(err);
        }
      })
      .on('error', (err) => {
        console.error('❌ Erreur lecture CSV:', err);
        reject(err);
      });
  });
}

/**
 * Importer classes depuis CSV
 */
async function importClasses(csvPath) {
  console.log('\n📖 IMPORT CLASSES');
  console.log('=================');
  
  const classes = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        classes.push({
          id: row.id,
          school_id: row.school_id,
          name: row.name,
          level: row.level,
          teacher_name: row.teacher_name,
          teacher_email: row.teacher_email,
          student_count: parseInt(row.student_count) || 0
        });
      })
      .on('end', async () => {
        console.log(`📋 ${classes.length} classes lues depuis CSV`);
        
        try {
          const { data, error } = await supabase
            .from('classes')
            .upsert(classes, { onConflict: 'id' });
          
          if (error) {
            console.error('❌ Erreur Supabase:', error.message);
            reject(error);
          } else {
            console.log(`✅ ${classes.length} classes importées`);
            resolve({ total: classes.length, imported: classes.length });
          }
        } catch (err) {
          console.error('❌ Exception:', err);
          reject(err);
        }
      })
      .on('error', (err) => {
        console.error('❌ Erreur lecture CSV:', err);
        reject(err);
      });
  });
}

/**
 * Importer élèves depuis CSV (avec batch processing)
 */
async function importStudents(csvPath) {
  console.log('\n👥 IMPORT ÉLÈVES');
  console.log('================');
  
  const students = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        students.push({
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          full_name: `${row.first_name} ${row.last_name.charAt(0)}.`,
          level: row.level,
          class_id: row.class_id,
          school_id: row.school_id,
          email: row.email || null,
          licensed: row.licensed === 'true' || row.licensed === '1',
          avatar_url: '/avatars/default.png'
        });
      })
      .on('end', async () => {
        console.log(`📋 ${students.length} élèves lus depuis CSV`);
        
        try {
          let imported = 0;
          let errors = 0;
          
          // Import par batch de 1000 (limite Supabase)
          for (let i = 0; i < students.length; i += BATCH_SIZE) {
            const batch = students.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(students.length / BATCH_SIZE);
            
            console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} élèves)`);
            
            const { data, error } = await supabase
              .from('students')
              .upsert(batch, { onConflict: 'id' });
            
            if (error) {
              console.error(`❌ Erreur batch ${batchNum}:`, error.message);
              errors += batch.length;
            } else {
              imported += batch.length;
              console.log(`✅ ${imported}/${students.length} élèves importés`);
            }
            
            // Pause 500ms entre batches (éviter rate limit)
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          console.log(`\n✅ Import terminé: ${imported} réussis, ${errors} erreurs`);
          resolve({ total: students.length, imported, errors });
          
        } catch (err) {
          console.error('❌ Exception:', err);
          reject(err);
        }
      })
      .on('error', (err) => {
        console.error('❌ Erreur lecture CSV:', err);
        reject(err);
      });
  });
}

/**
 * Vérification post-import
 */
async function verifyImport() {
  console.log('\n🔍 VÉRIFICATION POST-IMPORT');
  console.log('===========================');
  
  try {
    // 1. Compter entités
    const { data: countData, error: countError } = await supabase
      .rpc('count_all_entities'); // Fonction SQL custom (à créer)
    
    if (!countError && countData) {
      console.log('\n📊 Statistiques:');
      console.log(`   Écoles: ${countData.schools}`);
      console.log(`   Classes: ${countData.classes}`);
      console.log(`   Élèves: ${countData.students}`);
      console.log(`   Licenciés: ${countData.licensed_students}`);
    }
    
    // 2. Vérifier intégrité référentielle
    const { data: orphanClasses } = await supabase
      .from('classes')
      .select('id, name, school_id')
      .not('school_id', 'in', `(SELECT id FROM schools)`);
    
    if (orphanClasses && orphanClasses.length > 0) {
      console.warn(`\n⚠️  ${orphanClasses.length} classes orphelines (school_id invalide)`);
    }
    
    const { data: orphanStudents } = await supabase
      .from('students')
      .select('id, full_name, class_id')
      .not('class_id', 'in', `(SELECT id FROM classes)`);
    
    if (orphanStudents && orphanStudents.length > 0) {
      console.warn(`\n⚠️  ${orphanStudents.length} élèves orphelins (class_id invalide)`);
    }
    
    if ((!orphanClasses || orphanClasses.length === 0) && 
        (!orphanStudents || orphanStudents.length === 0)) {
      console.log('\n✅ Intégrité référentielle OK');
    }
    
  } catch (err) {
    console.error('❌ Erreur vérification:', err);
  }
}

/**
 * Main
 */
async function main() {
  console.log('🏛️  IMPORT RECTORAT GUADELOUPE');
  console.log('===============================');
  console.log(`📂 Répertoire données: ${DATA_DIR}`);
  
  const startTime = Date.now();
  
  try {
    // Vérifier fichiers CSV existent
    const schoolsFile = path.join(DATA_DIR, 'ecoles_guadeloupe.csv');
    const classesFile = path.join(DATA_DIR, 'classes_guadeloupe.csv');
    const studentsFile = path.join(DATA_DIR, 'eleves_guadeloupe.csv');
    
    if (!fs.existsSync(schoolsFile)) {
      throw new Error(`Fichier manquant: ${schoolsFile}`);
    }
    if (!fs.existsSync(classesFile)) {
      throw new Error(`Fichier manquant: ${classesFile}`);
    }
    if (!fs.existsSync(studentsFile)) {
      throw new Error(`Fichier manquant: ${studentsFile}`);
    }
    
    // 1. Importer écoles
    const schoolsResult = await importSchools(schoolsFile);
    
    // 2. Importer classes
    const classesResult = await importClasses(classesFile);
    
    // 3. Importer élèves (avec batches)
    const studentsResult = await importStudents(studentsFile);
    
    // 4. Vérification
    await verifyImport();
    
    // Résumé final
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n================================');
    console.log('✅ IMPORT TERMINÉ AVEC SUCCÈS');
    console.log('================================');
    console.log(`⏱️  Durée: ${duration}s`);
    console.log(`📚 Écoles: ${schoolsResult.imported}`);
    console.log(`📖 Classes: ${classesResult.imported}`);
    console.log(`👥 Élèves: ${studentsResult.imported}/${studentsResult.total}`);
    
    if (studentsResult.errors > 0) {
      console.warn(`⚠️  Erreurs: ${studentsResult.errors} élèves non importés`);
    }
    
    console.log('\n💡 Prochaines étapes:');
    console.log('   1. Vérifier dans Supabase Dashboard');
    console.log('   2. Exécuter requêtes SQL vérification (voir GESTION_LICENCES_RECTORAT.md)');
    console.log('   3. Activer licences si nécessaire');
    console.log('   4. Tester Mode Entraînement avec vrais comptes\n');
    
  } catch (error) {
    console.error('\n❌ ÉCHEC IMPORT:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Exécuter
main();
