/**
 * The canvas the sysop draws on.
 *
 * A screen is a grid of cells, not a paragraph: every assertion here is about
 * the grid and the coordinates a pointer lands in, because that is what the
 * drawing tools are handed. jsdom gives no 2D context and every box measures
 * zero, so the component has to carry its own cell metrics and survive a null
 * context - both are asserted rather than assumed.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnsiCanvas, CELL_WIDTH, CELL_HEIGHT } from '../components/AnsiCanvas';
import { createCanvas, setCell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';

describe('the ANSI canvas', () => {
  it('draws one cell per column and row', () => {
    render(<AnsiCanvas canvas={createCanvas(4, 2)} />);

    const element = screen.getByTestId('ansi-canvas');
    expect(element.getAttribute('data-cols')).toBe('4');
    expect(element.getAttribute('data-rows')).toBe('2');
  });

  it('is as wide and as tall as its cells make it', () => {
    render(<AnsiCanvas canvas={createCanvas(80, 25)} />);

    const element = screen.getByTestId('ansi-canvas') as HTMLCanvasElement;
    expect(element.style.width).toBe(`${80 * CELL_WIDTH}px`);
    expect(element.style.height).toBe(`${25 * CELL_HEIGHT}px`);
  });

  it('reports which cell the pointer is on, in canvas coordinates', () => {
    const onCellPointer = vi.fn();
    render(<AnsiCanvas canvas={createCanvas(8, 4)} onCellPointer={onCellPointer} />);

    fireEvent.pointerDown(screen.getByTestId('ansi-canvas'), { clientX: 0, clientY: 0 });

    expect(onCellPointer).toHaveBeenCalledWith(0, 0, 'down');
  });

  it('turns a pointer position into the cell under it, not the pixel', () => {
    const onCellPointer = vi.fn();
    render(<AnsiCanvas canvas={createCanvas(8, 4)} onCellPointer={onCellPointer} />);

    const element = screen.getByTestId('ansi-canvas');
    fireEvent.pointerDown(element, {
      clientX: CELL_WIDTH * 3 + 1,
      clientY: CELL_HEIGHT * 2 + 1,
    });
    fireEvent.pointerMove(element, { clientX: CELL_WIDTH * 4, clientY: CELL_HEIGHT * 2 });
    fireEvent.pointerUp(element, { clientX: CELL_WIDTH * 4, clientY: CELL_HEIGHT * 2 });

    expect(onCellPointer).toHaveBeenNthCalledWith(1, 3, 2, 'down');
    expect(onCellPointer).toHaveBeenNthCalledWith(2, 4, 2, 'move');
    expect(onCellPointer).toHaveBeenNthCalledWith(3, 4, 2, 'up');
  });

  it('says nothing about a pointer outside the grid', () => {
    const onCellPointer = vi.fn();
    render(<AnsiCanvas canvas={createCanvas(2, 2)} onCellPointer={onCellPointer} />);

    fireEvent.pointerDown(screen.getByTestId('ansi-canvas'), {
      clientX: CELL_WIDTH * 5,
      clientY: CELL_HEIGHT * 5,
    });

    expect(onCellPointer).not.toHaveBeenCalled();
  });

  it('renders a canvas holding cells without a 2D context to draw into', () => {
    // jsdom has no canvas backend. A component that assumed getContext('2d')
    // returned something would take the whole Screen Files page down in the
    // tests that render it, so the null path is a requirement, not an accident.
    const canvas = createCanvas(4, 2);
    setCell(canvas, 1, 1, { char: '█', fg: 1, bg: 0 });

    expect(() => render(<AnsiCanvas canvas={canvas} cursor={{ x: 1, y: 1 }} />)).not.toThrow();
  });
});
