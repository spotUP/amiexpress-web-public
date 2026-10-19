/**
 * An artist draws a native teletext page and Save hands over the page.
 *
 * Driven the way an artist works: type on a row, put a Red Graphics code in
 * front of a cell, plot one sixel, save. The saved bytes are the .tti the
 * board serves - one byte per character, control codes as 0x80-0x9F - so the
 * assertion is the page text itself.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
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

/** The named control codes are folded away for experts; open them. */
function openControlCodes(): void {
  fireEvent.click(screen.getByText(/Control Codes/));
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
    openControlCodes();
    fireEvent.click(screen.getByRole('button', { name: 'Red Graphics' }));
    fireEvent.pointerDown(canvas, { clientX: W / 2, clientY: 2 * H + H / 2, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: W / 2, clientY: 2 * H + H / 2 });

    // Draw Blocks in the row's own red: the top-left sixel of cell (1, 2).
    fireEvent.click(screen.getByRole('button', { name: 'Red foreground' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw Blocks' }));
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

    openControlCodes();
    fireEvent.click(screen.getByRole('button', { name: 'Red Graphics' }));
    fireEvent.pointerDown(canvas, { clientX: 1, clientY: 2 * H + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 1, clientY: 2 * H + 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Red foreground' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw Blocks' }));
    const x = W + W - 1;          // right half of cell 1
    const y = 2 * H + H - 1;      // bottom third of row 2
    fireEvent.pointerDown(canvas, { clientX: x, clientY: y, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: x, clientY: y });

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    // Bottom-right sixel alone: 0x20 + 0x40.
    expect(base64ToLatin1(onSave.mock.calls[0][0] as string)).toBe('PN,10000\nOL,2,\x91`\n');
  });

  /*
   * "I can't draw blocks." Draw Blocks on a row with no graphics code drew
   * nothing: a sixel only shows in a cell a graphics colour code puts in
   * graphics mode, and an artist starting on a blank row has none. The
   * editor now places the code for the picked colour in the free cell to the
   * left of the stroke, so the first click draws.
   */
  it('draws blocks on a blank row in the picked colour, as one undo step', () => {
    const onSave = vi.fn();
    render(<TeletextScreenEditor content="" onSave={onSave} />);
    const canvas = theCanvas();

    // Artists never see control codes unless they ask.
    expect((screen.getByRole('checkbox', { name: 'Show codes' }) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Red foreground' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw Blocks' }));
    // Top-left sixel of cell (5, 3), dragged on into the top-left sixel of cell (6, 3).
    fireEvent.pointerDown(canvas, { clientX: 5 * W + 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerMove(canvas, { clientX: 6 * W + 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 6 * W + 1, clientY: 3 * H + 1 });
    // The right button is the eraser, and the page keeps the browser menu off it.
    expect(fireEvent.contextMenu(canvas)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    // Red Graphics (0x11, saved as 0x91), then the two mosaic bytes. The drag
    // crosses cell 5's top-right sixel on its way, so cell 5 holds both.
    expect(base64ToLatin1(onSave.mock.calls[0][0] as string)).toBe('PN,10000\nOL,3,    \x91#!\n');

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(base64ToLatin1(onSave.mock.calls[1][0] as string)).toBe('PN,10000\n');
  });

  it('says why when a letter leaves no room for the colour code', () => {
    const onSave = vi.fn();
    render(<TeletextScreenEditor content={btoa('PN,10000\nOL,3,HELLO\n')} onSave={onSave} />);
    const canvas = theCanvas();

    fireEvent.click(screen.getByRole('button', { name: 'Red foreground' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw Blocks' }));

    // Cell (1, 3): its left neighbour is the H, so there is nowhere for the code.
    fireEvent.pointerDown(canvas, { clientX: W + 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: W + 1, clientY: 3 * H + 1 });
    expect(screen.getByText('Colour change needs a free cell to the left')).toBeTruthy();

    // Cell (6, 3): the space after HELLO takes Red Graphics.
    fireEvent.pointerDown(canvas, { clientX: 6 * W + 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 6 * W + 1, clientY: 3 * H + 1 });
    expect(screen.queryByText('Colour change needs a free cell to the left')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(base64ToLatin1(onSave.mock.calls[0][0] as string)).toBe('PN,10000\nOL,3,HELLO\x91!\n');
  });

  it('keeps saying why a code cell refused a block while the drag runs on', () => {
    const onSave = vi.fn();
    // White Graphics in cell 1, blocks in 2-4, Red Graphics in cell 5 (it
    // changes the colour, so it is needed), a red block in 6, spaces after.
    render(<TeletextScreenEditor content={btoa('PN,10000\nOL,3, \x97!!!\x91!  \n')} onSave={onSave} />);
    const canvas = theCanvas();

    fireEvent.click(screen.getByRole('button', { name: 'Red foreground' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw Blocks' }));
    // Cell 5 holds the code and a block sits left of it: nowhere to move it.
    fireEvent.pointerDown(canvas, { clientX: 5 * W + 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerMove(canvas, { clientX: 6 * W + 1, clientY: 3 * H + 1, buttons: 1 });
    // The rest of the drag draws fine and must not wipe the reason.
    fireEvent.pointerMove(canvas, { clientX: 8 * W + 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 8 * W + 1, clientY: 3 * H + 1 });
    expect(screen.getByText(/holds a colour code with no free cell to move to/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(base64ToLatin1(onSave.mock.calls[0][0] as string)).toBe('PN,10000\nOL,3, \x97!!!\x91##!\n');

    // The next stroke starts with a clean slate.
    fireEvent.pointerDown(canvas, { clientX: 10 * W + 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 10 * W + 1, clientY: 3 * H + 1 });
    expect(screen.queryByText(/holds a colour code/)).toBeNull();
  });

  it('draws a line of blocks from press to release, on the ANSI editor\'s key', () => {
    const onSave = vi.fn();
    render(<TeletextScreenEditor content="" onSave={onSave} />);
    const canvas = theCanvas();
    const page = screen.getByTestId('teletext-editor-canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Red foreground' }));
    fireEvent.keyDown(page, { key: 'l', code: 'KeyL', altKey: true });
    expect(screen.getByRole('button', { name: 'Line' }).getAttribute('aria-pressed')).toBe('true');

    // Top-left sixels of cells (5, 3) to (7, 3): six sixels, three cells lit left half + right half.
    fireEvent.pointerDown(canvas, { clientX: 5 * W + 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerMove(canvas, { clientX: 6 * W + 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerMove(canvas, { clientX: 7 * W + W - 1, clientY: 3 * H + 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 7 * W + W - 1, clientY: 3 * H + 1 });

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    // 0x20 + 1 + 2 = '#': the top row of both sixel columns in every cell.
    expect(base64ToLatin1(onSave.mock.calls[0][0] as string)).toBe('PN,10000\nOL,3,    \x91###\n');
  });

  /*
   * A freehand stroke is one unbroken trail. The pointer reports every few
   * sixels, not every sixel, and two moves can land before React renders
   * once: the stroke painted each sample alone onto the page from the last
   * render, so a quick hand left gaps and a later sample wiped an earlier
   * one. Reported 2026-10-19: "if i draw fast i get gaps". Here one move
   * jumps five cells, and two more land inside one render.
   */
  it('draws a freehand stroke without gaps, however few moves the pointer reports', () => {
    const onSave = vi.fn();
    render(<TeletextScreenEditor content="" onSave={onSave} />);
    const canvas = theCanvas();
    fireEvent.click(screen.getByRole('button', { name: 'Draw Blocks' }));

    // The top sixel row of row 2, from cell 1 to cell 6 in one jump.
    fireEvent.pointerDown(canvas, { clientX: W + 1, clientY: 2 * H + 1, buttons: 1 });
    fireEvent.pointerMove(canvas, { clientX: 6 * W + W - 1, clientY: 2 * H + 1, buttons: 1 });
    // Then on to cell 10 in two moves that arrive before a render.
    act(() => {
      fireEvent.pointerMove(canvas, { clientX: 8 * W + W - 1, clientY: 2 * H + 1, buttons: 1 });
      fireEvent.pointerMove(canvas, { clientX: 10 * W + W - 1, clientY: 2 * H + 1, buttons: 1 });
    });
    fireEvent.pointerUp(canvas, { clientX: 10 * W + W - 1, clientY: 2 * H + 1 });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    // White Graphics, then ten cells with both top sixels lit.
    expect(base64ToLatin1(onSave.mock.calls[0][0] as string)).toBe(`PN,10000\nOL,2,\x97${'#'.repeat(10)}\n`);
  });
});
