import type { GalleryItem } from '../components/ScreenGallery';
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
  via: 'resolved' | 'variant' | 'include' | 'shadowed';
  /** The theme covering this file, when `via` is `shadowed`. */
  shadowedBy?: string;
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
  format: 'ansi' | 'text' | 'rip' | 'petscii' | 'teletext' | 'teletext-native';
  sha256: string;
  mci: MciReferenceShape[];
  readBy?: ScreenReaderShape[];
  sauce?: SauceShape;
  /** 'backup' or 'runtime' when a designer would never edit this file. */
  generated?: 'backup' | 'runtime';
  /**
   * The door that owns the file, when it belongs to a door rather than the
   * board. Set by the index; absent on every screen the board resolves.
   */
  door?: string;
  /** The theme this file belongs to, when it lives under one - read by whoever wears it. */
  theme?: string;
  /** Nothing but the codes the board runs - plumbing, not art. */
  codesOnly?: boolean;
  /**
   * What is wrong with the bytes: 'empty', 'colour-codes-without-escape',
   * and for a `.seq` the two C64 rules - 'petscii-graphics-bank',
   * 'petscii-non-black-background'.
   */
  problems?: string[];
}

/** What a problem means, in the sysop's terms. */
export const PROBLEM_LABELS: Record<string, string> = {
  empty: 'Empty - draws nothing',
  'colour-codes-without-escape':
    'Colour codes lost their escape byte - a caller sees the codes as text',
  'petscii-graphics-bank':
    'Drawn in the graphics bank - a C64 board shows the lowercase one',
  'petscii-non-black-background':
    'Asks for a background colour - a C64 board runs on a black screen',
};

/** The two C64 rules, as the index reports them. */
export const PETSCII_RULE_PROBLEMS = [
  'petscii-graphics-bank', 'petscii-non-black-background',
] as const;

/**
 * A `.seq` the board shows as its artist drew it, and would no longer accept.
 *
 * Reported rather than repaired, on the sysop's own terms: the rules stop a
 * NEW screen breaking them, and a file that predates them keeps reaching
 * callers unchanged until somebody redraws it.
 */
export function breaksC64Rules(file: ScreenFileShape): boolean {
  return (file.problems ?? []).some(p => (PETSCII_RULE_PROBLEMS as readonly string[]).includes(p));
}

export function describeProblem(problem: string): string {
  return PROBLEM_LABELS[problem] ?? problem;
}

/** A conference as the board names it - `Conf2` means nothing to a designer. */
export interface ConferenceShape {
  id: number;
  name: string;
  dir: string;
  /** How many file areas and message bases it holds - neither is named on disk. */
  fileAreas?: number;
  messageBases?: number;
}

/** A bulletin: art a caller reads by number, titled by the board's own BullHelp. */
export interface BulletinShape {
  number: number;
  file: string;
  title?: string;
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
  bulletins?: BulletinShape[];
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
  /**
   * One file this screen actually resolves to, for a preview.
   *
   * A row is a screen NAME and a name has many files behind it - 71 identical
   * Node<n>/BBSTITLE.txt on this board. Any of them draws the same picture, so
   * the first drawable one is the row's face. Null when the screen resolves
   * nowhere, or only to RIP and PETSCII, which this preview cannot draw.
   */
  previewPath: string | null;
  /**
   * Whether a person who draws would ever open this.
   *
   * False ONLY when every file behind the screen is known to be plumbing -
   * all leftovers, all written by the board, or all pure MCI. A screen that
   * resolves to nothing has no file to judge, and it stays visible: a missing
   * screen is the single most important row on the page, and the first
   * version of this filter hid exactly those.
   */
  hasArt: boolean;
}

const SCOPE_LABELS: Record<ScreenIndexEntryShape['dirType'], string> = {
  node: 'node scope',
  conf: 'conference scope',
  global: 'board root',
};

/**
 * A file an artist would actually open.
 *
 * Not a leftover, not written by the board, not empty, and not pure plumbing.
 * Asked for in those terms - "so the ansi artists only see the screens they
 * should touch" - after a gallery of 669 files buried 400 pieces of art among
 * 258 files of nothing but codes.
 */
