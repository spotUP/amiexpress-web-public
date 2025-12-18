# ANSI Editor Architecture

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                         index.ts                            │
│                   (ANSIEditor Class)                        │
│                      1,017 lines                            │
│                                                             │
│  - State management (24 private properties)                │
│  - Context builders (4 methods)                            │
│  - Modal handlers (5 methods)                              │
│  - File management (4 methods)                             │
│  - Main input loop (1 method: run)                         │
│  - Door lifecycle (runDoor function)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ imports
                              ▼
    ┌─────────────────────────────────────────────────────┐
    │                                                     │
    ▼                 ▼              ▼           ▼       ▼        ▼
┌────────┐      ┌──────────┐   ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│types.ts│      │modals.ts │   │canvas.ts│  │drawing.ts│  │file-ops  │  │display.ts│
│44 lines│      │543 lines │   │687 lines│  │422 lines │  │436 lines │  │639 lines │
└────────┘      └──────────┘   └─────────┘  └──────────┘  └──────────┘  └──────────┘
    │                │              │             │             │             │
    │                │              │             │             │             │
    └────────────────┴──────────────┴─────────────┴─────────────┴─────────────┘
                                    │
                         All modules import types.ts
```

## Module Responsibilities

### types.ts (44 lines)
**Purpose:** Central type definitions and constants

**Exports:**
- Interfaces: DoorSession, Cell, ModalOption, FileLock, Point, SelectionBounds
- Type aliases: Tool, BrushMode, OperationMode, GuideType
- Constants: HIDE_CURSOR, SHOW_CURSOR, CLEAR_SCREEN

**Dependencies:** None

---

### modals.ts (543 lines)
**Purpose:** All modal dialog implementations

**Exports:**
- ANSIEditor interface (contract for editor)
- Abstract Modal base class
- Concrete modals: ToolSelectorModal, ColorPickerModal, FileDialogModal, GalleryBrowserModal, RecentFilesModal

**Dependencies:** types.ts

**Key Features:**
- Unified modal rendering system
- Keyboard navigation (up/down/enter/esc)
- ANSI-based UI rendering
- File browsing with thumbnails

---

### canvas.ts (687 lines)
**Purpose:** Canvas state management and manipulation

**Exports:** 46 functions including:
- Undo/Redo: saveUndoState, flushUndoChunk, undo, redo
- Selection: startSelection, copySelection, cutSelection, pasteSelection
- Transform: rotateSelection, flipSelectionX, flipSelectionY, centerSelection
- Edit: eraseLine, insertRow, deleteColumn, etc.
- Scroll: scrollCanvasUp, scrollCanvasDown, scrollCanvasLeft, scrollCanvasRight
- Colors: cycleFgUp, cycleFgDown, cycleBgUp, cycleBgDown

**Dependencies:** types.ts, file-ops.ts (for importFileAsSelection)

**Context:** EditorContext
- State: canvas, width, height, cursor, colors, selection, undo stacks
- Callbacks: emit, refresh, getFileContext

---

### drawing.ts (422 lines)
**Purpose:** Drawing tools and brush operations

**Exports:** 16 functions including:
- Brush: drawWithBrush, applyBrushMode, drawCell
- Shapes: drawLine, drawBox, drawEllipse, drawEllipseFilled
- Tools: floodFill, pickCell, shiftCell
- Modes: toggleMirrorMode, cycleGuideOverlay, toggleNumpadMode
- Special: handleNumpadDraw, isGuideOverlayCell

**Dependencies:** types.ts

**Context:** DrawingContext
- State: canvas, cursor, colors, brushSize, brushMode, tool, mirror mode
- Callbacks: emit, refresh, saveUndoState

---

### file-ops.ts (436 lines)
**Purpose:** File I/O and format conversion

**Exports:** 23 functions including:
- Save: saveFile, saveAnsiToFile, saveXBinToFile, saveBinToFile, saveAscToFile, saveDizToFile
- Load: loadFile, loadAnsiFromFile, loadXBinFile, loadBinFile, loadAscFile
- Export: exportToAnsi, exportToXBin, exportToBin, exportToAsc, exportToDiz, exportToTxt
- Selection: exportSelectionToAnsi
- Utility: fileExists, getScreenFiles, deepCloneCanvas

**Dependencies:** types.ts, fs, path

**Context:** FileContext
- State: canvas, width, height, filename, modified, doorSession
- Callbacks: emit, refresh, saveUndoState

**Supported Formats:**
- ANSI (.ans) - ANSI escape sequences
- XBin (.xb) - Extended Binary format
- BIN (.bin) - Raw binary format
- ASC (.asc) - ASCII text with ANSI codes
- DIZ (.diz) - File description format
- TXT (.txt) - Plain text export

---

### display.ts (639 lines)
**Purpose:** Screen rendering and display management

**Exports:** 8 functions including:
- Core: refresh (main render loop), clearScreen, moveCursor, setColors
- UI: showStatusBar, showHelpLine, showHelpScreen
- Utility: isGuideOverlayCell

**Dependencies:** types.ts

**Context:** DisplayContext
- State: canvas, viewport, cursor, colors, tool, brush, filename, selection
- UI state: operationMode, mirrorMode, guideType, gridSpacing, numpadMode, iceColors
- Callbacks: emit

**Rendering Features:**
- 80x24 viewport with scrolling support
- Guide overlays (80x25, 80x40, 44x22, custom grid)
- Selection highlighting
- Status bar with tool/color/file info
- Help screen with keyboard shortcuts
- Mirror mode visualization

---

## Data Flow

### Drawing Operation Flow
```
User Input (keyboard)
    ↓
