/**
 * Screen Handler - Display BBS screen files with MCI code parsing
 *
 * Handles loading and displaying screen files (.TXT) from the BBS directory structure.
 * Based on express.e await displayScreen() functions.
 */

import { utf8ChunkEnd } from '../utils/utf8-chunk.util';
import { clearScreenFor } from '../utils/ansi.util';
import { applyAuthoredWrap } from '../screens/authored-wrap';
import { C64_COLUMNS, petsciiColumnsOf } from '../amiga-emulation/xim/screen-width.util';
import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import * as path from 'path';
import { conferenceDir } from '../conferences/conference-paths';
import { looksNativeTti, renderNativeTti, type NativeRender } from '@amiexpress/bbs-door-sdk/teletext/render-native';

import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { BBSPaths } from '../utils/bbs-paths.util';
import {
  readAmigaTextFile,
  readAmigaTextFileWithTransforms,
  stripSauceMetadata,
  type AmigaTextResult,
} from '../utils/amiga-text-decode.util';
import { db } from '../database';
import { formatNumberedFilename } from '../services/SequentialFileManager';
import { ANSI } from '../utils/terminal-utils';
import { AnsiUtil } from '../utils/ansi.util';
const HIDE_CURSOR = ANSI.HIDE_CURSOR;
const SHOW_CURSOR = ANSI.SHOW_CURSOR;
import { findCaseInsensitive, resolvePath as amigaResolvePath } from '../utils/amigafs';
import { isPetsciiSeqFile, convertPetsciiToPetMe64 } from '../utils/petscii.util';
import { getSystemTime } from '../utils/date-time.util';
import { findSecurityScreen } from '../utils/screen-security.util';
import { mciGateOpen, screenFileDrawsNothing, screenIsProgram, screenProgramSignature } from '../screens/screen-blankness';
import { splitScreenCodes, applyMciCarry, type CarryPlan } from '../screens/mci-carry';
import { resolveCallerTheme } from '../screens/caller-theme';
import { userScreenTypeExtension } from '../screens/screen-metadata';
import {
  ScreenDirType, getScreenDirType, getScreenFileName,
  resolveNodeScreenDir, screenSearchLocations, themedPath, type SearchLocation,
} from '../screens/screen-resolution';

