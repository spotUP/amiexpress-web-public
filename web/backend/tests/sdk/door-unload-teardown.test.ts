/**
 * A client door stops when it is unloaded.
 *
 * Reported 2026-08-26 with screenshots: LiveChat's video "flips between two
 * modes" - one frame drawn into the top-left corner, the next filling the
 * tile - and it "holds for more frames and flips", which is two independent
 * timers drifting past each other rather than one alternating.
 *
 * The terminal unloads a client door by removing its <script> from the page,
 * and that does not stop anything the script started. Timers, camera
 * captures and sockets carried on, so every re-entry added another live
 * copy, each encoding at the size IT was started with, all writing into the
 * same tile. It got worse the more times the door was opened, which is what
 * a leak looks like from the outside.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const clientDoor = readFileSync(join(ROOT, 'sdk', 'client', 'index.ts'), 'utf8');
const terminal = readFileSync(
  join(ROOT, 'packages', 'terminal', 'src', 'components', 'BBSTerminal.tsx'),
  'utf8'
);
const livechat = readFileSync(join(ROOT, 'Doors', 'livechat', 'client.ts'), 'utf8');

describe('the SDK side', () => {
  it('listens for the unload event', () => {
    expect(clientDoor).toMatch(/window\.addEventListener\(DOOR_UNLOAD_EVENT/);
  });

  it('shuts the door down when it hears it', () => {
    const handler = clientDoor.slice(clientDoor.indexOf('DOOR_UNLOAD_EVENT, (event'));

    expect(handler.slice(0, 400)).toMatch(/this\.shutdown\(\)/);
  });

  it('only stops the door that was named', () => {
    // One door ending must not tear down another that is still running.
    const handler = clientDoor.slice(clientDoor.indexOf('DOOR_UNLOAD_EVENT, (event'));

    expect(handler.slice(0, 400)).toMatch(/doorId/);
  });
});

describe('the terminal side', () => {
  it('announces the unload before removing the script', () => {
    const unload = terminal.slice(terminal.indexOf("socket.on('door:unload-client'"));
    const dispatchAt = unload.indexOf('bbs:door-unload');
    const removeAt = unload.indexOf('removeChild');

    expect(dispatchAt).toBeGreaterThan(-1);
    expect(dispatchAt).toBeLessThan(removeAt);
  });

  it('announces it when a door actually ends', () => {
    // The backend never emits door:unload-client - game-mode=false is the
    // authoritative "door ended" signal, so it has to carry this too.
    const gameMode = terminal.slice(terminal.indexOf("socket.on('game-mode'"));

    expect(gameMode.slice(0, 700)).toMatch(/bbs:door-unload/);
  });

  it('stops the previous copy before loading another', () => {
    // Re-entering a door is how the second capture loop appeared.
    const load = terminal.slice(terminal.indexOf("socket.on('door:load-client'"));

    expect(load.slice(0, 600)).toMatch(/bbs:door-unload/);
  });
});

describe('LiveChat', () => {
  it('gives the camera back on shutdown', () => {
    expect(livechat).toMatch(/on\('shutdown'[\s\S]{0,120}?releaseLocalMedia\(\)/);
  });

  it('stops the frame timer when it releases', () => {
    const stop = livechat.slice(livechat.indexOf('private stopVideoCapture'));

    expect(stop.slice(0, 400)).toMatch(/clearInterval\(this\.videoFrameInterval\)/);
  });
});
