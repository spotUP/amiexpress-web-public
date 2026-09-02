/**
 * ONE MCI dispatch table.
 *
 * Extracted VERBATIM from `parseMciCodes` (screen.handler.ts) - the
 * `userInfoDispatch` / `prefixDispatch` object literals and the ~40 locals
 * they closed over. The move is behaviour-free on the ANSI path and pinned
 * byte-for-byte by `tests/handlers/mci-dispatch-ansi-pin.test.ts`, whose
 * snapshot was generated before the extraction landed.
 *
 * WHY IT LEFT screen.handler.ts
 * -----------------------------
 * The PETSCII `.seq` renderer must support every token the `.TXT` path
 * supports (plan decision 1). Copying the table would guarantee the two
 * drift apart, so both callers build it here. `flavour: 'petscii'` differs
 * ONLY in the transport encoding of the same semantics: colour, background,
 * reset, clear, backspace and CR become PETSCII control bytes; `~x`/`~y`
 * become MOVE sentinels the renderer resolves against the live machine;
 * `~AK` renders as plain 40-column rows. Every other entry is shared, one
 * definition.
 *
 * Plan: `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`, Task 4.
 * express.e parity references are kept inline, unchanged, on each row.
 */
import { db } from '../database';
import { flaggedFilesManager } from '../services/FlaggedFilesManager';
import {
  applyMciWidth,
  type MciDispatchMap,
  type MciPrefixDispatchMap,
} from '../utils/mci-tokenizer.util';
import {
  getSystemTime,
  formatLongDate,
  formatLongTime,
  formatLongDateTime,
} from '../utils/date-time.util';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { narrowClip } from '../utils/table-format.util';
import { vicColorToPetscii } from '@amiexpress/bbs-door-sdk/petscii';

export type MciFlavour = 'ansi' | 'petscii';

/**
 * NUL-delimited sentinels the inline (socket) mode substitutes instead of
 * running the side effect inside a dispatch closure. Defined here so the
 * dispatch, `parseMciCodes`' walker and the pre-pass module share ONE
 * definition; `MOVE` is PETSCII-only (the deferred `~x`/`~y` cursor walk).
 */
export const MCI_SENTINELS = {
  F: '\x00F\x00',
  SP: '\x00SP\x00',
  CC: '\x00CC:',
  SS: '\x00SS:',
  SR: '\x00SR:',
  MOVE: '\x00MOVE:',
  END: '\x00',
} as const;

export type MciSentinels = { [K in keyof typeof MCI_SENTINELS]: string };

/**
 * ONLY the pause flag lives here. commandsToExecute / filesToDisplay /
 * slowmo / slowmoCount are set by the PRE-PASSES and stay owned by
 * `applyMciPrePasses`' return value. Side-effect note: `~NS` mutates
 * `session.nonStopText` directly - a mutation of `session`, not of this
 * state.
 */
export interface MciDispatchState {
  hasPause: boolean;
}

export interface BuildMciDispatchOpts {
  /** 'ansi' = today's values, byte for byte. */
  flavour: MciFlavour;
  /** Drives the SENTINEL_* returns (express.e outdata=NIL mode). */
  inlineMode: boolean;
  sentinels: MciSentinels;
  /**
   * The render's clock. Optional so a caller can leave it out, but pass it
   * whenever the same render also reads the clock elsewhere: `~DT` here and
   * the legacy `%D` in parseMciCodes must not straddle a second boundary.
   */
  now?: Date;
}

export interface BuiltMciDispatch {
  dispatch: MciDispatchMap;
  prefixDispatch: MciPrefixDispatchMap;
  state: MciDispatchState;
}

// ---------------------------------------------------------------------------
// ~AK - Access Keys (express.e:5428-5430 + 29863-29871)
// ---------------------------------------------------------------------------

/**
 * The ONE list of access keys, in display order. Both renderings walk it:
 * ANSI groups it two-per-row through ACCESS_KEYS_ANSI_ROWS below, PETSCII
 * emits one pair per 40-column row. Adding a key here reaches both screens.
 */
