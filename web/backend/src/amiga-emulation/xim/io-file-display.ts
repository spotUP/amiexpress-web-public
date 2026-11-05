/**
 * XIM File Display Handlers
 *
 * Extracted from XIMIOHandler (handleShowGFile, handleShowFile,
 * handleDisplayFileNonStop, handleCheckToDisplay, displayResolvedFile,
 * displayTextFile, and related helpers) to keep io.ts under the 2000-line limit.
 *
 * All exported functions receive `self: any` (the XIMIOHandler instance)
 * following the same pattern used by mci-handler.ts and user-info-handlers.ts.
 */

import * as path from 'path';
import * as amigafs from '../../utils/amigafs';
import { XIMMessage } from './types';
import { BBSPaths } from '../../utils/bbs-paths.util';
import { SysopDebugUtil } from '../../utils/sysop-debug.util';
import { buildGFileCandidates } from './user-info-handlers';
import { foldScreenBlocks } from '../../screens/adapt-ansi-to-forty';
import { c64AdapterFor } from '../../server/c64-door-adapter';
import { C64_COLUMNS } from './screen-width.util';
import { narrowVariants } from '../../utils/narrow-art.util';
import { boardRoot } from '../../utils/board-root.util';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const iconv = require('iconv-lite');

// ---------------------------------------------------------------------------
// 40-column variants (backlog lane 13.2)
// ---------------------------------------------------------------------------

/**
 * The `_C64` naming rule lives in `utils/narrow-art.util.ts`, because the
 * dos.library route (`ctop`'s own `Conftop.header` Open) needs the same rule
 * and a rule written twice drifts. Re-exported here so the display path's
 * callers and its test keep one import.
 */
export { narrowVariants };

/**
 * Each candidate preceded by its narrow spellings, when the caller's door
 * output is being adapted to 40 columns.
 *
 * INTERLEAVED, not all-narrow-first: JH_SG's candidate list is an ACCESS
 * ladder (`NAME50.txt` before `NAME45.txt`), and width is a variant WITHIN a
 * rung, not above it. Hoisting every narrow spelling to the front would let a
 * narrow lower-access file answer ahead of the plain file the caller is
 * entitled to.
 */
