#!/usr/bin/env node
/**
 * Merge Legacy Schools Script
 * 
 * Parses 3 legacy tbl_tp_schools SQL dump files from FUK, GSU, and FCET Gombe,
 * normalizes names, deduplicates, and produces a clean master_schools SQL migration.
 * 
 * Usage: node backend/scripts/merge_legacy_schools.js
 */

const fs = require('fs');
const path = require('path');

// ─── File paths ──────────────────────────────────────────────────────
const LEGACY_DIR = path.join(__dirname, '..', 'database', 'legacy_schools_list_tables');
const FILES = [
  { file: 'tbl_tp_schools (1).sql', institution: 'FUK', institutionId: 7 },
  { file: 'tbl_tp_schools (2).sql', institution: 'GSU', institutionId: 8 },
  { file: 'tbl_tp_schools (3).sql', institution: 'FCET_GOMBE', institutionId: 6 },
];
const OUTPUT_DIR = path.join(__dirname, '..', 'database', 'migrations');

// ─── Abbreviation expansion map ──────────────────────────────────────
const ABBREVIATIONS = [
  [/\bGOV\.\s*/gi, 'GOVERNMENT '],
  [/\bGOVT\.\s*/gi, 'GOVERNMENT '],
  [/\bGOVT\s+/gi, 'GOVERNMENT '],
  [/\bJUN\.\s*/gi, 'JUNIOR '],
  [/\bJUN\s+(?=SEC)/gi, 'JUNIOR '],       // "JUN SEC" without dot
  [/\bSEC\.\s*/gi, 'SECONDARY '],
  [/\bSEC\s+(?=SCH\b)/gi, 'SECONDARY '],  // "SEC SCH" without dot
  [/\bSEN\.\s*/gi, 'SENIOR '],
  [/\bSCH\.\s*/gi, 'SCHOOL '],
  [/\bSCH\s*$/gi, 'SCHOOL'],
  [/\bSCH\s+(?=[A-Z])/gi, 'SCHOOL '],     // "SCH GAJIN" without dot (mid-string)
  [/\bPRI\.\s*/gi, 'PRIMARY '],
  [/\bPRI\s+(?=SCH\b)/gi, 'PRIMARY '],     // "PRI SCH" without dot
  [/\bNUR\.\s*/gi, 'NURSERY '],
  [/\bNUR\s+/gi, 'NURSERY '],
  [/\bSCI\.\s*/gi, 'SCIENCE '],
  [/\bSCI\s+(?=SEC)/gi, 'SCIENCE '],       // "SCI SEC" without dot
  [/\bINT\.\s*/gi, 'INTERNATIONAL '],
  [/\bCOMP\.\s*/gi, 'COMPREHENSIVE '],
  [/\bCOMP\s+(?=DAY|SEC|JUN|SEN)/gi, 'COMPREHENSIVE '], // "COMP DAY" without dot
  [/\bVOC\.\s*/gi, 'VOCATIONAL '],
  [/\bVOATINAL\.\s*/gi, 'VOCATIONAL '],
  [/\bTRAIN\.\s*/gi, 'TRAINING '],
  [/\bCEN\s*\.\s*/gi, 'CENTER '],
  [/\bDAY\.\s*/gi, 'DAY '],
  [/\bSCENCE\b/gi, 'SCIENCE'],
  [/\bSCIENCES\b/gi, 'SCIENCE'],
  [/\bSCHOOL00L\b/gi, 'SCHOOL'],
  [/\bSCOOL\b/gi, 'SCHOOL'],
  [/\bPRACTISING\b/gi, 'PRACTISING'],
  [/\bINTERGRATED\b/gi, 'INTEGRATED'],
  [/\bMOMADIC\b/gi, 'NOMADIC'],
  [/\bECCDE\b/gi, 'ECCDE'],
];

