/**
 * "SCROLLBACK DOES NOT WORK PETSCII" (the sysop, 2026-09-24).
 *
 * The board's own clear was taught to scroll the old screen into history the
 * day before, on the ANSI surface. A PETSCII session never touches that
 * surface: `BBSTerminal` hands the whole call to `PetsciiCanvas`, which draws
 * a screen model, and the model dropped every row it lost. The wheel, mean-
 * while, reached the cell-pointer handler and fell through it - that handler
 * answers `down`, `move` and `up`.
 *
 * THIS IS THE WIRING TEST: the real component, a real canvas, board output
 * arriving on the socket and a real wheel event. The model's own history and
 * the wheel's arithmetic are tested where they live
 * (`a-screen-the-caller-scrolled-past-is-still-there`,
 * `petscii-scrollback-offset`); what is proved here is that a caller turning
 * the wheel on a PETSCII session sees what scrolled past.
 */
import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, waitFor, fireEvent } from '@testing-library/react';
import { installFakeCanvasContext, stubDocumentFonts, ctxByCanvas, type FakeCtx } from './helpers/fake-canvas-ctx';

const rec = vi.hoisted(() => ({ socket: null as any }));

vi.mock('../../../../../packages/terminal/node_modules/@xterm/xterm', () => {
  class FakeTerminal {
    options: Record<string, any> = {};
    textarea: HTMLTextAreaElement | null = null;
    element: HTMLElement | null = null;
    cols = 80; rows = 25;
    open(el: HTMLElement) {
      this.element = el;
      this.textarea = document.createElement('textarea');
      el.appendChild(this.textarea);
    }
    loadAddon() {} onData() { return { dispose() {} }; } onKey() { return { dispose() {} }; }
    attachCustomKeyEventHandler() {} write() {} writeln() {} input() {} focus() {}
    blur() {} reset() {} refresh() {}
    resize(cols: number, rows: number) { this.cols = cols; this.rows = rows; }
    clearSelection() {} selectAll() {} getSelection() { return ''; } dispose() {}
  }
  return { Terminal: FakeTerminal };
});
vi.mock('../../../../../packages/terminal/node_modules/@xterm/addon-canvas', () => ({
  CanvasAddon: class { activate() {} dispose() {} },
}));
vi.mock('../../../../../packages/terminal/node_modules/@xterm/addon-fit', () => ({
  FitAddon: class {
    activate() {} fit() {}
    proposeDimensions() { return { cols: 80, rows: 25 }; }
    dispose() {}
  },
}));
vi.mock('../../../../../packages/terminal/node_modules/zmodem.js/dist/zmodem', () => ({}));
vi.mock('../../../../../packages/terminal/node_modules/socket.io-client', () => ({
  io: () => rec.socket,
  Socket: class {},
}));

import { BBSTerminal } from '../../../../../packages/terminal/src/components/BBSTerminal';
import { FakeSocket } from './helpers/fake-socket';

stubDocumentFonts();

let socket: FakeSocket;

beforeEach(() => {
  installFakeCanvasContext();
  socket = new FakeSocket();
  rec.socket = socket;
  window.localStorage.clear();
  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  if (typeof navigator.getGamepads !== 'function') {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function petsciiSession(): Promise<{ canvas: HTMLCanvasElement }> {
  const handle = createRef<any>();
  const { container } = render(<BBSTerminal ref={handle} backendUrl="http://localhost:3001" />);
  act(() => { socket.fire('terminal-resize', { cols: 40, rows: 25 }); });
  const canvas = await waitFor(() => {
    const c = container.querySelector('canvas');
    expect(c).not.toBeNull();
    return c as HTMLCanvasElement;
  });
  // jsdom gives every element a zero-sized rect, and the canvas maps a client
  // point to a cell through its own rect - so a wheel over a zero-sized
  // canvas is over no cell at all.
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: 352, bottom: 232, width: 352, height: 232,
    toJSON: () => ({}),
  }) as DOMRect;
  return { canvas };
}

/** The glyphs composited by the most recent paint. */
function glyphsDrawn(ctx: FakeCtx): number {
  const starts = ctx.calls
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.method === 'fillRect' && c.args[0] === 0 && c.args[1] === 0)
    .map(({ i }) => i);
  if (starts.length === 0) return 0;
  return ctx.calls.slice(starts[starts.length - 1]).filter((c) => c.method === 'drawImage').length;
}

describe('a caller on a PETSCII session', () => {
  it('can wheel back to the screen the board cleared away', async () => {
    const { canvas } = await petsciiSession();
    const ctx = ctxByCanvas.get(canvas)!;

    act(() => { socket.fire('ansi-output', '\x1b[2J\x1b[HUPROUGH BBS\r\n'); });
    act(() => { socket.fire('ansi-output', '\x1b[2J\x1b[H'); });

    // The board redrew: the glass is blank, and the screen before it is gone
    // unless something kept it.
    await waitFor(() => { expect(glyphsDrawn(ctx)).toBe(0); });

    fireEvent.wheel(canvas, { clientX: 40, clientY: 40, deltaY: -120 });

    await waitFor(() => { expect(glyphsDrawn(ctx)).toBeGreaterThan(0); });
  });

  it('is put back on the live screen by the next key he presses', async () => {
    const { canvas } = await petsciiSession();
    const ctx = ctxByCanvas.get(canvas)!;

    act(() => { socket.fire('ansi-output', '\x1b[2J\x1b[HUPROUGH BBS\r\n'); });
    act(() => { socket.fire('ansi-output', '\x1b[2J\x1b[H'); });
    fireEvent.wheel(canvas, { clientX: 40, clientY: 40, deltaY: -120 });
    await waitFor(() => { expect(glyphsDrawn(ctx)).toBeGreaterThan(0); });

    act(() => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'a', code: 'KeyA', bubbles: true, cancelable: true,
      }));
    });

    // He is answering a prompt he cannot see from up there.
    await waitFor(() => { expect(glyphsDrawn(ctx)).toBe(0); });
  });

  it('cannot wheel past the top of what the board has sent him', async () => {
    const { canvas } = await petsciiSession();
    const ctx = ctxByCanvas.get(canvas)!;

    // Nothing has been drawn at all, so there is no history behind the glass.
    for (let i = 0; i < 10; i++) fireEvent.wheel(canvas, { clientX: 40, clientY: 40, deltaY: -120 });

    await waitFor(() => { expect(glyphsDrawn(ctx)).toBe(0); });
  });
});
