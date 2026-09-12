/**
 * Menu brackets survive addAnsiEscapes.
 *
 * User-visible symptom (sysop screenshot, T-mode Conf2 menu): every menu
 * key lost its `[` plus one letter (`[FR]` showed as `R]`, `[TLIST]` as
 * `LIST]`, `[G]` as `]`), rows overwrote each other and the title lost
 * everything but `U`. The prompt line below the menu was fine.
 *
 * Cause: addAnsiEscapes rescued bare `[` + letter as CSI, inserting an ESC
 * the terminal then EXECUTED as a cursor move (CSI E = next line, CSI F =
 * previous line, CSI J = erase below, CSI M = delete lines...). The 80-col
 * art never hit this: every bracket there is already ESC-prefixed
 * (`\x1b[31m[\x1b[37mE...`), so only the new contiguous `.ttx` encoding
 * (`\x1b[0;33m[E]`) tripped it. The prompt survived because it never passes
 * through this function.
 *
 * The fix requires numeric parameters before a rescued letter; this suite
 * pins both sides: menu keys pass through byte-identical, real bare
 * sequences (`[0m`, `[2J`, `[23C`) are still rescued, and already-prefixed
 * sequences are never doubled.
 */
process.env.SKIP_DB_INIT = '1';

import { addAnsiEscapes } from '../../src/handlers/screen.handler';

describe('menu brackets survive addAnsiEscapes', () => {
  test('a teletext menu row passes through byte-identical', () => {
    const row =
      '\x1b[0;37m  \x1b[0;33m[E]\x1b[0;32m ENTER MSG  \x1b[0;33m[FR]\x1b[0;32m REVERSE\x1b[0m';
    expect(addAnsiEscapes(row)).toBe(row);
  });

  test('every menu-key shape stays literal text', () => {
    for (const key of ['[G]', '[RZ]', '[X]', '[J]', '[CS]', '[T]', '[CF]', '[Z]', '[WALL]', '[REQ]', '[TLIST]', '[ULIST]', '[CHAT]', '[DD]', '[NSU]', '[B]', '[D]', '[ZOOM]', '[O]', '[U]', '[M]', '[A]', '[S]', '[H]', '[K]', '[m']) {
      expect(addAnsiEscapes(`  ${key} LABEL`)).toBe(`  ${key} LABEL`);
    }
  });

  test('real bare sequences are still rescued', () => {
    expect(addAnsiEscapes('[0mreset')).toBe('\x1b[0mreset');
    expect(addAnsiEscapes('[1;33myellow')).toBe('\x1b[1;33myellow');
    expect(addAnsiEscapes('[23Cindent')).toBe('\x1b[23Cindent');
    expect(addAnsiEscapes('[2Jclear')).toBe('\x1b[2Jclear');
  });

  test('already-prefixed sequences are never doubled', () => {
    expect(addAnsiEscapes('\x1b[0;33myellow')).toBe('\x1b[0;33myellow');
    expect(addAnsiEscapes('\x1b[2Jclear')).toBe('\x1b[2Jclear');
    expect(addAnsiEscapes('\x1b[31m[\x1b[37mE\x1b[31m]')).toBe('\x1b[31m[\x1b[37mE\x1b[31m]');
  });

  test('the shipped variant-B menu survives end to end', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const seed = fs.readFileSync(
      path.resolve(__dirname, '../../../../Conf2/Menu.ttx'),
      'latin1',
    );
    const out = addAnsiEscapes(seed);
    expect(out).toBe(seed);
    expect(out).toContain('[FR]');
    expect(out).toContain('[TLIST]');
  });
});
