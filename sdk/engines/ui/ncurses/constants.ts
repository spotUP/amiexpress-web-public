/**
 * ncurses Compatibility Layer - Constants
 *
 * This module provides ncurses-compatible constants for:
 * - Key codes (KEY_*)
 * - Attribute flags (A_*)
 * - Color codes (COLOR_*)
 * - Error codes (ERR, OK)
 *
 * These match the standard ncurses definitions for easy porting.
 */

// ============================================================================
// Return Codes
// ============================================================================

export const OK = 0;
export const ERR = -1;

// ============================================================================
// Boolean Constants
// ============================================================================

export const TRUE = 1;
export const FALSE = 0;

// ============================================================================
// Color Constants
// ============================================================================

export const COLOR_BLACK = 0;
export const COLOR_RED = 1;
export const COLOR_GREEN = 2;
export const COLOR_YELLOW = 3;
export const COLOR_BLUE = 4;
export const COLOR_MAGENTA = 5;
export const COLOR_CYAN = 6;
export const COLOR_WHITE = 7;

// Bright/bold colors (8-15)
export const COLOR_BRIGHT_BLACK = 8;
export const COLOR_BRIGHT_RED = 9;
export const COLOR_BRIGHT_GREEN = 10;
export const COLOR_BRIGHT_YELLOW = 11;
export const COLOR_BRIGHT_BLUE = 12;
export const COLOR_BRIGHT_MAGENTA = 13;
export const COLOR_BRIGHT_CYAN = 14;
export const COLOR_BRIGHT_WHITE = 15;

// Maximum colors supported
export const COLORS = 256;
export const COLOR_PAIRS = 256;

// ============================================================================
// Attribute Constants
// ============================================================================

// Attribute bit positions (matching neo-blessed's 27-bit packed format)
// Format: (flags << 18) | (fg << 9) | bg

export const A_NORMAL = 0;
export const A_ATTRIBUTES = 0xfffe0000; // Attribute mask

// Individual attributes (shifted to position 18+)
export const A_STANDOUT = 1 << 18; // Often same as reverse
export const A_UNDERLINE = 1 << 19;
export const A_REVERSE = 1 << 20;
export const A_BLINK = 1 << 21;
export const A_DIM = 1 << 22;
export const A_BOLD = 1 << 23;
export const A_ALTCHARSET = 1 << 24;
export const A_INVIS = 1 << 25;
export const A_PROTECT = 1 << 26;

// Character mask (for extracting character from chtype)
export const A_CHARTEXT = 0x000000ff;

// Color pair mask and shift
export const A_COLOR = 0x0003fe00; // Bits 9-17 for color pair
export const COLOR_PAIR_SHIFT = 9;

/**
 * Create a color pair attribute from pair number
 * In ncurses, COLOR_PAIR(n) returns an attribute with the color pair encoded
 */
export function COLOR_PAIR(n: number): number {
  return (n & 0xff) << COLOR_PAIR_SHIFT;
}

/**
 * Extract pair number from attribute
 */
export function PAIR_NUMBER(attr: number): number {
  return (attr >> COLOR_PAIR_SHIFT) & 0xff;
}

// ============================================================================
// Key Constants
// ============================================================================

// Special key codes (start at 0x100 to avoid ASCII conflicts)
export const KEY_CODE_YES = 0x100; // Key code flag
export const KEY_MIN = 0x101;

// Arrow keys
export const KEY_DOWN = 0x102;
export const KEY_UP = 0x103;
export const KEY_LEFT = 0x104;
export const KEY_RIGHT = 0x105;

// Navigation keys
export const KEY_HOME = 0x106;
export const KEY_BACKSPACE = 0x107;

// Function keys F0-F12
export const KEY_F0 = 0x108;
export const KEY_F = (n: number) => KEY_F0 + n;
export const KEY_F1 = KEY_F0 + 1;
export const KEY_F2 = KEY_F0 + 2;
export const KEY_F3 = KEY_F0 + 3;
export const KEY_F4 = KEY_F0 + 4;
export const KEY_F5 = KEY_F0 + 5;
export const KEY_F6 = KEY_F0 + 6;
export const KEY_F7 = KEY_F0 + 7;
export const KEY_F8 = KEY_F0 + 8;
export const KEY_F9 = KEY_F0 + 9;
export const KEY_F10 = KEY_F0 + 10;
export const KEY_F11 = KEY_F0 + 11;
export const KEY_F12 = KEY_F0 + 12;

