/**
 * Display and Rendering Module for ANSI Editor
 *
 * This module handles all screen rendering and display operations:
 * - Main screen refresh (double-buffered rendering)
 * - Status bar rendering
 * - Help line rendering
 * - Help screen modal (with scrolling)
 * - Selection overlay rendering
 * - Guide overlay rendering
 * - Cursor rendering
 * - Screen clearing utilities
 */

import { Cell, Tool, GuideType, HIDE_CURSOR, CLEAR_SCREEN } from './types';

// ========== DISPLAY CONTEXT INTERFACE ==========

/**
 * Context interface for display functions
 * Contains all state needed for rendering operations
 */
export interface DisplayContext {
  // Canvas state
  canvas: Cell[][];
  width: number;
  height: number;

  // Cursor state
  cursorX: number;
  cursorY: number;

  // Color state
  currentFg: number;
  currentBg: number;
  currentChar: string;

  // Tool state
  currentTool: Tool;

  // Mode state
  iceColorsEnabled: boolean;
  currentFKeySet: 'normal' | 'shift';
  mirrorModeEnabled: boolean;
  numpadModeEnabled: boolean;

  // Guide state
  guideOverlayEnabled: boolean;
  guideType: GuideType;
  gridSpacing: number;

  // Selection state
  selecting: boolean;
  selectionStart: { x: number; y: number } | null;
  selectionEnd: { x: number; y: number } | null;

  // File state
  filename: string | null;
  modified: boolean;

  // Door session
  doorSession: any;

  // Output methods
  emit(data: string): void;

  // Helper methods needed for display
  getSelectionBounds(): { x1: number; y1: number; x2: number; y2: number } | null;
  refresh(): void;
}

// ========== ANSI HELPER FUNCTIONS ==========

/**
 * Clear the screen
 */
export function clearScreen(ctx: DisplayContext): void {
  ctx.emit('\x1b[2J\x1b[H');
}

/**
 * Move cursor to specific position (0-indexed)
 */
export function moveCursor(ctx: DisplayContext, x: number, y: number): void {
  ctx.emit(`\x1b[${y + 1};${x + 1}H`);
}

/**
 * Set foreground and background colors
 */
export function setColors(ctx: DisplayContext, fg: number, bg: number): void {
  ctx.emit(`\x1b[0;3${fg};4${bg}m`);
}

// ========== GUIDE OVERLAY ==========

/**
 * Check if a cell is on a guide overlay line
 */
export function isGuideOverlayCell(ctx: DisplayContext, x: number, y: number): boolean {
  if (!ctx.guideOverlayEnabled) return false;

  switch (ctx.guideType) {
    case '80x25':
      // Standard BBS screen: border at edges
      return x === 0 || x === 79 || y === 0 || y === 21;

    case '80x40':
      // Double-height screen: border at edges and midline
      return x === 0 || x === 79 || y === 0 || y === 21 || y === 11;

    case '44x22':
      // Amiga screen size (44 columns): vertical borders at columns 18 and 61
      return (x === 18 || x === 61) || y === 0 || y === 21;

    case 'grid':
      // Custom grid with configurable spacing
      return (x % ctx.gridSpacing === 0) || (y % ctx.gridSpacing === 0);

    default:
      return false;
  }
}

// ========== HELP LINE ==========

/**
 * Show context-sensitive help line at line 23
 */
export function showHelpLine(ctx: DisplayContext): void {
  // Help line at line 23
  moveCursor(ctx, 0, 22);
  setColors(ctx, 7, 1);  // White on blue

  let help = '';
  switch (ctx.currentTool) {
    case 'draw':
      help = 'ARROWS=Move  SPACE=Draw  F1-F8=Color  TAB=Tool  S=Save  L=Load  Q=Quit';
      break;
    case 'line':
      help = 'Click start, move, click end to draw line  TAB=Tool  Q=Quit';
      break;
    case 'box':
      help = 'Click corner, move, click corner to draw box  TAB=Tool  Q=Quit';
      break;
    case 'text':
      help = 'Type text, ENTER to place  ESC=Cancel  TAB=Tool  Q=Quit';
      break;
    case 'fill':
      help = 'Click to flood-fill area  TAB=Tool  Q=Quit';
      break;
    case 'pick':
      help = 'Click cell to pick color/char  TAB=Tool  Q=Quit';
      break;
  }

  ctx.emit(help.padEnd(80).substring(0, 80));
  setColors(ctx, ctx.currentFg, ctx.currentBg);
}

