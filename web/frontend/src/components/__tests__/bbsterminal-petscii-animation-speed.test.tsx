/**
 * "The ANSI animated logos play super slow in PETSCII mode" (sysop,
 * 2026-09-02, web 'P' session on the canvas; the same animations are fine
 * on xterm).
 *
 * Root cause, measured (see
 * .superpowers/sdd/2026-09-02-petscii-full-canvas/canvas-animation-speed.md):
 * `startPetsciiDrain` charged an elapsed-time token budget for EVERY
 * PETSCII byte. Both other pacers on this board - xterm's ModemEmulator
 * (`sendThrottled`, escapes written through free) and the server's own
 * screen pacer (`screen.handler.emitWithModem`, same policy) - charge only
 * PRINTABLE characters. A cursor-heavy logo is almost nothing but escapes:
 * `Screens/flt.txt` is 10,963 B of which 9,773 B are cursor moves, and the
 * transducer turns those into a 2.02x-inflated PETSCII cursor walk
 * (22,118 B out) which the canvas then billed at modem speed. Measured:
 * 962 ms on the canvas against 0.05 s of charged bytes on xterm, a 19x
 * gap - and a SECOND pacing source on top of the server's.
 *
 * The drain no longer meters. These tests drive the real BBSTerminal from
 * source (a stale packages/terminal/dist cannot make them pass) with
 * xterm, socket.io and PetsciiCanvas mocked, select the canvas the way the
 * 'P' answer does, and push the real animated logo through the real
 * `ansi-output` seam.
 *
 * MOCK PATHS: the terminal package has its OWN node_modules copy of xterm /
 * socket.io-client - mock the path the component resolves, not the
 * frontend's copy. See bbsterminal-session-font.test.tsx's header.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fs from 'node:fs';
import * as path from 'node:path';

const rec = vi.hoisted(() => ({
  socket: null as any,
  /** Every `machine` prop PetsciiCanvas was rendered with, in order. */
  machines: [] as any[],
}));

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
// The display machine is the thing under measurement, and the real canvas
// needs a rasterizer and a font this environment does not have. Capture the
// machine prop instead; PetsciiCanvas's own painting is covered by
// petscii-canvas-repaint-coalescing.test.tsx and the blank-cell test.
vi.mock('../../../../../packages/terminal/src/petscii/PetsciiCanvas', () => ({
  PetsciiCanvas: (props: any) => {
    if (props.machine && !rec.machines.includes(props.machine)) rec.machines.push(props.machine);
    return null;
  },
}));

