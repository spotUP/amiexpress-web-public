/**
 * PETSCII Demo Door
 *
 * Demonstrates PETSCII output for C64 terminals.
 * Shows how to create doors that work in both ANSI and PETSCII modes.
 */

import type { BBSApi } from '../BBSApi';

// PETSCII color codes (raw bytes)
const PETSCII = {
  // Colors
  WHITE: 0x05,
  RED: 0x1C,
  GREEN: 0x1E,
  BLUE: 0x1F,
  CYAN: 0x9F,
  PURPLE: 0x9C,
  YELLOW: 0x9E,
  LIGHT_GREEN: 0x99,
  LIGHT_BLUE: 0x9A,

  // Control codes
  CLEAR: 0x93,      // Clear screen
  HOME: 0x13,       // Cursor home
  RETURN: 0x0D,     // Carriage return
  REVERSE_ON: 0x12, // Reverse video on
  REVERSE_OFF: 0x92,// Reverse video off
  CURSOR_DOWN: 0x11,
  CURSOR_RIGHT: 0x1D,

  // Box drawing characters (C64 PETSCII graphics)
  // These are the correct PETSCII codes that map to box-drawing screen codes
  HORIZONTAL: 0xC0,   // Horizontal line (screen code 0x40)
  VERTICAL: 0xDD,     // Vertical line (screen code 0x5D)
  CORNER_TL: 0xB0,    // Top-left corner (screen code 0x70)
  CORNER_TR: 0xAE,    // Top-right corner (screen code 0x6E)
  CORNER_BL: 0xAD,    // Bottom-left corner (screen code 0x6D)
  CORNER_BR: 0xBD,    // Bottom-right corner (screen code 0x7D)
};

/**
 * Draw a PETSCII box
 */
function drawPetsciiBox(width: number, height: number): Buffer {
  const bytes: number[] = [];

  // Top border
  bytes.push(PETSCII.CORNER_TL);
  for (let i = 0; i < width - 2; i++) bytes.push(PETSCII.HORIZONTAL);
  bytes.push(PETSCII.CORNER_TR);
  bytes.push(PETSCII.RETURN);

  // Middle rows
  for (let row = 0; row < height - 2; row++) {
    bytes.push(PETSCII.VERTICAL);
    for (let i = 0; i < width - 2; i++) bytes.push(0x20); // Space
    bytes.push(PETSCII.VERTICAL);
    bytes.push(PETSCII.RETURN);
  }

  // Bottom border
  bytes.push(PETSCII.CORNER_BL);
  for (let i = 0; i < width - 2; i++) bytes.push(PETSCII.HORIZONTAL);
  bytes.push(PETSCII.CORNER_BR);
  bytes.push(PETSCII.RETURN);

  return Buffer.from(bytes);
}

/**
 * Create a PETSCII header with colors
 */
function createPetsciiHeader(): Buffer {
  const bytes: number[] = [];

  // Clear screen
  bytes.push(PETSCII.CLEAR);

  // Cyan color
  bytes.push(PETSCII.CYAN);

  // Title (uppercase in C64)
  const title = 'PETSCII DEMO DOOR';
  for (const char of title) {
    bytes.push(char.charCodeAt(0));
  }
  bytes.push(PETSCII.RETURN);
  bytes.push(PETSCII.RETURN);

  // Yellow color for subtitle
  bytes.push(PETSCII.YELLOW);
  const subtitle = 'C64 GRAPHICS MODE';
  for (const char of subtitle) {
    bytes.push(char.charCodeAt(0));
  }
  bytes.push(PETSCII.RETURN);
  bytes.push(PETSCII.RETURN);

  // White for regular text
  bytes.push(PETSCII.WHITE);

  return Buffer.from(bytes);
}

/**
 * Create PETSCII color bar demo
 */
function createColorBar(): Buffer {
  const bytes: number[] = [];
  const colors = [
    PETSCII.WHITE, PETSCII.RED, PETSCII.GREEN, PETSCII.BLUE,
    PETSCII.CYAN, PETSCII.PURPLE, PETSCII.YELLOW, PETSCII.LIGHT_GREEN
  ];

  for (const color of colors) {
    bytes.push(color);
    bytes.push(PETSCII.REVERSE_ON);
    // 5 spaces for each color block
    for (let i = 0; i < 5; i++) bytes.push(0x20);
    bytes.push(PETSCII.REVERSE_OFF);
  }
  bytes.push(PETSCII.RETURN);
  bytes.push(PETSCII.WHITE);

  return Buffer.from(bytes);
}

