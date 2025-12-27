/**
 * ncurses Compatibility Layer - Core Module
 *
 * This module provides the main ncurses state and global functions.
 * It manages:
 * - Screen initialization (initscr, endwin)
 * - Global state (stdscr, current attributes)
 * - Output operations (delegated to stdscr)
 * - Integration with BBS door context
 *
 * Usage:
 *   import { initscr, endwin, mvaddstr, refresh } from '@amiexpress/sdk/ncurses';
 *
 *   initscr(context);
 *   mvaddstr(10, 20, "Hello!");
 *   refresh();
 *   await getch();
 *   endwin();
 */

import { Window, newwin, delwin } from './window';
import { attr_t, DEFAULT_ATTR, attrToAnsi } from './attributes';
import { start_color, resetColors, init_pair, pair_fg, pair_bg, COLOR_PAIR } from './colors';
import {
  raw,
  noraw,
  cbreak,
  nocbreak,
  echo,
  noecho,
  keypad as setKeypad,
  nodelay as setNodelay,
  timeout as setInputTimeout,
  halfdelay,
  getch as inputGetch,
  getstr as inputGetstr,
  getnstr as inputGetnstr,
  ungetch,
  flushinp,
  setInputCallback,
  queueInput,
  translateKey,
} from './input';
import { OK, ERR, COLS, LINES, A_NORMAL } from './constants';

// ============================================================================
// Global State
// ============================================================================

/**
 * The standard screen (full terminal)
 */
let stdscr: Window | null = null;

/**
 * Current screen (for operations that use curscr)
 */
let curscr: Window | null = null;

/**
 * List of all windows for cleanup
 */
const windows: Window[] = [];

/**
 * Is ncurses initialized?
 */
let initialized = false;

/**
 * Output function (sends ANSI to terminal)
 */
let outputFn: ((data: string) => void) | null = null;

/**
 * Input resolver queue
 */
const inputResolvers: ((key: number) => void)[] = [];

/**
 * Door context reference
 */
let doorContext: unknown = null;

/**
 * Cursor visibility (0=invisible, 1=normal, 2=very visible)
 */
let cursorVisibility = 1;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize ncurses screen
 *
 * In a BBS door context, pass the door context to set up I/O.
 * Returns stdscr on success, null on failure.
 *
 * @param context - Optional door context for BBS integration
 * @returns stdscr window or null
 */
export function initscr(context?: unknown): Window | null {
  if (initialized) {
    return stdscr;
  }

  // Store context
  doorContext = context;

  // Create stdscr
  stdscr = new Window(LINES, COLS, 0, 0);
  curscr = new Window(LINES, COLS, 0, 0);
  windows.push(stdscr);

  // Set up output function from context if available
  if (context && typeof context === 'object') {
    const ctx = context as Record<string, unknown>;

    // Try various output methods
    if (typeof ctx.emit === 'function') {
      outputFn = (data: string) => {
        (ctx.emit as (event: string, data: string) => void)('ansi-output', data);
      };
    } else if (typeof ctx.write === 'function') {
      outputFn = ctx.write as (data: string) => void;
    } else if (ctx.screen && typeof (ctx.screen as Record<string, unknown>).program === 'object') {
      const program = (ctx.screen as Record<string, unknown>).program as Record<string, unknown>;
      if (typeof program.write === 'function') {
        outputFn = program.write.bind(program) as (data: string) => void;
      }
    }

    // Set up input callback
    if (ctx.screen && typeof ctx.screen === 'object') {
      const screen = ctx.screen as Record<string, unknown>;
      if (typeof screen.on === 'function') {
        const onFn = screen.on as (event: string, handler: (ch: unknown, key: unknown) => void) => void;
        onFn('keypress', (ch: unknown, key: unknown) => {
          const keyCode = translateKey(
            ch as string | undefined,
            key as { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean; sequence?: string }
          );
          // Resolve waiting input requests
          if (inputResolvers.length > 0) {
            const resolver = inputResolvers.shift()!;
            resolver(keyCode);
          } else if (keyCode !== ERR) {
            queueInput(keyCode);
          }
        });
      }
    }
  }

  // Set input callback for getch
  setInputCallback((resolve) => {
    inputResolvers.push(resolve);
  });

  // Initialize with sensible defaults
  cbreak(); // Character-at-a-time input
  noecho(); // Don't echo input
  setKeypad(true); // Enable keypad/function keys

  // Enter alternate screen buffer and hide cursor
  if (outputFn) {
    outputFn('\x1b[?1049h'); // Alternate screen
    outputFn('\x1b[?25l'); // Hide cursor
    outputFn('\x1b[2J'); // Clear screen
    outputFn('\x1b[H'); // Home cursor
  }

  initialized = true;
  return stdscr;
}

