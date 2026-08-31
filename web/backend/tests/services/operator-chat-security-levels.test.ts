/**
 * No non-sysop could page the sysop.
 *
 * The Operator Chat form's "Allowed Security Levels" is a checkbox group, and
 * a checkbox group posts its values as STRINGS. The column filled with
 * ["10","20"] while operator-chat.handler.ts:255 tests
 * `config.allowedSecLevels.includes(userSecLevel)` against a NUMBER - and
 * ["10"].includes(10) is false, so the list matched nobody and every page
 * from a non-sysop was refused.
 *
 * Numbers on the way in, and numbers on the way back out, so a board whose
 * column already holds strings starts working without a re-save.
 */

process.env.SKIP_DB_INIT = '1';

describe('the security levels allowed to page the sysop', () => {
  /** The coercion the repository applies, in both directions. */
  const toLevels = (raw: unknown[]): number[] =>
    raw
      .filter(value => value !== null && value !== undefined && value !== '')
      .map(Number)
      .filter(Number.isFinite);

  it('stores what a checkbox group sends as numbers', () => {
    expect(toLevels(['10', '20', '255'])).toEqual([10, 20, 255]);
  });

  it('reads a row already written as strings back as numbers', () => {
    const stored = JSON.parse('["10","20"]') as unknown[];
    expect(toLevels(stored)).toEqual([10, 20]);
  });

  it('makes the permission check match, which is the whole bug', () => {
    const asStrings = ['10', '20'] as unknown as number[];
    const userSecLevel = 10;

    expect(asStrings.includes(userSecLevel)).toBe(false);   // the bug
    expect(toLevels(asStrings).includes(userSecLevel)).toBe(true);
  });

  it('drops what is not a level rather than turning it into 0', () => {
    // Level 0 is real, so '' and null must not become it.
    expect(toLevels(['10', '', 'nonsense', null])).toEqual([10]);
    expect(toLevels(['0', '10'])).toEqual([0, 10]);
  });
});

describe('the repository is the one that coerces', () => {
  const fs = require('fs');
  const path = require('path');
  const REPO = path.join(__dirname, '..', '..', 'src', 'database', 'operator-chat.repository.ts');

  it('coerces on write and on read', () => {
    const source = fs.readFileSync(REPO, 'utf8');
    // Both directions, or a board with an existing row stays broken.
    expect(source).toContain('JSON.stringify(toSecurityLevels(merged.allowedSecLevels))');
    expect(source).toContain('toSecurityLevels(JSON.parse(row.allowed_sec_levels');
  });
});
