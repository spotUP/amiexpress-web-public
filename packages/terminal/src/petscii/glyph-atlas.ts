/**
 * PETSCII glyph atlas: renders all 512 C64 character-ROM glyphs (2 charset
 * banks x 256 screen codes, including the bit-7 "reverse" variants at
 * +0x80) into one white-master canvas using the PetMe64 font, then tints
 * per-color copies on demand for cheap `drawImage` compositing at render
 * time.
 *
 * The PetMe64 font maps every screen code to a Private Use Area codepoint
 * at `0xE000 + bank * 0x100 + screenCode`, so bank 0/1 and the reverse
 * variants (screen code bit 7 set) are all directly addressable glyphs -
 * no runtime invert/compose step is needed for reverse video.
 *
 * Layout: one row, 512 glyph cells, `pxSize` wide/tall each:
 *   columns 0-255   = bank 0, screen codes 0-255 (128 normal + 128 reverse)
 *   columns 256-511 = bank 1, screen codes 0-255
 */

const GLYPHS_PER_BANK = 256;
const BANK_COUNT = 2;
const TOTAL_GLYPHS = GLYPHS_PER_BANK * BANK_COUNT;

export async function buildGlyphAtlas(pxSize: number): Promise<HTMLCanvasElement> {
  await document.fonts.load(`${pxSize}px PetMe64`);

  const canvas = document.createElement('canvas');
  canvas.width = TOTAL_GLYPHS * pxSize;
  canvas.height = pxSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildGlyphAtlas: 2D canvas context unavailable');

  ctx.font = `${pxSize}px PetMe64`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFFFFF';

  for (let bank = 0; bank < BANK_COUNT; bank++) {
    for (let sc = 0; sc < GLYPHS_PER_BANK; sc++) {
      const codepoint = 0xE000 + bank * 0x100 + sc;
      const x = (bank * GLYPHS_PER_BANK + sc) * pxSize;
      // Clip each glyph's draw to its own cell. Without this, Chromium's
      // anti-aliased rasterization of an inked glyph bleeds a faint
      // (~7% alpha) fringe past its nominal advance box into the
      // NEXT cell over - since all 512 glyphs sit edge-to-edge with no
      // gutter, that fringe lands inside the neighboring screen code's
      // slice. A blank cell (space) sitting next to an inked glyph in
      // atlas order then carries a stray lit pixel forever: tinted and
      // drawImage'd onto every occurrence of that screen code, it shows
      // up as a faint dot in an otherwise-solid-background C64 cell.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, pxSize, pxSize);
      ctx.clip();
      ctx.fillText(String.fromCodePoint(codepoint), x, 0);
      ctx.restore();
    }
  }

  return canvas;
}

/** column offset (in glyph cells) of a (bank, screenCode) glyph within the atlas built by buildGlyphAtlas. */
export function glyphCellIndex(bank: 0 | 1, screenCode: number): number {
  return bank * GLYPHS_PER_BANK + (screenCode & 0xFF);
}

/**
 * Lazily-built per-color tinted copies of the white-master atlas. Each
 * tinted canvas is the same size as the master; `source-in` compositing
 * paints the master's alpha shape with a solid fill of `color`, giving a
 * fully opaque-glyph / transparent-background result that can be
 * `drawImage`'d directly onto the screen canvas.
 *
 * Capped at 16 entries (the full VIC-II palette) - callers only ever pass
 * one of the 16 palette colors, so the cache never needs eviction.
 */
export class TintedAtlasCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();

  constructor(private readonly master: HTMLCanvasElement) {}

  get(color: string): HTMLCanvasElement {
    const cached = this.cache.get(color);
    if (cached) return cached;

    const tinted = document.createElement('canvas');
    tinted.width = this.master.width;
    tinted.height = this.master.height;
    const ctx = tinted.getContext('2d');
    if (!ctx) throw new Error('TintedAtlasCache: 2D canvas context unavailable');

    ctx.drawImage(this.master, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, tinted.width, tinted.height);

    if (this.cache.size < 16) this.cache.set(color, tinted);
    return tinted;
  }
}
