/**
 * "THE CURSOR STAYS RED IN PETSCII MODE" (the sysop, 2026-09-23).
 *
 * The cursor was taught to paint in the machine's pen so a caller can see
 * which colour he is about to type in - and it still did not move, because
 * THE PEN NEVER MOVED. A colour chord prints no character, so the board has
 * nothing to echo, so no colour byte ever comes back down the wire, so the
 * display machine the canvas draws from went on believing the last colour
 * the BOARD sent.
 *
 * On a real C64 the chord is local first: the screen editor sets the pen the
 * moment the key is pressed, and the byte travels as well. That is what the
 * terminal does now - for the pen and reverse bytes only, since a printable
 * one would be drawn twice when the board echoes it.
 *
 * Driven through the real component and a real canvas, the way the P-session
 * mount test does.
 */
import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { installFakeCanvasContext, stubDocumentFonts, ctxByCanvas, type FakeCtx } from './helpers/fake-canvas-ctx';

const rec = vi.hoisted(() => ({ socket: null as any }));

vi.mock('../../../../packages/terminal/node_modules/@xterm/xterm', () => {
  class FakeTerminal {
    clear() {}
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
vi.mock('../../../../packages/terminal/node_modules/@xterm/addon-canvas', () => ({
  CanvasAddon: class { activate() {} dispose() {} },
}));
vi.mock('../../../../packages/terminal/node_modules/@xterm/addon-fit', () => ({
  FitAddon: class {
    activate() {} fit() {}
    proposeDimensions() { return { cols: 80, rows: 25 }; }
    dispose() {}
  },
}));
vi.mock('../../../../packages/terminal/node_modules/zmodem.js/dist/zmodem', () => ({}));
vi.mock('../../../../packages/terminal/node_modules/socket.io-client', () => ({
  io: () => rec.socket,
  Socket: class {},
}));

import { BBSTerminal } from '../../../../packages/terminal/src/components/BBSTerminal';
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

/** The bytes the canvas sent to the board, in order. */
function sentBytes(): number[] {
  const out: number[] = [];
  for (const { args } of socket.emitted) {
    for (const arg of args) {
      if (typeof arg === 'string') for (const ch of arg) out.push(ch.charCodeAt(0));
    }
  }
  return out;
}

async function petsciiSession() {
  const handle = createRef<any>();
  const { container } = render(<BBSTerminal ref={handle} backendUrl="http://localhost:3001" />);
  act(() => { socket.fire('terminal-resize', { cols: 40, rows: 25 }); });
  const canvas = await waitFor(() => {
    const c = container.querySelector('canvas');
    expect(c).not.toBeNull();
    return c as HTMLCanvasElement;
  });
  return { container, canvas, handle };
}

/** CTRL+3 on a C64 keyboard: red. CTRL+6: green. */
function chord(canvas: HTMLCanvasElement, digit: string) {
  act(() => {
    canvas.dispatchEvent(new KeyboardEvent('keydown', {
      key: digit, code: `Digit${digit}`, ctrlKey: true, bubbles: true, cancelable: true,
    }));
  });
}

/** The last fill issued over exactly one character cell: the cursor block. */
function lastCursorFill(ctx: FakeCtx): string {
  let current = '';
  let last = '';
  const cell = ctx.calls.find((c) => c.method === 'fillRect' && c.args[2] === c.args[3]);
  const size = cell ? Number(cell.args[2]) : 0;
  for (const call of ctx.calls) {
    if (call.method === 'fillStyle=') current = String(call.args[0]);
    if (call.method === 'fillRect' && call.args[2] === size && call.args[3] === size) last = current;
  }
  return last.toLowerCase();
}

describe('a colour chord on a PETSCII session', () => {
  it('reaches the board as the colour the caller picked', async () => {
    const { canvas } = await petsciiSession();

    chord(canvas, '3');

    // The board is handed the AUTHORED form - the PUA colour marker, which
    // every terminal renders in its own way - not an ESC sequence.
    // U+E202 is VIC 2, red.
    await waitFor(() => { expect(sentBytes()).toContain(0xe202); });
  });

  it('moves the cursor for a keystroke that never touched the canvas', async () => {
    // The canvas's own `onData` is NOT the only way in: xterm's `onData`
    // calls `sendInput` directly, and so does the on-screen keyboard, which
    // is the path this drives. The sysop's focus was on one of those the
    // second time the cursor stayed red, so the pen is fed at `sendInput` -
    // the one place every keystroke ends up.
    const { canvas, handle } = await petsciiSession();
    const ctx = ctxByCanvas.get(canvas)!;
    const before = lastCursorFill(ctx);

    // U+E207 is VIC 7, yellow - the authored marker a Ctrl+8 chord becomes.
    act(() => { handle.current?.injectInput('\u{E207}'); });
    act(() => { canvas.dispatchEvent(new Event('blur')); });

    await waitFor(() => { expect(lastCursorFill(ctx)).not.toBe(before); });
  });

  it('moves the cursor without waiting for the board to answer', async () => {
    const { canvas } = await petsciiSession();
    const ctx = ctxByCanvas.get(canvas)!;
    const before = lastCursorFill(ctx);

    chord(canvas, '6');            // green
    await waitFor(() => { expect(sentBytes()).toContain(0xe205); });
    act(() => { canvas.dispatchEvent(new Event('blur')); });

    // Nothing came back from the board - a chord prints no character - so a
    // cursor that only followed inbound bytes would still be painting in the
    // old colour here.
    await waitFor(() => { expect(lastCursorFill(ctx)).not.toBe(before); });
  });
});
