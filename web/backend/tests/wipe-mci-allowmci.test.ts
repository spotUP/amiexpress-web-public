/**
 * Regression tests for:
 * 1. parseWipeMCI stripping the wipe code's trailing newline so the first non-empty
 *    line of the remaining content is preserved and allowMCI stays true.
 * 2. Confirms that when wipe-stripped content starts with ~f (not \n~f), allowMCI
 *    computation sees a non-empty first line beginning with ~.
 */

import { parseWipeMCI } from '../src/utils/screen-wipe.util';

describe('parseWipeMCI — trailing newline stripping', () => {
  // ~WX is a random wipe; the file starts with the wipe line then ~f + content.
  it('strips the wipe code line including its newline so remaining content starts with ~f', () => {
    const input = '~WX\n~f\nSome BBS menu content\n~N\n';
    const result = parseWipeMCI(input);
    expect(result.wipeType).toBe('random');
    // Must NOT start with \n — that would make firstLine empty and break allowMCI
    expect(result.content.startsWith('\n')).toBe(false);
    // Must start directly with ~f
    expect(result.content.startsWith('~f')).toBe(true);
  });

  it('strips wipe code with CRLF line ending', () => {
    const input = '~WM\r\n~f\nSome content\n';
    const result = parseWipeMCI(input);
    expect(result.wipeType).toBe('matrix');
    expect(result.content.startsWith('\r\n')).toBe(false);
    expect(result.content.startsWith('~f')).toBe(true);
  });

  it('strips wipe code with no trailing newline (wipe code at end of string)', () => {
    const input = '~WH';
    const result = parseWipeMCI(input);
    expect(result.wipeType).toBe('hblinds');
    expect(result.content).toBe('');
  });

  it('returns null wipeType for content without a wipe code', () => {
    const input = '~f\n~N\nHello World\n';
    const result = parseWipeMCI(input);
    expect(result.wipeType).toBeNull();
    expect(result.content).toBe(input);
  });

  it('allowMCI logic: stripped content starting with ~ has non-empty first line', () => {
    const input = '~WX\n~f\nsome content';
    const stripped = parseWipeMCI(input).content;
    const firstNewline = stripped.indexOf('\n');
    const firstLine = firstNewline >= 0 ? stripped.slice(0, firstNewline) : stripped;
    const allowMCI = firstLine.trimEnd().length > 0 && firstLine[0] === '~';
    expect(allowMCI).toBe(true);
  });

  it('regression: before fix, ~WX\\n would leave leading \\n making allowMCI false', () => {
    // Demonstrate that a leading \n causes allowMCI=false (the old broken behaviour)
    const brokenStripped = '\n~f\nsome content';
    const firstNewline = brokenStripped.indexOf('\n');
    const firstLine = firstNewline >= 0 ? brokenStripped.slice(0, firstNewline) : brokenStripped;
    const allowMCI = firstLine.trimEnd().length > 0 && firstLine[0] === '~';
    expect(allowMCI).toBe(false); // confirms what was broken before the fix
  });
});
