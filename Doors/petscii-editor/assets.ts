/**
 * Where a PETSCII screen goes when the caller saves it.
 *
 * Two targets, the pair the ANSI editor door has carried since it was
 * written (`Doors/ansi-editor/index.ts`):
 *
 *   - EVERY CALLER gets his own drawings, in the door's per-user storage.
 *     They are his; nothing else on the board reads them.
 *   - A SYSOP additionally gets the board's own screen directories, which is
 *     what the web studio writes to. That path is the board's art, so the
 *     board's two rules are enforced on it - bank 1 only, black background
 *     only (`sdk/petscii/board-rules.ts`).
 *
 * A `.seq` is BYTES, not text. Storage holds JSON, so the bytes travel as
 * base64 and are decoded here - never read or written as a string, which is
 * how a high-bit byte becomes U+FFFD.
 */

import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import { checkBoardRules, boardRulesReason } from '@amiexpress/bbs-door-sdk/petscii';

/** The key prefix a caller's own screens live under. */
export const FILE_PREFIX = 'seq:';

/** Access level the board calls a sysop. */
export const SYSOP_ACCESS_LEVEL = 255;

/**
 * The board directories a sysop may draw into.
 *
 * The same list the ANSI editor offers, because they are the same screens -
 * one of them in `.ans` and one in `.seq`, chosen by what the caller's
 * terminal is.
 */
export const BBS_SCREEN_DIRS = [
  'Screens',
  'Bulletins',
  'Conf01/Screens',
  'Conf01/Bulletins',
  'Conf02/Screens',
  'Conf03/Screens',
];

export interface StoredScreen {
  /** The `.seq` bytes, base64 - storage is JSON and these are bytes. */
  content: string;
  modified: string;
}

export function isSysop(ctx: DoorContext): boolean {
  return ((ctx.user as any)?.accessLevel ?? 0) >= SYSOP_ACCESS_LEVEL;
}

/** Every screen this caller has saved, newest name order, without the prefix. */
export async function listOwnScreens(ctx: DoorContext): Promise<string[]> {
  const keys = await (ctx.storage as any).keys();
  return (keys as string[])
    .filter((key) => key.startsWith(FILE_PREFIX))
    .map((key) => key.slice(FILE_PREFIX.length))
    .sort((a, b) => a.localeCompare(b));
}

export async function loadOwnScreen(ctx: DoorContext, name: string): Promise<Uint8Array | null> {
  const stored = (await (ctx.storage as any).load(FILE_PREFIX + name)) as StoredScreen | null;
  if (!stored?.content) return null;
  return Uint8Array.from(Buffer.from(stored.content, 'base64'));
}

export async function saveOwnScreen(ctx: DoorContext, name: string, bytes: Uint8Array): Promise<void> {
  const stored: StoredScreen = {
    content: Buffer.from(bytes).toString('base64'),
    modified: new Date().toISOString(),
  };
  await (ctx.storage as any).save(FILE_PREFIX + name, stored);
}

export async function deleteOwnScreen(ctx: DoorContext, name: string): Promise<void> {
  await (ctx.storage as any).delete(FILE_PREFIX + name);
}

/** The `.seq` files in one of the board's screen directories. */
export async function listBoardScreens(ctx: DoorContext, directory: string): Promise<string[]> {
  const bbs = ctx.bbs as any;
  const lower = (await bbs.listFiles?.(directory, '*.seq')) ?? [];
  const upper = (await bbs.listFiles?.(directory, '*.SEQ')) ?? [];
  return Array.from(new Set([...lower, ...upper])).sort((a: string, b: string) => a.localeCompare(b));
}

export async function loadBoardScreen(ctx: DoorContext, path: string): Promise<Uint8Array | null> {
  const raw = await (ctx.bbs as any).readFile?.(path, 'binary');
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Uint8Array) return raw;
  // A board that hands back latin1 text still hands back the bytes; the
  // encoding is the lossless one for this exact reason.
  return Uint8Array.from(Buffer.from(raw as string, 'binary'));
}

/**
 * Write a screen into the board's own art, or refuse it.
 *
 * The refusal is the board's rule, not this door's opinion, and it is
 * checked on the BYTES about to be written rather than on the surface that
 * produced them - the file is what the next caller's C64 will read.
 */
export async function saveBoardScreen(
  ctx: DoorContext,
  path: string,
  bytes: Uint8Array,
): Promise<{ saved: boolean; reason?: string }> {
  const violations = checkBoardRules(bytes);
  if (violations.length > 0) return { saved: false, reason: boardRulesReason(violations) };

  await (ctx.bbs as any).writeFile?.(path, Buffer.from(bytes).toString('binary'), 'binary');
  return { saved: true };
}

/** `name.seq`, whatever the caller typed. */
export function withSeqExtension(name: string): string {
  return /\.seq$/i.test(name) ? name : `${name}.seq`;
}
