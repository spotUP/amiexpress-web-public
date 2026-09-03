/**
 * 40-column table conventions (C64/40-col plan, Task 5).
 *
 * Single source of truth for the NARROW layouts. Every 80-column TABLE
 * format stays as the literal string in its own handler: those bytes are
 * express.e parity, they are pinned by tests, and rebuilding them through
 * a shared formatter would risk changing them. The narrow layer is new, so
 * it is shared from day one.
 *
 * The one exception is THE MESSAGE-HEADER CHROME at the bottom of this file
 * (`messageRule` / `messageIndent`), which carries both widths. A rule is
 * one string whose length IS the layout, so its narrow form can only be
 * built by rebuilding the wide one - see the comment there for why, and
 * `tests/handlers/message/message-header-width.test.ts` for the byte pin
 * that replaces "it is a literal, so it cannot have moved".
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
import { printableLength, wrapLineToWidth } from './wrap-for-session.util';

/** Columns a C64 screen has, and the width of a full CRLF-terminated row. */
export const NARROW_WIDTH = 40;

/**
 * Width of a trailing prompt - a line with no CRLF, that the cursor rests
 * on while the caller types. One column short of the row width.
 */
export const NARROW_PROMPT_WIDTH = NARROW_WIDTH - 1;

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

/**
 * THE MESSAGE-HEADER CHROME - express.e's `(------)` rules and the fixed
 * indents of the prompts that sit under them, at the session's width.
 *
 * This is the one exception to the "narrow only" rule above, and it is
 * deliberate. These rules and indents are DRAWN GEOMETRY, not table rows:
 * a rule is one string whose length IS the layout, so the narrow form can
 * only be built by rebuilding the wide one at another width. Leaving the
 * wide literal at the call site and adding a narrow branch beside it would
 * put five copies of "how wide is a message rule" in four files - which is
 * exactly what this replaces. The 80-column bytes are therefore pinned by
 * `tests/handlers/message/message-header-width.test.ts`, which drives the
 * real `E` entry point, rather than by inspection of a literal.
 *
 * The bug (sysop, live, 2026-09-03): a PETSCII caller pressing `E` got
 * express.e's 55-column msgToHeader rule word-wrapped by the prose choke
 * into `                       (` + `------------------------------)` - the
 * rule broken across two rows with the `To:` prompt under its tail. The
 * body ruler (80 columns) and the Edit Line rule (80) folded the same way.
 *
 * At 80 columns (and at any width >= 80 - `isNarrow` is the PETSCII switch
 * and nothing else) every shape below reproduces the express.e literal byte
 * for byte. Below 80 the same shape is rebuilt from `sessionColumns()`: a
 * one-column indent and an inner run that fills the row exactly, so the rule
 * is ONE row of forty and the prompt under it keeps its answer space.
 */

/** Indent a narrow (PETSCII) row gives the message-header chrome. */
export const NARROW_INDENT = 1;

/** '-' * n - the fill of every plain rule express.e draws. */
const dashFill = (columns: number): string => '-'.repeat(columns);

/**
 * express.e:10150-10152 - `StrCopy(str,'|-------...'); SetStr(str,75)`: the
 * eight-character group repeated and cut to length (75 -> nine full groups
 * plus `|--`).
 */
const rulerFill = (columns: number): string =>
  '|-------'.repeat(Math.ceil(columns / 8)).substring(0, columns);

/** No SGR - the plain rules express.e writes with a bare aePuts. */
const UNPAINTED = { open: '', inner: '', close: '', reset: '' };

export type MessageRuleKind =
  /** express.e:9999 msgToHeader() - the header box above the To: prompt. */
  | 'headerBox'
  /** express.e:10486 - the rule above the Edit Line pre-fill. */
  | 'editLine'
  /** express.e:10150-10152 - the column ruler above the body editor. */
  | 'bodyRuler';

interface MessageRuleShape {
  /** Blank columns before the `(` at 80. */
  wideIndent: number;
  /** Characters between the parentheses at 80. */
  wideInner: number;
  fill: (columns: number) => string;
  paint: { open: string; inner: string; close: string; reset: string };
}

/** The shared case table: one row per rule express.e draws, and no other. */
const MESSAGE_RULES: Record<MessageRuleKind, MessageRuleShape> = {
  headerBox: {
    wideIndent: 23,
    wideInner: 30,
    fill: dashFill,
    paint: { open: '\x1b[32m', inner: '\x1b[33m', close: '\x1b[32m', reset: '\x1b[0m' },
  },
  editLine: { wideIndent: 3, wideInner: 75, fill: dashFill, paint: UNPAINTED },
  bodyRuler: { wideIndent: 3, wideInner: 75, fill: rulerFill, paint: UNPAINTED },
};

