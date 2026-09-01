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
 * Read from the source rather than driven, because the handler is welded to
 * a live socket.io server and a session registry; what has to be true is a
 * three-line shape and it is checked as one.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const handlers = readFileSync(
  join(__dirname, '..', '..', 'src', 'server', 'socket-handlers.ts'),
  'utf8'
);

/** The body of the key-down handler. */
const keyDown = handlers.slice(
  handlers.indexOf("socket.on('key-down'"),
  handlers.indexOf("socket.on('key-up'")
);

describe('game-mode key modifiers', () => {
  it('accepts the modifiers in the key-down payload', () => {
    expect(keyDown).toMatch(/alt\?: boolean/);
    expect(keyDown).toMatch(/ctrl\?: boolean/);
    expect(keyDown).toMatch(/shift\?: boolean/);
  });

  it('prefixes ESC for Alt, so the door reads it as meta', () => {
    expect(keyDown).toMatch(/data\.alt \? `\\x1b\$\{base\}` : base/);
  });

  it('still sends the plain key when Alt is not held', () => {
    // The same expression: no modifier, no prefix. A door that never binds
    // a meta key must be unaffected by any of this.
    expect(keyDown).toContain(': base');
  });

  it('is fed by a terminal that sends the modifiers at all', () => {
    const terminal = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'packages', 'terminal', 'src', 'components', 'BBSTerminal.tsx'),
      'utf8'
    );
    expect(terminal).toMatch(/emit\('key-down', \{ key, code, \.\.\.mods \}\)/);
    expect(terminal).toMatch(/pressGameKey\(ev\.key, ev\.code, \{ alt: ev\.altKey/);
  });
});
