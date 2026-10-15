/**
 * The board's colour depth, applied to what it sends.
 *
 * "amiexpress can only show 8 colors on the amiga... it CAN show 16 colors if
 * ibmcon device is used but that was not common practice", and "the amiga did
 * not use ice colors either" (sysop, 2026-09-14). A board that wants to look
 * the way AmiExpress looked sets `TERMINAL_COLOURS=8` and every bright code it
 * sends is folded onto the eight pens console.device had: art drawn in sixteen
 * still displays, in the colours an Amiga would have shown it in.
 *
 * The guards matter more than the fold:
 *  - 16 colours (the default): IDENTITY, and the config is read once per
 *    process rather than per emit.
 *  - text with no bright codes: BYTE-IDENTICAL, which is most of this board's
 *    own screens - they were drawn for an Amiga in the first place.
 *  - a door that owns the terminal: still folded. A door paints its own
 *    screen, but it paints it in the same sixteen colours, and an Amiga caller
 *    is no better served by a door's bright codes than by a screen's.
 *
 * Width and colour are separate questions with separate answers: this is the
 * colour half, beside `wrapForSession`'s width half, and both are called from
 * the one output choke in ansi-buffer.util.ts.
 */

import { foldAnsiToEightPens } from '@amiexpress/bbs-door-sdk/engines/ui/ansi/eight-pens';
import { getBoardConfig } from '../services/bbs-config-file.service';
import { boardRoot } from './board-root.util';

/** Read once: a board does not change its colour depth between emits. */
let cached: { pens: number; stamp: number } | null = null;
const CACHE_MS = 30_000;

/** How many colours this board's callers have. 16 unless a sysop says 8. */
export function boardColourDepth(): number {
  const now = Date.now();
  if (cached && now - cached.stamp < CACHE_MS) return cached.pens;

  let pens = 16;
  try {
    const config = getBoardConfig(boardRoot());
    const declared = Number(config?.terminal_colours);
    // Only 8 turns it on. A board with a missing, malformed or absurd value
    // keeps every colour it has always sent.
    if (declared === 8) pens = 8;
  } catch {
    // No config to read is not a reason to change what the board sends.
  }

  cached = { pens, stamp: now };
  return pens;
}

/** Drop the cache - for a sysop who has just changed the setting, and tests. */
export function forgetBoardColourDepth(): void {
  cached = null;
}

/**
 * Fold what the board is about to send, if this board has eight pens.
 *
 * Identity for a sixteen-colour board, and identity for any text that carries
 * no bright codes.
 */
export function foldColoursForBoard(text: string): string {
  if (!text) return text;
  if (boardColourDepth() !== 8) return text;
  return foldAnsiToEightPens(text);
}
