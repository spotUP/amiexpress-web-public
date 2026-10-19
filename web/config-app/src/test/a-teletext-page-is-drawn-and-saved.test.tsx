/**
 * An artist draws a native teletext page and Save hands over the page.
 *
 * Driven the way an artist works: type on a row, put a Red Graphics code in
 * front of a cell, plot one sixel, save. The saved bytes are the .tti the
 * board serves - one byte per character, control codes as 0x80-0x9F - so the
 * assertion is the page text itself.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { base64ToLatin1 } from '../pages/screen-bytes';
import { TeletextScreenEditor } from '../components/TeletextScreenEditor';
import { TELETEXT_CELL } from '../components/teletext-cells';

const W = TELETEXT_CELL.width;
const H = TELETEXT_CELL.height;

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  // jsdom has no 2D context; the canvas paints nothing and still takes pointers.
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

/** The canvas at scale 1: a cell is TELETEXT_CELL from the top-left corner. */
function theCanvas(): HTMLCanvasElement {
  const canvas = screen.getByTestId('teletext-canvas') as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 40 * W, height: 24 * H, right: 40 * W, bottom: 24 * H, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect;
  return canvas;
}

describe('the teletext editor', () => {
  it('saves typed text, a control code and a plotted sixel as the .tti page', () => {
    const onSave = vi.fn();
    render(<TeletextScreenEditor content="" onSave={onSave} />);
    const canvas = theCanvas();

    // Text: place the cursor on row 1 and type.
    fireEvent.pointerDown(canvas, { clientX: W / 2, clientY: H + H / 2, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: W / 2, clientY: H + H / 2 });
    const page = screen.getByTestId('teletext-editor-canvas');
    fireEvent.keyDown(page, { key: 'A' });
    fireEvent.keyDown(page, { key: 'B' });

    // Red Graphics at the start of row 2.
    fireEvent.click(screen.getByRole('button', { name: 'Red Graphics' }));
    fireEvent.pointerDown(canvas, { clientX: W / 2, clientY: 2 * H + H / 2, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: W / 2, clientY: 2 * H + H / 2 });

    // Mosaic: the top-left sixel of cell (1, 2).
    fireEvent.click(screen.getByRole('button', { name: 'Mosaic' }));
    fireEvent.pointerDown(canvas, { clientX: W + 1, clientY: 2 * H + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: W + 1, clientY: 2 * H + 1 });

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(base64ToLatin1(onSave.mock.calls[0][0] as string)).toBe('PN,10000\nOL,1,AB\nOL,2,\x91!\n');
  });

  /*
   * The caller's teletext cell, not VGA's. A caller's terminal draws these
   * rows in TeletextUPR, whose cell is 0.6 of an em wide by one em tall; the
   * editor drew them in 8x16 (0.5) and showed every page a sixth narrower than
   * the caller gets it. The click below lands, at the caller's geometry, on
   * the bottom-right sixel of cell (1, 2); at 8x16 the same point is cell
   * (2, 3), which would save a different page.
   */
  it('draws the page in the caller\'s teletext cell and plots the sixel under the pointer there', () => {
    const onSave = vi.fn();
    render(<TeletextScreenEditor content="" onSave={onSave} />);
    const canvas = theCanvas();

    expect(TELETEXT_CELL).toEqual({ width: 12, height: 20 });
    expect(canvas.style.width).toBe('480px');
    expect(canvas.style.height).toBe('480px');

    fireEvent.click(screen.getByRole('button', { name: 'Red Graphics' }));
    fireEvent.pointerDown(canvas, { clientX: 1, clientY: 2 * H + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 1, clientY: 2 * H + 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Mosaic' }));
    const x = W + W - 1;          // right half of cell 1
    const y = 2 * H + H - 1;      // bottom third of row 2
    fireEvent.pointerDown(canvas, { clientX: x, clientY: y, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: x, clientY: y });

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    // Bottom-right sixel alone: 0x20 + 0x40.
    expect(base64ToLatin1(onSave.mock.calls[0][0] as string)).toBe('PN,10000\nOL,2,\x91`\n');
  });
});
