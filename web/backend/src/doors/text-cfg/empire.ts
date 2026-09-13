/**
 * The Empire sectioned config format (Bulls.CFG, joincnf.cfg, ...).
 *
 * Empire doors do not read `Key=value` files. Their configs are sections of
 * fixed-shape lines closed by `[Name_END]...` delimiter lines:
 *
 *   DUAL_LISTING       YES                 ; Use 2 Listings [YES/NO]
 *   [Init_END] ====================================================================
 *   Top Uploaders                                      ; bull1.txt
 *   [BullNames_END]===============================================================
 *   XXXXXX--------------                               ; Conference 1
 *   [CnfAccess_END]===============================================================
 *   <ANSI art lines, untouched>
 *   [Title_END]===================================================================
 *
 * (joincnf.cfg adds `[CNF_END]` with `CNF_PASS.21=PASSWORD` lines plus opaque
 * `[TITLE_END]` / `[LINES_END]` / `[CURCNF_END]` art blocks - same splitter,
 * different section kinds.)
 *
 * The one rule of this module: UNMAPPED BYTES SURVIVE. Comments, padding,
 * delimiter tails, section order and case (`[Title_END]` vs `[TITLE_END]`),
 * unknown sections and numbering quirks (a file that jumps Conference 8 to
 * Conference 10) are preserved byte-for-byte. A setting the admin writes
 * replaces its own value field in place; everything else is echoed.
 *
 * Bytes, not strings: art lines carry ESC and high bytes, so the file is
 * carried as latin1 and unmapped lines are never re-encoded.
 */

export type EmpireEol = '\n' | '\r\n';

/** Init-style `KEY value ; comment` line, segments kept for reassembly. */
export interface EmpireKvLine {
  kind: 'kv';
  key: string;
  keyGap: string;
  valueRaw: string;
  comment: string;
}

/** `Title ; file [rest]` bulletin line. */
export interface EmpireBullLine {
  kind: 'bull';
  titleRaw: string;
  fileGap: string;
  file: string;
  rest: string;
}

/** `MASK ; Conference N` access line. The comment is the row's identity. */
export interface EmpireMaskLine {
  kind: 'mask';
  maskRaw: string;
  comment: string;
}

export type EmpireBodyLine =
  | EmpireKvLine
  | EmpireBullLine
  | EmpireMaskLine
  | { kind: 'raw'; text: string };

export interface EmpireSection {
  /** Normalized marker: `init_end`, `bullnames_end`, ... (`title_end`). */
  name: string;
  /** The delimiter line verbatim, including its `===` tail. */
  terminator: string;
  body: EmpireBodyLine[];
}

export interface EmpireFile {
  eol: EmpireEol;
  /** Sections in file order. A marker closes the lines above it and names
   *  its own section (`[Init_END]` closes init), so files the sysop extends
   *  with new sections parse without this module knowing them. */
  sections: EmpireSection[];
  trailingNewline: boolean;
}

const MARKER_RE = /^\[([A-Za-z0-9_]+_END)\](.*)$/;
// `KEY   value ; comment` (Empire init) and `KEY=value` (joincnf CNF_PASS).
// The separator is kept verbatim so each style survives its own edits.
const KV_RE = /^([A-Za-z0-9_.]+)(\s+|=)(.*)$/;

/** Split raw bytes into lines without losing the ending style. */
export function splitEmpireLines(raw: Buffer | string): { lines: string[]; eol: EmpireEol; trailingNewline: boolean } {
  const text = typeof raw === 'string' ? raw : raw.toString('latin1');
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  const eol: EmpireEol = crlf >= lf && crlf > 0 ? '\r\n' : '\n';
  const trailingNewline = text.endsWith('\r\n') || text.endsWith('\n');
  const lines = text.split(/\r\n|\n/);
  if (trailingNewline) lines.pop();
  return { lines, eol, trailingNewline };
}

function parseKvLine(text: string): EmpireKvLine | null {
  const m = KV_RE.exec(text);
  if (!m) return null;
  const rest = m[3];
  const semi = rest.indexOf(';');
  if (semi === -1) {
    return { kind: 'kv', key: m[1], keyGap: m[2], valueRaw: rest, comment: '' };
  }
  return {
    kind: 'kv',
    key: m[1],
    keyGap: m[2],
    valueRaw: rest.slice(0, semi),
    comment: rest.slice(semi),
  };
}

