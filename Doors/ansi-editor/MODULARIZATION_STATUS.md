# ANSI Editor Modularization Status

## Completed Modules (3/7)

### 1. types.ts - COMPLETE (56 lines)
**Status:** Extracted
**Contents:**
- All type definitions: `DoorSession`, `Cell`, `Tool`, `BrushMode`, `OperationMode`, `GuideType`
- Modal interfaces: `ModalOption`, `FileLock`, `Point`, `SelectionBounds`
- ANSI constants: `HIDE_CURSOR`, `SHOW_CURSOR`, `CLEAR_SCREEN`

### 2. modals.ts - COMPLETE (560 lines)
**Status:** Extracted
**Contents:**
- `Modal` (abstract base class)
- `ToolSelectorModal`
- `ColorPickerModal`
- `FileDialogModal`
- `GalleryBrowserModal`
- `RecentFilesModal`

### 3. canvas.ts - COMPLETE (891 lines)
**Status:** Extracted
**Contents:**

**Undo/Redo System:**
- `saveUndoState()` - Save canvas state to undo stack with chunked undo support
- `flushUndoChunk()` - Force save pending chunked operations
- `undo()` - Restore previous canvas state
- `redo()` - Restore next canvas state

**Selection System:**
- `startSelection()` - Begin selection at cursor
- `updateSelection()` - Update selection end point
- `getSelectionBounds()` - Get normalized selection bounds
- `copySelection()` - Copy selection to clipboard
- `cutSelection()` - Cut selection to clipboard
- `eraseSelection()` - Erase selection area
- `pasteSelection()` - Paste clipboard at cursor
- `importFileAsSelection()` - Import screen file to clipboard
- `exportSelectionToFile()` - Export selection to ANSI file
- `clearSelection()` - Clear selection state
- `fillSelection()` - Fill selection with current color
- `rotateSelection()` - Rotate selection 90° clockwise
- `flipSelectionX()` - Flip selection horizontally
- `flipSelectionY()` - Flip selection vertically
- `centerSelection()` - Center selection on canvas
- `moveSelection()` - Move selection (cut for placement)
- `cycleOperationMode()` - Cycle paste operation modes
- `pasteWithMode()` - Paste with transparency/over/underneath modes

**Color Controls:**
- `cycleFgUp()` / `cycleFgDown()` - Cycle foreground color
- `cycleBgUp()` / `cycleBgDown()` - Cycle background color

**Line Operations:**
- `leftJustifyLine()` - Justify current line left
- `rightJustifyLine()` - Justify current line right
- `centerLine()` - Center current line
- `eraseLine()` - Erase entire line
- `eraseToStartOfLine()` - Erase from cursor to line start
- `eraseToEndOfLine()` - Erase from cursor to line end

**Row/Column Operations:**
- `insertRow()` - Insert blank row at cursor
- `deleteRow()` - Delete current row
- `insertColumn()` - Insert blank column at cursor
- `deleteColumn()` - Delete current column
- `eraseColumn()` - Erase entire column
- `eraseToStartOfColumn()` - Erase from cursor to column start
- `eraseToEndOfColumn()` - Erase from cursor to column end

**Canvas Scrolling:**
- `scrollCanvasUp()` - Scroll canvas up
- `scrollCanvasDown()` - Scroll canvas down
- `scrollCanvasLeft()` - Scroll canvas left
- `scrollCanvasRight()` - Scroll canvas right

### 4. drawing.ts - COMPLETE (514 lines)
**Status:** Extracted
**Contents:**

**Brush System:**
- `drawWithBrush()` - Draw with configurable brush size and modes
- `applyBrushMode()` - Apply brush mode to single cell
  - Modes: half-block, custom, shading, colorize, blink, replace
- `drawCell()` - Legacy cell drawing with mirror mode support

**Guide Overlays:**
- `isGuideOverlayCell()` - Check if cell should show guide
- `toggleMirrorMode()` - Toggle horizontal symmetry drawing
- `cycleGuideOverlay()` - Cycle through guide types (80x25, 80x40, 44x22, grid)

**Numpad Drawing:**
- `toggleNumpadMode()` - Toggle numpad drawing mode
- `handleNumpadDraw()` - Handle keyboard-based directional drawing (7-9, u-o, j-l keys)

**Drawing Tools:**
- `drawLine()` - Bresenham's line algorithm
- `drawBox()` - Draw rectangle outline
- `drawEllipse()` - Midpoint ellipse algorithm (outline)
- `drawEllipsePoints()` - Draw 4-way symmetric ellipse points
- `drawEllipseFilled()` - Scan-line filled ellipse
- `shiftCell()` - Shifter tool for half-block manipulation
- `floodFill()` - Stack-based flood fill
- `pickCell()` - Color picker tool

## Remaining Modules (3/7)

### 5. file-ops.ts (Est. 500 lines)
**Status:** NOT STARTED
**Functions to extract:**
- `saveFile()` - Save canvas to screen file
- `loadFile()` - Load screen file to canvas
- `parseANSI()` - Parse ANSI escape sequences
- `canvasToANSI()` - Convert canvas to ANSI format
- `canvasToXBin()` - Convert canvas to XBin format
- `canvasToBIN()` - Convert canvas to BIN format
- `canvasToASC()` - Convert canvas to ASC format
- `canvasToDIZ()` - Convert canvas to DIZ format
- `parseXBin()` - Parse XBin format
- `parseBIN()` - Parse BIN format
- `parseASC()` - Parse ASC format
- `deepCloneCanvas()` - Deep clone canvas
- `duplicateDocument()` - Duplicate current document
- `revertToLastSave()` - Revert to last saved state
- `startAutoSave()` - Start auto-save timer
- `stopAutoSave()` - Stop auto-save timer
- `performAutoSave()` - Execute auto-save

### 6. display.ts (Est. 300 lines)
**Status:** NOT STARTED
**Functions to extract:**
- `showHelp()` - Display help screen (262 lines)
- `showStatusBar()` - Display status bar
- `showHelpLine()` - Display help line
- `refresh()` - Render entire screen (100 lines)

### 7. Main index.ts (Est. 1600 lines remaining)
**Status:** NOT STARTED
**What remains:**
- Constructor and initialization
- State management (all private fields)
- Helper functions (emit, clearScreen, moveCursor, setColors)
- BBS-specific helpers (isSysopOrCosysop, addToRecentFiles, lockFile, unlockFile)
- Modal display wrappers
- **Main run() method** (1088 lines - input handling loop)
- `getInput()` helper
- Export function: `runDoor()`

## Progress Summary

**Total Lines:**
- Original index.ts: 4,895 lines
- Extracted so far: 2,021 lines (41%)
- Remaining: ~2,874 lines (59%)

**Modules Completed:** 4/7 (57%)

**Next Steps:**
1. Extract file-ops.ts module
2. Extract display.ts module
3. Update main index.ts to import all modules
4. Test TypeScript compilation with full project
5. Test door functionality

## Notes

- Both canvas.ts and drawing.ts use context interfaces to avoid circular dependencies
- All functions maintain exact original logic - no behavioral changes
- Functions are properly typed with TypeScript interfaces
- Imports from types.ts work correctly
- Both modules are well-organized and documented
