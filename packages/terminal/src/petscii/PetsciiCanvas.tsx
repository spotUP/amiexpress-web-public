import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PetsciiMachine } from './petscii-machine';
import { C64_PALETTE_COLODORE } from './c64-palette';
import { buildGlyphAtlas, glyphCellIndex, TintedAtlasCache } from './glyph-atlas';
import { keyEventToPetscii } from './keymap';

export interface PetsciiCanvasProps {
  machine: PetsciiMachine;
  /** VIC-II color palette, indexed 0-15. Defaults to Colodore. */
  palette?: readonly string[];
  /** Integer zoom factor. 320x200 native -> 640x400 at the default scale of 2. */
  scale?: number;
  /** Keyboard input, already translated to PETSCII bytes. */
  onData?: (bytes: number[]) => void;
}

const COLS = 40;
const ROWS = 25;
const CELL_PX = 8; // native C64 character cell, both axes (320x200 / 40x25)
const ATLAS_PX_SIZE = 8; // atlas built 1:1 with the native cell; `scale` does the zoom
const CURSOR_BLINK_MS = 500;

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
  scale = 2,
  onData,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atlasCacheRef = useRef<TintedAtlasCache | null>(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [cursorOn, setCursorOn] = useState(true);

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
    const bytes = keyEventToPetscii(e.key, e.shiftKey);
    if (bytes) {
      e.preventDefault();
      onData?.(bytes);
    }
  }, [onData]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ imageRendering: 'pixelated', width, height }}
    />
  );
};