export function isArt(file: ScreenFileShape): boolean {
  // Format is deliberately NOT part of this. A RIP screen is somebody's art
  // even though this preview cannot draw it, and filtering it out of the
  // tables would put it beyond reach entirely. The gallery narrows to the
  // formats it can DRAW; that is a different question from what is art.
  return !file.generated && !file.codesOnly && file.bytes > 0;
}

/**
 * Art that belongs to a DOOR, not to the board.
 *
 * A door opens its own files, so none of the board's screen routing reaches
 * them and none of the board's tables should mix them in. Asked for in those
 * words - "we also need to split up actual bbs screens and screens that come
 * from doors in separate tabs".
 */
export function isDoorArt(file: ScreenFileShape): boolean {
  return !!file.door;
}

/**
 * A screen file with no art in it at all - nothing but the codes the board
 * runs.
 *
 * `AWAITSCREEN.TXT` is `~CC_V-AWAIT|`; `LOGON10.TXT` is four includes and a
 * pause. They are real screens and a sysop edits them, but an ARTIST opening
 * one finds an empty canvas: the art they were looking for is in the file
 * those codes pull in. Their own tab, not the gallery.
 */
export function isCommandsOnly(file: ScreenFileShape): boolean {
  return !!file.codesOnly && !file.generated && file.bytes > 0;
}

/**
 * Not a thing anyone edits: a leftover copy, a file the board rewrites for
 * itself, or zero bytes.
 *
 * Kept listed rather than hidden - a file the manager refuses to show is a
 * file a sysop cannot find - but kept out of every view that means "art".
 */
export function isNotArt(file: ScreenFileShape): boolean {
  return !!file.generated || file.bytes === 0;
}

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
      previewPath:
        files.find(f => f.format === 'ansi' || f.format === 'text')?.relPath ?? null,
      hasArt: files.length === 0 || files.some(isArt),
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

/**
 * Which copy of a screen the board actually serves, and what it covers.
 *
 * A theme COVERS the board's screen; it does not delete it. Both files are
 * real, both have readers, and the index marks the covered one `shadowed`.
 * Without saying so the admin lists two files that look identical and leaves
 * the sysop to guess which a caller gets - which is exactly what happened:
 * "why do i see Themes/607080/Conf/3/bull20.txt and Conf3/bull20.txt in
 * 607080's theme? they look identical" (2026-09-15). They were not: the themed
 * copy carried one extra `~XISUBSCAN` line, invisible because an MCI code
 * executes rather than draws.
 *
 * MATCHED ON THE SCREEN AND THE SCOPE, never the name. Conference 3's bulletin
 * is not conference 5's, and a theme drawing one covers that one only - saying
 * otherwise would tell a sysop his conference 5 art was dead when it is what
 * every caller there sees.
 */
export interface ScreenPrecedence {
  /** The theme this file serves, when it is a theme's own copy. */
  serves?: string;
  /** Board files this copy covers. */
  covers: string[];
  /** Themes whose copy covers THIS file, with the covering path. */
  coveredBy: Array<{ theme: string; path?: string }>;
}

const scopeKey = (r: { screen?: string; scope?: string; id?: number | null }): string =>
  `${(r.screen ?? '').toLowerCase()}|${r.scope ?? ''}|${r.id ?? ''}`;

export function screenPrecedence(
  file: ScreenFileShape,
  index: ScreenIndexShape,
): ScreenPrecedence {
  const files = Object.values(index.files ?? {}) as ScreenFileShape[];
  const mine = new Set((file.readBy ?? []).map(scopeKey));

  const covers: string[] = [];
  const coveredBy: Array<{ theme: string; path?: string }> = [];

  if (file.theme) {
    // A theme's own copy: the board files it covers are the ones the index
    // marked `shadowed` BY this theme, for a screen and scope this file serves.
    for (const other of files) {
      if (other.theme) continue;
      const shadowed = (other.readBy ?? []).some(
        r => r.via === 'shadowed' && r.shadowedBy === file.theme && mine.has(scopeKey(r)),
      );
      if (shadowed) covers.push(other.relPath);
    }
    return { serves: file.theme, covers, coveredBy };
  }

  // A board file: whoever shadows it, and where their copy is.
  for (const reader of file.readBy ?? []) {
    if (reader.via !== 'shadowed' || !reader.shadowedBy) continue;
    const covering = files.find(other =>
      other.theme === reader.shadowedBy
      && (other.readBy ?? []).some(r => r.via === 'resolved' && scopeKey(r) === scopeKey(reader)));
    coveredBy.push({ theme: reader.shadowedBy, path: covering?.relPath });
  }

  return { covers, coveredBy };
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
  const tail = qualifiers.length ? ` - ${qualifiers.join(', ')}` : '';
  // An include is read THROUGH the screen, so say so in those words - "LOGON
  // in node 0 - included by it" made the reader guess what "it" was.
  if (reader.via === 'include') return `Included by ${reader.screen} in ${where}${tail}`;
  // A theme covers the board's screen; it does not delete it. Say who still
  // reads this file rather than leaving a sysop to read "shadowed" as "dead".
  if (reader.via === 'shadowed') {
    return `${reader.screen} in ${where}${tail} - for callers not wearing ${reader.shadowedBy ?? 'this theme'}`;
  }

  return `${reader.screen} in ${where}${tail}`;
}

