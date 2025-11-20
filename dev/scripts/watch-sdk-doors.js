#!/usr/bin/env node
/**
 * Watch SDK doors for changes and auto-install into the live BBS tree.
 *
 * - Debounces updates per door
 * - Optionally rebuilds door (npm run build) when scripts.build exists
 * - Re-runs install-sdk-doors.js for the changed door to refresh Commands/.info + doors/
 *
 * Usage:
 *   node dev/scripts/watch-sdk-doors.js [--no-build]
 *   GWALL_BBS_CODE=AMI node dev/scripts/watch-sdk-doors.js
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

const projectRoot = path.resolve(__dirname, '../..');
const sdkRoot = path.join(projectRoot, 'sdk/doors');
const installScript = path.join(projectRoot, 'dev/scripts/install-sdk-doors.js');

const args = process.argv.slice(2);
const buildEnabled = !args.includes('--no-build');

if (!fs.existsSync(sdkRoot)) {
  console.error(`[watch-sdk-doors] sdk/doors not found at ${sdkRoot}`);
  process.exit(1);
}

const pending = new Map(); // doorName -> timeout

function log(msg) {
  console.log(`[watch-sdk-doors] ${msg}`);
}

function readPackage(doorName) {
  try {
    const pkgPath = path.join(sdkRoot, doorName, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    console.error(`[watch-sdk-doors] Failed to read package for ${doorName}:`, err);
    return null;
  }
}

function runBuild(doorName) {
  if (!buildEnabled) {
    return Promise.resolve();
  }

  const pkg = readPackage(doorName);
  if (!pkg || !pkg.scripts || !pkg.scripts.build) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    log(`Building ${doorName}...`);
    const proc = spawn('npm', ['run', 'build'], {
      cwd: path.join(sdkRoot, doorName),
      stdio: 'inherit'
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[watch-sdk-doors] Build failed for ${doorName} (code ${code})`);
      } else {
        log(`Build complete for ${doorName}`);
      }
      resolve();
    });
  });
}

function runInstall(doorName) {
  return new Promise((resolve) => {
    log(`Installing ${doorName} into BBS...`);
    const proc = spawn('node', [installScript, '--door', doorName, '--quiet'], {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[watch-sdk-doors] Install failed for ${doorName} (code ${code})`);
      } else {
        log(`Install complete for ${doorName}`);
      }
      resolve();
    });
  });
}

async function syncDoor(doorName) {
  clearTimeout(pending.get(doorName));
  pending.delete(doorName);

  await runBuild(doorName);
  await runInstall(doorName);
}

function scheduleSync(doorName) {
  if (doorName.startsWith('.')) return; // skip hidden

  // debounce per door
  const existing = pending.get(doorName);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => syncDoor(doorName), 300);
  pending.set(doorName, timeout);
}

log(`Watching SDK doors at ${sdkRoot} (build=${buildEnabled ? 'on' : 'off'})`);

const watcher = chokidar.watch(`${sdkRoot}/*`, {
  ignored: /(^|\/)(node_modules|dist|\.git)/,
  persistent: true,
  ignoreInitial: true,
});

watcher.on('all', (event, filePath) => {
  const rel = path.relative(sdkRoot, filePath);
  const [doorName] = rel.split(path.sep);
  if (!doorName) return;

  log(`${event}: ${rel}`);
  scheduleSync(doorName);
});

process.on('SIGINT', () => {
  log('Stopping watcher...');
  watcher.close().then(() => process.exit(0));
});