/**
 * Main door entry point
 */
export async function runDoor(doorSession: {
  bbs: BBSApi;
  bbsSession: any;
  socket: any;
  user: any;
}): Promise<void> {
  const { bbs } = doorSession;

  // Check which mode we're in
  if (bbs.isPetsciiMode()) {
    // === PETSCII MODE (40x25) ===
    console.log('[PETSCII-DEMO] Running in PETSCII mode');

    // Send PETSCII header
    bbs.writePetscii(createPetsciiHeader());

    // Show terminal info
    const size = bbs.getTerminalSize();
    const infoBytes: number[] = [];
    const info = `TERMINAL: ${size.width}X${size.height}`;
    for (const char of info) {
      infoBytes.push(char.charCodeAt(0));
    }
    infoBytes.push(PETSCII.RETURN);
    infoBytes.push(PETSCII.RETURN);
    bbs.writePetscii(Buffer.from(infoBytes));

    // Draw a box
    bbs.writePetscii(Buffer.from([PETSCII.GREEN]));
    bbs.writePetscii(drawPetsciiBox(20, 5));

    bbs.writePetscii(Buffer.from([PETSCII.RETURN]));

    // Color bar
    bbs.writePetscii(Buffer.from([PETSCII.CYAN]));
    const colorLabel = 'COLOR PALETTE:';
    const labelBytes: number[] = [];
    for (const char of colorLabel) labelBytes.push(char.charCodeAt(0));
    labelBytes.push(PETSCII.RETURN);
    bbs.writePetscii(Buffer.from(labelBytes));
    bbs.writePetscii(createColorBar());

    bbs.writePetscii(Buffer.from([PETSCII.RETURN, PETSCII.RETURN]));

    // Prompt to exit
    bbs.writePetscii(Buffer.from([PETSCII.YELLOW]));
    const prompt = 'PRESS ANY KEY TO EXIT...';
    const promptBytes: number[] = [];
    for (const char of prompt) promptBytes.push(char.charCodeAt(0));
    bbs.writePetscii(Buffer.from(promptBytes));

  } else {
    // === ANSI MODE (80x24) ===
    console.log('[PETSCII-DEMO] Running in ANSI mode');

    bbs.clearScreen();

    // Header
    bbs.write('\x1b[36m');  // Cyan
    bbs.writeLine('PETSCII Demo Door');
    bbs.writeLine('=================');
    bbs.write('\x1b[0m');   // Reset
    bbs.writeLine('');

    bbs.write('\x1b[33m');  // Yellow
    bbs.writeLine('ANSI Graphics Mode');
    bbs.write('\x1b[0m');
    bbs.writeLine('');

    // Terminal info
    const size = bbs.getTerminalSize();
    bbs.writeLine(`Terminal: ${size.width}x${size.height}`);
    bbs.writeLine('');

    // ANSI box
    bbs.write('\x1b[32m');  // Green
    bbs.writeLine('+------------------+');
    bbs.writeLine('|                  |');
    bbs.writeLine('|   ANSI BOX       |');
    bbs.writeLine('|                  |');
    bbs.writeLine('+------------------+');
    bbs.write('\x1b[0m');
    bbs.writeLine('');

    // Color palette
    bbs.writeLine('Color Palette:');
    const colors = [
      { code: 37, name: 'White' },
      { code: 31, name: 'Red' },
      { code: 32, name: 'Green' },
      { code: 34, name: 'Blue' },
      { code: 36, name: 'Cyan' },
      { code: 35, name: 'Purple' },
      { code: 33, name: 'Yellow' },
    ];
    for (const color of colors) {
      bbs.write(`\x1b[${color.code}m  ${color.name}  \x1b[0m`);
    }
    bbs.writeLine('');
    bbs.writeLine('');

    // Note about PETSCII
    bbs.write('\x1b[90m');  // Dark gray
    bbs.writeLine('(Select PETSCII mode at login to see C64 graphics)');
    bbs.write('\x1b[0m');
    bbs.writeLine('');

    // Prompt
    bbs.write('\x1b[33mPress any key to exit...\x1b[0m');
  }

  // Wait for keypress
  await bbs.getKey();

  // Clear and exit
  if (bbs.isPetsciiMode()) {
    bbs.writePetscii(Buffer.from([PETSCII.CLEAR, PETSCII.WHITE]));
  } else {
    bbs.clearScreen();
  }

  console.log('[PETSCII-DEMO] Door exited');
}
