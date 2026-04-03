const fs = require('fs');
const path = require('path');

const PASSWORD_HASH = '$2b$12$ydyARaMCO3KB7bJBelG4eumgF.xCsiQMLfr/dncEjFu65Ye8Ege0a';

// Legacy role_id → new role mapping
// tbl_roles: 1=Super Admin, 3=Field Monitor, 5=Head of TP, 8=Supervisor
// 2,4,6,7 are undefined legacy roles → default to supervisor
const ROLE_MAP = {
  '1': 'super_admin',
  '2': 'supervisor',
  '3': 'field_monitor',
  '4': 'supervisor',
  '5': 'head_of_teaching_practice',
  '6': 'field_monitor',
  '7': 'supervisor',
  '8': 'supervisor'
};

// Legacy rank_id → production rank_id mapping per institution
// Mapped by matching rank abbreviation/name between legacy tbl_ranks and production ranks table
const RANK_MAP = {
  // FCET Gombe (institution_id=1)
  // Legacy: 1=HOD, 2=CL, 3=PL, 4=SL, 5=LI, 6=LII, 7=LIII, 8=AL
  // Production: 1=CL, 2=PL, 3=SL, 4=LI, 5=LII, 6=LIII, 7=AL
  1: { '1': 1, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7 },

  // GSU (institution_id=2)
  // Legacy (same structure as FUK): 1=HOD, 2=PROF, 3=RD, 4=SL, 5=LI, 6=LII, 7=AL, 8=GA
  // Production: 8=PROF, 9=RD, 10=SL, 11=LI, 12=LII, 13=LIII, 14=AL, 15=GA
  2: { '1': 8, '2': 8, '3': 9, '4': 10, '5': 11, '6': 12, '7': 14, '8': 15 },

  // FUK (institution_id=3)
  // Legacy: 1=HOD, 2=PROF, 3=RD, 4=SL, 5=LI, 6=LII, 7=AL, 8=GA
  // Production: 16=PROF, 17=RD, 18=SL, 19=LI, 20=LII, 21=LIII, 22=AL, 23=GA
  3: { '1': 16, '2': 16, '3': 17, '4': 18, '5': 19, '6': 20, '7': 22, '8': 23 },
};

const SOURCES = [
  { file: 'tbl_users.sql', institutionId: 3, label: 'FUK (Federal University Kashere)' },
  { file: 'tbl_users (1).sql', institutionId: 1, label: 'FCET Gombe (Federal College of Education Technical)' },
  { file: 'tbl_users (2).sql', institutionId: 2, label: 'GSU (Gombe State University)' },
];

const SUPERVISOR_SOURCES = [
  { file: 'tbl_tp_supervisors (1).sql', institutionId: 1 }, // FCET Gombe
  { file: 'tbl_tp_supervisors.sql', institutionId: 2 },     // GSU
  { file: 'tbl_tp_supervisors (2).sql', institutionId: 3 }, // FUK
];

