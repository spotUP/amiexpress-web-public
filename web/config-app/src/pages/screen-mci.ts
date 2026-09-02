/**
 * The MCI codes, as the admin shows and writes them.
 *
 * Pure functions: what a code list looks like, and what text a picked code
 * turns into. The page renders these; nothing here touches the DOM, so the
 * assembling rule that matters - the terminator - is tested rather than
 * eyeballed.
 *
 * The one rule to carry out of this file: a code's terminator is NOT always
 * `|`. Four of them want a period and three want a double pipe (measured
 * against the parser in `web/backend/tests/screens/mci-catalog.test.ts`), and
 * a code written with the wrong one prints its own letters at the caller.
 */

/**
 * The editor's canvas, as much of it as this module needs.
 *
 * Structurally typed rather than importing the SDK's `Cell`: these are pure
 * functions over rows of characters, and a test should not have to build an
 * `EditorState` to ask what a row says.
 */
export type MciCanvas = ReadonlyArray<ReadonlyArray<{ char?: string } | undefined>>;

export interface MciArgumentShape {
  kind: 'none' | 'command' | 'screen' | 'door' | 'menu' | 'text' | 'number' | 'char';
  label?: string;
}

/** One catalog entry as `/api/screens/mci/catalog` sends it. */
export interface MciCodeShape {
  code: string;
  summary: string;
  family: string;
  argument: MciArgumentShape;
  takesWidth: boolean;
  terminator: '|' | '||' | '.' | '';
  source: string;
  handledBy: 'dispatch' | 'caller';
  aliasOf?: string;
  /** How many times this board writes the code, and in how many files. */
  uses: number;
  files: number;
}

export interface MciFamilyShape {
  family: string;
  label: string;
}

export interface MciSection {
  family: string;
  label: string;
  codes: MciCodeShape[];
}

/**
 * The codes in the families' own order, skipping a family with nothing left.
 *
 * Order comes from the catalog rather than from the page, so "screens and
 * commands first" is one decision in one place.
 */
export function groupMciCodes(codes: MciCodeShape[], families: MciFamilyShape[]): MciSection[] {
  return families
    .map(({ family, label }) => ({ family, label, codes: codes.filter(c => c.family === family) }))
    .filter(section => section.codes.length > 0);
}

/**
 * Search the summary as well as the code.
 *
 * A designer wanting the caller's remaining time does not know it is `~TR`;
 * that is the entire reason the summaries exist. Matching only the code hides
 * the answer behind the question - the same rule `filterScreenRows` follows.
 */
export function filterMciCodes(codes: MciCodeShape[], query: string): MciCodeShape[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return codes;
  return codes.filter(code =>
    code.code.toLowerCase().includes(needle)
    || code.summary.toLowerCase().includes(needle));
}

/**
 * What this board does with a code, in the words a designer needs.
 *
 * "Never used on this board" is not a warning - most of the hundred are
 * unused, and saying so is what tells a designer there is something here they
 * have not tried.
 */
export function describeMciUsage(code: Pick<MciCodeShape, 'uses' | 'files'>): string {
  if (code.uses === 0) return 'Never used on this board';
  const files = code.files === 1 ? '1 file' : `${code.files} files`;
  return code.uses === code.files ? `Used in ${files}` : `Used ${code.uses} times, in ${files}`;
}

/**
 * The text a picked code turns into.
 *
 * Everything the syntax knows lives here: the width goes BETWEEN the tilde and
 * the code (`~20N|`, express.e:5279-5289), the argument follows the code, and
 * the terminator is the code's own.
 *
 * It refuses rather than guesses. A width on a code that has no value to
 * truncate, or an argument-taking code with nothing chosen, is a mistake the
 * picker should not be able to write into a screen file.
 */
export function buildMciToken(
  code: MciCodeShape,
  argument?: string,
  width?: number | null,
): string {
  if (code.code === '~') return '~~';

  const hasWidth = width !== undefined && width !== null && Number.isFinite(width);
  if (hasWidth && !code.takesWidth) {
    throw new Error(`~${code.code} has no value to truncate, so a width would do nothing`);
  }
  if (hasWidth && (width as number) < 1) {
    throw new Error('A width is a number of columns, so it starts at 1');
  }

  const trimmed = (argument ?? '').trim();
  if (code.argument.kind !== 'none' && !trimmed) {
    throw new Error(`~${code.code} needs ${code.argument.label?.toLowerCase() ?? 'something to point at'}`);
  }
  if (code.argument.kind === 'char' && trimmed.length !== 1) {
    throw new Error('A terminator is exactly one character');
  }

  return `~${hasWidth ? width : ''}${code.code}${code.argument.kind === 'none' ? '' : trimmed}${code.terminator}`;
}

/**
 * Whether MCI runs in this screen at all.
 *
 * The board parses codes ONLY when the first line starts with a tilde
 * (screen.handler.ts, mirroring express.e's allowMCI gate). 587 of this
 * board's files carry it. Without it a perfect code is text a caller reads,
 * which is the failure that makes a check worth having in front of an
 * inserter.
 */
export function firstLineEnablesMci(firstLine: string): boolean {
  return firstLine.trimEnd().length > 0 && firstLine.startsWith('~');
}

/** One row of the editor's canvas as the text a caller would see. */
export function rowText(canvas: MciCanvas, y: number): string {
  return (canvas[y] ?? []).map(cell => cell?.char ?? ' ').join('');
}

export function canvasEnablesMci(canvas: MciCanvas): boolean {
  return firstLineEnablesMci(rowText(canvas, 0));
}

/**
 * What typing a code here would paint over.
 *
 * The editor's canvas is a fixed grid and typing OVERWRITES: a code dropped
 * into the middle of a drawing replaces the cells it covers, and there is no
 * reflow to notice it happening. So the inserter asks first, and this is the
 * question - the characters that would be lost, or an empty string when the
 * run is blank.
 */
export function textUnder(canvas: MciCanvas, x: number, y: number, length: number): string {
  return rowText(canvas, y).slice(x, x + length).trimEnd();
}

/** What a replace would do to the codes in the file being replaced. */
export interface CarryVerdict {
  path: string;
  /** Whole lines of codes that would be kept around the new art. */
  carried: string[];
  /** Codes that sat among the art and cannot be placed around new art. */
  lost: { text: string; line: number }[];
  /** The replacement has codes of its own, so it is the whole truth. */
  uploadHasCodes: boolean;
}

/**
 * One sentence about what a replace costs, in the terms the decision needs.
 *
 * Silence would be the wrong default here: the sysop's report was that codes
 * "get wiped" with no word about it, so the case worth naming loudest is the
 * one where something is lost.
 */
export function describeCarry(verdict: CarryVerdict): string {
  if (verdict.uploadHasCodes) {
    return 'The file you are uploading has codes of its own, so it is used exactly as it is';
  }

  const kept = verdict.carried.length;
  const lost = verdict.lost.length;

  if (!kept && !lost) return 'This screen carries no codes, so there is nothing to keep';

  const keptPart = kept
    ? `${kept} line${kept === 1 ? '' : 's'} of codes kept`
    : 'No codes can be kept';
  if (!lost) return keptPart;

  const where = verdict.lost.map(l => `line ${l.line}`).join(', ');
  return `${keptPart}, and ${lost} among the art cannot be placed (${where}) - put ${lost === 1 ? 'it' : 'them'} back with the editor`;
}
