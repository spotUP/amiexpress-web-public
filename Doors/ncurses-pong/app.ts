/**
 * ncurses-pong - Port of vicentebolea/Pong-curses (~71 lines)
 *
 * Original C code: https://github.com/vicentebolea/Pong-curses
 * Author: Vicente Adolfo Bolea Sanchez <vicente.bolea@gmail.com>
 *
 * This port validates the ncurses compatibility layer by porting
 * a real ncurses game with minimal changes from the original C.
 *
 * Key differences from C:
 * - typedef struct replaced with interface
 * - getmaxyx macro replaced with getLINES/getCOLS
 * - the C `while (!end) { usleep(4000); ... getch(); }` loop is INVERTED:
 *   a BBS door is driven by the caller's keystrokes, not by a blocking read.
 *   `start()` paints and parks the loop on an interval it owns; `tick()` is
 *   one iteration of the old loop body; `handleKey()` is the old
 *   `switch (getch())`. See the report referenced in index.ts for why.
 */

import {
  // Initialization
  initscr,
  endwin,
  start_color,
  init_pair,
  keypad,
  noecho,
  curs_set,
  getStdscr,

  // Screen info
  getLINES,
  getCOLS,

  // Output
  mvprintw,
  mvvline,
  erase,
  refresh,

  // Attributes
  attron,
  attroff,
  COLOR_PAIR,

  // Constants
  COLOR_BLUE,
  COLOR_BLACK,
  ACS_VLINE,
} from "@amiexpress/bbs-door-sdk/engines/ui/ncurses";

// Original C: typedef struct{short int x, y, c; bool movhor, movver;} object;
interface GameObject {
  x: number;
  y: number;
  c: number; // score counter
  movhor: boolean;
  movver: boolean;
}

function newObject(): GameObject {
  return { x: 0, y: 0, c: 0, movhor: false, movver: false };
}

/**
 * Browser `KeyboardEvent.key` -> the short name doors think in.
 *
 * Same mapping as the SDK's `DoorInputManager.normaliseKeyName`
 * (`sdk/utils/door-input-manager.ts:233-245`), which is `private static` and
 * so cannot be imported. Kept in step with it deliberately: the two must
 * agree on names or a door and the manager would disagree about "up".
 */
function normaliseKeyName(key: string): string {
  switch (key) {
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "ArrowUp": return "up";
    case "ArrowDown": return "down";
    case " ":
    case "Spacebar": return "space";
    case "Enter": return "enter";
    case "Escape": return "escape";
    default: return key.toLowerCase();
  }
}

/** The keys that move a paddle - the ones the held-key loop owns. */
const MOVEMENT_KEYS = new Set(["up", "down", "q", "a"]);

/**
 * Phases of a game.
 *
 * `title` is the original's `await getch()` before `nodelay(stdscr,1)`:
 * the board is painted but frozen until the caller presses something.
 * `paused` is the original's `nodelay(false); await getch(); nodelay(true);`.
 */
type PongPhase = "title" | "playing" | "paused" | "finished";

/**
 * One tick of the game loop.
 *
 * Original C: usleep(4000) - 4000 microseconds = 4ms.
 * BBS optimisation: 33ms = ~30fps, much better for network/CPU.
 */
export const PONG_TICK_MS = 33;

export class PongDoor {
  name = "ncurses-pong";
  version = "1.0.0";
  author = "Vicente Bolea (original), AmiExpress (port)";
  description = "Classic Pong - ncurses port validation";

  private phase: PongPhase = "finished";
  private loop: ReturnType<typeof setInterval> | null = null;
  private quitCallback: (() => void) | null = null;

  private scrX = 0;
  private scrY = 0;
  private cont = 0;

  /**
   * Keys held right now, from real key-down/key-up edges.
   *
   * The client's game-mode auto-repeat waits 400 ms before it starts
   * (`packages/terminal/src/components/BBSTerminal.tsx:1342`), so a door that
   * moves once per delivered key stutters on a held key however fast the game
   * loop runs. Every arcade door in this repo avoids that the same way - hold
   * the key state, step once per frame - and this is that state.
   */
  private held: Set<string> = new Set();

  /**
   * True once a real key-down edge has arrived, i.e. this caller's transport
   * sends key events at all. Telnet does not, and there the character path
   * below stays in charge.
   */
  private keyEdges = false;

  private b1: GameObject = newObject(); // player 1 paddle (right)
  private b2: GameObject = newObject(); // player 2 paddle (left)
  private ball: GameObject = newObject();

