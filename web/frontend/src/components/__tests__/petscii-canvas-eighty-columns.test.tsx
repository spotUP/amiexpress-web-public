/**
 * The canvas at 80 columns (petscii80 phase 4).
 *
 * The footprint, the paint loop and the cursor index all come off the
 * machine's own shape, so one canvas draws a C64's screen and this board's
 * wide one. The numbers asserted here are phase 0's measurement.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { PetsciiCanvas, PETSCII_UNIT_FOOTPRINT } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { PetsciiMachine, WideScreenMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { ctxByCanvas, installFakeCanvasContext, stubDocumentFonts, type FakeCtx } from './helpers/fake-canvas-ctx';

stubDocumentFonts();
beforeEach(() => { installFakeCanvasContext(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/**
 * The cells a paint touched, by destination corner. Counting calls would
 * count frames: the canvas may draw more than once while it settles, and
 * every frame repaints the same set of cells.
 */
function cellsPainted(ctx: FakeCtx): Set<string> {
  const seen = new Set<string>();
  for (const call of ctx.calls) {
    if (call.method !== 'drawImage') continue;
    seen.add(`${String(call.args[5])},${String(call.args[6])}`);
  }
  return seen;
}

/** Fill every cell with 'A', which is a glyph the canvas must draw. */
function fill(machine: PetsciiMachine): void {
  const { screen, cols, rows } = machine.state;
  screen.fill(0x41);
  expect(screen.length).toBe(cols * rows);
}

describe('PetsciiCanvas at either width', () => {
  it('the wide screen is 672x232 per unit of scale, where a C64 is 352x232', () => {
    expect(PETSCII_UNIT_FOOTPRINT).toEqual({
      c64: { width: 352, height: 232 },
      wide: { width: 672, height: 232 },
    });
  });

  it('paints two thousand cells at 80x25, and one thousand at 40x25', async () => {
    for (const [machine, cells] of [[new WideScreenMachine(), 2000], [new PetsciiMachine(), 1000]] as const) {
      fill(machine);
      const { container, unmount } = render(<PetsciiCanvas machine={machine} />);
      const canvas = container.querySelector('canvas')!;
      await waitFor(() => {
        const ctx = ctxByCanvas.get(canvas)!;
        expect(ctx.calls.some((c) => c.method === 'fillRect')).toBe(true);
      });
      const ctx = ctxByCanvas.get(canvas)!;
      expect(cellsPainted(ctx).size).toBe(cells);
      unmount();
    }
  });

  it('the backing store is as wide as the screen it draws', async () => {
    const wide = new WideScreenMachine();
    const { container } = render(<PetsciiCanvas machine={wide} scale={1} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    await waitFor(() => expect(canvas.width).toBeGreaterThan(0));
    // 80 * 8 + 2 * 16 at scale 1, the wide footprint above.
    expect([canvas.width, canvas.height]).toEqual([672, 232]);

    cleanup();
    const c64 = new PetsciiMachine();
    const second = render(<PetsciiCanvas machine={c64} scale={1} />);
    const narrow = second.container.querySelector('canvas') as HTMLCanvasElement;
    await waitFor(() => expect(narrow.width).toBeGreaterThan(0));
    expect([narrow.width, narrow.height]).toEqual([352, 232]);
  });
});
