/**
 * CI installs the doors it type-checks.
 *
 * Twice now, main has gone red with a page of TS2307 - "Cannot find module
 * '@amiexpress/bbs-door-sdk'" - from a door that nobody had added to a
 * hardcoded list in .github/workflows/backend-tests.yml. First four doors
 * for the 40-column suites, then ncurses-pong and phreakwars the day they
 * arrived. The doors were fine; the list was out of date.
 *
 * The workflow now DERIVES that list. This test is the guard on the rule
 * rather than on a name: it works out which doors the backend's sources and
 * tests reach, and fails if the workflow could not install one of them.
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
  it('derives the doors it installs instead of listing them', () => {
    const text = fs.readFileSync(workflow, 'utf8');

    // The derivation, not a name: it must read both the sources and the
    // tests, because tsconfig.tests.json reaches further than the imports do.
    expect(text).toContain('web/backend/src web/backend/tests');
    expect(text).toContain('npm install --prefix "Doors/$door"');
  });

  it('installs every door the backend reaches that needs the SDK', () => {
    const needed = doorsNeedingInstall();
    expect(needed.length).toBeGreaterThan(5);

    // Run the workflow's own rule here, against this checkout, and require
    // it to produce every door that needs one. A rule that quietly stopped
    // matching (a renamed directory, a changed grep) fails here rather than
    // on main.
    const derived = execSync(
      `grep -rhoE "Doors/[a-zA-Z0-9._-]+/" web/backend/src web/backend/tests --include='*.ts' `
      + `| cut -d/ -f2 | sort -u`,
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    ).split('\n').map((line) => line.trim()).filter(Boolean);

    const missed = needed.filter((door) => !derived.includes(door));
    expect(missed).toEqual([]);
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
