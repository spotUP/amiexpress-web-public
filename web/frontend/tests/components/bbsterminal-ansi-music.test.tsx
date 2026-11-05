/**
 * ANSI music and the display bell reach the speaker through the real
 * BBSTerminal: `ansi-output` -> AnsiMusicStream -> ModemEmulator -> xterm's
 * OSC 9998 marker -> MediaHandler.playMusic; a BEL -> onBell -> beep.
 *
 * MOCK PATHS: see bbsterminal-pre-paced-frames.test.tsx's header.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const rec = vi.hoisted(() => ({
  socket: null as any,
  /** Every write the terminal received, in order. */
  writes: [] as string[],
  /** xterm's OSC handlers, by identifier, as the component registered them. */
  osc: new Map<number, (payload: string) => boolean>(),
  bell: null as null | (() => void),
}));

vi.mock('../../../../packages/terminal/node_modules/@xterm/xterm', () => {
  class FakeTerminal {
    reset() {}
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
    parser = {
      registerOscHandler: (id: number, fn: (payload: string) => boolean) => {
        rec.osc.set(id, fn);
        return { dispose() {} };
      },
    };
    onBell(fn: () => void) { rec.bell = fn; return { dispose() {} }; }
    write(data: string) {
      rec.writes.push(data);
      // As xterm's parser does: an OSC runs when the write reaches it, a BEL rings.
      const re = /\x1b\](\d+);([^\x07]*)\x07/g;
      for (let m; (m = re.exec(data)); ) rec.osc.get(Number(m[1]))?.(m[2]);
      if (data.replace(re, '').includes('\x07')) rec.bell?.();
    }
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
vi.mock('../../../../packages/terminal/node_modules/@xterm/addon-canvas', () => ({
  CanvasAddon: class { activate() {} dispose() {} },
}));
vi.mock('../../../../packages/terminal/node_modules/@xterm/addon-fit', () => ({
  FitAddon: class {
    activate() {}
    fit() {}
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
import { MediaHandler } from '../../../../packages/terminal/src/utils/media-handler';


let socket: FakeSocket;

beforeEach(() => {
  rec.writes.length = 0;
  rec.osc.clear();
  rec.bell = null;
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  cleanup();
});

function mount() {
  render(<BBSTerminal backendUrl="http://localhost:3001" />);
  act(() => {
    socket.fire('modem-speed', 0);
  });
  rec.writes.length = 0;
}

describe('ANSI music in the web terminal', () => {
  it('plays the tune where it stood in the text, and shows none of its bytes', async () => {
    const play = vi.spyOn(MediaHandler.prototype, 'playMusic').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    mount();

    await act(async () => {
      // Split mid-string, as the socket may deliver it.
      socket.fire('ansi-output', 'Before\x1b[MFT120O4L8E');
      socket.fire('ansi-output', 'D#E\x0eAfter');
      await vi.advanceTimersByTimeAsync(100);
    });

    const shown = rec.writes.join('').replace(/\x1b\]9998;[^\x07]*\x07/g, '');
    expect(shown).toBe('BeforeAfter');
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0][0].map((e) => e.hz)).toEqual([1319, 1245, 1319]);
  });

  it('a BEL rings the beep', async () => {
    const beep = vi.spyOn(MediaHandler.prototype, 'beep').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    mount();

    await act(async () => {
      socket.fire('ansi-output', 'Ring\x07');
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(beep).toHaveBeenCalledTimes(1);
  });
});