/**
 * End ncurses mode
 *
 * Restores terminal to normal state.
 * @returns OK on success
 */
export function endwin(): number {
  if (!initialized) {
    return ERR;
  }

  // Show cursor and exit alternate screen
  if (outputFn) {
    outputFn('\x1b[?25h'); // Show cursor
    outputFn('\x1b[0m'); // Reset attributes
    outputFn('\x1b[?1049l'); // Normal screen
  }

  // Clean up windows
  for (const win of windows) {
    delwin(win);
  }
  windows.length = 0;

  // Reset state
  stdscr = null;
  curscr = null;
  resetColors();
  initialized = false;
  doorContext = null;

  return OK;
}

/**
 * Check if endwin() has been called
 */
export function isendwin(): boolean {
  return !initialized;
}

/**
 * Get stdscr
 */
export function getStdscr(): Window | null {
  return stdscr;
}

/**
 * Get door context
 */
export function getContext(): unknown {
  return doorContext;
}

// ============================================================================
// Screen Operations (stdscr shortcuts)
// ============================================================================

/**
 * Refresh stdscr (send buffer to terminal)
 */
export function refresh(): number {
  if (!stdscr) return ERR;

  // Generate ANSI output
  const output = stdscr.renderDirtyToAnsi();

  // Send to terminal
  if (outputFn && output.length > 0) {
    outputFn(output);

    // Position cursor
    if (!stdscr.leaveOk) {
      outputFn(`\x1b[${stdscr.cursorY + 1};${stdscr.cursorX + 1}H`);
    }
  }

  return OK;
}

/**
 * Refresh a window
 */
export function wrefresh(win: Window): number {
  if (!win) return ERR;

  const output = win.renderDirtyToAnsi();

  if (outputFn && output.length > 0) {
    outputFn(output);

    if (!win.leaveOk) {
      outputFn(`\x1b[${win.beginY + win.cursorY + 1};${win.beginX + win.cursorX + 1}H`);
    }
  }

  return OK;
}

/**
 * Mark window for refresh but don't output yet
 */
export function wnoutrefresh(win: Window): number {
  if (!win) return ERR;
  win.touchwin();
  return OK;
}

/**
 * Update physical screen from all marked windows
 */
export function doupdate(): number {
  // In a simple implementation, just refresh stdscr
  return refresh();
}

/**
 * Clear stdscr
 */
export function clear(): number {
  if (!stdscr) return ERR;
  return stdscr.clear();
}

/**
 * Erase stdscr
 */
export function erase(): number {
  if (!stdscr) return ERR;
  return stdscr.erase();
}

/**
 * Clear to end of line
 */
export function clrtoeol(): number {
  if (!stdscr) return ERR;
  return stdscr.clrtoeol();
}

/**
 * Clear to bottom
 */
export function clrtobot(): number {
  if (!stdscr) return ERR;
  return stdscr.clrtobot();
}

// ============================================================================
// Cursor Operations
// ============================================================================

/**
 * Move cursor in stdscr
 */
export function move(y: number, x: number): number {
  if (!stdscr) return ERR;
  return stdscr.move(y, x);
}

/**
 * Set cursor visibility
 * @param visibility - 0=invisible, 1=normal, 2=very visible
 */
