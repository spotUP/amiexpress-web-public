# ANSI Editor SDK Port - Implementation Plan

**Status:** In Progress - Phase 3 (Drawing Tools)
**Created:** 2026-01-14
**Updated:** 2026-01-15
**Target:** Full Moebius-level ANSI art editor in BBS Door SDK
**Estimated Effort:** 2,000-2,500 lines, 15-20 hours

---

## Session Progress Log

### Session 2026-01-15

**Completed:**
- [x] Mouse input routing fixed - `bbsSession.mouseEventsEnabled` flag set directly in DoorInputManager
- [x] Coordinate system fixed - removed x/2 division and col*2 multiplication for direct column positioning
- [x] Canvas cursor bounds clamping added - prevents cursor going outside canvas
- [x] Color picker dialog rewritten using SDK components (Overlay + Box + List)
- [x] Character picker dialog rewritten using SDK components (Overlay + Box + List)
- [x] Freehand drawing works with mouse
- [x] Basic draw tool operational

**Key Fixes:**
1. `sdk/utils/door-input-manager.ts` - Set `session.bbsSession.mouseEventsEnabled = true` directly (line 121-124)
2. `sdk/utils/blessed-helpers.ts` - Removed duplicate JSON mouse handling (neo-blessed handles it internally)
3. `sdk/engines/ui/blessed/widgets/ansi-editor.ts` - Fixed cursor positioning and dialog components

**Remaining Work:**
- Complete drawing tools (line, box, ellipse, fill, pick, select)
- File format support (.ANS, .ASC)
- Mode switching (text <-> draw)
- iCE colors support
- Brush modes (half-block, quarter-block)

---

## Executive Summary

Port the full-featured ANSI art editor from `doors/ansi-editor/` (5,828 lines) to the SDK at `sdk/engines/ui/ansi-editor/`. The SDK currently has a ~30% feature-complete text editor. This port will add pixel-based drawing tools, canvas rendering, file format support, and all missing features to achieve Moebius parity.

**Current SDK Editor:** Text editing with ANSI awareness (85% complete)
**Old Door Editor:** Full ANSI art editor with drawing tools (100% feature complete)
**Goal:** Merge both into unified SDK editor with text AND drawing modes

---

## Current State Analysis

### SDK Editor (sdk/engines/ui/ansi-editor/)

**✅ Has (Text Mode):**
- Line-based text editing (EditorState with lines: string[])
- Cursor movement (arrows, home/end, page up/down)
- Selection (shift+arrows, select all)
- Clipboard (copy/cut/paste)
- Undo/redo (operation stack)
- Search/Replace (regex, case-sensitive, whole word)
- ANSI code parsing and preservation
- Color picker (16 colors, F2)
- Status bar, toolbar, line numbers
- Autocomplete (BBS codes, usernames, words)

**❌ Missing (Drawing Mode):**
- Cell-based canvas (Cell[][] with char/fg/bg/blink)
- Drawing tools (freehand, line, box, ellipse, fill, pick, select)
- Canvas rendering (Cell[] → ANSI output)
- Character picker (CP437 extended ASCII)
- Block operations (rectangular selection, move, copy, rotate)
- .ANS/.ASC/.XB file format support
- iCE colors (16 BG colors + blink attribute)
- Brush modes (half-block, quarter-block, shading)
- Mirror mode (symmetrical drawing)

### Old Door Editor (doors/ansi-editor/)

**Complete Implementation (6 Files):**
1. `types.ts` (292 lines) - Complete type system
2. `canvas.ts` (891 lines) - Canvas state, undo, drawing primitives
3. `drawing.ts` (514 lines) - Tool handlers (draw, line, box, ellipse, fill, pick, select)
4. `file-ops.ts` (613 lines) - .ANS/.ASC/.BIN/.XB file I/O
5. `modals.ts` (549 lines) - Dialogs (file, color picker, char picker, help)
6. `index.ts` (1017 lines) - Main loop, keyboard handling, rendering

**Total:** 3,876 lines of reusable code

---

## Architecture Design

### Dual-Mode Editor

The SDK editor will support **two modes**:

1. **Text Mode** (existing) - Line-based text editing with ANSI codes
2. **Drawing Mode** (new) - Cell-based pixel editing with drawing tools

**Mode Switching:**
- F9: Toggle between text ↔ drawing mode
- Text → Drawing: Convert lines to Cell[][] canvas
- Drawing → Text: Convert Cell[][] canvas to ANSI lines

### File Structure

```
sdk/engines/ui/ansi-editor/
├── core/
│   ├── editor-state.ts         [MODIFY +200 lines] - Add drawing mode state
│   ├── cursor.ts               [MODIFY +50 lines]  - Add canvas cursor mode
│   ├── ansi-utils.ts           [EXISTING]
│   ├── clipboard.ts            [MODIFY +100 lines] - Add cell clipboard
│   ├── search.ts               [EXISTING]
│   ├── autocomplete.ts         [EXISTING]
│   └── canvas.ts               [NEW 900 lines]     - Canvas utilities
│
├── rendering/
│   ├── viewport.ts             [MODIFY +150 lines] - Add canvas rendering
│   └── canvas-renderer.ts      [NEW 300 lines]     - Cell[] → ANSI output
│
├── input/
│   ├── keyboard-handler.ts     [MODIFY +200 lines] - Add tool shortcuts
│   └── drawing-tools.ts        [NEW 550 lines]     - Tool handlers
│
├── ui/
│   ├── status-bar.ts           [MODIFY +50 lines]  - Show tool/color info
│   ├── toolbar.ts              [MODIFY +50 lines]  - Add tool buttons
│   ├── color-picker.ts         [EXISTING]
│   ├── search-dialog.ts        [EXISTING]
│   ├── autocomplete-dialog.ts  [EXISTING]
│   ├── character-picker.ts     [NEW 400 lines]     - CP437 char selector
│   └── canvas-properties.ts    [NEW 200 lines]     - Canvas size dialog
│
├── file/
│   ├── ans-format.ts           [NEW 350 lines]     - .ANS file I/O
│   ├── asc-format.ts           [NEW 150 lines]     - .ASC file I/O
│   └── format-converter.ts     [NEW 200 lines]     - Text ↔ Canvas conversion
│
├── api/
│   └── editor.ts               [MODIFY +100 lines] - Add mode parameter
│
├── types.ts                    [MODIFY +150 lines] - Add drawing types
└── index.ts                    [MODIFY +50 lines]  - Export new modules
```

**New Code:** ~2,650 lines
**Modified Code:** ~950 lines
**Total Impact:** ~3,600 lines

---

## Implementation Phases

### Phase 1: Canvas Foundation (Days 1-2)

**Goal:** Cell-based canvas system with basic drawing

**Files:**
- `core/canvas.ts` (NEW 900 lines)
- `core/editor-state.ts` (MODIFY +200 lines)
- `types.ts` (MODIFY +150 lines)

