/**
 * Fastext links, decoded per ETSI EN 300 706 s.9.6.1.
 *
 * The vendored importer read packet 27's links as raw little-endian bytes
 * instead of the Hamming 8/4 the standard uses. It did not fail loudly - it
 * produced plausible page numbers that had never been broadcast, so
 * Channel 4's Bamboozle appeared to link to page 25E and the quiz looked
 * unrecoverable. These tests build packets the way a transmitter does and
 * insist on getting back what went in.
 */
import { hammingEncode84 } from '../../teletext/marco/compile/hamming';
import {
  decodeFastextLinks,
  pageNumberFromHeader,
  fastextByPage,
  type TeletextLine,
} from '../../teletext/packet27';

/** One link as six Hamming 8/4 bytes: units, tens, then the subcode bytes. */
function link(page: number, fromMagazine: number): number[] {
  const magazine = (page >> 8) & 7;
  const offset = magazine ^ (fromMagazine & 7);
  const subcode2 = (offset & 1) << 3;
  const subcode4 = (((offset >> 1) & 1) << 3) | (((offset >> 2) & 1) << 2);
  return [page & 0x0f, (page >> 4) & 0x0f, 0, subcode2, 0, subcode4].map(hammingEncode84);
}

/**
 * A packet 27 as a transmitter builds one: ALL SIX slots always present,
 * with 0x8FF in the ones a page does not use. Leaving them as zero bytes
 * is not a smaller packet, it is a corrupt one - and the decoder rightly
 * reads those bytes as a page.
 */
function packet27(pages: number[], magazine = 1, designation = 0): TeletextLine {
  const data = new Uint8Array(40);
  data[0] = hammingEncode84(designation);
  const slots = [...pages];
  while (slots.length < 6) slots.push(0x8ff);
  slots.slice(0, 6).forEach((page, index) => {
    link(page, magazine).forEach((byte, at) => {
      data[1 + index * 6 + at] = byte;
    });
  });
  return { magazine, packetNumber: 27, data };
}

function header(page: number): TeletextLine {
  const data = new Uint8Array(40);
  data[0] = hammingEncode84(page & 0x0f);
  data[1] = hammingEncode84((page >> 4) & 0x0f);
  return { magazine: (page >> 8) & 7, packetNumber: 0, data };
}

describe('decoding the coloured keys', () => {
  it('reads the four links back exactly as transmitted', () => {
    const links = decodeFastextLinks(packet27([0x12b, 0x151, 0x153, 0x154]));
    expect(links).toMatchObject({ red: 0x12b, green: 0x151, yellow: 0x153, cyan: 0x154 });
  });

  it('reads hex pages, which is what a quiz is made of', () => {
    // Bamboozle used hex page numbers on purpose: a remote control has no
    // A-F keys, so the coloured buttons were the only way through.
    const links = decodeFastextLinks(packet27([0x10b, 0x10f, 0x1aa, 0x1ff]));
    expect(links).toMatchObject({ red: 0x10b, green: 0x10f, yellow: 0x1aa, cyan: 0x1ff });
  });

  it('follows a link into another magazine', () => {
    // The target magazine is carried as an offset XORed against the
    // magazine the packet arrived in, which is the part a raw byte read
    // cannot express at all.
    const links = decodeFastextLinks(packet27([0x250, 0x700, 0x8ab], 1));
    expect(links).toMatchObject({ red: 0x250, green: 0x700, yellow: 0x8ab });
  });

  it('carries the link and index slots too', () => {
    const links = decodeFastextLinks(packet27([0x101, 0x102, 0x103, 0x104, 0x105, 0x150]));
    expect(links).toMatchObject({ link: 0x105, index: 0x150 });
  });

  it('ignores the 0x8FF an unused slot carries', () => {
    const links = decodeFastextLinks(packet27([0x101, 0x8ff, 0x8ff, 0x8ff]));
    expect(links).toMatchObject({ red: 0x101 });
    expect(links?.green).toBeUndefined();
    expect(links?.cyan).toBeUndefined();
  });

  it('reads only designation code 0', () => {
    // 1-3 are other link types and 4-7 are enhancement data. Reading those
    // as links gives a page buttons that go nowhere.
    expect(decodeFastextLinks(packet27([0x101], 1, 3))).toBeNull();
    expect(decodeFastextLinks(packet27([0x101], 1, 4))).toBeNull();
  });

  it('is null for a packet that is not 27, or that holds no link', () => {
    expect(decodeFastextLinks({ magazine: 1, packetNumber: 1, data: new Uint8Array(40) })).toBeNull();
    expect(decodeFastextLinks(packet27([0x8ff, 0x8ff, 0x8ff, 0x8ff]))).toBeNull();
  });
});

describe('which page the links belong to', () => {
  it('reads a page number off its header', () => {
    expect(pageNumberFromHeader(header(0x152))).toBe(0x152);
    expect(pageNumberFromHeader(header(0x1a0))).toBe(0x1a0);
  });

  it('reads magazine 0 on the wire as magazine 8', () => {
    const line = header(0x8ff);
    expect(line.magazine).toBe(0);
    expect(pageNumberFromHeader(line)).toBe(0x8ff);
  });

  it('attributes a packet 27 to the page whose header came before it', () => {
    const links = fastextByPage([
      header(0x10a),
      packet27([0x10b, 0x10f, 0x10f, 0x10f]),
      header(0x10b),
      packet27([0x10c, 0x10f, 0x10f, 0x10f]),
    ]);
    expect(links.get(0x10a)).toMatchObject({ red: 0x10b });
    expect(links.get(0x10b)).toMatchObject({ red: 0x10c });
  });

  it('ignores links arriving before any header', () => {
    expect(fastextByPage([packet27([0x101])]).size).toBe(0);
  });
});