/**
 * What a gallery card is called.
 *
 * The card is the ART, and the label has to tell two pieces of art apart at a
 * glance - the whole reason for a gallery over a table. Naming every card
 * after the screen that reads it did not: this board's logon is three
 * different files (`reference-board.txt`, `flt.txt`, `uprough.txt`, one per level
 * band) pulled in by `~SS_`, and all three came up as "LOGON"; five
 * conference bulletins came up as five "CONF_BULL". The sysop: "the gallery
 * feels off".
 *
 * So: a bulletin by its number and title; an INCLUDED file by its own name,
 * because it is its own piece of art and the screen that includes it is in the
 * detail line; a conference screen with the conference's name; a security
 * variant with the callers it serves. A node screen is just the screen - the
 * node number tells an artist nothing, and this board shares one copy across
 * every node anyway.
 */
export function galleryLabel(
  file: Pick<ScreenFileShape, 'relPath'>,
  reader: ScreenReaderShape | undefined,
  bulletin: BulletinShape | undefined,
): string {
  if (bulletin) return `Bulletin ${bulletin.number}${bulletin.title ? ` - ${bulletin.title}` : ''}`;
  if (!reader) return file.relPath;
  if (reader.via === 'include') return file.relPath.split('/').pop() ?? file.relPath;

  const parts = [reader.screen];
  if (reader.scope === 'conf') parts.push(reader.scopeName ?? `conference ${reader.id}`);
  if (reader.serves) parts.push(`level ${reader.serves}`);
  else if (reader.securityLevel !== undefined) parts.push(`level ${reader.securityLevel}`);
  // MENU250.TXT and menu250.txt.GR serve the same callers on different
  // terminals; without this they are two cards with one name.
  if (reader.screenTypeName) parts.push(reader.screenTypeName);
  else if (reader.screenType) parts.push(reader.screenType);
  return parts.join(' - ');
}

/**
 * The order cards come in: grouped under the screen they belong to, so the
 * three files a logon pulls in sit beside LOGON rather than filed under F, S
 * and U by their own names.
 */
export function gallerySortKey(reader: ScreenReaderShape | undefined, label: string): string {
  // The screen first, then what it pulls in, then by name within each.
  return `${reader?.screen ?? '~'}\u0000${reader?.via === 'include' ? 1 : 0}\u0000${label}`;
}

/** Which formats a screen HAS - moved here from ScreenFilesPage so the board's
 *  gallery and an artist's are answered by one function. */
/**
 * Which formats a screen HAS, by looking for its siblings on the board.
 *
 * Keyed on the stem, because that is what the loader does: for one screen it
 * tries `<stem>.rip`, `<stem>.seq`, `<stem>.ttx` and the text file, and
 * serves whichever the caller's terminal wants (native `<stem>.tti` wins
 * once rendered). `.gr` and `.ibm` are ANSI under another name.
 */
export function formatsPresent(
  openPath: string,
  files: Record<string, { relPath: string }> | undefined,
): { ansi: boolean; petscii: boolean; rip: boolean; teletext: boolean; teletextNative: boolean } {
  const dir = openPath.slice(0, openPath.lastIndexOf('/') + 1).toLowerCase();
  const stem = screenStem(openPath);

  const have = { ansi: false, petscii: false, rip: false, teletext: false, teletextNative: false };
  for (const key of Object.keys(files ?? {})) {
    const lower = key.toLowerCase();
    if (lower.slice(0, lower.lastIndexOf('/') + 1) !== dir) continue;
    const name = lower.slice(lower.lastIndexOf('/') + 1);
    const ext = name.slice(name.lastIndexOf('.') + 1);
    if (screenStem(key) !== stem) continue;
    if (ext === 'seq') have.petscii = true;
    else if (ext === 'rip') have.rip = true;
    else if (ext === 'ttx') have.teletext = true;
    else if (ext === 'tti') have.teletextNative = true;
    else have.ansi = true;
  }
  return have;
}

