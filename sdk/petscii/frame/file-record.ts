/**
 * A file record, laid out by a template the sysop can edit.
 *
 * ONE INTERPRETER, TWO SURFACES. The LIST row (one row per file, twenty-plus
 * to a screen) and the SINGLE-record block (a search hit, an upload
 * announcement, `FI <n>`) are the same function over different templates, so
 * there is no second formatter to keep in step.
 *
 * PURE, AND THE LAYOUT IS AN ARGUMENT. Nothing here reads a file or a
 * database. That is what lets the board's own listing and the 68K door adapter
 * be handed the SAME compiled layout and be proved to emit the same bytes -
 * the requirement the whole C64 file view is built around.
 *
 * WHAT IT RESOLVES, and what it deliberately leaves alone:
 *
 *   ~<width>F_<FIELD>|   the record's fields, clipped to the declared width
 *   ~t<nn>|              a column tab, padding forward with spaces
 *   everything else      passed through untouched, for the caller's own MCI
 *                        pass - a `~c7|` is a pen and belongs to that stage
 *
 * Any `~...|` token counts as ZERO COLUMNS when a tab measures the row,
 * because every one of them renders to a control byte or to nothing. Counting
 * them as glyphs would put every column after a colour change out of place.
 */

/** The fields a template can name. `~F_NUM|` reads `num`, and so on. */
export interface FileRecordFields {
  /** Ordinal within this listing pass, 1-based. The argument to `FI <n>`. */
  num?: number | null;
  /** Filename, as written in the DIR entry. Never wrapped. */
  name?: string | null;
  /** Size in BYTES. Formatted by `formatNarrowSize`, never pre-formatted. */
  sizeBytes?: number | null;
  /** Status marker P/F/N/D. */
  flag?: string | null;
  /** True when this file is new to THIS caller - never stored, always computed. */
  isNew?: boolean;
  /** The date string the source carried. Never reformatted. */
  date?: string | null;
  /** `v2.1`; empty when unknown. */
  version?: string | null;
  /** The description. The only field that ever wraps, and only in a block. */
  desc?: string | null;
  /** Release group, uppercased; empty when unknown. */
  group?: string | null;
  /** Author handle; empty when unknown. */
  author?: string | null;
}

/** The board's own unit, and the one `narrowFileLines()` already used. */
export function formatNarrowSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '';
  return `${Math.ceil(bytes / 1024)}K`;
}

/** C*Base's column: 254-byte disk blocks, bare, no unit. */
export function formatBlocks(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '';
  return String(Math.ceil(bytes / 254));
}

/**
 * Collapse runs of two or more spaces to one, keeping the indent.
 *
 * The description of a record is prose a door has padded to fill an 80-column
 * row, and those runs cost a 40-column reader whole rows once it wraps.
 */
export function squeezeProse(text: string): string {
  const indent = text.match(/^ */)?.[0] ?? '';
  return indent + text.slice(indent.length).replace(/ {2,}/g, ' ').replace(/ +$/, '');
}

/** Any MCI token - zero columns wide, because it renders to a control byte. */
const MCI_TOKEN_RE = /~[^|]*\|/g;

/** The printable columns a partially-rendered row occupies. */
function columnsOf(text: string): number {
  return text.replace(MCI_TOKEN_RE, '').length;
}

function valueOf(fields: FileRecordFields, field: string): string {
  switch (field.toUpperCase()) {
    case 'NUM': return fields.num === null || fields.num === undefined ? '' : String(fields.num);
    case 'NAME': return (fields.name ?? '').trim();
    case 'SIZE': return formatNarrowSize(fields.sizeBytes);
    case 'BLOCKS': return formatBlocks(fields.sizeBytes);
    case 'FLAG': return (fields.flag ?? '').trim();
    // A space, not empty: the flag column holds its place so the filename
    // beside it does not shift for a caller who has seen the file before.
    case 'NEW': return fields.isNew ? '*' : ' ';
    case 'DATE': return (fields.date ?? '').trim();
    case 'VERSION': return versionOf(fields.version);
    case 'DESC': return (fields.desc ?? '').trim();
    case 'GROUP': return (fields.group ?? '').trim().toUpperCase();
    case 'AUTHOR': return (fields.author ?? '').trim();
    default: return '';
  }
}

/** `v2.1`, and never `vv2.1` for a version that already carries its own v. */
function versionOf(version: string | null | undefined): string {
  const text = (version ?? '').trim();
  if (!text) return '';
  return /^v/i.test(text) ? text : `v${text}`;
}

