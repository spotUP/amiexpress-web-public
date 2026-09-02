import { useCallback, useEffect, useRef } from 'react';
import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { CELL_HEIGHT, CELL_WIDTH, canvasPixelSize, paintScreen, type Highlight } from './ansi-canvas-paint';

export { CELL_HEIGHT, CELL_WIDTH } from './ansi-canvas-paint';

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
  /** Drawn as an outline; null or absent while no cursor is placed. */
  cursor?: { x: number; y: number } | null;
  /**
   * Called with canvas coordinates. `move` arrives only while the pointer is
   * held down - a drag - because that is what the drawing tools consume; a
   * hover is not a stroke.
   */
  onCellPointer?: (x: number, y: number, event: 'down' | 'move' | 'up') => void;
  /** Runs of cells to ring - the MCI codes a screen runs. */
  highlights?: Highlight[];
  className?: string;
}

export function AnsiCanvas({ canvas, cursor, onCellPointer, highlights, className, scale = 1 }: AnsiCanvasProps) {
  const elementRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  const rows = canvas.length;
  const cols = rows > 0 ? canvas[0].length : 0;

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
      cols, rows, scale, window.devicePixelRatio || 1,
    );
    element.width = width;
    element.height = height;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    paintScreen(ctx, canvas, cursor, highlights);
  }, [canvas, cols, rows, cursor, highlights, scale]);

  const report = useCallback((event: React.PointerEvent, phase: 'down' | 'move' | 'up') => {
    if (!onCellPointer) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / (CELL_WIDTH * scale));
    const y = Math.floor((event.clientY - rect.top) / (CELL_HEIGHT * scale));
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;

    onCellPointer(x, y, phase);
  }, [cols, rows, onCellPointer, scale]);

  return (
    <canvas
      ref={elementRef}
      data-testid="ansi-canvas"
      data-cols={cols}
      data-rows={rows}
      className={className}
      style={{
        width: `${cols * CELL_WIDTH * scale}px`,
        height: `${rows * CELL_HEIGHT * scale}px`,
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