// Kept on this module's surface: callers and tests reached the resolver
// through the loader before it moved, and where a screen comes from is
// genuinely part of what the loader answers.
export { resolveNodeScreenDir } from '../screens/screen-resolution';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { DebugLogger } from '../utils/debug-logger.util';
import { formatBytes as formatBytesUtil } from '../utils/byte-format.util';
import { parseWipeMCI, WIPE_CODES, getWipeFrames, wipeEffectsEnabled, type WipeType } from '../utils/screen-wipe.util';
import { sessionColumns } from '../utils/door-min-columns.util';
import { fromCharset, type OutputAttributes } from '../utils/output-pacing';
import { playWipeFrames } from '../utils/wipe-playback';
import { emitText, emitPrompt, flushOutput } from '../utils/output.util';
import { fileCache } from '../utils/file-cache.util';
import { processMci as processMciTokenizer } from '../utils/mci-tokenizer.util';
import { adaptAnsiScreenToForty } from '../screens/adapt-ansi-to-forty';
import { petsciiTextScreenPlan, ANSI_ART_SKIPPED_NOTICE } from '../utils/ansi-art-detect.util';
import { wrapForSession } from '../utils/wrap-for-session.util';
// The ONE "is this session PETSCII" predicate and the ONE way rendered
// PETSCII reaches the wire (plan OC-2, OC-4). Both are documented at their
// definitions in `utils/petscii-session-model.ts`.
import { sessionWantsPetscii, emitPetsciiBytes } from '../utils/petscii-session-model';
import { buildMciDispatch, MCI_SENTINELS } from './mci-dispatch';
import { applyMciPrePasses, MCI_GENERATED } from './mci-pre-passes';
import type { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import {
  renderPetsciiScreen,
  renderChunkBytes,
  preparePetsciiSeq,
  petsciiRenderCtxFor,
  petsciiMachineFor,
  type PetsciiSpan,
  type PetsciiRenderCtx,
} from './petscii-screen.render';

/**
 * Detect if content is an ANSI animation that should play at modem speed
 *
 * ANSI animations use many cursor positioning codes to draw frame-by-frame.
 * They need to play at 14.4kbps (14400 bps) for proper timing, regardless of
 * the user's current modem speed setting.
 *
 * Detection criteria:
 * - High density of cursor positioning codes (\x1b[y;xH or \x1b[y;xf)
 * - Many ANSI escape sequences relative to content size
 *
 * @param content - Raw screen content
 * @returns true if content appears to be an ANSI animation
 */
function isAnsiAnimation(content: string): boolean {
  // Skip PETSCII files
  if (!content || content.length < 100) return false;

  // Count cursor positioning codes: ESC[y;xH or ESC[y;xf
  const cursorMoves = content.match(/\x1b\[\d+;\d+[Hf]/g) || [];
  const cursorMoveCount = cursorMoves.length;

  // Count all ANSI escape sequences
  const ansiCodes = content.match(/\x1b\[[0-9;?]*[A-Za-z]/g) || [];
  const ansiCount = ansiCodes.length;

  // Animation threshold: High density of cursor positioning
  // Typical animations have 50+ cursor moves per 1KB of content
  const contentKb = content.length / 1024;
  const cursorDensity = cursorMoveCount / Math.max(0.1, contentKb);
  const ansiDensity = ansiCount / Math.max(0.1, contentKb);

  // Consider it an animation if:
  // - High cursor positioning density (50+ per KB)
  // - OR very high overall ANSI density (100+ per KB) with some cursor moves
  const isAnimation = cursorDensity > 50 || (ansiDensity > 100 && cursorMoveCount > 10);

  if (isAnimation) {
    console.log(`[ANSI-ANIM] Detected animation: ${cursorMoveCount} cursor moves, ${ansiCount} total ANSI codes, ${content.length} bytes`);
    console.log(`[ANSI-ANIM] Density: ${cursorDensity.toFixed(1)} cursor/KB, ${ansiDensity.toFixed(1)} ANSI/KB`);
  }

  return isAnimation;
}

/**
 * Screen directory type - matches express.e:6544-6640
 * Each screen type uses a specific base directory
 */
/**
 * SAUCE metadata + encoding-aware decode + iCE colors transform live in
 * `utils/amiga-text-decode.util.ts` so bulletins/screens/help files share one
 * pipeline. The wrappers below preserve the original screen.handler call
 * sites; do not duplicate the decode logic here.
 */

function readScreenBuffer(filePath: string): Buffer {
  // Raw bytes (SAUCE stripped) — used by the PETSCII path. The cache hit
  // remains hot for subsequent decoded reads via readAmigaTextFile().
  return stripSauceMetadata(fileCache.readBuffer(filePath));
}

function readScreenTextWithMetadata(filePath: string): AmigaTextResult {
  return readAmigaTextFile(filePath);
}

function readScreenText(filePath: string): string {
  return readAmigaTextFile(filePath).text;
}

function readScreenWithTransforms(filePath: string): AmigaTextResult {
  return readAmigaTextFileWithTransforms(filePath);
}

/**
 * The charset a screen file's CHARACTERS were decoded from, in the two values
 * the wire encoder understands (TP-5). `readAmigaTextFile` also answers
 * `utf-8` for a `.seq`, which never reaches the ANSI transport, so it maps to
 * "no source charset" rather than to a third codec.
 */
function sourceCharsetOf(result: AmigaTextResult): 'cp437' | 'iso-8859-1' | undefined {
  return result.encoding === 'utf-8' ? undefined : result.encoding;
}

// Screen/MCI debugging: always log unless explicitly disabled
const SCREEN_DEBUG_ENABLED = process.env.SCREEN_DEBUG !== '0';
export const screenDebug = (...args: any[]) => {
  if (SCREEN_DEBUG_ENABLED) {
console.log('[SCREEN]', ...args);
  }
};
/**
 * Screens that are never paginated, however long they are: one piece of art
 * each, meant to run past the bottom of the glass. See needsPaging.
 */
const SCREENS_NEVER_PAGINATE = new Set(['AWAITSCREEN', 'BBSTITLE', 'LOGON', 'LOGOFF']);

/**
 * The catalogue name a screen is known by, whatever it was asked for as.
 *
 * `LOGOFF` joined the list above on 2026-09-14 and that alone did not fix it,
 * because the logoff screen on this board is one line - `~ ~3SR_WORK:bbs/
 * Screens/logoff/logoff` - and the art arrives through the INCLUDE. The
 * include is shown as a screen of its own, named by its resolved path
 * (`/app/data/bbs/Screens/logoff/001.logoff`), which matched nothing: the
 * board paused in the middle of the logo, the caller was already leaving, and
 * nobody was left to answer `More(y/n/ns)?`. That is the "cut off logoff
 * logo" the sysop reported four times.
 *
 * A logo included by a screen that is one piece of art is still that art, so
 * the name is reduced to its catalogue form before the lookup: the directory
 * goes, the extensions go, and the `NNN.` that `formatNumberedFilename` puts
 * on a random-pool member goes with them.
 */
export function screenCatalogueName(screenName: string): string {
  const base = screenName.split(/[\\/]/).pop() ?? screenName;
  return base
    // Only a SCREEN extension. `.[^.]+$` also ate the `.logoff` of a random
    // pool's `001.logoff` - the name the ~SR_ include asks for - leaving `001`,
    // which matched no exemption, so the tall goodbye screen paginated
    // (sysop, 2026-09-29).
    .replace(/\.(?:txt|ans|asc|seq|rip|ttx|tti|gr)$/i, '')
    .replace(/^[0-9]+\./, '')    // 001.logoff -> logoff
    .toUpperCase();
}

/**
 * DOES A DOOR EXITING MID-SCREEN OWE THE `~SP` PAUSE ITSELF?
 *
 * express.e:5555-5563 runs a `~CC_` inline and then carries on along the same
 * line to its `~SP`: one pause. Two ways a door can be running while a screen
 * has segments parked:
 *
 *   * launched by the inline walker (`~CC_gl` in the logon screen). The
 *     walker is awaiting the command; when the door returns it finishes the
 *     segment and processNextScreenSegment arms the boundary pause. If the
 *     door's exit ALSO armed one, the caller got two `Space To Resume` prompts
 *     back to back - the sysop's "double prompt", and the board's own trace:
 *     `site=door-exit` followed by `site=segment-resume` with no key between.
 *
 *   * launched by a command the caller typed (`J` joining a conference while
 *     a bulletin is half-shown). Nobody is coming back to finish anything, so
 *     the door's exit is the only place the pause can be armed - and without
 *     it the rest of the screen was dropped (a-conference-bulletin-is-shown-
 *     to-the-end) or drawn over the door's output with no pause (the global
 *     last-callers list, 2026-09-15).
 *
 *   * run by `runScreenCommands` - a screen's queued `~XI` door, run as the
 *     caller answers the pause it waited behind (`~XISUBSCAN` in this
 *     board's CONF_BULL). The runner's caller - the pagination input or
 *     processNextScreenSegment - draws the next segment itself the moment
 *     the door returns and arms the boundary after it. Arming here as well
 *     left a gate nobody saw: the segment was drawn straight over it, the
 *     join finished under it, and the menu waited for a key the caller was
 *     never asked for ("i have to press enter before reaching the main menu
 *     prompt", the sysop, 2026-09-25, joining C64 Demoscene).
 *
 * So: the door's exit owes the pause exactly when segments remain AND nobody
 * who launched it is going to arm it.
 */
export function doorExitOwesThePause(session: BBSSession): boolean {
  const segmentsRemain = (session.screenSegments?.segments.length ?? 0) > 0;
  const walkerWillArmIt = (session.inlineScreenCommandDepth ?? 0) > 0;
  const screenRunnerWillArmIt = !!session.executingScreenCommand;
  return segmentsRemain && !walkerWillArmIt && !screenRunnerWillArmIt;
}

/**
 * Run `continuation` once the screen just displayed is finished with.
 *
 * express.e's displayScreen returns only when the whole file has been shown,
 * `~SP` pauses included, so a command that draws a screen and then goes on
 * does so AFTER them. Here displayScreen shows the first segment and parks the
 * rest; the display flow and the join put up the prompt themselves, and a
 * command calling displayScreen directly has to as well - or it runs on while
 * the pause is still owed. The U command did: its interface cleared the screen
 * over the art AND over the pause prompt, which then sat waiting, invisible
 * ("en dold press return", the sysop, 2026-09-23; "there is no pause after
 * the screen when i press u", 2026-09-29).
 *
 * Returns true when the continuation was deferred to a pause, false when it
 * ran now (the screen had no pause left in it).
 */
export async function continueAfterScreen(
  socket: any,
  session: BBSSession,
  continuation: () => void | Promise<void>,
  site: string,
): Promise<boolean> {
  if (session.paginatedScreen) {
    session.paginatedScreen.onComplete = continuation;
    return true;
  }
  if (session.screenSegments && session.screenSegments.segments.length > 0) {
    (session.screenSegments as any).onComplete = continuation;
    if (armSegmentBoundaryPause(socket, session, site)) return true;
    session.screenSegments = undefined;
  }
  await continuation();
  return false;
}


/**
 * THE PAUSE A `~SP` BOUNDARY STANDS FOR.
 *
 * A boundary between two segments exists BECAUSE the screen had a `~SP`
 * there - that is what split it - so whenever segments remain, the caller is
 * owed exactly this prompt. express.e:5455-5461 stops at the `~SP` wherever
 * it falls.
 *
 * One definition, because there are two ways to arrive at a boundary and they
 * must be indistinguishable downstream: finishing a segment's text, and a
 * `~CC_` door in a segment exiting (`door.handler`). The door path used to
 * render the NEXT segment instead of pausing, which spent the boundary
 * silently - "global last callers is missing a pause prompt" (sysop,
 * 2026-09-15): `~CC_gl ~SP` ran the door and the next segment wiped its
 * output with nothing in between.
 *
 * @returns true when a pause was armed, false when no segments remain and the
 *          screen is simply over.
 */
export function armSegmentBoundaryPause(
  socket: any,
  session: BBSSession,
  site: string = 'segment-boundary',
): boolean {
  const segState = session.screenSegments;
  if (!segState || segState.segments.length === 0) return false;

  /*
   * ONE PROMPT PER BOUNDARY, whoever gets here first.
   *
   * A boundary is a place in the screen, not an event, so it owes exactly one
   * `Space To Resume` no matter how many owners believe they must arm it. Two
   * of them can reach this for the SAME boundary: a `~CC_` door in a segment
   * arms one as it exits (`door-exit`), and `processNextScreenSegment`, which
   * is the frame that ran that door, arms one the moment `runScreenCommands`
   * returns (`segment-resume`). The board's own trace, live 2026-09-15:
   *
   *   site=door-exit      ... segments=3 subState=display_bull
   *   site=segment-resume ... segments=3 subState=display_bull   (2ms later)
   *
   * and the caller saw two prompts stacked under the global last-callers list.
   * `doorExitOwesThePause` only knew about the INLINE walker as an owner, so
   * the segment runner - a second one - was invisible to it.
   *
   * AN INSTALLED GATE - OF ANY KIND - IS THIS BOUNDARY'S PAUSE: a gate is
   * cleared the instant it is answered (handlePaginationInput), so finding one
   * here means the prompt is on the caller's screen right now, unanswered.
   * Arming a second is the duplicate. Returning true is what the first arm
   * returned - the caller stops and waits, which is what it must do either way.
   *
   * THIS ONCE READ `kind === 'doPause'`, AND THE OTHER KIND COST A SCREEN.
   *
   * A `bbs` gate is a screen the caller is halfway through: it holds the rest
   * of its `lines`, its queued `commands` and its `onComplete`. Arming here
   * ASSIGNS `session.paginatedScreen`, so every one of those was thrown away
   * and replaced by a gate whose content is `['']` - the caller lost every
   * page after the one in front of him, and the commands that screen was
   * going to run never ran.
   *
   * It is also already covered. Answering a `bbs` gate leads back here by
   * itself: the pagination-finished branch below (`if (!hasMore)`) checks
   * `session.screenSegments` and calls `processNextScreenSegment`, which arms
   * the next boundary. So there was never a boundary to protect by arming
   * over it - only a screen to destroy.
   *
   * The sysop's upload, live 2026-09-15:
   *
   *   site=door-exit lastScreenHadPause=Y paginated=Y segments=1
   *                  subState=process_command
   *
   * `door-exit` rather than `door-exit-already-armed` is the proof the gate
   * walked over was not a `doPause` one, and he met `FileName 1: ace To
   * Resume:` - a filename prompt written across the tail of a `Space To
   * Resume:` that should never have been printed.
   *
   * WHAT COUNTS AS A GATE HERE IS ONE WITH SOMETHING LEFT TO SHOW, and that
   * qualifier is load-bearing rather than defensive. A `bbs` gate whose pages
   * are all spent (`nextIndex` at the end of `lines`) is not a screen anyone
   * is still reading - it is an answered prompt waiting to be cleared - and
   * suppressing on it WOULD lose the prompt the boundary genuinely owes
   * (`a-boundary-owes-exactly-one-pause`, "does not swallow a pause while a
   * More(y/n/ns) gate is up"). So the test is what the caller can still see:
   * pages pending, or a `doPause` gate, whose one blank line is never
   * "pending" by that measure and so is named outright.
   */
  const gate = session.paginatedScreen;
  const theCallerIsStillReadingIt = !!gate
    && (gate.kind === 'doPause' || gate.nextIndex < gate.lines.length);
  if (theCallerIsStillReadingIt) {
    return true;
  }

  /*
   * EVERY `~SP` IS A PAUSE (express.e:5455-5460: doPause, whatever follows).
   *
   * A trailing one after blank rows used to be skipped as "leading to
   * nothing" (2026-09-23). It leads to what the COMMAND draws next: the
   * board's `Conf1/uploadmsg.txt` ends in one so the art is seen before the
   * upload interface clears it. The "hidden press return" that prompted the
   * skip was that interface clearing over a pause it had not waited for -
   * fixed where it lives, in continueAfterScreen.
   */
  session.paginatedScreen = {
    lines: [''],  // No additional content, just hold for a key
    nextIndex: 1,
    pageSize: 1,
    eventName: segState.eventName,
    commands: [],
    kind: 'doPause',
  };
  session.lastScreenHadPause = true;
  // Same reason as `doPause`: this prompt lands between two chunks of the
  // SAME `.seq`, so the model must see the rows it moves through - which
  // the transport choke guarantees for every emit on this socket.
  emitPrompt(socket, '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');
  return true;
}

/**
 * IS A PAUSE PROMPT ALREADY ON THE CALLER'S SCREEN?
 *
 * An installed `doPause` gate means the prompt has been written and not yet
 * answered - `handlePaginationInput` clears the gate the moment a key arrives,
 * so finding one here means the caller is looking at it right now.
 *
 * Four places emit `(Pause)...Space To Resume:` and each decides for itself.
 * On this board's logon screen, `doPause` and `displayScreen-B` both fired for
 * `Screens/flt/003.flt` - the first while `paginated=N`, before the gate
 * existed and before the art had flushed - so the caller got a prompt through
 * the middle of the logo and another after it (sysop, 2026-09-15, with the
 * board's own trace naming both emitters).
 *
 * This suppresses the second PROMPT only. The gate the caller is answering is
 * left exactly as it was, and nothing about which gate gets installed changes -
 * an early return there would drop a screen's queued commands, which is a
 * continuation rather than a decoration and a far worse bug than a doubled
 * prompt.
 */
export function aPausePromptIsShowing(session: any): boolean {
  return session?.paginatedScreen?.kind === 'doPause';
}




const SCREEN_FLOW_SCREENS = new Set([
  'AWAITSCREEN',
  'BBSTITLE',
  'LOGON',
  'BULL',
  'NODE_BULL',
  'CONF_BULL',
  'MENU',
]);
const screenFlowLog = (screenName: string, ...args: any[]) => {
  if (SCREEN_FLOW_SCREENS.has(screenName.toUpperCase())) {
console.log('[SCREEN FLOW]', ...args);
  }
};

// Modem emulation: classic speeds in bits per second
const MODEM_SPEEDS = [
  1200,
  2400,
  4800,
  7200,
  9600,
  12000,
  14400,
  16800,
  19200,
  21600,
  24000,
  28800,
  33600,
  56000,
];
function resolveModemBps(session: BBSSession): number {
  const preferred = session.modemBps || session.user?.baud || 0;
  if (preferred <= 0) return 0; // 0/undefined = full speed
  if (MODEM_SPEEDS.includes(preferred)) {
    return preferred;
  }
  // Snap to closest classic speed
  let closest = 56000;
  let minDelta = Number.MAX_SAFE_INTEGER;
  for (const s of MODEM_SPEEDS) {
    const d = Math.abs(s - preferred);
    if (d < minDelta) {
      minDelta = d;
      closest = s;
    }
  }
  return closest;
}

interface Conference {
  id: number;
  name: string;
}

// This will be injected from index.ts
let conferences: Conference[] = [];

export function setConferences(confs: Conference[]) {
  conferences = confs;
}

/** The injected conference list, read by the shared MCI pre-passes. */
export function getConferences(): Conference[] {
  return conferences;
}

/**
 * Is this caller served PETSCII ART - the hand-drawn `.seq` screens?
 *
 * A `.seq` is 40 columns wide by definition: a C64 screen the sysop drew
 * cell by cell. There is no fold that makes one 80 columns without
 * stretching it or leaving half the screen empty, so an 80-column PETSCII
 * caller is served the ordinary ANSI screen instead - which costs him
 * nothing, because the transducer turns it into PETSCII on the wire exactly
 * as it does every other byte the board sends him.
 *
 * The same sentence a door's `<name>_C64` files already follow
 * (xim/io-file-display.ts): art named for the C64's screen is 40 columns
 * wide, and an 80-column caller gets the ordinary file. 80-column `.seq` art
 * is a sysop commission, not something this resolver can invent.
 *
 * ONE predicate, because the choice is made in two places - the extension
 * order in loadScreenFile's variant list, and resolveAlphabetTwin, which
 * swaps a resolved `.txt` for its `.seq` neighbour. A caller who passed the
 * first and failed the second would be served the art anyway.
 */
export function servesPetsciiArt(session: { petsciiMode?: boolean; petsciiColumns?: number } | null | undefined): boolean {
  return session?.petsciiMode === true && petsciiColumnsOf(session) === C64_COLUMNS;
}

/**
 * The caller's own copy of a file named outright: the `.seq` twin for a
 * caller served PETSCII art, the `.tti` (when it really is packets) or `.ttx`
 * twin for a teletext caller. A file a screen pulls in by name -
 * `~SS_BBS:screens/uprough.txt` in the logon screen - reached a teletext
 * caller as its ANSI drawing (sysop, 2026-10-05: "the up rough ansi is not
 * teletext").
 */
function resolveAlphabetTwin(originalPath: string, session: any): string {
  const parsed = path.parse(originalPath);
  // The directory as the disk spells it: an include names it as the screen
  // was written (`BBS:screens/uprough.txt`), the live volume is
  // case-sensitive and holds `Screens/`, and a twin looked for in a
  // directory that does not exist is never found.
  parsed.dir = amigafs.resolvePath(parsed.dir) ?? parsed.dir;
  if (servesPetsciiArt(session)) {
    if (isPetsciiSeqFile(originalPath)) return originalPath;
    const seqCandidate = findCaseInsensitive(parsed.dir, `${parsed.name}.seq`);
    if (seqCandidate) {
      screenDebug(`[loadScreenFile] PETSCII variant preferred: ${originalPath} -> ${seqCandidate}`);
      return seqCandidate;
    }
    return originalPath;
  }
  if (session?.texttvMode === true) {
    if (isTeletextFile(originalPath) || isNativeTtiName(originalPath)) return originalPath;
    const tti = findCaseInsensitive(parsed.dir, `${parsed.name}.tti`);
    const twin = (tti && tryNativeTtiFile(tti) !== null ? tti : null)
      ?? findCaseInsensitive(parsed.dir, `${parsed.name}.ttx`);
    if (twin) {
      screenDebug(`[loadScreenFile] teletext variant preferred: ${originalPath} -> ${twin}`);
      return twin;
    }
  }
  return originalPath;
}

/**
 * The screen-file extensions this BBS knows.
 *
 * A name that ALREADY ends in one is not a stem waiting for an extension -
 * it is a stem whose extension has to be SWAPPED when that file is missing.
 * `~SR_WORK:bbs/Screens/logoff/logoff.seq` is the shipped case:
 * `formatNumberedFilename` turns it into `001.logoff.seq`, only
 * `001.logoff.txt` exists on disk, and every variant probed
 * `001.logoff.seq.seq`, `001.logoff.seq.txt`, ... - so the include silently
 * resolved to nothing (plan Task 7).
 */
const SCREEN_EXTENSION_RE = /\.(seq|txt|rip|tti|ttx)$/i;

/** `001.logoff.seq` -> `001.logoff`; `MENU` -> `MENU` (unchanged). */
function stripScreenExtension(name: string): string {
  return name.replace(SCREEN_EXTENSION_RE, '');
}

/**
 * Check if a file is a RIP graphics file
 * express.e:6765 - StriCmp(extension,'.rip')
 */
function isRipFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.rip';
}

/**
 * Check if a file is an ANSI teletext screen (WEB_: T answer at the
 * graphics prompt). ANSI bytes like .txt - the web terminal's TDAText
 * face does the work - so the display path needs no branch for it; the
 * loader prefers it the way it prefers .seq/.rip, and displayScreen
 * serves it as ANSI. Native packet-level .tti is NOT this: it gets its
 * own predicate and renderer when native support lands.
 */
function isTeletextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.ttx';
}

/** Name check for native packet screens; content validation happens in tryNativeTtiFile. */
function isNativeTtiName(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.tti';
}

/**
 * Read, validate and render a native .tti file in one go for the loader
 * arms above. Null when anything is off (missing, not packets,
 * unrenderable) - every caller falls through to .ttx/.txt on null, never
 * serving packet bytes raw. Exported for the render-contract tests.
 */
export function tryNativeTtiFile(absPath: string): NativeRender | null {
  let text: string;
  try {
    text = fs.readFileSync(absPath, 'latin1');
  } catch {
    return null;
  }
  if (!looksNativeTti(text)) return null;
  return renderNativeTti(text);
}

function getConferenceScreensCandidates(baseDir: string, relConfNum: number): Array<{ dir: string; desc: string }> {
  // reference-board data uses unpadded ConfX; avoid padded variants to prevent Conf01 creation
  // The directory LOCATION.n names, not `Conf<n>`: on a renumbered board the
  // conference in position 1 lives in Conf2/, and MENU would go missing.
  const names: string[] = [path.basename(conferenceDir(baseDir, relConfNum))];

  const results: Array<{ dir: string; desc: string }> = [];
  const seen = new Set<string>();

  for (const name of names) {
    const confRootDir = path.join(baseDir, name);
    if (!seen.has(confRootDir)) {
      results.push({ dir: confRootDir, desc: `${name}` });
      seen.add(confRootDir);
    }
    const confScreensDir = path.join(baseDir, name, 'Screens');
    if (!seen.has(confScreensDir)) {
      results.push({ dir: confScreensDir, desc: `${name}/Screens` });
      seen.add(confScreensDir);
    }

  }

  return results;
}

// Screens that should start with a full clear (express.e shows a blank frame first)
// NOTE: BBSTITLE is intentionally NOT in this list - express.e clears screen at START
// of processLogon (line 29477), then displays BBSTITLE without clearing (line 29552),
// and login prompts appear below with just a newline (line 29571).
const SCREENS_REQUIRE_CLEAR = new Set([
  'BBSTITLE',
  'LOGON',
  'BULL',
  'NODE_BULL',
  'CONF_BULL',
  'MENU',
  'LOGOFF',
  'JOIN',
  'JOINED',
  // WEB_: ONENODE is a small centered box, not full-screen art - without a
  // clear the BBSTITLE and login prompts it interrupts bleed through around
  // it (sysop screenshot, T mode). express.e:29715-29727 shows it with no
  // clear; the sysop directed the clear.
  'ONENODE',
]);

/**
 * Parse MCI codes in screen content
 * Replaces AmiExpress MCI variables like %B, %CF, %U, etc.
 *
 * @param content - Screen file content with MCI codes
 * @param session - Current BBS session
 * @param bbsName - BBS name for %B variable
 * @param sysopName - Sysop name for %S variable
 * @param location - BBS location for %L variable
 * @returns Parsed content with MCI codes replaced
 */

// ============================================================
// Inline-mode sentinels — NUL-delimited markers emitted by the MCI
// tokenizer dispatch when running for a live socket. The post-
// tokenizer walker splits on them, emits the surrounding text, and
// applies side effects (CLS, pause, command exec, file display) in
// document order. NUL bytes never appear in real BBS content
// (textual ASCII / ANSI sequences, no null terminators), so they're
// a safe in-band marker that survives across pendingInlineContent
// resume boundaries (the resumed content is run through the
// tokenizer again — sentinels look like plain text since they
// contain no `~`).
//
// Format: `\x00<TYPE>[:<args>]\x00`. Args grammar per type:
//   F        — clear screen, no args
//   SP       — pause, no args
//   CC:cmd   — run command (cmd may contain spaces)
//   SS:file  — displayScreen(file)
//   SR:max|path — random numbered file from path, max=count or -1
// ============================================================
// Defined once in mci-dispatch.ts: the dispatch entries and the pre-passes
// emit them, the walker below consumes them by their bare payload ('F',
// 'SP', 'CC:', ...), so no name is needed here any more.
// Sentinel scanning uses indexOf (NOT a /g regex) because the walker
// awaits async side effects that can recursively re-enter
// parseMciCodes (e.g. SS sentinel → displayScreen → inner
// parseMciCodes). A module-level /g regex would have its lastIndex
// clobbered by the inner call, causing the outer walker to restart
// from the top and re-process the same sentinel forever.

/**
 * The codes the tokenizer itself substitutes, observed from the real maps.
 *
 * Recorded the first time `parseMciCodes()` runs, from `Object.keys()` of the
 * dispatch objects that were actually built - NOT from a list kept beside them.
 * A second list is the drift this file's tokenizer header already warns about,
 * and `tests/screens/mci-catalog.test.ts` checks the catalog against THIS.
 *
 * Empty until the first parse; a caller that needs it drives one screen first.
 */
let observedDispatchKeys: string[] | null = null;

/** The dispatch keys the last parse built, or `[]` before any parse has run. */
export function mciDispatchKeys(): string[] {
  return observedDispatchKeys ? [...observedDispatchKeys] : [];
}

/**
 * Include-recursion cap for `~SS_` and `~SR_`.
 *
 * There was NO guard here before plan Task 7 - not on the PETSCII path and
 * not on the ANSI one. A screen whose include names itself (or any `~SS_` /
 * `~SR_` cycle) recursed through `displayScreen` -> `parseMciCodes` ->
 * this walker until the stack blew. express.e has no guard either because
 * its screens are hand-written data; ours are editable from the config app.
 */
const MAX_SCREEN_INCLUDE_DEPTH = 8;

/**
 * The depth counter lives on the session (one caller, one nesting) and is
 * declared structurally so `BBSSession` in the 2000-line `src/index.ts` does
 * not have to change for it.
 */
type ScreenIncludeDepthHolder = { screenIncludeDepth?: number };

/**
 * Display an included screen (`~SS_`, `~SR_`) under the depth cap. Over the
 * cap nothing is emitted - a truncated screen beats a crashed node.
 *
 * A missing include is silent. express.e:6773 displayFile shows a file only
 * when Open succeeds and has no else branch, so neither `~SS_` nor `~SR_`
 * alerts anyone. The board used to raise "Screen not found:
 * BBS:bulletins/bull9.txt" to the sysop mid-join (2026-09-27).
 */
async function displayIncludedScreen(
  socket: any,
  session: BBSSession,
  target: string,
): Promise<boolean> {
  const holder = session as unknown as ScreenIncludeDepthHolder;
  const depth = holder.screenIncludeDepth ?? 0;
  if (depth >= MAX_SCREEN_INCLUDE_DEPTH) {
    screenDebug(
      `[MCI] include depth cap (${MAX_SCREEN_INCLUDE_DEPTH}) reached - refusing ${target}`,
    );
    return false;
  }
  holder.screenIncludeDepth = depth + 1;
  // An include that resolves to a `.TXT` draws in ANSI (`displayScreen`'s
  // text arm) while the host screen is PETSCII. The transport choke watches
  // it for free (`utils/petscii-session-model.ts`), so nothing is installed
  // here any more; what remains is the ORDERING the `.seq` depends on.
  try {
    const before = session.paginatedScreen;
    const shown = await displayScreen(socket, session, target, false, /* silent */ true);
    /*
     * AN INCLUDE THAT PAGES HOLDS THE SCREEN THAT INCLUDED IT.
     *
     * express.e's displayFile stops inside its own checkForPause, so the host
     * screen goes on only after the caller answers the More. Here the include
     * installed its gate and returned, and the host drew the rest of its
     * segment straight under the prompt: LOGON's `~SS_quicknew.txt` paged at
     * 25 lines and the art after it landed below "(Pause)...More(y/n/ns)?",
     * with the board then waiting on a prompt the caller could not see
     * (walked over telnet, 2026-09-27). Wait for the gate to finish - Y, NS
     * or N - before going on.
     */
    const gate = session.paginatedScreen;
    if (shown && gate && gate !== before && gate.kind === 'bbs' && gate.nextIndex < gate.lines.length) {
      gate.include = true;
      const after = gate.onComplete;
      await new Promise<void>((resolve) => {
        gate.onComplete = async () => {
          try { if (after) await after(); } finally { resolve(); }
        };
      });
    }
    return shown;
  } finally {
    // An include that took the ANSI arm may still be sitting in the output
    // buffer (`emitText`'s 16 ms batch). Draining it HERE keeps two things
    // in document order that a `.seq` depends on: the bytes on the wire,
    // and the model's view of where the include left the cursor - the
    // chunks after this point are encoded against it.
    flushOutput(socket);
    holder.screenIncludeDepth = depth;
  }
}

/**
 * How the inline sentinel walker puts bytes on the wire.
 *
 * ONE walker serves both flavours (plan Task 7): the ANSI path
 * (`parseMciCodes`) and the PETSCII `.seq` path (`emitPetsciiScreenInline`)
 * differ ONLY in how a run of screen text and a screen clear are encoded -
 * never in the document-order flow, and never in the side effects.
 */
interface InlineSentinelHooks {
  /**
   * Emit the text between two sentinels. `start` is its offset in `parsed`
   * so a PETSCII caller can rebase its substitution spans onto the chunk.
   * Returns true when anything went out.
   */
  emitChunk: (chunk: string, start: number) => boolean;
  /** express.e:5469-5471 sendCLS(), for the inline `~f` sentinel. */
  emitCls: () => void;
  /** The full-screen clear `~SR_` sends before drawing its art file. */
  emitClsBeforeRandomFile: () => void;
  /**
   * Sentinels this walker must NOT split on: they are the chunk renderer's
   * business (the PETSCII `~x`/`~y` MOVE walk and pre-pass-generated text,
   * both of which are resolved positionally while the chunk is encoded).
   */
  isChunkSentinel?: (payload: string) => boolean;
}

interface InlineSentinelWalkResult {
  inlineEmitted: boolean;
  hasPause: boolean;
  /** Set ONLY when a `~SP` stopped the walk: the unprocessed remainder. */
  pendingInlineContent?: string;
}

/**
 * The inline sentinel walker.
 *
 * express.e:5768-5802 processMci() iterates through content sequentially,
 * emitting text-before each MCI code, then running the side effect, then
 * continuing. We achieve the same flow post-tokenizer: the inline-only
 * dispatch entries replaced each side-effecting code with a NUL-delimited
 * sentinel, so we walk `parsed` splitting on those, emitting the surrounding
 * text chunks (in document order) and applying side effects (CLS / pause /
 * cmd / displayFile / random file) as they appear.
 *
 * `~SP` stops the walk with `pendingInlineContent` set: the rest of the
 * post-tokenizer string, sentinels and all. When the pagination state machine
 * resumes, `displayScreen` calls back with that content. The tokenizer pass
 * is idempotent for already-substituted text - no `~` left for it to consume
 * - and the sentinels look like plain bytes to the tokenizer (no `~`), so
 * they ride through to the next walk intact.
 */
async function walkInlineSentinels(
  socket: any,
  session: BBSSession,
  parsed: string,
  hooks: InlineSentinelHooks,
): Promise<InlineSentinelWalkResult> {
  const { processCommand } = require('./command.handler');
  let inlineEmitted = false;

  // indexOf-based scanner (see SENTINEL_REGEX_SOURCE comment above —
  // a stateful /g regex would be clobbered by recursive
  // parseMciCodes calls from inside the SS_/SR_ handlers).
  //
  // Two cursors, not one: `lastIndex` is where the current text chunk STARTS,
  // `scan` is where to look for the next sentinel. They differ only while
  // stepping over a sentinel the chunk renderer owns (`isChunkSentinel`),
  // which travels inside the chunk instead of breaking it.
  let lastIndex = 0;
  let scan = 0;
  while (true) {
    const startNul = parsed.indexOf('\x00', scan);
    if (startNul < 0) break;
    const endNul = parsed.indexOf('\x00', startNul + 1);
    if (endNul < 0) break;
    const sentinel = parsed.substring(startNul + 1, endNul);

    if (hooks.isChunkSentinel?.(sentinel)) {
      scan = endNul + 1;
      continue;
    }

    // express.e:5793-5794 — emit text BEFORE the side effect.
    if (hooks.emitChunk(parsed.substring(lastIndex, startNul), lastIndex)) {
      inlineEmitted = true;
    }
    lastIndex = endNul + 1;
    scan = lastIndex;

    if (sentinel === 'F') {
      // express.e:5469-5471 — sendCLS()
      hooks.emitCls();
      inlineEmitted = true;
      screenDebug('[MCI] Sentinel: ~f sendCLS()');
      continue;
    }

    if (sentinel === 'SP') {
      // express.e:5455-5461 — doPause(). Stop here, return the
      // unprocessed remainder so the pause state machine can
      // resume the rest of the screen after keypress.
      const remainingParsed = parsed.substring(lastIndex);
      screenDebug('[MCI] Sentinel: ~SP — pausing, ' + remainingParsed.length + ' bytes pending');
      return { inlineEmitted: true, hasPause: true, pendingInlineContent: remainingParsed };
    }

    if (sentinel.startsWith('CC:')) {
      // express.e:5555-5563 — processSysCommand()
      const commandStr = sentinel.substring(3).trim();
      const spacePos = commandStr.indexOf(' ');
      const cmdCode = spacePos >= 0 ? commandStr.substring(0, spacePos) : commandStr;
      const cmdParams = spacePos >= 0 ? commandStr.substring(spacePos + 1) : '';
      const subStateBeforeInlineCmd = session.subState;
      // Save subState so any door launched here (68K or TS) can't
      // clobber it. Door executors set DOOR_RUNNING and may not
      // restore it on early exit.
      // This walker finishes the segment when the command returns, and arms
      // the `~SP` boundary pause itself. Say so, so a door exiting in here
      // does not arm a second one - see doorExitOwesThePause.
      session.inlineScreenCommandDepth = (session.inlineScreenCommandDepth ?? 0) + 1;
      let result: unknown;
      // What the screen drew before the code - text, a `~f` clear - sits in
      // the batching buffer, and a door writes straight to the socket. Out it
      // goes first, or the door draws and the clear lands on top of it (Conf2's
      // `~f` + `~CC_ctop`: an empty screen and a lone pause, 2026-09-29).
      flushOutput(socket);
      try {
        result = await processCommand(socket, session, cmdCode, cmdParams, true);
      } finally {
        session.inlineScreenCommandDepth = Math.max(0, (session.inlineScreenCommandDepth ?? 1) - 1);
      }
      if (session.subState !== subStateBeforeInlineCmd) {
        session.subState = subStateBeforeInlineCmd;
      }
      screenDebug('[MCI] Sentinel: ~CC_ ' + commandStr + ' → ' + result);
      inlineEmitted = true;
      continue;
    }

    if (sentinel.startsWith('SS:')) {
      // express.e:5496-5504 — displayFile()
      const filename = sentinel.substring(3).trim();
      screenDebug('[MCI] Sentinel: ~SS_ displayFile: ' + filename);
      await displayIncludedScreen(socket, session, filename);
      inlineEmitted = true;
      continue;
    }

    if (sentinel.startsWith('SR:')) {
      // express.e:5533-5554 — display random numbered file.
      // Sentinel format: SR:<width>|<basePath>. width=-1 means
      // "no width prefix" (caller's default of 99 applies).
      const body = sentinel.substring(3);
      const pipePos = body.indexOf('|');
      const widthRaw = pipePos >= 0 ? body.substring(0, pipePos) : '';
      let basePath = (pipePos >= 0 ? body.substring(pipePos + 1) : body).trim();
      const widthVal = parseInt(widthRaw, 10);

      if (basePath.includes(':')) {
        const { config: cfgMod } = require('../config');
        const baseDir = cfgMod.getConfig().dataDir;
        const colonIdx = basePath.indexOf(':');
        const assign = basePath.substring(0, colonIdx).toUpperCase();
        const subpath = basePath.substring(colonIdx + 1);
        if (assign === 'WORK' || assign === 'BBS') {
          let resolvedSubpath = subpath;
          if (resolvedSubpath.toLowerCase().startsWith('bbs/')) {
            resolvedSubpath = resolvedSubpath.substring(4);
          }
          basePath = path.join(baseDir, resolvedSubpath);
        } else if (assign === 'SCREENS') {
          basePath = path.join(baseDir, 'Screens', subpath);
        }
      }

      const maxCount = Math.max(1, Number.isFinite(widthVal) && widthVal > 0 ? widthVal : 99);
      const randomNum = Math.floor(Math.random() * maxCount) + 1;
      const randomFile = formatNumberedFilename(basePath, randomNum);
      screenDebug('[MCI] Sentinel: ~SR_ selected: ' + randomFile);
      // ~SR_ always shows a full-screen art file — clear before
      // drawing so previous door output doesn't bleed through.
      hooks.emitClsBeforeRandomFile();
      /*
       * A POOL WITH A GAP IS NOT AN ERROR. express.e:5550-5552 asks
       * findSecurityScreen and displays what it finds - a number the roll
       * lands on with no file behind it shows nothing and says nothing. This
       * alerted the sysop instead, on every third logoff once
       * `Screens/logoff/001.logoff.txt` had been deleted from a `~3SR_` pool
       * (the sysop, 2026-09-27: "Screen not found: .../logoff/001.logoff").
       */
      await displayIncludedScreen(socket, session, randomFile);
      inlineEmitted = true;
      continue;
    }

    // Unknown sentinel type — emit nothing, log for visibility.
    screenDebug('[MCI] Sentinel: unknown type ' + JSON.stringify(sentinel));
  }

  // Emit any tail text after the last sentinel (or all of it if
  // no sentinels were found).
  if (hooks.emitChunk(parsed.substring(lastIndex), lastIndex)) {
    inlineEmitted = true;
  }

  // Reaching the tail means no `~SP` was seen: the ONLY pause exit is the
  // early return above, which carries the remainder with it.
  return { inlineEmitted, hasPause: false };
}


/**
 * Parse MCI codes and return both parsed content and commands to execute
 * Returns tuple: [parsedContent, commandsToExecute]
 * NOTE: This is async to fetch message base and file area data from database
 */
export async function parseMciCodes(
  content: string,
  session: BBSSession,
  bbsName: string = 'AmiExpress-Web',
  sysopName: string = 'Sysop',
  location: string = 'The Internet',
  socket?: any,  // When provided, execute inline (express.e outdata=NIL mode)
  options?: {
    /**
     * How many levels of `~SS_`/`~SR_` include to expand on the `{{DISPLAY_FILE}}`
     * (socket-less) path. Undefined means `MAX_SCREEN_INCLUDE_DEPTH` - the SAME
     * bound the inline walker's `displayIncludedScreen` uses, so a
     * self-referential sysop screen is stopped whichever include mechanism
     * runs it.
     *
     * This was once `Infinity`, on the reasoning that the board is always
     * bounded by the inline walker and only the preview needs a cap. That
     * held until a WIPE screen: a wipe disables inline mode on the board
     * (`mciSocket = undefined`, below), so a board render whose first line is a
     * wipe code AND names itself via `~SS_` took this path with no bound and
     * recursed until the process died. Defaulting to the inline cap closes it.
     *
     * The admin's preview still passes an explicit `1` (a preview renders a
     * screen nobody approved yet, on a request from a browser, so its include
     * chain is a walk over paths the requester chose).
     */
    includeDepth?: number;
  }
): Promise<{ parsed: string; commands: string[]; hasPause: boolean; slowmo?: number; slowmoCount?: number; inlineEmitted?: boolean; pendingInlineContent?: string }> {
  const includeDepth = options?.includeDepth ?? MAX_SCREEN_INCLUDE_DEPTH;
  let parsed = content;
  const commandsToExecute: string[] = [];
  let hasPause = false;
  const inlineMode = socket !== undefined;  // True = execute inline, False = build string
  let inlineEmitted = false;  // Track if content was emitted inline (skip frame buffer later)
  // slowmo / slowmoCount are owned by applyMciPrePasses (~SMO| / ~SMC|); the
  // applied pair below is what this function returns.
  // Files to display (~SS_, ~SX_, ~SR_) collected during the pre-
  // tokenizer pass and substituted later. Inline mode handles these
  // via sentinel dispatch + walker; non-inline emits
  // `{{DISPLAY_FILE:N}}` placeholders that get replaced after MCI
  // parsing completes.
  const filesToDisplay: string[] = [];

  // Helper: formatBytes imported from '../utils/byte-format.util'
  const formatBytes = formatBytesUtil;

  // ONE pre-pass pipeline, shared with the PETSCII `.seq` renderer (plan
  // Task 4b). Twenty side-effecting MCI rows are consumed here, before the
  // tokenizer sees the text; `flavour: 'ansi'` is today's bytes, pinned by
  // tests/handlers/mci-pre-passes.test.ts.
  const pre = await applyMciPrePasses(parsed, session, {
    flavour: 'ansi',
    inlineMode,
    sentinels: MCI_SENTINELS,
  });
  parsed = pre.text;
  const mciTerminator = pre.terminator;
  commandsToExecute.push(...pre.commandsToExecute);
  filesToDisplay.push(...pre.filesToDisplay);
  if (pre.hasPause) {
    hasPause = true;
  }
  const slowmoApplied = pre.slowmo;
  const slowmoAppliedCount = pre.slowmoCount;

  // Get user data safely
  const user = session.user || {};
  const username = user.username || 'Guest';

  // Date/Time setup. Only the legacy `%D` / `%T` codes at the bottom of this
  // function still need these; every ~code that reads the clock closes over
  // buildMciDispatch's own copy.
  const now = getSystemTime();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[now.getDay()];
  const day = String(now.getDate()).padStart(2, '0');
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  // fullDateTime uses current time (used by legacy % codes)
  const fullDateTime = `${dayName} ${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  // timeStr = current time (used by legacy %T)
  const timeStr = `${hours}:${minutes}:${seconds}`;

  // Process multi-character MCI codes FIRST to avoid collisions


  // User Information + System Info Codes (express.e:5290-5410)
  // Routed through the 1:1 processMci tokenizer port. The previous
  // regex pipeline required an explicit `|` terminator (`~N|`); real
  // express.e accepts space OR `|` OR end-of-line as the terminator,
  // so screens like Logon24hrs.txt's `~N.` produced wrong output.
  // The tokenizer also handles fall-through behaviour: unknown codes
  // leave the suffix as plain text instead of preserving the `~`.

  // ONE dispatch table, built in mci-dispatch.ts and shared with the PETSCII
  // `.seq` renderer (plan Task 4). `flavour: 'ansi'` is today's values byte
  // for byte, pinned by tests/handlers/mci-dispatch-ansi-pin.test.ts.
  const {
    dispatch: userInfoDispatch,
    prefixDispatch,
    state: dispatchState,
  } = await buildMciDispatch(session, {
    flavour: 'ansi',
    inlineMode,
    sentinels: MCI_SENTINELS,
    now,
  });

  // Record what the tokenizer can substitute, once per process. Non-inline
  // mode only: the inline branch inside buildMciDispatch ADDS ~CC_/~SS_/~SR_
  // sentinel emitters to prefixDispatch, and those are caller-handled codes in
  // every other sense - counting them here would say the tokenizer owns them.
  if (!observedDispatchKeys && !inlineMode) {
    observedDispatchKeys = [...Object.keys(userInfoDispatch), ...Object.keys(prefixDispatch)];
  }


  // Strict fall-through, byte-exact case (both modes). express.e:
  // 5290-5402 ELSEIF chain has no final ELSE — unmatched cmds have
  // their `~` consumed and the cmd content emits as plain text.
  // Inline-mode side-effecting codes (~CC_/~SS_/~SR_/~SP/~f) ride
  // through the dispatch as NUL-delimited sentinels (see
  // SENTINEL_* constants above) rather than staying intact for a
  // separate regex pass.
  parsed = processMciTokenizer(
    parsed,
    {
      dispatch: userInfoDispatch,
      prefixDispatch,
      softFallThrough: false,
      caseSensitive: true,
    },
    mciTerminator,
  );

  // `~SP` (no width prefix) sets the pause flag from inside the dispatch;
  // the table now owns that flag, so fold it back into the local one the
  // pre-passes and the inline walker also write.
  if (dispatchState.hasPause) {
    hasPause = true;
  }

  // ~q (reset, express.e:5571-5573) and ~h (backspace, express.e:5574-5576)
  // are dispatched via the tokenizer above (Q / H entries in
  // userInfoDispatch).

  // === INLINE MODE: SENTINEL WALKER ===
  // express.e:5768-5802 processMci() iterates through content
  // sequentially, emitting text-before each MCI code, then running
  // the side effect, then continuing. We achieve the same flow
  // post-tokenizer: the inline-only dispatch entries above replaced
  // each side-effecting code with a NUL-delimited sentinel, so we
  // walk `parsed` splitting on those, emitting the surrounding text
  // chunks via emitText (in document order), and applying side
  // effects (CLS/pause/cmd/displayFile/random file) as they appear.
  //
  // ~SP triggers an early-return with `pendingInlineContent`
  // populated: the rest of the post-tokenizer string (sentinels and
  // all). When the pagination state machine resumes, displayScreen
  // calls back into parseMciCodes with that content. The tokenizer
  // pass is idempotent for already-substituted text — no `~` left
  // for it to consume — and the sentinels look like plain bytes to
  // the tokenizer (no `~`), so they ride through to the next walk
  // intact.
  if (inlineMode) {
    const walk = await walkInlineSentinels(socket, session, parsed, {
      emitChunk: (chunk) => {
        if (chunk.length === 0) return false;
        let toEmit = addAnsiEscapes(chunk);
        toEmit = toEmit.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
        emitText(socket, toEmit);
        return true;
      },
      // express.e:5469-5471 sendCLS(). Buffered, like the text around it.
      //
      // A SCROLL-CLEAR for anyone with a scrollback: `ESC[2J` erases the
      // viewport and saves nothing, so the board's own repaints were eating
      // the caller's history (`clearScreenFor`). A C64 still gets the hard
      // clear - it has no history to keep.
      emitCls: () => emitText(socket, clearScreenFor(session)),
      // The pre-clear ~SR_ sends before a full-screen art file: direct, not
      // buffered, exactly as it was written.
      emitClsBeforeRandomFile: () => socket.emit('ansi-output', clearScreenFor(session)),
    });
    if (walk.hasPause) {
      hasPause = true;
    }
    if (walk.inlineEmitted) {
      inlineEmitted = true;
    }
    if (walk.pendingInlineContent !== undefined) {
      return {
        parsed: '',
        commands: commandsToExecute,
        hasPause: true,
        slowmo: slowmoApplied,
        slowmoCount: slowmoAppliedCount,
        inlineEmitted: true,
        pendingInlineContent: walk.pendingInlineContent,
      };
    }

    // Clear parsed since everything has been emitted to the socket.
    parsed = '';
  }

  // ~SS_/~SR_/~SX_/~SP./~NSF/~CR./~F/~CC_/~CR_/~SM_/~SMO/~SMC all
  // handled in the pre-tokenizer block above so the strict-fall-
  // through tokenizer doesn't eat their `~`. Inline-mode CC_/SS_/SR_
  // ride through the dispatch as sentinels (executed by the walker).

  // Legacy % codes (for compatibility)
  parsed = parsed.replace(/%B/g, bbsName);
  parsed = parsed.replace(/%S/g, sysopName);
  parsed = parsed.replace(/%L/g, location);
  parsed = parsed.replace(/%CF/g, session.currentConfName || 'Main');
  parsed = parsed.replace(/%R/g, session.user ? Math.floor(session.timeRemaining / 60).toString() : '57600');
  parsed = parsed.replace(/%D/g, fullDateTime);
  parsed = parsed.replace(/%T/g, timeStr);
  parsed = parsed.replace(/%U/g, username);
  parsed = parsed.replace(/%N/g, '1');
  parsed = parsed.replace(/%C/g, conferences.length.toString());

  // MultiTop bulletin codes - @READUSERKEYS directive (strip it, it's not displayed)
  parsed = parsed.replace(/@READUSERKEYS\s*/gi, '');

  // MultiTop bulletin codes - %XX.YYCC format for user ranking data
  // Format: %XX.YYCC where XX=slot(01-30), YY=field width, CC=code type
  // Code types: UB=Upload Bytes, DB=Download Bytes, UC=Upload CPS, DC=Download CPS,
  //             MS=Messages, TU=Total Users, SC=System Calls
  const multiTopRegex = /%(\d{2})\.(\d{2})([A-Z]{2})/g;
  let multiTopMatch;
  const multiTopReplacements: Array<{match: string; slot: number; width: number; code: string}> = [];

  // Collect all MultiTop codes first
  while ((multiTopMatch = multiTopRegex.exec(parsed)) !== null) {
    multiTopReplacements.push({
      match: multiTopMatch[0],
      slot: parseInt(multiTopMatch[1], 10),
      width: parseInt(multiTopMatch[2], 10),
      code: multiTopMatch[3]
    });
  }

  // Process MultiTop codes if any found
  if (multiTopReplacements.length > 0) {
    // `%XX.YYSC` is the only remaining reader of the today-calls counter in
    // this function (the `~SC` MCI code reads the same singleton from inside
    // buildMciDispatch), so it is fetched here rather than on every render.
    const { systemStats } = await import('../services/SystemStatsService');
    const todayCalls = systemStats.getTodayCalls();

    // Fetch users sorted by different criteria for ranking
    let rankedUsers: {
      byUploadBytes: any[];
      byDownloadBytes: any[];
      byMessages: any[];
    } = { byUploadBytes: [], byDownloadBytes: [], byMessages: [] };

    try {
      const allUsers = await db.getUsers({ limit: 100 });
      rankedUsers.byUploadBytes = [...allUsers].sort((a, b) => (b.uploadBytes || 0) - (a.uploadBytes || 0));
      rankedUsers.byDownloadBytes = [...allUsers].sort((a, b) => (b.downloadBytes || 0) - (a.downloadBytes || 0));
      rankedUsers.byMessages = [...allUsers].sort((a, b) => (b.messagesPosted || 0) - (a.messagesPosted || 0));
    } catch (error) {
console.error('[parseMciCodes] Error fetching users for MultiTop codes:', error);
    }

    // Get total users count
    let totalUsers = 0;
    try {
      totalUsers = rankedUsers.byUploadBytes.length;
    } catch (error) {
      // Ignore
    }

    // Replace each MultiTop code
    for (const rep of multiTopReplacements) {
      const slotIdx = rep.slot - 1; // Convert to 0-indexed
      let value = '';

      switch (rep.code) {
        case 'UB': // Upload Bytes
          if (slotIdx >= 0 && slotIdx < rankedUsers.byUploadBytes.length) {
            const bytes = rankedUsers.byUploadBytes[slotIdx].uploadBytes || 0;
            value = formatBytes(bytes);
          }
          break;
        case 'DB': // Download Bytes
          if (slotIdx >= 0 && slotIdx < rankedUsers.byDownloadBytes.length) {
            const bytes = rankedUsers.byDownloadBytes[slotIdx].downloadBytes || 0;
            value = formatBytes(bytes);
          }
          break;
        case 'UC': // Upload CPS (use uploadBytes / timesCalled as approximation)
          if (slotIdx >= 0 && slotIdx < rankedUsers.byUploadBytes.length) {
            const user = rankedUsers.byUploadBytes[slotIdx] as any;
            const cps = user.timesCalled > 0 ? Math.floor((user.uploadBytes || 0) / user.timesCalled) : 0;
            value = cps.toString();
          }
          break;
        case 'DC': // Download CPS (use downloadBytes / timesCalled as approximation)
          if (slotIdx >= 0 && slotIdx < rankedUsers.byDownloadBytes.length) {
            const user = rankedUsers.byDownloadBytes[slotIdx] as any;
            const cps = user.timesCalled > 0 ? Math.floor((user.downloadBytes || 0) / user.timesCalled) : 0;
            value = cps.toString();
          }
          break;
        case 'MS': // Messages Posted
          if (slotIdx >= 0 && slotIdx < rankedUsers.byMessages.length) {
            value = (rankedUsers.byMessages[slotIdx].messagesPosted || 0).toString();
          }
          break;
        case 'TU': // Total Users
          value = totalUsers.toString();
          break;
        case 'SC': // System Calls (use todayCalls from stats)
          value = todayCalls.toString();
          break;
        default:
          value = '0';
      }

      // Pad to field width
      value = value.padStart(rep.width, ' ');
      parsed = parsed.replace(rep.match, value);
    }
  }

  // Process ~SS_ file display codes (express.e:5490-5500)
  // Replace {{DISPLAY_FILE:N}} placeholders with actual file content
  for (let i = 0; i < filesToDisplay.length; i++) {
    const filename = filesToDisplay[i];
    const placeholder = `{{DISPLAY_FILE:${i}}}`;

    // A preview caps the walk; the board does not. `includeDepth` is Infinity
    // for every caller of this function but the preview route.
    if (includeDepth <= 0) {
      parsed = parsed.replace(placeholder, '');
      continue;
    }

    // Load the file content - loadScreenFile now handles Amiga paths
    let screenData = loadScreenFile(filename, session.currentConf, 0, session);

    if (screenData) {
      // Recursively process MCI codes in the embedded file
      const embedded = await parseMciCodes(screenData.content, session, bbsName, sysopName, location, undefined, { includeDepth: includeDepth - 1 });
      // Add any commands from embedded file to our command list
      commandsToExecute.push(...embedded.commands);
      if (embedded.hasPause) {
        hasPause = true;
      }
      // Add ESC prefix to bare ANSI sequences in embedded content (like FLT logos)
      let embeddedContent = embedded.parsed;
      if (!screenData.isPetscii) {
        embeddedContent = addAnsiEscapes(embeddedContent);
      }
      // Replace placeholder with embedded content
console.log(`[MCI] Replacing placeholder ${placeholder} with ${embeddedContent.length} bytes from ${filename}`);
      parsed = parsed.replace(placeholder, embeddedContent);
    } else {
      // File not found - remove placeholder
console.log(`[MCI] File not found, removing placeholder: ${filename}`);
      screenDebug(`[MCI] ~SS_ file not found: ${filename}`);
      parsed = parsed.replace(placeholder, '');
    }
  }

  // ~~ - Literal tilde (express.e escape character)
  // This must be processed LAST so it doesn't interfere with other ~ codes
  parsed = parsed.replace(/~~/g, '~');

  if (session) {
    session.lastScreenHadPause = hasPause;
  }

  return { parsed, commands: commandsToExecute, hasPause, slowmo: slowmoApplied, slowmoCount: slowmoAppliedCount, inlineEmitted };
}

/**
 * Load screen file from disk
 * Searches in priority order: Conference  Node  Global BBS screens
 * Like express.e await displayScreen() - loads from BBS:Node{X}/Screens/ or BBS:Conf{X}/Screens/
 *
 * **WEB_**: express.e:6814-6830 wraps non-MCI screen-file lines at
 * 79 columns and calls checkForPause() at each wrap. We don't, because
 * (a) modern terminals reflow on resize, (b) ANSI screens that the BBS
 * uses commonly contain wide invisible escape sequences which a naive
 * char-count wrap would split mid-attribute, and (c) the per-screen
 * fix-up risk (existing ANSI art breaks on wrap) outweighs the gain.
 * Sysops who really want hard-wrap behavior should generate their
 * screen files pre-wrapped. (Audit G-wrap, P3.)
 *
 * @param screenName - Name of screen file (without .TXT extension)
 * @param conferenceId - Optional conference ID for conference-specific screens
 * @param nodeId - Node ID (default 0)
 * @returns Screen file content or null if not found
 */
/**
 * Every code that DOES something, as `screenProgramSignature` counts them.
 *
 * Decoration - `~f`, `~SP`, a colour - is not a program and stays with the
 * art; an include or a door invocation is the board's to run, not the
 * theme's.
 */
const PROGRAM_CODE_IN_ART = /~(?:SS_|2S|\d*SR_|SX_|CC_|XI)[^\s|~\r\n\x1b]*\|?/gi;

/**
 * The theme's drawing with the board's codes put back around it.
 *
 * THE SAME MACHINERY AS A REPLACE, deliberately: `planMciCarry` takes the
 * board file's head and tail code blocks and `applyMciCarry` puts them back
 * around new art, before the SAUCE record rather than after it (a code written
 * past the record is thrown away by the board's own reader, which cuts at the
 * marker). That pair is tested, and it was fixed this morning for the SAUCE
 * case; a second hand-rolled splice here would be the second copy this repo
 * keeps collecting its bugs from.
 *
 * The theme's own program codes are stripped first - they are the half a theme
 * does not own, and leaving one in would make `planMciCarry` treat the art as
 * carrying codes of its own and hand it back untouched.
 *
 * Null when there is nothing to draw with: an unreadable file, or a theme copy
 * that is all codes and no picture, where the board's own file is the answer.
 */
function artOfThemeWithBoardCodes(
  boardFile: string,
  themeFile: string,
): { text: string; sourceEncoding: 'cp437' | 'iso-8859-1' | undefined } | null {
  try {
    const themeRead = readScreenWithTransforms(themeFile);
    const art = splitScreenCodes(themeRead.text).art.replace(PROGRAM_CODE_IN_ART, '');
    if (art.trim() === '') return null;

    /*
     * The board's own two blocks, taken with the same split - NOT through
     * `planMciCarry`, whose first question is "does the upload carry codes of
     * its own", which is a question about an artist's upload and not about
     * this. `applyMciCarry` does the placing, so the codes land before the
     * theme art's SAUCE record rather than after it.
     */
    const board = splitScreenCodes(readScreenText(boardFile));
    if (board.head.length === 0 && board.tail.length === 0) return null;

    /*
     * A BOARD FILE WITH NO DRAWING HAS NOTHING FOR A THEME TO RESTYLE.
     *
     * `Screens/Node/logon20.txt` is `~CC_gl ~SP` and two includes;
     * `Screens/BULL.TXT` is a clear and two includes. Tango carries a logo for
     * both, and there is no right place to splice it: after the program it sat
     * on top of the last bulletin's pause ("a logo draws before the pause in
     * super amilog", 2026-09-28), and before it (98c0d0dfc) it went under the
     * Global Last Callers door, which draws its own page and was painted over
     * ("global last callers ... lost their screen clears", 2026-09-29). A
     * pure program is the board's, whole - the theme's art for it lies in the
     * files the program includes, which Themes/<slug>/Files/ can override.
     */
    if (board.art.trim() === '') return null;

    const plan: CarryPlan = {
      head: board.head, tail: board.tail, lost: [], uploadHasCodes: false,
    };

    return {
      text: applyMciCarry(art, plan, 'keep'),
      sourceEncoding: sourceCharsetOf(themeRead),
    };
  } catch {
    return null;
  }
}

export function loadScreenFile(
  screenName: string,
  conferenceId?: number,
  nodeId: number = 0,
  session?: BBSSession
): {
  content: string;
  isPetscii: boolean;
  isRip: boolean;
  /**
   * WEB_: true when the winning file was a .ttx ANSI teletext screen.
   * Advisory only - displayScreen serves it down the ordinary ANSI path
   * (the face does the work), but callers and tests can tell which
   * variant won.
   */
  isTeletext?: boolean;
  filePath: string;
  petsciiBuffer?: Buffer;
  /**
   * TP-5: the charset `content` was decoded FROM, when the loader knows it.
   * It used to die here - `readAmigaTextFile` answered `cp437` for a `.ans`
   * or a SAUCE-stamped file and `iso-8859-1` for everything else, and this
   * function threw the answer away, so nothing downstream could tell an
   * imported `.ANS` from this board's own Amiga art. It rides to the wire on
   * the payload's attribute object (`utils/output-pacing.ts`).
   */
  sourceEncoding?: 'cp437' | 'iso-8859-1';
} | null {
  // BBS directory structure matches original Amiga AmiExpress
  // Use dataDir from config which points to project root
  const { config } = require('../config');
  const baseDir = config.getConfig().dataDir;
  const bbsPaths = new BBSPaths(baseDir);
  const paths = [];

  /*
   * Screen files that are present but have NOTHING IN THEM, in search order.
   *
   * They do not answer the name while there is anywhere else to look - that
   * is the whole point, a hollow `Logon100.txt` must not beat a real
   * `Logon.txt` beside it - but if the entire walk comes up empty the first
   * one is served anyway, at the bottom of this function. A screen the sysop
   * blanked on purpose is a screen that exists and draws nothing; it is not a
   * screen that is MISSING, and reporting it as missing would put a
   * CRITICAL in the log and a notification in front of the sysop on every
   * login. See screens/screen-blankness.ts.
   */
  const hollow: string[] = [];
  const takeHollow = (resolved: string | null | undefined): string | null => {
    if (!resolved) return null;
    if (!screenFileDrawsNothing(resolved)) return resolved;
    screenDebug(`[loadScreenFile]  Skipping hollow screen file ${resolved}`);
    hollow.push(resolved);
    return null;
  };

  /*
   * The caller's SCREEN theme, resolved once for every arm of this function.
   *
   * `resolveCallerTheme` is the only judge of what a caller may wear - the
   * picker, the preview and the admin all ask it - so a caller can never be
   * served a theme the picker says they cannot have, nor refused one it
   * offered. A session carrying `screenThemeResolved` has ALREADY been past
   * that judge; only the admin's preview builds one, and it does so by asking
   * `resolveCallerTheme` with the REQUESTER's real identity, so there is still
   * exactly one rule and one place it lives.
   *
   * It is computed HERE rather than inside the directory-list branch because
   * the absolute, assign and slash arms below need it too: those arms are how
   * a bulletin, a `~SS_` include and a `~SR_` pool member reach the loader,
   * and a themed board that served the board's bulletins would be a theme
   * with a hole in it exactly where the art is.
   */
  const callerThemeSlug = session?.screenThemeResolved ?? resolveCallerTheme(baseDir, {
    username: session?.user?.username,
    secLevel: session?.user?.secLevel,
    /*
     * A CALLER'S OWN PREFERENCE FIRST, and the browser's memory of it only
     * while there is nobody to ask.
     *
     * BBSTITLE is drawn before login, so this used to be undefined there and
     * the board default was served - "i switched to h7's theme on the live
     * bbs, most screens show old ones" (sysop, 2026-09-18). `preLoginTheme`
     * is the slug off the handshake cookie, and it goes to the SAME judge: no
     * username beside it means a draft theme is refused, as it is for any
     * caller who does not own it.
     */
    screenTheme: session?.user?.screenTheme ?? session?.preLoginTheme,
  });

  const normalizeAbsoluteCaseInsensitive = (absPath: string): string => {
    if (!path.isAbsolute(absPath)) return absPath;
    const resolved = amigaResolvePath(absPath);
    if (resolved) return resolved;
    return absPath;
  };

  // Normalize common absolute-path-without-leading-slash cases (e.g. "Users/spot/..."),
  // since MCI-resolved absolute paths sometimes lose the leading separator.
  let effectiveName = screenName;
  const baseDirNoSlash = baseDir.replace(new RegExp(`^${path.sep}`), '');
  if (!path.isAbsolute(effectiveName) && (effectiveName.startsWith(baseDir) || effectiveName.startsWith(baseDirNoSlash))) {
    effectiveName = path.join(path.sep, effectiveName);
  }

  screenDebug(`[loadScreenFile] Loading screen: ${effectiveName}`);
  screenDebug(`[loadScreenFile] Base directory: ${baseDir}`);
  screenDebug(`[loadScreenFile] Conference ID: ${conferenceId}, Node ID: ${nodeId}`);
  screenDebug(`[loadScreenFile] Terminal type: ${session?.terminalType || 'unknown'} (${session?.screenWidth}x${session?.screenHeight})`);
  screenDebug(`[loadScreenFile] PETSCII mode: ${session?.petsciiMode ? 'YES' : 'NO'}`);
  const userSecLevel = session?.user?.secLevel ?? 0;
  // express.e:6264/6282/6299 - the caller's screen type (`.TXT.GR`, `.IBM`),
  // tried before `.TXT` at every level findSecurityScreen walks.
  const userScreenTypeExt = userScreenTypeExtension(session?.user, baseDir);

  // express.e:6551-6558 - Some screen types use different file names
  // NODE_BULL and CONF_BULL both look for 'BULL' files in their respective directories
  //
  // P3-3 / SYS_DEFAULT_MENU: express.e:6558-6562 falls back to
  // `defaultMenuName` (express.e:31823-31824 DEFAULT_MENUNAME, itself
  // defaulting to 'MENU' when blank) whenever there is no per-conference
  // menu override. getScreenFileName only maps a FIXED set of catalogue
  // names (NODE_BULL, LOGON24, ...); MENU's target filename is
  // configurable, so it is resolved here instead, where the session's
  // board config is reachable.
  const actualFileName = screenName.toUpperCase() === 'MENU'
    ? (() => {
      try {
        const { getBoardConfig } = require('../services/bbs-config-file.service');
        return getBoardConfig(baseDir).default_menu?.trim() || 'MENU';
      } catch {
        return 'MENU';
      }
    })()
    : getScreenFileName(screenName);
  const screenBaseNoExt = actualFileName.replace(/\.[^/.]+$/, ''); // strip extension for security search
  if (actualFileName !== screenName) {
    screenDebug(`[loadScreenFile] Screen ${screenName} uses file name: ${actualFileName}`);
  }
  const isAssignPath = effectiveName.includes(':');
  let isAbsolutePath = path.isAbsolute(effectiveName);
  const normalizedName = effectiveName.toLowerCase();

  // Handle explicit absolute filesystem paths (already resolved)
  if (isAbsolutePath) {
    const normalizedAbs = normalizeAbsoluteCaseInsensitive(effectiveName);
    const dir = path.dirname(normalizedAbs);
    const base = path.basename(normalizedAbs);
    const resolved = findCaseInsensitive(dir, base) || normalizedAbs;
    paths.push(resolveAlphabetTwin(resolved, session));
  } else if (effectiveName.includes(':')) {
    // Use centralized BBS path resolver for Amiga assigns (BBS:, WORK:, NODE:, etc.)
    const resolved = bbsPaths.resolveAmigaPath(effectiveName, nodeId);
    const dir = path.dirname(resolved);
    const base = path.basename(resolved);
    const ci = findCaseInsensitive(dir, base) || resolved;
    const normalized = resolveAlphabetTwin(ci, session).replace(new RegExp(`^${baseDir}/bbs/`, 'i'), `${baseDir}/`);
    if (normalized !== ci) {
console.log(`[SCREEN_DEBUG] Stripping leading 'bbs' component: ${ci} -> ${normalized}`);
    }
    paths.push(normalized);
    screenDebug(`[MCI] ~SS_ resolving Amiga path: ${screenName} -> ${normalized}`);
  } else if (screenName.includes('/')) {
  } else if (effectiveName.includes('/')) {
    // Relative path with slashes - treat as dataDir-relative (no extra "Screens" prefix)
    const fsPath = path.join(baseDir, ...effectiveName.split('/'));
    const resolved = findCaseInsensitive(path.dirname(fsPath), path.basename(fsPath));
    const normalized = (resolved || fsPath).replace(new RegExp(`^${baseDir}/bbs/`, 'i'), `${baseDir}/`);
    if (normalized !== (resolved || fsPath)) {
console.log(`[SCREEN_DEBUG] Stripping leading 'bbs' component: ${(resolved || fsPath)} -> ${normalized}`);
    }
    paths.push(normalized);
  }

  // Define search directories and filenames to try (case-insensitive, AmigaOS compatible)
  // We try multiple filename variations: FILENAME.TXT, filename.txt, Filename.txt, etc.
  // `themed` comes from screenSearchLocations and is what tells a theme's
  // directory from the board's - the distinction the program rule rests on.
  const searchLocations: SearchLocation[] = [];
  const hasSlash = !isAbsolutePath && effectiveName.includes('/');

  // Only populate default search locations when no explicit path/assign is given.
  if (!isAbsolutePath && !isAssignPath && !hasSlash) {
    // express.e:6544-6640 - Each screen type uses a SPECIFIC directory priority.
    const screenDirType = getScreenDirType(screenName);
    const nodeDir = path.join(baseDir, `Node${nodeId}`);
    const globalScreensDir = path.join(baseDir, 'Screens');

    // express.e:6544-6640 - the directories, in its order, out of the module
    // the admin's screen manager reads too, so neither can drift.
    // The caller's SCREEN theme is a fifth dimension on the same list, so the
    // security walk and the variant walk below both get it from one place.
    // `resolveCallerTheme` is the only judge of what a caller may wear - the
    // picker asks it too, so a caller can never select a theme the loader
    // then refuses.
    searchLocations.push(...screenSearchLocations(baseDir, screenName, {
      nodeId,
      confId: conferenceId || session?.relConfNum,
      themeSlug: callerThemeSlug,
    }));

    // express.e has NO cross-directory fallback: displayScreen() builds one
    // path from the screen's own directory and returns FALSE when the file is
    // not there. The Node<N>, Node<N>/Screens and global Screens/ fallbacks
    // that used to live here were this port's invention, and they hid four
    // screens that a real Amiga would never have displayed (AWAITSCREEN,
    // BBSTITLE, SCREEN_BULL and the LOGON security variants) until each was
    // moved to the directory express.e reads.
    //
    screenDebug(`[loadScreenFile] Search locations for ${screenName}:`, searchLocations.map(l => l.desc));
  }

  // Possible filename variations (case-insensitive search will handle actual matching)
  // In PETSCII mode, prefer .seq files over .TXT files
  // For real C64 clients (terminalType === 'c64'), prioritize _C64.seq variants
  const isC64Client = session?.terminalType === 'c64';
  // Preserve explicit extensions; build variant lists depending on ANSI vs PETSCII
  const addAnsiVariants = (name: string) => {
    const variants = new Set<string>();
    // The name exactly as asked for wins; the stem (a known screen extension
    // stripped) drives every fallback, so `001.logoff.seq` can land on
    // `001.logoff.txt` instead of probing `001.logoff.seq.txt`.
    const stem = stripScreenExtension(name);
    variants.add(name);
    // Lowercase variant FIRST. Our image ships lowercase
    // (`BBSTITLE.txt`); admin TUI and modern editors also default
    // to lowercase. The uppercase variant is the legacy Amiga
    // convention — kept as fallback so manually-uploaded uppercase
    // files still load. Ordering matters on case-sensitive
    // filesystems (Linux/prod): if both exist, the lowercase one
    // wins. Previously uppercase-first caused stale BBSTITLE.TXT
    // on the live volume to shadow a fresh BBSTITLE.txt, which
    // broke the login-prompt placement.
    variants.add(`${stem}.txt`);
    variants.add(`${stem}.TXT`);
    variants.add(`${stem}.logoff`);
    variants.add(`${stem}.logoff.txt`);
    variants.add(`${stem}.LOGOFF.TXT`);
    return Array.from(variants);
  };

  const addPetsciiVariants = (name: string) => {
    const variants = new Set<string>();
    const stem = stripScreenExtension(name);
    // Prefer PETSCII .seq first
    variants.add(`${stem}.seq`);
    variants.add(`${stem}.SEQ`);
    // Also allow explicit name as-is (in case a .txt was provided)
    variants.add(name);
    // Fall back to ANSI text if no .seq exists (lowercase first; see addAnsiVariants).
    variants.add(`${stem}.txt`);
    variants.add(`${stem}.TXT`);
    variants.add(`${stem}.logoff`);
    variants.add(`${stem}.logoff.txt`);
    variants.add(`${stem}.LOGOFF.TXT`);
    return Array.from(variants);
  };

  const addRipVariants = (name: string) => {
    const variants = new Set<string>();
    const stem = stripScreenExtension(name);
    // Prefer RIP .rip first
    variants.add(`${stem}.rip`);
    variants.add(`${stem}.RIP`);
    // Also allow explicit name as-is
    variants.add(name);
    // Fall back to ANSI text if no .rip exists (lowercase first; see addAnsiVariants).
    variants.add(`${stem}.txt`);
    variants.add(`${stem}.TXT`);
    variants.add(`${stem}.logoff`);
    variants.add(`${stem}.logoff.txt`);
    variants.add(`${stem}.LOGOFF.TXT`);
    return Array.from(variants);
  };

  const addTeletextVariants = (name: string) => {
    const variants = new Set<string>();
    const stem = stripScreenExtension(name);
    // Native packet .tti first (rendered server-side below), then ANSI
    // .ttx (lowercase first; see addAnsiVariants).
    variants.add(`${stem}.tti`);
    variants.add(`${stem}.TTI`);
    variants.add(`${stem}.ttx`);
    variants.add(`${stem}.TTX`);
    // Also allow explicit name as-is
    variants.add(name);
    // Fall back to ANSI text if no teletext art exists - a T session
    // without authored art still renders the board, in the TDAText face.
    variants.add(`${stem}.txt`);
    variants.add(`${stem}.TXT`);
    variants.add(`${stem}.logoff`);
    variants.add(`${stem}.logoff.txt`);
    variants.add(`${stem}.LOGOFF.TXT`);
    return Array.from(variants);
  };

  const wantsPetsciiArt = servesPetsciiArt(session);
  const wantsTeletext = session?.texttvMode === true;

  const filenameVariations = (() => {
    // Special-case BBSTITLE: try .TXT first to avoid noisy extensionless probes
    if (screenName.toUpperCase() === 'BBSTITLE') {
      if (wantsPetsciiArt) {
        return [...addPetsciiVariants(screenName)];
      } else if (session?.ripMode) {
        return [...addRipVariants(screenName)];
      } else if (wantsTeletext) {
        return [...addTeletextVariants(screenName)];
      }
      return ['BBSTITLE.txt', 'BBSTITLE.TXT', 'BBSTITLE'];
    }
    if (screenName.toUpperCase() === 'AWAITSCREEN') {
      if (wantsPetsciiArt) {
        return [...addPetsciiVariants(screenName)];
      } else if (session?.ripMode) {
        return [...addRipVariants(screenName)];
      } else if (wantsTeletext) {
        return [...addTeletextVariants(screenName)];
      }
      return ['AWAITSCREEN.txt', 'AWAITSCREEN.TXT'];
    }
    // Use actualFileName for mapped screen types (e.g., NODE_BULL -> BULL)
    const fileToFind = actualFileName;
    if (wantsPetsciiArt) {
      return isC64Client ? addPetsciiVariants(`${fileToFind}_C64`) : addPetsciiVariants(fileToFind);
    }
    if (session?.ripMode) {
      return addRipVariants(fileToFind);
    }
    if (wantsTeletext) {
      return addTeletextVariants(fileToFind);
    }
    return addAnsiVariants(fileToFind);
  })();

  // Try each location with case-insensitive matching
  screenDebug(`[loadScreenFile] Trying ${searchLocations.length} location(s) with case-insensitive matching:`);
  let attemptNum = 0;

  /*
   * A THEME OWNS ART, NOT BEHAVIOUR.
   *
   * A screen file here is a PROGRAM: `Node/logon20.txt` is 149 bytes and none
   * of them are art - it says which bulletins a caller sees, which doors run
   * at login and where the pauses fall. A theme carrying its own copy does not
   * restyle the login, it FORKS it, and the caller wearing that theme runs a
   * different board.
   *
   * Six of this board's seven themes had done exactly that, byte-identically
   * (every `logon20.txt` md5 e71dbab7), buying nothing and costing six copies
   * that the first edit would fork. The sysop found it by removing a logo in
   * the admin and watching the board go on drawing it: "the login sequence
   * should not be theme dependant this explains a lot of our issues in the
   * bbs" (2026-09-14).
   *
   * A theme loses nothing by this. The art a program NAMES is still themeable
   * through `Themes/<slug>/Files/`, which mirrors the board root verbatim -
   * `themedPath`, measured - so an artist ships his own logo and leaves the
   * login alone.
   *
   * Only when the BOARD has a copy. A screen that exists solely in a theme is
   * still drawn from it: refusing would take away a screen the board is
   * already serving, which is a regression, not a fix.
   *
   * See thoughts/shared/plans/2026-09-14-a-theme-owns-art-not-behaviour-design.md
   */
  const boardProgram = (() => {
    if (!searchLocations.some(l => l.themed)) return null;
    for (const location of searchLocations) {
      if (location.themed) continue;
      const candidates = isAssignPath ? [] : [
        findSecurityScreen(
          path.join(location.dir, screenBaseNoExt), userSecLevel, userScreenTypeExt,
          session?.ripMode ?? false, false, servesPetsciiArt(session),
          session?.texttvMode ?? false, { hollow },
        ),
      ];
      for (const filename of filenameVariations) {
        candidates.push(findCaseInsensitive(location.dir, filename));
      }
      for (const found of candidates) {
        if (!found) continue;
        try {
          // Latin-1: a screen carries Amiga high-bit bytes.
          const bytes = fs.readFileSync(found);
          // Art with no codes at all: the theme owns it outright.
          return screenIsProgram(bytes)
            ? { signature: screenProgramSignature(bytes), file: found }
            : null;
        } catch { /* unreadable tells us nothing */ }
        return null;
      }
    }
    return null;
  })();
  const boardProgramSignature = boardProgram?.signature ?? null;

  /*
   * A THEME THAT CANNOT DRESS A C64 DOES NOT GET TO SHADOW THE BOARD'S .SEQ.
   *
   * The sysop, 2026-09-15, after the generated PETSCII defaults shipped: "the
   * mainmenu is 80 cols". The board's own log named the file it served -
   * `Themes/607080/Conf/2/Menu.txt` - and the reason is the search ORDER: a
   * theme's directory is searched before the board's, and this board's active
   * theme was made on the live volume, so it has no `.seq` for anything. Its
   * ANSI copy answered first and `Conf2/Menu.seq`, sitting one location
   * further down, was never reached.
   *
   * A theme owns ART (screens/theme-validation.ts says as much, and warns a
   * theme that claims 40 columns with no `.seq` in it). Art it does not have
   * is not art it owns: where the theme has no PETSCII copy and the board
   * does, the board's is served. A theme WITH a `.seq` still wins, and a
   * screen NOBODY has in PETSCII still falls to the theme's ANSI, reflowed as
   * before - this rule only fires when there is something better underneath.
   */
  /*
   * The same holds for a TELETEXT caller (sysop, 2026-10-05: "i tested t at
   * the prompt the bbs title is ansi not teletext"). The live log named it:
   * `Screens/Node/BBSTITLE.tti` was found, and `Themes/h7/Node/BBSTITLE.txt`,
   * one location earlier, was served. A theme with no .tti/.ttx copy does not
   * shadow the board's.
   */
  const ownArtCandidateIn = (dir: string): string | null => {
    if (servesPetsciiArt(session)) {
      const found = findSecurityScreen(path.join(dir, screenBaseNoExt), userSecLevel, null, false, false, true, false, { hollow });
      return found && isPetsciiSeqFile(found) ? found : null;
    }
    if (session?.texttvMode === true) {
      const found = findSecurityScreen(path.join(dir, screenBaseNoExt), userSecLevel, null, false, false, false, true, { hollow });
      if (!found) return null;
      if (isTeletextFile(found)) return found;
      if (!isNativeTtiName(found)) return null;
      if (tryNativeTtiFile(found) !== null) return found;
      // A .tti that is not packets is passed over by the loader for its .ttx
      // twin (tryNativeTtiFile's contract) - live's Screens/Node/BBSTITLE.tti
      // is ANSI text - so the twin is what this location has.
      return findCaseInsensitive(path.dirname(found), path.basename(found).replace(/\.tti$/i, '.ttx'));
    }
    return null;
  };
  const ownArt = servesPetsciiArt(session) ? '.seq' : '.tti/.ttx';
  const boardHasOwnArt = (servesPetsciiArt(session) || session?.texttvMode === true) && !isAssignPath
    && searchLocations.some((l) => !l.themed && ownArtCandidateIn(l.dir) !== null);

  for (const location of searchLocations) {
    if (location.themed && boardHasOwnArt && ownArtCandidateIn(location.dir) === null) {
      screenDebug(
        `[loadScreenFile]  skipping ${location.desc}: it has no ${ownArt} for ${screenName}`
        + ' and the board does - a theme owns art, and this art it does not have',
      );
      continue;
    }
    if (location.themed && boardProgramSignature !== null) {
      /*
       * SAME CODES, DIFFERENT PIXELS: the theme wins. That is a restyle, and
       * restyling is what a theme is for - a conference bulletin here is 1745
       * bytes of ANSI logo with one `~SS_` at the end, and refusing it
       * outright took the artist's logo away with it.
       *
       * DIFFERENT CODES: the board wins. The theme was changing what the
       * board DOES - `Themes/607080/Conf/4/bull20.txt` adds `~XISUBSCAN` to
       * the board's include - and that is the thing a theme may not do.
       */
      /*
       * THE THEME'S COPY IS FOUND THE WAY THE SCREEN IS SERVED - through the
       * security walk first.
       *
       * `CONF_BULL` resolves to a screen named BULL, and the file a level-20
       * caller is served is `bull20.txt`: the SECURITY VARIANT, which only
       * `findSecurityScreen` knows how to name. Looking for the screen's own
       * name and then the plain variations found neither, so every themed
       * conference bulletin on this board read as "the theme has no copy" and
       * the board's file was served - for any theme, since themes shipped.
       * The live log said it in as many words once it was asked to:
       * "skipping h7: Conf/2: it has no CONF_BULL of its own", about
       * `Themes/h7/Conf/2/bull20.txt`, which is right there.
       */
      const themeCopy = (isAssignPath ? null : findSecurityScreen(
        path.join(location.dir, screenBaseNoExt), userSecLevel, userScreenTypeExt,
        session?.ripMode ?? false, false, servesPetsciiArt(session),
        session?.texttvMode ?? false, { hollow },
      ))
        ?? findCaseInsensitive(location.dir, path.basename(screenName))
        ?? filenameVariations.map(v => findCaseInsensitive(location.dir, v)).find(Boolean);
      let sameBehaviour = false;
      if (themeCopy) {
        try {
          sameBehaviour = screenProgramSignature(fs.readFileSync(themeCopy)) === boardProgramSignature;
        } catch { sameBehaviour = false; }
      }
      if (!sameBehaviour) {
        /*
         * THE ART IS THE THEME'S, THE PROGRAM IS THE BOARD'S - both, not one.
         *
         * This used to `continue`, so a theme whose codes had drifted lost its
         * PICTURE as well: "i switched to h7's theme on the live bbs, most
         * screens show old ones" (sysop, 2026-09-18), about four screens whose
         * art was perfectly good and whose codes were a `~5SR_` short of the
         * board's. Throwing the drawing away to protect the program is the
         * wrong half of the file to keep, and the sysop's answer was the
         * obvious one: "you should make themes work".
         *
         * A screen is a head block of codes, art, and a tail block - the split
         * `splitScreenCodes` already makes for the editor and the MCI carry
         * makes on a replace. So the board's codes are put back around the
         * theme's drawing, exactly as a replace does: the caller sees the
         * artist's picture and the board runs what the board ran. A code the
         * theme had among its art is dropped with the rest of its program,
         * which is the same rule as before, applied to the half it belongs to.
         *
         * Text screens only. A `.seq` is screen codes and a `.rip` is a
         * program in its own right; neither splits into head, art and tail,
         * so those keep the old behaviour and the board's file is served.
         */
        const spliced = themeCopy && boardProgram && !isPetsciiSeqFile(themeCopy) && !isRipFile(themeCopy)
          ? artOfThemeWithBoardCodes(boardProgram.file, themeCopy)
          : null;

        if (spliced && themeCopy) {
          screenDebug(
            `[loadScreenFile]  ${location.desc}: drawing ${screenName} from the theme and`
            + ` running ${path.basename(boardProgram!.file)}'s codes around it`,
          );
          return {
            content: spliced.text,
            isPetscii: false,
            isRip: false,
            isTeletext: isTeletextFile(themeCopy) || undefined,
            filePath: themeCopy,
            sourceEncoding: spliced.sourceEncoding,
          };
        }

        screenDebug(
          `[loadScreenFile]  skipping ${location.desc}: ${themeCopy
            ? `its ${path.basename(themeCopy)} RUNS something different from the board's`
              + ` and carries no art of its own to keep`
            : `it has no ${screenName} of its own`}`,
        );
        continue;
      }
    }
    // Skip security-numbered lookup when the screen already used an assign (bbs:, node:, etc.)
    if (!isAssignPath) {
      const securityBasePath = path.join(location.dir, screenBaseNoExt);
      const securityVariant = findSecurityScreen(securityBasePath, userSecLevel, userScreenTypeExt, session?.ripMode ?? false, false, servesPetsciiArt(session),
        session?.texttvMode ?? false, { hollow });
      if (securityVariant) {
        screenDebug(`[loadScreenFile]  Found security screen for ${screenName} at: ${securityVariant}`);
        try {
          // Check if it's a PETSCII .seq file - convert for PetMe64 font display
          if (isPetsciiSeqFile(securityVariant)) {
            screenDebug(`[loadScreenFile] PETSCII .seq file detected, converting for PetMe64 font`);
            const petsciiBuffer = readScreenBuffer(securityVariant);
            const content = convertPetsciiToPetMe64(petsciiBuffer);
            return { content, isPetscii: true, isRip: false, filePath: securityVariant, petsciiBuffer };
          }
          // Check if it's a RIP file - send raw content (express.e:6776-6780)
          if (isRipFile(securityVariant)) {
            screenDebug(`[loadScreenFile] RIP .rip file detected, sending raw content`);
            return { content: readScreenText(securityVariant), isPetscii: false, isRip: true, filePath: securityVariant };
          }
          // Native packet teletext renders server-side; unrenderable
          // packets fall through to the variations walk below (which
          // probes the .ttx twin) - never served raw.
          if (isNativeTtiName(securityVariant)) {
            const native = tryNativeTtiFile(securityVariant);
            if (native) {
              screenDebug(`[loadScreenFile] Native .tti rendered for ${screenName}`);
              return { content: native.ansi, isPetscii: false, isRip: false, isTeletext: true, filePath: securityVariant };
            }
          } else {
            const decodedSecurity = readScreenWithTransforms(securityVariant);
            return { content: decodedSecurity.text, isPetscii: false, isRip: false, isTeletext: isTeletextFile(securityVariant) || undefined, filePath: securityVariant, sourceEncoding: sourceCharsetOf(decodedSecurity) };
          }
        } catch (error) {
          SysopDebugUtil.debugFileError(null, session, 'read', securityVariant, error as Error, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error reading security screen: ${(error as Error).message})`);
        }
      }
    }
    for (const filename of filenameVariations) {
      attemptNum++;
      const expectedPath = path.join(location.dir, filename);
      screenDebug(`[loadScreenFile]   [${attemptNum}/${searchLocations.length * filenameVariations.length}] ${expectedPath}`);

      // Try case-insensitive match
      const foundPath = takeHollow(findCaseInsensitive(location.dir, filename));
      if (foundPath) {
        screenDebug(`[loadScreenFile]  Found screen ${screenName} at: ${foundPath}`);
        let fileToUse: string = foundPath;
        try {
          fileToUse = resolveAlphabetTwin(foundPath, session);
          const isPetsciiFile = isPetsciiSeqFile(fileToUse);
          if (isPetsciiFile) {
            screenDebug(`[loadScreenFile] PETSCII .seq file detected, converting for PetMe64 font`);
            try {
              const petsciiBuffer = readScreenBuffer(fileToUse);
              const content = convertPetsciiToPetMe64(petsciiBuffer);
              return { content, isPetscii: true, isRip: false, filePath: fileToUse, petsciiBuffer };
            } catch (error) {
              SysopDebugUtil.debug(null, session, 'PETSCII', `Failed to convert ${fileToUse}`, { error: (error as Error).message }, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error converting PETSCII):`, error);
            }
          } else if (isRipFile(fileToUse)) {
            screenDebug(`[loadScreenFile] RIP .rip file detected, sending raw content`);
            return { content: readScreenText(fileToUse), isPetscii: false, isRip: true, filePath: fileToUse };
          } else {
            // Native packet teletext renders server-side; unrenderable
            // packets are skipped (never served raw) and the walk
            // continues to the .ttx twin.
            if (isNativeTtiName(fileToUse)) {
              const native = tryNativeTtiFile(fileToUse);
              if (native) {
                screenDebug(`[loadScreenFile] Native .tti rendered for ${screenName}`);
                return { content: native.ansi, isPetscii: false, isRip: false, isTeletext: true, filePath: fileToUse };
              }
              continue;
            }
            const decoded = readScreenWithTransforms(fileToUse);
            const content = decoded.text;
            try {
              const fs = require('fs');
              fs.appendFileSync('debug-screen-loads.log', `[${new Date().toISOString()}] Loaded ${screenName} from ${fileToUse} (content length: ${content.length})\n`);
            } catch (e) { /* ignore */ }
            return { content, isPetscii: false, isRip: false, isTeletext: isTeletextFile(fileToUse) || undefined, filePath: fileToUse, sourceEncoding: sourceCharsetOf(decoded) };
          }
        } catch (error) {
          SysopDebugUtil.debugFileError(null, session, 'read', fileToUse, error as Error, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error reading file: ${(error as Error).message})`);
        }
      } else {
        screenDebug(`[loadScreenFile]     (not found)`);
      }
    }
  }

  /*
   * The theme's mirror of each path candidate, offered FIRST.
   *
   * `paths[]` is what the three arms above built - an absolute path, an Amiga
   * assign, a slash-bearing relative path - and none of them passed through
   * `screenSearchLocations`, so none of them had seen a theme. That is the
   * hole this closes: `~SS_BBS:Screens/subhead.txt` from a themed MENU reached
   * outside its theme, and a themed board served the board's bulletins.
   *
   * `themedPath` returns null for a path outside the board root and for one
   * already inside the theme, so a candidate with no mirror is left exactly as
   * it was. Everything downstream - the assign-path security walk, the
   * extension-swap ladder - runs against the themed candidate first and then
   * the original, unchanged.
   */
  const pathCandidates = paths.flatMap((candidate: string) => {
    const mirrored = themedPath(baseDir, callerThemeSlug, candidate);
    if (!mirrored) return [candidate];
    /*
     * A theme owns art, and art it does not have in the caller's alphabet it
     * does not own - the rule the search loop applies to screens by name.
     * The candidate is already the board's .seq/.ttx twin when it has one;
     * a theme mirror without that file would reach its ANSI copy through the
     * security walk below and shadow it (sysop, 2026-10-05: the Up Rough logo
     * in teletext came from Themes/h7/Files/Screens/uprough.txt).
     */
    const ownAlphabet = isPetsciiSeqFile(candidate) || isTeletextFile(candidate) || isNativeTtiName(candidate);
    if (ownAlphabet && !findCaseInsensitive(path.dirname(mirrored), path.basename(mirrored))) return [candidate];
    return [mirrored, candidate];
  });

  // If we have paths from Amiga-style handling, try those too
  for (let i = 0; i < pathCandidates.length; i++) {
    const filePath = pathCandidates[i];
    attemptNum++;
    screenDebug(`[loadScreenFile]   [${attemptNum}] ${filePath}`);

    // An assign path names one file. `~SS_BBS:Bulletins/bull1.txt` is
    // displayFile(cmd) (express.e:5496-5502), and displayFile just opens that
    // name (express.e:6746): no security-level walk. The walk belongs to the
    // callers that ask for it by name (B: express.e:24648-24650, the port's
    // showBulletin; screens by name: the search loop above). Walking here
    // made the login's `~SS_BBS:Bulletins/bull1.txt` show bull15.txt (the
    // Exploit-DB feed) to every caller at level 5+ (live, 2026-10-17).

    try {
      const candidatePath = resolveAlphabetTwin(filePath, session);
      // Try the path as-is, then with common extensions (.txt, .TXT, .ans, .ANS)
      // This handles ~SR_ which generates paths like "001.logoff" but files are "001.logoff.txt"
      // Same rule as the variant builders above, for the arm an absolute or
      // assign path takes (`~SR_`/`~SS_` resolve to absolute paths). A name
      // that already carries a known screen extension gets that extension
      // SWAPPED, not appended: `001.logoff.seq` must be able to land on
      // `001.logoff.txt`, which is the only file the shipped board ships.
      const pathStem = stripScreenExtension(candidatePath);
      // `.seq` first only for a caller who is served 40-column art; an
      // 80-column PETSCII caller takes the ANSI order, as an ANSI caller does.
      // Native packet `.tti` first for a teletext session (rendered below),
      // then ANSI `.ttx`; everyone else takes the ANSI order.
      const extOrder = servesPetsciiArt(session)
        ? ['.seq', '.SEQ', '.txt', '.TXT', '.ans', '.ANS']
        : session?.texttvMode === true
          ? ['.tti', '.TTI', '.ttx', '.TTX', '.txt', '.TXT', '.ans', '.ANS']
          : ['.txt', '.TXT', '.ans', '.ANS'];
      const pathsToTry = [candidatePath, ...extOrder.map(ext => pathStem + ext)]
        .filter((p, idx, all) => all.indexOf(p) === idx);

      for (const tryPath of pathsToTry) {
        if (amigafs.existsSync(tryPath)) {
          // Same rule as the search loop above: hollow does not answer the
          // name while there is anywhere else to look.
          if (!takeHollow(tryPath)) continue;
          screenDebug(`[loadScreenFile]  Found screen ${screenName} at: ${tryPath}`);
          if (isPetsciiSeqFile(tryPath)) {
            screenDebug(`[loadScreenFile] PETSCII .seq file detected, converting for PetMe64 font`);
            try {
              const petsciiBuffer = readScreenBuffer(tryPath);
              const content = convertPetsciiToPetMe64(petsciiBuffer);
              return { content, isPetscii: true, isRip: false, filePath: tryPath, petsciiBuffer };
            } catch (error) {
              SysopDebugUtil.debug(null, session, 'PETSCII', `Failed to convert ${tryPath}`, { error: (error as Error).message }, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error converting PETSCII):`, error);
            }
          } else if (isRipFile(tryPath)) {
            screenDebug(`[loadScreenFile] RIP .rip file detected, sending raw content`);
            return { content: readScreenText(tryPath), isPetscii: false, isRip: true, filePath: tryPath };
          } else {
            // Native packet teletext renders server-side; unrenderable
            // packets are skipped (never served raw) and the walk
            // continues to the .ttx twin.
            if (isNativeTtiName(tryPath)) {
              const native = tryNativeTtiFile(tryPath);
              if (native) {
                screenDebug(`[loadScreenFile] Native .tti rendered for ${screenName}`);
                return { content: native.ansi, isPetscii: false, isRip: false, isTeletext: true, filePath: tryPath };
              }
              continue;
            }
            const decodedTryPath = readScreenWithTransforms(tryPath);
            return { content: decodedTryPath.text, isPetscii: false, isRip: false, isTeletext: isTeletextFile(tryPath) || undefined, filePath: tryPath, sourceEncoding: sourceCharsetOf(decodedTryPath) };
          }
        }
      }
      screenDebug(`[loadScreenFile]     (not found after trying extensions)`);
    } catch (error) {
      SysopDebugUtil.debugFileError(null, session, 'read', filePath, error as Error, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error: ${(error as Error).message})`);
    }
  }

  // express.e:6544-6640 - Screens are loaded from specific directories based on type:
  // - NODE screens (LOGON, NODE_BULL, etc.): nodeScreenDir (NodeN/Screens/)
  // - CONF screens (MENU, CONF_BULL, etc.): confScreenDir (ConfN/Screens/)
  // - GLOBAL screens (BULL, ONENODE, etc.): cmds.bbsLoc (Screens/)
  // If a screen isn't found in its designated directory, express.e simply doesn't
  // display it (returns FALSE from displayScreen). No cross-directory fallbacks.
  const upper = screenName.toUpperCase();
  const screenDirType = getScreenDirType(screenName);
  const expectedDir = screenDirType === ScreenDirType.NODE ? resolveNodeScreenDir(baseDir, nodeId) :
                      screenDirType === ScreenDirType.CONF ? `${path.basename(conferenceDir(baseDir, conferenceId || session?.relConfNum || 1))}/Screens/` :
                      'Screens/';
console.warn(`[loadScreenFile]  Screen file not found: ${screenName}`);
console.warn(`[loadScreenFile]  Expected location: ${path.join(expectedDir, `${getScreenFileName(screenName)}.TXT`)}`);
console.warn(`[loadScreenFile]  Per express.e:6544-6640, ${screenName} screens should be in ${expectedDir}`);
console.warn(`[loadScreenFile] Tried ${attemptNum} locations`);
try {
  const fs = require('fs');
  fs.appendFileSync('debug-screen-loads.log', `[${new Date().toISOString()}] NOT FOUND: ${screenName} (nodeId: ${nodeId}, conferenceId: ${conferenceId})\n`);
} catch (e) { /* ignore */ }
  SysopDebugUtil.warn(null, session, 'Screen File', `Screen "${screenName}" not found after trying ${attemptNum} locations`);

  if (screenName.toUpperCase() === 'AWAITSCREEN') {
    const nodeFallbackDir = path.join(baseDir, 'Node1');

    // Prefer ANSI text fallback for the await screen
    // A hollow fallback is no fallback (screens/screen-blankness.ts).
    const ansiFallback = takeHollow(
      findCaseInsensitive(nodeFallbackDir, 'bbstitle.txt') || findCaseInsensitive(nodeFallbackDir, 'bbstitle.TXT')
    );
    if (ansiFallback) {
      try {
        const content = readScreenText(ansiFallback);
        screenDebug(`[loadScreenFile]  Using ANSI fallback screen ${ansiFallback}`);
        return { content, isPetscii: false, isRip: false, filePath: ansiFallback };
      } catch (error) {
console.error(`[loadScreenFile]     (error reading ANSI fallback screen: ${(error as Error).message})`);
        SysopDebugUtil.debugFileError(
          null,
          session,
          'read',
          ansiFallback,
          error as Error,
          DebugSeverity.WARNING
        );
      }
    }

    const petsciiFallback = takeHollow(findCaseInsensitive(nodeFallbackDir, 'bbstitle.seq'));
    if (petsciiFallback) {
      try {
        const buffer = readScreenBuffer(petsciiFallback);
        const content = convertPetsciiToPetMe64(buffer);
        screenDebug(`[loadScreenFile]  Using PETSCII fallback screen ${petsciiFallback}`);
        return { content, isPetscii: true, isRip: false, filePath: petsciiFallback, petsciiBuffer: buffer };
      } catch (error) {
console.error(`[loadScreenFile]     (error reading fallback screen: ${(error as Error).message})`);
        SysopDebugUtil.debugFileError(
          null,
          session,
          'read',
          petsciiFallback,
          error as Error,
          DebugSeverity.WARNING
        );
      }
    }
  }

  /*
   * Nothing anywhere had content. If the walk passed a file that exists and
   * is empty, that is the answer: the sysop blanked this screen, and the
   * caller must be told it EXISTS so it draws nothing quietly instead of
   * logging a missing screen and notifying the sysop on every login.
   */
  if (hollow.length > 0) {
    screenDebug(`[loadScreenFile]  Every candidate was hollow; serving ${hollow[0]} as an empty screen`);
    return { content: '', isPetscii: false, isRip: false, filePath: hollow[0] };
  }

  return null;
}

/**
 * Add ESC character prefix to bare ANSI sequences
 * Screen files contain [XXm without ESC (0x1B) prefix
 * This matches original Amiga behavior where ESC was stored as actual byte
 *
 * @param content - Screen content with bare ANSI codes
 * @returns Content with proper ESC prefixes
 */
export function addAnsiEscapes(content: string): string {
  // Match ANSI sequences: ESC?[digits;]+letter or ESC?2J. The parameter run
  // is REQUIRED: a bare `[` + letter is display text far more often than
  // CSI (every menu key: [E], [FR], [TLIST]...). Rescuing those inserts an
  // ESC the terminal then executes as a cursor move (CSI E = next line,
  // CSI F = previous line, CSI J = erase below), scrambling the screen.
  // Shipped 80-col art never needs the letter case: every bracket there is
  // already ESC-prefixed (`\x1b[31m[\x1b[37mE...`). Bare 2J (clear screen)
  // stays rescued: it leads with a digit, so prose essentially never hits it.
  // Avoid double-prefixing sequences that already contain ESC (express.e stores ESC bytes)
  return content.replace(/(\x1b)?\[([0-9;]+[A-Za-z]|2J)/g, (_m, esc, body) => {
    // If ESC was already present, preserve a single ESC; otherwise add one
    return `\x1b[${body}`;
  });
}

/** express.e's MCI opt-in byte (`~`), tested on a `.seq`'s FIRST byte only. */
const PETSCII_MCI_GATE = 0x7e;

/** PETSCII CLR ($93). A C64 has no `\x1b[2J\x1b[H`. */
const PETSCII_CLS = '\x93';

/**
 * The ONE PETSCII chunk emitter (plan Task 6's divergence rule, Task 7).
 *
 * EVERY byte a PETSCII session receives goes through here - art, substituted
 * values and the screen clears alike - so the render-side oracle, the telnet
 * emitter's transducer and the web client's machine can never disagree about
 * the bank, the pen or where the cursor is. An ANSI escape emitted around a
 * PETSCII payload is the silent bug class this closes: the render machine
 * would believe the cursor is where the art left it while the terminal has
 * been homed.
 */
/**
 * Post-tokenizer text with every NUL-delimited INTERNAL run resolved for a
 * degraded (unencoded) emit.
 *
 * `\x00G:<text>\x00` is text a pre-pass generated (a conference list, a
 * `~CR_` prompt): the words are real content, only the marker is ours, so
 * the words stay. Every other run is scaffolding addressed to the walker or
 * the renderer - `\x00MOVE:<x>|<y>\x00`, `\x00SS:<file>\x00`,
 * `\x00CC:<cmd>\x00`, `\x00SP\x00`, `\x00F\x00` - and is dropped whole.
 * An unterminated NUL is dropped on its own.
 *
 * Without this a failing encoder puts a NUL and the literal word MOVE on a
 * C64's screen. A degraded screen shows the sysop's art with unsubstituted
 * MCI; it never shows the renderer's own bookkeeping.
 */
function stripSentinelRuns(text: string): string {
  if (text.indexOf('\x00') < 0) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    const startNul = text.indexOf('\x00', i);
    if (startNul < 0) { out += text.slice(i); break; }
    out += text.slice(i, startNul);
    const endNul = text.indexOf(MCI_SENTINELS.END, startNul + 1);
    if (endNul < 0) { i = startNul + 1; continue; }
    if (text.startsWith(MCI_GENERATED.START, startNul)) {
      out += text.slice(startNul + MCI_GENERATED.START.length, endNul);
    }
    i = endNul + 1;
  }
  return out;
}

function emitPetsciiChunk(
  socket: any,
  session: BBSSession,
  ctx: { machine: PetsciiMachine },
  text: string,
  spans: readonly PetsciiSpan[] = [],
): boolean {
  if (text.length === 0) return false;
  let bytes: Buffer;
  try {
    bytes = renderChunkBytes(text, ctx, spans);
  } catch (error) {
    // A screen degrades, it never stalls (Task 8, from Task 6's review).
    // Most callers of displayScreen do not wrap it, so a throw from the
    // encoder would leave the caller staring at a blank terminal with no
    // way forward. The chunk's own bytes are what the board put on the
    // wire before any of this existed, so falling back to them shows art
    // with unsubstituted MCI rather than nothing at all.
    // The oracle may already have seen part of this chunk before the throw,
    // so the cursor it reports afterwards is best-effort - a degraded screen
    // is allowed to be imprecise; a dead session is not.
    console.error(`[PETSCII] chunk render failed, emitting raw bytes:`, error);
    bytes = Buffer.from(stripSentinelRuns(text), 'latin1');
    ctx.machine.feed(bytes);
  }
  if (bytes.length === 0) return false;
  // `renderChunkBytes` fed the model as it encoded (it has to: a value is
  // clipped against the LIVE cursor), so these bytes are marked self-fed and
  // the choke clears only the stale ANSI wrap latch instead of feeding them
  // a second time (`utils/petscii-session-model.ts`).
  emitPetsciiBytes(socket, session, bytes);
  return true;
}

/**
 * The degrade path for a whole file: its own bytes on the wire, with the
 * oracle still fed so the bank and cursor stay truthful for the next paint.
 * This is exactly what the express.e art gate does for a non-MCI `.seq`, so
 * the fallback is the board's previous behaviour rather than a guess.
 */
function emitRawPetscii(
  socket: any,
  session: BBSSession,
  machine: PetsciiMachine,
  buffer: Buffer,
): void {
  machine.feed(buffer);
  emitPetsciiBytes(socket, session, buffer);
}

/**
 * One PETSCII walk over already-tokenized `.seq` text (plan Task 8).
 *
 * Shared by the first paint (`emitPetsciiScreenInline`, over the whole
 * plan) and by every `~SP` resume (`processNextScreenSegment`, over the
 * remainder), which is what makes the pause continuous: the SAME ctx - and
 * therefore the same `PetsciiMachine` - encodes both sides of the pause, so
 * the bank, cursor, pen and reverse the art left behind carry across it.
 *
 * The text is NEVER re-gated and NEVER re-tokenized. express.e evaluates
 * the `~` gate once, on the file's first byte (`express.e:6800-6806`); a
 * remainder that happens to start with an art `~` is art, and running the
 * tokenizer over it again would eat that byte and re-substitute values that
 * are already substituted.
 */
async function renderPetsciiWalk(
  socket: any,
  session: BBSSession,
  text: string,
  spans: readonly PetsciiSpan[],
  ctx: PetsciiRenderCtx,
): Promise<{ hasPause: boolean; pending?: { text: string; spans: PetsciiSpan[] } }> {
  /** The substitution spans that fall inside one chunk, rebased to it. */
  const spansIn = (start: number, end: number): PetsciiSpan[] =>
    spans
      .filter(sp => sp.start >= start && sp.start + sp.len <= end)
      .map(sp => ({ start: sp.start - start, len: sp.len, cmd: sp.cmd }));

  // The two sentinel kinds the CHUNK renderer owns: they are resolved
  // against the LIVE cursor while the chunk is encoded, so they must not
  // break it.
  const moveTag = MCI_SENTINELS.MOVE.slice(1);
  const generatedTag = MCI_GENERATED.START.slice(1);

  const walk = await walkInlineSentinels(socket, session, text, {
    emitChunk: (chunk, start) =>
      emitPetsciiChunk(socket, session, ctx, chunk, spansIn(start, start + chunk.length)),
    emitCls: () => {
      emitPetsciiChunk(socket, session, ctx, PETSCII_CLS);
    },
    emitClsBeforeRandomFile: () => {
      emitPetsciiChunk(socket, session, ctx, PETSCII_CLS);
    },
    isChunkSentinel: payload =>
      payload.startsWith(moveTag) || payload.startsWith(generatedTag),
  });

  if (walk.pendingInlineContent === undefined) return { hasPause: walk.hasPause };

  // `pendingInlineContent` is a SUFFIX of `text` (the walker returns
  // `text.substring(lastIndex)`), so its offset is the length difference -
  // which is what the remaining spans have to be rebased onto.
  const offset = text.length - walk.pendingInlineContent.length;
  return {
    hasPause: walk.hasPause,
    pending: { text: walk.pendingInlineContent, spans: spansIn(offset, text.length) },
  };
}

/**
 * A gated `.seq` (first byte `~`) rendered through the inline sentinel
 * walker: art chunk, side effect, art chunk, in document order.
 *
 * Plan Task 7. The file is scanned ONCE (`preparePetsciiSeq`: gate,
 * pre-passes, tokenizer) and rendered in PIECES, because the oracle has to
 * observe the pieces in the order the terminal receives them - an `~SS_`
 * include draws with the same machine, so the bytes after it must be encoded
 * against the bank and cursor the include left behind, not against a state
 * computed before it ran.
 *
 * `~SP` (decision 7) stops the walk with the remainder in
 * `pendingInlineContent`. It is stored on `session.screenSegments` together
 * with THIS ctx, so the keypress resumes the same render machine
 * (`processNextScreenSegment`) - same bank, same cursor, same pen. A `.seq`
 * never takes the other, non-inline `~SP` route
 * (`content.split(/~SP/).map(s => s.trim())`): `trim()` strips `$A0`, the
 * PETSCII shifted space and a common solid art byte, silently deleting every
 * run of it at a segment boundary.
 */
export async function emitPetsciiScreenInline(
  socket: any,
  session: BBSSession,
  buffer: Buffer,
  screenName: string = '',
): Promise<{ commands: string[]; paused: boolean }> {
  const ctx = await petsciiRenderCtxFor(session);

  let plan;
  try {
    plan = await preparePetsciiSeq(buffer, session, ctx);
  } catch (error) {
    // Degrade, never stall (Task 8, from Task 6's review): a malformed
    // `.seq` - or a dispatch closure throwing on half-written user data -
    // must not escape displayScreen into a caller that does not wrap it.
    console.error(`[PETSCII] .seq render failed, emitting raw bytes:`, error);
    emitRawPetscii(socket, session, ctx.machine, buffer);
    session.lastScreenHadPause = false;
    return { commands: [], paused: false };
  }

  if (!plan.gated) {
    // Defensive: the caller checks the gate byte, so reaching here means the
    // file is art. Emit it exactly as the whole-file path would.
    emitRawPetscii(socket, session, ctx.machine, buffer);
    session.lastScreenHadPause = false;
    return { commands: [], paused: false };
  }

  const walk = await renderPetsciiWalk(socket, session, plan.text, plan.spans, ctx);

  if (walk.pending) {
    screenDebug(`[MCI] PETSCII ~SP: ${walk.pending.text.length} bytes pending`);
    session.screenSegments = {
      segments: [walk.pending.text],
      currentIndex: 0,
      screenName,
      inlineMode: true,
      // Never used on this path: a petscii segment goes out over
      // `petscii-bytes`. `petscii-output` is a STRING event that
      // `connection-emitter.ts:120-127` re-transduces, double-encoding
      // bytes that are already PETSCII.
      eventName: 'petscii-output',
      isFlowScreen: true,
      petscii: true,
      petsciiCtx: ctx,
      petsciiSpans: [walk.pending.spans],
    };
  }
  session.lastScreenHadPause = walk.hasPause;
  // The pre-pass took the screen's `~XI`/`~XC_`/`~CC_` out of the text; they
  // are the caller's to run, as the ANSI path's `commands` are.
  return { commands: ctx.lastPrePass?.commandsToExecute ?? [], paused: !!walk.pending };
}

/**
 * Emit a PETSCII screen result: the ONE server-side render of a `.seq`
 * (plan `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`, Task 6).
 *
 * When the loader captured the original `.seq` bytes (`petsciiBuffer` set),
 * they go through `renderPetsciiScreen` and out over `petscii-bytes`
 * (base64). That render is the ONLY place a PETSCII screen's MCI is
 * substituted, and it happens BEFORE the transports split (decision 2):
 * the web terminal feeds the payload verbatim to its own
 * `PetsciiMachine`/`PetsciiCanvas`, and telnet's connection emitter
 * (`connection-emitter.ts:130-141`) forwards the identical bytes to a real
 * C64 — so both see the same substituted screen, byte for byte. A non-
 * PETSCII terminal that ended up here still gets the emitter's PUA degrade.
 * `result.content` (the legacy Unicode-PUA conversion) is kept only as a
 * fallback for callers that still produce string-only PETSCII content
 * (`BBSApi.writePetscii(string)`; older loader results without a buffer).
 *
 * The render is gated exactly as express.e gates it (`express.e:6800-6806`,
 * decision 3): only a file whose FIRST byte is `~` is MCI. Art comes back
 * byte-identical — the render machine still observes it, so the bank and
 * cursor stay truthful for whatever is drawn next.
 *
 * PETSCII screens still bypass the ANSI wipe/pagination pipeline (see the
 * `isPetscii` early-return in `displayScreen`): that machinery tokenizes
 * ANSI escapes and splits on `\r\n`, which is meaningless (and unsafe)
 * applied to raw binary PETSCII. `~SP` soft-pause and the structural
 * includes (`~SS_`/`~SR_`/`~CC_`) are Task 7's inline sentinel walker —
 * `renderPetsciiScreen` already passes their sentinels through untouched
 * for it; until that lands a `.seq` is still painted as one frame.
 *
 * Finding 3 (final review wave): `petscii-bytes` is a session-mode gate,
 * not just a transport choice. An ANSI web session can reach a .seq screen
 * (e.g. the BBSTITLE fallback) without ever having opted into PETSCII mode
 * — emitting `petscii-bytes` there would push the frontend's terminal
 * irreversibly into canvas mode for a session that never asked for it.
 * Mirror the telnet emitter's degrade path (connection-emitter.ts's
 * `petscii-bytes` handler / screen.handler.ts's own loader, which always
 * populates `content` as the PetMe64-PUA conversion of the same buffer):
 * only a session that already IS petsciiMode or a real c64 terminal gets
 * the raw-byte transport; everyone else gets the legacy PUA
 * `petscii-output`.
 */
export async function emitPetsciiScreen(
  socket: any,
  session: BBSSession,
  result: { content: string; isPetscii: boolean; isRip: boolean; filePath: string; petsciiBuffer?: Buffer }
): Promise<void> {
  if (result.petsciiBuffer && sessionWantsPetscii(session)) {
    // ONE render, before the base64 and therefore before the transports
    // split. The context caches only the session's PetsciiMachine (the
    // positional bank/cursor/pen oracle); the dispatch is rebuilt here every
    // paint because its values close over the clock, the conference and the
    // byte counters.
    const ctx = await petsciiRenderCtxFor(session);
    try {
      const rendered = await renderPetsciiScreen(result.petsciiBuffer, session, ctx);
      // `renderPetsciiScreen` fed the ctx machine - the session's model - as
      // it encoded, so the payload is marked self-fed for the choke.
      emitPetsciiBytes(socket, session, rendered);
    } catch (error) {
      // Degrade, never stall (Task 8, from Task 6's review). The raw `.seq`
      // is what a non-MCI art file puts on the wire anyway, so the caller
      // sees the screen - unsubstituted - instead of an empty terminal and
      // a dead session.
      console.error(`[PETSCII] render failed for ${result.filePath}, emitting raw bytes:`, error);
      emitRawPetscii(socket, session, ctx.machine, result.petsciiBuffer);
    }
  } else {
    socket.emit('petscii-output', result.content);
  }
  session.lastScreenHadPause = false;
}

/**
 * Display a screen file to the user
 * Like express.e await displayScreen(screenName) - express.e:28566, 28571, 28586
 *
 * @param socket - Socket.io socket for sending output
 * @param session - Current BBS session
 * @param screenName - Name of screen to display
 * @returns true if screen was displayed successfully, false otherwise
 */
/**
 * A screen whose first code is `~f` clears itself, with the same clear the
 * board would send, so the board sending one first clears twice in a row: on
 * the wire, thirty scrolled lines, a home, then thirty more (BULL.TXT, the
 * sysop's "blank screen", 2026-11-04). express.e has no automatic clear at
 * all, so the file's own clear winning is also the parity reading.
 *
 * Only `~f`. A form feed first has its own handling (OPENING_FORM_FEED).
 */
function screenOpensWithItsOwnClear(content: string): boolean {
  return content.startsWith('~f');
}

/**
 * A form feed opening a screen file is the Amiga clear, also behind leading
 * escape codes: the QuickNew door writes `ESC[?25l` and then the form feed, so
 * reading byte 0 alone sent it raw, an ANSI terminal took it for a line feed,
 * and the list drew over the logo before it (the sysop, 2026-11-04).
 */
const OPENING_FORM_FEED = /^((?:\x1b\[[0-9;?]*[A-Za-z])*)\x0c/;

/**
 * Sessions inside a `B 12 NS` display. express.e's NS parameter sets the one
 * nonStopDisplayFlag for the whole displayFile, so every screen the bulletin's
 * own `~CC_` / `~SS_` codes show nests inside the same non-stop scope.
 */
const nonStopScope = new WeakSet<object>();

export async function displayScreen(socket: any, session: BBSSession, screenName: string, runCommands: boolean = true, silent: boolean = false, opts?: { fallbackWipe?: string; nonStop?: boolean }): Promise<boolean> {
  if (opts?.nonStop !== true || nonStopScope.has(session)) {
    return displayScreenBody(socket, session, screenName, runCommands, silent, opts);
  }
  // The flag a door (XIM BB_NONSTOPTEXT seed) and the pager read; put back
  // after the bulletin, so the NEXT screen paginates again.
  const { setNonStopMode } = require('../utils/flag-pause.util');
  const wasFlag = !!session.tempData?.nonStopDisplayFlag;
  const wasText = !!(session as unknown as { nonStopText?: boolean }).nonStopText;
  nonStopScope.add(session);
  setNonStopMode(session, true);
  try {
    return await displayScreenBody(socket, session, screenName, runCommands, silent, opts);
  } finally {
    nonStopScope.delete(session);
    setNonStopMode(session, wasFlag);
    (session as unknown as { nonStopText?: boolean }).nonStopText = wasText;
  }
}

async function displayScreenBody(socket: any, session: BBSSession, screenName: string, runCommands: boolean = true, silent: boolean = false, opts?: { fallbackWipe?: string; nonStop?: boolean }): Promise<boolean> {
  screenDebug(`[displayScreen] ========================================`);
  screenDebug(`[displayScreen] REQUESTED SCREEN: ${screenName}`);
  screenDebug(`[displayScreen] Conference ID: ${session.currentConf || 'none'}`);
  screenDebug(`[displayScreen] User: ${session.user?.name || 'guest'}`);
  screenDebug(`[displayScreen] ========================================`);

  // CRITICAL: Flush any buffered output before displaying screen (express.e behavior)
  // This ensures prompts/content from previous operations are visible before screen transition
  flushOutput(socket);

  screenFlowLog(screenName, `Display request for ${screenName} (runCommands=${runCommands}) state=${session.subState} node=${session.nodeId || 0}`);
  const upperName = screenName.toUpperCase();
  const isMenuScreen = upperName === 'MENU';
  const isFlowScreen = SCREEN_FLOW_SCREENS.has(upperName);
  const shouldClear = SCREENS_REQUIRE_CLEAR.has(upperName);

  // Express.e:6567 - reset cmdShortcuts before attempting to load the menu screen
  if (isMenuScreen) {
    session.cmdShortcuts = false;
    if ((session as any).shortcuts && typeof (session as any).shortcuts.clear === 'function') {
      (session as any).shortcuts.clear();
    }
  }

  const screenData = loadScreenFile(screenName, session.currentConf, session.nodeId || 0, session);

  if (screenData) {
    const { content: loadedContent, isPetscii, isRip, filePath, petsciiBuffer, sourceEncoding } = screenData;

    /*
     * ART THAT ASKED THE TERMINAL TO FOLD IT GETS FOLDED HERE INSTEAD.
     *
     * A screen drawn 80 columns wide with no line terminators trusts the
     * terminal to fold at the right margin, which a real caller's 80-column
     * terminal always did. A browser window is whatever width it is - the
     * sysop's was about 125 - so his logoff logo folded in the wrong places
     * and came out a smear. He reported it twice as "cut off" (2026-09-14);
     * the file was never damaged and every byte arrived.
     *
     * Inert for any screen that carries its own line breaks, which is why the
     * 200-column BBSTITLE is safe: see `screens/authored-wrap.ts` for the
     * trigger and what it deliberately will not touch. PETSCII is 40 columns
     * and RIP is a vector program, so neither is folded on this rule.
     */
    const content = (isPetscii || isRip) ? loadedContent : applyAuthoredWrap(loadedContent);

    /*
     * A screen the sysop blanked draws NOTHING - not even the clear.
     *
     * express.e:6773 answers TRUE for any file that opens, and this port
     * inherited that, so an empty screen wiped the terminal and printed
     * nothing. That is the "blank screen" half of the sysop's 2026-09-14
     * report; the pause that followed it belonged to the caller, which had
     * been told the screen was shown. Telling it the truth - shown, and it
     * was empty - is what the loader's hollow last resort is for: the screen
     * EXISTS (so nothing reports it missing) and there is nothing to draw.
     */
    if (screenFileDrawsNothing(filePath)) {
      screenFlowLog(screenName, `Hollow screen ${filePath}: nothing drawn`);
      session.lastScreenFilePath = filePath;
      return true;
    }
    /**
     * TP-5: the charset THIS screen's characters came off disk in, carried on
     * every emit that puts this screen's content on the wire. A byte-transport
     * caller whose own charset matches gets the file's exact bytes back; one
     * whose charset differs gets a transcode with the documented ASCII
     * fallback. Absent (a `.seq`, or a screen composed rather than read) means
     * "no source charset" and the caller's negotiated charset decides alone.
     * ANSI-only payloads below (a bare `\x1b[0m` reset, the More prompt's
     * cursor-up) carry nothing: they are ASCII in all three charsets.
     */
    const sourceAttrs: Readonly<OutputAttributes> | undefined =
      sourceEncoding ? fromCharset(sourceEncoding) : undefined;
    // Express.e:6567  MENU resets cmdShortcuts/shortcuts before checking for .keys
    session.lastScreenFilePath = filePath;

    // Clear screen BEFORE any processing (including inline MCI that sets inlineEmitted=true).
    // Must be early — the frame-buffer path also prepends the clear, but inlineEmitted screens
    // (CONF_BULL with ~CC_ dRE!WAll etc.) bypass that path entirely, leaving old door content visible.
    // The raw-PETSCII transport is decided once, here: it gates BOTH the
    // clear below and the render path underneath it.
    const rawPetscii = isPetscii && !!petsciiBuffer && sessionWantsPetscii(session);

    if (shouldClear) {
      if (rawPetscii) {
        // A C64 does not speak ANSI. The clear is $93 and it goes out through
        // the ONE PETSCII chunk emitter, so the render machine observes it -
        // otherwise the terminal is homed while the oracle still believes the
        // cursor is where the previous screen's art left it.
        emitPetsciiChunk(socket, session, { machine: petsciiMachineFor(session) }, PETSCII_CLS);
      } else if (!screenOpensWithItsOwnClear(content)) {
        socket.emit('ansi-output', clearScreenFor(session));
      }
    }

    // === PETSCII screens with a raw buffer go out as binary (Task 9) ===
    // The MCI/wipe/pagination pipeline below operates on `content` as ANSI
    // text (tokenizing escape sequences, splitting on \r\n, etc.) — running
    // raw PETSCII bytes (converted to a Unicode-PUA string only for the
    // legacy display path) through that machinery is meaningless at best
    // and corrupting at worst. When the loader carried the original buffer,
    // skip straight to the raw transport and let the frontend's
    // PetsciiMachine render it; when it didn't (defensive: older callers of
    // loadScreenFile's return shape), fall back to the legacy PUA emit.
    if (isPetscii) {
      screenFlowLog(screenName, `PETSCII screen ${filePath}: ${petsciiBuffer ? petsciiBuffer.length + ' raw bytes (petscii-bytes)' : content.length + ' PUA chars (legacy petscii-output)'}`);
      // express.e:6800-6806 - a screen whose FIRST byte is `~` is MCI. Such a
      // .seq goes through the inline sentinel walker, so `~SS_`/`~SR_`/`~CC_`
      // run as side effects in document order; anything else is art and is
      // painted as one frame.
      if (rawPetscii && petsciiBuffer![0] === PETSCII_MCI_GATE) {
        const { commands, paused } = await emitPetsciiScreenInline(socket, session, petsciiBuffer!, screenName);
        // A `.seq`'s `~XI`/`~XC_` run as an ANSI screen's do (executeScreenCommands
        // below): after a pause, or when the caller defers them, they wait in
        // the queue; otherwise they start once this screen has returned. They
        // were parsed out and dropped, so `~XISUBSCAN` did nothing on a C64.
        if (commands.length > 0) {
          if (!runCommands || paused) {
            session.queuedScreenCommands = commands;
          } else {
            session.pendingScreenCommand = new Promise<void>(resolve => {
              setImmediate(() => { void runScreenCommands(socket, session, commands).finally(resolve); });
            });
          }
        }
      } else {
        await emitPetsciiScreen(socket, session, screenData);
      }
      // BOTH arms return here. A .seq must never fall through to the 40-column
      // prose-reflow / ANSI-art-skip path below: that operates on `content`,
      // the legacy Unicode-PUA conversion, and reflowing it smears the art -
      // or, for an art-scoring screen, silently skips it and drops its MCI.
      return true;
    }

    // === RIP screens go out raw (express.e:6776-6780) ===
    // express.e's displayFile jumps past MCI, pauses and line handling for
    // a .rip file and puts the bytes on the wire as they are - a RIPscrip
    // terminal parses the !| commands inline. The web terminal needs the
    // explicit \x1b[1!..\x1b[2! pixel-mode framing instead (WEB_ deviation
    // modeled on internalCommandV, express.e:25679-25684): it arms the RIP
    // canvas overlay and drops back to text when the picture is done.
    if (isRip && session.ripMode) {
      screenFlowLog(screenName, `RIP screen ${filePath}: ${content.length} bytes framed raw`);
      socket.emit('ansi-output', '\x1b[1!' + content + '\x1b[2!\r\n');
      return true;
    }

    // === PETSCII text fallback (C64/40-col Task 7) ===
    // A petsciiMode session displaying a screen with no .seq variant:
    // prose reflows to the session width (below, after MCI parsing);
    // ANSI art is NEVER reflowed - skip it with the ASCII token. A
    // skipped art screen also skips its MCI commands: art screens carry
    // layout, not flow control, and smearing them is the worse failure.
    // Every non-PETSCII session gets 'passthrough' and both this branch
    // and the reflow hook below are no-ops, which is what keeps 80-column
    // output byte-identical.
    // A MENU is never skipped, however art-heavy it scores - see
    // petsciiTextScreenPlan's isMenu. `isMenuScreen` is the express.e-parity
    // check on the REQUESTED name; the per-security-level variants
    // (MENU250.TXT and friends) and any caller that hands displayScreen an
    // already-resolved path arrive through `filePath` instead, so both are
    // consulted.
    const isMenuTextScreen =
      isMenuScreen || path.basename(filePath).toUpperCase().startsWith('MENU');
    // A teletext page (.ttx, rendered .tti) is already forty columns, drawn
    // for this caller: it is neither folded nor adapted. Adapting one
    // rewrote its colours, dropped its mosaic shifts and skipped its codes -
    // JoinConf.ttx printed `~DT| ~TM|` and `~CL.` raw (sysop, 2026-10-05).
    const isTeletextPage = isTeletextFile(filePath) || isNativeTtiName(filePath);
    const petsciiTextPlan = isTeletextPage ? 'passthrough' : petsciiTextScreenPlan(content, session, isMenuTextScreen);
    if (petsciiTextPlan === 'art-skip') {
      /*
       * ADAPT IT BEFORE GIVING UP ON IT.
       *
       * The skip token was the honest answer while the only alternative was
       * a reflow, which smears a picture across a C64's forty columns. It is
       * not the honest answer now: the C64 door adapter's rule ladder has
       * been turning 80-column frames into 40-column ones for every 68K door
       * on this board since the adapter landed, and a BULLETIN - a table of
       * names and numbers - is exactly the shape `narrow` was written for.
       *
       * The sysop, 2026-09-15: "i still get a lot of warning during log in
       * and bulls etc". Those bulletins are written by the board itself at
       * every logoff (MultiTop, the achievements board, the news tick), so a
       * generated `.seq` beside them would freeze last week's numbers - the
       * adaptation has to happen HERE, when the screen is read.
       *
       * What comes back is ANSI, so everything downstream is unchanged: the
       * session's transducer turns it into Commodore glyphs on the way out.
       */
      const adapted = adaptAnsiScreenToForty(content);
      if (adapted) {
        socket.emit('ansi-output', adapted);
        screenFlowLog(screenName, `PETSCII session: 80-col ANSI art screen adapted to 40 columns (${filePath})`);
        session.lastScreenFilePath = filePath;
        return true;
      }
      // Nothing to adapt - an empty screen is the one case where the notice
      // serves the caller better than a blank.
      socket.emit('ansi-output', ANSI_ART_SKIPPED_NOTICE);
      screenFlowLog(screenName, `PETSCII session: 80-col ANSI art screen skipped (${filePath})`);
      session.lastScreenFilePath = filePath;
      /*
       * ANSWER **FALSE**: THE CALLER WAS NOT SHOWN THIS SCREEN.
       *
       * Sysop, 2026-09-15, with a photograph of a C64 screen holding nothing
       * but the skip token: "stuck here on live". He was not stuck - he was
       * already logged in on another node, and this is what he was told
       * about it.
       *
       * `login-post.service.ts:600` is express.e:29715-29727:
       *
       *     IF displayScreen(SCREEN_ONENODE) = FALSE
       *       aePuts('You are already logged into another node!')
       *
       * The fallback line exists precisely for a board whose ONENODE screen
       * does not reach the caller. Answering TRUE for a screen we DECLINED to
       * draw told that branch the caller had been informed, so the one
       * sentence that would have explained the disconnect was suppressed, and
       * the line went dead a half second later.
       *
       * The token is a notice, not a screen: it says why nothing was drawn.
       * Everything that asks "was the screen shown" - the fallback lines, the
       * display flow's `IF (displayScreen(X)) THEN doPause()` - now gets the
       * true answer, and a caller is not asked to press a key to dismiss
       * something they were never shown.
       */
      return false;
    }

    // [NEWLINE-DEBUG] Log raw content newlines
    const rawNewlines = (content.match(/\n/g) || []).length;
    const rawCRLF = (content.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] RAW CONTENT (${screenName}): ${content.length} bytes, ${rawNewlines} \\n, ${rawCRLF} \\r\\n`);

    screenDebug(`[displayScreen]  Screen loaded successfully: ${screenName}`);
    screenDebug(`[displayScreen] Content length: ${content.length} bytes`);
    screenDebug(`[displayScreen] PETSCII: ${isPetscii ? 'YES' : 'NO'}`);
    screenDebug(`[displayScreen] Render event: ${screenName} (node ${session.nodeId || 0})`);
    screenFlowLog(screenName, `Loaded ${screenName} file=${filePath} petscii=${isPetscii ? 'Y' : 'N'} bytes=${content.length}`);

    // Log screen display
    DebugLogger.screen(socket.id, `Displaying screen: ${screenName}`, {
      file: filePath,
      size: `${content.length} bytes`,
      isPetscii,
      conference: session.currentConf
    });

    // ANSI Animation Detection: Force 14.4kbps playback for animated screens
    // Animations need proper timing to play frame-by-frame, regardless of user's modem speed
    const isAnimation = !isPetscii && isAnsiAnimation(content);

    if (isAnimation) {
      // Save current modem state in session for later restoration
      session.savedModemState = {
        enabled: session.modemEmulationEnabled || false,
        bps: session.modemBps || 0
      };

      // Force 14.4kbps modem emulation for animation playback
      const { getModemEmulator } = require('../utils/modem-emulator.util');
      const modemEmulator = getModemEmulator(socket);
      modemEmulator.install();
      modemEmulator.enable(14400);
      session.modemEmulationEnabled = true;
      session.modemBps = 14400;

      // Disable AnsiBuffer batching when modem emulation is enabled
      const { getAnsiBuffer } = require('../utils/ansi-buffer.util');
      const ansiBuffer = getAnsiBuffer(socket);
      ansiBuffer.setFlushDelay(0);

      // The client is told the speed too. Since audit item 17 (2026-09-28)
      // the server meters every caller at a speed above 0 and the browser
      // stands aside when it hears one (ModemEmulator.serverPaces), so this
      // keeps the animation on ONE pacer at 14400. Before that the browser
      // metered the same characters at the caller's baud: measured 826 ms
      // intended, 5,774 ms at 2400 for `Screens/flt.txt`, slowest pacer
      // winning. Same shape as the door path, which emits `modem-speed` 0 on
      // entry and the saved speed on exit.
      socket.emit('modem-speed', 14400);

      console.log(`[ANSI-ANIM] Enabled 14.4kbps modem emulation for ${screenName} (was: ${session.savedModemState.bps} bps)`);
      DebugLogger.screen(socket.id, `ANSI animation detected - forced 14.4kbps playback`, {
        screen: screenName,
        previousSpeed: session.savedModemState.bps
      });
    }

    let parsed: string;
    let commands: any[] = [];
    let inlineEmitted = false;  // Track if parseMciCodes already emitted content inline

    // === Screen Wipe Detection (BEFORE MCI parsing) ===
    // Must detect wipe codes before parseMciCodes runs in inline mode,
    // because inline mode emits content directly and sets parsed='',
    // preventing later wipe detection.
    const earlyWipeResult = parseWipeMCI(content);
    // A caller of the board's own screens (menu doors, plan M7) names the wipe to play when the file has none.
    if (!earlyWipeResult.wipeType && opts?.fallbackWipe && WIPE_CODES[opts.fallbackWipe]) earlyWipeResult.wipeType = WIPE_CODES[opts.fallbackWipe];
    const wipeCodePresent = earlyWipeResult.wipeType !== null;
    // Effects-off for a C64 or teletext caller (C64/40-col Task 8 +
    // teletext-40): the wipe does not run at all on a PETSCII or
    // teletext session and the screen paints directly - the
    // frames are composed 80 columns wide and go straight at the socket,
    // past the reflow choke. The directive is still stripped below, so
    // `~WX` never prints. An ANSI session is unaffected at any width.
    const hasEarlyWipeAnimation = wipeCodePresent && wipeEffectsEnabled(session);
    // Use content without wipe code for MCI processing
    // The file's form feed is the Amiga clear: console.device clears on 0x0C,
    // an ANSI terminal only moves down a line, so it never goes out raw. It
    // becomes the caller's clear, unless shouldClear already sent that above.
    const openingFormFeed = content.match(OPENING_FORM_FEED);
    if (openingFormFeed && !shouldClear) {
      socket.emit('ansi-output', clearScreenFor(session));
    }
    let contentForMci = openingFormFeed
      ? openingFormFeed[1] + content.slice(openingFormFeed[0].length)
      : content;
    // When wipe is detected, disable inline mode so parsed contains full content for animation
    // (inline mode emits content directly and sets parsed='', breaking wipe animation)
    // Inline MCI stays disabled whenever a wipe code is present, animation or
    // not: the PETSCII reflow below needs the whole screen in `parsed` too.
    /*
     * LONG PLAIN ART PAGINATES, and it could not while it was drawn inline.
     *
     * Inline mode emits the screen DURING the parse, chunk by chunk, and the
     * only thing that can stop it is a `~SP` the artist typed. So a screen
     * with no `~SP` and more lines than the caller's screen simply scrolled:
     * `Bulletins/bull6.txt` is 38 lines, a phone is 25, and thirteen lines of
     * a last-callers bulletin went past before the caller could read them
     * (sysop, 2026-09-14, with a screenshot of its tail).
     *
     * The NON-inline path has always paginated - page, `(Pause)...More
     * (y/n/ns)?`, the `n` abort and the `ns` dump, all of it - so a screen
     * that needs paging takes that path instead.
     *
     * ONLY PLAIN ART. A screen carrying `~CC_`, `~SS_`, `~SR_`, `~SX_`, `~XI`
     * or `~SP` depends on inline semantics - commands run in document order,
     * includes draw where they stand, the pause carries its own remainder -
     * and those keep the inline path whatever their length. What is left is
     * art with at most a `~f` in it, which is what a long bulletin is.
     */
    const inlineOnlyCodes = /~(?:CC_|SS_|SR_|SX_|XI|SP)/.test(contentForMci);
    const artLines = contentForMci.split('\n').length;
    const callerLines = session?.screenHeight || 25;
    /*
     * THREE SCREENS ARE MEANT TO BE TALLER THAN THE GLASS.
     *
     * The connect splash, the title and the logon screen are each ONE PIECE
     * OF ART, drawn to run past the bottom - "we already format it so it
     * looks nice at 80 columns, its supposed to be tall" (the sysop,
     * 2026-09-14, about BBSTITLE, which is 68 lines on this board).
     * Paginating those puts `(Pause)...More(y/n/ns)?` through the middle of a
     * logo, which is what the first version of this did and what he reported
     * twice.
     *
     * A BULLETIN is the opposite case and the one this exists for: it is text
     * to be READ, and `Bulletins/bull6.txt` is 38 lines against a 25-row
     * phone. It still paginates - an included file is displayed under its own
     * path and never under the name of the screen that included it, so the
     * `~SS_BBS:bulletins/bull6.txt` inside LOGON is untouched by LOGON's
     * exemption.
     */
    /*
     * `~NS` IS HOW A SCREEN SAYS IT HIMSELF. express.e:5740-5742 sets
     * nonStopDisplayFlag - "no pauses" - so a screen that carries it is one
     * piece of art like the title, whatever its name. `~NSF` is this port's
     * older spelling of the same thing (mci-pre-passes.ts) and still counts.
     * The list above is the board's own four; an artist's tall screen needs
     * no code change.
     */
    /*
     * `nonStop` is the caller saying it: `B 12 NS` (express.e:24626, :24643 set
     * nonStopDisplayFlag from the NS parameter before displayFile).
     */
    const neverPaginates = SCREENS_NEVER_PAGINATE.has(screenCatalogueName(screenName))
      || /~NSF?(?![A-Za-z0-9_])/.test(contentForMci)
      || opts?.nonStop === true
      || nonStopScope.has(session);
    const needsPaging = !neverPaginates && !inlineOnlyCodes && artLines > callerLines;
    const mciSocket = (wipeCodePresent || needsPaging) ? undefined : socket;
    if (needsPaging && !wipeCodePresent) {
      screenDebug(`[displayScreen] ${screenName}: ${artLines} lines over ${callerLines} - paginating instead of streaming inline`);
    }
    if (wipeCodePresent) {
      contentForMci = earlyWipeResult.content; // Remove wipe code from content before MCI processing
      console.log(`[WIPE-EARLY] Detected wipe ${earlyWipeResult.wipeType} in ${screenName}, disabled inline mode`
        + (hasEarlyWipeAnimation ? '' : ' (effects off for this session)'));
    }
    // The clear skipped above trusted the screen's own `~f`. A tall or wiped
    // screen renders outside the inline walker, where `~f` is always the hard
    // ESC[2J: on the web terminal that erases the history the scrolling clear
    // exists to keep. So here the caller's clear goes out and the `~f` goes.
    if (shouldClear && mciSocket === undefined && screenOpensWithItsOwnClear(content)) {
      socket.emit('ansi-output', clearScreenFor(session));
      contentForMci = contentForMci.replace(/^~f\|?/, '');
    }

    // === MCI Guard: allowMCI check (express.e:6800-6806) ===
    // MCI processing is only enabled when the file's first line starts with '~'.
    // Files that don't start with '~' are displayed as raw text with no MCI substitution.
    const allowMCI = mciGateOpen(contentForMci);

    // eventName is used throughout the display path after MCI processing
    const eventName = isPetscii ? 'petscii-output' : 'ansi-output';

    if (!allowMCI) {
      // Raw display: no MCI processing. Return content directly as parsed output.
      // EXCEPT we still strip bare `~SP` directives — they're control codes, not
      // displayable text, and frequently appear at the end of art/ANSI files
      // (e.g. Conf*/Screens/uprough.txt) intended to pause after the art renders.
      // Without this strip, raw display emits "~SP" literally to the user.
      screenDebug(`[displayScreen] allowMCI=FALSE for ${screenName} (first line does not start with '~'), skipping MCI`);
      let rawHasPause = false;
      const stripped = contentForMci.replace(/~SP(\s|$)/g, () => {
        rawHasPause = true;
        return '';
      });
      parsed = stripped;
      commands = [];
      session.lastScreenHadPause = rawHasPause;
      if (rawHasPause) {
        screenDebug(`[displayScreen] Raw-display: stripped trailing ~SP, marking pause`);
      }
    } else {

    // === ~SP (Soft Pause) Segment Processing ===
    // express.e:5455-5461 - ~SP pauses IMMEDIATELY at each occurrence
    // Split content at ~SP boundaries and process one segment at a time
    // Each segment contains content up to (but not including) the ~SP code

    // Check if raw content has ~SP codes (before parsing removes them)
    // express.e:5455-5461 - ~SP causes immediate pause when followed by terminator
    // Terminators: whitespace, | (mciterminator), . (SP.), or end of string
    const hasSoftPauses = /~SP(?:\s|\||\.|$)/.test(contentForMci);

    if (isFlowScreen && hasSoftPauses && !session.screenSegments) {
      // Split content at ~SP boundaries
      // express.e parses synchronously and calls doPause() at each ~SP
      // We achieve the same by splitting into segments and processing with pauses between
      const segments = contentForMci.split(/~SP(?:\s|\||\.)/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

console.log(`[SEGMENT] SETUP: ${segments.length} segments for ${screenName}`);
      segments.forEach((s, i) => console.log(`[SEGMENT]   ${i}: "${s.substring(0, 60).replace(/\n/g, '\\n')}..."`));
      screenDebug(`[displayScreen] ~SP segment processing: ${segments.length} segments for ${screenName}`);

      if (segments.length > 1) {
        // Store remaining segments for later processing
        session.screenSegments = {
          segments: segments.slice(1),  // Everything after first segment
          currentIndex: 0,
          screenName,
          inlineMode: true,
          eventName,
          isFlowScreen: true,
          sourceAttrs,
        };

        // Process only the first segment now
        screenDebug(`[displayScreen] Processing segment 0/${segments.length}: ${segments[0].substring(0, 50)}...`);
        const segmentResult = await parseMciCodes(segments[0], session, 'AmiExpress-Web', 'Sysop', 'The Internet', mciSocket);
        parsed = segmentResult.parsed;
        commands = segmentResult.commands;
        if (segmentResult.slowmo !== undefined) session.slowmo = segmentResult.slowmo;
        if (segmentResult.slowmoCount !== undefined) session.slowmoCount = segmentResult.slowmoCount;
        if (segmentResult.inlineEmitted) inlineEmitted = true;

        // express.e:5455-5461 - Handle pendingInlineContent from ~SP in inline mode
        // If inline processing found ~SP, prepend remaining content to segment list
        if (segmentResult.pendingInlineContent && segmentResult.pendingInlineContent.length > 0) {
          session.screenSegments!.segments.unshift(segmentResult.pendingInlineContent);
          console.log(`[~SP] Prepended pendingInlineContent to segments (${segmentResult.pendingInlineContent.length} bytes)`);
        }

        // [NEWLINE-DEBUG] Log parsed segment newlines
        const parsedSegmentNewlines = (parsed.match(/\n/g) || []).length;
        const parsedSegmentCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER parseMciCodes SEGMENT 0: ${parsed.length} bytes, ${parsedSegmentNewlines} \\n, ${parsedSegmentCRLF} \\r\\n`);

        // DON'T set lastScreenHadPause here - let pauseDisplayFlow handle the pause
        // to avoid double pause prompts. screenSegments is already set for subsequent segments.
        // express.e:28556-28557: IF (displayScreen(SCREEN_BULL)) THEN doPause()
        session.lastScreenHadPause = false;

        // Continue to display this segment (no pause from displayScreen, pauseDisplayFlow will handle it)
        // Fall through to normal display logic below
      } else {
        // Only one segment (or ~SP at end), process normally
        const result = await parseMciCodes(contentForMci, session, 'AmiExpress-Web', 'Sysop', 'The Internet', mciSocket);
        parsed = result.parsed;
        commands = result.commands;
        if (result.slowmo !== undefined) session.slowmo = result.slowmo;
        if (result.slowmoCount !== undefined) session.slowmoCount = result.slowmoCount;
        if (result.inlineEmitted) inlineEmitted = true;
        session.lastScreenHadPause = result.hasPause;

        // express.e:5455-5461 - Handle pendingInlineContent from ~SP in inline mode
        if (result.pendingInlineContent && result.pendingInlineContent.length > 0) {
          session.screenSegments = {
            segments: [result.pendingInlineContent],
            currentIndex: 0,
            screenName,
            inlineMode: true,
            eventName,
            isFlowScreen: true,
            sourceAttrs,
          };
          console.log(`[~SP] Stored pendingInlineContent in single segment branch (${result.pendingInlineContent.length} bytes)`);
        }

        // [NEWLINE-DEBUG] Log parsed content newlines (single segment case)
        const parsedNewlines = (parsed.match(/\n/g) || []).length;
        const parsedCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER parseMciCodes SINGLE: ${parsed.length} bytes, ${parsedNewlines} \\n, ${parsedCRLF} \\r\\n`);
      }
    } else {
      // Normal processing (no ~SP segments or not a flow screen)
      // Always parse MCI so ~SS_ and other codes work even in PETSCII screens
      // Pass mciSocket (undefined when wipe detected) to control inline mode
      const result = await parseMciCodes(contentForMci, session, 'AmiExpress-Web', 'Sysop', 'The Internet', mciSocket);
      parsed = result.parsed;
      commands = result.commands;
      if (result.slowmo !== undefined) {
        session.slowmo = result.slowmo;
      }
      if (result.slowmoCount !== undefined) {
        session.slowmoCount = result.slowmoCount;
      }
      if (result.inlineEmitted) inlineEmitted = true;
      session.lastScreenHadPause = result.hasPause;

      // express.e:5455-5461 - Handle pendingInlineContent from ~SP in inline mode
      // When ~SP is found during inline MCI processing, remaining content is returned here
      // Store it in screenSegments for processing after pause is dismissed
      if (result.pendingInlineContent && result.pendingInlineContent.length > 0) {
        session.screenSegments = {
          segments: [result.pendingInlineContent],
          currentIndex: 0,
          screenName,
          inlineMode: true,
          eventName,
          isFlowScreen: true,
          sourceAttrs
        };
        console.log(`[~SP] Stored pendingInlineContent (${result.pendingInlineContent.length} bytes) for processing after pause`);
      }

      // [NEWLINE-DEBUG] Log parsed content newlines (normal case)
      const parsedNormalNewlines = (parsed.match(/\n/g) || []).length;
      const parsedNormalCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER parseMciCodes NORMAL: ${parsed.length} bytes, ${parsedNormalNewlines} \\n, ${parsedNormalCRLF} \\r\\n`);
    }

    } // end else (allowMCI) — express.e:6800-6806

    // Log MCI parsing results
    if (commands.length > 0) {
      DebugLogger.mciSuccess(socket.id, `MCI codes found in ${screenName}`, {
        commandCount: commands.length,
        commands: commands  // Commands are strings, not objects
      });
    }

    // Add ESC prefix to bare ANSI sequences only for ANSI paths
    if (!isPetscii) {
      parsed = addAnsiEscapes(parsed);
      // [NEWLINE-DEBUG] Log after addAnsiEscapes
      const afterAnsiNewlines = (parsed.match(/\n/g) || []).length;
      const afterAnsiCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER addAnsiEscapes: ${parsed.length} bytes, ${afterAnsiNewlines} \\n, ${afterAnsiCRLF} \\r\\n`);
    }

    // Normalize line endings for terminal display
    parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    // PETSCII text fallback: reflow the parsed prose to the session width
    // (wrapForSession is identity at >=80 and passes positioned payloads).
    // NOTE the seam: the art gate above read the RAW, pre-MCI content, while
    // this runs on the expanded text. An MCI code that introduces cursor
    // motion therefore makes wrapForSession a no-op here, and a screen
    // planned as 'reflow' would go out unwrapped rather than smeared - the
    // safe direction, and no screen on this board does it today.
    if (petsciiTextPlan === 'reflow') {
      parsed = wrapForSession(parsed, session);
    }

    // [NEWLINE-DEBUG] Log after line ending normalization (CRITICAL)
    const afterNormalizeNewlines = (parsed.match(/\n/g) || []).length;
    const afterNormalizeCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER NORMALIZE: ${parsed.length} bytes, ${afterNormalizeNewlines} \\n, ${afterNormalizeCRLF} \\r\\n`);

    // For flow screens (BULL/NODE_BULL/CONF_BULL/LOGON/etc.), ensure the frame ends
    // with a newline so the pause prompt does not collide with the final line of content.
    if (isFlowScreen && !parsed.endsWith('\r\n')) {
      parsed += '\r\n';
    }

    // Screen Wipe Animations (~WM, ~WH, ~WV, ~WS, ~WC, ~WR, ~WB, ~WN, ~WT, ~WE, ~WX)
    // Use early detection result (detected BEFORE MCI parsing to handle inline mode)
    const hasWipeAnimation = hasEarlyWipeAnimation;
    const wipeType = earlyWipeResult.wipeType;
console.log(`[WIPE-DEBUG] Screen: ${screenName}, hasWipeAnimation: ${hasWipeAnimation}, wipeType: ${wipeType}`);
    if (hasWipeAnimation) {
      screenDebug(`[displayScreen] Screen wipe detected: ${wipeType}`);
      DebugLogger.mci(socket.id, `Screen wipe animation: ~W${wipeType?.toUpperCase().charAt(0)}`, {
        wipeType: wipeType
      });
    }

    // Auto-paginate long screens (e.g., >25 lines like real AmiExpress More prompt)
    const pageHeight = session?.screenHeight || 25;
    const lines = parsed.split(/\r\n|\n/);
    const pageSize = Math.max(1, pageHeight - 1); // leave room for prompt line

    // [NEWLINE-DEBUG] Log line splitting
console.log(`[NEWLINE-DEBUG] SPLIT INTO LINES: ${lines.length} lines`);
console.log(`[NEWLINE-DEBUG] FIRST 5 LINES:`, lines.slice(0, 5).map((line, i) => `  [${i}] len=${line.length}: ${line.substring(0, 80)}`).join('\n'));

    // Note: eventName defined earlier for ~SP segment processing
    const slowmoSpeed = session.slowmo || 0;
    let slowmoCount = session.slowmoCount || 0;

    // emitWithModem handles modem speed throttling dynamically by checking session state each call

    const emitWithModem = async (payload: string, attrs: Readonly<OutputAttributes> | undefined = sourceAttrs) => {
      // When we do our OWN throttling, use directEmit to bypass ModemEmulator (avoid double-throttling)
      // When we DON'T throttle, use socket.emit so ModemEmulator can intercept if it's enabled
      const directEmit = (socket as any)._directEmit || socket.emit.bind(socket);

      /*
       * NOTHING MAY OVERTAKE WHAT IS ALREADY QUEUED.
       *
       * `_directEmit` goes straight to the wire, under the ModemEmulator's
       * queue - which is right, because this path does its OWN pacing and
       * must not be throttled twice. What it must not do is JUMP: with
       * emulation on, the prompt or the screen before this one can still be
       * draining, and a direct write lands in front of it. That is the
       * "output arrives out of order" a caller sees at 56k and never at full
       * speed, where the queue is always empty (the sysop, 2026-09-24).
       *
       * So the queue is drained first, at the caller's own modem speed. The
       * animation starts a beat later and in the right order.
       */
      const pacer = (socket as any)._modemEmulator;
      if (pacer?.hasPendingData?.()) await pacer.drain();

      // Check CURRENT session state for modem emulation (not captured value)
      // This allows the user to enable modem emulation mid-session
      const currentModemEnabled = session.modemEmulationEnabled;
      const currentModemBps = currentModemEnabled ? (session.modemBps || session.user?.baud || 0) : 0;
      const currentModemActive = currentModemBps > 0;
      const currentBytesPerSec = currentModemActive ? Math.max(1, Math.floor(currentModemBps / 10)) : 0;

      if (!currentModemActive || currentBytesPerSec <= 0) {
        // NOT doing our own throttling - use socket.emit so ModemEmulator can intercept
        socket.emit(eventName, payload, attrs);
        return;
      }
      // Tokenize ANSI so we never split escape sequences
      const tokens: string[] = [];
      const ansiRegex = /\x1b\[[0-9;?]*[A-Za-z]/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = ansiRegex.exec(payload)) !== null) {
        if (match.index > lastIndex) {
          tokens.push(payload.slice(lastIndex, match.index));
        }
        tokens.push(match[0]); // keep escape as a unit
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < payload.length) {
        tokens.push(payload.slice(lastIndex));
      }

      const start = process.hrtime.bigint();
      let sentBytes = 0;
      const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

      for (const tok of tokens) {
        const buf = Buffer.from(tok, 'utf-8');
        const isEscape = tok.startsWith('\x1b');
        if (isEscape) {
          directEmit(eventName, tok, attrs);
          continue;
        }
        let offset = 0;
        while (offset < buf.length) {
          const now = process.hrtime.bigint();
          const elapsedMs = Number(now - start) / 1_000_000;
          const allowed = Math.max(0, Math.floor(currentBytesPerSec * (elapsedMs / 1000)) - sentBytes);
          if (allowed <= 0) {
            await sleep(2);
            continue;
          }
          const wanted = Math.min(allowed, buf.length - offset, 256);
          // On a character boundary: this budget is in bytes, and a cut inside
          // a multi-byte character sends two halves that both render as U+FFFD.
          const end = utf8ChunkEnd(buf, offset, wanted);
          directEmit(eventName, buf.subarray(offset, end).toString('utf-8'), attrs);
          sentBytes += end - offset;
          offset = end;
        }
      }
    };

    const emitPage = async (startIdx: number, endIdx: number, prompt: boolean) => {
      const chunk = lines.slice(startIdx, endIdx).join('\r\n');
      const promptLine = prompt ? '\r\n(Pause)...More(y/n/ns)? ' : '';
      const prefix = ''; // shouldClear already sent early before MCI processing
      await emitWithModem(prefix + chunk + promptLine);
    };

    screenFlowLog(
      screenName,
      `Parsed ${screenName}: event=${eventName} commands=${commands.length} pause=${session.lastScreenHadPause ? 'Y' : 'N'} pages=${lines.length}`
    );

    const executeScreenCommands = () => {
      if (commands.length === 0) {
        session.pendingScreenCommand = undefined;
        session.screenCommandResolver = null;
        return;
      }

      if (!runCommands) {
        session.queuedScreenCommands = commands;
        session.pendingScreenCommand = undefined;
        session.screenCommandResolver = null;
        screenFlowLog(screenName, `Queued ${commands.length} screen command(s) for deferred execution`);
        return;
      }

      screenDebug(`[displayScreen] ==========================================`);
      screenDebug(`[displayScreen] EXECUTING ${commands.length} COMMANDS FROM SCREEN FILE: ${screenName}`);
      screenDebug(`[displayScreen] Commands:`, commands);
      screenDebug(`[displayScreen] ==========================================`);
      screenFlowLog(screenName, `Executing ${commands.length} command(s) from ${screenName}`);
      session.pendingScreenCommand = new Promise<void>(resolve => {
        session.screenCommandResolver = resolve;
      });

      setImmediate(async () => {
        session.executingScreenCommand = true;
        try {
          for (let i = 0; i < commands.length; i++) {
            const commandStr = commands[i];
            screenDebug(`[displayScreen] ------------------------------------------`);
            screenDebug(`[displayScreen] EXECUTING COMMAND ${i + 1}/${commands.length}:`, commandStr);
            screenDebug(`[displayScreen] Command type:`, commandStr.includes(':') ? 'DOOR PATH' : 'BBSCMD');
            try {
              screenDebug(`[displayScreen] Calling handleCommand with:`, commandStr);
              const result = await runScreenCommand(socket, session, commandStr);
              screenDebug(`[displayScreen]  Command completed:`, commandStr, 'Result:', result);
            } catch (error) {
console.error(`[displayScreen]  ERROR executing command ${commandStr}:`, error);
console.error(`[displayScreen] Error stack:`, (error as Error).stack);
              SysopDebugUtil.debug(
                socket,
                session,
                'SCREEN',
                `Error executing screen command: ${commandStr}`,
                { error: (error as Error).message, stack: (error as Error).stack },
                DebugSeverity.CRITICAL
              );
            }
          }
          screenDebug(`[displayScreen] ==========================================`);
          screenDebug(`[displayScreen] ALL COMMANDS COMPLETED FROM: ${screenName}`);
          screenDebug(`[displayScreen] ==========================================`);
          screenFlowLog(screenName, `Completed ${commands.length} command(s) from ${screenName}`);
        } finally {
          session.executingScreenCommand = false;
          if (session.screenCommandResolver) {
            session.screenCommandResolver();
            session.screenCommandResolver = null;
            session.pendingScreenCommand = undefined;
          }
        }
      });
    };

    const emitSlowmoFrame = async (text: string) => {
      // Match express.e throughput for positive speeds: 60*speed bytes per 10ms => 6*speed bytes/ms.
      // Web-only extension: negative speeds map to slower-than-SMO1 fixed scalars.
      let bytesPerMs: number;
      if (slowmoSpeed > 0) {
        bytesPerMs = 6 * slowmoSpeed;
      } else {
        const scaleMap: Record<number, number> = {
          [-1]: 4, // ~1.5 KB/s
          [-2]: 8, // ~0.75 KB/s
          [-3]: 12 // ~0.5 KB/s
        };
        const scale = scaleMap[slowmoSpeed] || 4;
        bytesPerMs = 6 / scale;
      }
      // If modem emulation is active and its link is slower than this slowmo rate,
      // cap to modem speed; if slowmo is already slower, leave it untouched.
      // Check CURRENT session state (not captured value)
      const currentModemBps = session.modemEmulationEnabled ? (session.modemBps || session.user?.baud || 0) : 0;
      if (currentModemBps > 0) {
        const currentBytesPerSec = Math.max(1, Math.floor(currentModemBps / 10));
        const modemBytesPerMs = currentBytesPerSec / 1000;
        if (modemBytesPerMs < bytesPerMs) {
          bytesPerMs = modemBytesPerMs;
        }
      }

      // Pad with a final newline so the last rendered line scrolls offscreen for a cleaner edge
      const streamText = text + '\r\n';
      const buffer = Buffer.from(
        // A screen prints at the cursor (express.e displayFile, express.e:6539).
        // A clearing screen got its clear and home early; no move here.
        HIDE_CURSOR + streamText + '\x1b[0m' + SHOW_CURSOR,
        'utf-8'
      );
      let offset = 0;
      let carry = 0;
      let last = Date.now();
      const maxPerFrame = 128; // cap burst size to avoid chunky frames

      const step = async (): Promise<void> => {
        const now = Date.now();
        const dt = Math.max(1, now - last);
        last = now;
        let budget = bytesPerMs * dt + carry;
        let toSend = Math.floor(budget);
        if (toSend < 1) toSend = 1;
        carry = budget - toSend;
        if (toSend > maxPerFrame) {
          carry += toSend - maxPerFrame;
          toSend = maxPerFrame;
        }
        if (offset + toSend > buffer.length) {
          toSend = buffer.length - offset;
          carry = 0;
        }
        // On a character boundary, for the same reason as the modem path.
        const end = utf8ChunkEnd(buffer, offset, toSend);
        socket.emit(eventName, buffer.subarray(offset, end).toString('utf-8'), sourceAttrs);
        offset = end;
        if (offset < buffer.length) {
          await new Promise(resolve => setTimeout(resolve, 16)); // ~60fps pacing
          return step();
        }
      };

      await step();
      session.slowmoCount = 0;
    };

    // express.e shows every screen through displayFile, which pauses per
    // lineCount (flagPause/checkForPause, express.e:28025/5180): a
    // multi-screen BULL pauses mid-content, not just once at the end.
    // Skipping pagination for flow screens scrolled long BULL/CONF_BULL
    // past with no pause at all. Short flow screens (MENU, BBSTITLE) never
    // reach pageSize, so this changes nothing for them.
    const allowPagination = slowmoSpeed === 0;

    /*
     * AN EMPTY SCREEN IS NOT STREAMED.
     *
     * The slow-mo frame wraps the screen in HIDE_CURSOR + ESC[H ... so it
     * paints from the top of the glass. For a screen with nothing in it that
     * is all it does: it homes the cursor, and the next thing the board
     * prints - the Username prompt, right after Logon - lands over whatever
     * was on screen, which is the title that was just drawn (sysop,
     * 2026-09-13: "the prompt is there as well it should be at the bottom").
     *
     * Logon.ttx and Logon.txt are both `~\n` on this board: deliberately
     * empty, and deliberately still a screen, so the whitespace path below
     * keeps emitting exactly what it always did. Only the cursor move goes.
     */
    const streamHasContent = AnsiUtil.stripAnsiForPlainText(parsed).trim().length > 0;

    /*
     * Was a prompt ALREADY on the caller's screen when this screen arrived?
     *
     * Taken here, before either pause branch below installs a gate of its own -
     * asking after the install would always answer "yes, mine". This is the
     * question the caller's eyes ask: is there an unanswered
     * `(Pause)...Space To Resume:` up there already?
     */
    const pauseAlreadyShowing = aPausePromptIsShowing(session);

    // Skip slowmo if wipe animation is active - wipes handle their own timing
    if (slowmoSpeed !== 0 && !hasWipeAnimation && streamHasContent) {
      await emitSlowmoFrame(parsed);

      if (session.lastScreenHadPause) {
        session.paginatedScreen = {
          lines: [''], // no additional content, just hold for a key
          nextIndex: 1,
          pageSize: 1,
          eventName,
          commands,
          kind: 'doPause',
        };
        if (commands.length > 0) {
          session.queuedScreenCommands = commands;
          screenFlowLog(screenName, `Queued ${commands.length} command(s) to run after pause`);
        }
        if (pauseAlreadyShowing) {
        } else {
          emitPrompt(socket, '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');
        }
        restoreModemState(socket, session);
        return true;
      }

      executeScreenCommands();
      session.slowmo = 0;
      session.slowmoCount = 0;
      restoreModemState(socket, session);
      return true;
    }

  // Skip pagination if wipe animation is active - wipes handle their own display
  // A screen that is one piece of art (neverPaginates, above) is not paged on
  // this path either: plain art with no `~` line has MCI off and lands here.
  if (allowPagination && !neverPaginates && !session.lastScreenHadPause && lines.length > pageHeight && !hasWipeAnimation) {
    session.paginatedScreen = {
      lines,
      nextIndex: pageSize,
      pageSize,
      eventName,
      commands,
      kind: 'bbs',
      sourceAttrs,
    };
    if (commands.length > 0) {
      session.queuedScreenCommands = commands;
    }
    await emitPage(0, pageSize, true);
    session.lastScreenHadPause = true;
    restoreModemState(socket, session);
    return true;
  }

    // Screen Wipe Animation Playback
    // If a wipe animation is detected, generate and send frames instead of direct output
