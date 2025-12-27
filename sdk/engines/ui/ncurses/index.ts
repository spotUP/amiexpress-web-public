/**
 * ncurses Compatibility Layer for AmiExpress-Web SDK
 *
 * This module provides a C-like ncurses API for porting terminal applications
 * to BBS doors. The API closely matches standard ncurses for easy porting.
 *
 * Quick Start:
 * ```typescript
 * import {
 *   initscr, endwin, mvaddstr, refresh, getch,
 *   start_color, init_pair, attron, attroff,
 *   COLOR_PAIR, A_BOLD, COLOR_RED, COLOR_BLACK
 * } from '@amiexpress/sdk/ncurses';
 *
 * export class MyDoor extends CoreDoor {
 *   async onStart(context: DoorContext) {
 *     initscr(context);
 *     start_color();
 *     init_pair(1, COLOR_RED, COLOR_BLACK);
 *
 *     attron(COLOR_PAIR(1) | A_BOLD);
 *     mvaddstr(10, 20, "Hello, World!");
 *     attroff(COLOR_PAIR(1) | A_BOLD);
 *
 *     refresh();
 *     await getch();
 *     endwin();
 *   }
 * }
 * ```
 *
 * Key Differences from C ncurses:
 * - getch() returns a Promise (use await)
 * - initscr() takes optional door context for BBS I/O
 * - No pointers; functions return values directly
 */

// ============================================================================
// Core Functions
// ============================================================================

export {
  // Initialization
  initscr,
  endwin,
  isendwin,
  getStdscr,
  getContext,

  // Screen refresh
  refresh,
  wrefresh,
  wnoutrefresh,
  doupdate,

  // Screen clearing
  clear,
  erase,
  clrtoeol,
  clrtobot,
  wclear,
  werase,
  wclrtoeol,
  wclrtobot,

  // Cursor movement
  move,
  wmove,
  curs_set,
  getcury,
  getcurx,
  getmaxy,
  getmaxx,

  // Character output
  addch,
  addstr,
  addnstr,
  mvaddch,
  mvaddstr,
  mvaddnstr,
  waddch,
  waddstr,
  waddnstr,
  mvwaddch,
  mvwaddstr,
  mvwaddnstr,

  // Formatted output
  printw,
  mvprintw,
  wprintw,
  mvwprintw,

  // Attributes
  attron,
  attroff,
  attrset,
  attr_get,
  wattron,
  wattroff,
  wattrset,

  // Line drawing
  hline,
  vline,
  mvhline,
  mvvline,
  whline,
  wvline,

  // Box drawing
  box,
  wborder,
  border,

  // Scrolling
  scrollok,
  setscrreg,
  wsetscrreg,
  scroll,
  scrl,
  wscrl,

  // Input
  getch,
  wgetch,
  mvgetch,
  mvwgetch,
  getstr,
  wgetstr,
  getnstr,
  wgetnstr,

  // Window management
  touchwin,
  untouchwin,
  touchline,
  is_linetouched,
  is_wintouched,
  leaveok,
  clearok,
  immedok,

  // Background
  bkgdset,
  bkgd,
  getbkgd,
  wbkgdset,
  wbkgd,
  wgetbkgd,

  // Terminal info
  getLINES,
  getCOLS,
  has_colors,
  can_change_color,

  // Misc
  beep,
  flash,
  napms,
  delay,

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
  keypad,
  nodelay,
  timeout,
  wtimeout,

  // Colors
  start_color,
  init_pair,

  // Window creation
  newwin,
  delwin,
} from './ncurses';

// ============================================================================
// Window Type
// ============================================================================

export { Window, subwin, derwin, dupwin, mvwin, copywin, overlay, overwrite } from './window';

// ============================================================================
// Constants
// ============================================================================

