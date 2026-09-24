import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { C64_PALETTE_COLODORE, C128_VDC_PALETTE } from '@amiexpress/bbs-door-sdk/petscii';
import { buildGlyphAtlas, glyphCellIndex, TintedAtlasCache } from './glyph-atlas';
import { controlChordToPetscii, keyEventToPetscii, pastedTextToPetscii } from './keymap';
import { XTERM_CONFIG } from '../utils/terminal-utils';
import { clampScrollOffset } from './scrollback';

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
  /** Draw the Swedish character set over the bracket/pound trio. */
  swedish?: boolean;
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
  /**
   * What colour the cursor block is painted.
   *
   * Defaults to the BOARD'S OWN CURSOR COLOUR - the same `#ff0000` the ANSI
   * terminal's theme uses (utils/terminal-utils.ts) - because the cursor is
   * the TERMINAL's chrome and not something the C64 ever drew: a caller who
   * switches between the two modes should not be told they have changed
   * machine by the colour of their cursor (sysop, 2026-09-15: "i get a white
   * cursor in the petscii mode. make it red like the ansi mode").
   *
   * It used to take the colour RAM under the cursor, which on a fresh screen
   * is white and on a coloured one is whatever the last PETSCII colour code
   * said - so the cursor changed colour as the caller typed.
   *
   * An EDITOR may want the old behaviour back: pass `'ink'` and the cell's
   * own colour is used again.
   *
   * `'pen'` is the one that answers "which colour am I about to draw in":
   * the machine's CURRENT PEN, which is what a colour chord changes.
   * `'ink'` cannot do it - colour RAM only changes when something is
   * PRINTED, and pressing Ctrl+3 prints nothing, so the cursor would sit
   * there in the old colour until the caller typed a character and found
   * out. "the cursor needs to change color so i see that i change color"
   * (the sysop, 2026-09-23).
   *
   * That supersedes his 2026-09-15 ask for a red cursor matching the ANSI
   * terminal: a PETSCII caller can now type in sixteen colours, and being
   * told which one is worth more than the two modes looking alike.
   */
  cursorColour?: string | 'ink' | 'pen';
  /**
   * The cell under the pointer, for an editor drawing on this canvas.
   *
   * It lives HERE because the canvas owns the border width, the integer
   * scale and the cell size, and it is the only place that can answer
   * honestly. An editor that recomputed a cell from the DOM would be a second
   * source of truth that drifts the first time the fit policy changes.
   *
   * Never fires for the border: a C64's frame is not part of the 40x25
   * screen, and a click there is not a cell.
   */
  onCellPointer?: (event: PetsciiCellPointer) => void;
  /** A one-pixel cell grid, as Petmate draws it. Off by default. */
  gridVisible?: boolean;
  /** Cells to outline: the MCI tokens the editor found, and a lifted brush. */
  highlight?: readonly PetsciiHighlight[];
  /**
   * HOW FAR BACK IN THE HISTORY THE GLASS IS LOOKING, in rows. 0 is live.
   *
   * The machine keeps the rows that leave the screen (`historyRows`); this
   * says which window of them to draw. Anything past the end of the history
   * is clamped, so a caller may keep asking to scroll up for ever and simply
   * stops moving.
   */
  scrollOffset?: number;
}

/** A pointer over a cell of the 40x25 screen. Never over the border. */
export interface PetsciiCellPointer {
  type: 'down' | 'move' | 'up' | 'wheel';
  x: number;
  y: number;
  /** The buttons held, as the DOM reports them - so a move can tell a drag from a hover. */
  buttons: number;
  /**
   * WHICH button, and what was held down with it.
   *
   * A door reads a click the way blessed does - left, middle or right, plus
   * the modifiers - and the canvas is the only thing that knows. Before this
   * the pointer carried neither, because its one consumer was the selection
   * rectangle and a selection has no button.
   */
  button: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  /** Wheel only: how far, in the DOM's units. */
  deltaY?: number;
}

/**
 * What a marked rectangle MEANS, and therefore how it is drawn.
 *
 * The first three are the editor's, and they are OUTLINES around cells the
 * caller has not touched - an MCI token the board will expand, a token it
 * cannot, a lifted brush.
 *
 * `selection` is the caller's own, and it is not an outline at all: the
 * cells are drawn REVERSED. A C64 has no per-cell background to tint and no
 * concept of a box round some characters; reverse video is the one fill the
 * machine has, and it is what the board already uses for a highlighted list
 * row. "selecting text feels weird in petscii mode, can we do it by
 * inverting chars or coloring them differently or something?" (the sysop,
 * 2026-09-22).
 */
export type PetsciiHighlightTone = 'mci' | 'mci-unresolved' | 'brush' | 'selection';

/** A rectangle of cells to mark, and what it means. */
export interface PetsciiHighlight {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: PetsciiHighlightTone;
}

/** What each OUTLINE tone is drawn in. Fixed, because they mean fixed things. */
const HIGHLIGHT_TONES: Record<Exclude<PetsciiHighlightTone, 'selection'>, string> = {
  mci: '#4ad24a',
  'mci-unresolved': '#d2b34a',
  brush: '#ffffff',
};

