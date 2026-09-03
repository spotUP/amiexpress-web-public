/**
 * "Pressing P at the graphics prompt resets the BBS" - the backend sees
 * `transport close` and a reconnect inside the grace period, i.e. the
 * browser tab threw and went down (sysop, localhost, 2026-09-02).
 *
 * The 'P' answer is the ONE moment the whole surface changes: pre-login's
 * applyGraphicsAnswer emits a 40x25 `terminal-resize`, BBSTerminal's
 * handler runs ensurePetsciiSession (new machine + transducer, surface ->
 * canvas), React unmounts xterm's wrapper and mounts the REAL
 * PetsciiCanvas, and the very next `ansi-output` is fed straight into the
 * machine - synchronously now that the drain no longer paces (an exception
 * on that path used to land in a detached async loop and could only produce
 * an unhandled rejection; it now propagates into the socket handler and,
 * from the login echo, into React).
 *
 * Every other BBSTerminal test in this directory mocks PetsciiCanvas away.
 * This one deliberately does not: it drives the real component, with a
 * recorded 2D context so the glyph atlas builds and draw() actually runs,
 * and fails on ANY error that escapes - a throw, an unhandled rejection, or
 * a React tree that lost its canvas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { installFakeCanvasContext, stubDocumentFonts, ctxByCanvas } from './helpers/fake-canvas-ctx';

const rec = vi.hoisted(() => ({ socket: null as any }));

vi.mock('../../../../../packages/terminal/node_modules/@xterm/xterm', () => {
  class FakeTerminal {
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

/** The 'P' answer, exactly as pre-login.ts's applyGraphicsAnswer sends it. */
function pressP() {
  act(() => {
    socket.fire('terminal-resize', { cols: 40, rows: 25 });
  });
}