console.log(`[WIPE-CHECK] hasWipeAnimation=${hasWipeAnimation}, wipeType=${wipeType}, screenName=${screenName}`);
    if (hasWipeAnimation && wipeType) {
console.log(`[WIPE] Starting wipe animation: ${wipeType}`);
      screenDebug(`[displayScreen] Playing wipe animation: ${wipeType}`);

      // Generate animation frames
      // AT THE CALLER'S WIDTH. The grid is a model of his terminal, so a C64
      // gets a 40-column model and a 40-column reveal; `parsed` has already
      // been folded to that width by the reflow above, so the two agree.
      const wipeFrames = getWipeFrames(wipeType, parsed, sessionColumns(session));
console.log(`[WIPE] Generated ${wipeFrames.length} frames`);

      await playWipeFrames(socket, wipeFrames, { eventName, sourceEncoding });

console.log(`[WIPE] Animation complete: ${wipeFrames.length} frames`);
      screenDebug(`[displayScreen] Wipe animation complete: ${wipeFrames.length} frames`);
    } else if (!inlineEmitted) {
      // Normal display: Double-buffered display
      // Build complete frame buffer before sending
      // This prevents tearing and visible redraws by sending everything atomically
      // express.e:6845 - Always reset colors after displaying a file with aePuts('[0m')

      // Skip display entirely if content is empty (e.g., empty BBSTITLE.TXT)
      // This prevents cursor-to-HOME from disrupting prior display (like FRONTEND)
      // express.e behavior: empty screen files display nothing, cursor stays where it was
      const trimmedContent = parsed.replace(/[\x1b\x9b]\[[0-9;]*[A-Za-z]/g, '').trim();
      if (trimmedContent.length === 0 && !shouldClear) {
        screenDebug(`[displayScreen] Empty content for ${screenName}, skipping display`);
        // Just reset colors to prevent bleed, don't move cursor
        socket.emit(eventName, '\x1b[0m');
      } else {
        const frameBuffer =
          // A screen prints at the cursor (express.e displayFile, express.e:6539).
          // A clearing screen got its clear and home early (before MCI); a
          // move to home here painted a non-clearing screen over the last one.
          HIDE_CURSOR +      // Hide cursor
          parsed +           // Screen content
          '\x1b[0m' +        // Reset colors (express.e:6845) - prevents color bleed to prompts
          SHOW_CURSOR;       // Show cursor

        // Send entire frame in one atomic operation
        // Use 'petscii-output' event for PETSCII content (triggers PetMe64 font)
        screenDebug(`[displayScreen] Emitting ${eventName} event`);
        await emitWithModem(frameBuffer);
      }
    } else {
      // Content was already emitted inline by parseMciCodes (express.e inline mode)
      // Just emit color reset to prevent bleed, don't overwrite with frame buffer
      screenDebug(`[displayScreen] Content already emitted inline, skipping frame buffer`);
      socket.emit(eventName, '\x1b[0m');
    }

    // If screen requested a pause (e.g., ~SP), set a minimal pagination state
    // so a keypress is required before continuing, without printing the raw MCI
    if (session.lastScreenHadPause) {
      session.paginatedScreen = {
        lines: [''], // no additional content, just hold for a key
        nextIndex: 1,
        pageSize: 1,
        eventName,
        commands,
        kind: 'doPause',
      };
      // Queue commands for execution after pause is dismissed
      if (commands.length > 0) {
        session.queuedScreenCommands = commands;
        screenFlowLog(screenName, `Queued ${commands.length} command(s) to run after pause`);
      }
      if (pauseAlreadyShowing) {
      } else {
        emitPrompt(socket, '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');
      }
      await emitWithModem(''); // ensure promise chain consistent
      restoreModemState(socket, session);
      return true;
    }

    executeScreenCommands();
    session.slowmo = 0;
    session.slowmoCount = 0;

    // Every OTHER way out of displayScreen restores the animation's forced
    // 14.4k (the two pause branches above, the pagination branch, the
    // segment branches in startPagination) - these two did not, so a screen
    // that painted in one page with no pause left the session pinned at
    // 14400 until some later screen happened to pause. Harmless while only
    // the server throttle was forced; not harmless now that the forced
    // speed is announced to the CLIENT pacer, which would otherwise stay at
    // 14400 for the rest of the call. restoreModemState clears
    // savedModemState first, so calling it on every path cannot
    // double-restore.
    restoreModemState(socket, session);

    return true;
  } else {
    // Screen not found - return false silently (matches express.e behavior)
    // Caller decides whether to show error or skip
    if (!silent) {
console.error(`[displayScreen] ========================================`);
console.error(`[displayScreen]  SCREEN FILE NOT FOUND: ${screenName}`);
console.error(`[displayScreen] Conference ID: ${session.currentConf || 'none'}`);
console.error(`[displayScreen] (Detailed path attempts logged by loadScreenFile above)`);
console.error(`[displayScreen] ========================================`);
      SysopDebugUtil.debug(
        socket,
        session,
        'SCREEN',
        `Screen file not found: ${screenName}`,
        { conferenceId: session.currentConf || 'none' },
        DebugSeverity.CRITICAL
      );
      // No line on the caller's screen: express.e's displayScreen just
      // answers FALSE (6539-6655). notifySysop wrote to the CALLER's socket.
    }
    session.lastScreenFilePath = undefined;
    return false;
  }
}

