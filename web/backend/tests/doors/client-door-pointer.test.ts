/**
 * Pointer capture is a door's own declaration, not a side effect of game mode.
 *
 * executeClientDoor emits `game-mode: true` for EVERY client door, because
 * game mode means "send raw key-down/key-up". Yesterday's terminal change
 * hung the cursor hiding, the xterm pointer-events cut and the text-selection
 * block off that same flag - so LiveChat, a client door whose whole UI is
 * mouse-driven, lost its cursor and its clicks (reported live 2026-08-25).
 *
 * Doors now say whether they own the pointer, and the backend passes it on.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..', '..', '..', '..');

function manifest(door: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, 'Doors', door, 'package.json'), 'utf8'));
}

describe('client door pointer capture', () => {
  it('is claimed by the real-time games', () => {
    expect(manifest('grandmaster').capturePointer).toBe(true);
    expect(manifest('arkanoid').capturePointer).toBe(true);
  });

  it('is NOT claimed by mouse-driven TUI doors', () => {
    // LiveChat has menus, context menus and video tiles - all clicked.
    expect(manifest('livechat').capturePointer).toBeUndefined();
  });

  it('reaches the client in the door:load-client manifest', () => {
    const handler = readFileSync(
      join(repoRoot, 'web', 'backend', 'src', 'handlers', 'door.handler.ts'),
      'utf8'
    );
    const emit = handler.slice(handler.indexOf("socket.emit('door:load-client'"));

    expect(emit.slice(0, 800)).toMatch(/capturePointer: manifest\.capturePointer === true/);
  });

  it('defaults to false rather than undefined, so the client can trust it', () => {
    const handler = readFileSync(
      join(repoRoot, 'web', 'backend', 'src', 'handlers', 'door.handler.ts'),
      'utf8'
    );

    // `=== true` collapses a missing field to false.
    expect(handler).toMatch(/capturePointer: manifest\.capturePointer === true/);
  });
});

describe('the pointer follows the RUNNING door, not the last one', () => {
  const terminal = readFileSync(
    join(repoRoot, 'packages', 'terminal', 'src', 'components', 'BBSTerminal.tsx'),
    'utf8'
  );

  /** The body of the game-mode socket handler. */
  function gameModeHandler(): string {
    const start = terminal.indexOf("socket.on('game-mode'");
    expect(start).toBeGreaterThan(0);
    return terminal.slice(start, terminal.indexOf("socket.on('door:load-client'", start));
  }

  it('does not hide the pointer when game mode turns on', () => {
    // game-mode arrives BEFORE door:load-client and carries no manifest, so
    // applying a remembered capture here handed the previous door's claim to
    // the next one. That is how LiveChat kept losing its cursor after a game
    // had run - reported three times, and twice "fixed" by closing other
    // ways the flag was left set rather than the line that used it.
    const body = gameModeHandler();

    expect(body).not.toMatch(/applyPointerCapture\(\s*enabled\s*&&/);
    expect(body).toMatch(/capturePointer\.current\s*=\s*false/);
  });

  it('gives the pointer back when a door unloads', () => {
    const start = terminal.indexOf("socket.on('door:unload-client'");
    expect(start).toBeGreaterThan(0);
    const body = terminal.slice(start, start + 1200);

    expect(body).toMatch(/applyPointerCapture\(false\)/);
  });

  it('does NOT blanket-clear the screen when a door exits', () => {
    // Tried on 2026-08-26 to contain a stray TetriNET block appearing over
    // LiveChat, and it broke the BBS outright: the welcome and login screen
    // is itself drawn by a door (telnet-front), so clearing on every door
    // exit wiped it the instant it was drawn - "there is just a blinking
    // cursor". Containment that breaks the front door is not containment.
    const handler = readFileSync(
      join(repoRoot, 'web', 'backend', 'src', 'handlers', 'door.handler.ts'),
      'utf8'
    );
    const exitRegion = handler.indexOf('Clean up drop files after door exit');
    expect(exitRegion).toBeGreaterThan(0);

    const before = handler.slice(Math.max(0, exitRegion - 600), exitRegion);
    expect(before).not.toMatch(/emitText\(socket, '\\x1b\[r\\x1b\[2J\\x1b\[H'\)/);
  });
});