interface RenderOptions {
  /** Screen width. A row never exceeds it. */
  columns: number;
  /** `~F_DESC|` wraps onto continuation rows here; in a LIST row it clips. */
  wrapDesc?: boolean;
  /** How many rows a wrapped description may take. */
  maxDescRows?: number;
}

/**
 * Render one template line.
 *
 * @returns the rendered line, or null when the whole-line DROP rule applies -
 *   every `~F_*` on the line resolved to empty AND the line carries no other
 *   printable character. That rule is what makes "omit the GROUP row when the
 *   group is unknown" fall out of the data instead of out of a branch.
 */
export function renderTemplateLine(
  line: string,
  fields: FileRecordFields,
  opts: RenderOptions,
): string | null {
  let out = '';
  let sawField = false;
  let everyFieldEmpty = true;
  let literal = '';

  const pattern = /~(\d*)(?:(t)(\d{2})|F_([A-Za-z0-9_]+))\|/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    const between = line.slice(last, match.index);
    out += between;
    literal += between;
    last = match.index + match[0].length;

    if (match[2] === 't') {
      const target = parseInt(match[3], 10);
      const column = columnsOf(out);
      if (target < opts.columns && column < target) out += ' '.repeat(target - column);
      continue;
    }

    sawField = true;
    const width = match[1] ? parseInt(match[1], 10) : 0;
    let value = valueOf(fields, match[4]);
    if (value.trim() !== '') everyFieldEmpty = false;
    if (width > 0) value = value.slice(0, width);
    out += value;
  }

  const tail = line.slice(last);
  out += tail;
  literal += tail;

  // The DROP rule: fields, all empty, and nothing else printable on the line.
  if (sawField && everyFieldEmpty && literal.replace(MCI_TOKEN_RE, '').trim() === '') {
    return null;
  }

  return clipToColumns(out, opts.columns);
}

/** Clip a rendered line to the screen, counting MCI tokens as zero-width. */
function clipToColumns(line: string, columns: number): string {
  if (columnsOf(line) <= columns) return line;
  let out = '';
  let used = 0;
  const parts = line.split(/(~[^|]*\|)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^~[^|]*\|$/.test(part)) { out += part; continue; }
    const room = columns - used;
    if (room <= 0) continue;
    out += part.slice(0, room);
    used += Math.min(part.length, room);
  }
  return out;
}

/**
 * The LIST row - exactly one output row, by definition.
 *
 * Every field clips, `~F_DESC|` included: a list row is one row, which is what
 * the pagination and the adapter's rung both rely on. A sysop who puts the
 * description in `[ROW]` gets a clipped column, not a second row.
 */
export function renderFileRow(
  fields: FileRecordFields,
  template: readonly string[],
  columns = 40,
): string {
  const line = template[0] ?? '';
  return renderTemplateLine(line, fields, { columns }) ?? '';
}

/**
 * The SINGLE-record block.
 *
 * Empty lines drop out, and the description wraps - at most `maxDescRows`
 * rows, because a description is not allowed to push the facts off the screen.
 */
export function renderFileBlock(
  fields: FileRecordFields,
  template: readonly string[],
  columns = 40,
  maxDescRows = 2,
): string[] {
  const rows: string[] = [];

  for (const line of template) {
    if (/~\d*F_DESC\|/.test(line) && (fields.desc ?? '').trim() !== '') {
      rows.push(...wrapDescLine(line, fields, columns, maxDescRows));
      continue;
    }
    const rendered = renderTemplateLine(line, fields, { columns });
    if (rendered !== null) rows.push(rendered);
  }

  return rows;
}

/**
 * A description line, wrapped onto continuation rows that repeat the column it
 * started at - so the block stays a block rather than becoming a paragraph
 * hanging off the left margin.
 */
function wrapDescLine(
  line: string,
  fields: FileRecordFields,
  columns: number,
  maxRows: number,
): string[] {
  const prefix = line.slice(0, line.search(/~\d*F_DESC\|/));
  const rendered = renderTemplateLine(prefix, fields, { columns }) ?? prefix;
  const startColumn = columnsOf(rendered);
  const room = Math.max(1, columns - startColumn);

  const words = squeezeProse((fields.desc ?? '').trim()).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') { current = word.slice(0, room); continue; }
    if (current.length + 1 + word.length <= room) { current += ' ' + word; continue; }
    lines.push(current);
    if (lines.length >= maxRows) break;
    current = word.slice(0, room);
  }
  if (current && lines.length < maxRows) lines.push(current);

  return lines.slice(0, maxRows).map((text, i) =>
    i === 0 ? rendered + text : ' '.repeat(startColumn) + text);
}
