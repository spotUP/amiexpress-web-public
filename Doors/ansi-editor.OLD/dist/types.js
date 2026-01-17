/**
 * Type definitions for ANSI Editor SDK
 * Complete type system for state-of-the-art ANSI/ASCII art editor
 */
// ANSI escape codes
export const ANSI = {
    HIDE_CURSOR: '\x1b[?25l',
    SHOW_CURSOR: '\x1b[?25h',
    CLEAR_SCREEN: '\x1b[2J\x1b[H',
    SAVE_CURSOR: '\x1b7',
    RESTORE_CURSOR: '\x1b8',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m',
    BLINK: '\x1b[5m',
    // Positioning
    pos: (x, y) => `\x1b[${y};${x}H`,
    moveUp: (n) => `\x1b[${n}A`,
    moveDown: (n) => `\x1b[${n}B`,
    moveRight: (n) => `\x1b[${n}C`,
    moveLeft: (n) => `\x1b[${n}D`,
    // Colors
    fg: (color) => color < 8 ? `\x1b[3${color}m` : `\x1b[9${color - 8}m`,
    bg: (color) => color < 8 ? `\x1b[4${color}m` : `\x1b[10${color - 8}m`,
    colors: (fg, bg) => `\x1b[0;${fg < 8 ? 3 : 9}${fg % 8};${bg < 8 ? 4 : 10}${bg % 8}m`,
};
// Color names for display
export const COLOR_NAMES = [
    // Standard colors (0-7)
    'Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White',
    // Bright colors (8-15)
    'Gray', 'Bright Red', 'Bright Green', 'Bright Yellow',
    'Bright Blue', 'Bright Magenta', 'Bright Cyan', 'Bright White'
];
// Common drawing characters
export const DRAW_CHARS = {
    // Half-blocks
    UPPER_HALF: '▀',
    LOWER_HALF: '▄',
    LEFT_HALF: '▌',
    RIGHT_HALF: '▐',
    FULL_BLOCK: '█',
    // Quarter-blocks
    UPPER_LEFT: '▘',
    UPPER_RIGHT: '▝',
    LOWER_LEFT: '▖',
    LOWER_RIGHT: '▗',
    // Shading
    LIGHT_SHADE: '░',
    MEDIUM_SHADE: '▒',
    DARK_SHADE: '▓',
    // Box drawing
    HORIZONTAL: '─',
    VERTICAL: '│',
    TOP_LEFT: '┌',
    TOP_RIGHT: '┐',
    BOTTOM_LEFT: '└',
    BOTTOM_RIGHT: '┘',
    CROSS: '┼',
    T_DOWN: '┬',
    T_UP: '┴',
    T_LEFT: '┤',
    T_RIGHT: '├',
    // Double box drawing
    DOUBLE_HORIZONTAL: '═',
    DOUBLE_VERTICAL: '║',
    DOUBLE_TOP_LEFT: '╔',
    DOUBLE_TOP_RIGHT: '╗',
    DOUBLE_BOTTOM_LEFT: '╚',
    DOUBLE_BOTTOM_RIGHT: '╝',
};
// Keyboard shortcuts
export const SHORTCUTS = {
    // Tools
    TOOL_DRAW: 'd',
    TOOL_LINE: 'l',
    TOOL_BOX: 'b',
    TOOL_ELLIPSE: 'e',
    TOOL_TEXT: 't',
    TOOL_FILL: 'f',
    TOOL_PICK: 'p',
    TOOL_SELECT: 's',
    TOOL_SHIFTER: 'h',
    // File operations
    NEW: 'n',
    OPEN: 'o',
    SAVE: 's',
    SAVE_AS: 'S',
    IMPORT: 'i',
    EXPORT: 'E',
    // Edit operations
    UNDO: 'z',
    REDO: 'y',
    COPY: 'c',
    CUT: 'x',
    PASTE: 'v',
    DELETE: 'delete',
    SELECT_ALL: 'a',
    // View
    TOGGLE_GUIDES: 'g',
    TOGGLE_GRID: 'G',
    TOGGLE_COLORS: 'C',
    TOGGLE_ICE: 'I',
    // Navigation
    MOVE_LEFT: 'left',
    MOVE_RIGHT: 'right',
    MOVE_UP: 'up',
    MOVE_DOWN: 'down',
    MOVE_PAGE_UP: 'pageup',
    MOVE_PAGE_DOWN: 'pagedown',
    MOVE_HOME: 'home',
    MOVE_END: 'end',
    // Other
    COLOR_PICKER: 'k',
    HELP: 'F1',
    EXIT: 'q',
    CONFIRM: 'enter',
    CANCEL: 'escape',
};