**Features:**
```typescript
// core/canvas.ts - Canvas utilities

export interface CanvasManager {
  // Canvas creation
  createCanvas(width: number, height: number): Cell[][];
  cloneCanvas(canvas: Cell[][]): Cell[][];
  clearCanvas(canvas: Cell[][]): void;

  // Cell operations
  setCell(canvas: Cell[][], x: number, y: number, cell: Cell): void;
  getCell(canvas: Cell[][], x: number, y: number): Cell | null;
  isCellEmpty(cell: Cell): boolean;

  // Drawing primitives (Bresenham algorithms)
  drawLine(canvas: Cell[][], x1: number, y1: number, x2: number, y2: number, cell: Cell): void;
  drawBox(canvas: Cell[][], x1: number, y1: number, x2: number, y2: number, cell: Cell, filled: boolean): void;
  drawEllipse(canvas: Cell[][], cx: number, cy: number, rx: number, ry: number, cell: Cell, filled: boolean): void;

  // Flood fill
  floodFill(canvas: Cell[][], x: number, y: number, cell: Cell): void;

  // Undo support
  saveCanvasState(state: EditorState): void;
  restoreCanvasState(state: EditorState): void;
}
```

**Canvas State Extension:**
```typescript
// core/editor-state.ts - Add to EditorState interface

export class EditorState {
  // ... existing text mode fields ...

  // Drawing mode
  private mode: EditorMode = 'text';
  private canvas: Cell[][] | null = null;
  private canvasWidth: number = 80;
  private canvasHeight: number = 25;

  // Drawing state
  private currentTool: DrawingTool = 'draw';
  private brushMode: BrushMode = 'half-block';
  private currentFg: number = 15;  // White
  private currentBg: number = 0;   // Black
  private currentChar: string = '█';
  private iceColorsEnabled: boolean = false;

  // Tool state
  private drawingStartPoint: Position | null = null;
  private drawingEndPoint: Position | null = null;
  private drawingPreview: Cell[][] | null = null;

  // Mode switching
  switchToDrawingMode(width?: number, height?: number): void;
  switchToTextMode(): void;
  getMode(): EditorMode;

  // Canvas accessors
  getCanvas(): Cell[][] | null;
  setCanvas(canvas: Cell[][]): void;
}
```

**Type Definitions:**
```typescript
// types.ts - Already added in previous step

export interface Cell {
  char: string;
  fg: number;  // 0-15
  bg: number;  // 0-15
  blink?: boolean;
}

export type DrawingTool = 'draw' | 'line' | 'box' | 'box-fill' | 'ellipse' | 'ellipse-fill' | 'text' | 'fill' | 'pick' | 'select';
export type BrushMode = 'half-block' | 'quarter-block' | 'custom' | 'shading' | 'colorize' | 'replace';
export type EditorMode = 'text' | 'draw';
```

**Testing:**
- Create 80x25 canvas
- Set/get cells at various positions
- Draw lines with Bresenham algorithm
- Clone and compare canvases
- Undo/redo canvas operations

---

### Phase 2: Canvas Rendering (Days 2-3)

**Goal:** Render Cell[][] canvas to ANSI output

**Files:**
- `rendering/canvas-renderer.ts` (NEW 300 lines)
- `rendering/viewport.ts` (MODIFY +150 lines)

**Features:**
```typescript
// rendering/canvas-renderer.ts

export class CanvasRenderer {
  // Render canvas to ANSI string
  static renderCanvas(canvas: Cell[][], options?: RenderOptions): string;

  // Render single cell to ANSI
  static renderCell(cell: Cell, prevCell?: Cell): string;

  // Optimize ANSI output (remove redundant codes)
  static optimizeANSI(ansi: string): string;

  // Convert cell colors to ANSI codes
  static cellToANSI(fg: number, bg: number, blink?: boolean): string;

  // Detect color changes (for optimization)
  static colorsChanged(cell1: Cell, cell2: Cell): boolean;
}

export interface RenderOptions {
  optimizeColors?: boolean;  // Skip redundant color codes
  preserveBlink?: boolean;   // Preserve blink attribute
  iceColors?: boolean;       // Enable iCE colors mode
  lineEndings?: 'CRLF' | 'LF';  // Line ending style
}
```

**Viewport Integration:**
```typescript
// rendering/viewport.ts - Extend renderContent()

private renderContent(cursor: Position): void {
  const state = this.state.getState();

  if (state.mode === 'draw' && state.canvas) {
    // Canvas rendering mode
    this.renderCanvasContent(state.canvas, cursor);
  } else {
    // Text rendering mode (existing)
    this.renderTextContent(cursor);
  }
}

private renderCanvasContent(canvas: Cell[][], cursor: Position): void {
  const contentLines: string[] = [];

  for (let y = this.viewport.visibleLineStart; y < this.viewport.visibleLineEnd; y++) {
    if (y >= canvas.length) break;

    let line = '';
    let prevCell: Cell | null = null;

    for (let x = this.viewport.scrollLeft; x < this.viewport.scrollLeft + this.viewport.width; x++) {
      if (x >= canvas[y].length) break;

      const cell = canvas[y][x];

      // Render cell with color optimization
      if (!prevCell || CanvasRenderer.colorsChanged(prevCell, cell)) {
        line += CanvasRenderer.cellToANSI(cell.fg, cell.bg, cell.blink);
      }

      line += cell.char;
      prevCell = cell;
    }

    // Add cursor if on this line
    if (y === cursor.line) {
      // Insert cursor marker
    }

    contentLines.push(line);
  }

  this.contentBox.setContent(contentLines.join('\n'));
}
```

