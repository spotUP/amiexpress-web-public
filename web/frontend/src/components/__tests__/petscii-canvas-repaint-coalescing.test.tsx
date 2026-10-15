/**
 * The second half of "the ANSI animated logos play super slow in PETSCII
 * mode" (sysop, 2026-09-02).
 *
 * `PetsciiMachine.feed()` fires `onUpdate` once per CALL, and PetsciiCanvas
 * used to repaint all 1,000 cells synchronously inside that callback. The
 * number of feeds per screen is set by how the bytes arrive, not by how
 * often the picture actually changes:
 *
 *   - the old 64-byte paced drain made 494 feeds for one `Screens/flt.txt`
 *     (513 paints/sec, 8.5x over 60 fps);
 *   - `screen.handler.emitWithModem` emits every escape token as its own
 *     socket message, so with modem emulation on the same logo arrives as
 *     2,604 `ansi-output` events - 2,601 full-canvas repaints, up to 2.6M
 *     `drawImage` calls, for ONE logo.
 *
 * Removing the drain's pacing does not fix that second case; the paint has
 * to be coalesced. draw() now runs at most once per animation frame.
 *
 * jsdom has no rasterizer, so this asserts at the call level, using the
 * same recorded-context double as petscii-canvas-blank-cell-paint.test.tsx.
 * Imported from source so a stale packages/terminal dist cannot make it pass.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import {
  ctxByCanvas,
  installFakeCanvasContext,
  stubDocumentFonts,
  type FakeCtx,
} from './helpers/fake-canvas-ctx';

stubDocumentFonts();

beforeEach(() => {
  installFakeCanvasContext();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** draw() opens with the border fillRect, so one border fill == one paint. */
function paintCount(ctx: FakeCtx): number {
  return ctx.calls.filter((c) => c.method === 'fillRect' && c.args[0] === 0 && c.args[1] === 0).length;
}

/** Let every pending animation frame run. */
async function nextFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

describe('PetsciiCanvas repaints once per animation frame', () => {
  it('paints once for a burst of feeds in a single tick, not once per feed', async () => {
    const machine = new PetsciiMachine();
    const { container } = render(<PetsciiCanvas machine={machine} />);
    const canvas = container.querySelector('canvas')!;

    await waitFor(() => {
      expect(ctxByCanvas.get(canvas)).toBeTruthy();
      expect(paintCount(ctxByCanvas.get(canvas)!)).toBeGreaterThan(0); // the mount paint
    });
    const ctx = ctxByCanvas.get(canvas)!;
    ctx.calls.length = 0; // measure only what the burst costs

    // The shape emitWithModem produces: many tiny feeds back to back.
    act(() => {
      for (let i = 0; i < 40; i++) machine.feed([0x41 + (i % 26)]);
    });
    await nextFrame();

    expect(paintCount(ctx)).toBe(1);
  });

  it('still paints the LAST state of the burst, not a stale one', async () => {
    const machine = new PetsciiMachine();
    const { container } = render(<PetsciiCanvas machine={machine} />);
    const canvas = container.querySelector('canvas')!;
    await waitFor(() => {
      expect(ctxByCanvas.get(canvas)).toBeTruthy();
      expect(paintCount(ctxByCanvas.get(canvas)!)).toBeGreaterThan(0);
    });
    const ctx = ctxByCanvas.get(canvas)!;
    ctx.calls.length = 0;

    act(() => {
      machine.feed([0x12]);       // RVS ON
      for (let i = 0; i < 20; i++) machine.feed([0x20]); // 20 reverse spaces = 20 solid blocks
    });
    await nextFrame();

    expect(paintCount(ctx)).toBe(1);
    // 20 solid blocks are on screen after the burst; the one paint must show them.
    expect(ctx.calls.filter((c) => c.method === 'drawImage').length).toBe(20);
  });

  it('a later feed in a new frame paints again', async () => {
    const machine = new PetsciiMachine();
    const { container } = render(<PetsciiCanvas machine={machine} />);
    const canvas = container.querySelector('canvas')!;
    await waitFor(() => {
      expect(ctxByCanvas.get(canvas)).toBeTruthy();
      expect(paintCount(ctxByCanvas.get(canvas)!)).toBeGreaterThan(0);
    });
    const ctx = ctxByCanvas.get(canvas)!;
    ctx.calls.length = 0;

    act(() => { machine.feed([0x12, 0x20]); });
    await nextFrame();
    expect(paintCount(ctx)).toBe(1);

    act(() => { machine.feed([0x20]); });
    await nextFrame();
    expect(paintCount(ctx)).toBe(2);
  });
});

/**
 * The coalescing latch must never wedge. draw() runs inside a
 * requestAnimationFrame callback now; if it throws (a lost context, a
 * palette a door set out of range) and the "a frame is already queued"
 * latch is left standing, the canvas never repaints again for the rest of
 * the session - a black screen that looks exactly like a crashed BBS.
 */
describe('a paint that throws', () => {
  it('does not wedge the canvas: the next feed paints again', async () => {
    const machine = new PetsciiMachine();
    const { container } = render(<PetsciiCanvas machine={machine} />);
    const canvas = container.querySelector('canvas')!;
    await waitFor(() => {
      expect(ctxByCanvas.get(canvas)).toBeTruthy();
      expect(paintCount(ctxByCanvas.get(canvas)!)).toBeGreaterThan(0);
    });
    const ctx = ctxByCanvas.get(canvas)!;
    ctx.calls.length = 0;

    // Blow up the first paint of the next frame. mockImplementationOnce
    // stacks on top of installFakeCanvasContext's mock and is consumed by
    // that one call - restoring it here would take the recorder with it.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementationOnce(() => {
      throw new Error('context lost');
    });
    act(() => { machine.feed([0x12, 0x20]); });
    await nextFrame();
    expect(paintCount(ctx)).toBe(0); // the throwing frame painted nothing

    act(() => { machine.feed([0x20]); });
    await nextFrame();
    expect(paintCount(ctx)).toBe(1); // ...and the latch let the next frame through
  });
});
