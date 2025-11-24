# ANSI Editor - Moebius Feature Roadmap

## Overview
Transform our BBS door ANSI editor into a Moebius-equivalent terminal-based editor with comprehensive features for ANSI art creation.

**Goal**: Implement as many Moebius features as possible while maintaining compatibility with terminal/door constraints.

---

## Current Status

### ✅ Implemented (Phase 0 - Foundation)
- [x] Basic canvas (80×23 + status bar)
- [x] Cursor navigation (arrow keys)
- [x] Draw tool (basic freehand)
- [x] Text tool (keyboard entry)
- [x] Line tool (basic)
- [x] Box tool (outline/filled)
- [x] Fill tool (flood fill)
- [x] Pick tool (color picker)
- [x] Color selection (FG/BG)
- [x] Character selection (basic)
- [x] Undo/Redo (basic)
- [x] Save/Load (BBS and local)
- [x] Modal system (TAB for tools, Alt+C for colors)
- [x] Mouse support (click to draw)
- [x] Status bar (position, tool, colors)
- [x] Help screen (?)

---

## Phase 1: Enhanced Drawing Tools (High Priority)
**Goal**: Match Moebius drawing capabilities
**Estimated Effort**: 2-3 sessions

### 1.1 Brush Mode Enhancements ✅ **COMPLETE**
- [x] **Half-block brush** (current character: ' ') **DONE**
  - Left-click: foreground color
  - Right-click: background color
  - Shift-click: clear/erase
- [x] **Custom character brush** (use current char) **DONE**
  - Configurable character via F-keys
- [x] **Shading brush** (progressive: 176→177→178→219) **DONE**
  - Left-click: increase shading
  - Right-click: decrease shading
- [x] **Colorize brush** (change colors only, preserve chars) **DONE**
  - Options: FG only, BG only, both
- [x] **Blink brush** (toggle blink attribute) **DONE**
  - Left-click: add blink (colors 8-15)
  - Right-click: remove blink
- [x] **Brush size** (1-9) **DONE**
  - Alt+=: increase
  - Alt+-: decrease
  - Alt+0: reset to 1
- [x] **Continuous drawing** (mouse drag) **DONE**
- [x] **Chunked undo** for smooth brush operations **DONE**
- [x] **BONUS: Replace mode** - replaces background with foreground color

**Files modified**:
- `doors/ansi-editor/index.ts` (lines 1847-1921: applyBrushMode method with all 6 brush modes)
- `doors/ansi-editor/index.ts` (lines 2668-2689: brush size controls Alt+=, Alt+-, Alt+0)
- `doors/ansi-editor/index.ts` (lines 2692-2713: brush mode cycling with B/[/] keys)

---

### 1.2 Shape Tools
- [ ] **Ellipse outline tool**
  - Bresenham/midpoint ellipse algorithm
  - Live preview overlay
  - Works with all brush modes
- [ ] **Ellipse filled tool**
  - Scan-line fill algorithm
  - Live preview overlay
- [ ] **Enhanced rectangle tools**
  - Support all brush modes
  - Live preview overlay
- [ ] **Tab-hold for straight lines** (in brush mode)

**Files to modify**:
- `doors/ansi-editor/index.ts` (add ellipse tools)

---

### 1.3 Shifter Tool
- [ ] **Shifter mode** (I key)
  - Convert empty space to half-blocks (221/222)
  - Shift half-blocks left/right
  - Convert full blocks to half blocks
  - Shift-key to clear
  - Live preview overlay

**Files to modify**:
- `doors/ansi-editor/index.ts` (new tool)

---

## Phase 2: Selection & Clipboard (High Priority) ✅ **COMPLETE**
**Goal**: Full selection and clipboard operations
**Status**: ✅ **2.1 and 2.2 DONE** - Full selection & clipboard implemented with visual dashed border

### 2.1 Selection Mode ✅ **COMPLETE**
- [x] **Selection rectangle** (Alt+B to start, Shift+arrows to extend) (DONE)
  - [x] Dashed border display (white dashes on selection border) (DONE)
  - [x] Show dimensions in status bar (DONE)
  - [x] Shift+arrows to extend (DONE)
  - [x] Escape to deselect (DONE)
