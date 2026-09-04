import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { C64_PALETTE_COLODORE } from '@amiexpress/bbs-door-sdk/petscii';
import { buildGlyphAtlas, glyphCellIndex, TintedAtlasCache } from './glyph-atlas';
import { keyEventToPetscii } from './keymap';

export interface PetsciiCanvasProps {
  machine: PetsciiMachine;
  /** VIC-II color palette, indexed 0-15. Defaults to Colodore. */
  palette?: readonly string[];
  scale?: number;
  /** Keyboard input, already translated to PETSCII bytes. */
  onData?: (bytes: number[]) => void;
  focusable?: boolean;
  focusOnMount?: boolean;
  /**
   * Whether the text cursor is visible. When provided, overrides the
   * internal blink state. When undefined, the cursor blinks normally.
   * Set to false when the user is not in a prompt/input context, true
   * when waiting for input (matching ANSI mode's ?25h/?25l behavior).
   */
  cursorVisible?: boolean;
}

export interface PetsciiCanvasHandle {
  focus(): void;
}

const COLS = 40;
const ROWS = 25;
// Screen codes that render as a blank space in BOTH charset banks (verified
// against the PetMe64 glyph outlines: 0x20 and 0x60 are empty in bank 0 and
// bank 1; their reverse-video counterparts, bit 7 set, are solid blocks and
// must still paint). A C64 background is flat - nothing may be drawn for
// these cells beyond the screen-background fill already laid down below.
function isBlankScreenCode(screenCode: number): boolean {
  return screenCode === 0x20 || screenCode === 0x60;
}
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
export const PetsciiCanvas = forwardRef<PetsciiCanvasHandle, PetsciiCanvasProps>(({
  machine,
  palette = C64_PALETTE_COLODORE,
  scale: maxScale = 4,
  onData,
  cursorVisible = true,
  focusable = false,
  focusOnMount = false,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => canvasRef.current?.focus() }), []);
  useEffect(() => {
    if (focusOnMount) canvasRef.current?.focus();
  }, [focusOnMount]);
  const atlasCacheRef = useRef<TintedAtlasCache | null>(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [cursorOn, setCursorOn] = useState(true);
  // The CONTINUOUS (not integer) ratio of "parent container size" to "one
  // unit (352x232) bordered screen", measured below. Starts at 1 so the
  // very first paint never overflows before the initial measurement runs.
  const [fitScale, setFitScale] = useState(1);

  // Measure the parent container (ResizeObserver + an initial synchronous
  // measure) and recompute the continuous fit ratio. `maxScale` (the
  // `scale` prop) caps the render-resolution integer derived from this, not
  // this ratio itself.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      if (availW <= 0 || availH <= 0) return;
      const fit = Math.min(availW / UNIT_W, availH / UNIT_H);
      setFitScale(fit);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fill-fit policy (sysop live-screenshot review, final wave addendum): a
  // FLOORED integer scale wastes up to a whole tier of container space -
  // a 2.9x-fitting container rendered at a hard 2x, leaving a visible black
  // margin ("black sea") the picture could have filled. Render the canvas's
  // BACKING STORE at the smallest integer >= the continuous fit instead (a
  // crisp, slightly-larger-than-needed pixel base), and let the CSS
  // max-width/max-height:100% + width/height:auto below (a standard
  // replaced-element scale-down-preserving-aspect-ratio) shrink it down to
  // the exact continuous fit with `image-rendering: pixelated` - a clean
  // downscale from the next integer, not the wasted floor.
  const scale = Math.max(1, Math.min(maxScale, Math.ceil(fitScale)));

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
    }).catch((e) => {
      // A rejected atlas build (font fetch blocked, OffscreenCanvas denied)
      // used to surface only as an unhandled rejection and a canvas that
      // never draws. Say so.
      console.error('[PETSCII] glyph atlas failed', e);
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
        if (isBlankScreenCode(screenCode)) continue; // background fill above is already correct - draw nothing
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
    // When cursorVisible prop is provided, it overrides the blink state so
    // the backend can hide the cursor when not in a prompt/input context.
    const effectiveCursorOn = cursorVisible !== undefined ? cursorVisible : cursorOn;
    if (effectiveCursorOn) {
      const cursorIdx = s.cursorY * COLS + s.cursorX;
      ctx.fillStyle = palette[s.colorRam[cursorIdx] & 0x0F];
      ctx.fillRect(border + s.cursorX * destCell, border + s.cursorY * destCell, destCell, destCell);
    }
  }, [machine, palette, scale, cursorOn, width, height, border]);

  // Keep a ref to the latest draw() so the onUpdate subscription below
  // doesn't need to be torn down and rebuilt every cursor blink.
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  // One paint per animation frame, never one per feed.
  //
  // `PetsciiMachine.feed()` fires onUpdate once per CALL, and how often it
  // is called is decided by how the bytes arrive, not by how often the
  // picture changes. The server's screen pacer emits every ANSI escape
  // token as its own socket message, so one animated logo (Screens/flt.txt)
  // reaches the canvas as ~2,600 separate feeds - which used to be ~2,600
  // full 1,000-cell repaints, up to 2.6M drawImage calls, for a single
  // screen (sysop's "the ANSI animated logos play super slow in PETSCII
  // mode", 2026-09-02). draw() reads the machine's CURRENT state, so
  // collapsing a burst to a single frame loses nothing: the one paint shows
  // the state the last feed in that burst left behind.
  const frameRef = useRef<number | null>(null);
  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) return; // a paint is already queued for this frame
    frameRef.current = requestAnimationFrame(() => {
      // Clear the latch FIRST, and in a finally: a draw that throws (a lost
      // context, a door's out-of-range palette) must not leave "a frame is
      // already queued" standing for ever - that is a canvas that never
      // repaints again, which looks exactly like a crashed BBS.
      try {
        drawRef.current();
      } catch (err) {
        // A throwing paint costs one frame, never the session: the browser
        // isolates a rAF throw, but the test runner and the console should
        // not see an unhandled error either.
        console.error('[PETSCII] paint failed', err);
      } finally {
        frameRef.current = null;
      }
    });
  }, []);
  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  // Subscribe to machine repaints once the atlas is ready. Wraps (rather
  // than replaces) any pre-existing onUpdate handler so PetsciiCanvas can
  // coexist with other consumers of the machine.
  useEffect(() => {
    if (!atlasReady) return;
    drawRef.current();
    const prevOnUpdate = machine.onUpdate;
    machine.onUpdate = (fullRepaint) => {
      prevOnUpdate?.(fullRepaint);
      scheduleDraw();
    };
    return () => { machine.onUpdate = prevOnUpdate; };
  }, [machine, atlasReady, scheduleDraw]);

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
        tabIndex={focusable ? 0 : -1}
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
          // The canvas is the focus owner (tabIndex + focus()); without this
          // the browser draws its default focus ring around it, which reads
          // as a blue border the C64 never had. The blinking cursor is the
          // focus indicator.
          outline: 'none',
        }}
      />
    </div>
  );
});

PetsciiCanvas.displayName = 'PetsciiCanvas';
