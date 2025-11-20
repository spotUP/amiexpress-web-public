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

const args = process.argv.slice(2);
const doorFilter = [];
let quiet = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--door' || arg === '-d') {
    const name = args[i + 1];
    if (name) {
      doorFilter.push(name);
      i++;
    }
  } else if (arg === '--quiet' || arg === '-q') {
    quiet = true;
  }
}

const log = (...msgs) => {
  if (!quiet) console.log(...msgs);
};

log('[START] Installing SDK Example Doors to BBS...\n');
log(`Project root: ${projectRoot}`);
log(`SDK examples: ${sdkExamplesDir}`);
log(`Commands dir: ${commandsDir}`);
log(`Doors dir: ${doorsDir}\n`);

// Ensure directories exist
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
  log(`✓ Created Commands/BBSCmd/ directory`);
}

if (!fs.existsSync(doorsDir)) {
  fs.mkdirSync(doorsDir, { recursive: true });
  log(`✓ Created doors/ directory`);
}

function collectDoors(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter(name => {
    const doorPath = path.join(root, name);
    const pkgPath = path.join(doorPath, 'package.json');
    const isDoor = fs.existsSync(doorPath) && fs.statSync(doorPath).isDirectory() && fs.existsSync(pkgPath);
    if (!isDoor) return false;
    if (doorFilter.length > 0 && !doorFilter.includes(name)) return false;
    return true;
  });
}

// Prefer actual doors/ tree; fall back to sdk/doors for legacy dev setups
const doors = Array.from(new Set([
  ...collectDoors(doorsDir),
  ...collectDoors(sdkExamplesDir)
]));

log(`\nFound ${doors.length} SDK example doors:\n`);

let installed = 0;
let skipped = 0;
let errors = 0;

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    // Skip Node modules to keep installs lean
    if (path.basename(src).toLowerCase() === 'node_modules') {
      return;
    }

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(src, dest);
  }
}

function ensureGwallConfigs(targetDoorPath) {
  const shortcode =
    (process.env.GWALL_BBS_CODE || process.env.GWALL_SHORTCODE || process.env.BBS_SHORTCODE || process.env.BBS_CODE || 'AMI')
      .trim()
      .substring(0, 3)
      .toUpperCase();

  const settingsPath = path.join(targetDoorPath, 'GWall.cfg');
  const serverPath = path.join(targetDoorPath, 'GWALL.cfg');

  if (!fs.existsSync(settingsPath)) {
    const content = `4\n${shortcode}\n42626717772363\n`;
    fs.writeFileSync(settingsPath, content, 'utf8');
    console.log(`   ✓ Created default GWall.cfg (style/shortcode)`);
  } else {
    console.log(`   [INFO] GWall.cfg already present, leaving in place`);
  }

  if (!fs.existsSync(serverPath)) {
    const host = process.env.GWALL_HOST || 'scenewall.bbs.io';
    const port = process.env.GWALL_PORT || '1541';
    const timeout = process.env.GWALL_TIMEOUT || '10';
    const content = [
      '; Global Wall network configuration',
      `SERVERHOST=${host}`,
      `SERVERPORT=${port}`,
      '; timeout for connecting to server (seconds)',
      `TIMEOUT=${timeout}`,
      ''
    ].join('\n');
    fs.writeFileSync(serverPath, content, 'utf8');
    console.log(`   ✓ Created default GWALL.cfg (network)`);
  } else {
    console.log(`   [INFO] GWALL.cfg already present, leaving in place`);
  }
}

function ensureDoorAssets(doorName, targetDoorPath) {
  if (doorName.toLowerCase() === 'gwall') {
    ensureGwallConfigs(targetDoorPath);
  }
}

for (const doorName of doors) {
  try {
    const sourceFromDoors = path.join(doorsDir, doorName);
    const sourceFromSdk = path.join(sdkExamplesDir, doorName);
    const doorPath = fs.existsSync(sourceFromDoors) ? sourceFromDoors : sourceFromSdk;
    const pkgPath = path.join(doorPath, 'package.json');

    // Read package.json
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Get door metadata
    const bbsCommand = pkg.bbsCommand || doorName.toUpperCase().replace(/-/g, '');
    const doorType = pkg.doorType || 'TS';
    const description = pkg.description || '';
    const access = pkg.accessLevel !== undefined ? pkg.accessLevel : 0;

    log(`[PACKAGE] ${doorName}`);
    log(`   Command: ${bbsCommand}`);
    log(`   Type: ${doorType}`);

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
      log(`   [WARNING]  .info file already exists, skipping`);
      skipped++;
    } else {
      fs.writeFileSync(infoPath, infoContent);
      log(`   ✓ Created ${bbsCommand}.info`);
    }

    const targetDoorPath = path.join(doorsDir, doorName);
    const targetExists = fs.existsSync(targetDoorPath);
    const targetIsSymlink = targetExists && fs.lstatSync(targetDoorPath).isSymbolicLink();

    if (targetIsSymlink) {
      fs.unlinkSync(targetDoorPath);
      log(`   [INFO] Removed existing symlink doors/${doorName}`);
    }

    // If source is already the doors/ tree, just ensure configs. Otherwise copy from sdk/doors into doors/
    if (doorPath === targetDoorPath) {
      log(`   [INFO] Working directly from doors/${doorName}`);
    } else if (!targetExists || targetIsSymlink) {
      copyRecursive(doorPath, targetDoorPath);
      log(`   ✓ Copied to doors/${doorName}`);
    } else {
      log(`   [WARNING]  Door directory already exists in doors/, leaving in place`);
    }

    ensureDoorAssets(doorName, targetDoorPath);

    installed++;
    log('');

  } catch (error) {
    console.error(`   [ERROR] Error: ${error.message}\n`);
    errors++;
  }
}

log('\n' + '='.repeat(60));
log(`[OK] Installation complete!`);
log(`   Installed: ${installed}`);
log(`   Skipped: ${skipped}`);
log(`   Errors: ${errors}`);
log('='.repeat(60));

if (!quiet && installed > 0) {
  console.log('\n⚡ Restart the BBS server to load new commands:');
  console.log('   ./dev/scripts/kill-servers.sh && ./dev/scripts/start-servers.sh\n');
}
