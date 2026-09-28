/**
 * The terminal zoom override is REMOVED (sysop, 2026-09-12): the browser
 * window alone decides the size. What BBSTerminal owns now is following
 * the fit - the largest cell at which the grid plus its bezel fits the
 * window - and reporting fit-to-window once on mount.
 *
 * These tests prove the WIRING that remains: the mount report, the cell
 * size handed down untouched, the box with no cap and the page-token
 * bezel - plus that gestures do nothing now (wheel reaches the door,
 * a stored override from the gesture days is never read back).
 *
 * NOTE ON THE MOCK PATHS: the terminal package has its OWN node_modules copy
 * of xterm / socket.io-client, a different module id from web/frontend's - a
 * bare `vi.mock('@xterm/xterm')` mocks the frontend's copy while BBSTerminal
 * loads the real one. Mock the path the component resolves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

/** The slice of xterm's Terminal that BBSTerminal actually drives. */
interface FakeTerminalLike {
  options: Record<string, unknown>;
  cols: number;
  rows: number;
  element: HTMLElement | null;
  textarea: HTMLTextAreaElement | null;
}

interface Recorder {
  ctorArgs: Array<Record<string, unknown>>;
  terminals: FakeTerminalLike[];
  socket: unknown;
}

const rec = vi.hoisted<Recorder>(() => ({
  ctorArgs: [],
  terminals: [],
  socket: null,
}));

vi.mock('../../../../../packages/terminal/node_modules/@xterm/xterm', () => {
  class FakeTerminal {
    reset() {}
    clear() {}
    options: Record<string, unknown>;
    textarea: HTMLTextAreaElement | null = null;
    element: HTMLElement | null = null;
    cols = 80;
    rows = 25;
    constructor(opts: Record<string, unknown>) {
      rec.ctorArgs.push({ ...opts });
      this.options = { ...opts };
      rec.terminals.push(this as FakeTerminalLike);
    }
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
    blur() {}
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
import {
  FIT_TO_WINDOW,
  ZOOM_STORAGE_KEY,
} from '../../../../../packages/terminal/src/utils/terminal-zoom';
import { DEFAULT_BBS_FONT, seamlessSize } from '../../../../../packages/terminal/src/utils/session-font';
import { FakeSocket } from './helpers/fake-socket';

/** The desktop board's own box, once fitted: 960 wide, 632 tall. */
const BOX_RECT = {
  left: 100, top: 50, right: 1060, bottom: 682,
  width: 960, height: 632, x: 100, y: 50,
};

beforeEach(() => {
  rec.ctorArgs.length = 0;
  rec.terminals.length = 0;
  rec.socket = new FakeSocket();
  window.localStorage.clear();
  if (!(window as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  if (typeof navigator.getGamepads !== 'function') {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [],
    });
  }
});
afterEach(() => cleanup());

interface Mounted {
  box: HTMLElement;
  term: FakeTerminalLike;
  /** Every fraction the component has reported, in order. */
  reported: number[];
  /** How many times the box's rect has been measured. */
  rectReads: () => number;
}

/** Mount with a rect on the box, since jsdom lays nothing out. */
function mountBox(props: { fontSize?: number } = {}): Mounted {
  const reported: number[] = [];
  const { container } = render(
    <BBSTerminal
      backendUrl="http://localhost:3001"
      onZoomChange={(fraction) => reported.push(fraction)}
      {...props}
    />
  );
  const box = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
  let reads = 0;
  box.getBoundingClientRect = () => {
    reads++;
    return { ...BOX_RECT, toJSON: () => BOX_RECT } as DOMRect;
  };
  return { box, term: rec.terminals[0], reported, rectReads: () => reads };
}

/**
 * The gestures coalesce to one commit per animation frame, and the state
 * change that follows re-renders the terminal. Two frames covers both.
 */
async function flushFrames(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

function wheel(box: HTMLElement, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  box.dispatchEvent(event);
  return event;
}

describe('the terminal follows the window until the viewer overrides it', () => {
  it('reports fit-to-window on mount when this browser has never overridden', () => {
    const { reported } = mountBox();
    expect(reported[0]).toBe(FIT_TO_WINDOW);
  });

  it('renders the cell size the page hands down, without scaling it itself', async () => {
    const { term } = mountBox({ fontSize: 25.4 });
    expect(rec.ctorArgs[0].fontSize).toBe(25.4);
    await flushFrames();
    // No zoom fraction of its own - the only thing between the handed-down
    // size and the one held is the whole-cell snap for the face (applyFont
    // via seamlessSize): 25.4 in a 0.5-advance face is a 12.7px cell, so 24.
    expect(term.options.fontSize).toBe(seamlessSize(25.4, DEFAULT_BBS_FONT));
    expect(term.options.fontSize).toBe(24);
  });

  it('has no width cap on the box - a cap could only clip a screen fitted to the window', () => {
    const { box } = mountBox();
    expect(box.style.maxWidth).toBe('');
  });

  it('reads its bezel from the page token, which is where the fit absorbs its leftover', () => {
    const { box } = mountBox();
    expect(box.style.padding).toBe('var(--bbs-terminal-bezel, 16px)');
  });
});

describe('no gesture can move the screen off the window fit', () => {
  it('a Cmd+wheel over the terminal reports nothing new - the window decides', async () => {
    const { box, reported } = mountBox();
    const before = reported.length;
    wheel(box, { deltaY: 200, metaKey: true });
    await flushFrames();
    expect(reported.length).toBe(before);
    expect(reported[reported.length - 1]).toBe(FIT_TO_WINDOW);
  });

  it('a stored override from the gesture days is not read back', () => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '0.5');
    const { reported } = mountBox();
    expect(reported[0]).toBe(FIT_TO_WINDOW);
  });

  it('a plain wheel still reaches the door - it was never a zoom gesture', async () => {
    const { box } = mountBox();
    const event = wheel(box, { deltaY: 200 });
    await flushFrames();
    expect(event.defaultPrevented).toBe(false);
  });
});
