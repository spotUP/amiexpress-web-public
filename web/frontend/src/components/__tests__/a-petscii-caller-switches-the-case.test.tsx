/**
 * THE TERMINAL HALF OF THE CASE SWITCH (sysop decision D1 and a C64 caller's
 * request, 2026-10-04; plan
 * `thoughts/shared/plans/2026-10-04-petscii-ctrl-l-case-toggle.md`).
 *
 * - The board's `petscii-case` (its answer to CTRL+L) switches the WHOLE
 *   screen: every visible cell is drawn again from the other half of the
 *   character ROM, the screen memory untouched - what a C64 does.
 * - CTRL+ALT on the canvas (its C= + SHIFT) does the same locally and tells
 *   the board which set it shows (`petscii-case-set`).
 * - CTRL+L on the canvas is a request to the board (`petscii-case-toggle`),
 *   never a key the board or a door reads.
 *
 * Drives the real BBSTerminal with the real PetsciiCanvas, as
 * bbsterminal-petscii-p-session-mount.test.tsx does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { installFakeCanvasContext, stubDocumentFonts, ctxByCanvas } from './helpers/fake-canvas-ctx';

const rec = vi.hoisted(() => ({ socket: null as any }));

vi.mock('../../../../../packages/terminal/node_modules/@xterm/xterm', () => {
  class FakeTerminal {
    clear() {}
    options: Record<string, any> = {};
    textarea: HTMLTextAreaElement | null = null;
    element: HTMLElement | null = null;
    cols = 80;
    rows = 25;
    open(el: HTMLElement) {
      this.element = el;
      this.textarea = document.createElement('textarea');
      el.appendChild(this.textarea);
    }
    loadAddon() {}
    onData() { return { dispose() {} }; }
    onKey() { return { dispose() {} }; }
    attachCustomKeyEventHandler() {}
    write() {}
    writeln() {}
    input() {}
    focus() {}
    // The real Terminal has both, and the component calls them: `blur` when
    // the canvas takes focus, `reset` when a mode change hands the surface
    // back (teletext, and leaving PETSCII). A double without them turns a
    // working path into a TypeError the component swallows.
    blur() {}
    reset() {}
    refresh() {}
    resize(cols: number, rows: number) { this.cols = cols; this.rows = rows; }
    clearSelection() {}
    selectAll() {}
    getSelection() { return ''; }
    dispose() {}
  }
  return { Terminal: FakeTerminal };
});
vi.mock('../../../../../packages/terminal/node_modules/@xterm/addon-canvas', () => ({
  CanvasAddon: class { activate() {} dispose() {} },
}));
vi.mock('../../../../../packages/terminal/node_modules/@xterm/addon-fit', () => ({
  FitAddon: class {
    activate() {}
    fit() {}
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
let escaped: unknown[];

beforeEach(() => {
  installFakeCanvasContext();
  socket = new FakeSocket();
  rec.socket = socket;
  escaped = [];
  window.localStorage.clear();
  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  if (typeof navigator.getGamepads !== 'function') {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
  }
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onRejection);
});
afterEach(() => {
  window.removeEventListener('error', onWindowError);
  window.removeEventListener('unhandledrejection', onRejection);
  cleanup();
  vi.restoreAllMocks();
});

function onWindowError(e: ErrorEvent) { escaped.push(e.error ?? e.message); }
function onRejection(e: PromiseRejectionEvent) { escaped.push(e.reason); }


const BANK_ONE_SX = 256 * 8;   // glyphCellIndex(1, 0) * ATLAS_PX_SIZE

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function petsciiScreen() {
  const view = render(<BBSTerminal backendUrl="http://localhost:3001" />);
  act(() => { socket.fire('terminal-resize', { cols: 40, rows: 25 }); });
  const canvas = await waitFor(() => {
    const c = view.container.querySelector('canvas');
    expect(c).not.toBeNull();
    return c as HTMLCanvasElement;
  });
  await waitFor(() => { expect(ctxByCanvas.get(canvas)).toBeTruthy(); });
  const ctx = ctxByCanvas.get(canvas)!;
  let mark = 0;
  /** The glyph source x of every drawImage since the last call. */
  const glyphsSince = () => {
    const draws = ctx.calls.slice(mark).filter((c) => c.method === 'drawImage').map((c) => c.args[1] as number);
    mark = ctx.calls.length;
    return draws;
  };
  return { canvas, glyphsSince };
}

describe('the case switch on the PETSCII canvas', () => {
  it("the board's switch redraws every visible cell from the other character set", async () => {
    const { glyphsSince } = await petsciiScreen();
    await act(async () => { socket.fire('ansi-output', 'menu'); await frame(); await frame(); });
    const before = glyphsSince();
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((sx) => sx >= BANK_ONE_SX)).toBe(true);

    await act(async () => { socket.fire('petscii-case', { bank: 0 }); await frame(); await frame(); });
    const after = glyphsSince();
    // The cursor block is a fill, not a glyph: the four letters are all drawn
    // again, from bank 0, with not one byte of new text.
    expect(after.filter((sx) => sx < BANK_ONE_SX).length).toBeGreaterThanOrEqual(4);
    expect(after.some((sx) => sx >= BANK_ONE_SX)).toBe(false);

    // And the board's next line stays in that set.
    await act(async () => { socket.fire('ansi-output', 'X'); await frame(); await frame(); });
    expect(glyphsSince().some((sx) => sx >= BANK_ONE_SX)).toBe(false);
    expect(escaped).toEqual([]);
  });

  it('CTRL+ALT switches the screen at once and tells the board, and is never a key', async () => {
    const { canvas, glyphsSince } = await petsciiScreen();
    await act(async () => { socket.fire('ansi-output', 'menu'); await frame(); await frame(); });
    glyphsSince();
    const commandsBefore = socket.emitted.filter((e) => e.event === 'command').length;

    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', ctrlKey: true, altKey: true, bubbles: true }));
      await frame(); await frame();
    });
    expect(socket.emitted.filter((e) => e.event === 'petscii-case-set').map((e) => e.args[0])).toEqual([{ bank: 0 }]);
    const after = glyphsSince();
    expect(after.length).toBeGreaterThanOrEqual(4);
    expect(after.some((sx) => sx >= BANK_ONE_SX)).toBe(false);

    // The other order: ALT held, CTRL pressed - back to the lower case set.
    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true, altKey: true, bubbles: true }));
      await frame(); await frame();
    });
    expect(socket.emitted.filter((e) => e.event === 'petscii-case-set').map((e) => e.args[0])).toEqual([{ bank: 0 }, { bank: 1 }]);
    expect(glyphsSince().every((sx) => sx >= BANK_ONE_SX)).toBe(true);
    expect(socket.emitted.filter((e) => e.event === 'command').length).toBe(commandsBefore);
  });

  it('CTRL+L asks the board for the switch and is not typed', async () => {
    const { canvas } = await petsciiScreen();
    const commandsBefore = socket.emitted.filter((e) => e.event === 'command').length;
    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', code: 'KeyL', ctrlKey: true, bubbles: true }));
      await frame();
    });
    expect(socket.didEmit('petscii-case-toggle')).toBe(true);
    expect(socket.emitted.filter((e) => e.event === 'command').length).toBe(commandsBefore);
  });
});