- [x] **Select All** (Ctrl+A) (DONE)
- [x] **Selection state management** (selecting flag, selectionStart/End) (DONE)

**Files modified**:
- `doors/ansi-editor/index.ts` - Added selection rectangle rendering in refresh() method (lines 736-770)

---

### 2.2 Clipboard Operations ✅ **COMPLETE**
- [x] **Cut** (Ctrl+X) - remove selected area (DONE)
- [x] **Copy** (Ctrl+C) - copy selected area (DONE)
- [x] **Paste** (Ctrl+V) - paste at cursor (DONE)
  - Preserves ANSI colors and characters from clipboard
- [ ] **Paste as Selection** (Ctrl+Alt+V) - FUTURE (not in Moebius spec)

**Files modified**:
- `doors/ansi-editor/index.ts` - Ctrl+X now calls cutSelection() instead of swapColors()
- Help documentation updated with all clipboard shortcuts

---

### 2.3 Selection Operations
- [ ] **Move block** (M) - cut and move
- [ ] **Copy block** (C) - copy for placement
- [ ] **Fill selection** (F) - fill with FG color
- [ ] **Erase selection** (E) - clear to spaces
- [ ] **Stamp** (S) - place copy and continue
- [ ] **Place** (Enter) - place and exit
- [ ] **Rotate** (R) - rotate 90° clockwise
- [ ] **Flip X** (X) - flip horizontally
- [ ] **Flip Y** (Y) - flip vertically
- [ ] **Center** (=) - center horizontally
- [ ] **Crop** (Ctrl+K) - new doc from selection

**Operation Modes**:
- [ ] **Transparent** (T) - spaces become transparent
- [ ] **Over** (O) - draw over existing
- [ ] **Underneath** (U) - draw under existing

**Files to modify**:
- `doors/ansi-editor/index.ts` (selection operations)

---

### 2.4 Import/Export Selection
- [ ] **Import to selection** - load file as selection
  - Formats: ANS, XB, BIN, ASC, TXT
- [ ] **Export selection** - save selection
  - Formats: ANS, XB, BIN

**Files to modify**:
- `doors/ansi-editor/index.ts` (import/export)

---

## Phase 3: Canvas Operations (Medium Priority) ✅ **MOSTLY COMPLETE**
**Goal**: Advanced canvas manipulation
**Estimated Effort**: 2 sessions
**Status**: ✅ **3.1 and 3.2 DONE** - Line and column operations complete, help text updated

### 3.1 Line Operations
- [x] **Left justify** (Alt+L) (DONE)
- [x] **Right justify** (Alt+R) (DONE)
- [x] **Center line** (Alt+C) (DONE - no conflict, works)
- [x] **Insert row** (Alt+Up) (DONE)
- [x] **Delete row** (Alt+Down) (DONE)
- [x] **Erase line** (Alt+E) (DONE)
- [x] **Erase to start of line** (Alt+Home) (DONE)
- [x] **Erase to end of line** (Alt+End) (DONE)

---

### 3.2 Column Operations
- [x] **Insert column** (Alt+Right) (DONE)
- [x] **Delete column** (Alt+Left) (DONE)
- [x] **Erase column** (Alt+Shift+E) (DONE)
- [x] **Erase to start of column** (Alt+PageUp) (DONE)
- [x] **Erase to end of column** (Alt+PageDown) (DONE)

---

### 3.3 Canvas Scrolling
- [ ] **Scroll canvas up** (Ctrl+Alt+Up)
- [ ] **Scroll canvas down** (Ctrl+Alt+Down)
- [ ] **Scroll canvas left** (Ctrl+Alt+Left)
- [ ] **Scroll canvas right** (Ctrl+Alt+Right)

---

### 3.4 Canvas Resize
- [ ] **Set canvas size** modal (Ctrl+Alt+S) *CONFLICT: Use Ctrl+Alt+R*
  - Width: 1-3000 columns (limit to 200 for BBS)
  - Height: 1-10000 rows (limit to 500 for BBS)
  - Anchor position options
  - Crop vs extend options

**Files to modify**:
- `doors/ansi-editor/index.ts` (canvas operations)

---

