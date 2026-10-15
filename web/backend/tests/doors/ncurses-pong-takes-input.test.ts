/**
 * ncurses-pong took no input on any surface, for the same reason PHREAKWARS
 * did not (`tests/doors/phreakwars-takes-input.test.ts`, and the report at
 * `.superpowers/sdd/2026-09-03-phreakwars-input/progress.md`).
 *
 * `bbsSession.doorInputHandler` is assigned only by the SDK's input loop
 * (`sdk/src/core/Door.ts:250`), and `Door.execute()` reaches that loop only
 * after every start handler has RESOLVED (`sdk/src/core/Door.ts:118-131`).
 * ncurses-pong's `onStart` used to `await pong.onStart(context)` - the C
 * game loop, `while (!end) { ... await getch(); }`, which ends when the player
 * presses ESC. The player could never press ESC: the loop was never reached,
 * the handler was never installed, and every keystroke fell through to the
 * `door:input` dead-drop at `web/backend/src/server/socket-handlers.ts:783`.
 * Telnet reads the SAME property (`web/backend/src/index.ts:1241`).
 *
 * These tests drive the door through the REAL `Door.execute()` and then call
 * `bbsSession.doorInputHandler` - the exact function both live routers call.
 *
 * Full report: `.superpowers/sdd/2026-09-03-ncurses-pong-input/progress.md`.
 */
import type { Socket } from 'socket.io';

import { createBBSApi } from '../../src/doors/BBSApi';

// The door imports the SDK barrel, whose audio engine pulls in `tone` - an
// ESM-only package jest's CJS transform cannot load. The door never touches
// audio; stub it so the suite exercises the door, not the tracker.
jest.mock('tone', () => ({}), { virtual: true });

import door from '../../../../Doors/ncurses-pong/index';

/** The ncurses layer's own screen size (`engines/ui/ncurses/constants.ts`). */
const SCREEN_ROWS = 24;
const SCREEN_COLS = 80;
/** `b1.x = scr.x - 2` in the original C: player 1's paddle column, 0-based. */
const PLAYER_ONE_COLUMN = SCREEN_COLS - 2;
/** One game tick is 33 ms (`Doors/ncurses-pong/app.ts`, PONG_TICK_MS). */
const TICK_MS = 33;

/** What the backend calls a key-state event (`socket-handlers.ts:527`). */
interface KeyStateEvent {
  key: string;
  pressed: boolean;
  keyState: Record<string, boolean>;
}

/** The session fields these tests reach for, as the backend owns them. */
interface DoorSession {
  nodeId: number;
  gameModeEnabled?: boolean;
  currentDoorType?: string;
  keyState?: Record<string, boolean>;
  doorInputHandler?: ((input: string) => void) | null;
  doorKeyStateHandler?: ((event: KeyStateEvent) => void) | null;
}

interface RunningDoor {
  /** Everything the door has painted, in order. */
  output: () => string;
  /** The screen as the caller sees it, rebuilt from the emitted frames. */
  screen: () => string[];
  /** Deliver one keystroke the way socket-handlers.ts:779 does. */
  press: (key: string) => Promise<void>;
  /** Deliver a key-down edge the way socket-handlers.ts:527 does. */
  keyDown: (key: string) => void;
  /** Deliver a key-up edge the way socket-handlers.ts:565 does. */
  keyUp: (key: string) => void;
  /** Every event the door's socket saw, for the game-mode assertions. */
  emitted: () => Array<{ event: string; data: unknown }>;
  /** The session object the backend owns; the handlers hang off it. */
  session: DoorSession;
  /** Resolves when `Door.execute()` returns, i.e. the door has left. */
  finished: Promise<void>;
  disconnect: () => void;
}

/**
 * Rebuild the screen from what the door emitted.
 *
 * `refresh()` writes each dirty line as `ESC[row;1H` followed by all 80 cells
 * (`sdk/engines/ui/ncurses/window.ts:843-874`), so the latest write of a row
 * wins - which is exactly what the caller's terminal does with it.
 */