/**
 * Execute any queued screen commands (used when displayScreen was called with runCommands=false)
 */
export async function runQueuedScreenCommands(socket: any, session: BBSSession): Promise<void> {
  const commands = session.queuedScreenCommands || [];
  if (commands.length === 0) {
    return;
  }

  const commandsHash = commands.join('|');
  if (commandsHash && session.lastScreenCommandsHash === commandsHash) {
    session.queuedScreenCommands = [];
    return;
  }
  session.lastScreenCommandsHash = commandsHash;

  try {
    await runScreenCommands(socket, session, commands);
  } finally {
    session.queuedScreenCommands = [];
  }
}

/**
 * Run screen-triggered commands (`~CC_`, `~XC_`, `~XI`) NOW.
 *
 * Split out of runQueuedScreenCommands so a screen SEGMENT can run the
 * commands it carries. Deliberately WITHOUT that function's
 * `lastScreenCommandsHash` guard: the hash is never reset, so a second join of
 * the same conference would find the same command list and silently skip it -
 * which is exactly the bug this split exists to fix, one layer down.
 */
export async function runScreenCommands(
  socket: any,
  session: BBSSession,
  commands: string[],
): Promise<void> {
  if (commands.length === 0) {
    return;
  }

  session.pendingScreenCommand = new Promise<void>(resolve => {
    session.screenCommandResolver = resolve;
  });
  session.executingScreenCommand = true;

  try {
    for (let i = 0; i < commands.length; i++) {
      const commandStr = commands[i];
      screenDebug(`[displayScreen] ------------------------------------------`);
      screenDebug(`[displayScreen] EXECUTING QUEUED COMMAND ${i + 1}/${commands.length}:`, commandStr);
      try {
        await runScreenCommand(socket, session, commandStr);
      } catch (error) {
console.error(`[displayScreen]  ERROR executing queued command ${commandStr}:`, error);
        SysopDebugUtil.debug(
          socket,
          session,
          'SCREEN',
          `Error executing queued command: ${commandStr}`,
          { error: (error as Error).message },
          DebugSeverity.CRITICAL
        );
      }
    }
  } finally {
    session.executingScreenCommand = false;
    if (session.screenCommandResolver) {
      session.screenCommandResolver();
      session.screenCommandResolver = null;
      session.pendingScreenCommand = undefined;
    }
  }
}