describe("answering 'P' at the graphics prompt", () => {
  it('mounts the real PETSCII canvas without taking the terminal down', async () => {
    const { container } = render(<BBSTerminal backendUrl="http://localhost:3001" />);
    pressP();
    await waitFor(() => {
      expect(container.querySelector('canvas')).not.toBeNull();
    });
    expect(escaped).toEqual([]);
  });

  it('paints the first screen the board sends after P', async () => {
    const { container } = render(<BBSTerminal backendUrl="http://localhost:3001" />);
    pressP();
    const canvas = await waitFor(() => {
      const c = container.querySelector('canvas');
      expect(c).not.toBeNull();
      return c as HTMLCanvasElement;
    });
    // The atlas builds asynchronously; the subscription only arms after it.
    await waitFor(() => {
      expect(ctxByCanvas.get(canvas)).toBeTruthy();
    });

    await act(async () => {
      socket.fire('ansi-output', '\x1b[2J\x1b[H\x1b[1;37mDOOMSDAY BBS\x1b[0m\r\nGraphics: PETSCII\r\n');
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    expect(escaped).toEqual([]);
    expect(container.querySelector('canvas')).not.toBeNull(); // still mounted
    const ctx = ctxByCanvas.get(canvas)!;
    expect(ctx.calls.filter((c) => c.method === 'drawImage').length).toBeGreaterThan(0);
  });

  it('survives a keystroke on the canvas (transducer flush + login echo)', async () => {
    const { container } = render(<BBSTerminal backendUrl="http://localhost:3001" />);
    pressP();
    const canvas = await waitFor(() => {
      const c = container.querySelector('canvas');
      expect(c).not.toBeNull();
      return c as HTMLCanvasElement;
    });
    await waitFor(() => { expect(ctxByCanvas.get(canvas)).toBeTruthy(); });

    await act(async () => {
      socket.fire('ansi-output', 'Handle: ');
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', bubbles: true }));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    expect(escaped).toEqual([]);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('tears the canvas down cleanly when the session resets', async () => {
    const { container, unmount } = render(<BBSTerminal backendUrl="http://localhost:3001" />);
    pressP();
    await waitFor(() => { expect(container.querySelector('canvas')).not.toBeNull(); });
    await act(async () => {
      socket.fire('ansi-output', 'hello');
      unmount(); // a pending animation frame must not fire into a dead tree
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });
    expect(escaped).toEqual([]);
  });
});


/**
 * "i dont see any difference between the web terminal bg and the body bg"
 * (sysop, 2026-09-02). The outermost wrapper used to paint #000000 across
 * the whole viewport, so the page's lighter ground never showed. In fixed
 * 80x25 mode the page owns the ground and the terminal box owns the black.
 */
describe('fixed 80x25 mode leaves the page ground to the page', () => {
  it('the outer wrapper is transparent and the terminal box is black', async () => {
    const { container } = render(<BBSTerminal backendUrl="http://localhost:3001" />);
    const outer = container.firstElementChild as HTMLElement;
    const box = outer.firstElementChild as HTMLElement;
    expect(outer.style.backgroundColor).toBe('transparent');
    expect(box.style.backgroundColor).toBe('rgb(0, 0, 0)');
    // No width cap any more. The 960px one made sense while the cell size was
    // a constant and the box could otherwise stretch across an ultrawide
    // viewport; now the cell size IS the fit - the largest at which the grid
    // plus its bezel fits the window - so the box is exactly as wide as the
    // screen it holds and a cap could only clip it. The concrete fit for a
    // 1280x800 window is pinned in terminal-zoom.test.ts, where a real
    // measurement is possible (jsdom lays nothing out).
    expect(box.style.maxWidth).toBe('');
    // the bezel: a 16px black border with rounded corners around the screen
    expect(box.style.padding).toBe('var(--bbs-terminal-bezel, 16px)');
    expect(box.style.borderRadius).toBe('var(--bbs-terminal-radius, 12px)');
    expect(box.style.overflow).toBe('hidden');
    // the bezel must live inside the box's 100% width, or the outer wrapper clips the right corners square
    expect(box.style.boxSizing).toBe('border-box');
  });
});

/**
 * "the petscii mode is not centered like the normal term" (sysop, live board,
 * 2026-09-03). The fixed-mode wrapper declared its centring as
 * `flex items-center justify-center` in its className - Tailwind utilities
 * that web/frontend, the only consumer of this package, does not ship, so
 * nothing defined them and the terminal box sat pinned to the top-left
 * corner. An xterm session hid the defect because the PAGE centres that one
 * (TerminalPage shrink-wraps a fit-content frame around xterm's intrinsic
 * 80-column width); a PETSCII canvas is space-filling and cannot be
 * shrink-wrapped, so nothing centred it at all.
 *
 * jsdom does no layout, so what is asserted is the wrapper's own inline
 * centring - the thing whose absence left the screen in the corner - and that
 * it is identical for both surfaces.
 */
describe('a PETSCII canvas session is framed and centred on a desktop like an xterm session', () => {
  const centring = (el: HTMLElement) => ({
    display: el.style.display,
    alignItems: el.style.alignItems,
    justifyContent: el.style.justifyContent,
  });

  it('centres the bezelled terminal box for a canvas session, exactly as for an xterm session', async () => {
    const { container } = render(<BBSTerminal backendUrl="http://localhost:3001" />);
    const outer = container.firstElementChild as HTMLElement;
    const asXterm = centring(outer);
    expect(asXterm).toEqual({ display: 'flex', alignItems: 'center', justifyContent: 'center' });

    pressP();
    await waitFor(() => { expect(container.querySelector('canvas')).not.toBeNull(); });

    // Same wrapper, same centring - the surface flip must not cost it.
    expect(centring(container.firstElementChild as HTMLElement)).toEqual(asXterm);

    // ...and the canvas sits inside the same bezelled box the xterm session gets.
    const box = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
    expect(box.style.padding).toBe('var(--bbs-terminal-bezel, 16px)');
    expect(box.style.borderRadius).toBe('var(--bbs-terminal-radius, 12px)');
    expect(box.contains(container.querySelector('canvas'))).toBe(true);
    expect(escaped).toEqual([]);
  });

  // The host keeps a veto: the BBS page reserves the bottom of a phone for the
  // on-screen keyboard and wants the terminal at the top of what is left.
  it('leaves the box where the host put it when the host vetoes centring', () => {
    const { container } = render(
      <BBSTerminal backendUrl="http://localhost:3001" centerInHost={false} />
    );
    expect(centring(container.firstElementChild as HTMLElement)).toEqual({
      display: '', alignItems: '', justifyContent: '',
    });
  });
});
