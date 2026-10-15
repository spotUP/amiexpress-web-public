/**
 * Amiga Character Conversion Utilities
 *
 * Converts Amiga/Latin-1 character bytes to ASCII equivalents for proper terminal/file display.
 * Amiga BBS doors use Latin-1 character set, but modern systems expect ASCII or UTF-8.
 */

/**
 * Convert Amiga/Latin-1 character byte to ASCII equivalent.
 *
 * Key mappings:
 * - 0xA0 (non-breaking space in Latin-1) -> 0x20 (regular space)
 * - Other high-bit characters (0x80-0xFF) -> stripped or converted as needed
 *
 * This fixes display issues where Amiga non-breaking spaces (used as thousands separators
 * in doors like MultiTop) appear as corrupted UTF-8 characters (┬á) in modern terminals.
 *
 * @param byte - Amiga/Latin-1 character byte (0-255)
 * @returns ASCII equivalent byte (0-127)
 */
export function amigaCharToAscii(byte: number): number {
  // Non-breaking space (0xA0) -> regular space (0x20)
  // This fixes MultiTop and other doors using 0xA0 as thousands separator
  if (byte === 0xA0) {
    return 0x20;
  }

  // For now, pass through ASCII (0x00-0x7F) and strip other high-bit chars
  // Extended Latin-1 chars (0x80-0xFF) would need individual mappings if used
  if (byte >= 0x80 && byte <= 0xFF && byte !== 0xA0) {
    // Strip unrecognized high-bit characters to avoid display issues
    return 0x20; // Convert to space for safety
  }

  return byte;
}

/**
 * Convert array of Amiga/Latin-1 bytes to ASCII string.
 *
 * @param bytes - Array of Amiga/Latin-1 bytes
 * @returns ASCII string with converted characters
 */
export function amigaBytesToAsciiString(bytes: number[]): string {
  return bytes.map(b => String.fromCharCode(amigaCharToAscii(b))).join('');
}

/**
 * Convert array of Amiga/Latin-1 bytes to ASCII bytes.
 *
 * @param bytes - Array of Amiga/Latin-1 bytes
 * @returns Array of ASCII bytes with converted characters
 */
export function convertAmigaBytesToAscii(bytes: number[]): number[] {
  return bytes.map(amigaCharToAscii);
}