/** Whether a cell falls inside any rectangle marked as the caller's selection. */
function reversedByHighlight(highlight: readonly PetsciiHighlight[] | undefined, x: number, y: number): boolean {
  if (!highlight) return false;
  for (const box of highlight) {
    if (box.tone !== 'selection') continue;
    if (x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h) return true;
  }
  return false;
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

/**
 * The board's cursor colour, taken from the ANSI terminal's own theme so the
 * two modes cannot drift apart. The cursor is the TERMINAL's chrome, not the
 * C64's screen, which is why it is not a palette index.
 */
const CURSOR_COLOUR = XTERM_CONFIG.theme.cursor;
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
/**
 * A KEY THIS CANVAS HAS TAKEN DOES NOT ALSO GO TO THE WINDOW.
 *
 * `BBSTerminal` keeps a window-level keydown listener for game mode, and on
 * an xterm session it never sees a typed key: xterm consumes the event
 * before it bubbles. A canvas does not, so with a hybrid door in game mode
 * ONE press was delivered twice - once here, through `onData` and the shared
 * input path, and once again at the window - and the sysop typing `test`
 * into LiveChat on a PETSCII session read `tteesstt` (2026-09-22). The
 * board's own trace named both deliveries `route=key-down`.
 *
 * `preventDefault` was never going to stop that; it stops the BROWSER, not
 * the propagation. Bubble-phase listeners are what must not run - and only
 * those: the mouse-report toggle and the Tab trap listen in the CAPTURE
 * phase, which has already run by the time a key reaches this handler.
 */
function consumed(e: React.KeyboardEvent<HTMLCanvasElement>): void {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
}

export const PetsciiCanvas = forwardRef<PetsciiCanvasHandle, PetsciiCanvasProps>(({
  machine,
  palette,
  scale: maxScale = 4,
  onData,
  cursorVisible,
  cursorColour = CURSOR_COLOUR,
  focusable = false,
  swedish = false,
  focusOnMount = false,
  onCellPointer,
  gridVisible = false,
  highlight,
  scrollOffset = 0,
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

  // Build the glyph atlas once per mount - and again if the character set
  // changes, since the Swedish letters are drawn INTO the atlas.
  useEffect(() => {
    let cancelled = false;
    setAtlasReady(false);
    buildGlyphAtlas(ATLAS_PX_SIZE, swedish).then((atlas) => {
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
  }, [swedish]);

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

    /*
     * WHICH ROWS THE GLASS SHOWS.
     *
     * At rest (`scrolled === 0`) every row is the live screen's, which is
     * what a C64 has and all this drew before. Scrolled back by n, the top n
     * rows come out of the machine's history - the rows it retired when it
     * scrolled or when the board cleared the screen - and the rest are the
     * live screen shifted down by n. Clamped to the history that exists, so
     * a wheel that keeps turning simply stops moving the picture.
     */
    const scrolled = clampScrollOffset(scrollOffset, machine.historyLength);

    for (let y = 0; y < rows; y++) {
      const back = scrolled - y;
      const historyRow = back > 0 ? machine.historyRow(back) : undefined;
      const liveBase = (y - scrolled) * cols;
      for (let x = 0; x < cols; x++) {
        const idx = liveBase + x;
        const cell = historyRow ? historyRow.screen[x] : s.screen[idx];
        /*
         * A SELECTED CELL IS DRAWN REVERSED, which on this machine is the
         * same screen code with bit 7 set - the atlas holds both halves. It
         * is applied BEFORE the blank test on purpose: a reversed space is a
         * solid block, and a selection over blank cells that painted nothing
         * would be invisible, which is the shape the outline had.
         */
        const screenCode = reversedByHighlight(highlight, x, y) ? cell ^ 0x80 : cell;
        if (isBlankScreenCode(screenCode)) continue; // background fill above is already correct - draw nothing
        const color = colours[(historyRow ? historyRow.color[x] : s.colorRam[idx]) & 0x0F];
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
    //
    // And a screen that is scrolled back shows no cursor at all: the cursor
    // is where the next character goes, and nothing is going anywhere on a
    // row that left the screen minutes ago.
    const effectiveCursorOn = s.cursorShown === false ? false : (cursorVisible ?? cursorOn);
    if (effectiveCursorOn && scrolled === 0) {
      const cursorIdx = s.cursorY * cols + s.cursorX;
      ctx.fillStyle = cursorColour === 'ink'
        ? colours[s.colorRam[cursorIdx] & 0x0F]
        : cursorColour === 'pen'
          ? colours[s.pen & 0x0F]
          : cursorColour;
      ctx.fillRect(border + s.cursorX * destW, border + s.cursorY * destH, destW, destH);
    }
    // THE EDITOR'S TWO OVERLAYS, and they are drawn last so nothing paints
    // over them. Both are off unless an editor asked for them, so a live
    // PETSCII session draws exactly what it always drew.
    if (gridVisible) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Offset by half a pixel: a 1px line on an integer coordinate straddles
      // two device pixels and comes out two pixels wide and grey.
      for (let x = 0; x <= cols; x++) {
        ctx.moveTo(border + x * destW + 0.5, border);
        ctx.lineTo(border + x * destW + 0.5, border + rows * destH);
      }
      for (let y = 0; y <= rows; y++) {
        ctx.moveTo(border, border + y * destH + 0.5);
        ctx.lineTo(border + cols * destW, border + y * destH + 0.5);
      }
      ctx.stroke();
    }

    if (highlight) {
      ctx.lineWidth = 1;
      for (const box of highlight) {
        if (box.tone === 'selection') continue; // drawn reversed, cell by cell, above
        ctx.strokeStyle = HIGHLIGHT_TONES[box.tone ?? 'mci'];
        ctx.strokeRect(
          border + box.x * destW + 0.5,
          border + box.y * destH + 0.5,
          box.w * destW - 1,
          box.h * destH - 1,
        );
      }
    }
    // `cursorVisible` belongs in this list: without it a change to the
    // override kept the STALE closure - the repaint effects below re-run on
    // `draw`'s identity, so a prop the memo does not watch cannot reach the
    // glass until something else happens to change. `gridVisible` and
    // `highlight` are here for exactly the same reason.
  }, [machine, colours, scale, cursorOn, cursorVisible, width, height, border, cellW, cellH, cols, rows, gridVisible, highlight, scrollOffset]);

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
      const bytes = pastedTextToPetscii(text, swedish);
      if (bytes.length) onData?.(bytes);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onData, swedish]);

  /**
   * The cell under a client coordinate, or null for the border.
   *
   * The canvas's backing store is `width` x `height` device-ish pixels and
   * CSS scales it to whatever fits, so a client coordinate is converted
   * through the element's own rect before the border is stripped. Doing this
   * anywhere else means duplicating `border`, `cellW`, `cellH` and the fit
   * policy - four numbers that already live here and have moved before.
   */
  const cellAt = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const px = (clientX - rect.left) * (width / rect.width) - border;
    const py = (clientY - rect.top) * (height / rect.height) - border;
    if (px < 0 || py < 0) return null;
    const x = Math.floor(px / cellW);
    const y = Math.floor(py / cellH);
    return x >= 0 && y >= 0 && x < cols && y < rows ? { x, y } : null;
  }, [width, height, border, cellW, cellH, cols, rows]);

  const reportCell = useCallback((
    type: 'down' | 'move' | 'up',
  ) => (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onCellPointer) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    onCellPointer({
      type, x: cell.x, y: cell.y, buttons: e.buttons,
      button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey,
    });
  }, [onCellPointer, cellAt]);

  /**
   * The wheel, over a cell.
   *
   * A door that scrolls - a chat log, a file list - is scrolled with this on
   * every other terminal the board serves; on the C64 screen the page moved
   * instead and the door never heard. `preventDefault` because the canvas IS
   * the surface the caller is pointing at.
   */
  const reportWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!onCellPointer) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    onCellPointer({
      type: 'wheel', x: cell.x, y: cell.y, buttons: e.buttons,
      button: 0, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey,
      deltaY: e.deltaY,
    });
  }, [onCellPointer, cellAt]);

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
        consumed(e);
        onData?.([0x03]);
        return;
      }
    }
    /*
     * ALT IS THE COMMODORE KEY, and it is the one chord this canvas keeps.
     *
     * A C64 keyboard has a key an ASCII keyboard does not, and it is the one
     * that draws boxes; without it the machine this board emulates cannot
     * type the characters it is famous for. `keymap.ts` resolves the chord
     * through `e.code`, because on a Mac the browser has already turned
     * Alt+a into a letter.
     *
     * Cmd and Ctrl still go to the browser untouched - Cmd+R must reload,
     * and Ctrl+C is handled above as the board's abort key. An Alt chord the
     * keymap does not know is handed back too, so a browser shortcut this
     * board has no use for still works.
     */
    /*
     * CTRL AND A DIGIT IS A COLOUR, which is where a C64 keeps its first
     * eight. Every other Ctrl chord still goes to the browser: this canvas
     * has no use for them, and Ctrl+C is the board's abort key, handled
     * above.
     */
    if (e.metaKey) return;
    if (e.ctrlKey && controlChordToPetscii(e.code) === null) return;
    const bytes = keyEventToPetscii(e.key, e.shiftKey, swedish, e.code, e.altKey, e.ctrlKey);
    if (bytes) {
      e.preventDefault();
      consumed(e);
      onData?.(bytes);
    }
  }, [onData, swedish]);

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
        onPointerDown={onCellPointer ? reportCell('down') : undefined}
        onPointerMove={onCellPointer ? reportCell('move') : undefined}
        onPointerUp={onCellPointer ? reportCell('up') : undefined}
        onWheel={onCellPointer ? reportWheel : undefined}
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
          // An editor's canvas is a drawing surface; a session's is not.
          cursor: onCellPointer ? 'crosshair' : undefined,
        }}
      />
    </div>
  );
});

PetsciiCanvas.displayName = 'PetsciiCanvas';