  /**
   * Initialise ncurses, paint the title screen, park the game loop, RETURN.
   *
   * Returning is the whole point: `Door.execute()` only reaches the SDK input
   * loop - the one thing that installs `bbsSession.doorInputHandler` - after
   * every start handler has resolved (sdk/src/core/Door.ts:118-131, :250).
   *
   * @param context - the ncurses I/O context (anything with `emit`/`write`)
   * @param onQuit  - called once, when the player has pressed ESC
   */
  start(context: unknown, onQuit: () => void): void {
    this.quitCallback = onQuit;

    // Original C: initscr(); start_color(); init_pair(1,COLOR_BLUE,COLOR_BLACK);
    initscr(context);
    start_color();
    init_pair(1, COLOR_BLUE, COLOR_BLACK);

    // Original C: keypad(stdscr,true); noecho(); curs_set(0);
    const stdscr = getStdscr();
    if (stdscr) {
      keypad(stdscr, true);
    }
    noecho();
    curs_set(0);

    // Original C: getmaxyx(stdscr,scr.y,scr.x);
    this.scrY = getLINES();
    this.scrX = getCOLS();

    // Original C: object b1={scr.x-2,scr.y/2,0,false,false}, ...
    this.b1 = { x: this.scrX - 2, y: Math.floor(this.scrY / 2), c: 0, movhor: false, movver: false };
    this.b2 = { x: 1, y: Math.floor(this.scrY / 2), c: 0, movhor: false, movver: false };
    this.ball = {
      x: Math.floor(this.scrX / 2),
      y: Math.floor(this.scrY / 2),
      c: 0,
      movhor: false,
      movver: false,
    };
    this.cont = 0;

    // Show title screen
    mvprintw(
      4,
      0,
      "\t           oooooooooo                                        \n" +
        "\t           888    888  ooooooo    ooooooo    oooooooo8       \n" +
        "\t           888oooo88 888     888 888   888  888    88o       \n" +
        "\t           888       888     888 888   888   888oo888o       \n" +
        "\t          o888o        88ooo88  o888o o888o 888     888      \n" +
        "\t                                             888ooo888     \n\n" +
        "\t Original by Vicente Bolea - Ported to AmiExpress ncurses   \n" +
        "\t \t\t\tPlayer 1 controls: UP/DOWN arrows                \n" +
        "\t \t\t\tPlayer 2 controls: Q (up) and A (down)           \n" +
        "\t \t\t\tPress ANY key to start, P for pause, ESC to quit"
    );

    refresh(); // CRITICAL: Flush output to terminal before waiting for input
    this.phase = "title";

    // The loop this door owns. It runs from the title screen on so that the
    // game has a heartbeat of its own the moment the caller starts it, and it
    // is cleared in stop().
    this.loop = setInterval(() => this.tick(), PONG_TICK_MS);
  }

  /**
   * One iteration of the original `for (nodelay(stdscr,1); !end; usleep(4000))`
   * body, minus the `getch()` (keys arrive through handleKey now).
   */
  tick(): void {
    if (this.phase !== "playing") return;

    const { b1, b2, ball: b } = this;
    const scrX = this.scrX;
    const scrY = this.scrY;

    // Movement comes from the held keys, once per frame - Arkanoid's cadence,
    // and what `DoorInputManager.consumeRepeat` gives with its defaults
    // (`sdk/utils/door-input-manager.ts:322-340`). No client auto-repeat is
    // involved, so there is no 400 ms hesitation before the paddle moves.
    this.stepHeldPaddles();

    // Original C: if (++cont%16==0)
    // Adjust game logic to match new tick rate (was 16 ticks @ 4ms = 64ms).
    // With 33ms ticks, we update every 2 ticks (~66ms).
    this.cont++;
    if (this.cont % 2 === 0) {
      // Ball vertical bounce
      if (b.y === scrY - 1 || b.y === 1) {
        b.movver = !b.movver;
      }

      // Ball horizontal bounce (paddle collision)
      if (b.x >= scrX - 2 || b.x <= 2) {
        b.movhor = !b.movhor;

        if (b.y === b1.y - 1 || b.y === b2.y - 1) {
          b.movver = false;
        } else if (b.y === b1.y + 1 || b.y === b2.y + 1) {
          b.movver = true;
        } else if (b.y !== b1.y && b.y !== b2.y) {
          // Score!
          if (b.x >= scrX - 2) {
            b1.c++;
          } else {
            b2.c++;
          }
          // Reset ball
          b.x = Math.floor(scrX / 2);
          b.y = Math.floor(scrY / 2);
        }
      }

      // Move ball
      b.x = b.movhor ? b.x + 1 : b.x - 1;
      b.y = b.movver ? b.y + 1 : b.y - 1;

    }

    // Original C wrapped the paddles inside the physics tick; they can now
    // move on any frame, so the wrap runs on any frame too - otherwise a held
    // key can walk a paddle off the board for a frame before it is caught.
    if (b1.y <= 1) b1.y = scrY - 2;
    if (b1.y >= scrY - 1) b1.y = 2;
    if (b2.y <= 1) b2.y = scrY - 2;
    if (b2.y >= scrY - 1) b2.y = 2;

    this.draw();
  }

