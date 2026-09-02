/**
 * One parser owns the .info format, and it is not this one.
 *
 * `InfoFileParser.parse` scrapes a .info file for KEY=VALUE text - its own
 * comment says "no DiskObject, no gadget, no length-prefixed". An Amiga icon
 * stores its tooltypes as a NUL-terminated array where every entry carries a
 * 4-byte LENGTH in front of it, so without that length there is no way to know
 * where one entry ends and the next begins.
 *
 * Measured across the 219 icons in this repo before the fix: 875 keys missed,
 * 978 keys invented out of the icon's image data, and 66 values wrong. On
 * Node0.info the whole tooltype array was swallowed into NODESTART's value, so
 * DEF_SCREENS, CALLERS_LOG and PRIORITY simply did not exist - and DEF_SCREENS
 * is what decides which screen a node shows (express.e:6251).
 *
 * The importer reads a board's configuration through this. It was written
 * early, before the project understood the format.
 */

import * as fs from 'fs';
import * as path from 'path';
import { InfoFileParser } from '../../src/services/info-file-parser';
import { readTooltypeMap, parseInfoBuffer, tooltypeMap } from '../../src/utils/info-file.util';

const REPO = path.join(__dirname, '..', '..', '..', '..');

/** Real icons, because a fixture would only prove the fixture. */
function icons(): string[] {
  const out: string[] = [];
  for (const dir of ['.', 'Commands/BBSCmd', 'Access']) {
    const full = path.join(REPO, dir);
    try {
      for (const name of fs.readdirSync(full)) {
        if (name.toLowerCase().endsWith('.info')) out.push(path.join(full, name));
      }
    } catch {
      // A checkout without that directory simply contributes no icons.
    }
  }
  return out;
}

const asMap = (value: unknown): Map<string, string> =>
  value instanceof Map ? value : new Map(Object.entries((value ?? {}) as Record<string, string>));

describe('InfoFileParser reads what the format owner reads', () => {
  const files = icons();

  test('this repo has real icons to check against', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  test('misses no tooltype, and invents none', () => {
    const parser = new InfoFileParser();
    const missed: string[] = [];
    const invented: string[] = [];

    for (const file of files) {
      const owner = readTooltypeMap(file);
      const scraped = asMap(parser.parse(fs.readFileSync(file)).toolTypes);

      for (const key of owner.keys()) {
        if (!scraped.has(key)) missed.push(`${path.basename(file)}: ${key}`);
      }
      for (const key of scraped.keys()) {
        if (!owner.has(key)) invented.push(`${path.basename(file)}: ${key}`);
      }
    }

    expect(missed.slice(0, 10).join('\n')).toBe('');
    expect(invented.slice(0, 10).join('\n')).toBe('');
  });

  test('reads every value the same way', () => {
    const parser = new InfoFileParser();
    const wrong: string[] = [];

    for (const file of files) {
      const owner = readTooltypeMap(file);
      const scraped = asMap(parser.parse(fs.readFileSync(file)).toolTypes);

      for (const [key, value] of owner) {
        if (scraped.has(key) && scraped.get(key) !== value) {
          wrong.push(`${path.basename(file)}: ${key}`);
        }
      }
    }

    expect(wrong.slice(0, 10).join('\n')).toBe('');
  });

  test('a node icon keeps the settings that decide how the node behaves', () => {
    // The case that made this visible: NODESTART swallowed the rest of the
    // array, so a node imported with no DEF_SCREENS, no CALLERS_LOG and no
    // PRIORITY.
    const file = path.join(REPO, 'Node0.info');
    if (!fs.existsSync(file)) return;

    const scraped = asMap(new InfoFileParser().parse(fs.readFileSync(file)).toolTypes);

    expect(scraped.get('NODESTART')).toBe('BBS:Express');
    expect(scraped.has('DEF_SCREENS')).toBe(true);
    expect(scraped.has('CALLERS_LOG')).toBe(true);
    expect(scraped.get('PRIORITY')).toBe('-1');
  });

  test('a commented-out tooltype is not set, the way FindToolType reads it', () => {
    // tooltypes.e:215-218 - `(KEY=value)` is disabled. A scraper cannot tell,
    // and would import a setting the sysop had switched off.
    const buffer = fs.readFileSync(path.join(REPO, 'Node0.info'));
    const owner = tooltypeMap(parseInfoBuffer(buffer));
    const scraped = asMap(new InfoFileParser().parse(buffer).toolTypes);

    expect(owner.has('CONSOLE_INPUT_DEVICE')).toBe(false);
    expect(scraped.has('CONSOLE_INPUT_DEVICE')).toBe(false);
  });
});
