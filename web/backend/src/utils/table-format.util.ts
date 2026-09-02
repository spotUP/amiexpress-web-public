/**
 * 40-column table conventions (C64/40-col plan, Task 5).
 *
 * Single source of truth for the NARROW layouts ONLY. Every 80-column
 * format stays as the literal string in its own handler: those bytes are
 * express.e parity, they are pinned by tests, and rebuilding them through
 * a shared formatter would risk changing them. The narrow layer is new, so
 * it is shared from day one.
 *
 * WHY A ROW MAY USE ALL FORTY COLUMNS, BUT A PROMPT MAY NOT.
 *
 * The PETSCII transducer LATCHES the wrap instead of taking it: the 40th
 * glyph on a row sets `pendingWrap` rather than moving the cursor
 * (sdk/petscii/ansi-to-petscii.ts:108), and `newline()` CONSUMES that latch
 * without emitting a `$0D` of its own (:259-263, :289-301) - on both PETSCII
 * paths. So an exactly-40-column row followed by CRLF costs no blank line,
 * and a table that stops at 39 is throwing a column away on every row.
 *
 * A trailing PROMPT is the exception, because no CRLF follows it: the
 * cursor has to rest in a real column on the row the caller types into. A
 * 40-column prompt leaves it latched at the right edge, so prompts - and
 * only prompts - are built to NARROW_PROMPT_WIDTH.
 *
 * These layouts are laid out AT the session width on purpose. The emitText
 * choke (wrap-for-session.util.ts) word-wraps PROSE for a PETSCII caller;
 * a table row that reaches it long enough to be wrapped is the bug this
 * task removes, not a safety net it may lean on.
 */
import { sessionColumns } from './door-min-columns.util';
import { wrapLineToWidth } from './wrap-for-session.util';

/** Columns a C64 screen has, and the width of a full CRLF-terminated row. */
export const NARROW_WIDTH = 40;

/**
 * Width of a trailing prompt - a line with no CRLF, that the cursor rests
 * on while the caller types. One column short of the row width.
 */
export const NARROW_PROMPT_WIDTH = NARROW_WIDTH - 1;

/**
 * @deprecated Row width; use NARROW_WIDTH. Kept only until
 * door.handler.ts's import moves (that file is serialized behind another
 * session's edit).
 */
export const NARROW_LINE_WIDTH = NARROW_WIDTH;

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
 *   FILENAME.LHA                          88K
 *    description, wrapped to the screen
 *
 * The size is flush right at column 40 whatever its width, and the name is
 * clipped to the room that leaves - never overflowed.
 */
export function narrowFileLines(row: NarrowFileRow): string[] {
  const size = `${String(row.sizeKB).trim()}K`;
  const room = Math.max(1, NARROW_WIDTH - size.length - 1);
  const name = row.filename.substring(0, room).padEnd(room);
  const lines = [`${name} ${size}`];
  const description = (row.description || '').trim();
  if (description) {
    for (const line of wrapLineToWidth(description, NARROW_WIDTH - 1)) {
      lines.push(` ${line}`);
    }
  }
  return lines;
}

/**
 * The stacked narrow shape both message tables use: number and type on one
 * row, then sender, then subject. Shared here rather than in either
 * handler so message-scan.handler.ts and messaging.handler.ts - whose
 * EIGHTY-column rows are different shapes - cannot drift apart at 40.
 */
export function narrowMailRow(m: {
  msgNum: number | string;
  isPrivate: boolean;
  from?: string;
  subject?: string;
}): string[] {
  const status = m.isPrivate ? 'Private' : 'Public ';
  return [
    `${String(m.msgNum).padStart(6, '0')} ${status}`,
    narrowClip(`  ${m.from || ''}`),
    narrowClip(`  ${m.subject || ''}`),
  ];
}

/** `Label  : value`, clipped to the narrow row width. */
export function narrowField(label: string, value: string): string {
  return `${label.padEnd(7)}: ${value}`.substring(0, NARROW_WIDTH);
}

/** A full-width horizontal rule (a row, so all forty columns). */
export function narrowRule(char: string = '-'): string {
  return char.repeat(NARROW_WIDTH);
}

/** Clip to `columns` (default: a whole row). ASCII/PETSCII only - no escapes. */
export function narrowClip(text: string, columns: number = NARROW_WIDTH): string {
  return text.length > columns ? text.substring(0, columns) : text;
}
