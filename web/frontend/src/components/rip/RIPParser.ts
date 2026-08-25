/**
 * RIPscrip v1.54 Parser
 *
 * Parses RIPscrip command sequences from text input.
 * RIP commands start with !| followed by command character(s) and parameters.
 * Numbers are encoded in MegaNums (base-36) format.
 */

import { RIPCommand, RIPCommandType } from './RIPTypes';

// MegaNums character set (0-9, A-Z)
const MEGANUMS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Decode a MegaNum (base-36) value
 * Each character represents a digit 0-35
 */
export function decodeMegaNum(str: string): number {
  let value = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i].toUpperCase();
    const digit = MEGANUMS.indexOf(char);
    if (digit === -1) {
      console.warn(`[RIP] Invalid MegaNum character: ${char}`);
      return value;
    }
    value = value * 36 + digit;
  }
  return value;
}

/**
 * Encode a number as MegaNum (base-36)
 */
export function encodeMegaNum(value: number, digits: number = 2): string {
  let result = '';
  let v = Math.abs(Math.floor(value));

  do {
    result = MEGANUMS[v % 36] + result;
    v = Math.floor(v / 36);
  } while (v > 0);

  // Pad to requested digits
  while (result.length < digits) {
    result = '0' + result;
  }

  return result;
}

/**
 * Parse RIP commands from input text
 * Returns array of parsed commands and remaining text
 */
export function parseRIPCommands(input: string): { commands: RIPCommand[]; text: string } {
  const commands: RIPCommand[] = [];
  let text = '';
  let i = 0;

  while (i < input.length) {
    // Look for RIP command start sequence: !|
    if (input[i] === '!' && i + 1 < input.length && input[i + 1] === '|') {
      i += 2; // Skip !|

      // Check for level prefix (0-9)
      let level = 0;
      if (i < input.length && input[i] >= '0' && input[i] <= '9') {
        level = parseInt(input[i], 10);
        i++;
      }

      // Get command character
      if (i >= input.length) break;
      const cmdChar = input[i];
      i++;

      // Build full command type
      const cmdType = level > 0 ? `${level}${cmdChar}` : cmdChar;

      // Parse command based on type
      const cmd = parseCommand(cmdType, input, i);
      if (cmd) {
        commands.push(cmd.command);
        i = cmd.endIndex;
      }
    } else {
      // Regular text character
      text += input[i];
      i++;
    }
  }

  return { commands, text };
}

/**
 * Parse a specific RIP command
 */
