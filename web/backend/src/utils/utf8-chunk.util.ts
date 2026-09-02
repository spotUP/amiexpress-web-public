/**
 * Where a chunk of UTF-8 may end without cutting a character in half.
 *
 * The paced writers - modem emulation and the slow-scroll effect - budget in
 * BYTES, because that is what a baud rate is. They then sliced the buffer at
 * exactly that many bytes and decoded each slice on its own. A block character
 * is three bytes in UTF-8, so every `░` that straddled a 256-byte boundary
 * arrived as two halves and rendered as two replacement characters.
 *
 * The same code took care never to split an ESCAPE sequence and then split the
 * art instead. Reported 2026-09-02: the screen the sysop had just replaced
 * "renders correct in the admin ui now, but incorrect in the bbs" - the admin
 * hands the browser one string, the board hands it 256 bytes at a time.
 *
 * A continuation byte is 10xxxxxx. Back up to the start of the sequence; if a
 * single character is wider than the whole budget, take it whole rather than
 * stall for ever.
 */
export function utf8ChunkEnd(buffer: Buffer, offset: number, wanted: number): number {
  let end = Math.min(offset + wanted, buffer.length);
  if (end >= buffer.length) return buffer.length;

  while (end > offset && (buffer[end] & 0xc0) === 0x80) end--;

  if (end === offset) {
    end = offset + 1;
    while (end < buffer.length && (buffer[end] & 0xc0) === 0x80) end++;
  }

  return end;
}
