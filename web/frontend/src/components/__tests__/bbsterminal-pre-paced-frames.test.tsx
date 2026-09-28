/**
 * The `ansi-output` seam carries the server's pacing decision.
 *
 * A screen wipe is paced by the SERVER (frame delays, one emit per frame,
 * `screen.handler`'s play loop). The client pacer used to meter those bytes
 * a second time, so at a real modem setting every frame arrived a fraction
 * at a time - measured 17.4 s at 2400 for a 625 ms wipe (ledger
 * `.superpowers/sdd/2026-09-03-wipe-client-pacing/progress.md`).
 *
 * The server now marks such a payload with the second `ansi-output`
 * argument (`PRE_PACED`, web/backend/src/utils/output-pacing.ts). This
 * pins the CLIENT half of that contract end to end: the real BBSTerminal
 * from source, the real ModemEmulator behind it, the real `ansi-output`
 * handler, a fake xterm recording what a frame actually looks like when it
 * lands.
 *
 * MOCK PATHS: the terminal package has its OWN node_modules copy of xterm /
 * socket.io-client - mock the path the component resolves, not the
 * frontend's copy. See bbsterminal-session-font.test.tsx's header.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const rec = vi.hoisted(() => ({
  socket: null as any,
  /** Every write the terminal received, in order. */
  writes: [] as string[],
}));

vi.mock('../../../../../packages/terminal/node_modules/@xterm/xterm', () => {
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
    write(data: string) { rec.writes.push(data); }
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

/** A wipe frame: its own clear-and-home, a full paint, an attribute reset. */
const FRAME = '\x1b[?25l\x1b[2J\x1b[H' + 'W'.repeat(1600) + '\x1b[0m';

let socket: FakeSocket;

beforeEach(() => {
  rec.writes.length = 0;
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
  vi.useRealTimers();
  cleanup();
});

function mountAtBaud(bps: number) {
  render(<BBSTerminal backendUrl="http://localhost:3001" />);
  act(() => {
    socket.fire('modem-speed', bps);
  });
  rec.writes.length = 0; // drop the mount's own banner writes
}

const FAKE_CLOCK = {
  toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] as const,
};

/*
 * At a real modem speed the server meters the caller (audit item 17,
 * 2026-09-28), so the browser's pacer only runs at MAX - the 230400 bps
 * soft cap, 23,040 bytes a second. That is where PRE_PACED still matters:
 * at 23 KB/s a 1,600-character frame costs ~70 ms, and a wipe is 26 of them.
 */
describe('one pacer per web caller', () => {
  it('at 2400 baud the browser writes what arrives - the server already metered it', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_CLOCK.toFake] });
    mountAtBaud(2400);

    await act(async () => {
      socket.fire('ansi-output', FRAME);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(`metered a second time: ${rec.writes.join('') !== FRAME}`).toBe('metered a second time: false');
  });

  it("replays the server's spacing when the network bunches its chunks", async () => {
    vi.useFakeTimers({ toFake: [...FAKE_CLOCK.toFake] });
    mountAtBaud(2400);

    await act(async () => {
      socket.fire('ansi-output', 'a', { pacedAt: 1000 });
      await vi.advanceTimersByTimeAsync(90);
      // Sent 10 ms apart by the server, delivered together.
      for (let i = 1; i <= 9; i++) socket.fire('ansi-output', String(i), { pacedAt: 1000 + i * 10 });
      await vi.advanceTimersByTimeAsync(0);
    });
    const atArrival = rec.writes.join('');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(`bunch painted on arrival: ${atArrival === 'a123456789'}`).toBe('bunch painted on arrival: false');
    expect(rec.writes.join('')).toBe('a123456789');
  });
});

describe('a pre-paced frame over the ansi-output seam, at MAX', () => {
  it('lands whole instead of being drip-fed through the soft cap', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_CLOCK.toFake] });
    mountAtBaud(0);

    await act(async () => {
      socket.fire('ansi-output', FRAME, { prePaced: true });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(rec.writes.join('')).toBe(FRAME);
    expect(rec.writes.filter((w) => w === FRAME)).toHaveLength(1);
  });

  it('an unmarked payload is still paced by the soft cap', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_CLOCK.toFake] });
    mountAtBaud(0);

    await act(async () => {
      socket.fire('ansi-output', FRAME);
      await vi.advanceTimersByTimeAsync(20);
    });

    const delivered = (rec.writes.join('').match(/W/g) || []).length;
    expect(`whole frame delivered in 20 ms: ${delivered === 1600}`)
      .toBe('whole frame delivered in 20 ms: false');
    expect(`something delivered in 20 ms: ${delivered > 0}`)
      .toBe('something delivered in 20 ms: true');
  });

  it('a pre-paced frame does not overtake text queued before it', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_CLOCK.toFake] });
    mountAtBaud(0);

    await act(async () => {
      socket.fire('ansi-output', 'T'.repeat(2304)); // 100 ms of text at the soft cap
      socket.fire('ansi-output', FRAME, { prePaced: true });
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(`frame overtook queued text: ${rec.writes.join('').includes('WWWW')}`)
      .toBe('frame overtook queued text: false');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    const out = rec.writes.join('');
    expect(`text delivered: ${(out.match(/T/g) || []).length}`).toBe('text delivered: 2304');
    expect(`frame after the text: ${out.indexOf('W') > out.lastIndexOf('T')}`)
      .toBe('frame after the text: true');
  });
});