export function curs_set(visibility: number): number {
  const oldVisibility = cursorVisibility;
  cursorVisibility = visibility;

  if (outputFn) {
    if (visibility === 0) {
      outputFn('\x1b[?25l'); // Hide cursor
    } else {
      outputFn('\x1b[?25h'); // Show cursor
      if (visibility === 2) {
        outputFn('\x1b[1 q'); // Blinking block
      } else {
        outputFn('\x1b[0 q'); // Default cursor
      }
    }
  }

  return oldVisibility;
}

/**
 * Get cursor Y position
 */
export function getcury(): number {
  return stdscr ? stdscr.getcury() : ERR;
}

/**
 * Get cursor X position
 */
export function getcurx(): number {
  return stdscr ? stdscr.getcurx() : ERR;
}

/**
 * Get window max Y
 */
export function getmaxy(win?: Window): number {
  const w = win || stdscr;
  return w ? w.getmaxy() : ERR;
}

/**
 * Get window max X
 */
export function getmaxx(win?: Window): number {
  const w = win || stdscr;
  return w ? w.getmaxx() : ERR;
}

// ============================================================================
// Character Output
// ============================================================================

/**
 * Add character at current position
 */
export function addch(ch: number | string): number {
  if (!stdscr) return ERR;
  return stdscr.addch(ch);
}

/**
 * Add string at current position
 */
export function addstr(str: string): number {
  if (!stdscr) return ERR;
  return stdscr.addstr(str);
}

/**
 * Add n characters from string
 */
export function addnstr(str: string, n: number): number {
  if (!stdscr) return ERR;
  return stdscr.addnstr(str, n);
}

/**
 * Move and add character
 */
export function mvaddch(y: number, x: number, ch: number | string): number {
  if (!stdscr) return ERR;
  return stdscr.mvaddch(y, x, ch);
}

/**
 * Move and add string
 */
export function mvaddstr(y: number, x: number, str: string): number {
  if (!stdscr) return ERR;
  return stdscr.mvaddstr(y, x, str);
}

/**
 * Move and add n characters
 */
export function mvaddnstr(y: number, x: number, str: string, n: number): number {
  if (!stdscr) return ERR;
  return stdscr.mvaddnstr(y, x, str, n);
}

/**
 * Printf-style output
 */
export function printw(format: string, ...args: unknown[]): number {
  if (!stdscr) return ERR;
  return stdscr.printw(format, ...args);
}

/**
 * Move and printf
 */
export function mvprintw(y: number, x: number, format: string, ...args: unknown[]): number {
  if (!stdscr) return ERR;
  return stdscr.mvprintw(y, x, format, ...args);
}

// ============================================================================
// Window-specific Output (w* functions)
// ============================================================================

export function waddch(win: Window, ch: number | string): number {
  return win.addch(ch);
}

export function waddstr(win: Window, str: string): number {
  return win.addstr(str);
}

export function waddnstr(win: Window, str: string, n: number): number {
  return win.addnstr(str, n);
}

export function mvwaddch(win: Window, y: number, x: number, ch: number | string): number {
  return win.mvaddch(y, x, ch);
}

export function mvwaddstr(win: Window, y: number, x: number, str: string): number {
  return win.mvaddstr(y, x, str);
}

export function mvwaddnstr(win: Window, y: number, x: number, str: string, n: number): number {
  return win.mvaddnstr(y, x, str, n);
}

export function wprintw(win: Window, format: string, ...args: unknown[]): number {
  return win.printw(format, ...args);
}

export function mvwprintw(win: Window, y: number, x: number, format: string, ...args: unknown[]): number {
  return win.mvprintw(y, x, format, ...args);
}

export function wmove(win: Window, y: number, x: number): number {
  return win.move(y, x);
}

export function wclear(win: Window): number {
  return win.clear();
}

export function werase(win: Window): number {
  return win.erase();
}

export function wclrtoeol(win: Window): number {
  return win.clrtoeol();
}

export function wclrtobot(win: Window): number {
  return win.clrtobot();
}

// ============================================================================
// Attributes
// ============================================================================

/**
 * Turn on attributes
 */
export function attron(attrs: attr_t): number {
  if (!stdscr) return ERR;
  return stdscr.attron(attrs);
}

