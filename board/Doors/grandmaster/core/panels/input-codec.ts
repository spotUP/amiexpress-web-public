/**
 * The input codec: one character per frame.
 * Ports common/data/KeyDataEncoding.lua and common/data/InputCompression.lua.
 *
 * Every frame of a game is one printable character holding a 6-bit button
 * mask. This is what crosses the wire in netplay and what a replay stores, so
 * it has to be exact in both directions or a replay simply plays a different
 * game.
 *
 * THE ALPHABET IS NOT STANDARD BASE64. It is
 *     A-Z a-z 1234567890 + /
 * with the digits starting at ONE, so '0' sits at index 62 rather than 52.
 * Using a stock base64 alphabet would decode every replay slightly wrong.
 *
 * Bit values, from the same source:
 *     raise 32, swap 16, up 8, down 4, left 2, right 1
 * so idle is 'A', right 'B', left 'C', down 'E', up 'I', swap 'Q', raise 'g'.
 *
 * The run-length layer has one real subtlety: digits are legal input
 * characters, so a digit run cannot be written as "char + count" - it would be
 * ambiguous with the count itself. Those are wrapped in parentheses and
 * written out literally instead: "(555)" is three frames of '5'.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890+/';

/** Button bit values. */
export const INPUT_BITS = {
  RIGHT: 1,
  LEFT: 2,
  DOWN: 4,
  UP: 8,
  SWAP: 16,
  RAISE: 32,
} as const;

/** The single characters for each action on its own. */
export const INPUT_CHARS = {
  idle: ALPHABET[0],
  right: ALPHABET[INPUT_BITS.RIGHT],
  left: ALPHABET[INPUT_BITS.LEFT],
  down: ALPHABET[INPUT_BITS.DOWN],
  up: ALPHABET[INPUT_BITS.UP],
  swap: ALPHABET[INPUT_BITS.SWAP],
  raise: ALPHABET[INPUT_BITS.RAISE],
} as const;

export interface InputState {
  right: boolean;
  left: boolean;
  down: boolean;
  up: boolean;
  swap: boolean;
  raise: boolean;
}

/** The button mask for one frame, as a character. */
export function encodeInput(mask: number): string {
  if (!Number.isInteger(mask) || mask < 0 || mask > 63) {
    throw new Error(`encodeInput: mask out of range: ${mask}`);
  }
  return ALPHABET[mask];
}

/** The mask a character holds. */
export function decodeInput(char: string): number {
  const mask = ALPHABET.indexOf(char);
  if (mask < 0) throw new Error(`decodeInput: not an input character: ${JSON.stringify(char)}`);
  return mask;
}

export function inputStateToMask(state: Partial<InputState>): number {
  return (state.right ? INPUT_BITS.RIGHT : 0)
    + (state.left ? INPUT_BITS.LEFT : 0)
    + (state.down ? INPUT_BITS.DOWN : 0)
    + (state.up ? INPUT_BITS.UP : 0)
    + (state.swap ? INPUT_BITS.SWAP : 0)
    + (state.raise ? INPUT_BITS.RAISE : 0);
}

export function maskToInputState(mask: number): InputState {
  return {
    right: (mask & INPUT_BITS.RIGHT) !== 0,
    left: (mask & INPUT_BITS.LEFT) !== 0,
    down: (mask & INPUT_BITS.DOWN) !== 0,
    up: (mask & INPUT_BITS.UP) !== 0,
    swap: (mask & INPUT_BITS.SWAP) !== 0,
    raise: (mask & INPUT_BITS.RAISE) !== 0,
  };
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

/**
 * Run-length compress a frame-per-character input string.
 *
 * Non-digit characters become `char` followed by a decimal count; digit runs
 * are written literally inside parentheses, because a digit followed by digits
 * could not be told from a count.
 */
export function compressInputString(inputs: string): string {
  if (inputs.length === 0) return '';

  const out: string[] = [];
  const chars = [...inputs];
  let current = chars[0];
  let count = 1;

  const flush = () => {
    if (isDigit(current)) {
      out.push(`(${current.repeat(count)})`);
    } else {
      out.push(current + String(count));
    }
  };

  for (let i = 1; i < chars.length; i++) {
    if (chars[i] === current) {
      count += 1;
    } else {
      flush();
      current = chars[i];
      count = 1;
    }
  }
  flush();

  return out.join('');
}

/**
 * Expand a compressed input string.
 *
 * Iterates CODEPOINTS, not bytes: some committed replays carry multi-byte
 * characters in their input strings, and a byte-wise loop mangles them.
 *
 * If the string turns out not to be compressed at all - signalled by two
 * identical non-digit characters where a count was expected - it is returned
 * unchanged, which is what upstream does.
 */
export function decompressInputString(inputs: string): string {
  if (inputs.length === 0) return '';

  const chars = [...inputs];
  const out: string[] = [];
  let i = 0;

  while (i < chars.length) {
    const char = chars[i];

    if (char === '(') {
      // A literal run of digit inputs.
      i += 1;
      while (i < chars.length && chars[i] !== ')') {
        out.push(chars[i]);
        i += 1;
      }
      if (i >= chars.length) return inputs; // unterminated: not compressed
      i += 1; // skip ')'
      continue;
    }

    if (isDigit(char)) {
      // A bare digit where an input character was expected: not compressed.
      return inputs;
    }

    // An input character, then its decimal count.
    i += 1;
    let digits = '';
    while (i < chars.length && isDigit(chars[i])) {
      digits += chars[i];
      i += 1;
    }
    if (digits === '') {
      // No count followed: the string was never compressed.
      return inputs;
    }
    out.push(char.repeat(Number(digits)));
  }

  return out.join('');
}
