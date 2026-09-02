/**
 * A screen's bytes, at the edge of the editor.
 *
 * The board's screens are CP437 with ANSI escapes - `0xDB` is the full block
 * that every piece of ANSI art is drawn from, and `0xA1` is an ordinary Amiga
 * character. The API carries them as base64 for exactly that reason: a UTF-8
 * round trip turns one of those bytes into U+FFFD and the art is gone.
 *
 * The conversion itself belongs to the SDK - `loadANSFile` and `saveANSFile`
 * own CP437, the escape parsing and SAUCE, and the door uses the same pair.
 * This module is the base64 edge and nothing more.
 */

import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import {
  loadANSFile, saveANSFile,
} from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/file-ops';

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * `String.fromCharCode(...bytes)` is the obvious spelling and it throws on a
 * screen of any size - the argument list is capped well below the 64 KB an
 * 80x25 of block characters reaches. Chunked, deliberately.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/**
 * The first `rows` rows of a screen's bytes.
 *
 * Counted in BYTES, before anything is parsed. This board keeps a
 * `68klog.txt` of 992,732 lines under its screen directories, indexed as
 * ordinary drawable art: parsing it whole builds something like 79 million
 * cell objects, and the tab is gone long before a canvas is asked for.
 *
 * One row of slack so a cut never lands in the middle of the last row's
 * escape sequence.
 */
export function firstRows(bytes: Uint8Array, rows: number): Uint8Array {
  let seen = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a && ++seen > rows) return bytes.subarray(0, i);
  }
  return bytes;
}

/**
 * @param maxRows draw only this many rows - for a PREVIEW. Absent means the
 *                whole screen, which is what the editor needs: the codes a
 *                screen runs sit below its art, and an editor that cannot see
 *                them deletes them on save.
 */
export async function screenToCanvas(base64: string, maxRows?: number): Promise<Cell[][]> {
  const bytes = base64ToBytes(base64);
  const { canvas } = await loadANSFile(maxRows ? firstRows(bytes, maxRows) : bytes);
  return canvas;
}

export function canvasToScreen(canvas: Cell[][]): string {
  return bytesToBase64(saveANSFile(canvas));
}
