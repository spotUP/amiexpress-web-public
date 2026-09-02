/**
 * Every MCI code a screen file on this board can carry.
 *
 * A screen here is a PROGRAM. `processMciCmd()` (express.e:5258-5768) is 90
 * `StrCmp(cmd, ...)` arms covering 98 distinct codes, and this port implements
 * all of them plus two of its own (`~XC_`, `~XI`). The board USES six of the
 * hundred - the enabling tilde, `~f`, `~SP`, `~SS_`, `~CC_`, `~SR_` and `~CL.` -
 * not because the rest are dead but because nothing has ever told a designer
 * they exist. This file is that telling.
 *
 * METADATA ONLY. Three places already describe these codes: the dispatch maps
 * in `parseMciCodes()` (screen.handler.ts:629 and :754), the four reference
 * patterns in `mci-references.ts`, and the tokenizer's own header. A fourth
 * DESCRIPTION is safe; a fourth IMPLEMENTATION is how the manager ends up
 * telling the sysop something untrue. So nothing here emits anything, and
 * `tests/screens/mci-catalog.test.ts` proves every entry against the running
 * parser rather than against a list someone kept in sync by hand.
 *
 * Two facts a caller of this catalog must carry with it:
 *
 *   - MCI is parsed ONLY when the file's first line starts with `~`
 *     (screen.handler.ts:1943, express.e:6800-6806). A perfect code in a file
 *     without it prints as text.
 *   - `~~` is a literal tilde (express.e:5749), so a code cannot follow one.
 */

/**
 * What has to be chosen before a code can be written down.
 *
 * This is the whole reason a builder is possible: 80 of the 100 take nothing
 * and are a click, and every one of the rest names something the board already
 * knows about itself - a command icon, a screen file, an installed door.
 */
export type MciArgument =
  | { kind: 'none' }
  /** A BBS command, from `Commands/BBSCmd/<name>.info`. */
  | { kind: 'command' }
  /** A screen file, by the path the loader would resolve. */
  | { kind: 'screen' }
  /** An installed door. */
  | { kind: 'door' }
  /** A menu name. */
  | { kind: 'menu' }
  | { kind: 'text'; label: string }
  | { kind: 'number'; label: string }
  /** A single character - only `~D`, which changes parsing for the rest of the file. */
  | { kind: 'char'; label: string };

export type MciFamily =
  | 'user' | 'system' | 'conference' | 'files'
  | 'colour' | 'layout' | 'flow' | 'include' | 'extension';

/**
 * The character that ends the code, and it is NOT always `|`.
 *
 * Measured against the running parser, not assumed: `~CL` `~CD` `~ML` `~MD`
 * are only recognised with a PERIOD (screen.handler.ts:453-548), and `~SM_`
 * `~SX_` `~XC_` only with a DOUBLE pipe (:849, :903, :427). Writing `~CL|` in
 * a screen file produces the letters "CL" and nothing else. A builder that
 * emitted `|` for all of them would hand the sysop dead codes, which is the
 * whole failure this catalog exists to stop.
 *
 * `''` is the literal-tilde entry, which is written `~~` and ends itself.
 */
export type MciTerminator = '|' | '||' | '.' | '';

export interface MciCode {
  /** The code as typed, without the leading tilde: `N`, `CC_`, `c4`. */
  code: string;
  /** One line a designer can act on, in their words rather than express.e's. */
  summary: string;
  family: MciFamily;
  argument: MciArgument;
  /** Whether a width prefix (`~20N|`) truncates the output. */
  takesWidth: boolean;
  /** What has to follow it - see `MciTerminator`; four codes want `.`, three want `||`. */
  terminator: MciTerminator;
  /** `express.e:<line>` for a code AmiExpress defines, `web` for this port's own. */
  source: string;
  /**
   * Where the code is actually handled in this port.
   *
   * `dispatch` - an entry in one of `parseMciCodes()`'s dispatch maps, so the
   * tokenizer substitutes it. `caller` - a code the tokenizer cannot own
   * because it displays a file, runs a command, builds a multi-line list or
   * changes the terminator; those are pre- or post-passes around the
   * tokenizer. The distinction is what the drift test checks each side of.
   */
  handledBy: 'dispatch' | 'caller';
  /**
   * The exact spelling of another code this one is an alias of.
   *
   * `z0`-`z7` share express.e's `b0`-`b7` arms (`StrCmp(cmd,'b0') OR
   * StrCmp(cmd,'z0')`), and `LG` shares `ON`'s. Listing them as sixteen
   * separate background colours would be a lie about how many choices a
   * designer has.
   */
  aliasOf?: string;
}

/** A value-producing code: takes a width, substitutes, handled by the tokenizer. */
const value = (
  code: string, summary: string, family: MciFamily, line: number
): MciCode => ({
  code, summary, family,
  argument: { kind: 'none' }, takesWidth: true, terminator: '|',
  source: `express.e:${line}`, handledBy: 'dispatch',
});