function parseBullLine(text: string): EmpireBullLine | null {
  const semi = text.indexOf(';');
  if (semi === -1) return null;
  const after = text.slice(semi + 1);
  const fileMatch = /^(\s*)(\S+)([\s\S]*)$/.exec(after);
  if (!fileMatch) return null;
  return {
    kind: 'bull',
    titleRaw: text.slice(0, semi),
    fileGap: fileMatch[1],
    file: fileMatch[2],
    rest: fileMatch[3],
  };
}

function parseMaskLine(text: string): EmpireMaskLine | null {
  const semi = text.indexOf(';');
  if (semi === -1) return null;
  return { kind: 'mask', maskRaw: text.slice(0, semi), comment: text.slice(semi) };
}

type SectionKind = 'kv' | 'bull' | 'mask' | 'opaque';

function sectionKind(name: string): SectionKind {
  switch (name) {
    case 'init_end':
    case 'cnf_end':
      return 'kv';
    case 'bullnames_end':
      return 'bull';
    case 'cnfaccess_end':
      return 'mask';
    default:
      return 'opaque';
  }
}

function parseBodyLine(kind: SectionKind, text: string): EmpireBodyLine {
  if (text.trim() === '') return { kind: 'raw', text };
  switch (kind) {
    case 'kv': {
      const kv = parseKvLine(text);
      return kv ?? { kind: 'raw', text };
    }
    case 'bull': {
      const bull = parseBullLine(text);
      return bull ?? { kind: 'raw', text };
    }
    case 'mask': {
      const mask = parseMaskLine(text);
      return mask ?? { kind: 'raw', text };
    }
    default:
      return { kind: 'raw', text };
  }
}

export function parseEmpireFile(raw: Buffer | string): EmpireFile {
  const { lines, eol, trailingNewline } = splitEmpireLines(raw);
  const sections: EmpireSection[] = [];
  // Lines accumulate until the marker that closes them: `[Init_END]` closes
  // the init section, `[BullNames_END]` the bull rows, and so on. The marker
  // names its own section, so a file the sysop extends with a new section
  // parses without this module knowing it.
  let pending: string[] = [];
  for (const line of lines) {
    const m = MARKER_RE.exec(line);
    if (!m) {
      pending.push(line);
      continue;
    }
    const name = m[1].toLowerCase();
    const kind = sectionKind(name);
    sections.push({
      name,
      terminator: line,
      body: pending.map((t) => parseBodyLine(kind, t)),
    });
    pending = [];
  }
  if (pending.length > 0) {
    // Trailing lines past the last marker. Not valid Empire, but dropping
    // them would be data loss — kept as an unterminated tail section.
    sections.push({
      name: 'tail',
      terminator: '',
      body: pending.map((t) => parseBodyLine('opaque', t)),
    });
  }
  return { eol, sections, trailingNewline };
}

function serializeBodyLine(line: EmpireBodyLine): string {
  switch (line.kind) {
    case 'kv':
      return `${line.key}${line.keyGap}${line.valueRaw}${line.comment}`;
    case 'bull':
      return `${line.titleRaw};${line.fileGap}${line.file}${line.rest}`;
    case 'mask':
      return `${line.maskRaw}${line.comment}`;
    case 'raw':
      return line.text;
  }
}

export function serializeEmpireFile(file: EmpireFile): string {
  const out: string[] = [];
  for (const section of file.sections) {
    for (const line of section.body) out.push(serializeBodyLine(line));
    if (section.terminator !== '') out.push(section.terminator);
  }
  let text = out.join(file.eol);
  if (file.trailingNewline) text += file.eol;
  return text;
}

/**
 * Find a section by marker name, case-insensitive, with or without the
 * `_end` suffix (`init`, `bullnames`, `masks` all resolve — manifests use
 * the short form, files carry the full marker).
 */
export function findSection(file: EmpireFile, name: string): EmpireSection | undefined {
  const want = name.toLowerCase();
  return (
    file.sections.find((s) => s.name === want) ??
    file.sections.find((s) => s.name === `${want}_end`)
  );
}

export function getKv(file: EmpireFile, section: string, key: string): string | undefined {
  const sec = findSection(file, section);
  if (!sec) return undefined;
  const want = key.toUpperCase();
  for (const line of sec.body) {
    if (line.kind === 'kv' && line.key.toUpperCase() === want) return line.valueRaw.trim();
  }
  return undefined;
}