// ========== STATUS BAR ==========

/**
 * Show status bar at bottom (line 24)
 */
export function showStatusBar(ctx: DisplayContext): void {
  // Status bar at bottom (line 24)
  moveCursor(ctx, 0, 23);
  setColors(ctx, 0, 7);  // Black on white

  const toolName = ctx.currentTool.toUpperCase().padEnd(6);
  const pos = `X:${ctx.cursorX.toString().padStart(2)}  Y:${ctx.cursorY.toString().padStart(2)}`;
  const colors = `FG:${ctx.currentFg} BG:${ctx.currentBg}`;
  const char = `CH:'${ctx.currentChar}'`;
  const ice = ctx.iceColorsEnabled ? 'iCE' : '---';
  const fkeys = ctx.currentFKeySet === 'shift' ? 'S-FK' : 'F-K';
  const mirror = ctx.mirrorModeEnabled ? 'MIR' : '---';
  const numpad = ctx.numpadModeEnabled ? 'NUM' : '---';
  const guide = ctx.guideType !== 'none' ? ctx.guideType.toUpperCase().padEnd(5) : '-----';
  const file = ctx.filename || 'UNSAVED';
  const mod = ctx.modified ? '*' : ' ';
  const status = `${mod}${toolName} ${pos} ${colors} ${char} ${ice} ${fkeys} ${mirror} ${numpad} ${guide} [${file}]`.padEnd(80);

  ctx.emit(status);
}

// ========== MAIN REFRESH ==========

/**
 * Main screen refresh - renders entire screen with double buffering
 * Renders canvas, help line, status bar, and cursor in one atomic operation
 */