## Phase 4: Character Sets & F-Keys (Medium Priority)
**Goal**: Comprehensive character palette system
**Estimated Effort**: 2 sessions

### 4.1 F-Key Character Sets
- [ ] **20 character sets, 12 chars each** (F1-F12)
  - Set 1: Single-line box drawing
  - Set 2: Double-line box drawing
  - Set 3-5: Box drawing variations
  - Set 6: Shading blocks (176, 177, 178, 219, 223, 220, 221, 222, 254, 250)
  - Set 7: Low ASCII symbols
  - Set 8: Arrows and navigation
  - Set 9: Math and symbols
  - Set 10-20: Additional sets

### 4.2 F-Key Navigation
- [ ] **F1-F12**: Type character from current set
- [ ] **Alt+0-9**: Switch to sets 1-10
- [ ] **Alt+Shift+0-9**: Switch to sets 11-20
- [ ] **Ctrl+,**: Previous set
- [ ] **Ctrl+.**: Next set
- [ ] **Ctrl+/**: Default set (set 6)

### 4.3 F-Key Configuration Modal
- [ ] **Configure F-key characters** (double-click F-key icon)
  - Visual character picker (CP437 grid)
  - Per-set configuration
  - Save/load configurations
  - Reset to defaults

**Files to modify**:
- `doors/ansi-editor/index.ts` (F-key system)
- New modal: `CharacterSetModal`

---

## Phase 5: Enhanced Color Features (Medium Priority)
**Goal**: Complete color palette control
**Estimated Effort**: 1-2 sessions

### 5.1 Color Navigation
- [ ] **Ctrl+0-7**: Toggle FG brightness (dark/bright)
- [ ] **Alt+0-7**: Toggle BG brightness (dark/bright)
- [ ] **Ctrl+Up/Down**: Previous/next FG color
- [ ] **Ctrl+Left/Right**: Previous/next BG color

### 5.2 Color Utilities
- [ ] **Use attribute under cursor** (Alt+U)
  - Sample colors from cursor position
- [ ] **Default color** (Ctrl+D)
  - Reset to white on black (7/0)
- [ ] **Switch FG/BG** (Shift+Ctrl+X)
  - Swap foreground and background

### 5.3 iCE Colors
- [ ] **Toggle iCE colors** (Ctrl+E)
  - Enable colors 8-15 for background
  - Disable blink when enabled
  - Show status in status bar
- [ ] **Remove iCE colors** (convert document)

### 5.4 Enhanced Color Picker Modal
- [ ] **Arrow key navigation** in modal
- [ ] **Show preview** of FG/BG combination
- [ ] **Color swatches** with visual representation
- [ ] **Blink preview** (if iCE colors off)

**Files to modify**:
- `doors/ansi-editor/index.ts` (color system)
- `doors/ansi-editor/index.ts` (ColorPickerModal enhancements)

---

## Phase 6: Undo/Redo Enhancement (Low Priority) ✅ **COMPLETE**
**Goal**: Sophisticated undo system
**Estimated Effort**: 1 session
**Status**: ✅ **COMPLETE** - Chunked undo system implemented

### 6.1 Undo Types
- [x] Individual character changes (DONE)
- [ ] Canvas resize
- [ ] Row/column insert/delete
- [ ] Canvas scrolling
- [ ] Selection operations
- [ ] Block move/copy/rotate/flip

### 6.2 Chunked Undo
- [x] **Group continuous operations** (DONE)
  - [x] Brush strokes (uses drag system)
  - [x] Text entry (chunked with 1s timeout)
  - [x] Mouse drag operations (single undo at start)
- [x] **Configurable chunk timeout** (DONE - default: 1 second)

**Files to modify**:
- `doors/ansi-editor/index.ts` (undo system)

---

## Phase 7: File Operations (Low Priority)
**Goal**: Enhanced save/load capabilities
**Estimated Effort**: 1-2 sessions

### 7.1 File Formats
- [x] ANS (ANSI) (DONE - basic)
- [ ] XB (XBin) - binary format with font/palette info
- [ ] BIN (raw binary)
- [ ] ASC/TXT (plain text)
- [ ] DIZ (FILE_ID.DIZ format)

### 7.2 SAUCE Metadata
- [ ] **Edit SAUCE info** modal (Ctrl+I)
  - Title
  - Author
  - Group
  - Date (auto)
  - Comments (multi-line)
- [ ] **Save with/without SAUCE**
- [ ] **Read SAUCE on load**

### 7.3 File Operations
- [ ] **Duplicate as new document**
- [ ] **Revert to last save**
- [ ] **Auto-save/backup** (every 5 minutes to BBS)

**Files to modify**:
- `doors/ansi-editor/index.ts` (file operations)
- New modal: `SauceInfoModal`

---

## Phase 8: View & Navigation (Low Priority) ✅ **MOSTLY COMPLETE**
**Goal**: Enhanced viewing and navigation
**Estimated Effort**: 1 session
**Status**: ✅ **MOSTLY COMPLETE** - Navigation keys & status bar enhancements done, scroll behavior remains

### 8.1 Navigation Enhancements
- [x] **Home/End**: Start/end of line (DONE)
- [x] **Page Up/Down**: Jump to top/bottom of canvas (DONE)
- [N/A] **Tab/Shift+Tab**: Tab forward/backward - Tab used for tool selector modal

### 8.2 Scroll Behavior
- [N/A] **Scroll with cursor** option - Not applicable: canvas size (80x24) matches terminal size, no scrolling needed
  - Would auto-scroll to keep cursor visible
  - Would use configurable scroll margin (default: 3 rows)

### 8.3 Status Bar Enhancements
- [x] **Show selection dimensions** (when selected) (DONE)
- [x] **Show character code** (decimal) (DONE)
- [ ] **Show iCE status** (On/Off) - Requires iCE color mode
- [x] **Show brush size** (1-9) (DONE - already implemented)
- [ ] **Show current F-key set** (1-20) - Requires Phase 4

**Files to modify**:
- `doors/ansi-editor/index.ts` (navigation and status bar)

---

## Phase 9: Special Features (Nice to Have)
**Goal**: Advanced features for power users
**Estimated Effort**: 2-3 sessions

### 9.1 Mirror Mode
- [ ] **Mirror mode** (Ctrl+Alt+M)
  - Horizontal symmetry drawing
  - Live mirror preview
  - Toggle on/off

### 9.2 Numpad Drawing (Terminal Permitting)
- [ ] **Numpad mode** toggle
  - 0-9: F-key characters
  - +: F1 (common block)
  - .: Space
  - Enter: New line

### 9.3 Guides & Overlays
- [ ] **Guide overlays** (non-destructive)
  - 80×25 (smallscale)
  - 80×40 (square)
  - 44×22 (FILE_ID.DIZ)
  - Custom grid sizes (4×2, 8×4, etc.)

### 9.4 Insert Mode
- [x] **Insert/Overwrite toggle** (Insert key) (DONE)
  - [x] Insert: auto-advance cursor (DONE)
  - [x] Overwrite: stay at current position (DONE)
  - [x] Status bar shows INS/OVR (DONE)

**Files to modify**:
- `doors/ansi-editor/index.ts` (special features)

---

## Phase 10: BBS-Specific Features (Custom)
**Goal**: Features unique to BBS door environment
**Estimated Effort**: 1-2 sessions

### 10.1 BBS Gallery Integration
- [ ] **Browse BBS screens** (gallery modal)
  - List all screens in Screens/
  - Preview thumbnails (ASCII art)
  - Load directly into editor
- [ ] **Save to BBS gallery**
  - Auto-catalog new screens
  - Add to screen rotation

### 10.2 Multi-User Awareness
- [ ] **Show who's editing** (if multi-node)
  - Display active editors on other nodes
  - Lock files being edited
  - Collision detection

### 10.3 Quick Access
- [ ] **Recent files** list
  - Last 10 edited files
  - Quick load from list

**Files to modify**:
- `doors/ansi-editor/index.ts` (BBS features)
- Backend: gallery management API

---

## Implementation Priority Summary

### Must Have (Phase 1-2): Core Functionality
1. **Enhanced brush modes** (shading, colorize, blink, sizes)
2. **Ellipse tools** (outline and filled)
3. **Selection system** (rectangle, operations)
4. **Clipboard** (cut, copy, paste)
5. **Selection operations** (move, rotate, flip, etc.)

### Should Have (Phase 3-5): Power Features
6. **Canvas operations** (insert/delete rows/cols, scroll, justify)
7. **F-key character sets** (20 sets, navigation, configuration)
8. **Enhanced color features** (iCE colors, shortcuts, swapping)
9. **Canvas resize** (with anchor options)

### Nice to Have (Phase 6-9): Advanced Features
10. **Sophisticated undo/redo** (chunked, typed operations)
11. **SAUCE metadata** (edit and save)
12. **Enhanced navigation** (Home/End/PageUp/PageDown)
13. **Mirror mode** (symmetry drawing)
14. **Guides and overlays** (grid, dimensions)

### Custom BBS Features (Phase 10)
15. **BBS gallery integration**
16. **Multi-user awareness**
17. **Recent files list**

---

## Keyboard Shortcut Conflicts to Resolve

### Current Conflicts:
1. **Alt+C**: Color picker (current) vs Center line (Moebius)
   - **Resolution**: Keep Alt+C for color picker, use Alt+Shift+C for center line

2. **Ctrl+Alt+S**: Connect to server (Moebius) vs Set canvas size
   - **Resolution**: Use Ctrl+Alt+R for canvas resize (no BBS network features)

3. **C key**: Conflicts with typing (fixed to Alt+C)
   - **Resolution**: Already fixed

### Recommended Shortcuts for BBS Door:
- **F1 or ?**: Help screen ✅ (DONE)
- **TAB**: Tool selector modal ✅ (DONE)
- **Alt+C**: Color picker modal ✅ (DONE)
- **ESC**: Cancel operation / Close modal ✅ (DONE)
- **Ctrl+Z**: Undo ✅ (DONE)
- **Ctrl+Y**: Redo ✅ (DONE)
- **Ctrl+S**: Save modal ✅ (DONE)
- **Ctrl+O**: Load modal ✅ (DONE)
- **Ctrl+Q**: Quit ✅ (DONE)

### New Shortcuts to Add:
- **K**: Keyboard mode (text entry) [Phase 1.1]
- **B**: Brush mode [Phase 1.1]
- **I**: Shifter mode [Phase 1.3]
- **P**: Paintbucket (fill) mode [Already implemented as "Fill"]
- **M**: Move block [Phase 2.3]
- **F**: Fill selection [Phase 2.3]
- **E**: Erase selection [Phase 2.3]
- **R**: Rotate selection [Phase 2.3]
- **X**: Flip X [Phase 2.3]
- **Y**: Flip Y [Phase 2.3]
- **Alt+B**: Start selection [Phase 2.1]
- **Ctrl+A**: Select all [Phase 2.1]
- **Ctrl+X**: Cut [Phase 2.2]
- **Ctrl+C**: Copy [Phase 2.2]
- **Ctrl+V**: Paste [Phase 2.2]
- **Ctrl+E**: Toggle iCE colors [Phase 5.3]
- **Ctrl+D**: Default color (white on black) [Phase 5.2]
- **Alt+U**: Use attribute under cursor [Phase 5.2]
- **Ctrl+I**: Edit SAUCE info [Phase 7.2]
- **Ctrl+Alt+M**: Mirror mode [Phase 9.1]
- **Alt+=/-/0**: Brush size increase/decrease/reset [Phase 1.1]
- **Alt+0-9**: Switch F-key sets [Phase 4.2]
- **Ctrl+,/.//**: F-key set navigation [Phase 4.2]

---

## Testing Checklist (Per Phase)

### Phase 1: Drawing Tools
- [ ] Test all brush modes (half-block, shading, colorize, blink)
- [ ] Test brush sizes 1-9
- [ ] Test ellipse tools (outline and filled)
- [ ] Test continuous drawing with mouse
- [ ] Test chunked undo for brush strokes
- [ ] Test Tab-hold for straight lines

### Phase 2: Selection & Clipboard
- [ ] Test selection rectangle (click-drag and Alt+B)
- [ ] Test select all (Ctrl+A)
- [ ] Test cut/copy/paste (Ctrl+X/C/V)
- [ ] Test all selection operations (move, rotate, flip, etc.)
- [ ] Test operation modes (transparent, over, underneath)
- [ ] Test import/export selection

### Phase 3: Canvas Operations
- [ ] Test all line operations (justify, insert, delete, erase)
- [ ] Test all column operations (insert, delete, erase)
- [ ] Test canvas scrolling in all directions
- [ ] Test canvas resize with various anchor positions

### Phase 4: Character Sets
- [ ] Test all 20 F-key sets
- [ ] Test F-key navigation (F1-F12, Alt+0-9, Ctrl+,.//)
- [ ] Test F-key configuration modal
- [ ] Test character selection in all tools

### Phase 5: Color Features
- [ ] Test all color shortcuts (Ctrl+0-7, Alt+0-7, etc.)
- [ ] Test iCE colors toggle
- [ ] Test color utilities (sample, default, swap)
- [ ] Test enhanced color picker modal

### Phases 6-10: Test as implemented

---

## Technical Considerations

### Terminal/Door Constraints
1. **No real-time collaboration** (Moebius network features not applicable)
2. **Limited key detection** (some Ctrl+Alt combos may not work over terminal)
3. **No mouse drag** (current implementation is click-only, but we can add drag support)
4. **Canvas size limits** (recommend max 200×500 for BBS performance)
5. **No GUI elements** (all UI must be terminal-based with ANSI)

### Performance Optimization
1. **Double buffering** ✅ (DONE)
2. **Cursor hiding during redraws** ✅ (DONE)
3. **Chunked undo** (group rapid operations) [Phase 6.2]
4. **Efficient flood fill** (iterative, not recursive) ✅ (DONE)
5. **Dirty region tracking** (only redraw changed areas) [Future]

### Code Architecture
1. **Tool class hierarchy** (base Tool class, specific implementations)
2. **Modal system** ✅ (DONE - base Modal class)
3. **State management** (separate state for tools, selection, clipboard)
4. **Command pattern** for undo/redo (typed operations) [Phase 6]
5. **Canvas class** (separate from ANSIEditor for reusability)

---

## Estimated Timeline

### Aggressive Schedule (1 feature per session):
- **Phase 1**: 3 sessions (brush modes, ellipses, shifter)
- **Phase 2**: 3 sessions (selection, clipboard, operations)
- **Phase 3**: 2 sessions (canvas operations)
- **Phase 4**: 2 sessions (F-key sets)
- **Phase 5**: 2 sessions (color features)
- **Phase 6**: 1 session (undo enhancement)
- **Phase 7**: 2 sessions (file operations, SAUCE)
- **Phase 8**: 1 session (view/navigation)
- **Phase 9**: 3 sessions (special features)
- **Phase 10**: 2 sessions (BBS features)

**Total**: ~21 sessions (~21-30 hours of development)

### Realistic Schedule (with testing and refinement):
**Total**: ~30-40 sessions (~40-60 hours)

---

## Success Metrics

### Functional Completeness
- [ ] 80%+ of Moebius drawing tools implemented
- [ ] 90%+ of Moebius keyboard shortcuts working (where terminal-compatible)
- [ ] 100% of core features (draw, select, clipboard, save/load)

### User Experience
- [ ] Smooth performance (no lag on canvas redraws)
- [ ] Intuitive keyboard shortcuts (help screen comprehensive)
- [ ] Professional UI (clean modals, clear status bar)
- [ ] No screen tearing or flicker (double buffering)

### Quality
- [ ] Zero TypeScript errors ✅ (DONE)
- [ ] Comprehensive testing for each phase
- [ ] Code documentation (TSDoc comments)
- [ ] User documentation (help screen, tutorial)

---

## Next Steps

1. **Review this roadmap** with user for priorities
2. **Start Phase 1.1**: Implement enhanced brush modes
3. **Test thoroughly** after each phase
4. **Iterate based on feedback**
5. **Document features** in help screen as implemented

---

## Notes

- This roadmap prioritizes features that work well in a terminal/door environment
- Network collaboration features from Moebius are excluded (not applicable to BBS door)
- Some Moebius shortcuts may need adaptation for terminal constraints
- User can adjust priorities based on actual usage patterns
- Archive this roadmap to `Documentation/6-Progress/archive/` when completed