/**
 * One rule, sized for this caller. No `\r\n` - the call site owns those,
 * because express.e's own line breaks around each rule differ.
 */
export function messageRule(
  session: { screenWidth?: number; petsciiMode?: boolean } | null | undefined,
  kind: MessageRuleKind
): string {
  const shape = MESSAGE_RULES[kind];
  const narrow = isNarrow(session);
  const indent = narrow ? NARROW_INDENT : shape.wideIndent;
  // A rule is a CRLF-terminated ROW, so it may use all forty columns (see
  // the width ruling at the top of this file); the two parentheses and the
  // indent are what the inner run has to give back.
  const inner = narrow
    ? Math.max(1, sessionColumns(session ?? {}) - indent - 2)
    : shape.wideInner;
  const paint = shape.paint;
  return `${' '.repeat(indent)}${paint.open}(${paint.inner}${shape.fill(inner)}${paint.close})${paint.reset}`;
}

export type MessageIndentKind =
  /** express.e:10000, :9882, :11623 - `     To: (Enter)='ALL'? `. */
  | 'to'
  /** express.e:10861, :11637 - `         Private (y/N)? `. */
  | 'private'
  /** express.e:10486 - the pre-filled content under the Edit Line rule. */
  | 'editLine';

/**
 * The narrow indents are ONE column (two for the Edit Line content, so it
 * still starts under the first character INSIDE the rule's parenthesis, as
 * it does at 80). Everything wider is express.e's own byte.
 */
const MESSAGE_INDENTS: Record<MessageIndentKind, { wide: number; narrow: number }> = {
  to: { wide: 5, narrow: NARROW_INDENT },
  private: { wide: 9, narrow: NARROW_INDENT },
  editLine: { wide: 4, narrow: NARROW_INDENT + 1 },
};

/** The blank indent express.e puts before one message-header prompt. */
export function messageIndent(
  session: { screenWidth?: number; petsciiMode?: boolean } | null | undefined,
  kind: MessageIndentKind
): string {
  const spec = MESSAGE_INDENTS[kind];
  return ' '.repeat(isNarrow(session) ? spec.narrow : spec.wide);
}

/**
 * CENTRED HEADINGS - the second half of the message-header chrome problem.
 *
 * express.e centres a heading by writing a fixed run of leading spaces in
 * front of it (`aePuts('                                 Conference List')`).
 * At 40 columns that run is most of the screen: the Conference List heading
 * went out as a 48-column row and the Messagebase List as 49, both of them
 * PAST THE RIGHT EDGE and unrecoverable - worse than the folded rule above,
 * because the prose choke could not even see them. The two handlers emitted
 * the indent and the heading as SEPARATE `emitText` calls, so the choke was
 * offered 33 spaces (fits) and then `Conference List` (fits) and never the
 * 48-column row they concatenate into. Those sites now build one string and
 * write it once, which is the same bytes on the wire and the only shape the
 * choke can protect (the same fix messaging.handler.ts:1035 already carries).
 *
 * At >= 80 columns this returns express.e's own leading run, byte for byte.
 * Below 80 the heading is centred on `sessionColumns(session)` - and a
 * heading WIDER than the screen gets no indent at all rather than a negative
 * one, so it starts at column 1 and the choke wraps it as prose.
 */
export type CentredHeadingKind =
  /** express.e:27030-27034 - the M command's conference list. */
  | 'conferenceList'
  /** express.e:27064-27071 - the M command's message base list. */
  | 'messagebaseList'
  /** express.e:11395-11397 - chooseTranslator()'s language list. */
  | 'languageList'
  /** express.e:25730-25732 - the W command's user configuration menu. */
  | 'userConfiguration';

/** express.e's own 80-column leading run for each heading. */
const CENTRED_HEADING_WIDE_INDENT: Record<CentredHeadingKind, number> = {
  conferenceList: 33,
  messagebaseList: 33,
  languageList: 25,
  userConfiguration: 23,
};

/**
 * The blank run that puts `heading` where this caller's screen wants it.
 *
 * `heading` may carry SGR - only printable columns are counted - and is
 * needed at every width below 80, which is why it is a parameter and not
 * another number in the table.
 */
export function headingIndent(
  session: { screenWidth?: number; petsciiMode?: boolean } | null | undefined,
  kind: CentredHeadingKind,
  heading: string
): string {
  if (!isNarrow(session)) return ' '.repeat(CENTRED_HEADING_WIDE_INDENT[kind]);
  const room = sessionColumns(session ?? {}) - printableLength(heading);
  return ' '.repeat(Math.max(0, Math.floor(room / 2)));
}
