/**
 * A video frame as CELLS, before it is anything else.
 *
 * The encoders used to go straight from pixels to blessed markup, so the
 * thing that travelled over the wire was text like
 * `{lightgreen-fg}{gray-bg}▀▀▀{/}` - twenty-four bytes every time the
 * colour changed, for a picture whose entire vocabulary is sixteen colours.
 * A 146x46 tile came to 21 KB a frame, and since the client paces itself
 * against a byte budget, that was two frames a second.
 *
 * A cell needs one byte. Half-block is two palette indices, four bits each;
 * coloured ASCII is a ramp index and a palette index; braille is eight dots.
 * Markup is a rendering detail, and belongs where the rendering happens -
 * in the door, next to the terminal - not on the wire.
 *
 * Pure: pixels in, bytes out, and bytes back to markup. Testable without a
 * camera or a terminal.
 */

import { PALETTE, pixelsPerChar, type PixelBuffer } from './video-encoders';
import { pickColor, pickColorDithered, fitColorMemory, type ColorMemory } from './video-hysteresis';

/** One byte per cell, so a frame is width * height bytes. */
export type CellFrame = Uint8Array;

export const MODE_HALFBLOCK = 0;
export const MODE_ASCII = 1;
export const MODE_ASCII_COLOR = 2;
export const MODE_BRAILLE = 3;

/** The ramp the ASCII modes quantise brightness to. Ten steps fit four bits. */
export const ASCII_RAMP = ' .:-=+*#%@';

/** Map a render mode name to its wire code. */
export function modeCode(mode: string, colored: boolean): number {
  switch (mode) {
    case 'braille': return MODE_BRAILLE;
    case 'halfblock': return MODE_HALFBLOCK;
    case 'color': return MODE_ASCII_COLOR;
    default: return colored ? MODE_ASCII_COLOR : MODE_ASCII;
  }
}

/**
 * Half-block cells: the top pixel in the high nibble, the bottom in the low.
 *
 * One character covers two vertically stacked pixels, which is why the
 * source buffer is twice as tall as the cell grid.
 */
export function halfblockCells(
  img: PixelBuffer,
  w: number,
  h: number,
  memory?: ColorMemory
): CellFrame {
  const out = new Uint8Array(w * h);
  const mem = memory ? fitColorMemory(memory, w, h) : undefined;
  let lastFg = -1;
  let lastBg = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = y * w + x;
      const topI = ((y * 2) * w + x) * 4;
      const botI = ((y * 2 + 1) * w + x) * 4;

      const fg = pickColor(
        PALETTE, img.data[topI], img.data[topI + 1], img.data[topI + 2],
        mem ? [mem.fg[cell], lastFg] : [], mem?.stickiness
      );
      const bg = pickColor(
        PALETTE, img.data[botI], img.data[botI + 1], img.data[botI + 2],
        mem ? [mem.bg[cell], lastBg] : [], mem?.stickiness
      );
      if (mem) { mem.fg[cell] = fg; mem.bg[cell] = bg; }
      lastFg = fg;
      lastBg = bg;

      out[cell] = (fg << 4) | bg;
    }
    lastFg = -1;
    lastBg = -1;
  }

  return out;
}

/** ASCII cells: ramp index in the high nibble, colour in the low. */
export function asciiCells(
  img: PixelBuffer,
  w: number,
  h: number,
  colored: boolean,
  memory?: ColorMemory
): CellFrame {
  const out = new Uint8Array(w * h);
  const mem = colored && memory ? fitColorMemory(memory, w, h) : undefined;
  let lastFg = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = y * w + x;
      const i = cell * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];

      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const ramp = Math.min(
        ASCII_RAMP.length - 1,
        Math.max(0, Math.floor(lum * (ASCII_RAMP.length - 1)))
      );

      let fg = 0;
      if (colored) {
        fg = pickColor(PALETTE, r, g, b, mem ? [mem.fg[cell], lastFg] : [], mem?.stickiness);
        if (mem) mem.fg[cell] = fg;
        lastFg = fg;
      }

      out[cell] = (ramp << 4) | fg;
    }
    lastFg = -1;
  }

  return out;
}

/** Braille cells: the eight dots of one character, as bits. */
export function brailleCells(img: PixelBuffer, w: number, h: number): CellFrame {
  const out = new Uint8Array(w * h);
  const sw = w * 2;

  // Dot bit for each (x, y) inside the 2x4 block, in Unicode braille order.
  const DOTS = [
    [0x01, 0x08],
    [0x02, 0x10],
    [0x04, 0x20],
    [0x40, 0x80],
  ];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let bits = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y * 4 + dy) * sw + (x * 2 + dx)) * 4;
          const lum = (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]) / 255;
          if (lum > 0.5) bits |= DOTS[dy][dx];
        }
      }
      out[y * w + x] = bits;
    }
  }

  return out;
}

/**
 * Cells back to blessed markup, for the terminal that finally draws them.
 *
 * Colour tags are emitted only where the colour changes, so a run of one
 * colour costs one tag however long it is - the same run-length trick the
 * old encoders used, now applied at the point of rendering instead of on
 * the wire.
 */
