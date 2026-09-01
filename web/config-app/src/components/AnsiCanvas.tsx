import { useCallback, useEffect, useRef } from 'react';
import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { CELL_HEIGHT, CELL_WIDTH, paintScreen, type Highlight } from './ansi-canvas-paint';

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

export function AnsiCanvas({ canvas, cursor, onCellPointer, highlights, className }: AnsiCanvasProps) {
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

    const ratio = window.devicePixelRatio || 1;
    element.width = Math.max(1, cols * CELL_WIDTH * ratio);
    element.height = Math.max(1, rows * CELL_HEIGHT * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    paintScreen(ctx, canvas, cursor, highlights);
  }, [canvas, cols, rows, cursor, highlights]);

  const report = useCallback((event: React.PointerEvent, phase: 'down' | 'move' | 'up') => {
    if (!onCellPointer) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / CELL_WIDTH);
    const y = Math.floor((event.clientY - rect.top) / CELL_HEIGHT);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;

    onCellPointer(x, y, phase);
  }, [cols, rows, onCellPointer]);

  return (
    <canvas
      ref={elementRef}
      data-testid="ansi-canvas"
      data-cols={cols}
      data-rows={rows}
      className={className}
      style={{ width: `${cols * CELL_WIDTH}px`, height: `${rows * CELL_HEIGHT}px` }}
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
