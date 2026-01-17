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
 * - getch() is async (use await)
 * - usleep() replaced with napms()
 * - typedef struct replaced with interface
 * - getmaxyx macro replaced with getLINES/getCOLS
 */
export declare class PongDoor {
    name: string;
    version: string;
    author: string;
    description: string;
    onStart(context: unknown): Promise<void>;
}