/**
 * Every file of the SAME SCREEN in the same directory - its other formats.
 *
 * One stem rule, shared with `formatsPresent` and the board's own loader. The
 * artist's dialog kept its own copy of this that stripped
 * `(txt|seq|rip|gr|ibm|ans)` and not `.ttx` or `.tti`, so a screen with a
 * teletext sibling listed no teletext tab at all: `BBSTITLE.ttx` reduced to
 * `bbstitle.ttx`, which matches no stem. It is one function now.
 */
export function formatSiblings(
  openPath: string | null,
  files: Record<string, { relPath: string }> | undefined,
): string[] {
  if (!openPath) return [];
  const dir = openPath.slice(0, openPath.lastIndexOf('/') + 1).toLowerCase();
  const stem = screenStem(openPath);

  return Object.keys(files ?? {}).filter(key => {
    const lower = key.toLowerCase();
    if (lower.slice(0, lower.lastIndexOf('/') + 1) !== dir) return false;
    return screenStem(key) === stem;
  });
}

/** `BBSTITLE.SEQ` -> `PETSCII`, for a tab a designer can read. */
export function formatLabel(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.seq')) return 'PETSCII';
  if (lower.endsWith('.rip')) return 'RIP';
  if (lower.endsWith('.gr')) return 'Amiga ANSI';
  /*
   * Teletext is not "ANSI / text", and saying so put TWO tabs with the same
   * name on one screen - Node0 carries BBSTITLE.txt and BBSTITLE.ttx, and the
   * sysop had no way to tell which tab was which (2026-09-14). `.ttx` is this
   * board's ANSI teletext, drawn like ANSI by the TDAText face; `.tti` is
   * native packet-level teletext, which is listed and never parsed here.
   */
  if (lower.endsWith('.ttx')) return 'Teletext';
  if (lower.endsWith('.tti')) return 'Teletext (native)';
  if (lower.endsWith('.ibm')) return 'IBM ANSI';
  return 'ANSI / text';
}

/** What each format is CALLED on a card, so a chip and a warning agree. */
export const FORMAT_LABEL: Record<string, string> = {
  ansi: 'ANSI',
  petscii: 'PETSCII',
  rip: 'RIP',
  teletext: 'Teletext',
  teletextNative: 'Teletext',
};

/** The extension each drawable format is stored under. `.tti` is native
 *  teletext, which wins over `.ttx` once rendered. */
const FORMAT_EXTENSIONS: Record<string, string[]> = {
  ansi: ['txt', 'gr', 'ibm', 'ans'],
  petscii: ['seq'],
  rip: ['rip'],
  teletext: ['ttx'],
  teletextNative: ['tti'],
};

/**
 * The file this screen would be DRAWN from in a chosen format.
 *
 * Keyed on the stem, exactly as `formatsPresent` and the board's own loader
 * are: one screen is `<stem>.txt`, `<stem>.seq`, `<stem>.rip` and friends in
 * the same directory. Null when the screen has no such sibling - the caller
 * then keeps the file it had, because a screen that lacks a format is work
 * still to do and not a reason to blank its card.
 */
export function siblingInFormat(
  openPath: string,
  files: Record<string, { relPath: string; format?: string }> | undefined,
  format: string,
): string | null {
  const wanted = FORMAT_EXTENSIONS[format];
  if (!wanted) return null;

  const dir = openPath.slice(0, openPath.lastIndexOf('/') + 1).toLowerCase();
  const base = openPath.slice(openPath.lastIndexOf('/') + 1);
  const stem = base.replace(/\.(txt|seq|rip|tti|ttx|gr|ibm|ans)$/i, '').toLowerCase();

  for (const key of Object.keys(files ?? {})) {
    const lower = key.toLowerCase();
    if (lower.slice(0, lower.lastIndexOf('/') + 1) !== dir) continue;
    const name = lower.slice(lower.lastIndexOf('/') + 1);
    if (screenStem(key) !== stem) continue;
    if (wanted.includes(name.slice(name.lastIndexOf('.') + 1))) return key;
  }
  return null;
}

