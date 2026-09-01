import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PetsciiMachine } from './petscii-machine';
import { C64_PALETTE_COLODORE } from './c64-palette';
import { buildGlyphAtlas, glyphCellIndex, TintedAtlasCache } from './glyph-atlas';
import { keyEventToPetscii } from './keymap';

export interface PetsciiCanvasProps {
  machine: PetsciiMachine;
  /** VIC-II color palette, indexed 0-15. Defaults to Colodore. */
  palette?: readonly string[];
  /**
   * Upper bound on the integer zoom factor. The actual render scale is
   * auto-fit to the parent container (see `fitScale` below) and will only
   * ever be this value or smaller - it is a maximum, not a fixed size.
   * Defaults to 2 (320x200 native -> 640x400 at that cap).
   */
  scale?: number;
  /** Keyboard input, already translated to PETSCII bytes. */
  onData?: (bytes: number[]) => void;
}

const COLS = 40;
const ROWS = 25;
const CELL_PX = 8; // native C64 character cell, both axes (320x200 / 40x25)
const ATLAS_PX_SIZE = 8; // atlas built 1:1 with the native cell; `scale` does the zoom
const CURSOR_BLINK_MS = 500;
const BORDER_PER_SCALE = 16; // px of border per axis, per unit of scale - matches `border = 16 * scale` below
// Bordered screen footprint per unit of integer scale: 40*8 + 2*16 = 352
// wide, 25*8 + 2*16 = 232 tall. Derived from the same constants `border`/
// `width`/`height` use below so the two can never drift apart.
const UNIT_W = COLS * CELL_PX + 2 * BORDER_PER_SCALE;
const UNIT_H = ROWS * CELL_PX + 2 * BORDER_PER_SCALE;

/**
 * Renders a `PetsciiMachine`'s screen/color-RAM state onto a `<canvas>` via a
 * glyph atlas, and translates keyboard input into PETSCII bytes.
 *
 * All C64-accurate scaling happens in integer pixel multiples
 * (`image-rendering: pixelated` + `ctx.imageSmoothingEnabled = false`) so the
 * character ROM look stays crisp at any zoom level instead of blurring like a
 * font rendered at a fractional size would.
 */
export const PetsciiCanvas: React.FC<PetsciiCanvasProps> = ({
  machine,
  palette = C64_PALETTE_COLODORE,
  scale: maxScale = 2,
  onData,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atlasCacheRef = useRef<TintedAtlasCache | null>(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [cursorOn, setCursorOn] = useState(true);
  // The largest integer scale whose full bordered screen (352x232 at scale 1)
  // fits inside the parent container, measured below. Starts at 1 so the
  // very first paint never overflows before the initial measurement runs.
  const [fitScale, setFitScale] = useState(1);

  // Measure the parent container (ResizeObserver + an initial synchronous
  // measure) and recompute the largest integer scale that fits without
  // overflowing. `maxScale` (the `scale` prop) is a ceiling on this, not a
  // fixed value - a roomy container still won't zoom past it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      if (availW <= 0 || availH <= 0) return;
      const fit = Math.max(1, Math.floor(Math.min(availW / UNIT_W, availH / UNIT_H)));
      setFitScale(fit);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = Math.max(1, Math.min(maxScale, fitScale));

  const border = 16 * scale;
  const width = COLS * CELL_PX * scale + 2 * border;
  const height = ROWS * CELL_PX * scale + 2 * border;

  // Build the glyph atlas once per mount.
  useEffect(() => {
    let cancelled = false;
    buildGlyphAtlas(ATLAS_PX_SIZE).then((atlas) => {
      if (cancelled) return;
      atlasCacheRef.current = new TintedAtlasCache(atlas);
      setAtlasReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Cursor blink timer.
  useEffect(() => {
    const id = setInterval(() => setCursorOn((v) => !v), CURSOR_BLINK_MS);
    return () => clearInterval(id);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const atlasCache = atlasCacheRef.current;
    if (!canvas || !atlasCache) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const s = machine.state;
    const destCell = CELL_PX * scale;

    // Border.
    ctx.fillStyle = palette[s.border & 0x0F];
    ctx.fillRect(0, 0, width, height);

    // Screen background.
    ctx.fillStyle = palette[s.background & 0x0F];
    ctx.fillRect(border, border, COLS * destCell, ROWS * destCell);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const idx = y * COLS + x;
        const screenCode = s.screen[idx];
        const color = palette[s.colorRam[idx] & 0x0F];
        const tinted = atlasCache.get(color);
        const sx = glyphCellIndex(s.charsetBank, screenCode) * ATLAS_PX_SIZE;
        const dx = border + x * destCell;
        const dy = border + y * destCell;
        ctx.drawImage(tinted, sx, 0, ATLAS_PX_SIZE, ATLAS_PX_SIZE, dx, dy, destCell, destCell);
      }
    }

    // Block cursor: a solid cell in the cursor's ink color, blinking on an
    // interval, matching the C64's solid-reverse-block screen-editor cursor.
    if (cursorOn) {
      const cursorIdx = s.cursorY * COLS + s.cursorX;
      ctx.fillStyle = palette[s.colorRam[cursorIdx] & 0x0F];
      ctx.fillRect(border + s.cursorX * destCell, border + s.cursorY * destCell, destCell, destCell);
    }
  }, [machine, palette, scale, cursorOn, width, height, border]);

  // Keep a ref to the latest draw() so the onUpdate subscription below
  // doesn't need to be torn down and rebuilt every cursor blink.
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  // Subscribe to machine repaints once the atlas is ready. Wraps (rather
  // than replaces) any pre-existing onUpdate handler so PetsciiCanvas can
  // coexist with other consumers of the machine (e.g. a baud-pacing feeder).
  useEffect(() => {
    if (!atlasReady) return;
    drawRef.current();
    const prevOnUpdate = machine.onUpdate;
    machine.onUpdate = (fullRepaint) => {
      prevOnUpdate?.(fullRepaint);
      drawRef.current();
    };
    return () => { machine.onUpdate = prevOnUpdate; };
  }, [machine, atlasReady]);

  // Repaint on every cursor blink toggle.
  useEffect(() => {
    if (atlasReady) draw();
  }, [cursorOn, atlasReady, draw]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    // Let Ctrl/Cmd/Alt chords (copy, select-all, browser reload, etc.) pass
    // through untouched - keyEventToPetscii only knows about `key` + shift,
    // so without this guard a Ctrl+C or Cmd+R would still resolve to a
    // mapped letter byte and get preventDefault'd, eating the OS/browser
    // shortcut.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const bytes = keyEventToPetscii(e.key, e.shiftKey);
    if (bytes) {
      e.preventDefault();
      onData?.(bytes);
    }
  }, [onData]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          imageRendering: 'pixelated',
          // `width`/`height` set the backing-store resolution via the
          // attributes above; leaving the CSS size on 'auto' lets the
          // canvas's own intrinsic size (that resolution) drive layout like
          // an <img>. max-width/max-height only bite when the container is
          // smaller than even scale 1 (352x232) - see `fitScale` above -
          // proportionally shrinking the crisp pixel art instead of letting
          // it overflow.
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      />
    </div>
  );
};
