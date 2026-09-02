/**
 * Pure session-width word wrap primitives (petscii-full-canvas plan, Task 10,
 * pulled forward from the C64/40-col plan's Task 4).
 *
 * Kept SDK-side (no Node imports) so the C64 Door Adapter (a later plan) can
 * reuse the exact same wrap without importing web/backend. The session-aware
 * `wrapForSession` (guards: 80+ columns, door-owned terminal, positioned/art
 * payloads) stays in web/backend/src/utils/wrap-for-session.util.ts, which
 * imports these two.
 */

const ANSI_TOKEN_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function printableLength(line: string): number {
  return line.replace(ANSI_TOKEN_RE, '').length;
}

/**
 * Word-wrap one logical line (no line breaks inside) to `width` printable
 * columns. ANSI escapes count as zero width and are never split; SGR state
 * carries across the produced lines the way a terminal carries it.
 */
export function wrapLineToWidth(line: string, width: number): string[] {
  if (printableLength(line) <= width) return [line];

  const tokens = line.split(/(\x1b\[[0-9;?]*[A-Za-z])/);
  const out: string[] = [];
  let current = '';
  let currentLen = 0;
  const flush = () => { out.push(current); current = ''; currentLen = 0; };

  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('\x1b')) { current += token; continue; }
    for (const piece of token.split(/(\s+)/)) {
      if (!piece) continue;
      if (currentLen + piece.length <= width) { current += piece; currentLen += piece.length; continue; }
      if (/^\s+$/.test(piece)) { flush(); continue; }
      if (piece.length > width) {
        let rest = piece;
        while (rest.length > 0) {
          const room = width - currentLen;
          if (room <= 0) { flush(); continue; }
          current += rest.slice(0, room);
          currentLen += Math.min(room, rest.length);
          rest = rest.slice(room);
          if (rest.length > 0) flush();
        }
        continue;
      }
      flush();
      current = piece;
      currentLen = piece.length;
    }
  }
  if (current.length > 0 || out.length === 0) out.push(current);
  return out;
}