export interface GalleryBuildOptions {
  /** The theme being looked through; `default` is the board's own screens. */
  theme: string;
  showGenerated: boolean;
  showUnread: boolean;
  /**
   * Draw every thumbnail in THIS format where the screen has it.
   *
   * A screen exists several times over - `.txt` for an ANSI caller, `.seq`
   * for a C64, `.rip` for a RIP terminal - and without this the gallery drew
   * whichever file the card resolved to, which is almost always the ANSI one.
   * An artist reviewing the board as a C64 caller sees it had no way to look
   * at it. A screen with no such sibling keeps the file it had.
   */
  thumbnailFormat?: string;
  /**
   * Set when the gallery belongs to a theme: each card then says whose art it
   * is, so an artist can see at a glance what they have redrawn and what is
   * still the board's.
   */
  ownedBy?: string;
  /**
   * What to call the theme's own art.
   *
   * "Yours" for the artist whose theme it is; a sysop auditing somebody else's
   * studio is not looking at their own work and should not be told they are.
   */
  ownedLabel?: string;
  /**
   * The theme is a DRAFT, so nothing in it is served to anybody yet.
   *
   * This is the fact that decides which copy wins, and no amount of comparing
   * the two files reveals it. Measured on the live board 2026-09-15: theme
   * `607080` is a draft, so `Themes/607080/Conf/3/bull20.txt` has NO readers
   * at all while the board's `Conf3/bull20.txt` resolves - and the gallery
   * drew both, leaving the sysop asking which one a caller gets ("they look
   * identical"). For a draft the answer is always the board's, until it is
   * published.
   */
  themeIsDraft?: boolean;
}

/**
 * What a resolved reader is served, narrow enough to tell twins apart.
 *
 * Level bands (LOGON per band) and screen types (.GR twins) are genuinely
 * different cards: hiding one would lie about what is left. The gallery
 * itself only ever holds ansi/text - PETSCII, RIP and Teletext never reach
 * it (their chips on the ANSI card say what is missing) - so the byte
 * format is not part of the key.
 */
export function servedKey(
  reader: Pick<ScreenReaderShape, 'screen' | 'scope' | 'serves' | 'securityLevel' | 'screenType'>,
): string {
  return [
    reader.screen,
    reader.scope,
    reader.serves ?? (reader.securityLevel !== undefined ? `level ${reader.securityLevel}` : ''),
    reader.screenType ?? '',
  ].join('|');
}

/** The FORMAT extensions a screen file can wear, longest chain first:
 *  `menu250.txt.GR` is the same screen as `MENU250.TXT`, on another terminal. */
const FORMAT_EXTENSION = /\.(txt|seq|rip|tti|ttx|gr|ibm|ans)$/i;

/** A screen file's own name, without them. */
export function screenStem(relPath: string): string {
  let stem = relPath.slice(relPath.lastIndexOf('/') + 1).toLowerCase();
  for (let stripped = stem.replace(FORMAT_EXTENSION, ''); stripped !== stem; stripped = stem.replace(FORMAT_EXTENSION, '')) {
    stem = stripped;
  }
  return stem;
}

/**
 * What a theme has DRAWN, as the board's own copy would describe itself.
 *
 * `servedKey` says what a reader is served - and two different pieces of art
 * can answer the same description, because a reader is a claim about a
 * SCREEN and a card is a FILE. A theme drawing `Board/MENU.TXT` made the
 * board's `Screens/BULL.TXT` vanish from the artist's studio, which is the
 * one thing that page is for: seeing what is still the board's. The loader
 * finds a theme's copy by NAME (screen-index.service.ts:1113, variants are
 * matched per directory), so the art's own name belongs in the key.
 */
export function drawnKey(
  file: Pick<ScreenFileShape, 'relPath'>,
  reader: Pick<ScreenReaderShape, 'screen' | 'scope' | 'serves' | 'securityLevel' | 'screenType'>,
): string {
  return `${screenStem(file.relPath)}|${servedKey(reader)}`;
}