import { BBSTerminal } from '../../../../../packages/terminal/src/components/BBSTerminal';
import { AnsiToPetsciiTransducer, PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { FakeSocket } from './helpers/fake-socket';

/** The densest animated logo on the board: 1,180 cursor-move sequences. */
// vitest runs with cwd = web/frontend; the board's Screens/ live at the repo root.
const LOGO = fs.readFileSync(path.resolve(process.cwd(), '../../Screens/flt.txt'), 'latin1');

/** What a fresh transducer + machine make of the whole logo - the oracle. */
function oracleScreen(): { screen: number[]; colorRam: number[]; petsciiBytes: number } {
  const t = new AnsiToPetsciiTransducer();
  const m = new PetsciiMachine();
  const bytes = t.transduce(LOGO);
  m.feed(bytes);
  return {
    screen: Array.from(m.state.screen),
    colorRam: Array.from(m.state.colorRam),
    petsciiBytes: bytes.length,
  };
}

let socket: FakeSocket;

beforeEach(() => {
  rec.machines.length = 0;
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

/** Mount, answer 'P' (the 40x25 resize that selects the canvas), and return
 * the display machine with a byte counter wrapped around its feed. */
function mountCanvasSession() {
  render(<BBSTerminal backendUrl="http://localhost:3001" />);
  act(() => {
    socket.fire('terminal-resize', { cols: 40, rows: 25 });
  });
  const machine = rec.machines[0];
  expect(machine, 'the 40x25 resize must select the canvas surface').toBeTruthy();
  const counter = { bytes: 0 };
  const realFeed = machine.feed.bind(machine);
  machine.feed = (b: Uint8Array | number[]) => {
    counter.bytes += (b as { length: number }).length;
    return realFeed(b);
  };
  return { machine, counter };
}

describe('a cursor-heavy animated logo on the PETSCII canvas', () => {
  it('drains at over 200 KB/s instead of at modem speed', async () => {
    const oracle = oracleScreen();
    // Sanity on the corpus this test is built from - if the logo or the
    // transducer changes shape, the numbers in the report go stale.
    expect(oracle.petsciiBytes).toBeGreaterThan(20000);

    // Fake `performance` too, so the drain's own elapsed-time reading moves
    // with the clock this test controls and the byte count is exact rather
    // than dependent on how fast the machine running the suite is.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    });
    const { counter } = mountCanvasSession();

    await act(async () => {
      socket.fire('ansi-output', LOGO);
      await vi.advanceTimersByTimeAsync(100);
    });

    // 100 ms of budget. The old token-bucket delivered bps/10 * 0.1 =
    // 2,304 bytes of the 22,118 (23 KB/s). Anything at or above the whole
    // logo inside 100 ms is >= 216 KB/s.
    expect(counter.bytes).toBe(oracle.petsciiBytes);
    expect(counter.bytes / 0.1 / 1024).toBeGreaterThan(200);
  });

  it('shows the finished logo, cell for cell, in that time', async () => {
    const oracle = oracleScreen();
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    });
    const { machine } = mountCanvasSession();

    await act(async () => {
      socket.fire('ansi-output', LOGO);
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(Array.from(machine.state.screen)).toEqual(oracle.screen);
    expect(Array.from(machine.state.colorRam)).toEqual(oracle.colorRam);
  });

  it('lands whole when the server splits it into thousands of small messages', async () => {
    // `screen.handler.emitWithModem` emits EVERY escape token as its own
    // socket message once the caller has modem emulation on - flt.txt
    // arrives as 2,604 `ansi-output` events, not one. The drain must not
    // stall on any of them.
    const oracle = oracleScreen();
    const messages: string[] = [];
    const tokenRe = /\x1b\[[0-9;?]*[A-Za-z]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(LOGO)) !== null) {
      if (m.index > last) messages.push(LOGO.slice(last, m.index));
      messages.push(m[0]);
      last = m.index + m[0].length;
    }
    if (last < LOGO.length) messages.push(LOGO.slice(last));
    expect(messages.length).toBeGreaterThan(2000);

    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    });
    const { machine, counter } = mountCanvasSession();

    await act(async () => {
      for (const msg of messages) socket.fire('ansi-output', msg);
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(counter.bytes).toBe(oracle.petsciiBytes);
    expect(Array.from(machine.state.screen)).toEqual(oracle.screen);
  });
});

/**
 * The drain used to be an ASYNC loop, so anything it threw died in a
 * detached promise. It is synchronous now: without a guard, a bad byte
 * would throw straight out of the socket handler that called it - and out
 * of the login-echo path, which runs inside a React event handler, where an
 * uncaught throw unmounts the tree and drops the connection ("pressing P
 * resets the BBS": transport close, then a reconnect inside the grace
 * period). A broken machine must cost the picture, never the session.
 */
describe('a display machine that throws', () => {
  it('does not take the session down, and the next screen still lands', async () => {
    const { machine, counter } = mountCanvasSession();
    const errors: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a); });

    const good = machine.feed;
    machine.feed = () => { throw new Error('bad byte'); };
    expect(() => {
      act(() => { socket.fire('ansi-output', 'HELLO'); });
    }).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);

    // The session is still live: the very next screen reaches the machine.
    machine.feed = good;
    counter.bytes = 0;
    act(() => { socket.fire('ansi-output', 'WORLD'); });
    expect(counter.bytes).toBeGreaterThan(0);
    consoleError.mockRestore();
  });
});