export function refresh(ctx: DisplayContext): void {
  // Build entire screen in single buffer (true double buffering)
  let buffer = HIDE_CURSOR + CLEAR_SCREEN;

  // Get selection bounds for overlay rendering
  const selBounds = ctx.getSelectionBounds();

  // Render canvas area (lines 1-22)
  for (let y = 0; y < 22; y++) {
    buffer += `\x1b[${y + 1};1H`;  // Position cursor (1-indexed)
    for (let x = 0; x < ctx.width; x++) {
      const cell = ctx.canvas[y][x];

      // Check if this cell is on the selection border (dashed rectangle)
      let isSelectionBorder = false;
      if (selBounds && ctx.selecting) {
        const { x1, y1, x2, y2 } = selBounds;
        const isTopOrBottom = (y === y1 || y === y2) && x >= x1 && x <= x2;
        const isLeftOrRight = (x === x1 || x === x2) && y >= y1 && y <= y2;
        isSelectionBorder = isTopOrBottom || isLeftOrRight;
      }

      // Check if this cell is on a guide overlay line
      let isGuideLine = false;
      if (ctx.guideOverlayEnabled) {
        isGuideLine = isGuideOverlayCell(ctx, x, y);
      }

      // Render with selection overlay if on border (dashed line effect: alternating chars)
      if (isSelectionBorder) {
        const isDashed = (x + y) % 2 === 0;  // Alternating pattern for dashed effect
        if (isDashed) {
          buffer += `\x1b[0;37;40m-`;  // White on black dash
        } else {
          buffer += `\x1b[0;3${cell.fg};4${cell.bg}m${cell.char}`;  // Original cell
        }
      } else if (isGuideLine) {
        // Draw guide line (dim white dots)
        const isDot = (x + y) % 2 === 0;  // Alternating pattern for dotted line
        if (isDot) {
          buffer += `\x1b[0;37;40m.`;  // White dot on black
        } else {
          buffer += `\x1b[0;3${cell.fg};4${cell.bg}m${cell.char}`;  // Original cell
        }
      } else {
        buffer += `\x1b[0;3${cell.fg};4${cell.bg}m${cell.char}`;
      }
    }
  }

  // Help line at line 23
  buffer += `\x1b[23;1H`;  // Position cursor
  buffer += `\x1b[0;37;41m`;  // White on blue
  let help = '';
  switch (ctx.currentTool) {
    case 'draw':
      help = 'ARROWS=Move  SPACE=Draw  F1-F8=Color  TAB=Tools  ?=Help  S=Save  Q=Quit';
      break;
    case 'line':
      help = 'Click start point, move cursor, click end point  TAB=Tools  ?=Help';
      break;
    case 'box':
      help = 'Click first corner, move cursor, click second corner  TAB=Tools  ?=Help';
      break;
    case 'text':
      help = 'Type text, ENTER to place  ESC=Cancel  TAB=Tools  ?=Help';
      break;
    case 'fill':
      help = 'Click to flood-fill enclosed area  TAB=Tools  ?=Help';
      break;
    case 'pick':
      help = 'Click cell to sample color and character  TAB=Tools  ?=Help';
      break;
  }
  buffer += help.padEnd(80).substring(0, 80);

  // Status bar at bottom (line 24)
  buffer += `\x1b[24;1H`;  // Position cursor
  buffer += `\x1b[0;30;47m`;  // Black on white
  const toolName = ctx.currentTool.toUpperCase().padEnd(6);
  const pos = `X:${ctx.cursorX.toString().padStart(2)}  Y:${ctx.cursorY.toString().padStart(2)}`;
  const colors = `FG:${ctx.currentFg} BG:${ctx.currentBg}`;
  const char = `CH:'${ctx.currentChar}'`;
  const ice = ctx.iceColorsEnabled ? 'iCE' : '---';
  const fkeys = ctx.currentFKeySet === 'shift' ? 'S-FK' : 'F-K';
  const mirror = ctx.mirrorModeEnabled ? 'MIR' : '---';
  const numpad = ctx.numpadModeEnabled ? 'NUM' : '---';
  const guide = ctx.guideType !== 'none' ? ctx.guideType.toUpperCase().padEnd(5) : '-----';
  const file = ctx.filename || 'UNSAVED';
  const mod = ctx.modified ? '*' : ' ';
  const status = `${mod}${toolName} ${pos} ${colors} ${char} ${ice} ${fkeys} ${mirror} ${numpad} ${guide} [${file}]`.padEnd(80);
  buffer += status;

  // Render cursor at current position (inverted colors)
  const cell = ctx.canvas[ctx.cursorY][ctx.cursorX];
  buffer += `\x1b[${ctx.cursorY + 1};${ctx.cursorX + 1}H`;
  buffer += `\x1b[0;3${cell.bg};4${cell.fg}m${cell.char}`;

  // Emit entire frame in one atomic operation
  ctx.emit(buffer);
}

// ========== HELP SCREEN ==========

/**
 * Show complete help screen modal with scrolling
 * Includes all keyboard shortcuts and feature documentation
 */
