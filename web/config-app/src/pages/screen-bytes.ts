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

export async function screenToCanvas(base64: string): Promise<Cell[][]> {
  const { canvas } = await loadANSFile(base64ToBytes(base64));
  return canvas;
}

export function canvasToScreen(canvas: Cell[][]): string {
  return bytesToBase64(saveANSFile(canvas));
}