/**
 * One command a screen runs (`~CC_x|`, `~XC_x||`), through the board's ONE
 * dispatcher - the same `processCommand` the inline walker and the menu use,
 * with the SYSCMD tier on, as express.e:5561 runs it (`processSysCommand(cmd,
 * TRUE)`).
 *
 * This path used to go to command-handler/core.ts and on to
 * command-execution.ts, a second copy of the command set that had drifted:
 * it cleared the screen before every command (wiping the art the screen had
 * just drawn), never searched SYSCMD, had no WHO, read and posted the wrong
 * base in custom-msgbase conferences, and lacked the port's newer commands
 * (express.e parity survey, 2026-09-29). A `DOORS:` helper path (WHO2's
 * NI/NO node tracking) goes to the board's handleCommand, which runs it; the
 * second dispatcher and its copy of that are gone.
 */
export async function runScreenCommand(socket: any, session: BBSSession, commandStr: string): Promise<unknown> {
  const trimmed = (commandStr || '').trim();
  if (/^DOORS:/i.test(trimmed)) {
    const { handleCommand } = require('./command.handler');
    return handleCommand(socket, session, trimmed);
  }
  const [command, ...rest] = trimmed.toUpperCase().split(/\s+/);
  if (!command) return undefined;
  const { processCommand } = require('./command.handler');
  return processCommand(socket, session, command, rest.join(' '), true);
}

