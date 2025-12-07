# ANSI Editor Keyboard System Implementation Roadmap

## Current Status (as of 2025-11-06)

### ✅ COMPLETED
- **Input routing system** - All keyboard input now reaches the door via `doorInputHandler` callback
- **Basic help modal** - Scrollable keyboard reference that displays on startup
- **Basic cursor movement** - Arrow keys work for navigation
- **Basic drawing** - Printable characters can be placed on canvas
- **F-key color selection** - F1-F8 change foreground colors
- **Basic tools** - Draw, line, box, text, fill, pick modes exist
- **File operations** - Save/Load with S/L keys

### ❌ NOT YET IMPLEMENTED - Moebius Keyboard Shortcuts

The following shortcuts from the Moebius cheatsheet need to be implemented:

#### Priority 1: Essential Editing
- [ ] **Ctrl+Z** - Undo
- [ ] **Ctrl+Y / Ctrl+Shift+Z** - Redo
- [ ] **Insert** - Toggle insert/overwrite mode
- [ ] **Delete** - Forward delete character
- [ ] **Backspace** - Backward delete (currently works but needs refinement)
- [ ] **Tab** - Move 8 characters forward
- [ ] **Shift+Tab** - Move 8 characters backward

#### Priority 2: Navigation
- [ ] **Home** - Move to start of line
- [ ] **End** - Move to end of line
- [ ] **Page Up** - Scroll up (or move to top of canvas)
- [ ] **Page Down** - Scroll down (or move to bottom of canvas)
- [ ] **Shift+Arrows** - Move cursor and select block

#### Priority 3: Color Controls
- [ ] **Ctrl+Arrow Up** - Previous foreground color
- [ ] **Ctrl+Arrow Down** - Next foreground color
- [ ] **Ctrl+Arrow Left** - Previous background color
- [ ] **Ctrl+Arrow Right** - Next background color
- [ ] **Ctrl+0-7** - Set foreground color directly
- [ ] **Alt+0-7** - Set background color directly
- [ ] **Ctrl+D** - Default color (white on black)
- [ ] **Ctrl+Shift+X** - Switch foreground and background
- [ ] **Alt+U** - Use attribute under cursor

#### Priority 4: Selection & Clipboard
- [ ] **Alt+B** - Start block selection
- [ ] **Ctrl+A** - Select all
- [ ] **Escape** - Deselect
- [ ] **Ctrl+X** - Cut selection
- [ ] **Ctrl+C** - Copy selection
- [ ] **Ctrl+V** - Paste clipboard

#### Priority 5: Block Operations
- [ ] **M** - Move block
- [ ] **C** - Copy block
- [ ] **F** - Fill block
- [ ] **E / Delete** - Erase block
- [ ] **S** - Stamp block
- [ ] **R** - Rotate block clockwise
- [ ] **X** - Flip block horizontally
- [ ] **Y** - Flip block vertically
- [ ] **=** - Center block
- [ ] **T** - Transparent mode
- [ ] **O** - Over mode
- [ ] **U** - Underneath mode

#### Priority 6: Line Operations
- [ ] **Alt+L** - Left justify line
- [ ] **Alt+R** - Right justify line
- [ ] **Alt+C** - Center line
- [ ] **Alt+E** - Erase line
- [ ] **Alt+Home** - Erase to start of line
- [ ] **Alt+End** - Erase to end of line
- [ ] **Alt+Shift+E** - Erase column
- [ ] **Alt+Page Up** - Erase to start of column
- [ ] **Alt+Page Down** - Erase to end of column

#### Priority 7: Canvas Operations
- [ ] **Alt+Down** - Insert row
- [ ] **Alt+Up** - Delete row
- [ ] **Alt+Right** - Insert column
- [ ] **Alt+Left** - Delete column
- [ ] **Ctrl+Alt+Arrows** - Scroll screen

#### Priority 8: Advanced Features
- [ ] **Ctrl+E** - Toggle iCE colors (16-color backgrounds)
- [ ] **Ctrl+F** - Toggle 9px font mode
- [ ] **Ctrl+Shift+O** - Open reference image
- [ ] **Ctrl+Tab** - Toggle reference image
- [ ] **Ctrl+Mouse Wheel** - Zoom in/out
- [ ] **F1-F10** - Draw graphics characters (box drawing, etc.)
- [ ] **Shift+Draw** - Clear character under pointer
- [ ] **Alt+Mouse** - Pick color under pointer

## Technical Architecture Changes Needed

### 1. Keyboard Event Detection
```typescript
// Need to parse ANSI escape sequences to detect modifiers
// Current: Only basic key detection
// Required: Detect Ctrl, Alt, Shift modifiers from escape sequences

// ANSI sequences for common keys:
// Ctrl+A = '\x01', Ctrl+Z = '\x1a', etc.
// Alt+Key = ESC + key (e.g., '\x1b' + 'a')
// Ctrl+Arrow = '\x1b[1;5A' (up), '\x1b[1;5B' (down), etc.
```