export function widthAwareCandidates(self: any, candidates: string[]): string[] {
  // Art named for the C64's screen is 40 columns wide. The adapter existing
  // is not the question - an 80-column PETSCII caller has one too, and
  // serving him a variant the sysop hand-drew for 40 columns is the same
  // mistake as folding .seq art onto his screen. He gets the door's own file.
  const adapter = c64AdapterFor(self?.socket);
  if (!adapter || adapter.columns > C64_COLUMNS) return candidates;
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (p: string) => {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  for (const candidate of candidates) {
    narrowVariants(candidate).forEach(add);
    add(candidate);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exported handlers (delegated from XIMIOHandler methods)
// ---------------------------------------------------------------------------

/** Handle JH_SG (Show GFile — language/security-aware lookup). */
export async function handleShowGFile(self: any, msg: XIMMessage): Promise<void> {
  const partName = self.getMessageString(msg).trim();
  const forceNonStop = msg.data === 1;

  if (!partName) {
    self.reply(msg, 0);
    return;
  }

  const resolvedBase = resolvePath(self, partName);
  const parsed = path.parse(resolvedBase);
  const baseWithoutExt = path.join(parsed.dir, parsed.name);
  const language = (self.state.language || '').trim();
  const secLevel = self.bbsSession?.user?.secLevel ?? 0;

  const candidates = buildGFileCandidates(baseWithoutExt, parsed.ext, language, secLevel);
  const target = findFirstExisting(widthAwareCandidates(self, candidates));
  if (!target) {
    console.warn(`[XIMIOHandler] JH_SG: No gfile found for base ${partName}`);
    self.reply(msg, 0);
    return;
  }

  await displayResolvedFile(self, target, forceNonStop, msg);
}

/**
 * Handle JH_SF (Show File — full path).
 *
 * Fast path (no MCI codes): synchronously read file → emit → reply.
 * Deterministic ordering required by dRE!Wall's absolute cursor positioning.
 */
export async function handleShowFile(self: any, msg: XIMMessage): Promise<void> {
  const targetPath = self.getMessageString(msg).trim();
  const forceNonStop = msg.data === 1;

  if (!targetPath) {
    self.reply(msg, 0);
    return;
  }

  const resolved = resolvePath(self, targetPath);
  const parsed = path.parse(resolved);
  const candidates =
    parsed.ext && parsed.ext.length > 0
      ? [resolved]
      : [
          resolved,
          `${resolved}.txt`,
          `${resolved}.TXT`,
          `${resolved}.txt.gr`,
          `${resolved}.GR1`,
        ];

  const target = findFirstExisting(widthAwareCandidates(self, candidates));
  if (!target) {
    console.warn(`[XIMIOHandler] JH_SF: File not found: ${targetPath}`);
    self.reply(msg, 0);
    return;
  }

  await displayResolvedFile(self, target, forceNonStop, msg);
}

/** Handle DISPLAY_FILE (non-stop). Inherits sync-fast-path from handleShowFile. */
export async function handleDisplayFileNonStop(self: any, msg: XIMMessage): Promise<void> {
  await handleShowFile(self, { ...msg, data: 1 });
}

/** Handle CHECK_TO_DISPLAY (non-stop gfile/ACS search). */
export async function handleCheckToDisplay(self: any, msg: XIMMessage): Promise<void> {
  await handleShowGFile(self, { ...msg, data: 1 });
}

// ---------------------------------------------------------------------------
// Private helpers (module-internal only)
// ---------------------------------------------------------------------------

/**
 * A SCREEN FILE A DOOR HANDS BACK IS A SCREEN, NOT THE DOOR'S LAYOUT.
 *
 * `B` on this board is a 68K door (`Doors/EmP_Tools/Bulls`) that shows
 * `Bulletins/bullN.txt` through JH_SF. Those bytes leave the emulator and
 * meet the C64 door adapter, whose rule ladder is row-local by design - so
 * MultiTop's chart, one table printed twice across eighty columns, arrived
 * squeezed onto single rows however many times the SCREEN path was fixed.
 * The sysop, 2026-09-22, after two of those fixes were live: "the multitop
 * bulls may not have regenerated? they look the same", then "its still too
 * tall".
 *
 * The rules that fold a chart belong to the FILE, so they are applied here,
 * to the file, before the door's own ladder ever sees it - the BLOCK rules
 * only, never the whole screen adaptation, because adapting a file the
 * door's own ladder is about to adapt again changes the height of screens
 * that were right. Installing them in that ladder instead was tried and
 * reverted the same hour: they fired on dRE!WAll's wall, GWALL's masthead
 * and the games menu, which are a DOOR's layout and not a screen's.
 *
 * Only a forty-column PETSCII caller is affected; everyone else gets the
 * file byte for byte, which is what the identity suites pin.
 */
function forFortyColumnFile(self: any, content: string): string {
  if (!c64AdapterFor(self.socket)) return content;
  try {
    return foldScreenBlocks(content) ?? content;
  } catch (error) {
    // A screen the adapter cannot read is still a screen the caller asked
    // for: hand it over unchanged rather than showing him nothing.
    console.warn(`[XIMIOHandler] 40-column screen adaptation failed: ${String(error)}`);
    return content;
  }
}

/**
 * Display a resolved file.
 *
 * Fast path (no MCI): synchronously emit and reply before returning.
 * Slow path (MCI codes): async parseMciCodes pipeline.
 */
async function displayResolvedFile(
  self: any,
  target: string,
  forceNonStop: boolean,
  msg: XIMMessage
): Promise<void> {
  let content: string;
  try {
    const rawBuffer = amigafs.readFileSync(target) as Buffer;
    content = iconv.decode(rawBuffer, 'iso-8859-1');
  } catch (err) {
    SysopDebugUtil.debugFileError(self.socket, self.bbsSession, 'read', target, err as Error);
    console.error(`[XIMIOHandler] Failed to display file ${target}:`, err);
    self.reply(msg, 0);
    return;
  }

  // express.e:6756 and :6770 - displayFile starts its row count at zero and
  // turns a caller's earlier `ns` back off. The rows a door printed BEFORE
  // asking for the file (Bulls sends two newlines first) do not count against
  // the file's first page: with them counted, a bulletin that fits its 24-row
  // screen was followed by a `More(y/n/ns)?` with nothing left to show.
  self.state.lineCount = 0;
  self.state.nonStopText = false;

  // Fast path: no MCI codes — emit synchronously and reply.
  // Doors like dRE!Wall use JH_SF for positional UI fragments; pausing mid-layout
  // breaks absolute cursor positioning and blocks the trap-sync drain for ~5s.
  // Regex MUST be case-insensitive: express.e accepts both ~F (uppercase form
  // feed) and ~f (lowercase) for the same MCI code; uploadmsg.txt in stock
  // reference-board files uses lowercase, and the previous uppercase-only regex
  // mis-classified those files as "no MCI" — emitting `~f` literally to the
  // user instead of clearing the screen.
  const hasMciCodes = /~([A-Za-z][A-Za-z0-9_]*|[Dd].)/.test(content);
  if (!hasMciCodes) {
    const newlineCount = (content.match(/\n/g) ?? []).length;
    const pauseLines = self.state.pauseLines || 24;
    // A 40-column caller is shown ADAPTED rows, and the C64 rule ladder can
    // make a row two rows tall - `games` is 19 source rows and 33 adapted ones.
    // This newline count therefore understates what he will be sent, and there
    // is nothing in the FILE that would tell us better: the adapted height is a
    // property of the frame the adapter reconstructs, after cursor moves are
    // resolved. So for a frame-adapted caller the gate is simply armed and
    // emitText's end-of-message check - which asks the adapter - decides.
    // Content that really does fit reports zero unseen rows and nothing pauses.
    // An 80-column caller - ANSI or PETSCII - has no adapter and keeps this
    // newline gate byte for byte, which is what the identity suites pin. The
    // adapter is installed for a FORTY-column PETSCII caller and nobody else
    // (server/c64-door-adapter.ts c64AdapterDrives).
    const frameAdapted = !!c64AdapterFor(self.socket);
    const shouldAutoPause = !forceNonStop && (frameAdapted || newlineCount > pauseLines);
    self.emitText(forFortyColumnFile(self, content), false, shouldAutoPause, shouldAutoPause, msg);
    if (!self.waitingForPause) {
      self.reply(msg, 1);
    }
    return;
  }

  // Slow path: MCI parsing requires async DB lookups.
  const displayed = await displayTextFile(self, target, forceNonStop, msg);
  if (!displayed) {
    self.reply(msg, 0);
    return;
  }

  if (!self.waitingForPause) {
    self.reply(msg, 1);
  }
}

/** Read a file, process MCI codes, and emit the result. Returns false on error. */
async function displayTextFile(
  self: any,
  filePath: string,
  forceNonStop: boolean,
  msg: XIMMessage
): Promise<boolean> {
  try {
    const rawBuffer = amigafs.readFileSync(filePath) as Buffer;
    const content = iconv.decode(rawBuffer, 'iso-8859-1');

    try {
      // A lazy require, never `await import()`: under Node 20 + tsx a dynamic import
      // goes through the off-thread ESM loader, loads a second copy of the module,
      // and in a headless runner its reply can wait forever (see AmigaDoorSession).
      const { parseMciCodes } = require('../../handlers/screen.handler') as typeof import('../../handlers/screen.handler');
      const bbsSession = self.bbsSession || {};
      const bbsName = bbsSession.bbsName || 'AmiExpress-Web';
      const sysopName = bbsSession.sysopName || 'Sysop';
      const location = bbsSession.user?.location || 'The Internet';

      const result = await parseMciCodes(content, bbsSession as any, bbsName, sysopName, location);
      const autoPause = !forceNonStop;
      self.emitText(result.parsed, false, true, autoPause, msg);
    } catch (mciError: any) {
      console.warn(`[XIMIOHandler] MCI processing failed, displaying raw: ${mciError.message}`);
      const autoPause = !forceNonStop;
      self.emitText(content, false, true, autoPause, msg);
    }

    return true;
  } catch (err) {
    SysopDebugUtil.debugFileError(self.socket, self.bbsSession, 'read', filePath, err as Error);
    console.error(`[XIMIOHandler] Failed to display file ${filePath}:`, err);
    return false;
  }
}

/** Resolve an Amiga-style path (BBS:, NODE#:, DOORS:) to host filesystem. */
function resolvePath(self: any, amigaPath: string): string {
  const paths = new BBSPaths(getBbsRoot(self));
  return paths.resolveAmigaPath(amigaPath, self.bbsSession?.nodeId ?? 0, undefined);
}

/** Return the BBS root directory from session or environment. */
function getBbsRoot(self: any): string {
  return (
    (self.bbsSession as any)?.dataDir ||
    self.bbsSession?.bbsPath ||
    boardRoot()
  );
}

/** Return the first path in `candidates` that exists on disk, or null. */
function findFirstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (amigafs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
