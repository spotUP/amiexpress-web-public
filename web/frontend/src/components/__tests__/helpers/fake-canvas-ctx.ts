/**
 * A CanvasRenderingContext2D double that records the draw calls made
 * against it, plus the getContext spy that hands one out per <canvas>.
 *
 * jsdom has no 2D rasterizer, so PetsciiCanvas tests assert at the
 * call level: which cells issued a drawImage, and how many times draw()
 * ran. Extracted from petscii-canvas-blank-cell-paint.test.tsx when the
 * repaint-coalescing test needed the same recorder.
 */
import { vi } from 'vitest';

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface FakeCtx {
  calls: RecordedCall[];
}

const RECORDED_METHODS = ['fillRect', 'drawImage', 'fillText', 'save', 'restore', 'beginPath', 'rect', 'clip'] as const;

export function makeFakeCtx(): FakeCtx {
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

export const ctxByCanvas = new WeakMap<HTMLCanvasElement, FakeCtx>();

/** Install the getContext spy. Call from beforeEach. */
export function installFakeCanvasContext(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let ctx = ctxByCanvas.get(this);
    if (!ctx) {
      ctx = makeFakeCtx();
      ctxByCanvas.set(this, ctx);
    }
    return ctx as unknown as RenderingContext;
  });
}

/** jsdom has no CSS Font Loading API; the glyph atlas awaits document.fonts.load. */
export function stubDocumentFonts(): void {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: () => Promise.resolve([]) },
  });
}
