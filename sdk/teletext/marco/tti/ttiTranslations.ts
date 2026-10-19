/**
 * TTI control character translation.
 *
 * TTI files store Teletext control codes (0x00-0x1F) by mapping them
 * into the high ASCII range 0x00→0x80, 0x01→0x81, ..., 0x1F→0x9F.
 * This avoids conflicts with ASCII control characters in text files.
 *
 * Per 03_TTI_INTEROP.md.
 */

const TTI_CONTROL_OFFSET = 0x80;
/** MRG s.3 Viewdata escape introducer: ESC then (code + 0x40). */
const TTI_VIEWDATA_ESC = 0x1b;

/**
 * Convert a TTI-encoded byte (from OL line content) to Teletext byte.
 * - 0x80-0x9F → 0x00-0x1F (control codes)
 * - everything else passes through
 */
export function ttiByteToTeletext(byte: number): number {
  if (byte >= 0x80 && byte <= 0x9F) {
    return byte - TTI_CONTROL_OFFSET;
  }
  return byte;
}

/**
 * Convert a Teletext byte to TTI-encoded byte for export.
 * - 0x00-0x1F → 0x80-0x9F (translated control codes)
 * - everything else passes through
 */
export function teletextByteToTti(byte: number): number {
  if (byte >= 0x00 && byte <= 0x1F) {
    return byte + TTI_CONTROL_OFFSET;
  }
  return byte;
}

/**
 * Decode an OL line string into Teletext bytes.
 *
 * Handles three encoding styles:
 * 1. Direct high-byte encoding: characters 0x80-0x9F represent control codes
 * 2. Viewdata escape (MRG s.3): ESC followed by code + 0x40
 * 3. Escaped hex notation: literal \xNN sequences (common in text-mode TTI files)
 *
 * Both are translated to Teletext bytes (0x00-0x1F for control codes).
 */
export function decodeOLContent(content: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < content.length; i++) {
    // Check for \xNN hex escape sequence
    if (
      content[i] === '\\' &&
      i + 3 < content.length &&
      content[i + 1] === 'x' &&
      isHexDigit(content[i + 2]) &&
      isHexDigit(content[i + 3])
    ) {
      const code = parseInt(content.substring(i + 2, i + 4), 16);
      bytes.push(ttiByteToTeletext(code));
      i += 3; // skip past \xNN (loop increments once more)
      continue;
    }
    // MRG "Teletext Page Format" v1.1 s.3 (Translations): a seven-bit
    // writer may replace a code below 0x20 with "<esc> followed by the
    // character code plus hex 0x40" (the Viewdata escape). edit.tf's TTI
    // export writes every control this way, and vbit2's TTXLine treats any
    // raw 0x1B as this escape. The escaped payload is always 0x40-0x5F, so
    // ESC + 0x40..0x5F is the escape; teletext's own ESC (0x1B) arrives as
    // 0x9B (+0x80 form) or ESC + 0x5B. A raw 0x1B followed by anything
    // else, or at the end, is not an MRG form; it is kept as 0x1B so legacy
    // raw-byte files still decode.
    if (content.charCodeAt(i) === TTI_VIEWDATA_ESC && i + 1 < content.length) {
      const next = content.charCodeAt(i + 1);
      if (next >= 0x40 && next <= 0x5f) {
        bytes.push(next - 0x40);
        i += 1;
        continue;
      }
    }
    const code = content.charCodeAt(i);
    bytes.push(ttiByteToTeletext(code));
  }
  return bytes;
}

function isHexDigit(ch: string): boolean {
  return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

/**
 * Encode Teletext bytes into an OL line string for export.
 * Control codes 0x00-0x1F are translated to 0x80-0x9F.
 */
export function encodeOLContent(bytes: number[]): string {
  return bytes.map(b => String.fromCharCode(teletextByteToTti(b))).join('');
}
