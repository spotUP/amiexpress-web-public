#!/usr/bin/env node
/**
 * Install SDK Example Doors to BBS
 *
 * This script:
 * 1. Reads all SDK example doors from sdk/doors/
 * 2. Generates .info files in Commands/BBSCmd/
 * 3. Copies door source files to doors/
 *
 * This makes SDK example doors work as REAL BBS doors.
 */

const fs = require('fs');
const path = require('path');

// Paths
const projectRoot = path.resolve(__dirname, '../..');
const sdkExamplesDir = path.join(projectRoot, 'sdk/doors');
const commandsDir = path.join(projectRoot, 'Commands/BBSCmd');
const doorsDir = path.join(projectRoot, 'doors');

console.log('[START] Installing SDK Example Doors to BBS...\n');
console.log(`Project root: ${projectRoot}`);
console.log(`SDK examples: ${sdkExamplesDir}`);
console.log(`Commands dir: ${commandsDir}`);
console.log(`Doors dir: ${doorsDir}\n`);

// Ensure directories exist
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
  console.log(`✓ Created Commands/BBSCmd/ directory`);
}

if (!fs.existsSync(doorsDir)) {
  fs.mkdirSync(doorsDir, { recursive: true });
  console.log(`✓ Created doors/ directory`);
}

// Get all SDK example doors
const doors = fs.readdirSync(sdkExamplesDir).filter(name => {
  const doorPath = path.join(sdkExamplesDir, name);
  const pkgPath = path.join(doorPath, 'package.json');
  return fs.statSync(doorPath).isDirectory() && fs.existsSync(pkgPath);
});

console.log(`\nFound ${doors.length} SDK example doors:\n`);

let installed = 0;
let skipped = 0;
let errors = 0;

for (const doorName of doors) {
  try {
    const doorPath = path.join(sdkExamplesDir, doorName);
    const pkgPath = path.join(doorPath, 'package.json');

    // Read package.json
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Get door metadata
    const bbsCommand = pkg.bbsCommand || doorName.toUpperCase().replace(/-/g, '');
    const doorType = pkg.doorType || 'TS';
    const description = pkg.description || '';
    const access = pkg.accessLevel !== undefined ? pkg.accessLevel : 0;

    console.log(`[PACKAGE] ${doorName}`);
    console.log(`   Command: ${bbsCommand}`);
    console.log(`   Type: ${doorType}`);

    // Generate .info file content
    const infoContent = [
      `BBSCMD=${bbsCommand}`,
      `TYPE=${doorType}`,
      `LOCATION=doors/${doorName}`,
      description ? `DESCRIPTION=${description}` : '',
      `ACCESS=${access}`,
      `MULTINODE=YES`,
      `PRIORITY=SAME`,
      ''
    ].filter(Boolean).join('\n');

    // Write .info file
    const infoPath = path.join(commandsDir, `${bbsCommand}.info`);
    if (fs.existsSync(infoPath)) {
      console.log(`   [WARNING]  .info file already exists, skipping`);
      skipped++;
    } else {
      fs.writeFileSync(infoPath, infoContent);
      console.log(`   ✓ Created ${bbsCommand}.info`);
    }

    // Copy door directory to doors/
    const targetDoorPath = path.join(doorsDir, doorName);
    if (fs.existsSync(targetDoorPath)) {
      console.log(`   [WARNING]  Door directory already exists in doors/, skipping copy`);
    } else {
      // Create symlink instead of copying (more efficient for development)
      fs.symlinkSync(doorPath, targetDoorPath, 'dir');
      console.log(`   ✓ Linked to doors/${doorName}`);
    }

    installed++;
    console.log('');

  } catch (error) {
    console.error(`   [ERROR] Error: ${error.message}\n`);
    errors++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`[OK] Installation complete!`);
console.log(`   Installed: ${installed}`);
console.log(`   Skipped: ${skipped}`);
console.log(`   Errors: ${errors}`);
console.log('='.repeat(60));

if (installed > 0) {
  console.log('\n⚡ Restart the BBS server to load new commands:');
  console.log('   ./dev/scripts/kill-servers.sh && ./dev/scripts/start-servers.sh\n');
}
