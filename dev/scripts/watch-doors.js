#!/usr/bin/env node
/**
 * Watch live BBS doors/ for changes and auto-register them.
 *
 * - Debounces updates per door
 * - Builds a door if it has an npm "build" script (unless --no-build)
 * - Runs install-sdk-doors.js --door <name> to refresh Commands/.info and configs
 *
 * Usage:
 *   npm run dev:doors
 *   node dev/scripts/watch-doors.js [--no-build]
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

const projectRoot = path.resolve(__dirname, '../..');
const doorsRoot = path.join(projectRoot, 'doors');
const installScript = path.join(projectRoot, 'dev/scripts/install-sdk-doors.js');

const args = process.argv.slice(2);
const buildEnabled = !args.includes('--no-build');

if (!fs.existsSync(doorsRoot)) {
  console.error(`[watch-doors] doors/ not found at ${doorsRoot}`);
  process.exit(1);
}

const pending = new Map(); // doorName -> timeout

function log(msg) {
  console.log(`[watch-doors] ${msg}`);
}

function readPackage(doorName) {
  try {
    const pkgPath = path.join(doorsRoot, doorName, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    console.error(`[watch-doors] Failed to read package for ${doorName}:`, err);
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
      cwd: path.join(doorsRoot, doorName),
      stdio: 'inherit'
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[watch-doors] Build failed for ${doorName} (code ${code})`);
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
        console.error(`[watch-doors] Install failed for ${doorName} (code ${code})`);
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

log(`Watching BBS doors at ${doorsRoot} (build=${buildEnabled ? 'on' : 'off'})`);

const watcher = chokidar.watch(`${doorsRoot}/*`, {
  ignored: /(^|\/)(node_modules|dist|\.git)/,
  persistent: true,
  ignoreInitial: true,
});

watcher.on('all', (event, filePath) => {
  const rel = path.relative(doorsRoot, filePath);
  const [doorName] = rel.split(path.sep);
  if (!doorName) return;

  log(`${event}: ${rel}`);
  scheduleSync(doorName);
});

process.on('SIGINT', () => {
  log('Stopping watcher...');
  watcher.close().then(() => process.exit(0));
});
