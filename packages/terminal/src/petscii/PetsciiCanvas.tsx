import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { C64_PALETTE_COLODORE, C128_VDC_PALETTE } from '@amiexpress/bbs-door-sdk/petscii';
import { buildGlyphAtlas, glyphCellIndex, TintedAtlasCache } from './glyph-atlas';
import { keyEventToPetscii, pastedTextToPetscii } from './keymap';

export interface PetsciiCanvasProps {
  machine: PetsciiMachine;
  /**
   * The sixteen colours, indexed by VIC colour number.
   *
   * Left out, the canvas paints with the palette the SCREEN it was handed
   * implies: a C64's own colours at 40 columns, and what a C128 shows on its
   * 80-column screen at 80 (`C128_VDC_PALETTE` - not a nearest match, the
   * KERNAL's own table). A caller who has chosen otherwise is passed his
   * choice here and it wins.
   */
  palette?: readonly string[];
  /**
   * Upper bound on the integer render scale fed to the canvas's backing
   * store (see `fitScale`/the fill-fit policy below) - a roomy container
   * still won't render past this many native C64 pixels per screen pixel.
   * Defaults to 4 (320x200 native -> 1280x800 backing-store resolution at
   * that cap, CSS-downscaled to whatever actually fits).
   */
  scale?: number;
  /** Keyboard input, already translated to PETSCII bytes. */
  onData?: (bytes: number[]) => void;
  /**
   * Whether the canvas takes keyboard focus (tabIndex 0). BBSTerminal
   * passes true for a full-canvas PETSCII session, where the canvas owns
   * keyboard input via onData.
   */
  focusable?: boolean;
  /** Focus the canvas as soon as it mounts (the full-canvas session makes it the keyboard surface). */
  focusOnMount?: boolean;
  /**
   * OVERRIDE for the cursor's blink, and nothing else. OMIT IT - and the
   * default is to omit it - and the cursor blinks on `CURSOR_BLINK_MS` the
   * way a C64's screen-editor cursor does, which is the only behaviour this
   * board ships today. Pass `false` to hold it dark, `true` to hold it
   * solid; a caller that wants a game screen with no cursor is what this is
   * for.
   *
   * It USED TO DEFAULT TO `true`, which made `cursorOn` unreachable and
   * froze the block solid on every PETSCII session (regression from
   * c8e0f4dff, fixed 2026-09-06). A default here is not a neutral choice:
   * any non-undefined value switches the blink off.
   */
  cursorVisible?: boolean;
}

export interface PetsciiCanvasHandle {
  focus(): void;
}

// The C64's screen, and the default this canvas has always drawn. The WIDE
// PETSCII screen is 80x25 (petscii80); every number below is derived from
// the machine's OWN shape rather than from these, so one canvas paints both.
const DEFAULT_COLS = 40;
const DEFAULT_ROWS = 25;
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
/**
 * How TALL a character is, in stored pixels, at a given screen width.
 *
 * A C128 in 80-column mode puts twice as many characters across the same
 * physical screen a C64 puts 40 across, so an 80-column character is half as
 * wide as a 40-column one and the SCREEN keeps its shape. Drawn with square
 * 8x8 cells instead, the wide screen came out twice as wide as it is tall:
 * "the 80 column petscii looks very horizontally stretched" (sysop, live
 * board, 2026-09-07), whose own fix was "double each chars height" - the same
 * proportion, arrived at by eye.
 *
 * Doubling the HEIGHT is the version drawn here, rather than halving the
 * width: every one of the glyph's eight columns survives, where a horizontal
 * squeeze would throw half of them away before the browser ever saw it. The
 * cell becomes 8x16, the screen 672x432, and its shape (1.56) is a C64
 * screen's (1.52).
 */
const WIDE_ROW_DOUBLING = 2;
const cellHeightFor = (cols: number): number =>
  CELL_PX * (cols > DEFAULT_COLS ? WIDE_ROW_DOUBLING : 1);

const unitWidthFor = (cols: number): number => cols * CELL_PX + 2 * BORDER_PER_SCALE;
const unitHeightFor = (rows: number, cols: number = DEFAULT_COLS): number =>
  rows * cellHeightFor(cols) + 2 * BORDER_PER_SCALE;
/**
 * The footprint per unit of integer scale, for anything that needs to
 * reserve room before a machine exists: 352x232 for a C64's screen, and
 * 672x232 for the wide one (petscii80 phase 0 measured both).
 */
