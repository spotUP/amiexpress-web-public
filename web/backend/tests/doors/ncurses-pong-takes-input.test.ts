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

interface RunningDoor {
  /** Everything the door has painted, in order. */
  output: () => string;
  /** The screen as the caller sees it, rebuilt from the emitted frames. */
  screen: () => string[];
  /** Deliver one keystroke the way socket-handlers.ts:779 does. */
  press: (key: string) => Promise<void>;
  /** The session object the backend owns; the handler hangs off it. */
  session: { nodeId: number; doorInputHandler?: ((input: string) => void) | null };
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
  const disconnectHandlers: Array<() => void> = [];
  const socket = {
    id: `ncurses-pong-${nodeId}`,
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
  const session: RunningDoor['session'] = { nodeId };
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
    bbs: {
      enableGameMode: () => undefined,
      disableGameMode: () => undefined,
      getTerminalSize: () => ({ width: 80, height: 25 }),
    },
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
});
