/**
 * The registry spells the same door type two ways, and the readers disagreed.
 *
 * `Commands/BBSCmd/*.info` on this board carries `TYPE=TS` 44 times and
 * `TYPE=typescript` once. The launcher takes either - `door.handler.ts:1406`
 * tests `'TS' || 'typescript'` - so a door spelled the long way RUNS. Every
 * reader that compares against `'TS'` decided it was something else:
 *
 *   - this catalog's `types` filter, so the door was absent from the list;
 *   - `amigaDoorManager.ts:1040`, `typeValue === 'TS'`.
 *
 * The door spelled the long way is TIP, whose own spotlight picker reads this
 * catalog with `types: ['TS']` - so the tip-of-the-day door was leaving
 * itself off its own list of the board's doors, silently, while running fine.
 *
 * The board is the authority on what runs, so the reader follows it.
 */

import { normaliseDoorType, loadDoorCatalog, nodeCatalogIO } from '../../core/door-catalog';
import * as fs from 'fs';
import * as path from 'path';

describe('one spelling for one kind of door', () => {
  it('reads TYPE=typescript as TS, because the launcher does', () => {
    expect(normaliseDoorType('typescript')).toBe('TS');
    expect(normaliseDoorType('TYPESCRIPT')).toBe('TS');
    expect(normaliseDoorType('TypeScript')).toBe('TS');
  });

  it('leaves TS alone', () => {
    expect(normaliseDoorType('TS')).toBe('TS');
    expect(normaliseDoorType('ts')).toBe('TS');
  });

  it('passes an unknown type through, upper-cased', () => {
    // Not this function's business to invent a meaning for XIM, AMI, SIM.
    expect(normaliseDoorType('xim')).toBe('XIM');
    expect(normaliseDoorType('AMI')).toBe('AMI');
  });

  it('treats a missing type as empty rather than throwing', () => {
    expect(normaliseDoorType(undefined)).toBe('');
    expect(normaliseDoorType('')).toBe('');
  });
});

/**
 * Driven against the real registry, because the bug was not in the function -
 * it was in what a door asking for the board's TypeScript doors got back.
 */
describe('the board catalogue, read from the real registry', () => {
  const boardRoot = path.resolve(__dirname, '../../..');
  const hasRegistry = fs.existsSync(path.join(boardRoot, 'Commands/BBSCmd'));

  (hasRegistry ? it : it.skip)('includes a door whose type is spelled the long way', () => {
    const entries = loadDoorCatalog(boardRoot, nodeCatalogIO(fs), { types: ['TS'] });

    // TIP is the one spelled `typescript`, and it was missing from this list.
    expect(entries.some((entry) => entry.command === 'TIP')).toBe(true);
    // And nothing else changed: every entry returned really is a TS door.
    expect(entries.every((entry) => entry.doorType === 'TS')).toBe(true);
  });
});