export const PETSCII_UNIT_FOOTPRINT = {
  c64: { width: unitWidthFor(DEFAULT_COLS), height: unitHeightFor(DEFAULT_ROWS, DEFAULT_COLS) },
  wide: { width: unitWidthFor(80), height: unitHeightFor(DEFAULT_ROWS, 80) },
} as const;

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
  palette,
  scale: maxScale = 4,
  onData,
  cursorVisible,
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

  // THE SHAPE, from the machine itself. 40x25 for a C64, 80x25 for this
  // board's wide PETSCII screen - and never a constant here, because the
  // canvas draws whichever it is handed.
  const cols = machine.state.cols || DEFAULT_COLS;
  const rows = machine.state.rows || DEFAULT_ROWS;
  // THE COLOURS THE SCREEN IMPLIES, unless the caller chose otherwise. A C64
  // is VIC-II; a C128's 80-column screen is the VDC's sixteen, which its
  // KERNAL maps the PETSCII colour bytes onto - orange arrives as magenta
  // there, and dark grey as cyan, which no nearest-colour search would ever
  // produce (sdk/petscii/c64-palette.ts).
  const colours = palette
    ?? (cols > DEFAULT_COLS ? C128_VDC_PALETTE : C64_PALETTE_COLODORE);
  const unitW = unitWidthFor(cols);
  const unitH = unitHeightFor(rows, cols);

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
      const fit = Math.min(availW / unitW, availH / unitH);
      setFitScale(fit);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The footprint is part of the measurement: an 80-column screen is
    // 672x432 per unit of scale where a C64's is 352x232 - a taller cell, not
    // a wider screen - so a mode change has to re-fit.
  }, [unitW, unitH]);

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
  const cellW = CELL_PX * scale;
  const cellH = cellHeightFor(cols) * scale;
  const width = cols * cellW + 2 * border;
  const height = rows * cellH + 2 * border;

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
    // One cell on the glass. Square on a C64; twice as tall as it is wide on
    // the wide screen, where 80 characters share a C64's width.
    const destW = cellW;
    const destH = cellH;

    // Border.
    ctx.fillStyle = colours[s.border & 0x0F];
    ctx.fillRect(0, 0, width, height);

    // Screen background.
    ctx.fillStyle = colours[s.background & 0x0F];
    ctx.fillRect(border, border, cols * destW, rows * destH);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const screenCode = s.screen[idx];
        if (isBlankScreenCode(screenCode)) continue; // background fill above is already correct - draw nothing
        const color = colours[s.colorRam[idx] & 0x0F];
        const tinted = atlasCache.get(color);
        const sx = glyphCellIndex(s.charsetBank, screenCode) * ATLAS_PX_SIZE;
        const dx = border + x * destW;
        const dy = border + y * destH;
        ctx.drawImage(tinted, sx, 0, ATLAS_PX_SIZE, ATLAS_PX_SIZE, dx, dy, destW, destH);
      }
    }

    // Block cursor: a solid cell in the cursor's ink color, BLINKING on an
    // interval, matching the C64's solid-reverse-block screen-editor cursor.
    // `cursorVisible` is an override for a caller that wants it held solid
    // or held dark; when it is undefined - which is the normal case, and the
    // default - the blink state decides. It defaulted to `true` between
    // c8e0f4dff and this fix, which made `cursorOn` unreachable and left the
    // block permanently lit on every PETSCII session.
    //
    // A door that HID the cursor (`CSI ?25l`) outranks both. The model carries
    // that now, because the canvas is what draws the cursor and a full-screen
    // door still got one blinking over its playfield ("i see a blinking petscii
    // cursor in game", 2026-09-06).
    const effectiveCursorOn = s.cursorShown === false ? false : (cursorVisible ?? cursorOn);
    if (effectiveCursorOn) {
      const cursorIdx = s.cursorY * cols + s.cursorX;
      ctx.fillStyle = colours[s.colorRam[cursorIdx] & 0x0F];
      ctx.fillRect(border + s.cursorX * destW, border + s.cursorY * destH, destW, destH);
    }
    // `cursorVisible` belongs in this list: without it a change to the
    // override kept the STALE closure - the repaint effects below re-run on
    // `draw`'s identity, so a prop the memo does not watch cannot reach the
    // glass until something else happens to change.
  }, [machine, colours, scale, cursorOn, cursorVisible, width, height, border, cellW, cellH, cols, rows]);

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

  /**
   * PASTE, WHICH A CANVAS NEVER GETS BY ITSELF.
   *
   * Keys arrive through onKeyDown; pasted text does not arrive as keys at
   * all, and a <canvas> is not an editable element, so nothing here saw a
   * paste and it did nothing ("ctrl+c and paste doesnt work at all in petscii
   * mode", 2026-09-13). The event fires on the document with the focused
   * element as its target, so that is where this listens - and only while
   * this canvas is the focused element, or a paste meant for the admin's
   * text box would be swallowed too.
   *
   * The text becomes the same PETSCII bytes the keymap produces, so it takes
   * the one input path the keys take. A line break is RETURN, exactly as
   * typing it would have been.
   */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = canvasRef.current;
      if (!el || document.activeElement !== el) return;
      const text = e.clipboardData?.getData('text') ?? '';
      if (!text) return;
      e.preventDefault();
      const bytes = pastedTextToPetscii(text);
      if (bytes.length) onData?.(bytes);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    // CTRL+C IS THE BOARD'S ABORT KEY, and it could not be pressed here at
    // all: the guard below hands every Ctrl chord to the browser, which is
    // right for Cmd+R and for copy, and wrong for the one key that leaves a
    // door or an operator chat ("ctrl+c and paste doesnt work at all in
    // petscii mode", 2026-09-13). It goes to the board as RUN/STOP, which is
    // the same key on a real C64 - unless the caller has actually selected
    // something, where copy is plainly what they meant. A canvas holds no
    // selectable text of its own, so that is rare and cheap to honour.
    if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
      const selected = typeof window !== 'undefined' && !window.getSelection()?.isCollapsed;
      if (!selected) {
        e.preventDefault();
        onData?.([0x03]);
        return;
      }
    }
    // Every other Ctrl/Cmd/Alt chord still passes through untouched:
    // keyEventToPetscii knows only `key` + shift, so without this guard a
    // Cmd+R would resolve to a mapped letter byte and eat the reload.
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
          // smaller than even scale 1 (352x232 for a C64, 672x432 for the
          // wide screen) - see `fitScale` above - proportionally shrinking the
          // crisp pixel art instead of letting it overflow. The wide screen's
          // proportions are already IN that resolution, because its cells are
          // drawn twice as tall.
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