/**
 * Turn off attributes
 */
export function attroff(attrs: attr_t): number {
  if (!stdscr) return ERR;
  return stdscr.attroff(attrs);
}

/**
 * Set attributes
 */
export function attrset(attrs: attr_t): number {
  if (!stdscr) return ERR;
  return stdscr.attrset(attrs);
}

/**
 * Get current attributes
 */
export function attr_get(): attr_t {
  return stdscr ? stdscr.attr_get() : A_NORMAL;
}

// Window attribute functions
export function wattron(win: Window, attrs: attr_t): number {
  return win.attron(attrs);
}

export function wattroff(win: Window, attrs: attr_t): number {
  return win.attroff(attrs);
}

export function wattrset(win: Window, attrs: attr_t): number {
  return win.attrset(attrs);
}

// ============================================================================
// Line Drawing
// ============================================================================

export function hline(ch: number | string, n: number): number {
  if (!stdscr) return ERR;
  return stdscr.hline(ch, n);
}

export function vline(ch: number | string, n: number): number {
  if (!stdscr) return ERR;
  return stdscr.vline(ch, n);
}

export function mvhline(y: number, x: number, ch: number | string, n: number): number {
  if (!stdscr) return ERR;
  return stdscr.mvhline(y, x, ch, n);
}

export function mvvline(y: number, x: number, ch: number | string, n: number): number {
  if (!stdscr) return ERR;
  return stdscr.mvvline(y, x, ch, n);
}

export function whline(win: Window, ch: number | string, n: number): number {
  return win.hline(ch, n);
}

export function wvline(win: Window, ch: number | string, n: number): number {
  return win.vline(ch, n);
}

// ============================================================================
// Box Drawing
// ============================================================================

export function box(win: Window, verch: number | string = 0, horch: number | string = 0): number {
  return win.box(verch, horch);
}

export function wborder(
  win: Window,
  ls: number | string,
  rs: number | string,
  ts: number | string,
  bs: number | string,
  tl: number | string,
  tr: number | string,
  bl: number | string,
  br: number | string
): number {
  return win.wborder(ls, rs, ts, bs, tl, tr, bl, br);
}

export function border(
  ls: number | string,
  rs: number | string,
  ts: number | string,
  bs: number | string,
  tl: number | string,
  tr: number | string,
  bl: number | string,
  br: number | string
): number {
  if (!stdscr) return ERR;
  return stdscr.wborder(ls, rs, ts, bs, tl, tr, bl, br);
}

// ============================================================================
// Scrolling
// ============================================================================

export function scrollok(win: Window, bf: boolean): number {
  return win.scrollok(bf);
}

export function setscrreg(top: number, bottom: number): number {
  if (!stdscr) return ERR;
  return stdscr.setscrreg(top, bottom);
}

export function wsetscrreg(win: Window, top: number, bottom: number): number {
  return win.setscrreg(top, bottom);
}

export function scroll(win: Window): number {
  return win.scroll(1);
}

export function scrl(n: number): number {
  if (!stdscr) return ERR;
  return stdscr.scroll(n);
}

export function wscrl(win: Window, n: number): number {
  return win.scroll(n);
}

// ============================================================================
// Input (re-exports with window awareness)
// ============================================================================

export async function getch(): Promise<number> {
  return inputGetch();
}

export async function wgetch(_win: Window): Promise<number> {
  // Window-specific getch would need per-window input handling
  // For now, use global input
  return inputGetch();
}

export async function mvgetch(y: number, x: number): Promise<number> {
  if (stdscr) stdscr.move(y, x);
  refresh();
  return inputGetch();
}

export async function mvwgetch(win: Window, y: number, x: number): Promise<number> {
  win.move(y, x);
  wrefresh(win);
  return inputGetch();
}

export async function getstr(): Promise<string> {
  return inputGetstr();
}

export async function wgetstr(_win: Window): Promise<string> {
  return inputGetstr();
}

export async function getnstr(n: number): Promise<string> {
  return inputGetnstr(n);
}

