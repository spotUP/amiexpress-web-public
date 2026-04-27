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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const iconv = require('iconv-lite');

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
  const target = findFirstExisting(candidates);
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

  const target = findFirstExisting(candidates);
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

  // Fast path: no MCI codes — emit synchronously and reply.
  // Doors like dRE!Wall use JH_SF for positional UI fragments; pausing mid-layout
  // breaks absolute cursor positioning and blocks the trap-sync drain for ~5s.
  const hasMciCodes = /~([A-Z][A-Z0-9_]*|D.)/.test(content);
  if (!hasMciCodes) {
    const newlineCount = (content.match(/\n/g) ?? []).length;
    const pauseLines = self.state.pauseLines || 24;
    const shouldAutoPause = !forceNonStop && newlineCount > pauseLines;
    self.emitText(content, false, shouldAutoPause, shouldAutoPause, msg);
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
      const { parseMciCodes } = await import('../../handlers/screen.handler.js');
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
    process.env.BBS_DATA_DIR ||
    path.resolve(process.cwd())
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
