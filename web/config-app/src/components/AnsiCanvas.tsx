import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import {
  VGA_CELL, canvasPixelSize, paintScreen, type CellGeometry, type Highlight,
} from './ansi-canvas-paint';
import type { PaletteMode } from '../utils/ansi-palette';

export { CELL_HEIGHT, CELL_WIDTH, VGA_CELL, type CellGeometry } from './ansi-canvas-paint';

/**
 * A screen's cells, drawn as a grid the sysop can point at.
 *
 * The SDK owns what a cell IS and every tool that changes one; this component
 * owns nothing but pixels and coordinates. That split is the whole reason the
 * browser editor can exist without forking the door's editor - see the phase 2
 * plan.
 *
 * Cell metrics are fixed and exported rather than measured: a test environment
 * measures every box as zero, so an editor whose coordinates came from layout
 * would report cell 0,0 for every click there, and a screen is 80 columns of a
 * fixed-width font in any case. The paint itself lives in
 * `ansi-canvas-paint.ts`, where a test can run it - jsdom returns no 2D
 * context, so a paint loop written inline here would never be executed by any
 * test.
 */
/**
 * Where inside the cell the pointer is, and how it was pressed. A tool that
 * works below cell size - the teletext editor's sixels, three rows of two in
 * every cell - reads the fractions; the right button or Alt is how it erases.
 */
export interface CellPointerDetail {
  /** 0 at the cell's left edge, approaching 1 at its right. */
  fx: number;
  /** 0 at the cell's top edge, approaching 1 at its bottom. */
  fy: number;
  /** The button that changed (pointer down/up); 2 is the right button. */
  button: number;
  /** The buttons held, as a bit mask; 2 is the right button. */
  buttons: number;
  altKey: boolean;
}

export interface AnsiCanvasProps {
  canvas: Cell[][];
  /**
   * Drawn at this fraction of full size, backing store included.
   *
   * Not a CSS transform: a thumbnail asks for a SMALL canvas rather than a
   * full one squeezed, which is the difference between 321 KB and 4.1 MB per
   * card. Pointer coordinates divide by it, so a scaled canvas still reports
   * the cell that was clicked.
   */
  scale?: number;
  /**
   * What a test calls this canvas. Defaults to the editor's name because the
   * editor was here first; a thumbnail passes its own, so a page that shows
   * both does not present a test with two canvases and one name.
   */
  testId?: string;
  /** Drawn as an outline; null or absent while no cursor is placed. */
  cursor?: { x: number; y: number } | null;
  /**
   * Called with canvas coordinates. `move` arrives only while the pointer is
   * held down - a drag - because that is what the drawing tools consume; a
   * hover is not a stroke.
   */
  onCellPointer?: (
    x: number, y: number, event: 'down' | 'move' | 'up', detail: CellPointerDetail,
  ) => void;
  /** Runs of cells to ring - the MCI codes a screen runs. */
  highlights?: Highlight[];
  /**
   * Rows after which the caller meets a More prompt. Absent in a thumbnail,
   * where the fold is noise; the editor passes `foldRows(canvas.length)`.
   */
  folds?: number[];
  /**
   * Runs whose characters are not drawn - the MCI codes, while an artist has
   * them folded away. The cells keep their colour; only the glyphs go, and
   * the file is untouched.
   */
  hidden?: Highlight[];
  /**
   * Which palette to DRAW the art in. 'amiga' shows the eight pens
   * console.device had, which is what a caller on a real Amiga sees; the art
   * itself is untouched.
   */
  palette?: PaletteMode;
  /** The face the art is drawn in (CSS font-family list); Topaz when omitted. */
  fontFamily?: string;
  /**
   * The cell the art is laid out in, before `scale`; VGA when omitted. A
   * native teletext page passes the caller's teletext cell, so the canvas is
   * the shape a caller sees and a click lands on the cell they would.
   */
  cell?: CellGeometry;
  className?: string;
}

export function AnsiCanvas({
  canvas, cursor, onCellPointer, highlights, folds, hidden, className, scale = 1,
  palette = 'full',
  testId = 'ansi-canvas',
  fontFamily,
  cell = VGA_CELL,
}: AnsiCanvasProps) {
  const elementRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  const rows = canvas.length;
  const cols = rows > 0 ? canvas[0].length : 0;

  /**
   * Repaint once webfonts settle. The first paint often runs before Topaz
   * arrives, and a canvas keeps whatever the fallback drew - missing glyphs
   * baked in until something repaints. Absent in jsdom, where there is
   * nothing to wait for and the guard must stay a no-op.
   */
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (!fonts?.ready) return;
    let live = true;
    fonts.ready.then(() => { if (live) setFontEpoch(epoch => epoch + 1); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // jsdom has no 2D backend and returns null. Everything below is pixels, so
    // there is nothing to do and nothing to fail.
    const ctx = element.getContext('2d');
    if (!ctx) return;

    /*
     * Sized to what is DISPLAYED, not to a full screen that CSS then shrinks.
     *
     * A gallery thumbnail used to allocate the same canvas as the editor -
     * 80x8 by 25x16, doubled again for a retina display, so 1280x800 pixels,
     * 4.1 MB of backing store - and hand it to `transform: scale(0.28)`,
     * which changes what you see and not one byte of what was allocated. With
     * 872 screens on this board and a card that never releases its canvas
     * once drawn, scrolling the gallery reached gigabytes and froze the
     * browser. Reported 2026-09-02: "this page is still super heavy. it froze
     * the browser now".
     *
     * At 0.28 the same thumbnail is 358x224, which is 321 KB - and it is
     * drawn at that size rather than drawn big and squeezed.
     */
    const { width, height, ratio } = canvasPixelSize(
      cols, rows, scale, window.devicePixelRatio || 1, cell,
    );
    element.width = width;
    element.height = height;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    paintScreen(ctx, canvas, cursor, highlights, palette, folds, hidden, fontFamily, cell);
  }, [canvas, cols, rows, cursor, highlights, palette, scale, fontEpoch, folds, hidden, fontFamily, cell]);

  const report = useCallback((event: React.PointerEvent, phase: 'down' | 'move' | 'up') => {
    if (!onCellPointer) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const cellX = (event.clientX - rect.left) / (cell.width * scale);
    const cellY = (event.clientY - rect.top) / (cell.height * scale);
    const x = Math.floor(cellX);
    const y = Math.floor(cellY);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;

    onCellPointer(x, y, phase, {
      fx: cellX - x,
      fy: cellY - y,
      button: event.button,
      buttons: event.buttons,
      altKey: event.altKey,
    });
  }, [cols, rows, onCellPointer, scale, cell]);

  return (
    <canvas
      ref={elementRef}
      data-testid={testId}
      data-cols={cols}
      data-rows={rows}
      className={className}
      style={{
        width: `${cols * cell.width * scale}px`,
        height: `${rows * cell.height * scale}px`,
      }}
      onPointerDown={(event) => {
        drawingRef.current = true;
        // Keeps a stroke that leaves the canvas attached to it, so the pointer
        // up still arrives and the tool finishes.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        report(event, 'down');
      }}
      onPointerMove={(event) => {
        if (!drawingRef.current) return;
        report(event, 'move');
      }}
      onPointerUp={(event) => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        report(event, 'up');
      }}
      onPointerCancel={() => { drawingRef.current = false; }}
    />
  );
}
