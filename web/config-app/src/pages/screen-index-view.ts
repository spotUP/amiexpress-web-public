/**
 * The screens list, as rows.
 *
 * Screens first, files underneath: the top level is what AmiExpress knows -
 * LOGON, BBSTITLE, MENU, BULL - and each row answers the question a sysop
 * actually has, which is "does this reach my callers, on which nodes, and is
 * anything about it broken". The files are one level down because a file only
 * matters through the screen it serves.
 *
 * Pure functions, so the counting is tested without rendering anything.
 */

export interface MciReferenceShape {
  code: 'CC' | 'SS' | 'SR' | 'CL';
  target: string;
  resolves: boolean;
  scopeSpecific: boolean;
  /** What the board calls the target - a door's own name behind ~CC_. */
  targetName?: string;
}

import { describeScreen } from './screen-descriptions';

/** Who reads a file: which screen, in which scope, at which level and type. */
export interface ScreenReaderShape {
  screen: string;
  scope: 'node' | 'conf' | 'board';
  id: number | null;
  scopeName?: string;
  securityLevel?: number;
  screenType?: string;
  /** What the board calls that type - "Amiga Ansi", from ScreenTypes.info. */
  screenTypeName?: string;
  /** The levels this variant actually serves - "20-29", "30 and above". */
  serves?: string;
  via: 'resolved' | 'variant' | 'include';
}

/** The artist's own credits, from the file's SAUCE record. */
export interface SauceShape {
  title: string;
  author: string;
  group: string;
  date: string;
  width?: number;
  height?: number;
}

export interface ScreenFileShape {
  relPath: string;
  bytes: number;
  format: 'ansi' | 'text' | 'rip' | 'petscii';
  sha256: string;
  mci: MciReferenceShape[];
  readBy?: ScreenReaderShape[];
  sauce?: SauceShape;
  /** What is wrong with the bytes: 'empty', 'colour-codes-without-escape'. */
  problems?: string[];
}

/** What a problem means, in the sysop's terms. */
export const PROBLEM_LABELS: Record<string, string> = {
  empty: 'Empty - draws nothing',
  'colour-codes-without-escape':
    'Colour codes lost their escape byte - a caller sees the codes as text',
};

export function describeProblem(problem: string): string {
  return PROBLEM_LABELS[problem] ?? problem;
}

/** A conference as the board names it - `Conf2` means nothing to a designer. */
export interface ConferenceShape {
  id: number;
  name: string;
  dir: string;
}

export interface ScopeResolutionShape {
  scope: 'node' | 'conf' | 'board';
  id: number | null;
  dir: string;
  dirIsShared: boolean;
  file: string | null;
  variants: string[];
}

export interface ScreenIndexEntryShape {
  screen: string;
  dirType: 'node' | 'conf' | 'global';
  resolutions: ScopeResolutionShape[];
  missingScopes: number;
  duplicateGroups: { sha256: string; paths: string[] }[];
}

export interface ScreenIndexShape {
  screens: ScreenIndexEntryShape[];
  unused: ScreenFileShape[];
  conferences?: ConferenceShape[];
  /** How many accounts sit at each security level, for "95 callers". */
  callersByLevel?: Record<number, number>;
  files: Record<string, ScreenFileShape>;
  builtAt: string;
}

export interface ScreenRow {
  screen: string;
  /** What KIND of screen this is - the page shows one tab per kind. */
  dirType: ScreenIndexEntryShape['dirType'];
  scopeLabel: string;
  resolvedCount: number;
  missingCount: number;
  distinctContents: number;
  brokenReferences: number;
}

const SCOPE_LABELS: Record<ScreenIndexEntryShape['dirType'], string> = {
  node: 'node scope',
  conf: 'conference scope',
  global: 'board root',
};

export function toScreenRows(index: ScreenIndexShape): ScreenRow[] {
  return index.screens.map(entry => {
    const resolved = entry.resolutions.filter(r => r.file);
    const files = resolved
      .map(r => index.files[r.file as string])
      .filter((f): f is ScreenFileShape => !!f);

    return {
      screen: entry.screen,
      dirType: entry.dirType,
      scopeLabel: SCOPE_LABELS[entry.dirType],
      resolvedCount: resolved.length,
      missingCount: entry.missingScopes,
      distinctContents: new Set(files.map(f => f.sha256)).size,
      // A ~CC_ pointing at a door that is gone is a menu item that fails only
      // when a caller presses the key. Counting it here puts it in the list.
      brokenReferences: files.reduce(
        (total, file) => total + file.mci.filter(ref => !ref.resolves).length,
        0,
      ),
    };
  });
}

/**
 * Search the description as well as the name.
 *
 * A sysop looking for "the screen shown when you join a conference" does not
 * know it is called CONF_BULL - that is the whole reason the descriptions
 * exist. Searching only the name hides the answer behind the question.
 */
export function filterScreenRows(rows: ScreenRow[], query: string): ScreenRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(row =>
    row.screen.toLowerCase().includes(needle)
    || describeScreen(row.screen).toLowerCase().includes(needle));
}


/**
 * What a reader says, in one line a designer can act on.
 *
 * "CONF_BULL in Amiga Demoscene, security level 20" beats
 * "Conf2/bull20.txt" - the sysop had to work the second one out by hand.
 */
/**
 * How many accounts fall inside a variant's range.
 *
 * "Levels 30 and above" is a fact about the file; "99 callers" is a fact about
 * the board, and it is the one that says whether this screen matters.
 */
export function describeCallers(
  serves: string | undefined,
  callersByLevel: Record<number, number> | undefined,
): string {
  if (!serves || !callersByLevel) return '';

  const open = /^(\d+) and above$/.exec(serves);
  const closed = /^(\d+)-(\d+)$/.exec(serves);
  if (!open && !closed) return '';

  const low = Number((open ?? closed)![1]);
  const high = open ? Infinity : Number(closed![2]);

  const callers = Object.entries(callersByLevel)
    .filter(([level]) => Number(level) >= low && Number(level) <= high)
    .reduce((total, [, count]) => total + count, 0);

  return callers === 1 ? '1 caller' : callers === 0 ? 'no callers' : `${callers} callers`;
}

export function describeReader(
  reader: ScreenReaderShape,
  callersByLevel?: Record<number, number>,
): string {
  const where = reader.scope === 'node'
    ? `node ${reader.id}`
    : reader.scope === 'conf'
      ? (reader.scopeName ? `${reader.scopeName} (conference ${reader.id})` : `conference ${reader.id}`)
      : 'the whole board';

  const qualifiers: string[] = [];
  // The RANGE, not the number: express.e walks down in fives, so BULL20 is
  // what levels 20 to 29 see, and reading "level 20" as "only level 20" is how
  // a sysop concludes a live file is dead.
  if (reader.serves) {
    const callers = describeCallers(reader.serves, callersByLevel);
    qualifiers.push(`level ${reader.serves}${callers ? ` (${callers})` : ''}`);
  } else if (reader.securityLevel !== undefined) {
    qualifiers.push(`security level ${reader.securityLevel}`);
  }
  // "Amiga Ansi" is what the board calls .GR; the suffix alone is a puzzle.
  if (reader.screenTypeName) qualifiers.push(`${reader.screenTypeName} only`);
  else if (reader.screenType) qualifiers.push(`${reader.screenType} screens only`);
  if (reader.via === 'include') qualifiers.push('included by it');

  return `${reader.screen} in ${where}${qualifiers.length ? ` - ${qualifiers.join(', ')}` : ''}`;
}
