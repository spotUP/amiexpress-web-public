/**
 * A TypeScript door ships the file the board launches.
 *
 * `dist/` is what runs: the image copies Doors/ as it stands in git, and the
 * entrypoint syncs that onto the volume. Only ONE door is compiled during
 * the image build (door-manager, in the doors-builder stage) - every other
 * door reaches the board with whatever dist/ was committed, and nothing
 * checked that there was one.
 *
 * Three doors were shipping without an entry point on 2026-09-02:
 *
 *   whip             its own .gitignore hid dist/, so the board had sources,
 *                    node_modules and a package.json whose main pointed at a
 *                    directory that did not exist. The door could not start.
 *   Gwall            its tsconfig had no outDir, so tsc emitted index.js
 *                    beside index.ts and dist/ was never written at all.
 *   prompt-complete  built locally, never committed.
 *
 * Each was a different mistake with the same result, which is why this
 * checks the OUTCOME - the file named by `main` is tracked in git - rather
 * than any of the three causes.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..', '..', '..');
const DOORS = join(REPO, 'Doors');

/** Every file git knows about, once. */
const tracked = new Set(
  execFileSync('git', ['ls-files', 'Doors'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean),
);

interface DoorEntry {
  door: string;
  main: string;
}

/** Doors whose manifest says the board should launch something under dist/. */
function doorsWithDistEntries(): DoorEntry[] {
  const found: DoorEntry[] = [];
  for (const door of readdirSync(DOORS)) {
    const manifest = join(DOORS, door, 'package.json');
    if (!existsSync(manifest) || !statSync(join(DOORS, door)).isDirectory()) continue;

    let main: unknown;
    try {
      main = JSON.parse(readFileSync(manifest, 'utf8')).main;
    } catch {
      continue; // an unparseable manifest is a different test's problem
    }
    if (typeof main === 'string' && main.startsWith('dist/')) {
      found.push({ door, main });
    }
  }
  return found;
}

describe('every TypeScript door ships its entry point', () => {
  const entries = doorsWithDistEntries();

  it('finds the doors to check', () => {
    // A guard that silently checks nothing is worse than no guard.
    expect(entries.length).toBeGreaterThan(20);
  });

  it.each(entries.map((e) => [e.door, e.main]))(
    '%s has %s committed',
    (door, main) => {
      expect(tracked.has(`Doors/${door}/${main}`)).toBe(true);
    },
  );

  it('lists no door whose entry exists only on this machine', () => {
    // The failure mode that hides behind a green local run: the file is
    // there in the working tree and absent from the commit, so it works
    // here and the board gets nothing.
    const local = entries.filter((e) => existsSync(join(DOORS, e.door, e.main)));
    const uncommitted = local.filter((e) => !tracked.has(`Doors/${e.door}/${e.main}`));

    expect(uncommitted.map((e) => `${e.door}/${e.main}`)).toEqual([]);
  });
});
