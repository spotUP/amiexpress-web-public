import {
  isTerminationMarker,
  localEnhancementTriplets,
  packetFromT42Bytes,
  packetFromTtiContent,
  packetToTtiContent,
  parseTriplet,
  tripletValue,
  type EnhancementPacket,
  type Triplet,
} from '../../teletext/enhancement';
import { hammingEncode2418 } from '../../teletext/hamming2418';
import { hammingEncode84 } from '../../teletext/marco/compile/hamming';

const END: Triplet = { address: 63, mode: 0x1f, data: 0 };

function t42Bytes(designation: number, triplets: Triplet[]): number[] {
  const out = [hammingEncode84(designation)];
  for (let i = 0; i < 13; i++) out.push(...hammingEncode2418(tripletValue(triplets[i] ?? END)));
  return out;
}

describe('enhancement packet triplets (EN 300 706 s.9.4)', () => {
  it('splits address, mode and data fields', () => {
    // Address 41 (row group, row 1), mode 0x04 (Set Active Position).
    const v = 41 | (0x04 << 6) | (0x15 << 11);
    expect(parseTriplet(v)).toEqual({ address: 41, mode: 0x04, data: 0x15 });
    expect(tripletValue(parseTriplet(v))).toBe(v);
  });

  it('recognises the termination marker', () => {
    expect(isTerminationMarker(parseTriplet(63 | (0x1f << 6)))).toBe(true);
    expect(isTerminationMarker(parseTriplet(63 | (0x1e << 6)))).toBe(false);
  });

  it('frames a transmitted X/26 packet', () => {
    const triplets: Triplet[] = [{ address: 40, mode: 0x04, data: 0 }, { address: 3, mode: 0x00, data: 0x12 }];
    const p = packetFromT42Bytes(26, t42Bytes(0, triplets));
    expect(p?.designation).toBe(0);
    expect(p?.triplets.slice(0, 3)).toEqual([...triplets, END]);
  });

  it('marks an uncorrectable triplet null and rejects a bad designation', () => {
    const bytes = t42Bytes(1, [{ address: 2, mode: 3, data: 4 }]);
    bytes[1] ^= 0b11; // two bit errors in triplet 0
    const p = packetFromT42Bytes(28, bytes);
    expect(p?.designation).toBe(1);
    expect(p?.triplets[0]).toBeNull();
    bytes[0] ^= 0b11;
    expect(packetFromT42Bytes(28, bytes)).toBeNull();
  });

  it('reads the vbit2 OL text form and writes it back', () => {
    const p: EnhancementPacket = {
      packet: 26,
      designation: 2,
      triplets: [{ address: 45, mode: 0x04, data: 0 }, { address: 10, mode: 0x0f, data: 0x41 }, END],
    };
    const content = packetToTtiContent(p);
    expect(content.charCodeAt(0)).toBe(0x42);
    const back = packetFromTtiContent(26, content);
    expect(back?.designation).toBe(2);
    expect(back?.triplets.slice(0, 3)).toEqual(p.triplets);
  });

  it('reads the six-bit groups through the +0x80 control form too', () => {
    // A writer that keeps values 0-31 as controls writes them +0x80; every
    // six-bit group of this triplet is below 0x20.
    const value = tripletValue({ address: 5, mode: 2, data: 2 });
    const content = String.fromCharCode(0x80, 0x80 | (value & 0x1f), 0x80 | ((value >>> 6) & 0x1f), 0x80 | ((value >>> 12) & 0x1f));
    expect(packetFromTtiContent(26, content)?.triplets[0]).toEqual({ address: 5, mode: 2, data: 2 });
  });

  it('runs local triplets in designation order up to the terminator', () => {
    const a: Triplet = { address: 40, mode: 4, data: 0 };
    const b: Triplet = { address: 1, mode: 0, data: 7 };
    const second: EnhancementPacket = { packet: 26, designation: 1, triplets: [b, END, a] };
    const first: EnhancementPacket = { packet: 26, designation: 0, triplets: [a, null] };
    const x28: EnhancementPacket = { packet: 28, designation: 0, triplets: [b] };
    expect(localEnhancementTriplets([second, x28, first])).toEqual([a, b]);
  });
});
