/**
 * CI installs the doors it type-checks.
 *
 * Twice now, main has gone red with a page of TS2307 - "Cannot find module
 * '@amiexpress/bbs-door-sdk'" - from a door that nobody had added to a
 * hardcoded list in .github/workflows/backend-tests.yml. First four doors
 * for the 40-column suites, then ncurses-pong and phreakwars the day they
 * arrived. The doors were fine; the list was out of date.
 *
 * The workflow DERIVED that list from the `Doors/<name>/` paths the backend's
 * sources and tests spell out - and a third page of TS2307 arrived anyway on
 * 2026-09-06, from eight arcade doors that tests/transport reaches through a
 * template literal (`../../../../Doors/${arcade.door}/index`). A name that is
 * assembled at runtime is not in the text to be grepped.
 *
 * So the rule stopped being a derivation from source text: CI installs EVERY
 * door whose package.json depends on the SDK. It is a superset of anything
 * the backend can reach, by any spelling, and it cannot go stale. This test
 * guards that rule.
 *
 * It guards it by RUNNING the workflow's own install step: the step's script
 * is taken from the parsed YAML and executed against this checkout with `npm`
 * replaced by a recorder, and what is asserted is the set of installs it
 * would have made - not how its shell lines are spelled.
 */

import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// js-yaml ships no types here; the one call this test makes, typed.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { load(text: string): unknown };

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const workflow = path.join(repoRoot, '.github', 'workflows', 'backend-tests.yml');

/**
 * Doors the backend's own sources and tests name. REASONABLE source read: a
 * walk for `Doors/<name>/` paths - the reach it measures is textual.
 */
function doorsTheBackendReaches(): string[] {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      for (const match of fs.readFileSync(full, 'utf8').matchAll(/Doors\/([A-Za-z0-9._-]+)\//g)) {
        found.add(match[1]);
      }
    }
  };
  walk(path.join(repoRoot, 'web', 'backend', 'src'));
  walk(path.join(repoRoot, 'web', 'backend', 'tests'));
  return [...found].sort();
}

/** Of those, the ones that need an install to resolve the SDK. */
function doorsNeedingInstall(): string[] {
  return doorsTheBackendReaches().filter((door) => {
    const pkg = path.join(repoRoot, 'board', 'Doors', door, 'package.json');
    return fs.existsSync(pkg) && fs.readFileSync(pkg, 'utf8').includes('bbs-door-sdk');
  });
}

interface NpmInstall { door: string; scripts: boolean }

/**
 * Run the workflow's "Install door deps" step, as written, in this checkout,
 * with a fake `npm` first on PATH that records its arguments instead of
 * installing anything. Returns one entry per `npm install --prefix <door>`.
 */
function runTheWorkflowInstallStep(): NpmInstall[] {
  const doc = yaml.load(fs.readFileSync(workflow, 'utf8')) as {
    jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
  };
  const steps = Object.values(doc.jobs).flatMap((job) => job.steps ?? []);
  const step = steps.find((st) => /^Install door deps/.test(st.name ?? ''));
  if (!step?.run) throw new Error('backend-tests.yml has no "Install door deps" step with a run script');

  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-door-installs-'));
  const log = path.join(bin, 'npm.log');
  try {
    fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/bash\necho "$*" >> "${log}"\n`, { mode: 0o755 });
    execFileSync('/bin/bash', ['-e', '-c', step.run], {
      cwd: repoRoot,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      stdio: 'pipe',
      maxBuffer: 8 * 1024 * 1024,
    });
    const lines = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
    return lines.map((line) => {
      const args = line.split(/\s+/);
      expect(args[0]).toBe('install');
      const prefix = args[args.indexOf('--prefix') + 1];
      return { door: path.basename(prefix), scripts: !args.includes('--ignore-scripts') };
    });
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
  }
}

/** Every door on disk whose package.json depends on the SDK - the rule. */
function doorsDependingOnTheSdk(): string[] {
  return fs.readdirSync(path.join(repoRoot, 'board', 'Doors')).filter((door) => {
    const pkg = path.join(repoRoot, 'board', 'Doors', door, 'package.json');
    return fs.existsSync(pkg) && fs.readFileSync(pkg, 'utf8').includes('bbs-door-sdk');
  }).sort();
}

describe('the backend-tests workflow', () => {
  const installs = runTheWorkflowInstallStep();
  const installed = installs.map((i) => i.door).sort();

  it('installs by the rule, never from a list of names', () => {
    // Exactly the doors whose package.json names the SDK - nothing about
    // which doors the backend happens to mention.
    expect(installed).toEqual(doorsDependingOnTheSdk());
  });

  it('installs every door the backend reaches that needs the SDK', () => {
    const needed = doorsNeedingInstall();
    expect(needed.length).toBeGreaterThan(5);

    const missed = needed.filter((door) => !installed.includes(door));
    expect(missed).toEqual([]);

    // The eight arcade doors tests/transport imports by template literal:
    // named here because they are the case that broke the old rule.
    for (const arcade of ['donkey-kong', 'frogger', 'galaga', 'joust',
                          'pengo', 'pipe-dream', 'super-qix', 'zoo-keeper']) {
      expect(installed).toContain(arcade);
    }
  });

  it('lets the native-dep doors run their install scripts', () => {
    // --ignore-scripts is right for a door whose only dependency is the SDK,
    // and wrong for one with a native module: better-sqlite3's binary is
    // fetched by an install script, and without it GRANDMASTER's own suites
    // fail on "Could not locate the bindings file".
    const native = fs.readdirSync(path.join(repoRoot, 'board', 'Doors'))
      .filter((door) => {
        const pkg = path.join(repoRoot, 'board', 'Doors', door, 'package.json');
        return fs.existsSync(pkg)
          && /"(better-sqlite3|node-pty|canvas|sharp|bcrypt)"/.test(fs.readFileSync(pkg, 'utf8'));
      });
    // If this ever empties, the branch above is dead and should go with it.
    expect(native).toContain('grandmaster');

    for (const install of installs) {
      expect(install).toEqual({ door: install.door, scripts: native.includes(install.door) });
    }
  });

  it('names the doors that broke main, so the guard is not vacuous', () => {
    // If either of these stops being reached by the backend, this test has
    // stopped covering the case it was written for and should be updated
    // deliberately rather than passing on an empty set.
    const needed = doorsNeedingInstall();
    for (const door of ['ncurses-pong', 'phreakwars', 'grandmaster', 'livechat']) {
      expect(needed).toContain(door);
    }
  });
});
