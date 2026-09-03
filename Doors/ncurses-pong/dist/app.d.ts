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
/**
 * One tick of the game loop.
 *
 * Original C: usleep(4000) - 4000 microseconds = 4ms.
 * BBS optimisation: 33ms = ~30fps, much better for network/CPU.
 */
export declare const PONG_TICK_MS = 33;
export declare class PongDoor {
    name: string;
    version: string;
    author: string;
    description: string;
    private phase;
    private loop;
    private quitCallback;
    private scrX;
    private scrY;
    private cont;
    /**
     * Keys held right now, from real key-down/key-up edges.
     *
     * The client's game-mode auto-repeat waits 400 ms before it starts
     * (`packages/terminal/src/components/BBSTerminal.tsx:1342`), so a door that
     * moves once per delivered key stutters on a held key however fast the game
     * loop runs. Every arcade door in this repo avoids that the same way - hold
     * the key state, step once per frame - and this is that state.
     */
    private held;
    /**
     * True once a real key-down edge has arrived, i.e. this caller's transport
     * sends key events at all. Telnet does not, and there the character path
     * below stays in charge.
     */
    private keyEdges;
    private b1;
    private b2;
    private ball;
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
    start(context: unknown, onQuit: () => void): void;
    /**
     * One iteration of the original `for (nodelay(stdscr,1); !end; usleep(4000))`
     * body, minus the `getch()` (keys arrive through handleKey now).
     */
    tick(): void;
    /**
     * A real key-down edge, from `bbs.onKeyDown`.
     *
     * The client re-sends key-down while a key auto-repeats; only the first
     * edge matters, and `Set.add` makes that free.
     */
    holdKey(key: string): void;
    /** A real key-up edge, from `bbs.onKeyUp`. */
    releaseKey(key: string): void;
    /** Original C: the KEY_UP / KEY_DOWN / Q / A arms of `switch (getch())`. */
    private stepHeldPaddles;
    /**
     * The original `switch (getch())`, driven by the caller's keystroke.
     *
     * @param name - a key name as parsed off the wire: "up", "down", "escape",
     *               or the character itself.
     */
    handleKey(name: string): void;
    /**
     * Stop the game loop and leave ncurses mode. Idempotent: the door calls it
     * from its close handler as well as from the ESC path, and `endwin()` puts
     * real bytes on the wire (show cursor, reset attributes, leave the alternate
     * screen). The phase guard is what makes the second call a no-op HERE,
     * rather than leaning on `endwin()`'s own `initialized` check
     * (`sdk/engines/ui/ncurses/ncurses.ts:246-249`) to swallow it.
     */
    stop(): void;
    /** Original C: `end = true;` and the `endwin()` after the loop. */
    private quit;
    /** The drawing half of the original loop body. */
    private draw;
}
