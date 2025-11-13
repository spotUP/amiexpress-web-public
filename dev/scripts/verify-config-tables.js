#!/usr/bin/env node
/**
 * Verify Configuration Database Tables
 *
 * Checks that all configuration tables are created correctly
 *
 * Usage: node dev/scripts/verify-config-tables.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Expected tables
const EXPECTED_TABLES = [
  'system_config',
  'node_config',
  'conference_config',
  'doors',
  'system_languages',
  'languages',
  'protocols',
  'config_audit_log'
];

// Expected indexes
const EXPECTED_INDEXES = [
  'idx_node_config_node_number',
  'idx_conference_config_conference',
  'idx_doors_command',
  'idx_doors_type',
  'idx_doors_enabled',
  'idx_languages_code',
  'idx_languages_enabled',
  'idx_protocols_code',
  'idx_protocols_enabled',
  'idx_config_audit_table',
  'idx_config_audit_timestamp',
  'idx_config_audit_user'
];

// Expected triggers
const EXPECTED_TRIGGERS = [
  'update_system_config_timestamp',
  'update_node_config_timestamp',
  'update_conference_config_timestamp',
  'update_doors_timestamp',
  'update_system_languages_timestamp',
  'update_languages_timestamp',
  'update_protocols_timestamp'
];

function main() {
  console.log(`${colors.blue}Configuration Database Verification${colors.reset}\n`);

  // Find database file
  const dbDir = process.env.DATABASE_DIR || path.join(__dirname, '../../web/backend/data');
  const dbFile = process.env.DATABASE_FILE || 'amiexpress.db';
  const dbPath = path.join(dbDir, dbFile);

  console.log(`Database path: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.log(`${colors.red}✗ Database file not found${colors.reset}`);
    console.log(`${colors.yellow}Please start the server first to create the database${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.green}✓ Database file exists${colors.reset}\n`);

  // Open database
  const db = new Database(dbPath, { readonly: true });

  // Check tables
  console.log(`${colors.cyan}=== Tables ===${colors.reset}\n`);

  const allTables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  let foundTables = 0;
  EXPECTED_TABLES.forEach(tableName => {
    const exists = allTables.some(t => t.name === tableName);
    if (exists) {
      console.log(`${colors.green}✓${colors.reset} ${tableName}`);
      foundTables++;

      // Get row count
      try {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
        console.log(`  Rows: ${count.count}`);

        // Show sample data for singleton tables
        if (tableName === 'system_config' || tableName === 'system_languages') {
          const row = db.prepare(`SELECT * FROM ${tableName} LIMIT 1`).get();
          if (row) {
            if (tableName === 'system_config') {
              console.log(`  BBS Name: ${row.bbs_name}`);
              console.log(`  Sysop: ${row.sysop_name}`);
            } else if (tableName === 'system_languages') {
              console.log(`  Host Language: ${row.host_language}`);
            }
          }
        }
      } catch (e) {
        console.log(`  ${colors.yellow}Could not query table${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}✗${colors.reset} ${tableName} ${colors.red}(MISSING)${colors.reset}`);
    }
  });

  console.log(`\nFound ${foundTables}/${EXPECTED_TABLES.length} configuration tables`);

  // Check indexes
  console.log(`\n${colors.cyan}=== Indexes ===${colors.reset}\n`);

  const allIndexes = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='index' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  let foundIndexes = 0;
  EXPECTED_INDEXES.forEach(indexName => {
    const exists = allIndexes.some(i => i.name === indexName);
    if (exists) {
      console.log(`${colors.green}✓${colors.reset} ${indexName}`);
      foundIndexes++;
    } else {
      console.log(`${colors.red}✗${colors.reset} ${indexName} ${colors.red}(MISSING)${colors.reset}`);
    }
  });

  console.log(`\nFound ${foundIndexes}/${EXPECTED_INDEXES.length} configuration indexes`);

  // Check triggers
  console.log(`\n${colors.cyan}=== Triggers ===${colors.reset}\n`);

  const allTriggers = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='trigger'
    ORDER BY name
  `).all();

  let foundTriggers = 0;
  EXPECTED_TRIGGERS.forEach(triggerName => {
    const exists = allTriggers.some(t => t.name === triggerName);
    if (exists) {
      console.log(`${colors.green}✓${colors.reset} ${triggerName}`);
      foundTriggers++;
    } else {
      console.log(`${colors.red}✗${colors.reset} ${triggerName} ${colors.red}(MISSING)${colors.reset}`);
    }
  });

  console.log(`\nFound ${foundTriggers}/${EXPECTED_TRIGGERS.length} configuration triggers`);

  // Summary
  console.log(`\n${colors.cyan}=== Summary ===${colors.reset}\n`);

  const allFound = foundTables === EXPECTED_TABLES.length &&
                   foundIndexes === EXPECTED_INDEXES.length &&
                   foundTriggers === EXPECTED_TRIGGERS.length;

  if (allFound) {
    console.log(`${colors.green}✓ All configuration database objects created successfully!${colors.reset}`);
    console.log(`${colors.green}✓ Configuration system is ready to use${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}✗ Some configuration database objects are missing${colors.reset}`);
    console.log(`${colors.yellow}The server may need to be restarted to create all tables${colors.reset}\n`);
    process.exit(1);
  }
}

main();
