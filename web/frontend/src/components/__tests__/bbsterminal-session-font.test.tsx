/**
 * "Something broke the topaz font when the bbs loads, some other font is
 * used now" (sysop, 2026-09-02).
 *
 * xterm used to be constructed with `XTERM_CONFIG.fontFamily`, which is
 * mOsOul, and Topaz arrived only after `login-success` ->
 * `get-font-preference` -> `font-preference`. So every pre-login screen
 * (connect banner, ANSI prompt, login) rendered in mOsOul, and a RESTORED
 * session - which never asked for the preference - ran start to finish in
 * mOsOul.
 *
 * These tests drive the real BBSTerminal from source (a stale
 * packages/terminal/dist cannot make them pass) with xterm, its addons and
 * socket.io mocked, and assert on the font the terminal is constructed
 * with and the font it ends up in after the socket events.
 *
 * NOTE ON THE MOCK PATHS: the terminal package has its OWN node_modules
 * copy of xterm / socket.io-client, a different module id from
 * web/frontend's copy - a bare `vi.mock('@xterm/xterm')` here mocks the
 * frontend's copy while BBSTerminal happily loads the real one (and dies
 * on jsdom's missing matchMedia). Mock the path the component resolves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

/** Shared recorders. `vi.hoisted` so the (hoisted) mock factories can see
 * them - a plain module-level const is still in TDZ when they run. */
const rec = vi.hoisted(() => ({
  /** Every `new Terminal(...)` option object, in construction order. */
  ctorArgs: [] as any[],
  /** Every fake terminal instance, in construction order. */
  terminals: [] as any[],
  /** The socket the component will be handed on its next `io()` call. */
  socket: null as any,
}));

