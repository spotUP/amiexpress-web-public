/**
 * PETSCII <-> screen code remap (reference doc section 2, verified against
 * sta.c64.org/cbm64pettoscr.html). The VIC-II displays screen codes; the
 * byte stream carries PETSCII. Both directions live here so the machine,
 * the transducer and the backend's PUA renderer share one table.
 */

/** Printable PETSCII ($20-$3F, $40-$7F, $A0-$FF) -> screen code 0x00-0x7F. Callers filter control bytes first. */
export function printablePetsciiToScreenCode(p: number): number {
  if (p <= 0x3F) return p;
  if (p <= 0x5F) return p - 0x40;
  if (p <= 0x7F) return p - 0x20;
  if (p <= 0xBF) return p - 0x40;
  if (p <= 0xFE) return p - 0x80;
  return 0x5E; // $FF = pi
}

/** Screen code 0x00-0x7F -> PETSCII byte. Bit 7 (reverse) is a $12/$92 stream concern, never folded in here. */
export function screenCodeToPetscii(sc: number): number {
  if (sc <= 0x1F) return sc + 0x40;
  if (sc <= 0x3F) return sc;
  if (sc <= 0x5F) return sc + 0x80;
  if (sc <= 0x7F) return sc + 0x40;
  return 0x20;
}
