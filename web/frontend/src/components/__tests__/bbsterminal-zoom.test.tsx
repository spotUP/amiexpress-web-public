/**
 * The terminal zoom, driven through the real BBSTerminal.
 *
 * The sysop asked for a real zoom on the fixed 80x25 screen: the CELL SIZE
 * changes, never a CSS transform, and the bezelled box grows or shrinks
 * about its centre with the grid still 80x25. Three ways in - Cmd/Ctrl+wheel
 * and trackpad pinch over the terminal, a drag from a bezel corner, a
 * double-click on the bezel ring - and a per-viewer memory in localStorage.
 *
 * The pure arithmetic lives in terminal-zoom.test.ts. These tests prove the
 * WIRING: that a gesture over the box reaches xterm's cell size, that it
 * does not reach the page or the running door, and that an unzoomed session
 * still renders the box the board has always rendered.
 *
 * NOTE ON THE MOCK PATHS: the terminal package has its OWN node_modules copy
 * of xterm / socket.io-client, a different module id from web/frontend's - a
 * bare `vi.mock('@xterm/xterm')` mocks the frontend's copy while BBSTerminal
 * loads the real one. Mock the path the component resolves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const rec = vi.hoisted(() => ({
  ctorArgs: [] as any[],
  terminals: [] as any[],
  socket: null as any,
}));

vi.mock('../../../../../packages/terminal/node_modules/@xterm/xterm', () => {
  class FakeTerminal {
    options: Record<string, any>;
    textarea: HTMLTextAreaElement | null = null;
    element: HTMLElement | null = null;
    cols = 80;
    rows = 25;
    constructor(opts: any) {
      rec.ctorArgs.push({ ...opts });
      this.options = { ...opts };
      rec.terminals.push(this);
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
import { ZOOM_STORAGE_KEY } from '../../../../../packages/terminal/src/utils/terminal-zoom';
import { FakeSocket } from './helpers/fake-socket';

/** The desktop board's own box: 960 wide, 632 tall, sitting on the page. */
const BOX_RECT = { left: 100, top: 50, right: 1060, bottom: 682, width: 960, height: 632, x: 100, y: 50 };