/**
 * Replace a KV value in place, keeping column alignment: a shorter value is
 * padded to the field's old width, a longer one grows the line (never
 * truncated — truncation is data loss). Returns false when section/key absent.
 */
export function setKv(file: EmpireFile, section: string, key: string, value: string): boolean {
  const sec = findSection(file, section);
  if (!sec) return false;
  const want = key.toUpperCase();
  for (const line of sec.body) {
    if (line.kind === 'kv' && line.key.toUpperCase() === want) {
      line.valueRaw = value.padEnd(line.valueRaw.length);
      return true;
    }
  }
  return false;
}

export interface BullRow {
  title: string;
  file: string;
}

/**
 * Where bull rows and conference masks live when a manifest does not say.
 *
 * These were written into six accessors as literals, so a `cfgRow.section`
 * naming anything else was read and then ignored - the shipped manifests
 * happen to name these two, so it worked by coincidence. The declared section
 * is honoured now and these are only the fallback.
 */
export const BULL_SECTION = 'bullnames_end';
export const MASK_SECTION = 'cnfaccess_end';

/** Indexed bull rows in file order (blank lines excluded by the parser). */
export function getBullRows(file: EmpireFile, section: string = BULL_SECTION): BullRow[] {
  const sec = findSection(file, section);
  if (!sec) return [];
  const rows: BullRow[] = [];
  for (const line of sec.body) {
    if (line.kind === 'bull') rows.push({ title: line.titleRaw.trim(), file: line.file });
  }
  return rows;
}

export function setBullRow(
  file: EmpireFile,
  index: number,
  row: Partial<BullRow>,
  section: string = BULL_SECTION
): boolean {
  const sec = findSection(file, section);
  if (!sec) return false;
  const bulls = sec.body.filter((l): l is EmpireBullLine => l.kind === 'bull');
  const line = bulls[index];
  if (!line) return false;
  if (row.title !== undefined) line.titleRaw = row.title.padEnd(line.titleRaw.length);
  if (row.file !== undefined) line.file = row.file;
  return true;
}

/** Append a canonical bull row (for files shorter than the manifest). */
export function appendBullRow(file: EmpireFile, row: BullRow, section: string = BULL_SECTION): boolean {
  const sec = findSection(file, section);
  if (!sec) return false;
  const width = sec.body.reduce(
    (w, l) => (l.kind === 'bull' ? Math.max(w, l.titleRaw.length) : w),
    50
  );
  sec.body.push({
    kind: 'bull',
    titleRaw: row.title.padEnd(width),
    fileGap: ' ',
    file: row.file,
    rest: '',
  });
  return true;
}

/** Indexed mask strings in file order. */
export function getMaskRows(file: EmpireFile, section: string = MASK_SECTION): string[] {
  const sec = findSection(file, section);
  if (!sec) return [];
  const rows: string[] = [];
  for (const line of sec.body) {
    if (line.kind === 'mask') rows.push(line.maskRaw.trim());
  }
  return rows;
}

export function setMaskRow(file: EmpireFile, index: number, mask: string, section: string = MASK_SECTION): boolean {
  const sec = findSection(file, section);
  if (!sec) return false;
  const masks = sec.body.filter((l): l is EmpireMaskLine => l.kind === 'mask');
  const line = masks[index];
  if (!line) return false;
  line.maskRaw = mask.padEnd(line.maskRaw.length);
  return true;
}

export function appendMaskRow(file: EmpireFile, mask: string, comment: string, section: string = MASK_SECTION): boolean {
  const sec = findSection(file, section);
  if (!sec) return false;
  sec.body.push({ kind: 'mask', maskRaw: mask, comment });
  return true;
}

/** An opaque section body (Title art, LINES, CURCNF) as raw lines. */
export function getSectionBody(file: EmpireFile, section: string): string[] | undefined {
  const sec = findSection(file, section);
  return sec?.body.map(serializeBodyLine);
}

export function setSectionBody(file: EmpireFile, section: string, lines: string[]): boolean {
  const sec = findSection(file, section);
  if (!sec) return false;
  sec.body = lines.map((text) => ({ kind: 'raw', text }) as EmpireBodyLine);
  return true;
}
