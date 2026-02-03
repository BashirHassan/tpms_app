/**
 * MedeePay Pattern Migration - Activation Script
 * 
 * This script activates the new MedeePay pattern by:
 * 1. Backing up old files
 * 2. Renaming .new.js files to replace the old ones
 * 3. Deleting legacy files (repositories, old middleware, models)
 * 
 * Run: node scripts/activate-medeepay-pattern.js
 * 
 * To rollback: node scripts/activate-medeepay-pattern.js --rollback
 */

const fs = require('fs');
const path = require('path');

const BACKEND_SRC = path.join(__dirname, '..', 'src');
const FRONTEND_SRC = path.join(__dirname, '..', '..', 'frontend', 'src');

const isRollback = process.argv.includes('--rollback');

// Files to rename from .new.js to .js
const newFilesToActivate = {
  backend: {
    controllers: [
      'studentController',
      'schoolController',
      'academicController',
      'sessionController',
      'rankController',
      'routeController',
      'allowanceController',
      'letterController',
      'featureToggleController',
      'groupController',
      'acceptanceController',
      'monitoringController',
      'resultController',
      'paymentController',
      'postingController',
      'documentTemplateController',
      'schoolUpdateRequestController',
      'portalController',
      'publicController',
      'institutionController',
      'authController',
    ],
    routes: [
      'students',
      'schools',
      'academic',
      'sessions',
      'ranks',
      'routes',
      'allowances',
      'letters',
      'featureToggles',
      'groups',
      'acceptances',
      'monitoring',
      'results',
      'payments',
      'postings',
      'documentTemplates',
      'schoolUpdateRequests',
      'portal',
      'settings',
      'institutions',
      'auth',
      'public',
      'index',
    ],
    middleware: ['index'],
    db: ['database'],
  },
  frontend: {
    api: [
      'students',
      'schools',
      'academic',
      'sessions',
      'ranks',
      'routes',
      'allowances',
      'letters',
      'groups',
      'acceptances',
      'monitoring',
      'results',
      'payments',
      'postings',
      'features',
      'settings',
      'documentTemplates',
      'schoolUpdateRequests',
      'portal',
      'institutions',
      'auth',
      'publicApi',
      'users',
      'index',
    ],
  },
};

// Legacy files to delete
const filesToDelete = {
  backend: {
    db: [
      'BaseRepository.js',
      'repositories/index.js',
      'repositories/UserMembershipRepository.js',
    ],
    middleware: [
      'tenantContext.js',
      'institutionContext.js',
    ],
    controllers: [
      'utils.js',
    ],
    models: [
      // Keep: Institution.js, User.js (move useful methods to controllers)
      'index.js',
      'AcademicSession.js',
      'AuditLog.js',
      'Department.js',
      'DocumentPlaceholder.js',
      'DocumentTemplate.js',
      'Faculty.js',
      'FeatureToggle.js',
      'MergedGroup.js',
      'Monitoring.js',
      'PostingAllowance.js',
      'PostingLetter.js',
      'Program.js',
      'Rank.js',
      'Route.js',
      'School.js',
      'SchoolGroup.js',
      'SchoolLocationUpdateRequest.js',
      'SchoolPrincipalUpdateRequest.js',
      'ScoringCriteria.js',
      'Student.js',
      'StudentAcceptance.js',
      'StudentPayment.js',
      'StudentResult.js',
      'SupervisorPosting.js',
    ],
  },
};

// Root documentation files to delete
const rootDocsToDelete = [
  'ALIGNMENT_PLAN.md',
  'Centralize_Institution_Setting.md',
  'Document_Contents_Samples.md',
  'MULTI_INSTITUTION_ARCHITECTURE.md',
  'MULTI_TENANT_ARCHITECTURE_V2.md',
  'oldpostingspage.md',
  'prompt.md',
  'SCHOOL_COORDINATE_AND_PRINCIPAL_PUBLIC_DATA_UPDATE.md',
  'Student_Result_Upload.md',
  'SUBDOMAIN_MULTITENANT_ARCHITECTURE.md',
  'Super_Admin_Institution_Fix.md',
  'TPMS_LEGACY_ANALYSIS_AND_MIGRATION_GUIDE.md',
];

function renameFile(oldPath, newPath) {
  try {
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`  ✓ Renamed: ${path.basename(oldPath)} -> ${path.basename(newPath)}`);
      return true;
    } else {
      console.log(`  ⚠ Not found: ${oldPath}`);
      return false;
    }
  } catch (error) {
    console.error(`  ✗ Error renaming ${oldPath}: ${error.message}`);
    return false;
  }
}

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  ✓ Deleted: ${path.basename(filePath)}`);
      return true;
    } else {
      console.log(`  ⚠ Not found: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`  ✗ Error deleting ${filePath}: ${error.message}`);
    return false;
  }
}

function backupFile(filePath) {
  const backupPath = filePath + '.backup';
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
      console.log(`  ✓ Backed up: ${path.basename(filePath)}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`  ✗ Error backing up ${filePath}: ${error.message}`);
    return false;
  }
}

function restoreFromBackup(filePath) {
  const backupPath = filePath + '.backup';
  try {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath);
      fs.unlinkSync(backupPath);
      console.log(`  ✓ Restored: ${path.basename(filePath)}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`  ✗ Error restoring ${filePath}: ${error.message}`);
    return false;
  }
}

