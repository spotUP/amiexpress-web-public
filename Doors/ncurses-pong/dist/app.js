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
        /** The board's pause (Ctrl+K palette over the door): tick() stands still while held. */
        this.hold = null;
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
        if (this.hold?.isPaused())
            return; // the palette is over the door: time stands still
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
        this.hold?.withdraw();
        this.hold = null;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7OztBQUdILHlFQThCcUQ7QUFXckQsU0FBUyxTQUFTO0lBQ2hCLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUM1RCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILFNBQVMsZ0JBQWdCLENBQUMsR0FBVztJQUNuQyxRQUFRLEdBQUcsRUFBRSxDQUFDO1FBQ1osS0FBSyxXQUFXLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztRQUNoQyxLQUFLLFlBQVksQ0FBQyxDQUFDLE9BQU8sT0FBTyxDQUFDO1FBQ2xDLEtBQUssU0FBUyxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUM7UUFDNUIsS0FBSyxXQUFXLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztRQUNoQyxLQUFLLEdBQUcsQ0FBQztRQUNULEtBQUssVUFBVSxDQUFDLENBQUMsT0FBTyxPQUFPLENBQUM7UUFDaEMsS0FBSyxPQUFPLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztRQUM3QixLQUFLLFFBQVEsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDO1FBQy9CLE9BQU8sQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3BDLENBQUM7QUFDSCxDQUFDO0FBRUQscUVBQXFFO0FBQ3JFLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQVd4RDs7Ozs7R0FLRztBQUNVLFFBQUEsWUFBWSxHQUFHLEVBQUUsQ0FBQztBQUUvQixNQUFhLFFBQVE7SUFBckI7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LENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDNUIsSUFBQSxrQkFBUSxFQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUIsSUFBQSxrQkFBUSxFQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUNELElBQUEsaUJBQU8sRUFBQyxJQUFBLG9CQUFVLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV2QixJQUFBLGlCQUFPLEdBQUUsQ0FBQyxDQUFDLHFEQUFxRDtJQUNsRSxDQUFDO0NBQ0Y7QUE5U0QsNEJBOFNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBuY3Vyc2VzLXBvbmcgLSBQb3J0IG9mIHZpY2VudGVib2xlYS9Qb25nLWN1cnNlcyAofjcxIGxpbmVzKVxuICpcbiAqIE9yaWdpbmFsIEMgY29kZTogaHR0cHM6Ly9naXRodWIuY29tL3ZpY2VudGVib2xlYS9Qb25nLWN1cnNlc1xuICogQXV0aG9yOiBWaWNlbnRlIEFkb2xmbyBCb2xlYSBTYW5jaGV6IDx2aWNlbnRlLmJvbGVhQGdtYWlsLmNvbT5cbiAqXG4gKiBUaGlzIHBvcnQgdmFsaWRhdGVzIHRoZSBuY3Vyc2VzIGNvbXBhdGliaWxpdHkgbGF5ZXIgYnkgcG9ydGluZ1xuICogYSByZWFsIG5jdXJzZXMgZ2FtZSB3aXRoIG1pbmltYWwgY2hhbmdlcyBmcm9tIHRoZSBvcmlnaW5hbCBDLlxuICpcbiAqIEtleSBkaWZmZXJlbmNlcyBmcm9tIEM6XG4gKiAtIHR5cGVkZWYgc3RydWN0IHJlcGxhY2VkIHdpdGggaW50ZXJmYWNlXG4gKiAtIGdldG1heHl4IG1hY3JvIHJlcGxhY2VkIHdpdGggZ2V0TElORVMvZ2V0Q09MU1xuICogLSB0aGUgQyBgd2hpbGUgKCFlbmQpIHsgdXNsZWVwKDQwMDApOyAuLi4gZ2V0Y2goKTsgfWAgbG9vcCBpcyBJTlZFUlRFRDpcbiAqICAgYSBCQlMgZG9vciBpcyBkcml2ZW4gYnkgdGhlIGNhbGxlcidzIGtleXN0cm9rZXMsIG5vdCBieSBhIGJsb2NraW5nIHJlYWQuXG4gKiAgIGBzdGFydCgpYCBwYWludHMgYW5kIHBhcmtzIHRoZSBsb29wIG9uIGFuIGludGVydmFsIGl0IG93bnM7IGB0aWNrKClgIGlzXG4gKiAgIG9uZSBpdGVyYXRpb24gb2YgdGhlIG9sZCBsb29wIGJvZHk7IGBoYW5kbGVLZXkoKWAgaXMgdGhlIG9sZFxuICogICBgc3dpdGNoIChnZXRjaCgpKWAuIFNlZSB0aGUgcmVwb3J0IHJlZmVyZW5jZWQgaW4gaW5kZXgudHMgZm9yIHdoeS5cbiAqL1xuXG5pbXBvcnQgdHlwZSB7IERvb3JIb2xkIH0gZnJvbSBcIkBhbWlleHByZXNzL2Jicy1kb29yLXNkay91dGlscy9ibGVzc2VkLWhlbHBlcnNcIjtcbmltcG9ydCB7XG4gIC8vIEluaXRpYWxpemF0aW9uXG4gIGluaXRzY3IsXG4gIGVuZHdpbixcbiAgc3RhcnRfY29sb3IsXG4gIGluaXRfcGFpcixcbiAga2V5cGFkLFxuICBub2VjaG8sXG4gIGN1cnNfc2V0LFxuICBnZXRTdGRzY3IsXG5cbiAgLy8gU2NyZWVuIGluZm9cbiAgZ2V0TElORVMsXG4gIGdldENPTFMsXG5cbiAgLy8gT3V0cHV0XG4gIG12cHJpbnR3LFxuICBtdnZsaW5lLFxuICBlcmFzZSxcbiAgcmVmcmVzaCxcblxuICAvLyBBdHRyaWJ1dGVzXG4gIGF0dHJvbixcbiAgYXR0cm9mZixcbiAgQ09MT1JfUEFJUixcblxuICAvLyBDb25zdGFudHNcbiAgQ09MT1JfQkxVRSxcbiAgQ09MT1JfQkxBQ0ssXG4gIEFDU19WTElORSxcbn0gZnJvbSBcIkBhbWlleHByZXNzL2Jicy1kb29yLXNkay9lbmdpbmVzL3VpL25jdXJzZXNcIjtcblxuLy8gT3JpZ2luYWwgQzogdHlwZWRlZiBzdHJ1Y3R7c2hvcnQgaW50IHgsIHksIGM7IGJvb2wgbW92aG9yLCBtb3Z2ZXI7fSBvYmplY3Q7XG5pbnRlcmZhY2UgR2FtZU9iamVjdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBjOiBudW1iZXI7IC8vIHNjb3JlIGNvdW50ZXJcbiAgbW92aG9yOiBib29sZWFuO1xuICBtb3Z2ZXI6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIG5ld09iamVjdCgpOiBHYW1lT2JqZWN0IHtcbiAgcmV0dXJuIHsgeDogMCwgeTogMCwgYzogMCwgbW92aG9yOiBmYWxzZSwgbW92dmVyOiBmYWxzZSB9O1xufVxuXG4vKipcbiAqIEJyb3dzZXIgYEtleWJvYXJkRXZlbnQua2V5YCAtPiB0aGUgc2hvcnQgbmFtZSBkb29ycyB0aGluayBpbi5cbiAqXG4gKiBTYW1lIG1hcHBpbmcgYXMgdGhlIFNESydzIGBEb29ySW5wdXRNYW5hZ2VyLm5vcm1hbGlzZUtleU5hbWVgXG4gKiAoYHNkay91dGlscy9kb29yLWlucHV0LW1hbmFnZXIudHM6MjMzLTI0NWApLCB3aGljaCBpcyBgcHJpdmF0ZSBzdGF0aWNgIGFuZFxuICogc28gY2Fubm90IGJlIGltcG9ydGVkLiBLZXB0IGluIHN0ZXAgd2l0aCBpdCBkZWxpYmVyYXRlbHk6IHRoZSB0d28gbXVzdFxuICogYWdyZWUgb24gbmFtZXMgb3IgYSBkb29yIGFuZCB0aGUgbWFuYWdlciB3b3VsZCBkaXNhZ3JlZSBhYm91dCBcInVwXCIuXG4gKi9cbmZ1bmN0aW9uIG5vcm1hbGlzZUtleU5hbWUoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgXCJBcnJvd0xlZnRcIjogcmV0dXJuIFwibGVmdFwiO1xuICAgIGNhc2UgXCJBcnJvd1JpZ2h0XCI6IHJldHVybiBcInJpZ2h0XCI7XG4gICAgY2FzZSBcIkFycm93VXBcIjogcmV0dXJuIFwidXBcIjtcbiAgICBjYXNlIFwiQXJyb3dEb3duXCI6IHJldHVybiBcImRvd25cIjtcbiAgICBjYXNlIFwiIFwiOlxuICAgIGNhc2UgXCJTcGFjZWJhclwiOiByZXR1cm4gXCJzcGFjZVwiO1xuICAgIGNhc2UgXCJFbnRlclwiOiByZXR1cm4gXCJlbnRlclwiO1xuICAgIGNhc2UgXCJFc2NhcGVcIjogcmV0dXJuIFwiZXNjYXBlXCI7XG4gICAgZGVmYXVsdDogcmV0dXJuIGtleS50b0xvd2VyQ2FzZSgpO1xuICB9XG59XG5cbi8qKiBUaGUga2V5cyB0aGF0IG1vdmUgYSBwYWRkbGUgLSB0aGUgb25lcyB0aGUgaGVsZC1rZXkgbG9vcCBvd25zLiAqL1xuY29uc3QgTU9WRU1FTlRfS0VZUyA9IG5ldyBTZXQoW1widXBcIiwgXCJkb3duXCIsIFwicVwiLCBcImFcIl0pO1xuXG4vKipcbiAqIFBoYXNlcyBvZiBhIGdhbWUuXG4gKlxuICogYHRpdGxlYCBpcyB0aGUgb3JpZ2luYWwncyBgYXdhaXQgZ2V0Y2goKWAgYmVmb3JlIGBub2RlbGF5KHN0ZHNjciwxKWA6XG4gKiB0aGUgYm9hcmQgaXMgcGFpbnRlZCBidXQgZnJvemVuIHVudGlsIHRoZSBjYWxsZXIgcHJlc3NlcyBzb21ldGhpbmcuXG4gKiBgcGF1c2VkYCBpcyB0aGUgb3JpZ2luYWwncyBgbm9kZWxheShmYWxzZSk7IGF3YWl0IGdldGNoKCk7IG5vZGVsYXkodHJ1ZSk7YC5cbiAqL1xudHlwZSBQb25nUGhhc2UgPSBcInRpdGxlXCIgfCBcInBsYXlpbmdcIiB8IFwicGF1c2VkXCIgfCBcImZpbmlzaGVkXCI7XG5cbi8qKlxuICogT25lIHRpY2sgb2YgdGhlIGdhbWUgbG9vcC5cbiAqXG4gKiBPcmlnaW5hbCBDOiB1c2xlZXAoNDAwMCkgLSA0MDAwIG1pY3Jvc2Vjb25kcyA9IDRtcy5cbiAqIEJCUyBvcHRpbWlzYXRpb246IDMzbXMgPSB+MzBmcHMsIG11Y2ggYmV0dGVyIGZvciBuZXR3b3JrL0NQVS5cbiAqL1xuZXhwb3J0IGNvbnN0IFBPTkdfVElDS19NUyA9IDMzO1xuXG5leHBvcnQgY2xhc3MgUG9uZ0Rvb3Ige1xuICBuYW1lID0gXCJuY3Vyc2VzLXBvbmdcIjtcbiAgdmVyc2lvbiA9IFwiMS4wLjBcIjtcbiAgYXV0aG9yID0gXCJWaWNlbnRlIEJvbGVhIChvcmlnaW5hbCksIEFtaUV4cHJlc3MgKHBvcnQpXCI7XG4gIGRlc2NyaXB0aW9uID0gXCJDbGFzc2ljIFBvbmcgLSBuY3Vyc2VzIHBvcnQgdmFsaWRhdGlvblwiO1xuXG4gIHByaXZhdGUgcGhhc2U6IFBvbmdQaGFzZSA9IFwiZmluaXNoZWRcIjtcbiAgcHJpdmF0ZSBsb29wOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRJbnRlcnZhbD4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBxdWl0Q2FsbGJhY2s6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgc2NyWCA9IDA7XG4gIHByaXZhdGUgc2NyWSA9IDA7XG4gIHByaXZhdGUgY29udCA9IDA7XG5cbiAgLyoqXG4gICAqIEtleXMgaGVsZCByaWdodCBub3csIGZyb20gcmVhbCBrZXktZG93bi9rZXktdXAgZWRnZXMuXG4gICAqXG4gICAqIFRoZSBjbGllbnQncyBnYW1lLW1vZGUgYXV0by1yZXBlYXQgd2FpdHMgNDAwIG1zIGJlZm9yZSBpdCBzdGFydHNcbiAgICogKGBwYWNrYWdlcy90ZXJtaW5hbC9zcmMvY29tcG9uZW50cy9CQlNUZXJtaW5hbC50c3g6MTM0MmApLCBzbyBhIGRvb3IgdGhhdFxuICAgKiBtb3ZlcyBvbmNlIHBlciBkZWxpdmVyZWQga2V5IHN0dXR0ZXJzIG9uIGEgaGVsZCBrZXkgaG93ZXZlciBmYXN0IHRoZSBnYW1lXG4gICAqIGxvb3AgcnVucy4gRXZlcnkgYXJjYWRlIGRvb3IgaW4gdGhpcyByZXBvIGF2b2lkcyB0aGF0IHRoZSBzYW1lIHdheSAtIGhvbGRcbiAgICogdGhlIGtleSBzdGF0ZSwgc3RlcCBvbmNlIHBlciBmcmFtZSAtIGFuZCB0aGlzIGlzIHRoYXQgc3RhdGUuXG4gICAqL1xuICBwcml2YXRlIGhlbGQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXG4gIC8qKiBUaGUgYm9hcmQncyBwYXVzZSAoQ3RybCtLIHBhbGV0dGUgb3ZlciB0aGUgZG9vcik6IHRpY2soKSBzdGFuZHMgc3RpbGwgd2hpbGUgaGVsZC4gKi9cbiAgaG9sZDogRG9vckhvbGQgfCBudWxsID0gbnVsbDtcblxuICAvKipcbiAgICogVHJ1ZSBvbmNlIGEgcmVhbCBrZXktZG93biBlZGdlIGhhcyBhcnJpdmVkLCBpLmUuIHRoaXMgY2FsbGVyJ3MgdHJhbnNwb3J0XG4gICAqIHNlbmRzIGtleSBldmVudHMgYXQgYWxsLiBUZWxuZXQgZG9lcyBub3QsIGFuZCB0aGVyZSB0aGUgY2hhcmFjdGVyIHBhdGhcbiAgICogYmVsb3cgc3RheXMgaW4gY2hhcmdlLlxuICAgKi9cbiAgcHJpdmF0ZSBrZXlFZGdlcyA9IGZhbHNlO1xuXG4gIHByaXZhdGUgYjE6IEdhbWVPYmplY3QgPSBuZXdPYmplY3QoKTsgLy8gcGxheWVyIDEgcGFkZGxlIChyaWdodClcbiAgcHJpdmF0ZSBiMjogR2FtZU9iamVjdCA9IG5ld09iamVjdCgpOyAvLyBwbGF5ZXIgMiBwYWRkbGUgKGxlZnQpXG4gIHByaXZhdGUgYmFsbDogR2FtZU9iamVjdCA9IG5ld09iamVjdCgpO1xuXG4gIC8qKlxuICAgKiBJbml0aWFsaXNlIG5jdXJzZXMsIHBhaW50IHRoZSB0aXRsZSBzY3JlZW4sIHBhcmsgdGhlIGdhbWUgbG9vcCwgUkVUVVJOLlxuICAgKlxuICAgKiBSZXR1cm5pbmcgaXMgdGhlIHdob2xlIHBvaW50OiBgRG9vci5leGVjdXRlKClgIG9ubHkgcmVhY2hlcyB0aGUgU0RLIGlucHV0XG4gICAqIGxvb3AgLSB0aGUgb25lIHRoaW5nIHRoYXQgaW5zdGFsbHMgYGJic1Nlc3Npb24uZG9vcklucHV0SGFuZGxlcmAgLSBhZnRlclxuICAgKiBldmVyeSBzdGFydCBoYW5kbGVyIGhhcyByZXNvbHZlZCAoc2RrL3NyYy9jb3JlL0Rvb3IudHM6MTE4LTEzMSwgOjI1MCkuXG4gICAqXG4gICAqIEBwYXJhbSBjb250ZXh0IC0gdGhlIG5jdXJzZXMgSS9PIGNvbnRleHQgKGFueXRoaW5nIHdpdGggYGVtaXRgL2B3cml0ZWApXG4gICAqIEBwYXJhbSBvblF1aXQgIC0gY2FsbGVkIG9uY2UsIHdoZW4gdGhlIHBsYXllciBoYXMgcHJlc3NlZCBFU0NcbiAgICovXG4gIHN0YXJ0KGNvbnRleHQ6IHVua25vd24sIG9uUXVpdDogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMucXVpdENhbGxiYWNrID0gb25RdWl0O1xuXG4gICAgLy8gT3JpZ2luYWwgQzogaW5pdHNjcigpOyBzdGFydF9jb2xvcigpOyBpbml0X3BhaXIoMSxDT0xPUl9CTFVFLENPTE9SX0JMQUNLKTtcbiAgICBpbml0c2NyKGNvbnRleHQpO1xuICAgIHN0YXJ0X2NvbG9yKCk7XG4gICAgaW5pdF9wYWlyKDEsIENPTE9SX0JMVUUsIENPTE9SX0JMQUNLKTtcblxuICAgIC8vIE9yaWdpbmFsIEM6IGtleXBhZChzdGRzY3IsdHJ1ZSk7IG5vZWNobygpOyBjdXJzX3NldCgwKTtcbiAgICBjb25zdCBzdGRzY3IgPSBnZXRTdGRzY3IoKTtcbiAgICBpZiAoc3Rkc2NyKSB7XG4gICAgICBrZXlwYWQoc3Rkc2NyLCB0cnVlKTtcbiAgICB9XG4gICAgbm9lY2hvKCk7XG4gICAgY3Vyc19zZXQoMCk7XG5cbiAgICAvLyBPcmlnaW5hbCBDOiBnZXRtYXh5eChzdGRzY3Isc2NyLnksc2NyLngpO1xuICAgIHRoaXMuc2NyWSA9IGdldExJTkVTKCk7XG4gICAgdGhpcy5zY3JYID0gZ2V0Q09MUygpO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogb2JqZWN0IGIxPXtzY3IueC0yLHNjci55LzIsMCxmYWxzZSxmYWxzZX0sIC4uLlxuICAgIHRoaXMuYjEgPSB7IHg6IHRoaXMuc2NyWCAtIDIsIHk6IE1hdGguZmxvb3IodGhpcy5zY3JZIC8gMiksIGM6IDAsIG1vdmhvcjogZmFsc2UsIG1vdnZlcjogZmFsc2UgfTtcbiAgICB0aGlzLmIyID0geyB4OiAxLCB5OiBNYXRoLmZsb29yKHRoaXMuc2NyWSAvIDIpLCBjOiAwLCBtb3Zob3I6IGZhbHNlLCBtb3Z2ZXI6IGZhbHNlIH07XG4gICAgdGhpcy5iYWxsID0ge1xuICAgICAgeDogTWF0aC5mbG9vcih0aGlzLnNjclggLyAyKSxcbiAgICAgIHk6IE1hdGguZmxvb3IodGhpcy5zY3JZIC8gMiksXG4gICAgICBjOiAwLFxuICAgICAgbW92aG9yOiBmYWxzZSxcbiAgICAgIG1vdnZlcjogZmFsc2UsXG4gICAgfTtcbiAgICB0aGlzLmNvbnQgPSAwO1xuXG4gICAgLy8gU2hvdyB0aXRsZSBzY3JlZW5cbiAgICBtdnByaW50dyhcbiAgICAgIDQsXG4gICAgICAwLFxuICAgICAgXCJcXHQgICAgICAgICAgIG9vb29vb29vb28gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICAgODg4ICAgIDg4OCAgb29vb29vbyAgICBvb29vb29vICAgIG9vb29vb29vOCAgICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgICA4ODhvb29vODggODg4ICAgICA4ODggODg4ICAgODg4ICA4ODggICAgODhvICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgICAgICAgICAgIDg4OCAgICAgICA4ODggICAgIDg4OCA4ODggICA4ODggICA4ODhvbzg4OG8gICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICBvODg4byAgICAgICAgODhvb284OCAgbzg4OG8gbzg4OG8gODg4ICAgICA4ODggICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgODg4b29vODg4ICAgICBcXG5cXG5cIiArXG4gICAgICAgIFwiXFx0IE9yaWdpbmFsIGJ5IFZpY2VudGUgQm9sZWEgLSBQb3J0ZWQgdG8gQW1pRXhwcmVzcyBuY3Vyc2VzICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCBcXHRcXHRcXHRQbGF5ZXIgMSBjb250cm9sczogVVAvRE9XTiBhcnJvd3MgICAgICAgICAgICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCBcXHRcXHRcXHRQbGF5ZXIgMiBjb250cm9sczogUSAodXApIGFuZCBBIChkb3duKSAgICAgICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCBcXHRcXHRcXHRQcmVzcyBBTlkga2V5IHRvIHN0YXJ0LCBQIGZvciBwYXVzZSwgRVNDIHRvIHF1aXRcIlxuICAgICk7XG5cbiAgICByZWZyZXNoKCk7IC8vIENSSVRJQ0FMOiBGbHVzaCBvdXRwdXQgdG8gdGVybWluYWwgYmVmb3JlIHdhaXRpbmcgZm9yIGlucHV0XG4gICAgdGhpcy5waGFzZSA9IFwidGl0bGVcIjtcblxuICAgIC8vIFRoZSBsb29wIHRoaXMgZG9vciBvd25zLiBJdCBydW5zIGZyb20gdGhlIHRpdGxlIHNjcmVlbiBvbiBzbyB0aGF0IHRoZVxuICAgIC8vIGdhbWUgaGFzIGEgaGVhcnRiZWF0IG9mIGl0cyBvd24gdGhlIG1vbWVudCB0aGUgY2FsbGVyIHN0YXJ0cyBpdCwgYW5kIGl0XG4gICAgLy8gaXMgY2xlYXJlZCBpbiBzdG9wKCkuXG4gICAgdGhpcy5sb29wID0gc2V0SW50ZXJ2YWwoKCkgPT4gdGhpcy50aWNrKCksIFBPTkdfVElDS19NUyk7XG4gIH1cblxuICAvKipcbiAgICogT25lIGl0ZXJhdGlvbiBvZiB0aGUgb3JpZ2luYWwgYGZvciAobm9kZWxheShzdGRzY3IsMSk7ICFlbmQ7IHVzbGVlcCg0MDAwKSlgXG4gICAqIGJvZHksIG1pbnVzIHRoZSBgZ2V0Y2goKWAgKGtleXMgYXJyaXZlIHRocm91Z2ggaGFuZGxlS2V5IG5vdykuXG4gICAqL1xuICB0aWNrKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnBoYXNlICE9PSBcInBsYXlpbmdcIikgcmV0dXJuO1xuICAgIGlmICh0aGlzLmhvbGQ/LmlzUGF1c2VkKCkpIHJldHVybjsgICAvLyB0aGUgcGFsZXR0ZSBpcyBvdmVyIHRoZSBkb29yOiB0aW1lIHN0YW5kcyBzdGlsbFxuXG4gICAgY29uc3QgeyBiMSwgYjIsIGJhbGw6IGIgfSA9IHRoaXM7XG4gICAgY29uc3Qgc2NyWCA9IHRoaXMuc2NyWDtcbiAgICBjb25zdCBzY3JZID0gdGhpcy5zY3JZO1xuXG4gICAgLy8gTW92ZW1lbnQgY29tZXMgZnJvbSB0aGUgaGVsZCBrZXlzLCBvbmNlIHBlciBmcmFtZSAtIEFya2Fub2lkJ3MgY2FkZW5jZSxcbiAgICAvLyBhbmQgd2hhdCBgRG9vcklucHV0TWFuYWdlci5jb25zdW1lUmVwZWF0YCBnaXZlcyB3aXRoIGl0cyBkZWZhdWx0c1xuICAgIC8vIChgc2RrL3V0aWxzL2Rvb3ItaW5wdXQtbWFuYWdlci50czozMjItMzQwYCkuIE5vIGNsaWVudCBhdXRvLXJlcGVhdCBpc1xuICAgIC8vIGludm9sdmVkLCBzbyB0aGVyZSBpcyBubyA0MDAgbXMgaGVzaXRhdGlvbiBiZWZvcmUgdGhlIHBhZGRsZSBtb3Zlcy5cbiAgICB0aGlzLnN0ZXBIZWxkUGFkZGxlcygpO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogaWYgKCsrY29udCUxNj09MClcbiAgICAvLyBBZGp1c3QgZ2FtZSBsb2dpYyB0byBtYXRjaCBuZXcgdGljayByYXRlICh3YXMgMTYgdGlja3MgQCA0bXMgPSA2NG1zKS5cbiAgICAvLyBXaXRoIDMzbXMgdGlja3MsIHdlIHVwZGF0ZSBldmVyeSAyIHRpY2tzICh+NjZtcykuXG4gICAgdGhpcy5jb250Kys7XG4gICAgaWYgKHRoaXMuY29udCAlIDIgPT09IDApIHtcbiAgICAgIC8vIEJhbGwgdmVydGljYWwgYm91bmNlXG4gICAgICBpZiAoYi55ID09PSBzY3JZIC0gMSB8fCBiLnkgPT09IDEpIHtcbiAgICAgICAgYi5tb3Z2ZXIgPSAhYi5tb3Z2ZXI7XG4gICAgICB9XG5cbiAgICAgIC8vIEJhbGwgaG9yaXpvbnRhbCBib3VuY2UgKHBhZGRsZSBjb2xsaXNpb24pXG4gICAgICBpZiAoYi54ID49IHNjclggLSAyIHx8IGIueCA8PSAyKSB7XG4gICAgICAgIGIubW92aG9yID0gIWIubW92aG9yO1xuXG4gICAgICAgIGlmIChiLnkgPT09IGIxLnkgLSAxIHx8IGIueSA9PT0gYjIueSAtIDEpIHtcbiAgICAgICAgICBiLm1vdnZlciA9IGZhbHNlO1xuICAgICAgICB9IGVsc2UgaWYgKGIueSA9PT0gYjEueSArIDEgfHwgYi55ID09PSBiMi55ICsgMSkge1xuICAgICAgICAgIGIubW92dmVyID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmIChiLnkgIT09IGIxLnkgJiYgYi55ICE9PSBiMi55KSB7XG4gICAgICAgICAgLy8gU2NvcmUhXG4gICAgICAgICAgaWYgKGIueCA+PSBzY3JYIC0gMikge1xuICAgICAgICAgICAgYjEuYysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBiMi5jKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFJlc2V0IGJhbGxcbiAgICAgICAgICBiLnggPSBNYXRoLmZsb29yKHNjclggLyAyKTtcbiAgICAgICAgICBiLnkgPSBNYXRoLmZsb29yKHNjclkgLyAyKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBNb3ZlIGJhbGxcbiAgICAgIGIueCA9IGIubW92aG9yID8gYi54ICsgMSA6IGIueCAtIDE7XG4gICAgICBiLnkgPSBiLm1vdnZlciA/IGIueSArIDEgOiBiLnkgLSAxO1xuXG4gICAgfVxuXG4gICAgLy8gT3JpZ2luYWwgQyB3cmFwcGVkIHRoZSBwYWRkbGVzIGluc2lkZSB0aGUgcGh5c2ljcyB0aWNrOyB0aGV5IGNhbiBub3dcbiAgICAvLyBtb3ZlIG9uIGFueSBmcmFtZSwgc28gdGhlIHdyYXAgcnVucyBvbiBhbnkgZnJhbWUgdG9vIC0gb3RoZXJ3aXNlIGEgaGVsZFxuICAgIC8vIGtleSBjYW4gd2FsayBhIHBhZGRsZSBvZmYgdGhlIGJvYXJkIGZvciBhIGZyYW1lIGJlZm9yZSBpdCBpcyBjYXVnaHQuXG4gICAgaWYgKGIxLnkgPD0gMSkgYjEueSA9IHNjclkgLSAyO1xuICAgIGlmIChiMS55ID49IHNjclkgLSAxKSBiMS55ID0gMjtcbiAgICBpZiAoYjIueSA8PSAxKSBiMi55ID0gc2NyWSAtIDI7XG4gICAgaWYgKGIyLnkgPj0gc2NyWSAtIDEpIGIyLnkgPSAyO1xuXG4gICAgdGhpcy5kcmF3KCk7XG4gIH1cblxuICAvKipcbiAgICogQSByZWFsIGtleS1kb3duIGVkZ2UsIGZyb20gYGJicy5vbktleURvd25gLlxuICAgKlxuICAgKiBUaGUgY2xpZW50IHJlLXNlbmRzIGtleS1kb3duIHdoaWxlIGEga2V5IGF1dG8tcmVwZWF0czsgb25seSB0aGUgZmlyc3RcbiAgICogZWRnZSBtYXR0ZXJzLCBhbmQgYFNldC5hZGRgIG1ha2VzIHRoYXQgZnJlZS5cbiAgICovXG4gIGhvbGRLZXkoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmtleUVkZ2VzID0gdHJ1ZTtcbiAgICB0aGlzLmhlbGQuYWRkKG5vcm1hbGlzZUtleU5hbWUoa2V5KSk7XG4gIH1cblxuICAvKiogQSByZWFsIGtleS11cCBlZGdlLCBmcm9tIGBiYnMub25LZXlVcGAuICovXG4gIHJlbGVhc2VLZXkoa2V5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmhlbGQuZGVsZXRlKG5vcm1hbGlzZUtleU5hbWUoa2V5KSk7XG4gIH1cblxuICAvKiogT3JpZ2luYWwgQzogdGhlIEtFWV9VUCAvIEtFWV9ET1dOIC8gUSAvIEEgYXJtcyBvZiBgc3dpdGNoIChnZXRjaCgpKWAuICovXG4gIHByaXZhdGUgc3RlcEhlbGRQYWRkbGVzKCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5rZXlFZGdlcykgcmV0dXJuO1xuICAgIGlmICh0aGlzLmhlbGQuaGFzKFwidXBcIikpIHRoaXMuYjEueS0tO1xuICAgIGlmICh0aGlzLmhlbGQuaGFzKFwiZG93blwiKSkgdGhpcy5iMS55Kys7XG4gICAgaWYgKHRoaXMuaGVsZC5oYXMoXCJxXCIpKSB0aGlzLmIyLnktLTtcbiAgICBpZiAodGhpcy5oZWxkLmhhcyhcImFcIikpIHRoaXMuYjIueSsrO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBvcmlnaW5hbCBgc3dpdGNoIChnZXRjaCgpKWAsIGRyaXZlbiBieSB0aGUgY2FsbGVyJ3Mga2V5c3Ryb2tlLlxuICAgKlxuICAgKiBAcGFyYW0gbmFtZSAtIGEga2V5IG5hbWUgYXMgcGFyc2VkIG9mZiB0aGUgd2lyZTogXCJ1cFwiLCBcImRvd25cIiwgXCJlc2NhcGVcIixcbiAgICogICAgICAgICAgICAgICBvciB0aGUgY2hhcmFjdGVyIGl0c2VsZi5cbiAgICovXG4gIGhhbmRsZUtleShuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5waGFzZSA9PT0gXCJmaW5pc2hlZFwiKSByZXR1cm47XG5cbiAgICAvLyBPcmlnaW5hbCBDOiB0aGUgYGF3YWl0IGdldGNoKClgIHVuZGVyIHRoZSB0aXRsZSBzY3JlZW4sIGFuZCB0aGVcbiAgICAvLyBgbm9kZWxheShmYWxzZSk7IGF3YWl0IGdldGNoKCk7IG5vZGVsYXkodHJ1ZSk7YCBvZiB0aGUgcGF1c2UgLSBib3RoIGFyZVxuICAgIC8vIFwiYW55IGtleSBjb250aW51ZXNcIi5cbiAgICBpZiAodGhpcy5waGFzZSA9PT0gXCJ0aXRsZVwiIHx8IHRoaXMucGhhc2UgPT09IFwicGF1c2VkXCIpIHtcbiAgICAgIHRoaXMucGhhc2UgPSBcInBsYXlpbmdcIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBJbiBnYW1lIG1vZGUgYSBrZXktZG93biByZWFjaGVzIHRoZSBkb29yIG9uIEJPVEggcGF0aHMgLSB0aGUga2V5LXN0YXRlXG4gICAgLy8gaGFuZGxlciBhdCBgc29ja2V0LWhhbmRsZXJzLnRzOjUyN2AgYW5kIHRoZSBpbnB1dCBoYW5kbGVyIGF0IDo1MzYgLSBzb1xuICAgIC8vIG9uY2UgcmVhbCBlZGdlcyBhcmUgYXJyaXZpbmcsIG1vdmVtZW50IGJlbG9uZ3MgdG8gdGhlIGhlbGQta2V5IGxvb3BcbiAgICAvLyBhbG9uZS4gQWN0aW5nIGhlcmUgYXMgd2VsbCB3b3VsZCBzdGVwIHRoZSBwYWRkbGUgdHdpY2UgcGVyIHByZXNzXG4gICAgLy8gKGBzZGsvdXRpbHMvZG9vci1pbnB1dC1tYW5hZ2VyLnRzOjI4Ny0yOTJgIHNheXMgdGhlIHNhbWUpLlxuICAgIGlmICh0aGlzLmtleUVkZ2VzICYmIE1PVkVNRU5UX0tFWVMuaGFzKG5hbWUpKSByZXR1cm47XG5cbiAgICBzd2l0Y2ggKG5hbWUpIHtcbiAgICAgIGNhc2UgXCJkb3duXCI6XG4gICAgICAgIHRoaXMuYjEueSsrO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ1cFwiOlxuICAgICAgICB0aGlzLmIxLnktLTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwicVwiOlxuICAgICAgY2FzZSBcIlFcIjpcbiAgICAgICAgdGhpcy5iMi55LS07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImFcIjpcbiAgICAgIGNhc2UgXCJBXCI6XG4gICAgICAgIHRoaXMuYjIueSsrO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJwXCI6XG4gICAgICBjYXNlIFwiUFwiOlxuICAgICAgICAvLyBQYXVzZSAtIHdhaXQgZm9yIGFueSBrZXlcbiAgICAgICAgdGhpcy5waGFzZSA9IFwicGF1c2VkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImVzY2FwZVwiOlxuICAgICAgICB0aGlzLnF1aXQoKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3AgdGhlIGdhbWUgbG9vcCBhbmQgbGVhdmUgbmN1cnNlcyBtb2RlLiBJZGVtcG90ZW50OiB0aGUgZG9vciBjYWxscyBpdFxuICAgKiBmcm9tIGl0cyBjbG9zZSBoYW5kbGVyIGFzIHdlbGwgYXMgZnJvbSB0aGUgRVNDIHBhdGgsIGFuZCBgZW5kd2luKClgIHB1dHNcbiAgICogcmVhbCBieXRlcyBvbiB0aGUgd2lyZSAoc2hvdyBjdXJzb3IsIHJlc2V0IGF0dHJpYnV0ZXMsIGxlYXZlIHRoZSBhbHRlcm5hdGVcbiAgICogc2NyZWVuKS4gVGhlIHBoYXNlIGd1YXJkIGlzIHdoYXQgbWFrZXMgdGhlIHNlY29uZCBjYWxsIGEgbm8tb3AgSEVSRSxcbiAgICogcmF0aGVyIHRoYW4gbGVhbmluZyBvbiBgZW5kd2luKClgJ3Mgb3duIGBpbml0aWFsaXplZGAgY2hlY2tcbiAgICogKGBzZGsvZW5naW5lcy91aS9uY3Vyc2VzL25jdXJzZXMudHM6MjQ2LTI0OWApIHRvIHN3YWxsb3cgaXQuXG4gICAqL1xuICBzdG9wKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnBoYXNlID09PSBcImZpbmlzaGVkXCIpIHJldHVybjtcbiAgICBpZiAodGhpcy5sb29wKSB7XG4gICAgICBjbGVhckludGVydmFsKHRoaXMubG9vcCk7XG4gICAgICB0aGlzLmxvb3AgPSBudWxsO1xuICAgIH1cbiAgICB0aGlzLmhvbGQ/LndpdGhkcmF3KCk7XG4gICAgdGhpcy5ob2xkID0gbnVsbDtcbiAgICB0aGlzLnBoYXNlID0gXCJmaW5pc2hlZFwiO1xuICAgIHRoaXMuaGVsZC5jbGVhcigpO1xuICAgIHRoaXMua2V5RWRnZXMgPSBmYWxzZTtcbiAgICBlbmR3aW4oKTtcbiAgfVxuXG4gIC8qKiBPcmlnaW5hbCBDOiBgZW5kID0gdHJ1ZTtgIGFuZCB0aGUgYGVuZHdpbigpYCBhZnRlciB0aGUgbG9vcC4gKi9cbiAgcHJpdmF0ZSBxdWl0KCk6IHZvaWQge1xuICAgIGNvbnN0IG9uUXVpdCA9IHRoaXMucXVpdENhbGxiYWNrO1xuICAgIHRoaXMucXVpdENhbGxiYWNrID0gbnVsbDtcbiAgICB0aGlzLnN0b3AoKTtcbiAgICBpZiAob25RdWl0KSBvblF1aXQoKTtcbiAgfVxuXG4gIC8qKiBUaGUgZHJhd2luZyBoYWxmIG9mIHRoZSBvcmlnaW5hbCBsb29wIGJvZHkuICovXG4gIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcbiAgICBjb25zdCB7IGIxLCBiMiwgYmFsbDogYiB9ID0gdGhpcztcbiAgICBjb25zdCBzY3JYID0gdGhpcy5zY3JYO1xuICAgIGNvbnN0IHNjclkgPSB0aGlzLnNjclk7XG5cbiAgICBlcmFzZSgpO1xuXG4gICAgLy8gU2NvcmUgZGlzcGxheVxuICAgIG12cHJpbnR3KDIsIE1hdGguZmxvb3Ioc2NyWCAvIDIpIC0gMiwgYCR7YjEuY30gfCAke2IyLmN9YCk7XG5cbiAgICAvLyBDZW50ZXIgbGluZVxuICAgIG12dmxpbmUoMCwgTWF0aC5mbG9vcihzY3JYIC8gMiksIEFDU19WTElORSwgc2NyWSk7XG5cbiAgICAvLyBCYWxsIGFuZCBwYWRkbGVzIGluIGJsdWVcbiAgICBhdHRyb24oQ09MT1JfUEFJUigxKSk7XG4gICAgbXZwcmludHcoYi55LCBiLngsIFwib1wiKTtcbiAgICBmb3IgKGxldCBpID0gLTE7IGkgPCAyOyBpKyspIHtcbiAgICAgIG12cHJpbnR3KGIxLnkgKyBpLCBiMS54LCBcInxcIik7XG4gICAgICBtdnByaW50dyhiMi55ICsgaSwgYjIueCwgXCJ8XCIpO1xuICAgIH1cbiAgICBhdHRyb2ZmKENPTE9SX1BBSVIoMSkpO1xuXG4gICAgcmVmcmVzaCgpOyAvLyBDUklUSUNBTDogU2VuZCB0aGUgdXBkYXRlZCBidWZmZXIgdG8gdGhlIHRlcm1pbmFsIVxuICB9XG59XG4iXX0=