### 2. Undo/Redo System
```typescript
// Add to ANSIEditor class:
private undoStack: Cell[][][] = [];
private redoStack: Cell[][][] = [];
private maxUndoLevels = 50;

// Methods needed:
- saveUndoState(): void
- undo(): void
- redo(): void
```

### 3. Selection System
```typescript
// Add to ANSIEditor class:
private selecting: boolean = false;
private selectionStart: { x: number; y: number } | null = null;
private selectionEnd: { x: number; y: number } | null = null;
private clipboard: Cell[][] = [];

// Methods needed:
- startSelection(): void
- updateSelection(x: number, y: number): void
- getSelectionBounds(): { x1, y1, x2, y2 }
- copySelection(): void
- cutSelection(): void
- pasteSelection(): void
- clearSelection(): void
```

### 4. Block Operations
```typescript
// Methods needed:
- moveBlock(selection: Cell[][], toX: number, toY: number): void
- rotateBlock(selection: Cell[][]): Cell[][]
- flipHorizontal(selection: Cell[][]): Cell[][]
- flipVertical(selection: Cell[][]): Cell[][]
- fillBlock(selection: Cell[][], char: string, fg: number, bg: number): void
```

### 5. Insert Mode
```typescript
// Add to ANSIEditor class:
private insertMode: boolean = true; // vs overwrite mode

// When drawing in insert mode, shift characters right
// When drawing in overwrite mode, replace character
```

## Implementation Strategy

### Phase 1: Core Editing (Session 1)
1. Implement keyboard event parser for Ctrl/Alt modifiers
2. Add undo/redo system
3. Implement Insert/Delete/Backspace properly
4. Add Tab/Shift+Tab navigation
5. Add Home/End/PageUp/PageDown navigation

### Phase 2: Selection & Clipboard (Session 2)
1. Implement selection state tracking
2. Add visual selection highlighting
3. Implement copy/cut/paste operations
4. Add block operation commands (move, rotate, flip)

### Phase 3: Color Controls (Session 3)
1. Implement all Ctrl+Arrow color cycling
2. Add Ctrl+0-7 and Alt+0-7 direct color selection
3. Add Ctrl+D default color reset
4. Add Ctrl+Shift+X foreground/background swap
5. Add Alt+U pick attribute under cursor

### Phase 4: Line & Canvas Operations (Session 4)
1. Implement line justify/center/erase operations
2. Add column erase operations
3. Add row/column insert/delete
4. Add canvas scrolling with Ctrl+Alt+Arrows

### Phase 5: Polish & Advanced Features (Session 5)
1. Add F1-F10 graphics character palette
2. Implement iCE colors toggle
3. Add any remaining Moebius features
4. Performance optimization
5. Bug fixes and refinement

## Key Files to Modify

- **`Doors/ansi-editor/index.ts`** - Main editor class (currently ~800 lines, will grow to ~1500)
  - Line 603-780: `run()` method - Complete rewrite of keyboard handling
  - Add new methods for all block operations
  - Add undo/redo system
  - Add selection system

## Testing Strategy

After each phase:
1. Test in web terminal at `http://localhost:5173`
2. Log in and run `ANSIED` command
3. Verify all shortcuts in that phase work correctly
4. Test edge cases (canvas boundaries, empty selections, etc.)

## Success Criteria

The ANSI editor will be considered complete when:
- [ ] All Moebius keyboard shortcuts from the cheatsheet work
- [ ] Undo/redo works for all operations
- [ ] Selection, copy, cut, paste work reliably
- [ ] All block operations work (rotate, flip, move, etc.)
- [ ] Color controls work for all 16 colors (fg/bg)
- [ ] Line and column operations work correctly
- [ ] Canvas insert/delete row/column works
- [ ] Help screen documents all working shortcuts
- [ ] No crashes or data loss during any operation

## Notes for Next Session

**Start here:**
1. Read this roadmap document
2. Back up current `Doors/ansi-editor/index.ts`
3. Begin Phase 1: Core Editing
4. Focus on keyboard event parser first - this is the foundation

**Key insight from this session:**
- Input routing is SOLVED - we have `doorInputHandler` callback working
- All keys reach the door, including Alt/Ctrl combinations
- The challenge now is parsing the ANSI escape sequences correctly
- Example: Ctrl+C = '\x03', Alt+B = '\x1b' + 'b', Ctrl+Arrow = '\x1b[1;5X'

**Current working features to preserve:**
- Help modal on startup (showHelp method)
- Basic drawing with arrow keys
- F-key colors (F1-F8)
- Save/Load (S/L keys)
- Tool switching (Tab)
- Status bar display

Good luck with the implementation! This is a meaty project but very achievable with the input routing foundation we've built.