function parseCommand(
  cmdType: string,
  input: string,
  startIndex: number
): { command: RIPCommand; endIndex: number } | null {
  let i = startIndex;
  const params: number[] = [];
  let text: string | undefined;
  let level = 0;

  // Extract level from command type
  if (cmdType.length > 1 && cmdType[0] >= '0' && cmdType[0] <= '9') {
    level = parseInt(cmdType[0], 10);
  }

  // Parse parameters based on command type
  switch (cmdType) {
    // Level 0 - No parameters
    case RIPCommandType.RESET_WINDOWS:
    case RIPCommandType.ERASE_VIEW:
    case RIPCommandType.HOME:
    case RIPCommandType.ERASE_EOL:
      break;

    // Level 0 - Single 1-digit parameter
    case RIPCommandType.COLOR:
    case RIPCommandType.WRITE_MODE:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      i += 2;
      break;

    // Level 0 - Two 2-digit parameters (coordinates)
    case RIPCommandType.MOVE:
    case RIPCommandType.PIXEL:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      i += 4;
      break;

    // Level 0 - Four 2-digit parameters (rectangles, lines)
    case RIPCommandType.LINE:
    case RIPCommandType.RECTANGLE:
    case RIPCommandType.BAR:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      i += 8;
      break;

    // Level 0 - Circle (x, y, radius)
    case RIPCommandType.CIRCLE:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      i += 6;
      break;

    // Level 0 - Oval (x, y, start_angle, end_angle, x_rad, y_rad)
    case RIPCommandType.OVAL:
    case RIPCommandType.FILLED_OVAL:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      i += 8;
      break;

    // Level 0 - Arc (x, y, start_angle, end_angle, radius)
    case RIPCommandType.ARC:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      params.push(decodeMegaNum(input.substring(i + 8, i + 10)));
      i += 10;
      break;

    // Level 0 - Pie slice (x, y, start_angle, end_angle, radius)
    case RIPCommandType.PIE_SLICE:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      params.push(decodeMegaNum(input.substring(i + 8, i + 10)));
      i += 10;
      break;

    // Level 0 - Oval pie (x, y, start_angle, end_angle, x_rad, y_rad)
    case RIPCommandType.OVAL_PIE:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      params.push(decodeMegaNum(input.substring(i + 8, i + 10)));
      params.push(decodeMegaNum(input.substring(i + 10, i + 12)));
      i += 12;
      break;

    // Level 0 - Fill (x, y, border_color)
    case RIPCommandType.FILL:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      i += 6;
      break;

    // Level 0 - Line style (style, user_pattern, thickness)
    case RIPCommandType.LINE_STYLE:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 6))); // 4 digit pattern
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      i += 8;
      break;

    // Level 0 - Fill style (pattern, color)
    case RIPCommandType.FILL_STYLE:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      i += 4;
      break;

    // Level 0 - Fill pattern (8 bytes)
    case RIPCommandType.FILL_PATTERN:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      params.push(decodeMegaNum(input.substring(i + 8, i + 10)));
      params.push(decodeMegaNum(input.substring(i + 10, i + 12)));
      params.push(decodeMegaNum(input.substring(i + 12, i + 14)));
      params.push(decodeMegaNum(input.substring(i + 14, i + 16)));
      i += 16;
      break;

    // Level 0 - Text window (x0, y0, x1, y1, wrap, size)
    case RIPCommandType.TEXT_WINDOW:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      params.push(decodeMegaNum(input.substring(i + 8, i + 10)));
      params.push(decodeMegaNum(input.substring(i + 10, i + 12)));
      i += 12;
      break;

    // Level 0 - Viewport (x0, y0, x1, y1)
    case RIPCommandType.VIEWPORT:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      i += 8;
      break;

    // Level 0 - Font style (font, direction, size, reserved)
    case RIPCommandType.FONT_STYLE:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      i += 8;
      break;

    // Level 0 - Set palette (color, r, g, b)
    case RIPCommandType.SET_PALETTE:
      // 16 colors * 3 values each = 48 digits
      for (let j = 0; j < 48; j += 2) {
        params.push(decodeMegaNum(input.substring(i + j, i + j + 2)));
      }
      i += 48;
      break;

    // Level 0 - One palette entry (color, r, g, b)
    case RIPCommandType.ONE_PALETTE:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      i += 8;
      break;

    // Level 0 - Text at current position (terminated by |)
    case RIPCommandType.TEXT:
      {
        const endIdx = input.indexOf('|', i);
        if (endIdx !== -1) {
          text = input.substring(i, endIdx);
          i = endIdx + 1;
        } else {
          text = input.substring(i);
          i = input.length;
        }
      }
      break;

    // Level 0 - Text at XY (x, y, text terminated by |)
    case RIPCommandType.TEXT_XY:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      i += 4;
      {
        const endIdx = input.indexOf('|', i);
        if (endIdx !== -1) {
          text = input.substring(i, endIdx);
          i = endIdx + 1;
        } else {
          text = input.substring(i);
          i = input.length;
        }
      }
      break;

    // Level 0 - Polygon/Polyline (npoints, x1, y1, x2, y2, ...)
    case RIPCommandType.POLYGON:
    case RIPCommandType.FILL_POLYGON:
    case RIPCommandType.POLYLINE:
      {
        const npoints = decodeMegaNum(input.substring(i, i + 2));
        params.push(npoints);
        i += 2;
        for (let j = 0; j < npoints; j++) {
          params.push(decodeMegaNum(input.substring(i, i + 2)));
          params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
          i += 4;
        }
      }
      break;

    // Level 0 - Bezier curve (x1,y1, x2,y2, x3,y3, x4,y4, count)
    case RIPCommandType.BEZIER:
      for (let j = 0; j < 9; j++) {
        params.push(decodeMegaNum(input.substring(i, i + 2)));
        i += 2;
      }
      break;

    // Level 1 - Mouse region (num, x0, y0, x1, y1, click, clr, res, text|)
    case RIPCommandType.MOUSE:
      params.push(decodeMegaNum(input.substring(i, i + 2)));     // num
      params.push(decodeMegaNum(input.substring(i + 2, i + 4))); // x0
      params.push(decodeMegaNum(input.substring(i + 4, i + 6))); // y0
      params.push(decodeMegaNum(input.substring(i + 6, i + 8))); // x1
      params.push(decodeMegaNum(input.substring(i + 8, i + 10))); // y1
      params.push(decodeMegaNum(input.substring(i + 10, i + 12))); // click
      params.push(decodeMegaNum(input.substring(i + 12, i + 14))); // clr (invert)
      params.push(decodeMegaNum(input.substring(i + 14, i + 16))); // res (reset)
      i += 16;
      {
        const endIdx = input.indexOf('|', i);
        if (endIdx !== -1) {
          text = input.substring(i, endIdx);
          i = endIdx + 1;
        } else {
          text = input.substring(i);
          i = input.length;
        }
      }
      break;

    // Level 1 - Kill mouse fields
    case RIPCommandType.KILL_MOUSE:
      break;

    // Level 1 - Button (x0, y0, x1, y1, hotkey, flags, res, text|)
    case RIPCommandType.BUTTON:
      params.push(decodeMegaNum(input.substring(i, i + 2)));     // x0
      params.push(decodeMegaNum(input.substring(i + 2, i + 4))); // y0
      params.push(decodeMegaNum(input.substring(i + 4, i + 6))); // x1
      params.push(decodeMegaNum(input.substring(i + 6, i + 8))); // y1
      params.push(decodeMegaNum(input.substring(i + 8, i + 10))); // hotkey
      params.push(decodeMegaNum(input.substring(i + 10, i + 12))); // flags
      params.push(decodeMegaNum(input.substring(i + 12, i + 14))); // reserved
      i += 14;
      {
        const endIdx = input.indexOf('|', i);
        if (endIdx !== -1) {
          text = input.substring(i, endIdx);
          i = endIdx + 1;
        } else {
          text = input.substring(i);
          i = input.length;
        }
      }
      break;

    // Level 1 - Begin text region (x1, y1, x2, y2, res)
    case RIPCommandType.BEGIN_TEXT:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));
      params.push(decodeMegaNum(input.substring(i + 8, i + 10)));
      i += 10;
      break;

    // Level 1 - Region text (justify, text|)
    case RIPCommandType.REGION_TEXT:
      params.push(decodeMegaNum(input.substring(i, i + 2)));
      i += 2;
      {
        const endIdx = input.indexOf('|', i);
        if (endIdx !== -1) {
          text = input.substring(i, endIdx);
          i = endIdx + 1;
        } else {
          text = input.substring(i);
          i = input.length;
        }
      }
      break;

    // Level 1 - End text region
    case RIPCommandType.END_TEXT:
      break;

    // Level 1 - Button style
    case RIPCommandType.BUTTON_STYLE:
      // Complex parameters - simplified parsing
      params.push(decodeMegaNum(input.substring(i, i + 2)));  // width
      params.push(decodeMegaNum(input.substring(i + 2, i + 4)));  // height
      params.push(decodeMegaNum(input.substring(i + 4, i + 6)));  // orient
      params.push(decodeMegaNum(input.substring(i + 6, i + 8)));  // flags
      // ... more params based on flags
      i += 8;
      break;

    // Erase window
    case RIPCommandType.ERASE_WINDOW:
      break;

    default:
      console.warn(`[RIP] Unknown command type: ${cmdType}`);
      // Skip to next command or end
      return null;
  }

  return {
    command: {
      type: cmdType,
      level,
      params,
      text,
    },
    endIndex: i,
  };
}

/**
 * Check if input contains RIP commands
 */
export function containsRIPCommands(input: string): boolean {
  return input.includes('!|');
}

/**
 * Check for RIP mode escape sequences
 * [1! = Enter pixel mode
 * [2! = Return to text mode
 */
// RIP mode switches ARE escape sequences, so matching the escape character
// is deliberate rather than the accident no-control-regex looks for.
/* eslint-disable no-control-regex */
export function parseRIPModeEscape(input: string): { mode: 'pixel' | 'text' | null; remaining: string } {
  if (input.includes('\x1b[1!') || input.includes('[1!')) {
    const remaining = input.replace(/\x1b?\[1!/g, '');
    return { mode: 'pixel', remaining };
  }
  if (input.includes('\x1b[2!') || input.includes('[2!')) {
    const remaining = input.replace(/\x1b?\[2!/g, '');
    return { mode: 'text', remaining };
  }
  return { mode: null, remaining: input };
}
/* eslint-enable no-control-regex */