export function cellsToTags(cells: CellFrame, w: number, h: number, mode: number): string {
  const rows: string[] = [];

  for (let y = 0; y < h; y++) {
    let row = '';
    let lastFg = -1;
    let lastBg = -1;

    for (let x = 0; x < w; x++) {
      const value = cells[y * w + x] ?? 0;

      if (mode === MODE_BRAILLE) {
        row += String.fromCharCode(0x2800 + value);
        continue;
      }

      if (mode === MODE_ASCII) {
        row += ASCII_RAMP[(value >> 4) & 0x0f] ?? ' ';
        continue;
      }

      const fg = mode === MODE_HALFBLOCK ? (value >> 4) & 0x0f : value & 0x0f;
      const bg = mode === MODE_HALFBLOCK ? value & 0x0f : -1;

      if (fg !== lastFg || bg !== lastBg) {
        if (lastFg >= 0 || lastBg >= 0) row += '{/}';
        row += `{${PALETTE[fg][0]}-fg}`;
        if (bg >= 0) row += `{${PALETTE[bg][0]}-bg}`;
        lastFg = fg;
        lastBg = bg;
      }

      row += mode === MODE_HALFBLOCK ? '▀' : (ASCII_RAMP[(value >> 4) & 0x0f] ?? ' ');
    }

    if (lastFg >= 0 || lastBg >= 0) row += '{/}';
    rows.push(row);
  }

  return rows.join('\n');
}

/** Source pixels per cell, re-exported so callers need one import. */
export { pixelsPerChar };

/**
 * Scale a cell picture to fill a tile, keeping its shape, centred.
 *
 * One encode is broadcast to every viewer, and their tiles are all
 * different sizes, so the sender picks a size from its byte budget rather
 * than from anybody's furniture. That left the picture sitting small in the
 * top-left corner of a larger tile.
 *
 * Cells scale where markup could not. "ASCII cannot be rescaled" was true
 * of tagged text - half of `{lightgreen-fg}` is nothing - but a cell is a
 * number, and nearest-neighbour sampling of numbers is exact and cheap.
 * The picture is enlarged by whole-pixel sampling, keeps its aspect ratio,
 * and is centred in whatever is left.
 *
 * A picture LARGER than the tile is scaled down the same way, which beats
 * clipping somebody's head off.
 */
export function fitCellsToTile(
  cells: CellFrame,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): CellFrame {
  if (dstWidth <= 0 || dstHeight <= 0) return new Uint8Array(0);
  if (srcWidth <= 0 || srcHeight <= 0) return new Uint8Array(dstWidth * dstHeight);
  if (srcWidth === dstWidth && srcHeight === dstHeight) return cells;

  // The largest scale that still fits, on whichever axis runs out first.
  const scale = Math.min(dstWidth / srcWidth, dstHeight / srcHeight);
  const drawWidth = Math.max(1, Math.min(dstWidth, Math.floor(srcWidth * scale)));
  const drawHeight = Math.max(1, Math.min(dstHeight, Math.floor(srcHeight * scale)));

  // Centre what is left over, so the picture sits in the middle of the
  // tile rather than in a corner.
  const offsetX = Math.floor((dstWidth - drawWidth) / 2);
  const offsetY = Math.floor((dstHeight - drawHeight) / 2);

  const out = new Uint8Array(dstWidth * dstHeight);

  for (let y = 0; y < drawHeight; y++) {
    const srcY = Math.min(srcHeight - 1, Math.floor((y * srcHeight) / drawHeight));
    const srcRow = srcY * srcWidth;
    const dstRow = (y + offsetY) * dstWidth + offsetX;

    for (let x = 0; x < drawWidth; x++) {
      const srcX = Math.min(srcWidth - 1, Math.floor((x * srcWidth) / drawWidth));
      out[dstRow + x] = cells[srcRow + srcX];
    }
  }

  return out;
}

/**
 * A frame that does not care how it will be drawn.
 *
 * Render mode used to be the SENDER's choice, because each mode had its own
 * cell format: half-block packs two palette colours, braille packs eight
 * mono dots, coloured ASCII packs a ramp step and a colour. None converts
 * to another - braille has no colour, half-block has no 2x4 detail - so one
 * broadcast could only ever be drawn one way, and cycling the mode changed
 * what OTHER people saw of you rather than what you saw of them.
 *
 * Sending both planes makes the mode a local preference:
 *
 *   dots   - eight luminance samples in a 2x4 grid. Braille reads them
 *            directly; the count of lit dots gives an ASCII ramp step.
 *   colors - the top and bottom half's palette indices, four bits each.
 *            Half-block reads them directly; coloured ASCII takes the top.
 *
 * Two bytes a cell instead of one. That would have been unthinkable when a
 * frame was 21 KB of markup; at a hundred-odd bytes it costs nothing worth
 * counting, and it buys everybody their own view.
 */
export interface RichFrame {
  dots: Uint8Array;
  colors: Uint8Array;
}