export const ACCESS_KEYS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'F1', label: 'Sysop Login' },
  { key: 'F2', label: 'Local Login' },
  { key: 'F3', label: 'Instant Remote Logon' },
  { key: 'F4', label: 'Reserve for a user' },
  { key: 'F5', label: 'Conference Maintenance' },
  { key: 'F6', label: 'Account Editing' },
  { key: 'SH+F5', label: 'Open Shell' },
  { key: 'SH+F6', label: 'View Callerslog' },
  { key: 'F7', label: 'Chat Toggle' },
  { key: 'F8', label: 'Reprogram modem' },
  { key: 'F9', label: 'Exit BBS' },
  { key: 'F10', label: 'Exit BBS (off hook)' },
  { key: 'SH+F10', label: 'Clear tooltype cache' },
];

/**
 * The 80-column layout, as data. The original literal was seven hand-aligned
 * rows whose indents (9/9/9/7/9/9/39), separator widths and inter-cell
 * padding all vary, so the irregularity is carried here rather than being
 * re-derived by a formatter that would have to special-case every row. Cells
 * consume ACCESS_KEYS in order.
 *
 * `ansiLabel` overrides the plain label for the one cell that carries SGR
 * inside its text (`F10`); PETSCII uses the plain label, so no ANSI byte can
 * reach a C64 through this table.
 */
const ACCESS_KEYS_ANSI_ROWS: ReadonlyArray<{
  indent: number;
  cells: ReadonlyArray<{ sep: string; pad: string; ansiLabel?: string }>;
  tail: string;
}> = [
  { indent: 9, cells: [{ sep: '  ', pad: ' '.repeat(13) }, { sep: '  ', pad: '' }], tail: '' },
  { indent: 9, cells: [{ sep: '  ', pad: ' '.repeat(4) }, { sep: '  ', pad: '' }], tail: '' },
  { indent: 9, cells: [{ sep: '  ', pad: ' '.repeat(2) }, { sep: '  ', pad: '' }], tail: '' },
  { indent: 7, cells: [{ sep: ' ', pad: ' '.repeat(12) }, { sep: ' ', pad: '' }], tail: '' },
  { indent: 9, cells: [{ sep: '  ', pad: ' '.repeat(13) }, { sep: '  ', pad: '' }], tail: '' },
  {
    indent: 9,
    cells: [
      { sep: '  ', pad: ' '.repeat(15) },
      { sep: '  ', pad: '', ansiLabel: 'Exit BBS \x1b[33m(\x1b[37moff hook\x1b[33m)' },
    ],
    tail: '\x1b[0m',
  },
  { indent: 39, cells: [{ sep: ' ', pad: '' }], tail: '\x1b[0m' },
];

/** The 80-column `~AK` value: byte-identical to the retired literal. */
export function renderAccessKeysAnsi(): string {
  const rows: string[] = [];
  let next = 0;
  for (const row of ACCESS_KEYS_ANSI_ROWS) {
    let out = ' '.repeat(row.indent);
    for (const cell of row.cells) {
      const entry = ACCESS_KEYS[next++];
      const label = cell.ansiLabel ?? entry.label;
      out += `\x1b[44;33m ${entry.key} \x1b[40;35m${cell.sep}}- \x1b[33m${label}${cell.pad}`;
    }
    rows.push(out + row.tail);
  }
  return rows.join('\r\n');
}

/**
 * The 40-column `~AK` value: one pair per row, `<key padded to 8><label>`,
 * clipped to a row (decision 4's clip is the backstop, not the mechanism).
 * `\n` collapses to a single $0D in the value encoder, so no `\r` here.
 * No ANSI byte is emitted.
 */
export function renderAccessKeysPetscii(): string {
  return ACCESS_KEYS.map(e => narrowClip(`${e.key.padEnd(8)}${e.label}`)).join('\n');
}

// ---------------------------------------------------------------------------
// PETSCII transport encodings
// ---------------------------------------------------------------------------

/** express.e ~c0..~c7 order mapped onto the VIC palette (plan Task 4 table). */
const PETSCII_FG_VIC = [0, 2, 5, 7, 6, 4, 3, 1] as const;

