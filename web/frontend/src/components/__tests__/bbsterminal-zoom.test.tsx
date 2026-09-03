/**
 * The terminal zoom override, driven through the real BBSTerminal.
 *
 * The board's default cell size is the FIT - the largest at which the 80x25
 * grid plus its bezel fits the window - computed by the page (see
 * TerminalPage's refit() and terminal-zoom.test.ts). What BBSTerminal owns is
 * the viewer's OVERRIDE: a fraction of that fit, reached by Cmd/Ctrl+wheel or
 * pinch, a bezel-corner drag, or a double-click on the bezel ring, remembered
 * per viewer, and reported back up so the page does the one multiply.
 *
 * These tests prove the WIRING: that a gesture over the box changes the
 * fraction the component reports, that it never reaches the page or the
 * running door, that the component itself does not scale the size it is
 * given, and that hovering the box does not measure layout per pointer
 * sample.
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
function mountBox(props: { fontSize?: number; zoomEnabled?: boolean } = {}): Mounted {
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

function pointer(type: string, point: { x: number; y: number }): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
  });
}

const CORNER = { x: BOX_RECT.right, y: BOX_RECT.bottom };
const CENTRE = {
  x: (BOX_RECT.left + BOX_RECT.right) / 2,
  y: (BOX_RECT.top + BOX_RECT.bottom) / 2,
};
const from = (p: { x: number; y: number }, factor: number) => ({
  x: CENTRE.x + (p.x - CENTRE.x) * factor,
  y: CENTRE.y + (p.y - CENTRE.y) * factor,
});
const BEZEL_POINT = { x: BOX_RECT.left, y: 300 };

describe('the terminal follows the window until the viewer overrides it', () => {
  it('reports fit-to-window on mount when this browser has never overridden', () => {
    const { reported } = mountBox();
    expect(reported[0]).toBe(FIT_TO_WINDOW);
  });

  it('renders the cell size the page hands down, without scaling it itself', async () => {
    const { term } = mountBox({ fontSize: 25.4 });
    expect(rec.ctorArgs[0].fontSize).toBe(25.4);
    await flushFrames();
    expect(term.options.fontSize).toBe(25.4);
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

describe('cmd+wheel over the terminal changes the override and not the page', () => {
  it('a Cmd+wheel down scales the screen below the fit', async () => {
    const { box, reported } = mountBox();
    wheel(box, { deltaY: 200, metaKey: true });
    await flushFrames();
    expect(reported[reported.length - 1]).toBeLessThan(FIT_TO_WINDOW);
  });

  it('a Ctrl+wheel the other way brings it back up towards the fit', async () => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '0.5');
    const { box, reported } = mountBox();
    wheel(box, { deltaY: -200, ctrlKey: true });
    await flushFrames();
    expect(reported[reported.length - 1]).toBeGreaterThan(0.5);
  });

  it('the browser never sees the gesture, so page zoom is untouched over the terminal', () => {
    const { box } = mountBox();
    expect(wheel(box, { deltaY: 200, ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it('a plain wheel is left entirely alone - scrolling and the door still get it', async () => {
    const { box, reported } = mountBox();
    const event = wheel(box, { deltaY: 200 });
    await flushFrames();
    expect(event.defaultPrevented).toBe(false);
    expect(reported).toEqual([FIT_TO_WINDOW]);
  });

  it('the grid stays 80x25 - the cell changed, the terminal did not resize', async () => {
    const { box, term } = mountBox();
    wheel(box, { deltaY: 200, metaKey: true });
    await flushFrames();
    expect(term.cols).toBe(80);
    expect(term.rows).toBe(25);
  });

  it('a burst of pinch deltas costs one reported change, not one per event', async () => {
    const { box, reported } = mountBox();
    for (let i = 0; i < 20; i++) wheel(box, { deltaY: 8, ctrlKey: true });
    await flushFrames();
    // One mount report plus one coalesced gesture report.
    expect(reported.length).toBeLessThanOrEqual(2);
    expect(reported[reported.length - 1]).toBeLessThan(FIT_TO_WINDOW);
  });
});

describe('a corner drag resizes about the centre', () => {
  it('dragging a corner inward scales the screen down in proportion to the distance from the centre', async () => {
    const { box, reported } = mountBox();
    box.dispatchEvent(pointer('pointerdown', CORNER));
    window.dispatchEvent(pointer('pointermove', from(CORNER, 0.5)));
    await flushFrames();
    expect(reported[reported.length - 1]).toBeCloseTo(0.5, 6);
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });

  it('shows the diagonal cursor and fades in the bracket at the grabbed corner only', async () => {
    const { box } = mountBox();
    box.dispatchEvent(pointer('pointerdown', CORNER));
    await flushFrames();
    expect(box.style.cursor).toBe('nwse-resize');
    expect((box.querySelector('[data-zoom-corner="se"]') as HTMLElement).style.opacity).toBe('1');
    expect((box.querySelector('[data-zoom-corner="nw"]') as HTMLElement).style.opacity).toBe('0');
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });

  it('Escape cancels the drag and puts the override back where the drag found it', async () => {
    const { box, reported } = mountBox();
    box.dispatchEvent(pointer('pointerdown', CORNER));
    window.dispatchEvent(pointer('pointermove', from(CORNER, 0.5)));
    await flushFrames();
    expect(reported[reported.length - 1]).toBeCloseTo(0.5, 6);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await flushFrames();
    expect(reported[reported.length - 1]).toBe(FIT_TO_WINDOW);
    expect(box.style.cursor).toBe('');
  });

  it('a press in the middle of the screen is not a drag - it belongs to the BBS', async () => {
    const { box, reported } = mountBox();
    box.dispatchEvent(pointer('pointerdown', { x: 500, y: 300 }));
    window.dispatchEvent(pointer('pointermove', from(CORNER, 0.5)));
    await flushFrames();
    expect(reported).toEqual([FIT_TO_WINDOW]);
  });
});

describe('hovering the box does not measure layout per pointer sample', () => {
  it('reads the rect once on entry and then answers from the cache', async () => {
    const { box, rectReads } = mountBox();
    box.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
    const afterEnter = rectReads();
    for (let i = 0; i < 60; i++) {
      box.dispatchEvent(pointer('pointermove', { x: 400 + i, y: 300 }));
    }
    await flushFrames();
    // A forced synchronous layout per pointer sample is the class of bug
    // behind the DOORMAN freeze; sixty samples must cost zero measurements.
    expect(rectReads()).toBe(afterEnter);
  });

  it('re-measures after the window changes, so the cache cannot go stale', async () => {
    const { box, rectReads } = mountBox();
    box.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
    box.dispatchEvent(pointer('pointermove', { x: 400, y: 300 }));
    const before = rectReads();
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    box.dispatchEvent(pointer('pointermove', { x: 401, y: 300 }));
    expect(rectReads()).toBeGreaterThan(before);
  });
});

describe('double-clicking the bezel cycles the presets and comes home to the window', () => {
  it('walks fit -> three quarters -> half -> home to fit', async () => {
    const { box, reported } = mountBox();
    const dbl = () => box.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: BEZEL_POINT.x, clientY: BEZEL_POINT.y,
    }));
    dbl(); await flushFrames();
    expect(reported[reported.length - 1]).toBe(0.75);
    dbl(); await flushFrames();
    expect(reported[reported.length - 1]).toBe(0.5);
    dbl(); await flushFrames();
    expect(reported[reported.length - 1]).toBe(FIT_TO_WINDOW);
  });

  it('a double-click on the SCREEN is left to the BBS - it does not cycle', async () => {
    const { box, reported } = mountBox();
    box.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: 500, clientY: 300,
    }));
    await flushFrames();
    expect(reported).toEqual([FIT_TO_WINDOW]);
  });
});

describe('the override is remembered, and only when the viewer made one', () => {
  it('reports the remembered fraction on mount, before any gesture', () => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '0.5');
    const { reported } = mountBox();
    expect(reported[0]).toBe(0.5);
  });

  it('writes nothing on a mount that changed nothing', async () => {
    mountBox();
    await flushFrames();
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBeNull();
  });

  it('remembers a fraction the viewer reached by gesture', async () => {
    const { box } = mountBox();
    box.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: BEZEL_POINT.x, clientY: BEZEL_POINT.y,
    }));
    await flushFrames();
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBe('0.75');
  });

  it('ignores a junk remembered fraction rather than opening the board in it', () => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, 'huge');
    const { reported } = mountBox();
    expect(reported[0]).toBe(FIT_TO_WINDOW);
  });
});

describe('a handheld session has no override at all', () => {
  it('ignores every gesture and never touches the fraction the desk chose', async () => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '0.75');
    const { box, reported } = mountBox({ zoomEnabled: false });
    expect(reported[0]).toBe(FIT_TO_WINDOW);
    wheel(box, { deltaY: 200, metaKey: true });
    box.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: BEZEL_POINT.x, clientY: BEZEL_POINT.y,
    }));
    box.dispatchEvent(pointer('pointerdown', CORNER));
    window.dispatchEvent(pointer('pointermove', from(CORNER, 0.5)));
    await flushFrames();
    expect(reported).toEqual([FIT_TO_WINDOW]);
    // The desktop's remembered choice is still there, unharmed.
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBe('0.75');
  });
});