/**
 * Every screen a caller looking through `opts.theme` is served, as cards.
 *
 * ONE rule, called by the sysop's gallery and the artist's: a card cannot be
 * art on one page and plumbing on the next, and a second copy of this filter
 * is how the two would come to disagree about what an artist may touch.
 */
export function buildGalleryItems(index: ScreenIndexShape, opts: GalleryBuildOptions): GalleryItem[] {
  const bulletinTitles = new Map((index.bulletins ?? []).map(b => [b.file, b] as const));

  // The index's OWN list of what nothing reads - not a second derivation
  // from readBy, which would have to re-learn that a bulletin is read by
  // number and never by name.
  const readByNothing = new Set((index.unused ?? []).map(f => f.relPath));

  const drawable = Object.values(index.files)
    .filter(file => file.format === 'ansi' || file.format === 'text')
    .filter(file => opts.showUnread || !readByNothing.has(file.relPath))
    // A door's art is the door's, and a door directory is full of .txt files
    // that are documentation, not art. It has its own tab.
    .filter(file => !isDoorArt(file))
    // Another theme's files are another theme's view. Under `default` no
    // theme file belongs here at all.
    .filter(file => !file.theme || file.theme === opts.theme)
    .filter(file => opts.showGenerated || isArt(file));   // drawable-only is applied above

  /**
   * One card per piece of ART, not per file.
   *
   * This board has 71 identical Node<n>/BBSTITLE.txt - one screen,
   * provisioned per node - and 43 more copies under Node<n>/Screens. Drawing
   * each as its own card buries the art nobody has seen in the art everybody
   * has. Grouped by content hash, which is what "identical" means here.
   */
  const byContent = new Map<string, ScreenFileShape[]>();
  for (const file of drawable) {
    byContent.set(file.sha256, [...(byContent.get(file.sha256) ?? []), file]);
  }

  /**
   * In a theme's own studio, a screen it has drawn shows once: its version.
   * The board's original beside it reads as a duplicate ("why do i see two
   * guestlogon.txt") - the artist already answered it by drawing. Board
   * cards stay in the sysop's gallery (no ownedBy there) and for screens
   * the theme has not drawn.
   *
   * Matched per screen NAME, scope, level band AND screen type: a theme that
   * drew the ANSI still needs the board's .GR twin, or the missing-format
   * chips would lie about what is left to draw. In a themed index the covered
   * original reads `shadowed`, never `resolved` - same key decides.
   */
  const drawnInTheme = (ownedBy: string): Set<string> => {
    const claimed = new Set<string>();
    for (const file of drawable) {
      if (file.theme !== ownedBy) continue;
      for (const reader of file.readBy ?? []) {
        if (reader.via !== 'resolved') continue;
        claimed.add(drawnKey(file, reader));
      }
    }
    return claimed;
  };
  const drawn = opts.ownedBy ? drawnInTheme(opts.ownedBy) : new Set<string>();
  const groups = [...byContent.values()].filter(copies => {
    if (!opts.ownedBy || drawn.size === 0) return true;
    // The theme's own cards always stay; a board group goes when the theme
    // serves the same screen, scope, level band and screen type.
    if (copies.some(copy => copy.theme === opts.ownedBy)) return true;
    // In a themed index the board's copy reads `shadowed`, never `resolved`
    // — the theme answered first. A shadowed card is the covered original,
    // so it decides by the same key.
    const file = copies.find(c => c.readBy?.some(r => r.via === 'resolved' || r.via === 'shadowed')) ?? copies[0];
    const reader = file.readBy?.find(r => r.via === 'resolved' || r.via === 'shadowed');
    if (!reader) return true;
    return !drawn.has(drawnKey(file, reader));
  });

  /**
   * ONE CARD PER SCREEN, not one per version.
   *
   * The grouping above turns 41 identical copies into one group. This turns
   * the several GROUPS of one screen into one card: measured on the live
   * board, 59 content-grouped cards stood for 44 screens, so 15 of them were
   * a screen the artist had already scrolled past - `bull20.txt` alone was
   * six versions.
   *
   * The key is the screen the INDEX says a file serves, never its filename.
   * `Logon100.txt` serves LOGON at level 100 and folds in, because which
   * level a caller has is the board's business and not the artist's (sysop,
   * 2026-09-15). `bull20.txt` serves BULL20 and must not fold into BULL - and
   * a basename regex gets exactly that wrong, since 20 is a multiple of five
   * and `variantOf` would read it as a level.
   */
  const screenKeyOf = (copies: ScreenFileShape[]): string => {
    const named = copies.find(c => c.readBy?.some(r => r.screen)) ?? copies[0];
    const reader = named.readBy?.find(r => r.screen);
    // A file the index could not place has only its name to go on, and two
    // unplaced files with the same name are the same screen as far as anyone
    // can tell from here.
    const screen = (reader?.screen ?? named.relPath.split('/').pop() ?? named.relPath).toLowerCase();
    /*
     * THE LEVEL IS FOLDED IN; THE THEME AND THE SCREEN TYPE ARE NOT.
     *
     * Level: `Logon100.txt` is the logon screen at level 100 and the artist
     * draws the logon screen once - the sysop's rule, 2026-09-15.
     *
     * Theme: a theme's copy is an OVERRIDE, not drift. The gallery shows a
     * drawn screen once in its own studio and twice on the board, on purpose,
     * and folding the two together took the board's original off the sysop's
     * page entirely.
     *
     * Screen type: `menu250.txt.GR` is the same screen drawn for a different
     * TERMINAL, so it is a drawing of its own that still has to be made - the
     * "twins the theme has not drawn". Folding it in hid work from the person
     * whose job is to do it.
     *
     * All three were found by the four gallery tests that this grouping broke
     * on its first run, which is what those tests are for.
     */
    /*
     * And `generated` is a fourth dimension, for the same reason as the other
     * three: a file the BOARD writes is not a version of an artist's drawing,
     * even when the index says the two serve the same screen. Folding them
     * together hid a runtime file behind the art whenever the sysop asked to
     * see generated screens.
     */
    /*
     * AND THE SCOPE, because a conference's screen is its OWN art.
     *
     * A node's screen is one drawing provisioned 41 times, and folding those
     * is the entire point. A CONFERENCE's is not: `Conf1/bull20.txt` through
     * `Conf5/bull20.txt` are five conferences' own bulletins, each naming its
     * own conference in the logo. Keyed on the screen alone they came back as
     * "CONF_BULL - 5 versions", which invites an artist to reconcile four
     * conferences' art out of existence - found by running this grouping over
     * an index of the live board, which is what that gate is for.
     *
     * So the id is part of the key for a conference and dropped for a node.
     */
    const scope = reader?.scope ?? '';
    const within = scope === 'conf' ? String(reader?.id ?? '') : '';
    return [screen, scope, within, named.theme ?? '', reader?.screenType ?? '', named.generated ?? ''].join('|');
  };

  const scopesOf = (copies: ScreenFileShape[]): number =>
    copies.reduce((n, f) => n + (f.readBy?.length ?? 0), 0);

  const byScreen = new Map<string, ScreenFileShape[][]>();
  for (const copies of groups) {
    const key = screenKeyOf(copies);
    byScreen.set(key, [...(byScreen.get(key) ?? []), copies]);
  }

  /** The versions of one screen, the most-read first - that is the one an
   *  edit should change, and the one the card stands for. */
  const ranked = [...byScreen.values()].map(versions =>
    [...versions].sort((a, b) => scopesOf(b) - scopesOf(a)));

  return ranked
    .map(versions => {
      const copies = versions[0];
      const otherVersions = versions.slice(1);
      // The copy a screen actually resolves to leads; failing that, the first.
      const file = copies.find(c => c.readBy?.some(r => r.via === 'resolved')) ?? copies[0];
      const bulletin = bulletinTitles.get(file.relPath);
      const reader = file.readBy?.[0];

      const label = galleryLabel(file, reader, bulletin);

      const detail = file.generated
        ? file.generated === 'backup' ? 'a leftover copy' : 'written by the board'
        : file.problems?.length
          ? file.problems.map(describeProblem).join('; ')
          : reader
            ? describeReader(reader, index.callersByLevel)
            : 'read by nothing';

      /*
       * The file this card DRAWS, which is not always the file it stands for.
       * With a format chosen, the card shows that sibling - same screen, same
       * card, different drawing - and a screen without one keeps what it had.
       */
      const wantedSibling = opts.thumbnailFormat
        ? siblingInFormat(file.relPath, index.files, opts.thumbnailFormat)
        : null;
      const drawnPath = wantedSibling ?? file.relPath;
      const drawn = drawnPath === file.relPath ? file : index.files?.[drawnPath] ?? file;
      /*
       * THE FALLBACK HAS TO SAY SO.
       *
       * Without this a card drawn in ANSI while PETSCII is selected looks
       * exactly like a screen that HAS a PETSCII drawing - the artist reading
       * the gallery to find what is left to draw would be told the opposite of
       * the truth ("they need to say missing", sysop 2026-09-15).
       */
      const missingFormat = opts.thumbnailFormat && !wantedSibling
        ? FORMAT_LABEL[opts.thumbnailFormat] ?? opts.thumbnailFormat
        : undefined;

      return {
        path: drawnPath,
        label,
        sortKey: gallerySortKey(reader, label),
        /** How many distinct contents this screen has. 1 is the quiet case. */
        versions: versions.length,
        /** The versions this card stands in front of, most-read first. */
        otherVersions,
        /** Scopes reading THIS version, and those reading the others - so the
         *  card can say "38 of 41" rather than leaving the artist to wonder
         *  how much of the board the drift actually covers. */
        scopes: scopesOf(copies),
        otherScopes: otherVersions.reduce((n, other) => n + scopesOf(other), 0),
        detail: copies.length > 1
          ? `${detail} - and ${copies.length - 1} identical ${copies.length === 2 ? 'copy' : 'copies'}`
          : detail,
        credit: file.sauce?.author
          ? `${file.sauce.title || 'untitled'} by ${file.sauce.author}`
          : undefined,
        problem: (file.problems?.length ?? 0) > 0,
        // WHAT THIS FILE IS, so the card draws it with the right renderer. A
        // `.seq` fed to the CP437 canvas is a wall of noise - which is what
        // every PETSCII card in the gallery was ("the petscii previews dont
        // display correctly in the admin ui", sysop).
        format: drawn.format,
        ...(missingFormat ? { missingFormat } : {}),
        formats: formatsPresent(file.relPath, index.files),
        ...(opts.ownedBy
          ? {
            badge: file.theme === opts.ownedBy
              ? {
                label: opts.themeIsDraft
                  ? `${opts.ownedLabel ?? 'Yours'} - draft, not served yet`
                  : opts.ownedLabel ?? 'Yours',
                kind: 'mine' as const,
              }
              : {
                label: opts.themeIsDraft
                  ? "Board's - still what callers see"
                  : "Board's - not redrawn yet",
                kind: 'theirs' as const,
              },
          }
          : {}),
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ sortKey: _sortKey, ...item }) => item);
}