function renderScreen(emitted: string): string[] {
  const rows: string[] = new Array(SCREEN_ROWS).fill(' '.repeat(SCREEN_COLS));
  const line = /\x1b\[(\d+);1H((?:[^\x1b]|\x1b\[[\d;]*m)*)/g;
  let match = line.exec(emitted);
  while (match !== null) {
    const row = Number(match[1]) - 1;
    const text = match[2].replace(/\x1b\[[\d;]*m/g, '');
    if (row >= 0 && row < SCREEN_ROWS && text.length >= SCREEN_COLS) {
      rows[row] = text.slice(0, SCREEN_COLS);
    }
    match = line.exec(emitted);
  }
  return rows;
}

/** The row player 1's three-cell paddle is centred on, or -1 if unpainted. */
function playerOnePaddleCentre(screen: string[]): number {
  const hit: number[] = [];
  screen.forEach((row, index) => {
    if (row[PLAYER_ONE_COLUMN] === '|') hit.push(index);
  });
  if (hit.length === 0) return -1;
  return hit[Math.floor(hit.length / 2)];
}

function launch(nodeId: number): RunningDoor {
  const chunks: string[] = [];
  const events: Array<{ event: string; data: unknown }> = [];
  const disconnectHandlers: Array<() => void> = [];
  const socket = {
    id: `ncurses-pong-${nodeId}`,
    connected: true,
    emit: (event: string, data: unknown): boolean => {
      events.push({ event, data });
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
  const session: DoorSession = { nodeId, keyState: {} };

  // The REAL BBSApi, so `enableGameMode` and the key-edge registration go
  // through the shipped code rather than a stub that cannot be wrong -
  // the same choice `tests/doors/bbsapi-game-mode.test.ts` makes.
  const bbs = createBBSApi(
    socket as unknown as Socket,
    session as unknown as Parameters<typeof createBBSApi>[1],
  );

  const finished = door.execute({
    socket: socket as unknown as Socket,
    bbsSession: session,
    user: {
      id: String(nodeId),
      username: `PONG${nodeId}`,
      accessLevel: 255,
      timesCalled: 1,
      uploads: 0,
      downloads: 0,
    },
    params: [],
    bbs,
  });

  return {
    output: () => chunks.join(''),
    screen: () => renderScreen(chunks.join('')),
    press: async (key: string) => {
      const handler = session.doorInputHandler;
      if (!handler) throw new Error('no doorInputHandler installed - the keystroke has nowhere to go');
      await (handler(key) as unknown as Promise<void> | void);
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    keyDown: (key: string) => {
      const keyState = session.keyState ?? {};
      keyState[key] = true;
      session.keyState = keyState;
      session.doorKeyStateHandler?.({ key, pressed: true, keyState });
    },
    keyUp: (key: string) => {
      const keyState = session.keyState ?? {};
      delete keyState[key];
      session.doorKeyStateHandler?.({ key, pressed: false, keyState });
    },
    emitted: () => events,
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

/** Let the door's own game loop run `ticks` frames. */
async function frames(ticks: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, TICK_MS * ticks + TICK_MS));
}

describe("a caller's keystroke reaches ncurses-pong while it is running", () => {
  /**
   * The ncurses layer is a module-level singleton: `initscr()` returns early
   * while a screen is up, and would then paint into the PREVIOUS run's socket.
   * Every test hands its door back before the next one starts.
   */
  const open: RunningDoor[] = [];
  afterEach(async () => {
    for (const run of open.splice(0)) {
      run.disconnect();
      await run.finished;
    }
  });

  function start(nodeId: number): RunningDoor {
    const run = launch(nodeId);
    open.push(run);
    return run;
  }

  it('installs doorInputHandler - the property both live routers call - once the title screen is up', async () => {
    const run = start(1);
    await settle();

    expect(run.output()).toContain('Press ANY key to start'); // it painted
    expect(typeof run.session.doorInputHandler).toBe('function'); // ...and can be typed into
  });

  it('a key starts the game: the title screen gives way to a drawn board', async () => {
    const run = start(2);
    await settle();

    const before = run.output().length;
    await run.press(' ');
    await frames(4);

    expect(run.output().length).toBeGreaterThan(before);

    // The score line the game draws: `mvprintw(2, scr.x/2 - 2, "0 | 0")`. Its
    // separator is then overwritten by the centre line, so pin the digits.
    const score = run.screen()[2];
    expect(score[SCREEN_COLS / 2 - 2]).toBe('0');
    expect(score[SCREEN_COLS / 2 + 2]).toBe('0');
    expect(playerOnePaddleCentre(run.screen())).toBeGreaterThan(0);
  });

  it("UP moves player 1's paddle, and the board is redrawn", async () => {
    const run = start(3);
    await settle();

    await run.press(' '); // leave the title screen
    await frames(4);
    const before = playerOnePaddleCentre(run.screen());
    expect(before).toBeGreaterThan(0);

    await run.press('\x1b[A'); // UP
    await frames(4);

    expect(playerOnePaddleCentre(run.screen())).toBe(before - 1);
  });

  it('ESC quits: the door says so and execute() returns on the next key', async () => {
    const run = start(4);
    await settle();

    await run.press(' '); // leave the title screen
    await frames(2);

    await run.press('\x1b'); // ESC
    expect(run.output()).toContain('Thanks for playing PONG');

    // `ctx.close()` only drops the running-session entry; the SDK input loop
    // resolves on the NEXT keystroke (sdk/src/core/Door.ts:212-217), which is
    // the "press any key to exit" the line above asked for.
    await run.press(' ');
    await expect(run.finished).resolves.toBeUndefined();
    expect(run.session.doorInputHandler).toBeNull();

    // The game loop is gone with it: nothing more is painted.
    const after = run.output().length;
    await frames(4);
    expect(run.output().length).toBe(after);
  });

  it('closing after ESC leaves the alternate screen exactly once', async () => {
    const run = start(5);
    await settle();

    await run.press(' '); // leave the title screen
    await frames(2);
    await run.press('\x1b'); // ESC - quit() stops the loop and calls endwin()
    await run.press(' '); // the any-key that resolves the input loop
    await run.finished; // ...which then runs the door's close handler

    // `endwin()` puts real bytes on the wire (`sdk/engines/ui/ncurses/
    // ncurses.ts:246-263`) and the close handler calls `stop()` a second time,
    // so this pins the OUTCOME: the caller is asked to pop the alternate
    // screen once, not twice.
    //
    // Two independent guards hold it - `PongDoor.stop()`'s phase check and
    // `endwin()`'s own `initialized` check - so removing either ALONE leaves
    // this green. It is a cross-layer invariant pin, not a regression test for
    // the door's guard, and the ledger says so.
    const leaveAlternateScreen = run.output().split('\x1b[?1049l').length - 1;
    expect(leaveAlternateScreen).toBe(1);
  });

  /**
   * Sysop, on the live walk: "controls work in pong but game mode is not
   * active so there is a key delay."
   *
   * Game mode WAS requested. The half that was missing is the key EDGES.
   * In game mode the client sends one `key-down` on the press and does not
   * repeat it for 400 ms (`packages/terminal/src/components/BBSTerminal.tsx:
   * 1342`, KEY_REPEAT_DELAY), and it never sends a release to
   * `doorInputHandler` at all - `socket-handlers.ts:551-570` gives key-up
   * only to `doorKeyStateHandler`. A door that moves once per delivered key
   * therefore hesitates for 400 ms and then stutters, which is what the paddle
   * did. The arcade doors all hold the key state and step once per frame
   * instead (`DoorInputManager({ trackHeldKeys: true })`).
   */
  it('PONG enters game mode on start so held keys repeat without the OS delay', async () => {
    const run = start(6);
    await settle();

    // 1. Game mode, through the real BBSApi: the session flag the `command`
    //    path reads (socket-handlers.ts:748) and the signal the browser needs
    //    before it sends any key event at all.
    expect(run.session.gameModeEnabled).toBe(true);
    expect(run.session.currentDoorType).toBe('TS');
    expect(run.emitted()).toContainEqual({ event: 'game-mode', data: true });

    // 2. The key-edge handler - the property socket-handlers.ts:527 and :565
    //    call, and the ONLY one a key-up ever reaches.
    expect(typeof run.session.doorKeyStateHandler).toBe('function');

    // 3. Holding UP moves every frame, from ONE key-down and no repeats.
    await run.press(' '); // leave the title screen
    await frames(2);
    const before = playerOnePaddleCentre(run.screen());
    expect(before).toBeGreaterThan(0);

    run.keyDown('ArrowUp');
    await frames(5);
    const held = playerOnePaddleCentre(run.screen());

    // One delivered key moves one cell; the client would not repeat for
    // another 400 ms, far longer than the frames waited above.
    expect(before - held).toBeGreaterThan(1);

    // 4. Releasing stops it. key-up reaches the door on this path only.
    run.keyUp('ArrowUp');
    await frames(4);
    expect(playerOnePaddleCentre(run.screen())).toBe(held);
  });
});
