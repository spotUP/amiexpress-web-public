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
 * Whether MCI runs in this file at all.
 *
 * The board parses codes ONLY when the first line starts with a tilde
 * (screen.handler.ts:1943, express.e:6800-6806). 587 of this board's files
 * carry it. Without it a perfect code is text a caller reads, which is the
 * failure that makes an inserter worth having a check in.
 */
export function screenHasEnablingTilde(text: string): boolean {
  const firstNewline = text.indexOf('\n');
  const firstLine = firstNewline >= 0 ? text.slice(0, firstNewline) : text;
  return firstLine.trimEnd().length > 0 && firstLine.startsWith('~');
}

/** The line ending this file already uses, so an insert does not mix them. */
function lineEnding(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Switch MCI on for a file that does not have it, leaving the art alone.
 *
 * A line of its own, at the top: the tilde is the switch, not part of the
 * drawing.
 */
export function withEnablingTilde(text: string): string {
  if (screenHasEnablingTilde(text)) return text;
  return `~${lineEnding(text)}${text}`;
}

/**
 * Where a code goes.
 *
 * `above` and `below` are the head and tail blocks the board's own files
 * already use - measured across the 377 files that carry codes, 439 sit in the
 * first three lines and 272 in the last three. `cursor` is the third case, and
 * the one that shifts every column to the right of it.
 */
export type MciPlacement = 'above' | 'below' | 'cursor';

/**
 * Put a code into a screen, without disturbing what is drawn.
 *
 * `above` lands after the enabling tilde if there is one, so the switch stays
 * on the first line where the parser looks for it.
 */
export function insertMciToken(
  text: string,
  token: string,
  placement: MciPlacement,
  cursorOffset = 0,
): string {
  const ending = lineEnding(text);

  if (placement === 'cursor') {
    const at = Math.max(0, Math.min(cursorOffset, text.length));
    return text.slice(0, at) + token + text.slice(at);
  }

  if (placement === 'below') {
    return text.endsWith(ending) || text === ''
      ? `${text}${token}${ending}`
      : `${text}${ending}${token}${ending}`;
  }

  if (!screenHasEnablingTilde(text)) return `${token}${ending}${text}`;

  const firstNewline = text.indexOf('\n');
  if (firstNewline < 0) return `${text}${ending}${token}${ending}`;
  return `${text.slice(0, firstNewline + 1)}${token}${ending}${text.slice(firstNewline + 1)}`;
}