/**
 * Start pagination for arbitrary lines (non-screen MCI output).
 */
/**
 * Restore modem state after animation playback
 * Called when screen display completes, pagination ends, or segment processing finishes
 * CRITICAL: Waits for modem queue to drain before disabling, preserving animation timing
 */
function restoreModemState(socket: any, session: BBSSession): void {
  if (session.savedModemState) {
    const { getModemEmulator } = require('../utils/modem-emulator.util');
    const modemEmulator = getModemEmulator(socket);
    const savedState = session.savedModemState;

    // Clear saved state immediately to prevent double-restore
    session.savedModemState = undefined;

    // If modem has pending data, wait for it to drain before restoring state
    // This preserves animation timing - don't immediately flush the queue
    if (modemEmulator.hasPendingData()) {
      console.log(`[ANSI-ANIM] Waiting for modem queue to drain before restoring state...`);
      modemEmulator.drain().then(() => {
        doRestore(modemEmulator, savedState);
      });
    } else {
      doRestore(modemEmulator, savedState);
    }

    function doRestore(emulator: any, state: any) {
      // Mirror of the `modem-speed` the animation path forced on the client
      // pacer. 0 restores the client's MAX soft-cap, which is what a session
      // with modem emulation off had before the animation.
      socket.emit('modem-speed', state.enabled && state.bps > 0 ? state.bps : 0);

      if (state.enabled && state.bps > 0) {
        emulator.enable(state.bps);
        session.modemEmulationEnabled = true;
        session.modemBps = state.bps;
        console.log(`[ANSI-ANIM] Restored modem emulation to ${state.bps} bps`);
      } else {
        emulator.disable();
        session.modemEmulationEnabled = false;
        session.modemBps = 0;
        console.log(`[ANSI-ANIM] Restored modem emulation to disabled (full speed)`);
      }

      // Restore AnsiBuffer flush delay
      const { getAnsiBuffer } = require('../utils/ansi-buffer.util');
      const ansiBuffer = getAnsiBuffer(socket);
      ansiBuffer.setFlushDelay(state.enabled ? 0 : 16);
    }
  }
}

