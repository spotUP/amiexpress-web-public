import React, { useEffect, useRef, useState } from 'react';
import { buildGlyphAtlas, glyphCellIndex, TintedAtlasCache } from './glyph-atlas';

/**
 * One PETSCII glyph, drawn from the SAME atlas the screen canvas uses.
 *
 * A charset browser needs 256 of these beside a canvas showing the art, and
 * the two must agree about what screen code $5E looks like. Two glyph sets in
 * one editor drift the first time the atlas changes - which is why this is a
 * component over the shared atlas rather than a font, a sprite sheet or an
 * SVG set.
 */
export interface PetsciiGlyphProps {
  /** Screen code 0x00-0x7F. The reverse bit is `reverse`, never folded in. */
  screenCode: number;
  bank: 0 | 1;
  /** The ink, as a CSS colour - a VIC palette entry. */
  color: string;
  /** The ground. Defaults to transparent, so a swatch can sit on any surface. */
  background?: string;
  /** Draw the reverse variant - a different glyph in the atlas, not a colour swap. */
  reverse?: boolean;
  /** CSS pixels, square. The native cell is 8, so the default is a 2x zoom. */
  size?: number;
}

/** The native C64 cell, both axes. The atlas is built 1:1 with it. */
const CELL_PX = 8;

/**
 * ONE atlas for every glyph on the page.
 *
 * `buildGlyphAtlas` fetches a font and rasterises 512 cells. A charset
 * browser mounts 256 of these components at once, and a per-component build
 * would be 256 fetches and 256 rasterisations for one panel. The promise is
 * module-level and keyed by the only thing that changes the bitmap.
 */
const atlases = new Map<string, Promise<TintedAtlasCache>>();

function atlasFor(swedish: boolean): Promise<TintedAtlasCache> {
  const key = String(swedish);
  let pending = atlases.get(key);
  if (!pending) {
    pending = buildGlyphAtlas(CELL_PX, swedish).then((master) => new TintedAtlasCache(master));
    atlases.set(key, pending);
  }
  return pending;
}

export function PetsciiGlyph({
  screenCode, bank, color, background, reverse = false, size = 16,
}: PetsciiGlyphProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cache, setCache] = useState<TintedAtlasCache | null>(null);

  useEffect(() => {
    let cancelled = false;
    atlasFor(false)
      .then((built) => { if (!cancelled) setCache(built); })
      .catch((e) => {
        // A rejected atlas build used to surface only as an unhandled
        // rejection and a swatch that never draws. Say so.
        console.error('[PETSCII] glyph atlas failed', e);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cache) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    /*
     * REVERSE IS A GLYPH, not an ink/ground swap.
     *
     * The atlas holds 256 codes per bank and the reverse variants ARE the
     * upper 128 - the PetMe64 font maps each to its own PUA codepoint, so
     * there is no runtime invert. `PetsciiCanvas` passes the screen byte with
     * bit 7 still in it and tints the result in the cell's colour, and this
     * has to do the same thing or the browser and the art disagree about
     * every reversed cell - the exact drift this component exists to prevent.
     */
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const tinted = cache.get(color);
    const sx = glyphCellIndex(bank, (screenCode & 0x7f) | (reverse ? 0x80 : 0)) * CELL_PX;
    ctx.drawImage(tinted, sx, 0, CELL_PX, CELL_PX, 0, 0, canvas.width, canvas.height);
  }, [cache, screenCode, bank, color, background, reverse, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', display: 'block', width: size, height: size }}
    />
  );
}
