/**
 * A SELECTION ON A C64 SCREEN IS REVERSE VIDEO, NOT A BOX.
 *
 * "selecting text feels weird in petscii mode, can we do it by inverting
 * chars or coloring them differently or something?" (the sysop, 2026-09-22).
 *
 * The canvas drew the caller's drag as an OUTLINE round the cells, which is
 * a thing the machine cannot do: a C64 has no per-cell background to tint
 * and no rectangle to draw. Reverse video is the one fill it has, and it is
 * what the board already uses for a highlighted list row - so a selection
 * now reads the way everything else on that screen reads.
 *
 * Imported from source so a stale packages/terminal dist cannot make this
 * pass.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { glyphCellIndex } from '../../../../../packages/terminal/src/petscii/glyph-atlas';
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

/** The atlas cell one glyph is taken from - the canvas's `sx` argument. */
const ATLAS_PX_SIZE = 8;
const atlasCellOf = (screenCode: number) => glyphCellIndex(0, screenCode) * ATLAS_PX_SIZE;

async function paint(machine: PetsciiMachine, highlight?: Parameters<typeof PetsciiCanvas>[0]['highlight']): Promise<FakeCtx> {
  const { container } = render(<PetsciiCanvas machine={machine} highlight={highlight} cursorVisible={false} />);
  const canvas = container.querySelector('canvas')!;
  await waitFor(() => {
    const ctx = ctxByCanvas.get(canvas)!;
    expect(ctx.calls.some((c) => c.method === 'fillRect')).toBe(true);
  });
  return ctxByCanvas.get(canvas)!;
}

/** One paint's calls: the last frame, cut at the border fill. */
function lastPaint(ctx: FakeCtx) {
  const starts = ctx.calls
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.method === 'fillRect' && c.args[0] === 0 && c.args[1] === 0)
    .map(({ i }) => i);
  return ctx.calls.slice(starts[starts.length - 1]);
}

const glyphs = (ctx: FakeCtx) => lastPaint(ctx).filter((c) => c.method === 'drawImage');
const strokes = (ctx: FakeCtx) => lastPaint(ctx).filter((c) => c.method === 'strokeRect');

/** A screen with "A" (screen code 0x01) at the origin and nothing else. */
function screenWithAnA(): PetsciiMachine {
  const machine = new PetsciiMachine();
  machine.feed([0x41]);
  return machine;
}

const SELECT_ORIGIN = [{ x: 0, y: 0, w: 1, h: 1, tone: 'selection' as const }];

describe('a cell the caller has selected', () => {
  it('is drawn from the reversed half of the atlas', async () => {
    const plain = await paint(screenWithAnA());
    const picked = await paint(screenWithAnA(), SELECT_ORIGIN);

    expect(glyphs(plain)[0].args[1]).toBe(atlasCellOf(0x01));
    expect(glyphs(picked)[0].args[1]).toBe(atlasCellOf(0x81));
  });

  it('is not also boxed in', async () => {
    const ctx = await paint(screenWithAnA(), SELECT_ORIGIN);

    expect(strokes(ctx)).toEqual([]);
  });

  it('shows even where the caller selected empty screen', async () => {
    // A blank cell paints nothing at all - so a selection that only skipped
    // blanks would vanish over the empty half of a screen.
    const blank = new PetsciiMachine();

    const ctx = await paint(blank, [{ x: 3, y: 4, w: 2, h: 2, tone: 'selection' as const }]);
    const drawn = glyphs(ctx);

    expect(drawn).toHaveLength(4);
    // A reversed space is the solid block, screen code 0xA0.
    expect(drawn[0].args[1]).toBe(atlasCellOf(0xa0));
  });

  it('keeps the colour the cell was written in', async () => {
    const machine = new PetsciiMachine();
    machine.feed([0x1c, 0x41]); // red "A"
    const plain = await paint(machine);
    const picked = await paint(machine, SELECT_ORIGIN);

    // The tinted atlas is chosen by colour; the same tint is asked for either
    // way, so only the atlas CELL moves.
    expect(glyphs(picked)[0].args[0]).toEqual(glyphs(plain)[0].args[0]);
  });
});

describe("the editor's own marks", () => {
  it('are still outlines, because they are not the caller selecting anything', async () => {
    const ctx = await paint(screenWithAnA(), [{ x: 0, y: 0, w: 2, h: 1, tone: 'mci' as const }]);

    expect(strokes(ctx)).toHaveLength(1);
    expect(glyphs(ctx)[0].args[1]).toBe(atlasCellOf(0x01)); // not reversed
  });
});
