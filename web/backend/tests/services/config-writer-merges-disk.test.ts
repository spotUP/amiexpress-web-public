/**
 * Saving one entry must not delete the others.
 *
 * Three config services read from DISK and write from the DATABASE:
 *
 *   getAllScreenTypes()      -> reads ScreenTypes.info
 *   writeScreenTypesInfoFile -> rebuilds it from configRepo.getAllScreenTypes()
 *
 * The two disagree, badly. On the live site:
 *
 *   ScreenTypes.info   2 entries      screen_types table   0 rows
 *   ComputerList.info  9 entries      computers table      does not exist
 *   Protocols/         9 entries      protocols table      7 rows
 *
 * So editing a single screen type rebuilt the file from an empty table and
 * erased both types. The page shows what is on disk, which is what makes it
 * invisible until afterwards.
 *
 * The rule these tests hold: what gets written is what is on disk, with the
 * caller's change applied - never the database's idea of the world.
 */

import { mergeForWrite } from '../../src/services/config-services/config-merge.util';

const DISK = [
  { key: 'TXT.GR', title: 'Amiga Ansi' },
  { key: 'IBM', title: 'IBM Ansi' },
];

const keyOf = (e: { key: string }) => e.key;

describe('mergeForWrite', () => {
  it('keeps disk entries when the database knows nothing', () => {
    // The live case exactly: 2 on disk, 0 in the table.
    const out = mergeForWrite(DISK, [], keyOf);

    expect(out).toHaveLength(2);
    expect(out.map(keyOf)).toEqual(['TXT.GR', 'IBM']);
  });

  it('adds an entry the caller just created', () => {
    const out = mergeForWrite(DISK, [{ key: 'VT100', title: 'VT100' }], keyOf);

    expect(out.map(keyOf)).toEqual(['TXT.GR', 'IBM', 'VT100']);
  });

  it('updates an entry in place, keeping its position', () => {
    const out = mergeForWrite(DISK, [{ key: 'IBM', title: 'IBM ANSI (edited)' }], keyOf);

    expect(out.map(keyOf)).toEqual(['TXT.GR', 'IBM']);
    expect(out[1].title).toBe('IBM ANSI (edited)');
  });

  it('removes only what it is told to remove', () => {
    const out = mergeForWrite(DISK, [], keyOf, { remove: ['TXT.GR'] });

    expect(out.map(keyOf)).toEqual(['IBM']);
  });

  it('a removal plus an unrelated edit leaves everything else alone', () => {
    const out = mergeForWrite(
      [...DISK, { key: 'VT100', title: 'VT100' }],
      [{ key: 'IBM', title: 'edited' }],
      keyOf,
      { remove: ['VT100'] },
    );

    expect(out.map(keyOf)).toEqual(['TXT.GR', 'IBM']);
    expect(out[1].title).toBe('edited');
  });

  it('never returns fewer entries than disk unless a removal asked for it', () => {
    // The property that was violated: a write must not silently shrink the
    // file because a table happened to be empty.
    const out = mergeForWrite(DISK, [], keyOf);

    expect(out.length).toBeGreaterThanOrEqual(DISK.length);
  });
});
