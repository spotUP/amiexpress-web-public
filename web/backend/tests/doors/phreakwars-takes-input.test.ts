/**
 * "input doesnt work in phreakwars" (sysop, 2026-09-03, a 40-column PETSCII
 * web `P` session on live `main` 7bcd610ee).
 *
 * The report named PETSCII, but the transport was innocent. A web PETSCII
 * keystroke travels PetsciiCanvas.onKeyDown -> onData ->
 * BBSTerminal `processInputKey` -> `sendInput` -> `socket.emit('command')`,
 * exactly as an xterm keystroke does, and the backend's `command` handler
 * (`src/server/socket-handlers.ts:584`) branches on nothing PETSCII: with a
 * door running it calls `session.doorInputHandler(data)` at :779, and when
 * that property is missing it drops the byte on the `door:input` dead-drop at
 * :783, which no server door listens to. Telnet reads the SAME property
 * (`src/index.ts:1241`).
 *
 * PHREAKWARS never installed one. `bbsSession.doorInputHandler` is assigned
 * only by the SDK's input loop (`sdk/src/core/Door.ts:250`), and
 * `Door.execute()` reaches that loop only after every start handler has
 * RESOLVED (`sdk/src/core/Door.ts:118-131`). The door's `onStart` used to sit
 * on a stay-alive promise polling `currentMode === 'quit'`, so it never
 * resolved, the loop was never reached, and the door painted a screen nobody
 * could type into - on every surface, since the SDK 2.0 refactor.
 *
 * These tests drive the door through the REAL `Door.execute()` and then call
 * `bbsSession.doorInputHandler` - the exact function the two live routers
 * above call - which is the level `tests/route-amiga-door-input.test.ts`
 * settled on for the same class of routing bug.
 *
 * Full report: `.superpowers/sdd/2026-09-03-phreakwars-input/progress.md`.
 */
import type { Socket } from 'socket.io';

// The door imports the SDK barrel, whose audio engine pulls in `tone` - an
// ESM-only package jest's CJS transform cannot load. The door never touches
// audio; stub it so the suite exercises the door, not the tracker.
jest.mock('tone', () => ({}), { virtual: true });

import door from '../../../../Doors/phreakwars/server';

interface RunningDoor {
  /** Everything the door has painted, in order. */
  output: () => string;
  /** Deliver one keystroke the way socket-handlers.ts:779 does. */
  press: (key: string) => Promise<void>;
  /** The session object the backend owns; the handler hangs off it. */
  session: { nodeId: number; doorInputHandler?: ((input: string) => void) | null };
  /** Resolves when `Door.execute()` returns, i.e. the door has left. */
  finished: Promise<void>;
  disconnect: () => void;
}

/**
 * One door run against a fake socket. `gameStates` in the door is a
 * module-level map keyed by user id, so every test uses its own id and starts
 * at character creation.
 */
function launch(userId: string, columns = 40): RunningDoor {
  const chunks: string[] = [];
  const disconnectHandlers: Array<() => void> = [];
  const socket = {
    id: `phreakwars-${userId}`,
    connected: true,
    emit: (event: string, data: unknown): boolean => {
      if (event === 'ansi-output' && typeof data === 'string') chunks.push(data);
      return true;
    },
    on: () => socket,
    once: (event: string, handler: () => void) => {
      if (event === 'disconnect') disconnectHandlers.push(handler);
      return socket;
    },
    off: () => socket,
    removeListener: () => socket,
  };
  const session: RunningDoor['session'] = { nodeId: 1 };
  const finished = door.execute({
    socket: socket as unknown as Socket,
    bbsSession: session,
    user: {
      id: userId,
      username: `PW${userId}`,
      accessLevel: 255,
      timesCalled: 1,
      uploads: 0,
      downloads: 0,
    },
    params: [],
    bbs: { getTerminalSize: () => ({ width: columns, height: 25 }) },
  });

  return {
    output: () => chunks.join(''),
    press: async (key: string) => {
      const handler = session.doorInputHandler;
      if (!handler) throw new Error('no doorInputHandler installed - the keystroke has nowhere to go');
      await (handler(key) as unknown as Promise<void> | void);
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    session,
    finished,
    disconnect: () => disconnectHandlers.forEach((h) => h()),
  };
}

/** Let `Door.execute()` run its start handlers and reach the input loop. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("a caller's keystroke reaches PHREAKWARS while it is running", () => {
  it('installs doorInputHandler - the property both live routers call - as soon as it has painted', async () => {
    const run = launch('input-1');
    await settle();

    expect(run.output().length).toBeGreaterThan(0); // it painted
    expect(typeof run.session.doorInputHandler).toBe('function'); // ...and can be typed into

    run.disconnect();
    await run.finished;
  });

  it('answers a keystroke: the handle typed at character creation is echoed back', async () => {
    const run = launch('input-2');
    await settle();

    const before = run.output().length;
    await run.press('ZEROCOOL');

    const after = run.output();
    expect(after.length).toBeGreaterThan(before);
    expect(after).toContain('Welcome, ZEROCOOL!');
  });

  it('a 40-column caller gets the same input path an 80-column one does', async () => {
    const run = launch('input-3', 80);
    await settle();

    expect(typeof run.session.doorInputHandler).toBe('function');
    await run.press('ACIDBURN');
    expect(run.output()).toContain('Welcome, ACIDBURN!');
  });

  it('quitting ends the door: Q, then the "press any key to exit" key, and execute() returns', async () => {
    const run = launch('input-4');
    await settle();

    await run.press('CRASHOVERRIDE');   // character creation -> main menu
    await run.press('\r');              // main menu redraw
    await run.press('Q');               // farewell + "Press any key to exit..."
    expect(run.output()).toContain('Thanks for playing Phreak Wars!');

    await run.press(' ');               // the any-key that actually exits
    await expect(run.finished).resolves.toBeUndefined();
    expect(run.session.doorInputHandler).toBeNull();
  });
});
