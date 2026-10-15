/**
 * A modifier is part of the key, even in game mode.
 *
 * Game mode stops xterm from turning keystrokes into bytes and sends
 * `key-down` events instead, one per press. The payload carried the key and
 * its code and nothing else, so every modifier was dropped on the way to
 * the door: Alt+Enter arrived as a bare Enter, which in GRANDMASTER's menu
 * is "select" ("alt+enter fullscreens but it switches back instantly",
 * 2026-09-02 - the door never saw the toggle at all, and what it did see
 * was the menu accepting an item).
 *
 * Alt is ESC before the key, which is how a terminal has always spelled
 * meta and what the SDK's parser reads back as 'M-<name>'. Ctrl+letter is
 * already a control byte by the time it gets here, so only Alt needs it.
 *
 * The key-down handler is DRIVEN: the real registerSocketHandlers is handed a
 * fake socket (the technique of server/petscii-session-geometry.test.ts), a
 * session sits in the real session registry, and the test fires key-down
 * and reads what the door's input handler received.
 *
 * src/index.ts is mocked away: socket-handlers.ts imports the BBSSession
 * type from it.
 */
jest.mock('../../src/index', () => ({}));

import { readFileSync } from 'fs';
import { join } from 'path';

import { keyBytesFor } from '../../src/server/composed-key';
import { gameKeyDownPayload } from '@amiexpress/terminal/utils/key-overrides';

type Handler = (...args: any[]) => void;

/**
 * Register the real socket handlers on a fake socket for a session inside an
 * SDK door, and return a function that presses a key and answers with the
 * bytes the door received.
 */
function doorOnSocket(id: string) {
  const handlers: Record<string, Handler> = {};
  const socket: any = {
    id,
    handshake: { address: '127.0.0.1' },
    on(event: string, cb: Handler) { handlers[event] = cb; return socket; },
    onAny() { return socket; },
    emit() { return true; },
    join() { return socket; },
    removeAllListeners() { return socket; },
  };
  const received: string[] = [];
  const session: any = {
    nodeId: 97, socketId: id,
    inDoorManager: true,
    doorInputHandler: (bytes: string) => { received.push(bytes); },
  };
  const { setSession, deleteSession } = require('../../src/server/session-manager');
  const { registerSocketHandlers } = require('../../src/server/socket-handlers');
  setSession(id, session);
  const io: any = { sockets: { sockets: new Map() }, emit() { return true; }, to() { return { emit() { return true; } }; } };
  registerSocketHandlers(io, socket);
  const press = (data: Record<string, unknown>): string[] => {
    received.length = 0;
    handlers['key-down'](data);
    return [...received];
  };
  return { press, cleanup: () => deleteSession(id) };
}

describe('game-mode key modifiers', () => {
  it('accepts the modifiers in the key-down payload', () => {
    // Ctrl and Shift ride along without changing the delivery: Ctrl+letter
    // is already a control byte by the time it gets here.
    const door = doorOnSocket('game-mode-mods-1');
    try {
      expect(door.press({ key: 'g', code: 'KeyG', alt: false, ctrl: true, shift: true })).toEqual(['g']);
    } finally { door.cleanup(); }
  });

  /**
   * The handler asks ONE function what a key press is worth, and that
   * function is tested for behaviour rather than for shape (see
   * tests/server/composed-key.test.ts). What is checked here is that the
   * handler still asks it WITH the modifier: Alt+Enter reaches the door as
   * ESC+CR, and a character Alt composed reaches it bare - the second one
   * only keyBytesFor knows, so an inline ESC prefix would fail it.
   */
  it('hands the key to the one place that decides its bytes', () => {
    const door = doorOnSocket('game-mode-mods-2');
    try {
      expect(door.press({ key: 'Enter', code: 'Enter', alt: true })).toEqual([keyBytesFor('\r', 'Enter', 'Enter', true)]);
      expect(door.press({ key: 'Enter', code: 'Enter', alt: true })).toEqual(['\x1b\r']);
      expect(door.press({ key: '@', code: 'Digit2', alt: true })).toEqual(['@']);
      expect(door.press({ key: 'g', code: 'KeyG', alt: true })).toEqual(['\x1bg']);
      expect(door.press({ key: 'Enter', code: 'Enter' })).toEqual(['\r']);
    } finally { door.cleanup(); }
  });

  it('prefixes ESC for Alt, so the door reads it as meta', () => {
    // GRANDMASTER's size toggle: Alt+Enter must not arrive as a bare Enter,
    // which in its menu is "select" (2026-09-02).
    expect(keyBytesFor('\r', 'Enter', 'Enter', true)).toBe('\x1b\r');
    expect(keyBytesFor('g', 'g', 'KeyG', true)).toBe('\x1bg');
  });

  it('does NOT prefix a character Alt composed', () => {
    // `@` on a Nordic Mac layout is Option+2. Prefixed, it reached the door
    // as an escape and closed first the dialog and then the door itself
    // (sysop, live board, 2026-09-07).
    expect(keyBytesFor('@', '@', 'Digit2', true)).toBe('@');
  });

  it('still sends the plain key when Alt is not held', () => {
    // No modifier, no prefix. A door that never binds a meta key must be
    // unaffected by any of this.
    expect(keyBytesFor('g', 'g', 'KeyG', false)).toBe('g');
    expect(keyBytesFor('\r', 'Enter', 'Enter', undefined)).toBe('\r');
  });

  it('is fed by a terminal that sends the modifiers at all', () => {
    const terminal = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'packages', 'terminal', 'src', 'components', 'BBSTerminal.tsx'),
      'utf8'
    );
    // The press is built by one function, and what it carries is checked
    // below; this only asks that the terminal still uses it and still reads
    // the modifiers off the event.
    // REASONABLE source read: BBSTerminal is a React component in another
    // package with no test harness of its own, and the backend's node-env
    // jest cannot mount it (xterm + DOM). The patterns allow any quoting and
    // spacing; what they require is the emit through the builder and Alt read
    // off the keyboard event.
    expect(terminal).toMatch(/emit\(\s*['"`]key-down['"`]\s*,\s*gameKeyDownPayload\(/);
    expect(terminal).toMatch(/pressGameKey\(\s*ev\.key\s*,\s*ev\.code\s*,\s*\{[^}]*\balt\s*:\s*ev\.altKey\b/);
  });

  it('sends Alt, Ctrl and Shift with the key, beside who pressed it', () => {
    expect(gameKeyDownPayload('Enter', 'Enter', { alt: true, ctrl: false, shift: true }, 'window'))
      .toEqual({ key: 'Enter', code: 'Enter', alt: true, ctrl: false, shift: true, src: 'window' });
    expect(gameKeyDownPayload('g', 'KeyG', undefined, 'pad')).toEqual({ key: 'g', code: 'KeyG', src: 'pad' });
  });
});
