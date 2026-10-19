/**
 * Hamming 24/18 per ETSI EN 300 706 s.8.3.
 *
 * Enhancement packets (X/26, X/28, M/29) carry 13 triplets of 18 data bits,
 * each spread over three transmitted bytes. Bits go out LSB first, so bit 0
 * of byte 0 is transmission position 1:
 *
 *   pos  1  2  3  4  5  6  7  8 | 9..15   16 | 17..23   24
 *        P1 P2 D1 P3 D2 D3 D4 P4 | D5..D11 P5 | D12..D18 P6
 *
 * P1..P5 sit at the power-of-two positions and each covers the positions
 * whose number has that bit set (P1 = 1 xor D1 D2 D4 D5 D7 D9 D11 D12 D14
 * D16 D18, and so on); every group has odd parity. P6 makes the whole
 * 24-bit word odd. A single error is corrected at position 16E+8D+4C+2B+A;
 * a double error is detected and the triplet rejected.
 *
 * The data value is D1..D18 as bits 0..17 of the returned number.
 */

/** Transmission positions (1-based) of D1..D18. */
const DATA_POSITIONS: readonly number[] = [
  3, 5, 6, 7,
  9, 10, 11, 12, 13, 14, 15,
  17, 18, 19, 20, 21, 22, 23,
];

/** Parity of the set bits in a word: 1 when odd. */
function parity(word: number): number {
  let w = word >>> 0;
  w ^= w >>> 16;
  w ^= w >>> 8;
  w ^= w >>> 4;
  w ^= w >>> 2;
  w ^= w >>> 1;
  return w & 1;
}

/** Mask of the positions (bit k-1 for position k) one parity group covers. */
function groupMask(bit: number): number {
  let mask = 0;
  for (let pos = 1; pos <= 23; pos++) if (pos & (1 << bit)) mask |= 1 << (pos - 1);
  return mask;
}

const GROUP_MASKS: readonly number[] = [0, 1, 2, 3, 4].map(groupMask);

/** Encode 18 data bits as the three transmitted bytes. */
export function hammingEncode2418(value: number): [number, number, number] {
  let word = 0;
  DATA_POSITIONS.forEach((pos, i) => {
    if ((value >>> i) & 1) word |= 1 << (pos - 1);
  });
  GROUP_MASKS.forEach((mask, i) => {
    // Odd parity per group: set the parity bit when the data alone is even.
    if (parity(word & mask) === 0) word |= 1 << ((1 << i) - 1);
  });
  if (parity(word) === 0) word |= 1 << 23;
  return [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff];
}

/**
 * Decode three transmitted bytes to the 18-bit value, correcting a single
 * bit error. Returns -1 for a detected double error.
 */
export function hammingDecode2418(b0: number, b1: number, b2: number): number {
  let word = (b0 & 0xff) | ((b1 & 0xff) << 8) | ((b2 & 0xff) << 16);
  let syndrome = 0;
  GROUP_MASKS.forEach((mask, i) => {
    if (parity(word & mask) === 0) syndrome |= 1 << i;
  });
  const overallOk = parity(word) === 1;
  if (syndrome !== 0) {
    // A failing group with good overall parity is two errors.
    if (overallOk || syndrome > 23) return -1;
    word ^= 1 << (syndrome - 1);
  }
  // syndrome 0 with bad overall parity: only P6 is wrong; the data stands.
  let value = 0;
  DATA_POSITIONS.forEach((pos, i) => {
    if ((word >>> (pos - 1)) & 1) value |= 1 << i;
  });
  return value;
}
