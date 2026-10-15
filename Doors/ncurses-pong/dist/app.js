"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PongDoor = exports.PONG_TICK_MS = void 0;
const ncurses_1 = require("@amiexpress/bbs-door-sdk/engines/ui/ncurses");
function newObject() {
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
function normaliseKeyName(key) {
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
 * One tick of the game loop.
 *
 * Original C: usleep(4000) - 4000 microseconds = 4ms.
 * BBS optimisation: 33ms = ~30fps, much better for network/CPU.
 */
exports.PONG_TICK_MS = 33;
class PongDoor {
    constructor() {
        this.name = "ncurses-pong";
        this.version = "1.0.0";
        this.author = "Vicente Bolea (original), AmiExpress (port)";
        this.description = "Classic Pong - ncurses port validation";
        this.phase = "finished";
        this.loop = null;
        this.quitCallback = null;
        this.scrX = 0;
        this.scrY = 0;
        this.cont = 0;
        /**
         * Keys held right now, from real key-down/key-up edges.
         *
         * The client's game-mode auto-repeat waits 400 ms before it starts
         * (`packages/terminal/src/components/BBSTerminal.tsx:1342`), so a door that
         * moves once per delivered key stutters on a held key however fast the game
         * loop runs. Every arcade door in this repo avoids that the same way - hold
         * the key state, step once per frame - and this is that state.
         */
        this.held = new Set();
        /**
         * True once a real key-down edge has arrived, i.e. this caller's transport
         * sends key events at all. Telnet does not, and there the character path
         * below stays in charge.
         */
        this.keyEdges = false;
        this.b1 = newObject(); // player 1 paddle (right)
        this.b2 = newObject(); // player 2 paddle (left)
        this.ball = newObject();
    }
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
    start(context, onQuit) {
        this.quitCallback = onQuit;
        // Original C: initscr(); start_color(); init_pair(1,COLOR_BLUE,COLOR_BLACK);
        (0, ncurses_1.initscr)(context);
        (0, ncurses_1.start_color)();
        (0, ncurses_1.init_pair)(1, ncurses_1.COLOR_BLUE, ncurses_1.COLOR_BLACK);
        // Original C: keypad(stdscr,true); noecho(); curs_set(0);
        const stdscr = (0, ncurses_1.getStdscr)();
        if (stdscr) {
            (0, ncurses_1.keypad)(stdscr, true);
        }
        (0, ncurses_1.noecho)();
        (0, ncurses_1.curs_set)(0);
        // Original C: getmaxyx(stdscr,scr.y,scr.x);
        this.scrY = (0, ncurses_1.getLINES)();
        this.scrX = (0, ncurses_1.getCOLS)();
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
        (0, ncurses_1.mvprintw)(4, 0, "\t           oooooooooo                                        \n" +
            "\t           888    888  ooooooo    ooooooo    oooooooo8       \n" +
            "\t           888oooo88 888     888 888   888  888    88o       \n" +
            "\t           888       888     888 888   888   888oo888o       \n" +
            "\t          o888o        88ooo88  o888o o888o 888     888      \n" +
            "\t                                             888ooo888     \n\n" +
            "\t Original by Vicente Bolea - Ported to AmiExpress ncurses   \n" +
            "\t \t\t\tPlayer 1 controls: UP/DOWN arrows                \n" +
            "\t \t\t\tPlayer 2 controls: Q (up) and A (down)           \n" +
            "\t \t\t\tPress ANY key to start, P for pause, ESC to quit");
        (0, ncurses_1.refresh)(); // CRITICAL: Flush output to terminal before waiting for input
        this.phase = "title";
        // The loop this door owns. It runs from the title screen on so that the
        // game has a heartbeat of its own the moment the caller starts it, and it
        // is cleared in stop().
        this.loop = setInterval(() => this.tick(), exports.PONG_TICK_MS);
    }
    /**
     * One iteration of the original `for (nodelay(stdscr,1); !end; usleep(4000))`
     * body, minus the `getch()` (keys arrive through handleKey now).
     */
    tick() {
        if (this.phase !== "playing")
            return;
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
                }
                else if (b.y === b1.y + 1 || b.y === b2.y + 1) {
                    b.movver = true;
                }
                else if (b.y !== b1.y && b.y !== b2.y) {
                    // Score!
                    if (b.x >= scrX - 2) {
                        b1.c++;
                    }
                    else {
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
        if (b1.y <= 1)
            b1.y = scrY - 2;
        if (b1.y >= scrY - 1)
            b1.y = 2;
        if (b2.y <= 1)
            b2.y = scrY - 2;
        if (b2.y >= scrY - 1)
            b2.y = 2;
        this.draw();
    }
    /**
     * A real key-down edge, from `bbs.onKeyDown`.
     *
     * The client re-sends key-down while a key auto-repeats; only the first
     * edge matters, and `Set.add` makes that free.
     */
    holdKey(key) {
        this.keyEdges = true;
        this.held.add(normaliseKeyName(key));
    }
    /** A real key-up edge, from `bbs.onKeyUp`. */
    releaseKey(key) {
        this.held.delete(normaliseKeyName(key));
    }
    /** Original C: the KEY_UP / KEY_DOWN / Q / A arms of `switch (getch())`. */
    stepHeldPaddles() {
        if (!this.keyEdges)
            return;
        if (this.held.has("up"))
            this.b1.y--;
        if (this.held.has("down"))
            this.b1.y++;
        if (this.held.has("q"))
            this.b2.y--;
        if (this.held.has("a"))
            this.b2.y++;
    }
    /**
     * The original `switch (getch())`, driven by the caller's keystroke.
     *
     * @param name - a key name as parsed off the wire: "up", "down", "escape",
     *               or the character itself.
     */
    handleKey(name) {
        if (this.phase === "finished")
            return;
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
        if (this.keyEdges && MOVEMENT_KEYS.has(name))
            return;
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
    stop() {
        if (this.phase === "finished")
            return;
        if (this.loop) {
            clearInterval(this.loop);
            this.loop = null;
        }
        this.phase = "finished";
        this.held.clear();
        this.keyEdges = false;
        (0, ncurses_1.endwin)();
    }
    /** Original C: `end = true;` and the `endwin()` after the loop. */
    quit() {
        const onQuit = this.quitCallback;
        this.quitCallback = null;
        this.stop();
        if (onQuit)
            onQuit();
    }
    /** The drawing half of the original loop body. */
    draw() {
        const { b1, b2, ball: b } = this;
        const scrX = this.scrX;
        const scrY = this.scrY;
        (0, ncurses_1.erase)();
        // Score display
        (0, ncurses_1.mvprintw)(2, Math.floor(scrX / 2) - 2, `${b1.c} | ${b2.c}`);
        // Center line
        (0, ncurses_1.mvvline)(0, Math.floor(scrX / 2), ncurses_1.ACS_VLINE, scrY);
        // Ball and paddles in blue
        (0, ncurses_1.attron)((0, ncurses_1.COLOR_PAIR)(1));
        (0, ncurses_1.mvprintw)(b.y, b.x, "o");
        for (let i = -1; i < 2; i++) {
            (0, ncurses_1.mvprintw)(b1.y + i, b1.x, "|");
            (0, ncurses_1.mvprintw)(b2.y + i, b2.x, "|");
        }
        (0, ncurses_1.attroff)((0, ncurses_1.COLOR_PAIR)(1));
        (0, ncurses_1.refresh)(); // CRITICAL: Send the updated buffer to the terminal!
    }
}
exports.PongDoor = PongDoor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7OztBQUVILHlFQThCcUQ7QUFXckQsU0FBUyxTQUFTO0lBQ2hCLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUM1RCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILFNBQVMsZ0JBQWdCLENBQUMsR0FBVztJQUNuQyxRQUFRLEdBQUcsRUFBRSxDQUFDO1FBQ1osS0FBSyxXQUFXLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztRQUNoQyxLQUFLLFlBQVksQ0FBQyxDQUFDLE9BQU8sT0FBTyxDQUFDO1FBQ2xDLEtBQUssU0FBUyxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUM7UUFDNUIsS0FBSyxXQUFXLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztRQUNoQyxLQUFLLEdBQUcsQ0FBQztRQUNULEtBQUssVUFBVSxDQUFDLENBQUMsT0FBTyxPQUFPLENBQUM7UUFDaEMsS0FBSyxPQUFPLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztRQUM3QixLQUFLLFFBQVEsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDO1FBQy9CLE9BQU8sQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3BDLENBQUM7QUFDSCxDQUFDO0FBRUQscUVBQXFFO0FBQ3JFLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQVd4RDs7Ozs7R0FLRztBQUNVLFFBQUEsWUFBWSxHQUFHLEVBQUUsQ0FBQztBQUUvQixNQUFhLFFBQVE7SUFBckI7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Q0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUNELElBQUEsaUJBQU8sRUFBQyxJQUFBLG9CQUFVLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV2QixJQUFBLGlCQUFPLEdBQUUsQ0FBQyxDQUFDLHFEQUFxRDtJQUNsRSxDQUFDO0NBQ0Y7QUF4U0QsNEJBd1NDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBuY3Vyc2VzLXBvbmcgLSBQb3J0IG9mIHZpY2VudGVib2xlYS9Qb25nLWN1cnNlcyAofjcxIGxpbmVzKVxuICpcbiAqIE9yaWdpbmFsIEMgY29kZTogaHR0cHM6Ly9naXRodWIuY29tL3ZpY2VudGVib2xlYS9Qb25nLWN1cnNlc1xuICogQXV0aG9yOiBWaWNlbnRlIEFkb2xmbyBCb2xlYSBTYW5jaGV6IDx2aWNlbnRlLmJvbGVhQGdtYWlsLmNvbT5cbiAqXG4gKiBUaGlzIHBvcnQgdmFsaWRhdGVzIHRoZSBuY3Vyc2VzIGNvbXBhdGliaWxpdHkgbGF5ZXIgYnkgcG9ydGluZ1xuICogYSByZWFsIG5jdXJzZXMgZ2FtZSB3aXRoIG1pbmltYWwgY2hhbmdlcyBmcm9tIHRoZSBvcmlnaW5hbCBDLlxuICpcbiAqIEtleSBkaWZmZXJlbmNlcyBmcm9tIEM6XG4gKiAtIHR5cGVkZWYgc3RydWN0IHJlcGxhY2VkIHdpdGggaW50ZXJmYWNlXG4gKiAtIGdldG1heHl4IG1hY3JvIHJlcGxhY2VkIHdpdGggZ2V0TElORVMvZ2V0Q09MU1xuICogLSB0aGUgQyBgd2hpbGUgKCFlbmQpIHsgdXNsZWVwKDQwMDApOyAuLi4gZ2V0Y2goKTsgfWAgbG9vcCBpcyBJTlZFUlRFRDpcbiAqICAgYSBCQlMgZG9vciBpcyBkcml2ZW4gYnkgdGhlIGNhbGxlcidzIGtleXN0cm9rZXMsIG5vdCBieSBhIGJsb2NraW5nIHJlYWQuXG4gKiAgIGBzdGFydCgpYCBwYWludHMgYW5kIHBhcmtzIHRoZSBsb29wIG9uIGFuIGludGVydmFsIGl0IG93bnM7IGB0aWNrKClgIGlzXG4gKiAgIG9uZSBpdGVyYXRpb24gb2YgdGhlIG9sZCBsb29wIGJvZHk7IGBoYW5kbGVLZXkoKWAgaXMgdGhlIG9sZFxuICogICBgc3dpdGNoIChnZXRjaCgpKWAuIFNlZSB0aGUgcmVwb3J0IHJlZmVyZW5jZWQgaW4gaW5kZXgudHMgZm9yIHdoeS5cbiAqL1xuXG5pbXBvcnQge1xuICAvLyBJbml0aWFsaXphdGlvblxuICBpbml0c2NyLFxuICBlbmR3aW4sXG4gIHN0YXJ0X2NvbG9yLFxuICBpbml0X3BhaXIsXG4gIGtleXBhZCxcbiAgbm9lY2hvLFxuICBjdXJzX3NldCxcbiAgZ2V0U3Rkc2NyLFxuXG4gIC8vIFNjcmVlbiBpbmZvXG4gIGdldExJTkVTLFxuICBnZXRDT0xTLFxuXG4gIC8vIE91dHB1dFxuICBtdnByaW50dyxcbiAgbXZ2bGluZSxcbiAgZXJhc2UsXG4gIHJlZnJlc2gsXG5cbiAgLy8gQXR0cmlidXRlc1xuICBhdHRyb24sXG4gIGF0dHJvZmYsXG4gIENPTE9SX1BBSVIsXG5cbiAgLy8gQ29uc3RhbnRzXG4gIENPTE9SX0JMVUUsXG4gIENPTE9SX0JMQUNLLFxuICBBQ1NfVkxJTkUsXG59IGZyb20gXCJAYW1pZXhwcmVzcy9iYnMtZG9vci1zZGsvZW5naW5lcy91aS9uY3Vyc2VzXCI7XG5cbi8vIE9yaWdpbmFsIEM6IHR5cGVkZWYgc3RydWN0e3Nob3J0IGludCB4LCB5LCBjOyBib29sIG1vdmhvciwgbW92dmVyO30gb2JqZWN0O1xuaW50ZXJmYWNlIEdhbWVPYmplY3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgYzogbnVtYmVyOyAvLyBzY29yZSBjb3VudGVyXG4gIG1vdmhvcjogYm9vbGVhbjtcbiAgbW92dmVyOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBuZXdPYmplY3QoKTogR2FtZU9iamVjdCB7XG4gIHJldHVybiB7IHg6IDAsIHk6IDAsIGM6IDAsIG1vdmhvcjogZmFsc2UsIG1vdnZlcjogZmFsc2UgfTtcbn1cblxuLyoqXG4gKiBCcm93c2VyIGBLZXlib2FyZEV2ZW50LmtleWAgLT4gdGhlIHNob3J0IG5hbWUgZG9vcnMgdGhpbmsgaW4uXG4gKlxuICogU2FtZSBtYXBwaW5nIGFzIHRoZSBTREsncyBgRG9vcklucHV0TWFuYWdlci5ub3JtYWxpc2VLZXlOYW1lYFxuICogKGBzZGsvdXRpbHMvZG9vci1pbnB1dC1tYW5hZ2VyLnRzOjIzMy0yNDVgKSwgd2hpY2ggaXMgYHByaXZhdGUgc3RhdGljYCBhbmRcbiAqIHNvIGNhbm5vdCBiZSBpbXBvcnRlZC4gS2VwdCBpbiBzdGVwIHdpdGggaXQgZGVsaWJlcmF0ZWx5OiB0aGUgdHdvIG11c3RcbiAqIGFncmVlIG9uIG5hbWVzIG9yIGEgZG9vciBhbmQgdGhlIG1hbmFnZXIgd291bGQgZGlzYWdyZWUgYWJvdXQgXCJ1cFwiLlxuICovXG5mdW5jdGlvbiBub3JtYWxpc2VLZXlOYW1lKGtleTogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChrZXkpIHtcbiAgICBjYXNlIFwiQXJyb3dMZWZ0XCI6IHJldHVybiBcImxlZnRcIjtcbiAgICBjYXNlIFwiQXJyb3dSaWdodFwiOiByZXR1cm4gXCJyaWdodFwiO1xuICAgIGNhc2UgXCJBcnJvd1VwXCI6IHJldHVybiBcInVwXCI7XG4gICAgY2FzZSBcIkFycm93RG93blwiOiByZXR1cm4gXCJkb3duXCI7XG4gICAgY2FzZSBcIiBcIjpcbiAgICBjYXNlIFwiU3BhY2ViYXJcIjogcmV0dXJuIFwic3BhY2VcIjtcbiAgICBjYXNlIFwiRW50ZXJcIjogcmV0dXJuIFwiZW50ZXJcIjtcbiAgICBjYXNlIFwiRXNjYXBlXCI6IHJldHVybiBcImVzY2FwZVwiO1xuICAgIGRlZmF1bHQ6IHJldHVybiBrZXkudG9Mb3dlckNhc2UoKTtcbiAgfVxufVxuXG4vKiogVGhlIGtleXMgdGhhdCBtb3ZlIGEgcGFkZGxlIC0gdGhlIG9uZXMgdGhlIGhlbGQta2V5IGxvb3Agb3ducy4gKi9cbmNvbnN0IE1PVkVNRU5UX0tFWVMgPSBuZXcgU2V0KFtcInVwXCIsIFwiZG93blwiLCBcInFcIiwgXCJhXCJdKTtcblxuLyoqXG4gKiBQaGFzZXMgb2YgYSBnYW1lLlxuICpcbiAqIGB0aXRsZWAgaXMgdGhlIG9yaWdpbmFsJ3MgYGF3YWl0IGdldGNoKClgIGJlZm9yZSBgbm9kZWxheShzdGRzY3IsMSlgOlxuICogdGhlIGJvYXJkIGlzIHBhaW50ZWQgYnV0IGZyb3plbiB1bnRpbCB0aGUgY2FsbGVyIHByZXNzZXMgc29tZXRoaW5nLlxuICogYHBhdXNlZGAgaXMgdGhlIG9yaWdpbmFsJ3MgYG5vZGVsYXkoZmFsc2UpOyBhd2FpdCBnZXRjaCgpOyBub2RlbGF5KHRydWUpO2AuXG4gKi9cbnR5cGUgUG9uZ1BoYXNlID0gXCJ0aXRsZVwiIHwgXCJwbGF5aW5nXCIgfCBcInBhdXNlZFwiIHwgXCJmaW5pc2hlZFwiO1xuXG4vKipcbiAqIE9uZSB0aWNrIG9mIHRoZSBnYW1lIGxvb3AuXG4gKlxuICogT3JpZ2luYWwgQzogdXNsZWVwKDQwMDApIC0gNDAwMCBtaWNyb3NlY29uZHMgPSA0bXMuXG4gKiBCQlMgb3B0aW1pc2F0aW9uOiAzM21zID0gfjMwZnBzLCBtdWNoIGJldHRlciBmb3IgbmV0d29yay9DUFUuXG4gKi9cbmV4cG9ydCBjb25zdCBQT05HX1RJQ0tfTVMgPSAzMztcblxuZXhwb3J0IGNsYXNzIFBvbmdEb29yIHtcbiAgbmFtZSA9IFwibmN1cnNlcy1wb25nXCI7XG4gIHZlcnNpb24gPSBcIjEuMC4wXCI7XG4gIGF1dGhvciA9IFwiVmljZW50ZSBCb2xlYSAob3JpZ2luYWwpLCBBbWlFeHByZXNzIChwb3J0KVwiO1xuICBkZXNjcmlwdGlvbiA9IFwiQ2xhc3NpYyBQb25nIC0gbmN1cnNlcyBwb3J0IHZhbGlkYXRpb25cIjtcblxuICBwcml2YXRlIHBoYXNlOiBQb25nUGhhc2UgPSBcImZpbmlzaGVkXCI7XG4gIHByaXZhdGUgbG9vcDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0SW50ZXJ2YWw+IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcXVpdENhbGxiYWNrOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIHNjclggPSAwO1xuICBwcml2YXRlIHNjclkgPSAwO1xuICBwcml2YXRlIGNvbnQgPSAwO1xuXG4gIC8qKlxuICAgKiBLZXlzIGhlbGQgcmlnaHQgbm93LCBmcm9tIHJlYWwga2V5LWRvd24va2V5LXVwIGVkZ2VzLlxuICAgKlxuICAgKiBUaGUgY2xpZW50J3MgZ2FtZS1tb2RlIGF1dG8tcmVwZWF0IHdhaXRzIDQwMCBtcyBiZWZvcmUgaXQgc3RhcnRzXG4gICAqIChgcGFja2FnZXMvdGVybWluYWwvc3JjL2NvbXBvbmVudHMvQkJTVGVybWluYWwudHN4OjEzNDJgKSwgc28gYSBkb29yIHRoYXRcbiAgICogbW92ZXMgb25jZSBwZXIgZGVsaXZlcmVkIGtleSBzdHV0dGVycyBvbiBhIGhlbGQga2V5IGhvd2V2ZXIgZmFzdCB0aGUgZ2FtZVxuICAgKiBsb29wIHJ1bnMuIEV2ZXJ5IGFyY2FkZSBkb29yIGluIHRoaXMgcmVwbyBhdm9pZHMgdGhhdCB0aGUgc2FtZSB3YXkgLSBob2xkXG4gICAqIHRoZSBrZXkgc3RhdGUsIHN0ZXAgb25jZSBwZXIgZnJhbWUgLSBhbmQgdGhpcyBpcyB0aGF0IHN0YXRlLlxuICAgKi9cbiAgcHJpdmF0ZSBoZWxkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblxuICAvKipcbiAgICogVHJ1ZSBvbmNlIGEgcmVhbCBrZXktZG93biBlZGdlIGhhcyBhcnJpdmVkLCBpLmUuIHRoaXMgY2FsbGVyJ3MgdHJhbnNwb3J0XG4gICAqIHNlbmRzIGtleSBldmVudHMgYXQgYWxsLiBUZWxuZXQgZG9lcyBub3QsIGFuZCB0aGVyZSB0aGUgY2hhcmFjdGVyIHBhdGhcbiAgICogYmVsb3cgc3RheXMgaW4gY2hhcmdlLlxuICAgKi9cbiAgcHJpdmF0ZSBrZXlFZGdlcyA9IGZhbHNlO1xuXG4gIHByaXZhdGUgYjE6IEdhbWVPYmplY3QgPSBuZXdPYmplY3QoKTsgLy8gcGxheWVyIDEgcGFkZGxlIChyaWdodClcbiAgcHJpdmF0ZSBiMjogR2FtZU9iamVjdCA9IG5ld09iamVjdCgpOyAvLyBwbGF5ZXIgMiBwYWRkbGUgKGxlZnQpXG4gIHByaXZhdGUgYmFsbDogR2FtZU9iamVjdCA9IG5ld09iamVjdCgpO1xuXG4gIC8qKlxuICAgKiBJbml0aWFsaXNlIG5jdXJzZXMsIHBhaW50IHRoZSB0aXRsZSBzY3JlZW4sIHBhcmsgdGhlIGdhbWUgbG9vcCwgUkVUVVJOLlxuICAgKlxuICAgKiBSZXR1cm5pbmcgaXMgdGhlIHdob2xlIHBvaW50OiBgRG9vci5leGVjdXRlKClgIG9ubHkgcmVhY2hlcyB0aGUgU0RLIGlucHV0XG4gICAqIGxvb3AgLSB0aGUgb25lIHRoaW5nIHRoYXQgaW5zdGFsbHMgYGJic1Nlc3Npb24uZG9vcklucHV0SGFuZGxlcmAgLSBhZnRlclxuICAgKiBldmVyeSBzdGFydCBoYW5kbGVyIGhhcyByZXNvbHZlZCAoc2RrL3NyYy9jb3JlL0Rvb3IudHM6MTE4LTEzMSwgOjI1MCkuXG4gICAqXG4gICAqIEBwYXJhbSBjb250ZXh0IC0gdGhlIG5jdXJzZXMgSS9PIGNvbnRleHQgKGFueXRoaW5nIHdpdGggYGVtaXRgL2B3cml0ZWApXG4gICAqIEBwYXJhbSBvblF1aXQgIC0gY2FsbGVkIG9uY2UsIHdoZW4gdGhlIHBsYXllciBoYXMgcHJlc3NlZCBFU0NcbiAgICovXG4gIHN0YXJ0KGNvbnRleHQ6IHVua25vd24sIG9uUXVpdDogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMucXVpdENhbGxiYWNrID0gb25RdWl0O1xuXG4gICAgLy8gT3JpZ2luYWwgQzogaW5pdHNjcigpOyBzdGFydF9jb2xvcigpOyBpbml0X3BhaXIoMSxDT0xPUl9CTFVFLENPTE9SX0JMQUNLKTtcbiAgICBpbml0c2NyKGNvbnRleHQpO1xuICAgIHN0YXJ0X2NvbG9yKCk7XG4gICAgaW5pdF9wYWlyKDEsIENPTE9SX0JMVUUsIENPTE9SX0JMQUNLKTtcblxuICAgIC8vIE9yaWdpbmFsIEM6IGtleXBhZChzdGRzY3IsdHJ1ZSk7IG5vZWNobygpOyBjdXJzX3NldCgwKTtcbiAgICBjb25zdCBzdGRzY3IgPSBnZXRTdGRzY3IoKTtcbiAgICBpZiAoc3Rkc2NyKSB7XG4gICAgICBrZXlwYWQoc3Rkc2NyLCB0cnVlKTtcbiAgICB9XG4gICAgbm9lY2hvKCk7XG4gICAgY3Vyc19zZXQoMCk7XG5cbiAgICAvLyBPcmlnaW5hbCBDOiBnZXRtYXh5eChzdGRzY3Isc2NyLnksc2NyLngpO1xuICAgIHRoaXMuc2NyWSA9IGdldExJTkVTKCk7XG4gICAgdGhpcy5zY3JYID0gZ2V0Q09MUygpO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogb2JqZWN0IGIxPXtzY3IueC0yLHNjci55LzIsMCxmYWxzZSxmYWxzZX0sIC4uLlxuICAgIHRoaXMuYjEgPSB7IHg6IHRoaXMuc2NyWCAtIDIsIHk6IE1hdGguZmxvb3IodGhpcy5zY3JZIC8gMiksIGM6IDAsIG1vdmhvcjogZmFsc2UsIG1vdnZlcjogZmFsc2UgfTtcbiAgICB0aGlzLmIyID0geyB4OiAxLCB5OiBNYXRoLmZsb29yKHRoaXMuc2NyWSAvIDIpLCBjOiAwLCBtb3Zob3I6IGZhbHNlLCBtb3Z2ZXI6IGZhbHNlIH07XG4gICAgdGhpcy5iYWxsID0ge1xuICAgICAgeDogTWF0aC5mbG9vcih0aGlzLnNjclggLyAyKSxcbiAgICAgIHk6IE1hdGguZmxvb3IodGhpcy5zY3JZIC8gMiksXG4gICAgICBjOiAwLFxuICAgICAgbW92aG9yOiBmYWxzZSxcbiAgICAgIG1vdnZlcjogZmFsc2UsXG4gICAgfTtcbiAgICB0aGlzLmNvbnQgPSAwO1xuXG4gICAgLy8gU2hvdyB0aXRsZSBzY3JlZW5cbiAgICBtdnByaW50dyhcbiAgICAgIDQsXG4gICAgICAwLFxuICAgICAgXCJcXHQgICAgICAgICAgIG9vb29vb29vb28gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICAgODg4ICAgIDg4OCAgb29vb29vbyAgICBvb29vb29vICAgIG9vb29vb29vOCAgICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgICA4ODhvb29vODggODg4ICAgICA4ODggODg4ICAgODg4ICA4ODggICAgODhvICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgICAgICAgICAgIDg4OCAgICAgICA4ODggICAgIDg4OCA4ODggICA4ODggICA4ODhvbzg4OG8gICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICBvODg4byAgICAgICAgODhvb284OCAgbzg4OG8gbzg4OG8gODg4ICAgICA4ODggICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgODg4b29vODg4ICAgICBcXG5cXG5cIiArXG4gICAgICAgIFwiXFx0IE9yaWdpbmFsIGJ5IFZpY2VudGUgQm9sZWEgLSBQb3J0ZWQgdG8gQW1pRXhwcmVzcyBuY3Vyc2VzICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCBcXHRcXHRcXHRQbGF5ZXIgMSBjb250cm9sczogVVAvRE9XTiBhcnJvd3MgICAgICAgICAgICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCBcXHRcXHRcXHRQbGF5ZXIgMiBjb250cm9sczogUSAodXApIGFuZCBBIChkb3duKSAgICAgICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCBcXHRcXHRcXHRQcmVzcyBBTlkga2V5IHRvIHN0YXJ0LCBQIGZvciBwYXVzZSwgRVNDIHRvIHF1aXRcIlxuICAgICk7XG5cbiAgICByZWZyZXNoKCk7IC8vIENSSVRJQ0FMOiBGbHVzaCBvdXRwdXQgdG8gdGVybWluYWwgYmVmb3JlIHdhaXRpbmcgZm9yIGlucHV0XG4gICAgdGhpcy5waGFzZSA9IFwidGl0bGVcIjtcblxuICAgIC8vIFRoZSBsb29wIHRoaXMgZG9vciBvd25zLiBJdCBydW5zIGZyb20gdGhlIHRpdGxlIHNjcmVlbiBvbiBzbyB0aGF0IHRoZVxuICAgIC8vIGdhbWUgaGFzIGEgaGVhcnRiZWF0IG9mIGl0cyBvd24gdGhlIG1vbWVudCB0aGUgY2FsbGVyIHN0YXJ0cyBpdCwgYW5kIGl0XG4gICAgLy8gaXMgY2xlYXJlZCBpbiBzdG9wKCkuXG4gICAgdGhpcy5sb29wID0gc2V0SW50ZXJ2YWwoKCkgPT4gdGhpcy50aWNrKCksIFBPTkdfVElDS19NUyk7XG4gIH1cblxuICAvKipcbiAgICogT25lIGl0ZXJhdGlvbiBvZiB0aGUgb3JpZ2luYWwgYGZvciAobm9kZWxheShzdGRzY3IsMSk7ICFlbmQ7IHVzbGVlcCg0MDAwKSlgXG4gICAqIGJvZHksIG1pbnVzIHRoZSBgZ2V0Y2goKWAgKGtleXMgYXJyaXZlIHRocm91Z2ggaGFuZGxlS2V5IG5vdykuXG4gICAqL1xuICB0aWNrKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnBoYXNlICE9PSBcInBsYXlpbmdcIikgcmV0dXJuO1xuXG4gICAgY29uc3QgeyBiMSwgYjIsIGJhbGw6IGIgfSA9IHRoaXM7XG4gICAgY29uc3Qgc2NyWCA9IHRoaXMuc2NyWDtcbiAgICBjb25zdCBzY3JZID0gdGhpcy5zY3JZO1xuXG4gICAgLy8gTW92ZW1lbnQgY29tZXMgZnJvbSB0aGUgaGVsZCBrZXlzLCBvbmNlIHBlciBmcmFtZSAtIEFya2Fub2lkJ3MgY2FkZW5jZSxcbiAgICAvLyBhbmQgd2hhdCBgRG9vcklucHV0TWFuYWdlci5jb25zdW1lUmVwZWF0YCBnaXZlcyB3aXRoIGl0cyBkZWZhdWx0c1xuICAgIC8vIChgc2RrL3V0aWxzL2Rvb3ItaW5wdXQtbWFuYWdlci50czozMjItMzQwYCkuIE5vIGNsaWVudCBhdXRvLXJlcGVhdCBpc1xuICAgIC8vIGludm9sdmVkLCBzbyB0aGVyZSBpcyBubyA0MDAgbXMgaGVzaXRhdGlvbiBiZWZvcmUgdGhlIHBhZGRsZSBtb3Zlcy5cbiAgICB0aGlzLnN0ZXBIZWxkUGFkZGxlcygpO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogaWYgKCsrY29udCUxNj09MClcbiAgICAvLyBBZGp1c3QgZ2FtZSBsb2dpYyB0byBtYXRjaCBuZXcgdGljayByYXRlICh3YXMgMTYgdGlja3MgQCA0bXMgPSA2NG1zKS5cbiAgICAvLyBXaXRoIDMzbXMgdGlja3MsIHdlIHVwZGF0ZSBldmVyeSAyIHRpY2tzICh+NjZtcykuXG4gICAgdGhpcy5jb250Kys7XG4gICAgaWYgKHRoaXMuY29udCAlIDIgPT09IDApIHtcbiAgICAgIC8vIEJhbGwgdmVydGljYWwgYm91bmNlXG4gICAgICBpZiAoYi55ID09PSBzY3JZIC0gMSB8fCBiLnkgPT09IDEpIHtcbiAgICAgICAgYi5tb3Z2ZXIgPSAhYi5tb3Z2ZXI7XG4gICAgICB9XG5cbiAgICAgIC8vIEJhbGwgaG9yaXpvbnRhbCBib3VuY2UgKHBhZGRsZSBjb2xsaXNpb24pXG4gICAgICBpZiAoYi54ID49IHNjclggLSAyIHx8IGIueCA8PSAyKSB7XG4gICAgICAgIGIubW92aG9yID0gIWIubW92aG9yO1xuXG4gICAgICAgIGlmIChiLnkgPT09IGIxLnkgLSAxIHx8IGIueSA9PT0gYjIueSAtIDEpIHtcbiAgICAgICAgICBiLm1vdnZlciA9IGZhbHNlO1xuICAgICAgICB9IGVsc2UgaWYgKGIueSA9PT0gYjEueSArIDEgfHwgYi55ID09PSBiMi55ICsgMSkge1xuICAgICAgICAgIGIubW92dmVyID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmIChiLnkgIT09IGIxLnkgJiYgYi55ICE9PSBiMi55KSB7XG4gICAgICAgICAgLy8gU2NvcmUhXG4gICAgICAgICAgaWYgKGIueCA+PSBzY3JYIC0gMikge1xuICAgICAgICAgICAgYjEuYysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBiMi5jKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFJlc2V0IGJhbGxcbiAgICAgICAgICBiLnggPSBNYXRoLmZsb29yKHNjclggLyAyKTtcbiAgICAgICAgICBiLnkgPSBNYXRoLmZsb29yKHNjclkgLyAyKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBNb3ZlIGJhbGxcbiAgICAgIGIueCA9IGIubW92aG9yID8gYi54ICsgMSA6IGIueCAtIDE7XG4gICAgICBiLnkgPSBiLm1vdnZlciA/IGIueSArIDEgOiBiLnkgLSAxO1xuXG4gICAgfVxuXG4gICAgLy8gT3JpZ2luYWwgQyB3cmFwcGVkIHRoZSBwYWRkbGVzIGluc2lkZSB0aGUgcGh5c2ljcyB0aWNrOyB0aGV5IGNhbiBub3dcbiAgICAvLyBtb3ZlIG9uIGFueSBmcmFtZSwgc28gdGhlIHdyYXAgcnVucyBvbiBhbnkgZnJhbWUgdG9vIC0gb3RoZXJ3aXNlIGEgaGVsZFxuICAgIC8vIGtleSBjYW4gd2FsayBhIHBhZGRsZSBvZmYgdGhlIGJvYXJkIGZvciBhIGZyYW1lIGJlZm9yZSBpdCBpcyBjYXVnaHQuXG4gICAgaWYgKGIxLnkgPD0gMSkgYjEueSA9IHNjclkgLSAyO1xuICAgIGlmIChiMS55ID49IHNjclkgLSAxKSBiMS55ID0gMjtcbiAgICBpZiAoYjIueSA8PSAxKSBiMi55ID0gc2NyWSAtIDI7XG4gICAgaWYgKGIyLnkgPj0gc2NyWSAtIDEpIGIyLnkgPSAyO1xuXG4gICAgdGhpcy5kcmF3KCk7XG4gIH1cblxuICAvKipcbiAgICogQSByZWFsIGtleS1kb3duIGVkZ2UsIGZyb20gYGJicy5vbktleURvd25gLlxuICAgKlxuICAgKiBUaGUgY2xpZW50IHJlLXNlbmRzIGtleS1kb3duIHdoaWxlIGEga2V5IGF1dG8tcmVwZWF0czsgb25seSB0aGUgZmlyc3RcbiAgICogZWRnZSBtYXR0ZXJzLCBhbmQgYFNldC5hZGRgIG1ha2VzIHRoYXQgZnJlZS5cbiAgICovXG4gIGhvbGRLZXkoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmtleUVkZ2VzID0gdHJ1ZTtcbiAgICB0aGlzLmhlbGQuYWRkKG5vcm1hbGlzZUtleU5hbWUoa2V5KSk7XG4gIH1cblxuICAvKiogQSByZWFsIGtleS11cCBlZGdlLCBmcm9tIGBiYnMub25LZXlVcGAuICovXG4gIHJlbGVhc2VLZXkoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmhlbGQuZGVsZXRlKG5vcm1hbGlzZUtleU5hbWUoa2V5KSk7XG4gIH1cblxuICAvKiogT3JpZ2luYWwgQzogdGhlIEtFWV9VUCAvIEtFWV9ET1dOIC8gUSAvIEEgYXJtcyBvZiBgc3dpdGNoIChnZXRjaCgpKWAuICovXG4gIHByaXZhdGUgc3RlcEhlbGRQYWRkbGVzKCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5rZXlFZGdlcykgcmV0dXJuO1xuICAgIGlmICh0aGlzLmhlbGQuaGFzKFwidXBcIikpIHRoaXMuYjEueS0tO1xuICAgIGlmICh0aGlzLmhlbGQuaGFzKFwiZG93blwiKSkgdGhpcy5iMS55Kys7XG4gICAgaWYgKHRoaXMuaGVsZC5oYXMoXCJxXCIpKSB0aGlzLmIyLnktLTtcbiAgICBpZiAodGhpcy5oZWxkLmhhcyhcImFcIikpIHRoaXMuYjIueSsrO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBvcmlnaW5hbCBgc3dpdGNoIChnZXRjaCgpKWAsIGRyaXZlbiBieSB0aGUgY2FsbGVyJ3Mga2V5c3Ryb2tlLlxuICAgKlxuICAgKiBAcGFyYW0gbmFtZSAtIGEga2V5IG5hbWUgYXMgcGFyc2VkIG9mZiB0aGUgd2lyZTogXCJ1cFwiLCBcImRvd25cIiwgXCJlc2NhcGVcIixcbiAgICogICAgICAgICAgICAgICBvciB0aGUgY2hhcmFjdGVyIGl0c2VsZi5cbiAgICovXG4gIGhhbmRsZUtleShuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5waGFzZSA9PT0gXCJmaW5pc2hlZFwiKSByZXR1cm47XG5cbiAgICAvLyBPcmlnaW5hbCBDOiB0aGUgYGF3YWl0IGdldGNoKClgIHVuZGVyIHRoZSB0aXRsZSBzY3JlZW4sIGFuZCB0aGVcbiAgICAvLyBgbm9kZWxheShmYWxzZSk7IGF3YWl0IGdldGNoKCk7IG5vZGVsYXkodHJ1ZSk7YCBvZiB0aGUgcGF1c2UgLSBib3RoIGFyZVxuICAgIC8vIFwiYW55IGtleSBjb250aW51ZXNcIi5cbiAgICBpZiAodGhpcy5waGFzZSA9PT0gXCJ0aXRsZVwiIHx8IHRoaXMucGhhc2UgPT09IFwicGF1c2VkXCIpIHtcbiAgICAgIHRoaXMucGhhc2UgPSBcInBsYXlpbmdcIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBJbiBnYW1lIG1vZGUgYSBrZXktZG93biByZWFjaGVzIHRoZSBkb29yIG9uIEJPVEggcGF0aHMgLSB0aGUga2V5LXN0YXRlXG4gICAgLy8gaGFuZGxlciBhdCBgc29ja2V0LWhhbmRsZXJzLnRzOjUyN2AgYW5kIHRoZSBpbnB1dCBoYW5kbGVyIGF0IDo1MzYgLSBzb1xuICAgIC8vIG9uY2UgcmVhbCBlZGdlcyBhcmUgYXJyaXZpbmcsIG1vdmVtZW50IGJlbG9uZ3MgdG8gdGhlIGhlbGQta2V5IGxvb3BcbiAgICAvLyBhbG9uZS4gQWN0aW5nIGhlcmUgYXMgd2VsbCB3b3VsZCBzdGVwIHRoZSBwYWRkbGUgdHdpY2UgcGVyIHByZXNzXG4gICAgLy8gKGBzZGsvdXRpbHMvZG9vci1pbnB1dC1tYW5hZ2VyLnRzOjI4Ny0yOTJgIHNheXMgdGhlIHNhbWUpLlxuICAgIGlmICh0aGlzLmtleUVkZ2VzICYmIE1PVkVNRU5UX0tFWVMuaGFzKG5hbWUpKSByZXR1cm47XG5cbiAgICBzd2l0Y2ggKG5hbWUpIHtcbiAgICAgIGNhc2UgXCJkb3duXCI6XG4gICAgICAgIHRoaXMuYjEueSsrO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ1cFwiOlxuICAgICAgICB0aGlzLmIxLnktLTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwicVwiOlxuICAgICAgY2FzZSBcIlFcIjpcbiAgICAgICAgdGhpcy5iMi55LS07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImFcIjpcbiAgICAgIGNhc2UgXCJBXCI6XG4gICAgICAgIHRoaXMuYjIueSsrO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJwXCI6XG4gICAgICBjYXNlIFwiUFwiOlxuICAgICAgICAvLyBQYXVzZSAtIHdhaXQgZm9yIGFueSBrZXlcbiAgICAgICAgdGhpcy5waGFzZSA9IFwicGF1c2VkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImVzY2FwZVwiOlxuICAgICAgICB0aGlzLnF1aXQoKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3AgdGhlIGdhbWUgbG9vcCBhbmQgbGVhdmUgbmN1cnNlcyBtb2RlLiBJZGVtcG90ZW50OiB0aGUgZG9vciBjYWxscyBpdFxuICAgKiBmcm9tIGl0cyBjbG9zZSBoYW5kbGVyIGFzIHdlbGwgYXMgZnJvbSB0aGUgRVNDIHBhdGgsIGFuZCBgZW5kd2luKClgIHB1dHNcbiAgICogcmVhbCBieXRlcyBvbiB0aGUgd2lyZSAoc2hvdyBjdXJzb3IsIHJlc2V0IGF0dHJpYnV0ZXMsIGxlYXZlIHRoZSBhbHRlcm5hdGVcbiAgICogc2NyZWVuKS4gVGhlIHBoYXNlIGd1YXJkIGlzIHdoYXQgbWFrZXMgdGhlIHNlY29uZCBjYWxsIGEgbm8tb3AgSEVSRSxcbiAgICogcmF0aGVyIHRoYW4gbGVhbmluZyBvbiBgZW5kd2luKClgJ3Mgb3duIGBpbml0aWFsaXplZGAgY2hlY2tcbiAgICogKGBzZGsvZW5naW5lcy91aS9uY3Vyc2VzL25jdXJzZXMudHM6MjQ2LTI0OWApIHRvIHN3YWxsb3cgaXQuXG4gICAqL1xuICBzdG9wKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnBoYXNlID09PSBcImZpbmlzaGVkXCIpIHJldHVybjtcbiAgICBpZiAodGhpcy5sb29wKSB7XG4gICAgICBjbGVhckludGVydmFsKHRoaXMubG9vcCk7XG4gICAgICB0aGlzLmxvb3AgPSBudWxsO1xuICAgIH1cbiAgICB0aGlzLnBoYXNlID0gXCJmaW5pc2hlZFwiO1xuICAgIHRoaXMuaGVsZC5jbGVhcigpO1xuICAgIHRoaXMua2V5RWRnZXMgPSBmYWxzZTtcbiAgICBlbmR3aW4oKTtcbiAgfVxuXG4gIC8qKiBPcmlnaW5hbCBDOiBgZW5kID0gdHJ1ZTtgIGFuZCB0aGUgYGVuZHdpbigpYCBhZnRlciB0aGUgbG9vcC4gKi9cbiAgcHJpdmF0ZSBxdWl0KCk6IHZvaWQge1xuICAgIGNvbnN0IG9uUXVpdCA9IHRoaXMucXVpdENhbGxiYWNrO1xuICAgIHRoaXMucXVpdENhbGxiYWNrID0gbnVsbDtcbiAgICB0aGlzLnN0b3AoKTtcbiAgICBpZiAob25RdWl0KSBvblF1aXQoKTtcbiAgfVxuXG4gIC8qKiBUaGUgZHJhd2luZyBoYWxmIG9mIHRoZSBvcmlnaW5hbCBsb29wIGJvZHkuICovXG4gIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcbiAgICBjb25zdCB7IGIxLCBiMiwgYmFsbDogYiB9ID0gdGhpcztcbiAgICBjb25zdCBzY3JYID0gdGhpcy5zY3JYO1xuICAgIGNvbnN0IHNjclkgPSB0aGlzLnNjclk7XG5cbiAgICBlcmFzZSgpO1xuXG4gICAgLy8gU2NvcmUgZGlzcGxheVxuICAgIG12cHJpbnR3KDIsIE1hdGguZmxvb3Ioc2NyWCAvIDIpIC0gMiwgYCR7YjEuY30gfCAke2IyLmN9YCk7XG5cbiAgICAvLyBDZW50ZXIgbGluZVxuICAgIG12dmxpbmUoMCwgTWF0aC5mbG9vcihzY3JYIC8gMiksIEFDU19WTElORSwgc2NyWSk7XG5cbiAgICAvLyBCYWxsIGFuZCBwYWRkbGVzIGluIGJsdWVcbiAgICBhdHRyb24oQ09MT1JfUEFJUigxKSk7XG4gICAgbXZwcmludHcoYi55LCBiLngsIFwib1wiKTtcbiAgICBmb3IgKGxldCBpID0gLTE7IGkgPCAyOyBpKyspIHtcbiAgICAgIG12cHJpbnR3KGIxLnkgKyBpLCBiMS54LCBcInxcIik7XG4gICAgICBtdnByaW50dyhiMi55ICsgaSwgYjIueCwgXCJ8XCIpO1xuICAgIH1cbiAgICBhdHRyb2ZmKENPTE9SX1BBSVIoMSkpO1xuXG4gICAgcmVmcmVzaCgpOyAvLyBDUklUSUNBTDogU2VuZCB0aGUgdXBkYXRlZCBidWZmZXIgdG8gdGhlIHRlcm1pbmFsIVxuICB9XG59XG4iXX0=