import { printableLength, wrapLineToWidth, wrapForSession, foldAtColumn, foldForWire } from '../../src/utils/wrap-for-session.util';

describe('printableLength', () => {
  it('ignores ANSI escapes', () => {
    expect(printableLength('\x1b[32mHello\x1b[0m')).toBe(5);
    expect(printableLength('plain')).toBe(5);
  });
});

describe('wrapLineToWidth', () => {
  it('leaves short lines alone', () => {
    expect(wrapLineToWidth('short line', 40)).toEqual(['short line']);
  });
  it('wraps at word boundaries, never past width', () => {
    const out = wrapLineToWidth('the quick brown fox jumps over the lazy dog again and again', 20);
    for (const l of out) expect(printableLength(l)).toBeLessThanOrEqual(20);
    expect(out.join(' ').replace(/\s+/g, ' ')).toBe('the quick brown fox jumps over the lazy dog again and again');
  });
  it('keeps ANSI color spans intact across the wrap', () => {
    const out = wrapLineToWidth('\x1b[33m' + 'word '.repeat(12).trim() + '\x1b[0m', 20);
    for (const l of out) expect(printableLength(l)).toBeLessThanOrEqual(20);
    expect(out.join('')).toContain('\x1b[33m');
    expect(out.join('')).toContain('\x1b[0m');
    for (const l of out) expect(l).not.toMatch(/\x1b\[[0-9;]*$/);
  });
  it('hard-breaks a word longer than the width', () => {
    const out = wrapLineToWidth('A'.repeat(90), 40);
    expect(out.length).toBe(3);
    expect(printableLength(out[0])).toBe(40);
  });
});

describe('wrapForSession', () => {
  const c64 = { screenWidth: 40, petsciiMode: true };
  it('is identity at 80 columns, for no session, and for a missing width', () => {
    const text = 'x'.repeat(120);
    expect(wrapForSession(text, { screenWidth: 80 })).toBe(text);
    expect(wrapForSession(text, {})).toBe(text);
    expect(wrapForSession(text, undefined)).toBe(text);
  });
  it('wraps a 40-column session at word boundaries with CRLF', () => {
    const out = wrapForSession('word '.repeat(20).trim(), c64);
    for (const l of out.split('\r\n')) expect(printableLength(l)).toBeLessThanOrEqual(40);
    expect(out).not.toMatch(/[^\r]\n/);
  });
  it('passes positioned or cleared payloads through untouched (never squeeze art)', () => {
    const positioned = '\x1b[5;10H' + 'x'.repeat(70);
    const cleared = '\x1b[2J' + 'y'.repeat(70);
    expect(wrapForSession(positioned, c64)).toBe(positioned);
    expect(wrapForSession(cleared, c64)).toBe(cleared);
  });
  it('is identity while a door owns the terminal', () => {
    const text = 'z'.repeat(70);
    expect(wrapForSession(text, { ...c64, doorInputHandler: () => {} } as any)).toBe(text);
  });
  it('is identity for a non-PETSCII session even at a narrow width (mobile/resized xterm never pays for C64 support)', () => {
    const text = 'word '.repeat(20).trim();
    expect(wrapForSession(text, { screenWidth: 40, petsciiMode: false })).toBe(text);
    expect(wrapForSession(text, { screenWidth: 40 })).toBe(text);
  });
  // THE index.ts LISTENER HOLE. web/backend/src/index.ts's terminal-type
  // handler sets petsciiMode from TTYPE and then calls
  // applyClientReportedGeometry(), which REFUSES to write geometry for a
  // PETSCII session - so nothing on that path ever stamps screenWidth = 40.
  // Such a session kept session-manager's default 80 here and went identity,
  // while sessionColumns / doorScreenWidth / BB_SCRWIDTH / getTerminalSize
  // all answered 40. One authority: doorScreenWidth(session, 80).
  it('a PETSCII session still carrying a stale 80 wraps at 40, not at 80', () => {
    const text = 'word '.repeat(30).trim();
    const out = wrapForSession(text, { petsciiMode: true, screenWidth: 80 });
    expect(out).not.toBe(text);
    for (const l of out.split('\r\n')) expect(printableLength(l)).toBeLessThanOrEqual(40);
  });
  it('a PETSCII session whose width was NEVER recorded wraps at 40', () => {
    const text = 'word '.repeat(30).trim();
    const out = wrapForSession(text, { petsciiMode: true });
    expect(out).not.toBe(text);
    for (const l of out.split('\r\n')) expect(printableLength(l)).toBeLessThanOrEqual(40);
  });
  it('a PETSCII session carrying a nonsense width (0) wraps at 40', () => {
    const text = 'word '.repeat(30).trim();
    const out = wrapForSession(text, { petsciiMode: true, screenWidth: 0 });
    expect(out).not.toBe(text);
    for (const l of out.split('\r\n')) expect(printableLength(l)).toBeLessThanOrEqual(40);
  });
  it('passes column/line positioning (ESC[nG, ESC[E) through untouched, matching positionsCursorAbsolutely', () => {
    const columnPositioned = '\x1b[5G' + 'x'.repeat(70);
    const nextLine = '\x1b[E' + 'y'.repeat(70);
    expect(wrapForSession(columnPositioned, c64)).toBe(columnPositioned);
    expect(wrapForSession(nextLine, c64)).toBe(nextLine);
  });
});

/**
 * THE WIDE CALLER (sysop, 2026-09-07, telnet at 200 columns: "when the menu
 * animation finishes it looks like this" - the logo's right half strung out
 * across the top of the screen, the last row apparently duplicated).
 *
 * Nothing had regressed. This board's screens are 80-column DOCUMENTS whose
 * layout is defined by the terminal wrapping at column 80: rows 3 and 4 of
 * Screens/MENU.TXT are 155 and 159 printable columns, and 623 screens in the
 * tree carry a row past 80. On an 80-column terminal every one of them folds
 * where the artist expected; in a 200-column window nothing folds and the
 * overflow keeps going right. So the board folds them itself - at 80, exactly
 * as the 80-column terminal would have, deferred wrap included - and the art
 * stays as the artist left it.
 */
describe('foldAtColumn - the 80-column terminal, emulated', () => {
  it('breaks a long row before the 81st printable character', () => {
    const row = 'a'.repeat(159);
    const out = foldAtColumn(row, 80);
    expect(out).toBe('a'.repeat(80) + '\r\n' + 'a'.repeat(79));
  });

  it('a row of exactly 80 followed by a newline does not gain a blank row (deferred wrap)', () => {
    const text = 'b'.repeat(80) + '\r\n' + 'next';
    expect(foldAtColumn(text, 80)).toBe(text);
  });

  it('ANSI sequences cost no columns and are never split', () => {
    const row = '\x1b[1;36m' + 'c'.repeat(79) + '\x1b[0;34m' + 'd'.repeat(5) + '\x1b[0m';
    const out = foldAtColumn(row, 80);
    expect(out.split('\r\n').map(printableLength)).toEqual([80, 4]);
    // The break landed AFTER the SGR that opened the 80th column's run, so the
    // second row still opens in blue.
    expect(out.split('\r\n')[1].startsWith('d')).toBe(true);
    expect(out).toContain('\x1b[0;34m' + 'd' + '\r\n' + 'dddd');
  });

  it('a carriage return, a newline and a backspace move the column the way the terminal does', () => {
    expect(foldAtColumn('e'.repeat(70) + '\rf'.repeat(1) + 'g'.repeat(30), 80))
      .toBe('e'.repeat(70) + '\rf' + 'g'.repeat(30));
    expect(foldAtColumn('h'.repeat(80) + '\b' + 'i'.repeat(2), 80))
      .toBe('h'.repeat(80) + '\bi' + '\r\n' + 'i');
  });

  it('the repo menu logo rows fold exactly where an 80-column terminal folded them', () => {
    // Rows 3 and 4 of Screens/MENU.TXT, frozen here (not read from the board,
    // which may be redrawn): 155 and 159 printable columns.
    const row3 = '  | | | Y | | | |   | | | | | \\ Y | |  | | | Y | | |__  | | \\ Y /   | | |  __| .'
      + '. | | | | | | | | | | | | | | | | | |  | | | | | | |__| | | | | | | | | | |';
    const row4 = '  | | | | | | | |   | | | | | | | | |. | | | | | | |__| | | | | | | | | | | _\\/_'
      + ' .| | | | | | | | | | | | | | | | | | .| | | | | | |____| | | | | | | | | |  /\\';
    expect(printableLength(row3)).toBe(155);
    expect(printableLength(row4)).toBe(159);
    const out = foldAtColumn(row3 + '\r\n' + row4 + '\r\n', 80);
    expect(out.split('\r\n').map(printableLength)).toEqual([80, 75, 80, 79, 0]);
  });
});

describe('foldForWire - the fold at the wire, for a caller wider than 80', () => {
  const wide = () => ({ screenWidth: 200, petsciiMode: false } as any);

  it('folds at 80 for a 200-column ANSI caller', () => {
    expect(foldForWire('x'.repeat(159), wide())).toBe('x'.repeat(80) + '\r\n' + 'x'.repeat(79));
  });

  it('carries the column across chunks - a screen does not arrive in one piece', () => {
    const session = wide();
    const first = foldForWire('a'.repeat(50), session);
    const second = foldForWire('a'.repeat(50), session);
    expect(first).toBe('a'.repeat(50));
    expect(second).toBe('a'.repeat(30) + '\r\n' + 'a'.repeat(20));
    expect(session.wireFoldColumn).toBe(20);
  });

  it('is byte-identical at exactly 80, and for a narrower browser', () => {
    const text = 'y'.repeat(159);
    expect(foldForWire(text, { screenWidth: 80, petsciiMode: false } as any)).toBe(text);
    expect(foldForWire(text, { screenWidth: 40, petsciiMode: false } as any)).toBe(text);
  });

  it('a positioned screen is never folded, and the column starts over after it', () => {
    const session = wide();
    const positioned = '\x1b[3;1H' + 'z'.repeat(159);
    expect(foldForWire(positioned, session)).toBe(positioned);
    expect(session.wireFoldColumn).toBe(0);
  });

  it('a door that owns the terminal paints at its own width, untouched', () => {
    const text = 'w'.repeat(159);
    expect(foldForWire(text, { ...wide(), doorInputHandler: () => {} })).toBe(text);
  });

  it('a PETSCII caller is not touched here - he has his own reflow', () => {
    const text = 'v'.repeat(159);
    expect(foldForWire(text, { screenWidth: 200, petsciiMode: true } as any)).toBe(text);
  });

  it('wrapForSession itself is identity for a wide ANSI caller - the fold moved to the wire', () => {
    const text = 'u'.repeat(159);
    expect(wrapForSession(text, { screenWidth: 200, petsciiMode: false })).toBe(text);
  });
});
