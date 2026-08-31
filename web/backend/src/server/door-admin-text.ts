/**
 * The pipe-delimited text the door-admin API answers in, and the field
 * hygiene every route depends on.
 *
 * The client is a C89 door. It parses by splitting a line on '|', so a value
 * that itself contains '|' does not corrupt one field - it shifts every field
 * after it, silently, into the wrong column. A door's NAME tooltype is
 * sysop-editable free text and on this board some of them are ASCII art, so
 * this is not hypothetical.
 *
 * One renderer, used by all four routes, so no route can forget the escaping.
 * The shape follows the family the door already parses (see
 * examples/doorrepo-c/flow.c:1247 and :1357, which skip a "FILES|<count>|..."
 * header before reading rows): a header naming the shape and a count, then
 * rows, CRLF throughout.
 *
 * Header words are deliberately distinct from the door server's existing
 * FILES| - a different row shape behind a header flow.c already has a parser
 * for would be read by that parser.
 */

/** Longest each field may be, per `thoughts/shared/plans/2026-08-31-doorrepo-phase-b.md`. */
export const FIELD_CAPS = {
  command: 12,
  type: 8,
  archive: 64,
  name: 64,
  category: 32,
  description: 160,
  key: 64,
  value: 256,
  path: 255,
  step: 200,
} as const;

/**
 * Make one value safe to sit between two pipes: no separator, no line break,
 * no longer than `cap`.
 *
 * Replacement is a space rather than a deletion so a name reading
 * "DOOR|MANAGER" stays two words instead of becoming one.
 */
export function sanitizeField(value: unknown, cap: number): string {
  if (value === null || value === undefined) return '';
  const flattened = String(value).replace(/[|\r\n\t]/g, ' ');
  return flattened.length > cap ? flattened.slice(0, cap) : flattened;
}

/**
 * Render a header line and its rows.
 *
 * The count in the header is the number of rows actually emitted, never the
 * number the server could have emitted - a client that reads the header knows
 * exactly how many lines follow, including when a cap truncated the set.
 */
export function renderRows(headerWord: string, rows: string[][], extraHeaderFields: string[] = []): string {
  const header = [headerWord, String(rows.length), ...extraHeaderFields].join('|');
  const lines = [header, ...rows.map((r) => r.join('|'))];
  return lines.join('\r\n') + '\r\n';
}
