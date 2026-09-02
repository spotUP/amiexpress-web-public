/**
 * 40-column table conventions (C64/40-col plan, Task 5).
 *
 * Single source of truth for the NARROW layouts ONLY. Every 80-column
 * format stays as the literal string in its own handler: those bytes are
 * express.e parity, they are pinned by tests, and rebuilding them through
 * a shared formatter would risk changing them. The narrow layer is new, so
 * it is shared from day one.
 *
 * WHY 39 AND NOT 40. A table row must NOT be laid out to the full 40
 * columns. A C64 that has received 40 printable characters has already
 * moved to the next row; the CRLF that follows then costs a second row and
 * the whole table double-spaces. 39 is the widest line that does not, so
 * NARROW_LINE_WIDTH - not NARROW_WIDTH - is what every full-width line is
 * built to (the plan's own `narrowRule()` = 39 dashes says the same).
 *
 * These layouts are laid out AT the session width on purpose. The emitText
 * choke (wrap-for-session.util.ts) word-wraps PROSE for a PETSCII caller;
 * a table row that reaches it long enough to be wrapped is the bug this
 * task removes, not a safety net it may lean on.
 */
import { sessionColumns } from './door-min-columns.util';
import { wrapLineToWidth } from './wrap-for-session.util';

/** Columns a C64 screen has. */
export const NARROW_WIDTH = 40;

/** Widest line that does not cost a second screen row once CRLF arrives. */
export const NARROW_LINE_WIDTH = NARROW_WIDTH - 1;

/**
 * Does this caller get the narrow layouts?
 *
 * `sessionColumns()` can only answer below 80 when `petsciiMode === true`
 * (every other session is floored at 80), so this is the C64 switch and
 * nothing else: a phone reporting 40 columns over NAWS keeps the express.e
 * bytes.
 */
export function isNarrow(session: { screenWidth?: number; petsciiMode?: boolean } | null | undefined): boolean {
  return sessionColumns(session ?? {}) < 80;
}

export interface NarrowFileRow {
  filename: string;
  sizeKB: number | string;
  description?: string;
}

/**
 * Classic C64 dir convention: the file on one line, its description
 * stacked underneath.
 *
 *   FILENAME.LHA                     88K
 *    description, wrapped to the screen
 *
 * The size is flush right at column 39 whatever its width, and the name is
 * clipped to the room that leaves - never overflowed.
 */
export function narrowFileLines(row: NarrowFileRow): string[] {
  const size = `${String(row.sizeKB).trim()}K`;
  const room = Math.max(1, NARROW_LINE_WIDTH - size.length - 1);
  const name = row.filename.substring(0, room).padEnd(room);
  const lines = [`${name} ${size}`];
  const description = (row.description || '').trim();
  if (description) {
    for (const line of wrapLineToWidth(description, NARROW_LINE_WIDTH - 1)) {
      lines.push(` ${line}`);
    }
  }
  return lines;
}

/** `Label  : value`, clipped to the narrow line width. */
export function narrowField(label: string, value: string): string {
  return `${label.padEnd(7)}: ${value}`.substring(0, NARROW_LINE_WIDTH);
}

/** A full-width horizontal rule. */
export function narrowRule(char: string = '-'): string {
  return char.repeat(NARROW_LINE_WIDTH);
}

/** Clip to `columns` (default: the whole narrow line). ASCII/PETSCII only - no escapes. */
export function narrowClip(text: string, columns: number = NARROW_LINE_WIDTH): string {
  return text.length > columns ? text.substring(0, columns) : text;
}