**ANSI Optimization:**
- Track previous cell colors
- Only emit color codes when colors change
- Emit reset codes at line breaks
- Support iCE colors (ESC[0;fg;bg;5m for blink)

---

### Phase 3: Drawing Tools (Days 3-5)

**Goal:** Implement all 10 drawing tools with preview

**Files:**
- `input/drawing-tools.ts` (NEW 550 lines)
- `input/keyboard-handler.ts` (MODIFY +200 lines)

**Tool Handlers:**
```typescript
// input/drawing-tools.ts

export interface ToolHandler {
  onStart(state: EditorState, x: number, y: number): void;
  onMove(state: EditorState, x: number, y: number): void;
  onEnd(state: EditorState, x: number, y: number): void;
  onCancel(state: EditorState): void;
}

// 1. FREEHAND DRAW TOOL
export const drawTool: ToolHandler = {
  onStart(state, x, y) {
    // Save undo state (chunked for performance)
    state.saveCanvasState();
    // Draw at current position
    CanvasManager.setCell(state.canvas, x, y, getCurrentCell(state));
  },
  onMove(state, x, y) {
    // Continue drawing as mouse/cursor moves
    CanvasManager.setCell(state.canvas, x, y, getCurrentCell(state));
  },
  onEnd(state, x, y) {
    // Flush chunked undo
    state.flushCanvasUndo();
  },
  onCancel(state) {
    // Restore from undo
    state.restoreCanvasState();
  }
};

// 2. LINE TOOL
export const lineTool: ToolHandler = {
  onStart(state, x, y) {
    state.drawingStartPoint = { x, y };
    state.drawingPreview = CanvasManager.cloneCanvas(state.canvas);
  },
  onMove(state, x, y) {
    // Restore from preview
    state.canvas = CanvasManager.cloneCanvas(state.drawingPreview);
    // Draw preview line
    CanvasManager.drawLine(state.canvas,
      state.drawingStartPoint.x, state.drawingStartPoint.y,
      x, y, getCurrentCell(state));
  },
  onEnd(state, x, y) {
    state.saveCanvasState();
    // Draw final line on preview canvas
    state.canvas = CanvasManager.cloneCanvas(state.drawingPreview);
    CanvasManager.drawLine(state.canvas,
      state.drawingStartPoint.x, state.drawingStartPoint.y,
      x, y, getCurrentCell(state));
    state.drawingStartPoint = null;
    state.drawingPreview = null;
  },
  onCancel(state) {
    state.canvas = state.drawingPreview;
    state.drawingStartPoint = null;
    state.drawingPreview = null;
  }
};

// 3. BOX TOOL (outline)
export const boxTool: ToolHandler = { /* similar to lineTool */ };

// 4. BOX FILL TOOL
export const boxFillTool: ToolHandler = { /* similar to boxTool but filled */ };

// 5. ELLIPSE TOOL (outline)
export const ellipseTool: ToolHandler = { /* Bresenham ellipse algorithm */ };

// 6. ELLIPSE FILL TOOL
export const ellipseFillTool: ToolHandler = { /* filled ellipse */ };

// 7. FLOOD FILL TOOL
export const fillTool: ToolHandler = {
  onStart(state, x, y) {
    state.saveCanvasState();
    CanvasManager.floodFill(state.canvas, x, y, getCurrentCell(state));
  },
  onMove() {},  // No preview for fill
  onEnd() {},
  onCancel(state) {
    state.restoreCanvasState();
  }
};

// 8. COLOR PICKER TOOL
export const pickTool: ToolHandler = {
  onStart(state, x, y) {
    const cell = CanvasManager.getCell(state.canvas, x, y);
    if (cell) {
      state.currentFg = cell.fg;
      state.currentBg = cell.bg;
      state.currentChar = cell.char;
    }
  },
  onMove() {},
  onEnd() {},
  onCancel() {}
};

// 9. SELECT TOOL (rectangular selection)
export const selectTool: ToolHandler = {
  onStart(state, x, y) {
    state.selectionStart = { x, y };
  },
  onMove(state, x, y) {
    state.selectionEnd = { x, y };
  },
  onEnd(state, x, y) {
    // Create selection bounds
    const bounds = normalizeSelection(state.selectionStart, { x, y });
    state.clipboard = extractSelection(state.canvas, bounds);
  },
  onCancel(state) {
    state.selectionStart = null;
    state.selectionEnd = null;
  }
};

// 10. TEXT TOOL (returns to text mode at cursor position)
export const textTool: ToolHandler = {
  onStart(state, x, y) {
    // Switch to text mode at this position
    state.switchToTextMode();
    state.setCursor({ line: y, col: x });
  },
  onMove() {},
  onEnd() {},
  onCancel() {}
};

// Tool registry
export const TOOLS: Record<DrawingTool, ToolHandler> = {
  draw: drawTool,
  line: lineTool,
  box: boxTool,
  'box-fill': boxFillTool,
  ellipse: ellipseTool,
  'ellipse-fill': ellipseFillTool,
  text: textTool,
  fill: fillTool,
  pick: pickTool,
  select: selectTool
};
```

**Keyboard Handler Integration:**
```typescript
// input/keyboard-handler.ts - Add tool shortcuts

private handleDrawingModeKey(key: string, shift: boolean, ctrl: boolean): boolean {
  const state = this.state.getState();

  if (!state.canvas) return false;

  // Tool shortcuts (Alt+key)
  if (this.alt) {
    switch (key.toLowerCase()) {
      case 'd': state.currentTool = 'draw'; return true;
      case 'l': state.currentTool = 'line'; return true;
      case 'b': state.currentTool = shift ? 'box-fill' : 'box'; return true;
      case 'e': state.currentTool = shift ? 'ellipse-fill' : 'ellipse'; return true;
      case 'f': state.currentTool = 'fill'; return true;
      case 'p': state.currentTool = 'pick'; return true;
      case 's': state.currentTool = 'select'; return true;
      case 't': state.currentTool = 'text'; return true;
    }
  }

  // Mouse/cursor drawing
  if (key === 'space' || key === 'enter') {
    const tool = TOOLS[state.currentTool];
    const cursor = state.getCursor();
    tool.onStart(state, cursor.col, cursor.line);
    tool.onEnd(state, cursor.col, cursor.line);
    return true;
  }

  // Mode toggle
  if (key === 'f9') {
    state.switchToTextMode();
    return true;
  }

  return false;
}
```

**Testing:**
- Draw freehand with mouse/keyboard
- Draw lines (horizontal, vertical, diagonal)
- Draw boxes (outline and filled)
- Draw ellipses (various aspect ratios)
- Flood fill connected regions
- Pick colors from existing pixels
- Select rectangular regions
- Verify undo/redo for all tools

---

### Phase 4: Character Picker & iCE Colors (Days 5-6)

**Goal:** CP437 extended ASCII selector and 16 BG colors

**Files:**
- `ui/character-picker.ts` (NEW 400 lines)
- `types.ts` (MODIFY - add CP437 constants)

**Character Picker Dialog:**
```typescript
// ui/character-picker.ts

export class CharacterPicker {
  private box: Box;
  private charGrid: Box[] = [];
  private selectedIndex: number = 0;
  private currentPage: 'standard' | 'extended' | 'blocks' | 'box-drawing' = 'standard';

  // CP437 character sets
  private static readonly CHAR_SETS = {
    standard: '\x20-\x7E',          // ASCII 32-126
    extended: '\x80-\xFF',          // Extended ASCII 128-255
    blocks: '░▒▓█▄▀▌▐',             // Block characters
    boxDrawing: '─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬'  // Box drawing
  };

  constructor(options: CharacterPickerOptions);

  show(): void;
  hide(): void;

  // Render 16x16 grid of characters
  private renderCharGrid(): void;

  // Handle navigation (arrow keys, page up/down)
  private handleNavigation(key: string): void;

  // Select character
  private selectCharacter(): void;
}

export interface CharacterPickerOptions {
  parent: Screen;
  initialChar?: string;
  onSelect?: (char: string) => void;
  onClose?: () => void;
}
```

**iCE Colors Support:**
```typescript
// rendering/canvas-renderer.ts - Add iCE color mode

static cellToANSI(fg: number, bg: number, blink?: boolean, iceColors?: boolean): string {
  if (iceColors && blink) {
    // iCE colors: ESC[0;fg;bg;5m enables blink with 16 BG colors
    const fgCode = fg < 8 ? 30 + fg : 90 + (fg - 8);
    const bgCode = bg < 8 ? 40 + bg : 100 + (bg - 8);
    return `\x1b[0;${fgCode};${bgCode};5m`;
  } else if (iceColors) {
    // iCE colors: 16 background colors
    const fgCode = fg < 8 ? 30 + fg : 90 + (fg - 8);
    const bgCode = bg < 8 ? 40 + bg : 100 + (bg - 8);
    return `\x1b[0;${fgCode};${bgCode}m`;
  } else {
    // Standard 8 BG colors + blink
    const fgCode = fg < 8 ? 30 + fg : 90 + (fg - 8);
    const bgCode = 40 + (bg % 8);
    const blinkCode = blink ? ';5' : '';
    return `\x1b[0;${fgCode};${bgCode}${blinkCode}m`;
  }
}
```

**CP437 Character Constants:**
```typescript
// types.ts - Add character sets

export const CP437 = {
  // Block elements
  FULL_BLOCK: '█',
  DARK_SHADE: '▓',
  MEDIUM_SHADE: '▒',
  LIGHT_SHADE: '░',
  UPPER_HALF: '▀',
  LOWER_HALF: '▄',
  LEFT_HALF: '▌',
  RIGHT_HALF: '▐',

  // Box drawing
  BOX_LIGHT_H: '─',
  BOX_LIGHT_V: '│',
  BOX_LIGHT_TL: '┌',
  BOX_LIGHT_TR: '┐',
  BOX_LIGHT_BL: '└',
  BOX_LIGHT_BR: '┘',
  BOX_DOUBLE_H: '═',
  BOX_DOUBLE_V: '║',
  BOX_DOUBLE_TL: '╔',
  BOX_DOUBLE_TR: '╗',
  BOX_DOUBLE_BL: '╚',
  BOX_DOUBLE_BR: '╝',

  // Arrows
  ARROW_UP: '↑',
  ARROW_DOWN: '↓',
  ARROW_LEFT: '←',
  ARROW_RIGHT: '→',

  // Mathematical
  PLUS_MINUS: '±',
  MULTIPLY: '×',
  DIVIDE: '÷',
  DEGREE: '°',

  // Common symbols
  HEART: '♥',
  DIAMOND: '♦',
  CLUB: '♣',
  SPADE: '♠',
  MUSICAL_NOTE: '♪',
  SUN: '☼',
  BULLET: '•',
};
```

---

### Phase 5: File Formats (Days 6-7)

**Goal:** Load/save .ANS, .ASC, .XB files

**Files:**
- `file/ans-format.ts` (NEW 350 lines)
- `file/asc-format.ts` (NEW 150 lines)
- `file/format-converter.ts` (NEW 200 lines)

**.ANS Format Support:**
```typescript
// file/ans-format.ts

export class ANSIFormat {
  /**
   * Load .ANS file to canvas
   * Parses ANSI escape sequences and builds Cell[][] canvas
   */
  static load(ansiContent: string): ANSIDocument;

  /**
   * Save canvas to .ANS file
   * Converts Cell[][] to ANSI escape sequences with optimization
   */
  static save(canvas: Cell[][], options?: SaveOptions): string;

  /**
   * Parse ANSI codes to canvas
   */
  private static parseANSI(content: string): Cell[][];

  /**
   * Detect canvas dimensions from ANSI
   */
  private static detectDimensions(content: string): { width: number; height: number };

  /**
   * Parse ANSI escape sequence
   */
  private static parseEscapeSequence(seq: string): ANSICommand | null;
}

export interface ANSIDocument {
  canvas: Cell[][];
  width: number;
  height: number;
  iceColors: boolean;
  sauce?: SAUCEMetadata;  // SAUCE metadata (optional)
}

export interface SaveOptions {
  optimize?: boolean;         // Remove redundant codes
  iceColors?: boolean;        // Use iCE color mode
  lineEndings?: 'CRLF' | 'LF';
  addSAUCE?: boolean;         // Add SAUCE metadata block
  sauceInfo?: Partial<SAUCEMetadata>;
}

export interface SAUCEMetadata {
  version: string;
  title: string;
  author: string;
  group: string;
  date: string;
  fileSize: number;
  dataType: number;
  fileType: number;
  tInfo1: number;  // Width
  tInfo2: number;  // Height
  tInfo3: number;  // Font
  tInfo4: number;  // Flags (iCE colors)
  comments: string[];
}
```

**ANSI Parsing Algorithm:**
```typescript
private static parseANSI(content: string): Cell[][] {
  const canvas: Cell[][] = [];
  let x = 0, y = 0;
  let fg = 7, bg = 0, blink = false;

  let i = 0;
  while (i < content.length) {
    // Check for ESC sequence
    if (content[i] === '\x1b' && content[i + 1] === '[') {
      // Parse escape sequence
      let end = i + 2;
      while (end < content.length && !/[a-zA-Z]/.test(content[end])) {
        end++;
      }

      const cmd = content.substring(i, end + 1);
      const result = this.parseEscapeSequence(cmd);

      if (result?.type === 'SGR') {
        // Set Graphics Rendition (colors, blink)
        ({ fg, bg, blink } = this.applySGR(result.params, fg, bg, blink));
      } else if (result?.type === 'CUP') {
        // Cursor Position
        y = result.params[0] - 1;
        x = result.params[1] - 1;
      }

      i = end + 1;
    } else {
      // Regular character
      const char = content[i];

      // Ensure canvas has enough rows
      while (canvas.length <= y) {
        canvas.push([]);
      }
      // Ensure row has enough columns
      while (canvas[y].length <= x) {
        canvas[y].push({ char: ' ', fg: 7, bg: 0 });
      }

      // Set cell
      if (char === '\r') {
        x = 0;
      } else if (char === '\n') {
        x = 0;
        y++;
      } else {
        canvas[y][x] = { char, fg, bg, blink };
        x++;
      }

      i++;
    }
  }

  return canvas;
}
```

**.ASC Format Support:**
```typescript
// file/asc-format.ts

export class ASCIIFormat {
  /**
   * Load .ASC file (plain text with no colors)
   */
  static load(content: string): Cell[][];

  /**
   * Save canvas to .ASC (strip all color codes)
   */
  static save(canvas: Cell[][]): string;
}
```

**Format Converter:**
```typescript
// file/format-converter.ts

export class FormatConverter {
  /**
   * Convert text lines to canvas
   * Used when switching from text → drawing mode
   */
  static linesToCanvas(lines: string[], width: number, height: number): Cell[][];

  /**
   * Convert canvas to text lines
   * Used when switching from drawing → text mode
   */
  static canvasToLines(canvas: Cell[][]): string[];

  /**
   * Strip ANSI codes from lines and convert to canvas
   */
  private static parseTextToCanvas(lines: string[], width: number, height: number): Cell[][];

  /**
   * Render canvas to ANSI lines
   */
  private static renderCanvasToLines(canvas: Cell[][]): string[];
}
```

---

### Phase 6: Advanced Features (Days 7-8)

**Goal:** Brush modes, mirror mode, canvas properties

**Files:**
- `ui/canvas-properties.ts` (NEW 200 lines)
- `core/canvas.ts` (MODIFY +100 lines - add brush/mirror)
- `core/clipboard.ts` (MODIFY +100 lines - add cell clipboard)

**Canvas Properties Dialog:**
```typescript
// ui/canvas-properties.ts

export class CanvasPropertiesDialog {
  show(currentWidth: number, currentHeight: number): Promise<CanvasProperties | null>;

  private renderSizeOptions(): void;
  private renderPresetSizes(): void;  // 80x25, 80x50, 44x22, custom
  private handleResize(newWidth: number, newHeight: number, anchor: ResizeAnchor): void;
}

export interface CanvasProperties {
  width: number;
  height: number;
  resizeAnchor?: ResizeAnchor;  // When resizing: 'top-left' | 'center' | 'bottom-right'
}

export type ResizeAnchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';
```

**Brush Modes:**
```typescript
// core/canvas.ts - Extend with brush modes

export class CanvasManager {
  // Apply brush mode to cell
  static applyBrush(state: EditorState, x: number, y: number): void {
    switch (state.brushMode) {
      case 'half-block':
        this.drawHalfBlock(state, x, y);
        break;
      case 'quarter-block':
        this.drawQuarterBlock(state, x, y);
        break;
      case 'custom':
        this.setCell(state.canvas, x, y, getCurrentCell(state));
        break;
      case 'shading':
        this.drawShading(state, x, y);
        break;
      case 'colorize':
        this.colorizeCell(state, x, y);
        break;
      case 'replace':
        this.replaceCell(state, x, y);
        break;
    }
  }

  // Half-block drawing (▀ ▄ ▌ ▐)
  private static drawHalfBlock(state: EditorState, x: number, y: number): void {
    // Detect which half based on sub-pixel position
    // Use FG/BG colors for top/bottom or left/right halves
  }

  // Quarter-block drawing (▘ ▝ ▖ ▗)
  private static drawQuarterBlock(state: EditorState, x: number, y: number): void {
    // 4 quadrants within one character cell
  }

  // Mirror mode - draw symmetrically
  static applyMirrorMode(state: EditorState, x: number, y: number): void {
    if (!state.mirrorModeEnabled) return;

    const centerX = Math.floor(state.canvasWidth / 2);
    const mirrorX = centerX + (centerX - x);

    if (mirrorX >= 0 && mirrorX < state.canvasWidth) {
      this.setCell(state.canvas, mirrorX, y, getCurrentCell(state));
    }
  }
}
```

**Cell Clipboard:**
```typescript
// core/clipboard.ts - Extend for cells

export class Clipboard {
  private static textContent: string = '';
  private static cellContent: Cell[][] | null = null;

  // Copy cell selection
  static copyCells(cells: Cell[][]): void {
    this.cellContent = this.cloneCells(cells);
  }

  // Paste cell selection
  static pasteCells(): Cell[][] | null {
    return this.cellContent ? this.cloneCells(this.cellContent) : null;
  }

  // Check if cell clipboard has content
  static hasCellContent(): boolean {
    return this.cellContent !== null && this.cellContent.length > 0;
  }
}
```

---

### Phase 7: Integration & Polish (Days 8-9)

**Goal:** Mode switching, UI updates, keyboard shortcuts

**Files:**
- `api/editor.ts` (MODIFY +100 lines)
- `ui/status-bar.ts` (MODIFY +50 lines)
- `ui/toolbar.ts` (MODIFY +50 lines)

**Main API Enhancement:**
```typescript
// api/editor.ts - Add mode parameter

export interface EditorOptions {
  // ... existing options ...

  // Drawing mode options
  mode?: EditorMode;            // 'text' | 'draw'
  canvasWidth?: number;          // Default 80
  canvasHeight?: number;         // Default 25
  enableDrawingTools?: boolean;  // Enable tool palette
  enableCharPicker?: boolean;    // Enable character picker (F3)
  iceColorsEnabled?: boolean;    // Enable 16 BG colors + blink

  // File format
  fileFormat?: 'ANS' | 'ASC' | 'TXT';  // Auto-detect from extension
  onLoad?: (format: string) => Promise<string>;  // Load file content
}

export async function showANSIEditor(
  session: EditorSession,
  options: EditorOptions = {}
): Promise<string | null> {
  // ... existing code ...

  // Initialize mode
  if (options.mode === 'draw') {
    state.switchToDrawingMode(options.canvasWidth, options.canvasHeight);
  }

  // Load file if provided
  if (options.filePath && options.onLoad) {
    const content = await options.onLoad(options.fileFormat || 'ANS');
    if (options.mode === 'draw') {
      const doc = ANSIFormat.load(content);
      state.setCanvas(doc.canvas);
    } else {
      state.setContent(content);
    }
  }

  // ... rest of editor setup ...
}
```

**Status Bar Updates:**
```typescript
// ui/status-bar.ts - Show tool and color info

render(): void {
  const state = this.state.getState();

  if (state.mode === 'draw') {
    // Drawing mode status
    const parts: string[] = [];

    // Cursor position
    parts.push(`Pos ${cursor.col},${cursor.line}`);

    // Current tool
    parts.push(`Tool: ${state.currentTool.toUpperCase()}`);

    // Current colors
    parts.push(`FG:${state.currentFg} BG:${state.currentBg}`);

    // Brush mode
    if (state.currentTool === 'draw') {
      parts.push(`Brush: ${state.brushMode}`);
    }

    // iCE colors indicator
    if (state.iceColorsEnabled) {
      parts.push('{cyan-fg}iCE{/}');
    }

    // Modified indicator
    if (state.modified) {
      parts.push('{yellow-fg}Modified{/}');
    }

    const content = parts.join('  {cyan-fg}|{/}  ');
    const helpText = 'F1:Help  F2:Colors  F3:Chars  F9:Mode  ESC:Exit';

    // ... rest of rendering ...
  } else {
    // Text mode status (existing)
    // ...
  }
}
```

**Toolbar Updates:**
```typescript
// ui/toolbar.ts - Add tool buttons

updateContent(): void {
  const state = this.state.getState();

  if (state.mode === 'draw') {
    const toolItems = [
      { text: 'Draw', action: 'draw', active: state.currentTool === 'draw' },
      { text: 'Line', action: 'line', active: state.currentTool === 'line' },
      { text: 'Box', action: 'box', active: state.currentTool === 'box' },
      { text: 'Fill', action: 'fill', active: state.currentTool === 'fill' },
      { text: 'Pick', action: 'pick', active: state.currentTool === 'pick' },
      { text: 'Select', action: 'select', active: state.currentTool === 'select' },
    ];

    const content = toolItems.map(item => {
      const style = item.active ? '{inverse}' : '';
      return `${style}{white-fg}${item.text}{/}`;
    }).join('  ');

    this.box.setContent(` ${content} `);
  } else {
    // Text mode toolbar (existing)
    // ...
  }
}
```

---

### Phase 8: Testing & Documentation (Days 9-10)

**Goal:** Comprehensive testing and user documentation

**Test Coverage:**

1. **Canvas Operations:**
   - Create canvas (various sizes)
   - Clone canvas
   - Set/get cells
   - Undo/redo canvas changes

2. **Drawing Tools:**
   - Draw freehand lines
   - Draw straight lines (all angles)
   - Draw boxes (outline and filled)
   - Draw ellipses (various aspect ratios)
   - Flood fill (simple and complex shapes)
   - Pick colors from canvas
   - Select rectangular regions

3. **File Formats:**
   - Load .ANS files (with/without SAUCE)
   - Save .ANS files (optimized)
   - Load .ASC files
   - Save .ASC files
   - Round-trip test (load → edit → save → load)

4. **Mode Switching:**
   - Text → Drawing (convert lines to canvas)
   - Drawing → Text (convert canvas to lines)
   - Preserve undo history across modes

5. **Character Picker:**
   - Navigate character grid
   - Select characters
   - Switch between character sets

6. **iCE Colors:**
   - 16 background colors
   - Blink attribute
   - ANSI output correctness

7. **Brush Modes:**
   - Half-block drawing
   - Quarter-block drawing
   - Shading patterns

8. **Edge Cases:**
   - Empty canvas
   - 1x1 canvas
   - Large canvas (200x100)
   - Out-of-bounds drawing
   - Undo stack limits

**Documentation:**

Create `Documentation/4-Door-Developers/ANSI_EDITOR_GUIDE.md`:
- Quick start (text vs drawing mode)
- Keyboard shortcuts
- Tool reference
- File format support
- iCE colors explanation
- Brush modes
- Examples

Update `sdk/README.md`:
- Add ANSI editor to features list
- Link to guide

Update `sdk/engines/ui/ansi-editor/README.md`:
- Architecture overview
- API reference
- Type definitions
- Examples

---

## File-by-File Implementation Checklist

### Core Modules

- [ ] `core/canvas.ts` (NEW 900 lines)
  - [x] Canvas creation/cloning - BASIC
  - [x] Cell get/set operations - WORKING
  - [ ] Bresenham line algorithm
  - [ ] Box drawing (outline/filled)
  - [ ] Ellipse drawing (outline/filled)
  - [ ] Flood fill algorithm
  - [ ] Undo state management
  - [ ] Brush mode support
  - [ ] Mirror mode support

- [x] `core/editor-state.ts` (MODIFY +200 lines)
  - [x] Add drawing mode fields
  - [ ] Mode switching methods
  - [x] Canvas accessors
  - [ ] Canvas undo/redo

- [x] `core/cursor.ts` (MODIFY +50 lines)
  - [x] Canvas bounds checking - IMPLEMENTED
  - [x] Canvas coordinate mapping - FIXED (direct columns)

- [ ] `core/clipboard.ts` (MODIFY +100 lines)
  - [ ] Cell clipboard operations
  - [ ] Selection extraction

### Rendering

- [ ] `rendering/canvas-renderer.ts` (NEW 300 lines)
  - [x] Cell to ANSI conversion - BASIC
  - [ ] Color optimization
  - [ ] iCE color support
  - [ ] ANSI escape sequence generation

- [x] `rendering/viewport.ts` (MODIFY +150 lines)
  - [x] Canvas rendering mode - WORKING
  - [x] Cursor overlay in canvas - FIXED (direct positioning)
  - [ ] Selection visualization

### Input Handling

- [ ] `input/drawing-tools.ts` (NEW 550 lines)
  - [x] Draw tool (freehand) - WORKING
  - [ ] Line tool
  - [ ] Box tool (outline)
  - [ ] Box fill tool
  - [ ] Ellipse tool (outline)
  - [ ] Ellipse fill tool
  - [ ] Text tool
  - [ ] Fill tool
  - [ ] Pick tool
  - [ ] Select tool

- [x] `input/mouse-handler.ts` (COMPLETED)
  - [x] Mouse event routing via DoorInputManager
  - [x] Canvas coordinate mapping (direct columns, no division)
  - [x] Bounds clamping (prevent out-of-canvas cursor)
  - [x] Mouse drag for drawing

- [ ] `input/keyboard-handler.ts` (MODIFY +200 lines)
  - [ ] Drawing mode key handling
  - [ ] Tool shortcuts (Alt+D/L/B/E/F/P/S/T)
  - [ ] Mode toggle (F9)
  - [x] Character picker (F3) - IMPLEMENTED
  - [ ] Mouse/cursor drawing (Space/Enter)

### UI Components

- [x] `ui/character-picker.ts` (REWRITTEN with SDK components)
  - [x] Character grid with SDK List widget
  - [x] Character set pages (partial - basic CP437 chars)
  - [x] Navigation via List keyboard handling
  - [x] Selection with modal overlay

- [x] `ui/color-picker.ts` (REWRITTEN with SDK components)
  - [x] Color list with SDK List widget
  - [x] FG/BG color selection
  - [x] Modal overlay with trapModalInput

- [ ] `ui/canvas-properties.ts` (NEW 200 lines)
  - [ ] Size input
  - [ ] Preset sizes
  - [ ] Resize handling

- [ ] `ui/status-bar.ts` (MODIFY +50 lines)
  - [ ] Tool display
  - [ ] Color display
  - [ ] Brush mode display

- [ ] `ui/toolbar.ts` (MODIFY +50 lines)
  - [ ] Tool buttons
  - [ ] Active tool highlight

### File Formats

- [ ] `file/ans-format.ts` (NEW 350 lines)
  - [ ] ANSI parsing
  - [ ] ANSI generation
  - [ ] Dimension detection
  - [ ] SAUCE metadata
  - [ ] Optimization

- [ ] `file/asc-format.ts` (NEW 150 lines)
  - [ ] Plain text loading
  - [ ] Plain text saving

- [ ] `file/format-converter.ts` (NEW 200 lines)
  - [ ] Lines to canvas conversion
  - [ ] Canvas to lines conversion

### API & Types

- [ ] `types.ts` (MODIFY +150 lines)
  - [ ] Cell interface ✅
  - [ ] DrawingTool type ✅
  - [ ] BrushMode type ✅
  - [ ] EditorMode type ✅
  - [ ] CP437 constants
  - [ ] ANSI code helpers

- [ ] `api/editor.ts` (MODIFY +100 lines)
  - [ ] Drawing mode option
  - [ ] File format option
  - [ ] Load callback integration

- [ ] `index.ts` (MODIFY +50 lines)
  - [ ] Export new modules

### Documentation

- [ ] `Documentation/4-Door-Developers/ANSI_EDITOR_GUIDE.md` (NEW)
- [ ] `sdk/README.md` (UPDATE)
- [ ] `sdk/engines/ui/ansi-editor/README.md` (UPDATE)

---

## Success Criteria

### Functional Requirements

✅ **Text Mode (Existing - 85% Complete):**
- [x] Line-based text editing
- [x] ANSI code preservation
- [x] Search/Replace
- [x] Undo/Redo
- [x] Clipboard operations

✅ **Drawing Mode (New - ~25% Complete → 100% Target):**
- [x] Cell-based canvas (80x25 default)
- [ ] 10 drawing tools (draw, line, box, ellipse, fill, pick, select, text)
  - [x] Draw tool (freehand) - WORKING
  - [ ] Line tool
  - [ ] Box tool
  - [ ] Ellipse tool
  - [ ] Fill tool
  - [ ] Pick tool
  - [ ] Select tool
  - [ ] Text tool
- [x] Canvas rendering (Cell[] → ANSI) - BASIC
- [x] Character picker (CP437) - SDK List-based
- [ ] iCE colors (16 BG + blink)
- [ ] Brush modes (half-block, quarter-block, etc.)
- [ ] Mirror mode
- [ ] Block selection/clipboard

✅ **File Formats:**
- [ ] Load .ANS files
- [ ] Save .ANS files (optimized)
- [ ] Load .ASC files
- [ ] Save .ASC files

✅ **Mode Switching:**
- [ ] Text → Drawing conversion
- [ ] Drawing → Text conversion
- [ ] F9 toggle

✅ **UI/UX:**
- [ ] Tool palette/shortcuts
- [ ] Color indicator
- [ ] Cursor position
- [ ] Modified flag
- [ ] Help dialog (F1)

### Performance Requirements

- [ ] Canvas rendering: <50ms per frame (20 FPS target)
- [ ] Undo stack: Support 100+ operations
- [ ] File loading: <500ms for 80x25 .ANS file
- [ ] File saving: <300ms for 80x25 canvas

### Code Quality Requirements

- [ ] All new code < 2000 lines per file
- [ ] TypeScript compilation with zero errors
- [ ] JSDoc comments for all public APIs
- [ ] Unit tests for canvas operations
- [ ] Integration tests for file formats
- [ ] No code duplication >20 lines

---

## Risk Assessment

### High Risk

**1. Canvas Rendering Performance**
- **Risk:** Cell-to-ANSI conversion could be slow for large canvases
- **Mitigation:**
  - Optimize ANSI code generation (skip redundant color changes)
  - Cache rendered lines
  - Limit canvas size to 200x100
  - Use dirty rectangle tracking

**2. ANSI Format Parsing Complexity**
- **Risk:** ANSI escape sequences are complex and varied
- **Mitigation:**
  - Focus on standard SGR codes (colors, blink)
  - Test with real-world .ANS files
  - Add comprehensive error handling
  - Document unsupported sequences

**3. Mode Switching Data Loss**
- **Risk:** Converting text ↔ canvas could lose data
- **Mitigation:**
  - Preserve original format in state
  - Warn user before lossy conversion
  - Support undo across modes
  - Test round-trip conversions

### Medium Risk

**4. iCE Colors Terminal Support**
- **Risk:** Not all terminals support iCE colors
- **Mitigation:**
  - Make iCE colors optional
  - Fall back to standard 8 BG colors
  - Document terminal requirements

**5. Keyboard Shortcut Conflicts**
- **Risk:** Tool shortcuts could conflict with existing shortcuts
- **Mitigation:**
  - Use Alt+key for tools (less common)
  - Make shortcuts configurable
  - Document all shortcuts in help (F1)

### Low Risk

**6. Character Picker Unicode Issues**
- **Risk:** CP437 characters might not render correctly
- **Mitigation:**
  - Use UTF-8 Unicode equivalents
  - Test on multiple terminals
  - Provide fallback ASCII characters

---

## Performance Optimization Strategy

### Rendering Optimization

1. **Incremental Rendering:**
   - Only re-render changed cells
   - Track dirty regions
   - Skip offscreen cells

2. **ANSI Code Caching:**
   - Cache color code strings
   - Reuse common sequences
   - Minimize escape code length

3. **Canvas Cloning:**
   - Use shallow copy when possible
   - Only deep clone for undo
   - Limit undo stack size

### Memory Optimization

1. **Sparse Canvas:**
   - Don't allocate full 80x25 grid upfront
   - Grow canvas on demand
   - Trim unused rows/columns

2. **Undo Stack:**
   - Limit to 100 operations
   - Use delta compression
   - Flush old states

3. **Preview Canvas:**
   - Reuse single preview buffer
   - Clear instead of recreate
   - Share with undo system

---

## Migration Path from Old Editor

**For Existing doors/ansi-editor/ Users:**

1. **Keep Old Editor Available:**
   - Don't delete `doors/ansi-editor/`
   - Mark as "legacy"
   - Add deprecation notice

2. **File Compatibility:**
   - SDK editor can load old .ANS files
   - Old editor can load SDK .ANS files
   - Round-trip testing required

3. **Feature Parity:**
   - SDK editor matches/exceeds old editor
   - No regression in functionality
   - Same keyboard shortcuts

4. **Migration Guide:**
   - Document differences
   - Provide migration script
   - Offer support for issues

---

### Phase 9: Multi-Node Collaborative Editing (Days 10-12) [BONUS FEATURE]

**Goal:** Real-time collaborative ANSI art editing across BBS nodes

**Files:**
- `network/collaborative-session.ts` (NEW 400 lines)
- `network/canvas-sync.ts` (NEW 300 lines)
- `ui/collaborators-panel.ts` (NEW 200 lines)
- `api/editor.ts` (MODIFY +150 lines)

**Architecture:**

```typescript
// network/collaborative-session.ts

export class CollaborativeSession {
  private sessionId: string;
  private localUserId: number;
  private collaborators: Map<number, CollaboratorInfo>;
  private socket: Socket;  // BBS backend socket

  // Session management
  createSession(canvas: Cell[][], sessionName: string): void;
  joinSession(sessionId: string): void;
  leaveSession(): void;

  // Invite system
  inviteUser(userId: number, nodeId: number): Promise<boolean>;
  acceptInvite(sessionId: string): void;
  declineInvite(sessionId: string): void;

  // Canvas synchronization
  broadcastChange(operation: CanvasOperation): void;
  receiveChange(operation: CanvasOperation): void;

  // Cursor tracking
  broadcastCursor(x: number, y: number): void;
  receiveCursor(userId: number, x: number, y: number): void;

  // Conflict resolution
  resolveConflict(local: CanvasOperation, remote: CanvasOperation): CanvasOperation;
}

export interface CollaboratorInfo {
  userId: number;
  nodeId: number;
  username: string;
  cursorX: number;
  cursorY: number;
  currentTool: DrawingTool;
  color: string;  // Unique color for this user's cursor
  isActive: boolean;
  lastActivity: number;
}

export interface CanvasOperation {
  type: 'cell-change' | 'line-draw' | 'box-draw' | 'fill' | 'paste';
  userId: number;
  timestamp: number;
  cells: Array<{ x: number; y: number; cell: Cell }>;
  sequenceId: number;  // For ordering operations
}
```

**Canvas Synchronization:**
```typescript
// network/canvas-sync.ts

export class CanvasSyncManager {
  // Operational Transformation (OT) for conflict-free sync
  applyOperation(canvas: Cell[][], op: CanvasOperation): void;

  // Compress operations for network efficiency
  compressOperations(ops: CanvasOperation[]): CanvasOperation[];

  // Delta synchronization (send only changes)
  computeDelta(oldCanvas: Cell[][], newCanvas: Cell[][]): CanvasOperation;

  // Merge remote changes with local changes
  mergeChanges(local: CanvasOperation[], remote: CanvasOperation[]): CanvasOperation[];

  // Handle network reconnection
  resyncCanvas(sessionId: string): Promise<Cell[][]>;
}
```

**Collaborators UI:**
```typescript
// ui/collaborators-panel.ts

export class CollaboratorsPanel {
  private box: Box;
  private collaborators: Map<number, CollaboratorInfo>;

  constructor(options: CollaboratorsPanelOptions);

  // Show collaborators panel
  show(): void;
  hide(): void;

  // Update collaborator list
  updateCollaborator(info: CollaboratorInfo): void;
  removeCollaborator(userId: number): void;

  // Render collaborator list
  private renderCollaborators(): void;

  // Show invite dialog
  showInviteDialog(): Promise<number[] | null>;
}

export interface CollaboratorsPanelOptions {
  parent: Screen;
  onInvite?: (userIds: number[]) => void;
  onKick?: (userId: number) => void;
}
```

**Cursor Rendering:**
```typescript
// rendering/viewport.ts - Add collaborator cursors

private renderCollaboratorCursors(canvas: Cell[][]): void {
  for (const [userId, info] of this.collaborators.entries()) {
    if (!info.isActive) continue;

    const x = info.cursorX - this.viewport.scrollLeft;
    const y = info.cursorY - this.viewport.scrollTop;

    if (x >= 0 && x < this.viewport.width && y >= 0 && y < this.viewport.height) {
      // Render cursor with user's color
      const cursorBox = box({
        parent: this.contentBox,
        top: y,
        left: x * 2,
        width: 2,
        height: 1,
        style: {
          bg: info.color,
          fg: 'white'
        },
        content: info.username.substring(0, 2).toUpperCase()
      });
    }
  }
}
```

**Backend Integration (BBS Server):**

```typescript
// web/backend/src/handlers/collaborative-editor.handler.ts (NEW)

export class CollaborativeEditorHandler {
  private sessions: Map<string, EditorSession>;

  // Session management
  handleCreateSession(userId: number, sessionName: string, canvas: Cell[][]): string;
  handleJoinSession(userId: number, sessionId: string): boolean;
  handleLeaveSession(userId: number, sessionId: string): void;

  // Invitations
  handleInviteUser(fromUserId: number, toUserId: number, sessionId: string): void;
  handleInviteResponse(userId: number, sessionId: string, accepted: boolean): void;

  // Operation broadcasting
  handleCanvasOperation(sessionId: string, userId: number, operation: CanvasOperation): void;
  broadcastOperation(sessionId: string, operation: CanvasOperation, excludeUserId?: number): void;

  // Cursor tracking
  handleCursorMove(sessionId: string, userId: number, x: number, y: number): void;
  broadcastCursor(sessionId: string, userId: number, x: number, y: number): void;

  // Inter-node communication
  sendCrossNodeInvite(fromUserId: number, toNodeId: number, toUserId: number, sessionId: string): void;
  receiveCrossNodeOperation(operation: CanvasOperation): void;
}

interface EditorSession {
  id: string;
  name: string;
  creatorId: number;
  canvas: Cell[][];
  collaborators: Map<number, CollaboratorInfo>;
  operationLog: CanvasOperation[];
  created: number;
  lastActivity: number;
}
```

**Protocol Messages:**

```typescript
// New Socket.IO events

// Client → Server
socket.emit('editor:create-session', { name: string, canvas: Cell[][] });
socket.emit('editor:join-session', { sessionId: string });
socket.emit('editor:leave-session', { sessionId: string });
socket.emit('editor:invite-user', { userId: number, nodeId: number, sessionId: string });
socket.emit('editor:invite-response', { sessionId: string, accepted: boolean });
socket.emit('editor:operation', { sessionId: string, operation: CanvasOperation });
socket.emit('editor:cursor-move', { sessionId: string, x: number, y: number });

// Server → Client
socket.on('editor:session-created', { sessionId: string });
socket.on('editor:joined-session', { sessionId: string, canvas: Cell[][], collaborators: CollaboratorInfo[] });
socket.on('editor:user-joined', { collaborator: CollaboratorInfo });
socket.on('editor:user-left', { userId: number });
socket.on('editor:invite-received', { fromUser: string, sessionId: string, sessionName: string });
socket.on('editor:operation', { operation: CanvasOperation });
socket.on('editor:cursor-update', { userId: number, x: number, y: number });
socket.on('editor:sync-error', { error: string });
```

**Features:**

1. **Session Management:**
   - Create collaborative session (Ctrl+Shift+N)
   - Join existing session
   - Leave session (Ctrl+Shift+Q)
   - Auto-save session state

2. **User Invitations:**
   - Invite user by ID (Ctrl+Shift+I)
   - Cross-node invitations via backend
   - Accept/decline invitation dialog
   - Show pending invitations

3. **Real-Time Sync:**
   - Delta-based synchronization
   - Operational Transformation for conflicts
   - Network reconnection handling
   - 100ms cursor throttling

4. **Cursor Tracking:**
   - Show all collaborator cursors
   - Different colors per user
   - Display username near cursor
   - Fade inactive cursors (30s timeout)

5. **Conflict Resolution:**
   - Last-write-wins for same cell
   - Operation ordering by timestamp
   - Client-side prediction
   - Server-authoritative state

6. **UI Indicators:**
   - Collaborators panel (Ctrl+Shift+P)
   - Active users count in status bar
   - Network status indicator
   - Session name in title bar

**Testing:**

1. **Two-Node Collaboration:**
   - Start session on Node 1
   - Invite user from Node 2
   - Draw simultaneously
   - Verify sync

2. **Three-Node Collaboration:**
   - Three users from different nodes
   - Simultaneous drawing
   - Verify cursor tracking
   - Test conflict resolution

3. **Network Resilience:**
   - Disconnect user mid-edit
   - Reconnect and resync
   - Verify no data loss

4. **Performance:**
   - 10 operations/second per user
   - <100ms operation latency
   - <50ms cursor update latency

**Security:**

- Validate user permissions
- Session ownership verification
- Rate limit operations (10/sec)
- Sanitize canvas data
- Prevent malicious operations

**Limitations:**

- Max 5 collaborators per session
- Max 10 active sessions per node
- Session timeout after 1 hour inactivity
- Max canvas size 200x100 for collaboration

---

## Timeline Estimate

**Total:** 11-13 days (18-25 hours)
**With Collaboration:** 13-15 days (22-30 hours)

- **Phase 1-2:** Canvas Foundation & Rendering (2-3 days)
- **Phase 3:** Drawing Tools (2 days)
- **Phase 4:** Character Picker & iCE (1 day)
- **Phase 5:** File Formats (1-2 days)
- **Phase 6:** Advanced Features (1 day)
- **Phase 7:** Integration & Polish (1 day)
- **Phase 8:** Testing & Documentation (1 day)

**Parallel Work Possible:**
- File formats can be developed alongside drawing tools
- Character picker can be developed alongside canvas rendering
- Documentation can be written throughout

---

## Next Steps

1. **Review & Approve Plan**
   - Confirm scope and priorities
   - Adjust timeline if needed
   - Identify must-have vs nice-to-have features

2. **Set Up Development Environment**
   - Create feature branch: `feature/ansi-editor-drawing-mode`
   - Set up test fixtures (sample .ANS files)
   - Prepare development checklist

3. **Begin Phase 1**
   - Create `core/canvas.ts`
   - Extend `core/editor-state.ts`
   - Add types to `types.ts`
   - Write unit tests for canvas operations

4. **Incremental Commits**
   - Commit after each module completion
   - Keep commits focused and atomic
   - Write descriptive commit messages

---

## Questions for Clarification

1. **Priority:** Which features are must-have for v1.0?
   - Drawing tools only?
   - File format support?
   - All advanced features?

2. **Scope:** Should we support ALL old editor features or subset?
   - Keep text mode as-is?
   - Port 100% of drawing features?
   - Add new features not in old editor?

3. **Timeline:** Is 15-20 hours realistic for your needs?
   - Compress to faster delivery?
   - Expand for more polish?
   - Split into multiple releases?

4. **Testing:** What level of testing is required?
   - Unit tests only?
   - Integration tests?
   - Manual testing sufficient?

---

**END OF PLAN**
