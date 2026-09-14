/**
 * An artist draws a PETSCII screen and the file holds what they drew.
 *
 * The studio could edit ANSI and RIP and could only LOOK at a `.seq`. These
 * tests drive the editor the way an artist does - pick a shape, click a cell,
 * save - and read the result back through `PetsciiMachine`, which is what the
 * board itself reads a `.seq` with. Asserting the bytes would pin the writer;
 * asserting the SCREEN pins what a caller sees.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PetsciiMachine } from '@amiexpress/terminal';
import { blankSurface, stamp, writeSeq } from '@amiexpress/bbs-door-sdk/petscii';
import { bytesToBase64, base64ToBytes } from '../pages/screen-bytes';
import { PetsciiScreenEditor } from '../components/PetsciiScreenEditor';

const BLANK_SEQ = bytesToBase64(writeSeq(blankSurface()));

/** The pi glyph at a cell, in a screen that is otherwise empty. */
function seqWithPiAt(x: number, y: number): string {
  return bytesToBase64(writeSeq(
    stamp(blankSurface(), x, y, { screenCode: 0x5e, color: 1, reverse: false }),
  ));
}

/** What a C64 would draw from what the editor saved. */
function savedScreen(onSave: ReturnType<typeof vi.fn>): PetsciiMachine {
  const machine = new PetsciiMachine();
  machine.feed(base64ToBytes(onSave.mock.calls[0][0] as string));
  return machine;
}

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  // jsdom has no 2D context (node-canvas is not installed); the canvas paints
  // nothing and the editor's behaviour is unaffected.
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.restoreAllMocks();
});

/** A pointer at the middle of a cell on a scale-1 canvas: border 16, cell 8. */
function cellPoint(x: number, y: number) {
  return { clientX: 16 + x * 8 + 4, clientY: 16 + y * 8 + 4, buttons: 1 };
}

function theCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = container.querySelector('canvas') as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 352, height: 232,
    right: 352, bottom: 232, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
  return canvas;
}

/** The editor's own canvas, not the charset browser's 128 swatches. */
function editorCanvas(): HTMLCanvasElement {
  const host = screen.getByTestId('petscii-editor-canvas');
  return theCanvas(host);
}

describe('a PETSCII screen is drawn and saved', () => {
  it('saves what was drawn, and a C64 reads back the same screen', async () => {
    const onSave = vi.fn();
    render(<PetsciiScreenEditor content={BLANK_SEQ} onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Character 1' }));
    fireEvent.pointerDown(editorCanvas(), cellPoint(0, 0));
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(savedScreen(onSave).state.screen[0]).toBe(0x01);
  });

  it('undo puts back what was there', async () => {
    const onSave = vi.fn();
    render(<PetsciiScreenEditor content={BLANK_SEQ} onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Character 1' }));
    fireEvent.pointerDown(editorCanvas(), cellPoint(0, 0));
    await userEvent.click(screen.getByRole('button', { name: /Undo/ }));
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(savedScreen(onSave).state.screen[0]).toBe(0x20);
  });

  it('saves the background the artist chose, and the border with it', async () => {
    const onSave = vi.fn();
    render(<PetsciiScreenEditor content={BLANK_SEQ} onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Background 6' }));
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    const back = savedScreen(onSave);
    expect(back.state.background).toBe(6);
    expect(back.state.border).toBe(6);
  });

  it('the MCI checkbox puts the gate in the file', async () => {
    const onSave = vi.fn();
    render(<PetsciiScreenEditor content={BLANK_SEQ} onSave={onSave} />);

    await userEvent.click(screen.getByLabelText('This screen uses MCI codes'));
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    // express.e reads the FIRST byte, once per file.
    expect(base64ToBytes(onSave.mock.calls[0][0] as string)[0]).toBe(0x7e);
  });

  it('a screen that opens with the gate byte comes back with the box already ticked', () => {
    render(<PetsciiScreenEditor content={bytesToBase64(writeSeq(blankSurface(), { mciGate: true }))} onSave={vi.fn()} />);
    expect(screen.getByLabelText('This screen uses MCI codes')).toBeChecked();
  });

  it('warns about a pi glyph once the screen uses MCI codes, with a row and a column', async () => {
    // The hazard the 2026-09-02 MCI plan could only document in prose: in a
    // gated screen every tilde byte is a code candidate, and the pi glyph is
    // written as a tilde byte. Only the editor knows the grid AND the map.
    render(<PetsciiScreenEditor content={seqWithPiAt(12, 7)} onSave={vi.fn()} />);

    expect(screen.queryByText(/row 7, column 12/)).toBeNull();
    await userEvent.click(screen.getByLabelText('This screen uses MCI codes'));
    expect(screen.getByText(/row 7, column 12/)).toBeInTheDocument();
  });

  it('another artist\'s screen opens with the art and no tools', () => {
    render(<PetsciiScreenEditor content={BLANK_SEQ} readOnly />);
    expect(screen.getByTestId('petscii-editor-canvas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
    expect(screen.queryByTestId('petscii-charset-browser')).toBeNull();
    expect(screen.queryByLabelText('This screen uses MCI codes')).toBeNull();
  });

  it('the tools say what they do, in full English words', () => {
    render(<PetsciiScreenEditor content={BLANK_SEQ} onSave={vi.fn()} />);
    for (const label of ['Draw', 'Character only', 'Colour only', 'Fill', 'Brush', 'Text']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('fill spreads from the cell that was clicked', async () => {
    const onSave = vi.fn();
    render(<PetsciiScreenEditor content={BLANK_SEQ} onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Character 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fill' }));
    fireEvent.pointerDown(editorCanvas(), cellPoint(5, 5));
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    const back = savedScreen(onSave);
    expect(back.state.screen[5 * 40 + 5]).toBe(0x01);  // the cell that was clicked
    expect(back.state.screen[0]).toBe(0x01);           // and it spread to the far corner

    /*
     * ROW 24, COLUMN 39 IS BLANK, and that is correct rather than a gap.
     *
     * Printing the very last cell of the screen SCROLLS a C64, so `writeSeq`
     * refuses to write it - a file that did would lose its own top row on the
     * way back in. A `.seq` cannot express a completely full screen, and an
     * artist filling one gets 999 cells.
     */
    expect(back.state.screen[24 * 40 + 39]).toBe(0x20);
  });
});