export {
  // Return codes
  OK,
  ERR,
  TRUE,
  FALSE,

  // Colors
  COLOR_BLACK,
  COLOR_RED,
  COLOR_GREEN,
  COLOR_YELLOW,
  COLOR_BLUE,
  COLOR_MAGENTA,
  COLOR_CYAN,
  COLOR_WHITE,
  COLOR_BRIGHT_BLACK,
  COLOR_BRIGHT_RED,
  COLOR_BRIGHT_GREEN,
  COLOR_BRIGHT_YELLOW,
  COLOR_BRIGHT_BLUE,
  COLOR_BRIGHT_MAGENTA,
  COLOR_BRIGHT_CYAN,
  COLOR_BRIGHT_WHITE,
  COLORS,
  COLOR_PAIRS,

  // Attributes
  A_NORMAL,
  A_STANDOUT,
  A_UNDERLINE,
  A_REVERSE,
  A_BLINK,
  A_DIM,
  A_BOLD,
  A_ALTCHARSET,
  A_INVIS,
  A_PROTECT,
  A_CHARTEXT,
  A_ATTRIBUTES,
  A_COLOR,
  COLOR_PAIR_SHIFT,

  // Keys
  KEY_CODE_YES,
  KEY_MIN,
  KEY_DOWN,
  KEY_UP,
  KEY_LEFT,
  KEY_RIGHT,
  KEY_HOME,
  KEY_BACKSPACE,
  KEY_F0,
  KEY_F,
  KEY_F1,
  KEY_F2,
  KEY_F3,
  KEY_F4,
  KEY_F5,
  KEY_F6,
  KEY_F7,
  KEY_F8,
  KEY_F9,
  KEY_F10,
  KEY_F11,
  KEY_F12,
  KEY_DL,
  KEY_IL,
  KEY_DC,
  KEY_IC,
  KEY_EIC,
  KEY_CLEAR,
  KEY_EOS,
  KEY_EOL,
  KEY_SF,
  KEY_SR,
  KEY_NPAGE,
  KEY_PPAGE,
  KEY_STAB,
  KEY_CTAB,
  KEY_CATAB,
  KEY_ENTER,
  KEY_PRINT,
  KEY_LL,
  KEY_END,
  KEY_BTAB,
  KEY_MOUSE,
  KEY_RESIZE,
  KEY_MAX,

  // Mouse
  BUTTON1_PRESSED,
  BUTTON1_RELEASED,
  BUTTON1_CLICKED,
  BUTTON2_PRESSED,
  BUTTON2_RELEASED,
  BUTTON2_CLICKED,
  BUTTON3_PRESSED,
  BUTTON3_RELEASED,
  BUTTON3_CLICKED,
  ALL_MOUSE_EVENTS,

  // Screen size
  COLS,
  LINES,
} from './constants';

// ============================================================================
// Attribute Helpers
// ============================================================================

export {
  COLOR_PAIR,
  PAIR_NUMBER,
  chtype,
  attr_t,
  extractChar,
  extractAttr,
  makeChtype,
  packColorAttr,
  extractFg,
  extractBg,
  extractFlags,
  isBold,
  isUnderline,
  isReverse,
  isBlink,
  isDim,
  isInvis,
  attrToAnsi,
  attrToStyle,
  styleToAttr,
  DEFAULT_ATTR,
  defaultAttrWithColors,
} from './attributes';

// ============================================================================
// Color Helpers
// ============================================================================

export {
  pair_content,
  pair_fg,
  pair_bg,
  init_color,
  color_content,
  resetColors,
  isColorInitialized,
  getColors,
  getColorPairs,
  rgb256ToNcurses,
  ncursesToRgb256,
  matchColor16,
} from './colors';

// ============================================================================
// ACS Characters
// ============================================================================

export {
  ACS,
  ACS_ULCORNER,
  ACS_URCORNER,
  ACS_LLCORNER,
  ACS_LRCORNER,
  ACS_RTEE,
  ACS_LTEE,
  ACS_BTEE,
  ACS_TTEE,
  ACS_HLINE,
  ACS_VLINE,
  ACS_PLUS,
  ACS_S1,
  ACS_S3,
  ACS_S7,
  ACS_S9,
  ACS_DIAMOND,
  ACS_CKBOARD,
  ACS_DEGREE,
  ACS_PLMINUS,
  ACS_BULLET,
  ACS_LARROW,
  ACS_RARROW,
  ACS_DARROW,
  ACS_UARROW,
  ACS_BOARD,
  ACS_LANTERN,
  ACS_BLOCK,
  ACS_ASCII,
  isAcsChar,
  getAsciiFallback,
  getAcsName,
} from './acs';

// ============================================================================
// Input Helpers
// ============================================================================

export {
  translateKey,
  keyname,
  isFunctionKey,
  isArrowKey,
  isPrintable,
  isRawMode,
  isCbreakMode,
  isEchoMode,
  isKeypadMode,
  isNodelayMode,
  getTimeout,
  hasInput,
  getInputBufferSize,
} from './input';

// ============================================================================
// Convenience Aliases (for ncurses compatibility)
// ============================================================================

// Common ncurses type alias
export type WINDOW = import('./window').Window;

// LINES and COLS as functions (ncurses uses macros)
export const getLines = (): number => 24;
export const getCols = (): number => 80;

// ============================================================================
// Default Export (for import * as ncurses)
// ============================================================================

import * as ncurses from './ncurses';
export default ncurses;