// Delete/Insert keys
export const KEY_DL = 0x148; // Delete line
export const KEY_IL = 0x149; // Insert line
export const KEY_DC = 0x14a; // Delete character
export const KEY_IC = 0x14b; // Insert character

// Clear keys
export const KEY_EIC = 0x14c; // Exit insert mode
export const KEY_CLEAR = 0x14d; // Clear screen
export const KEY_EOS = 0x14e; // Clear to end of screen
export const KEY_EOL = 0x14f; // Clear to end of line

// Scroll keys
export const KEY_SF = 0x150; // Scroll forward
export const KEY_SR = 0x151; // Scroll reverse

// Page keys
export const KEY_NPAGE = 0x152; // Next page (Page Down)
export const KEY_PPAGE = 0x153; // Previous page (Page Up)

// Tab keys
export const KEY_STAB = 0x154; // Set tab
export const KEY_CTAB = 0x155; // Clear tab
export const KEY_CATAB = 0x156; // Clear all tabs

// Enter key
export const KEY_ENTER = 0x157;

// Print keys
export const KEY_PRINT = 0x15a;

// Home/End
export const KEY_LL = 0x15b; // Lower left (often End)
export const KEY_END = 0x166;

// Additional navigation
export const KEY_A1 = 0x15c; // Upper left of keypad
export const KEY_A3 = 0x15d; // Upper right of keypad
export const KEY_B2 = 0x15e; // Center of keypad
export const KEY_C1 = 0x15f; // Lower left of keypad
export const KEY_C3 = 0x160; // Lower right of keypad

// Shift/Ctrl variants
export const KEY_BTAB = 0x161; // Back tab (Shift+Tab)
export const KEY_BEG = 0x162; // Begin
export const KEY_CANCEL = 0x163;
export const KEY_CLOSE = 0x164;
export const KEY_COMMAND = 0x165;
export const KEY_COPY = 0x166;
export const KEY_CREATE = 0x167;
export const KEY_EXIT = 0x168;
export const KEY_FIND = 0x169;
export const KEY_HELP = 0x16a;
export const KEY_MARK = 0x16b;
export const KEY_MESSAGE = 0x16c;
export const KEY_MOVE = 0x16d;
export const KEY_NEXT = 0x16e;
export const KEY_OPEN = 0x16f;
export const KEY_OPTIONS = 0x170;
export const KEY_PREVIOUS = 0x171;
export const KEY_REDO = 0x172;
export const KEY_REFERENCE = 0x173;
export const KEY_REFRESH = 0x174;
export const KEY_REPLACE = 0x175;
export const KEY_RESTART = 0x176;
export const KEY_RESUME = 0x177;
export const KEY_SAVE = 0x178;
export const KEY_SBEG = 0x179; // Shifted begin
export const KEY_SCANCEL = 0x17a;
export const KEY_SCOMMAND = 0x17b;
export const KEY_SCOPY = 0x17c;
export const KEY_SCREATE = 0x17d;
export const KEY_SDC = 0x17e; // Shifted delete char
export const KEY_SDL = 0x17f; // Shifted delete line
export const KEY_SELECT = 0x180;
export const KEY_SEND = 0x181; // Shifted end
export const KEY_SEOL = 0x182;
export const KEY_SEXIT = 0x183;
export const KEY_SFIND = 0x184;
export const KEY_SHELP = 0x185;
export const KEY_SHOME = 0x186; // Shifted home
export const KEY_SIC = 0x187; // Shifted insert
export const KEY_SLEFT = 0x188; // Shifted left arrow
export const KEY_SMESSAGE = 0x189;
export const KEY_SMOVE = 0x18a;
export const KEY_SNEXT = 0x18b;
export const KEY_SOPTIONS = 0x18c;
export const KEY_SPREVIOUS = 0x18d;
export const KEY_SPRINT = 0x18e;
export const KEY_SREDO = 0x18f;
export const KEY_SREPLACE = 0x190;
export const KEY_SRIGHT = 0x191; // Shifted right arrow
export const KEY_SRSUME = 0x192;
export const KEY_SSAVE = 0x193;
export const KEY_SSUSPEND = 0x194;
export const KEY_SUNDO = 0x195;
export const KEY_SUSPEND = 0x196;
export const KEY_UNDO = 0x197;