export function startPagination(
  socket: any,
  session: BBSSession,
  lines: string[],
  eventName: 'ansi-output' | 'petscii-output' = 'ansi-output',
  commands?: string[],
  onComplete?: () => void | Promise<void>,
  /**
   * TP-5: the charset these lines were decoded from, when the caller read them
   * off disk. `file.handler.ts` passes none - its lists are composed - and
   * gets the caller's negotiated charset, which is the right answer for text
   * that never came off disk.
   */
  sourceAttrs?: Readonly<OutputAttributes>,
): void {
  const pageHeight = session?.screenHeight || 25;
  const pageSize = Math.max(1, pageHeight - 1);
  session.paginatedScreen = {
    lines,
    nextIndex: pageSize,
    pageSize,
    eventName,
    commands,
    onComplete,
    kind: 'bbs',
    sourceAttrs,
  };
  const chunk = lines.slice(0, pageSize).join('\r\n');
  socket.emit(eventName, chunk + '\r\n(Pause)...More(y/n/ns)? ', sourceAttrs);
  session.lastScreenHadPause = true;
}

/**
 * Handle paginated screen input (More(y/n/ns)?)
 * Returns true if handled, false otherwise.
 */
export async function handlePaginatedScreenInput(socket: any, session: BBSSession, data: string): Promise<boolean> {
  const paged = session.paginatedScreen;
  if (!paged) {
console.log(`[handlePaginatedScreenInput] No paginatedScreen set, returning false`);
    return false;
  }

console.log(`[handlePaginatedScreenInput] ENTRY: data="${data}" lines=${paged.lines.length} nextIndex=${paged.nextIndex} pageSize=${paged.pageSize}`);
  const key = (data || '').trim().toUpperCase();
  const yes = key === '' || key === 'Y' || key === '\r' || key === '\n';
  // N and NS answer a `More(y/n/ns)` gate. A doPause gate is "Space To
  // Resume": express.e's doPause takes ANY key and goes on (express.e:5143-
  // 5149). Read as the abort, N threw the gate away WITHOUT its
  // continuation, so whatever was waiting on the pause - the join, the D
  // command - never resumed.
  const onlyForMore = paged.kind !== 'doPause';
  const no = onlyForMore && key === 'N';
  const noStop = onlyForMore && key === 'NS';

  // express.e:5199 aePuts('[1A[K') — only for checkForPause (More prompt)
  // express.e:5149 doPause(): aePuts('\b\n') — just newline, no cursor-up erase
  if (paged.kind !== 'doPause') {
    /*
     * CARRIAGE RETURN, NOT CURSOR-UP. `[1A[K` here ate the last line of the
     * page and started the next one in the middle of it.
     *
     * express.e:5193-5199 prints the prompt with NO leading newline and then
     * calls `lineInput`, so the caller's RETURN is what ends the line: by the
     * time `[1A[K` runs the cursor is at COLUMN 0 of the row below, and the
     * cursor-up lands on the prompt's own row and erases it.
     *
     * This port diverges twice - the prompt is emitted after its own `\r\n`
     * (below, and in startPagination), and a single keypress answers it with
     * no RETURN echoed. So the cursor was still at the END of the prompt text,
     * about column 27. `[1A` preserves the column, so it landed one row up -
     * the last CONTENT line - and `[K` erased everything from column 27 to the
     * end of it, after which page two began writing from that column.
     *
     * Reported by the sysop against Bulletins/bull6.txt, the Super-AmiLog
     * last-callers screen: 37 lines, so it is the first screen on this board
     * tall enough to page since screens began paginating today.
     *
     * The prompt sits on its own row here, so the row to erase is the one the
     * cursor is already on: `\r` to its start, `[K` to clear it. Same net
     * effect as express.e's sequence, reached from where this port's cursor
     * actually is.
     */
    socket.emit(paged.eventName, '\r\x1b[K');
  }
  // doPause: the lines[0] = '\r\n' will be emitted by emitPage below, matching express.e:5149

  const lines = paged.lines;
  const emitPage = (startIdx: number, endIdx: number, prompt: boolean) => {
    const chunk = lines.slice(startIdx, endIdx).join('\r\n');
    const promptLine = prompt ? '\r\n(Pause)...More(y/n/ns)? ' : '';
    // The page break and the `More` prompt move a PETSCII terminal's cursor
    // like any other text; the transport choke sees them, like every other
    // emit on this socket. TP-5: page 2 of a screen is the same file's bytes
    // as page 1, so it carries the same source charset.
    socket.emit(paged.eventName, chunk + promptLine, paged.sourceAttrs);
  };

  // NS: dump the rest without further prompts
  if (noStop) {
    emitPage(paged.nextIndex, lines.length, false);
    session.paginatedScreen = undefined;
    if (paged.include) {
      // The rest of the included file is out; the host screen resumes itself.
      if (paged.onComplete) await paged.onComplete();
      return true;
    }
    session.menuPause = false;
    if (session.queuedScreenCommands && session.queuedScreenCommands.length > 0) {
      await runQueuedScreenCommands(socket, session);
    }
    if (paged.onComplete) await paged.onComplete();
    // Process all remaining screen segments without pausing
    if (session.screenSegments && session.screenSegments.segments.length > 0) {
      const segStateNS = session.screenSegments;
      const eventName = segStateNS.eventName;
      while (segStateNS.segments.length > 0) {
        const segment = segStateNS.segments.shift()!;
        const segmentSpans = segStateNS.petsciiSpans?.shift();
        if (segStateNS.petscii && segStateNS.petsciiCtx) {
          // Same rule as the paused path (plan Task 8): a petscii remainder
          // is walked and encoded against its own ctx, never re-parsed, and
          // never emitted over `eventName`.
          const petsciiWalk = await renderPetsciiWalk(
            socket, session, segment, segmentSpans ?? [], segStateNS.petsciiCtx,
          );
          if (petsciiWalk.pending) {
            segStateNS.segments.push(petsciiWalk.pending.text);
            if (!segStateNS.petsciiSpans) segStateNS.petsciiSpans = [];
            segStateNS.petsciiSpans.push(petsciiWalk.pending.spans);
          }
          continue;
        }
        const result = await parseMciCodes(segment, session, 'AmiExpress-Web', 'Sysop', 'The Internet', socket);
        // Only emit if inline mode didn't already emit everything
        if (!result.inlineEmitted) {
          let parsed = addAnsiEscapes(result.parsed);
          parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
          socket.emit(eventName, parsed, segStateNS.sourceAttrs);
        }
        // A `~XI` / `~XC_` in a later segment is a command, not text. Same gap
        // as processNextScreenSegment below, same fix - a caller who answers
        // `ns` must not get a different board than one who answers `y`.
        await runScreenCommands(socket, session, result.commands);
      }
      session.screenSegments = undefined;
    }
    return true;
  }

  // N: abort remaining pages, do not run queued commands
  if (no) {
    session.paginatedScreen = undefined;
    if (paged.include) {
      // An included file stops; the screen that included it goes on.
      if (paged.onComplete) await paged.onComplete();
      return true;
    }
    session.menuPause = false;
    session.queuedScreenCommands = [];
    session.pendingScreenCommand = undefined;
    session.screenCommandResolver = null;
    // Also clear screen segments on abort
    session.screenSegments = undefined;
    return true;
  }

  // Default: YES / ENTER
  const start = paged.nextIndex;
  const end = Math.min(start + paged.pageSize, lines.length);
  const hasMore = end < lines.length;

  emitPage(start, end, hasMore);
  paged.nextIndex = end;

  if (!hasMore) {
    session.paginatedScreen = undefined;
    if (paged.include) {
      // Only the included file is finished: the host screen that waits on it
      // carries on from where it stopped, its own segments included.
      if (paged.onComplete) await paged.onComplete();
      restoreModemState(socket, session);
      return true;
    }
    session.menuPause = false;
    if (session.queuedScreenCommands && session.queuedScreenCommands.length > 0) {
      await runQueuedScreenCommands(socket, session);
    }
    // Check for remaining screen segments (~SP processing)
    // express.e:5455-5461 - ~SP pauses IMMEDIATELY at each occurrence
    // IMPORTANT: process segments BEFORE firing onComplete so all screen content is
    // shown before any callback (e.g. promptForName) emits its own output.
    // Migrate paged.onComplete → screenSegments.onComplete so it fires after the
    // last segment (processNextScreenSegment calls it when segments run out).
    if (session.screenSegments && session.screenSegments.segments.length > 0) {
      if (paged.onComplete && !(session.screenSegments as any).onComplete) {
        (session.screenSegments as any).onComplete = paged.onComplete;
      }
      await processNextScreenSegment(socket, session);
      restoreModemState(socket, session);
      return true;
    }

    /*
     * AWAITED, BECAUSE THE FLOW RESUMES THE MOMENT THIS RETURNS.
     *
     * `handleCommand` calls `advanceDisplayFlow` as soon as this function is
     * done, and the continuation a pause is holding back may be async: the
     * join's is. Fired and forgotten, `continueJoinAfterBull` emitted
     * "Joining Conference", hit its `await` on the mail scan, and handed
     * control back here - so the menu prompt was drawn INSIDE the join, above
     * the conference's own new-mail listing, and again after it (sysop,
     * 2026-09-15, joining conference 3).
     *
     * express.e:25181 `joinConf` BLOCKS; awaiting here is what that means in
     * an async port. One keystroke, one continuation, run to the end.
     */
    if (paged.onComplete) await paged.onComplete();

    // Restore modem state before final return
    restoreModemState(socket, session);
  }

  return true;
}

