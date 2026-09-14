/**
 * The PETSCII canvas says which CELL the pointer is over.
 *
 * The editor draws on this canvas, and a cell is not a client coordinate: a
 * C64 screen sits inside a border sixteen native pixels wide, the backing
 * store is an integer multiple of 320x200, and CSS scales the whole thing to
 * whatever fits. Four numbers - border, cell width, cell height, the fit
 * policy - already live in the canvas and have moved before, so the canvas is
 * the only place that can answer honestly. These tests pin that answer.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PetsciiCanvas, PetsciiMachine } from '@amiexpress/terminal';

/**
 * At scale 1 a C64 canvas is 40*8 + 2*16 = 352 wide and 25*8 + 2*16 = 232
 * tall. Reporting a rect of exactly that size makes one CSS pixel one canvas
 * pixel, so a client coordinate IS a canvas coordinate and the arithmetic
 * under test is the only thing that can fail.
 */
function canvasWithPointer(onCellPointer: (e: unknown) => void): HTMLCanvasElement {
  const machine = new PetsciiMachine();
  const { container } = render(
    <PetsciiCanvas machine={machine} scale={1} onCellPointer={onCellPointer} />,
  );
  const canvas = container.querySelector('canvas') as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 352, height: 232,
    right: 352, bottom: 232, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
  return canvas;
}

describe('the PETSCII canvas reports the cell under the pointer', () => {
  it('reports the cell a pointer went down on', () => {
    const onCellPointer = vi.fn();
    const canvas = canvasWithPointer(onCellPointer);
    // Border 16, cell 8: the middle of cell (3, 4) is 16 + 3*8 + 4 = 44
    // across and 16 + 4*8 + 4 = 52 down.
    fireEvent.pointerDown(canvas, { clientX: 44, clientY: 52, buttons: 1 });
    expect(onCellPointer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'down', x: 3, y: 4, buttons: 1 }),
    );
  });

  it('reports a move with the buttons held, so a drag is not a hover', () => {
    const onCellPointer = vi.fn();
    const canvas = canvasWithPointer(onCellPointer);
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20, buttons: 1 });
    expect(onCellPointer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'move', x: 0, y: 0, buttons: 1 }),
    );
  });

  it('reports nothing for the border, because a frame is not a cell', () => {
    const onCellPointer = vi.fn();
    const canvas = canvasWithPointer(onCellPointer);
    fireEvent.pointerDown(canvas, { clientX: 4, clientY: 4, buttons: 1 });
    expect(onCellPointer).not.toHaveBeenCalled();
  });

  it('reports nothing past the last cell', () => {
    const onCellPointer = vi.fn();
    const canvas = canvasWithPointer(onCellPointer);
    // 16 + 40*8 = 336 is the first pixel of the right border.
    fireEvent.pointerDown(canvas, { clientX: 340, clientY: 100, buttons: 1 });
    expect(onCellPointer).not.toHaveBeenCalled();
  });

  it('converts through the element rect, so a scaled canvas still lands on the right cell', () => {
    const onCellPointer = vi.fn();
    const machine = new PetsciiMachine();
    const { container } = render(
      <PetsciiCanvas machine={machine} scale={1} onCellPointer={onCellPointer} />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    // The same canvas laid out at HALF size by CSS.
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 176, height: 116,
      right: 176, bottom: 116, x: 0, y: 0, toJSON: () => ({}),
    }) as DOMRect;
    fireEvent.pointerDown(canvas, { clientX: 22, clientY: 26, buttons: 1 });
    expect(onCellPointer).toHaveBeenCalledWith(
      expect.objectContaining({ x: 3, y: 4 }),
    );
  });

  it('a session canvas takes no pointer handlers at all', () => {
    // The live PETSCII session passes none of the editor props. Without this
    // pin, a listener added "harmlessly" reaches every caller on the board.
    const machine = new PetsciiMachine();
    const { container } = render(<PetsciiCanvas machine={machine} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.style.cursor).toBe('');
  });
});
