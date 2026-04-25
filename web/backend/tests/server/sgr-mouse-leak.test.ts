/**
 * Regression: mouse-tracking SGR sequences must NOT leak as visible text
 * when no door is consuming them.
 *
 * The bug: xterm.js retains DEC mouse mode 1006 across door exits and
 * chat-only-login transitions. Every mouse move then emits
 * `\x1b[<btn;col;row;M` back to the backend over the 'command' channel.
 * If subState is ANSI_PROMPT (or any other pre-login / fall-through state)
 * and inDoorManager is false, command.handler.ts:1020 hits the multi-char
 * input path and iterates each printable byte (skipping ESC, echoing
 * `[`, `<`, digits, `;`, `M`) into the user's terminal.
 *
 * Reproducible repro from prod log (2026-04-25):
 *   data="[<35;89;20M" subState=ansi_prompt paginatedScreen=false inDoorManager=false
 *
 * Fix: drop SGR mouse sequences in socket-handlers.ts right before the
 * BBS command-handler fall-through. Doors that need mouse get the data
 * via earlier branches (clientDoorActive, gameModeEnabled, inDoorManager).
 *
 * This test asserts the regex used for the drop matches all valid SGR
 * mouse encodings while leaving normal input alone.
 */

const SGR_MOUSE_REGEX = /^\x1b\[<\d+;\d+;\d+[Mm]/;

describe('SGR mouse-leak guard regex', () => {
  test('matches mouse-motion press (button=35, big coords)', () => {
    expect(SGR_MOUSE_REGEX.test('\x1b[<35;128;1M')).toBe(true);
    expect(SGR_MOUSE_REGEX.test('\x1b[<35;1;1M')).toBe(true);
    expect(SGR_MOUSE_REGEX.test('\x1b[<35;89;20M')).toBe(true);
  });

  test('matches button-release form (lowercase m)', () => {
    expect(SGR_MOUSE_REGEX.test('\x1b[<0;10;5m')).toBe(true);
    expect(SGR_MOUSE_REGEX.test('\x1b[<2;100;50m')).toBe(true);
  });

  test('matches typical wheel-scroll encodings', () => {
    expect(SGR_MOUSE_REGEX.test('\x1b[<64;40;20M')).toBe(true);  // wheel up
    expect(SGR_MOUSE_REGEX.test('\x1b[<65;40;20M')).toBe(true);  // wheel down
  });

  test('does NOT match arrow keys / function keys / common CSI input', () => {
    expect(SGR_MOUSE_REGEX.test('\x1b[A')).toBe(false);          // up arrow
    expect(SGR_MOUSE_REGEX.test('\x1b[B')).toBe(false);          // down arrow
    expect(SGR_MOUSE_REGEX.test('\x1b[1;2A')).toBe(false);       // shift+up
    expect(SGR_MOUSE_REGEX.test('\x1b[11~')).toBe(false);        // F1
    expect(SGR_MOUSE_REGEX.test('\x1bOP')).toBe(false);           // F1 alt
    expect(SGR_MOUSE_REGEX.test('\x1b[H')).toBe(false);          // home
  });

  test('does NOT match printable text', () => {
    expect(SGR_MOUSE_REGEX.test('A')).toBe(false);
    expect(SGR_MOUSE_REGEX.test('hello')).toBe(false);
    expect(SGR_MOUSE_REGEX.test('\r')).toBe(false);
    expect(SGR_MOUSE_REGEX.test('')).toBe(false);
  });

  test('does NOT match SGR color sequences (no `<` after `[`)', () => {
    expect(SGR_MOUSE_REGEX.test('\x1b[31m')).toBe(false);
    expect(SGR_MOUSE_REGEX.test('\x1b[1;31;40m')).toBe(false);
    expect(SGR_MOUSE_REGEX.test('\x1b[0m')).toBe(false);
  });

  test('does NOT match X10 mouse format (legacy ESC[M+3 bytes)', () => {
    // X10 mouse uses ESC[M followed by 3 chars (no `<` prefix). The SGR
    // regex must not match it; X10 is handled separately by neo-blessed
    // and never reaches this fall-through.
    expect(SGR_MOUSE_REGEX.test('\x1b[M xx')).toBe(false);
  });

  test('matches the exact prod-log poison value verbatim', () => {
    // Real captures from docker compose logs on 2026-04-25 showing the
    // leak in action. If any of these stop matching, the leak returns.
    const prodSamples = [
      '\x1b[<35;100;56M',
      '\x1b[<35;98;54M',
      '\x1b[<35;126;2M',
      '\x1b[<35;128;1M',
      '\x1b[<35;1;1M',
    ];
    for (const sample of prodSamples) {
      expect(SGR_MOUSE_REGEX.test(sample)).toBe(true);
    }
  });

  test('matches at start only — no middle/end matches that could swallow real input', () => {
    // The regex is anchored to ^, so a fragment in the middle of a longer
    // payload should NOT match. This guards against accidentally dropping
    // legitimate data that happens to contain the substring.
    const fakeMatch = 'hello\x1b[<0;1;1M';
    expect(SGR_MOUSE_REGEX.test(fakeMatch)).toBe(false);
  });
});