function activateNewFiles() {
  console.log('\n📦 Activating MedeePay Pattern...\n');
  
  // Backend
  console.log('Backend Controllers:');
  for (const file of newFilesToActivate.backend.controllers) {
    const oldPath = path.join(BACKEND_SRC, 'controllers', `${file}.js`);
    const newPath = path.join(BACKEND_SRC, 'controllers', `${file}.new.js`);
    
    if (fs.existsSync(newPath)) {
      backupFile(oldPath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
      renameFile(newPath, oldPath);
    }
  }
  
  console.log('\nBackend Routes:');
  for (const file of newFilesToActivate.backend.routes) {
    const oldPath = path.join(BACKEND_SRC, 'routes', `${file}.js`);
    const newPath = path.join(BACKEND_SRC, 'routes', `${file}.new.js`);
    
    if (fs.existsSync(newPath)) {
      backupFile(oldPath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
      renameFile(newPath, oldPath);
    }
  }
  
  console.log('\nBackend Middleware:');
  for (const file of newFilesToActivate.backend.middleware) {
    const oldPath = path.join(BACKEND_SRC, 'middleware', `${file}.js`);
    const newPath = path.join(BACKEND_SRC, 'middleware', `${file}.new.js`);
    
    if (fs.existsSync(newPath)) {
      backupFile(oldPath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
      renameFile(newPath, oldPath);
    }
  }
  
  console.log('\nBackend Database:');
  for (const file of newFilesToActivate.backend.db) {
    const newPath = path.join(BACKEND_SRC, 'db', `${file}.js`);
    if (fs.existsSync(newPath)) {
      console.log(`  ✓ Already exists: ${file}.js`);
    }
  }
  
  console.log('\nFrontend API:');
  for (const file of newFilesToActivate.frontend.api) {
    const oldPath = path.join(FRONTEND_SRC, 'api', `${file}.js`);
    const newPath = path.join(FRONTEND_SRC, 'api', `${file}.new.js`);
    
    if (fs.existsSync(newPath)) {
      backupFile(oldPath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
      renameFile(newPath, oldPath);
    }
  }
  
  console.log('\n✅ MedeePay Pattern Activated!\n');
}

function deleteLegacyFiles() {
  console.log('\n🗑️  Deleting Legacy Files...\n');
  
  console.log('Backend DB (Repositories):');
  for (const file of filesToDelete.backend.db) {
    const filePath = path.join(BACKEND_SRC, 'db', file);
    deleteFile(filePath);
  }
  
  console.log('\nBackend Middleware (Legacy):');
  for (const file of filesToDelete.backend.middleware) {
    const filePath = path.join(BACKEND_SRC, 'middleware', file);
    deleteFile(filePath);
  }
  
  console.log('\nBackend Controllers (Legacy):');
  for (const file of filesToDelete.backend.controllers) {
    const filePath = path.join(BACKEND_SRC, 'controllers', file);
    deleteFile(filePath);
  }
  
  console.log('\nBackend Models (Legacy):');
  for (const file of filesToDelete.backend.models) {
    const filePath = path.join(BACKEND_SRC, 'models', file);
    deleteFile(filePath);
  }
  
  console.log('\nRoot Documentation (Outdated):');
  const rootPath = path.join(__dirname, '..', '..');
  for (const file of rootDocsToDelete) {
    const filePath = path.join(rootPath, file);
    deleteFile(filePath);
  }
  
  console.log('\n✅ Legacy Files Deleted!\n');
}

function rollback() {
  console.log('\n⏪ Rolling Back MedeePay Pattern...\n');
  
  // Restore backend controllers
  console.log('Restoring Backend Controllers:');
  for (const file of newFilesToActivate.backend.controllers) {
    const filePath = path.join(BACKEND_SRC, 'controllers', `${file}.js`);
    restoreFromBackup(filePath);
  }
  
  // Restore backend routes
  console.log('\nRestoring Backend Routes:');
  for (const file of newFilesToActivate.backend.routes) {
    const filePath = path.join(BACKEND_SRC, 'routes', `${file}.js`);
    restoreFromBackup(filePath);
  }
  
  // Restore backend middleware
  console.log('\nRestoring Backend Middleware:');
  for (const file of newFilesToActivate.backend.middleware) {
    const filePath = path.join(BACKEND_SRC, 'middleware', `${file}.js`);
    restoreFromBackup(filePath);
  }
  
  // Restore frontend API
  console.log('\nRestoring Frontend API:');
  for (const file of newFilesToActivate.frontend.api) {
    const filePath = path.join(FRONTEND_SRC, 'api', `${file}.js`);
    restoreFromBackup(filePath);
  }
  
  console.log('\n✅ Rollback Complete!\n');
  console.log('Note: Deleted files cannot be restored. Use git to recover them.');
}

// Main execution
console.log('='.repeat(60));
console.log('  MedeePay Pattern Migration Script');
console.log('='.repeat(60));

if (isRollback) {
  rollback();
} else {
  activateNewFiles();
  
  console.log('\n⚠️  IMPORTANT: Review the changes before deleting legacy files.');
  console.log('Run with --delete-legacy to remove old files.\n');
  
  if (process.argv.includes('--delete-legacy')) {
    deleteLegacyFiles();
  }
}

console.log('='.repeat(60));
console.log('  Migration script complete');
console.log('='.repeat(60));
