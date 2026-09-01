/**
 * RIPscrip v1.54 Types and Constants
 *
 * Based on the RIPscrip Graphics Protocol Specification
 * https://wiki.preterhuman.net/RIPscrip_Graphics_Protocol_Specification
 */

// EGA 16-color palette (standard EGA colors)
export const EGA_PALETTE: string[] = [
  '#000000', // 0 - Black
  '#0000AA', // 1 - Blue
  '#00AA00', // 2 - Green
  '#00AAAA', // 3 - Cyan
  '#AA0000', // 4 - Red
  '#AA00AA', // 5 - Magenta
  '#AA5500', // 6 - Brown
  '#AAAAAA', // 7 - Light Gray
  '#555555', // 8 - Dark Gray
  '#5555FF', // 9 - Light Blue
  '#55FF55', // 10 - Light Green
  '#55FFFF', // 11 - Light Cyan
  '#FF5555', // 12 - Light Red
  '#FF55FF', // 13 - Light Magenta
  '#FFFF55', // 14 - Yellow
  '#FFFFFF', // 15 - White
];

// RIP screen dimensions (EGA mode)
export const RIP_WIDTH = 640;
export const RIP_HEIGHT = 350;

// Text window defaults
export const DEFAULT_TEXT_WINDOW = {
  x0: 0,
  y0: 0,
  x1: 639,
  y1: 349,
  wrap: 1,
  size: 0,
};

// Line styles
export enum LineStyle {
  SOLID = 0,
  DOTTED = 1,
  CENTER = 2,
  DASHED = 3,
  USERDEF = 4,
}

// Fill patterns
export enum FillPattern {
  EMPTY = 0,
  SOLID = 1,
  LINE = 2,
  LTSLASH = 3,
  SLASH = 4,
  BKSLASH = 5,
  LTBKSLASH = 6,
  HATCH = 7,
  XHATCH = 8,
  INTERLEAVE = 9,
  WIDE_DOT = 10,
  CLOSE_DOT = 11,
  USER = 12,
}

// Font types (BGI fonts)
export enum FontType {
  DEFAULT = 0,      // 8x8 bitmap font
  TRIPLEX = 1,
  SMALL = 2,
  SANS_SERIF = 3,
  GOTHIC = 4,
  SCRIPT = 5,
  SIMPLEX = 6,
  TRIPLEX_SCR = 7,
  COMPLEX = 8,
  EUROPEAN = 9,
  BOLD = 10,
}

// Font direction
export enum FontDirection {
  HORIZONTAL = 0,
  VERTICAL = 1,
}

// Mouse region click types
export enum ClickType {
  NONE = 0,
  LEFT = 1,
  RIGHT = 2,
  BOTH = 3,
}

// RIP command types
export enum RIPCommandType {
  // Level 0 commands
  TEXT_WINDOW = 'w',
  VIEWPORT = 'v',
  RESET_WINDOWS = '*',
  ERASE_WINDOW = 'e',
  ERASE_VIEW = 'E',
  HOME = 'H',
  ERASE_EOL = '>',
  COLOR = 'c',
  SET_PALETTE = 'Q',
  ONE_PALETTE = 'a',
  WRITE_MODE = 'W',
  MOVE = 'm',
  TEXT = 'T',
  TEXT_XY = '@',
  FONT_STYLE = 'Y',
  PIXEL = 'X',
  LINE = 'L',
  RECTANGLE = 'R',
  BAR = 'B',
  CIRCLE = 'C',
  OVAL = 'O',
  FILLED_OVAL = 'o',
  ARC = 'A',
  PIE_SLICE = 'I',
  OVAL_PIE = 'i',
  BEZIER = 'Z',
  POLYGON = 'P',
  FILL_POLYGON = 'p',
  POLYLINE = 'l',
  FILL = 'F',
  LINE_STYLE = '=',
  FILL_STYLE = 'S',
  FILL_PATTERN = 's',

  // Level 1 commands (prefixed with '1')
  MOUSE = '1M',
  KILL_MOUSE = '1K',
  BEGIN_TEXT = '1T',
  REGION_TEXT = '1t',
  END_TEXT = '1E',
  GET_IMAGE = '1C',
  PUT_IMAGE = '1P',
  WRITE_ICON = '1W',
  LOAD_ICON = '1I',
  BUTTON_STYLE = '1B',
  BUTTON = '1U',
  DEFINE = '1D',
  QUERY = '1\x1b',
  COPY_REGION = '1G',
  READ_SCENE = '1R',
  FILE_QUERY = '1F',

  // Level 2 commands (prefixed with '2')
  // ... (for future expansion)

  // Level 9 commands (prefixed with '9')
  ENTER_BLOCK_MODE = '90',
  EXIT_BLOCK_MODE = '91',
}

// Parsed RIP command interface
export interface RIPCommand {
  type: string;
  level: number;
  params: number[];
  text?: string;
}

// Mouse region definition
export interface MouseRegion {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  clickType: ClickType;
  invert: boolean;
  reset: boolean;
  command: string;
}

// Button definition
export interface RIPButton {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  hotkey: string;
  flags: number;
  iconFile?: string;
  label?: string;
  command: string;
}

// Drawing state
export interface RIPState {
  // Current drawing position
  cursorX: number;
  cursorY: number;

  // Colors
  drawColor: number;
  fillColor: number;

  // Line style
  lineStyle: LineStyle;
  linePattern: number;
  lineThickness: number;

  // Fill style
  fillPattern: FillPattern;

  // Font
  fontType: FontType;
  fontDirection: FontDirection;
  fontSize: number;

  // Text window
  textWindow: typeof DEFAULT_TEXT_WINDOW;

  // Viewport
  viewport: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };

  // Write mode (XOR, etc)
  writeMode: number;

  // Mouse regions
  mouseRegions: MouseRegion[];

  // Buttons
  buttons: RIPButton[];

  // Custom palette (if modified)
  palette: string[];
}

// Create initial RIP state
export function createInitialState(): RIPState {
  return {
    cursorX: 0,
    cursorY: 0,
    drawColor: 15, // White
    fillColor: 0,  // Black
    lineStyle: LineStyle.SOLID,
    linePattern: 0xFFFF,
    lineThickness: 1,
    fillPattern: FillPattern.SOLID,
    fontType: FontType.DEFAULT,
    fontDirection: FontDirection.HORIZONTAL,
    fontSize: 1,
    textWindow: { ...DEFAULT_TEXT_WINDOW },
    viewport: {
      x0: 0,
      y0: 0,
      x1: RIP_WIDTH - 1,
      y1: RIP_HEIGHT - 1,
    },
    writeMode: 0,
    mouseRegions: [],
    buttons: [],
    palette: [...EGA_PALETTE],
  };
}