beforeEach(() => {
  rec.ctorArgs.length = 0;
  rec.terminals.length = 0;
  rec.socket = new FakeSocket();
  window.localStorage.clear();
  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class {
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

/** The bezelled terminal box - BBSTerminal's outer wrapper's only child. */
function mountBox(): { box: HTMLElement; term: any } {
  const { container } = render(<BBSTerminal backendUrl="http://localhost:3001" />);
  const box = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
  // jsdom lays nothing out, so the gestures need a rect to measure against.
  box.getBoundingClientRect = () => ({ ...BOX_RECT, toJSON: () => BOX_RECT }) as DOMRect;
  return { box, term: rec.terminals[0] };
}

/**
 * The zoom gestures coalesce to one re-measure per animation frame, and the
 * state change that follows re-renders the terminal. Two frames covers both.
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

describe('cmd+wheel over the terminal changes the cell size and not the page', () => {
  it('a Cmd+wheel over the box zooms the cell size in', async () => {
    const { box, term } = mountBox();
    const before = term.options.fontSize;
    wheel(box, { deltaY: -120, metaKey: true });
    await flushFrames();
    expect(term.options.fontSize).toBeGreaterThan(before);
  });

  it('a Ctrl+wheel the other way zooms the cell size out', async () => {
    const { box, term } = mountBox();
    const before = term.options.fontSize;
    wheel(box, { deltaY: 200, ctrlKey: true });
    await flushFrames();
    expect(term.options.fontSize).toBeLessThan(before);
  });

  it('the browser never sees the gesture, so page zoom is untouched over the terminal', () => {
    const { box } = mountBox();
    const event = wheel(box, { deltaY: -120, ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('a plain wheel is left entirely alone - scrolling and the door still get it', async () => {
    const { box, term } = mountBox();
    const before = term.options.fontSize;
    const event = wheel(box, { deltaY: -120 });
    await flushFrames();
    expect(event.defaultPrevented).toBe(false);
    expect(term.options.fontSize).toBe(before);
  });

  it('the grid stays 80x25 - the cell grew, the terminal did not resize', async () => {
    const { box, term } = mountBox();
    wheel(box, { deltaY: -120, metaKey: true });
    await flushFrames();
    expect(term.cols).toBe(80);
    expect(term.rows).toBe(25);
  });

  it('a burst of pinch deltas costs one cell-size change, not one per event', async () => {
    const { box, term } = mountBox();
    let writes = 0;
    let size = term.options.fontSize;
    Object.defineProperty(term.options, 'fontSize', {
      configurable: true,
      enumerable: true,
      get: () => size,
      set: (v: number) => { writes++; size = v; },
    });
    for (let i = 0; i < 20; i++) wheel(box, { deltaY: -8, ctrlKey: true });
    await flushFrames();
    expect(writes).toBeLessThanOrEqual(2);
    expect(size).toBeGreaterThan(16);
  });
});

describe('the fixed box at 1x is byte-identical to today', () => {
  it('renders exactly the box the board has always rendered when nothing is zoomed', () => {
    const { box } = mountBox();
    expect(box.style.maxWidth).toBe('960px');
    expect(box.style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(box.style.padding).toBe('var(--bbs-terminal-bezel, 16px)');
    expect(box.style.borderRadius).toBe('var(--bbs-terminal-radius, 12px)');
    expect(box.style.boxSizing).toBe('border-box');
    expect(box.style.overflow).toBe('hidden');
    // No cursor and no visible corner chrome until a pointer reaches a corner.
    expect(box.style.cursor).toBe('');
    const marks = box.querySelectorAll('[data-zoom-corner]');
    expect(marks.length).toBe(4);
    for (const mark of marks) expect((mark as HTMLElement).style.opacity).toBe('0');
  });

  it('opens the terminal at the page base cell size when there is no stored zoom', () => {
    mountBox();
    expect(rec.ctorArgs[0].fontSize).toBe(16);
  });
});

describe('double-clicking the bezel cycles the presets', () => {
  it('a double-click on the padding ring steps up to the next preset', async () => {
    const { box, term } = mountBox();
    box.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: BOX_RECT.left, clientY: 300,
    }));
    await flushFrames();
    // 1x -> 1.5x on a 16px base.
    expect(term.options.fontSize).toBe(24);
    expect(box.style.maxWidth).toBe('1440px');
  });

  it('walks the whole ladder and comes home to the picker size', async () => {
    const { box, term } = mountBox();
    const dbl = () => box.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: BOX_RECT.left, clientY: 300,
    }));
    dbl(); await flushFrames();
    expect(term.options.fontSize).toBe(24);
    dbl(); await flushFrames();
    expect(term.options.fontSize).toBe(32);
    dbl(); await flushFrames();
    expect(term.options.fontSize).toBe(16);
    expect(box.style.maxWidth).toBe('960px');
  });

  it('a double-click on the SCREEN is left to the BBS - it does not cycle', async () => {
    const { box, term } = mountBox();
    box.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: 500, clientY: 300,
    }));
    await flushFrames();
    expect(term.options.fontSize).toBe(16);
  });
});

describe('a corner drag resizes about the centre', () => {
  const centre = {
    x: (BOX_RECT.left + BOX_RECT.right) / 2,
    y: (BOX_RECT.top + BOX_RECT.bottom) / 2,
  };
  const corner = { x: BOX_RECT.right, y: BOX_RECT.bottom };
  const outward = (factor: number) => ({
    x: centre.x + (corner.x - centre.x) * factor,
    y: centre.y + (corner.y - centre.y) * factor,
  });

  function grab(box: HTMLElement): void {
    box.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true, cancelable: true, clientX: corner.x, clientY: corner.y,
    }));
  }
  function move(point: { x: number; y: number }): void {
    window.dispatchEvent(new MouseEvent('pointermove', {
      bubbles: true, clientX: point.x, clientY: point.y,
    }));
  }

  it('dragging a corner outward grows the cell size in proportion to the distance from the centre', async () => {
    const { box, term } = mountBox();
    grab(box);
    move(outward(1.5));
    await flushFrames();
    expect(term.options.fontSize).toBe(24); // 16 * 1.5
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });

  it('shows the diagonal cursor and fades in the bracket at the grabbed corner only', async () => {
    const { box } = mountBox();
    grab(box);
    await flushFrames();
    expect(box.style.cursor).toBe('nwse-resize');
    const lit = box.querySelector('[data-zoom-corner="se"]') as HTMLElement;
    const dark = box.querySelector('[data-zoom-corner="nw"]') as HTMLElement;
    expect(lit.style.opacity).toBe('1');
    expect(dark.style.opacity).toBe('0');
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });

  it('Escape cancels the drag and puts the cell size back where the drag found it', async () => {
    const { box, term } = mountBox();
    grab(box);
    move(outward(2));
    await flushFrames();
    expect(term.options.fontSize).toBe(32);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await flushFrames();
    expect(term.options.fontSize).toBe(16);
    expect(box.style.cursor).toBe('');
  });

  it('a press in the middle of the screen is not a drag - it belongs to the BBS', async () => {
    const { box, term } = mountBox();
    box.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true, cancelable: true, clientX: 500, clientY: 300,
    }));
    move(outward(2));
    await flushFrames();
    expect(term.options.fontSize).toBe(16);
  });
});

describe('the canvas box grows with the zoom so the atlas re-scales', () => {
  /**
   * A 'P' session draws on PetsciiCanvas, which measures its PARENT and
   * renders the backing store at the smallest integer scale that covers the
   * fit (petscii/PetsciiCanvas.tsx). The atlas itself is built 1:1 with the
   * native 8px C64 cell and never rebuilt, so what a zoom has to move is the
   * BOX the canvas measures - and that is the same box cap the ANSI screen
   * uses, which is why one zoom owner serves both surfaces.
   */
  it('the box cap the canvas measures scales with the zoom, and is 960px at 1x', async () => {
    const { box } = mountBox();
    expect(box.style.maxWidth).toBe('960px');
    wheel(box, { deltaY: -400, metaKey: true });
    await flushFrames();
    const zoomed = Number.parseFloat(box.style.maxWidth);
    expect(zoomed).toBeGreaterThan(960);
  });
});

describe('a P session keeps its zoom', () => {
  it('opens the terminal at the remembered zoom, before any gesture', () => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '2');
    mountBox();
    expect(rec.ctorArgs[0].fontSize).toBe(32);
  });

  it('remembers a zoom reached by gesture for the next session', async () => {
    const { box } = mountBox();
    wheel(box, { deltaY: -400, metaKey: true });
    await flushFrames();
    // The write trails the last change of a gesture rather than running once
    // per animation frame - wait past that.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    const stored = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(Number.parseFloat(stored as string)).toBeGreaterThan(1);
  });

  it('ignores a junk remembered zoom rather than opening the board in it', () => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, 'huge');
    mountBox();
    expect(rec.ctorArgs[0].fontSize).toBe(16);
  });
});