/** An action code: emits control output or sets a flag, no width. */
const action = (
  code: string, summary: string, family: MciFamily, line: number,
  handledBy: MciCode['handledBy'] = 'dispatch',
  terminator: MciTerminator = '|'
): MciCode => ({
  code, summary, family,
  argument: { kind: 'none' }, takesWidth: false, terminator,
  source: `express.e:${line}`, handledBy,
});

export const MCI_CATALOG: MciCode[] = [
  // -- Who is reading the screen (express.e:5292-5398) ---------------------
  value('N',  'The caller\'s handle', 'user', 5292),
  value('RN', 'The caller\'s real name', 'user', 5387),
  value('UL', 'Where the caller says they are', 'user', 5296),
  value('IN', 'The caller\'s internet name (email on this board)', 'user', 5383),
  value('#',  'The caller\'s phone number', 'user', 5303),
  value('A',  'The caller\'s security level', 'user', 5323),
  value('S',  'The caller\'s slot number in user.data', 'user', 5327),
  value('CA', 'The caller\'s conference access string', 'user', 5331),
  value('HW', 'The caller\'s computer type', 'user', 5339),
  value('TC', 'How many times the caller has called', 'user', 5307),
  value('TT', 'How many times the caller has called today', 'user', 5311),
  value('LC', 'When the caller last called, date and time', 'user', 5315),
  value('M',  'How many messages the caller has posted', 'user', 5319),
  value('TL', 'The caller\'s daily time limit, in minutes', 'user', 5343),
  value('TR', 'Time remaining this call, in minutes', 'user', 5347),
  value('UB', 'Bytes uploaded, with separators', 'user', 5351),
  value('DB', 'Bytes downloaded, with separators', 'user', 5355),
  value('SU', 'Bytes uploaded, as a size (12.3M)', 'user', 5359),
  value('SD', 'Bytes downloaded, as a size (12.3M)', 'user', 5363),
  value('FU', 'How many files the caller has uploaded', 'user', 5367),
  value('FD', 'How many files the caller has downloaded', 'user', 5371),
  value('BD', 'The caller\'s download byte limit for today', 'user', 5375),
  {
    ...value('P', 'The caller\'s password - deliberately prints NOTHING', 'user', 5300),
    summary: 'The caller\'s password - deliberately prints NOTHING, on both AmiExpress and here',
  },

  // -- The board and the call (express.e:5335-5438) ------------------------
  value('VE', 'The BBS software name and version', 'system', 5403),
  value('VD', 'The BBS software version date', 'system', 5405),
  value('BR', 'The caller\'s connection speed', 'system', 5335),
  value('ON', 'The node this call is on', 'system', 5379),
  { ...value('LG', 'The node this call is on', 'system', 5379), aliasOf: 'ON' },
  value('ND', 'The node this call is on', 'system', 5409),
  value('SC', 'How many calls the board has taken', 'system', 5399),
  value('DT', 'Today\'s date', 'system', 5435),
  value('CT', 'The time this call started', 'system', 5431),
  value('OD', 'The date this call started', 'system', 5391),
  value('OT', 'The time this call started', 'system', 5395),
  action('AK', 'The sysop function-key list', 'system', 5428),

  // -- Where the caller is (express.e:5413-5650) ---------------------------
  value('CF', 'The current conference number', 'conference', 5413),
  value('CN', 'The current conference name', 'conference', 5417),
  value('MB', 'The current message base number', 'conference', 5420),
  value('MN', 'The current message base name', 'conference', 5424),
  action('CL', 'Every conference the caller may join, one per line', 'conference', 5588, 'caller', '.'),
  action('CD', 'Every conference the caller may join, across the line', 'conference', 5608, 'caller', '.'),
  action('ML', 'Every message base in this conference, one per line', 'conference', 5621, 'caller', '.'),
  action('MD', 'Every message base in this conference, across the line', 'conference', 5639, 'caller', '.'),

  // -- Flagged files (express.e:5439-5454) ---------------------------------
  value('FF', 'The files the caller has flagged, on one line', 'files', 5439),
  value('FC', 'How many files the caller has flagged', 'files', 5443),
  value('FL', 'The files the caller has flagged, one per line', 'files', 5446),

  // -- Colour (express.e:5651-5698) ----------------------------------------
  action('c0', 'Text black', 'colour', 5651),
  action('c1', 'Text red', 'colour', 5651),
  action('c2', 'Text green', 'colour', 5657),
  action('c3', 'Text yellow', 'colour', 5657),
  action('c4', 'Text blue', 'colour', 5663),
  action('c5', 'Text magenta', 'colour', 5663),
  action('c6', 'Text cyan', 'colour', 5669),
  action('c7', 'Text white', 'colour', 5669),
  action('b0', 'Background black', 'colour', 5675),
  action('b1', 'Background red', 'colour', 5675),
  action('b2', 'Background green', 'colour', 5681),
  action('b3', 'Background yellow', 'colour', 5681),
  action('b4', 'Background blue', 'colour', 5687),
  action('b5', 'Background magenta', 'colour', 5687),
  action('b6', 'Background cyan', 'colour', 5693),
  action('b7', 'Background white', 'colour', 5693),
  { ...action('z0', 'Background black', 'colour', 5675), aliasOf: 'b0' },
  { ...action('z1', 'Background red', 'colour', 5675), aliasOf: 'b1' },
  { ...action('z2', 'Background green', 'colour', 5681), aliasOf: 'b2' },
  { ...action('z3', 'Background yellow', 'colour', 5681), aliasOf: 'b3' },
  { ...action('z4', 'Background blue', 'colour', 5687), aliasOf: 'b4' },
  { ...action('z5', 'Background magenta', 'colour', 5687), aliasOf: 'b5' },
  { ...action('z6', 'Background cyan', 'colour', 5693), aliasOf: 'b6' },
  { ...action('z7', 'Background white', 'colour', 5693), aliasOf: 'b7' },

  // -- Putting things where you want them (express.e:5469-5495, 5699-5725) --
  action('f', 'Clear the screen', 'layout', 5469),
  action('q', 'Back to normal colours', 'layout', 5582),
  action('h', 'One character backwards', 'layout', 5585),
  action('n1', 'One blank line', 'layout', 5699),
  action('n2', 'Two blank lines', 'layout', 5699),
  action('n3', 'Three blank lines', 'layout', 5705),
  action('n4', 'Four blank lines', 'layout', 5705),
  action('n5', 'Five blank lines', 'layout', 5711),
  action('n6', 'Six blank lines', 'layout', 5711),
  action('n7', 'Seven blank lines', 'layout', 5717),
  action('n8', 'Eight blank lines', 'layout', 5717),
  action('n9', 'Nine blank lines', 'layout', 5723),
  {
    code: 'x', summary: 'Move to a column on the top row',
    family: 'layout', argument: { kind: 'number', label: 'Column' },
    takesWidth: false, terminator: '|', source: 'express.e:5478', handledBy: 'dispatch',
  },
  {
    code: 'y', summary: 'Move to a row in the first column',
    family: 'layout', argument: { kind: 'number', label: 'Row' },
    takesWidth: false, terminator: '|', source: 'express.e:5487', handledBy: 'dispatch',
  },

  // -- What the screen does next (express.e:5455-5477, 5726-5768) ----------
  action('SP', 'Wait for a key, showing the pause prompt', 'flow', 5455),
  action('CR', 'Wait for a key, showing nothing', 'flow', 5462),
  action('NS', 'Stop pausing for the rest of this screen', 'flow', 5740),
  {
    code: 'w', summary: 'Wait - no effect here, the Amiga tick delay has no web equivalent',
    family: 'flow', argument: { kind: 'none' },
    takesWidth: true, terminator: '|', source: 'express.e:5472', handledBy: 'dispatch',
  },
  {
    code: 'SMO', summary: 'Start drawing slowly, at a speed you choose',
    family: 'flow', argument: { kind: 'number', label: 'Speed' },
    takesWidth: false, terminator: '|', source: 'express.e:5726', handledBy: 'caller',
  },
  action('SMC', 'Stop drawing slowly', 'flow', 5737, 'caller'),
  {
    code: 'D', summary: 'Change the character that ends a code - for the REST of the file',
    family: 'flow', argument: { kind: 'char', label: 'New terminator' },
    takesWidth: false, terminator: '', source: 'express.e:5743', handledBy: 'caller',
  },
  {
    code: '~', summary: 'A literal tilde - write ~~ to print one',
    family: 'flow', argument: { kind: 'none' },
    takesWidth: false, terminator: '', source: 'express.e:5749', handledBy: 'caller',
  },

  // -- Reaching other things (express.e:5496-5581) -------------------------
  {
    code: 'SS_', summary: 'Show another screen file here',
    family: 'include', argument: { kind: 'screen' },
    takesWidth: false, terminator: '|', source: 'express.e:5496', handledBy: 'caller',
  },
  {
    code: 'SX_', summary: 'Show the next screen in a numbered set, in turn',
    family: 'include', argument: { kind: 'screen' },
    takesWidth: false, terminator: '||', source: 'express.e:5505', handledBy: 'caller',
  },
  {
    code: 'SR_', summary: 'Show one of a numbered set at random - the width says how many',
    family: 'include', argument: { kind: 'screen' },
    takesWidth: true, terminator: '|', source: 'express.e:5533', handledBy: 'caller',
  },
  {
    code: 'CC_', summary: 'Run a BBS command',
    family: 'include', argument: { kind: 'command' },
    takesWidth: false, terminator: '|', source: 'express.e:5555', handledBy: 'caller',
  },
  {
    code: 'CR_', summary: 'Show a prompt of your own and wait for a key',
    family: 'include', argument: { kind: 'text', label: 'Prompt' },
    takesWidth: false, terminator: '|', source: 'express.e:5564', handledBy: 'caller',
  },
  {
    code: 'SM_', summary: 'Name the menu this screen belongs to',
    family: 'include', argument: { kind: 'menu' },
    takesWidth: false, terminator: '||', source: 'express.e:5575', handledBy: 'caller',
  },

  // -- This port's own (no AmiExpress equivalent) --------------------------
  {
    code: 'XC_', summary: 'Queue a BBS command to run after the screen finishes',
    family: 'extension', argument: { kind: 'command' },
    takesWidth: false, terminator: '||', source: 'web', handledBy: 'caller',
  },
  {
    code: 'XI', summary: 'Start a door without announcing it',
    family: 'extension', argument: { kind: 'door' },
    takesWidth: false, terminator: '|', source: 'web', handledBy: 'caller',
  },
];