/** Dot bit for each position in the 2x4 block, in Unicode braille order. */
const BRAILLE_DOTS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

/** Lit dots per byte value, for turning a dot pattern into a ramp step. */
const POPCOUNT = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let bits = 0;
    for (let b = 0; b < 8; b++) if (i & (1 << b)) bits++;
    table[i] = bits;
  }
  return table;
})();

/**
 * Build both planes from one pass over the pixels.
 *
 * The source must be at braille resolution - two pixels across and four
 * down per cell - since that is the finest any mode needs. The colour
 * plane samples the top and bottom halves of the same block.
 */
export function richCells(
  img: PixelBuffer,
  w: number,
  h: number,
  memory?: ColorMemory
): RichFrame {
  const dots = new Uint8Array(w * h);
  const colors = new Uint8Array(w * h);
  const mem = memory ? fitColorMemory(memory, w, h) : undefined;
  const sourceWidth = w * 2;

  let lastFg = -1;
  let lastBg = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = y * w + x;

      let bits = 0;
      let topR = 0, topG = 0, topB = 0;
      let botR = 0, botG = 0, botB = 0;

      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y * 4 + dy) * sourceWidth + (x * 2 + dx)) * 4;
          const r = img.data[i];
          const g = img.data[i + 1];
          const b = img.data[i + 2];

          if ((0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5) {
            bits |= BRAILLE_DOTS[dy][dx];
          }

          // Rows 0-1 are the cell's top half, rows 2-3 its bottom half.
          if (dy < 2) { topR += r; topG += g; topB += b; }
          else { botR += r; botG += g; botB += b; }
        }
      }

      // Dither between the two nearest palette entries, by position, so
      // the sixteen colours weave into far more apparent ones.
      //
      // Only the TEMPORAL incumbent is passed, not the colour of the
      // current run. Preferring the run's colour lengthened runs for
      // compression, but it also flattens exactly the cell-to-cell
      // variation a dither pattern is made of - the two cancel out. Bytes
      // are cheap now (about a fifth of a byte per cell after delta
      // encoding); a picture that uses its palette is worth more.
      const fg = pickColorDithered(
        PALETTE, topR / 4, topG / 4, topB / 4, x, y * 2,
        mem ? [mem.fg[cell]] : [], mem?.stickiness
      );
      const bg = pickColorDithered(
        PALETTE, botR / 4, botG / 4, botB / 4, x, y * 2 + 1,
        mem ? [mem.bg[cell]] : [], mem?.stickiness
      );
      if (mem) { mem.fg[cell] = fg; mem.bg[cell] = bg; }
      lastFg = fg;
      lastBg = bg;

      dots[cell] = bits;
      colors[cell] = (fg << 4) | bg;
    }
    lastFg = -1;
    lastBg = -1;
  }

  return { dots, colors };
}

/**
 * Draw a rich frame in whichever mode the VIEWER has chosen.
 *
 * Every mode is derived from the same two planes, so changing mode redraws
 * the picture already in hand - no round trip, and no effect on anybody
 * else's view.
 */
export function richToTags(frame: RichFrame, w: number, h: number, mode: number): string {
  const rows: string[] = [];

  for (let y = 0; y < h; y++) {
    let row = '';
    let lastFg = -1;
    let lastBg = -1;

    for (let x = 0; x < w; x++) {
      const cell = y * w + x;
      const dots = frame.dots[cell] ?? 0;
      const color = frame.colors[cell] ?? 0;
      const fg = (color >> 4) & 0x0f;
      const bg = color & 0x0f;

      if (mode === MODE_BRAILLE) {
        row += String.fromCharCode(0x2800 + dots);
        continue;
      }

      if (mode === MODE_HALFBLOCK) {
        if (fg !== lastFg || bg !== lastBg) {
          if (lastFg >= 0 || lastBg >= 0) row += '{/}';
          row += `{${PALETTE[fg][0]}-fg}{${PALETTE[bg][0]}-bg}`;
          lastFg = fg;
          lastBg = bg;
        }
        row += '▀';
        continue;
      }

      // ASCII: brightness is how many of the eight dots are lit.
      const step = Math.min(
        ASCII_RAMP.length - 1,
        Math.round((POPCOUNT[dots] / 8) * (ASCII_RAMP.length - 1))
      );

      if (mode === MODE_ASCII_COLOR && fg !== lastFg) {
        if (lastFg >= 0) row += '{/}';
        row += `{${PALETTE[fg][0]}-fg}`;
        lastFg = fg;
        lastBg = -1;
      }

      row += ASCII_RAMP[step] ?? ' ';
    }

    if (lastFg >= 0 || lastBg >= 0) row += '{/}';
    rows.push(row);
  }

  return rows.join('\n');
}

/** Scale both planes of a rich frame to a tile, keeping shape and centring. */
export function fitRichToTile(
  frame: RichFrame,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): RichFrame {
  return {
    dots: fitCellsToTile(frame.dots, srcWidth, srcHeight, dstWidth, dstHeight),
    colors: fitCellsToTile(frame.colors, srcWidth, srcHeight, dstWidth, dstHeight),
  };
}
