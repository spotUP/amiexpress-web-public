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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7OztBQUVILHlFQThCcUQ7QUFXckQsU0FBUyxTQUFTO0lBQ2hCLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUM1RCxDQUFDO0FBV0Q7Ozs7O0dBS0c7QUFDVSxRQUFBLFlBQVksR0FBRyxFQUFFLENBQUM7QUFFL0IsTUFBYSxRQUFRO0lBQXJCO1FBQ0UsU0FBSSxHQUFHLGNBQWMsQ0FBQztRQUN0QixZQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ2xCLFdBQU0sR0FBRyw2Q0FBNkMsQ0FBQztRQUN2RCxnQkFBVyxHQUFHLHdDQUF3QyxDQUFDO1FBRS9DLFVBQUssR0FBYyxVQUFVLENBQUM7UUFDOUIsU0FBSSxHQUEwQyxJQUFJLENBQUM7UUFDbkQsaUJBQVksR0FBd0IsSUFBSSxDQUFDO1FBRXpDLFNBQUksR0FBRyxDQUFDLENBQUM7UUFDVCxTQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ1QsU0FBSSxHQUFHLENBQUMsQ0FBQztRQUVULE9BQUUsR0FBZSxTQUFTLEVBQUUsQ0FBQyxDQUFDLDBCQUEwQjtRQUN4RCxPQUFFLEdBQWUsU0FBUyxFQUFFLENBQUMsQ0FBQyx5QkFBeUI7UUFDdkQsU0FBSSxHQUFlLFNBQVMsRUFBRSxDQUFDO0lBMk56QyxDQUFDO0lBek5DOzs7Ozs7Ozs7T0FTRztJQUNILEtBQUssQ0FBQyxPQUFnQixFQUFFLE1BQWtCO1FBQ3hDLElBQUksQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDO1FBRTNCLDZFQUE2RTtRQUM3RSxJQUFBLGlCQUFPLEVBQUMsT0FBTyxDQUFDLENBQUM7UUFDakIsSUFBQSxxQkFBVyxHQUFF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QUUsQ0FBQztZQUM1QixJQUFBLGtCQUFRLEVBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM5QixJQUFBLGtCQUFRLEVBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBQ0QsSUFBQSxpQkFBTyxFQUFDLElBQUEsb0JBQVUsRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXZCLElBQUEsaUJBQU8sR0FBRSxDQUFDLENBQUMscURBQXFEO0lBQ2xFLENBQUM7Q0FDRjtBQTNPRCw0QkEyT0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIG5jdXJzZXMtcG9uZyAtIFBvcnQgb2YgdmljZW50ZWJvbGVhL1BvbmctY3Vyc2VzICh+NzEgbGluZXMpXG4gKlxuICogT3JpZ2luYWwgQyBjb2RlOiBodHRwczovL2dpdGh1Yi5jb20vdmljZW50ZWJvbGVhL1BvbmctY3Vyc2VzXG4gKiBBdXRob3I6IFZpY2VudGUgQWRvbGZvIEJvbGVhIFNhbmNoZXogPHZpY2VudGUuYm9sZWFAZ21haWwuY29tPlxuICpcbiAqIFRoaXMgcG9ydCB2YWxpZGF0ZXMgdGhlIG5jdXJzZXMgY29tcGF0aWJpbGl0eSBsYXllciBieSBwb3J0aW5nXG4gKiBhIHJlYWwgbmN1cnNlcyBnYW1lIHdpdGggbWluaW1hbCBjaGFuZ2VzIGZyb20gdGhlIG9yaWdpbmFsIEMuXG4gKlxuICogS2V5IGRpZmZlcmVuY2VzIGZyb20gQzpcbiAqIC0gdHlwZWRlZiBzdHJ1Y3QgcmVwbGFjZWQgd2l0aCBpbnRlcmZhY2VcbiAqIC0gZ2V0bWF4eXggbWFjcm8gcmVwbGFjZWQgd2l0aCBnZXRMSU5FUy9nZXRDT0xTXG4gKiAtIHRoZSBDIGB3aGlsZSAoIWVuZCkgeyB1c2xlZXAoNDAwMCk7IC4uLiBnZXRjaCgpOyB9YCBsb29wIGlzIElOVkVSVEVEOlxuICogICBhIEJCUyBkb29yIGlzIGRyaXZlbiBieSB0aGUgY2FsbGVyJ3Mga2V5c3Ryb2tlcywgbm90IGJ5IGEgYmxvY2tpbmcgcmVhZC5cbiAqICAgYHN0YXJ0KClgIHBhaW50cyBhbmQgcGFya3MgdGhlIGxvb3Agb24gYW4gaW50ZXJ2YWwgaXQgb3duczsgYHRpY2soKWAgaXNcbiAqICAgb25lIGl0ZXJhdGlvbiBvZiB0aGUgb2xkIGxvb3AgYm9keTsgYGhhbmRsZUtleSgpYCBpcyB0aGUgb2xkXG4gKiAgIGBzd2l0Y2ggKGdldGNoKCkpYC4gU2VlIHRoZSByZXBvcnQgcmVmZXJlbmNlZCBpbiBpbmRleC50cyBmb3Igd2h5LlxuICovXG5cbmltcG9ydCB7XG4gIC8vIEluaXRpYWxpemF0aW9uXG4gIGluaXRzY3IsXG4gIGVuZHdpbixcbiAgc3RhcnRfY29sb3IsXG4gIGluaXRfcGFpcixcbiAga2V5cGFkLFxuICBub2VjaG8sXG4gIGN1cnNfc2V0LFxuICBnZXRTdGRzY3IsXG5cbiAgLy8gU2NyZWVuIGluZm9cbiAgZ2V0TElORVMsXG4gIGdldENPTFMsXG5cbiAgLy8gT3V0cHV0XG4gIG12cHJpbnR3LFxuICBtdnZsaW5lLFxuICBlcmFzZSxcbiAgcmVmcmVzaCxcblxuICAvLyBBdHRyaWJ1dGVzXG4gIGF0dHJvbixcbiAgYXR0cm9mZixcbiAgQ09MT1JfUEFJUixcblxuICAvLyBDb25zdGFudHNcbiAgQ09MT1JfQkxVRSxcbiAgQ09MT1JfQkxBQ0ssXG4gIEFDU19WTElORSxcbn0gZnJvbSBcIkBhbWlleHByZXNzL2Jicy1kb29yLXNkay9lbmdpbmVzL3VpL25jdXJzZXNcIjtcblxuLy8gT3JpZ2luYWwgQzogdHlwZWRlZiBzdHJ1Y3R7c2hvcnQgaW50IHgsIHksIGM7IGJvb2wgbW92aG9yLCBtb3Z2ZXI7fSBvYmplY3Q7XG5pbnRlcmZhY2UgR2FtZU9iamVjdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBjOiBudW1iZXI7IC8vIHNjb3JlIGNvdW50ZXJcbiAgbW92aG9yOiBib29sZWFuO1xuICBtb3Z2ZXI6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIG5ld09iamVjdCgpOiBHYW1lT2JqZWN0IHtcbiAgcmV0dXJuIHsgeDogMCwgeTogMCwgYzogMCwgbW92aG9yOiBmYWxzZSwgbW92dmVyOiBmYWxzZSB9O1xufVxuXG4vKipcbiAqIFBoYXNlcyBvZiBhIGdhbWUuXG4gKlxuICogYHRpdGxlYCBpcyB0aGUgb3JpZ2luYWwncyBgYXdhaXQgZ2V0Y2goKWAgYmVmb3JlIGBub2RlbGF5KHN0ZHNjciwxKWA6XG4gKiB0aGUgYm9hcmQgaXMgcGFpbnRlZCBidXQgZnJvemVuIHVudGlsIHRoZSBjYWxsZXIgcHJlc3NlcyBzb21ldGhpbmcuXG4gKiBgcGF1c2VkYCBpcyB0aGUgb3JpZ2luYWwncyBgbm9kZWxheShmYWxzZSk7IGF3YWl0IGdldGNoKCk7IG5vZGVsYXkodHJ1ZSk7YC5cbiAqL1xudHlwZSBQb25nUGhhc2UgPSBcInRpdGxlXCIgfCBcInBsYXlpbmdcIiB8IFwicGF1c2VkXCIgfCBcImZpbmlzaGVkXCI7XG5cbi8qKlxuICogT25lIHRpY2sgb2YgdGhlIGdhbWUgbG9vcC5cbiAqXG4gKiBPcmlnaW5hbCBDOiB1c2xlZXAoNDAwMCkgLSA0MDAwIG1pY3Jvc2Vjb25kcyA9IDRtcy5cbiAqIEJCUyBvcHRpbWlzYXRpb246IDMzbXMgPSB+MzBmcHMsIG11Y2ggYmV0dGVyIGZvciBuZXR3b3JrL0NQVS5cbiAqL1xuZXhwb3J0IGNvbnN0IFBPTkdfVElDS19NUyA9IDMzO1xuXG5leHBvcnQgY2xhc3MgUG9uZ0Rvb3Ige1xuICBuYW1lID0gXCJuY3Vyc2VzLXBvbmdcIjtcbiAgdmVyc2lvbiA9IFwiMS4wLjBcIjtcbiAgYXV0aG9yID0gXCJWaWNlbnRlIEJvbGVhIChvcmlnaW5hbCksIEFtaUV4cHJlc3MgKHBvcnQpXCI7XG4gIGRlc2NyaXB0aW9uID0gXCJDbGFzc2ljIFBvbmcgLSBuY3Vyc2VzIHBvcnQgdmFsaWRhdGlvblwiO1xuXG4gIHByaXZhdGUgcGhhc2U6IFBvbmdQaGFzZSA9IFwiZmluaXNoZWRcIjtcbiAgcHJpdmF0ZSBsb29wOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRJbnRlcnZhbD4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBxdWl0Q2FsbGJhY2s6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgc2NyWCA9IDA7XG4gIHByaXZhdGUgc2NyWSA9IDA7XG4gIHByaXZhdGUgY29udCA9IDA7XG5cbiAgcHJpdmF0ZSBiMTogR2FtZU9iamVjdCA9IG5ld09iamVjdCgpOyAvLyBwbGF5ZXIgMSBwYWRkbGUgKHJpZ2h0KVxuICBwcml2YXRlIGIyOiBHYW1lT2JqZWN0ID0gbmV3T2JqZWN0KCk7IC8vIHBsYXllciAyIHBhZGRsZSAobGVmdClcbiAgcHJpdmF0ZSBiYWxsOiBHYW1lT2JqZWN0ID0gbmV3T2JqZWN0KCk7XG5cbiAgLyoqXG4gICAqIEluaXRpYWxpc2UgbmN1cnNlcywgcGFpbnQgdGhlIHRpdGxlIHNjcmVlbiwgcGFyayB0aGUgZ2FtZSBsb29wLCBSRVRVUk4uXG4gICAqXG4gICAqIFJldHVybmluZyBpcyB0aGUgd2hvbGUgcG9pbnQ6IGBEb29yLmV4ZWN1dGUoKWAgb25seSByZWFjaGVzIHRoZSBTREsgaW5wdXRcbiAgICogbG9vcCAtIHRoZSBvbmUgdGhpbmcgdGhhdCBpbnN0YWxscyBgYmJzU2Vzc2lvbi5kb29ySW5wdXRIYW5kbGVyYCAtIGFmdGVyXG4gICAqIGV2ZXJ5IHN0YXJ0IGhhbmRsZXIgaGFzIHJlc29sdmVkIChzZGsvc3JjL2NvcmUvRG9vci50czoxMTgtMTMxLCA6MjUwKS5cbiAgICpcbiAgICogQHBhcmFtIGNvbnRleHQgLSB0aGUgbmN1cnNlcyBJL08gY29udGV4dCAoYW55dGhpbmcgd2l0aCBgZW1pdGAvYHdyaXRlYClcbiAgICogQHBhcmFtIG9uUXVpdCAgLSBjYWxsZWQgb25jZSwgd2hlbiB0aGUgcGxheWVyIGhhcyBwcmVzc2VkIEVTQ1xuICAgKi9cbiAgc3RhcnQoY29udGV4dDogdW5rbm93biwgb25RdWl0OiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5xdWl0Q2FsbGJhY2sgPSBvblF1aXQ7XG5cbiAgICAvLyBPcmlnaW5hbCBDOiBpbml0c2NyKCk7IHN0YXJ0X2NvbG9yKCk7IGluaXRfcGFpcigxLENPTE9SX0JMVUUsQ09MT1JfQkxBQ0spO1xuICAgIGluaXRzY3IoY29udGV4dCk7XG4gICAgc3RhcnRfY29sb3IoKTtcbiAgICBpbml0X3BhaXIoMSwgQ09MT1JfQkxVRSwgQ09MT1JfQkxBQ0spO1xuXG4gICAgLy8gT3JpZ2luYWwgQzoga2V5cGFkKHN0ZHNjcix0cnVlKTsgbm9lY2hvKCk7IGN1cnNfc2V0KDApO1xuICAgIGNvbnN0IHN0ZHNjciA9IGdldFN0ZHNjcigpO1xuICAgIGlmIChzdGRzY3IpIHtcbiAgICAgIGtleXBhZChzdGRzY3IsIHRydWUpO1xuICAgIH1cbiAgICBub2VjaG8oKTtcbiAgICBjdXJzX3NldCgwKTtcblxuICAgIC8vIE9yaWdpbmFsIEM6IGdldG1heHl4KHN0ZHNjcixzY3IueSxzY3IueCk7XG4gICAgdGhpcy5zY3JZID0gZ2V0TElORVMoKTtcbiAgICB0aGlzLnNjclggPSBnZXRDT0xTKCk7XG5cbiAgICAvLyBPcmlnaW5hbCBDOiBvYmplY3QgYjE9e3Njci54LTIsc2NyLnkvMiwwLGZhbHNlLGZhbHNlfSwgLi4uXG4gICAgdGhpcy5iMSA9IHsgeDogdGhpcy5zY3JYIC0gMiwgeTogTWF0aC5mbG9vcih0aGlzLnNjclkgLyAyKSwgYzogMCwgbW92aG9yOiBmYWxzZSwgbW92dmVyOiBmYWxzZSB9O1xuICAgIHRoaXMuYjIgPSB7IHg6IDEsIHk6IE1hdGguZmxvb3IodGhpcy5zY3JZIC8gMiksIGM6IDAsIG1vdmhvcjogZmFsc2UsIG1vdnZlcjogZmFsc2UgfTtcbiAgICB0aGlzLmJhbGwgPSB7XG4gICAgICB4OiBNYXRoLmZsb29yKHRoaXMuc2NyWCAvIDIpLFxuICAgICAgeTogTWF0aC5mbG9vcih0aGlzLnNjclkgLyAyKSxcbiAgICAgIGM6IDAsXG4gICAgICBtb3Zob3I6IGZhbHNlLFxuICAgICAgbW92dmVyOiBmYWxzZSxcbiAgICB9O1xuICAgIHRoaXMuY29udCA9IDA7XG5cbiAgICAvLyBTaG93IHRpdGxlIHNjcmVlblxuICAgIG12cHJpbnR3KFxuICAgICAgNCxcbiAgICAgIDAsXG4gICAgICBcIlxcdCAgICAgICAgICAgb29vb29vb29vbyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgICA4ODggICAgODg4ICBvb29vb29vICAgIG9vb29vb28gICAgb29vb29vb284ICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgICAgICAgICAgIDg4OG9vb284OCA4ODggICAgIDg4OCA4ODggICA4ODggIDg4OCAgICA4OG8gICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICAgODg4ICAgICAgIDg4OCAgICAgODg4IDg4OCAgIDg4OCAgIDg4OG9vODg4byAgICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgIG84ODhvICAgICAgICA4OG9vbzg4ICBvODg4byBvODg4byA4ODggICAgIDg4OCAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA4ODhvb284ODggICAgIFxcblxcblwiICtcbiAgICAgICAgXCJcXHQgT3JpZ2luYWwgYnkgVmljZW50ZSBCb2xlYSAtIFBvcnRlZCB0byBBbWlFeHByZXNzIG5jdXJzZXMgICBcXG5cIiArXG4gICAgICAgIFwiXFx0IFxcdFxcdFxcdFBsYXllciAxIGNvbnRyb2xzOiBVUC9ET1dOIGFycm93cyAgICAgICAgICAgICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0IFxcdFxcdFxcdFBsYXllciAyIGNvbnRyb2xzOiBRICh1cCkgYW5kIEEgKGRvd24pICAgICAgICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0IFxcdFxcdFxcdFByZXNzIEFOWSBrZXkgdG8gc3RhcnQsIFAgZm9yIHBhdXNlLCBFU0MgdG8gcXVpdFwiXG4gICAgKTtcblxuICAgIHJlZnJlc2goKTsgLy8gQ1JJVElDQUw6IEZsdXNoIG91dHB1dCB0byB0ZXJtaW5hbCBiZWZvcmUgd2FpdGluZyBmb3IgaW5wdXRcbiAgICB0aGlzLnBoYXNlID0gXCJ0aXRsZVwiO1xuXG4gICAgLy8gVGhlIGxvb3AgdGhpcyBkb29yIG93bnMuIEl0IHJ1bnMgZnJvbSB0aGUgdGl0bGUgc2NyZWVuIG9uIHNvIHRoYXQgdGhlXG4gICAgLy8gZ2FtZSBoYXMgYSBoZWFydGJlYXQgb2YgaXRzIG93biB0aGUgbW9tZW50IHRoZSBjYWxsZXIgc3RhcnRzIGl0LCBhbmQgaXRcbiAgICAvLyBpcyBjbGVhcmVkIGluIHN0b3AoKS5cbiAgICB0aGlzLmxvb3AgPSBzZXRJbnRlcnZhbCgoKSA9PiB0aGlzLnRpY2soKSwgUE9OR19USUNLX01TKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBPbmUgaXRlcmF0aW9uIG9mIHRoZSBvcmlnaW5hbCBgZm9yIChub2RlbGF5KHN0ZHNjciwxKTsgIWVuZDsgdXNsZWVwKDQwMDApKWBcbiAgICogYm9keSwgbWludXMgdGhlIGBnZXRjaCgpYCAoa2V5cyBhcnJpdmUgdGhyb3VnaCBoYW5kbGVLZXkgbm93KS5cbiAgICovXG4gIHRpY2soKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucGhhc2UgIT09IFwicGxheWluZ1wiKSByZXR1cm47XG5cbiAgICBjb25zdCB7IGIxLCBiMiwgYmFsbDogYiB9ID0gdGhpcztcbiAgICBjb25zdCBzY3JYID0gdGhpcy5zY3JYO1xuICAgIGNvbnN0IHNjclkgPSB0aGlzLnNjclk7XG5cbiAgICAvLyBPcmlnaW5hbCBDOiBpZiAoKytjb250JTE2PT0wKVxuICAgIC8vIEFkanVzdCBnYW1lIGxvZ2ljIHRvIG1hdGNoIG5ldyB0aWNrIHJhdGUgKHdhcyAxNiB0aWNrcyBAIDRtcyA9IDY0bXMpLlxuICAgIC8vIFdpdGggMzNtcyB0aWNrcywgd2UgdXBkYXRlIGV2ZXJ5IDIgdGlja3MgKH42Nm1zKS5cbiAgICB0aGlzLmNvbnQrKztcbiAgICBpZiAodGhpcy5jb250ICUgMiA9PT0gMCkge1xuICAgICAgLy8gQmFsbCB2ZXJ0aWNhbCBib3VuY2VcbiAgICAgIGlmIChiLnkgPT09IHNjclkgLSAxIHx8IGIueSA9PT0gMSkge1xuICAgICAgICBiLm1vdnZlciA9ICFiLm1vdnZlcjtcbiAgICAgIH1cblxuICAgICAgLy8gQmFsbCBob3Jpem9udGFsIGJvdW5jZSAocGFkZGxlIGNvbGxpc2lvbilcbiAgICAgIGlmIChiLnggPj0gc2NyWCAtIDIgfHwgYi54IDw9IDIpIHtcbiAgICAgICAgYi5tb3Zob3IgPSAhYi5tb3Zob3I7XG5cbiAgICAgICAgaWYgKGIueSA9PT0gYjEueSAtIDEgfHwgYi55ID09PSBiMi55IC0gMSkge1xuICAgICAgICAgIGIubW92dmVyID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSBpZiAoYi55ID09PSBiMS55ICsgMSB8fCBiLnkgPT09IGIyLnkgKyAxKSB7XG4gICAgICAgICAgYi5tb3Z2ZXIgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKGIueSAhPT0gYjEueSAmJiBiLnkgIT09IGIyLnkpIHtcbiAgICAgICAgICAvLyBTY29yZSFcbiAgICAgICAgICBpZiAoYi54ID49IHNjclggLSAyKSB7XG4gICAgICAgICAgICBiMS5jKys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGIyLmMrKztcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gUmVzZXQgYmFsbFxuICAgICAgICAgIGIueCA9IE1hdGguZmxvb3Ioc2NyWCAvIDIpO1xuICAgICAgICAgIGIueSA9IE1hdGguZmxvb3Ioc2NyWSAvIDIpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIE1vdmUgYmFsbFxuICAgICAgYi54ID0gYi5tb3Zob3IgPyBiLnggKyAxIDogYi54IC0gMTtcbiAgICAgIGIueSA9IGIubW92dmVyID8gYi55ICsgMSA6IGIueSAtIDE7XG5cbiAgICAgIC8vIFBhZGRsZSB3cmFwLWFyb3VuZFxuICAgICAgaWYgKGIxLnkgPD0gMSkgYjEueSA9IHNjclkgLSAyO1xuICAgICAgaWYgKGIxLnkgPj0gc2NyWSAtIDEpIGIxLnkgPSAyO1xuICAgICAgaWYgKGIyLnkgPD0gMSkgYjIueSA9IHNjclkgLSAyO1xuICAgICAgaWYgKGIyLnkgPj0gc2NyWSAtIDEpIGIyLnkgPSAyO1xuICAgIH1cblxuICAgIHRoaXMuZHJhdygpO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBvcmlnaW5hbCBgc3dpdGNoIChnZXRjaCgpKWAsIGRyaXZlbiBieSB0aGUgY2FsbGVyJ3Mga2V5c3Ryb2tlLlxuICAgKlxuICAgKiBAcGFyYW0gbmFtZSAtIGEga2V5IG5hbWUgYXMgcGFyc2VkIG9mZiB0aGUgd2lyZTogXCJ1cFwiLCBcImRvd25cIiwgXCJlc2NhcGVcIixcbiAgICogICAgICAgICAgICAgICBvciB0aGUgY2hhcmFjdGVyIGl0c2VsZi5cbiAgICovXG4gIGhhbmRsZUtleShuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5waGFzZSA9PT0gXCJmaW5pc2hlZFwiKSByZXR1cm47XG5cbiAgICAvLyBPcmlnaW5hbCBDOiB0aGUgYGF3YWl0IGdldGNoKClgIHVuZGVyIHRoZSB0aXRsZSBzY3JlZW4sIGFuZCB0aGVcbiAgICAvLyBgbm9kZWxheShmYWxzZSk7IGF3YWl0IGdldGNoKCk7IG5vZGVsYXkodHJ1ZSk7YCBvZiB0aGUgcGF1c2UgLSBib3RoIGFyZVxuICAgIC8vIFwiYW55IGtleSBjb250aW51ZXNcIi5cbiAgICBpZiAodGhpcy5waGFzZSA9PT0gXCJ0aXRsZVwiIHx8IHRoaXMucGhhc2UgPT09IFwicGF1c2VkXCIpIHtcbiAgICAgIHRoaXMucGhhc2UgPSBcInBsYXlpbmdcIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBzd2l0Y2ggKG5hbWUpIHtcbiAgICAgIGNhc2UgXCJkb3duXCI6XG4gICAgICAgIHRoaXMuYjEueSsrO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ1cFwiOlxuICAgICAgICB0aGlzLmIxLnktLTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwicVwiOlxuICAgICAgY2FzZSBcIlFcIjpcbiAgICAgICAgdGhpcy5iMi55LS07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImFcIjpcbiAgICAgIGNhc2UgXCJBXCI6XG4gICAgICAgIHRoaXMuYjIueSsrO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJwXCI6XG4gICAgICBjYXNlIFwiUFwiOlxuICAgICAgICAvLyBQYXVzZSAtIHdhaXQgZm9yIGFueSBrZXlcbiAgICAgICAgdGhpcy5waGFzZSA9IFwicGF1c2VkXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImVzY2FwZVwiOlxuICAgICAgICB0aGlzLnF1aXQoKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3AgdGhlIGdhbWUgbG9vcCBhbmQgbGVhdmUgbmN1cnNlcyBtb2RlLiBJZGVtcG90ZW50OiB0aGUgZG9vciBjYWxscyBpdFxuICAgKiBmcm9tIGl0cyBjbG9zZSBoYW5kbGVyIGFzIHdlbGwgYXMgZnJvbSB0aGUgRVNDIHBhdGgsIGFuZCBgZW5kd2luKClgIHB1dHNcbiAgICogcmVhbCBieXRlcyBvbiB0aGUgd2lyZSAoc2hvdyBjdXJzb3IsIHJlc2V0IGF0dHJpYnV0ZXMsIGxlYXZlIHRoZSBhbHRlcm5hdGVcbiAgICogc2NyZWVuKS4gVGhlIHBoYXNlIGd1YXJkIGlzIHdoYXQgbWFrZXMgdGhlIHNlY29uZCBjYWxsIGEgbm8tb3AgSEVSRSxcbiAgICogcmF0aGVyIHRoYW4gbGVhbmluZyBvbiBgZW5kd2luKClgJ3Mgb3duIGBpbml0aWFsaXplZGAgY2hlY2tcbiAgICogKGBzZGsvZW5naW5lcy91aS9uY3Vyc2VzL25jdXJzZXMudHM6MjQ2LTI0OWApIHRvIHN3YWxsb3cgaXQuXG4gICAqL1xuICBzdG9wKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnBoYXNlID09PSBcImZpbmlzaGVkXCIpIHJldHVybjtcbiAgICBpZiAodGhpcy5sb29wKSB7XG4gICAgICBjbGVhckludGVydmFsKHRoaXMubG9vcCk7XG4gICAgICB0aGlzLmxvb3AgPSBudWxsO1xuICAgIH1cbiAgICB0aGlzLnBoYXNlID0gXCJmaW5pc2hlZFwiO1xuICAgIGVuZHdpbigpO1xuICB9XG5cbiAgLyoqIE9yaWdpbmFsIEM6IGBlbmQgPSB0cnVlO2AgYW5kIHRoZSBgZW5kd2luKClgIGFmdGVyIHRoZSBsb29wLiAqL1xuICBwcml2YXRlIHF1aXQoKTogdm9pZCB7XG4gICAgY29uc3Qgb25RdWl0ID0gdGhpcy5xdWl0Q2FsbGJhY2s7XG4gICAgdGhpcy5xdWl0Q2FsbGJhY2sgPSBudWxsO1xuICAgIHRoaXMuc3RvcCgpO1xuICAgIGlmIChvblF1aXQpIG9uUXVpdCgpO1xuICB9XG5cbiAgLyoqIFRoZSBkcmF3aW5nIGhhbGYgb2YgdGhlIG9yaWdpbmFsIGxvb3AgYm9keS4gKi9cbiAgcHJpdmF0ZSBkcmF3KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgYjEsIGIyLCBiYWxsOiBiIH0gPSB0aGlzO1xuICAgIGNvbnN0IHNjclggPSB0aGlzLnNjclg7XG4gICAgY29uc3Qgc2NyWSA9IHRoaXMuc2NyWTtcblxuICAgIGVyYXNlKCk7XG5cbiAgICAvLyBTY29yZSBkaXNwbGF5XG4gICAgbXZwcmludHcoMiwgTWF0aC5mbG9vcihzY3JYIC8gMikgLSAyLCBgJHtiMS5jfSB8ICR7YjIuY31gKTtcblxuICAgIC8vIENlbnRlciBsaW5lXG4gICAgbXZ2bGluZSgwLCBNYXRoLmZsb29yKHNjclggLyAyKSwgQUNTX1ZMSU5FLCBzY3JZKTtcblxuICAgIC8vIEJhbGwgYW5kIHBhZGRsZXMgaW4gYmx1ZVxuICAgIGF0dHJvbihDT0xPUl9QQUlSKDEpKTtcbiAgICBtdnByaW50dyhiLnksIGIueCwgXCJvXCIpO1xuICAgIGZvciAobGV0IGkgPSAtMTsgaSA8IDI7IGkrKykge1xuICAgICAgbXZwcmludHcoYjEueSArIGksIGIxLngsIFwifFwiKTtcbiAgICAgIG12cHJpbnR3KGIyLnkgKyBpLCBiMi54LCBcInxcIik7XG4gICAgfVxuICAgIGF0dHJvZmYoQ09MT1JfUEFJUigxKSk7XG5cbiAgICByZWZyZXNoKCk7IC8vIENSSVRJQ0FMOiBTZW5kIHRoZSB1cGRhdGVkIGJ1ZmZlciB0byB0aGUgdGVybWluYWwhXG4gIH1cbn1cbiJdfQ==