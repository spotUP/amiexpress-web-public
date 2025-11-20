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
const { spawnSync } = require('child_process');

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
  const runScript = pkg.scripts && pkg.scripts.run;

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

  // Type-specific checks
  const wantRun = process.env.DOCTOR_RUN === '1';
  if (doorType === 'PY' || doorType === 'PYTHON') {
    if (!main.endsWith('.py') && !main.endsWith('.js')) {
      warnings.push('python door main should be a .py file');
    }
    // Try byte-compiling if requested
    if (process.env.DOCTOR_COMPILE_PY === '1' && fs.existsSync(entryPath)) {
      try {
        const { spawnSync } = require('child_process');
        const res = spawnSync('python3', ['-m', 'py_compile', entryPath], { cwd: root });
        if (res.status !== 0) {
          errors.push(`python compile failed: ${res.stderr.toString().trim() || res.stdout.toString().trim()}`);
        }
      } catch (err) {
        warnings.push(`python compile skipped: ${(err || {}).message || err}`);
      }
    }

    if (wantRun) {
      // Try to execute the door main with python3 to ensure syntax/runtime sanity
      try {
        const interpreter = process.env.PYTHON || 'python3';
        const res = spawnSync(interpreter, [entryPath], { cwd: root, timeout: 5000 });
        if (res.error) {
          const msg = res.error.code === 'ENOENT' ? `python not found (${interpreter})` : res.error.message;
          warnings.push(`python run skipped: ${msg}`);
        } else if (res.status !== 0) {
          errors.push(`python run failed (exit ${res.status}): ${res.stderr.toString().trim() || res.stdout.toString().trim()}`);
        }
      } catch (err) {
        warnings.push(`python run skipped: ${(err || {}).message || err}`);
      }
    }
  } else if (doorType === 'AREXX' || doorType === 'REXX') {
    if (!main.toLowerCase().endsWith('.rexx') && !main.toLowerCase().endsWith('.rx')) {
      warnings.push('AREXX door main should be .rexx/.rx script');
    }
    if (!runScript) {
      warnings.push('AREXX door missing npm run "run" script to invoke rexx interpreter');
    }

    if (wantRun) {
      if (!runScript) {
        warnings.push('AREXX run skipped: no npm run "run" script');
      } else {
        try {
          const res = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'run'], {
            cwd: root,
            timeout: 5000,
            env: {
              ...process.env,
              DOOR_MAIN: main
            }
          });
          if (res.error) {
            const msg = res.error.code === 'ENOENT' ? 'npm/rexx not found' : res.error.message;
            warnings.push(`AREXX run skipped: ${msg}`);
          } else if (res.status !== 0) {
            const msg = res.stderr.toString().trim() || res.stdout.toString().trim();
            if (res.status === 127 && /not found/i.test(msg)) {
              warnings.push(`AREXX run skipped: interpreter missing (${msg})`);
            } else {
              errors.push(`AREXX run failed (exit ${res.status}): ${msg}`);
            }
          }
        } catch (err) {
          warnings.push(`AREXX run skipped: ${(err || {}).message || err}`);
        }
      }
    }
  } else if (doorType && !['TS', 'JS'].includes(doorType)) {
    warnings.push(`unrecognized doorType ${doorType}`);
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
