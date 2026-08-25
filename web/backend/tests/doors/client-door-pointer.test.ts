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