index.ts (run method)
    ↓
Context Builder (getDrawingContext)
    ↓
drawing.ts function (e.g., drawLine)
    ↓
Canvas modification
    ↓
saveUndoState (canvas.ts)
    ↓
refresh (display.ts)
    ↓
Screen update via socket.emit
```

### File Save Flow
```
User presses F2
    ↓
index.ts (run method)
    ↓
Context Builder (getFileContext)
    ↓
saveFile (file-ops.ts)
    ↓
Format detection
    ↓
saveAnsiToFile / saveXBinToFile / etc.
    ↓
fs.writeFileSync
    ↓
Update modified flag
    ↓
refresh (display.ts)
```

### Undo Operation Flow
```
User presses Ctrl+Z
    ↓
index.ts (run method)
    ↓
Context Builder (getEditorContext)
    ↓
undo (canvas.ts)
    ↓
Pop from undoStack
    ↓
Restore canvas snapshot
    ↓
Update local state in index.ts
    ↓
refresh (display.ts)
```

## Context Pattern

Each module receives a tailored context object with only the state it needs:

```typescript
// EditorContext (canvas.ts)
{
  canvas, width, height,
  cursorX, cursorY,
  currentFg, currentBg, currentChar,
  selecting, selectionStart, selectionEnd, clipboard,
  undoStack, redoStack, maxUndoLevels,
  operationMode, insertMode,
  emit(), refresh(), getFileContext()
}

// DrawingContext (drawing.ts)
{
  canvas, width, height,
  cursorX, cursorY,
  currentFg, currentBg, currentChar,
  brushSize, brushMode, currentTool,
  mirrorModeEnabled, guideType, gridSpacing,
  numpadModeEnabled, viewportWidth,
  emit(), refresh(), saveUndoState()
}

// FileContext (file-ops.ts)
{
  canvas, width, height,
  filename, modified, doorSession,
  emit(), refresh(), saveUndoState()
}

// DisplayContext (display.ts)
{
  canvas, width, height,
  viewportX, viewportY, viewportWidth, viewportHeight,
  cursorX, cursorY,
  currentFg, currentBg, currentChar, currentTool,
  brushSize, brushMode,
  filename, modified,
  selecting, selectionStart, selectionEnd,
  operationMode, mirrorModeEnabled, guideType,
  gridSpacing, numpadModeEnabled,
  iceColorsEnabled, currentFKeySet,
  emit()
}
```

## Benefits of This Architecture

1. **Separation of Concerns**
   - Each module has a single, well-defined responsibility
   - Changes to one module don't affect others

2. **Type Safety**
   - TypeScript validates all context shapes
   - Compile-time error detection

3. **Testability**
   - Modules can be tested with mock contexts
   - Pure functions with no hidden dependencies

4. **Maintainability**
   - Small, focused files (44-687 lines each)
   - Easy to locate and modify functionality
   - Clear import/export relationships

5. **Scalability**
   - Easy to add new modules
   - Easy to add new functions to existing modules
   - Context pattern scales well

6. **Performance**
   - Zero runtime overhead (pure refactor)
   - No abstraction layers or indirection
   - Direct function calls

## File Sizes

```
types.ts     1.2 KB  (44 lines)
modals.ts     17 KB  (543 lines)
canvas.ts     23 KB  (687 lines)
drawing.ts    14 KB  (422 lines)
file-ops.ts   14 KB  (436 lines)
display.ts    21 KB  (639 lines)
index.ts      31 KB  (1,017 lines)
────────────────────────────────
Total:       121 KB  (3,788 lines)
```

## Future Enhancements

With this modular architecture, future enhancements are easy to implement:

1. **New drawing tools** → Add to drawing.ts
2. **New file formats** → Add to file-ops.ts
3. **New canvas operations** → Add to canvas.ts
4. **New display modes** → Add to display.ts
5. **New modals** → Add to modals.ts
6. **New types** → Add to types.ts

All with minimal changes to index.ts!
