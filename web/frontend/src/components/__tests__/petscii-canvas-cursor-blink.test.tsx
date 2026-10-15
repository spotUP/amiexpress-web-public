/**
 * THE C64 CURSOR BLINKS. A real C64's screen-editor cursor is a solid
 * reverse block that flashes on and off; PetsciiCanvas has a 500ms
 * `CURSOR_BLINK_MS` interval and a `cursorOn` state for exactly that.
 *
 * c8e0f4dff added a `cursorVisible` prop DEFAULTED TO `true` and painted
 * `cursorVisible !== undefined ? cursorVisible : cursorOn`. With a default,
 * the prop is never undefined, so `cursorOn` became unreachable and the
 * block sat permanently lit on every PETSCII session - and BBSTerminal
 * additionally passed a `true`-initialised state fed by a `cursor-visibility`
 * socket event that no backend code ever emitted. The prop is now an
 * OVERRIDE with no default: omitted, the cursor blinks.
 *
 * The same commit left `cursorVisible` out of draw()'s useCallback deps, so
 * even a real change to the override kept the stale closure and could not
 * reach the glass. Case 3 is that half.
 *
 * jsdom has no rasterizer, so - like every other PetsciiCanvas test here -
 * this asserts at the CALL level, on the recording context double. draw()
 * always issues two fillRects (border, then screen background) and a third,
 * `destCell` wide, only when the cursor is painted. Imported from source so
 * a stale packages/terminal dist cannot make it pass.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, cleanup } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

import {
  ctxByCanvas,
  installFakeCanvasContext,
  stubDocumentFonts,
  type FakeCtx,
} from './helpers/fake-canvas-ctx';

stubDocumentFonts();

const CURSOR_BLINK_MS = 500;
/** scale 1 in jsdom (clientWidth is 0, so fitScale stays at its initial 1). */
const DEST_CELL = 8;

beforeEach(() => {
  vi.useFakeTimers();
  installFakeCanvasContext();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * The cursor's own fill: the only fillRect whose width is one character
 * cell. The border fill is the whole canvas and the screen fill is 40 cells
 * wide, so neither can be confused for it.
 */
function cursorFills(ctx: FakeCtx): number {
  return ctx.calls.filter(
    (c) => c.method === 'fillRect' && c.args[2] === DEST_CELL && c.args[3] === DEST_CELL,
  ).length;
}

function paints(ctx: FakeCtx): number {
  // One draw() = one border fill at (0, 0).
  return ctx.calls.filter((c) => c.method === 'fillRect' && c.args[0] === 0 && c.args[1] === 0).length;
}

async function mount(props: { cursorVisible?: boolean } = {}) {
  const machine = new PetsciiMachine();
  const view = render(<PetsciiCanvas machine={machine} {...props} />);
  // The atlas build awaits one stubbed document.fonts.load - a microtask,
  // not a timer - and setAtlasReady then drives the first draw().
  await act(async () => { await Promise.resolve(); });
  const canvas = view.container.querySelector('canvas')!;
  const ctx = ctxByCanvas.get(canvas)!;
  expect(paints(ctx)).toBeGreaterThan(0); // the instrument is live before anything is counted
  return { ...view, ctx, machine };
}

describe('PetsciiCanvas: the C64 cursor blinks', () => {
  it('paints the cursor on some frames and not others when cursorVisible is omitted', async () => {
    const { ctx } = await mount();

    const seen: boolean[] = [];
    let before = cursorFills(ctx);
    for (let tick = 0; tick < 4; tick += 1) {
      await act(async () => { vi.advanceTimersByTime(CURSOR_BLINK_MS); });
      const after = cursorFills(ctx);
      seen.push(after > before);
      before = after;
    }

    // RED on the broken code: with `cursorVisible = true` defaulted, every
    // repaint painted the block, so `seen` was [true, true, true, true].
    expect(seen).toContain(true);
    expect(seen).toContain(false);
  });

  it('holds the cursor dark for the whole run when the override says false', async () => {
    const { ctx } = await mount({ cursorVisible: false });

    for (let tick = 0; tick < 4; tick += 1) {
      await act(async () => { vi.advanceTimersByTime(CURSOR_BLINK_MS); });
    }

    expect(cursorFills(ctx)).toBe(0);
    expect(paints(ctx)).toBeGreaterThan(1); // it kept repainting - it is dark, not frozen
  });

  it('repaints the moment the override changes, without waiting for a blink tick', async () => {
    // THE SAME machine across the rerender: `machine` is in draw()'s dep
    // array already, so handing it a new one would rebuild the memo for a
    // reason that has nothing to do with the prop under test.
    const { ctx, rerender, machine } = await mount({ cursorVisible: false });

    expect(cursorFills(ctx)).toBe(0);
    const before = paints(ctx);

    rerender(<PetsciiCanvas machine={machine} cursorVisible />);

    // NO TIMER IS ADVANCED. A prop the memo watches changes draw()'s
    // identity, and the repaint effects run on that identity - so the new
    // value is on the glass this render.
    //
    // RED on the broken code: `cursorVisible` was missing from draw()'s dep
    // array, so the memo handed back the stale closure, nothing re-ran, and
    // the override sat unpainted until some OTHER dependency happened to
    // change - up to a whole blink interval later, and never at all on a
    // canvas that had stopped blinking.
    expect(paints(ctx)).toBeGreaterThan(before);
    expect(cursorFills(ctx)).toBeGreaterThan(0);
  });
});
