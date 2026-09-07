/**
 * TP-9b of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`: the
 * browser has no login line editor left.
 *
 * IT USED TO HAVE ONE, and that was the whole problem: `login-key-machine.ts`
 * collected a username and a password, echoed them, masked them, ran the
 * new-user R/C question, and posted finished lines back over
 * `check-username` / `login` / `new-user-response`. The server had the same
 * machine for telnet and SSH. Two implementations, and they diverged - the
 * component's own `injectInput` copy answered the new-user prompt differently
 * from `term.onKey`'s, so the on-screen keyboard and a desktop key gave
 * different answers to the same question.
 *
 * TP-9a made the server drive the prompt for every transport. This suite is
 * the other half: a keystroke at the login prompt is ordinary `command` input,
 * echoed by the SERVER, on every input surface the browser has.
 *
 * The mock paths are the terminal package's own node_modules, for the reason
 * bbsterminal-session-font.test.tsx records: a bare `vi.mock('@xterm/xterm')`
 * mocks the frontend's copy while the component loads its own.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const rec = vi.hoisted(() => ({
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
    /** Everything the COMPONENT wrote to the screen locally. */
    writes: string[] = [];
    /** The callbacks the component registered. */
    dataHandlers: Array<(data: string) => void> = [];
    keyHandlers: Array<(e: { key: string }) => void> = [];
    constructor(opts: any) {
      this.options = { ...(opts ?? {}) };
      rec.terminals.push(this);
    }
    open(el: HTMLElement) {
      this.element = el;
      this.textarea = document.createElement('textarea');
      el.appendChild(this.textarea);
    }
    loadAddon() {}
    onData(cb: (data: string) => void) { this.dataHandlers.push(cb); return { dispose() {} }; }
    onKey(cb: (e: { key: string }) => void) { this.keyHandlers.push(cb); return { dispose() {} }; }
    attachCustomKeyEventHandler() {}
    write(text: string) { this.writes.push(text); }
    writeln(text: string) { this.writes.push(text + '\r\n'); }
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

let socket: FakeSocket;

beforeEach(() => {
  rec.terminals.length = 0;
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
afterEach(() => cleanup());

function mount() {
  const handle = { current: null as any };
  const view = render(<BBSTerminal ref={handle} backendUrl="http://localhost:3001" />);
  return { view, handle, term: () => rec.terminals[0] };
}

/** Every `command` this session sent, in order. */
function commandsSent(s: FakeSocket): string[] {
  return s.emitted.filter((e) => e.event === 'command').map((e) => String(e.args[0]));
}

describe('the browser relays login keystrokes instead of editing them', () => {
  it('a keystroke at the login prompt goes to the server as a command, with no local echo', () => {
    const { term } = mount();
    act(() => { socket.fire('prompt-login'); });

    const before = term().writes.length;
    act(() => { term().dataHandlers.forEach((cb: (data: string) => void) => cb('s')); });

    expect(commandsSent(socket)).toEqual(['s']);
    // The SERVER echoes. Nothing was written to the screen from here.
    expect(term().writes.length).toBe(before);
  });

  it('the whole username reaches the server one key at a time, Enter included', () => {
    const { term } = mount();
    act(() => { socket.fire('prompt-login'); });
    act(() => {
      for (const ch of 'sysop\r') term().dataHandlers.forEach((cb: (data: string) => void) => cb(ch));
    });
    expect(commandsSent(socket)).toEqual(['s', 'y', 's', 'o', 'p', '\r']);
  });

  it('the mobile keyboard and the canvas take the same path', () => {
    const { handle, term } = mount();
    act(() => { socket.fire('prompt-login'); });

    const before = term().writes.length;
    act(() => { handle.current?.injectInput('C'); });

    // The path that used to answer the new-user prompt differently from
    // term.onKey's copy now does the one thing.
    expect(commandsSent(socket)).toEqual(['C']);
    expect(term().writes.length).toBe(before);
  });

  it('a masked prompt still writes nothing locally - the server sends the stars', () => {
    const { term } = mount();
    act(() => { socket.fire('prompt-login'); });
    act(() => { socket.fire('mask-input', true); });

    const before = term().writes.length;
    act(() => { term().dataHandlers.forEach((cb: (data: string) => void) => cb('p')); });

    expect(commandsSent(socket)).toEqual(['p']);
    expect(term().writes.length).toBe(before);

    // And the server's own star is what appears.
    act(() => { socket.fire('ansi-output', '*'); });
    expect(term().writes.join('')).toContain('*');
  });

  it('login-success still leaves the login view and still seeds the session font', () => {
    mount();
    act(() => {
      socket.fire('login-success', { user: { id: 1, username: 'Sysop' }, token: 'jwt-token' });
    });

    // The ordering this task could have broken: the font preference is asked
    // for AFTER login-success, and session-font.ts is the single owner.
    expect(socket.didEmit('get-font-preference')).toBe(true);
    expect(sessionStorage.getItem('bbs_auth_token')).toBe('jwt-token');
  });

  it('the browser never posts credentials any more', () => {
    const { term } = mount();
    act(() => { socket.fire('prompt-login'); });
    act(() => {
      for (const ch of 'sysop\rsecret\r') term().dataHandlers.forEach((cb: (data: string) => void) => cb(ch));
    });

    // A `login` with a username and a password is the retired arm. The only
    // `login` this client may send carries a TOKEN.
    const logins = socket.emitted.filter((e) => e.event === 'login');
    for (const login of logins) {
      expect(Object.keys((login.args[0] ?? {}) as Record<string, unknown>)).toEqual(['token']);
    }
    // And none of the retired events exists any more.
    for (const retired of ['check-username', 'new-user-response', 'password-reset-input', 'forced-pwd-change-input']) {
      expect({ retired, sent: socket.emitted.some((e) => e.event === retired) })
        .toEqual({ retired, sent: false });
    }
  });
});
