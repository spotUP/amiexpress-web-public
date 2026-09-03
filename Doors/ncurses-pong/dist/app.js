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
     * from its close handler as well as from the ESC path.
     */
    stop() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7OztBQUVILDhEQThCMEM7QUFXMUMsU0FBUyxTQUFTO0lBQ2hCLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUM1RCxDQUFDO0FBV0Q7Ozs7O0dBS0c7QUFDVSxRQUFBLFlBQVksR0FBRyxFQUFFLENBQUM7QUFFL0IsTUFBYSxRQUFRO0lBQXJCO1FBQ0UsU0FBSSxHQUFHLGNBQWMsQ0FBQztRQUN0QixZQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ2xCLFdBQU0sR0FBRyw2Q0FBNkMsQ0FBQztRQUN2RCxnQkFBVyxHQUFHLHdDQUF3QyxDQUFDO1FBRS9DLFVBQUssR0FBYyxVQUFVLENBQUM7UUFDOUIsU0FBSSxHQUEwQyxJQUFJLENBQUM7UUFDbkQsaUJBQVksR0FBd0IsSUFBSSxDQUFDO1FBRXpDLFNBQUksR0FBRyxDQUFDLENBQUM7UUFDVCxTQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ1QsU0FBSSxHQUFHLENBQUMsQ0FBQztRQUVULE9BQUUsR0FBZSxTQUFTLEVBQUUsQ0FBQyxDQUFDLDBCQUEwQjtRQUN4RCxPQUFFLEdBQWUsU0FBUyxFQUFFLENBQUMsQ0FBQyx5QkFBeUI7UUFDdkQsU0FBSSxHQUFlLFNBQVMsRUFBRSxDQUFDO0lBc056QyxDQUFDO0lBcE5DOzs7Ozs7Ozs7T0FTRztJQUNILEtBQUssQ0FBQyxPQUFnQixFQUFFLE1BQWtCO1FBQ3hDLElBQUksQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDO1FBRTNCLDZFQUE2RTtRQUM3RSxJQUFBLGlCQUFPLEVBQUMsT0FBTyxDQUFDLENBQUM7UUFDakIsSUFBQSxxQkFBVyxHQUFF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Q0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUIsSUFBQSxrQkFBUSxFQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUNELElBQUEsaUJBQU8sRUFBQyxJQUFBLG9CQUFVLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV2QixJQUFBLGlCQUFPLEdBQUUsQ0FBQyxDQUFDLHFEQUFxRDtJQUNsRSxDQUFDO0NBQ0Y7QUF0T0QsNEJBc09DIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBuY3Vyc2VzLXBvbmcgLSBQb3J0IG9mIHZpY2VudGVib2xlYS9Qb25nLWN1cnNlcyAofjcxIGxpbmVzKVxuICpcbiAqIE9yaWdpbmFsIEMgY29kZTogaHR0cHM6Ly9naXRodWIuY29tL3ZpY2VudGVib2xlYS9Qb25nLWN1cnNlc1xuICogQXV0aG9yOiBWaWNlbnRlIEFkb2xmbyBCb2xlYSBTYW5jaGV6IDx2aWNlbnRlLmJvbGVhQGdtYWlsLmNvbT5cbiAqXG4gKiBUaGlzIHBvcnQgdmFsaWRhdGVzIHRoZSBuY3Vyc2VzIGNvbXBhdGliaWxpdHkgbGF5ZXIgYnkgcG9ydGluZ1xuICogYSByZWFsIG5jdXJzZXMgZ2FtZSB3aXRoIG1pbmltYWwgY2hhbmdlcyBmcm9tIHRoZSBvcmlnaW5hbCBDLlxuICpcbiAqIEtleSBkaWZmZXJlbmNlcyBmcm9tIEM6XG4gKiAtIHR5cGVkZWYgc3RydWN0IHJlcGxhY2VkIHdpdGggaW50ZXJmYWNlXG4gKiAtIGdldG1heHl4IG1hY3JvIHJlcGxhY2VkIHdpdGggZ2V0TElORVMvZ2V0Q09MU1xuICogLSB0aGUgQyBgd2hpbGUgKCFlbmQpIHsgdXNsZWVwKDQwMDApOyAuLi4gZ2V0Y2goKTsgfWAgbG9vcCBpcyBJTlZFUlRFRDpcbiAqICAgYSBCQlMgZG9vciBpcyBkcml2ZW4gYnkgdGhlIGNhbGxlcidzIGtleXN0cm9rZXMsIG5vdCBieSBhIGJsb2NraW5nIHJlYWQuXG4gKiAgIGBzdGFydCgpYCBwYWludHMgYW5kIHBhcmtzIHRoZSBsb29wIG9uIGFuIGludGVydmFsIGl0IG93bnM7IGB0aWNrKClgIGlzXG4gKiAgIG9uZSBpdGVyYXRpb24gb2YgdGhlIG9sZCBsb29wIGJvZHk7IGBoYW5kbGVLZXkoKWAgaXMgdGhlIG9sZFxuICogICBgc3dpdGNoIChnZXRjaCgpKWAuIFNlZSB0aGUgcmVwb3J0IHJlZmVyZW5jZWQgaW4gaW5kZXgudHMgZm9yIHdoeS5cbiAqL1xuXG5pbXBvcnQge1xuICAvLyBJbml0aWFsaXphdGlvblxuICBpbml0c2NyLFxuICBlbmR3aW4sXG4gIHN0YXJ0X2NvbG9yLFxuICBpbml0X3BhaXIsXG4gIGtleXBhZCxcbiAgbm9lY2hvLFxuICBjdXJzX3NldCxcbiAgZ2V0U3Rkc2NyLFxuXG4gIC8vIFNjcmVlbiBpbmZvXG4gIGdldExJTkVTLFxuICBnZXRDT0xTLFxuXG4gIC8vIE91dHB1dFxuICBtdnByaW50dyxcbiAgbXZ2bGluZSxcbiAgZXJhc2UsXG4gIHJlZnJlc2gsXG5cbiAgLy8gQXR0cmlidXRlc1xuICBhdHRyb24sXG4gIGF0dHJvZmYsXG4gIENPTE9SX1BBSVIsXG5cbiAgLy8gQ29uc3RhbnRzXG4gIENPTE9SX0JMVUUsXG4gIENPTE9SX0JMQUNLLFxuICBBQ1NfVkxJTkUsXG59IGZyb20gXCJAYW1pZXhwcmVzcy9iYnMtZG9vci1zZGsvbmN1cnNlc1wiO1xuXG4vLyBPcmlnaW5hbCBDOiB0eXBlZGVmIHN0cnVjdHtzaG9ydCBpbnQgeCwgeSwgYzsgYm9vbCBtb3Zob3IsIG1vdnZlcjt9IG9iamVjdDtcbmludGVyZmFjZSBHYW1lT2JqZWN0IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIGM6IG51bWJlcjsgLy8gc2NvcmUgY291bnRlclxuICBtb3Zob3I6IGJvb2xlYW47XG4gIG1vdnZlcjogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gbmV3T2JqZWN0KCk6IEdhbWVPYmplY3Qge1xuICByZXR1cm4geyB4OiAwLCB5OiAwLCBjOiAwLCBtb3Zob3I6IGZhbHNlLCBtb3Z2ZXI6IGZhbHNlIH07XG59XG5cbi8qKlxuICogUGhhc2VzIG9mIGEgZ2FtZS5cbiAqXG4gKiBgdGl0bGVgIGlzIHRoZSBvcmlnaW5hbCdzIGBhd2FpdCBnZXRjaCgpYCBiZWZvcmUgYG5vZGVsYXkoc3Rkc2NyLDEpYDpcbiAqIHRoZSBib2FyZCBpcyBwYWludGVkIGJ1dCBmcm96ZW4gdW50aWwgdGhlIGNhbGxlciBwcmVzc2VzIHNvbWV0aGluZy5cbiAqIGBwYXVzZWRgIGlzIHRoZSBvcmlnaW5hbCdzIGBub2RlbGF5KGZhbHNlKTsgYXdhaXQgZ2V0Y2goKTsgbm9kZWxheSh0cnVlKTtgLlxuICovXG50eXBlIFBvbmdQaGFzZSA9IFwidGl0bGVcIiB8IFwicGxheWluZ1wiIHwgXCJwYXVzZWRcIiB8IFwiZmluaXNoZWRcIjtcblxuLyoqXG4gKiBPbmUgdGljayBvZiB0aGUgZ2FtZSBsb29wLlxuICpcbiAqIE9yaWdpbmFsIEM6IHVzbGVlcCg0MDAwKSAtIDQwMDAgbWljcm9zZWNvbmRzID0gNG1zLlxuICogQkJTIG9wdGltaXNhdGlvbjogMzNtcyA9IH4zMGZwcywgbXVjaCBiZXR0ZXIgZm9yIG5ldHdvcmsvQ1BVLlxuICovXG5leHBvcnQgY29uc3QgUE9OR19USUNLX01TID0gMzM7XG5cbmV4cG9ydCBjbGFzcyBQb25nRG9vciB7XG4gIG5hbWUgPSBcIm5jdXJzZXMtcG9uZ1wiO1xuICB2ZXJzaW9uID0gXCIxLjAuMFwiO1xuICBhdXRob3IgPSBcIlZpY2VudGUgQm9sZWEgKG9yaWdpbmFsKSwgQW1pRXhwcmVzcyAocG9ydClcIjtcbiAgZGVzY3JpcHRpb24gPSBcIkNsYXNzaWMgUG9uZyAtIG5jdXJzZXMgcG9ydCB2YWxpZGF0aW9uXCI7XG5cbiAgcHJpdmF0ZSBwaGFzZTogUG9uZ1BoYXNlID0gXCJmaW5pc2hlZFwiO1xuICBwcml2YXRlIGxvb3A6IFJldHVyblR5cGU8dHlwZW9mIHNldEludGVydmFsPiB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHF1aXRDYWxsYmFjazogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgcHJpdmF0ZSBzY3JYID0gMDtcbiAgcHJpdmF0ZSBzY3JZID0gMDtcbiAgcHJpdmF0ZSBjb250ID0gMDtcblxuICBwcml2YXRlIGIxOiBHYW1lT2JqZWN0ID0gbmV3T2JqZWN0KCk7IC8vIHBsYXllciAxIHBhZGRsZSAocmlnaHQpXG4gIHByaXZhdGUgYjI6IEdhbWVPYmplY3QgPSBuZXdPYmplY3QoKTsgLy8gcGxheWVyIDIgcGFkZGxlIChsZWZ0KVxuICBwcml2YXRlIGJhbGw6IEdhbWVPYmplY3QgPSBuZXdPYmplY3QoKTtcblxuICAvKipcbiAgICogSW5pdGlhbGlzZSBuY3Vyc2VzLCBwYWludCB0aGUgdGl0bGUgc2NyZWVuLCBwYXJrIHRoZSBnYW1lIGxvb3AsIFJFVFVSTi5cbiAgICpcbiAgICogUmV0dXJuaW5nIGlzIHRoZSB3aG9sZSBwb2ludDogYERvb3IuZXhlY3V0ZSgpYCBvbmx5IHJlYWNoZXMgdGhlIFNESyBpbnB1dFxuICAgKiBsb29wIC0gdGhlIG9uZSB0aGluZyB0aGF0IGluc3RhbGxzIGBiYnNTZXNzaW9uLmRvb3JJbnB1dEhhbmRsZXJgIC0gYWZ0ZXJcbiAgICogZXZlcnkgc3RhcnQgaGFuZGxlciBoYXMgcmVzb2x2ZWQgKHNkay9zcmMvY29yZS9Eb29yLnRzOjExOC0xMzEsIDoyNTApLlxuICAgKlxuICAgKiBAcGFyYW0gY29udGV4dCAtIHRoZSBuY3Vyc2VzIEkvTyBjb250ZXh0IChhbnl0aGluZyB3aXRoIGBlbWl0YC9gd3JpdGVgKVxuICAgKiBAcGFyYW0gb25RdWl0ICAtIGNhbGxlZCBvbmNlLCB3aGVuIHRoZSBwbGF5ZXIgaGFzIHByZXNzZWQgRVNDXG4gICAqL1xuICBzdGFydChjb250ZXh0OiB1bmtub3duLCBvblF1aXQ6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLnF1aXRDYWxsYmFjayA9IG9uUXVpdDtcblxuICAgIC8vIE9yaWdpbmFsIEM6IGluaXRzY3IoKTsgc3RhcnRfY29sb3IoKTsgaW5pdF9wYWlyKDEsQ09MT1JfQkxVRSxDT0xPUl9CTEFDSyk7XG4gICAgaW5pdHNjcihjb250ZXh0KTtcbiAgICBzdGFydF9jb2xvcigpO1xuICAgIGluaXRfcGFpcigxLCBDT0xPUl9CTFVFLCBDT0xPUl9CTEFDSyk7XG5cbiAgICAvLyBPcmlnaW5hbCBDOiBrZXlwYWQoc3Rkc2NyLHRydWUpOyBub2VjaG8oKTsgY3Vyc19zZXQoMCk7XG4gICAgY29uc3Qgc3Rkc2NyID0gZ2V0U3Rkc2NyKCk7XG4gICAgaWYgKHN0ZHNjcikge1xuICAgICAga2V5cGFkKHN0ZHNjciwgdHJ1ZSk7XG4gICAgfVxuICAgIG5vZWNobygpO1xuICAgIGN1cnNfc2V0KDApO1xuXG4gICAgLy8gT3JpZ2luYWwgQzogZ2V0bWF4eXgoc3Rkc2NyLHNjci55LHNjci54KTtcbiAgICB0aGlzLnNjclkgPSBnZXRMSU5FUygpO1xuICAgIHRoaXMuc2NyWCA9IGdldENPTFMoKTtcblxuICAgIC8vIE9yaWdpbmFsIEM6IG9iamVjdCBiMT17c2NyLngtMixzY3IueS8yLDAsZmFsc2UsZmFsc2V9LCAuLi5cbiAgICB0aGlzLmIxID0geyB4OiB0aGlzLnNjclggLSAyLCB5OiBNYXRoLmZsb29yKHRoaXMuc2NyWSAvIDIpLCBjOiAwLCBtb3Zob3I6IGZhbHNlLCBtb3Z2ZXI6IGZhbHNlIH07XG4gICAgdGhpcy5iMiA9IHsgeDogMSwgeTogTWF0aC5mbG9vcih0aGlzLnNjclkgLyAyKSwgYzogMCwgbW92aG9yOiBmYWxzZSwgbW92dmVyOiBmYWxzZSB9O1xuICAgIHRoaXMuYmFsbCA9IHtcbiAgICAgIHg6IE1hdGguZmxvb3IodGhpcy5zY3JYIC8gMiksXG4gICAgICB5OiBNYXRoLmZsb29yKHRoaXMuc2NyWSAvIDIpLFxuICAgICAgYzogMCxcbiAgICAgIG1vdmhvcjogZmFsc2UsXG4gICAgICBtb3Z2ZXI6IGZhbHNlLFxuICAgIH07XG4gICAgdGhpcy5jb250ID0gMDtcblxuICAgIC8vIFNob3cgdGl0bGUgc2NyZWVuXG4gICAgbXZwcmludHcoXG4gICAgICA0LFxuICAgICAgMCxcbiAgICAgIFwiXFx0ICAgICAgICAgICBvb29vb29vb29vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgICAgICAgICAgIDg4OCAgICA4ODggIG9vb29vb28gICAgb29vb29vbyAgICBvb29vb29vbzggICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICAgODg4b29vbzg4IDg4OCAgICAgODg4IDg4OCAgIDg4OCAgODg4ICAgIDg4byAgICAgICBcXG5cIiArXG4gICAgICAgIFwiXFx0ICAgICAgICAgICA4ODggICAgICAgODg4ICAgICA4ODggODg4ICAgODg4ICAgODg4b284ODhvICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgICAgICAgICAgbzg4OG8gICAgICAgIDg4b29vODggIG84ODhvIG84ODhvIDg4OCAgICAgODg4ICAgICAgXFxuXCIgK1xuICAgICAgICBcIlxcdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDg4OG9vbzg4OCAgICAgXFxuXFxuXCIgK1xuICAgICAgICBcIlxcdCBPcmlnaW5hbCBieSBWaWNlbnRlIEJvbGVhIC0gUG9ydGVkIHRvIEFtaUV4cHJlc3MgbmN1cnNlcyAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgXFx0XFx0XFx0UGxheWVyIDEgY29udHJvbHM6IFVQL0RPV04gYXJyb3dzICAgICAgICAgICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgXFx0XFx0XFx0UGxheWVyIDIgY29udHJvbHM6IFEgKHVwKSBhbmQgQSAoZG93bikgICAgICAgICAgIFxcblwiICtcbiAgICAgICAgXCJcXHQgXFx0XFx0XFx0UHJlc3MgQU5ZIGtleSB0byBzdGFydCwgUCBmb3IgcGF1c2UsIEVTQyB0byBxdWl0XCJcbiAgICApO1xuXG4gICAgcmVmcmVzaCgpOyAvLyBDUklUSUNBTDogRmx1c2ggb3V0cHV0IHRvIHRlcm1pbmFsIGJlZm9yZSB3YWl0aW5nIGZvciBpbnB1dFxuICAgIHRoaXMucGhhc2UgPSBcInRpdGxlXCI7XG5cbiAgICAvLyBUaGUgbG9vcCB0aGlzIGRvb3Igb3ducy4gSXQgcnVucyBmcm9tIHRoZSB0aXRsZSBzY3JlZW4gb24gc28gdGhhdCB0aGVcbiAgICAvLyBnYW1lIGhhcyBhIGhlYXJ0YmVhdCBvZiBpdHMgb3duIHRoZSBtb21lbnQgdGhlIGNhbGxlciBzdGFydHMgaXQsIGFuZCBpdFxuICAgIC8vIGlzIGNsZWFyZWQgaW4gc3RvcCgpLlxuICAgIHRoaXMubG9vcCA9IHNldEludGVydmFsKCgpID0+IHRoaXMudGljaygpLCBQT05HX1RJQ0tfTVMpO1xuICB9XG5cbiAgLyoqXG4gICAqIE9uZSBpdGVyYXRpb24gb2YgdGhlIG9yaWdpbmFsIGBmb3IgKG5vZGVsYXkoc3Rkc2NyLDEpOyAhZW5kOyB1c2xlZXAoNDAwMCkpYFxuICAgKiBib2R5LCBtaW51cyB0aGUgYGdldGNoKClgIChrZXlzIGFycml2ZSB0aHJvdWdoIGhhbmRsZUtleSBub3cpLlxuICAgKi9cbiAgdGljaygpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5waGFzZSAhPT0gXCJwbGF5aW5nXCIpIHJldHVybjtcblxuICAgIGNvbnN0IHsgYjEsIGIyLCBiYWxsOiBiIH0gPSB0aGlzO1xuICAgIGNvbnN0IHNjclggPSB0aGlzLnNjclg7XG4gICAgY29uc3Qgc2NyWSA9IHRoaXMuc2NyWTtcblxuICAgIC8vIE9yaWdpbmFsIEM6IGlmICgrK2NvbnQlMTY9PTApXG4gICAgLy8gQWRqdXN0IGdhbWUgbG9naWMgdG8gbWF0Y2ggbmV3IHRpY2sgcmF0ZSAod2FzIDE2IHRpY2tzIEAgNG1zID0gNjRtcykuXG4gICAgLy8gV2l0aCAzM21zIHRpY2tzLCB3ZSB1cGRhdGUgZXZlcnkgMiB0aWNrcyAofjY2bXMpLlxuICAgIHRoaXMuY29udCsrO1xuICAgIGlmICh0aGlzLmNvbnQgJSAyID09PSAwKSB7XG4gICAgICAvLyBCYWxsIHZlcnRpY2FsIGJvdW5jZVxuICAgICAgaWYgKGIueSA9PT0gc2NyWSAtIDEgfHwgYi55ID09PSAxKSB7XG4gICAgICAgIGIubW92dmVyID0gIWIubW92dmVyO1xuICAgICAgfVxuXG4gICAgICAvLyBCYWxsIGhvcml6b250YWwgYm91bmNlIChwYWRkbGUgY29sbGlzaW9uKVxuICAgICAgaWYgKGIueCA+PSBzY3JYIC0gMiB8fCBiLnggPD0gMikge1xuICAgICAgICBiLm1vdmhvciA9ICFiLm1vdmhvcjtcblxuICAgICAgICBpZiAoYi55ID09PSBiMS55IC0gMSB8fCBiLnkgPT09IGIyLnkgLSAxKSB7XG4gICAgICAgICAgYi5tb3Z2ZXIgPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIGlmIChiLnkgPT09IGIxLnkgKyAxIHx8IGIueSA9PT0gYjIueSArIDEpIHtcbiAgICAgICAgICBiLm1vdnZlciA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAoYi55ICE9PSBiMS55ICYmIGIueSAhPT0gYjIueSkge1xuICAgICAgICAgIC8vIFNjb3JlIVxuICAgICAgICAgIGlmIChiLnggPj0gc2NyWCAtIDIpIHtcbiAgICAgICAgICAgIGIxLmMrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYjIuYysrO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBSZXNldCBiYWxsXG4gICAgICAgICAgYi54ID0gTWF0aC5mbG9vcihzY3JYIC8gMik7XG4gICAgICAgICAgYi55ID0gTWF0aC5mbG9vcihzY3JZIC8gMik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gTW92ZSBiYWxsXG4gICAgICBiLnggPSBiLm1vdmhvciA/IGIueCArIDEgOiBiLnggLSAxO1xuICAgICAgYi55ID0gYi5tb3Z2ZXIgPyBiLnkgKyAxIDogYi55IC0gMTtcblxuICAgICAgLy8gUGFkZGxlIHdyYXAtYXJvdW5kXG4gICAgICBpZiAoYjEueSA8PSAxKSBiMS55ID0gc2NyWSAtIDI7XG4gICAgICBpZiAoYjEueSA+PSBzY3JZIC0gMSkgYjEueSA9IDI7XG4gICAgICBpZiAoYjIueSA8PSAxKSBiMi55ID0gc2NyWSAtIDI7XG4gICAgICBpZiAoYjIueSA+PSBzY3JZIC0gMSkgYjIueSA9IDI7XG4gICAgfVxuXG4gICAgdGhpcy5kcmF3KCk7XG4gIH1cblxuICAvKipcbiAgICogVGhlIG9yaWdpbmFsIGBzd2l0Y2ggKGdldGNoKCkpYCwgZHJpdmVuIGJ5IHRoZSBjYWxsZXIncyBrZXlzdHJva2UuXG4gICAqXG4gICAqIEBwYXJhbSBuYW1lIC0gYSBrZXkgbmFtZSBhcyBwYXJzZWQgb2ZmIHRoZSB3aXJlOiBcInVwXCIsIFwiZG93blwiLCBcImVzY2FwZVwiLFxuICAgKiAgICAgICAgICAgICAgIG9yIHRoZSBjaGFyYWN0ZXIgaXRzZWxmLlxuICAgKi9cbiAgaGFuZGxlS2V5KG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICh0aGlzLnBoYXNlID09PSBcImZpbmlzaGVkXCIpIHJldHVybjtcblxuICAgIC8vIE9yaWdpbmFsIEM6IHRoZSBgYXdhaXQgZ2V0Y2goKWAgdW5kZXIgdGhlIHRpdGxlIHNjcmVlbiwgYW5kIHRoZVxuICAgIC8vIGBub2RlbGF5KGZhbHNlKTsgYXdhaXQgZ2V0Y2goKTsgbm9kZWxheSh0cnVlKTtgIG9mIHRoZSBwYXVzZSAtIGJvdGggYXJlXG4gICAgLy8gXCJhbnkga2V5IGNvbnRpbnVlc1wiLlxuICAgIGlmICh0aGlzLnBoYXNlID09PSBcInRpdGxlXCIgfHwgdGhpcy5waGFzZSA9PT0gXCJwYXVzZWRcIikge1xuICAgICAgdGhpcy5waGFzZSA9IFwicGxheWluZ1wiO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHN3aXRjaCAobmFtZSkge1xuICAgICAgY2FzZSBcImRvd25cIjpcbiAgICAgICAgdGhpcy5iMS55Kys7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInVwXCI6XG4gICAgICAgIHRoaXMuYjEueS0tO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJxXCI6XG4gICAgICBjYXNlIFwiUVwiOlxuICAgICAgICB0aGlzLmIyLnktLTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiYVwiOlxuICAgICAgY2FzZSBcIkFcIjpcbiAgICAgICAgdGhpcy5iMi55Kys7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInBcIjpcbiAgICAgIGNhc2UgXCJQXCI6XG4gICAgICAgIC8vIFBhdXNlIC0gd2FpdCBmb3IgYW55IGtleVxuICAgICAgICB0aGlzLnBoYXNlID0gXCJwYXVzZWRcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiZXNjYXBlXCI6XG4gICAgICAgIHRoaXMucXVpdCgpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3RvcCB0aGUgZ2FtZSBsb29wIGFuZCBsZWF2ZSBuY3Vyc2VzIG1vZGUuIElkZW1wb3RlbnQ6IHRoZSBkb29yIGNhbGxzIGl0XG4gICAqIGZyb20gaXRzIGNsb3NlIGhhbmRsZXIgYXMgd2VsbCBhcyBmcm9tIHRoZSBFU0MgcGF0aC5cbiAgICovXG4gIHN0b3AoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubG9vcCkge1xuICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmxvb3ApO1xuICAgICAgdGhpcy5sb29wID0gbnVsbDtcbiAgICB9XG4gICAgdGhpcy5waGFzZSA9IFwiZmluaXNoZWRcIjtcbiAgICBlbmR3aW4oKTtcbiAgfVxuXG4gIC8qKiBPcmlnaW5hbCBDOiBgZW5kID0gdHJ1ZTtgIGFuZCB0aGUgYGVuZHdpbigpYCBhZnRlciB0aGUgbG9vcC4gKi9cbiAgcHJpdmF0ZSBxdWl0KCk6IHZvaWQge1xuICAgIGNvbnN0IG9uUXVpdCA9IHRoaXMucXVpdENhbGxiYWNrO1xuICAgIHRoaXMucXVpdENhbGxiYWNrID0gbnVsbDtcbiAgICB0aGlzLnN0b3AoKTtcbiAgICBpZiAob25RdWl0KSBvblF1aXQoKTtcbiAgfVxuXG4gIC8qKiBUaGUgZHJhd2luZyBoYWxmIG9mIHRoZSBvcmlnaW5hbCBsb29wIGJvZHkuICovXG4gIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcbiAgICBjb25zdCB7IGIxLCBiMiwgYmFsbDogYiB9ID0gdGhpcztcbiAgICBjb25zdCBzY3JYID0gdGhpcy5zY3JYO1xuICAgIGNvbnN0IHNjclkgPSB0aGlzLnNjclk7XG5cbiAgICBlcmFzZSgpO1xuXG4gICAgLy8gU2NvcmUgZGlzcGxheVxuICAgIG12cHJpbnR3KDIsIE1hdGguZmxvb3Ioc2NyWCAvIDIpIC0gMiwgYCR7YjEuY30gfCAke2IyLmN9YCk7XG5cbiAgICAvLyBDZW50ZXIgbGluZVxuICAgIG12dmxpbmUoMCwgTWF0aC5mbG9vcihzY3JYIC8gMiksIEFDU19WTElORSwgc2NyWSk7XG5cbiAgICAvLyBCYWxsIGFuZCBwYWRkbGVzIGluIGJsdWVcbiAgICBhdHRyb24oQ09MT1JfUEFJUigxKSk7XG4gICAgbXZwcmludHcoYi55LCBiLngsIFwib1wiKTtcbiAgICBmb3IgKGxldCBpID0gLTE7IGkgPCAyOyBpKyspIHtcbiAgICAgIG12cHJpbnR3KGIxLnkgKyBpLCBiMS54LCBcInxcIik7XG4gICAgICBtdnByaW50dyhiMi55ICsgaSwgYjIueCwgXCJ8XCIpO1xuICAgIH1cbiAgICBhdHRyb2ZmKENPTE9SX1BBSVIoMSkpO1xuXG4gICAgcmVmcmVzaCgpOyAvLyBDUklUSUNBTDogU2VuZCB0aGUgdXBkYXRlZCBidWZmZXIgdG8gdGhlIHRlcm1pbmFsIVxuICB9XG59XG4iXX0=