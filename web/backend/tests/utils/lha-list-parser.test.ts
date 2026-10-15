/**
 * Regression: `lha -l` rows with real Unix permissions must be parsed as
 * archive members, not discarded as rule lines.
 *
 * Symptom (found 2026-08-18, in the live catalog): 13 catalogued doors had no
 * FILE_ID.DIZ even though their archives plainly contained one, and their
 * file lists were mostly empty. AMIEXP30.LHA parsed 2 of its 4 members;
 * TELSER40.LHA parsed 11 of 59.
 *
 * Cause: the parser skipped any line starting with '-' to drop `lha`'s
 * `------` rules. Unix permission strings also start with '-', so every
 * member row of an archive that records permissions was thrown away. The
 * catalog build never logged anything, because the surviving directory and
 * `[unknown]` rows kept the result non-empty and so it never looked
 * "unreadable".
 *
 * Both fixtures below are real `lha -l` output, captured from
 * Archives/AmiExpress/.
 */

import { parseLhaList } from '../../src/utils/lha-list-parser';

/** Real output for an archive that records Unix permissions. */
const PERMISSION_STYLE = [
  'PERMISSION  UID  GID      SIZE  RATIO     STAMP           NAME',
  '---------- ----------- ------- ------ ------------ --------------------',
  '-rw-rw-rw-  user/0      901120  14.7% Jan  5  2002 Amix3d1.adf',
  '-rw-rw-rw-  user/0      901120  21.9% Jan  5  2002 Amix3d2.adf',
  '-rw-rw-rw-  user/0         466  47.9% Apr 10  2014 FILE_ID.diz',
  '[unknown]                  988  41.7% Jan  4  2018 reference-board.txt',
  '---------- ----------- ------- ------ ------------ --------------------',
  ' Total         4 files 1803694  18.3% Jan  4  2018',
];

/** Real output for an archive that does not - the style that always worked. */
const GENERIC_STYLE = [
  'PERMISSION  UID  GID      SIZE  RATIO     STAMP           NAME',
  '---------- ----------- ------- ------ ------------ --------------------',
  '[generic]                 2868  25.8% Dec 18  1995 aLSTER/pw.info',
  '[generic]                 1104  45.1% Dec 18  1995 aLSTER/pw/bbccmd/pW.info',
  '[generic]                   50  60.0% Dec 18  1995 FILE_ID.DIZ',
  '---------- ----------- ------- ------ ------------ --------------------',
  ' Total         3 files    4022  30.1% Dec 18  1995',
];

describe('parseLhaList', () => {
  it('keeps rows whose permission column starts with a dash', () => {
    const entries = parseLhaList(PERMISSION_STYLE);

    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.name)).toEqual([
      'Amix3d1.adf',
      'Amix3d2.adf',
      'FILE_ID.diz',
      'reference-board.txt',
    ]);
  });

  it('finds FILE_ID.DIZ in a permission-style listing (the reported bug)', () => {
    const entries = parseLhaList(PERMISSION_STYLE);
    const diz = entries.find((e) => /file_id\.diz/i.test(e.name));

    expect(diz).toBeDefined();
    expect(diz!.size).toBe(466);
  });

  it('still parses the generic-permission style that always worked', () => {
    const entries = parseLhaList(GENERIC_STYLE);

    expect(entries).toHaveLength(3);
    expect(entries.find((e) => /file_id\.diz/i.test(e.name))!.size).toBe(50);
  });

  it('drops the header, both rule lines and the Total footer', () => {
    for (const listing of [PERMISSION_STYLE, GENERIC_STYLE]) {
      const names = parseLhaList(listing).map((e) => e.name);

      expect(names).not.toContain('NAME');                 // header
      expect(names.some((n) => /^-+$/.test(n))).toBe(false); // rules
      // The footer would otherwise become a member named after its last
      // column, with the file COUNT parsed as its size.
      expect(names).not.toContain('2018');
      expect(names).not.toContain('1995');
    }
  });

  it('reads the size from the size column, not the ratio', () => {
    const entries = parseLhaList(PERMISSION_STYLE);

    expect(entries[0].size).toBe(901120);
    expect(entries[3].size).toBe(988);
  });

  it('returns nothing for output with no member rows', () => {
    expect(parseLhaList([])).toEqual([]);
    expect(parseLhaList(PERMISSION_STYLE.slice(0, 2))).toEqual([]);
  });
});