/** Which of the three formats this screen does NOT have yet, with the path
 *  each one would be created at. Shared: the sysop's page and the artist's
 *  studio both offer to add a format, and two copies of this list is how the
 *  two would come to disagree about what a screen can be. */
/**
 * The formats this screen could have and does not.
 *
 * "there is no way to upload/complete a screen with .seq/.rip in the screen
 * editor admin ui?" - there was not: the strip listed only the variants on
 * disk, and Replace wrote onto the open file's own path. A screen the loader
 * can serve three ways (`<stem>.txt`, `<stem>.seq`, `<stem>.rip`,
 * screen.handler:1217-1234) needs the two it lacks offered right where the
 * one it has is shown.
 */
export function missingFormats(openPath: string | null, siblings: string[]): Array<{ ext: string; label: string; path: string }> {
  if (!openPath) return [];
  const dir = openPath.slice(0, openPath.lastIndexOf('/') + 1);
  const base = openPath.slice(openPath.lastIndexOf('/') + 1);
  const stem = base.replace(/\.(txt|seq|rip|tti|ttx|gr|ibm|ans)$/i, '');
  const have = new Set([openPath, ...siblings].map(p => p.toLowerCase().replace(/^.*\./, '')));
  const all = [
    { ext: 'txt', label: 'ANSI / text' },
    { ext: 'seq', label: 'PETSCII' },
    { ext: 'rip', label: 'RIP' },
    { ext: 'tti', label: 'Teletext (native packets - author externally)' },
  ];
  return all
    .filter(f => !have.has(f.ext) && !(f.ext === 'txt' && (have.has('gr') || have.has('ibm') || have.has('ans'))))
    .map(f => ({ ...f, path: `${dir}${stem}.${f.ext}` }));
}