const byte = (n: number): string => String.fromCharCode(n);

/** PETSCII control bytes used by the colour/clear/backspace/CR rows. */
const PETSCII_CLR = 0x93;
const PETSCII_DEL = 0x14;
const PETSCII_CR = 0x0d;
const PETSCII_RVS_OFF = 0x92;
/** CCGMS "set background" prefix - petscii-machine.ts consumes the byte after it. */
const PETSCII_BG_PREFIX = 0x02;
/** ~q resets to the C64's default light-blue pen (VIC 14). */
const PETSCII_DEFAULT_PEN_VIC = 14;

/**
 * Commands whose PETSCII value is ALREADY PETSCII bytes and must not be run
 * through the ASCII->PETSCII value encoder a second time.
 */
export const PETSCII_RAW_CMDS: ReadonlySet<string> = new Set([
  ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap(n => [`c${n}`, `b${n}`, `z${n}`]),
  'q', 'f', 'h', 'CR',
  'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9',
]);

/** Prefix dispatch has no exact key; match on the cmd's first char. */
export const PETSCII_RAW_PREFIXES: ReadonlySet<string> = new Set(['x', 'y']);

/**
 * Exact dispatch keys that begin with `D`. The `~D<char>` terminator pre-pass
 * (mci-pre-passes.ts) must leave these for the tokenizer: express.e:5743-5748
 * matches `StrCmp(cmd,'D',1)` LAST, after every exact key, with the comment
 * "this needs to be near the end otherwise it might pick up other commands
 * starting with D". Pinned against the real table by
 * tests/handlers/mci-dispatch-flavours.test.ts, so a new `D?` key cannot be
 * added without landing here too.
 */
export const MCI_EXACT_KEYS_STARTING_WITH_D: ReadonlySet<string> = new Set(['DB', 'DT']);

// ---------------------------------------------------------------------------
// buildMciDispatch
// ---------------------------------------------------------------------------

/**
 * ASYNC by design, not by accident: the values the table closes over need
 * `await db.getMessageBases(...)` and `await import('../services/
 * SystemStatsService')` before the literal can be built. A sync
 * `buildMciDispatch(ctx)` would only move the same two awaits into a second
 * exported function and give every caller two things to keep in step.
 */
