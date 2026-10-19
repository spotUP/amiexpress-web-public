import { hammingDecode2418, hammingEncode2418 } from '../../teletext/hamming2418';

describe('Hamming 24/18 (EN 300 706 s.8.3)', () => {
  it('encodes the spec bit layout: all-zero data sets P1..P5 and leaves P6 clear', () => {
    // Zero data: every group needs its parity bit for odd parity (positions
    // 1,2,4,8,16), five ones, so P6 (position 24) stays clear to keep odd.
    const [b0, b1, b2] = hammingEncode2418(0);
    expect(b0).toBe(0b10001011);
    expect(b1).toBe(0b10000000);
    expect(b2).toBe(0);
  });

  it('places D1 at position 3 and D18 at position 23', () => {
    const d1 = hammingEncode2418(1);
    expect(d1[0] & 0b100).toBe(0b100);
    const d18 = hammingEncode2418(1 << 17);
    expect(d18[2] & 0b1000000).toBe(0b1000000);
  });

  it('matches the spec P1 and P4 equations', () => {
    const d = (v: number, n: number) => (v >>> (n - 1)) & 1;
    for (let v = 0; v < 1 << 18; v += 4093) {
      const [b0] = hammingEncode2418(v);
      const p1 = 1 ^ [1, 2, 4, 5, 7, 9, 11, 12, 14, 16, 18].reduce((a, n) => a ^ d(v, n), 0);
      const p4 = 1 ^ [5, 6, 7, 8, 9, 10, 11].reduce((a, n) => a ^ d(v, n), 0);
      expect(b0 & 1).toBe(p1);
      expect((b0 >> 7) & 1).toBe(p4);
    }
  });

  it('round-trips every one of a spread of values', () => {
    for (let v = 0; v < 1 << 18; v += 997) {
      const [a, b, c] = hammingEncode2418(v);
      expect(hammingDecode2418(a, b, c)).toBe(v);
    }
    const max = (1 << 18) - 1;
    expect(hammingDecode2418(...hammingEncode2418(max))).toBe(max);
  });

  it('corrects any single bit error', () => {
    const v = 0x2a5c3;
    const bytes = hammingEncode2418(v);
    for (let bit = 0; bit < 24; bit++) {
      const bad = [...bytes] as [number, number, number];
      bad[bit >> 3] ^= 1 << (bit & 7);
      expect(hammingDecode2418(...bad)).toBe(v);
    }
  });

  it('rejects double bit errors', () => {
    const bytes = hammingEncode2418(0x15555);
    for (let i = 0; i < 24; i++) {
      for (let j = i + 1; j < 24; j++) {
        const bad = [...bytes] as [number, number, number];
        bad[i >> 3] ^= 1 << (i & 7);
        bad[j >> 3] ^= 1 << (j & 7);
        expect(hammingDecode2418(...bad)).toBe(-1);
      }
    }
  });
});
