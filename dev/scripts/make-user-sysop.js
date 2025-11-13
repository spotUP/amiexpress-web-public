#!/usr/bin/env node
/**
 * Make User Sysop
 *
 * Sets a user's security level to 255 (sysop) for testing config API
 *
 * Usage: node dev/scripts/make-user-sysop.js <username>
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

function main() {
  const username = process.argv[2];

  if (!username) {
    console.log(`${colors.red}Usage: node dev/scripts/make-user-sysop.js <username>${colors.reset}`);
    console.log(`\nExample: node dev/scripts/make-user-sysop.js testsysop`);
    process.exit(1);
  }

  console.log(`${colors.blue}Make User Sysop${colors.reset}\n`);

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
  const db = new Database(dbPath);

  // Find user
  const user = db.prepare('SELECT id, username, seclevel FROM users WHERE username = ?').get(username);

  if (!user) {
    console.log(`${colors.red}✗ User '${username}' not found${colors.reset}`);
    console.log(`\nAvailable users:`);

    const allUsers = db.prepare('SELECT username, seclevel FROM users ORDER BY username').all();
    allUsers.forEach(u => {
      const isSysop = u.seclevel >= 255 ? `${colors.green}(SYSOP)${colors.reset}` : '';
      console.log(`  - ${u.username} (secLevel: ${u.seclevel}) ${isSysop}`);
    });

    process.exit(1);
  }

  console.log(`Found user: ${user.username}`);
  console.log(`Current secLevel: ${user.seclevel}`);

  if (user.seclevel >= 255) {
    console.log(`${colors.green}✓ User is already a sysop${colors.reset}\n`);
    process.exit(0);
  }

  // Update security level
  try {
    db.prepare('UPDATE users SET seclevel = 255 WHERE username = ?').run(username);
    console.log(`${colors.green}✓ User '${username}' promoted to sysop (secLevel: 255)${colors.reset}`);
    console.log(`\n${colors.cyan}The user can now access configuration API endpoints${colors.reset}\n`);
    process.exit(0);
  } catch (error) {
    console.log(`${colors.red}✗ Failed to update user: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();