// ─── Parse SQL INSERT statements ─────────────────────────────────────
function parseInsertValues(sql) {
  const records = [];
  // Match individual value tuples: (id, 'name', 'type', ...)
  const tupleRegex = /\((\d+),\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)',\s*(\d+(?:\.\d+)?),\s*(\d+),\s*(\d+),\s*'([^']*)',\s*(?:'([^']*)'|NULL)\)/g;

  let match;
  while ((match = tupleRegex.exec(sql)) !== null) {
    records.push({
      legacy_id: parseInt(match[1]),
      school_name: match[2].replace(/''/g, "'").replace(/\\'/g, "'"),
      school_type: match[3].replace(/''/g, "'"),
      school_category: match[4],
      state: match[5],
      lga: match[6],
      town: match[7],
      address: match[8].replace(/''/g, "'").replace(/\\'/g, "'"),
      kilometers: parseFloat(match[9]),
      students_limit: parseInt(match[10]),
      status: parseInt(match[11]),
      date_created: match[12],
      date_updated: match[13] || null,
    });
  }
  return records;
}

// ─── Normalize a school name ─────────────────────────────────────────
function normalizeName(name) {
  // Replace non-breaking spaces and other non-ASCII whitespace with regular spaces first
  let n = name.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');
  n = n.trim().toUpperCase();

  // Expand abbreviations
  for (const [pattern, replacement] of ABBREVIATIONS) {
    n = n.replace(pattern, replacement);
  }

  // Collapse multiple spaces
  n = n.replace(/\s{2,}/g, ' ').trim();

  // Remove trailing comma or period
  n = n.replace(/[,.]$/, '').trim();

  // Remove redundant type suffixes in parentheses (school_type field handles this)
  n = n.replace(/\s*\(SENIOR\)\s*$/i, '').trim();
  n = n.replace(/\s*\(JUNIOR\)\s*$/i, '').trim();
  n = n.replace(/\s*\(AFTERNOON\s+SHIFT\)\s*$/i, '').trim();

  return n;
}

// ─── Normalize state/LGA ─────────────────────────────────────────────
function normalizeLocation(val) {
  let v = val.trim().toUpperCase();
  // Remove trailing " LGA" suffix
  v = v.replace(/\s+LGA$/i, '');
  // Standardize known LGA names
  const lgaMap = {
    'YAMALTU-DEBA': 'YAMALTU DEBA',
    'YAMALTU DEBA': 'YAMALTU DEBA',
    'LARMURDE': 'LAMURDE',
    'BILLIRI LGA': 'BILLIRI',
  };
  return lgaMap[v] || v;
}

// ─── Map legacy school_type to new enum ──────────────────────────────
function mapSchoolType(legacyType) {
  const t = legacyType.trim().toUpperCase();
  if (t === 'PRIMARY' || t === 'PRIMARY SCHOOL') return 'primary';
  if (t === 'JUNIOR' || t === 'JUNIOR SECONDARY SCHOOL' || t.toLowerCase() === 'junior secondary school') return 'junior';
  if (t === 'SECONDARY' || t === 'SENIOR SECONDARY SCHOOL' || t.toLowerCase() === 'senior secondary school') return 'senior';
  // Default fallback
  if (t.includes('PRIMARY')) return 'primary';
  if (t.includes('JUNIOR')) return 'junior';
  return 'senior';
}

// ─── Infer category (public/private/others) ──────────────────────────
function inferCategory(normalizedName) {
  const publicKeywords = [
    'GOVERNMENT', 'CENTRAL', 'MODEL', 'COMMUNITY', 'POLICE CHILDREN',
    'GENERAL HASSAN', 'YELWA PRACTISING', 'RESOURCE CENTER',
  ];
  const privateKeywords = [
    'ACADEMY', 'INTERNATIONAL', 'MEMORIAL SCHOOL', 'FOUNDATION',
    'COLLEGE', 'JIBWIS', 'ECWA', 'BAPTIST', 'AQSAT', 'DARUL',
    'NURUL', 'ISLAMIC', 'MAILAMAI', 'HAJARAT', 'HAMDAN',
    'ANISA', 'GALAXY', 'SAFEST', 'NASARA', 'REVIVAL', 'GODLY',
    'EMANCIPATION', 'STANDARD', 'PACE SETTERS', 'BOOK PLANET',
    'ALHERI', 'ALHIDAYA', 'FEENEY', 'KISKI', 'TALENT', 'TUNGO',
    'NICHOLAS', 'UNITED NATION', 'VICTORY', 'GATEWAY',
    'LAMIDO PUTUK', 'PEN SCENT', 'JARMA', 'ARROWS',
  ];

  for (const kw of publicKeywords) {
    if (normalizedName.includes(kw)) return 'public';
  }
  for (const kw of privateKeywords) {
    if (normalizedName.includes(kw)) return 'private';
  }
  return 'public'; // Default to public for Nigerian government schools
}

// ─── Generate official_code from school name ─────────────────────────
// e.g. "GOVERNMENT DAY SECONDARY SCHOOL GYAWANA" → "GDSS GYAWANA"
// e.g. "CENTRAL PRIMARY SCHOOL LAFIYA" → "CPS LAFIYA"
// e.g. "BAPTIST ACADEMY GOMBE" → "BA GOMBE"

const CODE_ABBREVIATIONS = [
  // Order matters: longer phrases first to avoid partial matches
  [/^GOVERNMENT COMPREHENSIVE DAY SENIOR SECONDARY SCHOOL\b/i, 'GCDSSS'],
  [/^GOVERNMENT COMPREHENSIVE DAY SECONDARY SCHOOL\b/i, 'GCDSS'],
  [/^GOVERNMENT COMPREHENSIVE SENIOR SECONDARY SCHOOL\b/i, 'GCSSS'],
  [/^GOVERNMENT DAY SCIENCE SECONDARY SCHOOL\b/i, 'GDSSS'],
  [/^GOVERNMENT DAY SENIOR SECONDARY SCHOOL\b/i, 'GDSSS'],
  [/^GOVERNMENT DAY TECHNICAL COLLEGE\b/i, 'GDTC'],
  [/^GOVERNMENT DAY JUNIOR SECONDARY SCHOOL\b/i, 'GDJSS'],
  [/^GOVERNMENT DAY SECONDARY SCHOOL\b/i, 'GDSS'],
  [/^GOVERNMENT GIRLS SCIENCE SECONDARY SCHOOL\b/i, 'GGSSS'],
  [/^GOVERNMENT GIRLS SENIOR SECONDARY SCHOOL\b/i, 'GGSSS'],
  [/^GOVERNMENT SCIENCE TECHNICAL COLLEGE\b/i, 'GSTC'],
  [/^GOVERNMENT SCIENCE SECONDARY SCHOOL\b/i, 'GSSS'],
  [/^GOVERNMENT SENIOR SECONDARY SCHOOL\b/i, 'GSSS'],
  [/^GOVERNMENT COMPREHENSIVE SECONDARY SCHOOL\b/i, 'GCSS'],
  [/^GOVERNMENT COMPREHENSIVE JUNIOR SECONDARY SCHOOL\b/i, 'GCJSS'],
  [/^GOVERNMENT VOCATIONAL TRAINING CENTER\b/i, 'GVTC'],
  [/^GOVERNMENT JUNIOR SECONDARY SCHOOL\b/i, 'GJSS'],
  [/^GOVERNMENT SECONDARY SCHOOL\b/i, 'GSS'],
  [/^GOVERNMENT COLLEGE\b/i, 'GC'],
  [/^CENTRAL JUNIOR SECONDARY SCHOOL\b/i, 'CJSS'],
  [/^CENTRAL PRIMARY SCHOOL\b/i, 'CPS'],
  [/^CENTRAL PRIMARY\b/i, 'CP'],
  [/^CENTRAL PILOT SCIENCE PRIMARY SCHOOL\b/i, 'CPSPS'],
  [/^MODEL JUNIOR SECONDARY SCHOOL\b/i, 'MJSS'],
  [/^MODEL NURSERY & PRIMARY SCHOOL\b/i, 'MNPS'],
  [/^JUNIOR DAY SECONDARY SCHOOL\b/i, 'JDSS'],
  [/^POLICE CHILDREN SCHOOL\b/i, 'PCS'],
  [/^ECWA COMPREHENSIVE SECONDARY SCHOOL\b/i, 'ECSS'],
  [/^ECWA NURSERY & PRIMARY SCHOOL\b/i, 'ENPS'],
  [/^COMMUNITY DAY SECONDARY SCHOOL\b/i, 'CDSS'],
  [/^RESOURCE CENTER JUNIOR SECONDARY SCHOOL\b/i, 'RCJSS'],
  [/^FCE \(T\) DEMONSTRATION SENIOR SECONDARY SCHOOL\b/i, 'FCETDSSS'],
];

// Words to abbreviate to first letter when forming the code for non-matched names
const WORD_ABBREVS = {
  'GOVERNMENT': 'G',
  'DAY': 'D',
  'SECONDARY': 'S',
  'SCHOOL': 'S',
  'JUNIOR': 'J',
  'SENIOR': 'S',
  'PRIMARY': 'P',
  'COMPREHENSIVE': 'C',
  'SCIENCE': 'SC',
  'TECHNICAL': 'T',
  'COLLEGE': 'C',
  'VOCATIONAL': 'V',
  'TRAINING': 'T',
  'CENTER': 'C',
  'NURSERY': 'N',
  'MODEL': 'M',
  'CENTRAL': 'C',
  'GIRLS': 'G',
  'COMMUNITY': 'COM',
  'INTEGRATED': 'I',
  'PRACTISING': 'P',
  'DEMONSTRATION': 'D',
  'NOMADIC': 'NOM',
  'PILOT': 'P',
};

// These are "descriptor" words that form the abbreviation prefix; the rest is the location suffix
const DESCRIPTOR_WORDS = new Set([
  'GOVERNMENT', 'DAY', 'SECONDARY', 'SCHOOL', 'JUNIOR', 'SENIOR', 'PRIMARY',
  'COMPREHENSIVE', 'SCIENCE', 'TECHNICAL', 'COLLEGE', 'VOCATIONAL', 'TRAINING',
  'CENTER', 'NURSERY', 'MODEL', 'CENTRAL', 'GIRLS', 'BOYS', 'COMMUNITY',
  'INTEGRATED', 'PRACTISING', 'DEMONSTRATION', 'NOMADIC', 'PILOT', '&',
]);

function generateOfficialCode(name) {
  // Try known patterns first
  for (const [pattern, abbrev] of CODE_ABBREVIATIONS) {
    if (pattern.test(name)) {
      const location = name.replace(pattern, '').trim();
      return location ? `${abbrev} ${location}` : abbrev;
    }
  }

  // Fallback: split into descriptor prefix + location suffix
  const words = name.split(/\s+/);
  let prefixParts = [];
  let locationStart = -1;

  for (let i = 0; i < words.length; i++) {
    if (DESCRIPTOR_WORDS.has(words[i]) && words[i] !== '&') {
      prefixParts.push(WORD_ABBREVS[words[i]] || words[i][0]);
    } else {
      locationStart = i;
      break;
    }
  }

  if (prefixParts.length > 0 && locationStart > 0) {
    const prefix = prefixParts.join('');
    const location = words.slice(locationStart).join(' ');
    return `${prefix} ${location}`;
  }

  // No descriptor words found — it's a named institution (e.g. "BAPTIST ACADEMY GOMBE")
  // Use first letter of each word (up to 4) + remaining location
  if (words.length <= 3) {
    return words.map(w => w[0]).join('') + (words.length > 1 ? ' ' + words.slice(-1)[0] : '');
  }
  // Take initials of first 2 words + rest as location
  const initials = words.slice(0, 2).map(w => w[0]).join('');
  return `${initials} ${words.slice(2).join(' ')}`;
}

// ─── Generate a dedup key ────────────────────────────────────────────
function dedupKey(normalizedName, state, lga, schoolType) {
  // Further simplify name for dedup: remove common suffixes like "GOMBE", LGA names, etc.
  let key = normalizedName;

  // Remove common redundant suffixes to catch more duplicates
  // e.g., "GOVERNMENT DAY SECONDARY SCHOOL HERWAGANA" vs "GOVERNMENT DAY SECONDARY SCHOOL HERWAGANA, GOMBE"
  key = key.replace(/,\s*GOMBE\s*$/i, '');
  key = key.replace(/\s+GOMBE\s*$/i, '');

  return `${key}|${state}|${lga}|${schoolType}`;
}

// ─── Additional name cleaning for known duplicates ───────────────────
function furtherCleanName(name) {
  let n = name;

  // "GDSS" → "GOVERNMENT DAY SECONDARY SCHOOL"
  n = n.replace(/^GDSS\b/i, 'GOVERNMENT DAY SECONDARY SCHOOL');
  // "GSS" → "GOVERNMENT SECONDARY SCHOOL"
  n = n.replace(/^GSS\b/i, 'GOVERNMENT SECONDARY SCHOOL');
  // "GJSS" → "GOVERNMENT JUNIOR SECONDARY SCHOOL"  
  n = n.replace(/\bGJSS\b/gi, 'GOVERNMENT JUNIOR SECONDARY SCHOOL');
  // "GVTC" → "GOVERNMENT VOCATIONAL TRAINING CENTER"
  n = n.replace(/^GVTC\b/gi, 'GOVERNMENT VOCATIONAL TRAINING CENTER');
  n = n.replace(/^G\s*V\s*T\s*C\b/gi, 'GOVERNMENT VOCATIONAL TRAINING CENTER');
  // "G J S S" → "GOVERNMENT JUNIOR SECONDARY SCHOOL"
  n = n.replace(/^G\s+J\s+S\s+S\b/gi, 'GOVERNMENT JUNIOR SECONDARY SCHOOL');

  // Remove "(AFTERNOON SHIFT)" and similar parenthetical modifiers for dedup purposes
  // But keep it in the actual name - only strip for key generation

  // Collapse multiple spaces again
  n = n.replace(/\s{2,}/g, ' ').trim();

  return n;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

function main() {
  console.log('=== Merging Legacy School Data ===\n');

  // 1. Parse all files
  const allRecords = []; // { ...record, institution, institutionId }

  for (const { file, institution, institutionId } of FILES) {
    const filePath = path.join(LEGACY_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    const records = parseInsertValues(sql);
    console.log(`[${institution}] Parsed ${records.length} records from ${file}`);

    for (const r of records) {
      allRecords.push({ ...r, institution, institutionId });
    }
  }

  console.log(`\nTotal records across all files: ${allRecords.length}\n`);

  // 2. Normalize all records
  const normalizedRecords = allRecords.map(r => {
    const normalizedName = furtherCleanName(normalizeName(r.school_name));
    const state = normalizeLocation(r.state);
    const lga = normalizeLocation(r.lga);
    const ward = r.town.trim().toUpperCase() || lga;
    const schoolType = mapSchoolType(r.school_type);
    const category = inferCategory(normalizedName);
    const address = r.address.trim();

    return {
      ...r,
      normalizedName,
      state,
      lga,
      ward,
      schoolType,
      category,
      normalizedAddress: address,
    };
  });

  // 3. Deduplicate - group by normalized key
  const schoolMap = new Map(); // dedupKey → { master record, sources: [{institution, legacy_id, ...}] }

  for (const r of normalizedRecords) {
    // Replace non-ASCII with space, then collapse
    const cleanName = r.normalizedName.replace(/[^\x20-\x7E]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const cleanState = r.state.replace(/[^\x20-\x7E]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const cleanLga = r.lga.replace(/[^\x20-\x7E]/g, ' ').replace(/\s{2,}/g, ' ').trim();

    const key = dedupKey(cleanName, cleanState, cleanLga, r.schoolType);


    if (schoolMap.has(key)) {
      const existing = schoolMap.get(key);
      existing.sources.push({
        institution: r.institution,
        institutionId: r.institutionId,
        legacy_id: r.legacy_id,
        school_category: r.school_category,
        kilometers: r.kilometers,
        students_limit: r.students_limit,
        status: r.status,
        original_name: r.school_name,
      });
      // Prefer active status
      if (r.status === 1 && existing.status !== 'active') {
        existing.status = 'active';
      }
      // Use the longer/more complete address
      if (r.normalizedAddress.length > (existing.address || '').length) {
        existing.address = r.normalizedAddress;
      }
    } else {
      schoolMap.set(key, {
        name: cleanName,
        schoolType: r.schoolType,
        category: r.category,
        state: cleanState,
        lga: cleanLga,
        ward: r.ward,
        address: r.normalizedAddress,
        status: r.status === 1 ? 'active' : 'inactive',
        sources: [{
          institution: r.institution,
          institutionId: r.institutionId,
          legacy_id: r.legacy_id,
          school_category: r.school_category,
          kilometers: r.kilometers,
          students_limit: r.students_limit,
          status: r.status,
          original_name: r.school_name,
        }],
      });
    }
  }

  console.log(`Unique schools after first dedup pass: ${schoolMap.size}`);

  // 3b. Second-pass dedup: merge entries that share exact name+state+lga+type
  //     (catches any leftovers from encoding/whitespace differences)
  const finalMap = new Map();
  for (const [, entry] of schoolMap) {
    const key2 = `${entry.name}|${entry.state}|${entry.lga}|${entry.schoolType}`;
    if (finalMap.has(key2)) {
      const existing = finalMap.get(key2);
      existing.sources.push(...entry.sources);
      if (entry.status === 'active') existing.status = 'active';
      if ((entry.address || '').length > (existing.address || '').length) {
        existing.address = entry.address;
      }
    } else {
      finalMap.set(key2, { ...entry });
    }
  }
  // Replace schoolMap values with finalMap
  const deduped = Array.from(finalMap.values());
  console.log(`Unique schools after second dedup pass: ${deduped.length}\n`);

  // 4. Post-dedup: Find remaining near-duplicates using fuzzy matching
  const masterSchools = deduped;

  // Check for schools that may still be duplicates after normalization
  const nameIndex = new Map(); // short name → [indices]
  for (let i = 0; i < masterSchools.length; i++) {
    const shortName = masterSchools[i].name
      .replace(/\s*\(SENIOR\)\s*/gi, '')
      .replace(/\s*\(JUNIOR\)\s*/gi, '')
      .replace(/\s*\(AFTERNOON\s+SHIFT\)\s*/gi, '')
      .replace(/\s*(SENIOR|JUNIOR)\s*$/i, '')
      .trim();
    const key = `${shortName}|${masterSchools[i].state}|${masterSchools[i].lga}|${masterSchools[i].schoolType}`;
    if (!nameIndex.has(key)) nameIndex.set(key, []);
    nameIndex.get(key).push(i);
  }

  // Log potential remaining duplicates for review
  let dupeCount = 0;
  for (const [key, indices] of nameIndex) {
    if (indices.length > 1) {
      const schools = indices.map(i => ({
        idx: i,
        name: masterSchools[i].name,
        type: masterSchools[i].schoolType,
        status: masterSchools[i].status,
      }));
      // Only flag if same type
      const types = new Set(schools.map(s => s.type));
      if (types.size === 1) {
        dupeCount++;
        if (dupeCount <= 20) {
          console.log(`  POTENTIAL DUPLICATE: ${schools.map(s => `"${s.name}" (${s.type}, ${s.status})`).join(' vs ')}`);
        }
      }
    }
  }
  if (dupeCount > 20) console.log(`  ... and ${dupeCount - 20} more potential duplicates`);
  if (dupeCount > 0) console.log('');

  // 5. Sort schools: by state, lga, type, name
  masterSchools.sort((a, b) => {
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    if (a.lga !== b.lga) return a.lga.localeCompare(b.lga);
    const typeOrder = { primary: 0, junior: 1, senior: 2, both: 3 };
    if (typeOrder[a.schoolType] !== typeOrder[b.schoolType]) return typeOrder[a.schoolType] - typeOrder[b.schoolType];
    return a.name.localeCompare(b.name);
  });

  // 6. Generate SQL
  const escapeSql = (str) => str.replace(/'/g, "''").replace(/\\/g, '\\\\');

  let sql = `-- Master Schools Data Migration
-- Generated from 3 legacy institution databases: FUK, GSU, FCET Gombe
-- Generated on: ${new Date().toISOString().split('T')[0]}
-- Total unique schools: ${masterSchools.length}
--
-- This migration populates the master_schools table with cleaned, deduplicated
-- school data from legacy tbl_tp_schools tables.
-- 
-- Run 039_institution_schools_data.sql after this to link schools to institutions.

-- Clear existing data (if re-running)
-- DELETE FROM master_schools;

-- ═══════════════════════════════════════════════════════════════════════
-- INSERT master_schools
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO master_schools (
  name, official_code, school_type, category, state, lga, ward, address,
  is_verified, status, notes, created_at, updated_at
) VALUES
`;

  const values = [];
  const codeTracker = new Map(); // Track used codes to handle duplicates

  for (let i = 0; i < masterSchools.length; i++) {
    const s = masterSchools[i];
    let code = generateOfficialCode(s.name);

    // Handle duplicate codes by appending numeric suffix
    if (codeTracker.has(code)) {
      const count = codeTracker.get(code) + 1;
      codeTracker.set(code, count);
      code = `${code} ${count}`;
    } else {
      codeTracker.set(code, 1);
    }
    // Store the final code on the school object for institution_schools reference
    s.officialCode = code;

    const notes = `Sources: ${s.sources.map(src => `${src.institution}(#${src.legacy_id})`).join(', ')}`;

    values.push(
      `('${escapeSql(s.name)}', '${escapeSql(code)}', '${s.schoolType}', '${s.category}', '${escapeSql(s.state)}', '${escapeSql(s.lga)}', '${escapeSql(s.ward)}', '${escapeSql(s.address || '')}', 0, '${s.status}', '${escapeSql(notes)}', NOW(), NOW())`
    );
  }

  sql += values.join(',\n') + ';\n';

  // 7. Write master_schools migration
  const masterFile = path.join(OUTPUT_DIR, '038_master_schools_data.sql');
  fs.writeFileSync(masterFile, sql, 'utf8');
  console.log(`\nMaster schools written to: ${masterFile}`);

  // 8. Generate institution_schools linking SQL (separate migration)
  let linkSql = `-- Institution Schools Linking Migration
-- Generated from 3 legacy institution databases: FUK, GSU, FCET Gombe
-- Generated on: ${new Date().toISOString().split('T')[0]}
--
-- This migration links existing master_schools to their respective institutions
-- based on legacy tbl_tp_schools data. Run AFTER 038_master_schools_data.sql.
--
-- institution_id mapping (from production institutions table):
--   FUK (Federal University Kashere) = 7
--   GSU (Gombe State University) = 8
--   FCET Gombe (Federal College of Education Technical Gombe) = 6

`;

  // Group links by institution for clarity
  const linksByInstitution = { 7: [], 8: [], 6: [] }; // FUK, GSU, FCET_GOMBE
  const institutionNames = { 7: 'FUK', 8: 'GSU', 6: 'FCET_GOMBE' };

  for (let i = 0; i < masterSchools.length; i++) {
    const s = masterSchools[i];
    const code = s.officialCode;

    for (const src of s.sources) {
      const locCategory = src.school_category.trim().toLowerCase() === 'inside' ? 'inside' : 'outside';
      const instStatus = src.status === 1 ? 'active' : 'inactive';

      linksByInstitution[src.institutionId].push(
        `(${src.institutionId}, (SELECT id FROM master_schools WHERE official_code = '${escapeSql(code)}'), '${locCategory}', ${src.kilometers}, ${src.students_limit}, '${instStatus}', 'Legacy ID: ${src.legacy_id}', NOW(), NOW())`
      );
    }
  }

  // Write each institution's links as a separate INSERT for clarity and easier debugging
  for (const [instId, links] of Object.entries(linksByInstitution)) {
    if (links.length === 0) continue;
    const instName = institutionNames[instId];
    linkSql += `-- ═══════════════════════════════════════════════════════════════════════
-- ${instName} (institution_id = ${instId}) — ${links.length} schools
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO institution_schools (
  institution_id, master_school_id, location_category, distance_km,
  student_capacity, status, notes, created_at, updated_at
) VALUES
`;
    linkSql += links.join(',\n') + ';\n\n';
  }

  const linkFile = path.join(OUTPUT_DIR, '039_institution_schools_data.sql');
  fs.writeFileSync(linkFile, linkSql, 'utf8');
  console.log(`Institution schools written to: ${linkFile}`);

  const totalLinks = Object.values(linksByInstitution).reduce((sum, arr) => sum + arr.length, 0);
  for (const [instId, links] of Object.entries(linksByInstitution)) {
    console.log(`  ${institutionNames[instId]} (id=${instId}): ${links.length} links`);
  }

  // 9. Summary stats
  const stats = {
    totalParsed: allRecords.length,
    uniqueSchools: masterSchools.length,
    byType: {},
    byState: {},
    byCategory: {},
    byStatus: {},
    institutionLinks: totalLinks,
  };

  for (const s of masterSchools) {
    stats.byType[s.schoolType] = (stats.byType[s.schoolType] || 0) + 1;
    stats.byState[s.state] = (stats.byState[s.state] || 0) + 1;
    stats.byCategory[s.category] = (stats.byCategory[s.category] || 0) + 1;
    stats.byStatus[s.status] = (stats.byStatus[s.status] || 0) + 1;
  }

  console.log('\n=== Summary ===');
  console.log(`Total parsed records: ${stats.totalParsed}`);
  console.log(`Unique master schools: ${stats.uniqueSchools}`);
  console.log(`Institution-school links: ${stats.institutionLinks}`);
  console.log(`\nBy Type:`, stats.byType);
  console.log(`By State:`, stats.byState);
  console.log(`By Category:`, stats.byCategory);
  console.log(`By Status:`, stats.byStatus);

  // 10. Write a CSV for manual review
  const csvFile = path.join(LEGACY_DIR, 'master_schools_review.csv');
  let csv = 'ID,Official_Code,Name,Type,Category,State,LGA,Ward,Address,Status,Sources\n';
  for (let i = 0; i < masterSchools.length; i++) {
    const s = masterSchools[i];
    const sources = s.sources.map(src => `${src.institution}(#${src.legacy_id})`).join('; ');
    csv += `${i + 1},"${(s.officialCode || '').replace(/"/g, '""')}","${s.name.replace(/"/g, '""')}",${s.schoolType},${s.category},${s.state},${s.lga},"${s.ward.replace(/"/g, '""')}","${(s.address || '').replace(/"/g, '""')}",${s.status},"${sources}"\n`;
  }
  fs.writeFileSync(csvFile, csv, 'utf8');
  console.log(`\nCSV review file: ${csvFile}`);
}

main();
