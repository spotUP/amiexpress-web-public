/**
 * Browser KeyboardEvent -> PETSCII byte translation.
 *
 * Maps `event.key` (plus shift state) to the PETSCII byte sequence a real
 * C64 keyboard would have sent for that key. Named/control keys use a fixed
 * table; single printable characters are case-swapped because PETSCII and
 * ASCII disagree about which case lives in which code range (uppercase
 * PETSCII letters are $41-$5A, matching lowercase ASCII bytes, and vice
 * versa - this is the "unshifted = uppercase" C64 keyboard convention).
 *
 * Pure function: no DOM access beyond the two primitive arguments, so it is
 * unit-testable without jsdom/canvas.
 */

// Named keys that don't depend on shift state.
const NAMED_KEYS: { [key: string]: number } = {
  Enter: 0x0D,
  Backspace: 0x14,
  Delete: 0x14,
  ArrowDown: 0x11,
  ArrowUp: 0x91,
  ArrowRight: 0x1D,
  ArrowLeft: 0x9D,
  // C64 function keys: F1/F3/F5/F7 are the "base" keys, F2/F4/F6/F8 are
  // their shifted counterparts on the real keyboard, but browsers report
  // F1-F8 as distinct keys regardless of a shift modifier - map each
  // browser key straight to its C64 byte.
  F1: 0x85,
  F2: 0x89,
  F3: 0x86,
  F4: 0x8A,
  F5: 0x87,
  F6: 0x8B,
  F7: 0x88,
  F8: 0x8C,
};

// Keys whose byte depends on shiftKey.
const SHIFTABLE_NAMED_KEYS: { [key: string]: [unshifted: number, shifted: number] } = {
  Home: [0x13, 0x93],
};

export function keyEventToPetscii(key: string, shiftKey: boolean): number[] | null {
  if (key in SHIFTABLE_NAMED_KEYS) {
    const [unshifted, shifted] = SHIFTABLE_NAMED_KEYS[key];
    return [shiftKey ? shifted : unshifted];
  }
  if (key in NAMED_KEYS) {
    return [NAMED_KEYS[key]];
  }
  if (key.length !== 1) return null;

  const code = key.charCodeAt(0);
  if (code >= 0x61 && code <= 0x7A) return [code - 0x20]; // a-z -> $41-$5A
  if (code >= 0x41 && code <= 0x5A) return [code + 0x80]; // A-Z -> $C1-$DA
  if (code >= 0x20 && code <= 0x3F) return [code];        // digits/punctuation
  if (code === 0x40 || (code >= 0x5B && code <= 0x5F)) return [code]; // @[\]^_
  return null;
}
