#!/usr/bin/env node
/**
 * Door Doctor - validates a door in doors/<name> (or a provided path)
 * Checks:
 *  - package.json exists and has doorType/bbsCommand/name
 *  - build script present (optional), dist/main exists
 *  - required configs present for known doors (gwall)
 */

const fs = require('fs');
const path = require('path');

function log(msg) {
  console.log(`[door-doctor] ${msg}`);
}

function fail(msg) {
  console.error(`[door-doctor] ERROR: ${msg}`);
}

function checkDoor(root) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    fail(`No package.json in ${root}`);
    return false;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const errors = [];
  const warnings = [];

  const doorType = (pkg.doorType || pkg.type || '').toUpperCase();
  const command = pkg.bbsCommand || '';
  const name = pkg.name || '';
  const main = pkg.main || 'dist/index.js';

  if (!doorType) errors.push('doorType/type missing');
  if (!command) errors.push('bbsCommand missing');
  if (!name) warnings.push('name missing');

  const entryPath = path.join(root, main);
  if (!fs.existsSync(entryPath)) {
    warnings.push(`entry point missing: ${main}`);
  }

  const hasBuild = pkg.scripts && pkg.scripts.build;
  if (!hasBuild && main.startsWith('dist/')) {
    warnings.push('no build script; dist may go stale');
  }

  // Special-case config checks
  if (path.basename(root).toLowerCase() === 'gwall') {
    const cfg1 = path.join(root, 'GWall.cfg');
    const cfg2 = path.join(root, 'GWALL.cfg');
    if (!fs.existsSync(cfg1)) warnings.push('GWall.cfg missing (style/shortcode)');
    if (!fs.existsSync(cfg2)) warnings.push('GWALL.cfg missing (network config)');
  }

  if (errors.length === 0 && warnings.length === 0) {
    log(`OK: ${path.basename(root)} looks healthy.`);
    return true;
  }

  if (errors.length) {
    fail(`Errors for ${path.basename(root)}: ${errors.join('; ')}`);
  }
  if (warnings.length) {
    warnings.forEach(w => log(`Warning: ${w}`));
  }
  return errors.length === 0;
}

function main() {
  const arg = process.argv[2];
  const projectRoot = path.resolve(__dirname, '..', '..');
  const doorsRoot = path.join(projectRoot, 'doors');
  const targets = [];

  if (arg) {
    const abs = path.isAbsolute(arg) ? arg : path.join(projectRoot, arg);
    targets.push(abs);
  } else {
    // Scan doors/ for package.json
    if (fs.existsSync(doorsRoot)) {
      for (const entry of fs.readdirSync(doorsRoot)) {
        const candidate = path.join(doorsRoot, entry);
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
          targets.push(candidate);
        }
      }
    }
  }

  if (targets.length === 0) {
    fail('No door targets found. Provide a path or ensure doors/<name>/package.json exists.');
    process.exit(1);
  }

  let allOk = true;
  for (const target of targets) {
    log(`Checking ${target}...`);
    const ok = checkDoor(target);
    if (!ok) allOk = false;
  }

  process.exit(allOk ? 0 : 1);
}

main();
