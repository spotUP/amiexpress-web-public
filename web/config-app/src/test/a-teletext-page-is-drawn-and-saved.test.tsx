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

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  // jsdom has no 2D context; the canvas paints nothing and still takes pointers.
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

/** The canvas at scale 1: a cell is 8x16 pixels from the top-left corner. */
function theCanvas(): HTMLCanvasElement {
  const canvas = screen.getByTestId('teletext-canvas') as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 320, height: 384, right: 320, bottom: 384, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
  return canvas;
}

describe('the teletext editor', () => {
  it('saves typed text, a control code and a plotted sixel as the .tti page', () => {
    const onSave = vi.fn();
    render(<TeletextScreenEditor content="" onSave={onSave} />);
    const canvas = theCanvas();

    // Text: place the cursor on row 1 and type.
    fireEvent.pointerDown(canvas, { clientX: 4, clientY: 16 + 8, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 4, clientY: 16 + 8 });
    const page = screen.getByTestId('teletext-editor-canvas');
    fireEvent.keyDown(page, { key: 'A' });
    fireEvent.keyDown(page, { key: 'B' });

    // Red Graphics at the start of row 2.
    fireEvent.click(screen.getByRole('button', { name: 'Red Graphics' }));
    fireEvent.pointerDown(canvas, { clientX: 4, clientY: 32 + 8, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 4, clientY: 32 + 8 });

    // Mosaic: the top-left sixel of cell (1, 2).
    fireEvent.click(screen.getByRole('button', { name: 'Mosaic' }));
    fireEvent.pointerDown(canvas, { clientX: 8 + 1, clientY: 32 + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 8 + 1, clientY: 32 + 1 });

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(base64ToLatin1(onSave.mock.calls[0][0] as string)).toBe('PN,10000\nOL,1,AB\nOL,2,\x91!\n');
  });
});
