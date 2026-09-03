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
const ncurses_1 = require("@amiexpress/bbs-door-sdk/ncurses");
function newObject() {
    return { x: 0, y: 0, c: 0, movhor: false, movver: false };
}
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
            // Paddle wrap-around
            if (b1.y <= 1)
                b1.y = scrY - 2;
            if (b1.y >= scrY - 1)
                b1.y = 2;
            if (b2.y <= 1)
                b2.y = scrY - 2;
            if (b2.y >= scrY - 1)
                b2.y = 2;
        }
        this.draw();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7OztBQUVILDhEQThCMEM7QUFXMUMsU0FBUyxTQUFTO0lBQ2hCLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUM1RCxDQUFDO0FBV0Q7Ozs7O0dBS0c7QUFDVSxRQUFBLFlBQVksR0FBRyxFQUFFLENBQUM7QUFFL0IsTUFBYSxRQUFRO0lBQXJCO1FBQ0UsU0FBSSxHQUFHLGNBQWMsQ0FBQztRQUN0QixZQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ2xCLFdBQU0sR0FBRyw2Q0FBNkMsQ0FBQztRQUN2RCxnQkFBVyxHQUFHLHdDQUF3QyxDQUFDO1FBRS9DLFVBQUssR0FBYyxVQUFVLENBQUM7UUFDOUIsU0FBSSxHQUEwQyxJQUFJLENBQUM7UUFDbkQsaUJBQVksR0FBd0IsSUFBSSxDQUFDO1FBRXpDLFNBQUksR0FBRyxDQUFDLENBQUM7UUFDVCxTQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ1QsU0FBSSxHQUFHLENBQUMsQ0FBQztRQUVULE9BQUUsR0FBZSxTQUFTLEVBQUUsQ0FBQyxDQUFDLDBCQUEwQjtRQUN4RCxPQUFFLEdBQWUsU0FBUyxFQUFFLENBQUMsQ0FBQyx5QkFBeUI7UUFDdkQsU0FBSSxHQUFlLFNBQVMsRUFBRSxDQUFDO0lBMk56QyxDQUFDO0lBek5DOzs7Ozs7Ozs7T0FTRztJQUNILEtBQUssQ0FBQyxPQUFnQixFQUFFLE1BQWtCO1FBQ3hDLElBQUksQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDO1FBRTNCLDZFQUE2RTtRQUM3RSxJQUFBLGlCQUFPLEVBQUMsT0FBTyxDQUFDLENBQUM7UUFDakIsSUFBQSxxQkFBVyxHQUFF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QUUsQ0FBQztZQUM1QixJQUFBLGtCQUFRLEVBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM5QixJQUFBLGtCQUFRLEVBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBQ0QsSUFBQSxpQkFBTyxFQUFDLElBQUEsb0JBQVUsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXZCLElBQUEsaUJBQU8sR0FBRSxDQUFDLENBQUMscURBQXFEO0lBQ2xFLENBQUM7Q0FDRjtBQTNPRCw0QkEyT0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIG5jdXJzZXMtcG9uZyAtIFBvcnQgb2YgdmljZW50ZWJvbGVhL1BvbmctY3Vyc2VzICh+NzEgbGluZXMpXG4gKlxuICogT3JpZ2luYWwgQyBjb2RlOiBodHRwczovL2dpdGh1Yi5jb20vdmljZW50ZWJvbGVhL1BvbmctY3Vyc2VzXG4gKiBBdXRob3I6IFZpY2VudGUgQWRvbGZvIEJvbGVhIFNhbmNoZXogPHZpY2VudGUuYm9sZWFAZ21haWwuY29tPlxuICpcbiAqIFRoaXMgcG9ydCB2YWxpZGF0ZXMgdGhlIG5jdXJzZXMgY29tcGF0aWJpbGl0eSBsYXllciBieSBwb3J0aW5nXG4gKiBhIHJlYWwgbmN1cnNlcyBnYW1lIHdpdGggbWluaW1hbCBjaGFuZ2VzIGZyb20gdGhlIG9yaWdpbmFsIEMuXG4gKlxuICogS2V5IGRpZmZlcmVuY2VzIGZyb20gQzpcbiAqIC0gdHlwZWRlZiBzdHJ1Y3QgcmVwbGFjZWQgd2l0aCBpbnRlcmZhY2VcbiAqIC0gZ2V0bWF4eXggbWFjcm8gcmVwbGFjZWQgd2l0aCBnZXRMSU5FUy9nZXRDT0xTXG4gKiAtIHRoZSBDIGB3aGlsZSAoIWVuZCkgeyB1c2xlZXAoNDAwMCk7IC4uLiBnZXRjaCgpOyB9YCBsb29wIGlzIElOVkVSVEVEOlxuICogICBhIEJCUyBkb29yIGlzIGRyaXZlbiBieSB0aGUgY2FsbGVyJ3Mga2V5c3Ryb2tlcywgbm90IGJ5IGEgYmxvY2tpbmcgcmVhZC5cbiAqICAgYHN0YXJ0KClgIHBhaW50cyBhbmQgcGFya3MgdGhlIGxvb3Agb24gYW4gaW50ZXJ2YWwgaXQgb3duczsgYHRpY2soKWAgaXNcbiAqICAgb25lIGl0ZXJhdGlvbiBvZiB0aGUgb2xkIGxvb3AgYm9keTsgYGhhbmRsZUtleSgpYCBpcyB0aGUgb2xkXG4gKiAgIGBzd2l0Y2ggKGdldGNoKCkpYC4gU2VlIHRoZSByZXBvcnQgcmVmZXJlbmNlZCBpbiBpbmRleC50cyBmb3Igd2h5LlxuICovXG5cbmltcG9ydCB7XG4gIC8vIEluaXRpYWxpemF0aW9uXG4gIGluaXRzY3IsXG4gIGVuZHdpbixcbiAgc3RhcnRfY29sb3IsXG4gIGluaXRfcGFpcixcbiAga2V5cGFkLFxuICBub2VjaG8sXG4gIGN1cnNfc2V0LFxuICBnZXRTdGRzY3IsXG5cbiAgLy8gU2NyZWVuIGluZm9cbiAgZ2V0TElORVMsXG4gIGdldENPTFMsXG5cbiAgLy8gT3V0cHV0XG4gIG12cHJpbnR3LFxuICBtdnZsaW5lLFxuICBlcmFzZSxcbiAgcmVmcmVzaCxcblxuICAvLyBBdHRyaWJ1dGVzXG4gIGF0dHJvbixcbiAgYXR0cm9mZixcbiAgQ09MT1JfUEFJUixcblxuICAvLyBDb25zdGFudHNcbiAgQ09MT1JfQkxVRSxcbiAgQ09MT1JfQkxBQ0ssXG4gIEFDU19WTElORSxcbn0gZnJvbSBcIkBhbWlleHByZXNzL2Jicy1kb29yLXNkay9uY3Vyc2VzXCI7XG5cbi8vIE9yaWdpbmFsIEM6IHR5cGVkZWYgc3RydWN0e3Nob3J0IGludCB4LCB5LCBjOyBib29sIG1vdmhvciwgbW92dmVyO30gb2JqZWN0O1xuaW50ZXJmYWNlIEdhbWVPYmplY3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgYzogbnVtYmVyOyAvLyBzY29yZSBjb3VudGVyXG4gIG1vdmhvcjogYm9vbGVhbjtcbiAgbW92dmVyOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBuZXdPYmplY3QoKTogR2FtZU9iamVjdCB7XG4gIHJldHVybiB7IHg6IDAsIHk6IDAsIGM6IDAsIG1vdmhvcjogZmFsc2UsIG1vdnZlcjogZmFsc2UgfTtcbn1cblxuLyoqXG4gKiBQaGFzZXMgb2YgYSBnYW1lLlxuICpcbiAqIGB0aXRsZWAgaXMgdGhlIG9yaWdpbmFsJ3MgYGF3YWl0IGdldGNoKClgIGJlZm9yZSBgbm9kZWxheShzdGRzY3IsMSlgOlxuICogdGhlIGJvYXJkIGlzIHBhaW50ZWQgYnV0IGZyb3plbiB1bnRpbCB0aGUgY2FsbGVyIHByZXNzZXMgc29tZXRoaW5nLlxuICogYHBhdXNlZGAgaXMgdGhlIG9yaWdpbmFsJ3MgYG5vZGVsYXkoZmFsc2UpOyBhd2FpdCBnZXRjaCgpOyBub2RlbGF5KHRydWUpO2AuXG4gKi9cbnR5cGUgUG9uZ1BoYXNlID0gXCJ0aXRsZVwiIHwgXCJwbGF5aW5nXCIgfCBcInBhdXNlZFwiIHwgXCJmaW5pc2hlZFwiO1xuXG4vKipcbiAqIE9uZSB0aWNrIG9mIHRoZSBnYW1lIGxvb3AuXG4gKlxuICogT3JpZ2luYWwgQzogdXNsZWVwKDQwMDApIC0gNDAwMCBtaWNyb3NlY29uZHMgPSA0bXMuXG4gKiBCQlMgb3B0aW1pc2F0aW9uOiAzM21zID0gfjMwZnBzLCBtdWNoIGJldHRlciBmb3IgbmV0d29yay9DUFUuXG4gKi9cbmV4cG9ydCBjb25zdCBQT05HX1RJQ0tfTVMgPSAzMztcblxuZXhwb3J0IGNsYXNzIFBvbmdEb29yIHtcbiAgbmFtZSA9IFwibmN1cnNlcy1wb25nXCI7XG4gIHZlcnNpb24gPSBcIjEuMC4wXCI7XG4gIGF1dGhvciA9IFwiVmljZW50ZSBCb2xlYSAob3JpZ2luYWwpLCBBbWlFeHByZXNzIChwb3J0KVwiO1xuICBkZXNjcmlwdGlvbiA9IFwiQ2xhc3NpYyBQb25nIC0gbmN1cnNlcyBwb3J0IHZhbGlkYXRpb25cIjtcblxuICBwcml2YXRlIHBoYXNlOiBQb25nUGhhc2UgPSBcImZpbmlzaGVkXCI7XG4gIHByaXZhdGUgbG9vcDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0SW50ZXJ2YWw+IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcXVpdENhbGxiYWNrOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIHNjclggPSAwO1xuICBwcml2YXRlIHNjclkgPSAwO1xuICBwcml2YXRlIGNvbnQgPSAwO1xuXG4gIHByaXZhdGUgYjE6IEdhbWVPYmplY3QgPSBuZXdPYmplY3QoKTsgLy8gcGxheWVyIDEgcGFkZGxlIChyaWdodClcbiAgcHJpdmF0ZSBiMjogR2FtZU9iamVjdCA9IG5ld09iamVjdCgpOyAvLyBwbGF5ZXIgMiBwYWRkbGUgKGxlZnQpXG4gIHByaXZhdGUgYmFsbDogR2FtZU9iamVjdCA9IG5ld09iamVjdCgpO1xuXG4gIC8qKlxuICAgKiBJbml0aWFsaXNlIG5jdXJzZXMsIHBhaW50IHRoZSB0aXRsZSBzY3JlZW4sIHBhcmsgdGhlIGdhbWUgbG9vcCwgUkVUVVJOLlxuICAgKlxuICAgKiBSZXR1cm5pbmcgaXMgdGhlIHdob2xlIHBvaW50OiBgRG9vci5leGVjdXRlKClgIG9ubHkgcmVhY2hlcyB0aGUgU0RLIGlucHV0XG4gICAqIGxvb3AgLSB0aGUgb25lIHRoaW5nIHRoYXQgaW5zdGFsbHMgYGJic1Nlc3Npb24uZG9vcklucHV0SGFuZGxlcmAgLSBhZnRlclxuICAgKiBldmVyeSBzdGFydCBoYW5kbGVyIGhhcyByZXNvbHZlZCAoc2RrL3NyYy9jb3JlL0Rvb3IudHM6MTE4LTEzMSwgOjI1MCkuXG4gICAqXG4gICAqIEBwYXJhbSBjb250ZXh0IC0gdGhlIG5jdXJzZXMgSS9PIGNvbnRleHQgKGFueXRoaW5nIHdpdGggYGVtaXRgL2B3cml0ZWApXG4gICAqIEBwYXJhbSBvblF1aXQgIC0gY2FsbGVkIG9uY2UsIHdoZW4gdGhlIHBsYXllciBoYXMgcHJlc3NlZCBFU0NcbiAgICovXG4gIHN0YXJ0KGNvbnRleHQ6IHVua25vd24sIG9uUXVpdDogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMucXVpdENhbGxiYWNrID0gb25RdWl0O1xuXG4gICAgLy8gT3JpZ2luYWwgQzogaW5pdHNjcigpOyBzdGFydF9jb2xvcigpOyBpbml0X3BhaXIoMSxDT0xPUl9CTFVFLENPTE9SX0JMQUNLKTtcbiAgICBpbml0c2NyKGNvbnRleHQpO1xuICAgIHN0YXJ0X2NvbG9yKCk7XG4gICAgaW5pdF9wYWlyKDEsIENPTE9SX0JMVUUsIENPTE9SX0JMQUNLKTtcblxuICAgIC8vIE9yaWdpbmFsIEM6IGtleXBhZChzdGRzY3IsdHJ1ZSk7IG5vZWNobygpOyBjdXJzX3NldCgwKTtcbiAgICBjb25zdCBzdGRzY3IgPSBnZXRTdGRzY3IoKTtcbiAgICBpZiAoc3Rkc2NyKSB7XG4gICAgICBrZXlwYWQoc3Rkc2NyLCB0cnVlKTtcbiAgICB9XG4gICAgbm9lY2hvKCk7XG4gICAgY3Vyc19zZXQoMCk7XG5cbiAgICAvLyBPcmlnaW5hbCBDOiBnZXRtYXh5eChzdGRzY3Isc2NyLnksc2NyLngpO1xuICAgIHRoaXMuc2NyWSA9IGdldExJTkVTKCk7XG4gICAgdGhpcy5zY3JYID0gZ2V0Q09MUygpO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogb2JqZWN0IGIxPXtzY3IueC0yLHNjci55LzIsMCxmYWxzZSxmYWxzZX0sIC4uLlxuICAgIHRoaXMuYjEgPSB7IHg6IHRoaXMuc2NyWCAtIDIsIHk6IE1hdGguZmxvb3IodGhpcy5zY3JZIC8gMiksIGM6IDAsIG1vdmhvcjogZmFsc2UsIG1vdnZlcjogZmFsc2UgfTtcbiAgICB0aGlzLmIyID0geyB4OiAxLCB5OiBNYXRoLmZsb29yKHRoaXMuc2NyWSAvIDIpLCBjOiAwLCBtb3Zob3I6IGZhbHNlLCBtb3Z2ZXI6IGZhbHNlIH07XG4gICAgdGhpcy5iYWxsID0ge1xuICAgICAgeDogTWF0aC5mbG9vcih0aGlzLnNjclggLyAyKSxcbiAgICAgIHk6IE1hdGguZmxvb3IodGhpcy5zY3JZIC8gMiksXG4gICAgICBjOiAwLFxuICAgICAgbW92aG9yOiBmYWxzZSxcbiAgICAgIG1vdnZlcjogZmFsc2UsXG4gICAgfTtcbiAgICB0aGlzLmNvbnQgPSAwO1xuXG4gICAgLy8gU2hvdyB0aXRsZSBzY3JlZW5cbiAgICBtdnByaW50dyhcbiAgICAgIDQsXG4gICAgICAwLFxuICAgICAgXCJcXHQgICAgICAgICAgIG9vb29vb29vb28gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICAgODg4ICAgIDg4OCAgb29vb29vbyAgICBvb29vb29vICAgIG9vb29vb29vOCAgICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgICA4ODhvb29vODggODg4ICAgICA4ODggODg4ICAgODg4ICA4ODggICAgODhvICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgICAgICAgICAgIDg4OCAgICAgICA4ODggICAgIDg4OCA4ODggICA4ODggICA4ODhvbzg4OG8gICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICBvODg4byAgICAgICAgODhvb284OCAgbzg4OG8gbzg4OG8gODg4ICAgICA4ODggICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgODg4b29vODg4ICAgICBcXG5cXG5cIiArXG4gICAgICAgIFwiXFx0IE9yaWdpbmFsIGJ5IFZpY2VudGUgQm9sZWEgLSBQb3J0ZWQgdG8gQW1pRXhwcmVzcyBuY3Vyc2VzICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCBcXHRcXHRcXHRQbGF5ZXIgMSBjb250cm9sczogVVAvRE9XTiBhcnJvd3MgICAgICAgICAgICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCBcXHRcXHRcXHRQbGF5ZXIgMiBjb250cm9sczogUSAodXApIGFuZCBBIChkb3duKSAgICAgICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCBcXHRcXHRcXHRQcmVzcyBBTlkga2V5IHRvIHN0YXJ0LCBQIGZvciBwYXVzZSwgRVNDIHRvIHF1aXRcIlxuICAgICk7XG5cbiAgICByZWZyZXNoKCk7IC8vIENSSVRJQ0FMOiBGbHVzaCBvdXRwdXQgdG8gdGVybWluYWwgYmVmb3JlIHdhaXRpbmcgZm9yIGlucHV0XG4gICAgdGhpcy5waGFzZSA9IFwidGl0bGVcIjtcblxuICAgIC8vIFRoZSBsb29wIHRoaXMgZG9vciBvd25zLiBJdCBydW5zIGZyb20gdGhlIHRpdGxlIHNjcmVlbiBvbiBzbyB0aGF0IHRoZVxuICAgIC8vIGdhbWUgaGFzIGEgaGVhcnRiZWF0IG9mIGl0cyBvd24gdGhlIG1vbWVudCB0aGUgY2FsbGVyIHN0YXJ0cyBpdCwgYW5kIGl0XG4gICAgLy8gaXMgY2xlYXJlZCBpbiBzdG9wKCkuXG4gICAgdGhpcy5sb29wID0gc2V0SW50ZXJ2YWwoKCkgPT4gdGhpcy50aWNrKCksIFBPTkdfVElDS19NUyk7XG4gIH1cblxuICAvKipcbiAgICogT25lIGl0ZXJhdGlvbiBvZiB0aGUgb3JpZ2luYWwgYGZvciAobm9kZWxheShzdGRzY3IsMSk7ICFlbmQ7IHVzbGVlcCg0MDAwKSlgXG4gICAqIGJvZHksIG1pbnVzIHRoZSBgZ2V0Y2goKWAgKGtleXMgYXJyaXZlIHRocm91Z2ggaGFuZGxlS2V5IG5vdykuXG4gICAqL1xuICB0aWNrKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnBoYXNlICE9PSBcInBsYXlpbmdcIikgcmV0dXJuO1xuXG4gICAgY29uc3QgeyBiMSwgYjIsIGJhbGw6IGIgfSA9IHRoaXM7XG4gICAgY29uc3Qgc2NyWCA9IHRoaXMuc2NyWDtcbiAgICBjb25zdCBzY3JZID0gdGhpcy5zY3JZO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogaWYgKCsrY29udCUxNj09MClcbiAgICAvLyBBZGp1c3QgZ2FtZSBsb2dpYyB0byBtYXRjaCBuZXcgdGljayByYXRlICh3YXMgMTYgdGlja3MgQCA0bXMgPSA2NG1zKS5cbiAgICAvLyBXaXRoIDMzbXMgdGlja3MsIHdlIHVwZGF0ZSBldmVyeSAyIHRpY2tzICh+NjZtcykuXG4gICAgdGhpcy5jb250Kys7XG4gICAgaWYgKHRoaXMuY29udCAlIDIgPT09IDApIHtcbiAgICAgIC8vIEJhbGwgdmVydGljYWwgYm91bmNlXG4gICAgICBpZiAoYi55ID09PSBzY3JZIC0gMSB8fCBiLnkgPT09IDEpIHtcbiAgICAgICAgYi5tb3Z2ZXIgPSAhYi5tb3Z2ZXI7XG4gICAgICB9XG5cbiAgICAgIC8vIEJhbGwgaG9yaXpvbnRhbCBib3VuY2UgKHBhZGRsZSBjb2xsaXNpb24pXG4gICAgICBpZiAoYi54ID49IHNjclggLSAyIHx8IGIueCA8PSAyKSB7XG4gICAgICAgIGIubW92aG9yID0gIWIubW92aG9yO1xuXG4gICAgICAgIGlmIChiLnkgPT09IGIxLnkgLSAxIHx8IGIueSA9PT0gYjIueSAtIDEpIHtcbiAgICAgICAgICBiLm1vdnZlciA9IGZhbHNlO1xuICAgICAgICB9IGVsc2UgaWYgKGIueSA9PT0gYjEueSArIDEgfHwgYi55ID09PSBiMi55ICsgMSkge1xuICAgICAgICAgIGIubW92dmVyID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmIChiLnkgIT09IGIxLnkgJiYgYi55ICE9PSBiMi55KSB7XG4gICAgICAgICAgLy8gU2NvcmUhXG4gICAgICAgICAgaWYgKGIueCA+PSBzY3JYIC0gMikge1xuICAgICAgICAgICAgYjEuYysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBiMi5jKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFJlc2V0IGJhbGxcbiAgICAgICAgICBiLnggPSBNYXRoLmZsb29yKHNjclggLyAyKTtcbiAgICAgICAgICBiLnkgPSBNYXRoLmZsb29yKHNjclkgLyAyKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBNb3ZlIGJhbGxcbiAgICAgIGIueCA9IGIubW92aG9yID8gYi54ICsgMSA6IGIueCAtIDE7XG4gICAgICBiLnkgPSBiLm1vdnZlciA/IGIueSArIDEgOiBiLnkgLSAxO1xuXG4gICAgICAvLyBQYWRkbGUgd3JhcC1hcm91bmRcbiAgICAgIGlmIChiMS55IDw9IDEpIGIxLnkgPSBzY3JZIC0gMjtcbiAgICAgIGlmIChiMS55ID49IHNjclkgLSAxKSBiMS55ID0gMjtcbiAgICAgIGlmIChiMi55IDw9IDEpIGIyLnkgPSBzY3JZIC0gMjtcbiAgICAgIGlmIChiMi55ID49IHNjclkgLSAxKSBiMi55ID0gMjtcbiAgICB9XG5cbiAgICB0aGlzLmRyYXcoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgb3JpZ2luYWwgYHN3aXRjaCAoZ2V0Y2goKSlgLCBkcml2ZW4gYnkgdGhlIGNhbGxlcidzIGtleXN0cm9rZS5cbiAgICpcbiAgICogQHBhcmFtIG5hbWUgLSBhIGtleSBuYW1lIGFzIHBhcnNlZCBvZmYgdGhlIHdpcmU6IFwidXBcIiwgXCJkb3duXCIsIFwiZXNjYXBlXCIsXG4gICAqICAgICAgICAgICAgICAgb3IgdGhlIGNoYXJhY3RlciBpdHNlbGYuXG4gICAqL1xuICBoYW5kbGVLZXkobmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucGhhc2UgPT09IFwiZmluaXNoZWRcIikgcmV0dXJuO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogdGhlIGBhd2FpdCBnZXRjaCgpYCB1bmRlciB0aGUgdGl0bGUgc2NyZWVuLCBhbmQgdGhlXG4gICAgLy8gYG5vZGVsYXkoZmFsc2UpOyBhd2FpdCBnZXRjaCgpOyBub2RlbGF5KHRydWUpO2Agb2YgdGhlIHBhdXNlIC0gYm90aCBhcmVcbiAgICAvLyBcImFueSBrZXkgY29udGludWVzXCIuXG4gICAgaWYgKHRoaXMucGhhc2UgPT09IFwidGl0bGVcIiB8fCB0aGlzLnBoYXNlID09PSBcInBhdXNlZFwiKSB7XG4gICAgICB0aGlzLnBoYXNlID0gXCJwbGF5aW5nXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc3dpdGNoIChuYW1lKSB7XG4gICAgICBjYXNlIFwiZG93blwiOlxuICAgICAgICB0aGlzLmIxLnkrKztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidXBcIjpcbiAgICAgICAgdGhpcy5iMS55LS07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInFcIjpcbiAgICAgIGNhc2UgXCJRXCI6XG4gICAgICAgIHRoaXMuYjIueS0tO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJhXCI6XG4gICAgICBjYXNlIFwiQVwiOlxuICAgICAgICB0aGlzLmIyLnkrKztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwicFwiOlxuICAgICAgY2FzZSBcIlBcIjpcbiAgICAgICAgLy8gUGF1c2UgLSB3YWl0IGZvciBhbnkga2V5XG4gICAgICAgIHRoaXMucGhhc2UgPSBcInBhdXNlZFwiO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJlc2NhcGVcIjpcbiAgICAgICAgdGhpcy5xdWl0KCk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wIHRoZSBnYW1lIGxvb3AgYW5kIGxlYXZlIG5jdXJzZXMgbW9kZS4gSWRlbXBvdGVudDogdGhlIGRvb3IgY2FsbHMgaXRcbiAgICogZnJvbSBpdHMgY2xvc2UgaGFuZGxlciBhcyB3ZWxsIGFzIGZyb20gdGhlIEVTQyBwYXRoLCBhbmQgYGVuZHdpbigpYCBwdXRzXG4gICAqIHJlYWwgYnl0ZXMgb24gdGhlIHdpcmUgKHNob3cgY3Vyc29yLCByZXNldCBhdHRyaWJ1dGVzLCBsZWF2ZSB0aGUgYWx0ZXJuYXRlXG4gICAqIHNjcmVlbikuIFRoZSBwaGFzZSBndWFyZCBpcyB3aGF0IG1ha2VzIHRoZSBzZWNvbmQgY2FsbCBhIG5vLW9wIEhFUkUsXG4gICAqIHJhdGhlciB0aGFuIGxlYW5pbmcgb24gYGVuZHdpbigpYCdzIG93biBgaW5pdGlhbGl6ZWRgIGNoZWNrXG4gICAqIChgc2RrL2VuZ2luZXMvdWkvbmN1cnNlcy9uY3Vyc2VzLnRzOjI0Ni0yNDlgKSB0byBzd2FsbG93IGl0LlxuICAgKi9cbiAgc3RvcCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5waGFzZSA9PT0gXCJmaW5pc2hlZFwiKSByZXR1cm47XG4gICAgaWYgKHRoaXMubG9vcCkge1xuICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmxvb3ApO1xuICAgICAgdGhpcy5sb29wID0gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5waGFzZSA9IFwiZmluaXNoZWRcIjtcbiAgICBlbmR3aW4oKTtcbiAgfVxuXG4gIC8qKiBPcmlnaW5hbCBDOiBgZW5kID0gdHJ1ZTtgIGFuZCB0aGUgYGVuZHdpbigpYCBhZnRlciB0aGUgbG9vcC4gKi9cbiAgcHJpdmF0ZSBxdWl0KCk6IHZvaWQge1xuICAgIGNvbnN0IG9uUXVpdCA9IHRoaXMucXVpdENhbGxiYWNrO1xuICAgIHRoaXMucXVpdENhbGxiYWNrID0gbnVsbDtcbiAgICB0aGlzLnN0b3AoKTtcbiAgICBpZiAob25RdWl0KSBvblF1aXQoKTtcbiAgfVxuXG4gIC8qKiBUaGUgZHJhd2luZyBoYWxmIG9mIHRoZSBvcmlnaW5hbCBsb29wIGJvZHkuICovXG4gIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcbiAgICBjb25zdCB7IGIxLCBiMiwgYmFsbDogYiB9ID0gdGhpcztcbiAgICBjb25zdCBzY3JYID0gdGhpcy5zY3JYO1xuICAgIGNvbnN0IHNjclkgPSB0aGlzLnNjclk7XG5cbiAgICBlcmFzZSgpO1xuXG4gICAgLy8gU2NvcmUgZGlzcGxheVxuICAgIG12cHJpbnR3KDIsIE1hdGguZmxvb3Ioc2NyWCAvIDIpIC0gMiwgYCR7YjEuY30gfCAke2IyLmN9YCk7XG5cbiAgICAvLyBDZW50ZXIgbGluZVxuICAgIG12dmxpbmUoMCwgTWF0aC5mbG9vcihzY3JYIC8gMiksIEFDU19WTElORSwgc2NyWSk7XG5cbiAgICAvLyBCYWxsIGFuZCBwYWRkbGVzIGluIGJsdWVcbiAgICBhdHRyb24oQ09MT1JfUEFJUigxKSk7XG4gICAgbXZwcmludHcoYi55LCBiLngsIFwib1wiKTtcbiAgICBmb3IgKGxldCBpID0gLTE7IGkgPCAyOyBpKyspIHtcbiAgICAgIG12cHJpbnR3KGIxLnkgKyBpLCBiMS54LCBcInxcIik7XG4gICAgICBtdnByaW50dyhiMi55ICsgaSwgYjIueCwgXCJ8XCIpO1xuICAgIH1cbiAgICBhdHRyb2ZmKENPTE9SX1BBSVIoMSkpO1xuXG4gICAgcmVmcmVzaCgpOyAvLyBDUklUSUNBTDogU2VuZCB0aGUgdXBkYXRlZCBidWZmZXIgdG8gdGhlIHRlcm1pbmFsIVxuICB9XG59XG4iXX0=