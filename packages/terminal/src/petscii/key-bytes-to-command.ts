/**
 * Inverse of `keyEventToPetscii` (petscii/keymap.ts): translates the
 * synthetic PETSCII bytes PetsciiCanvas's onKeyDown produced back into the
 * ASCII string the server's 'command' input path (xterm's term.onData)
 * already understands. Only the ranges the brief scoped are handled;
 * cursor keys, function keys, and Home/Clear are dropped for now (documented
 * limitation - the ASCII command path has no representation for them yet).
 *
 * Extracted from BBSTerminal.tsx (final review wave, Finding 4) so this
 * pure, dependency-free function is directly unit-testable, the same way
 * petscii/keymap.ts's keyEventToPetscii already is (see
 * tests/petscii/petscii-keymap.test.ts) - BBSTerminal.tsx itself pulls in
 * React/xterm/socket.io-client, which aren't installed for the backend
 * test process that pins this logic.
 */
export function petsciiKeyBytesToCommand(bytes: number[]): string {
  let out = '';
  for (const b of bytes) {
    if (b === 0x0d) {
      out += '\r';
    } else if (b === 0x14) {
      out += '\x7f';
    } else if (b >= 0x41 && b <= 0x5a) {
      // Unshifted letter key (keyEventToPetscii mapped ascii a-z -> $41-$5A).
      out += String.fromCharCode(b + 0x20);
    } else if (b >= 0xc1 && b <= 0xda) {
      // Shifted letter key (keyEventToPetscii mapped ascii A-Z -> $C1-$DA).
      out += String.fromCharCode(b - 0x80);
    } else if (b >= 0x20 && b <= 0x3f) {
      // Digits/punctuation/space: identical in both encodings.
      out += String.fromCharCode(b);
    } else if (b === 0x40 || (b >= 0x5b && b <= 0x5f)) {
      // @ [ \ ] ^ _ : PETSCII codepoints identical to ASCII here too
      // (keymap.ts already produces them for these keys) — Finding 4,
      // final review wave: these were falling through every branch above
      // and being silently dropped.
      out += String.fromCharCode(b);
    }
    // Cursor keys ($11/$91/$1D/$9D), F-keys ($85-$8C), Home/Clear ($13/$93):
    // dropped until the server input path accepts them.
  }
  return out;
}