export async function buildMciDispatch(
  session: any,
  opts: BuildMciDispatchOpts,
): Promise<BuiltMciDispatch> {
  const { flavour, inlineMode, sentinels } = opts;
  const petscii = flavour === 'petscii';
  const state: MciDispatchState = { hasPause: false };

  // Get user data safely
  const user = session.user || {};
  const username = user.username || 'Guest';
  const secLevel = user.secLevel || 0;
  // express.e:5309 - `~TC` prints `loggedOnUser.timesCalled AND $FFFF`, so
  // the code can never render more than five digits (65535). The mask is
  // load-bearing for layout, not only parity: the 40-column
  // `Screens/logoff/003.logoff.seq` row that carries `~TC` has no room for
  // a wider number, and an over-wide value wraps the row on a C64.
  const timesCalled = (user.timesCalled || 0) & 0xffff;
  // express.e:5321 - `~M` prints `loggedOnUser.messagesPosted AND $FFFF`,
  // the same 16-bit mask `~TC` carries one row above. Five digits at most.
  const messagesPosted = (user.messagesPosted || 0) & 0xffff;
  const uploads = user.uploads || 0;
  const downloads = user.downloads || 0;
  const uploadBytes = user.uploadBytes || 0;
  const downloadBytes = user.downloadBytes || 0;

  // Date/Time setup. ONE clock per render: the caller passes the same Date it
  // uses for the legacy `%` codes, so `~DT` and `%D` can never disagree.
  const now = opts.now ?? getSystemTime();
  // Logon time: session.logonTime is Unix seconds (set by time-tracking.util.ts)
  // Fall back to session.loginTime (ms) or current time if logonTime not yet set
  const logonDate = session.logonTime
    ? new Date(session.logonTime * 1000)
    : (session.loginTime ? new Date(session.loginTime) : now);

  // Format a number with commas (express.e formatBCD / formatUnsignedLong style)
  const formatWithCommas = (n: number): string => n.toLocaleString('en-US');

  const lcRaw = user.lastLogin || user.timeLastOn;
  const lcDate: Date | null = lcRaw instanceof Date ? lcRaw : (lcRaw ? new Date(lcRaw) : null);

  // ~SU / ~SD - Upload/Download Size (express.e:5359-5366) - calcSizeText()
  // express.e calcSizeText() divides by 1024 repeatedly until value < 1024,
  // appending lowercase unit suffix: b, kb, mb, gb, tb, pb (MiscFuncs.e:3336-3370)
  const calcSizeText = (bytes: number): string => {
    const units = ['b', 'kb', 'mb', 'gb', 'tb', 'pb'];
    let val = bytes;
    let i = 0;
    while (val >= 1024 && i < units.length - 1) {
      val = Math.round(val / 1024);
      i++;
    }
    return `${val}${units[i]}`;
  };

  let msgBaseName = 'Default';
  const currentMsgBase = session.currentMsgBase || 1;
  try {
    const messageBases = await db.getMessageBases(session.currentConf);
    if (messageBases.length > 0 && currentMsgBase <= messageBases.length) {
      msgBaseName = messageBases[currentMsgBase - 1]?.name || 'Default';
    }
  } catch (error) {
console.error('[parseMciCodes] Error getting message base name:', error);
    SysopDebugUtil.debug(null, session, 'MCI', 'Error parsing ~MN| (message base name)',
      { error: (error as Error).message }, DebugSeverity.WARNING);
  }

  const { systemStats } = await import('../services/SystemStatsService');
  const todayCalls = systemStats.getTodayCalls();
  const nodeNumStr = (session.nodeId || 1).toString();

  // Flagged files (express.e:5439-5454) — pre-compute so the dispatch
  // map closes over the rendered values rather than calling the manager
  // on every code lookup.
  const userId = session.user?.id || 0;
  const sessionFlaggedFiles = flaggedFilesManager.getFiles(userId);
  const flaggedFilesSpaceSep = sessionFlaggedFiles.map(f => f.fileName).join(' ');
  let flaggedFilesList = '';
  for (const file of sessionFlaggedFiles) {
    flaggedFilesList += `                     ${file.fileName}\b\r\n`;
  }

  // AK - Access Keys (express.e:5428-5430 + 29863-29871)
  const accessKeysDisplay = petscii ? renderAccessKeysPetscii() : renderAccessKeysAnsi();

  const dispatch: MciDispatchMap = {
    // User core (express.e:5292-5306)
    N:  (w) => applyMciWidth(username, w),
    P:  ()  => '',                                     // password — never substitute
    UL: (w) => applyMciWidth(user.location || '', w),
    '#':(w) => applyMciWidth(user.phoneNumber || '', w),
    // Counts + history (express.e:5307-5330)
    TC: (w) => applyMciWidth(timesCalled.toString(), w),
    TT: (w) => applyMciWidth((user.callsToday || 0).toString(), w),
    LC: (w) => applyMciWidth(lcDate ? formatLongDateTime(lcDate) : 'Never', w),
    M:  (w) => applyMciWidth(messagesPosted.toString(), w),
    A:  (w) => applyMciWidth(secLevel.toString(), w),
    S:  (w) => applyMciWidth(user.id?.toString() || '0', w),
    CA: (w) => applyMciWidth(user.confAccess || 'XXX', w),
    BR: (w) => applyMciWidth('57600', w),
    HW: (w) => applyMciWidth('Web Browser', w),
    // Time (express.e:5343-5350)
    TL: (w) => applyMciWidth(Math.floor((user.dailyTimeLimit || 120) / 60).toString(), w),
    TR: (w) => applyMciWidth(Math.floor(session.timeRemaining / 60).toString(), w),
    // Bytes / files (express.e:5351-5378)
    UB: (w) => applyMciWidth(formatWithCommas(uploadBytes), w),
    DB: (w) => applyMciWidth(formatWithCommas(downloadBytes), w),
    SU: (w) => applyMciWidth(calcSizeText(uploadBytes), w),
    SD: (w) => applyMciWidth(calcSizeText(downloadBytes), w),
    FU: (w) => applyMciWidth(uploads.toString(), w),
    FD: (w) => applyMciWidth(downloads.toString(), w),
    BD: (w) => applyMciWidth((user.byteLimit || 0).toString(), w),
    // Node + identity (express.e:5379-5390)
    ON: (w) => applyMciWidth(nodeNumStr, w),
    LG: (w) => applyMciWidth(nodeNumStr, w),
    IN: (w) => applyMciWidth(user.email || '', w),
    RN: (w) => applyMciWidth(user.realName || username, w),
    // Conference info (express.e:5413-5427)
    CF: (w) => applyMciWidth(((session.currentConf || 0) + 1).toString(), w),
    CN: (w) => applyMciWidth(session.currentConfName || 'Main', w),
    MB: (w) => applyMciWidth(currentMsgBase.toString(), w),
    MN: (w) => applyMciWidth(msgBaseName, w),
    // Logon / system clocks (express.e:5391-5402)
    CT: (w) => applyMciWidth(formatLongTime(logonDate), w),
    VD: (w) => applyMciWidth('2.00', w),
    VE: (w) => applyMciWidth('AmiExpress-Web 2.0', w),
    ND: (w) => applyMciWidth((session.nodeId || 1).toString(), w),
    DT: (w) => applyMciWidth(formatLongDate(now), w),
    OT: (w) => applyMciWidth(formatLongTime(logonDate), w),
    OD: (w) => applyMciWidth(formatLongDate(logonDate), w),
    SC: (w) => applyMciWidth(todayCalls.toString(), w),
    // Flagged files (express.e:5439-5454)
    FC: (w) => applyMciWidth(sessionFlaggedFiles.length.toString(), w),
    FF: (w) => applyMciWidth(flaggedFilesSpaceSep, w),
    FL: (w) => applyMciWidth(flaggedFilesList, w),
    // AK - Access Keys (express.e:5428-5430)
    AK: () => accessKeysDisplay,
    // ~CR - Keypress wait (express.e:5462-5468). Express.e does
    // readChar(INPUT_TIMEOUT); we can't perform an async read mid-
    // substitution, so we emit \r\n. WEB_ deviation; inline-mode with
    // a socket is the right place to implement a real keypress wait.
    // PETSCII: a C64 row ends with a single $0D (research §4).
    CR: () => (petscii ? byte(PETSCII_CR) : '\r\n'),
    // ~NS - Non-Stop display flag. Side-effect: suppresses subsequent
    // pause prompts for this file render.
    NS: () => {
      if (session) {
        session.nonStopText = true;
      }
      return '';
    },
    // ~SP - Pause (express.e:5455-5461). Express.e: `(maxLen=-1) AND
    // (StrCmp(cmd,'SP'))` — only matches when no width prefix; calls
    // doPause(). Both modes route through this dispatch entry now:
    //   - Non-inline: set hasPause flag, emit empty.
    //   - Inline: emit a SP sentinel; the post-tokenizer walker
    //     splits on it, emits text-before to the socket, then
    //     early-returns with pendingInlineContent so the pause
    //     state machine can resume the rest of the screen.
    // The sentinel does NOT vary by flavour: the dispatch never emits
    // the pause itself.
    SP: (w) => {
      if (w !== -1) return undefined; // express.e width-gate
      if (inlineMode) return sentinels.SP;
      state.hasPause = true;
      return '';
    },
    // ~f - Clear screen (express.e:5469-5471 sendCLS, lowercase).
    //   - Non-inline: emit the clear into the parsed buffer directly.
    //   - Inline: emit a CLS sentinel; the walker emits text-before
    //     first, then sends CLS to the socket so document order
    //     matches express.e.
    f: () => (inlineMode ? sentinels.F : (petscii ? byte(PETSCII_CLR) : '\x1b[2J\x1b[H')),
    // ~w - Delay (express.e:5472-5477, lowercase). On Amiga:
    // Delay(maxLen) ticks. No equivalent on the Node / WebSocket
    // path — emit empty. Both `~5w|` (width=5, cmd='w') and the
    // WEB-divergent `~w5|` form (cmd='w5', via prefix dispatch
    // below) collapse to no-op.
    w: () => '',
    // Foreground colors (express.e:5651-5674) — express.e StrCmp keys
    // are lowercase. With caseSensitive: true the tokenizer matches
    // the cmd byte-exact, so `~C0` (uppercase) no longer substitutes —
    // a sysop typo'd it on Amiga and got "C0" plain text.
    c0: () => (petscii ? byte(vicColorToPetscii(PETSCII_FG_VIC[0])) : '\x1b[30m'),
    c1: () => (petscii ? byte(vicColorToPetscii(PETSCII_FG_VIC[1])) : '\x1b[31m'),
    c2: () => (petscii ? byte(vicColorToPetscii(PETSCII_FG_VIC[2])) : '\x1b[32m'),
    c3: () => (petscii ? byte(vicColorToPetscii(PETSCII_FG_VIC[3])) : '\x1b[33m'),
    c4: () => (petscii ? byte(vicColorToPetscii(PETSCII_FG_VIC[4])) : '\x1b[34m'),
    c5: () => (petscii ? byte(vicColorToPetscii(PETSCII_FG_VIC[5])) : '\x1b[35m'),
    c6: () => (petscii ? byte(vicColorToPetscii(PETSCII_FG_VIC[6])) : '\x1b[36m'),
    c7: () => (petscii ? byte(vicColorToPetscii(PETSCII_FG_VIC[7])) : '\x1b[37m'),
    // Background colors (express.e:5675-5698, lowercase). PETSCII has no
    // background attribute: CCGMS sets the VIC background register with
    // $02 followed by a colour byte (petscii-machine.ts consumes exactly
    // the one byte after $02).
    b0: () => (petscii ? bgPetscii(0) : '\x1b[40m'),
    b1: () => (petscii ? bgPetscii(1) : '\x1b[41m'),
    b2: () => (petscii ? bgPetscii(2) : '\x1b[42m'),
    b3: () => (petscii ? bgPetscii(3) : '\x1b[43m'),
    b4: () => (petscii ? bgPetscii(4) : '\x1b[44m'),
    b5: () => (petscii ? bgPetscii(5) : '\x1b[45m'),
    b6: () => (petscii ? bgPetscii(6) : '\x1b[46m'),
    b7: () => (petscii ? bgPetscii(7) : '\x1b[47m'),
    // z0-z7 = b0-b7 alias (express.e:5675 same dispatch line —
    // `StrCmp(cmd,'b0') OR StrCmp(cmd,'z0')`).
    z0: () => (petscii ? bgPetscii(0) : '\x1b[40m'),
    z1: () => (petscii ? bgPetscii(1) : '\x1b[41m'),
    z2: () => (petscii ? bgPetscii(2) : '\x1b[42m'),
    z3: () => (petscii ? bgPetscii(3) : '\x1b[43m'),
    z4: () => (petscii ? bgPetscii(4) : '\x1b[44m'),
    z5: () => (petscii ? bgPetscii(5) : '\x1b[45m'),
    z6: () => (petscii ? bgPetscii(6) : '\x1b[46m'),
    z7: () => (petscii ? bgPetscii(7) : '\x1b[47m'),
    // Blank lines (express.e:5699-5725, lowercase) — ~n1..~n9 emit 1-9 \r\n
    // (a C64 row break is one $0D).
    n1: () => newlines(1), n2: () => newlines(2), n3: () => newlines(3),
    n4: () => newlines(4), n5: () => newlines(5), n6: () => newlines(6),
    n7: () => newlines(7), n8: () => newlines(8), n9: () => newlines(9),
    // Misc (express.e:5571-5576, lowercase)
    // ~q - reset attributes. PETSCII: reverse off + the default pen.
    q: () => (petscii ? byte(PETSCII_RVS_OFF) + byte(vicColorToPetscii(PETSCII_DEFAULT_PEN_VIC)) : '\x1b[0m'),
    // ~h - backspace. A C64 has no non-destructive backspace; $14 (DEL)
    // is the closest and is what every other PETSCII path emits.
    h: () => (petscii ? byte(PETSCII_DEL) : '\x08'),
  };

  function bgPetscii(index: number): string {
    return byte(PETSCII_BG_PREFIX) + byte(vicColorToPetscii(PETSCII_FG_VIC[index]));
  }

  function newlines(count: number): string {
    return (petscii ? byte(PETSCII_CR) : '\r\n').repeat(count);
  }

  // Prefix dispatch — parameterised codes whose argument is part of
  // the cmd suffix rather than a width prefix. Mirrors express.e's
  // `StrCmp(cmd,'x',1)` family (express.e:5478-5495). Keys are
  // lowercase to match express.e StrCmp byte-exact.
  const prefixDispatch: MciPrefixDispatchMap = {
    // ~x<n>| - cursor to row 1, col n. Express.e:5478-5486 emits
    // `[;<n>H` (default row, explicit col). Note: previous Web build
    // emitted `[<n>G` (column-only move) — that was a divergence;
    // express.e moves to row 1 col n.
    //
    // PETSCII defers the walk: a dispatch closure runs during processMci,
    // BEFORE the renderer has fed any art to the oracle, so a $11/$1D walk
    // computed here would read a stale cursor. The MOVE sentinel carries
    // the 0-based target and the renderer resolves it against the live
    // machine (petsciiMoveTo), clamping to the machine's own cols/rows.
    x: (suffix) => {
      const n = parseInt(suffix, 10);
      if (!(Number.isFinite(n) && n >= 0)) return '';
      return petscii ? moveSentinel(n - 1, 0) : `\x1b[;${n}H`;
    },
    // ~y<n>| - cursor to row n, col 1. Express.e:5487-5495 emits
    // `[<n>;H` (explicit row, default col).
    y: (suffix) => {
      const n = parseInt(suffix, 10);
      if (!(Number.isFinite(n) && n >= 0)) return '';
      return petscii ? moveSentinel(0, n - 1) : `\x1b[${n};H`;
    },
    // ~w<n>| - WEB-divergent form preserved (express.e only knows
    // `~<n>w|` width-prefix form; that one matches the exact 'w'
    // entry above with width=n). Both collapse to no-op since Amiga
    // tick delay has no Node equivalent.
    w: () => '',
  };

  /** `MOVE:<x>|<y>` in 0-based screen coordinates, resolved by the renderer. */
  function moveSentinel(x: number, y: number): string {
    return `${sentinels.MOVE}${x}|${y}${sentinels.END}`;
  }

  // Inline-mode-only sentinel emitters. These convert the inline
  // side-effecting codes (~CC_, ~SS_, ~SR_) into NUL-delimited
  // sentinels in the output string. The post-tokenizer walker
  // splits on them and runs the side effect (process command,
  // displayScreen, random file) in document order — preserving
  // express.e's sequential semantics (express.e:5768-5802) without
  // a separate post-tokenizer regex pass. Flavour-independent.
  if (inlineMode) {
    // ~CC_<cmd> - run a BBS command synchronously (express.e:5555-5563).
    // Suffix is the trimmed command string (any trailing `|` already
    // consumed by the tokenizer's terminator handling).
    prefixDispatch['CC_'] = (suffix) => sentinels.CC + suffix.replace(/\|+$/, '') + sentinels.END;
    // ~SS_<filename> - displayScreen sub-file (express.e:5496-5504).
    prefixDispatch['SS_'] = (suffix) => sentinels.SS + suffix.replace(/\|+$/, '') + sentinels.END;
    // ~<n>SR_<basePath> - random numbered file (express.e:5533-5554).
    // Width prefix is the max-count; <basePath> is the suffix.
    prefixDispatch['SR_'] = (suffix, width) =>
      sentinels.SR + (Number.isFinite(width) && width > 0 ? width : -1) + '|' + suffix.replace(/\|+$/, '') + sentinels.END;
  }

  return { dispatch, prefixDispatch, state };
}