  /**
   * A real key-down edge, from `bbs.onKeyDown`.
   *
   * The client re-sends key-down while a key auto-repeats; only the first
   * edge matters, and `Set.add` makes that free.
   */
  holdKey(key: string): void {
    this.keyEdges = true;
    this.held.add(normaliseKeyName(key));
  }

  /** A real key-up edge, from `bbs.onKeyUp`. */
  releaseKey(key: string): void {
    this.held.delete(normaliseKeyName(key));
  }

  /** Original C: the KEY_UP / KEY_DOWN / Q / A arms of `switch (getch())`. */
  private stepHeldPaddles(): void {
    if (!this.keyEdges) return;
    if (this.held.has("up")) this.b1.y--;
    if (this.held.has("down")) this.b1.y++;
    if (this.held.has("q")) this.b2.y--;
    if (this.held.has("a")) this.b2.y++;
  }

  /**
   * The original `switch (getch())`, driven by the caller's keystroke.
   *
   * @param name - a key name as parsed off the wire: "up", "down", "escape",
   *               or the character itself.
   */
  handleKey(name: string): void {
    if (this.phase === "finished") return;

    // Original C: the `await getch()` under the title screen, and the
    // `nodelay(false); await getch(); nodelay(true);` of the pause - both are
    // "any key continues".
    if (this.phase === "title" || this.phase === "paused") {
      this.phase = "playing";
      return;
    }

    // In game mode a key-down reaches the door on BOTH paths - the key-state
    // handler at `socket-handlers.ts:527` and the input handler at :536 - so
    // once real edges are arriving, movement belongs to the held-key loop
    // alone. Acting here as well would step the paddle twice per press
    // (`sdk/utils/door-input-manager.ts:287-292` says the same).
    if (this.keyEdges && MOVEMENT_KEYS.has(name)) return;

    switch (name) {
      case "down":
        this.b1.y++;
        break;
      case "up":
        this.b1.y--;
        break;
      case "q":
      case "Q":
        this.b2.y--;
        break;
      case "a":
      case "A":
        this.b2.y++;
        break;
      case "p":
      case "P":
        // Pause - wait for any key
        this.phase = "paused";
        break;
      case "escape":
        this.quit();
        break;
    }
  }

  /**
   * Stop the game loop and leave ncurses mode. Idempotent: the door calls it
   * from its close handler as well as from the ESC path, and `endwin()` puts
   * real bytes on the wire (show cursor, reset attributes, leave the alternate
   * screen). The phase guard is what makes the second call a no-op HERE,
   * rather than leaning on `endwin()`'s own `initialized` check
   * (`sdk/engines/ui/ncurses/ncurses.ts:246-249`) to swallow it.
   */
  stop(): void {
    if (this.phase === "finished") return;
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
    this.phase = "finished";
    this.held.clear();
    this.keyEdges = false;
    endwin();
  }

  /** Original C: `end = true;` and the `endwin()` after the loop. */
  private quit(): void {
    const onQuit = this.quitCallback;
    this.quitCallback = null;
    this.stop();
    if (onQuit) onQuit();
  }

  /** The drawing half of the original loop body. */
  private draw(): void {
    const { b1, b2, ball: b } = this;
    const scrX = this.scrX;
    const scrY = this.scrY;

    erase();

    // Score display
    mvprintw(2, Math.floor(scrX / 2) - 2, `${b1.c} | ${b2.c}`);

    // Center line
    mvvline(0, Math.floor(scrX / 2), ACS_VLINE, scrY);

    // Ball and paddles in blue
    attron(COLOR_PAIR(1));
    mvprintw(b.y, b.x, "o");
    for (let i = -1; i < 2; i++) {
      mvprintw(b1.y + i, b1.x, "|");
      mvprintw(b2.y + i, b2.x, "|");
    }
    attroff(COLOR_PAIR(1));

    refresh(); // CRITICAL: Send the updated buffer to the terminal!
  }
}
