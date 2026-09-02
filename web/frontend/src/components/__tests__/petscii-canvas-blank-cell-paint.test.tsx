/**
 * "The PETSCII canvas shows a regular grid of faint dots on the black
 * background - one dot per character cell, in a lattice" (sysop report with
 * screenshot, 2026-09-02). A C64 background is solid; nothing may be painted
 * in a cell that holds a blank screen code.
 *
 * Root cause (measured with a real Chromium rasterizer via puppeteer, not
 * guessed): `buildGlyphAtlas` draws all 512 PetMe64 glyphs edge-to-edge in
 * one canvas via `ctx.fillText`. Chromium's anti-aliased rasterization of an
 * INKED glyph bleeds a faint (~19/255 alpha) fringe past its nominal 8px
 * advance box into the NEXT glyph's cell. Every glyph adjacent to an inked
 * one in atlas order picks up a stray lit pixel - including the space glyphs
 * (screen code 0x20 and 0x60), whose own outlines are genuinely empty (0
 * contours, verified with fontTools against PetMe64.ttf). `glyph-atlas.ts`
 * now clips each glyph's `fillText` to its own cell rect, eliminating the
 * bleed at the source.
 *
 * This test guards the second, independent half of the fix: `PetsciiCanvas`
 * used to call `ctx.drawImage` for EVERY cell unconditionally, including
 * cells holding a blank (non-reverse space) screen code - so even a
 * perfectly blank atlas cell still cost a composite over the background,
 * and any future atlas regression (a font swap, a browser rendering quirk)
 * would repaint the dots. The draw loop now skips known-blank screen codes
 * entirely; the background fill already painted underneath is correct on
 * its own. jsdom has no real font rasterizer, so this test cannot reproduce
 * the pixel bleed itself - it asserts the call-level invariant instead: a
 * blank cell issues no drawImage/fillText, while a reverse-video space (a
 * solid block, screen code 0x20 | 0x80) still does.
 *
 * Imported from source so a stale packages/terminal dist cannot make this
 * pass.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface FakeCtx {
  calls: RecordedCall[];
}

const RECORDED_METHODS = ['fillRect', 'drawImage', 'fillText', 'save', 'restore', 'beginPath', 'rect', 'clip'] as const;

function makeFakeCtx(): FakeCtx {
  const calls: RecordedCall[] = [];
  const props: Record<string, unknown> = {};
  const target: Record<string, unknown> = { calls };
  for (const method of RECORDED_METHODS) {
    target[method] = (...args: unknown[]) => { calls.push({ method, args }); };
  }
  return new Proxy(target, {
    get(t, p) {
      if (typeof p === 'string' && p in t) return t[p];
      if (typeof p === 'string' && p in props) return props[p];
      return undefined;
    },
    set(_t, p, v) {
      if (typeof p === 'string') props[p] = v;
      return true;
    },
  }) as unknown as FakeCtx;
}

// jsdom has no CSS Font Loading API; the glyph atlas awaits document.fonts.load.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { load: () => Promise.resolve([]) },
});

const ctxByCanvas = new WeakMap<HTMLCanvasElement, FakeCtx>();

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let ctx = ctxByCanvas.get(this);
    if (!ctx) {
      ctx = makeFakeCtx();
      ctxByCanvas.set(this, ctx);
    }
    return ctx as unknown as RenderingContext;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function drawCallsOf(ctx: FakeCtx) {
  return ctx.calls.filter((c) => c.method === 'drawImage' || c.method === 'fillText');
}

describe('PetsciiCanvas: an empty PETSCII cell paints only the background', () => {
  it('issues no drawImage/fillText for a screen full of blank spaces', async () => {
    const machine = new PetsciiMachine(); // power-on state: screen filled with 0x20 (blank)
    const { container } = render(<PetsciiCanvas machine={machine} />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas).not.toBeNull();

    await waitFor(() => {
      const ctx = ctxByCanvas.get(canvas)!;
      expect(ctx.calls.some((c) => c.method === 'fillRect')).toBe(true); // draw() has run at least once
    });

    const ctx = ctxByCanvas.get(canvas)!;
    // Border + screen-background fills happen unconditionally; no per-cell
    // glyph draw should ever fire for an all-blank screen.
    expect(drawCallsOf(ctx)).toEqual([]);
  });

  it('still paints a reverse-video space (a filled block, screen code 0x20 | 0x80)', async () => {
    const machine = new PetsciiMachine();
    const { container } = render(<PetsciiCanvas machine={machine} />);
    const canvas = container.querySelector('canvas')!;

    await waitFor(() => {
      const ctx = ctxByCanvas.get(canvas)!;
      expect(ctx.calls.some((c) => c.method === 'fillRect')).toBe(true);
    });

    const ctx = ctxByCanvas.get(canvas)!;
    expect(drawCallsOf(ctx)).toEqual([]); // sanity: still blank before the reverse space

    act(() => {
      machine.feed([0x12, 0x20]); // RVS ON, then a space -> screen code 0xA0 at (0,0)
    });

    await waitFor(() => {
      expect(drawCallsOf(ctx).length).toBeGreaterThan(0);
    });
  });
});