/** By code, for a lookup that does not walk the array. */
export const MCI_BY_CODE: ReadonlyMap<string, MciCode> = new Map(
  MCI_CATALOG.map(entry => [entry.code, entry])
);

/**
 * The families in the order a designer wants them, with the name the admin
 * shows. `include` first because `~SS_` and `~CC_` are what the board actually
 * uses; `extension` last because it is ours, not AmiExpress's.
 */
export const MCI_FAMILY_ORDER: { family: MciFamily; label: string }[] = [
  { family: 'include', label: 'Screens and commands' },
  { family: 'flow', label: 'What happens next' },
  { family: 'layout', label: 'Layout' },
  { family: 'colour', label: 'Colour' },
  { family: 'user', label: 'The caller' },
  { family: 'system', label: 'The board' },
  { family: 'conference', label: 'Conferences' },
  { family: 'files', label: 'Flagged files' },
  { family: 'extension', label: 'This port only' },
];

/**
 * Longest code first, so `ND` is not read as `N` and `SMC` is not read as `SM_`.
 */
const BY_LENGTH: MciCode[] = [...MCI_CATALOG].sort((a, b) => b.code.length - a.code.length);

/**
 * Which catalog code a scanned cmd is, or undefined for one nobody defines.
 *
 * The cmd is what express.e's scanner extracts: everything after the tilde and
 * any width digits, up to the next space or terminator (express.e:5279-5289).
 * So `SS_BBS:Screens/x.txt` is the `SS_` code, `CL.` is `CL` written with the
 * period it requires, and `x10` is `x` with its argument attached.
 */
