# ncurses Compatibility Layer - Porting Guide

The AmiExpress-Web SDK includes an ncurses compatibility layer that allows you to port existing ncurses terminal applications to BBS doors with minimal code changes.

## Quick Start

```typescript
import {
  initscr, endwin, mvaddstr, refresh, getch,
  start_color, init_pair, attron, attroff,
  COLOR_PAIR, A_BOLD, COLOR_RED, COLOR_BLACK
} from '@amiexpress/sdk/ncurses';

/** Door metadata */
export const metadata = {
  name: 'my-ncurses-door',
  version: '1.0.0',
  command: 'MYDOOR',
};

/** Main door entry point - REQUIRED by BBS */
export async function runDoor(session: any): Promise<void> {
  // Create context for ncurses I/O
  // IMPORTANT: Use 'ansi-output' event - the frontend listens for this
  const context = {
    emit: (event: string, data: string) => {
      if (event === 'ansi-output') session.socket.emit('ansi-output', data);
    },
    write: (data: string) => session.socket.emit('ansi-output', data),
    screen: {
      on: (event: string, handler: (ch: any, key: any) => void) => {
        if (event === 'keypress') {
          session.socket.on('data', (data: string) => {
            handler(data, { name: data, sequence: data });
          });
        }
      }
    }
  };

  initscr(context);
  start_color();
  init_pair(1, COLOR_RED, COLOR_BLACK);

  attron(COLOR_PAIR(1) | A_BOLD);
  mvaddstr(10, 20, "Hello, World!");
  attroff(COLOR_PAIR(1) | A_BOLD);

  refresh();
  await getch();
  endwin();
}

export default { runDoor, metadata };
```

**IMPORTANT:** Your door MUST export `runDoor()`. The BBS calls this function when users run your door.

## Key Differences from C ncurses

### 1. Async Input

In C, `getch()` blocks. In TypeScript, it returns a Promise:

```c
// C
int ch = getch();
```

```typescript
// TypeScript
const ch = await getch();
```

### 2. Initialization

Pass the door context to `initscr()` for BBS I/O integration:

```typescript
initscr(context);  // context from onStart()
```

### 3. No Pointers

Functions that use output pointers in C return values directly:

```c
// C
int y, x;
getyx(stdscr, y, x);
```

```typescript
// TypeScript
const y = getcury();
const x = getcurx();
```

### 4. getmaxyx Macro

Replace the `getmaxyx()` macro with function calls:

```c
// C
int rows, cols;
getmaxyx(stdscr, rows, cols);
```

```typescript
// TypeScript
const rows = getLINES();
const cols = getCOLS();
```

### 5. Module Resolution

Use `moduleResolution: "Node16"` in your tsconfig.json to import the ncurses module:

```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16"
  }
}
```

## Available Functions

### Initialization
- `initscr(context?)` - Initialize screen, returns stdscr
- `endwin()` - End ncurses mode
- `isendwin()` - Check if endwin was called
- `getStdscr()` - Get stdscr window

### Screen Operations
- `refresh()` - Update screen from stdscr
- `wrefresh(win)` - Update screen from window
- `clear()` - Clear screen and home cursor
- `erase()` - Erase screen (no home)
- `clrtoeol()` - Clear to end of line
- `clrtobot()` - Clear to bottom of screen

### Cursor Control
- `move(y, x)` - Move cursor
- `curs_set(visibility)` - Set cursor visibility (0/1/2)
- `getcury()` / `getcurx()` - Get cursor position
- `getmaxy(win?)` / `getmaxx(win?)` - Get window size
- `getLINES()` / `getCOLS()` - Get terminal size

### Character Output
- `addch(ch)` - Add character at cursor
- `addstr(str)` - Add string at cursor
- `addnstr(str, n)` - Add n characters
- `mvaddch(y, x, ch)` - Move and add character
- `mvaddstr(y, x, str)` - Move and add string
- `mvaddnstr(y, x, str, n)` - Move and add n chars
- `printw(fmt, ...args)` - Printf-style output
- `mvprintw(y, x, fmt, ...args)` - Move and printf

### Window Operations
- `waddch(win, ch)` - Add char to window
- `waddstr(win, str)` - Add string to window
- `mvwaddch(win, y, x, ch)` - Move and add to window
- `mvwaddstr(win, y, x, str)` - Move and add string
- `wmove(win, y, x)` - Move cursor in window
- `wclear(win)` / `werase(win)` - Clear window

### Attributes
- `attron(attrs)` - Turn on attributes
- `attroff(attrs)` - Turn off attributes
- `attrset(attrs)` - Set attributes
- `attr_get()` - Get current attributes
- `wattron(win, attrs)` - Window attron
- `wattroff(win, attrs)` - Window attroff

### Colors
- `start_color()` - Initialize color system
- `has_colors()` - Check color support (always true)
- `init_pair(pair, fg, bg)` - Define color pair
- `COLOR_PAIR(n)` - Get attribute for pair n
- `pair_content(pair)` - Get [fg, bg] for pair

### Input
- `getch()` - Get character (async, returns Promise)
- `wgetch(win)` - Get char for window
- `getstr()` - Get string (async)
- `getnstr(n)` - Get n chars (async)
- `ungetch(ch)` - Push char back to input
- `flushinp()` - Flush input buffer

### Input Modes
- `raw()` / `noraw()` - Raw input mode
- `cbreak()` / `nocbreak()` - Cbreak mode
- `echo()` / `noecho()` - Echo input
- `keypad(win, bf)` - Enable keypad keys
- `nodelay(win, bf)` or `nodelay(bf)` - Non-blocking input
- `timeout(delay)` - Input timeout (ms)
- `halfdelay(tenths)` - Half-delay mode

