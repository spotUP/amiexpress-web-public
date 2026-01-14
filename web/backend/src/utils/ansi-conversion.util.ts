/**
 * ANSI Conversion Utility
 *
 * Converts Amiga-style bare ANSI codes to proper ANSI escape sequences
 * for modern terminals. Amiga console.device accepts bare codes like
 * "[36m" but modern terminals require the ESC prefix.
 */

/**
 * Convert Amiga CSI (0x9B) to standard ANSI ESC+[ (0x1B 0x5B)
 * and add ESC prefix to bare ANSI sequences.
 *
 * @param text - Text that may contain Amiga ANSI codes
 * @returns Text with properly prefixed ANSI codes
 */
export function convertAmigaAnsi(text: string): string {
  if (!text) return text;

  let converted = text;

  // Convert Amiga CSI (0x9B) to standard ANSI ESC+[ (0x1B 0x5B)
  // Amiga uses a single-byte CSI character for ANSI codes
  converted = converted.replace(/\x9b/g, '\x1b[');

  // Convert bare ANSI sequences (without ESC prefix) to proper ANSI
  // Amiga console.device accepts bare "[32m" sequences without ESC prefix.
  // Pattern: [ followed by optional ? (DEC private), params (digits/semicolons), and command letter
  // Examples: [32m -> ESC[32m, [H -> ESC[H, [2J -> ESC[2J, [?25l -> ESC[?25l
  // Only convert if not already preceded by ESC
  //
  // NOTE: The lookbehind (?<!\x1b) ensures we don't double-prefix codes
  // that already have ESC. The [A-Za-z] at the end matches the command letter.
  converted = converted.replace(/(?<!\x1b)\[([?]?\d*(?:;\d*)*[A-Za-z])/g, '\x1b[$1');

  // Filter out Amiga console.device specific codes that aren't standard ANSI:
  // - [0 p = cursor off (Amiga-specific, not valid ANSI)
  // - [1 p = cursor on (Amiga-specific, not valid ANSI)
  // - [ p = toggle cursor (Amiga-specific)
  // These have a space before the 'p' which makes them Amiga-specific.
  converted = converted.replace(/\x1b\[(\d*)\s+p/gi, '');

  return converted;
}

/**
 * Normalize line endings for terminal display.
 * Amiga uses LF only, terminals typically need CRLF.
 *
 * @param text - Text with potentially mixed line endings
 * @returns Text with normalized CRLF line endings
 */
export function normalizeLineEndings(text: string): string {
  if (!text) return text;
  // First normalize any existing CRLF to LF, then convert all LF to CRLF
  return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

/**
 * Full Amiga text conversion for terminal output.
 * Applies both ANSI conversion and line ending normalization.
 *
 * @param text - Amiga text to convert
 * @returns Text ready for modern terminal display
 */
export function convertAmigaTextForTerminal(text: string): string {
  if (!text) return text;
  return normalizeLineEndings(convertAmigaAnsi(text));
}