export function codeForCmd(cmd: string): MciCode | undefined {
  for (const entry of BY_LENGTH) {
    if (cmd === entry.code) return entry;
    if (entry.terminator === '.' && cmd === `${entry.code}.`) return entry;
    if (entry.argument.kind !== 'none' && cmd.length > entry.code.length && cmd.startsWith(entry.code)) {
      return entry;
    }
  }
  return undefined;
}

/**
 * How many times each catalog code appears in one screen file.
 *
 * Walks the text the way the parser does rather than running 100 regexes over
 * it: find a tilde, skip up to three width digits, read to the next space or
 * terminator. `~~` is a literal tilde and is counted as the `~` code, not as
 * the start of one.
 *
 * The BARE leading tilde - the one that switches MCI on for the whole file
 * (screen.handler.ts:1943) - has an empty cmd and is counted under the
 * `MCI_ENABLED_KEY` sentinel, because "587 files carry it" is the single most
 * useful number the manager can show a designer.
 */
export const MCI_ENABLED_KEY = '(enables MCI)';

export function countMciCodes(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const bump = (code: string) => { counts[code] = (counts[code] || 0) + 1; };

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '~') continue;

    if (text[i + 1] === '~') {
      bump('~');
      i++;
      continue;
    }

    let start = i + 1;
    for (let digits = 0; digits < 3 && start < text.length; digits++) {
      const ch = text[start];
      if (ch < '0' || ch > '9') break;
      start++;
    }

    // A tilde ends the cmd as surely as a space does - `~f~SS_x|` is two
    // codes, and reading to the first `|` would make it one nonsense one.
    // Same stop set as the tokenizer's own `[^\s|~\r\n]`.
    let end = start;
    while (end < text.length && !' |~\r\n\t'.includes(text[end])) end++;

    const cmd = text.slice(start, end);
    if (!cmd) {
      bump(MCI_ENABLED_KEY);
      continue;
    }

    const entry = codeForCmd(cmd);
    if (entry) bump(entry.code);
    i = end - 1;
  }

  return counts;
}