export async function showHelpScreen(ctx: DisplayContext): Promise<void> {
  // Helper to add color codes: \x1b[0;FGm for foreground color
  const c = (fg: number, text: string) => `\x1b[0;3${fg}m${text}\x1b[0;37m`;
  const cb = (fg: number, bg: number, text: string) => `\x1b[0;3${fg};4${bg}m${text}\x1b[0;37;40m`;

  const helpText = [
    c(6, '                     ANSI EDITOR - COMPLETE REFERENCE GUIDE'),
    '',
    c(3, ' NOTE:') + ' All hotkeys work on both PC and Mac. Alternative keys provided where',
    ' OS hotkeys conflict (e.g., [ ] keys for color cycling work on all platforms).',
    '',
    c(2, ' === CURSOR MOVEMENT ==='),
    '   Arrow Keys - Move cursor one cell',
    '   Shift+Arrows - Move cursor and create/extend selection',
    '   Home - Jump to start of current line',
    '   End - Jump to end of current line',
    '   Page Up - Jump to top of canvas (row 0)',
    '   Page Down - Jump to bottom of canvas (row 21)',
    '',
    c(2, ' === BASIC EDITING ==='),
    '   ' + c(6, 'Printable chars') + ' - Type character at cursor position',
    '   Space - Draw current character (useful in draw mode)',
    '   Backspace - Delete character at cursor and move back',
    '   Delete - Delete character under cursor',
    '   Insert - Toggle insert/overwrite mode (status bar shows INS/OVR)',
    '   Enter - Move to next line (insert mode)',
    '   Escape - Cancel selection, exit text mode, or show this help',
    '',
    c(2, ' === DRAWING TOOLS ==='),
    '   Tab - Show tool selector modal (choose from all tools)',
    '   Shift+Tab - Cycle backwards through tools',
    '   K - Draw mode: freehand drawing with mouse or keyboard',
    '   I - Line mode: draw straight lines between two points',
    '   B - Box mode: draw rectangles (outline or filled)',
    '   E - Ellipse mode: draw circles and ellipses',
    '   T - Text mode: type text strings anywhere on canvas',
    '   P - Fill mode: flood fill enclosed areas',
    '   U - Pick mode: sample colors/character from canvas (Alt+U)',
    '   V - Shifter mode: shift cells with arrow keys',
    '',
    c(2, ' === BRUSH CONTROL (Draw Mode Only) ==='),
    '   1-9 - Set brush size (1=single cell, 9=large brush)',
    '   Alt+= - Increase brush size',
    '   Alt+- - Decrease brush size',
    '   [ - Cycle brush mode backwards (half-block/character)',
    '   ] - Cycle brush mode forwards (half-block/character)',
    '   Ctrl+L - Toggle straight line mode (constrains to H/V from start point)',
    '',
    c(2, ' === COLOR CONTROL ==='),
    '   F1-F8 - Set foreground color (0-7: Black/Red/Green/Yellow/Blue/Mag/Cyan/White)',
    '   Shift+F1-F8 - Set background color (0-7: Black/Red/Green/Yellow/Blue/Mag/Cyan/White)',
    '   Ctrl+0-7 - Set foreground color by number (0-7)',
    '   Alt+0-7 - Set background color by number (0-7)',
    '   [ ] - Cycle foreground color (alternative to Ctrl+Arrows)',
    '   - = - Cycle background color (alternative to Ctrl+Arrows)',
    '   Alt+P - Show color picker modal (interactive selector)',
    '   Ctrl+D - Reset to default colors (white on black)',
    '   Ctrl+Shift+X - Swap foreground and background colors',
    '   Alt+U - Sample colors and character from cell under cursor',
    '',
    c(2, ' === SELECTION & CLIPBOARD ==='),
    '   Alt+B - Start block selection mode (toggle on/off)',
    '   Shift+Arrows - Extend selection while moving cursor',
    '   Ctrl+A - Select all (entire canvas)',
    '   Ctrl+X - Cut selection (removes and copies to clipboard)',
    '   Ctrl+C - Copy selection to clipboard',
    '   Ctrl+V - Paste from clipboard at cursor position',
    '   Escape - Cancel/clear current selection',
    '',
    c(2, ' === SELECTION OPERATIONS (WHEN SELECTED) ==='),
    '   M - Move selection (cut and prepare for paste)',
    '   F - Fill selection with current foreground color',
    '   E / Delete - Erase selection (clear to spaces)',
    '   R - Rotate selection 90 degrees clockwise',
    '   X - Flip selection horizontally',
    '   Y - Flip selection vertically',
    '   = - Center selection horizontally on canvas',
    '',
    c(2, ' === PASTE MODES (AFFECTS CTRL+V) ==='),
    '   T - Transparent mode (spaces become transparent)',
    '   O - Over mode (always draw over existing)',
    '   U - Underneath mode (only draw where space exists)',
    '   (Current mode shown in status bar)',
    '',
    c(2, ' === LINE OPERATIONS ==='),
    '   Alt+L - Left justify current line (remove leading spaces)',
    '   Alt+R - Right justify current line (move content to right edge)',
    '   Alt+C - Center current line horizontally',
    '   Alt+E - Erase entire current line (fill with spaces)',
    '   Alt+Home - Erase from start of line to cursor',
    '   Alt+End - Erase from cursor to end of line',
    '',
    c(2, ' === ROW & COLUMN OPERATIONS ==='),
    '   Alt+Up - Insert blank row at cursor position',
    '   Alt+Down - Delete current row (shift rows up)',
    '   Alt+Right - Insert blank column at cursor position',
    '   Alt+Left - Delete current column (shift columns left)',
    '   Alt+Shift+E - Erase entire column at cursor',
    '   Alt+PageUp - Erase from top of column to cursor',
    '   Alt+PageDown - Erase from cursor to bottom of column',
    '',
    c(2, ' === CANVAS OPERATIONS ==='),
    '   Alt+Z - Resize canvas (set new width/height with anchor options)',
    '   Shift+Arrow Keys - Scroll viewport (for canvases larger than 80x24)',
    '     Shift+Up/Down - Scroll vertically (5 lines per press)',
    '     Shift+Left/Right - Scroll horizontally (10 columns per press)',
    '',
    c(2, ' === UNDO & REDO ==='),
    '   Ctrl+Z - Undo last operation (50 levels)',
    '   Ctrl+Y - Redo previously undone operation',
    '   (Continuous typing is grouped into single undo operation)',
    '',
    c(2, ' === FILE OPERATIONS ==='),
    '   Alt+S or S - Save file (choose filename and format)',
    '   L - Load file from BBS file area',
    '   Alt+I - Import file as selection (loads into clipboard)',
    '   Ctrl+E - Export selection to file',
    '   Alt+D - Duplicate as new document (save as with new name)',
    '   Ctrl+R - Revert to last saved version (discard changes)',
    '   Alt+Q or Q - Quit editor (prompts to save if modified)',
    '   (Supports .ANS, .ASC, .TXT, .XB, .BIN, .DIZ formats)',
    '   (Auto-saves backups every 5 minutes to .backups/ directory)',
    '',
    c(2, ' === ADVANCED FEATURES ==='),
    '   Alt+M - Toggle mirror mode (horizontal symmetry drawing)',
    '   Alt+G - Cycle guide overlays (80x25, 80x40, 44x22, grid, none)',
    '   Alt+N - Toggle numpad drawing mode (keyboard directional drawing)',
    '',
    c(2, ' === NUMPAD DRAWING MODE (Alt+N) ==='),
    '   When numpad mode is ON (NUM shown in status bar):',
    '   7 8 9 - Draw and move diagonally up-left, up, up-right',
    '   u i o - Draw and move left, draw in place, right',
    '   j k l - Draw and move diagonally down-left, down, down-right',
    '   (Keyboard keys mimic numpad layout for directional drawing)',
    '',
    c(2, ' === BBS FEATURES (SYSOP/COSYSOP ONLY) ==='),
    '   G - Browse BBS screens gallery (all screen files)',
    '   R - Show recent files list (last 10 edited files)',
    '   (Automatically tracks files for quick re-editing)',
    '   (File locking prevents concurrent edit conflicts)',
    '',
    c(2, ' === STATUS BAR INFO ==='),
    '   Shows: Tool | Position | Colors | Character | iCE | F-Keys | Mirror | NumPad | Guide | File',
    '   Example: "DRAW X:10 Y:5 FG:7 BG:0 CH:\'X\' iCE F-K MIR NUM 80X25 [MYART.ANS]"',
    '   * = Modified (unsaved changes)',
    '   MIR = Mirror mode active  |  NUM = Numpad drawing active',
    '   Guide types: 80X25, 80X40, 44X22, GRID, or ----- (none)',
    '',
    c(2, ' === MOUSE SUPPORT ==='),
    '   Left Click - Draw at clicked position (draw mode)',
    '   Click+Drag - Continuous drawing while dragging',
    '   Right Click - Sample colors from clicked cell',
    '',
    c(2, ' === TIPS & TRICKS ==='),
    '   - Use Tab tool selector for quick access to all tools',
    '   - Insert mode adds characters, overwrite mode replaces them',
    '   - Status bar shows current character code (helpful for graphics chars)',
    '   - Selection dimensions appear in status bar when selecting',
    '   - Canvas size is 80 columns x 24 rows (standard ANSI terminal)',
    '   - Use shifter tool (V) to move content without redrawing',
    '   - Undo is chunked: rapid edits group into single undo operation',
    '   - Mirror mode creates perfect symmetry for logos and borders',
    '   - Guide overlays help align content to common BBS layouts',
    '   - Numpad mode is great for drawing lines without a physical numpad',
    '',
    '            Use Arrow Up/Down to scroll - ESC or ENTER to close'
  ];

  clearScreen(ctx);

  let scrollOffset = 0;
  const visibleLines = 22;  // Leave 2 lines for title and footer

  const drawHelp = () => {
    // Set colors BEFORE clearing to prevent white flash
    setColors(ctx, 7, 0);  // White on black
    clearScreen(ctx);

    // Draw visible portion of help text
    for (let i = 0; i < visibleLines && (i + scrollOffset) < helpText.length; i++) {
      moveCursor(ctx, 0, i);
      setColors(ctx, 7, 0);  // White on black
      ctx.emit(helpText[i + scrollOffset].padEnd(80).substring(0, 80));
    }

    // Status line
    moveCursor(ctx, 0, 23);
    setColors(ctx, 0, 7);  // Black on white
    const status = ` Scroll: Up/Down arrows | Line ${scrollOffset + 1}/${helpText.length} | ESC/ENTER to close `.padEnd(80);
    ctx.emit(status);
  };

  // Initial draw
  drawHelp();

  // Wait for user input
  return new Promise((resolve) => {
    const handler = (input: string) => {
      console.log('[ANSI Editor showHelpScreen] Received input:', JSON.stringify(input), 'length:', input.length, 'charCodes:', input.split('').map(c => c.charCodeAt(0)));

      switch (input) {
        case '\x1b[A':  // Up arrow
          console.log('[ANSI Editor showHelpScreen] Up arrow pressed');
          if (scrollOffset > 0) {
            scrollOffset--;
            drawHelp();
          }
          break;

        case '\x1b[B':  // Down arrow
          console.log('[ANSI Editor showHelpScreen] Down arrow pressed');
          if (scrollOffset < helpText.length - visibleLines) {
            scrollOffset++;
            drawHelp();
          }
          break;

        case '\r':      // Enter
        case '\n':      // Enter
        case '\x1b':    // Escape
        case ' ':       // Space
          console.log('[ANSI Editor showHelpScreen] Exit key pressed, closing help');
          // Clear and redraw the editor immediately
          clearScreen(ctx);
          ctx.refresh();
          if (ctx.doorSession.bbsSession) {
            ctx.doorSession.bbsSession.doorInputHandler = null;
          }
          resolve();
          break;

        default:
          // Any other key closes help (except special sequences)
          if (!input.startsWith('\x1b[')) {
            console.log('[ANSI Editor showHelpScreen] Other key pressed, closing help');
            // Clear and redraw the editor immediately
            clearScreen(ctx);
            ctx.refresh();
            if (ctx.doorSession.bbsSession) {
              ctx.doorSession.bbsSession.doorInputHandler = null;
            }
            resolve();
          } else {
            console.log('[ANSI Editor showHelpScreen] Unknown escape sequence, ignoring');
          }
          break;
      }
    };

    // Register input handler
    if (ctx.doorSession.bbsSession) {
      console.log('[ANSI Editor showHelpScreen] Registering input handler');
      console.log('[ANSI Editor showHelpScreen] bbsSession exists:', !!ctx.doorSession.bbsSession);
      console.log('[ANSI Editor showHelpScreen] bbsSession.inDoorManager:', ctx.doorSession.bbsSession.inDoorManager);
      ctx.doorSession.bbsSession.doorInputHandler = handler;
      console.log('[ANSI Editor showHelpScreen] Handler registered successfully');
      console.log('[ANSI Editor showHelpScreen] Handler is:', typeof ctx.doorSession.bbsSession.doorInputHandler);
    } else {
      console.error('[ANSI Editor showHelpScreen] ERROR: doorSession.bbsSession is null!');
    }
  });
}