export async function wgetnstr(_win: Window, n: number): Promise<string> {
  return inputGetnstr(n);
}

// ============================================================================
// Window Management
// ============================================================================

export function touchwin(win: Window): number {
  return win.touchwin();
}

export function untouchwin(win: Window): number {
  return win.untouchwin();
}

export function touchline(win: Window, start: number, count: number): number {
  return win.touchline(start, count);
}

export function is_linetouched(win: Window, line: number): boolean {
  return win.is_linetouched(line);
}

export function is_wintouched(win: Window): boolean {
  return win.is_wintouched();
}

export function leaveok(win: Window, bf: boolean): number {
  return win.leaveok(bf);
}

export function clearok(win: Window, bf: boolean): number {
  return win.clearok(bf);
}

export function immedok(win: Window, bf: boolean): number {
  return win.immedok(bf);
}

// ============================================================================
// Background
// ============================================================================

export function bkgdset(ch: number): void {
  if (stdscr) stdscr.bkgdset(ch);
}

export function bkgd(ch: number): number {
  if (!stdscr) return ERR;
  return stdscr.bkgd_set(ch);
}

export function getbkgd(): number {
  return stdscr ? stdscr.getbkgd() : 0;
}

export function wbkgdset(win: Window, ch: number): void {
  win.bkgdset(ch);
}

export function wbkgd(win: Window, ch: number): number {
  return win.bkgd_set(ch);
}

export function wgetbkgd(win: Window): number {
  return win.getbkgd();
}

// ============================================================================
// Terminal Info
// ============================================================================

/**
 * Get number of lines (rows) in terminal
 */
export function getLINES(): number {
  return LINES;
}

/**
 * Get number of columns in terminal
 */
export function getCOLS(): number {
  return COLS;
}

/**
 * Check if terminal supports colors
 */
export function has_colors(): boolean {
  return true;
}

/**
 * Check if terminal can change color definitions
 */
export function can_change_color(): boolean {
  return false; // Most terminals can't
}

// ============================================================================
// Misc Functions
// ============================================================================

/**
 * Sound terminal bell
 */
export function beep(): number {
  if (outputFn) {
    outputFn('\x07');
  }
  return OK;
}

/**
 * Flash screen (visual bell)
 */
export function flash(): number {
  if (outputFn) {
    outputFn('\x1b[?5h'); // Reverse video
    setTimeout(() => {
      if (outputFn) outputFn('\x1b[?5l'); // Normal video
    }, 100);
  }
  return OK;
}

/**
 * Delay for milliseconds (async)
 */
export async function napms(ms: number): Promise<number> {
  return new Promise<number>((resolve) => {
    setTimeout(() => resolve(OK), ms);
  });
}

/**
 * Async delay
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  // Input mode
  raw,
  noraw,
  cbreak,
  nocbreak,
  echo,
  noecho,
  halfdelay,
  ungetch,
  flushinp,
  // Colors
  start_color,
  init_pair,
  COLOR_PAIR,
  // Window creation
  newwin,
  delwin,
};

// Keypad and nodelay for windows
export function keypad(win: Window, bf: boolean): number {
  win.keypad(bf);
  setKeypad(bf);
  return OK;
}

/**
 * Enable/disable nodelay mode
 * Supports both ncurses signatures:
 * - nodelay(win, bf) - for a specific window
 * - nodelay(bf) - for stdscr (convenience)
 */
export function nodelay(winOrBf: Window | boolean, bf?: boolean): number {
  if (typeof winOrBf === 'boolean') {
    // Called as nodelay(bf) - use stdscr
    if (stdscr) stdscr.nodelay(winOrBf);
    setNodelay(winOrBf);
    return OK;
  } else {
    // Called as nodelay(win, bf)
    winOrBf.nodelay(bf ?? false);
    setNodelay(bf ?? false);
    return OK;
  }
}

export function wtimeout(win: Window, delay: number): void {
  win.timeout(delay);
  setInputTimeout(delay);
}

export function timeout(delay: number): void {
  if (stdscr) stdscr.timeout(delay);
  setInputTimeout(delay);
}
