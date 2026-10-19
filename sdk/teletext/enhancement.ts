/**
 * Enhancement packets X/26, X/28 and M/29 (ETSI EN 300 706 s.9.4, s.9.4.2,
 * s.9.5): framing and triplet fields. Data only - nothing here renders.
 *
 * A packet's 40 data bytes are one designation code (Hamming 8/4) and 13
 * triplets of three bytes (Hamming 24/18). Each 18-bit triplet splits into
 *
 *   address  bits 0..5    0-39 column, 40-63 row (s.12.3.1)
 *   mode     bits 6..10   what the triplet does
 *   data     bits 11..17  its argument
 *
 * Address 63 with mode 0x1F is the termination marker: a page's X/26 run
 * ends there (s.12.3.1, Table 27).
 *
 * TTI carries the same packets as OL,26 / OL,28 / OL,29 in vbit2's text
 * form (vbit2 Packet::SetRow): the first character's low four bits are the
 * designation code, then 13 x 3 characters of six bits each, low bits
 * first. edit.tf never writes OL,26-29 (its exporter writes OL,1-24 and
 * FL only), so the vbit2 form is the one form in the wild.
 */
import { hammingDecode84 } from './marco/packet-decoder/hamming';
import { hammingDecode2418 } from './hamming2418';
import { decodeOLContent } from './marco/tti/ttiTranslations';
import type { EnhancementPacket, EnhancementPacketNumber, Triplet } from './marco/model/types';

export type { EnhancementPacket, EnhancementPacketNumber, Triplet };

/** Triplets per packet. */
export const TRIPLETS_PER_PACKET = 13;

/** Row 24: the last display row a page carries (EN 300 706 s.9.3.1). */
export const LAST_DISPLAY_ROW = 24;

/**
 * Add a packet to a subpage's list. A later packet with the same number and
 * designation replaces the earlier one, as a decoder's page store does.
 */
export function storeEnhancementPacket(list: EnhancementPacket[], p: EnhancementPacket): void {
  const at = list.findIndex((q) => q.packet === p.packet && q.designation === p.designation);
  if (at >= 0) list[at] = p;
  else list.push(p);
}

export function isEnhancementPacketNumber(n: number): n is EnhancementPacketNumber {
  return n === 26 || n === 28 || n === 29;
}

/** Split an 18-bit triplet value into its fields. */
export function parseTriplet(value: number): Triplet {
  return { address: value & 0x3f, mode: (value >>> 6) & 0x1f, data: (value >>> 11) & 0x7f };
}

/** Join fields back into the 18-bit value. */
export function tripletValue(t: Triplet): number {
  return (t.address & 0x3f) | ((t.mode & 0x1f) << 6) | ((t.data & 0x7f) << 11);
}

/** Address 63, mode 0x1F: the end of an X/26 run. */
export function isTerminationMarker(t: Triplet): boolean {
  return t.address === 63 && t.mode === 0x1f;
}

/** Row address group (40-63) rather than a column (0-39). */
export function isRowAddress(t: Triplet): boolean {
  return t.address >= 40;
}

/**
 * A packet from the 40 transmitted data bytes (parity kept: Hamming bytes
 * use all eight bits). Null when the designation code is uncorrectable.
 */
export function packetFromT42Bytes(
  packet: EnhancementPacketNumber,
  raw: ArrayLike<number>,
): EnhancementPacket | null {
  if (raw.length < 1 + 3 * TRIPLETS_PER_PACKET) return null;
  const designation = hammingDecode84(raw[0]);
  if (designation < 0) return null;
  const triplets: Array<Triplet | null> = [];
  for (let i = 0; i < TRIPLETS_PER_PACKET; i++) {
    const at = 1 + 3 * i;
    const value = hammingDecode2418(raw[at], raw[at + 1], raw[at + 2]);
    triplets.push(value < 0 ? null : parseTriplet(value));
  }
  return { packet, designation, triplets };
}

/**
 * A packet from an OL,26 / OL,28 / OL,29 record's content (vbit2 text
 * form). The content goes through the OL decoder first, so the +0x80 and
 * ESC + 0x40 control forms read the same as plain characters. Missing
 * characters read as 0. Null on an empty record.
 */
export function packetFromTtiContent(
  packet: EnhancementPacketNumber,
  content: string,
): EnhancementPacket | null {
  const bytes = decodeOLContent(content);
  if (bytes.length === 0) return null;
  const six = (i: number): number => (i < bytes.length ? bytes[i] & 0x3f : 0);
  const triplets: Array<Triplet | null> = [];
  for (let i = 0; i < TRIPLETS_PER_PACKET; i++) {
    const at = 1 + 3 * i;
    triplets.push(parseTriplet(six(at) | (six(at + 1) << 6) | (six(at + 2) << 12)));
  }
  return { packet, designation: bytes[0] & 0x0f, triplets };
}

/**
 * The OL content for a packet in the vbit2 form, each six-bit group as
 * 0x40 + value so every character is printable. Null triplets write as
 * the termination marker.
 */
export function packetToTtiContent(p: EnhancementPacket): string {
  const chars: number[] = [0x40 | (p.designation & 0x0f)];
  for (let i = 0; i < TRIPLETS_PER_PACKET; i++) {
    const t = p.triplets[i] ?? { address: 63, mode: 0x1f, data: 0 };
    const v = tripletValue(t);
    chars.push(0x40 | (v & 0x3f), 0x40 | ((v >>> 6) & 0x3f), 0x40 | ((v >>> 12) & 0x3f));
  }
  return String.fromCharCode(...chars);
}

/**
 * The page's local X/26 enhancement triplets in transmission order:
 * designation codes 0-15 ascending, stopping at the first termination
 * marker. Uncorrectable triplets are skipped (s.12.3.1: a decoder ignores
 * a triplet it cannot correct).
 */
export function localEnhancementTriplets(packets: readonly EnhancementPacket[]): Triplet[] {
  const x26 = packets
    .filter((p) => p.packet === 26)
    .sort((a, b) => a.designation - b.designation);
  const out: Triplet[] = [];
  for (const p of x26) {
    for (const t of p.triplets) {
      if (!t) continue;
      if (isTerminationMarker(t)) return out;
      out.push(t);
    }
  }
  return out;
}
