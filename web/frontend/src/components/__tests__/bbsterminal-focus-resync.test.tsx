/**
 * xterm's own idea of focus, resynced when the window comes back.
 *
 * `term.focus()` focuses the helper textarea. Doing that while the WINDOW is
 * inactive - a cold load with the viewer in another window, or with devtools
 * open - sets `document.activeElement` without firing a `focus` event, so
 * xterm never learns it is focused and `.xterm` never gets the `focus` class.
 *
 * xterm adds `xterm-cursor-blink` only when IT believes it is focused, and
 * paints the inactive cursor otherwise. The board therefore opened with a
 * cursor that neither blinked nor looked active until the screen was clicked:
 * "the cursor changed from red to white", "the cursor is not blinking either"
 * (sysop, 2026-09-14). Their console settled it - the textarea held
 * document focus while `.xterm` carried no `focus` class:
 *
 *   > document.activeElement.className   -> "xterm-helper-textarea"
 *   > document.querySelector('.xterm').classList.contains('focus') -> false
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const rec = vi.hoisted(() => ({ terminals: [] as any[], socket: null as any }));

vi.mock('../../../../../packages/terminal/node_modules/@xterm/xterm', () => {
  class FakeTerminal {
    options: Record<string, any>;
    textarea: HTMLTextAreaElement | null = null;
    element: HTMLElement | null = null;
    cols = 80;
    rows = 25;
    /** Every blur()/focus() pair the component asks for, in order. */
    focusCalls: string[] = [];
    constructor(opts: any) { this.options = { ...opts }; rec.terminals.push(this); }
    open(el: HTMLElement) {
      // The shape xterm builds: a `.xterm` element holding a helper textarea,
      // and the `focus` class is what says xterm believes it is focused.
      this.element = document.createElement('div');
      this.element.className = 'xterm';
      this.textarea = document.createElement('textarea');
      this.textarea.className = 'xterm-helper-textarea';
      this.element.appendChild(this.textarea);
      el.appendChild(this.element);
    }
    focus() {
      this.focusCalls.push('focus');
      // The browser's own behaviour, and the whole trap: focusing an element
      // that is ALREADY document.activeElement fires no focus event, so
      // xterm never learns. Only a real transition sets the class.
      const already = document.activeElement === this.textarea;
      this.textarea?.focus();
      if (!already && document.hasFocus()) this.element?.classList.add('focus');
    }
    blur() {
      this.focusCalls.push('blur');
      // Really leaves the element, which is what makes the following focus()
      // a real transition rather than another no-op.
      this.textarea?.blur();
      this.element?.classList.remove('focus');
    }
    loadAddon() {} onData() { return { dispose() {} }; } onKey() { return { dispose() {} }; }
    attachCustomKeyEventHandler() {} write() {} writeln() {} input() {} refresh() {}
    reset() {} resize() {} clearSelection() {} selectAll() {} getSelection() { return ''; }
    dispose() {}
  }
  return { Terminal: FakeTerminal };
});
vi.mock('../../../../../packages/terminal/node_modules/@xterm/addon-canvas', () => ({
  CanvasAddon: class { activate() {} dispose() {} },
}));
vi.mock('../../../../../packages/terminal/node_modules/@xterm/addon-fit', () => ({
  FitAddon: class { activate() {} fit() {} proposeDimensions() { return { cols: 80, rows: 25 }; } dispose() {} },
}));
vi.mock('../../../../../packages/terminal/node_modules/zmodem.js/dist/zmodem', () => ({}));
vi.mock('../../../../../packages/terminal/node_modules/socket.io-client', () => ({
  io: () => rec.socket, Socket: class {},
}));

import { BBSTerminal } from '../../../../../packages/terminal/src/components/BBSTerminal';
import { FakeSocket } from './helpers/fake-socket';

beforeEach(() => {
  rec.terminals.length = 0;
  rec.socket = new FakeSocket();
  window.localStorage.clear();
  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  if (typeof navigator.getGamepads !== 'function') {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** The window is elsewhere, which is when the focus event goes missing. */
function windowInactive() {
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
}
function windowActive() {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
}

describe('a terminal focused while the window was inactive', () => {
  it('is left holding document focus without xterm knowing it', async () => {
    windowInactive();
    render(<BBSTerminal backendUrl="http://localhost:3001" />);
    await act(async () => { await new Promise(r => setTimeout(r, 150)); });

    const term = rec.terminals[0];
    // The disagreement the sysop's console showed.
    expect(document.activeElement).toBe(term.textarea);
    expect(term.element.classList.contains('focus')).toBe(false);
  });

  it('resyncs when the window comes back, so the cursor blinks again', async () => {
    windowInactive();
    render(<BBSTerminal backendUrl="http://localhost:3001" />);
    await act(async () => { await new Promise(r => setTimeout(r, 150)); });
    const term = rec.terminals[0];
    expect(term.element.classList.contains('focus')).toBe(false);

    // The viewer comes back to the window.
    windowActive();
    await act(async () => { window.dispatchEvent(new Event('focus')); });

    expect(term.element.classList.contains('focus')).toBe(true);
    // Blurred and refocused: that is what fires the event xterm missed.
    expect(term.focusCalls.slice(-2)).toEqual(['blur', 'focus']);
  });

  it('leaves a genuinely unfocused terminal alone', async () => {
    windowInactive();
    render(<BBSTerminal backendUrl="http://localhost:3001" />);
    await act(async () => { await new Promise(r => setTimeout(r, 150)); });
    const term = rec.terminals[0];

    // Focus really is somewhere else - the viewer is typing in another field.
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    const before = term.focusCalls.length;

    windowActive();
    await act(async () => { window.dispatchEvent(new Event('focus')); });

    expect(term.focusCalls.length).toBe(before);
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe('a plain load into a window that is already focused', () => {
  /*
   * The case the first fix missed, and the sysop caught: "cursor is white
   * when i dont click on localhost". No `window.focus` event ever fires -
   * the window was focused all along - so a resync that only listens for one
   * never runs. And the second startup focus() is a no-op because the
   * textarea is already activeElement, so it fires no event either.
   */
  it('ends up with xterm knowing it is focused, without a click', async () => {
    windowActive();
    render(<BBSTerminal backendUrl="http://localhost:3001" />);
    // Let both startup focus attempts and their rAF checks run.
    await act(async () => { await new Promise(r => setTimeout(r, 200)); });
    await act(async () => { await new Promise(r => requestAnimationFrame(() => r(null))); });

    const term = rec.terminals[0];
    expect(document.activeElement).toBe(term.textarea);
    expect(term.element.classList.contains('focus')).toBe(true);
  });

  it('does not need a window focus event to get there', async () => {
    windowActive();
    render(<BBSTerminal backendUrl="http://localhost:3001" />);
    await act(async () => { await new Promise(r => setTimeout(r, 200)); });
    await act(async () => { await new Promise(r => requestAnimationFrame(() => r(null))); });
    const term = rec.terminals[0];

    // Nothing dispatched `window.focus` here - the class is already on.
    expect(term.element.classList.contains('focus')).toBe(true);
  });
});