// Mouse events
export const KEY_MOUSE = 0x199;
export const KEY_RESIZE = 0x19a;

// Maximum key value
export const KEY_MAX = 0x1ff;

// ============================================================================
// Mouse Constants
// ============================================================================

export const BUTTON1_PRESSED = 0x002;
export const BUTTON1_RELEASED = 0x001;
export const BUTTON1_CLICKED = 0x004;
export const BUTTON1_DOUBLE_CLICKED = 0x008;
export const BUTTON1_TRIPLE_CLICKED = 0x010;

export const BUTTON2_PRESSED = 0x040;
export const BUTTON2_RELEASED = 0x020;
export const BUTTON2_CLICKED = 0x080;
export const BUTTON2_DOUBLE_CLICKED = 0x100;
export const BUTTON2_TRIPLE_CLICKED = 0x200;

export const BUTTON3_PRESSED = 0x800;
export const BUTTON3_RELEASED = 0x400;
export const BUTTON3_CLICKED = 0x1000;
export const BUTTON3_DOUBLE_CLICKED = 0x2000;
export const BUTTON3_TRIPLE_CLICKED = 0x4000;

export const BUTTON4_PRESSED = 0x10000; // Scroll up
export const BUTTON4_RELEASED = 0x8000;
export const BUTTON5_PRESSED = 0x40000; // Scroll down
export const BUTTON5_RELEASED = 0x20000;

export const BUTTON_CTRL = 0x1000000;
export const BUTTON_SHIFT = 0x2000000;
export const BUTTON_ALT = 0x4000000;

export const ALL_MOUSE_EVENTS = 0x7ffffff;
export const REPORT_MOUSE_POSITION = 0x8000000;

// ============================================================================
// Screen Size Constants
// ============================================================================

// Default BBS terminal size
export const COLS = 80;
export const LINES = 24;

// ============================================================================
// Key Name Mapping
// ============================================================================

/**
 * Map from blessed key names to ncurses key codes
 */
export const keyNameToCode: Record<string, number> = {
  up: KEY_UP,
  down: KEY_DOWN,
  left: KEY_LEFT,
  right: KEY_RIGHT,
  home: KEY_HOME,
  end: KEY_END,
  pageup: KEY_PPAGE,
  pagedown: KEY_NPAGE,
  insert: KEY_IC,
  delete: KEY_DC,
  backspace: KEY_BACKSPACE,
  enter: KEY_ENTER,
  return: KEY_ENTER,
  tab: 9, // ASCII tab
  escape: 27, // ASCII escape
  f1: KEY_F1,
  f2: KEY_F2,
  f3: KEY_F3,
  f4: KEY_F4,
  f5: KEY_F5,
  f6: KEY_F6,
  f7: KEY_F7,
  f8: KEY_F8,
  f9: KEY_F9,
  f10: KEY_F10,
  f11: KEY_F11,
  f12: KEY_F12,
};

/**
 * Map from ncurses key codes to key names (for display)
 */
export const keyCodeToName: Record<number, string> = {
  [KEY_UP]: 'KEY_UP',
  [KEY_DOWN]: 'KEY_DOWN',
  [KEY_LEFT]: 'KEY_LEFT',
  [KEY_RIGHT]: 'KEY_RIGHT',
  [KEY_HOME]: 'KEY_HOME',
  [KEY_END]: 'KEY_END',
  [KEY_PPAGE]: 'KEY_PPAGE',
  [KEY_NPAGE]: 'KEY_NPAGE',
  [KEY_IC]: 'KEY_IC',
  [KEY_DC]: 'KEY_DC',
  [KEY_BACKSPACE]: 'KEY_BACKSPACE',
  [KEY_ENTER]: 'KEY_ENTER',
  [KEY_F1]: 'KEY_F1',
  [KEY_F2]: 'KEY_F2',
  [KEY_F3]: 'KEY_F3',
  [KEY_F4]: 'KEY_F4',
  [KEY_F5]: 'KEY_F5',
  [KEY_F6]: 'KEY_F6',
  [KEY_F7]: 'KEY_F7',
  [KEY_F8]: 'KEY_F8',
  [KEY_F9]: 'KEY_F9',
  [KEY_F10]: 'KEY_F10',
  [KEY_F11]: 'KEY_F11',
  [KEY_F12]: 'KEY_F12',
};