vi.mock('../../../../../packages/terminal/node_modules/@xterm/xterm', () => {
  class FakeTerminal {
    options: Record<string, any>;
    /** Every write to options.fontFamily, in order. xterm turns each
     * CHANGED write into CharSizeService.measure(); the test uses the
     * sequence to prove the re-measure happened. */
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

// Imported after the mocks so the component picks them up. Source import,
// not the built package - see the file header.
import { BBSTerminal } from '../../../../../packages/terminal/src/components/BBSTerminal';
import {
  DEFAULT_BBS_FONT,
  FONT_CACHE_KEY,
  fontFamilyFor,
} from '../../../../../packages/terminal/src/utils/session-font';
// The socket.io-client double, shared with the other BBSTerminal tests.
import { FakeSocket } from './helpers/fake-socket';

let socket: FakeSocket;

beforeEach(() => {
  rec.ctorArgs.length = 0;
  rec.terminals.length = 0;
  socket = new FakeSocket();
  rec.socket = socket;
  window.localStorage.clear();
  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  // jsdom has no Gamepad API; the 'connect' handler starts GamepadManager.
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

describe('the session font at load', () => {
  it('the terminal opens in the board default font, not mOsOul, before any login', () => {
    mount();
    expect(rec.ctorArgs.length).toBeGreaterThan(0);
    const fontFamily: string = rec.ctorArgs[0].fontFamily;
    expect(fontFamily.startsWith(DEFAULT_BBS_FONT)).toBe(true);
    expect(fontFamily.toLowerCase().startsWith('mosoul')).toBe(false);
  });

  it('the terminal opens in the cached font when this browser has seen one', () => {
    window.localStorage.setItem(FONT_CACHE_KEY, 'P0T-NOoDLE');
    mount();
    expect(rec.ctorArgs[0].fontFamily.startsWith('P0T-NOoDLE')).toBe(true);
  });

  it('ignores a junk cached font rather than rendering the board in it', () => {
    window.localStorage.setItem(FONT_CACHE_KEY, 'Comic Sans MS');
    mount();
    expect(rec.ctorArgs[0].fontFamily.startsWith(DEFAULT_BBS_FONT)).toBe(true);
  });
});

describe('a restored session re-applies the saved font', () => {
  it('asks the server for the font preference when the session is restored', () => {
    mount();
    act(() => {
      socket.fire('session-restored', { userId: 1, username: 'Sysop', nodeId: 1 });
    });
    expect(socket.didEmit('get-font-preference')).toBe(true);
  });

  it('applies the font the server answers with to the live terminal', async () => {
    mount();
    // applyFont awaits the font face before touching xterm - flush it.
    await act(async () => {
      socket.fire('session-restored', { userId: 1, username: 'Sysop', nodeId: 1 });
      socket.fire('font-preference', { font: 'Topaz_a500' });
    });
    expect(rec.terminals[0].options.fontFamily).toBe(fontFamilyFor('Topaz_a500'));
    expect(rec.terminals[0].options.lineHeight).toBe(1.0);
  });

  it('caches the applied font so the next connect opens in it before login', async () => {
    mount();
    await act(async () => {
      socket.fire('font-preference', { font: 'MicroKnight' });
    });
    expect(window.localStorage.getItem(FONT_CACHE_KEY)).toBe('MicroKnight');

    cleanup();
    rec.ctorArgs.length = 0;
    socket = new FakeSocket();
    rec.socket = socket;
    mount();
    expect(rec.ctorArgs[0].fontFamily.startsWith('MicroKnight')).toBe(true);
  });

  it('a set-font pick from the board applies and is cached the same way', async () => {
    mount();
    await act(async () => {
      socket.fire('set-font', 'TopazPlus_a500');
    });
    expect(rec.terminals[0].options.fontFamily).toBe(fontFamilyFor('TopazPlus_a500'));
    expect(window.localStorage.getItem(FONT_CACHE_KEY)).toBe('TopazPlus_a500');
  });
});

/**
 * "A reconnected session gets its font back" - the case the sysop's
 * console log proves.
 *
 * Log from a failing load: fonts all finish loading BEFORE the socket
 * connects (so the cold-load race is NOT the cause there), the tab wakes
 * up ("Tab is back and the socket is not - reconnecting now"), the client
 * reconnects and restores the session, and there is no
 * "[Font Preference] Received saved preference" line anywhere in a clearly
 * logged-in session. The restore path never asked for the font and the
 * server never volunteered it, so the whole session ran in the font xterm
 * was constructed with. This drives that exact sequence:
 * disconnect (network) -> connect -> restore-session -> session-restored.
 */
describe('a reconnected session', () => {
  /** A session state fresh enough for getStoredSessionState's 2-minute window. */
  function seedSavedSession() {
    window.sessionStorage.setItem(
      'bbs_session_state',
      JSON.stringify({
        userId: 1,
        username: 'Sysop',
        nodeId: 1,
        socketId: 'old-socket',
        currentConf: 1,
        savedAt: Date.now(),
      }),
    );
  }

  afterEach(() => window.sessionStorage.clear());

  it('a reconnected session gets its font back', async () => {
    seedSavedSession();
    mount();

    // The tab lost the socket: a network disconnect arms the restore.
    await act(async () => { socket.fire('disconnect', 'transport close'); });
    // ...and the reconnect asks the server to restore the session.
    await act(async () => { socket.fire('connect'); });
    expect(socket.didEmit('restore-session')).toBe(true);

    // The server restores it. THIS is where the font used to be lost.
    await act(async () => {
      socket.fire('session-restored', { userId: 1, username: 'Sysop', nodeId: 1, currentConf: 1 });
    });
    expect(socket.didEmit('get-font-preference')).toBe(true);

    await act(async () => { socket.fire('font-preference', { font: 'Topaz_a500' }); });
    expect(rec.terminals[0].options.fontFamily).toBe(fontFamilyFor('Topaz_a500'));
  });
});

/**
 * "The font is correct after loading the site two times" (sysop,
 * 2026-09-02) - a COLD load opened xterm with the right family name while
 * the .ttf was still in flight, so xterm measured the fallback's cell and
 * never re-measured. The mount path must await the face and then force the
 * measure.
 */
describe('the cold load', () => {
  afterEach(() => Reflect.deleteProperty(document as any, 'fonts'));

  it('a cold load renders in Topaz once the font file arrives', async () => {
    let arrive!: () => void;
    const pending = new Promise<void>((r) => { arrive = r; });
    const load = vi.fn(() => pending.then(() => []));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });

    mount();
    const term = rec.terminals[0];
    // Opened in the board font, but the face has not arrived: no
    // re-measure has been forced yet.
    expect(rec.ctorArgs[0].fontFamily.startsWith(DEFAULT_BBS_FONT)).toBe(true);
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledWith(`12px "${DEFAULT_BBS_FONT}"`);
    expect(term.familyWrites).toEqual([]);

    await act(async () => { arrive(); await pending; });
    // Nudged through the fallback and back - the measure now runs against
    // the loaded face, and the terminal ends on the board font.
    expect(term.familyWrites.length).toBeGreaterThan(0);
    expect(term.options.fontFamily).toBe(fontFamilyFor(DEFAULT_BBS_FONT));
  });

  it('a warm load applies immediately', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn(async () => []) },
    });
    mount();
    await act(async () => { await Promise.resolve(); });
    expect(rec.terminals[0].options.fontFamily).toBe(fontFamilyFor(DEFAULT_BBS_FONT));
  });
});