function extractUsers(sql) {
  const users = [];
  // Match each VALUES tuple in INSERT statements
  const tupleRegex = /\((\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)',\s*'(\d+)',\s*'(?:[^'\\]|\\.)*',\s*(\d+),\s*'(?:[^'\\]|\\.)*',\s*(?:'(?:[^'\\]|\\.)*'|NULL)\)/g;
  
  let match;
  while ((match = tupleRegex.exec(sql)) !== null) {
    users.push({
      fullname: match[3],
      email: match[4],
      phone: match[5],
      roleId: match[6],
      status: parseInt(match[7]),
    });
  }
  return users;
}

function extractSupervisors(sql) {
  const supervisors = [];
  // Columns: id, fullname, fileno, rank_id, email, phone, ...
  // Works for both GSU/FCET (10 cols) and FUK (11 cols with monitor)
  const tupleRegex = /\((\d+),\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)',\s*(\d+),\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)',/g;

  let match;
  while ((match = tupleRegex.exec(sql)) !== null) {
    supervisors.push({
      fullname: match[2],
      fileno: match[3],
      rankId: match[4],
      email: match[5],
      phone: match[6],
    });
  }
  return supervisors;
}

function escapeSql(str) {
  return str.replace(/\\/g, '').replace(/'/g, "''").replace(/\n/g, '').trim();
}

// Build supervisor lookup by email per institution
const supervisorLookup = {}; // { institutionId: { email: { rankId, fileno, phone } } }

for (const { file, institutionId } of SUPERVISOR_SOURCES) {
  const filePath = path.join(__dirname, '..', 'database', 'legacy_user_details', file);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const supervisors = extractSupervisors(sql);

  supervisorLookup[institutionId] = {};
  for (const sup of supervisors) {
    const emailKey = sup.email.toLowerCase().trim();
    if (emailKey) {
      supervisorLookup[institutionId][emailKey] = {
        rankId: sup.rankId,
        fileno: sup.fileno,
        phone: sup.phone,
      };
    }
  }
  console.log(`Loaded ${supervisors.length} supervisors for institution ${institutionId}`);
}

const seenEmails = new Set();
let output = '';

output += '-- Migration 042: Seed legacy users from previous TP management system\n';
output += '-- All users are assigned a uniform default password: 12345678 (bcrypt 12 rounds)\n';
output += '-- Legacy role mapping: 1=super_admin, 3=field_monitor, 5=head_of_teaching_practice, 8=supervisor\n';
output += '-- Undefined legacy roles (2,4,6,7) are mapped to supervisor by default\n';
output += '-- rank_id and file_number sourced from legacy tbl_tp_supervisors, mapped to production ranks\n';
output += '-- Duplicate emails across institutions are skipped (INSERT IGNORE)\n';
output += '-- developer@gmail.com entries are excluded (old system admin)\n\n';

let totalWithSupervisorData = 0;

for (const { file, institutionId, label } of SOURCES) {
  const filePath = path.join(__dirname, '..', 'database', 'legacy_users_table', file);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const users = extractUsers(sql);

  const filtered = users.filter(u => {
    if (u.email.toLowerCase().trim() === 'developer@gmail.com') return false;
    if (u.status !== 1) return false;
    const emailKey = u.email.toLowerCase().trim();
    if (seenEmails.has(emailKey)) return false;
    seenEmails.add(emailKey);
    return true;
  });

  const instSupervisors = supervisorLookup[institutionId] || {};
  let supMatches = 0;

  output += `-- ${label} (institution_id = ${institutionId}) - ${filtered.length} users\n`;
  output += `INSERT IGNORE INTO users (institution_id, name, email, phone, password_hash, role, rank_id, file_number, status) VALUES\n`;

  const rows = filtered.map(u => {
    const name = escapeSql(u.fullname);
    const email = u.email.toLowerCase().trim();
    const role = ROLE_MAP[u.roleId] || 'supervisor';

    // Check for supervisor data (rank, fileno, phone)
    const supData = instSupervisors[email];
    let phone, rankIdVal, fileNoVal;

    if (supData) {
      supMatches++;
      // Use supervisor phone if available, fallback to user phone
      phone = supData.phone.trim() || u.phone.trim();
      // Map legacy rank_id to production rank_id
      const rankMap = RANK_MAP[institutionId] || {};
      const prodRankId = rankMap[supData.rankId];
      rankIdVal = prodRankId ? `${prodRankId}` : 'NULL';
      fileNoVal = supData.fileno.trim() ? `'${escapeSql(supData.fileno.trim())}'` : 'NULL';
    } else {
      phone = u.phone.trim();
      rankIdVal = 'NULL';
      fileNoVal = 'NULL';
    }

    const phoneVal = phone ? `'${phone}'` : 'NULL';
    return `(${institutionId}, '${name}', '${escapeSql(email)}', ${phoneVal}, '${PASSWORD_HASH}', '${role}', ${rankIdVal}, ${fileNoVal}, 'active')`;
  });

  output += rows.join(',\n') + ';\n\n';
  totalWithSupervisorData += supMatches;
  console.log(`${label}: ${filtered.length} users, ${supMatches} matched with supervisor data`);
}

const outPath = path.join(__dirname, '..', 'database', 'migrations', '042_seed_legacy_users.sql');
fs.writeFileSync(outPath, output, 'utf-8');
console.log(`\nMigration generated: ${outPath}`);
console.log(`Total unique users: ${seenEmails.size}`);
console.log(`Users with supervisor data (rank/fileno/phone): ${totalWithSupervisorData}`);
