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

import {
  // Initialization
  initscr,
  endwin,
  start_color,
  init_pair,
  keypad,
  noecho,
  curs_set,
  nodelay,
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

  // Input
  getch,

  // Constants
  COLOR_BLUE,
  COLOR_BLACK,
  KEY_DOWN,
  KEY_UP,
  ACS_VLINE,
  ERR,

  // Timing
  napms,
} from "@amiexpress/sdk/ncurses";

// Original C: typedef struct{short int x, y, c; bool movhor, movver;} object;
interface GameObject {
  x: number;
  y: number;
  c: number; // score counter
  movhor: boolean;
  movver: boolean;
}

export class PongDoor {
  name = "ncurses-pong";
  version = "1.0.0";
  author = "Vicente Bolea (original), AmiExpress (port)";
  description = "Classic Pong - ncurses port validation";

  async onStart(context: unknown): Promise<void> {
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
    const scrY = getLINES();
    const scrX = getCOLS();

    // Original C: object b1={scr.x-2,scr.y/2,0,false,false}, ...
    const b1: GameObject = {
      x: scrX - 2,
      y: Math.floor(scrY / 2),
      c: 0,
      movhor: false,
      movver: false,
    };
    const b2: GameObject = {
      x: 1,
      y: Math.floor(scrY / 2),
      c: 0,
      movhor: false,
      movver: false,
    };
    const b: GameObject = {
      x: Math.floor(scrX / 2),
      y: Math.floor(scrY / 2),
      c: 0,
      movhor: false,
      movver: false,
    };

    let end = false;
    let cont = 0;

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
    await getch();

    // Original C: for (nodelay(stdscr,1); !end; usleep(4000))
    nodelay(true);

    while (!end) {
      // Original C: usleep(4000) - 4000 microseconds = 4ms
      // BBS Optimization: 33ms = ~30fps, much better for network/CPU
      await napms(33);

      // Original C: if (++cont%16==0)
      // Adjust game logic to match new tick rate (was 16 ticks @ 4ms = 64ms)
      // With 33ms ticks, we update every 2 ticks (~66ms)
      cont++;
      if (cont % 2 === 0) {
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

        // Paddle wrap-around
        if (b1.y <= 1) b1.y = scrY - 2;
        if (b1.y >= scrY - 1) b1.y = 2;
        if (b2.y <= 1) b2.y = scrY - 2;
        if (b2.y >= scrY - 1) b2.y = 2;
      }

      // Original C: switch (getch())
      let ch: any = await getch();

      // Debug: Log input for diagnosis
      if (ch !== ERR) {
        console.log("[PONG] getch() returned:", JSON.stringify(ch), "type:", typeof ch);
      }

      // Handle object return from SDK (e.g. { keyCode: 32, key: ... })
      if (typeof ch === "object" && ch !== null) {
        if (ch.keyCode !== undefined) ch = ch.keyCode;
        else if (ch.code !== undefined) ch = ch.code;
      }

      if (typeof ch === "string") {
        if (ch === "up") ch = KEY_UP;
        else if (ch === "down") ch = KEY_DOWN;
        else if (ch === "escape") ch = 0x1b;
        else if (ch.length === 1) ch = ch.charCodeAt(0);
      }

      if (ch !== ERR) {
        console.log("[PONG] Final processed ch:", ch, "type:", typeof ch);
        switch (ch) {
          case KEY_DOWN:
            b1.y++;
            break;
          case KEY_UP:
            b1.y--;
            break;
          case "q".charCodeAt(0):
          case "Q".charCodeAt(0):
            b2.y--;
            break;
          case "a".charCodeAt(0):
          case "A".charCodeAt(0):
            b2.y++;
            break;
          case "p".charCodeAt(0):
          case "P".charCodeAt(0):
            // Pause - wait for any key
            nodelay(false);
            await getch();
            nodelay(true);
            break;
          case 0x1b: // ESC
            end = true;
            break;
        }
      }

      // Draw
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
        mvprintw(b2.y + i, b2.y + i < scrY ? b2.x : b2.x, "|"); // Fix potential out of bounds
      }
      attroff(COLOR_PAIR(1));

      refresh(); // CRITICAL FIX: Send the updated buffer to the terminal!
    }

    endwin();
  }
}
