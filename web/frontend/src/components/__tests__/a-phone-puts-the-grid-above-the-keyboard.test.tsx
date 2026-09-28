/**
 * On a phone the grid sits at the BOTTOM of its band, against the keyboard.
 *
 * Not a taste. iOS draws Safari's address bar OVER the top of the page and
 * reports nothing a layout can read - `visualViewport.offsetTop` stays 0 - so
 * anything the page puts at the top of the band is underneath that bar, and no
 * measurement can find out by how much. The sysop, 2026-09-14, with two
 * screenshots: "the bbs draws under the adress bar", with the first rows of a
 * conference listing half-hidden behind it.
 *
 * An 80-column grid is about 200px tall in a ~580px band on a phone, so there
 * is ~380px of slack either way. Putting it BELOW the grid wastes it on
 * nothing; putting it above spends it exactly where the browser's chrome
 * already is. `centerInHost` is the page's veto - false on a handheld - and it
 * used to mean "no flex at all", which is how the grid ended up at the top.
 *
 * A desktop is unchanged: centred, as it has always been.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

interface FakeTerminalLike {
  options: Record<string, unknown>;
  cols: number;
  rows: number;
  element: HTMLElement | null;
  textarea: HTMLTextAreaElement | null;
}

const rec = vi.hoisted<{ terminals: FakeTerminalLike[]; socket: unknown }>(() => ({
  terminals: [],
  socket: null,
}));

/*
 * MOCK THE PATH THE COMPONENT RESOLVES. The terminal package has its own
 * node_modules copy of xterm and socket.io-client - a bare
 * `vi.mock('@xterm/xterm')` mocks the frontend's copy while BBSTerminal loads
 * the real one.
 */
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
import { FakeSocket } from './helpers/fake-socket';

beforeEach(() => {
  rec.terminals.length = 0;
  rec.socket = new FakeSocket();
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

/** The outer wrapper - the box that decides where the grid sits in the band. */
function mountWrapper(centerInHost: boolean): HTMLElement {
  const { container } = render(
    <BBSTerminal backendUrl="http://localhost:3001" fillParent centerInHost={centerInHost} />,
  );
  return container.firstElementChild as HTMLElement;
}

describe('where the grid sits in the band the page gives it', () => {
  it('sits at the bottom on a handheld, clear of the browser bar', () => {
    const wrapper = mountWrapper(false);
    expect(wrapper.style.display).toBe('flex');
    expect(wrapper.style.alignItems).toBe('flex-end');
  });

  it('is centred horizontally there too, instead of against the left edge', () => {
    const wrapper = mountWrapper(false);
    expect(wrapper.style.justifyContent).toBe('center');
  });

  it('stays centred on a desktop', () => {
    const wrapper = mountWrapper(true);
    expect(wrapper.style.display).toBe('flex');
    expect(wrapper.style.alignItems).toBe('center');
    expect(wrapper.style.justifyContent).toBe('center');
  });
});
