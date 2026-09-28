/**
 * A web caller in a door is told before a deploy drops them.
 *
 * The deploy counts down for a minute (`system:notice`, from
 * web/backend/src/services/restart-notice.service.ts), sending it to a door
 * session as an event rather than as screen bytes. The browser had no listener
 * for it, so a sysop in a door was dropped by a restart that had warned
 * nobody (2026-09-28). Real BBSTerminal from source, fake socket and xterm -
 * the same seams bbsterminal-pre-paced-frames.test.tsx uses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, screen } from '@testing-library/react';

const rec = vi.hoisted(() => ({
  socket: null as any,
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


let socket: FakeSocket;

beforeEach(() => {
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

describe('a notice from the board, for a caller whose screen a door owns', () => {
  it('shows the restart countdown over the terminal, and nothing is written into the door screen', () => {
    render(<BBSTerminal backendUrl="http://localhost:3001" />);
    rec.writes.length = 0;

    act(() => {
      socket.fire('system:notice', {
        kind: 'restart',
        seconds: 30,
        message: 'SYSTEM UPDATE - restarting in 30 seconds. You will be reconnected automatically.',
      });
    });

    expect(screen.getByRole('alert').textContent).toContain('restarting in 30 seconds');
    expect(rec.writes.join('')).not.toContain('restarting');
  });

  it("shows a sysop's system-message line too, without its colour codes", () => {
    render(<BBSTerminal backendUrl="http://localhost:3001" />);

    act(() => {
      socket.fire('system-message', { text: '\r\n\x1b[31mThe sysop is disconnecting you.\x1b[0m\r\n' });
    });

    expect(screen.getByRole('alert').textContent).toBe('The sysop is disconnecting you.');
  });
});