/**
 * Process the next screen segment after a ~SP pause is dismissed
 * express.e:5455-5461 - ~SP pauses IMMEDIATELY, then continues processing
 */
export async function processNextScreenSegment(socket: any, session: BBSSession): Promise<boolean> {
  const segState = session.screenSegments;
  if (!segState || segState.segments.length === 0) {
    return false;
  }

  const segment = segState.segments.shift()!;  // Get and remove first segment
  const segmentSpans = segState.petsciiSpans?.shift();
  const segmentNum = segState.currentIndex + 1;
  segState.currentIndex = segmentNum;

  // A petscii segment is latin-1 `.seq` bytes; logging it as text would put
  // control codes and art bytes in the console.
console.log(`[SEGMENT] Processing segment ${segmentNum}/${segState.segments.length + segmentNum}: ${segState.petscii ? `${segment.length} PETSCII bytes` : `"${segment.substring(0, 100)}..."`}`);
  screenDebug(`[processNextScreenSegment] Processing segment ${segmentNum}: ${segState.petscii ? segment.length + ' PETSCII bytes' : segment.substring(0, 50) + '...'}`);

  /*
   * COMMANDS A LATER SEGMENT CARRIES.
   *
   * parseMciCodes returns two things: text to emit and commands to run
   * (`~XI<door>`, `~XC_<cmd>`). displayScreen runs them for the FIRST segment
   * and this function parsed them out of every later one and THREW THEM AWAY -
   * so on this board, whose conference bulletins end
   *
   *     ~SP
   *     ~f
   *     ~CC_ctop
   *     ~XISUBS
   *
   * the log read "FOUND ~XI DOOR: SUBS / Total commands to execute: 1" and
   * SUBS never opened. The `~CC_ctop` on the line above DID run, because
   * inline mode executes `~CC_` through a sentinel during the parse - which is
   * what made it look like segment commands worked.
   */
  let segmentCommands: string[] = [];

  if (segState.petscii && segState.petsciiCtx) {
    // The PETSCII resume (plan Task 8, decision 7). The remainder is ALREADY
    // gated, pre-passed and tokenized - it is a suffix of the plan this
    // screen was rendered from - so it is walked and encoded, never parsed
    // again: express.e evaluates the `~` gate once per FILE
    // (`express.e:6800-6806`), and re-running it would eat an art `~` that
    // happens to open the remainder.
    //
    // The ctx carries the same `PetsciiMachine` the first half rendered
    // against, so the bank, cursor, pen and reverse continue across the
    // pause. Bytes go out over `petscii-bytes` only, and there is NO
    // `\x1b[0m` afterwards: a C64 has no all-attributes-off, so the reset
    // the ANSI branch emits below would arrive as five garbage glyphs.
    const petsciiWalk = await renderPetsciiWalk(
      socket, session, segment, segmentSpans ?? [], segState.petsciiCtx,
    );
    if (petsciiWalk.pending) {
      // A second `~SP` in the remainder: queue it on the SAME segment state
      // so the pause below is armed and this ctx is reused again.
      segState.segments.push(petsciiWalk.pending.text);
      if (!segState.petsciiSpans) segState.petsciiSpans = [];
      segState.petsciiSpans.push(petsciiWalk.pending.spans);
    }
  } else {

  // Parse and execute this segment's MCI codes
  const result = await parseMciCodes(segment, session, 'AmiExpress-Web', 'Sysop', 'The Internet', socket);
  segmentCommands = result.commands;

  let parsed = result.parsed;
  if (result.slowmo !== undefined) session.slowmo = result.slowmo;
  if (result.slowmoCount !== undefined) session.slowmoCount = result.slowmoCount;

  // Only emit if inline mode didn't already emit everything
  if (!result.inlineEmitted) {
    // Add ANSI escapes if needed
    parsed = addAnsiEscapes(parsed);

    // Normalize line endings
    parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    // Emit this segment's content. TP-5: a segment is a slice of the same
    // screen file, so it carries the charset that file was decoded from.
    socket.emit(segState.eventName, parsed, segState.sourceAttrs);
  } else {
    // Just emit color reset to prevent bleed
    socket.emit(segState.eventName, '\x1b[0m');
    screenDebug(`[processNextScreenSegment] Content already emitted inline`);
  }

  } // end else (ANSI segment)

  // Now run what this segment asked for. After the text, because a door paints
  // over whatever is on the screen and the art belongs underneath it.
  if (segmentCommands.length > 0) {
    await runScreenCommands(socket, session, segmentCommands);
    /*
     * A command displays screens of its own - a door's, or another conference
     * bulletin - so the segment state this closure captured may no longer be
     * the session's. Whatever is on the session now is the truth: arming a
     * pause or firing onComplete off a stale `segState` would talk about a
     * screen the caller has already left.
     */
    if (session.screenSegments !== segState) {
      return true;
    }
  }

  // If there are more segments, set up another pause
  if (armSegmentBoundaryPause(socket, session, 'segment-resume')) {
    return true;
  }

  // All segments processed, clean up
  const segOnComplete = (segState as any).onComplete;
  session.screenSegments = undefined;
  session.lastScreenHadPause = false;

  screenDebug(`[processNextScreenSegment] All segments processed for ${segState.screenName}`);
  // Flush the ANSI output buffer before firing the callback. Inline-mode parseMciCodes
  // queues output through a 16ms buffer; if the callback (e.g. promptForName) emits
  // directly to the socket before that buffer drains, it arrives at the client first and
  // the subsequent flush (which may include a ~f clear-screen) wipes it.
  flushOutput(socket);
  // Awaited for the same reason as the pause's own continuation above: a
  // screen's owner may be async, and the display flow moves on the instant
  // this returns.
  if (typeof segOnComplete === 'function') await segOnComplete();
  return true;
}

/**
 * Check if a .keys file exists for the given screen
 * Like express.e:6567-6573 - checks for screenfile + '.keys'
 *
 * @param screenName - Name of screen file (without .TXT extension)
 * @param conferenceId - Optional conference ID for conference-specific screens
 * @param nodeId - Node ID (default 0)
 * @returns true if .keys file exists, false otherwise
 */
export function hasKeysFile(screenName: string, conferenceId?: number, nodeId: number = 0): boolean {
  const { config } = require('../config');
  const baseDir = config.getConfig().dataDir;
  const paths = [];

  // Try conference-specific .keys file first (if provided)
  if (conferenceId) {
    const confIndex = conferences.findIndex(c => c.id === conferenceId);
    if (confIndex !== -1) {
      const relConfNum = confIndex + 1; // Convert to 1-based
      const candidateDirs = getConferenceScreensCandidates(baseDir, relConfNum);
      for (const candidate of candidateDirs) {
        const confPath = path.join(candidate.dir, `${screenName}.keys`);
        paths.push(confPath);
      }
    }
  }

  // Then try node-specific .keys file
  const nodePath = path.join(baseDir, `Node${nodeId}`, 'Screens', `${screenName}.keys`);
  paths.push(nodePath);

  // Then try default BBS .keys file
  const bbsPath = path.join(baseDir, 'Screens', `${screenName}.keys`);
  paths.push(bbsPath);

  // Check each path in order (use amigafs for case-insensitive matching)
  for (const filePath of paths) {
    if (amigafs.existsSync(filePath)) {
      screenDebug(` Found .keys file: ${filePath}`);
      return true;
    }
  }

  screenDebug(`No .keys file found for screen: ${screenName}`);
  return false;
}

/**
 * Check for .keys alongside the resolved screen file path (security-aware)
 * Mirrors express.e: after findSecurityScreen/displayFile, append ".keys" to that path.
 */
export function hasKeysFileForResolvedPath(resolvedPath: string): boolean {
  if (!resolvedPath) return false;
  const dir = path.dirname(resolvedPath);
  const base = path.basename(resolvedPath);
  const candidate = `${base}.keys`;
  const found = findCaseInsensitive(dir, candidate);
  if (found) {
    screenDebug(` Found .keys file for resolved path: ${found}`);
    return true;
  }
  screenDebug(`No .keys file found for resolved path: ${resolvedPath}`);
  return false;
}

/**
 * Display "Press any key..." pause prompt
 * Like express.e doPause() - express.e:28566, 28571
 *
 * @param socket - Socket.io socket for sending output
 * @param session - Current BBS session (for future enhancements)
 */
export function doPause(socket: any, session: BBSSession, onComplete?: () => void | Promise<void>): void {
console.log(`[doPause] CALLED - setting up paginatedScreen (subState=${session.subState})`);
  fs.appendFileSync('/tmp/bbs-debug.log', `[${new Date().toISOString()}] doPause: CALLED, subState=${session.subState}\n`);
  // Express.e:5143-5144 - "\b\n(Pause)...Space To Resume:"
  // CRITICAL: Must flush immediately before waiting for keypress (express.e behavior)
  // NOTE: Use \r\n for web terminal (xterm.js) compatibility.
  // express.e uses \b\n but on xterm.js \n alone doesn't return to column 0.
  // After ANSI art that positions cursor anywhere, \r ensures we start at column 0.
  // The prompt is ANSI, and a PETSCII terminal turns it into cursor moves
  // and colour bytes: the model has to see it, or the next `.seq` chunk is
  // encoded against a cursor two rows above the real one. The transport
  // choke feeds it; `emitPrompt` flushes immediately, so the bytes reach the
  // model in wire order.
  // One prompt on screen at a time. The gate below is still installed either
  // way, so whatever this pause was protecting still happens.
  if (aPausePromptIsShowing(session)) {
  } else {
    emitPrompt(socket, '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');
  }

  /*
   * A SENTINEL, and deliberately still here. The noisy half of this - a
   * line per pause, and a line per booked debt in command.handler - was
   * removed on 2026-09-16 once the ordering work closed. This one prints
   * NOTHING unless the fault occurs, so it costs a comparison per pause
   * and answers the question below the day it happens.
   *
   * THE SECOND INSTANCE OF THE SHAPE 1a5291c4c FIXED, if it is reachable.
   *
   * doPause ASSIGNS the gate below. If one is already standing with pages the
   * caller has not reached, those pages - and the `commands` that screen was
   * going to run - are gone, exactly as they were when
   * `armSegmentBoundaryPause` armed over a `bbs` gate.
   *
   * The display flow cannot reach it: `pauseDisplayFlow` returns early on
   * `if (session.paginatedScreen)` BEFORE it ever calls doPause. But there are
   * ~17 other callers (new-user.handler alone has 8), and picking one to
   * "fix" on a hunch is the speculative patch the rules forbid.
   *
   * So name it instead, with the stack, and let the live board answer. If
   * nothing ever prints this, the path is unreachable and the guard is not
   * worth adding; if something does, the fix is the predicate 1a5291c4c uses.
   */
  const standing = session.paginatedScreen;
  if (standing && standing.kind !== 'doPause'
      && standing.nextIndex < standing.lines.length) {
    console.log(
      `[PAUSE-CLOBBER] doPause replacing a live ${standing.kind} gate:`
      + ` ${standing.lines.length - standing.nextIndex} page(s) unread,`
      + ` ${standing.commands?.length ?? 0} command(s) queued,`
      + ` subState=${session.subState}\n`
      + `${new Error('pause-clobber (not thrown - this is the call site)').stack}`
    );
  }

  // Install a minimal pagination gate so the next keypress is required.
  // express.e:5149 doPause() response: lineCount:=0; aePuts('\b\n') — just a newline.
  session.paginatedScreen = {
    lines: ['\r\n'],
    nextIndex: 0,
    pageSize: 1,
    eventName: 'ansi-output',
    commands: [],
    onComplete,
    kind: 'doPause',
  };
  session.lastScreenHadPause = true;
}
// Web extension: negative ~SMO speeds (-1..-3) run slower than AmiExpress SMO1 while preserving positive speeds 1-5 semantics.
