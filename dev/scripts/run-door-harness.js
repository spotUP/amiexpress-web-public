#!/usr/bin/env node
/**
 * Run a simple harness against a dev door in doors/<name>.
 * For TS/JS: relies on compiled dist/main.
 * For PY: runs python3 main.py.
 * For AREXX: runs npm run run.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function usage() {
  console.error('Usage: run-door-harness <doorName>');
  process.exit(1);
}

const doorName = process.argv[2];
if (!doorName) usage();

const projectRoot = path.resolve(__dirname, '../..');
const doorRoot = path.join(projectRoot, 'doors', doorName);
const pkgPath = path.join(doorRoot, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error(`Package not found for door ${doorName} at ${pkgPath}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const doorType = (pkg.doorType || pkg.type || '').toUpperCase();
const main = pkg.main || 'dist/index.js';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd: doorRoot, ...opts });
    proc.stdout?.on('data', d => process.stdout.write(d));
    proc.stderr?.on('data', d => process.stderr.write(d));
    proc.on('exit', code => resolve(code));
  });
}

async function mainRun() {
  if (doorType === 'PY' || doorType === 'PYTHON') {
    const interpreter = process.env.PYTHON || 'python3';
    const rc = await run(interpreter, [main]);
    process.exit(rc || 0);
  }

  if (doorType === 'AREXX' || doorType === 'REXX') {
    if (!pkg.scripts || !pkg.scripts.run) {
      console.error('AREXX door missing npm run "run" script');
      process.exit(1);
    }
    const rc = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'run']);
    process.exit(rc || 0);
  }

  // TS/JS fallback
  const entryPath = path.join(doorRoot, main);
  if (!fs.existsSync(entryPath)) {
    console.error(`Entry point missing: ${entryPath}`);
    process.exit(1);
  }
  const rc = await run('node', [entryPath]);
  process.exit(rc || 0);
}

mainRun();
