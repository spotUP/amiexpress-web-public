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
     * The original `switch (getch())`, driven by the caller's keystroke.
     *
     * @param name - a key name as parsed off the wire: "up", "down", "escape",
     *               or the character itself.
     */
    handleKey(name: string): void;
    /**
     * Stop the game loop and leave ncurses mode. Idempotent: the door calls it
     * from its close handler as well as from the ESC path.
     */
    stop(): void;
    /** Original C: `end = true;` and the `endwin()` after the loop. */
    private quit;
    /** The drawing half of the original loop body. */
    private draw;
}
