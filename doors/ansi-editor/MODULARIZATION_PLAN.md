# ANSI Editor Modular Refactoring Plan

## Status
The ANSI editor file `~/Code/amiexpress-web/Doors/ansi-editor/index.ts` is 4895 lines long and needs to be split into logical modules.

## Completed
1. **types.ts** (56 lines) - All type definitions, interfaces, and constants
   - `DoorSession`, `Cell`, `Tool`, `BrushMode`, `OperationMode`, `GuideType`
   - `ModalOption`, `FileLock`, `Point`, `SelectionBounds`
   - ANSI constants: `HIDE_CURSOR`, `SHOW_CURSOR`, `CLEAR_SCREEN`

2. **modals.ts** (560 lines) - Complete modal system
   - `Modal` (abstract base class)
   - `ToolSelectorModal`
   - `ColorPickerModal`
   - `FileDialogModal`
   - `GalleryBrowserModal`
   - `RecentFilesModal`

## Remaining Modules to Extract

### 3. canvas.ts (Est. 600 lines)
**Functions to extract (lines 1539-2128):**
- `saveUndoState()` - Line 1539
- `flushUndoChunk()` - Line 1580
- `undo()` - Line 1600
- `redo()` - Line 1622
- `startSelection()` - Line 1646
- `updateSelection()` - Line 1654
- `getSelectionBounds()` - Line 1660
- `copySelection()` - Line 1670
- `cutSelection()` - Line 1684
- `eraseSelection()` - Line 1690
- `pasteSelection()` - Line 1703
- `clearSelection()` - Line 1919
- `fillSelection()` - Line 1928
- `rotateSelection()` - Line 1946
- `flipSelectionX()` - Line 1981
- `flipSelectionY()` - Line 2001
- `centerSelection()` - Line 2021
- `moveSelection()` - Line 2068
- `cycleOperationMode()` - Line 2077
- `pasteWithMode()` - Line 2085
- `cycleFgUp()` - Line 2128
- `cycleFgDown()` - Line 2133
- `cycleBgUp()` - Line 2138
- `cycleBgDown()` - Line 2143
- Line operations: `leftJustifyLine()`, `rightJustifyLine()`, `centerLine()`, `eraseLine()`, etc. (lines 2171-2291)
- Row/Column operations: `insertRow()`, `deleteRow()`, `insertColumn()`, `deleteColumn()`, etc. (lines 2293-2397)
- Canvas scrolling: `scrollCanvasUp/Down/Left/Right()` (lines 2359-2397)
- `resizeCanvas()` - Line 2398

### 4. drawing.ts (Est. 400 lines)
**Functions to extract (lines 2670-3090):**
- `drawWithBrush()` - Line 2670
- `applyBrushMode()` - Line 2692
- `drawCell()` - Line 2772
- `isGuideOverlayCell()` - Line 2805
- `toggleMirrorMode()` - Line 2833
- `cycleGuideOverlay()` - Line 2841
- `toggleNumpadMode()` - Line 2854
- `handleNumpadDraw()` - Line 2867
- `drawLine()` - Line 2899 (Bresenham's algorithm)
- `drawBox()` - Line 2927
- `drawEllipse()` - Line 2949 (Midpoint ellipse algorithm)
- `drawEllipsePoints()` - Line 2999
- `drawEllipseFilled()` - Line 3009
- `shiftCell()` - Line 3027 (Shifter tool)
- `floodFill()` - Line 3055
- `pickCell()` - Line 3090

### 5. file-ops.ts (Est. 500 lines)
**Functions to extract (lines 3101-3675):**
- `saveFile()` - Line 3101
- `loadFile()` - Line 3181
- `parseANSI()` - Line 3267
- `canvasToANSI()` - Line 3335
- `canvasToXBin()` - Line 3360
- `canvasToBIN()` - Line 3390
- `canvasToASC()` - Line 3404
- `canvasToDIZ()` - Line 3416
- `parseXBin()` - Line 3435
- `parseBIN()` - Line 3463
- `parseASC()` - Line 3484
- `deepCloneCanvas()` - Line 3503
- `duplicateDocument()` - Line 3514
- `revertToLastSave()` - Line 3609
- `startAutoSave()` - Line 3654
- `stopAutoSave()` - Line 3668
- `performAutoSave()` - Line 3675
- File import/export: `importFileAsSelection()` (line 1723), `exportSelectionToFile()` (line 1853)

### 6. display.ts (Est. 300 lines)
**Functions to extract (lines 819-1264):**
- `showHelp()` - Line 819 (262 lines)
- `showStatusBar()` - Line 1082
- `showHelpLine()` - Line 1133
- `refresh()` - Line 1164 (100 lines - renders entire screen)

### 7. Main index.ts (Est. 1600 lines)
**What remains:**
- Constructor and initialization
- State management (all private fields)
- Helper functions (emit, clearScreen, moveCursor, setColors)
- BBS-specific helpers (isSysopOrCosysop, addToRecentFiles, lockFile, unlockFile)
- Modal display wrappers (showToolSelector, showColorPicker, showFileDialog, showGalleryBrowser, showRecentFiles)
- **Main run() method** - Line 3797 (1088 lines!!! - This is the input handling loop)
- `getInput()` helper - Line 3759
- Export function: `runDoor()`

## Refactoring Strategy

### Phase 1: Extract to Modules (Complete for types.ts and modals.ts)
- Create separate files for each module
- Export functions and classes
- Use `any` for editor references temporarily to avoid circular dependencies

### Phase 2: Update Main index.ts
- Import all modules
- Replace inline methods with module calls
- Keep main `run()` method in index.ts (it's the orchestrator)

### Phase 3: Refine and Type Properly
- Add proper interfaces for module exports
- Remove `any` types and add proper editor interface
- Ensure all imports/exports are correct

### Phase 4: Test Compilation
- Run `npx tsc --noEmit` to verify
- Fix any TypeScript errors
- Test that the door still works

## Benefits of Modularization
1. **Maintainability** - Each module is 300-600 lines instead of 4895
2. **Readability** - Related functions are grouped together
3. **Testing** - Individual modules can be tested independently
4. **Reusability** - Canvas operations could be reused in other editors
5. **Collaboration** - Multiple developers can work on different modules

## File Size Breakdown
- Original: 4895 lines
- types.ts: 56 lines
- modals.ts: 560 lines
- canvas.ts: ~600 lines (estimated)
- drawing.ts: ~400 lines (estimated)
- file-ops.ts: ~500 lines (estimated)
- display.ts: ~300 lines (estimated)
- index.ts: ~1600 lines (remaining)
- **TOTAL: ~4016 lines** (plus module overhead ~100 lines = ~4116 lines)

The total will be slightly larger due to import/export statements, but each file is now manageable.

## Next Steps
1. Extract canvas.ts module
2. Extract drawing.ts module
3. Extract file-ops.ts module
4. Extract display.ts module
5. Update index.ts to import and use all modules
6. Test TypeScript compilation
7. Test door functionality
