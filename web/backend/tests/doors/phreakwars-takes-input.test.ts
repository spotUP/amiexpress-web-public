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

import { createBBSApi } from '../../src/doors/BBSApi';
import door from '../../../../Doors/phreakwars/server';

interface RunningDoor {
  /** Everything the door has painted, in order. */
  output: () => string;
  /** Deliver one keystroke the way socket-handlers.ts:779 does. */
  press: (key: string) => Promise<void>;
  /** The session object the backend owns; the handler hangs off it. */
  session: {
    nodeId: number;
    screenWidth: number;
    screenHeight: number;
    doorInputHandler?: ((input: string) => void) | null;
  };
  /** Resolves when `Door.execute()` returns, i.e. the door has left. */
  finished: Promise<void>;
}

/**
 * One door run against a fake socket. `gameStates` in the door is a
 * module-level map keyed by user id, so every test uses its own id and starts
 * at character creation.
 */
function launch(userId: string, columns = 40): RunningDoor {
  const chunks: string[] = [];
  const socket = {
    id: `phreakwars-${userId}`,
    connected: true,
    emit: (event: string, data: unknown): boolean => {
      if (event === 'ansi-output' && typeof data === 'string') chunks.push(data);
      return true;
    },
    on: () => socket,
    once: () => socket,
    off: () => socket,
    removeListener: () => socket,
  };
  // ONE session object: the BBSApi line reader installs its handler on the
  // same property the door's input loop and both live routers use, so a copy
  // here would hide every hand-off between them.
  const session: RunningDoor['session'] = { nodeId: 1, screenWidth: columns, screenHeight: 25 };
  const bbsApi = createBBSApi(socket as unknown as Socket, session as never);
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
    // The REAL BBSApi the backend hands every TypeScript door
    // (handlers/door.handler.ts:2297). The free-text fields are read with its
    // getLine, so a stub here would test the stub.
    bbs: bbsApi,
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
  };
}

/** Let `Door.execute()` run its start handlers and reach the input loop. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Type a free-text field the way a caller does - one keystroke at a time.
 * The SDK line reader appends single key presses only, so a whole string
 * handed over in one event is not a shortcut for this.
 */
async function type(run: RunningDoor, text: string): Promise<void> {
  for (const ch of text) await run.press(ch);
}

describe("a caller's keystroke reaches PHREAKWARS while it is running", () => {
  it('installs doorInputHandler - the property both live routers call - as soon as it has painted', async () => {
    const run = launch('input-1');
    await settle();

    expect(run.output().length).toBeGreaterThan(0); // it painted
    expect(typeof run.session.doorInputHandler).toBe('function'); // ...and can be typed into

    // Left running on purpose: the door is sitting at the handle prompt, and
    // the quit path has its own test below. Nothing is scheduled while it
    // waits - the handler is the only thing holding it.
  });

  it('answers a keystroke: the handle typed at character creation is echoed back', async () => {
    const run = launch('input-2');
    await settle();

    const before = run.output().length;
    await type(run, 'ZEROCOOL');
    await run.press('\r');

    const after = run.output();
    expect(after.length).toBeGreaterThan(before);
    expect(after).toContain('Welcome, ZEROCOOL!');
  });

  it('an 80-column caller gets the same input path the 40-column ones do', async () => {
    const run = launch('input-3', 80);
    await settle();

    expect(typeof run.session.doorInputHandler).toBe('function');
    await type(run, 'ACIDBURN');
    await run.press('\r');
    expect(run.output()).toContain('Welcome, ACIDBURN!');
  });

  it('typing a handle letter by letter echoes and submits on Enter, not per key', async () => {
    const run = launch('input-5');
    await settle();

    // What the screen gains from each individual keystroke.
    const echoed: string[] = [];
    for (const ch of ['s', 'p', 'o', 't']) {
      const before = run.output().length;
      await run.press(ch);
      echoed.push(run.output().slice(before));
    }

    // A free-text field is a LINE: each key echoes itself and nothing else.
    // Validating per keystroke is what produced the sysop's report - the
    // first 's' was judged as the whole handle and refused.
    expect(echoed).toEqual(['s', 'p', 'o', 't']);
    expect(run.output()).not.toContain('Handle must be 3-15 characters long');

    await run.press('\r');
    expect(run.output()).toContain('Welcome, spot!');
  });

  it('quitting ends the door: Q, then the "press any key to exit" key, and execute() returns', async () => {
    const run = launch('input-4');
    await settle();

    await type(run, 'CRASHOVERRIDE');  // the handle, letter by letter
    await run.press('\r');             // Enter submits it -> main menu
    await run.press('Q');              // farewell + "Press any key to exit..."
    expect(run.output()).toContain('Thanks for playing Phreak Wars!');

    await run.press(' ');              // the any-key that actually exits
    await expect(run.finished).resolves.toBeUndefined();
    expect(run.session.doorInputHandler).toBeNull();
  });
});
