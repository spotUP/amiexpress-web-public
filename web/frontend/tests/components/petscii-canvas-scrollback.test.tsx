/**
 * THE PETSCII CANVAS CAN LOOK BACK AT WHAT SCROLLED PAST.
 *
 * "scrollback does not work petscii" (the sysop, 2026-09-24). A PETSCII
 * session never runs on xterm - `BBSTerminal` hands the whole session to this
 * canvas - so xterm's ten thousand rows of history are on a terminal that is
 * `display: none` for the call. The screen model keeps the retired rows now;
 * this is the half that draws them.
 *
 * Imported from source so a stale packages/terminal dist cannot make it pass.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import {
  ctxByCanvas,
  installFakeCanvasContext,
  stubDocumentFonts,
  type FakeCtx,
} from './helpers/fake-canvas-ctx';

stubDocumentFonts();
beforeEach(() => { installFakeCanvasContext(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const CLEAR = 0x93;

/** A machine holding one row of history ("A" on the top row) and a blank screen. */
function machineWithOneRetiredRow(): PetsciiMachine {
  const machine = new PetsciiMachine({ historyRows: 100 });
  machine.feed([0x41]); // "A" at (0,0)
  machine.feed([CLEAR]); // the screen goes into the history, the glass goes blank
  return machine;
}

async function paint(machine: PetsciiMachine, scrollOffset?: number, cursorVisible?: boolean): Promise<FakeCtx> {
  const { container } = render(
    <PetsciiCanvas machine={machine} scrollOffset={scrollOffset} cursorVisible={cursorVisible} />,
  );
  const canvas = container.querySelector('canvas')!;
  await waitFor(() => {
    const ctx = ctxByCanvas.get(canvas)!;
    expect(ctx.calls.some((c) => c.method === 'fillRect')).toBe(true);
  });
  return ctxByCanvas.get(canvas)!;
}

/**
 * ONE PAINT'S CALLS, the last one.
 *
 * The recorder accumulates for the life of the canvas and a mount paints
 * more than once (the atlas arrives, then the cursor blinks), so counting
 * over the whole log counts every frame. Every paint starts with the border
 * fill at the origin, which is where a frame is cut.
 */
function lastPaint(ctx: FakeCtx) {
  const starts = ctx.calls
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.method === 'fillRect' && c.args[0] === 0 && c.args[1] === 0)
    .map(({ i }) => i);
  return ctx.calls.slice(starts[starts.length - 1]);
}

const glyphs = (ctx: FakeCtx) => lastPaint(ctx).filter((c) => c.method === 'drawImage');
const fills = (ctx: FakeCtx) => lastPaint(ctx).filter((c) => c.method === 'fillRect');
/** The border inset, read off the screen-background fill rather than recomputed. */
const borderOf = (ctx: FakeCtx) => fills(ctx)[1].args[0] as number;

describe('a canvas showing the live screen', () => {
  it('draws the live screen and nothing from the history', async () => {
    const ctx = await paint(machineWithOneRetiredRow(), 0);

    // The screen was cleared: every cell is blank, so no glyph is composited.
    expect(glyphs(ctx)).toEqual([]);
  });
});

describe('a canvas scrolled back one row', () => {
  it('puts the retired row on the top line', async () => {
    const ctx = await paint(machineWithOneRetiredRow(), 1);
    const drawn = glyphs(ctx);

    expect(drawn).toHaveLength(1);
    const border = borderOf(ctx);
    expect(drawn[0].args[5]).toBe(border); // first column
    expect(drawn[0].args[6]).toBe(border); // top row
  });

  it('shows the live screen under it, shifted down', async () => {
    const machine = new PetsciiMachine({ historyRows: 100 });
    machine.feed([0x41]); // "A"
    machine.feed([CLEAR]);
    machine.feed([0x42]); // "B" on the live screen's top row

    const ctx = await paint(machine, 1);
    const drawn = glyphs(ctx);
    const border = borderOf(ctx);
    const rowHeight = (drawn[1].args[6] as number) - (drawn[0].args[6] as number);

    expect(drawn).toHaveLength(2);
    expect(drawn[0].args[6]).toBe(border); // the retired "A", on the top line
    expect(rowHeight).toBeGreaterThan(0); // the live "B", one row below it
  });

  it('draws no cursor, because nothing is being typed onto a row that left', async () => {
    const live = await paint(machineWithOneRetiredRow(), 0, true);
    const back = await paint(machineWithOneRetiredRow(), 1, true);

    // Border and screen background are filled unconditionally; the cursor is
    // the only other fillRect this canvas makes.
    expect(fills(live)).toHaveLength(3);
    expect(fills(back)).toHaveLength(2);
  });
});

describe('a canvas asked to scroll past the end of the history', () => {
  it('stops at the oldest row it has rather than showing emptiness', async () => {
    const ctx = await paint(machineWithOneRetiredRow(), 999);
    const drawn = glyphs(ctx);
    const border = borderOf(ctx);

    expect(drawn).toHaveLength(1);
    expect(drawn[0].args[6]).toBe(border);
  });
});

describe('a machine with no history at all', () => {
  it('draws the live screen, whatever offset it is handed', async () => {
    const machine = new PetsciiMachine(); // no historyRows: a C64 exactly
    machine.feed([0x41]);

    const ctx = await paint(machine, 5);
    const drawn = glyphs(ctx);
    const border = borderOf(ctx);

    expect(drawn).toHaveLength(1);
    expect(drawn[0].args[6]).toBe(border);
  });
});
