/**
 * Fastext links, decoded the way the standard actually encodes them.
 *
 * Packet 27/0 carries the six links a page offers - the four coloured
 * keys, plus the "link" and "index" slots. Each link is SIX bytes, every
 * one of them Hamming 8/4 encoded: page units, page tens, and four subcode
 * bytes whose high bits carry the target's magazine as an offset to be
 * XORed against the magazine the packet arrived in (ETSI EN 300 706
 * s.9.6.1).
 *
 * The vendored importer reads those bytes RAW and little-endian:
 *
 *     const red = (ft[0] & 0xFF) | ((ft[1] & 0xFF) << 8);
 *
 * which is not a decode at all. It produces plausible-looking rubbish -
 * Channel 4's Bamboozle page came out linking to page 25E, a page that has
 * never existed in any recovery, and the quiz looked unplayable because
 * every route out of it was invented. Decoded properly the same packet
 * says red=12B, green=151, yellow=153, cyan=154, all of which are really
 * there.
 *
 * This lives here rather than as a patch to `marco/` because that tree is
 * vendored upstream and stays byte-identical. Nothing here modifies it; the
 * links are re-derived from the same raw file after it has done its work.
 */
import { hammingDecode84 } from './marco/packet-decoder/hamming';
import type { FastextLinks, PageNumber } from './marco/model/types';
import { isRealPage, NO_LINK } from './store';

/** Where each decoded link belongs, in packet 27 order. */
const SLOTS = ['red', 'green', 'yellow', 'cyan', 'link', 'index'] as const;

export interface TeletextLine {
  magazine: number;
  packetNumber: number;
  data: Uint8Array;
}

/**
 * The page number a header packet (packet 0) announces.
 *
 * Magazine 0 on the wire means magazine 8 - the only place in teletext
 * where zero is not zero.
 */
export function pageNumberFromHeader(line: TeletextLine): PageNumber | null {
  if (line.packetNumber !== 0 || line.data.length < 2) return null;
  const units = hammingDecode84(line.data[0]);
  const tens = hammingDecode84(line.data[1]);
  if (units < 0 || tens < 0) return null;
  const magazine = line.magazine === 0 ? 8 : line.magazine;
  const page = magazine * 256 + tens * 16 + units;
  return isRealPage(page) ? page : null;
}

/**
 * The six links in a packet 27/0, or null when it carries none.
 *
 * Only designation code 0 holds the fastext links; 1-3 are other link
 * types and 4-7 are for enhancement data, and reading those as links is
 * how a page ends up offering buttons that go nowhere.
 */
export function decodeFastextLinks(line: TeletextLine): FastextLinks | null {
  if (line.packetNumber !== 27 || line.data.length < 37) return null;
  if (hammingDecode84(line.data[0]) !== 0) return null;

  const magazine = line.magazine === 0 ? 8 : line.magazine;
  const links: FastextLinks = {};
  let found = false;

  SLOTS.forEach((slot, index) => {
    const at = 1 + index * 6;
    const bytes = [0, 1, 2, 3, 4, 5].map(offset => hammingDecode84(line.data[at + offset]));
    if (bytes.some(value => value < 0)) return;

    const [units, tens, , subcode2, , subcode4] = bytes;
    // The target's magazine is carried as three bits spread across the
    // subcode bytes, and is an OFFSET from this packet's own magazine.
    const offsetBits = ((subcode2 >> 3) & 1) | (((subcode4 >> 3) & 1) << 1) | (((subcode4 >> 2) & 1) << 2);
    const targetMagazine = (magazine ^ offsetBits) || 8;
    const page = targetMagazine * 256 + tens * 16 + units;

    // 0x8FF is what an unused slot carries, and a page outside the real
    // range is a link that did not survive the tape.
    if (!isRealPage(page) || page === NO_LINK) return;
    links[slot] = page;
    found = true;
  });

  return found ? links : null;
}

/**
 * Walk a file's lines and say which links belong to which page.
 *
 * A recovery can hold one page or a whole magazine cycle, so packet 27 is
 * attributed to whichever page's header last went past in that magazine -
 * the same rule a decoder follows in real time.
 */
export function fastextByPage(lines: readonly TeletextLine[]): Map<PageNumber, FastextLinks> {
  const found = new Map<PageNumber, FastextLinks>();
  const openPage = new Map<number, PageNumber>();

  for (const line of lines) {
    if (line.packetNumber === 0) {
      const page = pageNumberFromHeader(line);
      if (page !== null) openPage.set(line.magazine, page);
      continue;
    }
    if (line.packetNumber !== 27) continue;

    const page = openPage.get(line.magazine);
    if (page === undefined || found.has(page)) continue;
    const links = decodeFastextLinks(line);
    if (links) found.set(page, links);
  }
  return found;
}
