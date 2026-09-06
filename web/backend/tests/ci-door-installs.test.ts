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
 */

import { describe, it, expect } from '@jest/globals';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const workflow = path.join(repoRoot, '.github', 'workflows', 'backend-tests.yml');

/** Doors the backend's own sources and tests name. */
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
    const pkg = path.join(repoRoot, 'Doors', door, 'package.json');
    return fs.existsSync(pkg) && fs.readFileSync(pkg, 'utf8').includes('bbs-door-sdk');
  });
}

describe('the backend-tests workflow', () => {
  it('installs by the rule, never from a list of names', () => {
    const text = fs.readFileSync(workflow, 'utf8');

    // Every Doors/*/package.json that names the SDK, and nothing about which
    // doors the backend happens to mention.
    expect(text).toContain('for pkg in Doors/*/package.json; do');
    expect(text).toContain('grep -q "bbs-door-sdk" "$pkg"');
    expect(text).toContain('npm install --prefix "$door"');
  });

  it('installs every door the backend reaches that needs the SDK', () => {
    const needed = doorsNeedingInstall();
    expect(needed.length).toBeGreaterThan(5);

    // Run the workflow's own loop here, against this checkout, and require
    // its output to cover every door the backend reaches - including the
    // ones it reaches by a name it builds at runtime, which is what the
    // old grep-the-sources rule missed.
    const installed = execSync(
      `for pkg in Doors/*/package.json; do grep -q "bbs-door-sdk" "$pkg" && dirname "$pkg"; done | cut -d/ -f2 | sort -u`,
      { cwd: repoRoot, encoding: 'utf8', shell: '/bin/bash', maxBuffer: 8 * 1024 * 1024 },
    ).split('\n').map((line) => line.trim()).filter(Boolean);

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
    const text = fs.readFileSync(workflow, 'utf8');
    expect(text).toMatch(/better-sqlite3\|node-pty/);
    expect(text).toContain('npm install --prefix "$door" --no-audit --no-fund');

    const native = fs.readdirSync(path.join(repoRoot, 'Doors'))
      .filter((door) => {
        const pkg = path.join(repoRoot, 'Doors', door, 'package.json');
        return fs.existsSync(pkg)
          && /"(better-sqlite3|node-pty|canvas|sharp|bcrypt)"/.test(fs.readFileSync(pkg, 'utf8'));
      });
    // If this ever empties, the branch above is dead and should go with it.
    expect(native).toContain('grandmaster');
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
