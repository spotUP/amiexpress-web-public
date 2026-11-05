/**
 * No door may ship with DoorInputManager's debug logging switched on.
 *
 * `debug: true` writes one line per INPUT EVENT, and a mouse event is an
 * input event: a caller moving the pointer across CARD LOBBY's lobby wrote
 * hundreds of lines a second into the board's log, each one the hex and the
 * JSON of a hover. On 2026-09-14 that buried the sysop's own session while
 * the two of us were trying to read what his door had done - the log was
 * the only witness, and it was full of mouse-hover.
 *
 * The flag is worth keeping; it is worth keeping OFF. `DOOR_LOG_INPUT=1`
 * turns it on for one run, which is the same shape as List's SDK_LOG_LIST.
 *
 * This reads the doors' source because that is where the decision lives -
 * it is a shipping setting, not a behaviour a screen can be asked about.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const DOORS_DIR = join(__dirname, '../../../board/Doors');

/** Every .ts file a door owns, its own tests and build output aside. */
function sourcesOf(doorDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'tests', 'assets'].includes(entry.name)) continue;
        walk(path);
      } else if (entry.name.endsWith('.ts')) {
        out.push(path);
      }
    }
  };
  walk(doorDir);
  return out;
}

function doors(): { name: string; dir: string }[] {
  if (!existsSync(DOORS_DIR)) return [];
  return readdirSync(DOORS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, dir: join(DOORS_DIR, entry.name) }))
    .filter((door) => statSync(door.dir).isDirectory());
}

/** `debug: true` as a literal, comments and prose aside. */
function hardcodedDebug(source: string): number[] {
  const lines: number[] = [];
  source.split('\n').forEach((text, index) => {
    const code = text.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    if (/\bdebug\s*:\s*true\b/.test(code)) lines.push(index + 1);
  });
  return lines;
}

describe('no door ships with input logging on', () => {
  const all = doors();

  it('finds the doors to check', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it('has none of them hardcoding debug: true', () => {
    const offenders: string[] = [];
    for (const door of all) {
      for (const file of sourcesOf(door.dir)) {
        for (const line of hardcodedDebug(readFileSync(file, 'utf8'))) {
          offenders.push(`${file}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
