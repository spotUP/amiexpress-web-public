import { printableLength, wrapLineToWidth, wrapForSession } from '../../src/utils/wrap-for-session.util';

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
