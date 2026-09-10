/**
 * Teletext session mode (T answer at the graphics prompt, `texttv-mode`
 * event): the terminal swaps to the TDAText face with the teletext
 * palette, owns the look until the mode ends, and restores afterwards
 * without polluting the pre-login font cache.
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
    familyWrites: string[] = [];
    textarea: HTMLTextAreaElement | null = null;
    element: HTMLElement | null = null;
    cols = 80;
    rows = 25;
    constructor(opts: any) {
      rec.ctorArgs.push({ ...opts });
      const { fontFamily, ...rest } = opts ?? {};
      let family = fontFamily;
      this.options = { ...rest };
      const writes = this.familyWrites;
      Object.defineProperty(this.options, 'fontFamily', {
        enumerable: true,
        get: () => family,
        set: (v: string) => { family = v; writes.push(v); },
      });
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
import {
  FONT_CACHE_KEY,
  TELETEXT_FONT,
  fontFamilyFor,
} from '../../../../../packages/terminal/src/utils/session-font';
import { XTERM_CONFIG } from '../../../../../packages/terminal/src/utils/terminal-utils';
import { FakeSocket } from './helpers/fake-socket';

let socket: FakeSocket;

beforeEach(() => {
  rec.ctorArgs.length = 0;
  rec.terminals.length = 0;
  socket = new FakeSocket();
  rec.socket = socket;
  window.localStorage.clear();
  document.cookie = 'bbs_font=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
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

function mount() {
  return render(<BBSTerminal backendUrl="http://localhost:3001" />);
}

/** The default theme's bright red vs the teletext theme's: the marker that
 * tells the two palettes apart without screenshotting. */
const DEFAULT_BRIGHT_RED = XTERM_CONFIG.theme.brightRed; // #ff8080
const TELETEXT_BRIGHT_RED = XTERM_CONFIG.teletextTheme.brightRed; // #ff0000

describe('texttv-mode on', () => {
  it('swaps the face to TDAText and the palette to teletext colours', async () => {
    mount();
    await act(async () => {
      socket.fire('texttv-mode', { enabled: true });
    });
    const term = rec.terminals[0];
    expect(term.options.fontFamily).toBe(fontFamilyFor(TELETEXT_FONT));
    expect(term.options.theme.brightRed).toBe(TELETEXT_BRIGHT_RED);
    expect(term.options.theme.background).toBe('#000000');
  });

  it('does not pollute the pre-login font cache', async () => {
    mount();
    await act(async () => {
      socket.fire('texttv-mode', { enabled: true });
    });
    // The next connect must open in the board font, not TDAText.
    expect(window.localStorage.getItem(FONT_CACHE_KEY)).toBeNull();
  });

  it('a font-preference arriving mid-mode does not clobber the look', async () => {
    mount();
    await act(async () => {
      socket.fire('texttv-mode', { enabled: true });
      socket.fire('font-preference', { font: 'Topaz_a500' });
    });
    expect(rec.terminals[0].options.fontFamily).toBe(fontFamilyFor(TELETEXT_FONT));
  });

  it('a set-font pick arriving mid-mode waits for the mode to end', async () => {
    mount();
    await act(async () => {
      socket.fire('texttv-mode', { enabled: true });
      socket.fire('set-font', 'Topaz_a500');
    });
    expect(rec.terminals[0].options.fontFamily).toBe(fontFamilyFor(TELETEXT_FONT));
  });
});

describe('texttv-mode off', () => {
  it('restores the cached face and the previous palette', async () => {
    window.localStorage.setItem(FONT_CACHE_KEY, 'Topaz_a500');
    mount();
    await act(async () => {
      socket.fire('texttv-mode', { enabled: true });
    });
    expect(rec.terminals[0].options.theme.brightRed).toBe(TELETEXT_BRIGHT_RED);
    await act(async () => {
      socket.fire('texttv-mode', { enabled: false });
    });
    const term = rec.terminals[0];
    expect(term.options.fontFamily).toBe(fontFamilyFor('Topaz_a500'));
    expect(term.options.theme.brightRed).toBe(DEFAULT_BRIGHT_RED);
  });

  it('a disconnect ends the mode so the next login owns the font again', async () => {
    mount();
    await act(async () => {
      socket.fire('texttv-mode', { enabled: true });
    });
    expect(rec.terminals[0].options.fontFamily).toBe(fontFamilyFor(TELETEXT_FONT));
    await act(async () => {
      socket.fire('disconnect', 'transport close');
    });
    await act(async () => {
      socket.fire('font-preference', { font: 'Topaz_a500' });
    });
    expect(rec.terminals[0].options.fontFamily).toBe(fontFamilyFor('Topaz_a500'));
  });
});