### Line Drawing
- `hline(ch, n)` - Horizontal line
- `vline(ch, n)` - Vertical line
- `mvhline(y, x, ch, n)` - Move and hline
- `mvvline(y, x, ch, n)` - Move and vline
- `box(win, v, h)` - Draw box around window
- `wborder(win, ...)` - Full border control

### Scrolling
- `scrollok(win, bf)` - Enable scrolling
- `scroll(win)` - Scroll up one line
- `scrl(n)` - Scroll n lines
- `setscrreg(top, bot)` - Set scroll region

### Misc
- `beep()` - Sound terminal bell
- `flash()` - Visual bell
- `napms(ms)` - Delay (async)
- `delay(ms)` - Delay (async, alternative)

## Constants

### Colors
```typescript
COLOR_BLACK, COLOR_RED, COLOR_GREEN, COLOR_YELLOW,
COLOR_BLUE, COLOR_MAGENTA, COLOR_CYAN, COLOR_WHITE,
COLOR_BRIGHT_BLACK, COLOR_BRIGHT_RED, // ... etc
```

### Attributes
```typescript
A_NORMAL, A_BOLD, A_UNDERLINE, A_BLINK,
A_REVERSE, A_DIM, A_INVIS, A_STANDOUT
```

### Keys
```typescript
KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT,
KEY_HOME, KEY_END, KEY_PPAGE, KEY_NPAGE,
KEY_IC, KEY_DC, KEY_BACKSPACE, KEY_ENTER,
KEY_F1, KEY_F2, ... KEY_F12
```

### ACS Characters (Line Drawing)
```typescript
ACS_ULCORNER, ACS_URCORNER, ACS_LLCORNER, ACS_LRCORNER,
ACS_HLINE, ACS_VLINE, ACS_PLUS,
ACS_LTEE, ACS_RTEE, ACS_TTEE, ACS_BTEE
```

## Porting Example: Pong Game

Original C code (71 lines):
```c
#include <ncurses.h>
typedef struct{short int x, y, c; bool movhor, movver;} object;

main() {
  object scr; int i = 0,cont=0; bool end=false;
  initscr();
  start_color();
  init_pair(1,COLOR_BLUE,COLOR_BLACK);
  keypad(stdscr,true);
  noecho();
  curs_set(0);
  getmaxyx(stdscr,scr.y,scr.x);
  // ... game loop with getch(), mvprintw(), etc.
  endwin();
}
```

TypeScript port:
```typescript
import {
  initscr, endwin, start_color, init_pair,
  keypad, noecho, curs_set, nodelay, getStdscr,
  getLINES, getCOLS, mvprintw, mvvline, erase,
  attron, attroff, COLOR_PAIR, getch, napms,
  COLOR_BLUE, COLOR_BLACK, KEY_DOWN, KEY_UP,
  ACS_VLINE, ERR
} from '@amiexpress/sdk/ncurses';

interface GameObject {
  x: number; y: number; c: number;
  movhor: boolean; movver: boolean;
}

class PongGame {
  async run(context: unknown): Promise<void> {
    initscr(context);
    start_color();
    init_pair(1, COLOR_BLUE, COLOR_BLACK);

    const stdscr = getStdscr();
    if (stdscr) keypad(stdscr, true);
    noecho();
    curs_set(0);

    const scrY = getLINES();
    const scrX = getCOLS();
    // ... game loop with await getch(), await napms(), etc.
    endwin();
  }
}

/** REQUIRED: Main entry point */
export async function runDoor(session: any): Promise<void> {
  const context = { /* ... socket I/O context ... */ };
  const game = new PongGame();
  await game.run(context);
}

export default { runDoor };
```

Key changes:
1. `typedef struct` -> TypeScript `interface`
2. `main()` -> class with `async run()` method + `runDoor()` wrapper
3. `getmaxyx(stdscr,y,x)` -> `getLINES()`, `getCOLS()`
4. `getch()` -> `await getch()`
5. `usleep(4000)` -> `await napms(4)`
6. Add `await` before all async functions
7. Export `runDoor()` function (REQUIRED for BBS to load door)

## Window Management

Create and use windows:

```typescript
import { newwin, delwin, box, wrefresh, mvwaddstr } from '@amiexpress/sdk/ncurses';

// Create a 10x40 window at row 5, column 20
const win = newwin(10, 40, 5, 20);

// Draw border
box(win, 0, 0);

// Add text inside
mvwaddstr(win, 2, 2, "Hello from window!");

// Update display
wrefresh(win);

// Clean up
delwin(win);
```

## Game Loop Pattern

For games, use nodelay mode with napms for timing:

```typescript
async onStart(context: DoorContext): Promise<void> {
  initscr(context);
  nodelay(true);  // Non-blocking input

  let running = true;
  while (running) {
    // Process input (non-blocking)
    const ch = await getch();
    if (ch !== ERR) {
      if (ch === 27) running = false;  // ESC to quit
      // Handle other keys...
    }

    // Update game state
    // ...

    // Render
    erase();
    // Draw game...
    refresh();

    // Frame delay (16ms ~ 60fps)
    await napms(16);
  }

  endwin();
}
```

## Troubleshooting

### Module not found
Ensure your tsconfig.json has:
```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16"
  }
}
```

### Colors not showing
Call `start_color()` before using color pairs.

### Keys not working
Enable keypad mode: `keypad(getStdscr(), true)`

### Screen not updating
Call `refresh()` or `wrefresh(win)` after drawing.

### Input blocking
Use `nodelay(true)` for non-blocking input in game loops.

## Reference

- Original ncurses: https://invisible-island.net/ncurses/
- Source: `sdk/engines/ui/ncurses/`
- Example port: `sdk/doors/ncurses-pong/`
