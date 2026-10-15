/**
 * Every door that takes the theme takes its CHROME.
 *
 * Sysop, 2026-09-03: "almost none of the doors that use it has the full
 * chrome with the animated slashes and glitches etc - fix it, only colors
 * makes no great theme". Fifteen doors imported the theme; six had any
 * chrome at all, one had all of it, and none of them got it from a single
 * call - so each drifted from the next.
 *
 * This is the WIRING pin: a door that imports the theme must reach the SDK
 * entry point, or carry a written exemption here. What that entry point
 * actually renders - masthead, rail, glitch and footer at 80; a static
 * masthead and a footer with no timer at 40 - is proven against the real
 * function in sdk/tests/unit/door-chrome.test.ts, because a source pin
 * proves a call exists, not that it works.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DOORS_DIR = path.join(REPO_ROOT, 'Doors');

/** The one call. A door that takes the theme has to reach this. */
const ENTRY_POINT = 'attachDoorChrome';

/** How a door says it takes the theme at all. */
const THEME_IMPORT = /bbs-door-sdk\/engines\/ui\/theme/;

/**
 * Doors that take the theme's colours and deliberately take no chrome.
 *
 * An exemption is a sentence somebody can disagree with, not a checkbox.
 * Adding a door here without one is how this test stops meaning anything.
 */
const EXEMPT: Record<string, string> = {
  scrollwars:
    'It already has a real footer and no row to put another one in. Its ' +
    'StatusBar carries live sections - users online, which line you are, your ' +
    'name, and a key hint that shortens itself when the name is long - which ' +
    'the generic hint row cannot express, and its two panels are 100%-1 tall, ' +
    'so the only spare row is the one the StatusBar is in. It takes the ' +
    "theme's COLOURS in full and the SDK's own footerStyle() for that bar " +
    '(2026-09-15).',
  dopewars:
    'Both of its bars already carry live game state and neither has a row to ' +
    'spare. Row 0 is the status line - day, location, HP, cash, debt, updated ' +
    'every turn - and the bottom three rows are the action prompts and the ' +
    'game-over message. A masthead or a hint footer would overwrite one of ' +
    'them, and taking a row from the three panels to make space would shrink ' +
    'the play area of a game to fit its decoration. It takes the theme\'s ' +
    'COLOURS in full (2026-09-15); the chrome is the part that does not fit.',
  'widget-shadow-demo':
    'A faithful reproduction of the upstream neo-blessed shadow example - ' +
    'lightblue ground, lorem ipsum, two floating panels, every geometry ' +
    'marked "EXACT from neo-blessed". A masthead or a hint row would make ' +
    'it a reproduction of something else, which is the one thing it must ' +
    'not be.',
};

/** Every .ts of a door, ignoring what is built or installed. */
function doorSources(door: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tests') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
    }
  };
  walk(path.join(DOORS_DIR, door));
  return out;
}

/** The doors that import the theme, and the sources of each. */
function themeUsingDoors(): Array<{ door: string; sources: string[] }> {
  const doors = fs
    .readdirSync(DOORS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const found: Array<{ door: string; sources: string[] }> = [];
  for (const door of doors) {
    const sources = doorSources(door);
    const usesTheme = sources.some((file) => THEME_IMPORT.test(fs.readFileSync(file, 'utf-8')));
    if (usesTheme) found.push({ door, sources });
  }
  return found;
}

describe('every theme-using door reaches the SDK chrome entry point', () => {
  const doors = themeUsingDoors();

  it('finds the theme-using doors at all (the scan itself is not silently empty)', () => {
    // A broken scan would make every assertion below vacuously true, which
    // is the failure mode of a test like this one.
    expect(doors.length).toBeGreaterThanOrEqual(12);
    expect(doors.map((d) => d.door)).toEqual(expect.arrayContaining([
      'doors-menu', 'door-manager', 'bbs-dashboard',
    ]));
  });

  it.each(doors.map((d) => [d.door, d.sources] as const))(
    '%s calls attachDoorChrome',
    (door, sources) => {
      const exemption = EXEMPT[door];
      const calls = sources.some((file) => fs.readFileSync(file, 'utf-8').includes(ENTRY_POINT));

      if (exemption) {
        // An exemption must be real: a door that DOES call the entry point
        // has no business claiming one, or the list rots into a lie.
        expect(exemption.length).toBeGreaterThan(40);
        expect(calls).toBe(false);
        return;
      }

      expect(calls).toBe(true);
    }
  );

  it('nothing hand-rolls a masthead timer beside the one in the SDK', () => {
    // The defect this whole pass exists to end: DOORS owned a private copy
    // of the masthead animation, so the other doors had nothing to inherit.
    // A door may still use the SDK primitives - what it may not do is drive
    // railStream from a setInterval of its own.
    const offenders: string[] = [];
    for (const { door, sources } of doors) {
      for (const file of sources) {
        const src = fs.readFileSync(file, 'utf-8');
        if (/railStream\s*\(/.test(src) && /setInterval\s*\(/.test(src)) {
          offenders.push(`${door}: ${path.relative(REPO_ROOT, file)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
